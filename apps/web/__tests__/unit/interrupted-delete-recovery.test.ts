import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.fn();
const mockRunPromise = vi.fn();

vi.mock("@cap/database", () => ({
	db: mockDb,
}));

vi.mock("@cap/database/schema", () => ({
	videos: { id: "videos.id" },
	videoProcessingJobs: {
		videoId: "jobs.videoId",
		errorCode: "jobs.errorCode",
		updatedAt: "jobs.updatedAt",
		attemptId: "jobs.attemptId",
	},
}));

vi.mock("@cap/web-backend", () => ({
	DELETING_MARKER_CODE: "video-deleting",
	Videos: {},
}));

vi.mock("@/lib/server", () => ({
	runPromise: mockRunPromise,
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
	asc: vi.fn((value: unknown) => value),
	eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
	lte: vi.fn((left: unknown, right: unknown) => ({ lte: [left, right] })),
}));

const now = new Date("2026-09-28T12:00:00.000Z");
const minAgeMs = 15 * 60 * 1000;
const staleBefore = new Date("2026-09-28T11:45:00.000Z");

function candidatesQuery(rows: unknown[]) {
	const chain = {
		select: vi.fn(),
		from: vi.fn(),
		where: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
	};
	chain.select.mockReturnValue(chain);
	chain.from.mockReturnValue(chain);
	chain.where.mockReturnValue(chain);
	chain.orderBy.mockReturnValue(chain);
	chain.limit.mockResolvedValue(rows);
	return chain;
}

function claimQuery(affectedRows: number) {
	const chain = { update: vi.fn(), set: vi.fn(), where: vi.fn() };
	chain.update.mockReturnValue(chain);
	chain.set.mockReturnValue(chain);
	chain.where.mockResolvedValue([{ affectedRows }]);
	return chain;
}

function lookupQuery(rows: unknown[]) {
	const chain = { select: vi.fn(), from: vi.fn(), where: vi.fn() };
	chain.select.mockReturnValue(chain);
	chain.from.mockReturnValue(chain);
	chain.where.mockResolvedValue(rows);
	return chain;
}

function deleteQuery() {
	const chain = { delete: vi.fn(), where: vi.fn() };
	chain.delete.mockReturnValue(chain);
	chain.where.mockResolvedValue([{ affectedRows: 1 }]);
	return chain;
}

const load = async () =>
	(await import("@/lib/interrupted-delete-recovery")).recoverInterruptedDeletes;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("recoverInterruptedDeletes", () => {
	it("only picks deletion markers older than the stale threshold", async () => {
		const candidates = candidatesQuery([]);
		mockDb.mockReturnValueOnce(candidates);
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result).toEqual({ checked: 0, statuses: {}, results: [] });
		const where = candidates.where.mock.calls[0]?.[0] as { and: unknown[] };
		expect(where.and).toContainEqual({
			eq: ["jobs.errorCode", "video-deleting"],
		});
		expect(where.and).toContainEqual({
			lte: ["jobs.updatedAt", staleBefore],
		});
		expect(mockRunPromise).not.toHaveBeenCalled();
	});

	it("claims a stale marker before finishing the deletion", async () => {
		const claim = claimQuery(1);
		mockDb
			.mockReturnValueOnce(candidatesQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claim);
		mockRunPromise.mockResolvedValueOnce("deleted");
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ deleted: 1 });
		expect(claim.set.mock.calls[0]?.[0]).toMatchObject({ updatedAt: now });
		const claimWhere = claim.where.mock.calls[0]?.[0] as { and: unknown[] };
		expect(claimWhere.and).toContainEqual({ eq: ["jobs.videoId", "video-1"] });
		expect(claimWhere.and).toContainEqual({
			eq: ["jobs.errorCode", "video-deleting"],
		});
		expect(claimWhere.and).toContainEqual({
			lte: ["jobs.updatedAt", staleBefore],
		});
		expect(mockRunPromise).toHaveBeenCalledTimes(1);
	});

	it("leaves a recording alone when another run (or the owner) got the claim", async () => {
		mockDb
			.mockReturnValueOnce(candidatesQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claimQuery(0));
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ "claimed-elsewhere": 1 });
		expect(mockRunPromise).not.toHaveBeenCalled();
	});

	it("clears a leftover marker whose video row is already gone", async () => {
		const cleanup = deleteQuery();
		mockDb
			.mockReturnValueOnce(candidatesQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claimQuery(1))
			.mockReturnValueOnce(cleanup);
		mockRunPromise.mockResolvedValueOnce("not-found");
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ "orphan-marker-cleared": 1 });
		const where = cleanup.where.mock.calls[0]?.[0] as { and: unknown[] };
		expect(where.and).toContainEqual({ eq: ["jobs.videoId", "video-1"] });
		expect(where.and).toContainEqual({
			eq: ["jobs.errorCode", "video-deleting"],
		});
	});

	it("reports a marker that disappeared before the delete ran", async () => {
		mockDb
			.mockReturnValueOnce(candidatesQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claimQuery(1));
		mockRunPromise.mockResolvedValueOnce("no-marker");
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ "no-longer-deleting": 1 });
	});

	it("counts a concurrent successful delete as deleted, not failed", async () => {
		mockDb
			.mockReturnValueOnce(candidatesQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claimQuery(1))
			.mockReturnValueOnce(lookupQuery([]));
		mockRunPromise.mockRejectedValueOnce(
			new Error("Video owner changed during deletion"),
		);
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ deleted: 1 });
	});

	it("reports a real failure and keeps going with the next recording", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		mockDb
			.mockReturnValueOnce(
				candidatesQuery([{ videoId: "video-1" }, { videoId: "video-2" }]),
			)
			.mockReturnValueOnce(claimQuery(1))
			.mockReturnValueOnce(lookupQuery([{ videoId: "video-1" }]))
			.mockReturnValueOnce(claimQuery(1));
		mockRunPromise
			.mockRejectedValueOnce(new Error("storage unavailable"))
			.mockResolvedValueOnce("deleted");
		const recover = await load();

		const result = await recover({ now, minAgeMs });

		expect(result.statuses).toEqual({ failed: 1, deleted: 1 });
		expect(result.results[0]).toEqual({
			videoId: "video-1",
			status: "failed",
			error: "storage unavailable",
		});
		consoleError.mockRestore();
	});
});

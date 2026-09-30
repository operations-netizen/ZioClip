import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.fn();
const mockRunPromise = vi.fn();

vi.mock("@cap/database", () => ({
	db: mockDb,
}));

vi.mock("@cap/web-backend", () => ({
	Videos: {},
}));

vi.mock("@/lib/server", () => ({
	runPromise: mockRunPromise,
}));

vi.mock("@cap/database/schema", () => ({
	importedVideos: { id: "importedVideos.id" },
	videos: { id: "videos.id", source: "videos.source" },
	videoUploads: {
		videoId: "videoUploads.videoId",
		phase: "videoUploads.phase",
		rawFileKey: "videoUploads.rawFileKey",
		updatedAt: "videoUploads.updatedAt",
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
	asc: vi.fn((value: unknown) => value),
	eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
	isNull: vi.fn((value: unknown) => ({ isNull: value })),
	lte: vi.fn((left: unknown, right: unknown) => ({ lte: [left, right] })),
	sql: vi.fn(() => ({ sql: "source is webMP4" })),
}));

function makeSelectChain(candidates: unknown[]) {
	const chain = {
		select: vi.fn(),
		from: vi.fn(),
		innerJoin: vi.fn(),
		leftJoin: vi.fn(),
		where: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
	};
	chain.select.mockReturnValue(chain);
	chain.from.mockReturnValue(chain);
	chain.innerJoin.mockReturnValue(chain);
	chain.leftJoin.mockReturnValue(chain);
	chain.where.mockReturnValue(chain);
	chain.orderBy.mockReturnValue(chain);
	chain.limit.mockResolvedValue(candidates);
	return chain;
}

function makeUpdateChain(affectedRows: number) {
	const chain = {
		update: vi.fn(),
		set: vi.fn(),
		where: vi.fn(),
	};
	chain.update.mockReturnValue(chain);
	chain.set.mockReturnValue(chain);
	chain.where.mockResolvedValue([{ affectedRows }]);
	return chain;
}

const now = new Date("2026-09-24T12:00:00.000Z");
const staleUpdatedAt = new Date("2026-09-24T09:00:00.000Z");

beforeEach(() => {
	vi.clearAllMocks();
	// Unfinished-upload cancellation succeeds unless a test says otherwise.
	mockRunPromise.mockResolvedValue(true);
});

describe("recoverAbandonedUploads", () => {
	it("only selects web uploads idle past the threshold that never produced a raw file", async () => {
		const select = makeSelectChain([]);
		mockDb.mockReturnValueOnce(select);
		const { recoverAbandonedUploads } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const result = await recoverAbandonedUploads({
			now,
			minIdleMs: 2 * 60 * 60 * 1000,
		});

		expect(result).toEqual({ checked: 0, statuses: {}, results: [] });
		const where = select.where.mock.calls[0]?.[0] as { and: unknown[] };
		expect(where.and).toContainEqual({
			eq: ["videoUploads.phase", "uploading"],
		});
		expect(where.and).toContainEqual({ isNull: "videoUploads.rawFileKey" });
		expect(where.and).toContainEqual({ isNull: "importedVideos.id" });
		expect(where.and).toContainEqual({
			lte: ["videoUploads.updatedAt", new Date("2026-09-24T10:00:00.000Z")],
		});
	});

	it("marks a claimed abandoned upload as failed with an explanatory error", async () => {
		const update = makeUpdateChain(1);
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([{ videoId: "video-1", updatedAt: staleUpdatedAt }]),
			)
			.mockReturnValueOnce(update);
		const { recoverAbandonedUploads, ABANDONED_UPLOAD_MESSAGE } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const result = await recoverAbandonedUploads({ now });

		expect(result.statuses).toEqual({ "marked-failed": 1 });
		expect(update.set).toHaveBeenCalledWith(
			expect.objectContaining({
				phase: "error",
				processingMessage: ABANDONED_UPLOAD_MESSAGE,
				processingError: expect.stringContaining(
					"no activity for more than 120 minutes",
				),
				updatedAt: now,
			}),
		);
	});

	it("claims only the exact stale row so a concurrent heartbeat keeps the upload alive", async () => {
		const update = makeUpdateChain(0);
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([{ videoId: "video-1", updatedAt: staleUpdatedAt }]),
			)
			.mockReturnValueOnce(update);
		const { recoverAbandonedUploads } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const result = await recoverAbandonedUploads({ now });

		expect(result.statuses).toEqual({ "already-changed": 1 });
		const claim = update.where.mock.calls[0]?.[0] as { and: unknown[] };
		expect(claim.and).toContainEqual({
			eq: ["videoUploads.updatedAt", staleUpdatedAt],
		});
		expect(claim.and).toContainEqual({
			eq: ["videoUploads.phase", "uploading"],
		});
	});

	it("is a no-op on a repeated run once the row has been marked failed", async () => {
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([{ videoId: "video-1", updatedAt: staleUpdatedAt }]),
			)
			.mockReturnValueOnce(makeUpdateChain(1))
			.mockReturnValueOnce(makeSelectChain([]));
		const { recoverAbandonedUploads } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const first = await recoverAbandonedUploads({ now });
		const second = await recoverAbandonedUploads({ now });

		expect(first.statuses).toEqual({ "marked-failed": 1 });
		expect(second).toEqual({ checked: 0, statuses: {}, results: [] });
		expect(mockDb).toHaveBeenCalledTimes(3);
	});

	it("cancels the recording's unfinished upload before marking it failed", async () => {
		const order: string[] = [];
		mockRunPromise.mockImplementationOnce(async () => {
			order.push("cancel");
			return true;
		});
		const update = makeUpdateChain(1);
		update.update.mockImplementation(() => {
			order.push("mark-failed");
			return update;
		});
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([{ videoId: "video-1", updatedAt: staleUpdatedAt }]),
			)
			.mockReturnValueOnce(update);
		const { recoverAbandonedUploads } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const result = await recoverAbandonedUploads({ now });

		expect(result.statuses).toEqual({ "marked-failed": 1 });
		expect(mockRunPromise).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["cancel", "mark-failed"]);
	});

	it("leaves the row untouched when cancellation fails, so the next run retries", async () => {
		mockRunPromise.mockResolvedValueOnce(false);
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([
					{ videoId: "video-1", updatedAt: staleUpdatedAt },
					{ videoId: "video-2", updatedAt: staleUpdatedAt },
				]),
			)
			.mockReturnValueOnce(makeUpdateChain(1));
		const { recoverAbandonedUploads } = await import(
			"@/lib/abandoned-upload-recovery"
		);

		const result = await recoverAbandonedUploads({ now });

		expect(result.results).toEqual([
			{ videoId: "video-1", status: "cancel-failed" },
			{ videoId: "video-2", status: "marked-failed" },
		]);
		// Only video-2 was claimed; video-1 stays "uploading" for the next run.
		expect(mockDb).toHaveBeenCalledTimes(2);

		mockRunPromise.mockResolvedValueOnce(true);
		mockDb
			.mockReturnValueOnce(
				makeSelectChain([{ videoId: "video-1", updatedAt: staleUpdatedAt }]),
			)
			.mockReturnValueOnce(makeUpdateChain(1));
		const retry = await recoverAbandonedUploads({ now });
		expect(retry.statuses).toEqual({ "marked-failed": 1 });
	});
});

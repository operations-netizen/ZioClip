import { Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunPromise = vi.fn();
const mockRunPromiseExit = vi.fn();

vi.mock("@cap/database", () => ({ db: vi.fn() }));
vi.mock("@cap/database/schema", () => ({
	videos: { id: "videos.id", orgId: "videos.orgId" },
}));
vi.mock("@cap/web-backend", () => ({
	provideOptionalAuth: (effect: unknown) => effect,
	Tinybird: {},
	VideosPolicy: {},
}));
vi.mock("@/lib/server", () => ({
	runPromise: mockRunPromise,
	runPromiseExit: mockRunPromiseExit,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockRunPromise.mockResolvedValue({ count: 42 });
});

describe("getVideoAnalytics authorization", () => {
	it("returns no counts, without querying analytics, when the caller cannot view the video", async () => {
		mockRunPromiseExit.mockResolvedValue(Exit.fail(new Error("denied")));
		const { getVideoAnalytics } = await import(
			"@/actions/videos/get-analytics"
		);

		await expect(getVideoAnalytics("private-video")).resolves.toEqual({
			count: 0,
		});
		expect(mockRunPromise).not.toHaveBeenCalled();
	});

	it("returns no counts for an unknown video", async () => {
		mockRunPromiseExit.mockResolvedValue(Exit.succeed([]));
		const { getVideoAnalytics } = await import(
			"@/actions/videos/get-analytics"
		);

		await expect(getVideoAnalytics("missing")).resolves.toEqual({ count: 0 });
		expect(mockRunPromise).not.toHaveBeenCalled();
	});

	it("queries analytics once the viewer is allowed to see the video", async () => {
		mockRunPromiseExit.mockResolvedValue(Exit.succeed([{ orgId: "org-1" }]));
		const { getVideoAnalytics } = await import(
			"@/actions/videos/get-analytics"
		);

		await expect(getVideoAnalytics("public-video")).resolves.toEqual({
			count: 42,
		});
		expect(mockRunPromise).toHaveBeenCalledTimes(1);
	});
});

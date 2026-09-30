import { Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTranscribe = vi.fn();
const mockStartAi = vi.fn();
const mockCurrentUser = vi.fn();
const mockRunPromiseExit = vi.fn();

vi.mock("@cap/database", () => ({
	db: () => {
		const chain = {
			select: () => chain,
			from: () => chain,
			where: () => chain,
			limit: async () => [],
		};
		return chain;
	},
}));
vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: mockCurrentUser,
}));
vi.mock("@cap/database/schema", () => ({
	users: {},
	videos: {},
	videoUploads: {},
}));
vi.mock("@cap/env", () => ({
	serverEnv: () => ({ ASSEMBLY_API_KEY: "configured" }),
}));
vi.mock("@cap/web-backend", () => ({
	provideOptionalAuth: (effect: unknown) => effect,
	VideosPolicy: {},
}));
vi.mock("@/lib/server", () => ({ runPromiseExit: mockRunPromiseExit }));
vi.mock("@/lib/ai/provider", () => ({ isAiConfigured: () => true }));
vi.mock("@/lib/desktop-segments-finalization", () => ({
	isRetryableDesktopSegmentsFinalizationError: () => false,
	queueDesktopSegmentsFinalization: vi.fn(),
}));
vi.mock("@/lib/generate-ai", () => ({ startAiGeneration: mockStartAi }));
vi.mock("@/lib/transcribe", () => ({ transcribeVideo: mockTranscribe }));
vi.mock("@/utils/flags", () => ({ isAiGenerationEnabled: async () => true }));

const video = {
	id: "video-1",
	ownerId: "owner-1",
	name: "Recording",
	transcriptionStatus: null as string | null,
	metadata: {},
	source: { type: "webMP4" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mockTranscribe.mockResolvedValue({ success: true });
	mockStartAi.mockResolvedValue(undefined);
});

describe("getVideoStatus does not let viewers start AI work", () => {
	it("a non-owner viewer's poll starts no transcription", async () => {
		mockRunPromiseExit.mockResolvedValue(Exit.succeed([video]));
		mockCurrentUser.mockResolvedValue({ id: "someone-else" });
		const { getVideoStatus } = await import("@/actions/videos/get-status");

		const status = await getVideoStatus("video-1" as never);

		expect(mockTranscribe).not.toHaveBeenCalled();
		expect(status).toMatchObject({ transcriptionStatus: null });
	});

	it("an anonymous viewer's poll starts no AI generation", async () => {
		mockRunPromiseExit.mockResolvedValue(
			Exit.succeed([{ ...video, transcriptionStatus: "COMPLETE" }]),
		);
		mockCurrentUser.mockResolvedValue(null);
		const { getVideoStatus } = await import("@/actions/videos/get-status");

		await getVideoStatus("video-1" as never);

		expect(mockStartAi).not.toHaveBeenCalled();
	});

	it("the owner's own poll still starts the fallback transcription", async () => {
		mockRunPromiseExit.mockResolvedValue(Exit.succeed([video]));
		mockCurrentUser.mockResolvedValue({ id: "owner-1" });
		const { getVideoStatus } = await import("@/actions/videos/get-status");

		const status = await getVideoStatus("video-1" as never);

		expect(mockTranscribe).toHaveBeenCalledWith("video-1", "owner-1");
		expect(status).toMatchObject({ transcriptionStatus: "PROCESSING" });
	});
});

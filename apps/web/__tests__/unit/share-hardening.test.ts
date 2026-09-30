import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isPasswordAttemptLimited, PASSWORD_ATTEMPT_LIMITS, clientAddress } =
	await import("@/lib/password-attempt-limiter");
const { parseVideoIdOrFileKey } = await import("@/app/api/upload/utils");

describe("isPasswordAttemptLimited", () => {
	it("allows the per-client budget, then rejects until the window resets", () => {
		const now = 1_000_000;
		for (let i = 0; i < PASSWORD_ATTEMPT_LIMITS.perClient; i++) {
			expect(isPasswordAttemptLimited("vid-a", "1.1.1.1", now)).toBe(false);
		}
		expect(isPasswordAttemptLimited("vid-a", "1.1.1.1", now)).toBe(true);
		// Another client on the same video still has its own budget.
		expect(isPasswordAttemptLimited("vid-a", "2.2.2.2", now)).toBe(false);
		expect(
			isPasswordAttemptLimited(
				"vid-a",
				"1.1.1.1",
				now + PASSWORD_ATTEMPT_LIMITS.windowMs + 1,
			),
		).toBe(false);
	});

	it("caps total attempts per video even when the client address rotates", () => {
		const now = 5_000_000;
		let limited = false;
		for (let i = 0; i <= PASSWORD_ATTEMPT_LIMITS.perVideo; i++) {
			limited = isPasswordAttemptLimited("vid-b", `10.0.0.${i}`, now);
		}
		expect(limited).toBe(true);
	});

	it("reads the first forwarded address", () => {
		expect(
			clientAddress(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })),
		).toBe("9.9.9.9");
		expect(clientAddress(new Headers())).toBe("unknown");
	});
});

describe("parseVideoIdOrFileKey", () => {
	it("scopes keys to the caller's own prefix", () => {
		expect(
			parseVideoIdOrFileKey("user1", { videoId: "vid", subpath: "result.mp4" }),
		).toBe("user1/vid/result.mp4");
		expect(
			parseVideoIdOrFileKey("user1", {
				fileKey: "someone/vid/raw-upload.webm",
			}),
		).toBe("user1/vid/raw-upload.webm");
	});

	it("rejects paths that could escape the recording's prefix", () => {
		for (const input of [
			{ videoId: "vid", subpath: "../other/result.mp4" },
			{ videoId: "vid", subpath: "a/../../x" },
			{ videoId: "vid", subpath: "/abs" },
			{ videoId: "vid", subpath: "" },
			{ videoId: "../vid", subpath: "result.mp4" },
			{ videoId: "a/b", subpath: "result.mp4" },
			{ fileKey: "user/vid/../../x" },
		]) {
			expect(() => parseVideoIdOrFileKey("user1", input)).toThrow(
				"Invalid upload path",
			);
		}
	});
});

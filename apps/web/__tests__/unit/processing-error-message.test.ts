import {
	GENERIC_PROCESSING_ERROR,
	toUserFacingProcessingError,
} from "@cap/web-backend/src/Videos/processing-error-message";
import { describe, expect, it } from "vitest";

describe("toUserFacingProcessingError", () => {
	it("hides pipeline internals, stderr and server paths", () => {
		for (const raw of [
			'FatalError: Step "step//./workflows/process-video//processVideoOnMediaServer" failed after 3 retries: FFmpeg exited with code 183. Last stderr: Error opening input file C:\\Users\\x\\AppData\\Local\\Temp\\cap-media-server\\a.webm',
			"FFmpeg exited with code 1",
			"Error opening input file /tmp/cap-media-server/a.webm",
			"connect ECONNREFUSED 127.0.0.1:3456",
			"TypeError: fetch failed",
			"Download failed (403): https://bucket.s3.amazonaws.com/u/v/raw.webm?X-Amz-Signature=abc",
			"Error: boom\n    at processVideo (/app/lib/x.ts:1:2)",
		]) {
			expect(toUserFacingProcessingError(raw)).toBe(GENERIC_PROCESSING_ERROR);
		}
	});

	it("keeps curated, user-facing messages", () => {
		const curated =
			"The upload stopped before it finished (no activity for more than 120 minutes). The browser tab was probably closed or crashed during recording.";
		expect(toUserFacingProcessingError(curated)).toBe(curated);
		expect(toUserFacingProcessingError("Video processing failed")).toBe(
			"Video processing failed",
		);
	});

	it("passes through empty values", () => {
		expect(toUserFacingProcessingError(null)).toBeNull();
		expect(toUserFacingProcessingError("")).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import {
	getProgressStatusLabel,
	getStalledProcessingMessage,
} from "@/app/s/[videoId]/_components/upload-progress";
import {
	getProcessingRetryDelayMs,
	isTransientMediaServerError,
	isWaitingForProcessingRetry,
	MediaServerUnavailableError,
	PROCESSING_RETRY_GRACE_MS,
	PROCESSING_RETRY_MAX_MS,
	planProcessingRetry,
	shouldForceRetryProcessing,
} from "@/lib/processing-retry";

const MAX_ATTEMPTS = 4;
const fetchFailed = () =>
	Object.assign(new TypeError("fetch failed"), {
		cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3456"), {
			code: "ECONNREFUSED",
		}),
	});

describe("processing retry policy", () => {
	it("retries a transient media-server failure", () => {
		const now = 1_000_000;
		expect(
			planProcessingRetry({
				attempt: 1,
				maxAttempts: MAX_ATTEMPTS,
				error: fetchFailed(),
				now,
			}),
		).toEqual({ delayMs: 20_000, nextRetryAt: new Date(now + 20_000) });
		expect(
			planProcessingRetry({
				attempt: 1,
				maxAttempts: MAX_ATTEMPTS,
				error: new MediaServerUnavailableError(
					"Media server unavailable (HTTP 503): restarting",
				),
			}),
		).not.toBeNull();
	});

	it("waits longer after each failed attempt, bounded by the cap", () => {
		const delays = [1, 2, 3].map(getProcessingRetryDelayMs);
		expect(delays).toEqual([20_000, 60_000, 180_000]);
		expect(getProcessingRetryDelayMs(10)).toBe(PROCESSING_RETRY_MAX_MS);
	});

	it("does not schedule a wait for permanent media or format errors", () => {
		for (const error of [
			new Error(
				"FFmpeg exited with code 1: Invalid data found when processing input",
			),
			new Error("Media input does not exist"),
			new Error("Upload raw file key does not match"),
			new TypeError("Cannot read properties of undefined"),
		]) {
			expect(isTransientMediaServerError(error)).toBe(false);
			expect(
				planProcessingRetry({ attempt: 1, maxAttempts: MAX_ATTEMPTS, error }),
			).toBeNull();
		}
	});

	it("stops at the maximum attempt count so the last failure propagates", () => {
		expect(
			planProcessingRetry({
				attempt: MAX_ATTEMPTS - 1,
				maxAttempts: MAX_ATTEMPTS,
				error: fetchFailed(),
			}),
		).not.toBeNull();
		expect(
			planProcessingRetry({
				attempt: MAX_ATTEMPTS,
				maxAttempts: MAX_ATTEMPTS,
				error: fetchFailed(),
			}),
		).toBeNull();
	});

	it("keeps the total wait to a few minutes across the attempt budget", () => {
		let total = 0;
		for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
			total += getProcessingRetryDelayMs(attempt);
		}
		expect(total).toBe(260_000);
	});
});

describe("concurrent recovery during backoff", () => {
	const now = 10_000_000;
	const waitingRow = {
		phase: "processing",
		updatedAt: new Date(now - 5 * 60_000),
		processingProgress: 0,
		processingNextRetryAt: new Date(now + 60_000),
	};

	it("does not let a manual retry force a second run while a retry is scheduled", () => {
		expect(shouldForceRetryProcessing(waitingRow, now)).toBe(false);
	});

	it("allows forcing once the scheduled retry is overdue (the run died)", () => {
		expect(
			shouldForceRetryProcessing(
				{
					...waitingRow,
					processingNextRetryAt: new Date(
						now - PROCESSING_RETRY_GRACE_MS - 1_000,
					),
				},
				now,
			),
		).toBe(true);
	});

	it("keeps the existing stall rules when no retry is scheduled", () => {
		expect(
			shouldForceRetryProcessing(
				{ ...waitingRow, processingNextRetryAt: null },
				now,
			),
		).toBe(true);
		expect(
			shouldForceRetryProcessing(
				{
					phase: "processing",
					updatedAt: new Date(now - 30_000),
					processingProgress: 0,
				},
				now,
			),
		).toBe(false);
	});
});

describe("UI state during backoff", () => {
	const now = Date.now();
	const waiting = {
		status: "processing" as const,
		lastUpdated: new Date(now - 5 * 60_000),
		progress: 0,
		message: "Waiting to retry video processing",
		retrying: true,
		attempt: 1,
		nextRetryAt: new Date(now + 30_000),
	};

	it("says it is waiting to retry instead of processing", () => {
		expect(getProgressStatusLabel(waiting)).toBe(
			"Retrying soon (attempt 2 of 4)",
		);
		expect(getProgressStatusLabel({ ...waiting, attempt: 3 })).toBe(
			"Retrying soon (attempt 4 of 4)",
		);
	});

	it("does not report a scheduled retry as a stall (no Retry button)", () => {
		expect(
			getStalledProcessingMessage({
				phase: "processing",
				updatedAt: waiting.lastUpdated,
				processingProgress: 0,
				nextRetryAt: waiting.nextRetryAt,
			}),
		).toBeNull();
	});

	it("falls back to stall handling once the retry is overdue past the grace window", () => {
		const overdue = new Date(now - PROCESSING_RETRY_GRACE_MS - 1_000);
		expect(isWaitingForProcessingRetry(overdue, now)).toBe(false);
		expect(
			getStalledProcessingMessage({
				phase: "processing",
				updatedAt: waiting.lastUpdated,
				processingProgress: 0,
				nextRetryAt: overdue,
			}),
		).toBe("Video processing did not start. Retry processing.");
		expect(getProgressStatusLabel({ ...waiting, nextRetryAt: overdue })).toBe(
			"Retrying",
		);
	});

	it("labels normal processing unchanged when no retry is scheduled", () => {
		expect(
			getProgressStatusLabel({
				...waiting,
				retrying: false,
				nextRetryAt: null,
			}),
		).toBe("Processing");
	});
});

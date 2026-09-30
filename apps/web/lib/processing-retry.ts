// Retry policy for the media-server processing step. The attempt budget stays
// at VIDEO_PROCESSING_MAX_ATTEMPTS; only the wait between attempts changes.
// Transient failures (media server unreachable or restarting) wait
// 20s, 60s, 180s: about four minutes in total, enough to ride out a restart.
// Everything else keeps the workflow's default short retry, still bounded by
// the same attempt budget, so a file the media server rejects fails quickly.

export const PROCESSING_RETRY_BASE_MS = 20_000;
export const PROCESSING_RETRY_FACTOR = 3;
export const PROCESSING_RETRY_MAX_MS = 5 * 60_000;

// Once the scheduled retry time has passed by this much without a new attempt
// starting, the wait is no longer trusted (the workflow run may have died) and
// the normal stalled-processing handling applies again.
export const PROCESSING_RETRY_GRACE_MS = 2 * 60_000;

/** Delay before the attempt after `failedAttempt` (1-based). */
export function getProcessingRetryDelayMs(failedAttempt: number): number {
	const exponent = Math.max(0, Math.floor(failedAttempt) - 1);
	return Math.min(
		PROCESSING_RETRY_MAX_MS,
		PROCESSING_RETRY_BASE_MS * PROCESSING_RETRY_FACTOR ** exponent,
	);
}

/** The media server answered, but is temporarily unable to take the job. */
export class MediaServerUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MediaServerUnavailableError";
	}
}

const TRANSIENT_NETWORK_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
	"EAI_AGAIN",
	"ENOTFOUND",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_SOCKET",
]);

/**
 * True for failures that say nothing about the recording itself: the media
 * server could not be reached, or reported itself temporarily unavailable.
 */
export function isTransientMediaServerError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 4 && current; depth++) {
		if (current instanceof MediaServerUnavailableError) return true;
		const candidate = current as {
			name?: string;
			message?: string;
			code?: string;
			cause?: unknown;
		};
		if (candidate.name === "MediaServerUnavailableError") return true;
		if (candidate.code && TRANSIENT_NETWORK_CODES.has(candidate.code)) {
			return true;
		}
		// Node's fetch reports every connection-level failure this way.
		if (
			candidate.name === "TypeError" &&
			candidate.message === "fetch failed"
		) {
			return true;
		}
		current = candidate.cause;
	}
	return false;
}

/**
 * Decides whether a failed processing attempt should wait and retry: only for
 * transient media-server failures, and only while attempts remain. Returns
 * null when the error should propagate unchanged (permanent failure, or the
 * last attempt, which then fails the step with its original message).
 */
export function planProcessingRetry(input: {
	attempt: number;
	maxAttempts: number;
	error: unknown;
	now?: number;
}): { delayMs: number; nextRetryAt: Date } | null {
	if (input.attempt >= input.maxAttempts) return null;
	if (!isTransientMediaServerError(input.error)) return null;
	const delayMs = getProcessingRetryDelayMs(input.attempt);
	return {
		delayMs,
		nextRetryAt: new Date((input.now ?? Date.now()) + delayMs),
	};
}

const STALE_PROCESSING_START_MS = 90_000;
const STALE_PROCESSING_PROGRESS_MS = 10 * 60_000;
const STALE_THUMBNAIL_MS = 5 * 60_000;

/**
 * Whether a manual "Retry processing" may force a restart of an upload that
 * still reads as in progress. Never while a scheduled retry is pending: that
 * would run a second workflow alongside the waiting one.
 */
export function shouldForceRetryProcessing(
	upload: {
		phase: string;
		updatedAt: Date;
		processingProgress: number;
		processingNextRetryAt?: Date | null;
	},
	now = Date.now(),
): boolean {
	const ageMs = now - upload.updatedAt.getTime();

	if (upload.phase === "processing") {
		if (isWaitingForProcessingRetry(upload.processingNextRetryAt, now)) {
			return false;
		}
		if (upload.processingProgress === 0 && ageMs > STALE_PROCESSING_START_MS) {
			return true;
		}
		return ageMs > STALE_PROCESSING_PROGRESS_MS;
	}

	if (upload.phase === "generating_thumbnail") {
		return ageMs > STALE_THUMBNAIL_MS;
	}

	return false;
}

/** Whether a processing row is deliberately waiting for its next attempt. */
export function isWaitingForProcessingRetry(
	nextRetryAt: Date | null | undefined,
	now = Date.now(),
): boolean {
	return (
		nextRetryAt != null &&
		now < nextRetryAt.getTime() + PROCESSING_RETRY_GRACE_MS
	);
}

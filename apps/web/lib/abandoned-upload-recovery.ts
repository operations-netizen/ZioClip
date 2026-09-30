import { db } from "@cap/database";
import { importedVideos, videos, videoUploads } from "@cap/database/schema";
import { Videos } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { Cause, Effect } from "effect";
import { runPromise } from "@/lib/server";

// Live browser recordings heartbeat their upload row every 30s (see
// InstantRecordingUploader) and file imports report progress every few
// seconds, but mobile/API uploads have no heartbeat and a backgrounded upload
// can legitimately sit idle for a while. Two hours without any update is far
// outside every live path. The recording's unfinished multipart upload is
// aborted before the row is marked failed, so an abandoned upload leaves no
// parts in storage (a browser that did crash keeps its local recovery copy).
export const ABANDONED_UPLOAD_MIN_IDLE_MS = 2 * 60 * 60 * 1000;
export const ABANDONED_UPLOAD_BATCH_SIZE = 50;
export const ABANDONED_UPLOAD_MESSAGE = "Recording upload was interrupted";

export type AbandonedUploadStatus =
	| "marked-failed"
	| "already-changed"
	| "cancel-failed";

export type AbandonedUploadRecoverySummary = {
	checked: number;
	statuses: Partial<Record<AbandonedUploadStatus, number>>;
	results: Array<{ videoId: Video.VideoId; status: AbandonedUploadStatus }>;
};

const getAffectedRows = (result: unknown) => {
	if (Array.isArray(result)) {
		return (
			(result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0
		);
	}

	return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
};

async function cancelUnfinishedUploads(videoId: Video.VideoId) {
	return Effect.gen(function* () {
		const videos = yield* Videos;
		return yield* videos.cancelUnfinishedUploads(videoId);
	}).pipe(
		Effect.as(true),
		Effect.catchAllCause((cause) =>
			Effect.sync(() => {
				console.error(
					"[abandoned-upload-recovery] Could not cancel unfinished upload",
					{ videoId, error: Cause.squash(cause) },
				);
				return false;
			}),
		),
		runPromise,
	);
}

export function getAbandonedUploadError(minIdleMs: number) {
	const minutes = Math.round(minIdleMs / 60_000);
	return `The upload stopped before it finished (no activity for more than ${minutes} minute${minutes === 1 ? "" : "s"}). The browser tab was probably closed or crashed during recording. If that browser offered to recover the recording, download it from the recorder.`;
}

export async function recoverAbandonedUploads({
	now = new Date(),
	minIdleMs = ABANDONED_UPLOAD_MIN_IDLE_MS,
	limit = ABANDONED_UPLOAD_BATCH_SIZE,
}: {
	now?: Date;
	minIdleMs?: number;
	limit?: number;
} = {}): Promise<AbandonedUploadRecoverySummary> {
	const idleBefore = new Date(now.getTime() - minIdleMs);

	const candidates = await db()
		.select({
			videoId: videoUploads.videoId,
			updatedAt: videoUploads.updatedAt,
		})
		.from(videoUploads)
		.innerJoin(videos, eq(videos.id, videoUploads.videoId))
		.leftJoin(importedVideos, eq(importedVideos.id, videos.id))
		.where(
			and(
				eq(videoUploads.phase, "uploading"),
				isNull(videoUploads.rawFileKey),
				lte(videoUploads.updatedAt, idleBefore),
				isNull(importedVideos.id),
				sql`JSON_UNQUOTE(JSON_EXTRACT(${videos.source}, '$.type')) = 'webMP4'`,
			),
		)
		.orderBy(asc(videoUploads.updatedAt))
		.limit(limit);

	const summary: AbandonedUploadRecoverySummary = {
		checked: candidates.length,
		statuses: {},
		results: [],
	};

	const processingError = getAbandonedUploadError(minIdleMs);

	for (const candidate of candidates) {
		// A failed cancellation leaves the row untouched, so the next run picks
		// it up again instead of stranding the parts.
		const cancelled = await cancelUnfinishedUploads(candidate.videoId);
		if (!cancelled) {
			summary.statuses["cancel-failed"] =
				(summary.statuses["cancel-failed"] ?? 0) + 1;
			summary.results.push({
				videoId: candidate.videoId,
				status: "cancel-failed",
			});
			continue;
		}

		const claimResult = await db()
			.update(videoUploads)
			.set({
				phase: "error",
				processingProgress: 0,
				processingMessage: ABANDONED_UPLOAD_MESSAGE,
				processingError,
				updatedAt: now,
			})
			.where(
				and(
					eq(videoUploads.videoId, candidate.videoId),
					eq(videoUploads.phase, "uploading"),
					isNull(videoUploads.rawFileKey),
					eq(videoUploads.updatedAt, candidate.updatedAt),
				),
			);

		const status: AbandonedUploadStatus =
			getAffectedRows(claimResult) > 0 ? "marked-failed" : "already-changed";
		summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
		summary.results.push({ videoId: candidate.videoId, status });
	}

	return summary;
}

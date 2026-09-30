import { randomUUID } from "node:crypto";
import { db } from "@cap/database";
import { videoProcessingJobs, videos } from "@cap/database/schema";
import { DELETING_MARKER_CODE, Videos } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { and, asc, eq, lte } from "drizzle-orm";
import { Effect } from "effect";
import { runPromise } from "@/lib/server";

// `Videos.delete` writes the deletion marker, removes the recording's objects,
// then removes the rows (marker included) in one transaction; locally the whole
// request takes a few seconds. A marker still present after fifteen minutes
// means that request died (tab closed, server restarted) and nothing else will
// ever clear it: the desktop pipeline deliberately ignores marked jobs.
export const INTERRUPTED_DELETE_MIN_AGE_MS = 15 * 60 * 1000;
export const INTERRUPTED_DELETE_BATCH_SIZE = 25;

export type InterruptedDeleteStatus =
	| "deleted"
	| "orphan-marker-cleared"
	| "no-longer-deleting"
	| "claimed-elsewhere"
	| "failed";

export type InterruptedDeleteRecoverySummary = {
	checked: number;
	statuses: Partial<Record<InterruptedDeleteStatus, number>>;
	results: Array<{
		videoId: Video.VideoId;
		status: InterruptedDeleteStatus;
		error?: string;
	}>;
};

const getAffectedRows = (result: unknown) => {
	if (Array.isArray(result)) {
		return (
			(result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0
		);
	}
	return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
};

export async function recoverInterruptedDeletes({
	now = new Date(),
	minAgeMs = INTERRUPTED_DELETE_MIN_AGE_MS,
	limit = INTERRUPTED_DELETE_BATCH_SIZE,
}: {
	now?: Date;
	minAgeMs?: number;
	limit?: number;
} = {}): Promise<InterruptedDeleteRecoverySummary> {
	const staleBefore = new Date(now.getTime() - minAgeMs);
	const isStaleMarker = (videoId: Video.VideoId) =>
		and(
			eq(videoProcessingJobs.videoId, videoId),
			eq(videoProcessingJobs.errorCode, DELETING_MARKER_CODE),
			lte(videoProcessingJobs.updatedAt, staleBefore),
		);

	const candidates = await db()
		.select({ videoId: videoProcessingJobs.videoId })
		.from(videoProcessingJobs)
		.where(
			and(
				eq(videoProcessingJobs.errorCode, DELETING_MARKER_CODE),
				lte(videoProcessingJobs.updatedAt, staleBefore),
			),
		)
		.orderBy(asc(videoProcessingJobs.updatedAt))
		.limit(limit);

	const summary: InterruptedDeleteRecoverySummary = {
		checked: candidates.length,
		statuses: {},
		results: [],
	};
	const record = (
		videoId: Video.VideoId,
		status: InterruptedDeleteStatus,
		error?: string,
	) => {
		summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
		summary.results.push({ videoId, status, ...(error ? { error } : {}) });
	};

	for (const { videoId } of candidates) {
		// Claim by refreshing the marker. Only one caller can move a stale marker
		// to "now"; a concurrent recovery run, or the owner deleting again (which
		// rewrites the marker), makes this claim miss and we leave it alone. A
		// failed attempt stays claimed-fresh, so it is retried after another
		// full stale period rather than hammered.
		const claim = await db()
			.update(videoProcessingJobs)
			.set({ attemptId: randomUUID(), updatedAt: now })
			.where(isStaleMarker(videoId));
		if (getAffectedRows(claim) !== 1) {
			record(videoId, "claimed-elsewhere");
			continue;
		}

		try {
			const outcome = await Effect.gen(function* () {
				const videos = yield* Videos;
				return yield* videos.completeInterruptedDelete(videoId);
			}).pipe(runPromise);

			if (outcome === "deleted") {
				record(videoId, "deleted");
			} else if (outcome === "not-found") {
				// The video row is already gone (its transaction normally removes
				// the marker too); drop the leftover marker so it isn't rechecked.
				await db()
					.delete(videoProcessingJobs)
					.where(
						and(
							eq(videoProcessingJobs.videoId, videoId),
							eq(videoProcessingJobs.errorCode, DELETING_MARKER_CODE),
						),
					);
				record(videoId, "orphan-marker-cleared");
			} else {
				record(videoId, "no-longer-deleting");
			}
		} catch (error) {
			// A concurrent delete of the same recording (the owner retrying) can
			// win the final transaction; that is success, not failure.
			const [stillThere] = await db()
				.select({ videoId: videos.id })
				.from(videos)
				.where(eq(videos.id, videoId));
			if (!stillThere) {
				record(videoId, "deleted");
				continue;
			}
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				`[interrupted-delete-recovery] Could not finish deleting ${videoId}`,
				error,
			);
			record(videoId, "failed", message);
		}
	}

	return summary;
}

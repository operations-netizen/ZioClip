"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { importedVideos, videos, videoUploads } from "@cap/database/schema";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { shouldForceRetryProcessing } from "@/lib/processing-retry";
import {
	setVideoProcessingError,
	startVideoProcessingWorkflow,
	type VideoProcessingStartStatus,
} from "@/lib/video-processing";
import { importLoomVideoWorkflow } from "@/workflows/import-loom-video";

export async function retryVideoProcessing({
	videoId,
}: {
	videoId: Video.VideoId;
}): Promise<{ success: boolean; status: VideoProcessingStartStatus }> {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");

	const [video] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId));

	if (!video) throw new Error("Video not found");
	if (video.ownerId !== user.id) throw new Error("Unauthorized");

	const [upload] = await db()
		.select()
		.from(videoUploads)
		.where(eq(videoUploads.videoId, videoId));

	if (!upload) throw new Error("No upload record found");
	if (!upload.rawFileKey) throw new Error("No raw file key found for retry");

	const [importedVideo] = await db()
		.select({
			source: importedVideos.source,
			sourceId: importedVideos.sourceId,
		})
		.from(importedVideos)
		.where(eq(importedVideos.id, videoId));

	if (importedVideo?.source === "loom") {
		if (upload.phase === "processing" && !shouldForceRetryProcessing(upload)) {
			return { success: true, status: "already-processing" };
		}

		await db()
			.update(videoUploads)
			.set({
				phase: "processing",
				processingProgress: 0,
				processingMessage: "Retrying Loom import...",
				processingError: null,
				rawFileKey: upload.rawFileKey,
				updatedAt: new Date(),
			})
			.where(eq(videoUploads.videoId, videoId));

		try {
			await start(importLoomVideoWorkflow, [
				{
					videoId,
					userId: user.id,
					rawFileKey: upload.rawFileKey,
					bucketId: video.bucket ?? null,
					loomDownloadUrl: "",
					loomVideoId: importedVideo.sourceId,
				},
			]);
		} catch (error) {
			const normalizedError =
				error instanceof Error
					? error
					: new Error("Loom import could not restart");
			await setVideoProcessingError(
				videoId,
				"Loom import could not restart.",
				normalizedError,
			);
			throw normalizedError;
		}

		return { success: true, status: "started" };
	}

	const status = await startVideoProcessingWorkflow({
		videoId,
		userId: user.id,
		rawFileKey: upload.rawFileKey,
		bucketId: video.bucket ?? null,
		processingMessage: "Retrying video processing...",
		startFailureMessage: "Video processing could not restart.",
		forceRestart: shouldForceRetryProcessing(upload),
	});

	return { success: true, status };
}

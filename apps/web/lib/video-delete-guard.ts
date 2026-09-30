import { videoProcessingJobs, videoUploads } from "@cap/database/schema";
import { DELETING_MARKER_CODE } from "@cap/web-backend";
import { sql } from "drizzle-orm";

/**
 * Predicate for `video_uploads` claims: true unless the recording carries the
 * "video-deleting" marker. A delete that stops part-way (for example when the
 * multipart abort fails) leaves the upload row in place until the
 * interrupted-delete recovery finishes it; recovery jobs must not restart
 * processing on it, or the media server could write new objects under a
 * prefix that is being deleted.
 */
export const notBeingDeleted = () =>
	sql`not exists (select 1 from ${videoProcessingJobs} where ${videoProcessingJobs.videoId} = ${videoUploads.videoId} and ${videoProcessingJobs.errorCode} = ${DELETING_MARKER_CODE})`;

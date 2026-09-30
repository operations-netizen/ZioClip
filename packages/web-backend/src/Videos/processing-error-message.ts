// processing_error stores whatever the pipeline threw: workflow step names,
// ffmpeg stderr, temp file paths. Upload progress is readable by anyone who can
// view the recording, so internal-looking text is replaced before it leaves
// the server. Curated messages (for example the interrupted-upload
// explanation) pass through unchanged. The raw text stays in the database for
// operators.
export const GENERIC_PROCESSING_ERROR =
	"This recording couldn't be processed. Retry processing, or record it again if the problem continues.";

const INTERNAL_MARKERS = [
	/FatalError/,
	/Step "step\/\//,
	/\bstderr\b/i,
	/exited with code/i,
	/\bat [\w$.<>]+ \(/, // stack frame
	/[A-Za-z]:\\/, // Windows path
	/(?:^|[\s(])\/(?:tmp|var|home|usr|app|opt|private)\//, // POSIX path
	/\bE[A-Z]{3,}\b/, // ECONNREFUSED, ENOENT, ...
	/fetch failed/i,
	/https?:\/\/\S+[?&]X-Amz-/i, // presigned URL
	/\b(?:SQL|ER_[A-Z_]+|Drizzle)/,
];

export function toUserFacingProcessingError(
	message: string | null | undefined,
): string | null {
	if (!message) return null;
	return INTERNAL_MARKERS.some((pattern) => pattern.test(message))
		? GENERIC_PROCESSING_ERROR
		: message;
}

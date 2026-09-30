import type * as S3 from "@aws-sdk/client-s3";
import { Storage as StorageDomain } from "@cap/web-domain";
import { Effect } from "effect";

// Keys a recording's multipart uploads can target. The browser recorder
// streams to `raw-upload.webm` (or `raw-upload.mp4` where MediaRecorder only
// produces MP4); the default multipart subpath is `result.mp4`.
export const RECORDING_MULTIPART_SUBPATHS = [
	"raw-upload.webm",
	"raw-upload.mp4",
	"result.mp4",
] as const;

const MAX_LIST_PAGES = 50;

// `list` is absent for storage without S3 multipart state (Google Drive).
export type UnfinishedUploadLister<E = unknown> = {
	list?: (config: {
		prefix?: string;
		keyMarker?: string;
		uploadIdMarker?: string;
	}) => Effect.Effect<S3.ListMultipartUploadsCommandOutput, E>;
	abort: (key: string, uploadId: string) => Effect.Effect<unknown, E>;
};

export type UnfinishedUploadCancellation = {
	cancelled: number;
	alreadyGone: number;
};

// Storage errors wrap S3 errors, which wrap the provider error: walk the
// `cause` chain looking for S3's "upload no longer exists" answer.
const isNoSuchUpload = (error: unknown) => {
	let current = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const candidate = current as {
			name?: string;
			Code?: string;
			$metadata?: { httpStatusCode?: number };
			cause?: unknown;
		};
		if (
			candidate.name === "NoSuchUpload" ||
			candidate.Code === "NoSuchUpload" ||
			candidate.$metadata?.httpStatusCode === 404
		) {
			return true;
		}
		current = candidate.cause;
	}
	return false;
};

const cleanupError = (message: string) =>
	new StorageDomain.StorageError({ cause: new Error(message) });

/*
 * Aborts every unfinished multipart upload belonging to exactly one recording
 * (`<ownerId>/<videoId>/...`). Safe to repeat: an upload that is already gone
 * counts as success. Scoped to the recording's own key prefix, never to a user
 * or folder.
 *
 * Two lookups because providers differ: AWS S3 filters ListMultipartUploads by
 * key prefix, while MinIO only matches a prefix equal to a whole object key.
 * The prefix listing covers S3; the exact-key listings cover MinIO.
 */
export const cancelUnfinishedRecordingUploads = Effect.fn(
	"Storage.cancelUnfinishedRecordingUploads",
)(function* <E>(
	multipart: UnfinishedUploadLister<E>,
	recording: { ownerId: string; videoId: string },
) {
	const { ownerId, videoId } = recording;
	if (
		!ownerId ||
		!videoId ||
		ownerId.includes("/") ||
		videoId.includes("/") ||
		ownerId.includes("..") ||
		videoId.includes("..")
	) {
		return yield* Effect.fail(
			cleanupError("Invalid recording for upload cleanup"),
		);
	}
	const prefix = `${ownerId}/${videoId}/`;

	const result: UnfinishedUploadCancellation = { cancelled: 0, alreadyGone: 0 };
	const list = multipart.list;
	if (!list) return result;

	const found = new Map<string, { key: string; uploadId: string }>();
	const collect = Effect.fn(function* (listPrefix: string) {
		let keyMarker: string | undefined;
		let uploadIdMarker: string | undefined;
		for (let page = 0; page < MAX_LIST_PAGES; page++) {
			const response = yield* list({
				prefix: listPrefix,
				keyMarker,
				uploadIdMarker,
			});
			for (const upload of response.Uploads ?? []) {
				if (!upload.Key?.startsWith(prefix) || !upload.UploadId) continue;
				found.set(`${upload.Key}\n${upload.UploadId}`, {
					key: upload.Key,
					uploadId: upload.UploadId,
				});
			}
			if (!response.IsTruncated) return;
			if (
				response.NextKeyMarker === keyMarker &&
				response.NextUploadIdMarker === uploadIdMarker
			) {
				return;
			}
			keyMarker = response.NextKeyMarker;
			uploadIdMarker = response.NextUploadIdMarker;
		}
	});

	yield* collect(prefix);
	for (const subpath of RECORDING_MULTIPART_SUBPATHS) {
		yield* collect(`${prefix}${subpath}`);
	}

	const failures: Array<{ key: string; uploadId: string; error: E }> = [];
	for (const upload of found.values()) {
		const outcome = yield* multipart.abort(upload.key, upload.uploadId).pipe(
			Effect.as({ kind: "cancelled" as const }),
			Effect.catchAll((error) =>
				Effect.succeed(
					isNoSuchUpload(error)
						? { kind: "gone" as const }
						: { kind: "failed" as const, error },
				),
			),
		);
		if (outcome.kind === "cancelled") result.cancelled++;
		else if (outcome.kind === "gone") result.alreadyGone++;
		else failures.push({ ...upload, error: outcome.error });
	}

	const firstFailure = failures[0];
	if (firstFailure) {
		for (const failure of failures) {
			yield* Effect.logWarning("Could not cancel unfinished upload", {
				videoId,
				key: failure.key,
				uploadId: failure.uploadId,
			});
		}
		return yield* Effect.fail(firstFailure.error);
	}

	return result;
});

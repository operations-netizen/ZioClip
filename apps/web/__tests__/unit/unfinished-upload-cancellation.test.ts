import {
	cancelUnfinishedRecordingUploads,
	type UnfinishedUploadLister,
} from "@cap/web-backend/src/Storage/unfinished-uploads";
import { S3Error } from "@cap/web-domain";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

type Upload = { Key: string; UploadId: string };

// In-memory multipart store. `prefixMode` mimics how the provider filters
// ListMultipartUploads: "s3" matches real key prefixes, "minio" only matches a
// prefix equal to a whole object key.
function makeStore(
	initial: Upload[],
	{
		prefixMode = "minio",
		pageSize = 1000,
		abortError,
	}: {
		prefixMode?: "s3" | "minio";
		pageSize?: number;
		abortError?: (upload: Upload) => unknown;
	} = {},
) {
	const uploads = [...initial];
	const aborted: Upload[] = [];
	const lister: Required<UnfinishedUploadLister> = {
		list: ({ prefix, keyMarker, uploadIdMarker }) =>
			Effect.sync(() => {
				const matching = uploads
					.filter((u) =>
						!prefix
							? true
							: prefixMode === "s3"
								? u.Key.startsWith(prefix)
								: u.Key === prefix,
					)
					.sort((a, b) =>
						a.Key === b.Key
							? a.UploadId.localeCompare(b.UploadId)
							: a.Key.localeCompare(b.Key),
					);
				const start = keyMarker
					? matching.findIndex(
							(u) => u.Key === keyMarker && u.UploadId === uploadIdMarker,
						) + 1
					: 0;
				const page = matching.slice(start, start + pageSize);
				const last = page.at(-1);
				const truncated = start + pageSize < matching.length;
				return {
					$metadata: {},
					Uploads: page,
					IsTruncated: truncated,
					NextKeyMarker: truncated ? last?.Key : undefined,
					NextUploadIdMarker: truncated ? last?.UploadId : undefined,
				};
			}),
		abort: (key, uploadId) =>
			Effect.suspend(() => {
				const index = uploads.findIndex(
					(u) => u.Key === key && u.UploadId === uploadId,
				);
				const upload = uploads[index] ?? { Key: key, UploadId: uploadId };
				const cause = abortError?.(upload);
				if (cause) return Effect.fail(new S3Error({ cause }));
				if (index === -1) {
					return Effect.fail(
						new S3Error({
							cause: Object.assign(new Error("NoSuchUpload"), {
								name: "NoSuchUpload",
								$metadata: { httpStatusCode: 404 },
							}),
						}),
					);
				}
				uploads.splice(index, 1);
				aborted.push(upload);
				return Effect.void;
			}),
	};
	return { lister, uploads, aborted };
}

const recording = { ownerId: "owner1", videoId: "vidA" };
const run = (lister: UnfinishedUploadLister, target = recording) =>
	Effect.runPromise(cancelUnfinishedRecordingUploads(lister, target));

describe("cancelUnfinishedRecordingUploads", () => {
	it("cancels the recording's unfinished upload (delete with a live multipart)", async () => {
		const store = makeStore([
			{ Key: "owner1/vidA/raw-upload.webm", UploadId: "u1" },
		]);

		await expect(run(store.lister)).resolves.toEqual({
			cancelled: 1,
			alreadyGone: 0,
		});
		expect(store.uploads).toEqual([]);
	});

	it("finds uploads through a real key prefix on S3-style providers", async () => {
		const store = makeStore(
			[
				{ Key: "owner1/vidA/raw-upload.webm", UploadId: "u1" },
				{ Key: "owner1/vidA/segments/custom.bin", UploadId: "u2" },
			],
			{ prefixMode: "s3" },
		);

		await expect(run(store.lister)).resolves.toEqual({
			cancelled: 2,
			alreadyGone: 0,
		});
	});

	it("does nothing for a completed upload (no unfinished multipart left)", async () => {
		const store = makeStore([]);

		await expect(run(store.lister)).resolves.toEqual({
			cancelled: 0,
			alreadyGone: 0,
		});
	});

	it("treats an upload that disappears before the abort as success", async () => {
		const store = makeStore([
			{ Key: "owner1/vidA/raw-upload.webm", UploadId: "u1" },
		]);
		const lister: UnfinishedUploadLister = {
			...store.lister,
			list: (config) =>
				store.lister.list(config).pipe(
					// Listed, then cancelled elsewhere before our abort runs.
					Effect.tap((response) =>
						Effect.sync(() => {
							if (response.Uploads?.length) store.uploads.length = 0;
						}),
					),
				),
		};

		await expect(run(lister)).resolves.toEqual({
			cancelled: 0,
			alreadyGone: 1,
		});
	});

	it("is idempotent when run repeatedly", async () => {
		const store = makeStore([
			{ Key: "owner1/vidA/raw-upload.webm", UploadId: "u1" },
		]);

		await run(store.lister);
		await expect(run(store.lister)).resolves.toEqual({
			cancelled: 0,
			alreadyGone: 0,
		});
		expect(store.aborted).toHaveLength(1);
	});

	it("tolerates concurrent cleanup of the same recording", async () => {
		const store = makeStore([
			{ Key: "owner1/vidA/raw-upload.webm", UploadId: "u1" },
			{ Key: "owner1/vidA/result.mp4", UploadId: "u2" },
		]);

		// Yield inside every listing so both workers finish listing before
		// either aborts: the worst-case interleaving.
		const interleaved: UnfinishedUploadLister = {
			...store.lister,
			list: (config) =>
				Effect.zipLeft(store.lister.list(config), Effect.sleep("5 millis")),
		};
		const results = await Effect.runPromise(
			Effect.all(
				[
					cancelUnfinishedRecordingUploads(interleaved, recording),
					cancelUnfinishedRecordingUploads(interleaved, recording),
				],
				{ concurrency: "unbounded" },
			),
		);

		expect(store.uploads).toEqual([]);
		expect(store.aborted).toHaveLength(2);
		const total = results.reduce(
			(sum, r) => sum + r.cancelled + r.alreadyGone,
			0,
		);
		expect(total).toBe(4);
	});

	it("never touches another recording's or another user's uploads", async () => {
		const others = [
			{ Key: "owner1/vidB/raw-upload.webm", UploadId: "other-video" },
			{ Key: "owner1/vidAB/raw-upload.webm", UploadId: "prefix-lookalike" },
			{ Key: "owner2/vidA/raw-upload.webm", UploadId: "other-user" },
		];
		for (const prefixMode of ["s3", "minio"] as const) {
			const store = makeStore(
				[{ Key: "owner1/vidA/raw-upload.webm", UploadId: "mine" }, ...others],
				{ prefixMode },
			);

			await run(store.lister);

			expect(store.aborted.map((u) => u.UploadId)).toEqual(["mine"]);
			expect(store.uploads).toEqual(others);
		}
	});

	it("pages through large listings", async () => {
		const uploads = Array.from({ length: 5 }, (_, i) => ({
			Key: "owner1/vidA/raw-upload.webm",
			UploadId: `u${i}`,
		}));
		const store = makeStore(uploads, { pageSize: 2 });

		await expect(run(store.lister)).resolves.toEqual({
			cancelled: 5,
			alreadyGone: 0,
		});
	});

	it("still cancels the rest, then fails so the caller can retry, when one abort fails", async () => {
		const store = makeStore(
			[
				{ Key: "owner1/vidA/raw-upload.webm", UploadId: "flaky" },
				{ Key: "owner1/vidA/result.mp4", UploadId: "ok" },
			],
			{
				abortError: (u) =>
					u.UploadId === "flaky"
						? Object.assign(new Error("SlowDown"), {
								$metadata: { httpStatusCode: 503 },
							})
						: undefined,
			},
		);

		const exit = await Effect.runPromiseExit(
			cancelUnfinishedRecordingUploads(store.lister, recording),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		expect(store.aborted.map((u) => u.UploadId)).toEqual(["ok"]);
		expect(store.uploads.map((u) => u.UploadId)).toEqual(["flaky"]);
	});

	it("refuses to run without an exact recording scope", async () => {
		const store = makeStore([{ Key: "owner1/x", UploadId: "u1" }], {
			prefixMode: "s3",
		});
		for (const target of [
			{ ownerId: "owner1", videoId: "" },
			{ ownerId: "", videoId: "vidA" },
			{ ownerId: "owner1", videoId: "../x" },
			{ ownerId: "owner1", videoId: "a/b" },
		]) {
			const exit = await Effect.runPromiseExit(
				cancelUnfinishedRecordingUploads(store.lister, target),
			);
			expect(Exit.isFailure(exit)).toBe(true);
		}
		expect(store.aborted).toEqual([]);
	});
});

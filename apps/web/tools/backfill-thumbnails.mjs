/**
 * Backfills result.mp4 / thumbnail / preview-gif for recordings that were
 * uploaded before the media-server could find ffmpeg (see
 * start-services.ps1). It does NOT reimplement the pipeline: it presigns the
 * same URLs the web app would and asks the media-server to do the work, so the
 * output is identical to a freshly processed recording.
 *
 * Usage: node backfill-thumbnails.mjs [--apply]
 * Without --apply it only reports what is missing.
 */

import { readFileSync } from "node:fs";
import {
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
	readFileSync("D:/cap.so/.env", "utf8")
		.split(/\r?\n/)
		.filter((l) => l && !l.startsWith("#") && l.includes("="))
		.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const BUCKET = env.CAP_AWS_BUCKET;
const s3 = new S3Client({
	region: env.CAP_AWS_REGION,
	endpoint: env.CAP_AWS_ENDPOINT,
	forcePathStyle: true,
	credentials: {
		accessKeyId: env.CAP_AWS_ACCESS_KEY,
		secretAccessKey: env.CAP_AWS_SECRET_KEY,
	},
});

const sign = (Cmd, Key, extra = {}) =>
	getSignedUrl(s3, new Cmd({ Bucket: BUCKET, Key, ...extra }), {
		expiresIn: 3600,
	});

// Discover every {ownerId}/{videoId}/ prefix and what it already contains.
const objects = [];
let token;
do {
	const page = await s3.send(
		new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
	);
	objects.push(...(page.Contents ?? []));
	token = page.NextContinuationToken;
} while (token);

const byVideo = new Map();
for (const o of objects) {
	const [ownerId, videoId, ...rest] = o.Key.split("/");
	if (!videoId || rest.length === 0) continue;
	const entry = byVideo.get(videoId) ?? { ownerId, videoId, keys: [] };
	entry.keys.push(rest.join("/"));
	byVideo.set(videoId, entry);
}

const todo = [];
for (const v of byVideo.values()) {
	const raw = v.keys.find((k) => k.startsWith("raw-upload."));
	const hasResult = v.keys.includes("result.mp4");
	const hasThumb = v.keys.some((k) => k.startsWith("screenshot/"));
	if (!raw) continue;
	if (hasResult && hasThumb) continue;
	todo.push({ ...v, raw });
}

console.log(`videos with media: ${byVideo.size}`);
console.log(`needing backfill  : ${todo.length}`);
todo.forEach((t) =>
	console.log(`  - ${t.videoId} (has: ${t.keys.join(", ")})`),
);
if (!APPLY) {
	console.log("\ndry run — pass --apply to process");
	process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Confirm the job's outputs actually landed in S3.
 *
 * The job-status endpoint is not a reliable success signal: the media-server
 * evicts finished jobs, so polling after completion returns 404 and an earlier
 * version of this script logged those as failures even though every artifact
 * had been written. S3 is the source of truth.
 */
async function artifactsExist(ownerId, videoId) {
	const keys = [
		`${ownerId}/${videoId}/result.mp4`,
		`${ownerId}/${videoId}/screenshot/screen-capture.jpg`,
	];
	for (const Key of keys) {
		try {
			await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
		} catch {
			return false;
		}
	}
	return true;
}

/** Wait until the outputs appear (or we give up). */
async function waitForOutputs(ownerId, videoId) {
	for (let i = 0; i < 240; i++) {
		await sleep(2000);
		if (await artifactsExist(ownerId, videoId)) return "complete";
	}
	return "timeout";
}

let done = 0;
let failed = 0;
for (const t of todo) {
	const base = `${t.ownerId}/${t.videoId}`;
	const ext = t.raw.split(".").pop();
	const payload = {
		videoId: t.videoId,
		userId: t.ownerId,
		videoUrl: await sign(GetObjectCommand, `${base}/${t.raw}`),
		outputPresignedUrl: await sign(PutObjectCommand, `${base}/result.mp4`, {
			ContentType: "video/mp4",
		}),
		thumbnailPresignedUrl: await sign(
			PutObjectCommand,
			`${base}/screenshot/screen-capture.jpg`,
			{ ContentType: "image/jpeg" },
		),
		previewGifPresignedUrl: await sign(
			PutObjectCommand,
			`${base}/preview/animated-preview.gif`,
			{ ContentType: "image/gif" },
		),
		inputExtension: ext,
		priority: "bulk",
	};

	// The media-server caps concurrent jobs (503 SERVER_BUSY), so queue one at a
	// time and wait for it to finish before submitting the next.
	let queued = null;
	for (let attempt = 0; attempt < 40 && !queued; attempt++) {
		const res = await fetch("http://127.0.0.1:3456/video/process", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-media-server-secret": env.MEDIA_SERVER_WEBHOOK_SECRET,
			},
			body: JSON.stringify(payload),
		});
		if (res.status === 503) {
			await sleep(5000);
			continue;
		}
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			console.log(`${t.videoId}: FAILED to queue (${res.status})`);
			failed++;
			break;
		}
		queued = body.jobId;
	}
	if (!queued) {
		if (!failed)
			console.log(`${t.videoId}: could not queue (server stayed busy)`);
		continue;
	}

	const outcome = await waitForOutputs(t.ownerId, t.videoId);
	const ok = outcome === "complete";
	console.log(`${t.videoId}: ${outcome}`);
	ok ? done++ : failed++;
}
console.log(`
done: ${done}, failed: ${failed}`);

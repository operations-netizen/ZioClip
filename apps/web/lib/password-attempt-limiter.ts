import "server-only";

// In-process limiter for share-password guesses. The Vercel Firewall rule
// used elsewhere (lib/rate-limit.ts) fails open on self-hosted deploys, which
// left verifyVideoPassword an unthrottled brute-force oracle. This works on a
// single node; behind several instances each keeps its own counts, which still
// bounds guesses per instance.
const WINDOW_MS = 10 * 60 * 1000;
const PER_CLIENT_LIMIT = 10;
// Client IP headers are spoofable when the app is not behind a proxy that
// overwrites them, so every video also has an overall ceiling.
const PER_VIDEO_LIMIT = 50;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const hit = (key: string, limit: number, now: number) => {
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return false;
	}
	bucket.count += 1;
	return bucket.count > limit;
};

const prune = (now: number) => {
	if (buckets.size < 5000) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
};

export function clientAddress(headers: Headers) {
	return (
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip")?.trim() ||
		"unknown"
	);
}

/** Records a password attempt; true when it must be rejected. */
export function isPasswordAttemptLimited(
	videoId: string,
	client: string,
	now = Date.now(),
) {
	prune(now);
	const perClient = hit(`${videoId}:${client}`, PER_CLIENT_LIMIT, now);
	const perVideo = hit(`${videoId}:*`, PER_VIDEO_LIMIT, now);
	return perClient || perVideo;
}

export const PASSWORD_ATTEMPT_LIMITS = {
	windowMs: WINDOW_MS,
	perClient: PER_CLIENT_LIMIT,
	perVideo: PER_VIDEO_LIMIT,
};

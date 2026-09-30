import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const digest = (value: string) =>
	createHash("sha256").update(value, "utf8").digest();

/**
 * Checks `Authorization: Bearer $CRON_SECRET`. Returns the error response to
 * send, or null when the request is authorized.
 *
 * Both sides are hashed to fixed-length digests before the constant-time
 * compare: comparing raw strings would throw on a header whose UTF-8 byte
 * length differs from its `.length` (turning a bad header into a 500) and would
 * leak the secret's length through the length pre-check.
 */
export function rejectUnauthorizedCronRequest(
	request: Request,
): NextResponse | null {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		return NextResponse.json(
			{ error: "Server misconfiguration" },
			{ status: 500 },
		);
	}

	const authorization = request.headers.get("authorization");
	if (
		!authorization ||
		!timingSafeEqual(digest(authorization), digest(`Bearer ${cronSecret}`))
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

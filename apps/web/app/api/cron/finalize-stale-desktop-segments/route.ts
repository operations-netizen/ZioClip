import { NextResponse } from "next/server";
import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";
import { recoverStaleDesktopSegments } from "@/lib/desktop-segments-recovery";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const rejected = rejectUnauthorizedCronRequest(request);
	if (rejected) return rejected;

	const summary = await recoverStaleDesktopSegments();

	return NextResponse.json({
		success: true,
		...summary,
	});
}

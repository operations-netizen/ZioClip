import { NextResponse } from "next/server";
import { cleanupExpiredAgentApiRecords } from "@/lib/agent-api-cleanup";
import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const rejected = rejectUnauthorizedCronRequest(request);
	if (rejected) return rejected;

	const deleted = await cleanupExpiredAgentApiRecords();
	return NextResponse.json({ success: true, deleted });
}

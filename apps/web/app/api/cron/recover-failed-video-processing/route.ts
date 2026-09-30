import { NextResponse } from "next/server";
import { recoverAbandonedUploads } from "@/lib/abandoned-upload-recovery";
import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";
import { recoverInterruptedDeletes } from "@/lib/interrupted-delete-recovery";
import { recoverStalledVideoPipeline } from "@/lib/video-pipeline-recovery";
import { recoverFailedVideoProcessing } from "@/lib/video-processing-recovery";

export const dynamic = "force-dynamic";

const readDevMinutes = (request: Request, name: string) => {
	if (process.env.NODE_ENV !== "development") return null;
	const value = Number(new URL(request.url).searchParams.get(name));
	return Number.isFinite(value) && value > 0 ? value * 60 * 1000 : null;
};

export async function GET(request: Request) {
	const rejected = rejectUnauthorizedCronRequest(request);
	if (rejected) return rejected;

	const devStalledMinAgeMs = readDevMinutes(request, "stalledMinAgeMinutes");
	const devAbandonedMinIdleMs = readDevMinutes(
		request,
		"abandonedMinAgeMinutes",
	);

	const devDeletingMinAgeMs = readDevMinutes(request, "deletingMinAgeMinutes");

	const [summary, stalledPipeline, abandonedUploads, interruptedDeletes] =
		await Promise.all([
			recoverFailedVideoProcessing(),
			recoverStalledVideoPipeline(
				devStalledMinAgeMs ? { minAgeMs: devStalledMinAgeMs } : {},
			),
			recoverAbandonedUploads(
				devAbandonedMinIdleMs ? { minIdleMs: devAbandonedMinIdleMs } : {},
			),
			recoverInterruptedDeletes(
				devDeletingMinAgeMs ? { minAgeMs: devDeletingMinAgeMs } : {},
			),
		]);

	return NextResponse.json({
		success: true,
		...summary,
		stalledPipeline,
		abandonedUploads,
		interruptedDeletes,
	});
}

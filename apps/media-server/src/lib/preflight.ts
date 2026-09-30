import { which } from "bun";

export type MediaServerPreflight = {
	ready: boolean;
	webhookSecretConfigured: boolean;
	binaries: {
		ffmpeg: string | null;
		ffprobe: string | null;
	};
	issues: string[];
};

export function getMediaServerPreflight(): MediaServerPreflight {
	const webhookSecretConfigured = Boolean(
		process.env.MEDIA_SERVER_WEBHOOK_SECRET,
	);
	const ffmpeg = which("ffmpeg");
	const ffprobe = which("ffprobe");

	const issues: string[] = [];
	if (!webhookSecretConfigured) {
		issues.push(
			"MEDIA_SERVER_WEBHOOK_SECRET is not set; every authenticated request will be rejected",
		);
	}
	if (!ffmpeg) issues.push("ffmpeg executable not found on PATH");
	if (!ffprobe) issues.push("ffprobe executable not found on PATH");

	return {
		ready: issues.length === 0,
		webhookSecretConfigured,
		binaries: { ffmpeg, ffprobe },
		issues,
	};
}

export function logMediaServerPreflight(): void {
	const preflight = getMediaServerPreflight();
	console.log(
		`[media-server] ffmpeg: ${preflight.binaries.ffmpeg ?? "MISSING"}, ffprobe: ${preflight.binaries.ffprobe ?? "MISSING"}, webhook secret: ${preflight.webhookSecretConfigured ? "set" : "MISSING"}`,
	);
	for (const issue of preflight.issues) {
		console.error(`[media-server] CONFIG ERROR: ${issue}`);
	}
}

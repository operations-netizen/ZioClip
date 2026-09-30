const RECOVERY_PATH = "/api/cron/recover-failed-video-processing";
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_STALLED_MINUTES = 5;
const DEFAULT_ABANDONED_MINUTES = 10;

const webUrl = process.env.WEB_URL;
const cronSecret = process.env.CRON_SECRET;
const runOnce = process.argv.includes("--once");
const intervalSeconds =
	Number(process.env.DEV_RECOVERY_INTERVAL_SECONDS) || DEFAULT_INTERVAL_SECONDS;
const stalledMinAgeMinutes =
	Number(process.env.DEV_RECOVERY_STALLED_MINUTES) || DEFAULT_STALLED_MINUTES;
const abandonedMinAgeMinutes =
	Number(process.env.DEV_RECOVERY_ABANDONED_MINUTES) ||
	DEFAULT_ABANDONED_MINUTES;

function fail(message) {
	console.error(`[dev-recovery] ${message}`);
	process.exit(1);
}

if (process.env.NODE_ENV !== "development") {
	fail("Refusing to run: NODE_ENV must be development.");
}
if (!webUrl) fail("WEB_URL is not set.");
const { hostname } = new URL(webUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
	fail(`Refusing to run against non-local WEB_URL ${webUrl}.`);
}
if (!cronSecret) {
	fail("CRON_SECRET is not set in .env; the recovery route requires it.");
}

async function runRecovery() {
	const startedAt = new Date().toISOString();
	try {
		const url = new URL(RECOVERY_PATH, webUrl);
		url.searchParams.set("stalledMinAgeMinutes", String(stalledMinAgeMinutes));
		url.searchParams.set(
			"abandonedMinAgeMinutes",
			String(abandonedMinAgeMinutes),
		);
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${cronSecret}` },
		});
		const body = await response.text();
		if (!response.ok) {
			console.error(
				`[dev-recovery] ${startedAt} ${response.status} ${body.slice(0, 500)}`,
			);
			return false;
		}
		const summary = JSON.parse(body);
		const stalled = summary.stalledPipeline ?? {};
		const didWork =
			summary.checked > 0 ||
			(summary.abandonedUploads?.checked ?? 0) > 0 ||
			(summary.interruptedDeletes?.checked ?? 0) > 0 ||
			Object.values(stalled).some(
				(value) => typeof value === "object" && value?.checked > 0,
			);
		if (didWork || runOnce) {
			console.log(`[dev-recovery] ${startedAt} ${JSON.stringify(summary)}`);
		}
		return true;
	} catch (error) {
		console.error(
			`[dev-recovery] ${startedAt} request failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

if (runOnce) {
	process.exit((await runRecovery()) ? 0 : 1);
}

console.log(
	`[dev-recovery] Calling ${RECOVERY_PATH} every ${intervalSeconds}s against ${webUrl} (stalled jobs recovered after ${stalledMinAgeMinutes} min, abandoned uploads marked failed after ${abandonedMinAgeMinutes} min)`,
);
await runRecovery();
setInterval(runRecovery, intervalSeconds * 1000);

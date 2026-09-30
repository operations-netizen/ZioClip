import { describe, expect, it } from "vitest";
import { isPublicAssetPath } from "@/lib/public-asset-path";

describe("isPublicAssetPath", () => {
	it("lets static files from /public through the self-hosted redirect", () => {
		for (const path of [
			"/theme-script.js",
			"/gif.worker.js",
			"/brand/email-logo.png",
			"/brand/mark.svg",
			"/apple-touch-icon.png",
			"/site.webmanifest",
			"/fonts/Geist-Regular.woff2",
			"/sounds/start-recording.ogg",
			"/recording-end.mp3",
			"/og.png",
		]) {
			expect(isPublicAssetPath(path)).toBe(true);
		}
	});

	it("keeps app pages and extension-named routes on the existing rules", () => {
		for (const path of [
			"/",
			"/pricing",
			"/dashboard/caps",
			"/s/abc123",
			"/install-cli.sh",
			"/install-cli.ps1",
			"/install-cli.cmd",
			"/fonts/../dashboard.js",
		]) {
			expect(isPublicAssetPath(path)).toBe(false);
		}
	});
});

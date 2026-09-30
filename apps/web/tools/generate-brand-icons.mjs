/**
 * Regenerates every raster/brand asset from the shared product identity in
 * packages/utils/src/brand.ts (BRAND_MARK_SVG, BRAND_NAME, BRAND_COLOR):
 *
 *   public/favicon.ico, favicon-16x16.png, favicon-32x32.png,
 *   apple-touch-icon.png, android-chrome-192x192.png / -512x512.png,
 *   public/brand/mark.svg, public/brand/email-logo.png,
 *   public/site.webmanifest (name, short_name, theme_color),
 *   the <title> of public/safari-pinned-tab.svg (the mask shape itself is
 *   hand-drawn and left as is)
 *
 * Run after changing the name or the mark:
 *
 *   node apps/web/tools/generate-brand-icons.mjs
 *
 * Node >= 22.18 imports brand.ts directly (type stripping). The SVG is
 * rendered headlessly with Playwright's chromium (borrowed from the Chrome
 * extension's dev dependency); favicon.ico is written by
 * hand as a PNG-in-ICO container, which every current browser accepts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BRAND_ASSET_PATHS,
	BRAND_COLOR,
	BRAND_MARK_SVG,
	BRAND_NAME,
} from "../../../packages/utils/src/brand.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");
// The only Playwright install in the workspace is the Chrome extension's
// @playwright/test dev dependency; borrow it rather than add another.
const { chromium } = createRequire(
	resolve(HERE, "../../chrome-extension/package.json"),
)("@playwright/test");
const sized = (px) =>
	BRAND_MARK_SVG.replace("<svg ", `<svg width="${px}" height="${px}" `);
const page = (px) =>
	`<!doctype html><html><body style="margin:0">${sized(px)}</body></html>`;

const sizes = [
	[16, "favicon-16x16.png"],
	[32, "favicon-32x32.png"],
	[128, BRAND_ASSET_PATHS.emailLogo.slice(1)],
	[180, "apple-touch-icon.png"],
	[192, "android-chrome-192x192.png"],
	[512, "android-chrome-512x512.png"],
];

mkdirSync(`${PUBLIC}/brand`, { recursive: true });
writeFileSync(`${PUBLIC}${BRAND_ASSET_PATHS.markSvg}`, `${BRAND_MARK_SVG}\n`);
console.log(`wrote ${BRAND_ASSET_PATHS.markSvg.slice(1)}`);

const browser = await chromium.launch({ headless: true });
const png = {};
for (const [px, name] of sizes) {
	const tab = await browser.newPage({
		viewport: { width: px, height: px },
		deviceScaleFactor: 1,
	});
	await tab.setContent(page(px));
	const buf = await tab.screenshot({
		omitBackground: true,
		clip: { x: 0, y: 0, width: px, height: px },
	});
	writeFileSync(`${PUBLIC}/${name}`, buf);
	png[px] = buf;
	console.log(`wrote ${name} (${buf.length} bytes)`);
	await tab.close();
}
await browser.close();

// favicon.ico: ICO container wrapping the 32x32 PNG.
// 6-byte header + 16-byte directory entry + payload.
const p = png[32];
const ico = Buffer.alloc(6 + 16 + p.length);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // image count
ico.writeUInt8(32, 6); // width
ico.writeUInt8(32, 7); // height
ico.writeUInt8(0, 8); // palette
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // colour planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(p.length, 14); // payload size
ico.writeUInt32LE(22, 18); // payload offset
p.copy(ico, 22);
writeFileSync(`${PUBLIC}/favicon.ico`, ico);
console.log(`wrote favicon.ico (${ico.length} bytes)`);

const manifest = {
	name: BRAND_NAME,
	short_name: BRAND_NAME,
	icons: [
		{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
		{ src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
	],
	theme_color: BRAND_COLOR,
	background_color: "#ffffff",
	display: "standalone",
};
writeFileSync(
	`${PUBLIC}/site.webmanifest`,
	`${JSON.stringify(manifest, null, "\t")}\n`,
);
console.log(`wrote site.webmanifest (name "${BRAND_NAME}")`);

const pinnedTabPath = `${PUBLIC}/safari-pinned-tab.svg`;
const escapedName = BRAND_NAME.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pinnedTab = readFileSync(pinnedTabPath, "utf8").replace(
	/<title>[^<]*<\/title>/,
	`<title>${escapedName}</title>`,
);
writeFileSync(pinnedTabPath, pinnedTab);
console.log(`updated safari-pinned-tab.svg title ("${BRAND_NAME}")`);

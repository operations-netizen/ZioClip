/**
 * ============================================================================
 *  PRODUCT IDENTITY — the one place to change the name, colour and logo.
 * ============================================================================
 *
 * Read by the web app (apps/web/lib/branding.ts re-exports the name/tagline),
 * the share-image templates, the email templates, and the icon generator
 * (apps/web/tools/generate-brand-icons.mjs), so nothing else hard-codes them.
 *
 * To rebrand:
 *   1. Set the name/tagline here (or NEXT_PUBLIC_PRODUCT_NAME /
 *      NEXT_PUBLIC_PRODUCT_TAGLINE in .env).
 *   2. Replace BRAND_MARK_SVG with the final square mark (keep a square
 *      viewBox; it is shown on light and dark backgrounds, so it should carry
 *      its own background or read on both).
 *   3. Run `node apps/web/tools/generate-brand-icons.mjs` to regenerate the
 *      favicon, app icons, web manifest, public mark and email logo.
 *
 * Must stay dependency-free: the generator imports this file directly.
 */

export const BRAND_NAME: string =
	process.env.NEXT_PUBLIC_PRODUCT_NAME || "ZioClip";

export const BRAND_TAGLINE: string =
	process.env.NEXT_PUBLIC_PRODUCT_TAGLINE || "Record and share your screen.";

/** Primary brand colour (logo tile, email buttons, manifest theme). */
export const BRAND_COLOR = "#4785FF";

/** Square product mark. Placeholder until the final logo is supplied. */
export const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="9" fill="${BRAND_COLOR}"/><circle cx="20" cy="20" r="9" fill="#fff" opacity="0.35"/><circle cx="20" cy="20" r="5" fill="#fff"/></svg>`;

/** The mark as a data URL, for <img> in the app and in share images. */
export const BRAND_MARK_DATA_URL = `data:image/svg+xml;base64,${
	typeof btoa === "function"
		? btoa(BRAND_MARK_SVG)
		: Buffer.from(BRAND_MARK_SVG).toString("base64")
}`;

/** Files the generator writes under apps/web/public. */
export const BRAND_ASSET_PATHS = {
	markSvg: "/brand/mark.svg",
	emailLogo: "/brand/email-logo.png",
	favicon: "/favicon.ico",
	appleTouchIcon: "/apple-touch-icon.png",
} as const;

/** Absolute URL for an asset (emails can't use relative URLs). */
export const brandAssetUrl = (
	webUrl: string,
	path: (typeof BRAND_ASSET_PATHS)[keyof typeof BRAND_ASSET_PATHS],
) => `${webUrl.replace(/\/+$/, "")}${path}`;

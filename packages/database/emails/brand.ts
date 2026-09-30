import { buildEnv } from "@cap/env";
import { BRAND_ASSET_PATHS, BRAND_NAME, brandAssetUrl } from "@cap/utils";

/** Product name used in email copy (from packages/utils/src/brand.ts). */
export const EMAIL_BRAND_NAME = BRAND_NAME;

/**
 * Absolute URL of the generated email logo (a PNG: most mail clients don't
 * render SVG). Resolved at render time so templates can be imported without
 * a configured environment.
 */
export const emailLogoUrl = () =>
	brandAssetUrl(buildEnv.NEXT_PUBLIC_WEB_URL, BRAND_ASSET_PATHS.emailLogo);

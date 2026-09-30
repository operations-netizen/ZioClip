/**
 * Central branding + feature configuration.
 *
 * This is the ONE place to change the product name and toggle which parts of
 * the upstream Cap UI are shown. Nothing here touches the recording engine,
 * database, APIs or video processing — it only controls visible text and which
 * UI sections render.
 *
 * The name, colour and logo live in packages/utils/src/brand.ts; this file
 * re-exports the name and holds the feature flags.
 */

/**
 * Product name and tagline come from the shared identity in
 * packages/utils/src/brand.ts (also used by emails and share images). Override
 * with NEXT_PUBLIC_PRODUCT_NAME / NEXT_PUBLIC_PRODUCT_TAGLINE.
 */
export {
	BRAND_NAME as PRODUCT_NAME,
	BRAND_TAGLINE as PRODUCT_TAGLINE,
} from "@cap/utils";

/**
 * Name shown in any UI copyright line. Empty by default: this is a private
 * build, so no company attribution is displayed in the app chrome.
 *
 * NOTE: this does NOT affect licensing. Cap is AGPLv3, and the LICENSE file,
 * licenses/LICENSE-MIT and all in-source licence headers are left untouched.
 */
export const PRODUCT_COPYRIGHT_NAME =
	process.env.NEXT_PUBLIC_PRODUCT_COPYRIGHT_NAME || "";

const flag = (value: string | undefined, fallback: boolean) =>
	value === undefined ? fallback : value === "true";

/**
 * Team / multi-tenant UI. Off by default for personal use: hides the
 * organization switcher, member avatars, Spaces list and org settings nav.
 *
 * The underlying organization/space functionality is fully intact — every
 * user still has an organization behind the scenes, and all server code,
 * schema and APIs are unchanged. Set NEXT_PUBLIC_ENABLE_TEAMS=true to bring
 * the UI back.
 */
export const SHOW_TEAM_FEATURES = flag(
	process.env.NEXT_PUBLIC_ENABLE_TEAMS,
	false,
);

/**
 * Billing / upgrade promotion (plan usage meter, "Upgrade to Pro" prompts,
 * referral link). Off by default: a self-hosted personal build has nothing to
 * upsell. Billing code and Stripe integration are left in place.
 */
export const SHOW_BILLING_UI = flag(
	process.env.NEXT_PUBLIC_ENABLE_BILLING_UI,
	false,
);

/**
 * View counts and the Analytics section. Views come from Tinybird; without it
 * every count would read zero forever, so the UI hides them (and the Analytics
 * nav item and card links) rather than show numbers that can never be real.
 * Comment counts come from the database and stay visible regardless. Set
 * NEXT_PUBLIC_ENABLE_ANALYTICS=true once Tinybird is configured.
 */
export const SHOW_ANALYTICS = flag(
	process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
	false,
);

/**
 * Custom share domains. They are provisioned through Vercel's domains API
 * (VERCEL_AUTH_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID), which a self-hosted
 * build doesn't have, so the setup UI is hidden by default rather than offered
 * and left to fail. Set NEXT_PUBLIC_ENABLE_CUSTOM_DOMAINS=true when it is wired.
 */
export const SHOW_CUSTOM_DOMAINS = flag(
	process.env.NEXT_PUBLIC_ENABLE_CUSTOM_DOMAINS,
	false,
);

/**
 * Upstream Cap marketing, docs and legal pages (the `(site)` and `(docs)` route
 * groups: homepage, pricing, blog, download, terms, privacy, …). Off by
 * default: they describe Cap's hosted product, not this one, so every one of
 * those routes redirects into the app instead. The pages are not deleted; set
 * NEXT_PUBLIC_ENABLE_MARKETING_SITE=true to serve them again.
 */
export const SHOW_MARKETING_SITE = flag(
	process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE,
	false,
);

/**
 * Free-plan recording length cap (5 minutes, from
 * `Video.FREE_PLAN_MAX_RECORDING_SECONDS`). Off by default: a self-hosted
 * personal build has no plans to enforce, so recordings run as long as you like.
 *
 * Enforcement was only ever client-side - the recorder auto-stopped and showed
 * a countdown. Nothing server-side or on the share page limits duration, so
 * turning this off genuinely removes the cap.
 *
 * Set NEXT_PUBLIC_ENFORCE_RECORDING_LIMIT=true to restore the 5-minute cap for
 * non-Pro users.
 */
export const ENFORCE_RECORDING_LENGTH_LIMIT = flag(
	process.env.NEXT_PUBLIC_ENFORCE_RECORDING_LIMIT,
	false,
);

/**
 * The upstream five-step onboarding (organization setup, custom-domain and
 * team-seat upsells, desktop download) only makes sense with teams or billing
 * on. Otherwise onboarding is a single "what's your name" step, then straight
 * to My Recordings.
 */
export const SHOW_FULL_ONBOARDING = SHOW_TEAM_FEATURES || SHOW_BILLING_UI;

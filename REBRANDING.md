# Rebranding

This documents the branding layer applied on top of the upstream
[Cap](https://github.com/CapSoftware/Cap) codebase. It covers **visible text,
the logo, and which UI sections render** — nothing else. The recording engine,
database schema, APIs, video processing, storage and authentication logic are
untouched.

## 0. Where the identity lives now (Phase 5)

The product name, tagline, brand colour and logo mark are defined **once**, in
`packages/utils/src/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`, `BRAND_COLOR`,
`BRAND_MARK_SVG`). Everything reads from there:

- the web app (`apps/web/lib/branding.ts` re-exports the name/tagline as
  `PRODUCT_NAME` / `PRODUCT_TAGLINE`; `BrandMark` / `BrandLogo` draw the mark),
- share/OG images (`lib/og/template.tsx`),
- every email template (`packages/database/emails/brand.ts`), subjects and the
  self-hosted sender name,
- the icon generator.

To rebrand: edit `brand.ts` (or set `NEXT_PUBLIC_PRODUCT_NAME` /
`NEXT_PUBLIC_PRODUCT_TAGLINE`), replace `BRAND_MARK_SVG` with the final square
mark, then run `node apps/web/tools/generate-brand-icons.mjs`. That rewrites the
favicon, app icons, `site.webmanifest` (name + theme colour),
`public/brand/mark.svg` and the email logo `public/brand/email-logo.png`.
`apps/web/lib/branding.ts` still holds the feature flags described below.

## 1. Product name configuration

Everything branding-related lives in **one file**:

```
apps/web/lib/branding.ts
```

| Export | Default | Purpose |
| --- | --- | --- |
| `PRODUCT_NAME` | `ZioClip` | Name shown throughout the UI (set in `packages/utils/src/brand.ts`) |
| `PRODUCT_TAGLINE` | `Record and share your screen.` | Page metadata description |
| `PRODUCT_COPYRIGHT_NAME` | `""` (empty → hidden) | Optional copyright line in the sidebar |
| `SHOW_TEAM_FEATURES` | `false` | Organization switcher, member avatars, Spaces |
| `SHOW_BILLING_UI` | `false` | Plan usage meter, referral link |
| `ENFORCE_RECORDING_LENGTH_LIMIT` | `false` | The 5-minute free-plan recording cap |

### How to change the product name later

Either edit the default in `apps/web/lib/branding.ts`, or set env vars in
`.env` (no code change needed):

```ini
NEXT_PUBLIC_PRODUCT_NAME=Acme Recorder
NEXT_PUBLIC_PRODUCT_TAGLINE=Share your screen in seconds.
NEXT_PUBLIC_PRODUCT_COPYRIGHT_NAME=Acme Inc.
```

Then restart the dev server. `NEXT_PUBLIC_*` values are inlined at build time.

### Re-enabling hidden features

```ini
NEXT_PUBLIC_ENABLE_TEAMS=true            # organizations, spaces, member avatars
NEXT_PUBLIC_ENABLE_BILLING_UI=true       # usage meter, referral link
NEXT_PUBLIC_ENFORCE_RECORDING_LIMIT=true # restore the 5-minute recording cap
```

Nothing was deleted — organizations, spaces, members, invites and billing all
still exist server-side, with schema, RPCs and routes intact. Only the UI is
hidden. Every user still gets an organization on signup exactly as before.

### Recording length cap

Upstream Cap stops a non-Pro recording at 5 minutes
(`Video.FREE_PLAN_MAX_RECORDING_SECONDS`). That was enforced **only in the
browser client** - the recorder auto-stopped and the panel showed a countdown.
Nothing server-side, in the upload pipeline, or on the share page limits
duration, so disabling it genuinely removes the cap.

With `ENFORCE_RECORDING_LENGTH_LIMIT` off (the default here):

- no auto-stop, and
- the recorder timer counts **up** instead of down towards the cap.

The constant itself is untouched in `packages/web-domain/src/Video.ts`, so the
Chrome-extension endpoint that reports `maxRecordingSeconds` still behaves as
upstream expects.

## 2. Logo location

```
apps/web/components/BrandLogo.tsx
```

A placeholder mark (rounded blue square + record dot) plus the `PRODUCT_NAME`
wordmark. It is a drop-in replacement for `Logo` from `@cap/ui` and accepts the
same props the dashboard passed before (`hideLogoName`, `className`, …).

To use your own logo: replace the `<svg>` (keep the `0 0 40 40` viewBox), or
render `<img src="/your-logo.svg" />` from `apps/web/public`.

Used in: the sidebar, the recorder panel header, and the login page.
`@cap/ui`'s original `Logo` / `LogoBadge` are left in place so the upstream
marketing pages still build.

## 2b. Icons, favicon and social images

### Icons

Generated from the same mark as `BrandLogo.tsx` (blue rounded square + record
dot), so the browser tab, the installed-app icon and the in-app logo all match:

| File | Size | Purpose |
| --- | --- | --- |
| `public/favicon.ico` | 32x32 | Browser tab (PNG-in-ICO container) |
| `public/favicon-16x16.png` / `favicon-32x32.png` | 16 / 32 | Tab + bookmarks |
| `public/apple-touch-icon.png` | 180 | iOS home screen |
| `public/android-chrome-192x192.png` / `-512x512.png` | 192 / 512 | Android / PWA |
| `public/safari-pinned-tab.svg` | vector | Safari pinned-tab mask |
| `public/site.webmanifest` | - | `name`/`short_name` were **empty**; now set |

To regenerate after changing the mark, re-run the icon generator (renders the
SVG headlessly at each size and writes the ICO container by hand).

### Social / share images

`site.webmanifest` and the icon sizes are static files, so **a product rename
means regenerating these** - they don't read `PRODUCT_NAME`.

Everything else does read `PRODUCT_NAME`:

| File | Change |
| --- | --- |
| `lib/og/template.tsx` | `CapAppIcon` + `CapWordmark` now draw the brand mark + `PRODUCT_NAME` as text instead of the drawn "Cap" letters; the mock-window logo too. Removed the now-dead `WORDMARK_PATH` and `logoMark`. Export names kept - internal identifiers with three call sites. |
| `lib/og/video-og.tsx` | Share-link image: `cap.so` and "Watch on Cap.so" -> `PRODUCT_NAME`; "This Cap is private / password protected / doesn't exist" -> "This recording ...". |
| `app/api/og/route.tsx` | Default title/description from `PRODUCT_TAGLINE`; footer `Cap.so` -> `PRODUCT_NAME`. |
| `lib/og/url.ts`, `lib/share-video-metadata.ts` | `openGraph.siteName: "Cap"` -> `PRODUCT_NAME`. |

Verified by rendering both images: `/api/og` (brand) and
`/api/video/og?videoId=...` (share link) contain no Cap branding.

### Also fixed while here

`apps/web/proxy.ts` - the dev-auth bypass was redirecting **static assets**.
Only `favicon.ico` is excluded by the middleware matcher, so any client that
sends no `sec-fetch-dest` (curl, `fetch()`) got `favicon-32x32.png` and
`site.webmanifest` bounced into `/api/dev-auth` and back - an infinite redirect
loop. Paths ending in a file extension now skip the bypass.

## 3. Files changed

### New

| File | Purpose |
| --- | --- |
| `apps/web/lib/branding.ts` | Product name + feature flags |
| `apps/web/components/BrandLogo.tsx` | Replaceable logo |
| `REBRANDING.md` | This document |

### Modified — app shell / navigation

| File | Change |
| --- | --- |
| `dashboard/_components/Navbar/Items.tsx` | Nav labels; org switcher → static "My Workspace"; Spaces + member avatars gated; usage meter/referral gated; "Cap Software, Inc." line removed |
| `dashboard/_components/Navbar/Desktop.tsx` | Cap logo → `BrandLogo` |
| `dashboard/_components/Navbar/Top.tsx` | Page titles ("Caps" → "My Recordings", etc.) |
| `dashboard/_components/Navbar/DashboardSearch.tsx` | Search entries |
| `dashboard/_components/Navbar/CapAIBox.tsx`, `CapAIDialog.tsx` | "Cap AI" → "AI Features" |

### Modified — recordings & recorder

| File | Change |
| --- | --- |
| `dashboard/caps/Caps.tsx` | Toolbar → **New Recording** (primary) / Upload Media / New Folder |
| `dashboard/caps/page.tsx` | Metadata title |
| `dashboard/caps/components/EmptyCapState.tsx` | Copy + primary CTA |
| `dashboard/caps/components/UploadCapButton.tsx` | "Import Media" → "Upload Media" |
| `dashboard/caps/components/CapCard/CapCard.tsx` | Title fallback |
| `dashboard/caps/record/RecordVideoPage.tsx`, `record/page.tsx` | CTA + FAQ copy, title |
| `caps/components/web-recorder-dialog/web-recorder-dialog-header.tsx` | Cap wordmark → `BrandLogo` |
| `packages/web-backend/src/Videos/index.ts` | New recordings named `Screen Recording - <date>` |

### Modified — share, auth, metadata, analytics, settings

| File | Change |
| --- | --- |
| `app/layout.tsx` | Root metadata from `PRODUCT_NAME` / `PRODUCT_TAGLINE` |
| `app/(org)/login/form.tsx` | Logo + "Sign in to …" copy |
| `app/Layout/providers.tsx` | Dev-only devtools panel label |
| `lib/share-video-metadata.ts` | Share page OG title/description |
| `app/s/[videoId]/_components/*` | Title fallbacks, "Cap" → "recording" copy |
| `dashboard/analytics/components/*` | Display labels only (`"Caps"` → `"Recordings"`) |
| `dashboard/settings/**` | "Cap Pro" → "Pro", account copy, CLI card title |

Roughly 55 phrase-level replacements were applied across 23 further files for
terminology (`Caps` → `Recordings`, `Delete Cap` → `Delete Recording`, …), plus
19 page-metadata titles switched to `PRODUCT_NAME`.

## 4. Terminology mapping

| Before | After |
| --- | --- |
| Cap / Cap Software | ZioClip (`PRODUCT_NAME`) |
| My Caps | My Recordings |
| Caps | Recordings |
| Cap Recording - <date> | Screen Recording - <date> |
| Record a Cap | Record |
| Open Cap Desktop | New Recording (→ desktop recorder) |
| Add to Chrome | *removed from recording surfaces* |
| Cap Pro | Pro |
| Cap AI | AI Features |
| Import Media *(button)* | Upload Media |

## 5. What was NOT renamed (deliberately)

Renaming any of these would break the app, so they were left exactly as-is:

- **Package names**: `@cap/ui`, `@cap/database`, `@cap/web-backend`, …
- **Component/identifier names**: `CapCard`, `CapIcon`, `EmptyCapState`,
  `useDashboardContext`, `capId`, `userCapsCount`
- **Routes**: `/dashboard/caps`, `/dashboard/shared-caps`, `/api/desktop/*`
- **Analytics metric keys**: `caps` in chart configs, `metric="caps"`,
  `selectedMetrics` — these are data keys, not labels
- **Deep-link scheme**: `cap-desktop://` (registered by the desktop app)
- **S3 bucket / DB names**: `capso`, `planetscale`, all table and column names
- **Desktop app, CLI, Chrome extension and mobile app UI** — out of scope here

## 6. Cap branding intentionally retained

### Licence and legal — must not be removed

- `LICENSE` (AGPLv3) and `licenses/LICENSE-MIT` — untouched
- All in-source licence headers and copyright notices — untouched
- Cap remains AGPLv3. If you distribute this fork or make it available over a
  network, the AGPL obligations still apply, including offering the
  corresponding source. Rebranding the UI does not change that.

### Legal-entity references left verbatim

Two strings name **Cap Software, Inc.** as a contracting party. Rewriting them
would misrepresent a legal agreement, so they were left alone (both are in
unreachable, unconfigured billing/compliance UI for this build):

- `SignedBaaCard.tsx` — "Execute a HIPAA Business Associate Agreement with
  Cap Software, Inc."
- `SignedBaaCard.tsx` — "…every vendor in Cap's production infrastructure
  covered by a BAA."

### Marketing site not rebranded

`apps/web/app/(site)/**` and `apps/web/components/pages/**` (~150 files: blog,
pricing, testimonials, SEO landing pages) still carry Cap marketing copy. These
are **unreachable in normal use** — `/` redirects to `/dashboard/caps` for a
signed-in user, and the local dev auth bypass signs you in automatically. They
were left rather than half-rebranded. Delete or rewrite them when you decide on
the real public site. The Cap image assets still in `public/`
(`cap-logo.png`, `cap-icon.svg`, `cap-emoji-banner.png`, `cap-team-film.jpeg`,
`og.png`) and the `siteName: "Cap"` in each `app/(site)/(seo)/*/page.tsx`
belong to those pages and should go with them.

## 7. One-time data update

New recordings are named by `packages/web-backend/src/Videos/index.ts`. The 13
**existing** rows still said "Cap Recording", so their display names were
updated in place — a data-only `UPDATE`, no schema change:

```sql
UPDATE videos SET name = REPLACE(name, 'Cap Recording', 'Screen Recording')
WHERE name LIKE 'Cap Recording%';
```

## 8. Not changed

Per scope: no redesign, no colour-palette change, no AI, no payments, no new
recording features, no backend/schema/video-processing changes. The layout,
component structure and Cap colour tokens are all as they were.

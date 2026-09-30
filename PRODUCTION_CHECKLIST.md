# Production configuration checklist

Covers `apps/web`, `apps/media-server`, the database, object storage, auth,
workflows, recovery jobs and email for a self-hosted deployment (Phase 6
audit). Variable names only; never commit values. `NEXT_PUBLIC_*` values are
inlined into the browser bundle at **build** time, so set them before
`next build` and never put a secret behind that prefix.

## 0. Status (end of Phase 10)

Nothing below is marked done unless it was actually run. "Locally" means
Windows 11 with local MySQL 8, MinIO, the Bun media server and synthetic
screen / camera / microphone input.

### A. Code-complete

- Unfinished multipart uploads aborted on delete and by abandoned-upload
  recovery
- Processing retry backoff (20 s / 60 s / 180 s) with a "Retrying soon" state
- Recovery jobs never restart processing on a recording whose deletion is in
  progress (Phase 10)
- Email sign-in: 10-minute codes, at most 5 wrong codes per issued code
  (then the pending code is invalidated), and a sign-in fails visibly when
  Resend rejects the message instead of claiming a code was sent (Phase 10)
- Share passwords: in-process attempt limit for videos and collections
  (collections added in Phase 10)
- Production config startup check; dev login compiled out of production builds
- Security fixes: Axiom token out of source, desktop sign-in consent,
  analytics / domain-info authorization, constant-time secret compares,
  viewers cannot start AI work, Stripe log redaction, sanitised processing
  errors, media server http(s)-only inputs, public assets served in
  self-hosted production, upstream Loom downloader API disabled with the
  marketing site and no longer returns raw converter output (Phase 10)
- CI jobs: unit tests, media-server tests, clean production build + bundle scan

### B. Locally verified

- Chromium Screen, Camera, Screen + Camera: record, upload, processing, share
- Firefox Camera + Mic (Phase 6)
- Privacy matrix (public / password / private / download / thumbnails / delete)
- Upload cancellation, abandoned-upload recovery, retry backoff, permanent
  processing failure, recovery cron (dev and `next start` production build)
- Email sign-in limit through next-auth's real HTTP flow (Phase 10): five
  wrong codes rejected, the correct code then rejected, a fresh code signs in
- Recovery delete guard on MySQL (Phase 10, inside a rolled-back transaction):
  a marked upload is not claimed, an unmarked one is
- MinIO (Phase 10): anonymous object GET and bucket listing return 403,
  presigned GET works, a `..` object key is rejected (400 / 403)
- Every CI web job replicated locally (Phase 10): typecheck, recorder-core,
  web unit, media-server, Biome format check on LF copies of all changed
  files, clean placeholder-env production build and bundle secret scan
- No Axiom token literal in source or client bundles

### C. Requires staging infrastructure

- HTTPS on a real domain; secure cookies over HTTPS
- Real MySQL 8 (migrations 0043 and 0044 applied)
- Real S3 (or production MinIO): private bucket, CORS, lifecycle rule (section 2)
- `CRON_SECRET` set and the section 1 jobs scheduled against the deployed app
- Full regression from section 7 against staging

### D. Requires external account access

| Item | What is needed |
| --- | --- |
| Resend | Account, verified sending domain, `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`, a controlled test inbox. Real email delivery has never been exercised. |
| AWS S3 / IAM | Bucket + IAM user or role (`CAP_AWS_*`), CORS for the staging origin, the lifecycle rule |
| Axiom | Account access to revoke the ingest token that is still in git history (including the committed `HEAD` version of `infra/sst.config.ts`) |
| GitHub | Push a branch so the CI jobs run remotely; they have only been replicated locally |

### E. Requires physical hardware or another browser environment

- Safari: a real Mac with a current Safari (Windows WebKit is not Safari)
- Firefox Screen and Screen + Camera: a clean VM or spare machine whose screen
  shows only synthetic content (Firefox's picker shares the real monitor)
- Real-device A/V check (actual webcam and microphone) if the sync limitation
  in G is to be revisited

### F. Manual actions required before production

1. Revoke the Axiom ingest token in the Axiom account (not done; no access)
2. Configure Resend and send a real sign-in code to a test inbox
3. Set every variable in section 1 with `NODE_ENV=production`; confirm the
   server logs no `[config]` line at startup
4. Run the migrations (section 2a) before starting the new build
5. Apply the S3 lifecycle rule and confirm the bucket is private
6. Schedule the cron jobs with `CRON_SECRET`
7. Decide what to do with the Slack manifest unit test (see G)
8. Run section 7 against staging

### G. Known limitations accepted for now

- **Screen + Camera A/V sync.** MediaRecorder remains the production path.
  Screen + Camera recordings have a stable offset relative to Camera + Mic
  (processed file, Phase 9: Screen + Camera −13 to −44 ms, mean −27 ms over
  4 one-minute runs; −6 and −18 ms over two 5-minute runs; Camera + Mic
  +10 to +29 ms). Drift stays within about ±16 ms/min and does not grow
  over 5 minutes. Cause: Chrome's MediaStreamTrackGenerator accepts
  composited frames about every 15–27 ms and MediaRecorder timestamps them on
  acceptance. A WebCodecs encoder was prototyped in Phase 9 and **not
  integrated**: it lost up to 5 s of microphone audio in 5-minute runs and had
  unstable encode latency, with no 5-minute sync gain. No fixed delay is
  applied. Revisit only if real-device testing shows a user-visible problem.
- **Slack manifest unit test** (`slack-app-manifest.test.ts`) fails at the
  upstream `HEAD` too. Slack integration is not part of this product;
  decide whether to fix the manifest, skip the test, or remove the integration.
- **Windows-only media-server test failure**
  (`recording-verification.integration.test.ts`): ffmpeg's DASH muxer writes
  `init.mp4` to the working directory on Windows. Not expected on Linux CI.
- **Firefox and Safari** record without progressive upload and without the
  IndexedDB crash-recovery copy (section 6).
- **In-process limits** (share passwords, sign-in codes) are per instance;
  behind several instances each keeps its own count.
- **Deleting a recording while it is processing** can leave the objects the
  media server writes after the delete (private, unreachable, storage cost
  only). Recovery no longer restarts such recordings, but an in-flight job is
  not cancelled.
- **Recovery of permanent media-server misconfiguration** (for example a
  wrong `MEDIA_SERVER_URL` host) keeps retrying failed videos on each cron run
  (at most 20 per run); the startup `[config]` check and the dashboard error
  are the signals.
- **Password lockout trade-off.** Each video also has an overall ceiling
  (50 attempts / 10 min) because client IP headers can be spoofed without a
  proxy that overwrites them; enough bad guesses can lock out genuine viewers
  of that video for 10 minutes. Run behind a proxy that sets
  `X-Forwarded-For`. A space password shared by many videos gets one
  allowance per video (only relevant with `NEXT_PUBLIC_ENABLE_TEAMS=true`).
- **Email paths outside the web product** still use upstream Cap addresses
  and report success when Resend rejects them: desktop-app feedback and the
  mobile app's account-deletion / content-report notifications. Neither the
  desktop nor the mobile app is shipped with this product. The legal BAA email
  and the hidden desktop download email are intentionally unchanged.

## 1. Required

| Variable | Used by | Notes |
| --- | --- | --- |
| `NODE_ENV=production` | web, media-server | **Must be set explicitly.** Several protections (rate limits, secure cookies, dev-login, OTP console fallback, cron test overrides) switch on `NODE_ENV`; the root `.env` used locally sets `development`. `next build`/`next start` force production for the web bundle, but set it anyway. |
| `WEB_URL` | web | Public origin, e.g. `https://recordings.example.com`. Also becomes `NEXT_PUBLIC_WEB_URL`. |
| `NEXTAUTH_URL` | web (next-auth) | Same value as `WEB_URL`. Required by the schema. |
| `NEXTAUTH_SECRET` | web | Signs sessions, OG signatures, desktop tokens, mobile OTP hashes. 32+ random bytes. Rotating it signs everyone out. |
| `DATABASE_URL` | web, migrations | Must start with `mysql://`. |
| `DATABASE_ENCRYPTION_KEY` | web | Encrypts stored S3 / Slack / Drive credentials. Optional in the schema but required for storage integrations; keep it stable. |
| `CAP_AWS_BUCKET`, `CAP_AWS_REGION` | web | Object storage bucket and region. |
| `CAP_AWS_ACCESS_KEY`, `CAP_AWS_SECRET_KEY` | web | Unless using `VERCEL_AWS_ROLE_ARN` or ECS task credentials. |
| `S3_PUBLIC_ENDPOINT`, `S3_INTERNAL_ENDPOINT` | web | For MinIO / non-AWS S3 (`CAP_AWS_ENDPOINT` is a fallback alias). Leave unset for AWS. `S3_PATH_STYLE` defaults to `true`. |
| `MEDIA_SERVER_URL` | web | Processing throws without it. |
| `MEDIA_SERVER_WEBHOOK_SECRET` | web **and** media-server | Same value on both. The media server rejects every call without it; the web app rejects media-server webhooks without it. |
| `CRON_SECRET` | web | Bearer secret for `/api/cron/*`. Without it those routes return 500. |
| `RESEND_API_KEY`, `RESEND_FROM_DOMAIN` | web | Required for email sign-in. Without them email sign-in now **fails** in production (it no longer prints codes to the log). Sender is `<Product name> <auth@RESEND_FROM_DOMAIN>`: set a bare domain (no `@`, no scheme) that is verified in Resend. If Resend rejects the message, the sign-in fails and the server logs `[auth] The sign-in email was not accepted by Resend (<error name>)`. |

### Scheduled jobs (call with `Authorization: Bearer $CRON_SECRET`)

| Route | Suggested schedule | Purpose |
| --- | --- | --- |
| `/api/cron/recover-failed-video-processing` | every 15 min (`apps/web/vercel.json`: minutes 7, 22, 37, 52) | Failed processing (up to 20 per run), stalled pipelines (1 h idle), abandoned uploads (2 h idle, 50 per run), interrupted deletions (15 min stale, 25 per run) |
| `/api/cron/finalize-stale-desktop-segments` | every 15 min | Desktop app only |
| `/api/cron/cleanup-agent-api` | daily (03:17) | Housekeeping |
| `/api/cron/developer-storage` | daily (not in `vercel.json`; schedule it yourself if the developer API is used) | Housekeeping; safe to run twice |

Every route rejects requests without the bearer secret (constant-time
compare) and returns 500 if `CRON_SECRET` is unset. Each recovery claims a
row with a conditional update before acting, so overlapping runs do not
double-start work. Outside Vercel, call them from any scheduler, for example
`curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/recover-failed-video-processing`.

## 2. Storage hardening

- **Bucket must be private.** All reads go through presigned URLs (1 h expiry).
  The web app now creates a missing bucket private; an existing bucket keeps
  its policy, so check it (`mc anonymous get <alias>/<bucket>` should be
  `private`, AWS: Block Public Access on).
- **Unfinished multipart uploads.** The app aborts a recording's unfinished
  multipart upload when the recording is deleted and when abandoned-upload
  recovery marks it failed (scoped to that recording's keys only; retried by
  the recovery jobs if the abort fails). Keep a provider-side rule as a second
  safety net: MinIO clears them after 24 h by default
  (`api stale_uploads_expiry=24h`); on AWS S3 add a lifecycle rule
  `AbortIncompleteMultipartUpload` with `DaysAfterInitiation: 1`:

  ```json
  { "Rules": [{ "ID": "abort-unfinished-uploads", "Status": "Enabled",
      "Filter": {}, "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } }] }
  ```

  (`aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://lifecycle.json`)
  This rule is the only lifecycle rule required. Do **not** add an
  `Expiration` rule: recordings, processed files, thumbnails and preview GIFs
  are kept until the owner deletes them. Uploads still in progress after 24 h
  would be aborted by the rule.
- CORS on the bucket must allow `PUT` from `WEB_URL` (browser uploads parts
  directly) and expose `ETag`.
- **Deletion scope.** Every object of a recording lives under
  `<ownerId>/<videoId>/` (raw upload, `result.mp4`, segments,
  `screenshot/screen-capture.jpg`, `preview/animated-preview.gif`,
  transcripts, HLS, comment media). Deleting a recording lists and deletes that
  whole prefix, so processed files, thumbnails and GIFs go with it. Interrupted
  deletions are finished by the recovery cron.
- **Path isolation.** Upload keys are built from the signed-in user's id and
  an owned video id; `..`, leading `/` and empty segments are rejected.
- **Verified locally on MinIO (Phase 10):** anonymous object GET and bucket
  listing return 403, presigned GET returns 200, and a presigned `..` key is
  rejected (400 raw path, 403 normalised). Repeat against the staging bucket.

## 2a. Database migrations

Run the Drizzle migrations before starting a new build
(`packages/database/migrate.ts`, or `NEXT_PUBLIC_DOCKER_BUILD=true`, which
migrates on start). Added by this fork:

| Migration | Change |
| --- | --- |
| `0043_busy_blue_shield` | `video_uploads.processing_attempt` (processing attempt number) |
| `0044_tough_swordsman` | `video_uploads.processing_last_attempt_at`, `video_uploads.processing_next_retry_at` (processing retry backoff) |

Both only add nullable columns; existing rows need no backfill.

## 2b. Behaviour worth knowing in production

- **Processing retries.** When the media server is unreachable or answers
  502/503/504, processing waits 20 s, 60 s and then 180 s between its four
  attempts (about four minutes in total). The dashboard shows
  "Retrying soon (attempt N of 4)" meanwhile. Other failures keep the quick
  bounded retry. If all attempts fail because of an outage, the scheduled
  recovery job restarts processing on its next run.
- **Media server inputs.** Every media-server route accepts only `http`/`https`
  URLs; `file://` is rejected outside `bun test`.
- **Desktop app sign-in.** `/api/desktop/session/request` shows a consent page;
  the credential is only issued after the signed-in user confirms (same-origin
  POST with a short-lived signed state). Only relevant if the desktop app is
  used.

## 3. Optional

| Group | Variables |
| --- | --- |
| Branding | `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_PRODUCT_TAGLINE`, `NEXT_PUBLIC_PRODUCT_COPYRIGHT_NAME` (build time); name, colour and logo defaults live in `packages/utils/src/brand.ts` |
| Feature flags (off unless `"true"`) | `NEXT_PUBLIC_ENABLE_TEAMS`, `NEXT_PUBLIC_ENABLE_BILLING_UI`, `NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_ENABLE_CUSTOM_DOMAINS`, `NEXT_PUBLIC_ENABLE_MARKETING_SITE`, `NEXT_PUBLIC_ENFORCE_RECORDING_LIMIT` |
| Sign-in providers | `GOOGLE_CLIENT_ID`/`_SECRET`, `APPLE_CLIENT_ID`/`_SECRET`, `WORKOS_CLIENT_ID`/`WORKOS_API_KEY`; `CAP_ALLOWED_SIGNUP_DOMAINS` restricts sign-up (open when unset) |
| Workflows | `WORKFLOWS_RPC_SECRET`, `WORKFLOWS_RPC_URL` (defaults to `http://127.0.0.1:42169`; inert without the secret) |
| Media server | `PORT` (3456), `MEDIA_SERVER_WEBHOOK_URL` (defaults to `WEB_URL`), `MEDIA_SERVER_MAX_CONCURRENT_VIDEO_PROCESSES`, `MEDIA_SERVER_MAX_CONCURRENT_DIRECT_CONVERSIONS`, `MEDIA_SERVER_MEMORY_LIMIT_MB`, `FFMPEG_PATH` |
| Storage extras | `CAP_AWS_BUCKET_URL` + `CAP_CLOUDFRONT_DISTRIBUTION_ID` + `CLOUDFRONT_KEYPAIR_ID` + `CLOUDFRONT_KEYPAIR_PRIVATE_KEY` (all four), `VERCEL_AWS_ROLE_ARN` |
| AI / transcription | `ASSEMBLY_API_KEY` (transcripts), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`, `REPLICATE_API_TOKEN` |
| Analytics | `TINYBIRD_HOST`/`TINYBIRD_TOKEN` (then set `NEXT_PUBLIC_ENABLE_ANALYTICS=true`), `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`/`_API_URL`, `OPENPANEL_CLIENT_SECRET`, `AXIOM_TOKEN`/`AXIOM_DATASET` (server-only OpenTelemetry export; the old `NEXT_PUBLIC_AXIOM_TOKEN` is ignored and logs a warning) |
| Integrations | Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`; Google Drive: `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`; custom domains: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTH_TOKEN` |
| Billing (hidden by default) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SAML_SSO_PRICE_ID` |
| Misc | `CAP_VIDEOS_DEFAULT_PUBLIC` (default `true`), `CAP_CHROME_EXTENSION_ID`, `DISCORD_LOGS_WEBHOOK_URL`, `DUB_API_KEY`, `NEXT_PUBLIC_DOCKER_BUILD` (standalone output + auto-migrations) |

## 4. Development only — must be unset (or irrelevant) in production

| Variable / tool | Why it is safe |
| --- | --- |
| `CAP_DEV_AUTH_BYPASS`, `CAP_DEV_SERVER_HOST` | `/api/dev-auth` requires `NODE_ENV=development`; in a production build that check is compiled to a constant and the route always returns 404 (verified against `next start` with both variables set). |
| `DEV_RECOVERY_*`, `apps/web/tools/dev-recovery.mjs` | The tool refuses to run unless `NODE_ENV=development` and `WEB_URL` is loopback. |
| Cron `?stalledMinAgeMinutes` / `?abandonedMinAgeMinutes` / `?deletingMinAgeMinutes` | Only honoured in development, and still behind `CRON_SECRET`. |
| `/api/dev-reset-transcript`, devtools panel, `promoteToPro` / `restartOnboarding` | Gated on `NODE_ENV=development`. |
| `AWS_DEFAULT_PROFILE` | SSO-profile credentials only used in development. |
| `CAP_*_E2E*`, `CAP_SSO_TEST_DATABASE_URL` | Test suites only. |
| `VITE_SERVER_URL` | Desktop app only. |
| `apps/web/tools/backfill-thumbnails.mjs` | Manual tool; hard-codes a local `.env` path and `127.0.0.1:3456`. Do not run against production as-is. |

## 5. Deprecated / unused

- Declared but never read: `DISCORD_FEEDBACK_WEBHOOK_URL`. `NEXTAUTH_URL` is
  only consumed by next-auth itself.
- `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` / `VERCEL_AUTH_TOKEN` are read via raw
  `process.env`, not the validated schema.
- `docker-compose.coolify.env.example` lists `S3_BUCKET`; the app reads
  `CAP_AWS_BUCKET`.
- The media server has no env schema; missing values fail at request time.

## 6. Known production caveats

- **Rate limiting** in `lib/rate-limit.ts` relies on Vercel Firewall rules and
  fails open elsewhere. Video and collection share passwords also have an
  in-process limit (10 attempts / 10 min per client and video or collection,
  50 per video or collection). Email sign-in codes allow 5 wrong entries per
  address in 10 minutes; the 5th invalidates the pending code, so the user
  requests a new one.
- **Firefox/Safari** record without progressive upload (record, then upload
  after Stop) and without the IndexedDB crash-recovery copy. Verified:
  Chrome/Edge (all modes), Firefox camera + microphone. Not verified: Firefox
  screen modes, Safari.
- **Axiom token.** An Axiom ingest token was committed in
  `infra/sst.config.ts` upstream. It has been removed from the source and is
  now an SST secret (`sst secret set AXIOM_API_TOKEN ...`), but it remains in
  git history: revoke it in the Axiom account.
- **Startup configuration check.** In production the server logs one
  `[config] ...` line per missing required variable (section 1) or leftover
  development setting (`CAP_DEV_AUTH_BYPASS`, `CAP_DEV_SERVER_HOST`, a
  loopback `WEB_URL`, `NEXT_PUBLIC_AXIOM_TOKEN`). Names only, never values.
  It logs rather than refusing to start; treat any `[config]` line as a
  deployment error.
- **AI work** (transcripts, summaries) is queued when processing completes. The
  share page, embed page and status polling only start it as a fallback, and
  only for the owner's own views, so viewers cannot trigger paid AI work.
- **Stripe webhook** logs customer IDs only (no emails or metadata values).
- **Processing errors** shown in the UI are sanitised: internal text (workflow
  step names, ffmpeg output, server paths) is replaced with a plain message;
  the full error stays in `video_uploads.processing_error` for operators.

## 7. Staging deployment (not yet performed)

No staging environment was available while preparing this fork, so none of
the following has been exercised against real infrastructure. Use a separate
database, bucket and domain; never point staging at production data.

1. **Infrastructure:** an HTTPS domain (for example `staging.example.com`);
   MySQL 8 database; private S3 bucket with the lifecycle rule above and CORS
   for `https://staging.example.com`; the media server reachable from the web
   app (not publicly); Resend with a verified sending domain.
2. **Configuration:** everything in section 1, with `WEB_URL`/`NEXTAUTH_URL`
   set to the staging origin and `NODE_ENV=production`. Leave every variable
   in section 4 unset.
3. **Deploy:** run the migrations (section 2a), build with a clean cache, start
   the web app and media server, then schedule the jobs in section 1.
4. **Verify, with disposable recordings and a controlled test inbox:**
   email code sign-in, sign out, expired and revoked sessions; record, upload,
   processing, share (public, private, password), download, delete;
   interrupted-delete recovery, abandoned-upload cancellation, processing
   retry with the media server briefly stopped; direct bucket access denied;
   five wrong sign-in codes invalidate the pending code; `/api/dev-auth` and
   `/api/tools/loom-download` return 404; `node scripts/check-client-bundle-secrets.mjs`
   passes against the deployed build's `.next/static`.

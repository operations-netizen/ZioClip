# Cap — Local Development Setup (Windows)

Web app: <http://localhost:3001> (bound to `127.0.0.1` only — see §8).
Port 3000 is used by another local project on this machine.

This records how this machine runs Cap locally without Docker.

## 1. Why this deviates from `docker compose`

The repo's documented path (`CONTRIBUTING.md`) uses Docker for MySQL + MinIO.
Docker Desktop and WSL2 are not installed (both need Administrator rights and a
reboot). `pnpm env-setup` supports a non-Docker path, so the backing services run
as native Windows processes on the same ports and credentials as
`packages/local-docker/docker-compose.yml`.

## 2. Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24.15.0 | repo requires >= 20 |
| pnpm | 10.5.2 | store: `D:\coding tools\.pnpm-store` |
| Bun | 1.4.0 | runs `apps/media-server` |
| ffmpeg / ffprobe | 8.1.1 | `winget install Gyan.FFmpeg.Essentials`; must be on PATH |
| MySQL | 8.0.28 | portable zip |
| MinIO | 2025-09-07 | single binary |
| Rust | not installed | only needed for `apps/desktop` |

If the repo folder is moved, pnpm's `node_modules` junctions still point at the
old path and every package fails to resolve. Relink with:

```powershell
pnpm install --store-dir "D:/coding tools/.pnpm-store" --config.confirmModulesPurge=false --frozen-lockfile
```

## 3. Backing services

Scripts and data live in `D:\coding tools\cap-devservices\` (outside the repo,
next to it). Paths are derived from the script location and the sibling
`cap.so` repo.

| Service | Port | Credentials | Compose equivalent |
| --- | --- | --- | --- |
| MySQL | 3306 | `root`, empty password, db `planetscale`, **UTC** (`--default-time-zone=+00:00`) | `ps-mysql` |
| MinIO | 9000 API, 9001 console | `capS3root` / `capS3root`, bucket `capso` | `minio` + `createbuckets` |
| media-server | 3456 | loads the repo `.env` via `bun --env-file` | `cap-media-server` |

```powershell
& "D:\coding tools\cap-devservices\start-services.ps1"
& "D:\coding tools\cap-devservices\stop-services.ps1"
```

Each service runs as a per-user Task Scheduler task (`CapDev-mysql`,
`CapDev-minio`, `CapDev-media-server`). Earlier versions spawned them through
WMI; those processes died together whenever Windows unloaded the idle
`WmiPrvSE.exe` host, which silently broke uploads and processing.

MySQL must run in UTC like the Docker image: Drizzle reads timestamps as UTC,
so an IST server made new rows appear 5.5 hours in the future and broke the
stalled-processing detection that compares `updated_at` with the current time.

### media-server configuration

`apps/media-server` needs `MEDIA_SERVER_WEBHOOK_SECRET` (same value as the web
app) and `ffmpeg`/`ffprobe` on PATH. Bun does not load the repo-root `.env` by
itself, so use:

```powershell
pnpm --filter @cap/media-server start:env   # or dev:env for --watch
```

On startup it logs the resolved ffmpeg/ffprobe paths and whether the secret is
set; `GET http://localhost:3456/health` reports the same under `preflight`
(`ready: false` plus `issues` when something is missing).

## 4. Environment variables

`.env` (repo root, gitignored). Secrets are random per machine.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `development` |
| `WEB_URL` / `NEXTAUTH_URL` / `NEXT_PUBLIC_WEB_URL` / `VITE_SERVER_URL` | `http://localhost:3001` |
| `DATABASE_URL` | `mysql://root:@localhost:3306/planetscale` |
| `CAP_AWS_ACCESS_KEY` / `CAP_AWS_SECRET_KEY` | `capS3root` / `capS3root` |
| `CAP_AWS_BUCKET` / `CAP_AWS_REGION` / `CAP_AWS_ENDPOINT` | `capso` / `us-east-1` / `http://localhost:9000` |
| `MEDIA_SERVER_URL` | `http://localhost:3456` |
| `CAP_DEV_AUTH_BYPASS` | `true` (see §8) |
| `CRON_SECRET` | generated; used by `dev:recovery` (§7) |
| `NEXTAUTH_SECRET`, `DATABASE_ENCRYPTION_KEY`, `WORKFLOWS_RPC_SECRET`, `MEDIA_SERVER_WEBHOOK_SECRET` | generated |

`RESEND_API_KEY` is unset, so email login codes print to the web dev console.

## 5. Running the web app

```powershell
cd "D:\coding tools\cap.so\apps\web"
pnpm run dev:loopback --port 3001   # binds 127.0.0.1 only; enables the dev login button
# or: pnpm run dev --port 3001      # all interfaces; dev login disabled
```

Changes under `apps/web/workflows/` are not hot-reloaded into the running
workflow runtime. Restart the dev server after editing a workflow.

## 6. Pipeline verified end to end (2026-09-24)

Real Chromium recording through **Record in Browser** (Playwright with fake
capture devices):

- `VideoInstantCreate` → multipart initiate → part PUT to MinIO (ETag exposed)
  → complete → processing workflow → media-server webhooks
  (downloading → probing → processing → uploading → generating_thumbnail →
  complete) → `result.mp4` (H.264 1920x1080), `screenshot/screen-capture.jpg`,
  `preview/animated-preview.gif`; raw upload deleted; `video_uploads` row removed.
- Corrupted upload: 4 processing attempts (1 + 3 retries), UI shows
  "Retrying (attempt N of 4)", then a permanent "Processing failed … (failed
  after 4 attempts)" with a retry button.
- Stuck job (processing at 0%, 10 min old) recovered by `dev:recovery` and
  completed.

## 7. Local stuck-job recovery

Production recovers failed/stalled processing through the Vercel cron
`/api/cron/recover-failed-video-processing`, which never runs locally. Run:

```powershell
cd "D:\coding tools\cap.so\apps\web"
pnpm run dev:recovery          # every 60 s
pnpm run dev:recovery --once   # single pass
```

It calls the same cron route with `CRON_SECRET`, refuses to run unless
`NODE_ENV=development` and `WEB_URL` is local, and in development asks the route
to treat never-started jobs as stalled after 5 minutes instead of 1 hour
(`DEV_RECOVERY_STALLED_MINUTES`, `DEV_RECOVERY_INTERVAL_SECONDS`). A job that
dies mid-encode is not auto-recovered (same as production); use **Retry
processing** on the share page once it has been stale for 10 minutes.

The same cron also marks **abandoned uploads** failed
(`apps/web/lib/abandoned-upload-recovery.ts`): web recordings still in
`uploading`, with no raw file and no update for 2 hours in production (10
minutes locally via `dev:recovery`, `DEV_RECOVERY_ABANDONED_MINUTES`). Live
browser recordings heartbeat their upload row every 30 s
(`InstantRecordingUploader`), so they are never picked up. The row is marked
`error` ("Recording upload was interrupted"), never deleted; the browser's
local crash-recovery copy is unaffected and the dashboard shows "Upload failed".

### MinIO bucket is private

Upstream's docker-compose makes `capso/*` anonymously readable. That lets anyone
who knows an object key read private or password-protected recordings straight
from MinIO, so `start-services.ps1` now runs `mc anonymous set none capl/capso`
on every start. The app only uses presigned URLs (playback, thumbnails, GIF
previews, downloads, uploads, media-server), all verified working with the
private bucket. To inspect the bucket use the console at
<http://localhost:9001> or `mc` with the root credentials.

### End-to-end test harness

Browser-driven pipeline tests (Playwright + DB + MinIO + FFmpeg checks) live
outside the repo in `D:\coding tools\cap-devservices\e2e\` (`pw-case.mjs`,
`pw-access.mjs`, `pw-crash.mjs`, `pw-toast.mjs`, `picker-uia.ps1`, `verify.mjs`;
output in `e2e\out\`). `picker-uia.ps1` drives Chrome's real "Choose what to
share" dialog through Windows UI Automation, which is the only way to test
full-screen system audio (Chrome's auto-select flags never grant it).

## 8. Development login (LOCAL ONLY)

The email-OTP login works normally (code in the console). For convenience the
login page shows **"Local development: continue as dev@localhost"** when all of
these hold:

- `NODE_ENV === "development"` (compiled to `"production"` in `next build`, so a
  production build can never enable it),
- `CAP_DEV_AUTH_BYPASS=true`,
- the server was started with `dev:loopback` (listens on `127.0.0.1` only, so
  other devices cannot reach it; Host/X-Forwarded-For headers are spoofable and
  are not relied on for this),
- `WEB_URL` is a loopback URL.

The button POSTs to `/api/dev-auth`, which also requires a same-origin `Origin`
header and a loopback `Host`, then issues a normal NextAuth session for
`dev@localhost`. There is no automatic redirect: signing out returns you to
`/login` and stays signed out. The guard lives in `apps/web/lib/dev-auth.ts`;
the route file exports only `POST` and `dynamic`.

## 9. Known local gaps

- Desktop app not built (needs Rust, LLVM, VCPKG).
- Session cookies are `secure; sameSite=none`; browsers accept them on
  `http://localhost`, non-browser clients need to keep them manually.
- Emails, transcription/AI (AssemblyAI), Stripe and Tinybird views are
  unconfigured. View counts are always 0 without Tinybird.
- `apps/web/tools/backfill-thumbnails.mjs` hardcodes `D:/cap.so/.env` and writes
  outputs without updating the database; recordings it touched still show as
  failed until reprocessed.
- 45 of 204 media-server tests fail on this Windows machine, identically with or
  without the local changes: integration tests that pass `file://C:\...`
  fixture paths (the media-server's file-URL helpers are POSIX-only; production
  never passes file URLs and runs on Linux) plus capacity/memory tests that
  depend on host load.
- Audio devices on this machine: the built-in "Microphone Array" records pure
  silence at the OS level (also outside the browser); use the USB headset mic.
  The integrated webcam delivers a uniformly dark image (shutter/cover).

---

# Desktop-First Recording Flow

> **Superseded (Phase 4/5).** The web app is now browser-first: every "New
> Recording" button opens the in-browser recorder, and the `useOpenDesktopApp`
> hook described below was removed as unused. The desktop app's API routes
> (`/api/desktop/*`) and deep-link handling are unchanged, so the notes below
> still describe how the desktop app itself behaves if you install it.

The recording surfaces now lead with the **real Cap desktop app** instead of the
Chrome extension. The desktop recorder itself was **not modified**.

## How it works

1. The user clicks **Start Recording** (web).
2. `useOpenDesktopApp` navigates to `cap-desktop://` — the deep-link scheme
   registered by the Tauri deep-link plugin
   (`apps/desktop/src-tauri/tauri.conf.json` → `plugins.deep-link.desktop.schemes`).
3. Windows hands the URL to the installed app, which starts/focuses and shows
   its own recorder window (`apps/desktop/src/routes/(window-chrome)/new-main`).
4. The desktop app owns the rest, unchanged:

   | Step | Where it lives |
   | --- | --- |
   | Screen / window / area selection | `routes/target-select-overlay.tsx`, `crates/recording/.../screen_capture` |
   | Camera, microphone, system audio toggles | `new-main` + `crates/camera*`, `crates/audio` |
   | Timer / control bar | `routes/in-progress-recording.tsx` |
   | Encoding + save | `crates/recording`, `crates/export` |
   | Editor (Studio mode) | `routes/editor` |
   | Upload + share link | `apps/web/app/api/desktop/[...route]/video.ts` |

5. **Install detection**: browsers cannot query protocol handlers, so the hook
   watches for the tab losing focus/visibility. If neither happens within 2.5s
   nothing handled the URL, and a **Download Desktop App** button appears in
   place (it no longer silently navigates to `/download`).

## How recordings associate with the current user

The desktop app opens a loopback port and sends the browser to
`/api/desktop/session/request?port=…&type=session|api_key`
(`apps/web/app/api/desktop/[...route]/session.ts`). That route reads the
browser's `next-auth.session-token` and posts the token (or a new
`auth_api_keys` row) back to the loopback URL. Because the local dev auth bypass
already establishes a session, this completes with no login prompt and
recordings are owned by `dev@localhost`.

## Deep-link actions (already supported, unchanged)

`apps/desktop/src-tauri/src/deeplink_actions.rs` also accepts
`cap-desktop://action?value={…}` for `start_recording`, `stop_recording`,
`open_editor` and `open_settings`. `start_recording` requires an exact display
or window **name**, which the web app cannot enumerate, so the UI launches the
app's own picker instead of guessing a target.

## Testing the desktop flow on this machine

The desktop app **cannot be built here**. Rust 1.88.0 is now installed, but:

```
error: linker `link.exe` not found
note: the msvc targets depend on the msvc linker but `link.exe` was not found
```

There is no Visual Studio, MSVC toolchain or Windows SDK on this machine, and
installing Build Tools for Visual Studio (plus LLVM/clang and VCPKG, per
`CONTRIBUTING.md`) requires **Administrator rights** and several GB.

**You do not need to build it.** The released Windows app registers the same
`cap-desktop://` scheme (`tauri.prod.conf.json` only overrides `updater`, so the
base `deep-link` config applies), so to test the flow end to end:

1. Install Cap for Windows from <https://cap.so/download>.
2. In the app: **Settings → Cap Server URL** → `http://localhost:3000`.
3. Sign in (the dev bypass makes this immediate).
4. Click **Start Recording** in the web dashboard.

To build from source instead, install Build Tools for Visual Studio with the
"Desktop development with C++" workload, then LLVM and VCPKG, and run
`pnpm dev:desktop`.

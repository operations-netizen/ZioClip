import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// The desktop app supplies `port` from tauri-plugin-oauth's local callback
// server, which is always a numeric loopback port. Constraining it to an integer
// port is what keeps the redirect target locked to 127.0.0.1: an unconstrained
// string such as `x@evil.example` would be parsed as a URL authority and would
// redirect the browser — with the session token / API key in the query string —
// to an attacker-controlled host.
export const desktopSessionRequestQuerySchema = z.object({
	port: z.coerce.number().int().min(1).max(65535).optional(),
	platform: z.union([z.literal("web"), z.literal("desktop")]).default("web"),
	type: z
		.union([z.literal("session"), z.literal("api_key")])
		.default("session"),
});

// Builds the desktop callback URL. The host is a fixed literal and only the
// `port`/`search` setters are used, so the target is provably loopback: a
// malformed port can only ever be dropped or truncated to digits, never promoted
// to a different host. This is the second line of defence behind the schema, so
// a future loosening of `port` validation cannot silently re-open the redirect.
export function buildLoopbackCallbackUrl(
	port: number,
	params: URLSearchParams,
) {
	const url = new URL("http://127.0.0.1");
	url.port = String(port);
	url.search = params.toString();
	return url.toString();
}

export function escapeHtmlAttribute(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function serializeStateForScript(value: unknown) {
	// Escape characters that could break out of an inline <script> (or split the
	// script via U+2028/U+2029) into their \uXXXX JSON form. `port` is validated
	// to be numeric, so these values are server-generated today; this keeps the
	// template from ever becoming an XSS sink if an upstream value changes.
	return (JSON.stringify(value) ?? "null").replace(
		/[<>&\u2028\u2029]/g,
		(ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

export function createDesktopRedirectPage(
	primaryUrl: string,
	fallbackUrl: string,
) {
	const state = serializeStateForScript({ primaryUrl, fallbackUrl });
	const fallbackHref = escapeHtmlAttribute(fallbackUrl);

	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
		<meta http-equiv="Pragma" content="no-cache" />
		<title>Open Cap</title>
		<style>
			:root {
				color-scheme: light;
				font-family: Inter, "Segoe UI", sans-serif;
			}

			body {
				margin: 0;
				min-height: 100vh;
				display: grid;
				place-items: center;
				background: linear-gradient(180deg, #f6f8fc 0%, #eef3ff 100%);
				color: #111827;
			}

			main {
				width: min(440px, calc(100vw - 32px));
				padding: 32px 28px;
				border-radius: 24px;
				background: rgba(255, 255, 255, 0.92);
				box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
				text-align: center;
			}

			h1 {
				margin: 0 0 12px;
				font-size: 28px;
				line-height: 1.1;
			}

			p {
				margin: 0;
				font-size: 16px;
				line-height: 1.5;
				color: #4b5563;
			}

			.actions {
				margin-top: 24px;
				display: grid;
				gap: 12px;
			}

			a,
			button {
				width: 100%;
				border: 0;
				border-radius: 14px;
				padding: 14px 16px;
				font: inherit;
				font-weight: 600;
				cursor: pointer;
				text-decoration: none;
				box-sizing: border-box;
			}

			button {
				background: #2563eb;
				color: white;
			}

			a {
				background: #e5eefc;
				color: #1d4ed8;
			}

			#status {
				margin-top: 18px;
				font-size: 14px;
				color: #6b7280;
			}
		</style>
	</head>
	<body>
		<main>
			<h1>Opening Cap</h1>
			<p>If Cap does not open automatically, try the button below. Browser fallback will start in a moment.</p>
			<div class="actions">
				<button id="open-cap" type="button">Open Cap</button>
				<a id="browser-fallback" href="${fallbackHref}">Use browser fallback</a>
			</div>
			<p id="status">Trying the desktop app first...</p>
		</main>
		<script>
			const { primaryUrl, fallbackUrl } = ${state};
			const status = document.getElementById("status");
			const openCapButton = document.getElementById("open-cap");
			const fallbackLink = document.getElementById("browser-fallback");
			let fallbackStarted = false;

			const startFallback = () => {
				if (fallbackStarted) return;
				fallbackStarted = true;
				status.textContent = "Switching to the browser fallback...";
				window.location.replace(fallbackUrl);
			};

			const openCap = () => {
				status.textContent = "Trying to open the Cap desktop app...";
				window.location.href = primaryUrl;
			};

			openCapButton.addEventListener("click", openCap);
			fallbackLink.addEventListener("click", () => {
				fallbackStarted = true;
			});

			openCap();
			window.setTimeout(startFallback, 1800);
		</script>
	</body>
</html>`;
}

// Desktop sign-in consent. GET /request only shows this page; credentials are
// minted by the POST it submits. The signed state binds the approval to the
// signed-in user and the exact request, and expires quickly, so a page cannot
// silently obtain a token by navigating a signed-in browser to /request.
export const DESKTOP_CONSENT_TTL_MS = 10 * 60 * 1000;

export type DesktopSessionRequest = z.infer<
	typeof desktopSessionRequestQuerySchema
>;

const consentPayload = (
	userId: string,
	request: DesktopSessionRequest,
	expiresAt: number,
) =>
	[userId, request.port ?? "", request.platform, request.type, expiresAt].join(
		".",
	);

const signConsent = (payload: string, secret: string) =>
	createHmac("sha256", secret)
		.update(`desktop-consent:${payload}`)
		.digest("base64url");

export function createDesktopConsentState(input: {
	userId: string;
	request: DesktopSessionRequest;
	secret: string;
	now?: number;
}) {
	const expiresAt = (input.now ?? Date.now()) + DESKTOP_CONSENT_TTL_MS;
	const signature = signConsent(
		consentPayload(input.userId, input.request, expiresAt),
		input.secret,
	);
	return `${expiresAt}.${signature}`;
}

export function verifyDesktopConsentState(input: {
	state: string;
	userId: string;
	request: DesktopSessionRequest;
	secret: string;
	now?: number;
}): boolean {
	const [expiresRaw, signature, ...rest] = input.state.split(".");
	if (!expiresRaw || !signature || rest.length > 0) return false;
	const expiresAt = Number(expiresRaw);
	if (!Number.isSafeInteger(expiresAt)) return false;
	if ((input.now ?? Date.now()) > expiresAt) return false;
	const expected = Buffer.from(
		signConsent(
			consentPayload(input.userId, input.request, expiresAt),
			input.secret,
		),
	);
	const actual = Buffer.from(signature);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createDesktopConsentPage(input: {
	productName: string;
	email: string;
	action: string;
	request: DesktopSessionRequest;
	state: string;
}) {
	const field = (name: string, value: string | number | undefined) =>
		value === undefined
			? ""
			: `<input type="hidden" name="${name}" value="${escapeHtmlAttribute(String(value))}" />`;
	const product = escapeHtmlAttribute(input.productName);
	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="referrer" content="no-referrer" />
		<title>Sign in to the ${product} desktop app</title>
		<style>
			body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, "Segoe UI", sans-serif; background: #f6f8fc; color: #111827; }
			main { width: min(440px, calc(100vw - 32px)); padding: 32px 28px; border-radius: 24px; background: #fff; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12); text-align: center; }
			h1 { margin: 0 0 12px; font-size: 24px; }
			p { margin: 0; color: #4b5563; line-height: 1.5; }
			.actions { margin-top: 24px; display: grid; gap: 12px; }
			button, a { border: 0; border-radius: 14px; padding: 14px 16px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
			button { background: #2563eb; color: #fff; }
			a { background: #eef2ff; color: #1e3a8a; }
		</style>
	</head>
	<body>
		<main>
			<h1>Sign in to the desktop app?</h1>
			<p>The ${product} desktop app on this computer is asking to sign in as <strong>${escapeHtmlAttribute(input.email)}</strong>. Only continue if you just started signing in from the app.</p>
			<form class="actions" method="post" action="${escapeHtmlAttribute(input.action)}">
				${field("port", input.request.port)}
				${field("platform", input.request.platform)}
				${field("type", input.request.type)}
				${field("state", input.state)}
				<button type="submit">Continue</button>
				<a href="/">Cancel</a>
			</form>
		</main>
	</body>
</html>`;
}

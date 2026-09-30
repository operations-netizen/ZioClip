import { describe, expect, it } from "vitest";
import {
	createDesktopConsentPage,
	createDesktopConsentState,
	DESKTOP_CONSENT_TTL_MS,
	type DesktopSessionRequest,
	verifyDesktopConsentState,
} from "@/lib/desktop-session";

const secret = "test-secret";
const request: DesktopSessionRequest = {
	port: 8999,
	platform: "web",
	type: "api_key",
};
const now = 1_790_000_000_000;

const stateFor = (userId = "user-1", req = request) =>
	createDesktopConsentState({ userId, request: req, secret, now });

describe("desktop sign-in consent state", () => {
	it("verifies for the same user and request before it expires", () => {
		expect(
			verifyDesktopConsentState({
				state: stateFor(),
				userId: "user-1",
				request,
				secret,
				now: now + DESKTOP_CONSENT_TTL_MS - 1,
			}),
		).toBe(true);
	});

	it("rejects an approval replayed for a different user", () => {
		expect(
			verifyDesktopConsentState({
				state: stateFor("user-1"),
				userId: "user-2",
				request,
				secret,
				now,
			}),
		).toBe(false);
	});

	it("rejects a state whose request was changed (port, type or platform)", () => {
		for (const changed of [
			{ ...request, port: 9000 },
			{ ...request, type: "session" as const },
			{ ...request, platform: "desktop" as const },
			{ ...request, port: undefined },
		]) {
			expect(
				verifyDesktopConsentState({
					state: stateFor(),
					userId: "user-1",
					request: changed,
					secret,
					now,
				}),
			).toBe(false);
		}
	});

	it("rejects an expired, forged or malformed state", () => {
		const state = stateFor();
		const [expiresAt, signature] = state.split(".");
		for (const candidate of [
			"",
			"garbage",
			`${expiresAt}`,
			`${Number(expiresAt) + 60_000}.${signature}`,
			`${expiresAt}.${signature}x`,
			`${expiresAt}.${signature}.extra`,
		]) {
			expect(
				verifyDesktopConsentState({
					state: candidate,
					userId: "user-1",
					request,
					secret,
					now,
				}),
			).toBe(false);
		}
		expect(
			verifyDesktopConsentState({
				state,
				userId: "user-1",
				request,
				secret,
				now: now + DESKTOP_CONSENT_TTL_MS + 1,
			}),
		).toBe(false);
		expect(
			verifyDesktopConsentState({
				state,
				userId: "user-1",
				request,
				secret: "other-secret",
				now,
			}),
		).toBe(false);
	});
});

describe("desktop sign-in consent page", () => {
	it("asks before signing in and posts the bound request", () => {
		const html = createDesktopConsentPage({
			productName: "ZioClip",
			email: 'a"<script>@x.test',
			action: "/api/desktop/session/approve",
			request,
			state: "123.sig",
		});

		expect(html).toContain("Sign in to the desktop app?");
		expect(html).toContain('method="post"');
		expect(html).toContain('action="/api/desktop/session/approve"');
		expect(html).toContain('name="port" value="8999"');
		expect(html).toContain('name="type" value="api_key"');
		expect(html).toContain('name="state" value="123.sig"');
		// The email is shown escaped, never as markup.
		expect(html).not.toContain("<script>@");
		expect(html).toContain("a&quot;&lt;script&gt;@x.test");
	});
});

import { serverEnv } from "@cap/env";

export const DEV_AUTH_LOOPBACK_HOST = "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHostname(hostname: string) {
	return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

export function getDevAuthBypassDisabledReason(): string | null {
	if (process.env.NODE_ENV !== "development") {
		return "NODE_ENV is not development";
	}
	if (process.env.CAP_DEV_AUTH_BYPASS !== "true") {
		return "CAP_DEV_AUTH_BYPASS is not true";
	}
	// Next does not expose its bind address and trusts client-supplied
	// Host/X-Forwarded-For headers, so a LAN client can spoof loopback. The only
	// reliable network boundary is a dev server bound to 127.0.0.1, which the
	// `dev:loopback` script does and advertises through this variable.
	if (process.env.CAP_DEV_SERVER_HOST !== DEV_AUTH_LOOPBACK_HOST) {
		return "dev server is not bound to 127.0.0.1 (start it with `pnpm web dev:loopback`)";
	}
	if (!isLoopbackHostname(new URL(serverEnv().WEB_URL).hostname)) {
		return "WEB_URL is not a loopback URL";
	}
	return null;
}

export function isDevAuthBypassEnabled() {
	return getDevAuthBypassDisabledReason() === null;
}

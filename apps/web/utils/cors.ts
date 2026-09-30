import { buildEnv } from "@cap/env";

// Cap's own domains are only trusted in Cap's hosted build; a self-hosted
// product must not grant them credentialed access. Local dev servers are only
// trusted outside production.
export const allowedOrigins = [
	buildEnv.NEXT_PUBLIC_WEB_URL,
	...(process.env.NODE_ENV === "production"
		? []
		: ["http://localhost:3001", "http://localhost:3000"]),
	"tauri://localhost",
	"http://tauri.localhost",
	"https://tauri.localhost",
	...(buildEnv.NEXT_PUBLIC_IS_CAP
		? [
				"https://cap.so",
				"https://www.cap.so",
				"https://cap.link",
				"https://www.cap.link",
			]
		: []),
];

export function getCorsHeaders(origin: string | null, originalOrigin: string) {
	return {
		"Access-Control-Allow-Origin":
			origin && allowedOrigins.includes(origin)
				? origin
				: allowedOrigins.includes(originalOrigin)
					? originalOrigin
					: "null",
		"Access-Control-Allow-Credentials": "true",
	};
}

export function getOptionsHeaders(
	origin: string | null,
	originalOrigin: string,
	methods = "GET, OPTIONS",
) {
	return {
		...getCorsHeaders(origin, originalOrigin),
		"Access-Control-Allow-Methods": methods,
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, sentry-trace, baggage",
	};
}

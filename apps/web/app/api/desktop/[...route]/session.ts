import { db } from "@cap/database";
import { decodeSessionToken } from "@cap/database/auth/auth-options";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { BRAND_NAME } from "@cap/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
	buildLoopbackCallbackUrl,
	createDesktopConsentPage,
	createDesktopConsentState,
	createDesktopRedirectPage,
	type DesktopSessionRequest,
	desktopSessionRequestQuerySchema,
	verifyDesktopConsentState,
} from "@/lib/desktop-session";

export const app = new Hono();

const noStoreHeaders = {
	"Cache-Control": "no-store, no-cache, must-revalidate",
	Pragma: "no-cache",
};

const loginRedirectFor = (request: DesktopSessionRequest) => {
	const redirectOrigin = getDeploymentOrigin();
	const retry = new URL(`${redirectOrigin}/api/desktop/session/request`);
	if (request.port !== undefined)
		retry.searchParams.set("port", String(request.port));
	retry.searchParams.set("platform", request.platform);
	retry.searchParams.set("type", request.type);
	const loginRedirectUrl = new URL(`${redirectOrigin}/login`);
	loginRedirectUrl.searchParams.set("next", retry.toString());
	return loginRedirectUrl;
};

// Shows the consent page. Mints nothing: navigating a signed-in browser here
// (from any site) only displays the question.
app.get(
	"/request",
	zValidator("query", desktopSessionRequestQuerySchema),
	async (c) => {
		const request = c.req.valid("query");

		const user = await getCurrentUser();
		if (!user) return c.redirect(loginRedirectFor(request));

		const state = createDesktopConsentState({
			userId: user.id,
			request,
			secret: serverEnv().NEXTAUTH_SECRET,
		});
		return new Response(
			createDesktopConsentPage({
				productName: BRAND_NAME,
				email: user.email,
				action: "/api/desktop/session/approve",
				request,
				state,
			}),
			{
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"X-Frame-Options": "DENY",
					"Content-Security-Policy": "frame-ancestors 'none'",
					...noStoreHeaders,
				},
			},
		);
	},
);

// Issues the desktop credential after the user approved on the consent page.
// Requires a same-origin form POST from the signed-in user with a valid,
// unexpired consent state bound to this exact request.
app.post("/approve", async (c) => {
	const secret = serverEnv().NEXTAUTH_SECRET;
	const form = await c.req.parseBody();
	const parsed = desktopSessionRequestQuerySchema.safeParse({
		port: form.port === "" ? undefined : form.port,
		platform: form.platform,
		type: form.type,
	});
	if (!parsed.success) return c.text("Invalid request", 400);
	const request = parsed.data;
	const { port, platform, type } = request;

	const fetchSite = c.req.header("sec-fetch-site");
	const origin = c.req.header("origin");
	const sameOrigin =
		fetchSite === "same-origin" ||
		(fetchSite === undefined &&
			origin !== undefined &&
			origin === new URL(getDeploymentOrigin()).origin);
	if (!sameOrigin) return c.text("Forbidden", 403);

	const user = await getCurrentUser();
	if (!user) return c.redirect(loginRedirectFor(request));

	const state = typeof form.state === "string" ? form.state : "";
	if (!verifyDesktopConsentState({ state, userId: user.id, request, secret })) {
		return c.text(
			"This sign-in request expired. Start again from the app.",
			400,
		);
	}

	{
		const loginRedirectUrl = loginRedirectFor(request);

		let data:
			| { type: "token"; token: string; expires: string }
			| { type: "api_key"; api_key: string };

		if (type === "session") {
			const token = getCookie(c, "next-auth.session-token");
			if (token === undefined) return c.redirect(loginRedirectUrl);

			const decodedToken = await decodeSessionToken({ token, secret });

			if (!decodedToken) return c.redirect(loginRedirectUrl);

			data = {
				type: "token",
				token,
				expires: String(decodedToken.exp),
			};
		} else {
			const id = crypto.randomUUID();
			await db()
				.insert(authApiKeys)
				.values({ id, userId: user.id, source: "desktop" });

			data = { type: "api_key", api_key: id };
		}

		const params = new URLSearchParams({ ...data, user_id: user.id });
		const localhostUrl =
			port !== undefined ? buildLoopbackCallbackUrl(port, params) : undefined;
		const deepLinkUrl = `cap-desktop://signin?${params}`;

		// 303: the browser follows with a GET after this form POST.
		if (platform === "web" && localhostUrl) {
			return Response.redirect(localhostUrl, 303);
		}

		if (platform === "desktop" && localhostUrl) {
			return new Response(
				createDesktopRedirectPage(deepLinkUrl, localhostUrl),
				{
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						...noStoreHeaders,
					},
				},
			);
		}

		return Response.redirect(deepLinkUrl, 303);
	}
});

function getDeploymentOrigin() {
	const webUrl = serverEnv().WEB_URL;
	const vercelEnv = serverEnv().VERCEL_ENV;

	if (!vercelEnv || vercelEnv === "production") {
		return webUrl;
	}

	if (vercelEnv === "preview") {
		const branchHost = serverEnv().VERCEL_BRANCH_URL_HOST;
		if (branchHost?.endsWith(".vercel.app")) {
			return `https://${branchHost}`;
		}
	}

	return webUrl;
}

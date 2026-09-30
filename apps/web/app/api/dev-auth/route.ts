import { db } from "@cap/database";
import { authOptions } from "@cap/database/auth/auth-options";
import { users } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getSafeNextPath } from "@/app/(org)/safe-next";
import {
	getDevAuthBypassDisabledReason,
	isLoopbackHostname,
} from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

const DEV_USER_EMAIL = "dev@localhost";
const DEV_USER_NAME = "Local Dev";

const notFound = () => new NextResponse("Not Found", { status: 404 });

function getRequestHostname(request: NextRequest) {
	const host = request.headers.get("host");
	if (!host) return null;
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return null;
	}
}

export async function POST(request: NextRequest) {
	const disabledReason = getDevAuthBypassDisabledReason();
	if (disabledReason) {
		console.warn(`[dev-auth] Rejected: ${disabledReason}`);
		return notFound();
	}

	const env = serverEnv();
	const webOrigin = new URL(env.WEB_URL).origin;
	const hostname = getRequestHostname(request);
	const fetchSite = request.headers.get("sec-fetch-site");
	if (
		!hostname ||
		!isLoopbackHostname(hostname) ||
		request.headers.get("origin") !== webOrigin ||
		(fetchSite !== null && fetchSite !== "same-origin")
	) {
		console.warn(
			"[dev-auth] Rejected: request is not a same-origin loopback form post",
		);
		return notFound();
	}

	const form = await request.formData().catch(() => null);
	const nextValue = form?.get("next");
	const next = getSafeNextPath(
		typeof nextValue === "string" ? nextValue : null,
		env.WEB_URL,
	);

	const adapter = authOptions().adapter;
	if (!adapter?.createUser) {
		return new NextResponse("Auth adapter unavailable", { status: 500 });
	}
	await adapter.createUser({
		id: "",
		email: DEV_USER_EMAIL,
		emailVerified: new Date(),
		name: DEV_USER_NAME,
		image: null,
	});

	const [user] = await db()
		.select({
			id: users.id,
			name: users.name,
			lastName: users.lastName,
			email: users.email,
			image: users.image,
			authSessionVersion: users.authSessionVersion,
		})
		.from(users)
		.where(eq(users.email, DEV_USER_EMAIL))
		.limit(1);

	if (!user) {
		return new NextResponse("Failed to provision dev user", { status: 500 });
	}

	const sessionToken = await encode({
		token: {
			id: user.id,
			name: user.name,
			lastName: user.lastName,
			email: user.email,
			picture: user.image,
			sessionVersion: user.authSessionVersion,
		},
		secret: env.NEXTAUTH_SECRET,
	});

	const response = NextResponse.redirect(new URL(next, env.WEB_URL), 303);
	response.cookies.set("next-auth.session-token", sessionToken, {
		httpOnly: true,
		sameSite: "none",
		path: "/",
		secure: true,
	});
	return response;
}

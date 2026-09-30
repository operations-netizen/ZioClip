import { getCurrentUser } from "@cap/database/auth/session";
import { serverEnv } from "@cap/env";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SHOW_MARKETING_SITE } from "@/lib/branding";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { getSafeNextPath } from "../safe-next";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: {
	searchParams: Promise<{
		next?: string | string[];
		organizationId?: string | string[];
		connection_id?: string | string[];
		mobileProvider?: string | string[];
		sso?: string | string[];
		error?: string | string[];
	}>;
}) {
	const [searchParams, session] = await Promise.all([
		props.searchParams,
		getCurrentUser(),
	]);
	const [organizationId, connectionId, mobileProvider, sso, error] = [
		searchParams.organizationId,
		searchParams.connection_id,
		searchParams.mobileProvider,
		searchParams.sso,
		searchParams.error,
	].map((value) => (Array.isArray(value) ? value[0] : value));
	const isSsoEntry = Boolean(
		organizationId ||
			connectionId ||
			mobileProvider === "workos" ||
			sso === "1" ||
			error === "SsoSessionExpired" ||
			error === "SsoSignInFailed" ||
			error === "SsoMissingProfileAttributes" ||
			error === "profile_not_allowed_outside_organization" ||
			error === "signin_consent_denied",
	);

	if (session && !isSsoEntry) {
		redirect(getSafeNextPath(searchParams.next, serverEnv().WEB_URL));
	}

	return (
		<div className="flex relative justify-center items-center w-full h-screen bg-gray-2">
			{SHOW_MARKETING_SITE && (
				<div className="flex absolute top-10 left-10 gap-2 justify-center items-center transition-opacity hover:opacity-75">
					<FontAwesomeIcon
						className="opacity-75 size-3 text-gray-12"
						icon={faArrowLeft}
					/>
					<Link className="text-gray-12" href="/">
						Home
					</Link>
				</div>
			)}
			<LoginForm />
			{isDevAuthBypassEnabled() && (
				<form
					method="post"
					action="/api/dev-auth"
					className="absolute bottom-8 left-1/2 -translate-x-1/2"
				>
					<input
						type="hidden"
						name="next"
						value={getSafeNextPath(searchParams.next, serverEnv().WEB_URL)}
					/>
					<button
						type="submit"
						className="px-3 py-1.5 text-xs rounded-md border border-dashed border-gray-6 text-gray-11 hover:text-gray-12 hover:border-gray-8"
					>
						Local development: continue as dev@localhost
					</button>
				</form>
			)}
		</div>
	);
}

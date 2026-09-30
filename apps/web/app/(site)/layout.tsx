import { buildEnv } from "@cap/env";
import "@cap/ui/style";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { SHOW_MARKETING_SITE } from "@/lib/branding";
import { formatStarCount, getGitHubStars } from "@/utils/github";
import { DeferredMessengerWidget } from "../Layout/DeferredMessengerWidget";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

export default async function Layout(props: PropsWithChildren) {
	if (!SHOW_MARKETING_SITE) redirect("/dashboard");
	const starCount = await getGitHubStars();
	const stars = formatStarCount(starCount);

	return (
		<>
			<Navbar stars={stars} />
			{props.children}
			<Footer />
			{buildEnv.NEXT_PUBLIC_IS_CAP === "true" && <DeferredMessengerWidget />}
		</>
	);
}

import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { SHOW_MARKETING_SITE } from "@/lib/branding";

export default function DocsRootLayout(props: PropsWithChildren) {
	if (!SHOW_MARKETING_SITE) redirect("/dashboard");
	return <>{props.children}</>;
}

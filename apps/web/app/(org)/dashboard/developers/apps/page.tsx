import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { AppsListClient } from "./AppsListClient";

export const metadata: Metadata = {
	title: `Developer Apps — ${PRODUCT_NAME}`,
};

export default async function AppsPage() {
	return <AppsListClient />;
}

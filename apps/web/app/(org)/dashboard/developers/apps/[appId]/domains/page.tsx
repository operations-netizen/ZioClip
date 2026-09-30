import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { DomainsClient } from "./DomainsClient";

export const metadata: Metadata = {
	title: `Allowed Domains — ${PRODUCT_NAME}`,
};

export default async function DomainsPage() {
	return <DomainsClient />;
}

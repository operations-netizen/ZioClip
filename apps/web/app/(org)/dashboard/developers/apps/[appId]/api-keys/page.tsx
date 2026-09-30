import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { ApiKeysClient } from "./ApiKeysClient";

export const metadata: Metadata = {
	title: `API Keys — ${PRODUCT_NAME}`,
};

export default async function ApiKeysPage() {
	return <ApiKeysClient />;
}

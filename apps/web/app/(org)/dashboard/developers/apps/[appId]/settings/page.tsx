import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { AppSettingsClient } from "./AppSettingsClient";

export const metadata: Metadata = {
	title: `App Settings — ${PRODUCT_NAME}`,
};

export default async function AppSettingsPage() {
	return <AppSettingsClient />;
}

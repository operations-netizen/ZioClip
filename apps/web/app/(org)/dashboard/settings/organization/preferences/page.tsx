import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import CapSettingsCard from "../components/CapSettingsCard";

export const metadata: Metadata = {
	title: `Organization Preferences — ${PRODUCT_NAME}`,
};

export default function PreferencesPage() {
	return <CapSettingsCard />;
}

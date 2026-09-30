import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { GeneralPage } from "./GeneralPage";

export const metadata: Metadata = {
	title: `Organization Settings — ${PRODUCT_NAME}`,
};

export default function OrganizationPage() {
	return <GeneralPage />;
}

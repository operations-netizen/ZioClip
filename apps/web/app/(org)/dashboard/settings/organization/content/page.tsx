import type { Metadata } from "next";
import { getContentManagementSetup } from "@/actions/organization/content-transfer";
import { PRODUCT_NAME } from "@/lib/branding";
import { ContentManagement } from "./ContentManagement";

export const metadata: Metadata = {
	title: `Content Management — ${PRODUCT_NAME}`,
};

export default async function OrganizationContentPage() {
	const setup = await getContentManagementSetup();
	return <ContentManagement initialSetup={setup} />;
}

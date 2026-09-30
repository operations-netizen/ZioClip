import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { ImportPage } from "./ImportPage";

export const metadata: Metadata = {
	title: `Import — ${PRODUCT_NAME}`,
};

export default function Page() {
	return <ImportPage />;
}

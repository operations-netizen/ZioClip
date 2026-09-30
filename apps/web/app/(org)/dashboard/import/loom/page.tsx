import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { ImportLoomPage } from "./ImportLoomPage";

export const metadata: Metadata = {
	title: `Import from Loom — ${PRODUCT_NAME}`,
};

export default function Page() {
	return <ImportLoomPage />;
}

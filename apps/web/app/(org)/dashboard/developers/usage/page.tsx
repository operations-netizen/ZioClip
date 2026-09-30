import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { UsageClient } from "./UsageClient";

export const metadata: Metadata = {
	title: `Developer Usage — ${PRODUCT_NAME}`,
};

export default async function UsagePage() {
	return <UsageClient />;
}

import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { RecordVideoPage } from "./RecordVideoPage";

export const metadata: Metadata = {
	title: `Record — ${PRODUCT_NAME}`,
};

export default function RecordVideoRoute() {
	return <RecordVideoPage />;
}

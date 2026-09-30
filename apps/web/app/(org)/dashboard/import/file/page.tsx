import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { ImportFilePage } from "./ImportFilePage";

export const metadata: Metadata = {
	title: `Upload File — ${PRODUCT_NAME}`,
};

export default function Page() {
	return <ImportFilePage />;
}

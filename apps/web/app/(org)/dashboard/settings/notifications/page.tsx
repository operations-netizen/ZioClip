import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/branding";
import { NotificationsSettings } from "./NotificationsSettings";

export const metadata: Metadata = {
	title: `Notification Settings — ${PRODUCT_NAME}`,
};

export default function NotificationsSettingsPage() {
	return <NotificationsSettings />;
}

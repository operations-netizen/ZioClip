"use client";

import { Button } from "@cap/ui";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDashboardContext } from "@/app/(org)/dashboard/Contexts";
import { UpgradeModal } from "@/components/UpgradeModal";
import { SHOW_BILLING_UI } from "@/lib/branding";

export const UploadCapButton = ({
	size = "md",
	/** Defaults to "dark" so existing call sites are unchanged. */
	variant = "dark",
}: {
	size?: "sm" | "lg" | "md";
	variant?: "dark" | "white" | "primary" | "outline";
	grey?: boolean;
}) => {
	const { user } = useDashboardContext();
	const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
	const router = useRouter();

	const handleClick = () => {
		if (!user) return;

		// Upstream gates media import behind Pro. This build has no billing (see
		// SHOW_BILLING_UI in lib/branding.ts), so a non-Pro user got an upgrade
		// modal instead of the importer — a dead button. Only show the upsell
		// when the billing UI is actually enabled.
		if (SHOW_BILLING_UI && !user.isPro) {
			setUpgradeModalOpen(true);
			return;
		}

		router.push("/dashboard/import");
	};

	return (
		<>
			<Button
				onClick={handleClick}
				variant={variant}
				className="flex gap-2 items-center"
				size={size}
			>
				<FontAwesomeIcon className="size-3.5" icon={faUpload} />
				Upload Media
			</Button>
			<UpgradeModal
				open={upgradeModalOpen}
				onOpenChange={setUpgradeModalOpen}
			/>
		</>
	);
};

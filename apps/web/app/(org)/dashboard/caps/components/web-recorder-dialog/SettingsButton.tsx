"use client";

import CogIcon from "@/app/(org)/dashboard/_components/AnimatedIcons/Cog";
import { headerIconButtonClassName } from "./web-recorder-dialog-header";

interface SettingsButtonProps {
	visible: boolean;
	onClick: () => void;
}

export const SettingsButton = ({ visible, onClick }: SettingsButtonProps) => {
	if (!visible) return null;

	return (
		<button
			type="button"
			aria-label="Open recorder settings"
			className={headerIconButtonClassName}
			onClick={onClick}
		>
			<CogIcon size={18} aria-hidden />
		</button>
	);
};

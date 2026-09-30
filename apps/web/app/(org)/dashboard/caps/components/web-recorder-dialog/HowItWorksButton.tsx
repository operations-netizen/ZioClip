"use client";

import { CircleHelpIcon } from "lucide-react";

interface HowItWorksButtonProps {
	onClick: () => void;
}

export const HowItWorksButton = ({ onClick }: HowItWorksButtonProps) => {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex gap-1 justify-center items-center mx-auto text-xs transition-colors text-gray-10 hover:text-gray-12"
		>
			<CircleHelpIcon className="size-3.5" aria-hidden />
			How it works
		</button>
	);
};

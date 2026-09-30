"use client";

import { Minus, X } from "lucide-react";
import type { ReactNode } from "react";

interface WebRecorderDialogHeaderProps {
	title?: string;
	isBusy: boolean;
	onClose: () => void;
	/**
	 * Hides the recorder panel without touching the recording. Only provided
	 * while a recording is in progress; the floating in-progress bar stays
	 * on screen so the user can still pause/stop/restore.
	 */
	onHide?: () => void;
	canHide?: boolean;
	/** Extra controls (e.g. the settings cog) placed before hide/close. */
	actions?: ReactNode;
}

export const headerIconButtonClassName =
	"flex justify-center items-center rounded-full transition-colors size-8 text-gray-11 hover:bg-gray-3 hover:text-gray-12 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";

export const WebRecorderDialogHeader = ({
	title = "New recording",
	isBusy,
	onClose,
	onHide,
	canHide = false,
	actions,
}: WebRecorderDialogHeaderProps) => {
	return (
		<div className="flex justify-between items-center -mt-1 -mr-1">
			<h2 className="text-[0.95rem] font-medium text-gray-12">{title}</h2>
			<div className="flex gap-0.5 items-center" data-no-drag>
				{canHide && onHide && (
					<button
						type="button"
						onClick={onHide}
						aria-label="Hide recorder while recording"
						title="Hide while recording"
						className={headerIconButtonClassName}
					>
						<Minus className="size-4" aria-hidden />
					</button>
				)}
				{actions}
				<button
					type="button"
					onClick={onClose}
					disabled={isBusy}
					aria-label="Close dialog"
					className={headerIconButtonClassName}
				>
					<X className="size-4" aria-hidden />
				</button>
			</div>
		</div>
	);
};

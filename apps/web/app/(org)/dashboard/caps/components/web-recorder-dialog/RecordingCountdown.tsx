"use client";

import { useEffect } from "react";

interface RecordingCountdownProps {
	remaining: number | null;
	onCancel: () => void;
}

export const RecordingCountdown = ({
	remaining,
	onCancel,
}: RecordingCountdownProps) => {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onCancel]);

	return (
		<output
			className="flex flex-col items-center justify-center gap-5 py-8"
			aria-live="assertive"
		>
			<span className="text-xs font-medium uppercase tracking-[0.14em] text-gray-10">
				{remaining ? "Recording starts in" : "Starting"}
			</span>
			<span
				key={remaining ?? "go"}
				className="flex size-24 items-center justify-center rounded-full border border-gray-5 bg-gray-1 text-5xl font-semibold tabular-nums text-gray-12 animate-in zoom-in-75 fade-in duration-300"
				data-testid="recording-countdown"
			>
				{remaining ?? "●"}
			</span>
			<button
				type="button"
				onClick={onCancel}
				className="rounded-full px-4 py-1.5 text-sm text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12"
			>
				Cancel <span className="text-gray-9">(Esc)</span>
			</button>
		</output>
	);
};

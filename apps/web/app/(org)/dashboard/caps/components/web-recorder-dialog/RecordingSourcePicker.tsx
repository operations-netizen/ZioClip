"use client";

import clsx from "clsx";
import { MonitorIcon, PictureInPicture2Icon, VideoIcon } from "lucide-react";

export type RecordingSource = "screen" | "camera" | "screenCamera";

const SOURCES: Array<{
	value: RecordingSource;
	label: string;
	Icon: typeof MonitorIcon;
}> = [
	{ value: "screen", label: "Screen", Icon: MonitorIcon },
	{ value: "screenCamera", label: "Screen + Cam", Icon: PictureInPicture2Icon },
	{ value: "camera", label: "Camera", Icon: VideoIcon },
];

export const recordingSourceUsesCamera = (source: RecordingSource) =>
	source !== "screen";

export const recordingSourceUsesScreen = (source: RecordingSource) =>
	source !== "camera";

interface RecordingSourcePickerProps {
	value: RecordingSource;
	disabled?: boolean;
	screenSupported?: boolean;
	onChange: (source: RecordingSource) => void;
}

export const RecordingSourcePicker = ({
	value,
	disabled = false,
	screenSupported = true,
	onChange,
}: RecordingSourcePickerProps) => (
	<fieldset
		className="grid grid-cols-3 gap-1 rounded-xl bg-gray-3 p-1"
		disabled={disabled}
	>
		<legend className="sr-only">What to record</legend>
		{SOURCES.map(({ value: option, label, Icon }) => {
			const selected = option === value;
			const unavailable = !screenSupported && recordingSourceUsesScreen(option);
			return (
				<label
					key={option}
					className={clsx(
						"flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.75rem] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-8",
						selected
							? "bg-gray-1 text-gray-12 shadow-sm"
							: "cursor-pointer text-gray-11 hover:text-gray-12",
						(disabled || unavailable) && "cursor-not-allowed opacity-50",
					)}
				>
					<input
						type="radio"
						name="recording-source"
						value={option}
						checked={selected}
						disabled={disabled || unavailable}
						onChange={() => onChange(option)}
						className="sr-only"
					/>
					<Icon className="size-4" aria-hidden />
					<span className="whitespace-nowrap">{label}</span>
				</label>
			);
		})}
	</fieldset>
);

"use client";

import {
	COMPOSITE_MAX_SIZE,
	getCameraOverlayRect,
} from "@cap/recorder-core/screen-camera-compositor";
import clsx from "clsx";
import { MonitorIcon, VideoOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecordingSource } from "./RecordingSourcePicker";

interface RecordingLayoutPreviewProps {
	source: RecordingSource;
	stream: MediaStream | null;
	live?: boolean;
}

const useStreamVideo = (stream: MediaStream | null) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [size, setSize] = useState<{ width: number; height: number } | null>(
		null,
	);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.srcObject = stream;
		if (!stream) {
			setSize(null);
			return;
		}
		const update = () => {
			if (video.videoWidth > 0 && video.videoHeight > 0) {
				setSize({ width: video.videoWidth, height: video.videoHeight });
			}
		};
		video.addEventListener("loadedmetadata", update);
		video.addEventListener("resize", update);
		void video.play().catch(() => {});
		return () => {
			video.removeEventListener("loadedmetadata", update);
			video.removeEventListener("resize", update);
		};
	}, [stream]);

	return { videoRef, size };
};

/**
 * Shows where the camera will land in the recording. The overlay rectangle is
 * computed with the same getCameraOverlayRect the compositor uses, against a
 * reference 16:9 frame, so the preview matches the final video. The screen is
 * drawn as a placeholder rather than a live feed: showing the captured screen
 * here would recurse into itself whenever this tab is on the recorded screen.
 */
export const RecordingLayoutPreview = ({
	source,
	stream,
	live = false,
}: RecordingLayoutPreviewProps) => {
	const { videoRef, size } = useStreamVideo(stream);
	const frame = COMPOSITE_MAX_SIZE;
	const rect = getCameraOverlayRect(frame, size ?? {});
	const showCamera = Boolean(stream);

	return (
		<div
			className={clsx(
				"relative w-full overflow-hidden rounded-lg",
				source === "camera" ? "bg-black" : "bg-gray-12",
			)}
			style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
			data-no-drag
		>
			{source === "screenCamera" && (
				<div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[0.7rem] text-gray-8">
					<MonitorIcon className="size-3.5" aria-hidden />
					Your screen
				</div>
			)}
			{showCamera ? (
				<video
					ref={videoRef}
					muted
					playsInline
					autoPlay
					aria-label="Camera preview"
					className={clsx(
						"absolute bg-black",
						source === "camera"
							? "inset-0 size-full object-contain"
							: "object-cover shadow-md",
					)}
					style={
						source === "camera"
							? undefined
							: {
									left: `${(rect.x / frame.width) * 100}%`,
									top: `${(rect.y / frame.height) * 100}%`,
									width: `${(rect.width / frame.width) * 100}%`,
									height: `${(rect.height / frame.height) * 100}%`,
									borderRadius: `${(rect.radius / rect.width) * 100}% / ${(rect.radius / rect.height) * 100}%`,
								}
					}
				/>
			) : (
				<div
					className={clsx(
						"absolute flex items-center justify-center text-gray-9",
						source === "camera"
							? "inset-0"
							: "rounded-md border border-dashed border-gray-8",
					)}
					style={
						source === "camera"
							? undefined
							: {
									left: `${(rect.x / frame.width) * 100}%`,
									top: `${(rect.y / frame.height) * 100}%`,
									width: `${(rect.width / frame.width) * 100}%`,
									height: `${(rect.height / frame.height) * 100}%`,
								}
					}
				>
					{live ? (
						<span className="px-1 text-center text-[0.6rem] leading-tight">
							Camera is in the recording
						</span>
					) : (
						<VideoOffIcon className="size-4" aria-hidden />
					)}
				</div>
			)}
			{live && (
				<span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-medium text-white">
					<span className="size-1.5 rounded-full bg-red-500" />
					Live
				</span>
			)}
		</div>
	);
};

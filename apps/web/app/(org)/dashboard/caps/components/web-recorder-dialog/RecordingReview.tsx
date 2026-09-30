"use client";

import { Button } from "@cap/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { RecordingPreview } from "./useWebRecorder";

interface RecordingReviewProps {
	preview: RecordingPreview;
	onUpload: (title: string) => void;
	onDiscard: () => void;
}

const formatDuration = (ms: number) => {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// MediaRecorder WebM has no duration in its header, so the element reports
// Infinity and cannot seek until it has scanned to the end once.
const useSeekableDuration = (url: string) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !url) return;
		let resolving = false;
		const handleMetadata = () => {
			if (Number.isFinite(video.duration)) return;
			resolving = true;
			video.currentTime = Number.MAX_SAFE_INTEGER;
		};
		const handleDurationChange = () => {
			if (!resolving || !Number.isFinite(video.duration)) return;
			resolving = false;
			video.currentTime = 0;
		};
		video.addEventListener("loadedmetadata", handleMetadata);
		video.addEventListener("durationchange", handleDurationChange);
		return () => {
			video.removeEventListener("loadedmetadata", handleMetadata);
			video.removeEventListener("durationchange", handleDurationChange);
		};
	}, [url]);
	return videoRef;
};

export const RecordingReview = ({
	preview,
	onUpload,
	onDiscard,
}: RecordingReviewProps) => {
	const videoRef = useSeekableDuration(preview.url);
	const [title, setTitle] = useState("");
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const titleId = useId();

	return (
		<div className="flex flex-col gap-4" data-no-drag>
			<video
				ref={videoRef}
				src={preview.url}
				controls
				playsInline
				preload="metadata"
				aria-label="Recording preview"
				className="w-full bg-black rounded-xl aspect-video"
			>
				<track kind="captions" />
			</video>
			<div className="flex flex-col gap-1.5">
				<div className="flex justify-between items-baseline">
					<label htmlFor={titleId} className="text-xs font-medium text-gray-10">
						Title
					</label>
					<span
						className="text-xs tabular-nums text-gray-10"
						data-testid="review-duration"
					>
						{formatDuration(preview.durationMs)}
					</span>
				</div>
				<input
					id={titleId}
					type="text"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Untitled recording"
					aria-label="Recording title"
					maxLength={200}
					className="px-3 w-full h-10 text-sm rounded-lg border border-gray-5 bg-gray-1 text-gray-12 placeholder:text-gray-9 focus:border-blue-8 focus:outline-none"
					onKeyDown={(event) => {
						if (event.key === "Enter") onUpload(title);
					}}
				/>
			</div>
			<div className="flex gap-2 justify-between items-center">
				{confirmDiscard ? (
					<>
						<p className="text-sm text-gray-11">Delete this recording?</p>
						<div className="flex gap-2">
							<Button
								variant="gray"
								size="sm"
								onClick={() => setConfirmDiscard(false)}
							>
								Keep
							</Button>
							<Button variant="destructive" size="sm" onClick={onDiscard}>
								Delete recording
							</Button>
						</div>
					</>
				) : (
					<>
						<Button
							variant="gray"
							size="sm"
							onClick={() => setConfirmDiscard(true)}
						>
							Discard
						</Button>
						<Button variant="blue" size="sm" onClick={() => onUpload(title)}>
							Upload &amp; share
						</Button>
					</>
				)}
			</div>
		</div>
	);
};

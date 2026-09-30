"use client";

import type { Video } from "@cap/web-domain";
import { useEffect, useRef } from "react";
import { useUploadProgress } from "./ProgressCircle";
import type { UploadProgress } from "./upload-progress";

/**
 * Headless bridge around `useUploadProgress`. The hook's RPC client pulls the
 * Effect runtime with it, so the players mount this (dynamically imported)
 * only while a video actually has a live upload — every finished video skips
 * the chunk entirely.
 */
export default function UploadProgressTracker({
	videoId,
	onChange,
}: {
	videoId: Video.VideoId;
	onChange: (progress: UploadProgress | null) => void;
}) {
	const progress = useUploadProgress(videoId, true);

	// `useUploadProgress` rebuilds its result object on every render (each branch
	// returns a fresh literal), so depending on `progress` by reference fired
	// this effect every render: onChange -> parent setState -> re-render -> new
	// object -> "Maximum update depth exceeded". Compare by value and only
	// notify the parent when the progress actually changed. `UploadProgress` is
	// plain JSON-serialisable data (strings/numbers/booleans/Date/null), so
	// serialising is an exact comparison here.
	const lastEmittedRef = useRef<string | null>(null);

	useEffect(() => {
		const serialized = JSON.stringify(progress ?? null);
		if (lastEmittedRef.current === serialized) return;
		lastEmittedRef.current = serialized;
		onChange(progress);
	}, [progress, onChange]);

	return null;
}

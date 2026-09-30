"use client";

import { Button } from "@cap/ui";
import { Plus, Video } from "lucide-react";
import { useEffect } from "react";
import { openWebRecorder } from "../components/web-recorder-dialog/web-recorder-dialog";

/**
 * Deep-link target for "record" (search, bookmarks). The recorder itself is the
 * dashboard-wide dialog, so this page just opens it, and keeps a button in case
 * the user closed it.
 */
export const RecordVideoPage = () => {
	useEffect(() => {
		openWebRecorder();
	}, []);

	return (
		<div className="flex flex-col flex-1 justify-center items-center px-5 w-full text-center">
			<div className="flex justify-center items-center mb-6 rounded-2xl border size-14 border-gray-4 bg-gray-1 text-gray-11">
				<Video className="size-6" aria-hidden />
			</div>
			<h1 className="text-xl font-medium text-gray-12">
				Start a new recording
			</h1>
			<p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-10">
				Record your screen, your camera, or both, right here in the browser.
				Nothing to install.
			</p>
			<Button
				variant="blue"
				onClick={openWebRecorder}
				className="flex gap-2 items-center mt-6"
			>
				<Plus className="size-4" />
				New Recording
			</Button>
		</div>
	);
};

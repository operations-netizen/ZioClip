"use client";

import { Button } from "@cap/ui";
import { Plus, Video } from "lucide-react";
import { UploadCapButton } from "./UploadCapButton";
import { openWebRecorder } from "./web-recorder-dialog/web-recorder-dialog";

interface EmptyCapStateProps {
	userName?: string;
}

export const EmptyCapState: React.FC<EmptyCapStateProps> = ({ userName }) => {
	return (
		<div className="flex flex-col flex-1 justify-center items-center px-5 w-full h-full text-center">
			<div className="flex justify-center items-center mb-6 rounded-2xl border size-14 border-gray-4 bg-gray-1 text-gray-11">
				<Video className="size-6" aria-hidden />
			</div>
			<h2 className="text-xl font-medium text-gray-12">
				{userName ? `No recordings yet, ${userName}` : "No recordings yet"}
			</h2>
			<p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-10">
				Record your screen, your camera, or both, then share it with a link.
			</p>
			<div className="flex flex-col gap-3 items-center mt-6">
				<Button
					variant="blue"
					onClick={openWebRecorder}
					className="flex gap-2 items-center"
				>
					<Plus className="size-4" />
					New Recording
				</Button>
				<div className="flex gap-2 items-center text-sm text-gray-10">
					<span>or</span>
					<UploadCapButton size="sm" variant="white" />
				</div>
			</div>
		</div>
	);
};

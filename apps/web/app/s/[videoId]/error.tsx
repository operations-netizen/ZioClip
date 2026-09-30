"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";

export default function ShareError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[share-page]", error);
	}, [error]);

	return (
		<div className="flex flex-col justify-center items-center px-6 min-h-dvh text-center bg-gray-1">
			<BrandMark className="mb-6 size-10" />
			<h1 className="text-2xl font-medium text-gray-12">
				This recording couldn't be loaded
			</h1>
			<p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-10">
				Something went wrong while opening this page. Try again in a moment.
			</p>
			{error.digest && (
				<p className="mt-2 font-mono text-xs text-gray-9">
					Reference: {error.digest}
				</p>
			)}
			<div className="flex gap-2 mt-6">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center px-5 h-10 text-sm font-medium rounded-full transition-colors bg-gray-12 text-gray-1 hover:opacity-90"
				>
					Try again
				</button>
				<Link
					href="/dashboard"
					className="inline-flex items-center px-5 h-10 text-sm font-medium rounded-full border transition-colors border-gray-5 text-gray-12 hover:bg-gray-3"
				>
					Go to My Recordings
				</Link>
			</div>
		</div>
	);
}

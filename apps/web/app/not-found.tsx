import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
	return (
		<div className="flex flex-col justify-center items-center px-6 min-h-dvh text-center bg-gray-1">
			<BrandMark className="mb-6 size-10" />
			<h1 className="text-2xl font-medium text-gray-12">Page not found</h1>
			<p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-10">
				This link may be broken, or the recording it pointed to was deleted or
				made private.
			</p>
			<Link
				href="/dashboard"
				className="inline-flex items-center px-5 mt-6 h-10 text-sm font-medium rounded-full transition-colors bg-gray-12 text-gray-1 hover:opacity-90"
			>
				Go to My Recordings
			</Link>
		</div>
	);
}

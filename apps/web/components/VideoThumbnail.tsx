import type { Video } from "@cap/web-domain";
import clsx from "clsx";
import { Effect } from "effect";
import Image from "next/image";
import type { CSSProperties } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BrandSpinner } from "@/components/BrandMark";
import { useEffectQuery } from "@/lib/EffectRuntime";
import { ThumbnailRequest } from "@/lib/Requests/ThumbnailRequest";

export type ImageLoadingStatus = "loading" | "success" | "error";

type PreviewState = {
	videoId: Video.VideoId;
	hovered: boolean;
	status: ImageLoadingStatus;
};

interface VideoThumbnailProps {
	videoId: Video.VideoId;
	alt: string;
	imageClass?: string;
	objectFit?: CSSProperties["objectFit"];
	containerClass?: string;
	videoDuration?: number;
	imageStatus: ImageLoadingStatus;
	setImageStatus: (status: ImageLoadingStatus) => void;
	hasActiveUpload?: boolean;
	showPreview?: boolean;
}

const formatDuration = (durationSecs: number) => {
	const total = Math.max(1, Math.round(durationSecs));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = (total % 60).toString().padStart(2, "0");
	return hours > 0
		? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
};

/**
 * Placeholder shown when a recording has no poster frame yet (still processing,
 * or processing never produced one).
 *
 * Previously this was two `Math.random()` greyscale stops computed inline on
 * every render, so the tile was a flat grey that changed colour on each
 * re-render. Now it is derived from the video id: stable across renders, and a
 * different hue per recording so a grid of them still reads as distinct tiles
 * rather than one grey slab.
 */
const DEFAULT_PLACEHOLDER_HUE = { from: "#DCE8FF", to: "#B7CEF7" };

const PLACEHOLDER_HUES = [
	// Brand blue first, then a spread that stays in the same muted family.
	{ from: "#DCE8FF", to: "#B7CEF7" },
	{ from: "#E4E8F2", to: "#C3CBDC" },
	{ from: "#DEEAF3", to: "#BBD0E0" },
	{ from: "#E7E4F4", to: "#C8C2E2" },
	{ from: "#E2EEE8", to: "#BFD6CB" },
];

function placeholderGradient(seed: string) {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	const { from, to } =
		PLACEHOLDER_HUES[Math.abs(hash) % PLACEHOLDER_HUES.length] ??
		DEFAULT_PLACEHOLDER_HUE;
	return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

function getPreviewGifSrc(videoId: Video.VideoId) {
	return `/api/video/preview?videoId=${encodeURIComponent(videoId)}&fallback=none`;
}

export const useThumnailQuery = (
	videoId: Video.VideoId,
	enabled: boolean = true,
) => {
	return useEffectQuery({
		queryKey: ThumbnailRequest.queryKey(videoId),
		queryFn: Effect.fn(function* () {
			return yield* Effect.request(
				new ThumbnailRequest.ThumbnailRequest({ videoId }),
				yield* ThumbnailRequest.DataLoaderResolver,
			);
		}),
		enabled,
	});
};

export const VideoThumbnail: React.FC<VideoThumbnailProps> = memo(
	({
		videoId,
		alt,
		imageClass,
		objectFit = "cover",
		containerClass,
		videoDuration,
		imageStatus,
		setImageStatus,
		hasActiveUpload = false,
		showPreview = true,
	}) => {
		const thumbnailUrl = useThumnailQuery(videoId, !hasActiveUpload);
		const containerRef = useRef<HTMLDivElement>(null);
		const imageRef = useRef<HTMLImageElement>(null);
		const latestVideoId = useRef(videoId);
		const [previewState, setPreviewState] = useState<PreviewState>(() => ({
			videoId,
			hovered: false,
			status: "loading",
		}));
		latestVideoId.current = videoId;

		const placeholderStyle = useMemo(
			() => ({ backgroundImage: placeholderGradient(videoId) }),
			[videoId],
		);

		useEffect(() => {
			if (imageRef.current?.complete && imageRef.current.naturalWidth !== 0) {
				setImageStatus("success");
			}
		}, [setImageStatus]);

		useEffect(() => {
			const element = containerRef.current;
			if (!element) return;

			const setHovered = (hovered: boolean) => {
				const currentVideoId = latestVideoId.current;
				setPreviewState((state) => ({
					videoId: currentVideoId,
					hovered,
					status: state.videoId === currentVideoId ? state.status : "loading",
				}));
			};

			const handleMouseEnter = () => setHovered(true);
			const handleMouseLeave = () => setHovered(false);

			element.addEventListener("mouseenter", handleMouseEnter);
			element.addEventListener("mouseleave", handleMouseLeave);

			return () => {
				element.removeEventListener("mouseenter", handleMouseEnter);
				element.removeEventListener("mouseleave", handleMouseLeave);
			};
		}, []);

		const showError =
			!hasActiveUpload && (thumbnailUrl.isError || imageStatus === "error");
		const showLoading =
			hasActiveUpload || thumbnailUrl.isPending || imageStatus === "loading";
		const previewStatus =
			previewState.videoId === videoId ? previewState.status : "loading";
		const isPreviewHovered =
			previewState.videoId === videoId && previewState.hovered;
		const shouldShowPreview =
			showPreview &&
			isPreviewHovered &&
			!hasActiveUpload &&
			previewStatus !== "error";
		const setCurrentPreviewStatus = (status: ImageLoadingStatus) => {
			setPreviewState((state) => ({
				videoId,
				hovered: state.videoId === videoId ? state.hovered : false,
				status,
			}));
		};

		return (
			<div
				ref={containerRef}
				className={clsx(
					`overflow-hidden relative mx-auto w-full h-full bg-gray-3 rounded-t-xl border-b border-gray-3 aspect-video`,
					containerClass,
				)}
			>
				<div className="flex absolute inset-0 z-10 justify-center items-center">
					{showError ? (
						<div
							className="flex justify-center items-center w-full h-full"
							style={placeholderStyle}
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
								className="w-8 h-8 opacity-40 text-gray-12"
							>
								<rect
									x="2.5"
									y="5"
									width="19"
									height="14"
									rx="2.5"
									stroke="currentColor"
									strokeWidth="1.5"
								/>
								<path d="M10 9.5l4.5 2.5L10 14.5v-5z" fill="currentColor" />
							</svg>
						</div>
					) : (
						showLoading &&
						!thumbnailUrl.data && (
							<BrandSpinner className="w-5 h-auto animate-spin text-gray-9 md:w-6" />
						)
					)}
				</div>
				{thumbnailUrl.data && (
					<Image
						ref={imageRef}
						src={thumbnailUrl.data}
						unoptimized
						fill={true}
						sizes="(max-width: 768px) 100vw, 33vw"
						alt={alt}
						key={videoId}
						style={{ objectFit }}
						className={clsx(
							"w-full h-full rounded-t-xl",
							imageClass,
							imageStatus === "loading" && "opacity-0",
						)}
						onLoad={() => setImageStatus("success")}
						onError={() => setImageStatus("error")}
					/>
				)}
				{shouldShowPreview && (
					<Image
						key={`${videoId}-preview`}
						src={getPreviewGifSrc(videoId)}
						alt=""
						aria-hidden="true"
						unoptimized
						fill={true}
						loading="lazy"
						sizes="(max-width: 768px) 100vw, 33vw"
						className={clsx(
							"object-cover absolute inset-0 z-20 w-full h-full rounded-t-xl transition-opacity duration-150",
							previewStatus === "success" ? "opacity-100" : "opacity-0",
						)}
						onLoad={() => setCurrentPreviewStatus("success")}
						onError={() => setCurrentPreviewStatus("error")}
					/>
				)}
				{videoDuration && (
					<p className="absolute right-2 bottom-2 z-10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums leading-none text-white rounded-md bg-black/70">
						{formatDuration(videoDuration)}
					</p>
				)}
			</div>
		);
	},
);

import { faComment, faEye, faSmile } from "@fortawesome/free-solid-svg-icons";
import {
	FontAwesomeIcon,
	type FontAwesomeIconProps,
} from "@fortawesome/react-fontawesome";
import Link from "next/link";
import {
	type ComponentProps,
	type ForwardedRef,
	forwardRef,
	type PropsWithChildren,
} from "react";
import { Tooltip } from "@/components/Tooltip";
import { SHOW_ANALYTICS } from "@/lib/branding";

interface CapCardAnalyticsProps {
	capId: string;
	displayCount: number;
	totalComments: number;
	isLoadingAnalytics: boolean;
	totalReactions: number;
	isOwner?: boolean;
}

export const CapCardAnalytics = Object.assign(
	({
		capId,
		displayCount,
		totalComments,
		totalReactions,
		isLoadingAnalytics,
		isOwner = true,
	}: CapCardAnalyticsProps) =>
		!SHOW_ANALYTICS ? (
			<EngagementCounts
				totalComments={totalComments}
				totalReactions={totalReactions}
			/>
		) : isLoadingAnalytics ? (
			<CapCardAnalytics.Skeleton />
		) : (
			<Shell>
				{/* A brand-new recording has 0/0/0, which rendered as three bare zeros
				    plus a separate link — visually noisy and saying nothing. Collapse
				    that to one quiet line, and only show counters once something has
				    actually happened. */}
				{displayCount + totalComments + totalReactions === 0 ? (
					<span className="text-xs text-gray-9">No views yet</span>
				) : (
					<div className="flex flex-wrap gap-3.5 items-center">
						<Tooltip
							content="Views"
							className="bg-gray-12 text-gray-1 border-gray-11 shadow-lg"
							delayDuration={100}
						>
							<Link
								href={`/dashboard/analytics?capId=${capId}`}
								className="inline-flex cursor-pointer"
							>
								<IconItem icon={faEye}>
									<span className="text-xs tabular-nums text-gray-11">
										{displayCount}
									</span>
								</IconItem>
							</Link>
						</Tooltip>
						{totalComments > 0 && (
							<Tooltip
								content="Comments"
								className="bg-gray-12 text-gray-1 border-gray-11 shadow-lg"
								delayDuration={100}
							>
								<Link
									href={`/dashboard/analytics?capId=${capId}`}
									className="inline-flex cursor-pointer"
								>
									<IconItem icon={faComment}>
										<span className="text-xs tabular-nums text-gray-11">
											{totalComments}
										</span>
									</IconItem>
								</Link>
							</Tooltip>
						)}
						{totalReactions > 0 && (
							<Tooltip
								content="Reactions"
								className="bg-gray-12 text-gray-1 border-gray-11 shadow-lg"
								delayDuration={100}
							>
								<Link
									href={`/dashboard/analytics?capId=${capId}`}
									className="inline-flex cursor-pointer"
								>
									<IconItem icon={faSmile}>
										<span className="text-xs tabular-nums text-gray-11">
											{totalReactions}
										</span>
									</IconItem>
								</Link>
							</Tooltip>
						)}
					</div>
				)}
				{isOwner && (
					<Link
						href={`/dashboard/analytics?capId=${capId}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs transition-colors text-gray-9 hover:text-gray-12"
					>
						Analytics
					</Link>
				)}
			</Shell>
		),
	{
		Skeleton: () => (
			<Shell>
				<SkeletonItem icon={faEye} />
				<SkeletonItem icon={faComment} />
				<SkeletonItem icon={faSmile} />
			</Shell>
		),
	},
);

const Shell = (props: PropsWithChildren) => (
	<div className="flex gap-3 items-center justify-between text-sm text-gray-60">
		{props.children}
	</div>
);

const IconItem = forwardRef(
	(
		props: { icon: FontAwesomeIconProps["icon"] } & Pick<
			ComponentProps<"div">,
			"children"
		>,
		ref: ForwardedRef<HTMLDivElement>,
	) => (
		<div ref={ref} className="flex gap-1.5 items-center">
			<FontAwesomeIcon className="text-gray-9 size-3.5" icon={props.icon} />
			{props.children}
		</div>
	),
);

const SkeletonItem = ({ icon }: { icon: FontAwesomeIconProps["icon"] }) => (
	<IconItem icon={icon}>
		<div className="h-1.5 w-3 -mx-0.5 bg-gray-5 rounded-full animate-pulse" />
	</IconItem>
);

// Without Tinybird there are no view counts, so only the database-backed
// engagement is shown, and nothing at all until someone has commented or
// reacted.
const EngagementCounts = ({
	totalComments,
	totalReactions,
}: {
	totalComments: number;
	totalReactions: number;
}) => {
	if (totalComments + totalReactions === 0) return null;
	return (
		<div className="flex gap-3.5 items-center">
			{totalComments > 0 && (
				<IconItem icon={faComment}>
					<span className="text-xs tabular-nums text-gray-11">
						{totalComments}
						<span className="sr-only">
							{totalComments === 1 ? " comment" : " comments"}
						</span>
					</span>
				</IconItem>
			)}
			{totalReactions > 0 && (
				<IconItem icon={faSmile}>
					<span className="text-xs tabular-nums text-gray-11">
						{totalReactions}
						<span className="sr-only">
							{totalReactions === 1 ? " reaction" : " reactions"}
						</span>
					</span>
				</IconItem>
			)}
		</div>
	);
};

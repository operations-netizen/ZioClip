import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import moment from "moment";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { editDate } from "@/actions/videos/edit-date";
import { editTitle } from "@/actions/videos/edit-title";
import { Tooltip } from "@/components/Tooltip";
import type { CapCardProps } from "./CapCard";

interface CapContentProps {
	cap: CapCardProps["cap"];
	userId?: string;
	sharedCapCard?: boolean;
	hideSharedStatus?: boolean;
	isOwner: boolean;
	setIsSharingDialogOpen: (isSharingDialogOpen: boolean) => void;
}

export const CapCardContent: React.FC<CapContentProps> = ({
	cap,
	userId,
	sharedCapCard = false,
	hideSharedStatus,
	isOwner,
	setIsSharingDialogOpen,
}) => {
	const router = useRouter();
	const effectiveDate = cap.metadata?.customCreatedAt
		? new Date(cap.metadata.customCreatedAt)
		: cap.createdAt;

	const [dateValue, setDateValue] = useState(
		moment(effectiveDate).format("YYYY-MM-DD HH:mm:ss"),
	);
	const [isDateEditing, setIsDateEditing] = useState(false);
	const [showFullDate, setShowFullDate] = useState(false);
	const [title, setTitle] = useState(cap.name);
	const [isEditing, setIsEditing] = useState(false);

	const handleTitleBlur = async (capName: string) => {
		if (!title || capName === title) {
			setIsEditing(false);
			return;
		}

		try {
			await editTitle(cap.id, title);
			toast.success("Video title updated");
			setIsEditing(false);
			router.refresh();
		} catch (error) {
			if (error instanceof Error) {
				toast.error(error.message);
			} else {
				toast.error("Failed to update title - please try again.");
			}
		}
	};

	const handleDateClick = () => {
		if (userId === cap.ownerId) {
			if (!isDateEditing) {
				setIsDateEditing(true);
			}
		} else {
			setShowFullDate(!showFullDate);
		}
	};

	const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
		}
	};

	const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setDateValue(e.target.value);
	};

	const handleDateBlur = async () => {
		const isValidDate = moment(dateValue).isValid();

		if (!isValidDate) {
			toast.error("Invalid date format. Please use YYYY-MM-DD HH:mm:ss");
			setDateValue(moment(effectiveDate).format("YYYY-MM-DD HH:mm:ss"));
			setIsDateEditing(false);
			return;
		}

		const selectedDate = moment(dateValue);
		const currentDate = moment();

		if (selectedDate.isAfter(currentDate)) {
			toast.error("Cannot set a date in the future");
			setDateValue(moment(effectiveDate).format("YYYY-MM-DD HH:mm:ss"));
			setIsDateEditing(false);
			return;
		}

		if (selectedDate.isSame(effectiveDate)) {
			setIsDateEditing(false);
			return;
		}

		try {
			await editDate(cap.id, selectedDate.toISOString());
			toast.success("Video date updated");
			setIsDateEditing(false);
			router.refresh();
		} catch (error) {
			if (error instanceof Error) {
				toast.error(error.message);
			} else {
				toast.error("Failed to update date - please try again.");
			}
		}
	};

	const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleDateBlur();
		} else if (e.key === "Escape") {
			setDateValue(moment(effectiveDate).format("YYYY-MM-DD HH:mm:ss"));
			setIsDateEditing(false);
		}
	};

	const renderSharedStatus = () => {
		if (hideSharedStatus) return null;
		if (!isOwner) return <span className="truncate">Shared with you</span>;
		const hasSpaceSharing =
			(cap.sharedOrganizations?.length ?? 0) > 0 ||
			(cap.sharedSpaces?.length ?? 0) > 0;
		return (
			<button
				type="button"
				onClick={() => setIsSharingDialogOpen(true)}
				className="inline-flex gap-1 items-center truncate transition-colors hover:text-gray-12"
			>
				{hasSpaceSharing || cap.public ? "Shared" : "Not shared"}
				<FontAwesomeIcon className="size-2" icon={faChevronDown} />
			</button>
		);
	};

	const canEditTitle = !sharedCapCard && userId === cap.ownerId;
	const titleClassName =
		"text-sm font-medium leading-5 text-left break-words line-clamp-2 text-gray-12 min-h-[2.5rem]";

	return (
		<div className="flex flex-col gap-1 min-w-0">
			{isEditing && !sharedCapCard ? (
				<textarea
					rows={2}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={() => handleTitleBlur(cap.name)}
					onKeyDown={(e) => handleTitleKeyDown(e)}
					aria-label="Recording title"
					className="p-0 m-0 w-full text-sm font-medium leading-5 bg-transparent border-0 resize-none outline-0 text-gray-12 font-[inherit] min-h-[2.5rem]"
				/>
			) : canEditTitle ? (
				<button
					type="button"
					title={title}
					className={titleClassName}
					onClick={() => setIsEditing(true)}
				>
					{title}
				</button>
			) : (
				<p className={titleClassName} title={title}>
					{title}
				</p>
			)}
			<div className="flex gap-1.5 items-center min-w-0 h-5 text-xs text-gray-10">
				{isDateEditing && !sharedCapCard ? (
					<input
						type="text"
						value={dateValue}
						onChange={handleDateChange}
						onBlur={handleDateBlur}
						onKeyDown={handleDateKeyDown}
						aria-label="Recording date"
						className="w-40 text-xs bg-transparent text-gray-11 focus:outline-none"
						placeholder="YYYY-MM-DD HH:mm:ss"
					/>
				) : (
					<Tooltip content={`Created ${moment(effectiveDate).format("LLL")}`}>
						<button
							type="button"
							className="shrink-0 transition-colors hover:text-gray-12"
							onClick={handleDateClick}
						>
							{showFullDate
								? moment(effectiveDate).format("YYYY-MM-DD HH:mm:ss")
								: moment(effectiveDate).fromNow()}
						</button>
					</Tooltip>
				)}
				{!hideSharedStatus && (
					<span aria-hidden="true" className="text-gray-8">
						·
					</span>
				)}
				{renderSharedStatus()}
			</div>
		</div>
	);
};

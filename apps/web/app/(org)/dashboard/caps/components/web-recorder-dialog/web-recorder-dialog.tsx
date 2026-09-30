"use client";

import { acquireCameraStream } from "@cap/recorder-core/capture-streams";
import { detectSystemAudioSupport } from "@cap/recorder-core/recorder-utils";
import {
	Button,
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@cap/ui";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { MonitorIcon } from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { ENFORCE_RECORDING_LENGTH_LIMIT } from "@/lib/branding";
import { useDashboardContext } from "../../../Contexts";
import { CameraSelector } from "./CameraSelector";
import { HowItWorksButton } from "./HowItWorksButton";
import { HowItWorksPanel } from "./HowItWorksPanel";
import { InProgressRecordingBar } from "./InProgressRecordingBar";
import { MicrophoneSelector } from "./MicrophoneSelector";
import { RecordingButton } from "./RecordingButton";
import { RecordingCountdown } from "./RecordingCountdown";
import { RecordingLayoutPreview } from "./RecordingLayoutPreview";
import { RecordingReview } from "./RecordingReview";
import {
	type RecordingSource,
	RecordingSourcePicker,
	recordingSourceUsesCamera,
	recordingSourceUsesScreen,
} from "./RecordingSourcePicker";
import { SettingsButton } from "./SettingsButton";
import { SettingsPanel } from "./SettingsPanel";
import { SystemAudioToggle } from "./SystemAudioToggle";
import { useCameraDevices } from "./useCameraDevices";
import { useDevicePreferences } from "./useDevicePreferences";
import { useDialogInteractions } from "./useDialogInteractions";
import { useMicrophoneDevices } from "./useMicrophoneDevices";
import { useWebRecorder } from "./useWebRecorder";
import {
	dialogVariants,
	FREE_PLAN_MAX_RECORDING_MS,
	type RecordingMode,
} from "./web-recorder-constants";
import { WebRecorderDialogHeader } from "./web-recorder-dialog-header";

/** Clamps a drag offset so the panel can't be dragged fully off-screen. */
const clampOffset = (value: number, limit: number) =>
	Math.min(Math.max(value, -limit), limit);

const recoveredRecordingTimeFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

const waitForNextFrame = () =>
	new Promise<void>((resolve) => {
		if (typeof window === "undefined") {
			resolve();
			return;
		}

		window.requestAnimationFrame(() => resolve());
	});

const OPEN_WEB_RECORDER_EVENT = "web-recorder:open";

// A page can ask for the recorder in its own mount effect, which runs before
// the dashboard-level dialog has subscribed; the dialog picks this up on mount.
let pendingOpenRequest = false;

/**
 * Opens the dashboard's recorder. The dashboard layout mounts a single
 * `WebRecorderDialog` (so a recording survives navigating between dashboard
 * pages); every "New Recording" button calls this instead of mounting its own.
 */
export const openWebRecorder = () => {
	pendingOpenRequest = true;
	window.dispatchEvent(new Event(OPEN_WEB_RECORDER_EVENT));
};

export const WebRecorderDialog = ({
	/**
	 * Optional custom trigger element. When omitted, the default
	 * "Record in Browser" button is rendered, so existing call sites are
	 * unaffected. Passing a node lets a caller (e.g. the record page's option
	 * card) act as the trigger itself.
	 */
	trigger,
	hideTrigger = false,
}: {
	trigger?: React.ReactNode;
	hideTrigger?: boolean;
} = {}) => {
	const [open, setOpen] = useState(false);
	// Hides the recorder panel (and its dimming overlay) while a recording is in
	// progress, so it doesn't sit on top of whatever is being recorded. This is
	// purely presentational: the recorder keeps running, and the floating
	// in-progress bar remains available to pause/stop/restore. Kept separate
	// from `open` because closing the dialog calls resetState(), which would
	// discard the recording.
	const [panelHidden, setPanelHidden] = useState(false);
	// Drag offset applied on top of DialogContent's centred position, so the
	// panel can be moved off whatever it's covering. Mirrors the drag behaviour
	// of InProgressRecordingBar.
	const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
	const [isDraggingPanel, setIsDraggingPanel] = useState(false);
	const panelDragStartRef = useRef({ x: 0, y: 0 });
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const [source, setSource] = useState<RecordingSource>("screen");
	const [recordingMode, setRecordingMode] =
		useState<RecordingMode>("fullscreen");
	const usesCamera = recordingSourceUsesCamera(source);
	const usesScreen = recordingSourceUsesScreen(source);
	const [cameraSelectOpen, setCameraSelectOpen] = useState(false);
	const [micSelectOpen, setMicSelectOpen] = useState(false);
	const dialogContentRef = useRef<HTMLDivElement>(null);
	const startSoundRef = useRef<HTMLAudioElement | null>(null);
	const stopSoundRef = useRef<HTMLAudioElement | null>(null);
	const setupCameraStreamRef = useRef<MediaStream | null>(null);
	const [setupCameraStream, setSetupCameraStream] =
		useState<MediaStream | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const startSound = new Audio("/sounds/start-recording.ogg");
		startSound.preload = "auto";
		const stopSound = new Audio("/sounds/stop-recording.ogg");
		stopSound.preload = "auto";

		startSoundRef.current = startSound;
		stopSoundRef.current = stopSound;

		return () => {
			startSound.pause();
			stopSound.pause();
			startSoundRef.current = null;
			stopSoundRef.current = null;
		};
	}, []);

	const playAudio = useCallback((audio: HTMLAudioElement | null) => {
		if (!audio) {
			return;
		}
		audio.currentTime = 0;
		void audio.play().catch(() => {
			/* ignore */
		});
	}, []);

	const handleRecordingStartSound = useCallback(() => {
		playAudio(startSoundRef.current);
	}, [playAudio]);

	const handleRecordingStopSound = useCallback(() => {
		playAudio(stopSoundRef.current);
	}, [playAudio]);

	const { activeOrganization, user } = useDashboardContext();
	const organisationId = activeOrganization?.organization.id;
	const { devices: availableMics, refresh: refreshMics } =
		useMicrophoneDevices(open);
	const { devices: availableCameras, refresh: refreshCameras } =
		useCameraDevices(open);

	const {
		rememberDevices,
		selectedCameraId,
		selectedMicId,
		systemAudioEnabled,
		setSelectedCameraId,
		handleCameraChange,
		handleMicChange,
		handleSystemAudioChange,
		handleRememberDevicesChange,
	} = useDevicePreferences({
		open,
		availableCameras,
		availableMics,
	});

	const micEnabled = selectedMicId !== null;
	// Resolved after mount (navigator only exists on the client); Chromium is
	// assumed until then so the common case doesn't flash "Unavailable".
	const [systemAudioSupported, setSystemAudioSupported] = useState(true);
	useEffect(() => {
		setSystemAudioSupported(detectSystemAudioSupport());
	}, []);

	const selectSource = useCallback((next: RecordingSource) => {
		setSource(next);
		setRecordingMode(next === "camera" ? "camera" : "fullscreen");
	}, []);

	useEffect(() => {
		if (usesCamera && !selectedCameraId && availableCameras.length > 0) {
			setSelectedCameraId(availableCameras[0]?.deviceId ?? null);
		}
	}, [usesCamera, selectedCameraId, availableCameras, setSelectedCameraId]);

	const handleCameraSelection = useCallback(
		(cameraId: string | null) => {
			handleCameraChange(cameraId);
			if (!cameraId && source !== "screen") selectSource("screen");
		},
		[handleCameraChange, source, selectSource],
	);

	const {
		phase,
		durationMs,
		hasAudioTrack,
		chunkUploads,
		errorDownload,
		completedShareUrl,
		recoveredDownloads,
		isSettingUp,
		isRecording,
		isBusy,
		isRestarting,
		canStartRecording,
		isBrowserSupported,
		unsupportedReason,
		supportsDisplayRecording,
		supportCheckCompleted,
		screenCaptureWarning,
		countdownRemaining,
		cancelCountdown,
		preview,
		uploadPreview,
		discardPreview,
		cameraPreviewStream,
		startRecording,
		pauseRecording,
		resumeRecording,
		stopRecording,
		openCompletedShareUrl,
		restartRecording,
		resetState,
		dismissRecoveredDownload,
	} = useWebRecorder({
		organisationId,
		selectedMicId,
		micEnabled,
		systemAudioEnabled: systemAudioEnabled && systemAudioSupported,
		recordingMode,
		selectedCameraId,
		cameraOverlayEnabled: source === "screenCamera",
		isProUser: user.isPro,
		onRecordingSurfaceDetected: (mode) => {
			setRecordingMode(mode);
		},
		onRecordingStart: handleRecordingStartSound,
		onRecordingStop: handleRecordingStopSound,
		// Getting the panel out of the way before the first frame is the only
		// reliable way to keep it (and its camera preview) out of a screen or
		// window capture that includes this tab; the browser cannot exclude
		// page content from getDisplayMedia.
		onCountdownComplete: () => {
			if (usesScreen) setPanelHidden(true);
		},
	});

	useEffect(() => {
		if (
			!supportCheckCompleted ||
			supportsDisplayRecording ||
			recordingMode === "camera"
		) {
			return;
		}

		selectSource("camera");
	}, [
		supportCheckCompleted,
		supportsDisplayRecording,
		recordingMode,
		selectSource,
	]);

	const releaseSetupCamera = useCallback(() => {
		for (const track of setupCameraStreamRef.current?.getTracks() ?? []) {
			track.stop();
		}
		setupCameraStreamRef.current = null;
		setSetupCameraStream(null);
	}, []);

	const wantsSetupCamera =
		open && usesCamera && Boolean(selectedCameraId) && phase === "idle";

	useEffect(() => {
		if (!wantsSetupCamera || !selectedCameraId) {
			releaseSetupCamera();
			return;
		}
		let cancelled = false;
		acquireCameraStream(selectedCameraId)
			.then((stream) => {
				if (cancelled) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}
				releaseSetupCamera();
				setupCameraStreamRef.current = stream;
				setSetupCameraStream(stream);
			})
			.catch((error) => {
				console.warn("Camera preview unavailable", error);
			});
		return () => {
			cancelled = true;
		};
	}, [wantsSetupCamera, selectedCameraId, releaseSetupCamera]);

	useEffect(() => releaseSetupCamera, [releaseSetupCamera]);

	const {
		handlePointerDownOutside,
		handleFocusOutside,
		handleInteractOutside,
	} = useDialogInteractions({
		dialogContentRef,
		isRecording,
		isBusy,
	});

	const handleOpenChange = (next: boolean) => {
		if (next && supportCheckCompleted && !isBrowserSupported) {
			toast.error(
				"This browser can't record in the browser. Use a recent version of Chrome or Edge; Firefox also supports camera recording.",
			);
			return;
		}

		if (!next && isBusy) {
			toast.info("Keep this dialog open while your upload finishes.");
			return;
		}

		if (!next && phase === "preview") {
			toast.info("Upload or discard this recording first.");
			return;
		}

		if (!next) {
			void resetState();
			releaseSetupCamera();
			setSelectedCameraId(null);
			selectSource("screen");
			setSettingsOpen(false);
			setHowItWorksOpen(false);
		}
		setOpen(next);
	};

	const openRequestRef = useRef<() => void>(() => {});
	openRequestRef.current = () => {
		if (!open) handleOpenChange(true);
	};

	useEffect(() => {
		const handleOpenRequest = () => {
			pendingOpenRequest = false;
			openRequestRef.current();
		};
		if (pendingOpenRequest) handleOpenRequest();
		window.addEventListener(OPEN_WEB_RECORDER_EVENT, handleOpenRequest);
		return () =>
			window.removeEventListener(OPEN_WEB_RECORDER_EVENT, handleOpenRequest);
	}, []);

	const handleStopClick = () => {
		stopRecording().catch((err: unknown) => {
			console.error("Stop recording error", err);
		});
	};

	const handleStartClick = useCallback(async () => {
		if (usesCamera && !selectedCameraId) {
			toast.error("Select a camera before recording.");
			return;
		}
		if (usesCamera) {
			releaseSetupCamera();
			await waitForNextFrame();
		}

		await startRecording();
	}, [usesCamera, selectedCameraId, releaseSetupCamera, startRecording]);

	const handleClose = () => {
		if (!isBusy) {
			handleOpenChange(false);
		}
	};

	const handleSettingsOpen = () => {
		setSettingsOpen(true);
		setHowItWorksOpen(false);
	};

	const handleHowItWorksOpen = () => {
		setHowItWorksOpen(true);
		setSettingsOpen(false);
	};

	// Bring the panel back as soon as recording ends, so the upload progress and
	// the resulting share link are never left hidden. The countdown is exempt:
	// the panel is hidden at its end, just before the recorder starts.
	useEffect(() => {
		if (!isRecording && phase !== "countdown" && panelHidden) {
			setPanelHidden(false);
		}
	}, [isRecording, phase, panelHidden]);

	// Start a panel drag. Ignores presses on interactive controls (and anything
	// marked [data-no-drag]) so the mode rows, selectors and buttons keep working.
	const handlePanelDragStart = useCallback(
		(event: ReactMouseEvent<HTMLElement>) => {
			if (event.button !== 0) return;
			if (
				// NB: don't match [role="dialog"] here — that's the panel's own
				// container, so closest() would match for every child and no drag
				// would ever start.
				(event.target as HTMLElement)?.closest(
					'button, a, input, select, textarea, [role="button"], [role="menu"], [role="menuitem"], [data-no-drag]',
				)
			) {
				return;
			}

			event.preventDefault();
			panelDragStartRef.current = {
				x: event.clientX - panelOffset.x,
				y: event.clientY - panelOffset.y,
			};
			setIsDraggingPanel(true);
		},
		[panelOffset],
	);

	useEffect(() => {
		if (!isDraggingPanel) return;

		const handleMouseMove = (event: MouseEvent) => {
			const rect = dialogContentRef.current?.getBoundingClientRect();
			const width = rect?.width ?? 300;
			const height = rect?.height ?? 350;
			// Keep at least a sliver of the panel on screen in every direction.
			const maxX = Math.max(0, (window.innerWidth - width) / 2);
			const maxY = Math.max(0, (window.innerHeight - height) / 2);

			setPanelOffset({
				x: clampOffset(event.clientX - panelDragStartRef.current.x, maxX),
				y: clampOffset(event.clientY - panelDragStartRef.current.y, maxY),
			});
		};
		const stop = () => setIsDraggingPanel(false);

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", stop);
		window.addEventListener("blur", stop);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", stop);
			window.removeEventListener("blur", stop);
		};
	}, [isDraggingPanel]);

	const isCountdown = phase === "countdown";
	const showInProgressBar =
		!isCountdown && (isRecording || isBusy || phase === "error");
	const isReviewing = phase === "preview" && preview !== null;
	const layoutPreviewStream =
		isRecording || isCountdown ? cameraPreviewStream : setupCameraStream;
	// Count up when there's no cap; count down towards the cap when enforced.
	const recordingTimerDisplayMs =
		user.isPro || !ENFORCE_RECORDING_LENGTH_LIMIT
			? durationMs
			: Math.max(0, FREE_PLAN_MAX_RECORDING_MS - durationMs);

	return (
		<>
			<Dialog open={open && !panelHidden} onOpenChange={handleOpenChange}>
				{!hideTrigger && (
					<DialogTrigger asChild>
						{trigger ?? (
							<Button
								variant="blue"
								size="sm"
								className="flex items-center gap-2"
							>
								<MonitorIcon className="size-3.5" />
								Record in Browser
							</Button>
						)}
					</DialogTrigger>
				)}
				<DialogContent
					ref={dialogContentRef}
					className={clsx(
						"max-w-[calc(100vw-2rem)] border-none bg-transparent p-0 [&>button]:hidden",
						isReviewing ? "w-[720px]" : "w-[360px]",
					)}
					// Re-declares DialogContent's own centring style (this spread wins
					// over it) and folds in the drag offset.
					style={{
						position: "fixed",
						top: "50%",
						left: "50%",
						transform: `translate(calc(-50% + ${panelOffset.x}px), calc(-50% + ${panelOffset.y}px))`,
					}}
					onPointerDownOutside={handlePointerDownOutside}
					onFocusOutside={handleFocusOutside}
					onInteractOutside={handleInteractOutside}
				>
					<DialogTitle className="sr-only">Recorder</DialogTitle>
					<AnimatePresence mode="wait">
						{open && (
							<motion.div
								variants={dialogVariants}
								initial="hidden"
								animate="visible"
								exit="exit"
								onMouseDown={handlePanelDragStart}
								className={clsx(
									"relative flex flex-col gap-3 p-4 text-[0.875rem] font-[400] text-gray-12 bg-gray-1 rounded-2xl border border-gray-4 shadow-xl",
									isDraggingPanel
										? "cursor-grabbing select-none"
										: "cursor-grab",
								)}
							>
								{isCountdown ? (
									<RecordingCountdown
										remaining={countdownRemaining}
										onCancel={cancelCountdown}
									/>
								) : isReviewing && preview ? (
									<>
										<WebRecorderDialogHeader
											title="Review your recording"
											isBusy={false}
											onClose={handleClose}
										/>
										<RecordingReview
											preview={preview}
											onUpload={(title) => void uploadPreview(title)}
											onDiscard={() => void discardPreview()}
										/>
									</>
								) : (
									<>
										<SettingsPanel
											open={settingsOpen}
											rememberDevices={rememberDevices}
											onClose={() => setSettingsOpen(false)}
											onRememberDevicesChange={handleRememberDevicesChange}
										/>
										<HowItWorksPanel
											open={howItWorksOpen}
											onClose={() => setHowItWorksOpen(false)}
										/>
										<WebRecorderDialogHeader
											title={isRecording ? "Recording" : "New recording"}
											isBusy={isBusy}
											onClose={handleClose}
											canHide={isRecording}
											onHide={() => setPanelHidden(true)}
											actions={
												<SettingsButton
													visible={!settingsOpen}
													onClick={handleSettingsOpen}
												/>
											}
										/>
										<SectionLabel>What to record</SectionLabel>
										<RecordingSourcePicker
											value={source}
											disabled={isBusy || isSettingUp}
											screenSupported={supportsDisplayRecording}
											onChange={selectSource}
										/>
										{screenCaptureWarning && (
											<div className="rounded-md border border-amber-6 bg-amber-3/60 px-3 py-2 text-xs leading-snug text-amber-12">
												{screenCaptureWarning}
											</div>
										)}
										{usesCamera && (
											<RecordingLayoutPreview
												source={source}
												stream={layoutPreviewStream}
												live={isRecording}
											/>
										)}
										{usesCamera && (
											<CameraSelector
												selectedCameraId={selectedCameraId}
												availableCameras={availableCameras}
												dialogOpen={open}
												disabled={isBusy}
												open={cameraSelectOpen}
												onOpenChange={(isOpen) => {
													setCameraSelectOpen(isOpen);
													if (isOpen) {
														setMicSelectOpen(false);
													}
												}}
												onCameraChange={handleCameraSelection}
												onRefreshDevices={refreshCameras}
											/>
										)}
										<SectionLabel className="mt-1">Audio</SectionLabel>
										<MicrophoneSelector
											selectedMicId={selectedMicId}
											availableMics={availableMics}
											dialogOpen={open}
											disabled={isBusy}
											open={micSelectOpen}
											onOpenChange={(isOpen) => {
												setMicSelectOpen(isOpen);
												if (isOpen) {
													setCameraSelectOpen(false);
												}
											}}
											onMicChange={handleMicChange}
											onRefreshDevices={refreshMics}
										/>
										{usesScreen && (
											<SystemAudioToggle
												enabled={systemAudioEnabled}
												disabled={isBusy}
												recordingMode={recordingMode}
												supported={systemAudioSupported}
												onToggle={handleSystemAudioChange}
											/>
										)}
										<RecordingButton
											isRecording={isRecording}
											disabled={!canStartRecording || (isBusy && !isRecording)}
											onStart={handleStartClick}
											onStop={handleStopClick}
										/>
										{!isBrowserSupported && unsupportedReason && (
											<div className="rounded-md border border-red-6 bg-red-3/70 px-3 py-2 text-xs leading-snug text-red-12">
												{unsupportedReason}
											</div>
										)}
										{phase === "completed" && completedShareUrl && (
											<div className="rounded-md border border-green-6 bg-green-3/70 px-3 py-3 text-xs text-green-12">
												<div className="font-medium">Share link ready</div>
												<div className="mt-1 leading-snug">
													If it did not open automatically, open it here.
												</div>
												<Button
													variant="blue"
													size="sm"
													className="mt-3 w-full"
													onClick={openCompletedShareUrl}
												>
													Open Share Link
												</Button>
											</div>
										)}
										{phase === "idle" && recoveredDownloads.length > 0 && (
											<div className="rounded-md border border-blue-6 bg-blue-3/60 px-3 py-2">
												<div className="text-xs font-medium text-blue-12">
													Recovered recordings
												</div>
												<div className="mt-2 flex flex-col gap-2">
													{recoveredDownloads.map((download) => (
														<div
															key={download.id}
															className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-2.5 py-2 text-xs text-gray-12"
														>
															<div className="min-w-0">
																<div className="truncate font-medium">
																	{download.fileName}
																</div>
																<div className="text-gray-10">
																	{recoveredRecordingTimeFormatter.format(
																		new Date(download.createdAt),
																	)}
																</div>
															</div>
															<div className="flex shrink-0 items-center gap-3">
																<a
																	href={download.url}
																	download={download.fileName}
																	className="font-medium text-blue-11 hover:text-blue-12"
																	onClick={() =>
																		setTimeout(
																			() =>
																				dismissRecoveredDownload(download.id),
																			500,
																		)
																	}
																>
																	Download
																</a>
																<button
																	type="button"
																	className="text-gray-10 hover:text-gray-12"
																	onClick={() =>
																		dismissRecoveredDownload(download.id)
																	}
																>
																	Dismiss
																</button>
															</div>
														</div>
													))}
												</div>
											</div>
										)}
										<HowItWorksButton onClick={handleHowItWorksOpen} />
									</>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</DialogContent>
			</Dialog>
			{showInProgressBar && (
				<InProgressRecordingBar
					phase={phase}
					durationMs={recordingTimerDisplayMs}
					hasAudioTrack={hasAudioTrack}
					chunkUploads={chunkUploads}
					errorDownload={errorDownload}
					onStop={handleStopClick}
					onPause={pauseRecording}
					onResume={resumeRecording}
					onRestart={restartRecording}
					isRestarting={isRestarting}
					onShowRecorder={panelHidden ? () => setPanelHidden(false) : undefined}
				/>
			)}
		</>
	);
};

const SectionLabel = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<p
		aria-hidden="true"
		className={clsx("-mb-1 text-xs font-medium text-gray-10", className)}
	>
		{children}
	</p>
);

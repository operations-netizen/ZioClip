export type Size = { width: number; height: number };

export type CameraOverlayRect = {
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
};

export const CAMERA_OVERLAY_WIDTH_RATIO = 0.22;
export const CAMERA_OVERLAY_MAX_HEIGHT_RATIO = 0.4;
export const CAMERA_OVERLAY_MARGIN_RATIO = 24 / 1920;
export const CAMERA_OVERLAY_RADIUS_RATIO = 0.12;
export const COMPOSITE_MAX_SIZE: Size = { width: 1920, height: 1080 };
export const COMPOSITE_MAX_FRAME_RATE = 30;

const FALLBACK_ASPECT = 16 / 9;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export function getCompositeOutputSize(
	screen: Partial<Size>,
	max: Size = COMPOSITE_MAX_SIZE,
): Size {
	const width =
		screen.width && screen.width > 0 ? screen.width : COMPOSITE_MAX_SIZE.width;
	const height =
		screen.height && screen.height > 0
			? screen.height
			: COMPOSITE_MAX_SIZE.height;
	const scale = Math.min(1, max.width / width, max.height / height);
	return { width: even(width * scale), height: even(height * scale) };
}

/**
 * Camera overlay placement shared by the compositor and the recorder's layout
 * preview, so what the user sees while recording is where the camera lands in
 * the final video: bottom-right, a fixed share of the frame width, camera
 * aspect preserved (never stretched), margin and corner radius scaled with the
 * output size.
 */
export function getCameraOverlayRect(
	frame: Size,
	camera: Partial<Size>,
): CameraOverlayRect {
	const aspect =
		camera.width && camera.height && camera.width > 0 && camera.height > 0
			? camera.width / camera.height
			: FALLBACK_ASPECT;
	let width = frame.width * CAMERA_OVERLAY_WIDTH_RATIO;
	let height = width / aspect;
	const maxHeight = frame.height * CAMERA_OVERLAY_MAX_HEIGHT_RATIO;
	if (height > maxHeight) {
		height = maxHeight;
		width = height * aspect;
	}
	const margin = Math.max(4, frame.width * CAMERA_OVERLAY_MARGIN_RATIO);
	return {
		x: Math.round(frame.width - margin - width),
		y: Math.round(frame.height - margin - height),
		width: Math.round(width),
		height: Math.round(height),
		radius: Math.round(Math.min(width, height) * CAMERA_OVERLAY_RADIUS_RATIO),
	};
}

export type CompositorStats = {
	mode: "insertable-streams" | "canvas";
	outputFrames: number;
	screenFrames: number;
	cameraFrames: number;
	skippedBusyFrames: number;
	averageDrawMs: number;
	// Insertable-streams only: how old the camera frame is when it is drawn,
	// and how long handing the composite to the generator takes. MediaRecorder
	// timestamps generator frames on arrival, so both add directly to video
	// latency relative to the (capture-timestamped) microphone.
	averageCameraAgeMs?: number;
	averageWriteMs?: number;
};

export interface ScreenCameraCompositor {
	readonly track: MediaStreamTrack;
	readonly size: Size;
	readonly frameRate: number;
	setPaused(paused: boolean): void;
	getStats(): CompositorStats;
	stop(): void;
}

type DrawSource = CanvasImageSource & object;
type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawComposite(
	ctx: Canvas2D,
	size: Size,
	screen: { source: DrawSource; width: number; height: number },
	camera: { source: DrawSource; width: number; height: number } | null,
) {
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, size.width, size.height);

	if (screen.width > 0 && screen.height > 0) {
		const scale = Math.min(
			size.width / screen.width,
			size.height / screen.height,
		);
		const drawWidth = screen.width * scale;
		const drawHeight = screen.height * scale;
		ctx.drawImage(
			screen.source,
			(size.width - drawWidth) / 2,
			(size.height - drawHeight) / 2,
			drawWidth,
			drawHeight,
		);
	}

	if (!camera || camera.width <= 0 || camera.height <= 0) return;
	const rect = getCameraOverlayRect(size, camera);
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(rect.x, rect.y, rect.width, rect.height, rect.radius);
	ctx.clip();
	ctx.drawImage(camera.source, rect.x, rect.y, rect.width, rect.height);
	ctx.restore();
}

type FrameReader = ReadableStreamDefaultReader<VideoFrame>;

type TrackProcessorConstructor = new (init: {
	track: MediaStreamTrack;
}) => { readable: ReadableStream<VideoFrame> };

type TrackGenerator = MediaStreamTrack & {
	writable: WritableStream<VideoFrame>;
};

type TrackGeneratorConstructor = new (init: {
	kind: "video";
}) => TrackGenerator;

const getInsertableStreams = () => {
	const scope = globalThis as unknown as {
		MediaStreamTrackProcessor?: TrackProcessorConstructor;
		MediaStreamTrackGenerator?: TrackGeneratorConstructor;
		VideoFrame?: unknown;
	};
	if (
		typeof scope.MediaStreamTrackProcessor !== "function" ||
		typeof scope.MediaStreamTrackGenerator !== "function" ||
		typeof scope.VideoFrame !== "function"
	) {
		return null;
	}
	return {
		Processor: scope.MediaStreamTrackProcessor,
		Generator: scope.MediaStreamTrackGenerator,
	};
};

export const supportsInsertableCompositing = () =>
	getInsertableStreams() !== null;

type CompositorOptions = {
	screenTrack: MediaStreamTrack;
	cameraTrack: MediaStreamTrack;
	maxSize?: Size;
	maxFrameRate?: number;
};

const createStats = (mode: CompositorStats["mode"]) => {
	let drawMsTotal = 0;
	const stats = {
		mode,
		outputFrames: 0,
		screenFrames: 0,
		cameraFrames: 0,
		skippedBusyFrames: 0,
	};
	return {
		stats,
		recordDraw(ms: number) {
			drawMsTotal += ms;
			stats.outputFrames += 1;
		},
		snapshot(): CompositorStats {
			return {
				...stats,
				averageDrawMs:
					stats.outputFrames > 0
						? Math.round((drawMsTotal / stats.outputFrames) * 100) / 100
						: 0,
			};
		},
	};
};

// Frame-driven rather than timer- or rAF-driven: reading VideoFrames straight
// off the tracks keeps compositing alive while the recorder tab sits in the
// background (the usual case when recording another window), where
// requestAnimationFrame stops and timers are throttled to once a second. Output
// frames are only produced when the screen or camera delivers a new frame,
// capped at maxFrameRate, so a static screen with the camera off-frame costs
// nothing extra.
function createInsertableCompositor(
	{
		screenTrack,
		cameraTrack,
		maxSize = COMPOSITE_MAX_SIZE,
		maxFrameRate = COMPOSITE_MAX_FRAME_RATE,
	}: CompositorOptions,
	streams: NonNullable<ReturnType<typeof getInsertableStreams>>,
): ScreenCameraCompositor {
	const size = getCompositeOutputSize(screenTrack.getSettings(), maxSize);
	const canvas =
		typeof OffscreenCanvas === "function"
			? new OffscreenCanvas(size.width, size.height)
			: Object.assign(document.createElement("canvas"), size);
	const ctx = canvas.getContext("2d", { alpha: false }) as Canvas2D | null;
	if (!ctx) throw new Error("Canvas 2D is unavailable for compositing");

	const generator = new streams.Generator({ kind: "video" });
	const writer = generator.writable.getWriter();
	const readers: FrameReader[] = [];
	const { stats, recordDraw, snapshot } = createStats("insertable-streams");
	const minIntervalMs = 1000 / maxFrameRate;

	let screenFrame: VideoFrame | null = null;
	let cameraFrame: VideoFrame | null = null;
	let cameraArrivedAt = 0;
	let cameraAgeTotal = 0;
	let cameraAgeCount = 0;
	let writeMsTotal = 0;
	let writeCount = 0;
	let lastEmitAt = Number.NEGATIVE_INFINITY;
	let trailingTimer: ReturnType<typeof setTimeout> | null = null;
	let writing = false;
	let paused = false;
	let stopped = false;

	const emit = async () => {
		if (stopped || paused || !screenFrame) return;
		const now = performance.now();
		const wait = minIntervalMs - (now - lastEmitAt);
		if (wait > 0) {
			trailingTimer ??= setTimeout(() => {
				trailingTimer = null;
				void emit();
			}, wait);
			return;
		}
		if (writing) {
			stats.skippedBusyFrames += 1;
			return;
		}
		lastEmitAt = now;
		writing = true;
		const drawStart = performance.now();
		drawComposite(
			ctx,
			size,
			{
				source: screenFrame,
				width: screenFrame.displayWidth,
				height: screenFrame.displayHeight,
			},
			cameraFrame
				? {
						source: cameraFrame,
						width: cameraFrame.displayWidth,
						height: cameraFrame.displayHeight,
					}
				: null,
		);
		const output = new VideoFrame(canvas, {
			timestamp: Math.round(now * 1000),
		});
		recordDraw(performance.now() - drawStart);
		if (cameraFrame) {
			cameraAgeTotal += drawStart - cameraArrivedAt;
			cameraAgeCount += 1;
		}
		const writeStart = performance.now();
		try {
			await writer.write(output);
		} catch {
			/* generator closed while stopping */
		} finally {
			writeMsTotal += performance.now() - writeStart;
			writeCount += 1;
			output.close();
			writing = false;
		}
	};

	const pump = async (
		track: MediaStreamTrack,
		onFrame: (frame: VideoFrame) => void,
	) => {
		const reader = new streams.Processor({ track }).readable.getReader();
		readers.push(reader);
		try {
			while (!stopped) {
				const { value, done } = await reader.read();
				if (done || !value) break;
				if (stopped) {
					value.close();
					break;
				}
				onFrame(value);
			}
		} catch {
			/* track ended or reader cancelled */
		}
	};

	void pump(screenTrack, (frame) => {
		screenFrame?.close();
		screenFrame = frame;
		stats.screenFrames += 1;
		void emit();
	});
	void pump(cameraTrack, (frame) => {
		cameraFrame?.close();
		cameraFrame = frame;
		cameraArrivedAt = performance.now();
		stats.cameraFrames += 1;
		void emit();
	});

	const round = (value: number) => Math.round(value * 100) / 100;
	return {
		track: generator,
		size,
		frameRate: maxFrameRate,
		setPaused(value) {
			paused = value;
			if (!value) void emit();
		},
		getStats: () => ({
			...snapshot(),
			averageCameraAgeMs:
				cameraAgeCount > 0 ? round(cameraAgeTotal / cameraAgeCount) : 0,
			averageWriteMs: writeCount > 0 ? round(writeMsTotal / writeCount) : 0,
		}),
		stop() {
			if (stopped) return;
			stopped = true;
			if (trailingTimer) clearTimeout(trailingTimer);
			for (const reader of readers) void reader.cancel().catch(() => {});
			screenFrame?.close();
			cameraFrame?.close();
			screenFrame = null;
			cameraFrame = null;
			void writer.close().catch(() => {});
			generator.stop();
		},
	};
}

// Browsers without insertable streams (Firefox, Safari): draw <video> elements
// onto a canvas and capture it. A worker drives the ticks because worker timers
// are not throttled the way a background tab's main-thread timers are.
async function createCanvasCompositor({
	screenTrack,
	cameraTrack,
	maxSize = COMPOSITE_MAX_SIZE,
	maxFrameRate = COMPOSITE_MAX_FRAME_RATE,
}: CompositorOptions): Promise<ScreenCameraCompositor> {
	const size = getCompositeOutputSize(screenTrack.getSettings(), maxSize);
	const canvas = Object.assign(document.createElement("canvas"), size);
	const ctx = canvas.getContext("2d", { alpha: false });
	if (!ctx) throw new Error("Canvas 2D is unavailable for compositing");

	const makeVideo = async (track: MediaStreamTrack) => {
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = new MediaStream([track]);
		await video.play().catch(() => {});
		return video;
	};
	const screenVideo = await makeVideo(screenTrack);
	const cameraVideo = await makeVideo(cameraTrack);
	const { recordDraw, snapshot } = createStats("canvas");
	const output = canvas.captureStream(maxFrameRate);
	const [track] = output.getVideoTracks();
	if (!track) throw new Error("Canvas capture produced no video track");

	let paused = false;
	const tick = () => {
		if (paused || screenVideo.videoWidth === 0) return;
		const drawStart = performance.now();
		drawComposite(
			ctx,
			size,
			{
				source: screenVideo,
				width: screenVideo.videoWidth,
				height: screenVideo.videoHeight,
			},
			cameraVideo.videoWidth > 0
				? {
						source: cameraVideo,
						width: cameraVideo.videoWidth,
						height: cameraVideo.videoHeight,
					}
				: null,
		);
		recordDraw(performance.now() - drawStart);
	};

	const workerUrl = URL.createObjectURL(
		new Blob(
			[
				"let t;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)};",
			],
			{ type: "text/javascript" },
		),
	);
	const worker = new Worker(workerUrl);
	worker.onmessage = tick;
	worker.postMessage(Math.round(1000 / maxFrameRate));

	let stopped = false;
	return {
		track,
		size,
		frameRate: maxFrameRate,
		setPaused(value) {
			paused = value;
		},
		getStats: snapshot,
		stop() {
			if (stopped) return;
			stopped = true;
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
			for (const video of [screenVideo, cameraVideo]) {
				video.pause();
				video.srcObject = null;
			}
			for (const outputTrack of output.getTracks()) outputTrack.stop();
		},
	};
}

export async function createScreenCameraCompositor(
	options: CompositorOptions,
): Promise<ScreenCameraCompositor> {
	const streams = getInsertableStreams();
	return streams
		? createInsertableCompositor(options, streams)
		: createCanvasCompositor(options);
}

import {
	getCameraOverlayRect,
	getCompositeOutputSize,
} from "@cap/recorder-core/screen-camera-compositor";
import { describe, expect, it } from "vitest";

describe("getCompositeOutputSize", () => {
	it("keeps screens at or below 1080p unchanged", () => {
		expect(getCompositeOutputSize({ width: 1920, height: 1080 })).toEqual({
			width: 1920,
			height: 1080,
		});
		expect(getCompositeOutputSize({ width: 1280, height: 720 })).toEqual({
			width: 1280,
			height: 720,
		});
	});

	it("scales larger screens down into 1920x1080 preserving aspect", () => {
		expect(getCompositeOutputSize({ width: 2560, height: 1440 })).toEqual({
			width: 1920,
			height: 1080,
		});
		expect(getCompositeOutputSize({ width: 3440, height: 1440 })).toEqual({
			width: 1920,
			height: 804,
		});
	});

	it("produces even dimensions for the encoder", () => {
		const size = getCompositeOutputSize({ width: 1791, height: 1077 });
		expect(size.width % 2).toBe(0);
		expect(size.height % 2).toBe(0);
	});
});

describe("getCameraOverlayRect", () => {
	const frame = { width: 1920, height: 1080 };

	it("places a 16:9 camera bottom-right with a 24px margin at 1080p", () => {
		const rect = getCameraOverlayRect(frame, { width: 1280, height: 720 });
		expect(rect.width).toBe(422);
		expect(rect.height).toBe(238);
		expect(frame.width - (rect.x + rect.width)).toBe(24);
		expect(frame.height - (rect.y + rect.height)).toBe(24);
		expect(rect.radius).toBeGreaterThan(0);
	});

	it("preserves the camera aspect ratio instead of stretching", () => {
		const rect = getCameraOverlayRect(frame, { width: 640, height: 480 });
		expect(rect.width / rect.height).toBeCloseTo(4 / 3, 1);
	});

	it("caps tall cameras so they do not cover too much of the screen", () => {
		const rect = getCameraOverlayRect(frame, { width: 720, height: 1280 });
		expect(rect.height).toBeLessThanOrEqual(Math.round(frame.height * 0.4));
		expect(rect.width / rect.height).toBeCloseTo(720 / 1280, 1);
	});

	it("scales the layout with the output size", () => {
		const small = getCameraOverlayRect(
			{ width: 960, height: 540 },
			{ width: 1280, height: 720 },
		);
		const large = getCameraOverlayRect(frame, { width: 1280, height: 720 });
		expect(small.width * 2).toBeCloseTo(large.width, -1);
	});
});

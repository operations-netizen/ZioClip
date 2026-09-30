import type { DetectedDisplayRecordingMode } from "@cap/recorder-core/recorder-constants";
import { Video } from "@cap/web-domain";

export * from "@cap/recorder-core/recorder-constants";

export type RecordingMode = "fullscreen" | "window" | "tab" | "camera";

// Derived here rather than in @cap/recorder-core so the framework-agnostic
// package carries no runtime dependency on the @cap/web-domain barrel (the
// extension bundles recorder-core and must not pull effect along with it).
export const FREE_PLAN_MAX_RECORDING_MS =
	Video.FREE_PLAN_MAX_RECORDING_SECONDS * 1000;

// Compile-time guard: recorder-core can't import RecordingMode, so it
// hand-writes DetectedDisplayRecordingMode. Fail the build if the two unions
// ever diverge.
type MutuallyAssignable<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;
const _detectedDisplayRecordingModeStaysInSync: MutuallyAssignable<
	DetectedDisplayRecordingMode,
	Exclude<RecordingMode, "camera">
> = true;
void _detectedDisplayRecordingModeStaysInSync;

/**
 * The recorder panel used to spring in (scale 0.9 -> 1, y 20 -> 0) and shrink
 * away on close. That pop-in animation is disabled: the panel now appears and
 * disappears instantly, with no scale or movement.
 *
 * The variants are kept (rather than dropping `variants`/`AnimatePresence`) so
 * the mount/unmount plumbing stays exactly as it was - only the motion is gone.
 * To restore the animation, put back the scale/y values and the spring
 * transition below.
 */
export const dialogVariants = {
	hidden: { opacity: 1 },
	visible: { opacity: 1, transition: { duration: 0 } },
	exit: { opacity: 1, transition: { duration: 0 } },
};

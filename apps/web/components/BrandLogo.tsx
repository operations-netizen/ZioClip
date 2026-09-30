/**
 * ============================================================================
 *  BRAND LOGO — replace this file's SVG to change the logo everywhere.
 * ============================================================================
 *
 * A deliberately simple placeholder mark (rounded square + record dot) plus the
 * product wordmark. It is a drop-in replacement for `Logo` from `@cap/ui`, so
 * it accepts the same props the dashboard already passes.
 *
 * To use your own logo:
 *   - Swap the <svg> below for your mark (keep the 40x40 viewBox), or
 *   - Render an <img src="/your-logo.svg" /> from apps/web/public.
 *
 * The wordmark text comes from PRODUCT_NAME in apps/web/lib/branding.ts.
 * `@cap/ui`'s original Logo/LogoBadge components are left untouched so the
 * upstream marketing pages keep working.
 */

import clsx from "clsx";
import { PRODUCT_NAME } from "@/lib/branding";
import { BrandMark } from "./BrandMark";

export const BrandLogo = ({
	className,
	hideLogoName = false,
	/** Accepted for drop-in compatibility with `@cap/ui`'s Logo. */
	white = false,
	style,
}: {
	className?: string;
	hideLogoName?: boolean;
	white?: boolean;
	squaredMark?: boolean;
	showVersion?: boolean;
	showBeta?: boolean;
	style?: React.CSSProperties;
	viewBoxDimensions?: `${string} ${string} ${string} ${string}`;
}) => {
	return (
		<div className={clsx("flex items-center gap-2", className)} style={style}>
			<BrandMark className="shrink-0 size-8" />
			{!hideLogoName && (
				<span
					className={clsx(
						"text-[0.95rem] font-semibold tracking-tight truncate",
						white ? "text-white" : "text-gray-12",
					)}
				>
					{PRODUCT_NAME}
				</span>
			)}
		</div>
	);
};

export default BrandLogo;

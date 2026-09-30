import { BRAND_MARK_DATA_URL } from "@cap/utils";
import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/branding";

/**
 * The product mark on its own, sized entirely by `className`. The artwork is
 * BRAND_MARK_SVG in packages/utils/src/brand.ts; `BrandLogo` renders this next
 * to the wordmark, and it replaces `@cap/ui`'s `LogoBadge` / standalone `Logo`
 * on app surfaces.
 */
export const BrandMark = ({ className }: { className?: string }) => (
	<Image
		src={BRAND_MARK_DATA_URL}
		alt={`${PRODUCT_NAME} logo`}
		width={40}
		height={40}
		unoptimized
		draggable={false}
		className={className}
	/>
);

/**
 * Neutral loading ring used where upstream spun the Cap logo (`LogoSpinner`).
 * Drawn in `currentColor`; callers pass the same sizing + `animate-spin`
 * classes they used before.
 */
export const BrandSpinner = ({ className }: { className?: string }) => (
	<svg
		viewBox="0 0 40 40"
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		aria-hidden="true"
		className={className}
	>
		<circle
			cx="20"
			cy="20"
			r="16"
			stroke="currentColor"
			strokeOpacity="0.2"
			strokeWidth="4"
		/>
		<path
			d="M20 4a16 16 0 0 1 16 16"
			stroke="currentColor"
			strokeWidth="4"
			strokeLinecap="round"
		/>
	</svg>
);

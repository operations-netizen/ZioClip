"use client";

import Cookies from "js-cookie";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

type Theme = "light" | "dark" | "system";

export function SonnerToaster() {
	// Initialize with the theme from cookie or default to light
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		// Get initial theme from cookie
		const cookieTheme = Cookies.get("theme") as Theme;
		if (cookieTheme) {
			setTheme(cookieTheme);
		}

		// Set up a cookie change listener
		const checkThemeChange = () => {
			const currentTheme = Cookies.get("theme") as Theme;
			if (currentTheme && currentTheme !== theme) {
				setTheme(currentTheme);
			}
		};

		// Check for theme changes when the window gets focus
		window.addEventListener("focus", checkThemeChange);

		// Set up an interval to periodically check for theme changes
		const intervalId = setInterval(checkThemeChange, 100);

		return () => {
			window.removeEventListener("focus", checkThemeChange);
			clearInterval(intervalId);
		};
	}, [theme]);

	// Radix modal dialogs set `pointer-events: none` on <body>; the toaster
	// inherits it, so toast actions shown over an open dialog (e.g. the
	// recorder's crash-recovery Download) would pass clicks through to the
	// dialog overlay. The toaster already stacks above the overlay; this only
	// restores its normal hit-testing.
	return (
		<Toaster
			position="top-center"
			theme={theme || "light"}
			richColors
			style={{ pointerEvents: "auto" }}
		/>
	);
}

"use client";

import {
	TanStackDevtools,
	type TanStackDevtoolsReactInit,
} from "@tanstack/react-devtools";
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { type PropsWithChildren, useEffect, useState } from "react";

export function ReactQueryProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === "development" ? <Devtools /> : null}
		</QueryClientProvider>
	);
}

import { SessionProvider as NASessionProvider } from "next-auth/react";
import { PRODUCT_NAME } from "@/lib/branding";
import {
	demoteFromPro,
	promoteToPro,
	restartOnboarding,
} from "./devtoolsServer";

export function SessionProvider({ children }: PropsWithChildren) {
	return <NASessionProvider>{children}</NASessionProvider>;
}

type DevtoolsConfig = NonNullable<TanStackDevtoolsReactInit["config"]>;

const devtoolsSettingsStorageKey = "tanstack_devtools_settings";

const devtoolsConfig = {
	hideUntilHover: false,
	// Bottom-left, stacked above Next.js's own dev indicator, so neither dev
	// badge covers the product logo in the top-left of the sidebar.
	position: "bottom-left",
	requireUrlFlag: false,
} satisfies DevtoolsConfig;

/**
 * The Next.js dev indicator sits at bottom-left, 20px up and 36px tall. Lift
 * the TanStack trigger clear of it so the two stack instead of overlapping.
 * Targeted by aria-label because the library's own class names are hashed.
 * Development-only: the button never exists in a production build.
 */
const devtoolsTriggerOffsetCss = `
button[aria-label="Open TanStack Devtools"] {
	top: auto !important;
	bottom: 64px !important;
	left: 12px !important;
}
`;

function getDevtoolsSettings(value: string | null): DevtoolsConfig {
	if (!value) return devtoolsConfig;

	try {
		const parsed: unknown = JSON.parse(value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return {
				...parsed,
				...devtoolsConfig,
			};
		}
	} catch {
		return devtoolsConfig;
	}

	return devtoolsConfig;
}

function persistDevtoolsSettings() {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(
			devtoolsSettingsStorageKey,
			JSON.stringify(
				getDevtoolsSettings(
					window.localStorage.getItem(devtoolsSettingsStorageKey),
				),
			),
		);
	} catch {
		return;
	}
}

export function Devtools() {
	const client = useQueryClient();
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		persistDevtoolsSettings();
		setIsReady(true);
	}, []);

	if (!isReady) return null;

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static dev-only stylesheet, no user input */}
			<style dangerouslySetInnerHTML={{ __html: devtoolsTriggerOffsetCss }} />
			<TanStackDevtools
				config={devtoolsConfig}
				plugins={[
					{
						id: "cap",
						name: PRODUCT_NAME,
						render: <CapDevtools />,
					},
					{
						id: "tanstack-query",
						name: "Tanstack Query",
						render: <ReactQueryDevtoolsPanel client={client} />,
					},
				]}
			/>
		</>
	);
}

function CapDevtools() {
	return (
		<div className="flex flex-col p-4 space-y-4">
			<h1 className="text-2xl font-semibold">{PRODUCT_NAME} Devtools</h1>
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">Cap Pro</h1>
				<p className="text-xs text-muted-foreground">
					Toggle the current user's Pro status (dev only)
				</p>
				<div className="flex items-center space-x-2">
					<form action={promoteToPro}>
						<button
							type="submit"
							className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
						>
							Promote to Pro
						</button>
					</form>
					<form action={demoteFromPro}>
						<button
							type="submit"
							className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
						>
							Demote from Pro
						</button>
					</form>
				</div>
			</div>
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">Onboarding</h1>
				<p className="text-xs text-muted-foreground">
					Restart the onboarding process for the current user (dev only)
				</p>
				<form action={restartOnboarding}>
					<button
						type="submit"
						className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
					>
						Restart Onboarding
					</button>
				</form>
			</div>
		</div>
	);
}

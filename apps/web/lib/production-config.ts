// Startup check for production deployments. Several settings are read
// directly from process.env (or are optional in the env schema because the
// development setup does not need them) but a production deployment is broken
// or unsafe without them. Reports variable names only, never values.

// Needed for a working self-hosted production deployment of this app.
export const PRODUCTION_REQUIRED_ENV = [
	"WEB_URL",
	"NEXTAUTH_URL",
	"NEXTAUTH_SECRET",
	"DATABASE_URL",
	"CAP_AWS_BUCKET",
	"CAP_AWS_REGION",
	"MEDIA_SERVER_URL",
	"MEDIA_SERVER_WEBHOOK_SECRET",
	"CRON_SECRET",
	// Email code sign-in is the only sign-in method enabled by default.
	"RESEND_API_KEY",
	"RESEND_FROM_DOMAIN",
] as const;

export type ProductionConfigProblem =
	| { kind: "missing"; name: string }
	| { kind: "development-setting"; name: string; detail: string };

const isLoopbackUrl = (value: string) => {
	try {
		const { hostname } = new URL(value);
		return (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "::1" ||
			hostname === "[::1]"
		);
	} catch {
		return false;
	}
};

export function getProductionConfigProblems(
	env: Record<string, string | undefined>,
): ProductionConfigProblem[] {
	const problems: ProductionConfigProblem[] = [];
	for (const name of PRODUCTION_REQUIRED_ENV) {
		if (!env[name]?.trim()) problems.push({ kind: "missing", name });
	}

	// These cannot enable anything in a production build (dev login requires
	// NODE_ENV=development), but their presence means development settings were
	// copied into production.
	for (const name of ["CAP_DEV_AUTH_BYPASS", "CAP_DEV_SERVER_HOST"]) {
		if (env[name]) {
			problems.push({
				kind: "development-setting",
				name,
				detail: "development-only; ignored in production, remove it",
			});
		}
	}
	if (env.WEB_URL && isLoopbackUrl(env.WEB_URL)) {
		problems.push({
			kind: "development-setting",
			name: "WEB_URL",
			detail: "points at a loopback address",
		});
	}
	if (env.NEXT_PUBLIC_AXIOM_TOKEN) {
		problems.push({
			kind: "development-setting",
			name: "NEXT_PUBLIC_AXIOM_TOKEN",
			detail: "public variables are inlined into client code; use AXIOM_TOKEN",
		});
	}
	return problems;
}

export function formatProductionConfigProblem(
	problem: ProductionConfigProblem,
): string {
	return problem.kind === "missing"
		? `${problem.name} is not set (required in production)`
		: `${problem.name}: ${problem.detail}`;
}

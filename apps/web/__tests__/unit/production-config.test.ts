import { describe, expect, it } from "vitest";
import {
	formatProductionConfigProblem,
	getProductionConfigProblems,
	PRODUCTION_REQUIRED_ENV,
} from "@/lib/production-config";

const complete = Object.fromEntries(
	PRODUCTION_REQUIRED_ENV.map((name) => [name, `value-for-${name}`]),
) as Record<string, string>;
complete.WEB_URL = "https://recorder.example.com";
complete.NEXTAUTH_URL = "https://recorder.example.com";

describe("getProductionConfigProblems", () => {
	it("reports nothing for a complete production configuration", () => {
		expect(getProductionConfigProblems(complete)).toEqual([]);
	});

	it("names every missing or empty required variable", () => {
		const env = { ...complete, CRON_SECRET: "", RESEND_API_KEY: undefined };
		expect(getProductionConfigProblems(env)).toEqual([
			{ kind: "missing", name: "CRON_SECRET" },
			{ kind: "missing", name: "RESEND_API_KEY" },
		]);
	});

	it("flags development settings copied into production", () => {
		const problems = getProductionConfigProblems({
			...complete,
			WEB_URL: "http://localhost:3001",
			CAP_DEV_AUTH_BYPASS: "true",
			CAP_DEV_SERVER_HOST: "127.0.0.1",
			NEXT_PUBLIC_AXIOM_TOKEN: "anything",
		});
		expect(problems.map((p) => p.name)).toEqual([
			"CAP_DEV_AUTH_BYPASS",
			"CAP_DEV_SERVER_HOST",
			"WEB_URL",
			"NEXT_PUBLIC_AXIOM_TOKEN",
		]);
	});

	it("formats problems without echoing values", () => {
		const text = getProductionConfigProblems({
			...complete,
			CAP_DEV_AUTH_BYPASS: "secret-looking-value",
			CRON_SECRET: "",
		})
			.map(formatProductionConfigProblem)
			.join("\n");
		expect(text).toContain("CRON_SECRET is not set");
		expect(text).not.toContain("secret-looking-value");
	});
});

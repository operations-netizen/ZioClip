#!/usr/bin/env node
// Fails if a server-only secret appears in the browser bundle.
//
// Usage: node scripts/check-client-bundle-secrets.mjs [dir]   (default: apps/web/.next/static)
//
// Checks every file under `dir` for (1) the value of each server-only secret
// variable present in this process's environment and (2) well-known credential
// shapes. Reports variable names / pattern labels only, never the values.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "apps/web/.next/static";

const SERVER_SECRETS = [
	"NEXTAUTH_SECRET",
	"DATABASE_URL",
	"DATABASE_ENCRYPTION_KEY",
	"CAP_AWS_SECRET_KEY",
	"CAP_AWS_ACCESS_KEY",
	"CRON_SECRET",
	"MEDIA_SERVER_WEBHOOK_SECRET",
	"WORKFLOWS_RPC_SECRET",
	"RESEND_API_KEY",
	"AXIOM_TOKEN",
	"AXIOM_API_TOKEN",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GROQ_API_KEY",
	"ASSEMBLY_API_KEY",
	"GOOGLE_CLIENT_SECRET",
	"WORKOS_API_KEY",
	"SLACK_CLIENT_SECRET",
	"SLACK_SIGNING_SECRET",
	"TINYBIRD_TOKEN",
	"OPENPANEL_CLIENT_SECRET",
	"VERCEL_AUTH_TOKEN",
	"CLOUDFRONT_KEYPAIR_PRIVATE_KEY",
	"REPLICATE_API_TOKEN",
];

const PATTERNS = [
	["Axiom token", /xaat-[0-9a-f]{8}-[0-9a-f-]{20,}/i],
	["Stripe live secret key", /sk_live_[0-9A-Za-z]{16,}/],
	["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
	["private key block", /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/],
];

const secrets = SERVER_SECRETS.map((name) => [name, process.env[name]]).filter(
	([, value]) => typeof value === "string" && value.length >= 8,
);

const files = [];
const walk = (path) => {
	for (const entry of readdirSync(path)) {
		const full = join(path, entry);
		if (statSync(full).isDirectory()) walk(full);
		else files.push(full);
	}
};
walk(dir);

const findings = [];
for (const file of files) {
	const text = readFileSync(file, "latin1");
	for (const [name, value] of secrets) {
		if (text.includes(value)) findings.push(`${name} value found in ${file}`);
	}
	for (const [label, pattern] of PATTERNS) {
		if (pattern.test(text)) findings.push(`${label} found in ${file}`);
	}
}

console.log(
	`Scanned ${files.length} files in ${dir} for ${secrets.length} secret values and ${PATTERNS.length} patterns.`,
);
if (findings.length > 0) {
	for (const finding of findings) console.error(`LEAK: ${finding}`);
	process.exit(1);
}
console.log("No server secrets found in client bundles.");

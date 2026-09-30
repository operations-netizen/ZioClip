import { afterEach, describe, expect, it } from "vitest";
import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";

const originalSecret = process.env.CRON_SECRET;
afterEach(() => {
	process.env.CRON_SECRET = originalSecret;
});

const request = (authorization?: string) =>
	new Request("http://localhost/api/cron/test", {
		headers: authorization ? { authorization } : {},
	});

describe("rejectUnauthorizedCronRequest", () => {
	it("accepts the exact bearer secret", () => {
		process.env.CRON_SECRET = "cron-secret-value";
		expect(
			rejectUnauthorizedCronRequest(request("Bearer cron-secret-value")),
		).toBeNull();
	});

	it("rejects a wrong, missing or prefix-only secret with 401", () => {
		process.env.CRON_SECRET = "cron-secret-value";
		for (const header of [
			undefined,
			"Bearer wrong",
			"Bearer cron-secret-valu",
			"cron-secret-value",
		]) {
			expect(rejectUnauthorizedCronRequest(request(header))?.status).toBe(401);
		}
	});

	it("returns 401, not a thrown error, for a multi-byte header of the same length", () => {
		process.env.CRON_SECRET = "abc";
		// Same UTF-16 length as "Bearer abc" but a different UTF-8 byte length.
		expect(() =>
			rejectUnauthorizedCronRequest(request("Bearer abé")),
		).not.toThrow();
		expect(rejectUnauthorizedCronRequest(request("Bearer abé"))?.status).toBe(
			401,
		);
	});

	it("refuses to run without a configured secret", () => {
		delete process.env.CRON_SECRET;
		expect(rejectUnauthorizedCronRequest(request("Bearer "))?.status).toBe(500);
	});
});

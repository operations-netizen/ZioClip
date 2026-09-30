import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	verifyPassword: vi.fn(async () => false),
	forwardedFor: "203.0.113.7",
}));

vi.mock("server-only", () => ({}));
vi.mock("@cap/env", () => ({ NODE_ENV: "production" }));
vi.mock("@cap/database/crypto", () => ({
	verifyPassword: mocks.verifyPassword,
}));
// Self-hosted: the Vercel Firewall is unavailable and the check throws.
vi.mock("@vercel/firewall", () => ({
	checkRateLimit: vi.fn(async () => {
		throw new Error("firewall unavailable");
	}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
	headers: async () => new Headers({ "x-forwarded-for": mocks.forwardedFor }),
}));
vi.mock("@/lib/password-cookie", () => ({
	setVerifiedPasswordCookie: vi.fn(),
}));
vi.mock("@/lib/public-collections", () => ({
	getPublicCollectionPasswordHash: vi.fn(async () => "stored-hash"),
}));

const { verifyCollectionPassword } = await import(
	"@/actions/collections/password"
);
const { PASSWORD_ATTEMPT_LIMITS } = await import(
	"@/lib/password-attempt-limiter"
);

describe("verifyCollectionPassword attempt limiting", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.verifyPassword.mockClear();
	});

	it("stops checking guesses once a client exceeds the budget, even without the Vercel Firewall", async () => {
		mocks.forwardedFor = "203.0.113.7";
		for (let i = 0; i < PASSWORD_ATTEMPT_LIMITS.perClient; i++) {
			expect(await verifyCollectionPassword("col-a", "guess")).toEqual({
				success: false,
				error: "Failed to verify password",
			});
		}
		expect(mocks.verifyPassword).toHaveBeenCalledTimes(
			PASSWORD_ATTEMPT_LIMITS.perClient,
		);

		expect(await verifyCollectionPassword("col-a", "guess")).toEqual({
			success: false,
			error: "Too many attempts. Please try again later.",
		});
		expect(mocks.verifyPassword).toHaveBeenCalledTimes(
			PASSWORD_ATTEMPT_LIMITS.perClient,
		);
	});

	it("keeps collection counts separate from video counts with the same id", async () => {
		const { isPasswordAttemptLimited } = await import(
			"@/lib/password-attempt-limiter"
		);
		mocks.forwardedFor = "198.51.100.9";
		for (let i = 0; i < PASSWORD_ATTEMPT_LIMITS.perClient; i++) {
			isPasswordAttemptLimited("shared-id", "198.51.100.9");
		}
		expect(await verifyCollectionPassword("shared-id", "guess")).toEqual({
			success: false,
			error: "Failed to verify password",
		});
	});
});

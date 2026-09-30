import { authOptions } from "@cap/database/auth/auth-options";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DrizzleAdapter,
	OTP_MAX_FAILED_ATTEMPTS,
} from "../../../../packages/database/auth/drizzle-adapter";

const env = vi.hoisted(() => ({
	NEXTAUTH_SECRET: "next-auth-secret",
	NODE_ENV: "production",
	RESEND_API_KEY: "re_test_key" as string | undefined,
	RESEND_FROM_DOMAIN: "example.com",
}));

const mocks = vi.hoisted(() => ({
	sendEmail: vi.fn(),
}));

vi.mock("@cap/env", () => ({
	serverEnv: () => env,
	buildEnv: { NEXT_PUBLIC_WEB_URL: "https://recorder.example.com" },
}));

vi.mock("@cap/database", () => ({
	db: () => ({}),
}));

vi.mock("@cap/database/auth/sso", () => ({
	validateSsoSignIn: vi.fn(),
	provisionSsoMembership: vi.fn(),
}));

vi.mock("../../../../packages/database/emails/config", () => ({
	sendEmail: mocks.sendEmail,
}));

type TokenRow = { identifier: string; token: string; expires: Date };

// Minimal stand-in for the drizzle client: the token lookup returns whatever
// the test puts in `rows`; deletes are recorded as rendered SQL.
function fakeDb(rows: TokenRow[]) {
	const deletes: { sql: string; params: unknown[] }[] = [];
	const client = {
		select: () => ({
			from: () => ({
				where: () => ({ limit: async () => rows }),
			}),
		}),
		delete: () => ({
			where: async (condition: SQL) => {
				const { sql, params } = new MySqlDialect().sqlToQuery(condition);
				deletes.push({ sql, params });
			},
		}),
	};
	return {
		adapter: DrizzleAdapter(client as unknown as MySql2Database),
		deletes,
	};
}

const guess = (
	adapter: ReturnType<typeof DrizzleAdapter>,
	identifier: string,
	token = "wrong-hash",
) => {
	const { useVerificationToken: consumeCode } = adapter;
	if (!consumeCode) throw new Error("missing method");
	return consumeCode({ identifier, token });
};

describe("email sign-in code guessing", () => {
	it("invalidates an address's pending codes after repeated wrong codes", async () => {
		const { adapter, deletes } = fakeDb([]);
		for (let i = 1; i < OTP_MAX_FAILED_ATTEMPTS; i++) {
			expect(await guess(adapter, "Victim@Example.com")).toBeNull();
		}
		expect(deletes).toEqual([]);

		expect(await guess(adapter, "victim@example.com")).toBeNull();
		expect(deletes).toEqual([
			{
				sql: "`verification_tokens`.`identifier` = ?",
				params: ["victim@example.com"],
			},
		]);
	});

	it("gives the next code a fresh allowance after invalidating", async () => {
		const { adapter, deletes } = fakeDb([]);
		for (let i = 0; i < OTP_MAX_FAILED_ATTEMPTS; i++) {
			await guess(adapter, "again@example.com");
		}
		expect(deletes).toHaveLength(1);
		for (let i = 1; i < OTP_MAX_FAILED_ATTEMPTS; i++) {
			await guess(adapter, "again@example.com");
		}
		expect(deletes).toHaveLength(1);
		await guess(adapter, "again@example.com");
		expect(deletes).toHaveLength(2);
	});

	it("counts a code issued to another address as a failure without deleting that address's code", async () => {
		const other: TokenRow = {
			identifier: "owner@example.com",
			token: "owner-hash",
			expires: new Date(Date.now() + 60_000),
		};
		const { adapter, deletes } = fakeDb([other]);
		for (let i = 0; i < OTP_MAX_FAILED_ATTEMPTS; i++) {
			expect(
				await guess(adapter, "attacker@example.com", "owner-hash"),
			).toBeNull();
		}
		expect(deletes).toEqual([
			{
				sql: "`verification_tokens`.`identifier` = ?",
				params: ["attacker@example.com"],
			},
		]);
	});

	it("still accepts the right code and resets the count", async () => {
		const row: TokenRow = {
			identifier: "user@example.com",
			token: "good-hash",
			expires: new Date(Date.now() + 60_000),
		};
		const miss = fakeDb([]);
		const hitDb = fakeDb([row]);
		// Share one counter: both adapters use the module-level failure map.
		for (let i = 1; i < OTP_MAX_FAILED_ATTEMPTS; i++) {
			await guess(miss.adapter, "user@example.com");
		}
		const used = await guess(hitDb.adapter, "user@example.com", "good-hash");
		expect(used).toMatchObject({ identifier: "user@example.com" });
		// The successful sign-in consumed the code (one delete by token)...
		expect(hitDb.deletes).toHaveLength(1);
		expect(hitDb.deletes[0]?.params).toContain("good-hash");
		// ...and cleared the failures, so one more miss does not lock out.
		await guess(miss.adapter, "user@example.com");
		expect(miss.deletes).toEqual([]);
	});
});

describe("email sign-in delivery", () => {
	const send = () => {
		const email = authOptions().providers.find(
			(provider) => provider.id === "email",
		) as unknown as {
			options: {
				sendVerificationRequest: (params: {
					identifier: string;
					token: string;
				}) => Promise<void>;
			};
		};
		return email.options.sendVerificationRequest({
			identifier: "user@example.com",
			token: "123456",
		});
	};

	beforeEach(() => {
		env.RESEND_API_KEY = "re_test_key";
		mocks.sendEmail.mockReset();
	});

	it("fails the sign-in when Resend rejects the message", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.sendEmail.mockResolvedValue({
			data: null,
			error: {
				name: "validation_error",
				message: "The example.com domain is not verified.",
			},
		});

		await expect(send()).rejects.toThrow("Could not send the sign-in email");
		expect(logged).toHaveBeenCalledWith(
			"[auth] The sign-in email was not accepted by Resend (validation_error).",
		);
		logged.mockRestore();
	});

	it("succeeds when Resend accepts the message", async () => {
		mocks.sendEmail.mockResolvedValue({ data: { id: "email_1" }, error: null });

		await expect(send()).resolves.toBeUndefined();
		expect(mocks.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ email: "user@example.com" }),
		);
	});
});

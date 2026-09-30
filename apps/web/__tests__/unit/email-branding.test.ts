import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const WEB_URL = "https://recordings.example.com";

vi.mock("@cap/env", () => ({
	buildEnv: { NEXT_PUBLIC_WEB_URL: WEB_URL },
	serverEnv: () => ({}),
}));

const { BRAND_NAME } = await import("@cap/utils");
const { DownloadLink } = await import("@cap/database/emails/download-link");
const { Feedback } = await import("@cap/database/emails/feedback");
const { FirstShareableLink } = await import(
	"@cap/database/emails/first-shareable-link"
);
const { FirstView } = await import("@cap/database/emails/first-view");
const { LoginLink } = await import("@cap/database/emails/login-link");
const { MessengerSupportEmail } = await import(
	"@cap/database/emails/messenger-support-email"
);
const { NewComment } = await import("@cap/database/emails/new-comment");
const { OrganizationInvite } = await import(
	"@cap/database/emails/organization-invite"
);
const { OTPEmail } = await import("@cap/database/emails/otp-email");
const { PaymentFailed } = await import("@cap/database/emails/payment-failed");

const url = `${WEB_URL}/s/abc123`;
// Each template with realistic props, plus the values the email must still
// carry through (codes, links, names) after the rebrand.
const cases: Array<[string, ReactElement, string[]]> = [
	[
		"otp",
		createElement(OTPEmail, { email: "a@b.co", code: "482913" }),
		["482913"],
	],
	["login link", createElement(LoginLink, { email: "a@b.co", url }), [url]],
	[
		"new comment",
		createElement(NewComment, {
			email: "a@b.co",
			url,
			videoName: "Sprint demo",
			commenterName: "Sam",
			commentContent: "Looks great",
		}),
		["Sprint demo", "Sam", "Looks great", url],
	],
	[
		"first view",
		createElement(FirstView, {
			email: "a@b.co",
			url,
			videoName: "Sprint demo",
			viewerName: "Kim",
		}),
		["Sprint demo", url],
	],
	[
		"first shareable link",
		createElement(FirstShareableLink, {
			email: "a@b.co",
			url,
			videoName: "Sprint demo",
		}),
		[url],
	],
	[
		"organization invite",
		createElement(OrganizationInvite, {
			email: "a@b.co",
			url,
			organizationName: "Acme",
		}),
		["Acme", url],
	],
	[
		"payment failed",
		createElement(PaymentFailed, {
			email: "a@b.co",
			billingUrl: `${WEB_URL}/billing`,
			finalAttempt: true,
		}),
		[`${WEB_URL}/billing`],
	],
	["download link", createElement(DownloadLink, { email: "a@b.co" }), []],
	[
		"feedback",
		createElement(Feedback, { userEmail: "a@b.co", feedback: "Please add X" }),
		["Please add X"],
	],
	[
		"messenger support",
		createElement(MessengerSupportEmail, {
			userEmail: "a@b.co",
			conversationId: "c1",
			message: "Help",
		}),
		["Help"],
	],
];

describe("email templates use the shared product identity", () => {
	it.each(cases)("%s", async (_, element, mustContain) => {
		const html = await render(element);
		const text = html.replace(/<[^>]+>/g, " ");

		expect(html).toContain(`${WEB_URL}/brand/email-logo.png`);
		expect(html).not.toContain("githubusercontent.com/CapSoftware");
		expect(html).toContain(`alt="${BRAND_NAME}"`);
		expect(text).not.toMatch(/\bCap\b/);
		for (const value of mustContain) expect(html).toContain(value);
	});
});

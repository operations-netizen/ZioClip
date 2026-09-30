"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@cap/ui";
import { SHOW_CUSTOM_DOMAINS, SHOW_TEAM_FEATURES } from "@/lib/branding";
import AccessEmailDomain from "./AccessEmailDomain";
import { CustomDomain } from "./CustomDomain";
import { OrganizationIcon } from "./OrganizationIcon";
import OrgName from "./OrgName";
import { ShareableLinkIcon } from "./ShareableLinkIcon";

export const OrganizationDetailsCard = () => {
	return (
		<Card className="flex flex-col flex-1 gap-6 w-full min-h-fit">
			<CardHeader>
				<CardTitle>Settings</CardTitle>
				<CardDescription>
					{SHOW_TEAM_FEATURES
						? "Set the organization name, access email domain, custom domain, and organization icons."
						: "Set your workspace name and the icons shown on your shared links."}
				</CardDescription>
			</CardHeader>
			<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
				<OrgName />
				{SHOW_CUSTOM_DOMAINS && <CustomDomain />}
				<OrganizationIcon />
				<ShareableLinkIcon />
				{SHOW_TEAM_FEATURES && <AccessEmailDomain />}
			</div>
		</Card>
	);
};

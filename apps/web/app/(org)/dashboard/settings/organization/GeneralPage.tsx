"use client";

import { SHOW_TEAM_FEATURES } from "@/lib/branding";
import DeleteOrg from "./components/DeleteOrg";
import { OrganizationDetailsCard } from "./components/OrganizationDetailsCard";

export function GeneralPage() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-6 justify-center items-stretch xl:flex-row">
				<OrganizationDetailsCard />
			</div>
			{SHOW_TEAM_FEATURES && <DeleteOrg />}
		</div>
	);
}

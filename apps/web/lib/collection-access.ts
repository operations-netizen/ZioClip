import "server-only";

import { db } from "@cap/database";
import { organizationMembers, organizations } from "@cap/database/schema";
import type { Organisation, Space, User } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { getSpaceAccess } from "@/actions/organization/space-authorization";

/** The organization's owner or one of its members (tombstoned orgs excluded). */
export async function isOrganizationMember(
	userId: User.UserId,
	organizationId: Organisation.OrganisationId,
) {
	const [row] = await db()
		.select({
			ownerId: organizations.ownerId,
			memberId: organizationMembers.userId,
		})
		.from(organizations)
		.leftJoin(
			organizationMembers,
			and(
				eq(organizationMembers.organizationId, organizations.id),
				eq(organizationMembers.userId, userId),
			),
		)
		.where(
			and(
				eq(organizations.id, organizationId),
				isNull(organizations.tombstoneAt),
			),
		)
		.limit(1);
	return Boolean(row && (row.ownerId === userId || row.memberId === userId));
}

/**
 * Whether the user may list what is shared into a space. The organization's
 * id doubles as its "all spaces" entry, which needs organization membership.
 */
export async function canReadSpaceContents(
	userId: User.UserId,
	spaceId: Space.SpaceIdOrOrganisationId,
	activeOrganizationId?: string | null,
) {
	if (activeOrganizationId && spaceId === activeOrganizationId) {
		return isOrganizationMember(
			userId,
			spaceId as unknown as Organisation.OrganisationId,
		);
	}
	const access = await getSpaceAccess(userId, spaceId);
	return Boolean(
		access && (access.organizationRole !== null || access.spaceRole !== null),
	);
}

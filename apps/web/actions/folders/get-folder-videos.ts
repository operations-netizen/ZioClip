"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { sharedVideos, spaceVideos } from "@cap/database/schema";
import type { Folder, Space, Video } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { canReadSpaceContents } from "@/lib/collection-access";

export async function getFolderVideoIds(
	folderId: Folder.FolderId,
	spaceId: Space.SpaceIdOrOrganisationId,
) {
	try {
		const user = await getCurrentUser();

		if (!user || !user.id) {
			throw new Error("Unauthorized");
		}

		if (!folderId) {
			throw new Error("Folder ID is required");
		}

		if (
			!(await canReadSpaceContents(user.id, spaceId, user.activeOrganizationId))
		) {
			throw new Error("Unauthorized");
		}

		const isAllSpacesEntry = user.activeOrganizationId === spaceId;

		// Scoped to the space as well as the folder, so a folder id from a
		// space the user can't read returns nothing.
		const rows = isAllSpacesEntry
			? await db()
					.select({ id: sharedVideos.videoId })
					.from(sharedVideos)
					.where(
						and(
							eq(sharedVideos.folderId, folderId),
							eq(sharedVideos.organizationId, spaceId),
						),
					)
			: await db()
					.select({ id: spaceVideos.videoId })
					.from(spaceVideos)
					.where(
						and(
							eq(spaceVideos.folderId, folderId),
							eq(spaceVideos.spaceId, spaceId),
						),
					);

		return {
			success: true,
			data: rows.map((r) => r.id as Video.VideoId),
		};
	} catch (error) {
		console.error("Error fetching folder video IDs:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch folder videos",
		};
	}
}

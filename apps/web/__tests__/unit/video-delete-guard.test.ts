import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { notBeingDeleted } from "@/lib/video-delete-guard";

describe("notBeingDeleted", () => {
	it("excludes uploads whose recording carries the deletion marker", () => {
		const query = new MySqlDialect().sqlToQuery(notBeingDeleted());

		expect(query.sql).toBe(
			"not exists (select 1 from `video_processing_jobs` where `video_processing_jobs`.`video_id` = `video_uploads`.`video_id` and `video_processing_jobs`.`error_code` = ?)",
		);
		expect(query.params).toEqual(["video-deleting"]);
	});
});

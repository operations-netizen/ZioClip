import { afterEach, describe, expect, test } from "bun:test";
import app from "../../app";
import { isAllowedMediaUrl } from "../../lib/media-url";

const MEDIA_SERVER_SECRET = "test-secret";
process.env.MEDIA_SERVER_WEBHOOK_SECRET = MEDIA_SERVER_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("media URL scheme gate", () => {
	test("accepts the presigned http(s) URLs the web app sends", () => {
		process.env.NODE_ENV = "production";
		expect(
			isAllowedMediaUrl(
				"https://bucket.s3.amazonaws.com/u/v/raw.webm?X-Amz-Signature=x",
			),
		).toBe(true);
		expect(
			isAllowedMediaUrl("http://127.0.0.1:9000/capso/u/v/result.mp4"),
		).toBe(true);
	});

	test("rejects local-file and other schemes outside tests", () => {
		process.env.NODE_ENV = "production";
		for (const url of [
			"file:///etc/passwd",
			"file:///D:/secrets/video.mp4",
			"data:video/mp4;base64,AAAA",
			"ftp://example.com/video.mp4",
			"gopher://example.com/",
			"not a url",
		]) {
			expect(isAllowedMediaUrl(url)).toBe(false);
		}
	});

	test("keeps file:// fixtures usable under bun test only", () => {
		process.env.NODE_ENV = "test";
		expect(isAllowedMediaUrl("file:///tmp/fixture.mp4")).toBe(true);
		process.env.NODE_ENV = "development";
		expect(isAllowedMediaUrl("file:///tmp/fixture.mp4")).toBe(false);
	});

	test("a route rejects a file:// input in production mode before touching it", async () => {
		process.env.NODE_ENV = "production";
		const response = await app.fetch(
			new Request("http://localhost/audio/check", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-media-server-secret": MEDIA_SERVER_SECRET,
				},
				body: JSON.stringify({ videoUrl: "file:///etc/passwd" }),
			}),
		);
		expect(response.status).toBe(400);
	});
});

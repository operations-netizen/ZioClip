import { z } from "zod";

// Media inputs and outputs arrive as presigned http(s) URLs from the web app.
// file:// is accepted only under `bun test` (NODE_ENV=test), where integration
// tests feed local fixtures through the routes. Anywhere else it would let a
// caller holding the shared secret make ffmpeg read local files.
export function isAllowedMediaUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		if (protocol === "http:" || protocol === "https:") return true;
		return protocol === "file:" && process.env.NODE_ENV === "test";
	} catch {
		return false;
	}
}

export const mediaUrl = () =>
	z.string().url().refine(isAllowedMediaUrl, {
		message: "URL must use http or https",
	});

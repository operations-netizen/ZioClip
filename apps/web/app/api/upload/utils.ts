export function parseVideoIdOrFileKey(
	userId: string,
	input:
		| { videoId: string; subpath: string }
		| {
				// deprecated
				fileKey: string;
		  },
) {
	let videoId: string;
	let subpath: string;

	if ("fileKey" in input) {
		const [_, _videoId, ...subpathParts] = input.fileKey.split("/");
		if (!_videoId) throw new Error("Invalid fileKey");
		videoId = _videoId;
		subpath = subpathParts.join("/");
	} else {
		videoId = input.videoId;
		subpath = input.subpath;
	}

	// Keys are always scoped to the caller's own prefix; refuse segments that
	// could climb out of `userId/videoId/` on stores that normalise paths.
	if (
		!videoId ||
		videoId.includes("/") ||
		videoId.includes("..") ||
		!subpath ||
		subpath.startsWith("/") ||
		subpath.split("/").some((segment) => segment === ".." || segment === "")
	) {
		throw new Error("Invalid upload path");
	}

	return `${userId}/${videoId}/${subpath}`;
}

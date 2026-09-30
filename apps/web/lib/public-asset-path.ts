// Static files served from /public: fonts, icons, sounds, the theme bootstrap
// script, the email logo, the web manifest. Self-hosted production builds
// redirect every path outside the app's allowlist to /login, which without
// this check also caught these files (browsers then got the login page's HTML
// instead of a script, font or image). Only extensions of genuine static
// assets qualify, so extension-named routes such as /install-cli.sh keep their
// existing behaviour.
const PUBLIC_ASSET_EXTENSION =
	/\.(?:js|css|png|jpe?g|gif|webp|avif|svg|ico|webmanifest|xml|txt|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|riv)$/i;

export function isPublicAssetPath(pathname: string): boolean {
	if (pathname.includes("..")) return false;
	return PUBLIC_ASSET_EXTENSION.test(pathname);
}

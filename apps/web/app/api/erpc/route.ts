import { RpcAuthMiddlewareLive, RpcsLive } from "@cap/web-backend";
import { Rpcs, Video } from "@cap/web-domain";
import { HttpServer } from "@effect/platform";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { getVerifiedPasswordHashes } from "@/lib/password-cookie";
import { Dependencies } from "@/lib/server";

// Read per call (like the session cookie in RpcAuthMiddleware), so a viewer who
// unlocked a password-protected share can also fetch its download link and
// thumbnail, not just play it.
const RpcPasswordAttachmentMiddlewareLive = Layer.succeed(
	Video.RpcPasswordAttachmentMiddleware,
	Video.RpcPasswordAttachmentMiddleware.of(() =>
		Effect.promise(getVerifiedPasswordHashes).pipe(
			Effect.map((passwords) => ({ passwords })),
		),
	),
);

const rpcLayer = Layer.mergeAll(
	RpcAuthMiddlewareLive,
	RpcPasswordAttachmentMiddlewareLive,
	RpcsLive,
	RpcSerialization.layerJson,
	HttpServer.layerContext,
);

const { handler } = RpcServer.toWebHandler(Rpcs, {
	layer: Layer.provide(Dependencies)(rpcLayer),
});

export const GET = (r: Request) => handler(r);
export const POST = (r: Request) => handler(r);

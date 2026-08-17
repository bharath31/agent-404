import { getRequestListener, type HttpBindings, type Http2Bindings } from "@hono/node-server";
import app from "../src/index.js";

// @hono/node-server derives the request scheme from the local socket, which is
// plain HTTP behind Vercel's TLS-terminating edge proxy. Trust x-forwarded-proto
// so request URLs (and anything derived from them, like the OIDC token-exchange
// redirect_uri) use the real https scheme.
//
// Do NOT call `new Request(url, req)` here: @hono/node-server returns an optimized
// lazy request wrapper attached to Node's incoming stream. Passing it into the
// undici Request constructor detaches @hono/node-server's stream handlers and
// locks/consumes the body stream, causing any POST request with a body to hang
// indefinitely on Vercel's Node.js runtime (FUNCTION_INVOCATION_TIMEOUT / 504).
export function applyForwardedProto(req: Request): Request {
	const proto = req.headers.get("x-forwarded-proto");
	if (!proto || proto === "http" || !req.url.startsWith("http://")) {
		return req;
	}
	const url = new URL(req.url);
	url.protocol = `${proto}:`;
	Object.defineProperty(req, "url", { value: url.href, configurable: true, writable: true });
	return req;
}

export default getRequestListener(
	(req, env: HttpBindings | Http2Bindings) => app.fetch(applyForwardedProto(req), env),
);
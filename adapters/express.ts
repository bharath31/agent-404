import { recover404, type RecoveryConfig } from "./core.js";
import type { IncomingMessage } from "node:http";

function headersFromNode(headers: IncomingMessage["headers"]): Headers {
	const h = new Headers();
	for (const [key, value] of Object.entries(headers)) {
		if (!value) continue;
		h.set(key, Array.isArray(value) ? value.join(", ") : value);
	}
	return h;
}

/**
 * Call from an Express 404 handler and send the returned Response.
 *
 * ```js
 * app.use(async (req, res) => {
 *   const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", { apiKey });
 *   res.status(404);
 *   recovered.headers.forEach((v, k) => res.setHeader(k, v));
 *   res.send(await recovered.text());
 * });
 * ```
 */
export async function recoverExpress404(
	req: IncomingMessage & { originalUrl?: string; protocol?: string },
	bodyHtml: string,
	config: RecoveryConfig,
): Promise<Response> {
	const proto = req.protocol || (req.headers["x-forwarded-proto"] as string) || "http";
	const host = req.headers.host || "localhost";
	const path = req.originalUrl || req.url || "/";
	const request = new Request(`${proto}://${host}${path}`, {
		method: req.method,
		headers: headersFromNode(req.headers),
	});
	const upstream = new Response(bodyHtml, {
		status: 404,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
	return recover404(request, upstream, config);
}

export { recover404 } from "./core.js";

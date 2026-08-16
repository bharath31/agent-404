import { recover404, type RecoveryConfig } from "./core.js";

export type Agent404Config = RecoveryConfig & {
	/** Paths that should skip recovery (static assets, Next internals). */
	skip?: (url: URL) => boolean;
};

/**
 * Next.js middleware: probe the destination, and if it is a 404, server-render
 * suggestions + JSON-LD + Link headers into the response.
 *
 * ```ts
 * // middleware.ts
 * import { agent404 } from "./adapters/next";
 * export const middleware = agent404({ apiKey: process.env.AGENT404_PUBLIC_KEY! });
 * ```
 */
export function agent404(config: Agent404Config) {
	return async (request: Request): Promise<Response | undefined> => {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/_next") || url.pathname.includes(".")) return undefined;
		if (config.skip?.(url)) return undefined;

		const probeHeaders = new Headers(request.headers);
		probeHeaders.set("x-agent-404", "probe");
		const upstream = await fetch(new Request(request, { headers: probeHeaders, redirect: "manual" }));
		if (upstream.status !== 404) return undefined;
		return recover404(request, upstream, config);
	};
}

/**
 * For `app/not-found.tsx`: fetch suggestions for the current URL and return
 * HTML + JSON-LD that crawlers can read without JS.
 */
export async function renderNotFoundPage(
	request: Request,
	config: RecoveryConfig,
): Promise<Response> {
	const empty = new Response("<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>Not Found</h1></body></html>", {
		status: 404,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
	return recover404(request, empty, config);
}

export { recover404, fetchSuggestions, buildLinkHeader, prefersJson } from "./core.js";

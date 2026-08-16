import { fetchSuggestions, recover404, type RecoveryConfig, type Suggestion } from "./core.js";

export const PROBE_HEADER = "x-agent-404";

const STATIC_EXT =
	/\.(?:js|css|map|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|txt|xml|json|pdf|mp4|webm)$/i;

export type Agent404Config = RecoveryConfig & {
	/** Paths that should skip recovery (static assets, Next internals). */
	skip?: (url: URL) => boolean;
	/** Timeout for the origin probe fetch (suggestion fetch still uses timeoutMs). */
	probeTimeoutMs?: number;
};

function looksLikeStaticAsset(pathname: string): boolean {
	return STATIC_EXT.test(pathname);
}

async function probeOrigin(request: Request, timeoutMs: number): Promise<Response> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const probeHeaders = new Headers(request.headers);
		probeHeaders.set(PROBE_HEADER, "probe");
		return await fetch(new Request(request, { headers: probeHeaders, redirect: "manual" }), {
			signal: ctrl.signal,
		});
	} finally {
		clearTimeout(t);
	}
}

/**
 * Next.js middleware: probe the destination, and if it is a 404, server-render
 * suggestions + JSON-LD + Link headers into the response.
 *
 * Incoming `x-agent-404: probe` requests skip recovery so a self-fetch is not
 * intercepted again (Next Edge Middleware re-runs on `fetch()` to the same host).
 *
 * ```ts
 * // middleware.ts
 * import { agent404 } from "./adapters/next";
 * export const middleware = agent404({ apiKey: process.env.AGENT404_PUBLIC_KEY! });
 * ```
 */
export function agent404(config: Agent404Config) {
	return async (request: Request): Promise<Response | undefined> => {
		if (request.headers.get(PROBE_HEADER) === "probe") return undefined;

		const url = new URL(request.url);
		if (url.pathname.startsWith("/_next") || looksLikeStaticAsset(url.pathname)) return undefined;
		if (config.skip?.(url)) return undefined;

		try {
			const upstream = await probeOrigin(request, config.probeTimeoutMs ?? config.timeoutMs ?? 2_500);
			if (upstream.status !== 404) return undefined;
			return recover404(request, upstream, config);
		} catch {
			return undefined;
		}
	};
}

/**
 * App Router `not-found.tsx` cannot return a raw `Response` (it must return JSX).
 * Use `agent404()` in `middleware.ts` for HTTP-layer recovery (Link headers,
 * JSON Accept, status 404). Use this helper inside `not-found.tsx` to render
 * the same suggestion list in React:
 *
 * ```tsx
 * // app/not-found.tsx
 * import { headers } from "next/headers";
 * import { notFoundSuggestions } from "../../adapters/next";
 *
 * export default async function NotFound() {
 *   const h = await headers();
 *   const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
 *   const proto = h.get("x-forwarded-proto") || "https";
 *   const path = h.get("x-matched-path") || h.get("x-invoke-path") || "/";
 *   const request = new Request(`${proto}://${host}${path}`);
 *   const suggestions = await notFoundSuggestions(request, {
 *     apiKey: process.env.AGENT404_PUBLIC_KEY!,
 *   });
 *   return (
 *     <html>
 *       <body>
 *         <h1>Not Found</h1>
 *         <ul>
 *           {suggestions.map((s) => (
 *             <li key={s.url}><a href={s.url}>{s.title || s.url}</a></li>
 *           ))}
 *         </ul>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * `renderNotFoundPage` is for Route Handlers (`app/not-found/route.ts` is not
 * a Next convention — prefer `app/not-found.tsx` + middleware).
 */
export async function notFoundSuggestions(
	request: Request,
	config: RecoveryConfig,
): Promise<Suggestion[]> {
	const payload = await fetchSuggestions(request.url, {
		...config,
		origin: config.origin || new URL(request.url).origin,
	});
	return payload?.suggestions ?? [];
}

/**
 * For a Route Handler that can return a `Response` (not `not-found.tsx`).
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

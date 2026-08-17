import { type RecoveryConfig, type Suggestion } from "./core.js";
export declare const PROBE_HEADER = "x-agent-404";
export type Agent404Config = RecoveryConfig & {
    /** Paths that should skip recovery (static assets, Next internals). */
    skip?: (url: URL) => boolean;
    /** Timeout for the origin probe fetch (suggestion fetch still uses timeoutMs). */
    probeTimeoutMs?: number;
};
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
export declare function agent404(config: Agent404Config): (request: Request) => Promise<Response | undefined>;
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
export declare function notFoundSuggestions(request: Request, config: RecoveryConfig): Promise<Suggestion[]>;
/**
 * For a Route Handler that can return a `Response` (not `not-found.tsx`).
 */
export declare function renderNotFoundPage(request: Request, config: RecoveryConfig): Promise<Response>;
export { recover404, fetchSuggestions, buildLinkHeader, prefersJson } from "./core.js";

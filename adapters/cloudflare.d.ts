import { type RecoveryConfig } from "./core.js";
/**
 * Cloudflare Worker that recovers origin 404s at the edge.
 *
 * ```ts
 * export default agent404Worker({
 *   apiKey: AGENT404_PUBLIC_KEY,
 *   origin: "https://docs.example.com",
 * });
 * ```
 */
export declare function agent404Worker(config: RecoveryConfig & {
    fetchOrigin?: typeof fetch;
    probeTimeoutMs?: number;
}): {
    fetch(request: Request, _env?: unknown, _ctx?: unknown): Promise<Response>;
};
export { recover404 } from "./core.js";

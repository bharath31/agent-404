import { recover404, type RecoveryConfig } from "./core.js";

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
export function agent404Worker(config: RecoveryConfig & { fetchOrigin?: typeof fetch }) {
	const fetchOrigin = config.fetchOrigin ?? fetch;
	return {
		async fetch(request: Request, _env?: unknown, _ctx?: unknown): Promise<Response> {
			if (request.headers.get("x-agent-404") === "probe") {
				return fetchOrigin(request);
			}
			const probeHeaders = new Headers(request.headers);
			probeHeaders.set("x-agent-404", "probe");
			const probe = new Request(request, { headers: probeHeaders });
			const upstream = await fetchOrigin(probe);
			return recover404(request, upstream, config);
		},
	};
}

export { recover404 } from "./core.js";

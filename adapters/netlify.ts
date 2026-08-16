import { recover404, type RecoveryConfig } from "./core.js";

/**
 * Netlify Edge handler. Export as `middleware` or from `netlify/edge-functions`.
 *
 * ```ts
 * export default agent404Netlify({ apiKey: Deno.env.get("AGENT404_PUBLIC_KEY")! });
 * export const config = { path: "/*" };
 * ```
 */
export function agent404Netlify(config: RecoveryConfig) {
	return async (request: Request, context: { next: () => Promise<Response> }): Promise<Response> => {
		const upstream = await context.next();
		return recover404(request, upstream, config);
	};
}

export { recover404 } from "./core.js";

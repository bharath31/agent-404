import { type RecoveryConfig } from "./core.js";
/**
 * Netlify Edge handler. Export as `middleware` or from `netlify/edge-functions`.
 *
 * ```ts
 * export default agent404Netlify({ apiKey: Deno.env.get("AGENT404_PUBLIC_KEY")! });
 * export const config = { path: "/*" };
 * ```
 */
export declare function agent404Netlify(config: RecoveryConfig): (request: Request, context: {
    next: () => Promise<Response>;
}) => Promise<Response>;
export { recover404 } from "./core.js";

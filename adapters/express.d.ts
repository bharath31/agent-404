import { type RecoveryConfig } from "./core.js";
import type { IncomingMessage } from "node:http";
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
export declare function recoverExpress404(req: IncomingMessage & {
    originalUrl?: string;
    protocol?: string;
}, bodyHtml: string, config: RecoveryConfig): Promise<Response>;
export { recover404 } from "./core.js";

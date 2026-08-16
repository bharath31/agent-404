/**
 * Local test server for Playwright browser tests.
 *
 * Serves fixture HTML from 127.0.0.1 while the script is loaded from localhost
 * (a different origin) so the suite actually exercises cross-origin fetch + CORS.
 * API calls go to the canonical hosted origin, not to whatever host served the script.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_ORIGIN } from "../src/config.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const clientScript = readFileSync(join(import.meta.dirname, "..", "public", "agent-404.min.js"), "utf-8");
const livePageHtml = readFileSync(join(FIXTURES_DIR, "live-page.html"), "utf-8");
const notFoundHtml = readFileSync(join(FIXTURES_DIR, "404-page.html"), "utf-8");

export interface TestServerOptions {
	/** Origin the page is opened on. Default 127.0.0.1 */
	pageHost?: string;
	/** Origin used in the script src. Default localhost (cross-origin vs pageHost). */
	scriptHost?: string;
	/** API origin baked into the snippet. Default canonical www host. */
	apiBase?: string;
	/** When set, load the script from this absolute URL instead of the local server. */
	scriptSrc?: string;
}

function injectScript(
	html: string,
	siteId: string,
	apiKey: string,
	scriptSrc: string,
	apiBase: string,
): string {
	const scriptTag =
		`<script src="${scriptSrc}" data-site-id="${siteId}" data-api-key="${apiKey}" ` +
		`data-api-base="${apiBase}" defer></script>`;
	return html.replace("</body>", `  ${scriptTag}\n</body>`);
}

const LIVE_PATHS = new Set([
	"/docs/v3/authentication",
	"/docs/v3/billing",
	"/docs/v3/users",
]);

export function startServer(
	siteId: string,
	apiKey: string,
	opts: TestServerOptions = {},
): Promise<{ port: number; close: () => void; pageOrigin: string; scriptOrigin: string }> {
	const pageHost = opts.pageHost ?? "127.0.0.1";
	const scriptHost = opts.scriptHost ?? "localhost";
	const apiBase = opts.apiBase ?? CANONICAL_ORIGIN;

	return new Promise((resolve) => {
		const server = createServer(async (req, res) => {
			const url = req.url || "/";

			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Headers": "Content-Type, x-api-key",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				});
				res.end();
				return;
			}

			if (url === "/agent-404.min.js") {
				res.writeHead(200, {
					"Content-Type": "application/javascript",
					"Access-Control-Allow-Origin": "*",
				});
				res.end(clientScript);
				return;
			}

			const port = (server.address() as { port: number }).port;
			const scriptSrc = opts.scriptSrc ?? `http://${scriptHost}:${port}/agent-404.min.js`;

			if (LIVE_PATHS.has(url.split("?")[0] ?? url)) {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(injectScript(livePageHtml, siteId, apiKey, scriptSrc, apiBase));
				return;
			}

			res.writeHead(404, { "Content-Type": "text/html" });
			res.end(injectScript(notFoundHtml, siteId, apiKey, scriptSrc, apiBase));
		});

		server.listen(0, "0.0.0.0", () => {
			const port = (server.address() as { port: number }).port;
			resolve({
				port,
				pageOrigin: `http://${pageHost}:${port}`,
				scriptOrigin: `http://${scriptHost}:${port}`,
				close: () => server.close(),
			});
		});
	});
}

/**
 * Local fixture host for Playwright.
 *
 * Pages are served from 127.0.0.1; the script and API are served from localhost
 * (a different origin) so CORS is real. The API is in-process — CI must not
 * write to production. Production is reserved for smoke-published.test.ts.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSuggestions } from "../src/engine/matcher.js";
import type { PageRecord } from "../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const clientScript = readFileSync(join(import.meta.dirname, "..", "public", "agent-404.min.js"), "utf-8");
const livePageHtml = readFileSync(join(FIXTURES_DIR, "live-page.html"), "utf-8");
const notFoundHtml = readFileSync(join(FIXTURES_DIR, "404-page.html"), "utf-8");

export interface TestServerOptions {
	pageHost?: string;
	scriptHost?: string;
	scriptSrc?: string;
	/** Override API origin. Default: local in-process API on scriptHost. */
	apiBase?: string;
}

function injectScript(
	html: string,
	siteId: string,
	apiKey: string,
	scriptSrc: string,
	apiBase: string,
): string {
	const scriptTag =
		`<script src="${scriptSrc}" data-site-id="${siteId}" data-api-key="${apiKey}"` +
		(apiBase ? ` data-api-base="${apiBase}"` : "") +
		` defer></script>`;
	return html.replace("</body>", `  ${scriptTag}\n</body>`);
}

const LIVE_PATHS = new Set([
	"/docs/v3/authentication",
	"/docs/v3/billing",
	"/docs/v3/users",
]);

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type, x-api-key",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json", ...CORS });
	res.end(JSON.stringify(body));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk) => (data += chunk));
		req.on("end", () => resolve(data));
	});
}

function buildJsonLd(suggestions: { url: string; title: string; matchType: string }[]) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: "Page Not Found",
		mainEntity: {
			"@type": "ItemList",
			itemListElement: suggestions.map((s, i) => ({
				"@type": "ListItem",
				position: i + 1,
				url: s.url,
				name: s.title || s.url,
				description: s.matchType,
			})),
		},
	};
}

export function startServer(
	siteId: string,
	apiKey: string,
	opts: TestServerOptions = {},
): Promise<{
	port: number;
	close: () => void;
	pageOrigin: string;
	scriptOrigin: string;
	apiOrigin: string;
}> {
	const pageHost = opts.pageHost ?? "127.0.0.1";
	const scriptHost = opts.scriptHost ?? "localhost";
	const pages: PageRecord[] = [];
	let nextId = 1;

	return new Promise((resolve) => {
		const server = createServer(async (req, res) => {
			const url = (req.url || "/").split("?")[0] ?? "/";

			if (req.method === "OPTIONS") {
				res.writeHead(204, CORS);
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

			if (url === "/api/register" && req.method === "POST") {
				const key = req.headers["x-api-key"];
				if (key !== apiKey) {
					json(res, 401, { error: "Invalid API key" });
					return;
				}
				const body = JSON.parse(await readBody(req)) as {
					url: string;
					title?: string;
					description?: string;
					headings?: string[];
				};
				const existing = pages.find((p) => p.url === body.url);
				if (existing) {
					existing.title = body.title || existing.title;
					existing.description = body.description || existing.description;
					existing.headings = JSON.stringify(body.headings || []);
					existing.lastSeen = new Date().toISOString();
				} else {
					pages.push({
						id: nextId++,
						siteId,
						url: body.url,
						title: body.title || "",
						description: body.description || "",
						headings: JSON.stringify(body.headings || []),
						lastSeen: new Date().toISOString(),
					});
				}
				json(res, 200, { ok: true });
				return;
			}

			if (url === "/api/suggest" && req.method === "POST") {
				const key = req.headers["x-api-key"];
				if (key !== apiKey) {
					json(res, 401, { error: "Invalid API key" });
					return;
				}
				const body = JSON.parse(await readBody(req)) as { url: string };
				const suggestions = findSuggestions(body.url, pages);
				json(res, 200, {
					deadUrl: body.url,
					suggestions,
					jsonLd: buildJsonLd(suggestions),
				});
				return;
			}

			if (url === "/api/install/status") {
				const key = req.headers["x-api-key"];
				if (key !== apiKey) {
					json(res, 401, { error: "Invalid API key" });
					return;
				}
				json(res, 200, {
					ok: true,
					installVerified: pages.length > 0,
					pageCount: pages.length,
					warning: pages.length === 0 ? "No beacons received" : null,
				});
				return;
			}

			const port = (server.address() as { port: number }).port;
			const localApi = `http://${scriptHost}:${port}`;
			const apiOrigin = opts.apiBase ?? localApi;
			const scriptSrc = opts.scriptSrc ?? `http://${scriptHost}:${port}/agent-404.min.js`;

			if (LIVE_PATHS.has(url)) {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(injectScript(livePageHtml, siteId, apiKey, scriptSrc, apiOrigin));
				return;
			}

			res.writeHead(404, { "Content-Type": "text/html" });
			res.end(injectScript(notFoundHtml, siteId, apiKey, scriptSrc, apiOrigin));
		});

		server.listen(0, "0.0.0.0", () => {
			const port = (server.address() as { port: number }).port;
			resolve({
				port,
				pageOrigin: `http://${pageHost}:${port}`,
				scriptOrigin: `http://${scriptHost}:${port}`,
				apiOrigin: `http://${scriptHost}:${port}`,
				close: () => server.close(),
			});
		});
	});
}

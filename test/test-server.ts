/**
 * Local test server for Playwright browser tests.
 *
 * Serves fixture HTML pages with the agent-404 script injected,
 * and proxies /api/* requests to the real agent404.dev backend.
 *
 * The script src points to this local server so that apiBase resolves
 * to localhost, and API calls get proxied to production.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_BACKEND = "https://www.agent404.dev";
const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

// Read the compiled client script
const clientScript = readFileSync(join(import.meta.dirname, "..", "public", "agent-404.min.js"), "utf-8");

// Read fixture HTML files
const livePageHtml = readFileSync(join(FIXTURES_DIR, "live-page.html"), "utf-8");
const notFoundHtml = readFileSync(join(FIXTURES_DIR, "404-page.html"), "utf-8");

function injectScript(html: string, siteId: string, apiKey: string, port: number): string {
	const scriptTag = `<script src="http://localhost:${port}/agent-404.min.js" data-site-id="${siteId}" data-api-key="${apiKey}" defer></script>`;
	return html.replace("</body>", `  ${scriptTag}\n</body>`);
}

async function proxyToBackend(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const url = `${API_BACKEND}${req.url}`;
	const body = await readBody(req);

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (req.headers["x-api-key"]) {
		headers["x-api-key"] = req.headers["x-api-key"] as string;
	}

	const resp = await fetch(url, {
		method: req.method || "GET",
		headers,
		body: req.method !== "GET" ? body : undefined,
	});

	// Forward CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

	res.writeHead(resp.status, { "Content-Type": "application/json" });
	res.end(await resp.text());
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk) => (data += chunk));
		req.on("end", () => resolve(data));
	});
}

// Paths that are "live" pages — everything else is 404
const LIVE_PATHS = new Set([
	"/docs/v3/authentication",
	"/docs/v3/billing",
	"/docs/v3/users",
]);

export function startServer(siteId: string, apiKey: string): Promise<{ port: number; close: () => void }> {
	return new Promise((resolve) => {
		const server = createServer(async (req, res) => {
			const url = req.url || "/";

			// CORS preflight
			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Headers": "Content-Type, x-api-key",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				});
				res.end();
				return;
			}

			// Serve client script
			if (url === "/agent-404.min.js") {
				res.writeHead(200, { "Content-Type": "application/javascript" });
				res.end(clientScript);
				return;
			}

			// Proxy API calls to backend
			if (url.startsWith("/api/")) {
				await proxyToBackend(req, res);
				return;
			}

			const port = (server.address() as any).port;

			// Serve live page only for known paths
			if (LIVE_PATHS.has(url)) {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(injectScript(livePageHtml, siteId, apiKey, port));
				return;
			}

			// Everything else is a 404
			res.writeHead(404, { "Content-Type": "text/html" });
			res.end(injectScript(notFoundHtml, siteId, apiKey, port));
		});

		server.listen(0, () => {
			const port = (server.address() as any).port;
			resolve({
				port,
				close: () => server.close(),
			});
		});
	});
}

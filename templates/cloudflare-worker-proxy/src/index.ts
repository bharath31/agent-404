export interface Env {
	AGENT404_PUBLIC_KEY: string;
	ORIGIN_URL: string;
	AGENT404_API_BASE?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const originUrl = new URL(request.url);
		const upstreamUrl = new URL(env.ORIGIN_URL);
		originUrl.protocol = upstreamUrl.protocol;
		originUrl.host = upstreamUrl.host;
		originUrl.port = upstreamUrl.port;

		// Fetch upstream origin
		const originResp = await fetch(originUrl.toString(), request);

		// If not 404, return as-is
		if (originResp.status !== 404) {
			return originResp;
		}

		// Fetch Agent 404 suggestions
		try {
			const apiBase = (env.AGENT404_API_BASE || "https://www.agent404.dev").replace(/\/+$/, "");
			const suggestResp = await fetch(`${apiBase}/api/suggest`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.AGENT404_PUBLIC_KEY,
				},
				body: JSON.stringify({ url: request.url }),
			});

			if (!suggestResp.ok) return originResp;

			const data = (await suggestResp.json()) as {
				suggestions: Array<{ url: string; title: string; matchType: string }>;
				jsonLd: object;
			};

			if (!data.suggestions || data.suggestions.length === 0) {
				return originResp;
			}

			// Add Link headers for AI crawlers
			const headers = new Headers(originResp.headers);
			const linkHeader = data.suggestions
				.map((s) => `<${s.url}>; rel="alternate"; title="${s.title}"`)
				.join(", ");
			headers.set("Link", linkHeader);
			headers.set("Vary", "Accept");

			// Return JSON if client prefers it
			const accept = request.headers.get("accept") || "";
			if (accept.includes("application/json") && !accept.includes("text/html")) {
				headers.set("Content-Type", "application/json; charset=utf-8");
				return new Response(JSON.stringify(data), { status: 404, headers });
			}

			// Return enriched HTML
			const originalHtml = await originResp.text();
			const snippet = `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`;
			const html = originalHtml.includes("</body>")
				? originalHtml.replace("</body>", `${snippet}</body>`)
				: originalHtml + snippet;

			headers.delete("content-length");
			return new Response(html, { status: 404, headers });
		} catch {
			return originResp;
		}
	},
};

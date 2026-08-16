export const DEFAULT_API_BASE = "https://www.agent404.dev";

export type Suggestion = {
	url: string;
	title: string;
	description?: string;
	score: number;
	matchType: string;
};

export type SuggestPayload = {
	deadUrl: string;
	suggestions: Suggestion[];
	jsonLd: object;
};

export type RecoveryConfig = {
	apiKey: string;
	apiBase?: string;
	origin?: string;
	timeoutMs?: number;
};

export function buildJsonLd(suggestions: { url: string; title: string; matchType: string }[]): object {
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

export function buildLinkHeader(suggestions: { url: string; title: string }[]): string {
	return suggestions
		.map((s) => `<${s.url}>; rel="alternate"; title="${escapeLinkParam(s.title || s.url)}"`)
		.join(", ");
}

function escapeLinkParam(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function prefersJson(accept: string | null | undefined): boolean {
	if (!accept) return false;
	const json = accept.includes("application/json");
	const html = accept.includes("text/html");
	if (json && !html) return true;
	if (json && html) {
		const jsonQ = qValue(accept, "application/json");
		const htmlQ = qValue(accept, "text/html");
		return jsonQ > htmlQ;
	}
	return false;
}

function qValue(accept: string, type: string): number {
	const part = accept.split(",").map((p) => p.trim()).find((p) => p.startsWith(type));
	if (!part) return 0;
	const q = /;\s*q=([0-9.]+)/.exec(part);
	return q ? Number(q[1]) : 1;
}

export function suggestionListHtml(suggestions: Suggestion[]): string {
	const items = suggestions
		.map(
			(s) =>
				`<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title || s.url)}</a> <span>${escapeHtml(s.matchType)}</span></li>`,
		)
		.join("");
	return `<aside id="agent-404-suggestions"><h3>Were you looking for one of these?</h3><ul>${items}</ul></aside>`;
}

export function jsonLdScript(jsonLd: object): string {
	return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

export function injectRecoveryHtml(html: string, payload: SuggestPayload): string {
	if (!payload.suggestions.length) return html;
	const block = jsonLdScript(payload.jsonLd) + suggestionListHtml(payload.suggestions);
	if (html.includes("</body>")) return html.replace("</body>", `${block}</body>`);
	if (html.includes("</html>")) return html.replace("</html>", `${block}</html>`);
	return html + block;
}

export async function fetchSuggestions(
	deadUrl: string,
	config: RecoveryConfig,
): Promise<SuggestPayload | null> {
	const apiBase = (config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 2_500);
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
		};
		if (config.origin) headers.Origin = config.origin;
		const resp = await fetch(`${apiBase}/api/suggest`, {
			method: "POST",
			headers,
			body: JSON.stringify({ url: deadUrl }),
			signal: ctrl.signal,
		});
		if (!resp.ok) return null;
		return (await resp.json()) as SuggestPayload;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

/**
 * Rewrite a 404 Response so agents see suggestions without executing JS.
 * Status stays 404. `Accept: application/json` gets the /api/suggest body.
 */
export async function recover404(
	request: Request,
	response: Response,
	config: RecoveryConfig,
): Promise<Response> {
	if (response.status !== 404) return response;
	if (request.headers.get("x-agent-404") === "probe") return response;

	const payload = await fetchSuggestions(request.url, {
		...config,
		origin: config.origin || originFromRequest(request),
	});
	if (!payload || payload.suggestions.length === 0) {
		const headers = new Headers(response.headers);
		headers.set("Vary", mergeVary(headers.get("Vary")));
		return new Response(response.body, { status: 404, statusText: response.statusText, headers });
	}

	const headers = new Headers(response.headers);
	headers.set("Vary", mergeVary(headers.get("Vary")));
	headers.set("Link", buildLinkHeader(payload.suggestions));

	if (prefersJson(request.headers.get("accept"))) {
		headers.set("Content-Type", "application/json; charset=utf-8");
		return new Response(JSON.stringify(payload), { status: 404, headers });
	}

	const contentType = headers.get("content-type") || "";
	if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
		headers.set("Content-Type", "text/html; charset=utf-8");
		const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Found</title></head><body><h1>Not Found</h1>${suggestionListHtml(payload.suggestions)}${jsonLdScript(payload.jsonLd)}</body></html>`;
		return new Response(html, { status: 404, headers });
	}

	const html = injectRecoveryHtml(await response.text(), payload);
	headers.delete("content-length");
	return new Response(html, { status: 404, headers });
}

function originFromRequest(request: Request): string | undefined {
	try {
		return new URL(request.url).origin;
	} catch {
		return undefined;
	}
}

function mergeVary(existing: string | null): string {
	const parts = new Set(
		(existing || "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);
	parts.add("Accept");
	return [...parts].join(", ");
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

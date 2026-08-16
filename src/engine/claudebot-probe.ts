import { isBlockedInternalHost } from "../lib/ssrf-guard.js";

export interface ClaudeBotProbeResult {
	targetUrl: string;
	status: number;
	hasLinkHeaders: boolean;
	hasJsonLd: boolean;
	hasSuggestions: boolean;
	verdict: "unrecovered_404" | "recovered_404" | "non_404" | "error";
	summary: string;
	headersSnippet: Record<string, string>;
	bodySnippet: string;
	comparison: {
		current: {
			status: number;
			recoverySupported: boolean;
			headers: string[];
			jsonLdFound: boolean;
		};
		withAgent404: {
			status: 404;
			recoverySupported: boolean;
			linkHeader: string;
			jsonLdType: "schema.org/ItemList";
		};
	};
}

const CLAUDEBOT_UA = "Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://www.anthropic.com/claudebot)";

/**
 * Probe what a dead URL on a domain returns to ClaudeBot today (BAT-39).
 * Tests if the site returns recovery signals (Link headers, schema.org JSON-LD).
 */
export async function probeClaudeBotResponse(
	domain: string,
	path = "/non-existent-probe-agent-404",
): Promise<ClaudeBotProbeResult> {
	const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
	if (isBlockedInternalHost(cleanDomain)) {
		throw new Error("Invalid or blocked domain");
	}

	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const targetUrl = `https://${cleanDomain}${normalizedPath}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 6000);

	try {
		const res = await fetch(targetUrl, {
			method: "GET",
			headers: {
				"User-Agent": CLAUDEBOT_UA,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: controller.signal,
			redirect: "follow",
		});

		const text = await res.text().catch(() => "");
		const bodySnippet = text.slice(0, 500);

		const linkHeader = res.headers.get("link") || "";
		const hasLinkHeaders = linkHeader.toLowerCase().includes("rel=alternate") || linkHeader.toLowerCase().includes('rel="alternate"');
		const hasJsonLd = text.includes("application/ld+json") && text.includes("schema.org");
		const hasSuggestions = text.toLowerCase().includes("suggestions") || text.includes("agent-404");

		let verdict: ClaudeBotProbeResult["verdict"] = "unrecovered_404";
		let summary = "ClaudeBot receives a bare 404 with no recovery signals. The agent will abandon the request or hallucinate.";

		if (res.status !== 404 && res.status >= 200 && res.status < 400) {
			verdict = "non_404";
			summary = `Target returned HTTP ${res.status}. If this is a soft-404, crawlers cannot distinguish missing content from live pages.`;
		} else if (hasLinkHeaders || hasJsonLd) {
			verdict = "recovered_404";
			summary = "Site provides structured recovery information in the response.";
		}

		const headersSnippet: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			if (["content-type", "link", "vary", "server"].includes(k.toLowerCase())) {
				headersSnippet[k] = v;
			}
		});

		return {
			targetUrl,
			status: res.status,
			hasLinkHeaders,
			hasJsonLd,
			hasSuggestions,
			verdict,
			summary,
			headersSnippet,
			bodySnippet,
			comparison: {
				current: {
					status: res.status,
					recoverySupported: hasLinkHeaders || hasJsonLd,
					headers: linkHeader ? [linkHeader] : [],
					jsonLdFound: hasJsonLd,
				},
				withAgent404: {
					status: 404,
					recoverySupported: true,
					linkHeader: `Link: <https://${cleanDomain}/>; rel="alternate"`,
					jsonLdType: "schema.org/ItemList",
				},
			},
		};
	} catch (err: any) {
		return {
			targetUrl,
			status: 0,
			hasLinkHeaders: false,
			hasJsonLd: false,
			hasSuggestions: false,
			verdict: "error",
			summary: `Could not reach ${targetUrl} (${err?.message || "connection error"}).`,
			headersSnippet: {},
			bodySnippet: "",
			comparison: {
				current: {
					status: 0,
					recoverySupported: false,
					headers: [],
					jsonLdFound: false,
				},
				withAgent404: {
					status: 404,
					recoverySupported: true,
					linkHeader: `Link: <https://${cleanDomain}/>; rel="alternate"`,
					jsonLdType: "schema.org/ItemList",
				},
			},
		};
	} finally {
		clearTimeout(timeout);
	}
}

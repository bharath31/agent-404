import type { AnalysisReport } from "../types.js";

interface PageInfo {
	url: string;
	title: string;
}

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;
const OVERALL_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = "Mozilla/5.0 (compatible; agent-404-analyzer/1.0)";

/** Extract internal <a href> links from HTML */
function extractInternalLinks(html: string, domain: string): string[] {
	const links: string[] = [];
	const hrefRe = /<a\s[^>]*href=["']([^"']+)["']/gi;
	let match: RegExpExecArray | null;
	while ((match = hrefRe.exec(html)) !== null) {
		const href = match[1];
		try {
			const url = new URL(href, `https://${domain}`);
			if (url.hostname === domain || url.hostname === `www.${domain}`) {
				const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
				links.push(normalized);
			}
		} catch {
			// skip invalid URLs
		}
	}
	return links;
}

/** SSRF protection: block private/internal IPs */
const BLOCKED_PREFIXES = [
	"localhost", "127.", "0.0.0.0", "10.",
	"172.16.", "172.17.", "172.18.", "172.19.",
	"172.20.", "172.21.", "172.22.", "172.23.",
	"172.24.", "172.25.", "172.26.", "172.27.",
	"172.28.", "172.29.", "172.30.", "172.31.",
	"192.168.", "169.254.", "[::1]", "[fc", "[fd",
];

function isBlockedHost(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	return BLOCKED_PREFIXES.some((b) => lower === b || lower.startsWith(b));
}

async function fetchPageHtml(url: string): Promise<string | null> {
	try {
		const parsed = new URL(url);
		if (isBlockedHost(parsed.hostname)) return null;
	} catch {
		return null;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
			signal: controller.signal,
			redirect: "follow",
		});
		if (!resp.ok) return null;
		return await resp.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Analyze a site's indexed pages for broken internal links and orphan pages.
 */
export async function analyzeSite(
	pages: PageInfo[],
	domain: string,
): Promise<AnalysisReport> {
	const deadline = Date.now() + OVERALL_TIMEOUT_MS;
	const pageUrlSet = new Set(pages.map((p) => p.url.replace(/\/+$/, "")));
	const brokenLinks: AnalysisReport["brokenLinks"] = [];
	const inboundCount = new Map<string, number>();

	// Initialize inbound counts
	for (const url of pageUrlSet) {
		inboundCount.set(url, 0);
	}

	let pagesAnalyzed = 0;

	// Process in batches
	for (let i = 0; i < pages.length; i += BATCH_SIZE) {
		if (Date.now() >= deadline) break;

		const batch = pages.slice(i, i + BATCH_SIZE);
		const results = await Promise.all(batch.map((p) => fetchPageHtml(p.url)));

		for (let j = 0; j < batch.length; j++) {
			const html = results[j];
			if (!html) continue;
			pagesAnalyzed++;

			const links = extractInternalLinks(html, domain);
			for (const link of links) {
				if (pageUrlSet.has(link)) {
					inboundCount.set(link, (inboundCount.get(link) || 0) + 1);
				} else {
					brokenLinks.push({ sourcePage: batch[j].url, targetUrl: link });
				}
			}
		}

		if (i + BATCH_SIZE < pages.length && Date.now() < deadline) {
			await sleep(BATCH_DELAY_MS);
		}
	}

	// Orphans = pages with zero inbound links from other indexed pages
	const orphanPages = [...inboundCount.entries()]
		.filter(([, count]) => count === 0)
		.map(([url]) => url);

	return {
		domain,
		analyzedAt: new Date().toISOString(),
		pagesAnalyzed,
		brokenLinks,
		orphanPages,
	};
}

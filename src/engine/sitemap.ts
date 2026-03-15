import type { PageRecord } from "../types.js";
import type { StorageAdapter } from "../storage/interface.js";
import { buildEmbeddingText, generateBatchEmbeddings } from "./embeddings.js";

const EMBEDDING_BATCH_SIZE = 100;
const MAX_SITEMAP_URLS = 5000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Check if a hostname resolves to a private/internal IP range.
 */
function isPrivateHost(hostname: string): boolean {
	const blocked = [
		"localhost",
		"127.",
		"0.0.0.0",
		"10.",
		"172.16.", "172.17.", "172.18.", "172.19.",
		"172.20.", "172.21.", "172.22.", "172.23.",
		"172.24.", "172.25.", "172.26.", "172.27.",
		"172.28.", "172.29.", "172.30.", "172.31.",
		"192.168.",
		"169.254.",
		"[::1]",
		"[fc",
		"[fd",
	];
	const lower = hostname.toLowerCase();
	return blocked.some((b) => lower === b || lower.startsWith(b));
}

/**
 * Crawl a domain's sitemap.xml and upsert all discovered URLs with embeddings.
 */
export async function crawlSitemap(domain: string, siteId: string, storage: StorageAdapter): Promise<number> {
	if (isPrivateHost(domain)) {
		console.error(`Blocked sitemap crawl for private host: ${domain}`);
		return 0;
	}

	const sitemapUrl = `https://${domain}/sitemap.xml`;
	let count = 0;

	try {
		const urls = (await fetchSitemapUrls(sitemapUrl)).slice(0, MAX_SITEMAP_URLS);
		const pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[] = urls.map(
			(url) => ({
				url,
				title: titleFromUrl(url),
				description: "",
				headings: "[]",
			}),
		);

		if (pages.length > 0) {
			// Generate embeddings in batches
			const allEmbeddings: (number[] | null)[] = [];
			for (let i = 0; i < pages.length; i += EMBEDDING_BATCH_SIZE) {
				const batch = pages.slice(i, i + EMBEDDING_BATCH_SIZE);
				const texts = batch.map((p) => buildEmbeddingText(p));
				const embeddings = await generateBatchEmbeddings(texts);
				allEmbeddings.push(...embeddings);
			}

			await storage.upsertPages(siteId, pages, allEmbeddings);
			count = pages.length;
		}
	} catch (err: any) {
		console.error(`Failed to crawl sitemap for ${domain}:`, err?.message || "unknown error");
	}

	return count;
}

async function fetchSitemapUrls(url: string): Promise<string[]> {
	// SSRF: validate the URL points to a public host
	try {
		const parsed = new URL(url);
		if (isPrivateHost(parsed.hostname)) return [];
		if (parsed.protocol !== "https:") return [];
	} catch {
		return [];
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": "agent-404-bot/1.0" },
			signal: controller.signal,
		});
		if (!resp.ok) return [];

		const xml = await resp.text();

		// Check if this is a sitemap index
		if (xml.includes("<sitemapindex")) {
			const sitemapLocs = extractLocs(xml, "sitemap");
			const allUrls: string[] = [];
			// Fetch up to 5 child sitemaps to avoid excessive crawling
			const children = sitemapLocs.slice(0, 5);
			for (const childUrl of children) {
				const childUrls = await fetchSitemapUrls(childUrl);
				allUrls.push(...childUrls);
			}
			return allUrls;
		}

		return extractLocs(xml, "url");
	} finally {
		clearTimeout(timeout);
	}
}

function extractLocs(xml: string, parentTag: string): string[] {
	const urls: string[] = [];
	const regex = new RegExp(`<${parentTag}>[\\s\\S]*?<loc>([^<]+)<\\/loc>[\\s\\S]*?<\\/${parentTag}>`, "gi");
	let match: RegExpExecArray | null;
	while ((match = regex.exec(xml)) !== null) {
		const loc = match[1].trim();
		if (loc) urls.push(loc);
	}
	return urls;
}

function titleFromUrl(url: string): string {
	try {
		const path = new URL(url).pathname;
		const last = path.split("/").filter(Boolean).pop() || "";
		return last.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
	} catch {
		return "";
	}
}

import type { PageRecord } from "../types.js";
import type { StorageAdapter } from "../storage/interface.js";

/**
 * Crawl a domain's sitemap.xml and upsert all discovered URLs.
 */
export async function crawlSitemap(domain: string, siteId: string, storage: StorageAdapter): Promise<number> {
	const sitemapUrl = `https://${domain}/sitemap.xml`;
	let count = 0;

	try {
		const urls = await fetchSitemapUrls(sitemapUrl);
		const pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[] = urls.map(
			(url) => ({
				url,
				title: titleFromUrl(url),
				description: "",
				headings: "[]",
			}),
		);

		if (pages.length > 0) {
			await storage.upsertPages(siteId, pages);
			count = pages.length;
		}
	} catch (err) {
		console.error(`Failed to crawl sitemap for ${domain}:`, err);
	}

	return count;
}

async function fetchSitemapUrls(url: string): Promise<string[]> {
	const resp = await fetch(url, {
		headers: { "User-Agent": "agent-404-bot/1.0" },
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

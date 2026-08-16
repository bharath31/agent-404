import type { PageRecord } from "../types.js";
import type { StorageAdapter } from "../storage/interface.js";
import { generatePageEmbedding } from "./embeddings.js";

export async function registerPage(
	storage: StorageAdapter,
	siteId: string,
	page: Pick<PageRecord, "url" | "title" | "description" | "headings"> & {
		contentHash?: string | null;
	},
): Promise<{ skipped: boolean }> {
	if (page.contentHash) {
		const existing = await storage.getPageContentHash(siteId, page.url);
		if (existing && existing === page.contentHash) {
			await storage.touchPage(siteId, page.url);
			return { skipped: true };
		}
	}

	const embedding = await generatePageEmbedding(page);
	await storage.upsertPage(siteId, page, embedding);
	return { skipped: false };
}

export async function pruneStalePages(
	storage: StorageAdapter,
	siteId: string,
	days: number,
): Promise<number> {
	const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	return storage.deleteStalePagesOlderThan(siteId, cutoff);
}

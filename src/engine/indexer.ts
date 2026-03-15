import type { PageRecord } from "../types.js";
import type { StorageAdapter } from "../storage/interface.js";
import { generatePageEmbedding } from "./embeddings.js";

/**
 * Upsert a single page record from a beacon, generating an embedding.
 */
export async function registerPage(
	storage: StorageAdapter,
	siteId: string,
	page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
): Promise<void> {
	const embedding = await generatePageEmbedding(page);
	await storage.upsertPage(siteId, page, embedding);
}

/**
 * Remove pages not seen in the given number of days.
 */
export async function pruneStalePages(
	storage: StorageAdapter,
	siteId: string,
	days: number,
): Promise<number> {
	const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	return storage.deleteStalePagesOlderThan(siteId, cutoff);
}

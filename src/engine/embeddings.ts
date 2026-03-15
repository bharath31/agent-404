import type { PageRecord } from "../types.js";

const EMBEDDING_URL = process.env.EMBEDDING_API_URL || "https://openrouter.ai/api/v1/embeddings";
const MODEL = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";
const DIMENSIONS = 256;

/**
 * Generate an embedding for a single text string.
 * Returns null if the API key is missing or the request fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
	const results = await generateBatchEmbeddings([text]);
	return results[0];
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Returns null for any text that fails.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
	const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
	if (!apiKey || texts.length === 0) {
		return texts.map(() => null);
	}

	try {
		const resp = await fetch(EMBEDDING_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				input: texts,
				model: MODEL,
				dimensions: DIMENSIONS,
			}),
		});

		if (!resp.ok) {
			console.error(`Embedding API error: ${resp.status}`);
			return texts.map(() => null);
		}

		const data = (await resp.json()) as {
			data: { embedding: number[]; index: number }[];
		};

		const results: (number[] | null)[] = texts.map(() => null);
		for (const item of data.data) {
			results[item.index] = item.embedding;
		}
		return results;
	} catch (err: any) {
		console.error("Embedding API request failed:", err?.message || "unknown error");
		return texts.map(() => null);
	}
}

/**
 * Build the text to embed for a page: URL path segments + title + description.
 */
export function buildEmbeddingText(page: Pick<PageRecord, "url" | "title" | "description">): string {
	let pathPart = "";
	try {
		const u = new URL(page.url);
		pathPart = u.pathname
			.split("/")
			.filter(Boolean)
			.map((s) => s.replace(/[-_]/g, " "))
			.join(" ");
	} catch {
		pathPart = page.url;
	}

	return [pathPart, page.title, page.description].filter(Boolean).join(" — ");
}

/**
 * Generate an embedding for a page record.
 */
export async function generatePageEmbedding(
	page: Pick<PageRecord, "url" | "title" | "description">,
): Promise<number[] | null> {
	const text = buildEmbeddingText(page);
	return generateEmbedding(text);
}

/**
 * Generate an embedding for a dead URL (used at suggest time).
 * Builds text from the URL path segments.
 */
export async function generateDeadUrlEmbedding(deadUrl: string): Promise<number[] | null> {
	let text = "";
	try {
		const u = new URL(deadUrl);
		text = u.pathname
			.split("/")
			.filter(Boolean)
			.map((s) => s.replace(/[-_]/g, " "))
			.join(" ");
	} catch {
		text = deadUrl;
	}

	if (!text) return null;
	return generateEmbedding(text);
}

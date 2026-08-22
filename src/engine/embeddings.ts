import type { PageRecord } from "../types";
import { getCloudflareEmbeddingConfig, getEmbeddingConfig } from "../config";

const DIMENSIONS = 768;
const CLOUDFLARE_MODEL = "@cf/baai/bge-base-en-v1.5";
const CLOUDFLARE_DIMENSIONS = 768;

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
 * Cloudflare Workers AI is used when credentials are configured; otherwise
 * falls back to a generic OpenAI-compatible embeddings API.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];

	// Trim and drop empty texts — embedding APIs reject empty parts.
	const indexes: number[] = [];
	const usable: string[] = [];
	texts.forEach((text, i) => {
		const trimmed = text.trim();
		if (trimmed) {
			indexes.push(i);
			usable.push(trimmed);
		}
	});

	let results: (number[] | null)[];
	if (usable.length === 0) {
		results = [];
	} else {
		const cfResults = await generateViaCloudflare(usable);
		results = cfResults ?? (await generateViaOpenAiCompatible(usable));
	}

	const out: (number[] | null)[] = texts.map(() => null);
	results.forEach((result, j) => {
		out[indexes[j]] = result;
	});
	return out;
}

async function generateViaCloudflare(texts: string[]): Promise<(number[] | null)[] | null> {
	const { accountId, apiToken } = getCloudflareEmbeddingConfig();
	if (!accountId || !apiToken) {
		return null;
	}

	try {
		const resp = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ text: texts }),
			},
		);

		if (!resp.ok) {
			console.error(`Cloudflare embedding error: ${resp.status}`);
			return texts.map(() => null);
		}

		const data = (await resp.json()) as {
			success: boolean;
			errors?: { message: string }[];
			result?: { data: number[][] | number[] };
		};

		const rows = Array.isArray(data.result?.data)
			? Array.isArray(data.result.data[0])
				? (data.result.data as number[][])
				: [data.result.data as number[]]
			: [];
		if (!data.success || rows.length === 0) {
			console.error(
				"Cloudflare embedding error:",
				data.errors?.[0]?.message ?? "empty result",
			);
			return texts.map(() => null);
		}

		const results: (number[] | null)[] = texts.map(() => null);
		for (let i = 0; i < rows.length && i < texts.length; i++) {
			const emb = rows[i];
			if (
				emb.length === CLOUDFLARE_DIMENSIONS &&
				emb.every((v) => typeof v === "number" && Number.isFinite(v))
			) {
				results[i] = emb;
			}
		}
		return results;
	} catch (err: any) {
		console.error("Cloudflare embedding request failed:", err?.message || "unknown error");
		return texts.map(() => null);
	}
}

async function generateViaOpenAiCompatible(texts: string[]): Promise<(number[] | null)[]> {
	const { url, model, apiKey } = getEmbeddingConfig();
	if (!apiKey || texts.length === 0) {
		return texts.map(() => null);
	}

	try {
		const resp = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				input: texts,
				model,
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
/** Text to embed for a dead URL: its path segments, unslugified. */
export function deadUrlEmbeddingText(deadUrl: string): string {
	try {
		const u = new URL(deadUrl);
		return u.pathname
			.split("/")
			.filter(Boolean)
			.map((s) => s.replace(/[-_]/g, " "))
			.join(" ");
	} catch {
		return deadUrl;
	}
}

export async function generateDeadUrlEmbedding(deadUrl: string): Promise<number[] | null> {
	const text = deadUrlEmbeddingText(deadUrl);
	if (!text) return null;
	return generateEmbedding(text);
}

import type { PageRecord, Suggestion } from "../types.js";
import { stemToken } from "./stemmer.js";

const SCORE_THRESHOLD = 0.2;
const MAX_RESULTS = 5;

// 4-signal weights (when embedding available)
const W4_PATH_SEG = 0.35;
const W4_LEVENSHTEIN = 0.2;
const W4_TEXT = 0.15;
const W4_EMBEDDING = 0.3;

// 3-signal weights (fallback when embedding unavailable)
const W3_PATH_SEG = 0.5;
const W3_LEVENSHTEIN = 0.3;
const W3_TEXT = 0.2;

/**
 * Rank pages against a dead URL and return top suggestions.
 * Optionally accepts a dead URL embedding for semantic matching.
 */
export function findSuggestions(
	deadUrl: string,
	pages: PageRecord[],
	deadUrlEmbedding?: number[] | null,
): Suggestion[] {
	const deadPath = normalizePath(deadUrl);
	const deadSegments = pathSegments(deadPath);
	const deadKeywords = extractKeywords(deadPath);

	const scored: Suggestion[] = [];

	for (const page of pages) {
		const pagePath = normalizePath(page.url);
		const pageSegments = pathSegments(pagePath);

		// Signal 1: Path segment similarity (Jaccard, version-tolerant)
		const pathSegScore = jaccardVersionTolerant(deadSegments, pageSegments);

		// Signal 2: Levenshtein distance (normalized)
		const levScore = 1 - normalizedLevenshtein(deadPath, pagePath);

		// Signal 3: Text keyword overlap (includes path keywords + content)
		const pageKeywords = extractKeywords(pagePath);
		const headings: string[] = safeParseArray(page.headings);
		const textPool = [page.title, page.description, ...headings].join(" ").toLowerCase();
		const textKeywords = new Set([
			...textPool.split(/\W+/).filter((w) => w.length > 2),
			...pageKeywords,
		]);
		const textScore = keywordOverlap(deadKeywords, textKeywords);

		// Signal 4: Embedding cosine similarity (when both embeddings available)
		const hasEmbedding = deadUrlEmbedding && page.embedding;
		let score: number;

		if (hasEmbedding) {
			const embeddingScore = cosineSimilarity(deadUrlEmbedding, page.embedding!);
			score =
				W4_PATH_SEG * pathSegScore +
				W4_LEVENSHTEIN * levScore +
				W4_TEXT * textScore +
				W4_EMBEDDING * embeddingScore;
		} else {
			score =
				W3_PATH_SEG * pathSegScore +
				W3_LEVENSHTEIN * levScore +
				W3_TEXT * textScore;
		}

		if (score >= SCORE_THRESHOLD) {
			const hasVersionDiff = detectVersionDiff(deadSegments, pageSegments);
			let matchType: Suggestion["matchType"];
			if (hasVersionDiff && score > 0.6) matchType = "moved";
			else if (score > 0.6) matchType = "similar";
			else matchType = "related";

			scored.push({
				url: page.url,
				title: page.title,
				description: page.description,
				score: Math.round(score * 1000) / 1000,
				matchType,
			});
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, MAX_RESULTS);
}

// --- Helpers ---

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 0;
	return dot / denom;
}

function normalizePath(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname.replace(/\/+$/, "").toLowerCase();
	} catch {
		return url.replace(/\/+$/, "").toLowerCase();
	}
}

function pathSegments(path: string): string[] {
	return path.split("/").filter(Boolean);
}

function extractKeywords(path: string): Set<string> {
	return new Set(
		path
			.split(/[\/_\-./]+/)
			.filter((w) => w.length > 2)
			.map((w) => w.toLowerCase()),
	);
}

function safeParseArray(json: string): string[] {
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Check if one string is a prefix of the other (min 3 chars) */
function isPrefixMatch(a: string, b: string): boolean {
	if (a.length < 3 || b.length < 3) return false;
	return a.startsWith(b) || b.startsWith(a);
}

/** Jaccard similarity with version-tolerance and prefix matching */
function jaccardVersionTolerant(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) return 1;
	if (a.length === 0 || b.length === 0) return 0;

	let matches = 0;
	const bSet = new Set(b);
	const used = new Set<string>();

	for (const seg of a) {
		if (bSet.has(seg)) {
			matches += 1;
			used.add(seg);
		} else {
			// Version-tolerant: v2 ↔ v3 = 0.5
			const versionMatch = b.find(
				(bSeg) => !used.has(bSeg) && isVersionVariant(seg, bSeg),
			);
			if (versionMatch) {
				matches += 0.5;
				used.add(versionMatch);
			} else {
				// Prefix match: "work" ↔ "workers" = 0.7
				const prefixMatch = b.find(
					(bSeg) => !used.has(bSeg) && isPrefixMatch(seg, bSeg),
				);
				if (prefixMatch) {
					matches += 0.7;
					used.add(prefixMatch);
				} else {
					// Stem match: "message" ↔ "messaging" = 0.6
					const stemMatch = b.find(
						(bSeg) => !used.has(bSeg) && stemToken(seg) === stemToken(bSeg),
					);
					if (stemMatch) {
						matches += 0.6;
						used.add(stemMatch);
					}
				}
			}
		}
	}

	const union = new Set([...a, ...b]).size;
	return matches / union;
}

const VERSION_RE = /^(v|ver|version)?(\d+)$/;

function isVersionVariant(a: string, b: string): boolean {
	const ma = VERSION_RE.exec(a);
	const mb = VERSION_RE.exec(b);
	if (!ma || !mb) return false;
	// Both are version-like and share a prefix pattern
	return ma[1] === mb[1] && ma[2] !== mb[2];
}

function detectVersionDiff(a: string[], b: string[]): boolean {
	for (const seg of a) {
		for (const bSeg of b) {
			if (isVersionVariant(seg, bSeg)) return true;
		}
	}
	return false;
}

function normalizedLevenshtein(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 0;
	return levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
		}
	}
	return dp[m][n];
}

function keywordOverlap(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const word of a) {
		if (b.has(word)) {
			intersection++;
		} else {
			// Prefix match: "message" matches "messaging" as 0.7
			let matched = false;
			for (const bWord of b) {
				if (isPrefixMatch(word, bWord)) {
					intersection += 0.7;
					matched = true;
					break;
				}
			}
			// Stem match: "deploy" matches "deployment" as 0.6
			if (!matched) {
				for (const bWord of b) {
					if (stemToken(word) === stemToken(bWord)) {
						intersection += 0.6;
						break;
					}
				}
			}
		}
	}
	const union = new Set([...a, ...b]).size;
	return intersection / union;
}

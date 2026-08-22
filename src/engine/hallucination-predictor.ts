import type { PageRecord, Suggestion } from "../types";
import { findSuggestions } from "./matcher";
import { stemToken } from "./stemmer";
import { buildEmbeddingText, deadUrlEmbeddingText, generateBatchEmbeddings } from "./embeddings";
import { normalizePathname } from "./url-normalize";

export interface HallucinationPrediction {
	hallucinatedPath: string;
	intendedUrl: string;
	mutationType:
		| "version_drift"
		| "pluralization"
		| "delimiter_drift"
		| "hierarchy_drift"
		| "extension_drift"
		| "synonym_drift";
	topSuggestion?: Suggestion;
	recovered: boolean;
	confidence: number;
}

export interface HallucinationAuditSummary {
	totalTested: number;
	recoveredCount: number;
	recoveryRate: number; // 0.0 - 1.0 (e.g. 0.95 = 95%)
	vulnerabilities: Array<{
		path: string;
		reason: string;
	}>;
	predictions: HallucinationPrediction[];
}

const COMMON_SYNONYMS: Record<string, string[]> = {
	docs: ["doc", "documentation", "guide", "reference", "api"],
	doc: ["docs", "documentation", "guide"],
	documentation: ["docs", "doc", "guides"],
	guide: ["tutorial", "howto", "docs", "manual"],
	guides: ["tutorials", "docs", "manuals"],
	reference: ["api", "docs", "spec"],
	api: ["reference", "docs", "endpoints"],
	auth: ["authentication", "login", "oauth"],
	authentication: ["auth", "login"],
	pricing: ["plans", "cost", "tier", "billing"],
	setting: ["settings", "preferences", "config"],
	settings: ["setting", "preferences", "config"],
	account: ["accounts", "profile", "user"],
	users: ["user", "accounts", "members"],
	user: ["users", "account", "profile"],
	install: ["installation", "setup", "quickstart", "getting-started"],
	installation: ["install", "setup", "quickstart"],
	quickstart: ["getting-started", "start", "install", "intro"],
	faq: ["help", "support", "questions"],
	changelog: ["releases", "updates", "history"],
	releases: ["changelog", "updates", "release-notes"],
};

/**
 * Predict paths that AI crawlers and LLMs are likely to hallucinate based on site's actual routes.
 */
export function generateHallucinatedPaths(
	knownPaths: string[],
): Array<{ path: string; sourcePath: string; mutationType: HallucinationPrediction["mutationType"] }> {
	const existingSet = new Set(knownPaths.map((p) => normalizePathname(p)));
	const candidateMap = new Map<
		string,
		{ path: string; sourcePath: string; mutationType: HallucinationPrediction["mutationType"] }
	>();

	const addCandidate = (
		candPath: string,
		sourcePath: string,
		mutationType: HallucinationPrediction["mutationType"],
	) => {
		const normalized = normalizePathname(candPath);
		if (normalized === "/" || existingSet.has(normalized) || candidateMap.has(normalized)) {
			return;
		}
		candidateMap.set(normalized, {
			path: normalized,
			sourcePath,
			mutationType,
		});
	};

	for (const originalPath of knownPaths) {
		const norm = normalizePathname(originalPath);
		if (norm === "/") continue;

		const segments = norm.split("/").filter(Boolean);
		if (segments.length === 0) continue;

		// 1. Version Drift: /v2/auth -> /v1/auth, /v3/auth, /docs/v1/..., etc.
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const vMatch = /^(v|ver|version)?(\d+)$/i.exec(seg);
			if (vMatch) {
				const prefix = vMatch[1] || "v";
				const hasPrefix = Boolean(vMatch[1]);
				const num = parseInt(vMatch[2], 10);
				const variants: number[] = [];
				if (!hasPrefix && num > 10) {
					// Bare all-numeric segments this large are almost always
					// years/IDs/pagination (/blog/2024), not versions. Generating
					// 1..2026 variants here flooded the candidate map with ~2k
					// entries per path and crowded out meaningful candidates.
					// Skip version drift entirely for these.
				} else if (num <= 10) {
					// Real version segments (v2, v3, ...): try the plausible range.
					for (let n = 1; n <= Math.max(num + 2, 4); n++) {
						if (n !== num) variants.push(n);
					}
				} else {
					// Prefixed large versions (v2023-style): only adjacent values
					// are plausible; anything further is noise.
					for (let n = num - 1; n <= num + 2; n++) {
						if (n !== num && n > 0) variants.push(n);
					}
				}
				for (const varNum of variants) {
					const cloned = [...segments];
					cloned[i] = `${prefix}${varNum}`;
					addCandidate(`/${cloned.join("/")}`, norm, "version_drift");
				}
			}
		}

		// 2. Pluralization & Singular Drift
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (seg.endsWith("s") && seg.length > 3 && !seg.endsWith("ss")) {
				const singular = seg.slice(0, -1);
				const cloned = [...segments];
				cloned[i] = singular;
				addCandidate(`/${cloned.join("/")}`, norm, "pluralization");
			} else if (!seg.endsWith("s") && seg.length > 2) {
				const plural = `${seg}s`;
				const cloned = [...segments];
				cloned[i] = plural;
				addCandidate(`/${cloned.join("/")}`, norm, "pluralization");
			}
		}

		// 3. Delimiter Drift: kebab-case <-> snake_case <-> camelCase <-> slash
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (seg.includes("-")) {
				const underscored = seg.replace(/-/g, "_");
				const flat = seg.replace(/-/g, "");
				const nested = seg.replace(/-/g, "/");

				const cloned1 = [...segments];
				cloned1[i] = underscored;
				addCandidate(`/${cloned1.join("/")}`, norm, "delimiter_drift");

				const cloned2 = [...segments];
				cloned2[i] = flat;
				addCandidate(`/${cloned2.join("/")}`, norm, "delimiter_drift");

				const cloned3 = [...segments];
				cloned3[i] = nested;
				addCandidate(`/${cloned3.join("/")}`, norm, "delimiter_drift");
			} else if (seg.includes("_")) {
				const hyphenated = seg.replace(/_/g, "-");
				const cloned = [...segments];
				cloned[i] = hyphenated;
				addCandidate(`/${cloned.join("/")}`, norm, "delimiter_drift");
			}
		}

		// 4. Hierarchy Drift: /docs/quickstart <-> /quickstart, /api/auth <-> /auth
		if (segments.length >= 2 && ["docs", "doc", "api", "guides", "guide"].includes(segments[0])) {
			const withoutPrefix = `/${segments.slice(1).join("/")}`;
			addCandidate(withoutPrefix, norm, "hierarchy_drift");
		} else if (segments.length === 1) {
			addCandidate(`/docs/${segments[0]}`, norm, "hierarchy_drift");
			addCandidate(`/api/${segments[0]}`, norm, "hierarchy_drift");
		}

		// 5. Extension Drift: .html, .md, .json
		const lastSeg = segments[segments.length - 1];
		if (!lastSeg.includes(".")) {
			addCandidate(`${norm}.html`, norm, "extension_drift");
			addCandidate(`${norm}.md`, norm, "extension_drift");
		} else {
			const stripped = norm.replace(/\.[a-z0-9]+$/i, "");
			addCandidate(stripped, norm, "extension_drift");
		}

		// 6. Synonym Drift
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i].toLowerCase();
			const synonyms = COMMON_SYNONYMS[seg];
			if (synonyms) {
				for (const syn of synonyms) {
					const cloned = [...segments];
					cloned[i] = syn;
					addCandidate(`/${cloned.join("/")}`, norm, "synonym_drift");
				}
			}
		}
	}

	return Array.from(candidateMap.values());
}

/**
 * Predict hallucinated queries for a site and evaluate how well agent-404 suggestions recover them.
 *
 * Uses the same 4-signal matcher production /api/suggest uses, including
 * real embeddings when EMBEDDING_API_KEY is configured — generateBatchEmbeddings
 * returns null for every input with no key configured (the common case for
 * the zero-friction `npx agent-404 audit` CLI), so this degrades to the
 * existing 3-signal-only behavior with no added latency or cost in that case.
 * Previously embeddings were hardcoded to null unconditionally, so this tool
 * always measured a strictly worse match than what production actually does
 * for any site with embeddings indexed.
 */
export async function predictAndEvaluateHallucinations(
	pages: Array<{ url: string; title?: string; description?: string; headings?: string }>,
	domain: string,
	maxCandidates = 50,
): Promise<HallucinationAuditSummary> {
	const resolvedUrls = pages.map((p) =>
		p.url.startsWith("http") ? p.url : `https://${domain}${p.url.startsWith("/") ? "" : "/"}${p.url}`,
	);

	const pageEmbeddingTexts = pages.map((p, i) =>
		buildEmbeddingText({ url: resolvedUrls[i], title: p.title || "", description: p.description || "" }),
	);
	const pageEmbeddings = await generateBatchEmbeddings(pageEmbeddingTexts);

	const pageRecords: PageRecord[] = pages.map((p, i) => ({
		id: i,
		siteId: domain,
		url: resolvedUrls[i],
		title: p.title || "",
		description: p.description || "",
		headings: p.headings || "[]",
		embedding: pageEmbeddings[i],
		lastSeen: new Date().toISOString(),
	}));

	const knownPaths = pages.map((p) => {
		try {
			const u = new URL(p.url, `https://${domain}`);
			return u.pathname;
		} catch {
			return p.url;
		}
	});

	const generated = generateHallucinatedPaths(knownPaths).slice(0, maxCandidates);
	const deadUrls = generated.map((item) => `https://${domain}${item.path}`);
	const candidateEmbeddings = await generateBatchEmbeddings(deadUrls.map((u) => deadUrlEmbeddingText(u)));

	const predictions: HallucinationPrediction[] = [];
	let recoveredCount = 0;
	const vulnerabilities: Array<{ path: string; reason: string }> = [];

	generated.forEach((item, i) => {
		const deadUrl = deadUrls[i];
		const suggestions = findSuggestions(deadUrl, pageRecords, candidateEmbeddings[i]);
		const top = suggestions[0];

		const intendedUrl = item.sourcePath.startsWith("http")
			? item.sourcePath
			: `https://${domain}${item.sourcePath.startsWith("/") ? "" : "/"}${item.sourcePath}`;

		let recovered = false;
		let confidence = 0;

		if (top) {
			confidence = top.score;
			// "Recovered" means the top suggestion IS the intended page — not
			// merely a confident-looking suggestion for some other page. A
			// generic keyword-overlap match can score >=0.5 against the wrong
			// page entirely, which previously counted as recovered and
			// inflated recoveryRate (it feeds the CI --min-score gate).
			recovered = normalizePathname(top.url) === normalizePathname(intendedUrl);
		}

		if (recovered) {
			recoveredCount++;
		} else {
			vulnerabilities.push({
				path: item.path,
				reason: top
					? `Top suggestion (${(top.score * 100).toFixed(0)}% match) points to the wrong page for ${item.mutationType}`
					: `No suggestions found for ${item.mutationType}`,
			});
		}

		predictions.push({
			hallucinatedPath: item.path,
			intendedUrl,
			mutationType: item.mutationType,
			topSuggestion: top,
			recovered,
			confidence,
		});
	});

	const totalTested = predictions.length;
	const recoveryRate = totalTested > 0 ? Math.round((recoveredCount / totalTested) * 100) / 100 : 0;

	return {
		totalTested,
		recoveredCount,
		recoveryRate,
		vulnerabilities: vulnerabilities.slice(0, 10),
		predictions,
	};
}

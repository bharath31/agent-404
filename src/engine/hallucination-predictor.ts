import type { PageRecord, Suggestion } from "../types.js";
import { findSuggestions } from "./matcher.js";
import { stemToken } from "./stemmer.js";

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

function normalizeUrlPath(urlOrPath: string): string {
	try {
		const u = new URL(urlOrPath, "https://example.com");
		return u.pathname.replace(/\/+$/, "") || "/";
	} catch {
		return urlOrPath.replace(/\/+$/, "") || "/";
	}
}

/**
 * Predict paths that AI crawlers and LLMs are likely to hallucinate based on site's actual routes.
 */
export function generateHallucinatedPaths(
	knownPaths: string[],
): Array<{ path: string; sourcePath: string; mutationType: HallucinationPrediction["mutationType"] }> {
	const existingSet = new Set(knownPaths.map((p) => normalizeUrlPath(p).toLowerCase()));
	const candidateMap = new Map<
		string,
		{ path: string; sourcePath: string; mutationType: HallucinationPrediction["mutationType"] }
	>();

	const addCandidate = (
		candPath: string,
		sourcePath: string,
		mutationType: HallucinationPrediction["mutationType"],
	) => {
		const normalized = normalizeUrlPath(candPath).toLowerCase();
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
		const norm = normalizeUrlPath(originalPath);
		if (norm === "/") continue;

		const segments = norm.split("/").filter(Boolean);
		if (segments.length === 0) continue;

		// 1. Version Drift: /v2/auth -> /v1/auth, /v3/auth, /docs/v1/..., etc.
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const vMatch = /^(v|ver|version)?(\d+)$/i.exec(seg);
			if (vMatch) {
				const prefix = vMatch[1] || "v";
				const num = parseInt(vMatch[2], 10);
				const variants: number[] = [];
				for (let n = 1; n <= Math.max(num + 2, 4); n++) {
					if (n !== num) variants.push(n);
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
 */
export function predictAndEvaluateHallucinations(
	pages: Array<{ url: string; title?: string; description?: string; headings?: string }>,
	domain: string,
	maxCandidates = 50,
): HallucinationAuditSummary {
	const pageRecords: PageRecord[] = pages.map((p) => ({
		id: p.url,
		site_id: domain,
		url: p.url.startsWith("http") ? p.url : `https://${domain}${p.url.startsWith("/") ? "" : "/"}${p.url}`,
		title: p.title || "",
		description: p.description || "",
		headings: p.headings || "[]",
		embedding: null,
		indexed_at: new Date().toISOString(),
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
	const predictions: HallucinationPrediction[] = [];
	let recoveredCount = 0;
	const vulnerabilities: Array<{ path: string; reason: string }> = [];

	for (const item of generated) {
		const deadUrl = `https://${domain}${item.path}`;
		const suggestions = findSuggestions(deadUrl, pageRecords);
		const top = suggestions[0];

		// Check if top suggestion matches intended source path or has high confidence (> 0.45)
		const intendedUrl = item.sourcePath.startsWith("http")
			? item.sourcePath
			: `https://${domain}${item.sourcePath.startsWith("/") ? "" : "/"}${item.sourcePath}`;

		let recovered = false;
		let confidence = 0;

		if (top) {
			confidence = top.score;
			const topNorm = normalizeUrlPath(top.url);
			const intendedNorm = normalizeUrlPath(intendedUrl);

			if (topNorm === intendedNorm || top.score >= 0.5) {
				recovered = true;
			}
		}

		if (recovered) {
			recoveredCount++;
		} else {
			vulnerabilities.push({
				path: item.path,
				reason: top
					? `Low match confidence (${(top.score * 100).toFixed(0)}%) for ${item.mutationType}`
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
	}

	const totalTested = predictions.length;
	const recoveryRate = totalTested > 0 ? Math.round((recoveredCount / totalTested) * 100) / 100 : 1.0;

	return {
		totalTested,
		recoveredCount,
		recoveryRate,
		vulnerabilities: vulnerabilities.slice(0, 10),
		predictions,
	};
}

import { after } from "next/server";
import { buildJsonLd, buildLinkHeader } from "../../../adapters/core";
import { normalizeDomain } from "../../api/domain";
import { analyzeSite } from "../../engine/analyzer";
import { probeClaudeBotResponse, deriveProbePath } from "../../engine/claudebot-probe";
import { discoverDemoPages } from "../../engine/discovery";
import { buildEmbeddingText, generateBatchEmbeddings, generateDeadUrlEmbedding } from "../../engine/embeddings";
import { registerPage, pruneStalePages } from "../../engine/indexer";
import { findSuggestions } from "../../engine/matcher";
import { scoreCleanStatus, scoreJsonLd, scoreLinkHeaders, READINESS_WEIGHTS } from "../../engine/readiness-score";
import { getCachedSuggest, invalidateSuggestCache, setCachedSuggest } from "../../engine/suggest-cache";
import { crawlSitemap } from "../../engine/sitemap";
import { normalizeDeadUrl, pathHint } from "../../engine/url-normalize";
import { proveDomainOwnership, verificationTxtName, wellKnownUrl } from "../../engine/domain-verify";
import { isDisposableSmokeDomain } from "../disposable-smoke-domain";
import { getFunnelMetrics, trackFunnelEvent } from "../funnel-telemetry";
import { getRecoveryRateStats, recordFollowOnFetch, recordSuggestionServedEvent } from "../recovery-tracker";
import { isBlockedInternalHost } from "../ssrf-guard";
import { urlBelongsToSite } from "../site-host";
import { pruneSuggestionLogs, rollupSuggestionDay, utcDayStart } from "../suggestion-rollups";
import { getCronSecret } from "../../config";
import { PostgresStorage } from "../../storage/postgres";
import type { InstallProbe, SiteRecord, StandingAuditReport } from "../../types";
import {
	attachRolledCookie,
	authenticateApiKey,
	requestOwner,
	requireSameOrigin,
	requireVerified,
	type ApiCredential,
	type RequestOwner,
} from "./auth";
import { checkRateLimit } from "./rate-limit";
import { appendVary, internalError, json, options, text } from "./responses";
import { getStorage } from "./storage";
import { renderAdminMetrics } from "./admin-view";

const SERVICE_UNAVAILABLE = { error: "Service is not configured" };
const VERIFIED_RECLAIM_GRACE_MS = 24 * 60 * 60 * 1000;

export function verificationInstructions(domain: string, token: string) {
	return {
		dnsTxt: { name: verificationTxtName(domain), value: token },
		wellKnown: { url: wellKnownUrl(domain), body: token },
	};
}

function storageFor(request: Request): PostgresStorage | Response {
	return getStorage() || json(request, SERVICE_UNAVAILABLE, 503);
}

function schedule(task: () => Promise<unknown>): void {
	try {
		after(async () => {
			await task().catch(() => undefined);
		});
	} catch {
		void task().catch(() => undefined);
	}
}

function publicSite(site: SiteRecord, includeSecret = false) {
	return {
		id: site.id,
		domain: site.domain,
		...(includeSecret ? { apiKey: site.apiKey } : {}),
		publicKey: site.publicKey,
		verified: Boolean(site.verifiedAt),
		verificationToken: site.verificationToken,
		verification: verificationInstructions(site.domain, site.verificationToken),
		createdAt: site.createdAt,
	};
}

async function readJson<T>(request: Request, fallback: T): Promise<T> {
	return request.json().catch(() => fallback) as Promise<T>;
}

function withRateLimit(request: Request, windowMs: number, max: number, siteId?: string) {
	return checkRateLimit(request, { windowMs, max }, siteId);
}

function addHeaders(response: Response, headers: Headers): Response {
	for (const [key, value] of headers) response.headers.set(key, value);
	return response;
}

async function ownerForMutation(request: Request): Promise<RequestOwner | Response> {
	const sameOrigin = requireSameOrigin(request);
	if (sameOrigin) return sameOrigin;
	return requestOwner(request);
}

async function apiCredential(
	request: Request,
	storage: PostgresStorage,
	mode: "read" | "write",
	verified = false,
): Promise<ApiCredential | Response> {
	const credential = await authenticateApiKey(request, storage, mode);
	if (credential instanceof Response) return credential;
	if (verified) return requireVerified(request, credential) || credential;
	return credential;
}

async function handleSites(request: Request, segments: string[], storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 10);
	if (limit.response) return limit.response;
	const ownerOrResponse = await ownerForMutation(request);
	if (ownerOrResponse instanceof Response) {
		// Preserve the CI disposable-domain smoke seam without weakening normal
		// cookie-authenticated owner requests.
		if (request.method === "POST" && segments.length === 1) {
			const cloned = request.clone();
			const body = await readJson<{ domain?: string }>(cloned, {});
			const domain = normalizeDomain(body.domain || "");
			if (domain && isDisposableSmokeDomain(domain)) {
				return handleCreateSite(request, storage, "ci:disposable-smoke", body, limit.headers);
			}
		}
		return ownerOrResponse;
	}
	const owner = ownerOrResponse;
	let response: Response;
	if (request.method === "POST" && segments.length === 1) {
		response = await handleCreateSite(request, storage, owner.ownerSub, undefined, limit.headers);
	} else if (request.method === "POST" && segments[1] === "claim") {
		const body = await readJson<{ domain?: string; apiKey?: string }>(request, {});
		const domain = body.domain ? normalizeDomain(body.domain) : null;
		const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
		if (!domain || !apiKey) response = json(request, { error: "domain and apiKey are required" }, 400, limit.headers);
		else {
			const site = await storage.claimSite(domain, apiKey, owner.ownerSub);
			if (!site) response = json(request, { error: "Could not link this site. Check the API key." }, 401, limit.headers);
			else {
				schedule(() => trackFunnelEvent(storage, "site_registered", domain, { siteId: site.id }));
				response = json(request, publicSite(site), 200, limit.headers);
			}
		}
	} else if (request.method === "POST" && segments[1] === "reclaim" && segments[2] === "complete") {
		response = await handleReclaimComplete(request, storage, owner, limit.headers);
	} else if (request.method === "POST" && segments[1] === "reclaim") {
		response = await handleReclaimStart(request, storage, limit.headers);
	} else if (request.method === "POST" && segments.length === 3 && segments[2] === "verify") {
		response = await handleVerify(request, storage, owner, segments[1], limit.headers);
	} else if (request.method === "GET" && segments.length === 3 && segments[2] === "stats") {
		const site = await storage.getSite(segments[1]);
		if (!site || site.ownerSub !== owner.ownerSub) response = json(request, { error: "Site not found" }, 404, limit.headers);
		else response = json(request, { siteId: site.id, domain: site.domain, verified: Boolean(site.verifiedAt), ...(await storage.getStats(site.id)) }, 200, limit.headers);
	} else if (request.method === "POST" && segments.length === 3 && segments[2] === "reindex") {
		const site = await storage.getSite(segments[1]);
		if (!site || site.ownerSub !== owner.ownerSub) response = json(request, { error: "Site not found" }, 404, limit.headers);
		else if (!site.verifiedAt) response = json(request, { error: "Domain is not verified" }, 409, limit.headers);
		else {
			const queued = await storage.requestSiteReindex(site.id, owner.ownerSub);
			if (!queued) return attachRolledCookie(json(request, { error: "Site not found" }, 404, limit.headers), owner);
			schedule(async () => {
				await crawlSitemap(queued.domain, queued.id, storage);
				await storage.completeSiteReindex(queued.id);
			});
			response = json(request, { ok: true, siteId: site.id, status: "queued" }, 202, limit.headers);
		}
	} else if (request.method === "POST" && segments.length === 5 && segments[2] === "keys" && segments[4] === "rotate") {
		response = await handleRotateKey(request, storage, owner, segments[1], segments[3], limit.headers);
	} else if (request.method === "DELETE" && segments.length === 2) {
		response = await handleDeleteSite(request, storage, owner, segments[1], limit.headers);
	} else response = json(request, { error: "Not found" }, 404, limit.headers);
	return attachRolledCookie(response, owner);
}

async function handleCreateSite(
	request: Request,
	storage: PostgresStorage,
	ownerSub: string,
	readBody?: { domain?: string },
	headers?: Headers,
): Promise<Response> {
	const body = readBody || (await readJson<{ domain?: string }>(request, {}));
	if (!body.domain) return json(request, { error: "domain is required" }, 400, headers);
	const domain = normalizeDomain(body.domain);
	if (!domain) return json(request, { error: "Invalid domain format" }, 400, headers);
	const existing = await storage.getSiteByDomain(domain);
	if (existing) {
		if (existing.ownerSub === ownerSub) return json(request, publicSite(existing), 200, headers);
		if (!existing.ownerSub) return json(request, {
			error: "This site is already indexed. Enter the API key from your script tag to link it.", code: "unowned", domain,
		}, 409, headers);
		return json(request, {
			error: "This domain is linked to another account. Sign in with the email that created it.", code: "owned_by_other", domain,
		}, 409, headers);
	}
	try {
		const site = await storage.createSite(domain, ownerSub);
		if (isDisposableSmokeDomain(domain) && !site.verifiedAt) {
			await storage.markVerified(site.id);
			site.verifiedAt = new Date().toISOString();
		}
		if (site.verifiedAt) schedule(() => crawlSitemap(domain, site.id, storage));
		schedule(() => trackFunnelEvent(storage, "site_registered", domain, { siteId: site.id }));
		return json(request, publicSite(site, true), 201, headers);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message.includes("unique") || message.includes("duplicate")) {
			const raced = await storage.getSiteByDomain(domain);
			if (raced?.ownerSub === ownerSub) return json(request, publicSite(raced), 200, headers);
			if (raced && !raced.ownerSub) return json(request, {
				error: "This site is already indexed. Enter the API key from your script tag to link it.", code: "unowned", domain,
			}, 409, headers);
			return json(request, {
				error: "This domain is linked to another account. Sign in with the email that created it.", code: "owned_by_other", domain,
			}, 409, headers);
		}
		throw error;
	}
}

async function handleVerify(request: Request, storage: PostgresStorage, owner: RequestOwner, id: string, headers: Headers) {
	const site = await storage.getSite(id);
	if (!site || site.ownerSub !== owner.ownerSub) return json(request, { error: "Site not found" }, 404, headers);
	if (site.verifiedAt) return json(request, { ok: true, verified: true, domain: site.domain }, 200, headers);
	const ok = await proveDomainOwnership(site.domain, site.verificationToken);
	if (!ok) return json(request, {
		error: "Ownership not proven", verification: verificationInstructions(site.domain, site.verificationToken),
	}, 400, headers);
	await storage.markVerified(site.id);
	schedule(() => crawlSitemap(site.domain, site.id, storage));
	return json(request, { ok: true, verified: true, domain: site.domain }, 200, headers);
}

async function handleReclaimStart(request: Request, storage: PostgresStorage, headers: Headers) {
	const body = await readJson<{ domain?: string }>(request, {});
	const domain = body.domain ? normalizeDomain(body.domain) : null;
	if (!domain) return json(request, { error: "Invalid domain format" }, 400, headers);
	const site = await storage.getSiteByDomain(domain);
	if (!site) return json(request, { error: "Domain is not registered" }, 404, headers);
	const token = await storage.rotateReclaimToken(site.id);
	const coolingOff = Boolean(site.verifiedAt);
	return json(request, {
		ok: true, domain, siteId: site.id, reclaimToken: token,
		verification: verificationInstructions(domain, token), verifiedSite: coolingOff,
		coolingOffHours: coolingOff ? 24 : 0,
		next: coolingOff
			? "Prove ownership, wait 24h, then POST /api/sites/reclaim/complete with { domain, confirm: true }"
			: "Prove ownership, then POST /api/sites/reclaim/complete with { domain }",
	}, 200, headers);
}

async function handleReclaimComplete(request: Request, storage: PostgresStorage, owner: RequestOwner, headers: Headers) {
	const body = await readJson<{ domain?: string; confirm?: boolean | string }>(request, {});
	const domain = body.domain ? normalizeDomain(body.domain) : null;
	if (!domain) return json(request, { error: "Invalid domain format" }, 400, headers);
	const site = await storage.getSiteByDomain(domain);
	if (!site) return json(request, { error: "Domain is not registered" }, 404, headers);
	if (!site.reclaimToken) return json(request, { error: "No reclaim in progress. POST /api/sites/reclaim first." }, 400, headers);
	if (site.verifiedAt) {
		const started = site.reclaimRequestedAt ? Date.parse(site.reclaimRequestedAt) : 0;
		const waitMs = VERIFIED_RECLAIM_GRACE_MS - (Date.now() - started);
		if (!started || waitMs > 0) return json(request, {
			error: "Verified sites have a 24h cooling-off period before keys rotate.",
			retryAfterSeconds: Math.max(1, Math.ceil((waitMs || VERIFIED_RECLAIM_GRACE_MS) / 1000)),
			hint: "Unverified domains can complete immediately after proof.",
		}, 400, headers);
		if (body.confirm !== true && body.confirm !== "replace-verified-site") return json(request, {
			error: "Pass confirm: true to rotate keys on an already-verified site.",
		}, 400, headers);
	}
	if (!(await proveDomainOwnership(domain, site.reclaimToken))) return json(request, {
		error: "Ownership not proven", verification: verificationInstructions(domain, site.reclaimToken),
	}, 400, headers);
	const updated = await storage.reclaimSite(site.id, owner.ownerSub);
	schedule(() => crawlSitemap(updated.domain, updated.id, storage));
	return json(request, { ok: true, id: updated.id, domain: updated.domain, apiKey: updated.apiKey, publicKey: updated.publicKey, verified: true }, 200, headers);
}

async function handleRotateKey(request: Request, storage: PostgresStorage, owner: RequestOwner, id: string, kind: string, headers: Headers) {
	if (kind !== "secret" && kind !== "public") return json(request, { error: "Key kind must be secret or public" }, 400, headers);
	const site = await storage.getSite(id);
	if (!site || site.ownerSub !== owner.ownerSub) return json(request, { error: "Site not found" }, 404, headers);
	const outcome = await storage.rotateSiteKey(id, owner.ownerSub, kind, 24);
	if (outcome.ok) return json(request, outcome.result, 201, headers);
	if (outcome.reason === "not_found") return json(request, { error: "Site not found" }, 404, headers);
	return json(request, {
		error: "A previous key is still active during its 24-hour overlap.",
		code: "rotation_overlap_active",
		retryAt: outcome.retryAt,
	}, 409, headers);
}

async function handleDeleteSite(request: Request, storage: PostgresStorage, owner: RequestOwner, id: string, headers: Headers) {
	const body = await readJson<{ domain?: string; confirmation?: string }>(request, {});
	const confirmation = typeof body.domain === "string" ? body.domain : body.confirmation;
	const site = await storage.getSite(id);
	if (!site || site.ownerSub !== owner.ownerSub) return json(request, { error: "Site not found" }, 404, headers);
	if (confirmation !== site.domain) return json(request, { error: "Type the exact normalized domain to confirm deletion.", domain: site.domain }, 400, headers);
	const deleted = await storage.deleteOwnedSite(id, owner.ownerSub, site.domain);
	return deleted ? json(request, { ok: true, deleted: true, domain: site.domain }, 200, headers) : json(request, { error: "Site not found" }, 404, headers);
}

async function handleRegister(request: Request, storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 60);
	if (limit.response) return limit.response;
	const auth = await apiCredential(request, storage, "write", true);
	if (auth instanceof Response) return addHeaders(auth, limit.headers);
	const body = await readJson<{
		url?: string; title?: string; description?: string; headings?: string[]; contentHash?: string;
	}>(request, {});
	if (!body.url || typeof body.url !== "string") return json(request, { error: "url is required" }, 400, limit.headers);
	if (body.url.length > 2048) return json(request, { error: "url too long" }, 400, limit.headers);
	if (!urlBelongsToSite(body.url, auth.site.domain)) return json(request, {
		error: "url host must match the registered domain or a subdomain of it", domain: auth.site.domain,
	}, 400, limit.headers);
	if (body.title && body.title.length > 500) return json(request, { error: "title too long" }, 400, limit.headers);
	if (body.description && body.description.length > 2000) return json(request, { error: "description too long" }, 400, limit.headers);
	if (body.headings && body.headings.length > 50) return json(request, { error: "too many headings" }, 400, limit.headers);
	if (body.contentHash && body.contentHash.length > 128) return json(request, { error: "contentHash too long" }, 400, limit.headers);
	const result = await registerPage(storage, auth.siteId, {
		url: body.url,
		title: body.title || "",
		description: body.description || "",
		headings: JSON.stringify(body.headings || []),
		contentHash: body.contentHash || null,
	});
	schedule(() => recordFollowOnFetch(storage, auth.siteId, body.url as string));
	if (!result.skipped) schedule(async () => {
		const stats = await storage.getStats(auth.siteId);
		if (stats.pageCount === 1) await trackFunnelEvent(storage, "install_verified", auth.site.domain, { siteId: auth.siteId, url: body.url });
	});
	return json(request, { ok: true, skipped: result.skipped }, 200, limit.headers);
}

type SuggestionPayload = {
	deadUrl: string;
	suggestions: Array<{ url: string; title: string; score: number; matchType: string }>;
	jsonLd: unknown;
};

async function generateSuggestions(storage: PostgresStorage, siteId: string, rawUrl: string, userAgent?: string): Promise<SuggestionPayload> {
	const deadUrl = normalizeDeadUrl(rawUrl);
	const cached = getCachedSuggest(siteId, deadUrl) as SuggestionPayload | null;
	if (cached) {
		schedule(() => logSuggestions(storage, siteId, deadUrl, cached, userAgent));
		return cached;
	}
	const deadUrlEmbedding = await generateDeadUrlEmbedding(deadUrl);
	let pages;
	if (deadUrlEmbedding) pages = await storage.searchByEmbedding(siteId, deadUrlEmbedding, 20);
	else {
		pages = await storage.getPages(siteId, { limit: 500, pathHint: pathHint(deadUrl) });
		if (pages.length < 5) pages = await storage.getPages(siteId, { limit: 500 });
	}
	const suggestions = findSuggestions(deadUrl, pages, deadUrlEmbedding);
	const payload = { deadUrl, suggestions, jsonLd: buildJsonLd(suggestions) };
	schedule(() => logSuggestions(storage, siteId, deadUrl, payload, userAgent));
	setCachedSuggest(siteId, deadUrl, payload);
	return payload;
}

async function logSuggestions(storage: PostgresStorage, siteId: string, deadUrl: string, payload: unknown, userAgent?: string): Promise<void> {
	const suggestions = (payload as { suggestions?: Array<{ url: string; score: number; matchType: string }> }).suggestions;
	if (!suggestions?.length) return;
	const suggestedUrls = suggestions.map((suggestion) => suggestion.url);
	await Promise.all([
		recordSuggestionServedEvent(storage, siteId, deadUrl, suggestedUrls, userAgent),
		storage.recordSuggestionServed(
			siteId,
			deadUrl,
			suggestedUrls,
			JSON.stringify(suggestions.map((suggestion) => suggestion.score)),
			JSON.stringify(suggestions.map((suggestion) => suggestion.matchType)),
		).catch(() => undefined),
	]);
}

async function handleSuggest(request: Request, storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 60);
	if (limit.response) return limit.response;
	const auth = await apiCredential(request, storage, "read", true);
	if (auth instanceof Response) return addHeaders(auth, limit.headers);
	let url: unknown;
	if (request.method === "GET") url = new URL(request.url).searchParams.get("url");
	else url = (await readJson<{ url?: unknown }>(request, {})).url;
	if (!url || typeof url !== "string") {
		return json(request, { error: request.method === "GET" ? "url query parameter is required" : "url is required" }, 400, limit.headers);
	}
	if (url.length > 2048) return json(request, { error: "url too long" }, 400, limit.headers);
	const payload = await generateSuggestions(storage, auth.siteId, url, request.headers.get("user-agent") || undefined);
	const headers = new Headers(limit.headers);
	appendVary(headers, "Accept, Origin, x-api-key");
	headers.set("Cache-Control", request.method === "GET"
		? "public, max-age=60, s-maxage=300, stale-while-revalidate=60"
		: "private, no-cache");
	if (payload.suggestions.length) {
		try { headers.set("Link", buildLinkHeader(payload.suggestions)); } catch { /* ignore invalid header data */ }
	}
	return json(request, payload, 200, headers);
}

async function handleAnalyze(request: Request, storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 300_000, 2);
	if (limit.response) return limit.response;
	const auth = await apiCredential(request, storage, "write", true);
	if (auth instanceof Response) return addHeaders(auth, limit.headers);
	const pages = await storage.getPages(auth.siteId);
	if (!pages.length) return json(request, { error: "No pages indexed for this site" }, 400, limit.headers);
	return json(request, await analyzeSite(pages.map((page) => ({ url: page.url, title: page.title })), auth.site.domain), 200, limit.headers);
}

async function handleInstallStatus(request: Request, storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 30);
	if (limit.response) return limit.response;
	const auth = await apiCredential(request, storage, "write");
	if (auth instanceof Response) return addHeaders(auth, limit.headers);
	const stats = await storage.getStats(auth.siteId);
	const domainVerified = Boolean(auth.site.verifiedAt);
	const installVerified = stats.pageCount > 0;
	const warning = installVerified ? null : domainVerified
		? "No beacons received. The script is not reaching /api/register. Use https://www.agent404.dev (apex redirects break CORS preflight) and check the browser console for [agent-404] warnings."
		: "Domain ownership is not verified yet. Indexing and crawling are paused until you verify — add the DNS TXT record (or well-known file) and confirm in the dashboard. This is not a script/CORS issue.";
	return json(request, {
		ok: true, domain: auth.site.domain, pageCount: stats.pageCount,
		lastBeaconAt: stats.lastBeaconAt, suggestionsServed: stats.suggestionsServed,
		domainVerified, installVerified, warning,
	}, 200, limit.headers);
}

async function handleDemoSitemap(request: Request): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 15);
	if (limit.response) return limit.response;
	const url = new URL(request.url);
	const domain = url.searchParams.get("domain");
	const deadPath = url.searchParams.get("path") || "";
	if (!domain || domain.length > 253) return json(request, { error: "domain query parameter is required" }, 400, limit.headers);
	if (/[\/\s:@]/.test(domain) || isBlockedInternalHost(domain)) return json(request, { error: "Invalid domain" }, 400, limit.headers);
	try {
		const result = await discoverDemoPages(domain, deadPath);
		return json(request, { domain, pages: result.pages, source: result.source, ...(result.error ? { error: result.error } : {}) }, 200, limit.headers);
	} catch {
		return json(request, { domain, pages: [], source: "none", error: "Could not discover pages" }, 200, limit.headers);
	}
}

function generateAuditId(domain: string): string {
	return `audit_${domain.replace(/[^a-z0-9]/gi, "-").toLowerCase()}_${Math.random().toString(36).substring(2, 10)}`;
}

function escapeXml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export function auditOgSvg(report: StandingAuditReport): string {
	const status = report.score >= 75 ? "AGENT-READY" : report.score >= 40 ? "DEGRADED RECOVERY" : "CRITICAL 404 RISKS";
	const signal = report.score >= 75 ? "#45D699" : report.score >= 40 ? "#F5A623" : "#E5484D";
	return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#000"/><rect x="72" y="72" width="1056" height="486" rx="20" fill="#0A0A0A" stroke="#2A2A2A"/><text x="112" y="140" fill="#8F8F8F" font-family="monospace" font-size="22">AGENT-404 · RECOVERY AUDIT</text><text x="112" y="230" fill="#EDEDED" font-family="sans-serif" font-size="48" font-weight="700">${escapeXml(report.domain)}</text><text x="112" y="390" fill="${signal}" font-family="sans-serif" font-size="132" font-weight="700">${report.score}</text><text x="390" y="350" fill="${signal}" font-family="monospace" font-size="24">${status}</text><text x="390" y="400" fill="#8F8F8F" font-family="monospace" font-size="20">404 → matcher → Link / JSON-LD → destination</text><text x="112" y="520" fill="#666" font-family="sans-serif" font-size="18">www.agent404.dev</text></svg>`;
}

async function handleAudit(request: Request, segments: string[], storage: PostgresStorage): Promise<Response> {
	const max = request.method === "POST" && segments.length === 1 ? 10 : 30;
	const limit = withRateLimit(request, 60_000, max);
	if (limit.response) return limit.response;
	if (request.method === "POST" && segments.length === 1) {
		const body = await readJson<{ domain?: string; deadPath?: string; deep?: boolean }>(request, {});
		const domain = normalizeDomain(body.domain || "");
		if (!domain || isBlockedInternalHost(domain)) return json(request, { error: "Invalid domain format" }, 400, limit.headers);
		const deadPath = body.deadPath || "/docs/non-existent-link";
		if (deadPath.length > 2048) return json(request, { error: "deadPath too long" }, 400, limit.headers);
		const deep = body.deep === true;
		schedule(() => trackFunnelEvent(storage, "audit_started", domain, deep ? { deadPath, deep: true } : { deadPath }));
		const probe = await probeClaudeBotResponse(domain, deadPath);
		const score = scoreCleanStatus(probe.status) + scoreLinkHeaders(probe.hasLinkHeaders) + scoreJsonLd(probe.hasJsonLd) + (probe.hasSuggestions ? READINESS_WEIGHTS.hasSuggestions : 0);
		const id = generateAuditId(domain);
		const report: StandingAuditReport = {
			id, domain, createdAt: new Date().toISOString(), score, claudeBotProbe: probe,
			summary: {
				status: score >= 75 ? "good" : score >= 40 ? "warning" : "critical",
				recommendation: score < 50
					? "Install agent-404 middleware to return Link alternate headers and schema.org JSON-LD to AI crawlers."
					: "Your 404 responses provide structured recovery signals.",
				crawlerAccessible: probe.status === 404,
				linkHeadersConfigured: probe.hasLinkHeaders,
				jsonLdConfigured: probe.hasJsonLd,
			},
			permalink: `/report/${id}`, ogImageUrl: `/api/audit/${id}/og.svg`,
		};
		if (deep) {
			try {
				const discovery = await discoverDemoPages(domain, deadPath);
				if (!discovery.pages.length) report.analysis = null;
				else {
					const analysis = await analyzeSite(discovery.pages.map((page) => ({ url: page.url, title: page.title })), domain);
					report.analysis = analysis.pagesAnalyzed > 0 ? {
						analyzedAt: analysis.analyzedAt, source: discovery.source, pagesAnalyzed: analysis.pagesAnalyzed,
						brokenLinks: analysis.brokenLinks, orphanPages: analysis.orphanPages,
					} : null;
				}
			} catch { report.analysis = null; }
		}
		await storage.saveAuditReport(report);
		schedule(() => trackFunnelEvent(storage, "audit_completed", domain, { auditId: id, score }));
		return json(request, report, 201, limit.headers);
	}
	const id = segments[1];
	if (!id) return json(request, { error: "Not found" }, 404, limit.headers);
	const report = await storage.getAuditReport(id);
	if (segments[2] === "og.svg") {
		if (!report) return text(request, "Audit not found", 404, "text/plain; charset=utf-8", limit.headers);
		return text(request, auditOgSvg(report), 200, "image/svg+xml", { ...Object.fromEntries(limit.headers), "Cache-Control": "public, max-age=86400" });
	}
	if (!report) return json(request, { error: "Audit report not found or expired" }, 404, limit.headers);
	if (new URL(request.url).searchParams.get("share") === "1") schedule(() => trackFunnelEvent(storage, "report_shared", report.domain, { auditId: id }));
	return json(request, report, 200, limit.headers);
}

async function handleFunnel(request: Request, storage: PostgresStorage | undefined): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 60);
	if (limit.response) return limit.response;
	const body = await readJson<{ domain?: string }>(request, {});
	schedule(() => trackFunnelEvent(storage, "install_cta_clicked", body.domain || undefined));
	return json(request, { ok: true }, 200, limit.headers);
}

async function handleDashboardProbe(request: Request, storage: PostgresStorage): Promise<Response> {
	const limit = withRateLimit(request, 60_000, 5);
	if (limit.response) return limit.response;
	const ownerOrResponse = await ownerForMutation(request);
	if (ownerOrResponse instanceof Response) return ownerOrResponse;
	const owner = ownerOrResponse;
	const body = await readJson<{ siteId?: string; path?: string }>(request, {});
	const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
	const site = siteId ? await storage.getSite(siteId) : null;
	if (!site || site.ownerSub !== owner.ownerSub) {
		return attachRolledCookie(json(request, { error: "Site not found" }, 404, limit.headers), owner);
	}
	let probePath = deriveProbePath();
	if (typeof body.path === "string") {
		const candidate = body.path.trim();
		if (candidate && candidate.startsWith("/") && candidate.length <= 120 && !candidate.includes("?") && !candidate.includes("//")) probePath = candidate;
	}
	const result = await probeClaudeBotResponse(site.domain, probePath);
	const probe: InstallProbe = {
		id: "manual", siteId: site.id, probedAt: new Date().toISOString(), probePath,
		status: result.status, verdict: result.verdict,
		hasLinkHeaders: result.hasLinkHeaders, hasJsonLd: result.hasJsonLd,
		linkHeader: result.comparison.current.headers[0] ?? null,
		summary: result.summary, source: "manual",
	};
	schedule(() => storage.saveInstallProbe(probe));
	return attachRolledCookie(json(request, {
		ok: true,
		probe: { ...probe, id: undefined, headers: result.headersSnippet, bodySnippet: result.bodySnippet },
	}, 200, limit.headers), owner);
}

function cronAuthorized(request: Request): boolean {
	const secret = getCronSecret();
	return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function handleAdmin(request: Request, segments: string[], storage: PostgresStorage): Promise<Response> {
	if (!cronAuthorized(request)) return json(request, { error: "Unauthorized" }, 401);
	const endpoint = segments[1];
	if (endpoint === "metrics") {
		const [liveInstalls, totalSites] = await Promise.all([storage.getLiveInstallCount(), storage.getTotalSiteCount()]);
		return json(request, { liveInstalls, totalSites, goal: 1000 });
	}
	if (endpoint === "funnel") return json(request, await getFunnelMetrics(storage));
	if (endpoint === "recovery-metrics") {
		return json(request, await getRecoveryRateStats(storage, new URL(request.url).searchParams.get("siteId") || undefined));
	}
	if (endpoint === "page") {
		const [liveInstalls, totalSites, recovery, funnel, precision] = await Promise.all([
			storage.getLiveInstallCount(), storage.getTotalSiteCount(),
			getRecoveryRateStats(storage).catch(() => null), getFunnelMetrics(storage).catch(() => null),
			storage.getLabelPrecision().catch(() => null),
		]);
		return text(request, renderAdminMetrics({
			liveInstalls, totalSites,
			recoveryRate: recovery && recovery.overall.totalSuggestions > 0 ? recovery.overall.recoveryRate : null,
			overallFunnelConversion: funnel && funnel.totalAuditsStarted > 0 ? funnel.rates.overallFunnelConversion : null,
			precision: precision && precision.labeled > 0 ? precision : null,
		}), 200, "text/html; charset=utf-8");
	}
	return json(request, { error: "Not found" }, 404);
}

async function applyEmbeddingBatch(
	sql: { query: (query: string, params: unknown[]) => Promise<unknown> },
	ids: number[], vectors: string[],
): Promise<void> {
	const placeholders = ids.map((_, index) => `($${index * 2 + 1}::int, $${index * 2 + 2})`).join(", ");
	const params: unknown[] = [];
	for (let index = 0; index < ids.length; index++) params.push(ids[index], vectors[index]);
	await sql.query(`UPDATE pages AS p SET embedding = v.embedding::vector
		FROM (VALUES ${placeholders}) AS v(id, embedding) WHERE p.id = v.id`, params);
}

async function handleCron(request: Request, storage: PostgresStorage): Promise<Response> {
	if (!cronAuthorized(request)) return json(request, { error: "Unauthorized" }, 401);
	const sql = storage.getSql();
	const budgetMs = 18_000;
	const started = Date.now();
	const { rows: backlogRows } = await sql.query(
		`SELECT COUNT(*)::int AS n FROM sites WHERE last_cron_at IS NULL OR last_cron_at < NOW() - INTERVAL '20 hours'`, [],
	);
	const remainingAtStart = Number(backlogRows[0]?.n ?? 0);
	const { rows } = await sql.query(
		`SELECT id, domain FROM sites WHERE last_cron_at IS NULL OR last_cron_at < NOW() - INTERVAL '20 hours' ORDER BY last_cron_at NULLS FIRST LIMIT 15`, [],
	);
	const results: Array<{ domain: string; crawled: number; pruned: number; backfilled: number }> = [];
	let stoppedForBudget = false;
	for (const row of rows) {
		if (Date.now() - started > budgetMs) { stoppedForBudget = true; break; }
		const siteId = row.id as string;
		const domain = row.domain as string;
		const crawled = await crawlSitemap(domain, siteId, storage);
		const pruned = await pruneStalePages(storage, siteId, 30);
		let backfilled = 0;
		const { rows: nullPages } = await sql.query(
			`SELECT id, url, title, description FROM pages WHERE site_id = $1 AND embedding IS NULL ORDER BY id LIMIT $2`, [siteId, 200],
		);
		for (let index = 0; index < nullPages.length; index += 100) {
			if (Date.now() - started > budgetMs) { stoppedForBudget = true; break; }
			const batch = nullPages.slice(index, index + 100);
			const embeddings = await generateBatchEmbeddings(batch.map((page) => buildEmbeddingText({
				url: page.url as string, title: page.title as string, description: page.description as string,
			})));
			const ids: number[] = [];
			const vectors: string[] = [];
			for (let item = 0; item < batch.length; item++) {
				const embedding = embeddings[item];
				if (embedding && embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
					ids.push(batch[item].id as number);
					vectors.push(`[${embedding.join(",")}]`);
					backfilled++;
				}
			}
			if (ids.length) await applyEmbeddingBatch(sql, ids, vectors);
		}
		await sql.query(`UPDATE sites SET last_cron_at = NOW() WHERE id = $1`, [siteId]);
		invalidateSuggestCache(siteId);
		results.push({ domain, crawled, pruned, backfilled });
		if (stoppedForBudget) break;
	}

	const probeStarted = Date.now();
	let probesRan = 0;
	let probesBroken = 0;
	try {
		for (const site of await storage.listSitesNeedingProbe(3, 48)) {
			if (Date.now() - probeStarted > 12_000) break;
			const probePath = deriveProbePath();
			const probe = await probeClaudeBotResponse(site.domain, probePath);
			await sql.query(
				`INSERT INTO install_probes (site_id, probe_path, status, verdict, has_link_headers, has_json_ld, link_header, summary, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'cron')`,
				[site.id, probePath, probe.status, probe.verdict, probe.hasLinkHeaders, probe.hasJsonLd, probe.comparison.current.headers[0] ?? null, probe.summary],
			);
			probesRan++;
			if (probe.verdict === "unrecovered_404") probesBroken++;
		}
	} catch (error) {
		console.error("install_probe_pass failed:", error instanceof Error ? error.message : error);
	}
	let sitesRolledUp = 0;
	let logsPruned = 0;
	try {
		sitesRolledUp = await rollupSuggestionDay(sql, utcDayStart(new Date(Date.now() - 24 * 3600 * 1000)));
		logsPruned = await pruneSuggestionLogs(sql);
	} catch (error) {
		console.error("suggestion_rollup_pass failed:", error instanceof Error ? error.message : error);
	}
	const [liveInstalls, totalSites] = await Promise.all([storage.getLiveInstallCount(), storage.getTotalSiteCount()]);
	const response = {
		ok: true, processed: results.length,
		remainingBacklog: Math.max(0, remainingAtStart - results.length), stoppedForBudget, results,
		sitesRolledUp, logsPruned, liveInstalls, totalSites, goalTarget: 1000,
	};
	console.log(JSON.stringify({ msg: "cron_shard", ...response, results: undefined, elapsedMs: Date.now() - started, platform: process.env.VERCEL ? "vercel-daily" : "hourly-capable", probesRan, probesBroken }));
	return json(request, response);
}

export type ApiHandlerDependencies = { storage?: PostgresStorage | null };

export async function handleApiRequest(
	request: Request,
	segments: string[],
	dependencies?: ApiHandlerDependencies,
): Promise<Response> {
	if (request.method === "OPTIONS") return options(request);
	try {
		if (segments.length === 1 && segments[0] === "health" && request.method === "GET") {
			return json(request, { status: "ok" });
		}
		if (segments[0] === "health") return json(request, { error: "Not found" }, 404);
		if (segments[0] === "funnel" && segments[1] === "install-cta" && request.method === "POST") {
			const storage = dependencies && "storage" in dependencies ? dependencies.storage : getStorage();
			return handleFunnel(request, storage || undefined);
		}
		if (segments[0] === "demo" && segments[1] === "sitemap" && request.method === "GET") {
			return handleDemoSitemap(request);
		}
		const injected = dependencies && "storage" in dependencies ? dependencies.storage : undefined;
		const storageOrResponse = dependencies && "storage" in dependencies
			? injected || json(request, SERVICE_UNAVAILABLE, 503)
			: storageFor(request);
		if (storageOrResponse instanceof Response) return storageOrResponse;
		const storage = storageOrResponse;
		if (segments[0] === "sites") return handleSites(request, segments, storage);
		if (segments.length === 1 && segments[0] === "register" && request.method === "POST") return handleRegister(request, storage);
		if (segments.length === 1 && segments[0] === "suggest" && (request.method === "GET" || request.method === "POST")) return handleSuggest(request, storage);
		if (segments.length === 1 && segments[0] === "analyze" && request.method === "POST") return handleAnalyze(request, storage);
		if (segments[0] === "install" && segments[1] === "status" && request.method === "GET") return handleInstallStatus(request, storage);
		if (segments[0] === "audit" && (request.method === "GET" || request.method === "POST")) return handleAudit(request, segments, storage);
		if (segments[0] === "dashboard" && segments[1] === "probe" && request.method === "POST") return handleDashboardProbe(request, storage);
		if (segments[0] === "admin" && request.method === "GET") return handleAdmin(request, segments, storage);
		if (segments.length === 1 && segments[0] === "cron" && request.method === "GET") return handleCron(request, storage);
		return json(request, { error: "Not found" }, 404);
	} catch (error) {
		return internalError(request, error);
	}
}

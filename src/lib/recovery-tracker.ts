import type { StorageAdapter } from "../storage/interface";
import type { AgentCategory, RecoveryEvent, RecoveryRateStats } from "../types";

export type { AgentCategory, RecoveryEvent, RecoveryRateStats };

/** Window in which a follow-on fetch counts as recovery of a served suggestion (BAT-61). */
export const RECOVERY_WINDOW_MS = 60_000;

/**
 * Classify incoming User-Agent into non-rendering crawler, automated browser agent, or human (BAT-61).
 */
export function classifyUserAgent(ua?: string | null): AgentCategory {
	if (!ua) return "crawler";
	const lower = ua.toLowerCase();

	// 1. Known AI Crawlers & Scrapers (Non-rendering HTTP clients)
	const crawlerKeywords = [
		"gptbot",
		"claudebot",
		"perplexitybot",
		"anthropic",
		"bytespider",
		"ccbot",
		"google-extended",
		"applebot-extended",
		"cohere-ai",
		"diffbot",
		"omgili",
		"youbot",
		"facebookexternalhit",
		"slackbot",
		"twitterbot",
		"discordbot",
		"telegrambot",
		"crawler",
		"spider",
	];
	if (crawlerKeywords.some((k) => lower.includes(k))) {
		return "crawler";
	}

	// 2. Browser Automation / CLI agents
	const agentKeywords = [
		"playwright",
		"puppeteer",
		"selenium",
		"headlesschrome",
		"phantomjs",
		"curl/",
		"wget/",
		"postmanruntime",
		"python-requests",
		"aiohttp",
		"axios",
		"node-fetch",
		"got/",
	];
	if (agentKeywords.some((k) => lower.includes(k))) {
		return "browser_agent";
	}

	// 3. Default to human browser
	return "human";
}

/**
 * Record a 404 suggestion response served to an agent or visitor (BAT-61).
 *
 * Backed by durable storage (Postgres `recovery_events`, see
 * `PostgresStorage#recordRecoveryEvent`) rather than a module-level in-memory
 * buffer — on Vercel/Cloudflare there's no guarantee requests land on the
 * same isolate, and cold starts reset module state entirely, so an in-memory
 * buffer only ever reflected a partial, effectively-random slice of traffic.
 *
 * Fire-and-forget: telemetry must never break the request it's attached to.
 * Callers do not need to await this call; failures are swallowed. If no
 * storage is available (e.g. DATABASE_URL not configured), this is a no-op.
 */
export function recordSuggestionServedEvent(
	storage: StorageAdapter | undefined,
	siteId: string,
	deadUrl: string,
	suggestedUrls: string[],
	userAgent?: string,
	clientHash?: string,
): Promise<void> {
	if (!storage) return Promise.resolve();
	const agentCategory = classifyUserAgent(userAgent);
	return storage
		.recordRecoveryEvent(siteId, deadUrl, suggestedUrls, agentCategory, userAgent, clientHash)
		.catch(() => {});
}

/**
 * Correlate a follow-on page fetch to determine if an agent recovered from a
 * recent 404 suggestion. Durable: the correlation runs against Postgres, so
 * the suggestion-served event and the follow-on fetch don't need to land on
 * the same isolate. Returns the recovered event, or null when no recent
 * unrecovered suggestion matches the fetched URL.
 */
export function recordFollowOnFetch(
	storage: StorageAdapter | undefined,
	siteId: string,
	fetchedUrl: string,
	clientHash?: string,
	windowMs: number = RECOVERY_WINDOW_MS,
): Promise<RecoveryEvent | null> {
	if (!storage) return Promise.resolve(null);
	return storage.markRecoveryEventRecovered(siteId, fetchedUrl, windowMs, clientHash).catch(() => null);
}

/**
 * Calculate recovery rate metrics segmented by agent category, read from
 * durable storage rather than whatever happens to be in one instance's
 * in-memory buffer.
 */
export function getRecoveryRateStats(
	storage: StorageAdapter,
	siteId?: string,
): Promise<RecoveryRateStats> {
	return storage.getRecoveryRateStats(siteId);
}

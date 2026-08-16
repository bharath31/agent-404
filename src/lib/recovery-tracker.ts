export type AgentCategory = "crawler" | "browser_agent" | "human";

export interface SuggestionEvent {
	id: string;
	siteId: string;
	deadUrl: string;
	suggestedUrls: string[];
	agentCategory: AgentCategory;
	userAgent: string;
	clientHash?: string;
	timestamp: number; // Date.now()
	recovered: boolean;
	recoveredUrl?: string;
	recoveryLatencyMs?: number;
}

export interface RecoveryRateStats {
	overall: {
		totalSuggestions: number;
		recoveredCount: number;
		recoveryRate: number; // 0.0 - 1.0 (e.g. 0.75 = 75%)
		medianLatencyMs: number | null;
	};
	byAgentCategory: Record<
		AgentCategory,
		{
			totalSuggestions: number;
			recoveredCount: number;
			recoveryRate: number;
			medianLatencyMs: number | null;
		}
	>;
}

const RECOVERY_WINDOW_MS = 60_000; // 60 seconds
const MAX_STORED_EVENTS = 20_000;

// In-memory sliding buffer for active and historical suggestion correlation events
const activeEvents: SuggestionEvent[] = [];

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

function normalizePath(urlOrPath: string): string {
	try {
		const u = new URL(urlOrPath, "https://example.com");
		return u.pathname.replace(/\/+$/, "").toLowerCase() || "/";
	} catch {
		return urlOrPath.replace(/\/+$/, "").toLowerCase() || "/";
	}
}

/**
 * Record a 404 suggestion response served to an agent or visitor.
 */
export function recordSuggestionServedEvent(
	siteId: string,
	deadUrl: string,
	suggestedUrls: string[],
	userAgent?: string,
	clientHash?: string,
): SuggestionEvent {
	const now = Date.now();
	const id = `sug_${Math.random().toString(36).substring(2, 11)}_${now}`;
	const agentCategory = classifyUserAgent(userAgent);

	const event: SuggestionEvent = {
		id,
		siteId,
		deadUrl,
		suggestedUrls,
		agentCategory,
		userAgent: userAgent || "",
		clientHash,
		timestamp: now,
		recovered: false,
	};

	if (activeEvents.length >= MAX_STORED_EVENTS) {
		activeEvents.shift();
	}
	activeEvents.push(event);
	return event;
}

/**
 * Correlate a follow-on page fetch to determine if an agent recovered from a recent 404 suggestion.
 */
export function recordFollowOnFetch(
	siteId: string,
	fetchedUrl: string,
	clientHash?: string,
): SuggestionEvent | null {
	const now = Date.now();
	const fetchedNorm = normalizePath(fetchedUrl);

	// Find the most recent unrecovered suggestion for this site within 60s
	for (let i = activeEvents.length - 1; i >= 0; i--) {
		const event = activeEvents[i];

		if (event.siteId !== siteId) continue;
		if (event.recovered) continue;
		if (now - event.timestamp > RECOVERY_WINDOW_MS) continue;

		// Optional clientHash check if provided
		if (clientHash && event.clientHash && clientHash !== event.clientHash) {
			continue;
		}

		// Check if fetched URL matches any suggested URL
		const match = event.suggestedUrls.find(
			(sug) => normalizePath(sug) === fetchedNorm,
		);

		if (match) {
			event.recovered = true;
			event.recoveredUrl = fetchedUrl;
			event.recoveryLatencyMs = now - event.timestamp;
			return event;
		}
	}

	return null;
}

/**
 * Calculate recovery rate metrics segmented by agent category.
 */
export function getRecoveryRateStats(siteId?: string): RecoveryRateStats {
	const events = siteId
		? activeEvents.filter((e) => e.siteId === siteId)
		: activeEvents;

	const categories: AgentCategory[] = ["crawler", "browser_agent", "human"];

	const categoryMetrics = categories.reduce(
		(acc, cat) => {
			const catEvents = events.filter((e) => e.agentCategory === cat);
			const total = catEvents.length;
			const recovered = catEvents.filter((e) => e.recovered);
			const latencies = recovered
				.map((e) => e.recoveryLatencyMs)
				.filter((l): l is number => typeof l === "number")
				.sort((a, b) => a - b);

			const median =
				latencies.length > 0
					? latencies[Math.floor(latencies.length / 2)]
					: null;

			acc[cat] = {
				totalSuggestions: total,
				recoveredCount: recovered.length,
				recoveryRate: total > 0 ? Math.round((recovered.length / total) * 1000) / 1000 : 0,
				medianLatencyMs: median,
			};
			return acc;
		},
		{} as RecoveryRateStats["byAgentCategory"],
	);

	const totalOverall = events.length;
	const recoveredOverall = events.filter((e) => e.recovered);
	const overallLatencies = recoveredOverall
		.map((e) => e.recoveryLatencyMs)
		.filter((l): l is number => typeof l === "number")
		.sort((a, b) => a - b);

	const overallMedian =
		overallLatencies.length > 0
			? overallLatencies[Math.floor(overallLatencies.length / 2)]
			: null;

	return {
		overall: {
			totalSuggestions: totalOverall,
			recoveredCount: recoveredOverall.length,
			recoveryRate:
				totalOverall > 0
					? Math.round((recoveredOverall.length / totalOverall) * 1000) / 1000
					: 0,
			medianLatencyMs: overallMedian,
		},
		byAgentCategory: categoryMetrics,
	};
}

/**
 * Clear recovery tracking events buffer (for test isolation).
 */
export function resetRecoveryEvents(): void {
	activeEvents.length = 0;
}

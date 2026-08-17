import { describe, expect, it } from "vitest";
import {
	classifyUserAgent,
	recordSuggestionServedEvent,
	recordFollowOnFetch,
	getRecoveryRateStats,
	RECOVERY_WINDOW_MS,
} from "../src/lib/recovery-tracker.js";
import type { StorageAdapter } from "../src/storage/interface.js";
import type { AgentCategory, RecoveryEvent, RecoveryRateStats } from "../src/types.js";

// Minimal in-memory StorageAdapter double, scoped to recovery tracking only —
// every other method throws if a test accidentally exercises it.
class FakeRecoveryStorage implements Partial<StorageAdapter> {
	events: RecoveryEvent[] = [];
	nextId = 1;

	async recordRecoveryEvent(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
		agentCategory: AgentCategory,
		userAgent?: string,
		clientHash?: string,
	): Promise<void> {
		this.events.push({
			id: String(this.nextId++),
			siteId,
			deadUrl,
			suggestedUrls,
			agentCategory,
			userAgent: userAgent || "",
			clientHash,
			createdAt: new Date().toISOString(),
			recovered: false,
		});
	}

	async markRecoveryEventRecovered(
		siteId: string,
		fetchedUrl: string,
		windowMs: number,
		clientHash?: string,
	): Promise<RecoveryEvent | null> {
		const fetchedNorm = fetchedUrl.replace(/\/+$/, "").toLowerCase();
		const now = Date.now();
		for (let i = this.events.length - 1; i >= 0; i--) {
			const e = this.events[i];
			if (e.siteId !== siteId || e.recovered) continue;
			if (now - Date.parse(e.createdAt) > windowMs) continue;
			if (clientHash && e.clientHash && clientHash !== e.clientHash) continue;
			const match = e.suggestedUrls.find(
				(sug) => sug.replace(/\/+$/, "").toLowerCase() === fetchedNorm,
			);
			if (match) {
				e.recovered = true;
				e.recoveredUrl = fetchedUrl;
				e.recoveryLatencyMs = 25;
				return e;
			}
		}
		return null;
	}

	async getRecoveryRateStats(siteId?: string): Promise<RecoveryRateStats> {
		const events = siteId ? this.events.filter((e) => e.siteId === siteId) : this.events;
		const mk = (list: RecoveryEvent[]) => {
			const total = list.length;
			const recovered = list.filter((e) => e.recovered);
			const latencies = recovered
				.map((e) => e.recoveryLatencyMs)
				.filter((l): l is number => typeof l === "number")
				.sort((a, b) => a - b);
			return {
				totalSuggestions: total,
				recoveredCount: recovered.length,
				recoveryRate: total > 0 ? Math.round((recovered.length / total) * 1000) / 1000 : 0,
				medianLatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null,
			};
		};
		const cat = (c: AgentCategory) =>
			mk(events.filter((e) => e.agentCategory === c));
		return {
			overall: mk(events),
			byAgentCategory: {
				crawler: cat("crawler"),
				browser_agent: cat("browser_agent"),
				human: cat("human"),
			},
		};
	}
}

function newStorage(): StorageAdapter {
	return new FakeRecoveryStorage() as unknown as StorageAdapter;
}

describe("Agent Recovery Rate Tracker (BAT-61) — durable storage", () => {
	it("correctly classifies user agent into crawler, browser agent, and human", () => {
		expect(classifyUserAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe("crawler");
		expect(classifyUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2)")).toBe("crawler");
		expect(classifyUserAgent("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe("crawler");
		expect(classifyUserAgent("curl/7.88.1")).toBe("browser_agent");
		expect(classifyUserAgent("axios/1.6.0")).toBe("browser_agent");
		expect(
			classifyUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			),
		).toBe("human");
	});

	it("records suggestion served through durable storage with classified category", async () => {
		const storage = newStorage();
		await recordSuggestionServedEvent(
			storage,
			"site_123",
			"https://example.com/docs/v2/auth",
			["https://example.com/docs/v3/auth", "https://example.com/docs/auth-overview"],
			"Mozilla/5.0 (compatible; ClaudeBot/1.0)",
		);

		const fake = storage as unknown as FakeRecoveryStorage;
		expect(fake.events).toHaveLength(1);
		expect(fake.events[0].siteId).toBe("site_123");
		expect(fake.events[0].agentCategory).toBe("crawler");
		expect(fake.events[0].recovered).toBe(false);
	});

	it("correlates follow-on fetch to a recently served suggestion via storage", async () => {
		const storage = newStorage();
		await recordSuggestionServedEvent(
			storage,
			"site_123",
			"https://example.com/docs/v2/auth",
			["https://example.com/docs/v3/auth"],
			"curl/7.88.1",
		);

		const correlated = await recordFollowOnFetch(
			storage,
			"site_123",
			"https://example.com/docs/v3/auth",
		);

		expect(correlated).not.toBeNull();
		expect(correlated?.recovered).toBe(true);
		expect(correlated?.recoveredUrl).toBe("https://example.com/docs/v3/auth");
	});

	it("does not correlate fetch for different URL or different site", async () => {
		const storage = newStorage();
		await recordSuggestionServedEvent(
			storage,
			"site_abc",
			"https://example.com/dead",
			["https://example.com/suggested-1"],
			"curl/7.88.1",
		);

		const nonMatch = await recordFollowOnFetch(storage, "site_abc", "https://example.com/unrelated");
		expect(nonMatch).toBeNull();

		const diffSite = await recordFollowOnFetch(storage, "site_other", "https://example.com/suggested-1");
		expect(diffSite).toBeNull();
	});

	it("computes recovery rate stats from durable storage, segmented by category", async () => {
		const storage = newStorage();
		await recordSuggestionServedEvent(storage, "site_1", "https://a.com/dead", ["https://a.com/live"], "ClaudeBot/1.0");
		await recordSuggestionServedEvent(storage, "site_1", "https://a.com/dead2", ["https://a.com/live2"], "ClaudeBot/1.0");
		await recordSuggestionServedEvent(storage, "site_1", "https://a.com/dead3", ["https://a.com/live3"], "curl/8.0");

		await recordFollowOnFetch(storage, "site_1", "https://a.com/live");

		const stats = await getRecoveryRateStats(storage, "site_1");
		expect(stats.overall.totalSuggestions).toBe(3);
		expect(stats.overall.recoveredCount).toBe(1);
		expect(stats.overall.recoveryRate).toBeCloseTo(0.333, 2);
		expect(stats.byAgentCategory.crawler.totalSuggestions).toBe(2);
		expect(stats.byAgentCategory.crawler.recoveredCount).toBe(1);
		expect(stats.byAgentCategory.browser_agent.totalSuggestions).toBe(1);
		expect(stats.byAgentCategory.browser_agent.recoveredCount).toBe(0);
	});

	it("is a no-op that never throws when storage is unavailable", async () => {
		await expect(
			recordSuggestionServedEvent(undefined, "site", "https://a.com/dead", ["https://a.com/live"]),
		).resolves.toBeUndefined();
		await expect(recordFollowOnFetch(undefined, "site", "https://a.com/live")).resolves.toBeNull();
	});

	it("swallows storage failures instead of rejecting (telemetry must never break the request)", async () => {
		const storage: StorageAdapter = {
			recordRecoveryEvent: async () => {
				throw new Error("db unavailable");
			},
			markRecoveryEventRecovered: async () => {
				throw new Error("db unavailable");
			},
		} as unknown as StorageAdapter;

		await expect(
			recordSuggestionServedEvent(storage, "site", "https://a.com/dead", ["https://a.com/live"]),
		).resolves.toBeUndefined();
		await expect(recordFollowOnFetch(storage, "site", "https://a.com/live")).resolves.toBeNull();
	});

	it("exposes the recovery correlation window constant", () => {
		expect(RECOVERY_WINDOW_MS).toBe(60_000);
	});
});

import { describe, expect, it } from "vitest";
import {
	dashboardSiteStatus,
	decodeDashboardCursor,
	encodeDashboardCursor,
	InvalidDashboardCursorError,
} from "../src/data/dashboard.js";
import { PostgresStorage } from "../src/storage/postgres.js";

type Row = Record<string, unknown>;
type Result = { rows: Row[]; rowCount?: number | null };

function makeStorage(options: {
	tagged?: Result[];
	queries?: Result[];
} = {}): {
	storage: PostgresStorage;
	taggedText: string[];
	queries: { text: string; params: unknown[] }[];
} {
	const taggedQueue = [...(options.tagged ?? [])];
	const queryQueue = [...(options.queries ?? [])];
	const taggedText: string[] = [];
	const queries: { text: string; params: unknown[] }[] = [];
	const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
		taggedText.push(strings.join("?"));
		return taggedQueue.shift() ?? { rows: [] };
	};
	Object.assign(sql, {
		query: async (text: string, params: unknown[] = []) => {
			queries.push({ text, params });
			return queryQueue.shift() ?? { rows: [] };
		},
	});
	const holder: { sql: unknown } = Object.create(PostgresStorage.prototype) as any;
	holder.sql = sql;
	return { storage: holder as unknown as PostgresStorage, taggedText, queries };
}

function siteRow(overrides: Row = {}): Row {
	return {
		id: "site_1",
		domain: "example.com",
		api_key: "key_current",
		public_key: "pk_current",
		verified_at: "2026-08-01T00:00:00.000Z",
		verification_token: "vf_test",
		reclaim_token: null,
		reclaim_requested_at: null,
		created_at: "2026-08-01T00:00:00.000Z",
		owner_sub: "auth0|owner",
		...overrides,
	};
}

describe("dashboard cursor", () => {
	it("round-trips a timestamp-plus-ID keyset cursor", () => {
		const encoded = encodeDashboardCursor({
			timestamp: "2026-08-22T08:00:00.000Z",
			id: 42,
		});
		expect(decodeDashboardCursor(encoded)).toEqual({
			timestamp: "2026-08-22T08:00:00.000Z",
			id: 42,
		});
	});

	it("rejects malformed cursors rather than silently duplicating a page", () => {
		expect(() => decodeDashboardCursor("not-a-cursor")).toThrow(InvalidDashboardCursorError);
	});
});

describe("dashboard status", () => {
	it("requires ownership verification, indexed pages, and a recovered live probe", () => {
		expect(dashboardSiteStatus({ verified: false, pageCount: 12, probeVerdict: "recovered_404" })).toBe("unverified");
		expect(dashboardSiteStatus({ verified: true, pageCount: 0, probeVerdict: "recovered_404" })).toBe("warning");
		expect(dashboardSiteStatus({ verified: true, pageCount: 12, probeVerdict: "unrecovered_404" })).toBe("warning");
		expect(dashboardSiteStatus({ verified: true, pageCount: 12, probeVerdict: "recovered_404" })).toBe("live");
	});
});

describe("PostgresStorage dashboard queries", () => {
	it("maps one batched portfolio query without a secret and preserves no-data rates", async () => {
		const { storage, taggedText } = makeStorage({
			tagged: [{ rows: [{
				id: "site_1",
				domain: "example.com",
				verified_at: "2026-08-01T00:00:00.000Z",
				created_at: "2026-08-01T00:00:00.000Z",
				page_count: 4,
				suggestions_30d: 0,
				recovery_rate_30d: null,
				probe_verdict: "recovered_404",
				last_activity_at: null,
			}] }],
		});
		const summaries = await storage.listSiteSummaries("auth0|owner");
		expect(taggedText).toHaveLength(1);
		expect(taggedText[0]).toContain("WITH owned AS");
		expect(summaries[0]).toMatchObject({
			domain: "example.com",
			status: "live",
			recoveryRate30d: null,
		});
		expect(summaries[0]).not.toHaveProperty("apiKey");
	});

	it("paginates activity by created_at and id and emits the last visible row cursor", async () => {
		const { storage, queries } = makeStorage({
			queries: [{ rows: [
				{
					id: 9,
					dead_url: "/missing-a",
					suggested_urls: ["/a"],
					agent_category: "crawler",
					user_agent: "GPTBot",
					created_at: "2026-08-22T08:00:00.000Z",
					recovered: true,
					recovered_url: "/a",
					recovery_latency_ms: 12,
				},
				{
					id: 8,
					dead_url: "/missing-b",
					suggested_urls: '["/b"]',
					agent_category: "browser_agent",
					user_agent: "Agent",
					created_at: "2026-08-22T07:00:00.000Z",
					cursor_timestamp: "2026-08-22T07:00:00.123456Z",
					recovered: false,
					recovered_url: null,
					recovery_latency_ms: null,
				},
				{ id: 7 },
			] }],
		});
		const page = await storage.getActivityPage("site_1", { range: "24h", limit: 2 });
		expect(queries[0].text).toContain("ORDER BY created_at DESC, id DESC");
		expect(queries[0].params.at(-1)).toBe(3);
		expect(page.items).toHaveLength(2);
		expect(page.items[1].suggestedUrls).toEqual(["/b"]);
		expect(page.hasMore).toBe(true);
		expect(decodeDashboardCursor(page.nextCursor!)).toEqual({
			timestamp: "2026-08-22T07:00:00.123456Z",
			id: 8,
		});
	});

	it("uses the same timestamp-plus-ID ordering for indexed pages", async () => {
		const cursor = encodeDashboardCursor({ timestamp: "2026-08-20T00:00:00.000Z", id: 18 });
		const { storage, queries } = makeStorage({ queries: [{ rows: [] }] });
		await storage.getIndexedPagePage("site_1", { query: "docs", cursor, limit: 25 });
		expect(queries[0].text).toContain("ORDER BY last_seen DESC, id DESC");
		expect(queries[0].text).toContain("last_seen =");
		expect(queries[0].params).toContain(18);
	});

	it("builds a route-scoped overview with a nullable empty recovery rate and no key material", async () => {
		const { storage } = makeStorage({
			tagged: [
				{ rows: [siteRow()] },
				{ rows: [{
					page_count: 3,
					suggestions_30d: 0,
					recovery_total_30d: 0,
					recovered_30d: 0,
					median_latency: null,
					last_activity_at: null,
				}] },
				{ rows: [{ day: "2026-08-22", suggestions: 0, recovered: 0 }] },
				{ rows: [] },
			],
			queries: [{ rows: [] }],
		});
		const overview = await storage.getSiteOverview("example.com", "auth0|owner");
		expect(overview?.metrics.recoveryRate30d).toBeNull();
		expect(overview?.recoverySeries[0].recoveryRate).toBeNull();
		expect(overview?.site).not.toHaveProperty("apiKey");
		expect(overview).not.toHaveProperty("publicKey");
	});
});

describe("PostgresStorage key lifecycle", () => {
	it("accepts a database-matched unexpired previous secret key", async () => {
		const { storage, taggedText } = makeStorage({
			tagged: [{ rows: [siteRow({ matched_key_type: "secret" })] }],
		});
		const found = await storage.getSiteByKey("key_previous");
		expect(found?.keyType).toBe("secret");
		expect(found?.site.apiKey).toBe("key_current");
		expect(taggedText[0]).toContain("previous_api_key_expires_at > NOW()");
	});

	it("rotates secret and public credentials independently", async () => {
		const expires = "2026-08-23T08:00:00.000Z";
		const rotated = "2026-08-22T08:00:00.000Z";
		const secret = makeStorage({ tagged: [{ rows: [{ id: "site_1", expires_at: expires, rotated_at: rotated }] }] });
		const publicKey = makeStorage({ tagged: [{ rows: [{ id: "site_1", expires_at: expires, rotated_at: rotated }] }] });

		const secretResult = await secret.storage.rotateSiteKey("site_1", "auth0|owner", "secret");
		const publicResult = await publicKey.storage.rotateSiteKey("site_1", "auth0|owner", "public");
		expect(secretResult.ok && secretResult.result.key).toMatch(/^key_/);
		expect(publicResult.ok && publicResult.result.key).toMatch(/^pk_/);
		expect(secret.taggedText[0]).toContain("previous_api_key = api_key");
		expect(publicKey.taggedText[0]).toContain("previous_public_key = public_key");
	});

	it("returns a 409-ready outcome while the same key kind overlaps", async () => {
		const expires = new Date(Date.now() + 3_600_000).toISOString();
		const { storage } = makeStorage({
			tagged: [{ rows: [] }, { rows: [{ expires_at: expires }] }],
		});
		expect(await storage.rotateSiteKey("site_1", "auth0|owner", "secret")).toEqual({
			ok: false,
			reason: "overlap_active",
			retryAt: expires,
		});
	});

	it("hard-deletes only an exact site, owner, and normalized-domain match", async () => {
		const yes = makeStorage({ tagged: [{ rows: [], rowCount: 1 }] });
		const no = makeStorage({ tagged: [{ rows: [], rowCount: 0 }] });
		expect(await yes.storage.deleteOwnedSite("site_1", "auth0|owner", "example.com")).toBe(true);
		expect(await no.storage.deleteOwnedSite("site_1", "auth0|other", "example.com")).toBe(false);
		expect(yes.taggedText[0]).toContain("id =");
		expect(yes.taggedText[0]).toContain("owner_sub =");
		expect(yes.taggedText[0]).toContain("domain =");
	});
});

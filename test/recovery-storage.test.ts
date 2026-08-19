import { describe, expect, it } from "vitest";
import { PostgresStorage } from "../src/storage/postgres.js";

// Regression coverage for the production dashboard 500:
//   POST /auth/login/verify 302 -> GET /dashboard 500
//   "Unexpected token 'h', "https://bh"... is not valid JSON"
//
// Neon's type parsers return the JSONB recovery_events.suggested_urls column as
// an already-parsed array. The old mapper coerced it with String(...) (which
// joins array elements with commas) then called JSON.parse — throwing on rows
// that contain recovery events. These tests exercise the public
// getRecentRecoveryEvents behavior with a stub sql (no real DB) to prove the
// exact production shape maps without throwing and stays unchanged.

type Rows = { rows: Record<string, unknown>[] };
function makeStorage(rows: Record<string, unknown>[]): PostgresStorage {
	// Object.create(proto) returns `any`, which sidesteps the private `sql`
	// field so we can inject a stub without touching credentials.
	const storage: { sql: unknown } = Object.create(PostgresStorage.prototype) as any;
	// Narrow test cast only: the stub only needs the tagged-template call shape
	// that getRecentRecoveryEvents performs. No real credentials are involved.
	storage.sql = async (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ rows });
	return storage as unknown as PostgresStorage;
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: 7,
		site_id: "site_abc",
		dead_url: "https://bh.example/old",
		suggested_urls: ["https://bh.example/survivor"],
		agent_category: "browser_agent",
		user_agent: "claude-agent-test",
		client_hash: null,
		created_at: "2026-08-19T10:00:00.000Z",
		recovered: false,
		recovered_url: null,
		recovery_latency_ms: null,
		...overrides,
	};
}

describe("PostgresStorage.getRecentRecoveryEvents (recovery_events.suggested_urls JSONB)", () => {
	it("maps a Neon already-parsed one-element URL array without throwing and unchanged (production shape)", async () => {
		// Neon hands back the parsed array, not a JSON string — the exact shape
		// that previously crashed the dashboard.
		const storage = makeStorage([makeRow({ suggested_urls: ["https://bh.example.com/survivor"] })]);
		const events = await storage.getRecentRecoveryEvents("site_abc", 20);
		expect(events).toHaveLength(1);
		expect(events[0].suggestedUrls).toEqual(["https://bh.example.com/survivor"]);
		expect(events[0].id).toBe("7");
		expect(events[0].deadUrl).toBe("https://bh.example/old");
	});

	it("still parses a raw JSON string when a row is read as text", async () => {
		const storage = makeStorage([makeRow({ suggested_urls: '["https://bh.example/survivor"]' })]);
		const events = await storage.getRecentRecoveryEvents("site_abc", 20);
		expect(events).toHaveLength(1);
		expect(events[0].suggestedUrls).toEqual(["https://bh.example/survivor"]);
	});

	it("falls back to an empty array for nullish/missing suggested_urls", async () => {
		const storage = makeStorage([makeRow({ suggested_urls: null })]);
		const events = await storage.getRecentRecoveryEvents("site_abc", 20);
		expect(events).toHaveLength(1);
		expect(events[0].suggestedUrls).toEqual([]);
	});
});
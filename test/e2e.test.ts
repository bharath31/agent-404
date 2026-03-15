/**
 * E2E Integration Tests
 *
 * These tests run against the live agent404.dev API to verify the full
 * registration → beacon → suggest flow works end-to-end.
 *
 * Run with: npx vitest run test/e2e.test.ts
 *
 * These tests create a real test site in the database, register pages,
 * and verify that suggestions are returned correctly for dead URLs.
 * The test domain (e2e-test-{timestamp}.example.com) is unique per run.
 */
import { describe, it, expect, beforeAll } from "vitest";

const API_BASE = process.env.API_BASE || "https://www.agent404.dev";
const TEST_DOMAIN = `e2e-test-${Date.now()}.example.com`;

// Pages that simulate a real documentation site
const TEST_PAGES = [
	{
		url: `https://${TEST_DOMAIN}/docs/v3/authentication`,
		title: "Authentication Guide",
		description: "How to authenticate with the API using OAuth2 and API keys",
		headings: ["OAuth2 Flow", "API Keys", "Token Refresh"],
	},
	{
		url: `https://${TEST_DOMAIN}/docs/v3/billing`,
		title: "Billing API",
		description: "Manage invoices, subscriptions, and payment methods",
		headings: ["Invoices", "Subscriptions", "Payment Methods"],
	},
	{
		url: `https://${TEST_DOMAIN}/docs/v3/users`,
		title: "Users API",
		description: "Create, read, update, and delete user accounts",
		headings: ["Create User", "List Users", "Update User", "Delete User"],
	},
	{
		url: `https://${TEST_DOMAIN}/docs/v3/webhooks`,
		title: "Webhooks",
		description: "Set up webhooks to receive real-time event notifications",
		headings: ["Event Types", "Endpoint Configuration", "Verification"],
	},
	{
		url: `https://${TEST_DOMAIN}/guides/getting-started`,
		title: "Getting Started",
		description: "Quick start guide for new developers",
		headings: ["Installation", "First API Call", "Next Steps"],
	},
	{
		url: `https://${TEST_DOMAIN}/blog/api-v3-migration`,
		title: "Migrating to API v3",
		description: "Step-by-step migration guide from v2 to v3",
		headings: ["Breaking Changes", "Migration Steps", "FAQ"],
	},
];

// Dead URLs that simulate real-world 404 scenarios
const DEAD_URL_SCENARIOS = [
	{
		name: "Version migration (v2 → v3)",
		deadUrl: `https://${TEST_DOMAIN}/docs/v2/authentication`,
		expectedMatch: "/docs/v3/authentication",
		expectedMatchType: "moved",
	},
	{
		name: "Typo in URL",
		deadUrl: `https://${TEST_DOMAIN}/docs/v3/athentication`,
		expectedMatch: "/docs/v3/authentication",
	},
	{
		name: "Singular/plural variation",
		deadUrl: `https://${TEST_DOMAIN}/docs/v3/user`,
		expectedMatch: "/docs/v3/users",
	},
	{
		name: "Missing path segment",
		deadUrl: `https://${TEST_DOMAIN}/docs/billing`,
		expectedMatch: "/docs/v3/billing",
	},
	{
		name: "Path restructure",
		deadUrl: `https://${TEST_DOMAIN}/docs/v3/getting-started`,
		expectedMatch: "/guides/getting-started",
	},
];

describe("E2E: Full API flow against live server", () => {
	let siteId: string;
	let apiKey: string;

	beforeAll(async () => {
		// Step 1: Register a test site
		const siteRes = await fetch(`${API_BASE}/api/sites`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: TEST_DOMAIN }),
		});

		expect(siteRes.status).toBe(201);
		const siteBody = await siteRes.json();
		siteId = siteBody.id;
		apiKey = siteBody.apiKey;

		expect(siteId).toBeDefined();
		expect(apiKey).toMatch(/^key_/);

		// Step 2: Register all test pages
		for (const page of TEST_PAGES) {
			const res = await fetch(`${API_BASE}/api/register`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify(page),
			});
			expect(res.status).toBe(200);
		}
	}, 30000); // 30s timeout for setup

	it("should have registered the site", async () => {
		const res = await fetch(`${API_BASE}/api/sites/${siteId}/stats`);
		expect(res.status).toBe(200);
		const stats = await res.json();
		expect(stats.pageCount).toBe(TEST_PAGES.length);
	});

	for (const scenario of DEAD_URL_SCENARIOS) {
		it(`should suggest correct page for: ${scenario.name}`, async () => {
			const res = await fetch(`${API_BASE}/api/suggest`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: scenario.deadUrl }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();

			expect(body.deadUrl).toBe(scenario.deadUrl);
			expect(body.suggestions.length).toBeGreaterThan(0);

			// Check that the expected page appears in suggestions
			const matchingSuggestion = body.suggestions.find((s: any) =>
				s.url.includes(scenario.expectedMatch),
			);
			expect(
				matchingSuggestion,
				`Expected "${scenario.expectedMatch}" in suggestions for "${scenario.name}". Got: ${JSON.stringify(body.suggestions.map((s: any) => s.url))}`,
			).toBeDefined();

			// Verify score is reasonable
			expect(matchingSuggestion.score).toBeGreaterThan(0.2);

			// Verify matchType if specified
			if (scenario.expectedMatchType) {
				expect(matchingSuggestion.matchType).toBe(scenario.expectedMatchType);
			}
		});
	}

	it("should return valid JSON-LD for agent consumption", async () => {
		const res = await fetch(`${API_BASE}/api/suggest`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({ url: `https://${TEST_DOMAIN}/docs/v2/authentication` }),
		});

		const body = await res.json();

		// Verify JSON-LD structure (what agents actually parse)
		expect(body.jsonLd["@context"]).toBe("https://schema.org");
		expect(body.jsonLd["@type"]).toBe("WebPage");
		expect(body.jsonLd.mainEntity["@type"]).toBe("ItemList");

		const items = body.jsonLd.mainEntity.itemListElement;
		expect(items.length).toBeGreaterThan(0);

		// Each item should be a valid ListItem
		for (const item of items) {
			expect(item["@type"]).toBe("ListItem");
			expect(item.position).toBeGreaterThan(0);
			expect(item.url).toBeTruthy();
			expect(item.name).toBeTruthy();
		}
	});

	it("should return empty suggestions for completely unrelated URL", async () => {
		const res = await fetch(`${API_BASE}/api/suggest`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				url: `https://${TEST_DOMAIN}/xyzzy/quantum/entanglement`,
			}),
		});

		const body = await res.json();
		// Should have no high-scoring results
		for (const s of body.suggestions) {
			expect(s.score).toBeLessThan(0.5);
		}
	});

	it("should reject requests with invalid API key", async () => {
		const res = await fetch(`${API_BASE}/api/suggest`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "key_invalid_key_12345",
			},
			body: JSON.stringify({ url: `https://${TEST_DOMAIN}/docs/v2/auth` }),
		});

		expect(res.status).toBe(401);
	});

	it("should track suggestion stats", async () => {
		// Wait a moment for async logging
		await new Promise((r) => setTimeout(r, 500));

		const res = await fetch(`${API_BASE}/api/sites/${siteId}/stats`);
		const stats = await res.json();

		expect(stats.pageCount).toBe(TEST_PAGES.length);
		expect(stats.suggestionsServed).toBeGreaterThan(0);
	});
});

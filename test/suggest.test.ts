import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index.js";
import { applyMigrations } from "./helpers.js";

describe("POST /api/suggest", () => {
	let apiKey: string;

	beforeEach(async () => {
		await applyMigrations(env.DB);

		const siteRes = await app.fetch(
			new Request("http://localhost/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "suggest-test.com" }),
			}),
			env,
		);
		const site = (await siteRes.json()) as { apiKey: string };
		apiKey = site.apiKey;

		const pages = [
			{
				url: "https://suggest-test.com/docs/v3/auth",
				title: "Authentication Guide",
				headings: ["OAuth", "API Keys"],
			},
			{
				url: "https://suggest-test.com/docs/v3/billing",
				title: "Billing API",
				headings: ["Invoices"],
			},
			{
				url: "https://suggest-test.com/docs/v3/users",
				title: "Users API",
				headings: ["Create User"],
			},
		];

		for (const page of pages) {
			await app.fetch(
				new Request("http://localhost/api/register", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": apiKey,
					},
					body: JSON.stringify(page),
				}),
				env,
			);
		}
	});

	it("should return suggestions for a dead URL", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://suggest-test.com/docs/v2/auth" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { deadUrl: string; suggestions: any[]; jsonLd: any };
		expect(body.deadUrl).toBe("https://suggest-test.com/docs/v2/auth");
		expect(body.suggestions.length).toBeGreaterThan(0);
		expect(body.suggestions[0].url).toBe("https://suggest-test.com/docs/v3/auth");
		expect(body.jsonLd).toBeDefined();
		expect(body.jsonLd["@context"]).toBe("https://schema.org");
	});

	it("should include JSON-LD with ItemList", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://suggest-test.com/docs/v2/auth" }),
			}),
			env,
		);

		const body = (await res.json()) as { jsonLd: any };
		expect(body.jsonLd["@type"]).toBe("WebPage");
		expect(body.jsonLd.mainEntity["@type"]).toBe("ItemList");
		expect(body.jsonLd.mainEntity.itemListElement.length).toBeGreaterThan(0);
		expect(body.jsonLd.mainEntity.itemListElement[0].position).toBe(1);
	});

	it("should reject without api key", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/suggest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://suggest-test.com/dead" }),
			}),
			env,
		);
		expect(res.status).toBe(401);
	});
});

import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index.js";
import { applyMigrations } from "./helpers.js";

describe("POST /api/register", () => {
	let apiKey: string;

	beforeEach(async () => {
		await applyMigrations(env.DB);

		const res = await app.fetch(
			new Request("http://localhost/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.com" }),
			}),
			env,
		);
		const site = (await res.json()) as { apiKey: string };
		apiKey = site.apiKey;
	});

	it("should register a page", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					url: "https://test.com/docs/intro",
					title: "Introduction",
					description: "Getting started guide",
					headings: ["Welcome", "Setup"],
				}),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	it("should reject without api key", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://test.com/page" }),
			}),
			env,
		);

		expect(res.status).toBe(401);
	});

	it("should reject without url", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({}),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});
});

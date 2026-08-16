/**
 * Production smoke: load the published snippet from the canonical origin
 * on a fixture page served from a different origin.
 *
 * Runs on deploy (SMOKE_PRODUCTION=1), not on every PR — the published
 * script only updates after a production deploy.
 */
import { test, expect } from "@playwright/test";
import { startServer } from "./test-server.js";
import { CANONICAL_ORIGIN, CANONICAL_SCRIPT_URL } from "../src/config.js";

const run = process.env.SMOKE_PRODUCTION === "1";

test.describe("published snippet smoke", () => {
	test.skip(!run, "Set SMOKE_PRODUCTION=1 to hit the published origin");

	const TEST_DOMAIN = `smoke-${Date.now()}.example.com`;
	let siteId: string;
	let apiKey: string;
	let pageOrigin: string;
	let closeServer: () => void;

	test.beforeAll(async () => {
		const siteRes = await fetch(`${CANONICAL_ORIGIN}/api/sites`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: TEST_DOMAIN }),
		});
		expect(siteRes.ok).toBe(true);
		const siteBody = await siteRes.json();
		siteId = siteBody.id;
		apiKey = siteBody.apiKey;

		const server = await startServer(siteId, apiKey, {
			scriptSrc: CANONICAL_SCRIPT_URL,
			apiBase: CANONICAL_ORIGIN,
		});
		pageOrigin = server.pageOrigin;
		closeServer = server.close;

		const pageHost = new URL(pageOrigin).host;
		await fetch(`${CANONICAL_ORIGIN}/api/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				url: `http://${pageHost}/docs/v3/authentication`,
				title: "Authentication Guide",
				description: "How to authenticate with the API",
				headings: ["OAuth2 Flow"],
			}),
		});
	});

	test.afterAll(() => {
		closeServer?.();
	});

	test("live fixture indexes a page via the published script", async ({ page }) => {
		const beacon = page.waitForResponse(
			(resp) => resp.url().includes("/api/register") && resp.request().method() === "POST",
		);
		await page.goto(`${pageOrigin}/docs/v3/authentication`);
		const resp = await beacon;
		expect(new URL(resp.url()).origin).toBe(CANONICAL_ORIGIN);
		expect(resp.ok()).toBe(true);

		const status = await fetch(`${CANONICAL_ORIGIN}/api/install/status`, {
			headers: { "x-api-key": apiKey },
		});
		const body = await status.json();
		expect(body.installVerified).toBe(true);
		expect(body.pageCount).toBeGreaterThan(0);
	});

	test("404 fixture renders a suggestion from the published script", async ({ page }) => {
		await page.goto(`${pageOrigin}/docs/v2/authentication`);
		const container = page.locator("#agent-404-suggestions");
		await expect(container).toBeVisible({ timeout: 15000 });
		await expect(container.locator("a").first()).toBeVisible();
	});
});

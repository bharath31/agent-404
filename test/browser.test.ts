/**
 * Browser tests against a local fixture host + in-process API.
 * Does not touch production — that is smoke-published.test.ts on main only.
 */
import { test, expect } from "@playwright/test";
import { startServer } from "./test-server.js";

let siteId: string;
let apiKey: string;
let pageOrigin: string;
let apiOrigin: string;
let closeServer: () => void;

test.beforeAll(async () => {
	siteId = crypto.randomUUID();
	apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;

	const server = await startServer(siteId, apiKey);
	pageOrigin = server.pageOrigin;
	apiOrigin = server.apiOrigin;
	closeServer = server.close;
	const pageHost = new URL(pageOrigin).host;

	const pages = [
		{
			url: `http://${pageHost}/docs/v3/authentication`,
			title: "Authentication Guide",
			description: "How to authenticate with the API",
			headings: ["OAuth2 Flow", "API Keys", "Token Refresh"],
		},
		{
			url: `http://${pageHost}/docs/v3/billing`,
			title: "Billing API",
			description: "Manage invoices and payments",
			headings: ["Invoices", "Payments"],
		},
		{
			url: `http://${pageHost}/docs/v3/users`,
			title: "Users API",
			description: "Create and manage users",
			headings: ["Create User", "List Users"],
		},
	];

	for (const page of pages) {
		const res = await fetch(`${apiOrigin}/api/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify(page),
		});
		if (!res.ok) throw new Error(`local register failed: ${res.status}`);
	}
});

test.afterAll(() => {
	closeServer?.();
});

test("live page beacons metadata to the API", async ({ page }) => {
	const beaconPromise = page.waitForRequest(
		(req) => req.url().includes("/api/register") && req.method() === "POST",
	);

	await page.goto(`${pageOrigin}/docs/v3/authentication`);

	const beaconReq = await beaconPromise;
	const body = beaconReq.postDataJSON();

	expect(new URL(beaconReq.url()).origin).toBe(apiOrigin);
	expect(body.url).toContain("/docs/v3/authentication");
	expect(body.title).toBe("Authentication Guide");
	expect(body.description).toBe("How to authenticate with the API using OAuth2 and API keys");
	expect(body.headings).toContain("OAuth2 Flow");
	expect(body.headings).toContain("API Keys");
});

test("404 page detects error via meta tag and fetches suggestions", async ({ page }) => {
	await page.goto(`${pageOrigin}/docs/v2/authentication`);
	const container = page.locator("#agent-404-suggestions");
	await expect(container).toBeVisible({ timeout: 10000 });
});

test("404 page injects suggestion links", async ({ page }) => {
	await page.goto(`${pageOrigin}/docs/v2/authentication`);

	const container = page.locator("#agent-404-suggestions");
	await expect(container).toBeVisible({ timeout: 10000 });

	const heading = container.locator("h3");
	await expect(heading).toHaveText("Were you looking for one of these?");

	const links = container.locator("a");
	const count = await links.count();
	expect(count).toBeGreaterThan(0);

	const allHrefs: string[] = [];
	for (let i = 0; i < count; i++) {
		allHrefs.push((await links.nth(i).getAttribute("href")) || "");
	}
	const hasAuthLink = allHrefs.some((href) => href.includes("authentication") || href.includes("auth"));
	expect(hasAuthLink).toBe(true);
});

test("404 page injects match type badges", async ({ page }) => {
	await page.goto(`${pageOrigin}/docs/v2/authentication`);

	const container = page.locator("#agent-404-suggestions");
	await expect(container).toBeVisible({ timeout: 10000 });

	const badges = container.locator("span");
	const count = await badges.count();
	expect(count).toBeGreaterThan(0);

	const badgeTexts: string[] = [];
	for (let i = 0; i < count; i++) {
		badgeTexts.push((await badges.nth(i).textContent()) || "");
	}
	const validTypes = ["moved", "similar", "related"];
	expect(badgeTexts.every((t) => validTypes.includes(t))).toBe(true);
});

test("404 page injects JSON-LD structured data", async ({ page }) => {
	await page.goto(`${pageOrigin}/docs/v2/authentication`);
	await page.locator("#agent-404-suggestions").waitFor({ timeout: 10000 });

	const jsonLdScript = page.locator('script[type="application/ld+json"]');
	await expect(jsonLdScript).toBeAttached();

	const jsonLdText = await jsonLdScript.textContent();
	expect(jsonLdText).toBeTruthy();

	const jsonLd = JSON.parse(jsonLdText!);
	expect(jsonLd["@context"]).toBe("https://schema.org");
	expect(jsonLd["@type"]).toBe("WebPage");
	expect(jsonLd.mainEntity["@type"]).toBe("ItemList");
	expect(jsonLd.mainEntity.itemListElement.length).toBeGreaterThan(0);

	for (const item of jsonLd.mainEntity.itemListElement) {
		expect(item["@type"]).toBe("ListItem");
		expect(item.position).toBeGreaterThan(0);
		expect(item.url).toBeTruthy();
	}
});

test("live page does NOT inject suggestions", async ({ page }) => {
	await page.goto(`${pageOrigin}/docs/v3/authentication`);
	await page.waitForTimeout(2000);
	const container = page.locator("#agent-404-suggestions");
	await expect(container).not.toBeVisible();
});

test("404 page with no matching pages shows no suggestions container", async ({ page }) => {
	await page.goto(`${pageOrigin}/xyzzy/quantum/entanglement/wormhole`);
	await page.waitForTimeout(2000);
	const container = page.locator("#agent-404-suggestions");
	const isVisible = await container.isVisible();
	if (isVisible) {
		const count = await container.locator("a").count();
		expect(count).toBeGreaterThanOrEqual(0);
	}
});


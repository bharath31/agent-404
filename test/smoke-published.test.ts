/**
 * Production smoke: load the published snippet from the canonical origin
 * on a fixture page whose host matches the registered domain.
 *
 * Runs on deploy (SMOKE_PRODUCTION=1), not on every PR — the published
 * script only updates after a production deploy. Each run inserts a
 * `smoke-<timestamp>.example.com` row; there is no public delete API, so
 * treat these as disposable telemetry sites.
 *
 * This job races Vercel: it hits the *currently deployed* API, not the
 * commit under test. Retries site create until production is healthy so a
 * just-merged schema change can finish rolling out.
 *
 * Theme 6: HTML uses data-public-key (no browser writes). Indexing is
 * server-side /api/register with the secret key. Chromium maps the
 * registered host to the local fixture so Origin matches.
 */
import { test, expect } from "@playwright/test";
import { startServer } from "./test-server.js";
import { CANONICAL_ORIGIN, CANONICAL_SCRIPT_URL } from "../src/config.js";

const run = process.env.SMOKE_PRODUCTION === "1";

const TEST_DOMAIN = `smoke-${Date.now()}.example.com`;

test.use({
	launchOptions: {
		args: [`--host-resolver-rules=MAP ${TEST_DOMAIN} 127.0.0.1`],
	},
});

async function sleep(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

async function postJson(
	path: string,
	body: unknown,
	headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
	const res = await fetch(`${CANONICAL_ORIGIN}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let json: Record<string, unknown> = {};
	try {
		json = JSON.parse(text) as Record<string, unknown>;
	} catch {
		json = { raw: text };
	}
	return { ok: res.ok, status: res.status, json, text };
}

async function createSiteUntilOk(): Promise<{ siteId: string; apiKey: string; publicKey: string }> {
	const headers: Record<string, string> = {};
	if (process.env.E2E_COOKIE) {
		headers.Cookie = process.env.E2E_COOKIE;
	}

	const deadline = Date.now() + 180_000;
	let last = "";
	while (Date.now() < deadline) {
		const res = await postJson("/api/sites", { domain: TEST_DOMAIN }, headers);
		last = `${res.status} ${res.text}`;
		if (res.ok) {
			const siteId = String(res.json.id || "");
			const apiKey = String(res.json.apiKey || "");
			const publicKey = String(res.json.publicKey || "");
			if (!siteId || !apiKey) {
				throw new Error(`production /api/sites missing credentials: ${res.text}`);
			}
			return { siteId, apiKey, publicKey };
		}
		await sleep(5_000);
	}
	throw new Error(`production /api/sites did not recover: ${last}`);
}

async function registerUntilOk(
	apiKey: string,
	page: { url: string; title: string; description: string; headings: string[] },
): Promise<void> {
	const deadline = Date.now() + 180_000;
	let last = "";
	while (Date.now() < deadline) {
		const res = await postJson("/api/register", page, { "x-api-key": apiKey });
		last = `${res.status} ${res.text}`;
		if (res.ok) return;
		await sleep(5_000);
	}
	throw new Error(`production /api/register did not recover: ${last}`);
}

test.describe("published snippet smoke", () => {
	test.skip(!run, "Set SMOKE_PRODUCTION=1 to hit the published origin");
	test.describe.configure({ timeout: 360_000 });

	let siteId: string;
	let apiKey: string;
	let publicKey: string;
	let pageOrigin: string;
	let closeServer: () => void;

	test.beforeAll(async () => {
		test.setTimeout(360_000);
		const site = await createSiteUntilOk();
		siteId = site.siteId;
		apiKey = site.apiKey;
		publicKey = site.publicKey;

		const server = await startServer(siteId, apiKey, {
			scriptSrc: CANONICAL_SCRIPT_URL,
			omitDataApiBase: true,
			publicKey,
			pageHost: TEST_DOMAIN,
		});
		pageOrigin = server.pageOrigin;
		closeServer = server.close;

		await registerUntilOk(apiKey, {
			url: `${pageOrigin}/docs/v3/authentication`,
			title: "Authentication Guide",
			description: "How to authenticate with the API",
			headings: ["OAuth2 Flow"],
		});
	});

	test.afterAll(() => {
		closeServer?.();
	});

	test("published script loads from the canonical origin", async ({ page }) => {
		const script = page.waitForResponse(
			(resp) => resp.url() === CANONICAL_SCRIPT_URL || resp.url().startsWith(CANONICAL_SCRIPT_URL),
		);
		await page.goto(`${pageOrigin}/docs/v3/authentication`);
		const resp = await script;
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

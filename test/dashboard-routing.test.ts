import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { dashboard } from "../src/api/routes/dashboard.js";

/**
 * Regression test for a production incident: `app.use("/dashboard*", ...)`
 * (no slash before the `*`) does not match Hono's router at all — not even
 * the bare `/dashboard` path — so the storage-attaching middleware in
 * src/index.ts silently never ran, and every real GET /dashboard threw
 * "Cannot read properties of undefined (reading 'listSitesByOwner')" right
 * after a successful Auth0 login. `test/api.test.ts`'s createTestApp never
 * mounts /dashboard at all, so nothing in the existing suite exercised this
 * exact composition: parent-level middleware + the real `dashboard` sub-app
 * mounted via `app.route("/dashboard", dashboard)`.
 *
 * This rebuilds that exact composition (same middleware pattern, same real
 * dashboard.ts module) in isolation, so a regression in either the wildcard
 * pattern or the middleware/mount ordering fails a fast unit test instead of
 * only surfacing in production logs after a real login.
 */
describe("GET /dashboard routing", () => {
	it("propagates parent middleware (ownerSub, storage) into the mounted dashboard sub-app", async () => {
		const app = new Hono();

		app.use("/dashboard/*", async (c, next) => {
			c.set("ownerSub", "auth0|routing-test");
			c.set("storage", { listSitesByOwner: async () => [] });
			await next();
		});
		app.route("/dashboard", dashboard);

		const res = await app.request("/dashboard");

		// A 500 (or a 503 "sign-in not configured" from requireOwnerPage, if
		// ownerSub never arrived either) means parent middleware never ran
		// before the sub-app's route handler — the exact failure mode of the
		// "/dashboard*" wildcard bug. Hono requires "/dashboard/*", with the
		// slash, to match the bare "/dashboard" path at all.
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Dashboard");
	});
});

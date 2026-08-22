import { Hono } from "hono";
import { rateLimiter } from "../middleware/rate-limit";
import { isBlockedInternalHost } from "../../lib/ssrf-guard";
import { discoverDemoPages } from "../../engine/discovery";

const demo = new Hono();

// Demo sitemap proxy — fetches & parses a domain's sitemap.xml for the live demo.
// Accepts the dead URL to prioritize the most relevant child sitemaps.
// No auth needed, but rate-limited. Returns lightweight page list (URL + title).
demo.use("/sitemap", rateLimiter({ windowMs: 60_000, max: 15 }));
demo.get("/sitemap", async (c) => {
	const domain = c.req.query("domain");
	const deadPath = c.req.query("path") || "";
	if (!domain || typeof domain !== "string" || domain.length > 253) {
		return c.json({ error: "domain query parameter is required" }, 400);
	}

	// Validate domain format (no protocol, no path)
	if (/[\/\s:@]/.test(domain)) {
		return c.json({ error: "Invalid domain" }, 400);
	}

	// Block private/internal hosts (same list as ownership-proof fetches).
	if (isBlockedInternalHost(domain)) {
		return c.json({ error: "Invalid domain" }, 400);
	}

	try {
		const result = await discoverDemoPages(domain, deadPath);
		return c.json({
			domain,
			pages: result.pages,
			source: result.source,
			...(result.error ? { error: result.error } : {}),
		});
	} catch {
		return c.json({ domain, pages: [], source: "none", error: "Could not discover pages" });
	}
});

export { demo };

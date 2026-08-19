import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, MiddlewareHandler } from "hono";
import { auth } from "@auth0/auth0-hono";
import type { ServerClient } from "@auth0/auth0-server-js";
import { PostgresStorage } from "./storage/postgres.js";
import { sites } from "./api/routes/sites.js";
import { register } from "./api/routes/register.js";
import { suggest } from "./api/routes/suggest.js";
import { analyze } from "./api/routes/analyze.js";
import { install } from "./api/routes/install.js";
import { audit } from "./api/routes/audit.js";
import { report } from "./api/routes/report.js";
import { demo } from "./api/routes/demo.js";
import { funnel } from "./api/routes/funnel.js";
import { cron } from "./api/routes/cron.js";
import { admin } from "./api/routes/admin.js";
import { dashboard } from "./api/routes/dashboard.js";
import { dashboardProbe } from "./api/routes/dashboard-probe.js";
import { apiKeyAuth, requireVerified, type KeyType } from "./api/middleware/auth.js";
import { rateLimiter } from "./api/middleware/rate-limit.js";
import { landingPageHtml } from "./landing.js";
import { demoPageHtml } from "./demo.js";
import {
	AUTH0_PASSWORDLESS_CONNECTION,
	AUTH_CALLBACK_PATH,
	AUTH_LOGIN_PATH,
	AUTH_LOGOUT_PATH,
	readAuth0Config,
	SESSION_ABSOLUTE_SECONDS,
	SESSION_INACTIVITY_SECONDS,
} from "./auth/config.js";
import { requireOwnerApi, sessionOwnerSub } from "./auth/owner.js";
import { loginRoutes } from "./auth/login-routes.js";
import { getDatabaseUrl } from "./config.js";
import { AGENT_404_SKILL_MD } from "./skills/agent-404.js";
import type { SiteRecord } from "./types.js";

export type Bindings = {
	DATABASE_URL: string;
	EMBEDDING_API_KEY?: string;
	CRON_SECRET?: string;
	AUTH0_DOMAIN?: string;
	AUTH0_CLIENT_ID?: string;
	AUTH0_CLIENT_SECRET?: string;
	AUTH0_SESSION_ENCRYPTION_KEY?: string;
	APP_BASE_URL?: string;
	BASE_URL?: string;
};

export type Env = {
	Bindings: Bindings;
	Variables: {
		storage: PostgresStorage;
		siteId: string;
		ownerSub: string;
		auth0Client?: ServerClient<Context>;
		site?: SiteRecord;
		keyType?: KeyType;
	};
};

const app = new Hono<Env>();

let authMiddleware: MiddlewareHandler | undefined;

function auth0FromRequest(c: Context<Env>) {
	return readAuth0Config(c.env as unknown as Record<string, string | undefined>);
}

// Auth0 session middleware
app.use("*", async (c, next) => {
	const cfg = auth0FromRequest(c);
	if (!cfg) {
		await next();
		return;
	}
	if (!authMiddleware) {
		authMiddleware = auth({
			domain: cfg.domain,
			clientID: cfg.clientID,
			clientSecret: cfg.clientSecret,
			baseURL: cfg.baseURL,
			authRequired: false,
			idpLogout: true,
			// The embedded sign-in flow (src/auth/login-routes.ts) owns the
			// /auth/login and /auth/logout paths; the middleware keeps the
			// /auth/callback route for backwards-compatible sessions.
			customRoutes: ["login", "logout"],
			session: {
				secret: cfg.sessionSecret,
				rolling: true,
				inactivityDuration: SESSION_INACTIVITY_SECONDS,
				absoluteDuration: SESSION_ABSOLUTE_SECONDS,
			},
			routes: {
				login: AUTH_LOGIN_PATH,
				logout: AUTH_LOGOUT_PATH,
				callback: AUTH_CALLBACK_PATH,
			},
			authorizationParams: {
				response_type: "code",
				scope: "openid profile email",
				connection: AUTH0_PASSWORDLESS_CONNECTION,
			},
		});
	}
	return authMiddleware(c, next);
});

// Global error handler — never leak internal details
app.onError((err, c) => {
	console.error("Unhandled error:", err.message);
	return c.json({ error: "Internal server error" }, 500);
});

// CORS — allow any origin for API routes (client script runs on customer sites)
app.use(
	"*",
	cors({
		origin: (origin) => origin || "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "x-api-key", "Authorization"],
		maxAge: 86400,
	}),
);

// Security headers
app.use("*", async (c, next) => {
	await next();
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Attach storage to context for API routes and dashboard
app.use("/api/*", async (c, next) => {
	const dbUrl = getDatabaseUrl(c.env as Record<string, unknown>);
	if (dbUrl) {
		c.set("storage", new PostgresStorage(dbUrl));
	}
	await next();
});
app.use("/dashboard/*", async (c, next) => {
	const dbUrl = getDatabaseUrl(c.env as Record<string, unknown>);
	if (dbUrl) {
		c.set("storage", new PostgresStorage(dbUrl));
	}
	await next();
});
app.use("/report/*", async (c, next) => {
	const dbUrl = getDatabaseUrl(c.env as Record<string, unknown>);
	if (dbUrl) {
		c.set("storage", new PostgresStorage(dbUrl));
	}
	await next();
});

// Rate limiting
app.use("/api/sites", rateLimiter({ windowMs: 60_000, max: 10 }));
app.use("/api/sites/*", rateLimiter({ windowMs: 60_000, max: 10 }));
app.use("/api/register", rateLimiter({ windowMs: 60_000, max: 60 }));
app.use("/api/suggest", rateLimiter({ windowMs: 60_000, max: 60 }));
app.use("/api/analyze", rateLimiter({ windowMs: 300_000, max: 2 }));
app.use("/api/install/*", rateLimiter({ windowMs: 60_000, max: 30 }));

// Landing & Demo pages
app.get("/", async (c) => {
	const signedIn = Boolean(await sessionOwnerSub(c));
	return c.html(landingPageHtml({ signedIn }));
});
app.get("/demo", (c) => c.html(demoPageHtml));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Agent skill & llms.txt discovery
app.get("/llms.txt", (c) =>
	c.text(
		`# Agent 404

> HTTP-layer semantic 404 recovery for AI agents (ClaudeBot, GPTBot, Perplexity) and human users.

## Documentation & Skills
- Agent Skill: https://www.agent404.dev/skills/agent-404/SKILL.md
- Skill Raw: https://www.agent404.dev/skills/agent-404
- API Reference: https://www.agent404.dev/api/suggest
- Health & Install Status: https://www.agent404.dev/api/install/status

## Quick Install (Adapters)
- Next.js: npm install @agent404/next
- Cloudflare Workers: npm install @agent404/cloudflare
- Express: npm install @agent404/express
- HTML Script Tag: <script src="https://www.agent404.dev/agent404.js" data-site-id="YOUR_SITE_ID" data-public-key="pk_..." defer></script>
`,
		200,
		{ "Content-Type": "text/plain; charset=utf-8" },
	),
);

app.get("/skills/agent-404", (c) => c.redirect("/skills/agent-404/SKILL.md", 302));

app.get("/skills/agent-404/SKILL.md", (c) =>
	c.text(AGENT_404_SKILL_MD, 200, {
		"Content-Type": "text/markdown; charset=utf-8",
	}),
);

// Demo discovery route
app.route("/api/demo", demo);

// Embedded passwordless sign-in (branded pages; replaces the Auth0 Universal
// Login redirect for this app only — see src/auth/login-routes.ts)
app.route("/", loginRoutes);

// BAT-42 funnel telemetry beacons (public, fire-and-forget)
app.route("/api/funnel", funnel);

// Owner: register / claim a site (Auth0 passwordless email session)
app.use("/api/sites", requireOwnerApi());
app.use("/api/sites/*", requireOwnerApi());
app.route("/api/sites", sites);

// Owner dashboard APIs (live 404 check). Session auth via requireOwnerApi;
// probes fetch customer sites, so keep them strictly rate-limited.
app.use("/api/dashboard/*", requireOwnerApi());
app.use("/api/dashboard/probe", rateLimiter({ windowMs: 60_000, max: 5 }));
app.route("/api/dashboard", dashboardProbe);

// Protected routes (require x-api-key)
app.use("/api/register", apiKeyAuth("write"));
app.use("/api/register", requireVerified());
app.route("/api/register", register);

app.use("/api/suggest", apiKeyAuth("read"));
app.use("/api/suggest", requireVerified());
app.route("/api/suggest", suggest);

app.use("/api/analyze", apiKeyAuth("write"));
app.use("/api/analyze", requireVerified());
app.route("/api/analyze", analyze);

app.use("/api/install/*", apiKeyAuth());
app.route("/api/install", install);

// Standing audit permalinks & ClaudeBot 404 response check (BAT-38, BAT-39)
app.route("/api/audit", audit);
app.route("/report", report);

// Admin & Cron routes
app.route("/api/admin", admin);
app.route("/api/cron", cron);

// Owner Dashboard
app.route("/dashboard", dashboard);

export default app;

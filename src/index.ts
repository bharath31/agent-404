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
import { demo } from "./api/routes/demo.js";
import { cron } from "./api/routes/cron.js";
import { admin } from "./api/routes/admin.js";
import { dashboard } from "./api/routes/dashboard.js";
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
} from "./auth/config.js";
import { requireOwnerApi, sessionOwnerSub } from "./auth/owner.js";
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
			session: { secret: cfg.sessionSecret },
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
	const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
	if (dbUrl) {
		c.set("storage", new PostgresStorage(dbUrl));
	}
	await next();
});
app.use("/dashboard*", async (c, next) => {
	const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
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

// Demo discovery route
app.route("/api/demo", demo);

// Owner: register / claim a site (Auth0 passwordless email session)
app.use("/api/sites", requireOwnerApi());
app.use("/api/sites/*", requireOwnerApi());
app.route("/api/sites", sites);

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

// Admin & Cron routes
app.route("/api/admin", admin);
app.route("/api/cron", cron);

// Owner Dashboard
app.route("/dashboard", dashboard);

export default app;

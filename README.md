# agent-404

<p align="center">
  <img src="public/banner.svg" alt="agent-404 — Self-Healing 404s for AI Agents & Crawlers" width="100%">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/bharath31/agent-404/actions"><img src="https://img.shields.io/github/actions/workflow/status/bharath31/agent-404/ci.yml?label=tests" alt="Tests"></a>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbharath31%2Fagent-404&env=DATABASE_URL,EMBEDDING_API_KEY,CRON_SECRET,AUTH0_DOMAIN,AUTH0_CLIENT_ID,AUTH0_CLIENT_SECRET,AUTH0_SESSION_ENCRYPTION_KEY,BASE_URL&envDescription=DATABASE_URL%3A%20Neon%20Postgres.%20Auth0%20passwordless%20email%20OTP%20for%20the%20dashboard.&project-name=agent-404&repository-name=agent-404"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/bharath31/agent-404"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers"></a>
</p>

**Self-healing 404 pages for AI agents and developers.**

When you restructure documentation or deprecate an API route, AI coding assistants (Claude Code, Cursor, Copilot), RAG pipelines, and search bots continue to follow outdated URLs baked into their pre-training data. Standard 404 error pages return client-rendered HTML that bots never execute — causing models to hallucinate or give up.

**agent-404** intercepts requests at the HTTP middleware layer, instantly returning ranked semantic destination routes in **RFC 5988 `Link` alternate headers**, **`schema.org/ItemList` JSON-LD**, and **JSON payloads** so agents self-correct in a single hop.

---

## Quick Install (HTTP Layer — Recommended)

AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute client-side JavaScript. Intercepting at the HTTP layer ensures bots receive recovery metadata before the response body finishes.

### Next.js (App Router & Pages)

```ts
// middleware.ts
import { agent404 } from "./adapters/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!,
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Cloudflare Workers

```ts
// worker.ts
import { agent404Worker } from "./adapters/cloudflare";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return agent404Worker(req, env, {
      publicKey: env.AGENT404_PUBLIC_KEY,
      siteId: env.AGENT404_SITE_ID,
    });
  },
};
```

### Express / Node.js

```ts
// server.js
import { recoverExpress404 } from "./adapters/express";

app.use(recoverExpress404({
  publicKey: process.env.AGENT404_PUBLIC_KEY,
  siteId: process.env.AGENT404_SITE_ID,
}));
```

*Also available: Netlify Edge (`adapters/netlify.ts`) and nginx (`adapters/nginx.md`).*

---

## Zero-Config Script Tag (Browsers Only)

For human visitors and headless browser agents (e.g. Browser-Use, Playwright, MultiOn), add a single script tag:

```html
<script
  src="https://www.agent404.dev/agent-404.min.js"
  data-site-id="your-site-id"
  data-public-key="your-public-key"
  defer
></script>
```

> **Security Note:** `data-public-key` is strictly read-only (`/api/suggest`). Never expose your secret API key in HTML. Page indexing is handled automatically via verified sitemap crawls.

---

## How It Works

```
1. ClaudeBot / GPTBot requests moved endpoint:
   GET /docs/v1/authentication

2. agent-404 Edge Middleware intercepts HTTP 404:
   ├── Hybrid Matcher queries indexed sitemap (<25ms)
   └── Evaluates Path Jaccard + pgvector Cosine Similarity

3. Response delivered with structured recovery metadata:
   HTTP/1.1 404 Not Found
   Link: </docs/v2/auth>; rel="alternate"
   Content-Type: text/html

   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "WebPage",
     "mainEntity": {
       "@type": "ItemList",
       "itemListElement": [{ "position": 1, "url": "https://yoursite.com/docs/v2/auth" }]
     }
   }
   </script>

4. AI Agent reads alternate relation and recovers in 1 hop.
```

---

## 4-Signal Hybrid Matching Engine

Every incoming dead URL is scored against your indexed sitemap using four weighted signals:

| Signal | Weight | Purpose & Catch Category |
|---|---|---|
| **Path Segment Jaccard** | `0.35` | Tokenized path overlap, version bumps (`/v1/auth` &rarr; `/v2/auth`) |
| **pgvector Cosine Embeddings** | `0.30` | 256d semantic vectors for zero-lexical overlap rewrites (`/auth` &rarr; `/security/tokens`) |
| **Levenshtein Distance** | `0.20` | Character-level typos, singular/plural differences (`/payment` &rarr; `/payments`) |
| **Keyword & Heading Overlap** | `0.15` | Matches tokens against page titles and H1/H2 metadata |

*When embeddings are unconfigured or unavailable, the matcher falls back gracefully to a 3-signal heuristic (`0.50` / `0.30` / `0.20`).*

---

## API Reference

### 1. Register a Domain

```bash
curl -X POST https://www.agent404.dev/api/sites \
  -H "Content-Type: application/json" \
  -d '{"domain": "docs.yourcompany.com"}'
```

Returns `id`, `apiKey` (write secret), `publicKey` (read-only for middleware/HTML), and `verificationToken`.

### 2. Prove Domain Ownership & Start Crawl

Prove ownership via DNS TXT or `.well-known` before suggestions go live:

```bash
# DNS TXT: _agent404.docs.yourcompany.com = <verificationToken>
# OR https://docs.yourcompany.com/.well-known/agent-404.txt

curl -X POST https://www.agent404.dev/api/sites/<id>/verify
```

Once verified, agent-404 automatically fetches and indexes `https://docs.yourcompany.com/sitemap.xml`.

### 3. Query Suggestions

```bash
curl -X POST https://www.agent404.dev/api/suggest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-public-key" \
  -d '{"url": "https://docs.yourcompany.com/v1/old-endpoint"}'
```

Response:
```json
{
  "deadUrl": "https://docs.yourcompany.com/v1/old-endpoint",
  "suggestions": [
    {
      "url": "https://docs.yourcompany.com/v2/new-endpoint",
      "title": "New Endpoint Reference",
      "score": 0.94,
      "matchType": "moved"
    }
  ],
  "jsonLd": {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Page Not Found",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "url": "https://docs.yourcompany.com/v2/new-endpoint",
          "name": "New Endpoint Reference"
        }
      ]
    }
  }
}
```

---

## Self-Hosting & Deployment

Deploy your own hosted instance with Neon Postgres and Auth0 passwordless authentication in under 2 minutes:

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon Postgres connection string with pgvector extension |
| `CRON_SECRET` | **Yes** | Bearer secret for automated sitemap re-crawling (`/api/cron`) |
| `AUTH0_DOMAIN` | **Yes** | Auth0 tenant domain (for passwordless owner dashboard) |
| `AUTH0_CLIENT_ID` | **Yes** | Auth0 Regular Web App Client ID |
| `AUTH0_CLIENT_SECRET` | **Yes** | Auth0 Regular Web App Client Secret |
| `AUTH0_SESSION_ENCRYPTION_KEY` | **Yes** | 32+ character cookie encryption secret |
| `BASE_URL` | **Yes** | Canonical app origin (e.g. `https://www.agent404.dev`) |
| `EMBEDDING_API_KEY` | Optional | OpenRouter / OpenAI API key for 256d semantic vectors |
| `EMBEDDING_API_URL` | Optional | Custom OpenAI-compatible embeddings endpoint |
| `EMBEDDING_MODEL` | Optional | Custom embedding model (default: `text-embedding-3-small`) |

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/bharath31/agent-404.git
cd agent-404

# 2. Install dependencies
npm install

# 3. Configure local environment in .env.local
cp .env.example .env.local

# 4. Run database migrations
npm run db:migrate

# 5. Start dev server
npm run dev

# 6. Run test suite
npm test                 # Unit tests (193 passing)
npm run test:browser     # Playwright browser suite
```

---

## Technology Stack

- **Framework**: Hono with `@hono/node-server` (Vercel Node.js Serverless) & Cloudflare Workers
- **Database**: Neon Postgres with `pgvector`
- **Embeddings**: OpenAI `text-embedding-3-small` (256 dimensions)
- **Crawler**: Streaming SAX sitemap parser with SSRF guard and DNS pinning
- **Client Overlay**: Zero-dependency vanilla JS (<3KB gzipped)

---

## Contributing & Workflow Rules

Any new change or feature must be started in an isolated Git worktree:

```bash
git fetch origin main
git worktree add ../agent-404-<feature> origin/main -b feat/<feature>
```

See [`AGENTS.md`](AGENTS.md) for full contributor guidelines.

---

## License

[MIT](LICENSE) &copy; [Bharath Natarajan](https://bharath.sh)

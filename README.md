# agent-404

<p align="center">
  <img src="public/banner.svg" alt="agent-404 — Self-Healing 404s for AI Agents & Crawlers" width="100%">
</p>

<p align="center">
  <a href="https://www.agent404.dev"><img src="https://img.shields.io/badge/hosted_service-agent404.dev-10b981?style=flat&logo=cloudflare&logoColor=white" alt="Hosted Service"></a>
  <a href="https://www.npmjs.com/package/@agent404/next"><img src="https://img.shields.io/npm/v/@agent404/next?color=blue&label=npm%20@agent404/next" alt="npm package"></a>
  <a href="https://github.com/bharath31/agent-404/actions"><img src="https://img.shields.io/github/actions/workflow/status/bharath31/agent-404/ci.yml?label=tests" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

**Self-healing 404 pages for AI coding assistants, search bots, and developers.**

When you restructure documentation or deprecate an API route, AI coding assistants (Cursor, Claude Code, GitHub Copilot) and AI search engines (ChatGPT Search, Perplexity) continue to request outdated URLs from their training datasets. Because these agents never run client-rendered JavaScript, standard 404 pages cause models to hallucinate broken code or drop citations.

**agent-404** intercepts requests at the HTTP middleware layer. It returns ranked destination routes in **RFC 5988 `Link: rel="alternate"` headers**, **`schema.org/ItemList` JSON-LD**, and **JSON payloads** so agents self-correct in one hop.

> 🚀 **Get Started in 60 Seconds on [agent404.dev](https://www.agent404.dev):**
> Free to start with zero infrastructure to manage. `agent404.dev` provides daily sitemap synchronization, vector embeddings, edge caching (<25ms), and live agent analytics out of the box.

---

## Why Use the Hosted Cloud on [agent404.dev](https://www.agent404.dev)?

While the core engine is open source, running 404 recovery in production requires continuous sitemap parsing, vector embedding pipelines, edge latency optimization, and agent telemetry.

| Feature | Hosted Cloud (`agent404.dev`) | Self-Hosted Instance |
|---|---|---|
| **Setup Time** | **&lt; 60 seconds** (copy 3 lines of middleware) | 45+ minutes (DB, Auth0, cron, keys) |
| **Sitemap Crawling** | **Daily sync &amp; edge index** | Manual cron triggers and SAX parser setup |
| **Vector Embeddings** | **Managed high-dimensional embeddings** | Requires OpenAI or OpenRouter API keys |
| **Database &amp; Infra** | **Zero database or vector store to manage** | Provision Neon Postgres + `pgvector` |
| **Edge Performance** | **Sub-25ms global edge suggestion cache** | Self-managed multi-region routing |
| **Agent Analytics** | **Live dashboard (Cursor, Claude, ChatGPT, Perplexity)** | Build custom telemetry logging |
| **Maintenance** | **Zero ops (automatic upgrades)** | Ongoing infrastructure and key maintenance |

---

## Quick Install (HTTP Layer)

AI coding agents and search indexers (Cursor, Claude Code, ChatGPT, Perplexity) do not execute client-side JavaScript. Intercepting at the HTTP layer ensures agents receive recovery metadata before the response body finishes.

### 1. Get your free public key

Register your domain at **[agent404.dev](https://www.agent404.dev)** to generate your read-only public key (`pk_...`).

### 2. Add 3 lines of middleware

#### Next.js (App Router & Pages)

```bash
npm install @agent404/next
```

```ts
// middleware.ts
import { agent404 } from "@agent404/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!, // pk_... from agent404.dev
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

#### Cloudflare Workers

```bash
npm install @agent404/cloudflare
```

```ts
// worker.ts
import { agent404Worker } from "@agent404/cloudflare";

export default agent404Worker({
  apiKey: "pk_your_public_key", // pk_... from agent404.dev
  origin: "https://docs.example.com",
});
```

#### Express / Node.js

```bash
npm install @agent404/express
```

```ts
// server.js
import { recoverExpress404 } from "@agent404/express";

app.use(async (req, res) => {
  const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {
    apiKey: process.env.AGENT404_PUBLIC_KEY, // pk_... from agent404.dev
  });
  res.status(404);
  recovered.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await recovered.text());
});
```

*Also available: [`@agent404/netlify`](https://www.npmjs.com/package/@agent404/netlify) for Netlify Edge Functions and nginx (`adapters/nginx.md`).*

---

## Zero-Config Script Tag (Browsers Only)

For human visitors and headless browser agents (e.g. Browser-Use, Playwright, MultiOn), add a single script tag:

```html
<script
  src="https://www.agent404.dev/agent-404.min.js"
  data-site-id="your-site-id"
  data-public-key="pk_your_public_key"
  defer
></script>
```

> **Security Note:** `data-public-key` is strictly read-only (`/api/suggest`). Never expose your secret write API key in HTML. Page indexing is handled automatically in the background via verified sitemap crawls.

---

## How It Works

```
1. Cursor / Claude Code requests moved endpoint:
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
| **pgvector Cosine Embeddings** | `0.30` | Semantic vector similarity for rewrites with no lexical overlap (`/auth` &rarr; `/security/tokens`) |
| **Levenshtein Distance** | `0.20` | Character-level typos, singular/plural differences (`/payment` &rarr; `/payments`) |
| **Keyword & Heading Overlap** | `0.15` | Matches tokens against indexed page titles and H1/H2 metadata |

---

## API Reference

The [agent404.dev](https://www.agent404.dev) API can also be queried directly from custom gateways, proxies, or CLI tooling.

### 1. Register a Domain

```bash
curl -X POST https://www.agent404.dev/api/sites \
  -H "Content-Type: application/json" \
  -d '{"domain": "docs.yourcompany.com"}'
```

Returns `id`, `apiKey` (write secret), `publicKey` (read-only for middleware/HTML), and `verificationToken`.

### 2. Verify Domain Ownership & Start Auto-Crawl

Prove domain ownership via DNS TXT or `.well-known` before suggestions go live:

```bash
# DNS TXT: _agent404.docs.yourcompany.com = <verificationToken>
# OR https://docs.yourcompany.com/.well-known/agent-404.txt

curl -X POST https://www.agent404.dev/api/sites/<id>/verify
```

Once verified, agent-404 automatically crawls and indexes `https://docs.yourcompany.com/sitemap.xml` and keeps embeddings refreshed.

### 3. Query Suggestions

```bash
curl -X POST https://www.agent404.dev/api/suggest \
  -H "Content-Type: application/json" \
  -H "x-api-key: pk_your_public_key" \
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

## Audit Your Documentation CLI

Scan your documentation for 404 risks and check AI agent readiness from your terminal:

```bash
npx agent-404 audit docs.yourcompany.com
```

Or view a live interactive report at **[agent404.dev/demo](https://www.agent404.dev/demo)**.

---

## Advanced: Self-Hosting & Enterprise Isolation

The core engine of agent-404 is open source under the MIT license. While 99% of teams use the zero-maintenance hosted service on [agent404.dev](https://www.agent404.dev), you can self-host the backend in air-gapped VPCs or compliance-restricted environments.

### Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon Postgres connection string with `pgvector` extension enabled |
| `CRON_SECRET` | **Yes** | Bearer secret for automated sitemap re-crawling (`/api/cron`) |
| `AUTH0_DOMAIN` | **Yes** | Auth0 tenant domain (for passwordless email dashboard) |
| `AUTH0_CLIENT_ID` | **Yes** | Auth0 Regular Web App Client ID |
| `AUTH0_CLIENT_SECRET` | **Yes** | Auth0 Regular Web App Client Secret |
| `AUTH0_SESSION_ENCRYPTION_KEY` | **Yes** | 32+ character cookie encryption secret |
| `BASE_URL` | **Yes** | Canonical app origin (e.g. `https://your-agent404.internal`) |
| `EMBEDDING_API_KEY` | Optional | OpenRouter / OpenAI API key for semantic vector embeddings |
| `EMBEDDING_API_URL` | Optional | Custom OpenAI-compatible embeddings endpoint |
| `EMBEDDING_MODEL` | Optional | Custom embedding model (default: `text-embedding-3-small`) |

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/bharath31/agent-404.git
cd agent-404

# 2. Install dependencies
npm install

# 3. Configure local environment
cp .env.example .env.local

# 4. Run database migrations
npm run db:migrate

# 5. Start dev server
npm run dev

# 6. Run test suite
npm test                 # Unit & integration tests (30 suites, 247 tests)
npm run test:browser     # Playwright browser suite
```

---

## Technology Stack

- **Framework**: Hono with `@hono/node-server` (Vercel Node.js Serverless) & Cloudflare Workers
- **Database**: Neon Postgres with `pgvector`
- **Embeddings**: High-dimensional semantic vectors (`text-embedding-3-small` / Cloudflare Workers AI)
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

# agent-404

<p align="center">
  <img src="public/banner.svg" alt="agent-404 — Agent-friendly 404 pages" width="100%">
</p>

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/bharath31/agent-404/ci.yml?label=tests)](https://github.com/bharath31/agent-404/actions)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbharath31%2Fagent-404&env=DATABASE_URL,EMBEDDING_API_KEY,CRON_SECRET&envDescription=DATABASE_URL%3A%20Neon%20Postgres%20connection%20string.%20EMBEDDING_API_KEY%3A%20For%20semantic%20embeddings%20(optional).%20CRON_SECRET%3A%20Bearer%20token%20for%20cron.&project-name=agent-404&repository-name=agent-404)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bharath31/agent-404)

Make your 404 pages agent-friendly. When AI agents and crawlers hit a dead link, they give up or hallucinate. **agent-404** returns structured suggestions of the next best pages — so agents recover gracefully.

One script tag. That's it.

```html
<script
  src="https://www.agent404.dev/agent-404.min.js"
  data-site-id="your-site-id"
  data-public-key="your-public-key"
  defer
></script>
```

The public key is **read-only** (`/api/suggest`). Keep the secret write key off the page — it is the only credential that can call `/api/register` and `/api/analyze`. **Indexing for new installs is sitemap-driven:** after you prove ownership, we crawl `sitemap.xml` (and re-crawl daily). The script tag with `data-public-key` only serves 404 suggestions; it does not beacon writes. Existing installs that still send `data-api-key` continue to work for suggestions (the old key is treated as the secret key). Browser requests that send a secret key plus an `Origin` header are rejected so the secret cannot be used from page HTML.

`Origin` on `/api/suggest` stops other sites' **browser** JavaScript from using your public key. Non-browser clients can set `Origin` freely — it is not a substitute for keeping the secret key off the page.

Use `https://www.agent404.dev` (not the apex). Apex 307-redirects break CORS preflight.

## How it works

1. **Index** — after domain verification, a sitemap crawl (and the daily cron) registers pages. Do not put the secret key in HTML.
2. **On 404 pages** — the script fetches ranked suggestions and injects them as:
   - A human-readable suggestion list
   - A `schema.org/ItemList` JSON-LD block that agents already understand

### 404 Detection

The script detects 404 pages using (in order):
- `data-404-selector` — CSS selector you provide (e.g. `".not-found"`)
- `<meta name="agent-404:status" content="404">` — meta tag
- Page title containing "404" or "not found"

### Ranking — 4 signals

Suggestions are ranked by a weighted combination of four signals:

| Signal | Weight | What it catches |
|---|---|---|
| **Path segment similarity** | 0.35 | Jaccard on URL segments, version-tolerant (`v2` → `v3` = partial match) |
| **Semantic embeddings** | 0.30 | Cosine similarity on 256d vectors — catches zero-lexical-overlap rewrites (e.g. `/docs/authentication` → `/guides/security/oauth`) |
| **Levenshtein distance** | 0.20 | Typos and minor path differences |
| **Keyword overlap** | 0.15 | Words from dead URL matched against page titles and headings |

Embeddings are generated via any OpenAI-compatible API (default: OpenRouter with `openai/text-embedding-3-small`). Set `EMBEDDING_API_KEY` to enable; if missing or the API is down, the system falls back to 3-signal matching with the original weights (0.50 / 0.30 / 0.20).

#### How embeddings work

- **On write** — when a page is registered (beacon or sitemap crawl), its URL path + title + description are embedded and stored as a `vector(256)` column in Postgres (pgvector)
- **On suggest** — the dead URL is embedded and used as a vector pre-filter (`ORDER BY embedding <=> query LIMIT 20`) to pull the top 20 candidates, which are then re-ranked with all 4 signals
- **Backfill** — the daily cron job generates embeddings for any pages that are missing them (in batches of 100)
- **Config** — `EMBEDDING_API_URL` and `EMBEDDING_MODEL` env vars let you point at any provider (OpenAI, Azure, local)

## Server-side mode

The script-tag approach needs a 404 page that renders HTML and executes JS. For surfaces where that doesn't apply — bare `nginx =404` responses, static-site 404s that ship no bundle, CDN-cached 404s, or JSON API paths — see [agent404-server](https://github.com/kormco/agent404-server) by [@kormco](https://github.com/kormco). Sibling project: webserver-layer interception, sitemap-driven index, agent-vs-human content negotiation.

## API

### Register a site

```bash
curl -X POST https://www.agent404.dev/api/sites \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

Returns `id`, `apiKey` (secret, server-side), `publicKey` (safe for HTML), and a `verificationToken`. The site **does not serve suggestions** until you prove domain ownership:

```bash
# DNS TXT _agent404.example.com = <verificationToken>
# or https://example.com/.well-known/agent-404.txt containing the token

curl -X POST https://www.agent404.dev/api/sites/<id>/verify
```

If someone else registered your domain, `POST /api/sites/reclaim` then `POST /api/sites/reclaim/complete` after proving ownership. **Unverified** (squatted-before-proof) domains complete immediately. **Already-verified** sites have a 24-hour cooling-off period and require `{ "confirm": true }` so a brief DNS hijack cannot silently rotate live keys. Rows that existed before this migration were grandfathered as verified — reclaim is the path for a real owner; this is not an automatic re-check.

Sitemap crawl runs after verification, not at create time.

### Beacon a page (secret key only)

```bash
curl -X POST https://www.agent404.dev/api/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{"url": "https://example.com/docs/auth", "title": "Auth Guide", "headings": ["OAuth", "API Keys"]}'
```

URLs whose host is not the registered domain (or a subdomain) are rejected.

### Get suggestions for a dead URL

```bash
curl -X POST https://www.agent404.dev/api/suggest \
  -H "Content-Type: application/json" \
  -H "Origin: https://example.com" \
  -H "x-api-key: your-public-key" \
  -d '{"url": "https://example.com/docs/v2/auth"}'
```

Response:
```json
{
  "deadUrl": "https://example.com/docs/v2/auth",
  "suggestions": [
    { "url": "https://example.com/docs/v3/auth", "title": "Authentication Guide", "score": 0.85, "matchType": "moved" }
  ],
  "jsonLd": { "@context": "https://schema.org", "@type": "WebPage", "..." : "..." }
}
```

## Self-hosting

### One-click deploy

**Vercel** (recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbharath31%2Fagent-404&env=DATABASE_URL,EMBEDDING_API_KEY,CRON_SECRET&envDescription=DATABASE_URL%3A%20Neon%20Postgres%20connection%20string.%20EMBEDDING_API_KEY%3A%20For%20semantic%20embeddings%20(optional).%20CRON_SECRET%3A%20Bearer%20token%20for%20cron.&project-name=agent-404&repository-name=agent-404)

**Cloudflare Workers**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bharath31/agent-404)

After deploying, set your secrets:
```bash
wrangler secret put DATABASE_URL
wrangler secret put CRON_SECRET
wrangler secret put EMBEDDING_API_KEY  # optional
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `CRON_SECRET` | Yes | Bearer token for the daily cron job |
| `EMBEDDING_API_KEY` | No | For semantic embeddings (~$0.02/1M tokens) |
| `EMBEDDING_API_URL` | No | Custom embedding API endpoint |
| `EMBEDDING_MODEL` | No | Custom embedding model name |

After deploying, run the migration:
```bash
npm run db:migrate
```

### Manual setup

```bash
# 1. Fork and clone the repo
git clone https://github.com/bharath31/agent-404.git
cd agent-404
npm install

# 2. Create a Neon database at neon.tech

# 3. Set environment variables
#    Create .env.local with:
#      DATABASE_URL=postgres://...
#      EMBEDDING_API_KEY=sk-...      (optional)
#      CRON_SECRET=your-secret

# 4. Run migrations
npm run db:migrate

# 5. Local dev
npm run dev           # Vercel
npm run dev:cf        # Cloudflare Workers

# 6. Build client script
npm run build:script

# 7. Deploy
npm run deploy        # Vercel
npm run deploy:cf     # Cloudflare Workers
```

## Stack

- **Runtime**: Vercel Edge Functions / Cloudflare Workers (Hono)
- **Database**: Neon Postgres + pgvector
- **Embeddings**: OpenAI `text-embedding-3-small` (256d)
- **Client**: Vanilla JS, <3KB
- **Indexing**: Sitemap.xml crawl + client-side beacons

## License

MIT

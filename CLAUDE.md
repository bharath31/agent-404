# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

agent-404 makes 404 pages agent-friendly. When AI agents/crawlers hit dead links, the service returns structured suggestions of the best matching pages so agents recover gracefully. Users add a single `<script>` tag to their site — on live pages it beacons metadata to build the index, on 404 pages it fetches and renders ranked suggestions.

## Commands

```bash
npm run dev              # Local dev via Vercel (recommended)
npm run dev:cf           # Local dev via Wrangler (Cloudflare Workers)
npm run build:script     # Build client script → public/agent-404.min.js
npm run db:migrate       # Run Postgres migrations (Neon)

npm test                 # Unit tests (vitest)
npm run test:watch       # Unit tests in watch mode
npm run test:e2e         # E2E tests (vitest, 30s timeout, needs running server + DB)
npm run test:browser     # Playwright browser tests (Chromium)

# Run a single test file
npx vitest run test/matcher.test.ts
```

## Architecture

**Dual deployment target**: The same Hono app runs on both Vercel Edge Functions and Cloudflare Workers.

- `src/index.ts` — Hono app with all routes, middleware, and cron handler. This is the central entry point.
- `api/index.ts` — Vercel adapter (wraps the Hono app via `hono/vercel`)
- `src/worker.ts` — Cloudflare Workers adapter (exports `fetch` + `scheduled` handler)

**API routes** (`src/api/routes/`):
- `sites.ts` — POST `/api/sites` to register a domain (returns siteId + apiKey)
- `register.ts` — POST `/api/register` to upsert a page (protected by x-api-key)
- `suggest.ts` — POST `/api/suggest` to get ranked suggestions for a dead URL

**Engine** (`src/engine/`):
- `matcher.ts` — Core ranking algorithm. 4-signal weighted scoring: path segment Jaccard (0.35), semantic embeddings (0.30), Levenshtein (0.20), keyword overlap (0.15). Falls back to 3-signal when embeddings unavailable.
- `embeddings.ts` — OpenAI-compatible embedding generation (default: OpenRouter)
- `sitemap.ts` — Sitemap.xml crawler for bulk page registration
- `indexer.ts` — Page staleness pruning

**Storage** (`src/storage/`):
- `interface.ts` — `StorageAdapter` interface
- `postgres.ts` — Neon Postgres implementation with pgvector for embeddings

**Client script**: `script/agent-404.ts` → built via esbuild to `public/agent-404.min.js`

**Cron** (daily at 3am UTC): Re-crawls sitemaps, prunes stale pages, backfills missing embeddings. Protected by `CRON_SECRET` bearer token. Triggered via `vercel.json` cron or Cloudflare `scheduled` event.

## Testing

Unit tests (`vitest.config.ts`) exclude `e2e.test.ts` and `browser.test.ts`. E2E tests have a separate config (`vitest.e2e.config.ts`) with 30s timeout and require a running server with database access. Browser tests use Playwright with Chromium.

## Code Style

- Biome for formatting and linting: tabs, 100 char line width, recommended rules
- TypeScript with `"module": "ESNext"`, `"moduleResolution": "bundler"`
- `.js` extensions in import paths (ESM)

## Environment Variables

Configured in `.env.local` (gitignored). Required: `DATABASE_URL`. Optional: `EMBEDDING_API_KEY`, `EMBEDDING_API_URL`, `EMBEDDING_MODEL`, `CRON_SECRET`.

## Roadmap

### Matcher improvements
- **Substring/prefix matching for path segments** — Currently "work" doesn't match "workers" because Jaccard requires exact token equality. Add partial-match scoring (e.g., if one segment is a prefix of another with min length 3, count as a 0.7 match instead of 0). This would fix cases like `developers.cloudflare.com/work/` → `/workers/`.
- **Stemming or fuzzy token matching** — "message" doesn't match "messaging" at the token level. A lightweight stemmer or edit-distance-based token similarity (e.g., tokens within Levenshtein distance 2 count as partial matches) would improve recall for typo-like dead URLs.

# agent-404

Make your 404 pages agent-friendly. When AI agents and crawlers hit a dead link, they give up or hallucinate. **agent-404** returns structured suggestions of the next best pages — so agents recover gracefully.

One script tag. That's it.

```html
<script src="https://agent404.dev/agent-404.min.js"
  data-site-id="your-site-id"
  data-api-key="your-api-key"
  defer></script>
```

## How it works

1. **On live pages** — the script beacons page metadata (URL, title, headings) to build your site index
2. **On 404 pages** — the script fetches ranked suggestions and injects them as:
   - A human-readable suggestion list
   - A `schema.org/ItemList` JSON-LD block that agents already understand

### 404 Detection

The script detects 404 pages using (in order):
- `data-404-selector` — CSS selector you provide (e.g. `".not-found"`)
- `<meta name="agent-404:status" content="404">` — meta tag
- Page title containing "404" or "not found"

### Fuzzy Matching

Suggestions are ranked using three signals:
- **Path segment similarity** — Jaccard similarity on URL segments, version-tolerant (`v2` → `v3` = partial match)
- **Levenshtein distance** — catches typos and minor path differences
- **Keyword overlap** — matches words from the dead URL against page titles and headings

## API

### Register a site

```bash
curl -X POST https://agent404.dev/api/sites \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

Returns `siteId` and `apiKey`. The sitemap is crawled automatically on registration.

### Beacon a page (client script does this automatically)

```bash
curl -X POST https://agent404.dev/api/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"url": "https://example.com/docs/auth", "title": "Auth Guide", "headings": ["OAuth", "API Keys"]}'
```

### Get suggestions for a dead URL

```bash
curl -X POST https://agent404.dev/api/suggest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
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

```bash
npm install

# Set up Vercel Postgres
# 1. Create a Postgres database in Vercel Dashboard → Storage
# 2. Link it to your project
# 3. Pull env vars:
vercel env pull .env.local

# Run migration
npm run db:migrate

# Local dev
npm run dev

# Build client script
npm run build:script

# Deploy
vercel --prod

# Tests
npm test
```

## Stack

- **Runtime**: Vercel Edge Functions (Hono)
- **Database**: Vercel Postgres (Neon)
- **Client**: Vanilla JS, <3KB
- **Indexing**: Sitemap.xml crawl + client-side beacons

## License

MIT

# Cloudflare Worker 404 Recovery Proxy

A standalone Cloudflare Worker reverse proxy that intercepts 404 responses from your origin server and enriches them with [agent-404](https://www.agent404.dev) recovery suggestions (`Link: rel="alternate"` headers and `schema.org` JSON-LD).

## Setup

1. Register your documentation domain at **[agent404.dev](https://www.agent404.dev)** to get your public API key (`pk_...`).
2. Configure your `wrangler.toml`:
   ```toml
   name = "my-site-404-proxy"
   main = "src/index.ts"
   compatibility_date = "2024-12-01"

   [vars]
   ORIGIN_URL = "https://docs.yourcompany.com"
   AGENT404_API_KEY = "pk_your_public_key"
   ```
3. Deploy to Cloudflare Workers:
   ```bash
   npx wrangler deploy
   ```

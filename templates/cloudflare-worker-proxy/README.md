# Cloudflare Worker 404 Recovery Proxy

A standalone Cloudflare Worker that intercepts 404 responses from your origin server and enriches them with Agent 404 recovery suggestions.

## 1-Click Deploy

1. Clone or copy this directory.
2. Set your configuration in `wrangler.toml`:
   ```toml
   name = "my-site-404-proxy"
   main = "src/index.ts"
   compatibility_date = "2024-12-01"

   [vars]
   AGENT404_PUBLIC_KEY = "pk_your_public_key_here"
   ORIGIN_URL = "https://docs.example.com"
   ```
3. Deploy to Cloudflare Workers:
   ```bash
   npx wrangler deploy
   ```

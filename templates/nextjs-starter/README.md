# Next.js 404 Recovery Middleware

Add Agent 404 HTTP-layer suggestions to your Next.js application.

## Quick Setup

1. Copy `middleware.ts` into your Next.js project root (or `src/`).
2. Add your public key to `.env.local`:
   ```env
   NEXT_PUBLIC_AGENT404_KEY=pk_your_public_key_here
   ```
3. When agents or crawlers hit a 404 URL on your site, they receive structured JSON-LD and `Link: rel="alternate"` recovery headers automatically.

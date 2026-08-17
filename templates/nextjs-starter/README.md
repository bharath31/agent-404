# Next.js 404 Recovery Middleware

Add Agent 404 HTTP-layer suggestions to your Next.js application powered by [agent404.dev](https://www.agent404.dev).

## Quick Setup

1. Register your domain at **[agent404.dev](https://www.agent404.dev)** to obtain your read-only public key (`pk_...`).
2. Copy `middleware.ts` into your Next.js project root (or `src/`).
3. Add your public key to `.env.local`:
   ```env
   NEXT_PUBLIC_AGENT404_KEY=pk_your_public_key_here
   ```
4. When agents, bots, or users hit a 404 URL on your site, they receive structured JSON-LD and `Link: rel="alternate"` recovery headers automatically.


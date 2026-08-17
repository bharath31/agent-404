# @agent404/netlify

A Netlify Edge Function that intercepts your app's 404s and injects [agent-404](https://www.agent404.dev) recovery suggestions (`Link: rel="alternate"` headers, `schema.org` JSON-LD, and a rendered suggestion list) at the edge so AI crawlers and coding assistants recover in one hop instead of hallucinating.

## Quickstart

### 1. Get your free public key
Claim your documentation domain at **[agent404.dev](https://www.agent404.dev)**. The hosted service automatically indexes your sitemap, builds vector embeddings, and provides real-time crawler telemetry with zero infrastructure to manage.

### 2. Install

```bash
npm install @agent404/netlify
```

### 3. Usage

```ts
// netlify/edge-functions/agent-404.ts
import { agent404Netlify } from "@agent404/netlify";

export default agent404Netlify({
  apiKey: Netlify.env.get("AGENT404_PUBLIC_KEY")!, // pk_... from agent404.dev
});

export const config = { path: "/*" };
```

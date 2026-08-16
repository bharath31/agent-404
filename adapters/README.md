# Agent 404 Adapters & Middleware

This directory contains client-side and HTTP-layer integration adapters for customer web applications to integrate with the Agent 404 suggestion service.

## Available Adapters

### 1. Cloudflare Workers (`adapters/cloudflare.ts`)
Run 404 recovery as an edge reverse proxy in front of any documentation or marketing site.
```ts
import { agent404Worker } from "./adapters/cloudflare.js";

export default agent404Worker({
  apiKey: "pk_your_public_key",
  origin: "https://docs.example.com",
});
```

### 2. Next.js (`adapters/next.ts`)
Middleware for Next.js App Router and Pages Router.
```ts
import { agent404Next } from "./adapters/next.js";

export const middleware = agent404Next({
  apiKey: process.env.NEXT_PUBLIC_AGENT404_KEY!,
});
```

### 3. Express (`adapters/express.ts`)
Node.js Express middleware for server-rendered 404 recovery.
```ts
import { agent404Express } from "./adapters/express.js";

app.use(agent404Express({ apiKey: process.env.AGENT404_KEY! }));
```

### 4. Netlify Edge (`adapters/netlify.ts`)
Netlify Edge middleware for edge 404 interception.
```ts
import { agent404Netlify } from "./adapters/netlify.js";

export default agent404Netlify({ apiKey: Netlify.env.get("AGENT404_KEY")! });
```

## Standalone Starter Templates
For 1-click deployment starters, see the `templates/` directory:
- `templates/cloudflare-worker-proxy/` — Ready-to-deploy standalone Cloudflare Worker reverse proxy
- `templates/nextjs-starter/` — Standalone Next.js middleware starter

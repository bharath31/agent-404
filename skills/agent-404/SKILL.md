---
name: agent-404
description: >
  Install, configure, audit, and troubleshoot agent-404 self-healing 404 middleware,
  Link headers, and semantic recovery across Next.js, Cloudflare Workers, Express,
  and HTML script tags. Use whenever setting up 404 recovery for AI agents (Cursor,
  Claude Code, ChatGPT, Perplexity) or fixing dead link resilience on any website.
license: MIT
metadata:
  author: agent-404 <support@agent404.dev>
  version: 1.0.0
---

# Agent 404 Integration & Verification Guide

Agent 404 (https://www.agent404.dev) provides HTTP-layer semantic 404 recovery for web applications. When an AI agent (Cursor, Claude Code, ChatGPT, Perplexity) or human user hits a broken, moved, or outdated URL, agent-404 resolves the path against indexed sitemap embeddings and returns RFC 8288 `Link: <target>; rel="alternate"` headers alongside structured JSON-LD recovery payloads.

---

## 1. Quick Reference & Credentials

Every indexed site requires two identifiers:
- **Site ID (`siteId`):** UUID identifying the domain's vector index (e.g. `a46ae835-f410-40be-beea-225479f3ad94`).
- **Public Key (`publicKey`):** Safe public read/beacon key (starts with `pk_`). Safe to commit or expose in client headers.

> Adapter configs take only `apiKey` (the `pk_` key value). `siteId` is used by the dashboard, the HTML script tag (`data-site-id`), and the verification flow — it is **not** a key in any adapter's config object.
- **Canonical API Base:** Always `https://www.agent404.dev` (never apex `agent404.dev` to avoid 308 redirects breaking CORS preflight).

```env
# .env or .env.local
AGENT404_PUBLIC_KEY="pk_..."
AGENT404_SITE_ID="site-uuid-..."
```

---

## 2. Framework Integration Recipes

### Next.js (App Router & Pages Router)

1. **Install adapter:**
   ```bash
   npm install @agent404/next
   # or: pnpm add @agent404/next | yarn add @agent404/next | bun add @agent404/next
   ```

2. **Add Edge/Node Middleware (`middleware.ts` in project root or `src/middleware.ts`):**
   ```typescript
   import { agent404 } from "@agent404/next";

   export const middleware = agent404({
     apiKey: process.env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
   });

   export const config = {
     // Intercept all routes except internal Next.js assets, static files, and APIs
     matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
   };
   ```

3. **Optional App Router Custom 404 UI (`app/not-found.tsx`):**
   ```tsx
   import { headers } from "next/headers";
   import { notFoundSuggestions } from "@agent404/next";

   export default async function NotFound() {
     const h = await headers();
     const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
     const proto = h.get("x-forwarded-proto") || "https";
     const path = h.get("x-matched-path") || h.get("x-invoke-path") || "/";
     const request = new Request(`${proto}://${host}${path}`);

     const suggestions = await notFoundSuggestions(request, {
       apiKey: process.env.AGENT404_PUBLIC_KEY!,
     });

     return (
       <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
         <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
         {suggestions.length > 0 ? (
           <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-lg p-6">
             <p className="text-sm text-slate-400 mb-3">Did you mean to visit one of these?</p>
             <ul className="space-y-2 text-left">
               {suggestions.map((s) => (
                 <li key={s.url}>
                   <a href={s.url} className="text-blue-400 hover:underline flex justify-between">
                     <span>{s.title || s.url}</span>
                     <span className="text-xs text-slate-500 font-mono">{Math.round((s.score || 0) * 100)}% match</span>
                   </a>
                 </li>
               ))}
             </ul>
           </div>
         ) : (
           <p className="text-slate-400">The requested page could not be found.</p>
         )}
       </main>
     );
   }
   ```

---

### Cloudflare Workers

1. **Install adapter:**
   ```bash
   npm install @agent404/cloudflare
   ```

2. **Add Worker Handler (`worker.ts` or `src/index.ts`):**
   ```typescript
   import { agent404Worker } from "@agent404/cloudflare";

   export default agent404Worker({
     apiKey: "pk_YOUR_PUBLIC_KEY",
   });
   ```

   `agent404Worker(config)` is a **factory**: it takes a `RecoveryConfig` (`apiKey`, optional `apiBase` / `origin` / `timeoutMs`) plus `fetchOrigin` / `probeTimeoutMs`, and returns a `{ fetch }` handler — never call it with a `Request` or per-request config. Only `apiKey` (the `pk_` key) is required; `siteId` is a dashboard identifier and is not read by the adapter.

3. **Cloudflare Pages (`_worker.js` advanced mode) — use the `ASSETS` binding:**
   ```javascript
   import { agent404Worker } from "@agent404/cloudflare";

   export default {
     async fetch(request, env, ctx) {
       return agent404Worker({
         apiKey: env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
         // Required on Pages: a self-fetch re-enters the same Pages function,
         // and the probe passthrough keeps the probe header, so the request
         // recurses until Cloudflare kills it with error 1019.
         fetchOrigin: (req) => env.ASSETS.fetch(req),
       }).fetch(request, env, ctx);
     },
   };
   ```

   The default `fetchOrigin` (global `fetch`) is only safe when the probe URL is served without re-entering the Worker: a route-based Worker on the same zone as its origin (same-zone subrequests bypass the Worker), or a Worker proxying a different host. On Pages, always set `fetchOrigin` to `env.ASSETS.fetch`.

---

### Netlify Edge Functions

1. **Install adapter:**
   ```bash
   npm install @agent404/netlify
   ```

2. **Add Edge Function (`netlify/edge-functions/agent-404.ts`):**
   ```typescript
   import { agent404Netlify } from "@agent404/netlify";

   export default agent404Netlify({
     apiKey: Netlify.env.get("AGENT404_PUBLIC_KEY") || "pk_YOUR_PUBLIC_KEY",
   });

   export const config = { path: "/*" };
   ```

---

### Express / Node.js HTTP

1. **Install adapter:**
   ```bash
   npm install @agent404/express
   ```

2. **Add Express 404 Handler (`server.js` or `app.ts`):**
   ```javascript
   import express from "express";
   import { recoverExpress404 } from "@agent404/express";

   const app = express();

   // Your standard routes...

   // Last: 404 handler with agent-404 recovery
   app.use(async (req, res) => {
     const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {
       apiKey: process.env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
     });
     res.status(404);
     recovered.headers.forEach((v, k) => res.setHeader(k, v));
     res.send(await recovered.text());
   });
   ```

   The adapter exports `recoverExpress404(req, bodyHtml, config)` for use inside your own 404 handler — there is no middleware factory. Only `apiKey` is required.

---

### HTML Script Tag (Client-Side Beacon & Recovery)

For static sites, documentation portals (Docusaurus, VitePress, Hugo, Astro, MkDocs), add this snippet into the `<head>` or before `</body>`:

```html
<script
  src="https://www.agent404.dev/agent404.js"
  data-site-id="YOUR_SITE_ID"
  data-public-key="pk_YOUR_PUBLIC_KEY"
  defer
></script>
```

---

## 3. Verification & Diagnostic Commands

### 1. Test 404 Link Header Resolution Locally
```bash
# Request a dead URL and inspect Link headers
curl -I http://localhost:3000/docs/v1/deprecated-auth

# Expected response:
# HTTP/1.1 404 Not Found
# Link: </docs/v2/authentication>; rel="alternate"
# X-Agent404-Match: similar
# X-Agent404-Score: 0.94
```

### 2. Check Site Indexing & Beacon Status
```bash
curl "https://www.agent404.dev/api/install/status?domain=yourdomain.com&apiKey=pk_YOUR_PUBLIC_KEY"
```

### 3. Run the CLI Audit
```bash
npx agent-404 audit yourdomain.com
```

---

## 4. Troubleshooting & Edge Cases

| Issue | Cause | Fix |
|---|---|---|
| **CORS Preflight Failure** | Requesting apex `https://agent404.dev` which triggers 308 redirect | Use canonical `https://www.agent404.dev` |
| **Awaiting Beacons Warning** | Zero page views or index beacons received yet | Open a live page in browser or run curl with the script tag |
| **High Latency on Static Files** | Matcher not excluding `_next/static`, images, fonts | Update middleware `matcher` regex to filter out static extensions |
| **Recursive Fetch Loop (Next.js)** | Edge Middleware re-runs on `fetch()` to the same host, so a probe self-fetch is intercepted again | Built-in adapter sends the `x-agent-404: probe` header, which middleware passes through without recovering — loops are broken by the header, no action needed |
| **Worker Exception / HTTP 500 (Cloudflare Pages)** | Calling `agent404Worker` per-request with a `Request` instead of using the factory (`agent404Worker(config)` returns `{ fetch }`) | Use the recipe in section 2 — the factory takes the config object and returns a handler to return from `fetch()` |
| **Worker Exception / error 1019 (Cloudflare Pages)** | Probe self-fetch re-enters the same Pages function; the passthrough keeps the probe header, so the request recurses until Cloudflare aborts it | Pass `fetchOrigin: (req) => env.ASSETS.fetch(req)` so probes terminate at the static asset store (see section 2) |

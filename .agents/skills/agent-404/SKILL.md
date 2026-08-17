---
name: agent-404
description: >
  Install, configure, audit, and troubleshoot agent-404 self-healing 404 middleware,
  Link headers, and semantic recovery across Next.js, Cloudflare Workers, Express,
  and HTML script tags. Use whenever setting up 404 recovery for AI agents (ClaudeBot,
  GPTBot, Perplexity) or fixing dead link resilience on any website.
license: MIT
metadata:
  author: agent-404 <support@agent404.dev>
  version: 1.0.0
---

# Agent 404 Integration & Verification Guide

Agent 404 (https://www.agent404.dev) provides HTTP-layer semantic 404 recovery for web applications. When an AI crawler (ClaudeBot, GPTBot, Perplexity) or human user hits a broken, moved, or outdated URL, agent-404 resolves the path against indexed sitemap embeddings and returns RFC 8288 `Link: <target>; rel="alternate"` headers alongside structured JSON-LD recovery payloads.

---

## 1. Quick Reference & Credentials

Every indexed site requires two identifiers:
- **Site ID (`siteId`):** UUID identifying the domain's vector index (e.g. `a46ae835-f410-40be-beea-225479f3ad94`).
- **Public Key (`publicKey`):** Safe public read/beacon key (starts with `pk_`). Safe to commit or expose in client headers.
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
   npm install @agent-404/next
   # or: pnpm add @agent-404/next | yarn add @agent-404/next | bun add @agent-404/next
   ```

2. **Add Edge/Node Middleware (`middleware.ts` in project root or `src/middleware.ts`):**
   ```typescript
   import { agent404 } from "@agent-404/next";

   export const middleware = agent404({
     apiKey: process.env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
     siteId: process.env.AGENT404_SITE_ID || "YOUR_SITE_ID",
   });

   export const config = {
     // Intercept all routes except internal Next.js assets, static files, and APIs
     matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
   };
   ```

3. **Optional App Router Custom 404 UI (`app/not-found.tsx`):**
   ```tsx
   import { headers } from "next/headers";
   import { notFoundSuggestions } from "@agent-404/next";

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
   npm install @agent-404/cloudflare
   ```

2. **Add Worker Handler (`worker.ts` or `src/index.ts`):**
   ```typescript
   import { agent404Worker } from "@agent-404/cloudflare";

   export default {
     async fetch(req: Request, env: { AGENT404_PUBLIC_KEY?: string; AGENT404_SITE_ID?: string }, ctx: unknown): Promise<Response> {
       return agent404Worker(req, env, {
         publicKey: env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
         siteId: env.AGENT404_SITE_ID || "YOUR_SITE_ID",
       });
     },
   };
   ```

---

### Express / Node.js HTTP

1. **Install adapter:**
   ```bash
   npm install @agent-404/express
   ```

2. **Add Express Middleware (`server.js` or `app.ts`):**
   ```javascript
   import express from "express";
   import { agent404Express } from "@agent-404/express";

   const app = express();

   // Attach agent404 middleware
   app.use(agent404Express({
     publicKey: process.env.AGENT404_PUBLIC_KEY || "pk_YOUR_PUBLIC_KEY",
     siteId: process.env.AGENT404_SITE_ID || "YOUR_SITE_ID",
   }));

   // Your standard routes...
   ```

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
| **Recursive Fetch Loop** | Middleware probing itself on downstream requests | Use built-in adapter which automatically sends `x-agent-404: probe` header to bypass loops |

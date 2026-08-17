# Product Marketing Context

*Last updated: March 2025*

## Product Overview
**One-liner:** Autonomous HTTP-layer 404 recovery that prevents AI agents, coding assistants, and search engines from hallucinating on dead documentation links.
**What it does:** agent-404 sits at your application's edge middleware. When an AI assistant (Cursor, Claude Code, ChatGPT, Perplexity) or developer hits a moved or deprecated route, agent-404 matches the dead path against your indexed sitemap using 4-signal hybrid vector search (<25ms) and returns RFC 5988 `Link: rel="alternate"` headers and `schema.org/ItemList` JSON-LD so models recover in a single hop.
**Product category:** AI Search & Agent Readiness Infrastructure (GEO / AI SEO / Developer Experience)
**Product type:** Hosted Edge Developer SaaS + Open Source Edge Adapters
**Business model:** Freemium hosted SaaS on `agent404.dev` (generous free tier for open source & growing docs; team/enterprise tiers for high volume, custom crawl intervals, SLA, and SSO) with an open-source core engine for air-gapped enterprise compliance.

## Target Audience
**Target companies:** Developer tool companies, API providers, SaaS platforms, open-source libraries, technical documentation portals, and content-heavy tech sites.
**Decision-makers:** Head of Developer Relations (DevRel), Technical SEO Leads, VP of Engineering, Lead Docs Engineers, Tech Leads, and Full-Stack Architects.
**Primary use case:** Preventing AI coding agents (Claude Code, Cursor, Copilot) and AI answer engines (Perplexity, ChatGPT Search) from failing or hallucinating outdated code when technical documentation URLs change or are restructured.
**Jobs to be done:**
- "Make sure developers using Cursor and Claude Code never hit dead docs links and hallucinate deprecated APIs."
- "Preserve our SEO authority and AI search visibility (GEO) through documentation restructures and major version bumps."
- "Get full visibility into which AI assistants and bots request dead URLs on our domain."
**Use cases:**
- **Major Doc Migrations / Replatforming:** Migrating from Docusaurus / GitBook / Mintlify / custom Next.js without creating hundreds of manual redirect rules.
- **API Version Upgrades (v1 &rarr; v2):** Seamlessly routing agents requesting deprecated endpoints to new canonical reference docs.
- **Continuous AI Discovery:** Ensuring headless bots that don't execute client-side JavaScript receive machine-readable alternate routes in HTTP headers.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **DevRel / Docs Lead** | Developer satisfaction, accurate agent completions in Cursor/Claude | Docs change faster than LLM pre-training cutoff dates; agents hallucinate old APIs | Automated dead-link recovery with zero manual redirect spreadsheet maintenance |
| **Technical SEO / Growth Lead** | AI Overview citations, Perplexity answers, organic traffic retention | Search bots bounce on 404s; LLM citation indexers drop broken links | RFC 5988 Link headers and schema.org JSON-LD keep bots indexing the right pages |
| **Full-Stack / Platform Engineer** | Edge performance, zero maintenance, reliability | Avoids running or maintaining another pgvector database, cron crawler, or Auth0 setup | 3-line drop-in adapter (`@agent404/next`, `@agent404/cloudflare`); `agent404.dev` manages crawling, embeddings, and telemetry |

## Problems & Pain Points
**Core problem:** AI coding assistants (Claude Code, Cursor, GitHub Copilot) have old URLs hardcoded in their weights and training datasets. When you move `/docs/v1/auth` to `/docs/v2/authentication`, agents hit a 404. Because crawlers do not execute client-side JavaScript, they receive an empty 404 HTML shell, conclude the feature no longer exists, and hallucinate broken code.
**Why alternatives fall short:**
- *Manual 301 Redirect Rules:* Static redirect files (e.g. `next.config.js`) grow into thousands of unmaintainable lines and miss unexpected permutations or long-tail typos.
- *Client-Side Fuzzy 404 Pages:* Rely on browser React/Vue execution. Non-browser crawlers and RAG indexers never run JavaScript and only see a blank 404.
- *Self-Hosting Vector Pipelines:* Requires provisioning Postgres + pgvector, paying embedding API costs, building streaming sitemap scrapers, configuring cron jobs, setting up Auth0/OIDC, and managing multi-region latency.
**What it costs them:** Lost developers, frustrated users blaming the API, degraded GEO/SEO rankings, and countless engineering hours manually updating redirects.
**Emotional tension:** Fear of silent AI traffic drops, embarrassment when LLMs give developers incorrect instructions for their product, frustration with fragile manual redirect files.

## Competitive Landscape
**Direct:** None with native RFC 5988 HTTP Link header + JSON-LD agent recovery specifically designed for AI agents.
**Secondary:**
- *Cloudflare Page Rules / Redirect Workers:* Falls short because it requires manual rule creation for every URL change.
- *Algolia / Search Middleware:* Heavy, expensive, client-side focused, not optimized for HTTP-layer agent recovery headers.
- *Self-Hosting agent-404:* Fully functional, but introduces operational overhead (Neon/pgvector, Auth0, embedding keys, cron scheduling) compared to the zero-maintenance hosted service on `agent404.dev`.
**Indirect:** Status quo (standard 404 error pages, 404-to-homepage catchalls that destroy SEO).

## Differentiation
**Key differentiators:**
- **RFC 5988 `Link` Alternate Headers & `schema.org` JSON-LD at HTTP Layer:** Intercepts before response body transmission so non-JS AI bots recover in 1 hop.
- **Hosted Zero-Maintenance Cloud (`agent404.dev`):** Instant setup with free public key; automated daily sitemap sync, 768d vector embeddings, and live bot telemetry with zero database setup.
- **4-Signal Hybrid Matching Engine:** Combines Path Jaccard (35%), pgvector Cosine similarity (30%), Levenshtein distance (20%), and Title/Heading overlap (15%) for unmatched recovery accuracy.
- **Ultra-Low Edge Latency (<25ms):** Edge cached suggestion engine optimized for high-throughput documentation traffic.
- **Actionable AI Bot Analytics:** Real-time dashboard showing which dead URLs Cursor, Claude Code, ChatGPT, and Perplexity hit.

**How we do it differently:** Rather than asking developers to maintain complex vector databases or static redirect maps, `agent404.dev` continuously syncs documentation sitemaps in the cloud and provides lightweight edge adapters that resolve dead links in milliseconds.
**Why that's better:** Zero infrastructure overhead, zero maintenance, instant deployment in under 60 seconds.
**Why customers choose us:** Works automatically on every docs deployment, requires 3 lines of code, and turns 404 dead-ends into successful agent workflows.

## Objections
| Objection | Response |
|-----------|----------|
| *"Why not just self-host since it's open source?"* | "Self-hosting is great if you have air-gapped compliance needs, but `agent404.dev` gives you automated daily sitemap syncing, continuous vector embedding generation, edge caching, and a real-time bot analytics dashboard with zero database or cron maintenance (free to start in 60 seconds)." |
| *"Will this slow down my website?"* | "No. Middleware only runs when an endpoint returns 404 (valid pages pass through unaffected). 404 suggestions resolve in <25ms from global edge caches." |
| *"Does this expose my internal sitemap or private URLs?"* | "No. Only public pages listed in your verified sitemap are indexed. The middleware uses a strictly read-only public key (`pk_...`)." |
| *"Do we really need HTTP headers if we have a nice 404 page?"* | "AI assistants and search crawlers like Cursor, Claude Code, and Perplexity do not execute client-side JavaScript. Without HTTP Link headers or machine-readable JSON-LD, bots see an empty page and hallucinate." |

**Anti-persona:** Pure intranet applications with zero public documentation or sites without sitemaps.

## Switching Dynamics
**Push:** Tired of broken agent recommendations in Cursor, angry users complaining about 404s in docs, and maintaining messy redirect spreadsheets.
**Pull:** Effortless 60-second setup on `agent404.dev`, automated daily sitemap & vector index sync, instant single-hop AI recovery, beautiful live crawler analytics.
**Habit:** Doing nothing or adding manual redirects one-by-one in `next.config.js` or `_redirects`.
**Anxiety:** "Is another cloud dependency going to be slow or hard to configure?" (Mitigated by: 3-line SDK, <25ms edge latency, read-only public key, open-source core engine).

## Customer Language
**How they describe the problem:**
- "Cursor keeps suggesting deprecated API methods because the old docs URL 404s."
- "Claude Code is reading our old v1 docs structure and failing."
- "We changed our docs structure and our redirect list is thousands of lines long."
- "When an AI searches our docs, it gives up on a 404 instead of finding the new page."
**How they describe us:**
- "Like a self-healing autopilot for our documentation URLs."
- "3 lines of middleware and our 404s are solved for AI agents."
- "The missing link header middleware for LLMs."
**Words to use:**
- Zero-maintenance, hosted edge network, automated sitemap sync, 4-signal hybrid matching, RFC 5988 Link headers, 1-hop recovery, AI coding assistants, agent readiness.
**Words to avoid:**
- "Heavy vector infrastructure required", "Complex deployment pipeline", "Mandatory self-hosting", "Manual redirect configuration".
**Glossary:**
| Term | Meaning |
|------|---------|
| RFC 5988 / 8288 | Web Linking standard for returning alternate resource relations in HTTP headers. |
| Hybrid Matcher | Matching engine combining lexical (Jaccard, Levenshtein, Keywords) and semantic (pgvector embeddings) signals. |
| AI Agent | Assistants and crawlers like Cursor, Claude Code, GitHub Copilot, ChatGPT Search, and Perplexity that query web resources. |
| Read-Only Public Key (`pk_...`) | Safe client-side API key used only for querying suggestions, preventing secret leaks in HTML/middleware. |

## Brand Voice
**Tone:** Confident, developer-native, pragmatic, high-signal, modern.
**Style:** Direct, code-first, minimal fluff, precise technical explanations with concrete examples.
**Personality:** Fast, reliable, intelligent, frictionless.

## Proof Points
**Metrics:**
- <25ms average edge suggestion resolution
- 4-signal hybrid matching precision across token, semantic, and structural changes
- 60-second time to install across Next.js, Cloudflare Workers, Express, and Netlify
- Zero client-side JS dependency required for AI bot recovery
**Value themes:**
| Theme | Proof |
|-------|-------|
| Instant Hosted Convenience | Claim domain, copy 3 lines of middleware, verified in 60 seconds with automated background sitemap sync. |
| Single-Hop AI Recovery | RFC 5988 Link headers + schema.org JSON-LD instruct AI assistants to switch routes without hallucinating. |
| Full Agent Observability | Real-time dashboard tracks Cursor, Claude, ChatGPT, and Perplexity recovery hits. |

## Goals
**Business goal:** Maximize adoption of the managed service on `agent404.dev` by positioning it as the frictionless, zero-maintenance default for developers and engineering teams.
**Conversion action:** Sign in at `agent404.dev` / claim a domain & install the 3-line middleware adapter (`@agent404/next`, `@agent404/cloudflare`, etc.).

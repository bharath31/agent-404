# RFC: Autonomous Agent 404 Recovery Protocol (Agent-404)

**Status:** Proposed Standard  
**Category:** Web Standards / AI Agent Conventions  
**Authors:** Agent-404 Working Group  
**Version:** 1.0.0  

---

## 1. Abstract

When autonomous AI agents, crawlers (such as ClaudeBot, GPTBot, PerplexityBot), and LLM tool runners encounter dead links, standard HTTP 404 responses provide no machine-readable hints to recover. This causes autonomous workflows to fail or hallucinate alternative URLs.

This specification standardizes **Agent 404 Recovery**: an HTTP-layer response convention that enables non-rendering crawlers, LLMs, and browser agents to discover canonical alternatives and recover gracefully in a single round-trip without human intervention.

---

## 2. Status Code & Transport Semantics

### 2.1 Preserving HTTP 404
* A server implementing this protocol **MUST** return an **HTTP 404 Not Found** status code.
* Servers **MUST NOT** return HTTP 200 (soft-404) or redirect to a generic home page, as doing so pollutes crawler search indexes and prevents autonomous agents from detecting resource relocation.

### 2.2 Cache Control & Content Negotiation
* Servers **SHOULD** include `Vary: Accept, Origin` to ensure HTTP edge caches distinguish between HTML, JSON, and preflighted requests.
* For static CDN edge delivery, servers **MAY** set `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60`.

---

## 3. Header-Layer Recovery (`Link` Headers)

For lightweight, non-rendering HTTP clients and header-only parsers (e.g. `curl -I`, Python `requests.head()`, fast scrapers), recovery suggestions **MUST** be emitted via standard RFC 8288 `Link` headers:

```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
Link: <https://docs.example.com/v3/auth>; rel="alternate"; title="Authentication Guide", <https://docs.example.com/v3/overview>; rel="alternate"; title="Overview"
Vary: Accept, Origin
```

* Each suggested URL **MUST** use `rel="alternate"`.
* The `title` parameter **SHOULD** provide human-readable and agent-interpretable text.
* Suggested links **MUST** be ordered by descending relevance score.

---

## 4. Body-Layer Recovery (Schema.org JSON-LD & JSON Negotiation)

### 4.1 Content Negotiation (`Accept: application/json`)
When an agent sends `Accept: application/json`, the server **MUST** return a structured JSON response with HTTP 404:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json
Link: <https://docs.example.com/v3/auth>; rel="alternate"; title="Authentication Guide"

{
  "deadUrl": "https://docs.example.com/v2/auth",
  "suggestions": [
    {
      "url": "https://docs.example.com/v3/auth",
      "title": "Authentication Guide",
      "description": "Comprehensive guide to configuring API keys and OAuth2",
      "score": 0.885,
      "matchType": "moved"
    },
    {
      "url": "https://docs.example.com/v3/quickstart",
      "title": "Quickstart Guide",
      "description": "Get started in 5 minutes",
      "score": 0.542,
      "matchType": "related"
    }
  ]
}
```

### 4.2 Semantic HTML Body (`schema.org/ItemList`)
For standard HTML 404 responses fetched by AI crawlers (GPTBot, ClaudeBot), the response body **MUST** contain a `<script type="application/ld+json">` block:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Page Not Found - 404</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Suggested Alternative Pages",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "url": "https://docs.example.com/v3/auth",
        "name": "Authentication Guide",
        "description": "Comprehensive guide to configuring API keys and OAuth2"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "url": "https://docs.example.com/v3/quickstart",
        "name": "Quickstart Guide",
        "description": "Get started in 5 minutes"
      }
    ]
  }
  </script>
</head>
<body>
  <h1>404 - Page Not Found</h1>
  <p>Looking for one of these pages?</p>
  <ul>
    <li><a href="https://docs.example.com/v3/auth">Authentication Guide</a></li>
    <li><a href="https://docs.example.com/v3/quickstart">Quickstart Guide</a></li>
  </ul>
</body>
</html>
```

---

## 5. Match Types & Ranking Signals

Suggestions are categorized by recovery intent:
1. **`moved`** (Confidence > 0.6 with detected path version or route migration, e.g. `/v2/` → `/v3/`).
2. **`similar`** (High lexical or semantic vector similarity).
3. **`related`** (Keyword or hierarchical cluster overlap).

---

## 6. Recovery Attribution Window

To measure recovery efficacy:
* When a 404 recovery suggestion is served, the server records `(site_id, dead_url, suggested_urls, timestamp)`.
* If a subsequent request for any of `suggested_urls` arrives from the same client origin/IP within **60 seconds**, the request is correlated as a successful recovery.

---

## 7. Security & Isolation

* **No Credential Echoing:** Query parameters containing auth tokens (`api_key`, `token`, `secret`) **MUST** be stripped before indexing or suggestion logging.
* **Domain Sandboxing:** Suggestions **MUST NOT** redirect to untrusted third-party domains without explicit tenant authorization.

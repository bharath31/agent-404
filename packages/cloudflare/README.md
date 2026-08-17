# @agent404/cloudflare

A Cloudflare Worker that reverse-proxies your origin, and on a 404 injects [agent-404](https://www.agent404.dev) recovery suggestions (`Link` headers, `schema.org` JSON-LD, and a rendered suggestion list) at the edge so AI crawlers and coding agents recover in one hop instead of hallucinating.

## Install

```bash
npm install @agent404/cloudflare
```

## Usage

```ts
// worker.ts
import { agent404Worker } from "@agent404/cloudflare";

export default agent404Worker({
  apiKey: "pk_your_public_key",
  origin: "https://docs.example.com",
});
```

Get `apiKey` (the read-only public key) by registering your domain at [agent404.dev](https://www.agent404.dev).

## Cloudflare Pages (`_worker.js`)

On Pages, the default origin fetch would re-enter the same Pages function and recurse (Cloudflare aborts it with error 1019). Serve probes from the static asset binding instead:

```js
import { agent404Worker } from "@agent404/cloudflare";

export default {
  async fetch(request, env) {
    return agent404Worker({
      apiKey: env.AGENT404_PUBLIC_KEY || "pk_your_public_key",
      fetchOrigin: (req) => env.ASSETS.fetch(req),
    }).fetch(request, env);
  },
};
```

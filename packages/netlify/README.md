# @agent-404/netlify

A Netlify Edge Function that intercepts your app's 404s and injects [agent-404](https://www.agent404.dev) recovery suggestions (`Link` headers, `schema.org` JSON-LD, and a rendered suggestion list) at the edge so AI crawlers and coding agents recover in one hop instead of hallucinating.

## Install

```bash
npm install @agent-404/netlify
```

## Usage

```ts
// netlify/edge-functions/agent-404.ts
import { agent404Netlify } from "@agent-404/netlify";

export default agent404Netlify({ apiKey: Netlify.env.get("AGENT404_PUBLIC_KEY")! });

export const config = { path: "/*" };
```

Get `apiKey` (the read-only public key) by registering your domain at [agent404.dev](https://www.agent404.dev).

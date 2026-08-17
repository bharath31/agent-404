# @agent-404/next

Next.js middleware that intercepts your app's 404s and injects [agent-404](https://www.agent404.dev) recovery suggestions (`Link` headers, `schema.org` JSON-LD, and a rendered suggestion list) so AI crawlers and coding agents recover in one hop instead of hallucinating.

## Install

```bash
npm install @agent-404/next
```

## Usage

```ts
// middleware.ts
import { agent404 } from "@agent-404/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!,
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

Get `apiKey` (the read-only public key) by registering your domain at [agent404.dev](https://www.agent404.dev).

For `app/not-found.tsx`, use `notFoundSuggestions(request, config)` to fetch the ranked suggestion list and render it as JSX — see the JSDoc on `notFoundSuggestions` in `dist/index.d.ts` for a full example.

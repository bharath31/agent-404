# @agent404/express

Express helper that turns your app's 404 handler into an [agent-404](https://www.agent404.dev) recovery response (`Link` headers, `schema.org` JSON-LD, and a rendered suggestion list) so AI crawlers and coding agents recover in one hop instead of hallucinating.

## Install

```bash
npm install @agent404/express
```

## Usage

```js
// server.js
import { recoverExpress404 } from "@agent404/express";

app.use(async (req, res) => {
  const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {
    apiKey: process.env.AGENT404_PUBLIC_KEY,
  });
  res.status(404);
  recovered.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await recovered.text());
});
```

Get `apiKey` (the read-only public key) by registering your domain at [agent404.dev](https://www.agent404.dev).

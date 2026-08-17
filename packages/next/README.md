# @agent404/next

Next.js middleware that intercepts 404s at the edge and injects [agent-404](https://www.agent404.dev) recovery suggestions (`Link: rel="alternate"` headers, `schema.org` JSON-LD, and rendered HTML suggestions) so AI coding agents (Claude Code, Cursor, Copilot) and search crawlers recover in one hop instead of hallucinating.

## Quickstart

### 1. Get your free public key
Claim your documentation domain at **[agent404.dev](https://www.agent404.dev)**. The hosted service automatically crawls your sitemap, builds vector embeddings, and provides real-time bot analytics with zero infrastructure to manage.

### 2. Install

```bash
npm install @agent404/next
```

### 3. Add Middleware

```ts
// middleware.ts
import { agent404 } from "@agent404/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!, // pk_... from agent404.dev
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Custom `not-found.tsx` Page (Optional)

For custom UI rendering in `app/not-found.tsx`, use `notFoundSuggestions(request, config)` to fetch ranked suggestions and render them as JSX:

```tsx
// app/not-found.tsx
import { notFoundSuggestions } from "@agent404/next";

export default async function NotFound() {
  const suggestions = await notFoundSuggestions();
  return (
    <main>
      <h1>Page Not Found</h1>
      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((s) => (
            <li key={s.url}><a href={s.url}>{s.title}</a></li>
          ))}
        </ul>
      )}
    </main>
  );
}
```


# Recover nginx 404s with no application layer

GPTBot and ClaudeBot never run JavaScript. Bare `error_page 404 =404` responses
must carry suggestions in the HTTP response. Point nginx 404s at a tiny sidecar
that uses `recover404` from `adapters/core.ts` (Express example in `adapters/express.ts`).

```nginx
error_page 404 = @agent404;

location @agent404 {
    internal;
    proxy_pass http://127.0.0.1:8788/recover;
    proxy_set_header Host $host;
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header Accept $http_accept;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_intercept_errors off;
}
```

The sidecar should:

1. Read `X-Original-URI` + `Host` as the dead URL
2. POST to `https://www.agent404.dev/api/suggest` with the public key and `Origin`
3. Return **404** (not 200) with:
   - `Link` alternates
   - `Vary: Accept`
   - HTML + JSON-LD, or JSON when `Accept: application/json`

Keep `=` in `error_page 404 = @agent404` so nginx uses the sidecar status code.

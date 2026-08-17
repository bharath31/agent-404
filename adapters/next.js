import { fetchSuggestions, recover404 } from "./core.js";
const PROBE_HEADER = "x-agent-404";
const STATIC_EXT = /\.(?:js|css|map|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|txt|xml|json|pdf|mp4|webm)$/i;
function looksLikeStaticAsset(pathname) {
  return STATIC_EXT.test(pathname);
}
async function probeOrigin(request, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const probeHeaders = new Headers(request.headers);
    probeHeaders.set(PROBE_HEADER, "probe");
    return await fetch(new Request(request, { headers: probeHeaders, redirect: "manual" }), {
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(t);
  }
}
function agent404(config) {
  return async (request) => {
    if (request.headers.get(PROBE_HEADER) === "probe") return void 0;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/_next") || looksLikeStaticAsset(url.pathname)) return void 0;
    if (config.skip?.(url)) return void 0;
    try {
      const upstream = await probeOrigin(request, config.probeTimeoutMs ?? config.timeoutMs ?? 2500);
      if (upstream.status !== 404) return void 0;
      return recover404(request, upstream, config);
    } catch {
      return void 0;
    }
  };
}
async function notFoundSuggestions(request, config) {
  const payload = await fetchSuggestions(request.url, {
    ...config,
    origin: config.origin || new URL(request.url).origin
  });
  return payload?.suggestions ?? [];
}
async function renderNotFoundPage(request, config) {
  const empty = new Response("<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>Not Found</h1></body></html>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
  return recover404(request, empty, config);
}
import { recover404 as recover4042, fetchSuggestions as fetchSuggestions2, buildLinkHeader, prefersJson } from "./core.js";
export {
  PROBE_HEADER,
  agent404,
  buildLinkHeader,
  fetchSuggestions2 as fetchSuggestions,
  notFoundSuggestions,
  prefersJson,
  recover4042 as recover404,
  renderNotFoundPage
};

const DEFAULT_API_BASE = "https://www.agent404.dev";
function buildJsonLd(suggestions) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Page Not Found",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: suggestions.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: s.url,
        name: s.title || s.url,
        description: s.matchType
      }))
    }
  };
}
function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function sanitizeSuggestions(suggestions) {
  return suggestions.filter((s) => isSafeHttpUrl(s.url));
}
function buildLinkHeader(suggestions) {
  return sanitizeSuggestions(suggestions).map((s) => `<${s.url}>; rel="alternate"; title="${escapeLinkParam(s.title || s.url)}"`).join(", ");
}
function escapeLinkParam(value) {
  return value.replace(/[\r\n]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function prefersJson(accept) {
  if (!accept) return false;
  const json = accept.includes("application/json");
  const html = accept.includes("text/html");
  if (json && !html) return true;
  if (json && html) {
    const jsonQ = qValue(accept, "application/json");
    const htmlQ = qValue(accept, "text/html");
    return jsonQ > htmlQ;
  }
  return false;
}
function qValue(accept, type) {
  const part = accept.split(",").map((p) => p.trim()).find((p) => p.startsWith(type));
  if (!part) return 0;
  const q = /;\s*q=([0-9.]+)/.exec(part);
  return q ? Number(q[1]) : 1;
}
function suggestionListHtml(suggestions) {
  const items = sanitizeSuggestions(suggestions).map(
    (s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title || s.url)}</a> <span>${escapeHtml(s.matchType)}</span></li>`
  ).join("");
  return `<aside id="agent-404-suggestions"><h3>Were you looking for one of these?</h3><ul>${items}</ul></aside>`;
}
function jsonLdScript(jsonLd) {
  return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}
function injectRecoveryHtml(html, payload) {
  const suggestions = sanitizeSuggestions(payload.suggestions);
  if (!suggestions.length) return html;
  const block = jsonLdScript(payload.jsonLd) + suggestionListHtml(suggestions);
  if (html.includes("</body>")) return html.replace("</body>", `${block}</body>`);
  if (html.includes("</html>")) return html.replace("</html>", `${block}</html>`);
  return html + block;
}
async function fetchSuggestions(deadUrl, config) {
  const apiBase = (config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 2500);
  try {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey
    };
    if (config.origin) headers.Origin = config.origin;
    const resp = await fetch(`${apiBase}/api/suggest`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: deadUrl }),
      signal: ctrl.signal
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function recover404(request, response, config) {
  if (response.status !== 404) return response;
  if (request.headers.get("x-agent-404") === "probe") return response;
  try {
    const raw = await fetchSuggestions(request.url, {
      ...config,
      origin: config.origin || originFromRequest(request)
    });
    const payload = raw ? { ...raw, suggestions: sanitizeSuggestions(raw.suggestions || []) } : null;
    if (!payload || payload.suggestions.length === 0) {
      return withAcceptVary(response);
    }
    const headers = new Headers(response.headers);
    headers.set("Vary", mergeVary(headers.get("Vary")));
    const link = buildLinkHeader(payload.suggestions);
    if (link) {
      try {
        headers.set("Link", link);
      } catch {
      }
    }
    if (prefersJson(request.headers.get("accept"))) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(payload), { status: 404, headers });
    }
    const contentType = headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      headers.set("Content-Type", "text/html; charset=utf-8");
      const html2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Found</title></head><body><h1>Not Found</h1>${suggestionListHtml(payload.suggestions)}${jsonLdScript(payload.jsonLd)}</body></html>`;
      return new Response(html2, { status: 404, headers });
    }
    const html = injectRecoveryHtml(await response.text(), payload);
    headers.delete("content-length");
    return new Response(html, { status: 404, headers });
  } catch {
    return withAcceptVary(response);
  }
}
function withAcceptVary(response) {
  const headers = new Headers(response.headers);
  headers.set("Vary", mergeVary(headers.get("Vary")));
  return new Response(response.body, { status: 404, statusText: response.statusText, headers });
}
function originFromRequest(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return void 0;
  }
}
function mergeVary(existing) {
  const parts = new Set(
    (existing || "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  parts.add("Accept");
  return [...parts].join(", ");
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export {
  DEFAULT_API_BASE,
  buildJsonLd,
  buildLinkHeader,
  fetchSuggestions,
  injectRecoveryHtml,
  isSafeHttpUrl,
  jsonLdScript,
  prefersJson,
  recover404,
  sanitizeSuggestions,
  suggestionListHtml
};

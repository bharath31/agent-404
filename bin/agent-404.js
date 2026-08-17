#!/usr/bin/env node

// src/lib/ssrf-guard.ts
var BLOCKED_HOST_EXACT = /* @__PURE__ */ new Set(["localhost", "localhost.localdomain", "0.0.0.0", "metadata.google.internal"]);
var BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".arpa", ".invalid"];
function isBlockedInternalHost(hostname) {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (!lower) return true;
  if (BLOCKED_HOST_EXACT.has(lower)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (lower.startsWith("[")) return true;
  return isPrivateOrReservedIp(lower);
}
function isPrivateOrReservedIp(ip) {
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
    const parts = mapped.split(".").map((n) => Number(n));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (raw.includes(":")) {
    if (raw === "::1" || raw === "::" || raw === "0:0:0:0:0:0:0:1") return true;
    if (raw.startsWith("fe80:") || raw.startsWith("fc") || raw.startsWith("fd")) return true;
  }
  return false;
}

// src/engine/claudebot-probe.ts
var CLAUDEBOT_UA = "Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://www.anthropic.com/claudebot)";
async function probeClaudeBotResponse(domain, path = "/non-existent-probe-agent-404") {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  if (isBlockedInternalHost(cleanDomain)) {
    throw new Error("Invalid or blocked domain");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = `https://${cleanDomain}${normalizedPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6e3);
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": CLAUDEBOT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    const text = await res.text().catch(() => "");
    const bodySnippet = text.slice(0, 500);
    const linkHeader = res.headers.get("link") || "";
    const hasLinkHeaders = linkHeader.toLowerCase().includes("rel=alternate") || linkHeader.toLowerCase().includes('rel="alternate"');
    const hasJsonLd = text.includes("application/ld+json") && text.includes("schema.org");
    const hasSuggestions = text.toLowerCase().includes("suggestions") || text.includes("agent-404");
    let verdict = "unrecovered_404";
    let summary = "ClaudeBot receives a bare 404 with no recovery signals. The agent will abandon the request or hallucinate.";
    if (res.status !== 404 && res.status >= 200 && res.status < 400) {
      verdict = "non_404";
      summary = `Target returned HTTP ${res.status}. If this is a soft-404, crawlers cannot distinguish missing content from live pages.`;
    } else if (hasLinkHeaders || hasJsonLd) {
      verdict = "recovered_404";
      summary = "Site provides structured recovery information in the response.";
    }
    const headersSnippet = {};
    res.headers.forEach((v, k) => {
      if (["content-type", "link", "vary", "server"].includes(k.toLowerCase())) {
        headersSnippet[k] = v;
      }
    });
    return {
      targetUrl,
      status: res.status,
      hasLinkHeaders,
      hasJsonLd,
      hasSuggestions,
      verdict,
      summary,
      headersSnippet,
      bodySnippet,
      comparison: {
        current: {
          status: res.status,
          recoverySupported: hasLinkHeaders || hasJsonLd,
          headers: linkHeader ? [linkHeader] : [],
          jsonLdFound: hasJsonLd
        },
        withAgent404: {
          status: 404,
          recoverySupported: true,
          linkHeader: `Link: <https://${cleanDomain}/>; rel="alternate"`,
          jsonLdType: "schema.org/ItemList"
        }
      }
    };
  } catch (err) {
    return {
      targetUrl,
      status: 0,
      hasLinkHeaders: false,
      hasJsonLd: false,
      hasSuggestions: false,
      verdict: "error",
      summary: `Could not reach ${targetUrl} (${err?.message || "connection error"}).`,
      headersSnippet: {},
      bodySnippet: "",
      comparison: {
        current: {
          status: 0,
          recoverySupported: false,
          headers: [],
          jsonLdFound: false
        },
        withAgent404: {
          status: 404,
          recoverySupported: true,
          linkHeader: `Link: <https://${cleanDomain}/>; rel="alternate"`,
          jsonLdType: "schema.org/ItemList"
        }
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

// src/engine/crawler.ts
var DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
async function readBodyCapped(resp, maxBytes) {
  if (resp.body && typeof resp.body.getReader === "function") {
    const reader = resp.body.getReader();
    const chunks = [];
    let totalSize = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.byteLength;
        if (totalSize > maxBytes) {
          reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }
    const decoder = new TextDecoder();
    return chunks.map((c2) => decoder.decode(c2, { stream: true })).join("") + decoder.decode();
  }
  const text = await resp.text();
  return text.length > maxBytes ? null : text;
}

// src/engine/discovery.ts
var DEMO_FETCH_TIMEOUT_MS = 8e3;
var DEMO_PIPELINE_TIMEOUT_MS = 2e4;
var DEMO_MAX_URLS = 500;
var DEMO_MAX_BODY_BYTES = 2 * 1024 * 1024;
var DEMO_MAX_DEPTH = 3;
var DEMO_MAX_CHILDREN = 8;
var DEMO_USER_AGENT = "Mozilla/5.0 (compatible; agent-404-bot/1.0; +https://agent-404.vercel.app)";
var SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap/sitemap.xml",
  "/sitemap/index.xml",
  "/wp-sitemap.xml",
  "/sitemap.txt"
];
function detectBlockedResponse(status, body) {
  if (status === 401) return "This site requires authentication and cannot be crawled publicly.";
  if (status === 429) return "This site is rate-limiting our requests. Try again later.";
  if (status === 403) {
    if (body) {
      const lower = body.toLowerCase();
      if (lower.includes("cf-browser-verification") || lower.includes("__cf_chl_") || lower.includes("challenge-platform")) {
        return "This site is behind Cloudflare bot protection and requires browser verification.";
      }
      if (lower.includes("akamai") || lower.includes("ak_bmsc")) {
        return "This site is behind Akamai bot protection and blocks automated access.";
      }
    }
    return "This site returned 403 Forbidden \u2014 it likely blocks automated access.";
  }
  if (body) {
    const lower = body.toLowerCase();
    if ((lower.includes("access denied") || lower.includes("captcha")) && lower.includes("<html") && body.length < 1e4) {
      return "This site appears to block automated access (access denied / captcha detected).";
    }
  }
  return null;
}
async function fetchDemoResponse(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": DEMO_USER_AGENT,
        Accept: "text/plain, application/xml, text/xml, text/html, */*"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    const finalUrl = resp.url || url;
    if (!resp.ok) {
      const partialBody = await readBodyCapped(resp, 5e4);
      return { text: partialBody, status: resp.status, finalUrl };
    }
    const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
    if (contentLength > DEMO_MAX_BODY_BYTES) {
      return { text: null, status: resp.status, finalUrl };
    }
    const text = await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
    return { text, status: resp.status, finalUrl };
  } catch {
    return { text: null, status: 0, finalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}
function hasRelevantPages(pages, deadPath) {
  const deadSegments = deadPath.split("/").filter(Boolean);
  if (deadSegments.length === 0) return pages.length > 0;
  const firstSeg = deadSegments[0].toLowerCase();
  if (firstSeg.length < 3) return pages.length > 0;
  return pages.some((p) => {
    try {
      const pageSegs = new URL(p.url).pathname.split("/").filter(Boolean);
      return pageSegs.some(
        (seg) => seg.toLowerCase().startsWith(firstSeg) || firstSeg.startsWith(seg.toLowerCase())
      );
    } catch {
      return false;
    }
  });
}
async function discoverDemoPages(domain, deadPath) {
  const deadline = Date.now() + DEMO_PIPELINE_TIMEOUT_MS;
  let effectiveDomain = domain;
  let blockedReason = null;
  let llmsFallbackPages = null;
  if (Date.now() < deadline) {
    const llmsResult = await fetchLlmsTxt(effectiveDomain, deadPath);
    if (llmsResult.pages.length > 0) {
      if (hasRelevantPages(llmsResult.pages, deadPath)) {
        return { pages: llmsResult.pages, source: "llms.txt" };
      }
      llmsFallbackPages = llmsResult.pages;
    }
    if (llmsResult.redirectDomain) effectiveDomain = llmsResult.redirectDomain;
    if (llmsResult.blocked) blockedReason = llmsResult.blocked;
  }
  if (Date.now() < deadline) {
    const sitemapUrls = await findSitemapUrls(effectiveDomain, deadPath);
    for (const sitemapUrl of sitemapUrls) {
      if (Date.now() >= deadline) break;
      const pages = await fetchDemoSitemap(sitemapUrl, deadPath, 0, effectiveDomain);
      if (pages.length > 0) return { pages, source: "sitemap" };
    }
  }
  let spaDetected = false;
  if (Date.now() < deadline) {
    const crawlResult = await crawlDemoLinks(effectiveDomain, deadPath);
    if (crawlResult.pages.length > 0 && !crawlResult.spaDetected) {
      return { pages: crawlResult.pages, source: "crawl" };
    }
    spaDetected = crawlResult.spaDetected;
    if (crawlResult.blocked) blockedReason = crawlResult.blocked;
  }
  if (llmsFallbackPages && llmsFallbackPages.length > 0) {
    return { pages: llmsFallbackPages, source: "llms.txt" };
  }
  if (spaDetected) {
    return {
      pages: [],
      source: "none",
      error: "This site appears to be a single-page application (SPA) that renders content with JavaScript. We can only discover pages from server-rendered HTML, sitemaps, or llms.txt."
    };
  }
  if (blockedReason) {
    return { pages: [], source: "none", error: blockedReason };
  }
  return {
    pages: [],
    source: "none",
    error: `Could not discover pages on ${domain}. The site may have no sitemap, llms.txt, or discoverable links.`
  };
}
async function fetchLlmsTxt(domain, deadPath) {
  let redirectDomain;
  let blocked;
  const resp = await fetchDemoResponse(`https://${domain}/llms.txt`);
  if (resp.finalUrl) {
    try {
      const finalHost = new URL(resp.finalUrl).hostname;
      if (finalHost !== domain) redirectDomain = finalHost;
    } catch {
    }
  }
  if (resp.status > 0 && (resp.status >= 400 || !resp.text)) {
    const blockMsg = detectBlockedResponse(resp.status, resp.text);
    if (blockMsg) blocked = blockMsg;
  }
  const effectiveDomain = redirectDomain || domain;
  if (resp.text && resp.text.length >= 20) {
    const { pages, childLlmsTxtUrls } = parseLlmsTxt(resp.text, effectiveDomain);
    if (pages.length > 0 && childLlmsTxtUrls.length > 0) {
      const childPages = await followChildLlmsTxt(childLlmsTxtUrls, effectiveDomain, deadPath);
      const seen = new Set(pages.map((p) => p.url));
      for (const cp of childPages) {
        if (!seen.has(cp.url) && pages.length < DEMO_MAX_URLS) {
          seen.add(cp.url);
          pages.push(cp);
        }
      }
      return { pages, redirectDomain };
    }
    if (pages.length > 0) return { pages, redirectDomain };
    if (childLlmsTxtUrls.length > 0) {
      const childPages = await followChildLlmsTxt(childLlmsTxtUrls, effectiveDomain, deadPath);
      if (childPages.length > 0) return { pages: childPages, redirectDomain };
    }
  }
  const deadSegments = deadPath.split("/").filter(Boolean);
  for (let i = 1; i <= Math.min(deadSegments.length, 2); i++) {
    const prefix = "/" + deadSegments.slice(0, i).join("/");
    const prefixText = await fetchDemoText(`https://${effectiveDomain}${prefix}/llms.txt`);
    if (prefixText && prefixText.length >= 20) {
      const { pages } = parseLlmsTxt(prefixText, effectiveDomain);
      if (pages.length > 0) return { pages, redirectDomain };
    }
  }
  const fullText = await fetchDemoText(`https://${effectiveDomain}/llms-full.txt`);
  if (fullText && fullText.length >= 20) {
    const { pages } = parseLlmsTxt(fullText, effectiveDomain);
    if (pages.length > 0) return { pages, redirectDomain };
  }
  return { pages: [], redirectDomain, blocked };
}
function parseLlmsTxt(text, domain) {
  const pages = [];
  const childLlmsTxtUrls = [];
  const seen = /* @__PURE__ */ new Set();
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?:\s*:\s*(.+))?/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1].trim();
    let url = match[2].trim();
    const description = match[3]?.trim() || "";
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) continue;
    } catch {
      continue;
    }
    if (url.endsWith("/llms.txt") || url.endsWith("/llms-full.txt")) {
      if (!seen.has(url)) {
        seen.add(url);
        childLlmsTxtUrls.push({ url, title });
      }
      continue;
    }
    url = url.replace(/\/index\.md$/, "/").replace(/\.md$/, "");
    if (seen.has(url) || pages.length >= DEMO_MAX_URLS) continue;
    seen.add(url);
    pages.push({ url, title, description });
  }
  return { pages, childLlmsTxtUrls };
}
async function followChildLlmsTxt(children, domain, deadPath) {
  const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);
  const scored = children.map((child) => {
    let score = 0;
    let childPathSegs = [];
    try {
      childPathSegs = new URL(child.url).pathname.toLowerCase().split("/").filter(Boolean);
      if (childPathSegs.length > 0 && childPathSegs[childPathSegs.length - 1] === "llms.txt") {
        childPathSegs.pop();
      }
    } catch {
    }
    const childTitle = child.title.toLowerCase();
    for (const seg of deadSegments) {
      if (seg.length < 3) continue;
      let bestPathScore = 0;
      for (const cSeg of childPathSegs) {
        if (cSeg === seg) {
          bestPathScore = 5;
          break;
        }
        if (cSeg.startsWith(seg) || seg.startsWith(cSeg)) {
          const lenRatio = Math.min(seg.length, cSeg.length) / Math.max(seg.length, cSeg.length);
          bestPathScore = Math.max(bestPathScore, 3 + lenRatio);
        }
      }
      score += bestPathScore;
      for (const word of childTitle.split(/\W+/)) {
        if (word.length >= 3 && (word.startsWith(seg) || seg.startsWith(word))) {
          score += 2;
          break;
        }
      }
    }
    return { ...child, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const topChildren = scored.slice(0, 3);
  const results = await Promise.all(
    topChildren.map(async (child) => {
      const text = await fetchDemoText(child.url);
      if (!text) return [];
      const { pages } = parseLlmsTxt(text, domain);
      return pages;
    })
  );
  return results.flat().slice(0, DEMO_MAX_URLS);
}
async function findSitemapUrls(domain, deadPath) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const addUrl = (url) => {
    if (url.startsWith("https://") && !seen.has(url)) {
      seen.add(url);
      found.push(url);
    }
  };
  const robotsTxt = await fetchDemoText(`https://${domain}/robots.txt`);
  if (robotsTxt) {
    const sitemapRegex = /^Sitemap:\s*(\S+)/gim;
    let match;
    while ((match = sitemapRegex.exec(robotsTxt)) !== null) {
      addUrl(match[1].trim());
    }
  }
  const deadSegments = deadPath.split("/").filter(Boolean);
  for (let i = 1; i <= Math.min(deadSegments.length, 2); i++) {
    const prefix = "/" + deadSegments.slice(0, i).join("/");
    addUrl(`https://${domain}${prefix}/sitemap.xml`);
    addUrl(`https://${domain}${prefix}/sitemap-0.xml`);
    addUrl(`https://${domain}${prefix}/sitemap.txt`);
  }
  for (const path of SITEMAP_PATHS) {
    addUrl(`https://${domain}${path}`);
  }
  return found;
}
async function fetchDemoText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": DEMO_USER_AGENT,
        Accept: "text/plain, application/xml, text/xml, text/html, */*"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!resp.ok) return null;
    const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
    if (contentLength > DEMO_MAX_BODY_BYTES) return null;
    return await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchDemoSitemapXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": DEMO_USER_AGENT,
        Accept: "application/xml, text/xml, */*;q=0.1"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return null;
    const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
    if (contentLength > DEMO_MAX_BODY_BYTES) return null;
    const text = await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
    if (!text || text.trim().length === 0) return null;
    const trimmed = text.trimStart();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
var GENERIC_SITEMAP_RE = /\/sitemap[-_]?\d*\.xml$/i;
function scoreChildSitemap(childUrl, deadPath) {
  const childLower = childUrl.toLowerCase();
  const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);
  let score = 0;
  if (GENERIC_SITEMAP_RE.test(childLower)) score += 1;
  if (deadSegments.length === 0) return score;
  let childPathSegs = [];
  try {
    childPathSegs = new URL(childUrl).pathname.toLowerCase().split("/").filter(Boolean);
  } catch {
  }
  for (const seg of deadSegments) {
    if (seg.length < 3) continue;
    for (const cSeg of childPathSegs) {
      if (cSeg.startsWith(seg) || seg.startsWith(cSeg)) {
        score += 3;
        break;
      }
    }
  }
  return score;
}
function parsePlainTextSitemap(text, filterDomain) {
  const pages = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of text.split("\n")) {
    const url = line.trim();
    if (!url || !url.startsWith("https://")) continue;
    if (seen.has(url) || pages.length >= DEMO_MAX_URLS) continue;
    if (filterDomain) {
      try {
        const h = new URL(url).hostname;
        if (h !== filterDomain && !h.endsWith("." + filterDomain)) continue;
      } catch {
        continue;
      }
    }
    seen.add(url);
    pages.push({ url, title: demoTitleFromUrl(url) });
  }
  return pages;
}
async function fetchDemoSitemap(url, deadPath, depth, filterDomain) {
  if (url.endsWith(".txt")) {
    const text = await fetchDemoText(url);
    if (text) {
      const pages = parsePlainTextSitemap(text, filterDomain);
      if (pages.length > 0) return pages;
    }
    return [];
  }
  const xml = await fetchDemoSitemapXml(url);
  if (!xml) return [];
  if (!xml.includes("<sitemapindex")) {
    const allLocs = extractDemoLocs(xml, "url");
    if (allLocs.length <= DEMO_MAX_URLS) {
      return allLocs.map((loc) => ({ url: loc, title: demoTitleFromUrl(loc) }));
    }
    return prioritizeLocs(allLocs, deadPath).map((loc) => ({ url: loc, title: demoTitleFromUrl(loc) }));
  }
  if (depth >= DEMO_MAX_DEPTH) return [];
  const childLocs = extractDemoLocs(xml, "sitemap");
  if (childLocs.length === 0) return [];
  const limit = childLocs.length <= 10 ? childLocs.length : DEMO_MAX_CHILDREN;
  const scored = childLocs.map((loc, i) => ({
    loc,
    score: scoreChildSitemap(loc, deadPath),
    idx: i
  }));
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const topChildren = scored.slice(0, limit);
  const results = await Promise.all(
    topChildren.map((child) => fetchDemoSitemap(child.loc, deadPath, depth + 1, filterDomain))
  );
  return results.flat().slice(0, DEMO_MAX_URLS);
}
var SPA_MARKERS = [
  'id="root"></div>',
  'id="app"></div>',
  'id="__next"></div>',
  'id="__nuxt"></div>'
];
async function crawlDemoLinks(domain, deadPath) {
  const baseUrl = `https://${domain}`;
  const seen = /* @__PURE__ */ new Set();
  const pages = [];
  let spaDetected = false;
  let blocked;
  const seedPaths = ["/"];
  const deadSegments = deadPath.split("/").filter(Boolean);
  for (let i = 1; i <= Math.min(deadSegments.length, 3); i++) {
    seedPaths.push("/" + deadSegments.slice(0, i).join("/"));
  }
  for (const seedPath of seedPaths) {
    if (pages.length >= DEMO_MAX_URLS) break;
    const resp = await fetchDemoResponse(baseUrl + seedPath);
    if (seedPath === "/" && (resp.status >= 400 || !resp.text)) {
      const blockMsg = detectBlockedResponse(resp.status, resp.text);
      if (blockMsg) blocked = blockMsg;
    }
    if (!resp.text || resp.status < 200 || resp.status >= 400) continue;
    const html = resp.text;
    const seedTitle = extractHtmlTitle(html);
    const seedUrl = baseUrl + seedPath;
    if (!seen.has(seedUrl)) {
      seen.add(seedUrl);
      pages.push({ url: seedUrl, title: seedTitle });
    }
    const links = extractInternalLinks(html, domain);
    if (seedPath === "/" && links.length < 2) {
      const lowerHtml = html.toLowerCase();
      if (SPA_MARKERS.some((m) => lowerHtml.includes(m))) {
        spaDetected = true;
      }
    }
    for (const link of links) {
      if (seen.has(link.url) || pages.length >= DEMO_MAX_URLS) continue;
      seen.add(link.url);
      pages.push(link);
    }
  }
  const extraSeeds = pages.filter((p) => {
    const pPath = new URL(p.url).pathname.toLowerCase();
    return deadSegments.some((s) => s.length > 2 && pPath.includes(s));
  }).slice(0, 3);
  for (const seed of extraSeeds) {
    if (pages.length >= DEMO_MAX_URLS) break;
    const html = await fetchDemoText(seed.url);
    if (!html) continue;
    const links = extractInternalLinks(html, domain);
    for (const link of links) {
      if (seen.has(link.url) || pages.length >= DEMO_MAX_URLS) continue;
      seen.add(link.url);
      pages.push(link);
    }
  }
  return { pages, spaDetected, blocked };
}
function extractHtmlTitle(html) {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match ? match[1].trim() : "";
}
function extractInternalLinks(html, domain) {
  const links = [];
  const seen = /* @__PURE__ */ new Set();
  const regex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (href.startsWith("/")) {
      href = `https://${domain}${href}`;
    }
    try {
      const parsed = new URL(href);
      if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) continue;
      if (parsed.protocol !== "https:") continue;
      const path = parsed.pathname;
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i.test(path))
        continue;
      if (/^\/(api|cdn-cgi|_next|_nuxt|__)\//i.test(path)) continue;
      const canonical = parsed.origin + path.replace(/\/+$/, "");
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      links.push({ url: canonical, title: text || demoTitleFromUrl(canonical) });
    } catch {
      continue;
    }
  }
  return links;
}
function prioritizeLocs(locs, deadPath) {
  const deadSegments = deadPath.toLowerCase().split("/").filter((s) => s.length > 2);
  if (deadSegments.length === 0) return locs.slice(0, DEMO_MAX_URLS);
  const scored = locs.map((loc) => {
    const locLower = loc.toLowerCase();
    let score = 0;
    for (const seg of deadSegments) {
      if (locLower.includes(seg)) score += 1;
    }
    return { loc, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, DEMO_MAX_URLS).map((s) => s.loc);
}
function extractDemoLocs(xml, parentTag) {
  const urls = [];
  const regex = new RegExp(
    `<${parentTag}>[\\s\\S]*?<loc>([^<]+)<\\/loc>[\\s\\S]*?<\\/${parentTag}>`,
    "gi"
  );
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const loc = match[1].trim();
    if (loc.startsWith("https://")) urls.push(loc);
  }
  return urls;
}
function demoTitleFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop() || "";
    return last.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
  } catch {
    return "";
  }
}

// src/engine/analyzer.ts
var BATCH_SIZE = 5;
var BATCH_DELAY_MS = 200;
var OVERALL_TIMEOUT_MS = 3e4;
var FETCH_TIMEOUT_MS = 5e3;
var USER_AGENT = "Mozilla/5.0 (compatible; agent-404-analyzer/1.0)";
function extractInternalLinks2(html, domain) {
  const links = [];
  const hrefRe = /<a\s[^>]*href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    try {
      const url = new URL(href, `https://${domain}`);
      if (url.hostname === domain || url.hostname === `www.${domain}`) {
        const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
        links.push(normalized);
      }
    } catch {
    }
  }
  return links;
}
async function fetchPageHtml(url) {
  try {
    const parsed = new URL(url);
    if (isBlockedInternalHost(parsed.hostname)) return null;
  } catch {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function analyzeSite(pages, domain) {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const pageUrlSet = new Set(pages.map((p) => p.url.replace(/\/+$/, "")));
  const brokenLinks = [];
  const inboundCount = /* @__PURE__ */ new Map();
  for (const url of pageUrlSet) {
    inboundCount.set(url, 0);
  }
  let pagesAnalyzed = 0;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    if (Date.now() >= deadline) break;
    const batch = pages.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((p) => fetchPageHtml(p.url)));
    for (let j = 0; j < batch.length; j++) {
      const html = results[j];
      if (!html) continue;
      pagesAnalyzed++;
      const links = extractInternalLinks2(html, domain);
      for (const link of links) {
        if (pageUrlSet.has(link)) {
          inboundCount.set(link, (inboundCount.get(link) || 0) + 1);
        } else {
          brokenLinks.push({ sourcePage: batch[j].url, targetUrl: link });
        }
      }
    }
    if (i + BATCH_SIZE < pages.length && Date.now() < deadline) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  const orphanPages = [...inboundCount.entries()].filter(([, count]) => count === 0).map(([url]) => url);
  return {
    domain,
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString(),
    pagesAnalyzed,
    brokenLinks,
    orphanPages
  };
}

// src/engine/stemmer.ts
var SUFFIX_RULES = [
  ["izations", "ize"],
  ["ments", ""],
  ["ment", ""],
  ["ing", ""],
  ["tion", ""],
  ["ers", ""],
  ["ies", "y"],
  ["es", ""],
  ["ed", ""],
  ["er", ""],
  ["ly", ""],
  ["s", ""]
];
function stemToken(word) {
  if (word.length <= 4) return word;
  for (const [suffix, replacement] of SUFFIX_RULES) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length) + replacement;
      if (stem.length >= 3) return stem;
    }
  }
  return word;
}

// src/engine/url-normalize.ts
function normalizePathname(urlOrPath) {
  try {
    const u = new URL(urlOrPath, "https://example.com");
    return u.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return urlOrPath.replace(/\/+$/, "").toLowerCase() || "/";
  }
}

// src/engine/matcher.ts
var SCORE_THRESHOLD = 0.2;
var MAX_RESULTS = 5;
var W4_PATH_SEG = 0.35;
var W4_LEVENSHTEIN = 0.2;
var W4_TEXT = 0.15;
var W4_EMBEDDING = 0.3;
var W3_PATH_SEG = 0.5;
var W3_LEVENSHTEIN = 0.3;
var W3_TEXT = 0.2;
function findSuggestions(deadUrl, pages, deadUrlEmbedding) {
  const deadPath = normalizePathname(deadUrl);
  const deadSegments = pathSegments(deadPath);
  const deadKeywords = extractKeywords(deadPath);
  const scored = [];
  for (const page of pages) {
    const pagePath = normalizePathname(page.url);
    const pageSegments = pathSegments(pagePath);
    const pathSegScore = jaccardVersionTolerant(deadSegments, pageSegments);
    const levScore = 1 - normalizedLevenshtein(deadPath, pagePath);
    const pageKeywords = extractKeywords(pagePath);
    const headings = safeParseArray(page.headings);
    const textPool = [page.title, page.description, ...headings].join(" ").toLowerCase();
    const textKeywords = /* @__PURE__ */ new Set([
      ...textPool.split(/\W+/).filter((w) => w.length > 2),
      ...pageKeywords
    ]);
    const textScore = keywordOverlap(deadKeywords, textKeywords);
    const hasEmbedding = deadUrlEmbedding && page.embedding;
    let score;
    if (hasEmbedding) {
      const embeddingScore = cosineSimilarity(deadUrlEmbedding, page.embedding);
      score = W4_PATH_SEG * pathSegScore + W4_LEVENSHTEIN * levScore + W4_TEXT * textScore + W4_EMBEDDING * embeddingScore;
    } else {
      score = W3_PATH_SEG * pathSegScore + W3_LEVENSHTEIN * levScore + W3_TEXT * textScore;
    }
    if (score >= SCORE_THRESHOLD) {
      const hasVersionDiff = detectVersionDiff(deadSegments, pageSegments);
      let matchType;
      if (hasVersionDiff && score > 0.6) matchType = "moved";
      else if (score > 0.6) matchType = "similar";
      else matchType = "related";
      scored.push({
        url: page.url,
        title: page.title,
        description: page.description,
        score: Math.round(score * 1e3) / 1e3,
        matchType
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
function pathSegments(path) {
  return path.split("/").filter(Boolean);
}
function extractKeywords(path) {
  return new Set(
    path.split(/[\/_\-./]+/).filter((w) => w.length > 2).map((w) => w.toLowerCase())
  );
}
function safeParseArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function isPrefixMatch(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}
function jaccardVersionTolerant(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let matches = 0;
  const bSet = new Set(b);
  const used = /* @__PURE__ */ new Set();
  for (const seg of a) {
    if (bSet.has(seg)) {
      matches += 1;
      used.add(seg);
    } else {
      const versionMatch = b.find(
        (bSeg) => !used.has(bSeg) && isVersionVariant(seg, bSeg)
      );
      if (versionMatch) {
        matches += 0.5;
        used.add(versionMatch);
      } else {
        const prefixMatch = b.find(
          (bSeg) => !used.has(bSeg) && isPrefixMatch(seg, bSeg)
        );
        if (prefixMatch) {
          matches += 0.7;
          used.add(prefixMatch);
        } else {
          const stemMatch = b.find(
            (bSeg) => !used.has(bSeg) && stemToken(seg) === stemToken(bSeg)
          );
          if (stemMatch) {
            matches += 0.6;
            used.add(stemMatch);
          }
        }
      }
    }
  }
  const union = (/* @__PURE__ */ new Set([...a, ...b])).size;
  return matches / union;
}
var VERSION_RE = /^(v|ver|version)?(\d+)$/;
function isVersionVariant(a, b) {
  const ma = VERSION_RE.exec(a);
  const mb = VERSION_RE.exec(b);
  if (!ma || !mb) return false;
  return ma[1] === mb[1] && ma[2] !== mb[2];
}
function detectVersionDiff(a, b) {
  for (const seg of a) {
    for (const bSeg of b) {
      if (isVersionVariant(seg, bSeg)) return true;
    }
  }
  return false;
}
function normalizedLevenshtein(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function keywordOverlap(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) {
      intersection++;
    } else {
      let matched = false;
      for (const bWord of b) {
        if (isPrefixMatch(word, bWord)) {
          intersection += 0.7;
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const bWord of b) {
          if (stemToken(word) === stemToken(bWord)) {
            intersection += 0.6;
            break;
          }
        }
      }
    }
  }
  const union = (/* @__PURE__ */ new Set([...a, ...b])).size;
  return intersection / union;
}

// src/config.ts
var CANONICAL_ORIGIN = "https://www.agent404.dev";
var CANONICAL_SCRIPT_URL = `${CANONICAL_ORIGIN}/agent-404.min.js`;
function getEnvValue(key, env) {
  const fromEnv = env?.[key];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : void 0;
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return "";
}
function getEmbeddingConfig(env) {
  const url = getEnvValue("EMBEDDING_API_URL", env) || "https://openrouter.ai/api/v1/embeddings";
  const model = getEnvValue("EMBEDDING_MODEL", env) || "openai/text-embedding-3-small";
  const apiKey = getEnvValue("EMBEDDING_API_KEY", env) || getEnvValue("OPENAI_API_KEY", env) || void 0;
  return { url, model, apiKey };
}

// src/engine/embeddings.ts
var DIMENSIONS = 256;
async function generateBatchEmbeddings(texts) {
  const { url, model, apiKey } = getEmbeddingConfig();
  if (!apiKey || texts.length === 0) {
    return texts.map(() => null);
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: texts,
        model,
        dimensions: DIMENSIONS
      })
    });
    if (!resp.ok) {
      console.error(`Embedding API error: ${resp.status}`);
      return texts.map(() => null);
    }
    const data = await resp.json();
    const results = texts.map(() => null);
    for (const item of data.data) {
      results[item.index] = item.embedding;
    }
    return results;
  } catch (err) {
    console.error("Embedding API request failed:", err?.message || "unknown error");
    return texts.map(() => null);
  }
}
function buildEmbeddingText(page) {
  let pathPart = "";
  try {
    const u = new URL(page.url);
    pathPart = u.pathname.split("/").filter(Boolean).map((s) => s.replace(/[-_]/g, " ")).join(" ");
  } catch {
    pathPart = page.url;
  }
  return [pathPart, page.title, page.description].filter(Boolean).join(" \u2014 ");
}
function deadUrlEmbeddingText(deadUrl) {
  try {
    const u = new URL(deadUrl);
    return u.pathname.split("/").filter(Boolean).map((s) => s.replace(/[-_]/g, " ")).join(" ");
  } catch {
    return deadUrl;
  }
}

// src/engine/hallucination-predictor.ts
var COMMON_SYNONYMS = {
  docs: ["doc", "documentation", "guide", "reference", "api"],
  doc: ["docs", "documentation", "guide"],
  documentation: ["docs", "doc", "guides"],
  guide: ["tutorial", "howto", "docs", "manual"],
  guides: ["tutorials", "docs", "manuals"],
  reference: ["api", "docs", "spec"],
  api: ["reference", "docs", "endpoints"],
  auth: ["authentication", "login", "oauth"],
  authentication: ["auth", "login"],
  pricing: ["plans", "cost", "tier", "billing"],
  setting: ["settings", "preferences", "config"],
  settings: ["setting", "preferences", "config"],
  account: ["accounts", "profile", "user"],
  users: ["user", "accounts", "members"],
  user: ["users", "account", "profile"],
  install: ["installation", "setup", "quickstart", "getting-started"],
  installation: ["install", "setup", "quickstart"],
  quickstart: ["getting-started", "start", "install", "intro"],
  faq: ["help", "support", "questions"],
  changelog: ["releases", "updates", "history"],
  releases: ["changelog", "updates", "release-notes"]
};
function generateHallucinatedPaths(knownPaths) {
  const existingSet = new Set(knownPaths.map((p) => normalizePathname(p)));
  const candidateMap = /* @__PURE__ */ new Map();
  const addCandidate = (candPath, sourcePath, mutationType) => {
    const normalized = normalizePathname(candPath);
    if (normalized === "/" || existingSet.has(normalized) || candidateMap.has(normalized)) {
      return;
    }
    candidateMap.set(normalized, {
      path: normalized,
      sourcePath,
      mutationType
    });
  };
  for (const originalPath of knownPaths) {
    const norm = normalizePathname(originalPath);
    if (norm === "/") continue;
    const segments = norm.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const vMatch = /^(v|ver|version)?(\d+)$/i.exec(seg);
      if (vMatch) {
        const prefix = vMatch[1] || "v";
        const hasPrefix = Boolean(vMatch[1]);
        const num = parseInt(vMatch[2], 10);
        const variants = [];
        if (!hasPrefix && num > 10) {
        } else if (num <= 10) {
          for (let n = 1; n <= Math.max(num + 2, 4); n++) {
            if (n !== num) variants.push(n);
          }
        } else {
          for (let n = num - 1; n <= num + 2; n++) {
            if (n !== num && n > 0) variants.push(n);
          }
        }
        for (const varNum of variants) {
          const cloned = [...segments];
          cloned[i] = `${prefix}${varNum}`;
          addCandidate(`/${cloned.join("/")}`, norm, "version_drift");
        }
      }
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.endsWith("s") && seg.length > 3 && !seg.endsWith("ss")) {
        const singular = seg.slice(0, -1);
        const cloned = [...segments];
        cloned[i] = singular;
        addCandidate(`/${cloned.join("/")}`, norm, "pluralization");
      } else if (!seg.endsWith("s") && seg.length > 2) {
        const plural = `${seg}s`;
        const cloned = [...segments];
        cloned[i] = plural;
        addCandidate(`/${cloned.join("/")}`, norm, "pluralization");
      }
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.includes("-")) {
        const underscored = seg.replace(/-/g, "_");
        const flat = seg.replace(/-/g, "");
        const nested = seg.replace(/-/g, "/");
        const cloned1 = [...segments];
        cloned1[i] = underscored;
        addCandidate(`/${cloned1.join("/")}`, norm, "delimiter_drift");
        const cloned2 = [...segments];
        cloned2[i] = flat;
        addCandidate(`/${cloned2.join("/")}`, norm, "delimiter_drift");
        const cloned3 = [...segments];
        cloned3[i] = nested;
        addCandidate(`/${cloned3.join("/")}`, norm, "delimiter_drift");
      } else if (seg.includes("_")) {
        const hyphenated = seg.replace(/_/g, "-");
        const cloned = [...segments];
        cloned[i] = hyphenated;
        addCandidate(`/${cloned.join("/")}`, norm, "delimiter_drift");
      }
    }
    if (segments.length >= 2 && ["docs", "doc", "api", "guides", "guide"].includes(segments[0])) {
      const withoutPrefix = `/${segments.slice(1).join("/")}`;
      addCandidate(withoutPrefix, norm, "hierarchy_drift");
    } else if (segments.length === 1) {
      addCandidate(`/docs/${segments[0]}`, norm, "hierarchy_drift");
      addCandidate(`/api/${segments[0]}`, norm, "hierarchy_drift");
    }
    const lastSeg = segments[segments.length - 1];
    if (!lastSeg.includes(".")) {
      addCandidate(`${norm}.html`, norm, "extension_drift");
      addCandidate(`${norm}.md`, norm, "extension_drift");
    } else {
      const stripped = norm.replace(/\.[a-z0-9]+$/i, "");
      addCandidate(stripped, norm, "extension_drift");
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].toLowerCase();
      const synonyms = COMMON_SYNONYMS[seg];
      if (synonyms) {
        for (const syn of synonyms) {
          const cloned = [...segments];
          cloned[i] = syn;
          addCandidate(`/${cloned.join("/")}`, norm, "synonym_drift");
        }
      }
    }
  }
  return Array.from(candidateMap.values());
}
async function predictAndEvaluateHallucinations(pages, domain, maxCandidates = 50) {
  const resolvedUrls = pages.map(
    (p) => p.url.startsWith("http") ? p.url : `https://${domain}${p.url.startsWith("/") ? "" : "/"}${p.url}`
  );
  const pageEmbeddingTexts = pages.map(
    (p, i) => buildEmbeddingText({ url: resolvedUrls[i], title: p.title || "", description: p.description || "" })
  );
  const pageEmbeddings = await generateBatchEmbeddings(pageEmbeddingTexts);
  const pageRecords = pages.map((p, i) => ({
    id: i,
    siteId: domain,
    url: resolvedUrls[i],
    title: p.title || "",
    description: p.description || "",
    headings: p.headings || "[]",
    embedding: pageEmbeddings[i],
    lastSeen: (/* @__PURE__ */ new Date()).toISOString()
  }));
  const knownPaths = pages.map((p) => {
    try {
      const u = new URL(p.url, `https://${domain}`);
      return u.pathname;
    } catch {
      return p.url;
    }
  });
  const generated = generateHallucinatedPaths(knownPaths).slice(0, maxCandidates);
  const deadUrls = generated.map((item) => `https://${domain}${item.path}`);
  const candidateEmbeddings = await generateBatchEmbeddings(deadUrls.map((u) => deadUrlEmbeddingText(u)));
  const predictions = [];
  let recoveredCount = 0;
  const vulnerabilities = [];
  generated.forEach((item, i) => {
    const deadUrl = deadUrls[i];
    const suggestions = findSuggestions(deadUrl, pageRecords, candidateEmbeddings[i]);
    const top = suggestions[0];
    const intendedUrl = item.sourcePath.startsWith("http") ? item.sourcePath : `https://${domain}${item.sourcePath.startsWith("/") ? "" : "/"}${item.sourcePath}`;
    let recovered = false;
    let confidence = 0;
    if (top) {
      confidence = top.score;
      recovered = normalizePathname(top.url) === normalizePathname(intendedUrl);
    }
    if (recovered) {
      recoveredCount++;
    } else {
      vulnerabilities.push({
        path: item.path,
        reason: top ? `Top suggestion (${(top.score * 100).toFixed(0)}% match) points to the wrong page for ${item.mutationType}` : `No suggestions found for ${item.mutationType}`
      });
    }
    predictions.push({
      hallucinatedPath: item.path,
      intendedUrl,
      mutationType: item.mutationType,
      topSuggestion: top,
      recovered,
      confidence
    });
  });
  const totalTested = predictions.length;
  const recoveryRate = totalTested > 0 ? Math.round(recoveredCount / totalTested * 100) / 100 : 0;
  return {
    totalTested,
    recoveredCount,
    recoveryRate,
    vulnerabilities: vulnerabilities.slice(0, 10),
    predictions
  };
}

// src/api/domain.ts
var DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
function normalizeDomain(raw) {
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
  if (!domain || domain.length > 253 || !DOMAIN_REGEX.test(domain)) {
    return null;
  }
  return domain.toLowerCase();
}

// src/engine/readiness-score.ts
var READINESS_WEIGHTS = {
  /** Clean HTTP 404 on the dead path. */
  statusClean: 25,
  /** Consolation credit for a soft-404 (200-399) that still isn't a true 404. */
  statusSoft: 5,
  /** Link: rel="alternate" response headers present. */
  linkHeaders: 20,
  /** schema.org/ItemList JSON-LD present in the 404 body. */
  jsonLd: 15,
  /** CLI only: hallucinated-path recovery rate from the sitemap-crawl stress test. */
  hallucinationRecovery: 25,
  /** CLI only: internal broken-link health from the sitemap crawl. */
  brokenLinkHealth: 15,
  /** Web quick-check only: single-probe substitute for the two CLI-only checks above. */
  hasSuggestions: 40
};
function scoreCleanStatus(httpStatus) {
  if (httpStatus === 404) return READINESS_WEIGHTS.statusClean;
  if (httpStatus >= 200 && httpStatus < 400) return READINESS_WEIGHTS.statusSoft;
  return 0;
}
function scoreLinkHeaders(present) {
  return present ? READINESS_WEIGHTS.linkHeaders : 0;
}
function scoreJsonLd(present) {
  return present ? READINESS_WEIGHTS.jsonLd : 0;
}
function scoreHallucinationRecovery(recoveryRate) {
  return Math.round(recoveryRate * READINESS_WEIGHTS.hallucinationRecovery);
}
function scoreBrokenLinkHealth(brokenCount) {
  if (brokenCount === 0) return READINESS_WEIGHTS.brokenLinkHealth;
  if (brokenCount < 3) return Math.round(READINESS_WEIGHTS.brokenLinkHealth * 2 / 3);
  if (brokenCount < 8) return Math.round(READINESS_WEIGHTS.brokenLinkHealth / 3);
  return 0;
}

// src/cli/format.ts
var c = {
  reset: (text, noColor = false) => noColor ? text : `\x1B[0m${text}\x1B[0m`,
  bold: (text, noColor = false) => noColor ? text : `\x1B[1m${text}\x1B[22m`,
  dim: (text, noColor = false) => noColor ? text : `\x1B[2m${text}\x1B[22m`,
  green: (text, noColor = false) => noColor ? text : `\x1B[32m${text}\x1B[39m`,
  yellow: (text, noColor = false) => noColor ? text : `\x1B[33m${text}\x1B[39m`,
  red: (text, noColor = false) => noColor ? text : `\x1B[31m${text}\x1B[39m`,
  cyan: (text, noColor = false) => noColor ? text : `\x1B[36m${text}\x1B[39m`,
  magenta: (text, noColor = false) => noColor ? text : `\x1B[35m${text}\x1B[39m`,
  gray: (text, noColor = false) => noColor ? text : `\x1B[90m${text}\x1B[39m`,
  bgGreen: (text, noColor = false) => noColor ? text : `\x1B[42m\x1B[30m${text}\x1B[0m`,
  bgYellow: (text, noColor = false) => noColor ? text : `\x1B[43m\x1B[30m${text}\x1B[0m`,
  bgRed: (text, noColor = false) => noColor ? text : `\x1B[41m\x1B[37m${text}\x1B[0m`
};
function renderBanner(noColor = false) {
  const title = c.bold(c.cyan("agent-404 audit", noColor), noColor);
  const subtitle = c.gray("\u2014 Make 404 pages agent-friendly for AI crawlers & LLMs", noColor);
  return `
${title} ${subtitle}
`;
}
function renderScoreBadge(score, noColor = false) {
  let badge;
  let label;
  if (score >= 80) {
    badge = c.bgGreen(`  ${score}/100  `, noColor);
    label = c.green("Agent-Ready (Structured recovery signals present)", noColor);
  } else if (score >= 50) {
    badge = c.bgYellow(`  ${score}/100  `, noColor);
    label = c.yellow("Degraded (Missing Link headers or JSON-LD)", noColor);
  } else {
    badge = c.bgRed(`  ${score}/100  `, noColor);
    label = c.red("Critical (Bare 404 / crawlers get no recovery data)", noColor);
  }
  return `
  ${c.bold("Agent Readiness Score:", noColor)} ${badge} ${label}
`;
}
function renderSectionHeader(title, noColor = false) {
  return `
${c.bold(c.cyan(`\u2500\u2500 ${title} \u2500\u2500`, noColor), noColor)}
`;
}
function renderCheckItem(pass, text, details, noColor = false) {
  const icon = pass ? c.green("\u2713", noColor) : c.red("\u2717", noColor);
  const primary = pass ? text : c.bold(text, noColor);
  const sub = details ? `
    ${c.gray(details, noColor)}` : "";
  return `  ${icon} ${primary}${sub}`;
}
function renderDiffBox(current, withAgent404, noColor = false) {
  const lines = [];
  lines.push(`  ${c.bold("Today's Crawler View (ClaudeBot / GPTBot):", noColor)}`);
  lines.push(`    HTTP Status: ${current.status === 404 ? c.yellow("404 Not Found", noColor) : c.red(`HTTP ${current.status}`, noColor)}`);
  lines.push(`    Recovery Link Header: ${current.headersSnippet?.link ? c.green(current.headersSnippet.link, noColor) : c.red("(none \u2014 crawler abandons path)", noColor)}`);
  lines.push(`    Schema.org JSON-LD: ${current.recoverySupported ? c.green("Found", noColor) : c.red("Missing", noColor)}`);
  lines.push(`
  ${c.bold("With agent-404:", noColor)}`);
  lines.push(`    HTTP Status: ${c.green("404 Not Found", noColor)}`);
  lines.push(`    Recovery Link Header: ${c.green(withAgent404.linkHeader, noColor)}`);
  lines.push(`    JSON-LD: ${c.green(`<script type="application/ld+json"> {"@type": "${withAgent404.jsonLdType}"} </script>`, noColor)}`);
  return lines.join("\n");
}

// src/cli/audit.ts
async function runCliAudit(options) {
  const rawDomain = options.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const domain = normalizeDomain(rawDomain);
  if (!domain || isBlockedInternalHost(domain)) {
    throw new Error(`Invalid or disallowed domain: ${options.domain}`);
  }
  const deadPath = options.deadPath || "/docs/non-existent-probe";
  const crawlLimit = options.crawlLimit ?? 30;
  const minScore = options.minScore ?? 70;
  const probe = await probeClaudeBotResponse(domain, deadPath);
  let discoveredPages = [];
  let discoverySource = "none";
  try {
    const discovery = await discoverDemoPages(domain, deadPath);
    discoveredPages = discovery.pages.slice(0, crawlLimit);
    discoverySource = discovery.source;
  } catch {
    discoveredPages = [{ url: `https://${domain}`, title: domain }];
  }
  if (discoveredPages.length === 0) {
    discoveredPages = [{ url: `https://${domain}`, title: domain }];
  }
  let analysis;
  try {
    analysis = await analyzeSite(
      discoveredPages.map((p) => ({ url: p.url, title: p.title })),
      domain
    );
  } catch {
  }
  const hallucinationSummary = await predictAndEvaluateHallucinations(
    discoveredPages,
    domain,
    30
  );
  const brokenCount = analysis?.brokenLinks.length ?? 0;
  const score = scoreCleanStatus(probe.status) + scoreLinkHeaders(probe.hasLinkHeaders) + scoreJsonLd(probe.hasJsonLd) + scoreHallucinationRecovery(hallucinationSummary.recoveryRate) + scoreBrokenLinkHealth(brokenCount);
  const pass = score >= minScore && probe.status === 404;
  const recommendations = [];
  if (!probe.hasLinkHeaders) {
    recommendations.push("Add Link alternate response headers to 404 responses for header-only agents.");
  }
  if (!probe.hasJsonLd) {
    recommendations.push("Include schema.org/ItemList JSON-LD in the 404 HTML body with ranked suggestions.");
  }
  if (probe.status !== 404) {
    recommendations.push("Ensure dead URLs return a true HTTP 404 status instead of 200/soft-404.");
  }
  if (brokenCount > 0) {
    recommendations.push(`Fix ${brokenCount} internal broken link(s) discovered during sitemap crawl.`);
  }
  if (hallucinationSummary.recoveryRate < 0.8) {
    recommendations.push("Enhance route indexing and sitemap coverage to recover hallucinated version/plural paths.");
  }
  return {
    domain,
    targetDeadUrl: probe.targetUrl,
    score,
    status: pass ? "pass" : "fail",
    probe,
    pagesDiscovered: discoveredPages.length,
    discoverySource,
    brokenLinksCount: brokenCount,
    orphanPagesCount: analysis?.orphanPages.length ?? 0,
    hallucinationSummary,
    analysis,
    recommendations
  };
}
function printCliAuditReport(result, noColor = false) {
  console.log(renderBanner(noColor));
  console.log(`  ${c.bold("Domain:", noColor)} ${c.cyan(result.domain, noColor)}`);
  console.log(`  ${c.bold("Dead Path Probed:", noColor)} ${c.gray(result.targetDeadUrl, noColor)}`);
  console.log(`  ${c.bold("Pages Discovered:", noColor)} ${result.pagesDiscovered} (${result.discoverySource})`);
  console.log(renderScoreBadge(result.score, noColor));
  console.log(renderSectionHeader("AI Crawler Response Probe (ClaudeBot)", noColor));
  console.log(renderDiffBox(result.probe.comparison.current, result.probe.comparison.withAgent404, noColor));
  console.log(renderSectionHeader("Readiness Checklist", noColor));
  console.log(renderCheckItem(result.probe.status === 404, "HTTP 404 Status Code", `Returned HTTP ${result.probe.status}`, noColor));
  console.log(renderCheckItem(result.probe.hasLinkHeaders, "Link Alternate Headers", result.probe.hasLinkHeaders ? "Present" : "Missing", noColor));
  console.log(renderCheckItem(result.probe.hasJsonLd, "Schema.org ItemList JSON-LD", result.probe.hasJsonLd ? "Present" : "Missing", noColor));
  console.log(
    renderCheckItem(
      result.hallucinationSummary.recoveryRate >= 0.7,
      `AI Hallucination Resilience (${(result.hallucinationSummary.recoveryRate * 100).toFixed(0)}% recovery rate)`,
      `${result.hallucinationSummary.recoveredCount}/${result.hallucinationSummary.totalTested} simulated LLM queries recovered`,
      noColor
    )
  );
  console.log(
    renderCheckItem(
      result.brokenLinksCount === 0,
      `Internal Link Health (${result.brokenLinksCount} broken internal links)`,
      result.brokenLinksCount === 0 ? "No broken internal links found" : `${result.brokenLinksCount} broken links detected`,
      noColor
    )
  );
  if (result.hallucinationSummary.predictions.length > 0) {
    console.log(renderSectionHeader("Simulated AI Agent Queries (Sample)", noColor));
    for (const pred of result.hallucinationSummary.predictions.slice(0, 5)) {
      const icon = pred.recovered ? c.green("\u2713", noColor) : c.red("\u2717", noColor);
      const target = pred.topSuggestion?.url ? c.cyan(pred.topSuggestion.url, noColor) : c.gray("(none)", noColor);
      const scorePct = pred.topSuggestion ? ` [${(pred.topSuggestion.score * 100).toFixed(0)}% match]` : "";
      console.log(`  ${icon} ${c.bold(pred.hallucinatedPath, noColor)} \u2192 ${target}${scorePct} ${c.gray(`(${pred.mutationType})`, noColor)}`);
    }
  }
  if (result.recommendations.length > 0) {
    console.log(renderSectionHeader("Recommended Actions", noColor));
    for (const rec of result.recommendations) {
      console.log(`  ${c.yellow("\u2192", noColor)} ${rec}`);
    }
  }
  console.log(renderSectionHeader("Quick Install", noColor));
  console.log(`  ${c.bold("Next.js:", noColor)}   ${c.cyan("npm i @agent-404/next", noColor)}`);
  console.log(`  ${c.bold("Express:", noColor)}   ${c.cyan("npm i @agent-404/express", noColor)}`);
  console.log(`  ${c.bold("Workers:", noColor)}   ${c.cyan("npm i @agent-404/cloudflare", noColor)}`);
  console.log(`  ${c.bold("Snippet:", noColor)}   ${c.cyan(`<script src="https://agent404.dev/agent-404.min.js" data-site-id="${result.domain}" defer></script>`, noColor)}
`);
}

// src/cli/index.ts
var VERSION = "0.1.0";
function printHelp() {
  console.log(renderBanner());
  console.log(`Usage:
  npx agent-404 audit <domain-or-url> [options]
  npx agent-404 --help
  npx agent-404 --version

Commands:
  audit <domain>        Run an agent-readiness and 404 recovery audit on a live domain

Options:
  --dead-path <path>    Dead URL path to probe (default: /docs/non-existent-probe)
  --crawl-limit <n>     Max pages to crawl for sitemap discovery (default: 30)
  --ci                  Exit with non-zero code if score < min-score (useful for CI)
  --min-score <n>       Minimum acceptable score in CI mode (default: 70)
  --json                Output raw JSON report instead of formatted terminal UI
  --no-color            Disable ANSI terminal colors
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  npx agent-404 audit example.com
  npx agent-404 audit stripe.com --ci --min-score 75
  npx agent-404 audit https://docs.github.com --json
`);
}
async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
    printHelp();
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version") || argv[0] === "version") {
    console.log(`agent-404 v${VERSION}`);
    return 0;
  }
  const command = argv[0];
  let domainArg = "";
  if (command === "audit") {
    domainArg = argv[1] || "";
  } else if (!command.startsWith("-")) {
    domainArg = command;
  }
  if (!domainArg || domainArg.startsWith("-")) {
    console.error(c.red("Error: Please specify a domain to audit. (e.g. npx agent-404 audit example.com)\n"));
    printHelp();
    return 1;
  }
  const noColor = argv.includes("--no-color");
  const json = argv.includes("--json");
  const ci = argv.includes("--ci");
  let deadPath;
  const deadPathIdx = argv.indexOf("--dead-path");
  if (deadPathIdx !== -1 && argv[deadPathIdx + 1]) {
    deadPath = argv[deadPathIdx + 1];
  }
  let minScore = 70;
  const minScoreIdx = argv.indexOf("--min-score");
  if (minScoreIdx !== -1 && argv[minScoreIdx + 1]) {
    const parsed = parseInt(argv[minScoreIdx + 1], 10);
    if (!Number.isNaN(parsed)) minScore = parsed;
  }
  let crawlLimit = 30;
  const crawlLimitIdx = argv.indexOf("--crawl-limit");
  if (crawlLimitIdx !== -1 && argv[crawlLimitIdx + 1]) {
    const parsed = parseInt(argv[crawlLimitIdx + 1], 10);
    if (!Number.isNaN(parsed)) crawlLimit = parsed;
  }
  const options = {
    domain: domainArg,
    deadPath,
    crawlLimit,
    json,
    ci,
    minScore,
    noColor
  };
  try {
    if (!json) {
      console.log(c.gray(`
Auditing ${domainArg} for AI agent readiness...`, noColor));
    }
    const result = await runCliAudit(options);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printCliAuditReport(result, noColor);
    }
    if (ci && result.score < minScore) {
      if (!json) {
        console.error(
          c.red(`
CI Gate Failed: Agent Readiness Score (${result.score}) is below minimum threshold (${minScore}).
`, noColor)
        );
      }
      return 1;
    }
    return 0;
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ error: err?.message || "Audit failed" }, null, 2));
    } else {
      console.error(c.red(`
Audit failed: ${err?.message || err}
`, noColor));
    }
    return 1;
  }
}

// bin/agent-404.ts
main().then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
});

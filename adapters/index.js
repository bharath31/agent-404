import { recover404, fetchSuggestions, buildJsonLd, buildLinkHeader, prefersJson, injectRecoveryHtml } from "./core.js";
import { agent404, renderNotFoundPage, notFoundSuggestions } from "./next.js";
import { agent404Worker } from "./cloudflare.js";
import { agent404Netlify } from "./netlify.js";
export {
  agent404,
  agent404Netlify,
  agent404Worker,
  buildJsonLd,
  buildLinkHeader,
  fetchSuggestions,
  injectRecoveryHtml,
  notFoundSuggestions,
  prefersJson,
  recover404,
  renderNotFoundPage
};

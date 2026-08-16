export { recover404, fetchSuggestions, buildJsonLd, buildLinkHeader, prefersJson, injectRecoveryHtml } from "./core.js";
export { agent404, renderNotFoundPage, notFoundSuggestions } from "./next.js";
export { agent404Worker } from "./cloudflare.js";
export { agent404Netlify } from "./netlify.js";
// recoverExpress404 imports node:http — import from "./adapters/express.js" in Node only.

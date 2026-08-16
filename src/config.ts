/** Canonical hosted origin. Apex (agent404.dev) 307-redirects to www; CORS
 *  preflights cannot follow redirects, so every public URL must use www. */
export const CANONICAL_ORIGIN = "https://www.agent404.dev";
export const CANONICAL_SCRIPT_URL = `${CANONICAL_ORIGIN}/agent-404.min.js`;

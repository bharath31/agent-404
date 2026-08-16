/**
 * Fallback when the esbuild `__AGENT404_API_BASE__` define is missing (unit tests,
 * unbundled source). Keep this literal in lockstep with `CANONICAL_ORIGIN` in
 * `src/config.ts`. This file cannot import that module: it is bundled for the
 * browser and must stay free of server/Node imports.
 */
export const DEFAULT_API_BASE = "https://www.agent404.dev";

declare const __AGENT404_API_BASE__: string | undefined;

/**
 * Resolve the API origin independently of `script.src`.
 * `data-api-base` overrides for self-hosters; otherwise the build-time
 * canonical origin is used so a redirected CDN host cannot break preflight.
 */
export function resolveApiBase(script: {
	getAttribute(name: string): string | null;
}): string {
	const override = script.getAttribute("data-api-base")?.trim();
	if (override) {
		try {
			return new URL(override).origin;
		} catch {
			console.warn("[agent-404] Invalid data-api-base; using canonical API origin");
		}
	}

	if (typeof __AGENT404_API_BASE__ === "string" && __AGENT404_API_BASE__.length > 0) {
		try {
			return new URL(__AGENT404_API_BASE__).origin;
		} catch {
			console.warn("[agent-404] Invalid baked-in API origin; using default");
		}
	}

	return DEFAULT_API_BASE;
}

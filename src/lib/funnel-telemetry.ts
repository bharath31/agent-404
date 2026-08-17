import type { StorageAdapter } from "../storage/interface.js";
import type { FunnelStep, FunnelConversionMetrics } from "../types.js";

export type { FunnelStep, FunnelConversionMetrics };

/**
 * Record a step in the audit-to-install conversion funnel (BAT-42).
 *
 * Backed by durable storage (Postgres `funnel_events`, see
 * `PostgresStorage#recordFunnelEvent`) rather than a module-level in-memory
 * buffer — on Vercel/Cloudflare there's no guarantee requests land on the
 * same isolate, and cold starts reset module state entirely, so an in-memory
 * buffer only ever reflected a partial, effectively-random slice of traffic.
 *
 * Fire-and-forget: telemetry must never break the request it's attached to.
 * Callers do not need to await this call; failures are swallowed. The
 * returned promise is exposed so tests can await it for determinism. If no
 * storage is available (e.g. DATABASE_URL not configured), this is a no-op.
 */
export function trackFunnelEvent(
	storage: StorageAdapter | undefined,
	step: FunnelStep,
	domain?: string,
	metadata?: Record<string, unknown>,
): Promise<void> {
	if (!storage) return Promise.resolve();

	const normalizedDomain = domain
		?.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");

	return storage.recordFunnelEvent(step, normalizedDomain, metadata).catch(() => {});
}

/**
 * Compute aggregate conversion metrics across all funnel stages, read from
 * durable storage rather than whatever happens to be in one instance's
 * in-memory buffer.
 */
export function getFunnelMetrics(storage: StorageAdapter): Promise<FunnelConversionMetrics> {
	return storage.getFunnelMetrics();
}

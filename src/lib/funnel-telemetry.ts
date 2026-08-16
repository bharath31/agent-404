export type FunnelStep =
	| "audit_started"
	| "audit_completed"
	| "report_shared"
	| "install_cta_clicked"
	| "site_registered"
	| "install_verified";

export interface FunnelEvent {
	step: FunnelStep;
	domain?: string;
	metadata?: Record<string, unknown>;
	timestamp: string;
}

export interface FunnelConversionMetrics {
	totalAuditsStarted: number;
	totalAuditsCompleted: number;
	totalReportsShared: number;
	totalInstallCtaClicks: number;
	totalSitesRegistered: number;
	totalInstallsVerified: number;
	rates: {
		auditCompletionRate: number; // completed / started
		reportShareRate: number; // shared / completed
		installCtaRate: number; // cta / completed
		registrationRate: number; // registered / cta
		verificationRate: number; // verified / registered
		overallFunnelConversion: number; // verified / started
	};
}

// In-memory sliding buffer for funnel events (persists across isolate requests, bounded to 10k items)
const MAX_EVENTS = 10_000;
const eventsBuffer: FunnelEvent[] = [];

/**
 * Record a step in the audit-to-install conversion funnel (BAT-42).
 */
export function trackFunnelEvent(
	step: FunnelStep,
	domain?: string,
	metadata?: Record<string, unknown>,
): FunnelEvent {
	const event: FunnelEvent = {
		step,
		domain: domain?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""),
		metadata,
		timestamp: new Date().toISOString(),
	};

	if (eventsBuffer.length >= MAX_EVENTS) {
		eventsBuffer.shift();
	}
	eventsBuffer.push(event);
	return event;
}

/**
 * Compute aggregate conversion metrics across all funnel stages.
 */
export function getFunnelMetrics(): FunnelConversionMetrics {
	let started = 0;
	let completed = 0;
	let shared = 0;
	let cta = 0;
	let registered = 0;
	let verified = 0;

	for (const e of eventsBuffer) {
		switch (e.step) {
			case "audit_started":
				started++;
				break;
			case "audit_completed":
				completed++;
				break;
			case "report_shared":
				shared++;
				break;
			case "install_cta_clicked":
				cta++;
				break;
			case "site_registered":
				registered++;
				break;
			case "install_verified":
				verified++;
				break;
		}
	}

	const safeRate = (num: number, denom: number) =>
		denom > 0 ? Math.round((num / denom) * 1000) / 1000 : 0;

	return {
		totalAuditsStarted: started,
		totalAuditsCompleted: completed,
		totalReportsShared: shared,
		totalInstallCtaClicks: cta,
		totalSitesRegistered: registered,
		totalInstallsVerified: verified,
		rates: {
			auditCompletionRate: safeRate(completed, started),
			reportShareRate: safeRate(shared, completed),
			installCtaRate: safeRate(cta, completed),
			registrationRate: safeRate(registered, cta),
			verificationRate: safeRate(verified, registered),
			overallFunnelConversion: safeRate(verified, started),
		},
	};
}

/**
 * Clear events buffer (for test isolation).
 */
export function resetFunnelEvents(): void {
	eventsBuffer.length = 0;
}

import { describe, expect, it } from "vitest";
import { trackFunnelEvent, getFunnelMetrics } from "../src/lib/funnel-telemetry.js";
import type { StorageAdapter } from "../src/storage/interface.js";
import type { FunnelStep, FunnelConversionMetrics } from "../src/types.js";

// Minimal in-memory StorageAdapter double, scoped to funnel events only —
// every other method throws if a test accidentally exercises it.
class FakeFunnelStorage implements Partial<StorageAdapter> {
	events: { step: FunnelStep; domain?: string; metadata?: Record<string, unknown> }[] = [];

	async recordFunnelEvent(
		step: FunnelStep,
		domain?: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		this.events.push({ step, domain, metadata });
	}

	async getFunnelMetrics(): Promise<FunnelConversionMetrics> {
		const count = (step: FunnelStep) => this.events.filter((e) => e.step === step).length;
		const started = count("audit_started");
		const completed = count("audit_completed");
		const shared = count("report_shared");
		const cta = count("install_cta_clicked");
		const registered = count("site_registered");
		const verified = count("install_verified");
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
}

function newStorage(): StorageAdapter {
	return new FakeFunnelStorage() as unknown as StorageAdapter;
}

describe("Funnel Telemetry (BAT-42)", () => {
	it("tracks funnel progression and computes conversion rates from durable storage", async () => {
		const storage = newStorage();

		// Step 1: 10 Audits started
		for (let i = 0; i < 10; i++) {
			await trackFunnelEvent(storage, "audit_started", `site-${i}.com`);
		}

		// Step 2: 8 Audits completed
		for (let i = 0; i < 8; i++) {
			await trackFunnelEvent(storage, "audit_completed", `site-${i}.com`, { score: 70 });
		}

		// Step 3: 4 Reports shared
		for (let i = 0; i < 4; i++) {
			await trackFunnelEvent(storage, "report_shared", `site-${i}.com`);
		}

		// Step 4: 4 CTA clicks
		for (let i = 0; i < 4; i++) {
			await trackFunnelEvent(storage, "install_cta_clicked", `site-${i}.com`);
		}

		// Step 5: 2 Sites registered
		await trackFunnelEvent(storage, "site_registered", "site-0.com");
		await trackFunnelEvent(storage, "site_registered", "site-1.com");

		// Step 6: 1 Verified working
		await trackFunnelEvent(storage, "install_verified", "site-0.com");

		const metrics = await getFunnelMetrics(storage);

		expect(metrics.totalAuditsStarted).toBe(10);
		expect(metrics.totalAuditsCompleted).toBe(8);
		expect(metrics.totalReportsShared).toBe(4);
		expect(metrics.totalInstallCtaClicks).toBe(4);
		expect(metrics.totalSitesRegistered).toBe(2);
		expect(metrics.totalInstallsVerified).toBe(1);

		expect(metrics.rates.auditCompletionRate).toBe(0.8); // 8/10
		expect(metrics.rates.reportShareRate).toBe(0.5); // 4/8
		expect(metrics.rates.installCtaRate).toBe(0.5); // 4/8
		expect(metrics.rates.registrationRate).toBe(0.5); // 2/4
		expect(metrics.rates.verificationRate).toBe(0.5); // 1/2
		expect(metrics.rates.overallFunnelConversion).toBe(0.1); // 1/10
	});

	it("handles empty funnel safely without division by zero", async () => {
		const storage = newStorage();
		const metrics = await getFunnelMetrics(storage);
		expect(metrics.totalAuditsStarted).toBe(0);
		expect(metrics.rates.auditCompletionRate).toBe(0);
		expect(metrics.rates.overallFunnelConversion).toBe(0);
	});

	it("normalizes the domain the same way the old in-memory buffer did", async () => {
		const storage = new FakeFunnelStorage();
		await trackFunnelEvent(
			storage as unknown as StorageAdapter,
			"audit_started",
			"HTTPS://Example.com/foo/",
		);
		expect(storage.events[0].domain).toBe("example.com/foo");
	});

	it("is a no-op that never throws when storage is unavailable", async () => {
		await expect(trackFunnelEvent(undefined, "audit_started", "site.com")).resolves.toBeUndefined();
	});

	it("swallows storage failures instead of rejecting (telemetry must never break the request)", async () => {
		const storage: StorageAdapter = {
			recordFunnelEvent: async () => {
				throw new Error("db unavailable");
			},
		} as unknown as StorageAdapter;

		await expect(
			trackFunnelEvent(storage, "audit_started", "site.com"),
		).resolves.toBeUndefined();
	});

	it("records the full production funnel sequence including post-share stages", async () => {
		const storage = newStorage();

		// audit_started from POST /api/audit
		await trackFunnelEvent(storage, "audit_started", "site.com", { deadPath: "/x" });
		// audit_completed from POST /api/audit success
		await trackFunnelEvent(storage, "audit_completed", "site.com", { auditId: "a1", score: 70 });
		// report_shared from GET /api/audit/:id?share=1 (explicit share only)
		await trackFunnelEvent(storage, "report_shared", "site.com", { auditId: "a1" });
		// install_cta_clicked from POST /api/funnel/install-cta beacon
		await trackFunnelEvent(storage, "install_cta_clicked", "site.com");
		// site_registered from POST /api/sites
		await trackFunnelEvent(storage, "site_registered", "site.com");
		// install_verified from first indexed page (POST /api/register)
		await trackFunnelEvent(storage, "install_verified", "site.com");

		const metrics = await getFunnelMetrics(storage);
		expect(metrics.totalAuditsStarted).toBe(1);
		expect(metrics.totalAuditsCompleted).toBe(1);
		expect(metrics.totalReportsShared).toBe(1);
		expect(metrics.totalInstallCtaClicks).toBe(1);
		expect(metrics.totalSitesRegistered).toBe(1);
		expect(metrics.totalInstallsVerified).toBe(1);
		expect(metrics.rates.overallFunnelConversion).toBe(1);
	});
});

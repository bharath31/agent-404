import { describe, expect, it, beforeEach } from "vitest";
import {
	trackFunnelEvent,
	getFunnelMetrics,
	resetFunnelEvents,
} from "../src/lib/funnel-telemetry.js";

describe("Funnel Telemetry (BAT-42)", () => {
	beforeEach(() => {
		resetFunnelEvents();
	});

	it("tracks funnel progression and computes conversion rates", () => {
		// Step 1: 10 Audits started
		for (let i = 0; i < 10; i++) {
			trackFunnelEvent("audit_started", `site-${i}.com`);
		}

		// Step 2: 8 Audits completed
		for (let i = 0; i < 8; i++) {
			trackFunnelEvent("audit_completed", `site-${i}.com`, { score: 70 });
		}

		// Step 3: 4 Reports shared
		for (let i = 0; i < 4; i++) {
			trackFunnelEvent("report_shared", `site-${i}.com`);
		}

		// Step 4: 4 CTA clicks
		for (let i = 0; i < 4; i++) {
			trackFunnelEvent("install_cta_clicked", `site-${i}.com`);
		}

		// Step 5: 2 Sites registered
		trackFunnelEvent("site_registered", "site-0.com");
		trackFunnelEvent("site_registered", "site-1.com");

		// Step 6: 1 Verified working
		trackFunnelEvent("install_verified", "site-0.com");

		const metrics = getFunnelMetrics();

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

	it("handles empty funnel safely without division by zero", () => {
		const metrics = getFunnelMetrics();
		expect(metrics.totalAuditsStarted).toBe(0);
		expect(metrics.rates.auditCompletionRate).toBe(0);
		expect(metrics.rates.overallFunnelConversion).toBe(0);
	});
});

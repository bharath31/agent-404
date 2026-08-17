import { describe, expect, it } from "vitest";
import {
	scoreCleanStatus,
	scoreLinkHeaders,
	scoreJsonLd,
	scoreHallucinationRecovery,
	scoreBrokenLinkHealth,
	READINESS_WEIGHTS,
} from "../src/engine/readiness-score.js";

describe("Agent Readiness Score (BAT-40/46 shared weights)", () => {
	it("awards full clean-status points only for a true 404", () => {
		expect(scoreCleanStatus(404)).toBe(READINESS_WEIGHTS.statusClean); // 25
		expect(scoreCleanStatus(200)).toBe(READINESS_WEIGHTS.statusSoft); // 5
		expect(scoreCleanStatus(500)).toBe(0);
	});

	it("awards link-header and JSON-LD points only when present", () => {
		expect(scoreLinkHeaders(true)).toBe(READINESS_WEIGHTS.linkHeaders); // 20
		expect(scoreLinkHeaders(false)).toBe(0);
		expect(scoreJsonLd(true)).toBe(READINESS_WEIGHTS.jsonLd); // 15
		expect(scoreJsonLd(false)).toBe(0);
	});

	it("gives zero hallucination-recovery points when nothing was testable", () => {
		// An un-crawlable site that can't generate hallucinated candidates must
		// NOT receive the full 25 points as if it recovered everything.
		expect(scoreHallucinationRecovery(0)).toBe(0);
		expect(scoreHallucinationRecovery(1)).toBe(READINESS_WEIGHTS.hallucinationRecovery);
		expect(scoreHallucinationRecovery(0.5)).toBe(Math.round(25 * 0.5));
	});

	it("rewards clean broken-link health only when there are no broken links", () => {
		expect(scoreBrokenLinkHealth(0)).toBe(READINESS_WEIGHTS.brokenLinkHealth); // 15
		expect(scoreBrokenLinkHealth(2)).toBe(10);
		expect(scoreBrokenLinkHealth(5)).toBe(5);
		expect(scoreBrokenLinkHealth(10)).toBe(0);
	});
});

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

let css: string;

beforeAll(async () => {
	css = await readFile(new URL("../src/app/public.module.css", import.meta.url), "utf8");
});

function ruleBlock(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
	if (!match) throw new Error(`rule not found in public.module.css: ${selector}`);
	return match[1];
}

describe("landing request-trace card", () => {
	it("keeps the trace-step grid column shrinkable so long content cannot widen the rail", () => {
		expect(ruleBlock(".traceStep")).toContain("grid-template-columns: 46px minmax(0, 1fr)");
	});

	it("lets the trace-step row shrink below its content width", () => {
		expect(ruleBlock(".traceStep div")).toContain("min-width: 0");
	});

	it("contains right-aligned trace metadata inside the card instead of clipping it", () => {
		const block = ruleBlock(".traceStep code");
		expect(block).toContain("min-width: 0");
		expect(block).toContain("overflow: hidden");
		expect(block).toContain("text-overflow: ellipsis");
		expect(block).toContain("white-space: nowrap");
	});

	it("draws the vertical rail on the trace rail, not the whole card, so it cannot run through the topbar", () => {
		const card = css.match(/\.heroEvidence\s*\{[^}]*\}/)?.[0] ?? "";
		expect(card).not.toContain("::before");
		const rail = ruleBlock(".traceRail::before");
		expect(rail).toContain("top: 0");
		expect(rail).toContain("bottom: 0");
		expect(ruleBlock(".traceRail")).toContain("position: relative");
	});

	it("keeps the trace card structure with right-aligned step metadata", async () => {
		const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
		expect(page).toContain('aria-label="Live recovery protocol trace"');
		expect(page).toContain("styles.traceRail");
		expect(page.match(/styles\.traceStep/g)?.length).toBeGreaterThanOrEqual(3);
		expect(page).not.toContain("styles.traceStep > code");
	});
});

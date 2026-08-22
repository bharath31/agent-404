import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecoveryChart } from "../src/components/dashboard/recovery-chart";
import { RecoveryTrace } from "../src/components/dashboard/recovery-trace";

describe("Next dashboard UI", () => {
	it("renders no-data recovery honestly instead of presenting a false zero", () => {
		const html = renderToStaticMarkup(RecoveryChart({ points: [] }));
		expect(html).toContain("No recovery data for this period");
		expect(html).not.toContain("0%");
	});

	it("uses the four protocol stages as the signature recovery trace", () => {
		const html = renderToStaticMarkup(RecoveryTrace({
			request: "https://example.com/docs/removed",
			match: "https://example.com/docs/current",
			hasProtocolEvidence: true,
			destination: "https://example.com/docs/current",
		}));
		expect(html).toContain("404 request");
		expect(html).toContain("matcher");
		expect(html).toContain("Link / JSON-LD");
		expect(html).toContain("destination");
	});

	it("defines the approved light/dark tokens and reduced-motion fallback", async () => {
		const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
		expect(css).toContain("--canvas: #fafafa");
		expect(css).toContain("--signal: #1fa971");
		expect(css).toContain('--canvas: #000000');
		expect(css).toContain("--signal: #45d699");
		expect(css).toContain("prefers-reduced-motion: reduce");
	});

	it("ships every site-scoped route as a separate page", async () => {
		const routes = ["page.tsx", "activity/page.tsx", "pages/page.tsx", "installation/page.tsx", "settings/page.tsx"];
		for (const route of routes) {
			const source = await readFile(new URL(`../src/app/dashboard/[domain]/${route}`, import.meta.url), "utf8");
			expect(source.length).toBeGreaterThan(100);
			expect(source).not.toMatch(/\.apiKey\b/);
		}
	});
});

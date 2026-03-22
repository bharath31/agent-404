import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeSite } from "../src/engine/analyzer.js";

const pages = [
	{ url: "https://example.com/docs/auth", title: "Auth" },
	{ url: "https://example.com/docs/billing", title: "Billing" },
	{ url: "https://example.com/docs/getting-started", title: "Getting Started" },
];

function makeHtml(links: string[]): string {
	const anchors = links.map((l) => `<a href="${l}">link</a>`).join("");
	return `<html><body>${anchors}</body></html>`;
}

describe("analyzeSite", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url === "https://example.com/docs/auth") {
					return new Response(
						makeHtml(["/docs/billing", "/docs/nonexistent"]),
						{ status: 200 },
					);
				}
				if (url === "https://example.com/docs/billing") {
					return new Response(
						makeHtml(["/docs/auth", "/docs/getting-started"]),
						{ status: 200 },
					);
				}
				if (url === "https://example.com/docs/getting-started") {
					return new Response(
						makeHtml(["/docs/auth"]),
						{ status: 200 },
					);
				}
				return new Response("", { status: 404 });
			}),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should detect broken links", async () => {
		const report = await analyzeSite(pages, "example.com");
		expect(report.brokenLinks.length).toBeGreaterThan(0);
		const broken = report.brokenLinks.find((b) => b.targetUrl.includes("nonexistent"));
		expect(broken).toBeDefined();
		expect(broken!.sourcePage).toBe("https://example.com/docs/auth");
	});

	it("should detect orphan pages", async () => {
		const pagesWithOrphan = [
			...pages,
			{ url: "https://example.com/docs/hidden", title: "Hidden" },
		];
		const report = await analyzeSite(pagesWithOrphan, "example.com");
		expect(report.orphanPages).toContain("https://example.com/docs/hidden");
	});

	it("should count analyzed pages", async () => {
		const report = await analyzeSite(pages, "example.com");
		expect(report.pagesAnalyzed).toBe(3);
		expect(report.domain).toBe("example.com");
		expect(report.analyzedAt).toBeTruthy();
	});

	it("should ignore external links", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(
					makeHtml(["https://other.com/page", "/docs/billing"]),
					{ status: 200 },
				),
			),
		);

		const report = await analyzeSite(pages, "example.com");
		const external = report.brokenLinks.find((b) => b.targetUrl.includes("other.com"));
		expect(external).toBeUndefined();
	});

	it("should handle fetch failures gracefully", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 500 })),
		);

		const report = await analyzeSite(pages, "example.com");
		expect(report.pagesAnalyzed).toBe(0);
		expect(report.brokenLinks).toEqual([]);
	});
});

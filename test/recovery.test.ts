import { describe, expect, it, vi, afterEach } from "vitest";
import {
	buildLinkHeader,
	injectRecoveryHtml,
	prefersJson,
	recover404,
} from "../adapters/core.js";

const payload = {
	deadUrl: "https://docs.example.com/v2/auth",
	suggestions: [
		{
			url: "https://docs.example.com/v3/auth",
			title: "Auth",
			score: 0.9,
			matchType: "moved",
		},
	],
	jsonLd: { "@type": "WebPage" },
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("HTTP recovery", () => {
	it("prefers JSON when Accept is application/json", () => {
		expect(prefersJson("application/json")).toBe(true);
		expect(prefersJson("text/html")).toBe(false);
		expect(prefersJson("text/html, application/json;q=0.9")).toBe(false);
	});

	it("builds Link alternates", () => {
		expect(buildLinkHeader(payload.suggestions)).toContain('rel="alternate"');
		expect(buildLinkHeader(payload.suggestions)).toContain("https://docs.example.com/v3/auth");
	});

	it("injects JSON-LD and the suggestion list into HTML", () => {
		const html = injectRecoveryHtml(
			"<!DOCTYPE html><html><body><h1>Not Found</h1></body></html>",
			payload,
		);
		expect(html).toContain("application/ld+json");
		expect(html).toContain("agent-404-suggestions");
		expect(html).toContain("/v3/auth");
	});

	it("returns JSON 404 when Accept is application/json", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
		);
		const request = new Request("https://docs.example.com/v2/auth", {
			headers: { Accept: "application/json" },
		});
		const upstream = new Response("nope", { status: 404, headers: { "Content-Type": "text/html" } });
		const recovered = await recover404(request, upstream, { apiKey: "pk_test" });
		expect(recovered.status).toBe(404);
		expect(recovered.headers.get("content-type")).toMatch(/json/);
		expect(recovered.headers.get("link")).toContain("rel=\"alternate\"");
		expect(recovered.headers.get("vary")).toContain("Accept");
		const body = await recovered.json();
		expect(body.suggestions[0].url).toContain("/v3/auth");
	});

	it("server-renders HTML for crawlers that do not run JS", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
		);
		const request = new Request("https://docs.example.com/v2/auth", {
			headers: { Accept: "text/html", "User-Agent": "ClaudeBot" },
		});
		const upstream = new Response("<html><body><h1>404</h1></body></html>", {
			status: 404,
			headers: { "Content-Type": "text/html" },
		});
		const recovered = await recover404(request, upstream, { apiKey: "pk_test" });
		expect(recovered.status).toBe(404);
		const html = await recovered.text();
		expect(html).toContain("application/ld+json");
		expect(html).toContain("Were you looking for one of these?");
	});

	it("leaves non-404 responses untouched", async () => {
		const request = new Request("https://docs.example.com/ok");
		const upstream = new Response("ok", { status: 200 });
		const recovered = await recover404(request, upstream, { apiKey: "pk_test" });
		expect(recovered.status).toBe(200);
		expect(await recovered.text()).toBe("ok");
	});

	it("drops javascript: suggestion URLs and still returns 404", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						...payload,
						suggestions: [
							{ url: "javascript:alert(1)", title: "xss", score: 1, matchType: "related" },
							payload.suggestions[0],
						],
					}),
					{ status: 200 },
				),
			),
		);
		const request = new Request("https://docs.example.com/v2/auth", {
			headers: { Accept: "text/html" },
		});
		const upstream = new Response("<html><body><h1>404</h1></body></html>", {
			status: 404,
			headers: { "Content-Type": "text/html" },
		});
		const recovered = await recover404(request, upstream, { apiKey: "pk_test" });
		expect(recovered.status).toBe(404);
		const html = await recovered.text();
		expect(html).not.toContain("javascript:");
		expect(html).toContain("/v3/auth");
		expect(recovered.headers.get("link")).not.toContain("javascript:");
	});

	it("does not throw when a suggestion title contains CR/LF", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						...payload,
						suggestions: [
							{
								url: "https://docs.example.com/v3/auth",
								title: "Auth\r\nInjected: 1",
								score: 0.9,
								matchType: "moved",
							},
						],
					}),
					{ status: 200 },
				),
			),
		);
		const request = new Request("https://docs.example.com/v2/auth");
		const upstream = new Response("nope", { status: 404, headers: { "Content-Type": "text/html" } });
		const recovered = await recover404(request, upstream, { apiKey: "pk_test" });
		expect(recovered.status).toBe(404);
		expect(recovered.headers.get("link")).toBeTruthy();
		expect(recovered.headers.get("link")).not.toMatch(/[\r\n]/);
	});
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { agent404, notFoundSuggestions } from "../adapters/next.js";
import { agent404Worker } from "../adapters/cloudflare.js";
import { recoverExpress404 } from "../adapters/express.js";
import { agent404Netlify } from "../adapters/netlify.js";
import type { IncomingMessage } from "node:http";

const payload = {
	deadUrl: "https://docs.example.com/v2/auth",
	suggestions: [
		{ url: "https://docs.example.com/v3/auth", title: "Auth", score: 0.9, matchType: "moved" },
	],
	jsonLd: { "@type": "WebPage" },
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function stubSuggestAndOrigin(originStatus = 404) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const req = input instanceof Request ? input : new Request(String(input), init);
		if (req.url.includes("/api/suggest")) {
			return new Response(JSON.stringify(payload), { status: 200 });
		}
		return new Response("<html><body>nope</body></html>", {
			status: originStatus,
			headers: { "Content-Type": "text/html" },
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("adapters/next", () => {
	it("does not re-probe when the incoming request is already a probe", async () => {
		const fetchMock = stubSuggestAndOrigin();
		const mw = agent404({ apiKey: "pk_test" });
		const res = await mw(
			new Request("https://docs.example.com/missing", {
				headers: { "x-agent-404": "probe" },
			}),
		);
		expect(res).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("recovers origin 404s and tags the probe fetch", async () => {
		const fetchMock = stubSuggestAndOrigin(404);
		const mw = agent404({ apiKey: "pk_test" });
		const recovered = await mw(new Request("https://docs.example.com/v2/auth"));
		expect(recovered?.status).toBe(404);
		const html = await recovered!.text();
		expect(html).toContain("Were you looking for one of these?");
		const probe = fetchMock.mock.calls.find(([input]) => {
			const req = input instanceof Request ? input : null;
			return req?.headers.get("x-agent-404") === "probe";
		});
		expect(probe).toBeTruthy();
	});

	it("skips static assets but not dotted content paths", async () => {
		const fetchMock = stubSuggestAndOrigin();
		const mw = agent404({ apiKey: "pk_test" });
		expect(await mw(new Request("https://docs.example.com/app.js"))).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
		await mw(new Request("https://docs.example.com/pricing/v1.0"));
		expect(fetchMock).toHaveBeenCalled();
	});

	it("notFoundSuggestions returns ranked links for not-found.tsx", async () => {
		stubSuggestAndOrigin();
		const list = await notFoundSuggestions(new Request("https://docs.example.com/v2/auth"), {
			apiKey: "pk_test",
		});
		expect(list[0].url).toContain("/v3/auth");
	});
});

describe("adapters/cloudflare", () => {
	it("passes probe requests straight to origin", async () => {
		const fetchOrigin = vi.fn(async () => new Response("origin", { status: 200 }));
		const worker = agent404Worker({ apiKey: "pk_test", fetchOrigin });
		const res = await worker.fetch(
			new Request("https://docs.example.com/x", { headers: { "x-agent-404": "probe" } }),
		);
		expect(await res.text()).toBe("origin");
		expect(fetchOrigin).toHaveBeenCalledTimes(1);
	});

	it("recovers origin 404s", async () => {
		stubSuggestAndOrigin(404);
		const fetchOrigin = vi.fn(
			async () =>
				new Response("<html><body>404</body></html>", {
					status: 404,
					headers: { "Content-Type": "text/html" },
				}),
		);
		const worker = agent404Worker({ apiKey: "pk_test", fetchOrigin });
		const res = await worker.fetch(new Request("https://docs.example.com/v2/auth"));
		expect(res.status).toBe(404);
		expect(await res.text()).toContain("agent-404-suggestions");
	});
});

describe("adapters/express", () => {
	it("recovers from a Node request-shaped 404", async () => {
		stubSuggestAndOrigin();
		const req = {
			method: "GET",
			url: "/v2/auth",
			originalUrl: "/v2/auth",
			protocol: "https",
			headers: { host: "docs.example.com", accept: "text/html" },
		} as unknown as IncomingMessage & { originalUrl?: string; protocol?: string };
		const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", { apiKey: "pk_test" });
		expect(recovered.status).toBe(404);
		expect(await recovered.text()).toContain("Were you looking for one of these?");
	});
});

describe("adapters/netlify", () => {
	it("wraps context.next() 404s", async () => {
		stubSuggestAndOrigin();
		const handler = agent404Netlify({ apiKey: "pk_test" });
		const recovered = await handler(new Request("https://docs.example.com/v2/auth"), {
			next: async () =>
				new Response("<html><body>404</body></html>", {
					status: 404,
					headers: { "Content-Type": "text/html" },
				}),
		});
		expect(recovered.status).toBe(404);
		expect(await recovered.text()).toContain("application/ld+json");
	});
});

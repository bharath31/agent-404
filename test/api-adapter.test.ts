import { describe, expect, it } from "vitest";
import { GET, OPTIONS, POST } from "../src/app/api/[[...path]]/route";
import { GET as authCallback } from "../src/app/auth/callback/route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe("Next App Router adapters", () => {
	it("dispatches the preserved health contract through the native route", async () => {
		const response = await GET(
			new Request("https://www.agent404.dev/api/health"),
			context(["health"]),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("keeps method dispatch native instead of forwarding to a catch-all server adapter", async () => {
		const response = await POST(
			new Request("https://www.agent404.dev/api/health", { method: "POST" }),
			context(["health"]),
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not found" });
	});

	it("answers CORS preflights without consuming a request body", async () => {
		const request = new Request("https://www.agent404.dev/api/sites", {
			method: "OPTIONS",
			headers: { Origin: "https://customer.example" },
		});
		const response = await OPTIONS(request, context(["sites"]));
		expect(request.bodyUsed).toBe(false);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("https://customer.example");
	});

	it("moves legacy Auth0 callbacks into the branded OTP reauthentication path", () => {
		const response = authCallback(
			new Request("https://www.agent404.dev/auth/callback?returnTo=%2Fdashboard%2Fexample.com"),
		);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location")!);
		expect(location.pathname).toBe("/auth/login");
		expect(location.searchParams.get("return_to")).toBe("/dashboard/example.com");
	});
});

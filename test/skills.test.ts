import { describe, it, expect } from "vitest";
import app from "../src/index.js";
import { AGENT_404_SKILL_MD } from "../src/skills/agent-404.js";

describe("Agent Skill & Discovery Endpoints", () => {
	it("serves llms.txt with instructions and links", async () => {
		const res = await app.request("/llms.txt");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/plain");
		const text = await res.text();
		expect(text).toContain("Agent 404");
		expect(text).toContain("/skills/agent-404/SKILL.md");
		expect(text).toContain("@agent404/next");
	});

	it("serves the SKILL.md specification at /skills/agent-404/SKILL.md", async () => {
		const res = await app.request("/skills/agent-404/SKILL.md");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/markdown");
		const markdown = await res.text();
		expect(markdown).toBe(AGENT_404_SKILL_MD);
		expect(markdown).toContain("name: agent-404");
		expect(markdown).toContain("@agent404/next");
		expect(markdown).toContain("@agent404/cloudflare");
		expect(markdown).toContain("@agent404/express");
	});

	it("redirects /skills/agent-404 to /skills/agent-404/SKILL.md", async () => {
		const res = await app.request("/skills/agent-404");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/skills/agent-404/SKILL.md");
	});
});

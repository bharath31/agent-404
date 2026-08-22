import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { AGENT_404_SKILL_MD } from "../src/skills/agent-404";
import { GET as redirectSkill } from "../src/app/skills/agent-404/route";

describe("Agent Skill & Discovery Endpoints", () => {
	it("serves llms.txt with instructions and links", async () => {
		const text = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
		expect(text).toContain("Agent 404");
		expect(text).toContain("/skills/agent-404/SKILL.md");
		expect(text).toContain("@agent404/next");
	});

	it("serves the SKILL.md specification at /skills/agent-404/SKILL.md", async () => {
		const markdown = await readFile(
			new URL("../public/skills/agent-404/SKILL.md", import.meta.url),
			"utf8",
		);
		expect(markdown).toBe(AGENT_404_SKILL_MD);
		expect(markdown).toContain("name: agent-404");
		expect(markdown).toContain("@agent404/next");
		expect(markdown).toContain("@agent404/cloudflare");
		expect(markdown).toContain("@agent404/express");
	});

	it("redirects /skills/agent-404 to /skills/agent-404/SKILL.md", async () => {
		const res = redirectSkill();
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/skills/agent-404/SKILL.md");
	});
});

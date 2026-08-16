import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/index.js";
import { runCliAudit } from "../src/cli/audit.js";

describe("CLI agent-404 audit (BAT-46)", () => {
	it("prints help when --help is passed", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const code = await main(["--help"]);
		expect(code).toBe(0);
		expect(consoleSpy).toHaveBeenCalled();
		const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("agent-404 audit");
		expect(output).toContain("Usage:");
		consoleSpy.mockRestore();
	});

	it("prints version when --version is passed", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const code = await main(["--version"]);
		expect(code).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith("agent-404 v0.1.0");
		consoleSpy.mockRestore();
	});

	it("returns error code when domain is missing", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const code = await main(["audit"]);
		expect(code).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalled();
		consoleErrorSpy.mockRestore();
		consoleLogSpy.mockRestore();
	});

	it("runs audit on domain and returns structured result", async () => {
		const result = await runCliAudit({
			domain: "example.com",
			deadPath: "/test-404",
			noColor: true,
		});

		expect(result).toBeDefined();
		expect(result.domain).toBe("example.com");
		expect(typeof result.score).toBe("number");
		expect(result.probe).toBeDefined();
		expect(Array.isArray(result.recommendations)).toBe(true);
	});

	it("rejects blocked/disallowed internal hosts", async () => {
		await expect(
			runCliAudit({
				domain: "localhost",
			}),
		).rejects.toThrow(/disallowed domain/i);

		await expect(
			runCliAudit({
				domain: "127.0.0.1",
			}),
		).rejects.toThrow(/disallowed domain/i);
	});
});

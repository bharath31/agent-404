import { buildSync } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

buildSync({
	entryPoints: [resolve(__dirname, "agent-404.ts")],
	outfile: resolve(__dirname, "../public/agent-404.min.js"),
	bundle: true,
	minify: true,
	format: "iife",
	target: "es2020",
	platform: "browser",
});

console.log("Built public/agent-404.min.js");

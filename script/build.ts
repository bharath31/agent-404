import { buildSync } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { CANONICAL_ORIGIN } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiBase = process.env.AGENT404_API_BASE || CANONICAL_ORIGIN;

buildSync({
	entryPoints: [resolve(__dirname, "agent-404.ts")],
	outfile: resolve(__dirname, "../public/agent-404.min.js"),
	bundle: true,
	minify: true,
	format: "iife",
	target: "es2020",
	platform: "browser",
	define: {
		__AGENT404_API_BASE__: JSON.stringify(apiBase),
	},
});

console.log("Built public/agent-404.min.js");

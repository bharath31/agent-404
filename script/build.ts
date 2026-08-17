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

// Build CLI binary
buildSync({
	entryPoints: [resolve(__dirname, "../bin/agent-404.ts")],
	outfile: resolve(__dirname, "../bin/agent-404.js"),
	bundle: true,
	minify: false,
	format: "esm",
	target: "node18",
	platform: "node",
});

console.log("Built bin/agent-404.js");

// Build published npm package adapters (customer-facing library surface —
// self-contained, no imports from src/). Transpiled in place, unbundled, so
// each file keeps its own ./core.js relative import rather than duplicating
// core.ts's content into every adapter.
const ADAPTER_ENTRYPOINTS = ["index", "core", "next", "express", "cloudflare", "netlify"];
for (const name of ADAPTER_ENTRYPOINTS) {
	buildSync({
		entryPoints: [resolve(__dirname, `../adapters/${name}.ts`)],
		outfile: resolve(__dirname, `../adapters/${name}.js`),
		bundle: false,
		format: "esm",
		target: "node18",
		platform: "node",
	});
}

console.log(`Built adapters/{${ADAPTER_ENTRYPOINTS.join(",")}}.js`);


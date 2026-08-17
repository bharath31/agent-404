import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const ALL_PACKAGES = ["next", "express", "cloudflare", "netlify"];

const requested = process.argv.slice(2).filter((a) => a !== "all");
const packages = requested.length > 0 ? requested : ALL_PACKAGES;

for (const name of packages) {
	if (!ALL_PACKAGES.includes(name)) {
		console.error(`Unknown package "${name}". Expected one of: ${ALL_PACKAGES.join(", ")}`);
		process.exit(1);
	}
}

// Regenerate adapters/*.d.ts from the shared source-of-truth so declarations
// published in each package are always in sync with adapters/*.ts.
execSync("npx tsc -p tsconfig.adapters.json", { cwd: root, stdio: "inherit" });

for (const name of packages) {
	const pkgDir = resolve(root, "packages", name);
	const distDir = resolve(pkgDir, "dist");
	mkdirSync(distDir, { recursive: true });

	// Bundle the framework adapter together with adapters/core.ts so the
	// published package is fully self-contained (no dependency on the
	// monorepo-relative "./core.js" import at runtime).
	buildSync({
		entryPoints: [resolve(root, `adapters/${name}.ts`)],
		outfile: resolve(distDir, "index.js"),
		bundle: true,
		format: "esm",
		target: "node18",
		platform: "node",
		minify: false,
	});

	// Types: copy the tsc-emitted declarations. index.d.ts re-exports from
	// "./core.js" (types-only, resolved against the sibling core.d.ts we
	// also copy in) — no runtime file named core.js is needed since the
	// bundled index.js above already inlines core's logic.
	const srcDts = resolve(root, `adapters/${name}.d.ts`);
	const coreDts = resolve(root, "adapters/core.d.ts");
	if (!existsSync(srcDts) || !existsSync(coreDts)) {
		console.error(`Missing generated declarations for "${name}" — did tsc run?`);
		process.exit(1);
	}
	copyFileSync(srcDts, resolve(distDir, "index.d.ts"));
	copyFileSync(coreDts, resolve(distDir, "core.d.ts"));

	console.log(`Built packages/${name}/dist/{index.js,index.d.ts,core.d.ts}`);
}

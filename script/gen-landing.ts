import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../public/index.html"), "utf-8");

const escaped = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const out = `export const landingPageHtml = \`${escaped}\`;\n`;

writeFileSync(resolve(__dirname, "../src/landing.ts"), out);
console.log("Generated src/landing.ts");

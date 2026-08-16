import { resolveApiBase } from "./resolve-api-base.js";

(function () {
	const script = document.currentScript as HTMLScriptElement | null;
	if (!script) return;

	const siteId = script.getAttribute("data-site-id");
	const rawPublicKey =
		script.getAttribute("data-public-key") || script.getAttribute("data-api-key");
	const secretKey = script.getAttribute("data-api-key");
	const selector404 = script.getAttribute("data-404-selector");
	const apiBase = resolveApiBase(script);

	if (!siteId || !rawPublicKey) {
		console.warn("[agent-404] Missing data-site-id or data-public-key");
		return;
	}
	const publicKey = rawPublicKey;

	if (secretKey && !secretKey.startsWith("pk_")) {
		console.warn(
			"[agent-404] data-api-key is a write secret and must not be in HTML. " +
				"Switch to data-public-key; live-page indexing uses sitemap crawl after verification.",
		);
	}

	function jsonHeaders(key: string) {
		return {
			"Content-Type": "application/json",
			"x-api-key": key,
		};
	}

	function is404Page(): boolean {
		// 1. CSS selector match
		if (selector404 && document.querySelector(selector404)) return true;

		// 2. Meta tag
		const meta = document.querySelector('meta[name="agent-404:status"]');
		if (meta && meta.getAttribute("content") === "404") return true;

		// 3. Title heuristic
		const title = document.title.toLowerCase();
		if (title.includes("404") || title.includes("not found") || title.includes("page not found"))
			return true;

		return false;
	}

	function beaconPage(): void {
		void beaconPageAsync();
	}

	async function beaconPageAsync(): Promise<void> {
		const payload = {
			url: location.href,
			title: document.title,
			description:
				(document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || "",
			headings: Array.from(document.querySelectorAll("h1, h2, h3"), (el) =>
				(el.textContent || "").trim(),
			).slice(0, 20),
		};

		const contentHash = await sha256Hex(
			`${payload.url}\n${payload.title}\n${payload.description}\n${payload.headings.join("\n")}`,
		);
		const storageKey = `agent404:${siteId}:${location.pathname}`;
		try {
			const prev = localStorage.getItem(storageKey);
			if (prev) {
				const parsed = JSON.parse(prev) as { hash: string; at: number };
				if (parsed.hash === contentHash && Date.now() - parsed.at < 7 * 24 * 60 * 60 * 1000) {
					return;
				}
			}
		} catch {
			// ignore quota / private mode
		}

		if (!secretKey || secretKey.startsWith("pk_")) {
			return;
		}

		fetch(apiBase + "/api/register", {
			method: "POST",
			headers: jsonHeaders(secretKey),
			body: JSON.stringify({ ...payload, contentHash }),
			keepalive: true,
		})
			.then((resp) => {
				if (!resp.ok) {
					warnOwner("Page beacon failed", resp.status);
					return;
				}
				try {
					localStorage.setItem(storageKey, JSON.stringify({ hash: contentHash, at: Date.now() }));
				} catch {
					// ignore
				}
			})
			.catch((err) => {
				warnOwner("Page beacon failed", undefined, err);
			});
	}

	async function sha256Hex(value: string): Promise<string> {
		const bytes = new TextEncoder().encode(value);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return [...new Uint8Array(digest)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.slice(0, 32);
	}

	async function handleNotFound(): Promise<void> {
		try {
			const resp = await fetch(apiBase + "/api/suggest", {
				method: "POST",
				headers: jsonHeaders(publicKey),
				body: JSON.stringify({ url: location.href }),
			});

			if (!resp.ok) {
				warnOwner("Suggestion request failed", resp.status);
				return;
			}

			const result = await resp.json() as {
				suggestions: Array<{
					url: string;
					title: string;
					description: string;
					matchType: string;
					score: number;
				}>;
				jsonLd: object;
			};

			if (!result.suggestions || result.suggestions.length === 0) return;

			injectSuggestions(result.suggestions);
			injectJsonLd(result.jsonLd);
		} catch (err) {
			// Don't break the host page — surface the failure to the owner.
			warnOwner("Suggestion request failed", undefined, err);
		}
	}

	function warnOwner(operation: string, status?: number, err?: unknown): void {
		const statusBit = status ? ` (HTTP ${status})` : "";
		console.warn(
			`[agent-404] ${operation}${statusBit}. The host page is unaffected. ` +
				"If this is a CORS error, use https://www.agent404.dev (not the apex) — " +
				"redirects break preflight. Verify with GET /api/install/status or the dashboard.",
			err ?? "",
		);
	}

	function injectSuggestions(
		suggestions: Array<{
			url: string;
			title: string;
			matchType: string;
		}>,
	): void {
		const container = document.createElement("div");
		container.id = "agent-404-suggestions";
		container.setAttribute(
			"style",
			"max-width:560px;margin:2rem auto;padding:1.25rem 1.5rem;border:1px solid rgba(128,128,128,0.2);border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:rgba(128,128,128,0.05);box-shadow:0 4px 12px rgba(0,0,0,0.05);text-align:left;",
		);

		const heading = document.createElement("h3");
		heading.textContent = "Were you looking for one of these?";
		heading.setAttribute(
			"style",
			"margin:0 0 0.85rem;font-size:0.95rem;font-weight:600;letter-spacing:-0.01em;",
		);
		container.appendChild(heading);

		const list = document.createElement("ul");
		list.setAttribute("style", "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.5rem;");

		for (const s of suggestions) {
			const li = document.createElement("li");
			li.setAttribute(
				"style",
				"display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid rgba(128,128,128,0.1);",
			);

			const a = document.createElement("a");
			a.href = s.url;
			a.textContent = s.title || s.url;
			a.setAttribute(
				"style",
				"color:#3b82f6;text-decoration:none;font-weight:500;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
			);

			const badge = document.createElement("span");
			badge.textContent = s.matchType;
			badge.setAttribute(
				"style",
				"display:inline-block;padding:0.15rem 0.45rem;font-size:0.7rem;font-family:ui-monospace,monospace;border-radius:4px;background:rgba(128,128,128,0.12);color:inherit;font-weight:500;text-transform:uppercase;",
			);

			li.appendChild(a);
			li.appendChild(badge);
			list.appendChild(li);
		}

		container.appendChild(list);

		// Insert: after the selector target, or at end of main/body
		const target = selector404 ? document.querySelector(selector404) : null;
		if (target) {
			target.insertAdjacentElement("afterend", container);
		} else {
			(document.querySelector("main") || document.body).appendChild(container);
		}
	}

	function injectJsonLd(jsonLd: object): void {
		const script = document.createElement("script");
		script.type = "application/ld+json";
		script.textContent = JSON.stringify(jsonLd);
		document.head.appendChild(script);
	}

	// Main
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	function init(): void {
		if (is404Page()) {
			handleNotFound();
		} else {
			beaconPage();
		}
	}
})();

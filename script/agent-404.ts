(function () {
	const script = document.currentScript as HTMLScriptElement | null;
	if (!script) return;

	const siteId = script.getAttribute("data-site-id");
	const apiKey = script.getAttribute("data-api-key");
	const selector404 = script.getAttribute("data-404-selector");
	const apiBase = new URL(script.src).origin;

	if (!siteId || !apiKey) {
		console.warn("[agent-404] Missing data-site-id or data-api-key");
		return;
	}

	const headers = {
		"Content-Type": "application/json",
		"x-api-key": apiKey,
	};

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
		const data = JSON.stringify({
			url: location.href,
			title: document.title,
			description:
				(document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || "",
			headings: Array.from(document.querySelectorAll("h1, h2, h3"), (el) =>
				(el.textContent || "").trim(),
			).slice(0, 20),
		});

		// sendBeacon can't set custom headers, so we use fetch with keepalive
		fetch(apiBase + "/api/register", {
			method: "POST",
			headers,
			body: data,
			keepalive: true,
		}).catch(() => {});
	}

	async function handleNotFound(): Promise<void> {
		try {
			const resp = await fetch(apiBase + "/api/suggest", {
				method: "POST",
				headers,
				body: JSON.stringify({ url: location.href }),
			});

			if (!resp.ok) return;

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
		} catch {
			// Silently fail — don't break the host page
		}
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
			"max-width:600px;margin:2rem auto;padding:1.5rem;border:1px solid #e2e8f0;border-radius:8px;font-family:system-ui,sans-serif;background:#f8fafc",
		);

		const heading = document.createElement("h3");
		heading.textContent = "Were you looking for one of these?";
		heading.setAttribute("style", "margin:0 0 1rem;font-size:1.1rem;color:#1e293b");
		container.appendChild(heading);

		const list = document.createElement("ul");
		list.setAttribute("style", "list-style:none;padding:0;margin:0");

		for (const s of suggestions) {
			const li = document.createElement("li");
			li.setAttribute("style", "margin:0.5rem 0");

			const a = document.createElement("a");
			a.href = s.url;
			a.textContent = s.title || s.url;
			a.setAttribute(
				"style",
				"color:#2563eb;text-decoration:none;font-weight:500",
			);

			const badge = document.createElement("span");
			badge.textContent = s.matchType;
			badge.setAttribute(
				"style",
				"display:inline-block;margin-left:0.5rem;padding:0.1rem 0.4rem;font-size:0.75rem;border-radius:4px;background:#e2e8f0;color:#64748b",
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

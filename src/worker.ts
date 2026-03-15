import app from "./index.js";
import type { Bindings } from "./index.js";

export default {
	fetch: app.fetch,

	async scheduled(
		_event: ScheduledEvent,
		env: Bindings,
		ctx: ExecutionContext,
	) {
		const url = new URL("/api/cron", "https://localhost");
		const req = new Request(url.toString(), {
			headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
		});
		const promise = app.fetch(req, env) as Promise<Response>;
		ctx.waitUntil(promise);
	},
};

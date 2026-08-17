import { recover404 } from "./core.js";
function agent404Worker(config) {
  const fetchOrigin = config.fetchOrigin ?? fetch;
  return {
    async fetch(request, _env, _ctx) {
      if (request.headers.get("x-agent-404") === "probe") {
        return fetchOrigin(request);
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), config.probeTimeoutMs ?? config.timeoutMs ?? 2500);
      try {
        const probeHeaders = new Headers(request.headers);
        probeHeaders.set("x-agent-404", "probe");
        const probe = new Request(request, { headers: probeHeaders, signal: ctrl.signal });
        const upstream = await fetchOrigin(probe);
        return recover404(request, upstream, config);
      } catch {
        return fetchOrigin(request);
      } finally {
        clearTimeout(t);
      }
    }
  };
}
import { recover404 as recover4042 } from "./core.js";
export {
  agent404Worker,
  recover4042 as recover404
};

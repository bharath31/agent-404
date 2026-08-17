import { recover404 } from "./core.js";
function headersFromNode(headers) {
  const h = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    h.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return h;
}
async function recoverExpress404(req, bodyHtml, config) {
  const proto = req.protocol || req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost";
  const path = req.originalUrl || req.url || "/";
  const request = new Request(`${proto}://${host}${path}`, {
    method: req.method,
    headers: headersFromNode(req.headers)
  });
  const upstream = new Response(bodyHtml, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
  return recover404(request, upstream, config);
}
import { recover404 as recover4042 } from "./core.js";
export {
  recover4042 as recover404,
  recoverExpress404
};

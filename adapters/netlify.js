import { recover404 } from "./core.js";
function agent404Netlify(config) {
  return async (request, context) => {
    const upstream = await context.next();
    return recover404(request, upstream, config);
  };
}
import { recover404 as recover4042 } from "./core.js";
export {
  agent404Netlify,
  recover4042 as recover404
};

import { getRequestListener } from "@hono/node-server";
import app from "../src/index.js";

export default getRequestListener(app.fetch);


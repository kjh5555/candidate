import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import apiRoutes from "./routes/index.js";

const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: config.CORS_ORIGIN,
});

await server.register(apiRoutes, { prefix: "/api" });

const port = config.PORT;
const host = "0.0.0.0";

try {
  await server.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

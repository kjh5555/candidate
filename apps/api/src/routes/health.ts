import type { FastifyPluginAsync } from "fastify";
import type { HealthResponseDTO } from "@repo/shared";
import { prisma } from "../db.js";

const healthRoute: FastifyPluginAsync = async (fastify) => {
  // Liveness probe — always 200 if server is up. Railway healthcheck targets this.
  fastify.get("/health", async (_request, reply) => {
    const body: HealthResponseDTO = {
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "connected",
    };
    return reply.status(200).send(body);
  });

  // Deep readiness probe — verifies DB connectivity. Use for monitoring.
  fastify.get("/health/db", async (_request, reply) => {
    let db: HealthResponseDTO["db"] = "disconnected";
    let status: HealthResponseDTO["status"] = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "connected";
    } catch (err) {
      db = "disconnected";
      status = "error";
      fastify.log.warn({ err }, "Health check DB ping failed");
    }
    const body: HealthResponseDTO = {
      status,
      timestamp: new Date().toISOString(),
      db,
    };
    return reply.status(status === "ok" ? 200 : 503).send(body);
  });
};

export default healthRoute;

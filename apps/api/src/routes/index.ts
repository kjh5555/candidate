import type { FastifyPluginAsync } from "fastify";
import healthRoute from "./health.js";
import regionRoutes from "./region.js";
import legislatorRoutes from "./legislators.js";
import billRoutes from "./bills.js";
import districtRoutes from "./districts.js";
import candidateRoutes from "./candidates.js";
import budgetRoutes from "./budget.js";

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(regionRoutes, { prefix: "/region" });
  await fastify.register(legislatorRoutes, { prefix: "/legislators" });
  await fastify.register(billRoutes, { prefix: "/bills" });
  await fastify.register(districtRoutes, { prefix: "/districts" });
  await fastify.register(candidateRoutes, { prefix: "/candidates" });
  await fastify.register(budgetRoutes, { prefix: "/budget" });
};

export default apiRoutes;

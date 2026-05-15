import type { FastifyPluginAsync } from "fastify";
import healthRoute from "./health.js";
import regionRoutes from "./region.js";
import regionHubRoutes from "./regionHub.js";
import legislatorRoutes from "./legislators.js";
import billRoutes from "./bills.js";
import districtRoutes from "./districts.js";
import candidateRoutes from "./candidates.js";
import budgetRoutes from "./budget.js";
import settlementRoutes from "./settlement.js";
import controversyRoutes from "./controversies.js";
import clikRoutes from "./clik.js";

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(regionRoutes, { prefix: "/region" });
  await fastify.register(regionHubRoutes, { prefix: "/region-hub" });
  await fastify.register(legislatorRoutes, { prefix: "/legislators" });
  await fastify.register(billRoutes, { prefix: "/bills" });
  await fastify.register(districtRoutes, { prefix: "/districts" });
  await fastify.register(candidateRoutes, { prefix: "/candidates" });
  await fastify.register(budgetRoutes, { prefix: "/budget" });
  await fastify.register(settlementRoutes, { prefix: "/settlement" });
  // CLIK 회의록·의안 (광역·기초의원 의정활동)
  await fastify.register(clikRoutes, { prefix: "/council" });
  // 논란·해명 — /legislators/:id/controversies 형식이므로 prefix 없이 등록
  await fastify.register(controversyRoutes);
};

export default apiRoutes;

// Integrated region-hub route.
//
// GET /api/region-hub?sido=경기도&wiwName=여주시
//
// 400 when either param is missing/blank.
// 200 with RegionHubDTO payload.

import type { FastifyPluginAsync } from "fastify";
import { getRegionHub } from "../services/regionHubService.js";

interface RegionHubQuery {
  sido?: string;
  wiwName?: string;
}

const regionHubRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: RegionHubQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            sido: { type: "string", minLength: 1 },
            wiwName: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const sido = (request.query.sido ?? "").trim();
      const wiwName = (request.query.wiwName ?? "").trim();
      if (!sido || !wiwName) {
        return reply.status(400).send({
          error: "MISSING_PARAMS",
          message: "Both `sido` and `wiwName` query params are required.",
        });
      }
      try {
        const data = await getRegionHub({ sido, wiwName });
        return reply.send(data);
      } catch (err) {
        request.log.error({ err }, "region-hub unexpected error");
        return reply.status(500).send({
          error: "INTERNAL_ERROR",
          message: "Failed to compute region hub.",
        });
      }
    },
  );
};

export default regionHubRoutes;

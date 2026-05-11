import type { FastifyPluginAsync } from "fastify";
import {
  listDistricts,
  type DistrictLevelInput,
} from "../services/districtService.js";

interface ListQuery {
  level?: DistrictLevelInput;
}

const districtRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /districts
  fastify.get<{ Querystring: ListQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["NATIONAL", "PROVINCIAL"],
              default: "NATIONAL",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const level: DistrictLevelInput = request.query.level ?? "NATIONAL";
      const districts = await listDistricts(level);
      return reply.send({ districts, total: districts.length });
    },
  );
};

export default districtRoutes;

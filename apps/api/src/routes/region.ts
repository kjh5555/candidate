import type { FastifyPluginAsync } from "fastify";
import {
  AddressNotFoundError,
  KakaoApiError,
  matchRegion,
} from "../services/regionMatcher.js";

interface MatchQuery {
  address: string;
}

const regionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: MatchQuery }>(
    "/match",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["address"],
          properties: {
            address: { type: "string", minLength: 2, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const { address } = request.query;
      try {
        const result = await matchRegion(address);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof AddressNotFoundError) {
          return reply.status(404).send({
            error: "ADDRESS_NOT_FOUND",
            message: err.message,
          });
        }
        if (err instanceof KakaoApiError) {
          return reply.status(502).send({
            error: "KAKAO_API_ERROR",
            message: err.message,
            detail: err.detail,
          });
        }
        request.log.error({ err }, "region/match unexpected error");
        return reply.status(500).send({
          error: "INTERNAL_ERROR",
          message: "Failed to match region",
        });
      }
    },
  );
};

export default regionRoutes;

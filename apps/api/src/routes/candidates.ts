import type { FastifyPluginAsync } from "fastify";
import {
  getCandidateDetail,
  listCandidates,
  listCandidateRegions,
  type ListPositionType,
} from "../services/candidateService.js";

interface ListQuery {
  electionId?: string;
  positionType?: ListPositionType;
  sido?: string;
  wiwName?: string;
  name?: string;
  districtName?: string;
}

interface RegionsQuery {
  electionId?: string;
}

interface IdParams {
  id: string;
}

const DEFAULT_ELECTION_ID = "20260603";

const candidateRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /candidates
  fastify.get<{ Querystring: ListQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            electionId: { type: "string", minLength: 1 },
            positionType: {
              type: "string",
              enum: [
                "GOVERNOR",
                "MAYOR",
                "PROVINCIAL_COUNCILOR",
                "BASIC_COUNCILOR",
                "SUPERINTENDENT",
                "PROVINCIAL_COUNCILOR_PROP",
                "BASIC_COUNCILOR_PROP",
                "ALL",
              ],
            },
            sido: { type: "string" },
            wiwName: { type: "string" },
            name: { type: "string" },
            districtName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        electionId = DEFAULT_ELECTION_ID,
        positionType = "ALL",
        sido,
        wiwName,
        name,
        districtName,
      } = request.query;
      const candidates = await listCandidates({
        electionId,
        positionType,
        sido,
        wiwName,
        name,
        districtName,
      });
      return reply.send({ candidates, total: candidates.length });
    },
  );

  // GET /candidates/regions
  fastify.get<{ Querystring: RegionsQuery }>(
    "/regions",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            electionId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { electionId = DEFAULT_ELECTION_ID } = request.query;
      const regions = await listCandidateRegions({ electionId });
      return reply.send({ regions });
    },
  );

  // GET /candidates/:id
  fastify.get<{ Params: IdParams }>(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const detail = await getCandidateDetail(request.params.id);
      if (!detail) {
        return reply.status(404).send({
          error: "CANDIDATE_NOT_FOUND",
          message: `Candidate ${request.params.id} not found`,
        });
      }
      return reply.send(detail);
    },
  );
};

export default candidateRoutes;

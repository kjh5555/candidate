import type { FastifyPluginAsync } from "fastify";
import {
  getCandidateDetail,
  listCandidates,
  listCandidateRegions,
  type ListPositionType,
} from "../services/candidateService.js";
import { prisma } from "../db.js";

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

  // GET /candidates/:id/assets — 후보자 재산 라인아이템 (LegislatorAsset 테이블 이름 매칭).
  // 후보자가 현직 의원이거나 재산공개 신고자 명단에 있으면 라인아이템 반환.
  fastify.get<{ Params: IdParams; Querystring: { reportYm?: string } }>(
    "/:id/assets",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: { reportYm: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const cand = await prisma.candidate.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true },
      });
      if (!cand) {
        return reply.status(404).send({ error: "CANDIDATE_NOT_FOUND" });
      }
      const reportYm = request.query.reportYm ?? "202603";
      const rows = await prisma.legislatorAsset.findMany({
        where: { reportYm, legislatorName: cand.name },
        orderBy: { rowNumber: "asc" },
      });

      const serialised = rows.map((r) => ({
        ...r,
        prevValue: r.prevValue?.toString() ?? null,
        increaseValue: r.increaseValue?.toString() ?? null,
        increaseRealPrice: r.increaseRealPrice?.toString() ?? null,
        decreaseValue: r.decreaseValue?.toString() ?? null,
        decreaseRealPrice: r.decreaseRealPrice?.toString() ?? null,
        currentValue: r.currentValue?.toString() ?? null,
      }));

      const totals: Record<string, bigint> = {};
      for (const r of rows) {
        const v = r.currentValue ?? 0n;
        const signed = r.assetKind?.includes("채무") ? -v : v;
        totals[r.relation] = (totals[r.relation] ?? 0n) + signed;
      }
      const totalsByRelation = Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, v.toString()]),
      );

      return reply.send({
        reportYm,
        legislator: { id: cand.id, name: cand.name },
        count: rows.length,
        totalsByRelation,
        items: serialised,
      });
    },
  );
};

export default candidateRoutes;

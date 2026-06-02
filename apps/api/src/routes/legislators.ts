import type { FastifyPluginAsync } from "fastify";
import {
  getLegislatorDetail,
  listBasicRegions,
  listLegislatorBills,
  listLegislatorVotes,
  listLegislators,
  listLegislatorsByCouncilName,
  type ListLevel,
} from "../services/legislatorService.js";
import { prisma } from "../db.js";
import type { BillResult, ProposerRole, VoteResult } from "@repo/shared";

interface ListQuery {
  nationalDistrictId?: string;
  provincialDistrictId?: string;
  level?: ListLevel;
  region?: string;
  wiwName?: string;
  name?: string;
  party?: string;
  limit?: number;
  offset?: number;
}

interface IdParams {
  id: string;
}

interface BillsQuery {
  role?: ProposerRole;
  result?: BillResult;
  limit?: number;
  offset?: number;
}

interface VotesQuery {
  result?: VoteResult;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const legislatorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /legislators
  fastify.get<{ Querystring: ListQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            nationalDistrictId: { type: "string" },
            provincialDistrictId: { type: "string" },
            level: { type: "string", enum: ["NATIONAL", "PROVINCIAL", "BASIC", "ALL"] },
            region: { type: "string" },
            wiwName: { type: "string" },
            name: { type: "string" },
            party: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 24 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { nationalDistrictId, provincialDistrictId, level, region, wiwName, name, party, limit, offset } =
        request.query;
      // Require at least one of: a district filter, a (level + region) tuple,
      // or a search param (name/party/level) for the /legislators browse page.
      const hasDistrict = !!nationalDistrictId || !!provincialDistrictId;
      const hasRegionScope = !!region && level && level !== "ALL";
      const hasSearch = !!name || !!party || (!!level && level !== "ALL") || (limit !== undefined);
      if (!hasDistrict && !hasRegionScope && !hasSearch) {
        return reply.status(400).send({
          error: "MISSING_FILTER",
          message:
            "Provide at least one of nationalDistrictId / provincialDistrictId, " +
            "(level + region), or a search parameter (name, party, level).",
        });
      }
      const result = await listLegislators({
        nationalDistrictId,
        provincialDistrictId,
        level,
        region,
        wiwName,
        name,
        party,
        limit,
        offset,
      });
      return reply.send(result);
    },
  );

  // GET /legislators/by-council?rasmblyNm=... — 의회 소속 의원 이름·사진 목록
  fastify.get<{ Querystring: { rasmblyNm?: string } }>(
    "/by-council",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { rasmblyNm: { type: "string", minLength: 1 } },
          required: ["rasmblyNm"],
        },
      },
    },
    async (request, reply) => {
      const rasmblyNm = request.query.rasmblyNm ?? "";
      if (!rasmblyNm) {
        return reply.status(400).send({
          error: "MISSING_RASMBLY_NM",
          message: "rasmblyNm 쿼리가 필요합니다.",
        });
      }
      const photos = await listLegislatorsByCouncilName(rasmblyNm);
      return reply.send({ photos });
    },
  );

  // GET /legislators/basic-regions
  fastify.get("/basic-regions", async (_request, reply) => {
    const regions = await listBasicRegions();
    return reply.send({ regions });
  });

  // GET /legislators/:id
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
      const detail = await getLegislatorDetail(request.params.id);
      if (!detail) {
        return reply.status(404).send({
          error: "LEGISLATOR_NOT_FOUND",
          message: `Legislator ${request.params.id} not found`,
        });
      }
      return reply.send(detail);
    },
  );

  // GET /legislators/:id/bills
  fastify.get<{ Params: IdParams; Querystring: BillsQuery }>(
    "/:id/bills",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["PRIMARY", "CO"] },
            result: {
              type: "string",
              enum: [
                "PASSED",
                "PASSED_AMENDED",
                "REJECTED",
                "WITHDRAWN",
                "SUPERSEDED",
                "PENDING",
              ],
            },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { role, result, limit, offset } = request.query;
      const data = await listLegislatorBills(request.params.id, {
        role,
        result,
        limit,
        offset,
      });
      return reply.send(data);
    },
  );

  // GET /legislators/:id/votes
  fastify.get<{ Params: IdParams; Querystring: VotesQuery }>(
    "/:id/votes",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: {
            result: {
              type: "string",
              enum: ["YES", "NO", "ABSTAIN", "ABSENT"],
            },
            from: { type: "string", format: "date-time" },
            to: { type: "string", format: "date-time" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { result, from, to, limit, offset } = request.query;
      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;
      if (fromDate && Number.isNaN(fromDate.getTime())) {
        return reply.status(400).send({
          error: "INVALID_DATE",
          message: "from is not a valid date",
        });
      }
      if (toDate && Number.isNaN(toDate.getTime())) {
        return reply.status(400).send({
          error: "INVALID_DATE",
          message: "to is not a valid date",
        });
      }
      const data = await listLegislatorVotes(request.params.id, {
        result,
        from: fromDate,
        to: toDate,
        limit,
        offset,
      });
      return reply.send(data);
    },
  );

  // GET /legislators/:id/assets — 공직자 재산공개 라인아이템.
  // 의원 이름 (or monaCode) 기반으로 LegislatorAsset 테이블에서 조회.
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
      const leg = await prisma.legislator.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true },
      });
      if (!leg) {
        return reply.status(404).send({ error: "LEGISLATOR_NOT_FOUND" });
      }
      const reportYm = request.query.reportYm ?? "202603";
      const rows = await prisma.legislatorAsset.findMany({
        where: { reportYm, legislatorName: leg.name },
        orderBy: { rowNumber: "asc" },
      });

      // BigInt → string serialise (Fastify JSON encoder는 BigInt 미지원).
      const serialised = rows.map((r) => ({
        ...r,
        prevValue: r.prevValue?.toString() ?? null,
        increaseValue: r.increaseValue?.toString() ?? null,
        increaseRealPrice: r.increaseRealPrice?.toString() ?? null,
        decreaseValue: r.decreaseValue?.toString() ?? null,
        decreaseRealPrice: r.decreaseRealPrice?.toString() ?? null,
        currentValue: r.currentValue?.toString() ?? null,
      }));

      // 관계별 합계 (현재가액 기준, 채무는 음수 처리).
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
        legislator: { id: leg.id, name: leg.name },
        count: rows.length,
        totalsByRelation,
        items: serialised,
      });
    },
  );
};

export default legislatorRoutes;

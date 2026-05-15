// CLIK 회의록·의안정보 라우트
//
// GET /api/council/minutes?rasmblyNm=여주시의회&limit=20&offset=0
// GET /api/council/bills?rasmblyNm=여주시의회&limit=20&offset=0
//
// rasmblyNm 은 의원의 councilName 을 그대로 받아 contains 매칭한다.
// (예: "여주시의회" → DB에는 "경기도 여주시의회"로 저장돼 있어 contains 가
//  필요하다)

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import type {
  CouncilBillDTO,
  CouncilBillsResponseDTO,
  CouncilMinutesDTO,
  CouncilMinutesResponseDTO,
} from "@repo/shared";

interface CouncilQuery {
  rasmblyNm: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function formatYmd(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  // 이미 YYYY-MM-DD 형태
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return t;
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)));
}

function clampOffset(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

const clikRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: CouncilQuery }>(
    "/minutes",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["rasmblyNm"],
          properties: {
            rasmblyNm: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { rasmblyNm } = request.query;
      const limit = clampLimit(request.query.limit);
      const offset = clampOffset(request.query.offset);

      const where = { rasmblyNm: { contains: rasmblyNm } };

      const [rows, total] = await Promise.all([
        prisma.councilMinutes.findMany({
          where,
          orderBy: [{ mtgDe: "desc" }, { syncedAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.councilMinutes.count({ where }),
      ]);

      const minutes: CouncilMinutesDTO[] = rows.map((r) => ({
        id: r.id,
        docId: r.docId,
        rasmblyNm: r.rasmblyNm,
        mtgDe: formatYmd(r.mtgDe),
        sesn: r.sesn,
        numpr: r.numpr,
        mtgNm: r.mtgNm,
        viewUrl: r.viewUrl,
      }));

      const response: CouncilMinutesResponseDTO = { minutes, total };
      return reply.send(response);
    },
  );

  fastify.get<{ Querystring: CouncilQuery }>(
    "/bills",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["rasmblyNm"],
          properties: {
            rasmblyNm: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { rasmblyNm } = request.query;
      const limit = clampLimit(request.query.limit);
      const offset = clampOffset(request.query.offset);

      const where = { rasmblyNm: { contains: rasmblyNm } };

      const [rows, total] = await Promise.all([
        prisma.councilBill.findMany({
          where,
          orderBy: [{ itncDe: "desc" }, { syncedAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.councilBill.count({ where }),
      ]);

      const bills: CouncilBillDTO[] = rows.map((r) => ({
        id: r.id,
        docId: r.docId,
        rasmblyNm: r.rasmblyNm,
        biKndNm: r.biKndNm,
        biNo: r.biNo,
        biSj: r.biSj,
        itncDe: formatYmd(r.itncDe),
        propsr: r.propsr,
        viewUrl: r.viewUrl,
      }));

      const response: CouncilBillsResponseDTO = { bills, total };
      return reply.send(response);
    },
  );
};

export default clikRoutes;

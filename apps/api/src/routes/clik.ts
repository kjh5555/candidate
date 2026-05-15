// CLIK 회의록·의안정보 라우트
//
// GET /api/council/minutes?rasmblyNm=여주시의회&limit=20&offset=0
// GET /api/council/bills?rasmblyNm=여주시의회&limit=20&offset=0
//
// rasmblyNm 은 의원의 councilName 을 그대로 받아 contains 매칭한다.
// (예: "여주시의회" → DB에는 "경기도 여주시의회"로 저장돼 있어 contains 가
//  필요하다)

import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type {
  CouncilBillDTO,
  CouncilBillsResponseDTO,
  CouncilMinutesDTO,
  CouncilMinutesDetailDTO,
  CouncilMinutesResponseDTO,
  CouncilMinutesAgendaItemDTO,
  CouncilMinutesSpeakerDTO,
  CouncilMinutesSpeakerSummaryDTO,
} from "@repo/shared";
import { getOrFetchMinutesContent } from "../services/minutesContentService.js";
import { analyzeMinutes } from "../lib/llmClient.js";

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

  // ── 회의록 상세 (본문 + AI 요약 캐시) ────────────────────────

  function toAgenda(raw: unknown): CouncilMinutesAgendaItemDTO[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is { ord: number; title: string } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as { ord?: unknown }).ord === "number" &&
          typeof (x as { title?: unknown }).title === "string",
      )
      .map((x) => ({ ord: x.ord, title: x.title }));
  }

  function toSpeakers(raw: unknown): CouncilMinutesSpeakerDTO[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is { role: string; name: string; totalChars: number } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as { role?: unknown }).role === "string" &&
          typeof (x as { name?: unknown }).name === "string" &&
          typeof (x as { totalChars?: unknown }).totalChars === "number",
      )
      .map((x) => ({ role: x.role, name: x.name, totalChars: x.totalChars }));
  }

  function toSpeakerSummaries(
    raw: unknown,
  ): CouncilMinutesSpeakerSummaryDTO[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is { name: string; role: string; summary: string } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as { name?: unknown }).name === "string" &&
          typeof (x as { role?: unknown }).role === "string" &&
          typeof (x as { summary?: unknown }).summary === "string",
      )
      .map((x) => ({ name: x.name, role: x.role, summary: x.summary }));
  }

  function toKeyTopics(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string");
  }

  type DbMinutes = Awaited<
    ReturnType<typeof prisma.councilMinutes.findUnique>
  >;

  function toDetailDTO(
    row: NonNullable<DbMinutes>,
  ): CouncilMinutesDetailDTO {
    return {
      id: row.id,
      docId: row.docId,
      rasmblyId: row.rasmblyId,
      rasmblyNm: row.rasmblyNm,
      sesn: row.sesn,
      mtgDe: formatYmd(row.mtgDe),
      numpr: row.numpr,
      mtgNm: row.mtgNm,
      viewUrl: row.viewUrl,
      bodyText: row.bodyText,
      agenda: toAgenda(row.agendaJson),
      speakers: toSpeakers(row.speakersJson),
      fetchedAt: row.fetchedAt ? row.fetchedAt.toISOString() : null,
      aiSummary: row.aiSummary,
      aiSpeakerSummaries: toSpeakerSummaries(row.aiSpeakerSummaries),
      aiKeyTopics: toKeyTopics(row.aiKeyTopics),
      aiGeneratedAt: row.aiGeneratedAt ? row.aiGeneratedAt.toISOString() : null,
      aiModel: row.aiModel,
    };
  }

  // GET /minutes/:docId — 메타+본문+AI (캐시 우선)
  fastify.get<{ Params: { docId: string } }>(
    "/minutes/:docId",
    {
      schema: {
        params: {
          type: "object",
          required: ["docId"],
          properties: { docId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { docId } = request.params;
      const row = await prisma.councilMinutes.findUnique({ where: { docId } });
      if (!row) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "회의록을 찾을 수 없습니다.",
        });
      }
      return reply.send(toDetailDTO(row));
    },
  );

  // POST /minutes/:docId/fetch — CLIK 본문 수집(강제 재수집 허용)
  fastify.post<{
    Params: { docId: string };
    Querystring: { force?: boolean };
  }>(
    "/minutes/:docId/fetch",
    {
      schema: {
        params: {
          type: "object",
          required: ["docId"],
          properties: { docId: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: { force: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const { docId } = request.params;
      const force = request.query.force === true;
      try {
        const row = await getOrFetchMinutesContent(docId, { force });
        return reply.send(toDetailDTO(row));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("찾을 수 없습니다")) {
          return reply.status(404).send({ error: "NOT_FOUND", message: msg });
        }
        request.log.error({ err, docId }, "회의록 본문 수집 실패");
        return reply.status(502).send({
          error: "FETCH_FAILED",
          message: `CLIK 본문 수집에 실패했습니다: ${msg}`,
        });
      }
    },
  );

  // 분석 쿨다운 (60초)
  const analyzeCooldown = new Map<string, number>();
  const ANALYZE_COOLDOWN_MS = 60_000;

  // POST /minutes/:docId/analyze — Gemini 분석 강제 재실행
  fastify.post<{ Params: { docId: string } }>(
    "/minutes/:docId/analyze",
    {
      schema: {
        params: {
          type: "object",
          required: ["docId"],
          properties: { docId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { docId } = request.params;

      // 쿨다운 체크
      const last = analyzeCooldown.get(docId) ?? 0;
      const now = Date.now();
      if (now - last < ANALYZE_COOLDOWN_MS) {
        const remain = Math.ceil((ANALYZE_COOLDOWN_MS - (now - last)) / 1000);
        return reply.status(429).send({
          error: "COOLDOWN",
          message: `분석은 ${remain}초 후에 다시 시도할 수 있습니다.`,
        });
      }

      // 본문 확보
      let row;
      try {
        row = await getOrFetchMinutesContent(docId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("찾을 수 없습니다")) {
          return reply.status(404).send({ error: "NOT_FOUND", message: msg });
        }
        return reply
          .status(502)
          .send({ error: "FETCH_FAILED", message: msg });
      }

      if (!row.bodyText) {
        return reply.status(422).send({
          error: "NO_BODY",
          message: "본문이 비어 있어 분석할 수 없습니다.",
        });
      }

      const speakers = toSpeakers(row.speakersJson);

      analyzeCooldown.set(docId, now);
      try {
        const result = await analyzeMinutes({
          meetingName: row.mtgNm ?? "회의록",
          date: formatYmd(row.mtgDe) ?? row.mtgDe ?? "",
          bodyText: row.bodyText,
          speakers: speakers.map((s) => ({ role: s.role, name: s.name })),
        });

        if (!result) {
          return reply.status(503).send({
            error: "LLM_UNAVAILABLE",
            message:
              "LLM 분석이 실패했거나 사용 불가능합니다. 잠시 후 다시 시도해주세요.",
          });
        }

        const updated = await prisma.councilMinutes.update({
          where: { docId },
          data: {
            aiSummary: result.summary,
            aiSpeakerSummaries: result.speakerSummaries as unknown as Prisma.InputJsonValue,
            aiKeyTopics: result.keyTopics as unknown as Prisma.InputJsonValue,
            aiGeneratedAt: new Date(),
            aiModel: result.model,
          },
        });

        return reply.send(toDetailDTO(updated));
      } catch (err) {
        request.log.error({ err, docId }, "회의록 AI 분석 실패");
        return reply.status(500).send({
          error: "ANALYZE_FAILED",
          message: err instanceof Error ? err.message : "AI 분석에 실패했습니다.",
        });
      }
    },
  );
};

export default clikRoutes;

// 의원별 논란·해명 라우트
//
// GET  /api/legislators/:id/controversies        — 토픽 + 기사 목록 (신뢰도 desc)
// POST /api/legislators/:id/controversies/sync   — 즉시 수집 실행 (의원당 1분에 1회)

import type { FastifyPluginAsync } from "fastify";
import { getControversyTopicsForLegislator } from "../services/controversyService.js";
import { ingestControversiesForLegislator } from "../services/newsIngestService.js";

const SYNC_COOLDOWN_MS = 60_000;
const lastSyncByLegislator = new Map<string, number>();

interface IdParams {
  id: string;
}

const controversyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: IdParams }>(
    "/legislators/:id/controversies",
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
      const data = await getControversyTopicsForLegislator(request.params.id);
      return reply.send(data);
    },
  );

  fastify.post<{ Params: IdParams }>(
    "/legislators/:id/controversies/sync",
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
      const legislatorId = request.params.id;
      const now = Date.now();
      const lastRun = lastSyncByLegislator.get(legislatorId) ?? 0;
      const waitMs = SYNC_COOLDOWN_MS - (now - lastRun);
      if (waitMs > 0) {
        return reply.status(429).send({
          error: "RATE_LIMITED",
          message: `이 의원 수집은 1분에 1회만 가능합니다. ${Math.ceil(waitMs / 1000)}초 후 다시 시도해주세요.`,
          retryAfterSec: Math.ceil(waitMs / 1000),
        });
      }
      lastSyncByLegislator.set(legislatorId, now);

      try {
        const result = await ingestControversiesForLegislator(legislatorId);
        const data = await getControversyTopicsForLegislator(legislatorId);
        return reply.send({ ...data, ingest: result });
      } catch (err) {
        // 쿨다운 reset (실패 시 재시도 가능)
        lastSyncByLegislator.delete(legislatorId);
        const msg = err instanceof Error ? err.message : String(err);
        request.log.error({ err: msg }, "controversy sync failed");
        return reply.status(500).send({
          error: "SYNC_FAILED",
          message: `수집에 실패했습니다: ${msg}`,
        });
      }
    },
  );
};

export default controversyRoutes;

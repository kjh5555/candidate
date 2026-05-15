// 의원별 논란·해명 라우트
//
// GET  /api/legislators/:id/controversies         — 토픽 + 기사 목록
// POST /api/legislators/:id/controversies/sync    — 백그라운드 수집 시작 (즉시 응답)
// GET  /api/legislators/:id/controversies/sync-status — 진행 상태 폴링

import type { FastifyPluginAsync } from "fastify";
import { getControversyTopicsForLegislator } from "../services/controversyService.js";
import { ingestControversiesForLegislator } from "../services/newsIngestService.js";

const SYNC_COOLDOWN_MS = 60_000;
const lastSyncByLegislator = new Map<string, number>();

// 진행 상태 추적 — 클라이언트가 페이지를 떠나도 서버에서 계속 실행되며,
// 다시 돌아오면 상태를 조회해 결과를 보여줄 수 있게 한다.
type SyncStatus =
  | { state: "idle" }
  | { state: "running"; startedAt: number }
  | { state: "completed"; startedAt: number; completedAt: number; topicsCreated: number; articlesAdded: number }
  | { state: "failed"; startedAt: number; failedAt: number; error: string };

const syncStatusByLegislator = new Map<string, SyncStatus>();

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

  // 백그라운드 수집 시작 — 즉시 응답하고 ingest는 서버에서 계속 진행
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

      // 이미 실행 중이면 그대로 진행 상태 반환
      const existing = syncStatusByLegislator.get(legislatorId);
      if (existing?.state === "running") {
        return reply.send({ state: "running", startedAt: existing.startedAt });
      }

      if (waitMs > 0) {
        return reply.status(429).send({
          error: "RATE_LIMITED",
          message: `이 의원 수집은 1분에 1회만 가능합니다. ${Math.ceil(waitMs / 1000)}초 후 다시 시도해주세요.`,
          retryAfterSec: Math.ceil(waitMs / 1000),
        });
      }
      lastSyncByLegislator.set(legislatorId, now);
      syncStatusByLegislator.set(legislatorId, {
        state: "running",
        startedAt: now,
      });

      // ⚠️ fire-and-forget: client가 페이지를 떠나도 서버에서 계속 실행됨.
      void (async () => {
        try {
          const result = await ingestControversiesForLegislator(legislatorId, {
            forceRefresh: true,
          });
          syncStatusByLegislator.set(legislatorId, {
            state: "completed",
            startedAt: now,
            completedAt: Date.now(),
            topicsCreated: result.topicsCreated,
            articlesAdded: result.articlesAdded,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          request.log.error({ err: msg, legislatorId }, "controversy sync failed");
          // 실패 시 쿨다운 해제 — 재시도 가능
          lastSyncByLegislator.delete(legislatorId);
          syncStatusByLegislator.set(legislatorId, {
            state: "failed",
            startedAt: now,
            failedAt: Date.now(),
            error: msg,
          });
        }
      })();

      return reply.status(202).send({
        state: "running",
        startedAt: now,
        message:
          "수집을 시작했습니다. 다른 페이지로 이동해도 계속 진행됩니다.",
      });
    },
  );

  // 진행 상태 폴링
  fastify.get<{ Params: IdParams }>(
    "/legislators/:id/controversies/sync-status",
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
      const status = syncStatusByLegislator.get(legislatorId) ?? { state: "idle" };
      return reply.send(status);
    },
  );
};

export default controversyRoutes;

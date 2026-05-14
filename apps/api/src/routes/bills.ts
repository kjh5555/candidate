import type { FastifyPluginAsync } from "fastify";
import { getBillDetail } from "../services/billService.js";
import {
  getBillSummary,
  generateBillSummary,
  LlmDisabledError,
} from "../services/billSummaryService.js";

interface BillParams {
  billId: string;
}

// 의안당 60초 쿨다운 (in-memory, 프로세스 단위)
const SUMMARY_COOLDOWN_MS = 60_000;
const lastGenerateByBill = new Map<string, number>();

const billRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: BillParams }>(
    "/:billId",
    {
      schema: {
        params: {
          type: "object",
          required: ["billId"],
          properties: { billId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const detail = await getBillDetail(request.params.billId);
      if (!detail) {
        return reply.status(404).send({
          error: "BILL_NOT_FOUND",
          message: `Bill ${request.params.billId} not found`,
        });
      }
      return reply.send(detail);
    },
  );

  // 캐시된 AI 요약 반환 (없으면 aiSummary=null)
  fastify.get<{ Params: BillParams }>(
    "/:billId/summary",
    {
      schema: {
        params: {
          type: "object",
          required: ["billId"],
          properties: { billId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const data = await getBillSummary(request.params.billId);
      if (!data) {
        return reply.status(404).send({
          error: "BILL_NOT_FOUND",
          message: `Bill ${request.params.billId} not found`,
        });
      }
      return reply.send(data);
    },
  );

  // 온디맨드 생성 + DB 캐시 + 반환
  fastify.post<{ Params: BillParams }>(
    "/:billId/summary/generate",
    {
      schema: {
        params: {
          type: "object",
          required: ["billId"],
          properties: { billId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const billId = request.params.billId;
      const now = Date.now();
      const lastRun = lastGenerateByBill.get(billId) ?? 0;
      const waitMs = SUMMARY_COOLDOWN_MS - (now - lastRun);
      if (waitMs > 0) {
        return reply.status(429).send({
          error: "RATE_LIMITED",
          message: `이 법안 요약 생성은 1분에 1회만 가능합니다. ${Math.ceil(waitMs / 1000)}초 후 다시 시도해주세요.`,
          retryAfterSec: Math.ceil(waitMs / 1000),
        });
      }
      lastGenerateByBill.set(billId, now);

      try {
        const data = await generateBillSummary(billId);
        if (!data) {
          // 생성 실패 — 쿨다운 해제 후 502 응답 (재시도 가능)
          lastGenerateByBill.delete(billId);
          return reply.status(502).send({
            error: "SUMMARY_GENERATION_FAILED",
            message:
              "AI 요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
          });
        }
        return reply.send(data);
      } catch (err) {
        if (err instanceof LlmDisabledError) {
          lastGenerateByBill.delete(billId);
          return reply.status(503).send({
            error: "LLM_DISABLED",
            message: "LLM 미설정 — 관리자에게 문의하세요.",
          });
        }
        // 의안 not found
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Record to update not found") || msg.includes("does not exist")) {
          lastGenerateByBill.delete(billId);
          return reply.status(404).send({
            error: "BILL_NOT_FOUND",
            message: `Bill ${billId} not found`,
          });
        }
        lastGenerateByBill.delete(billId);
        request.log.error({ err: msg, billId }, "bill summary generate failed");
        return reply.status(500).send({
          error: "SUMMARY_GENERATION_FAILED",
          message: `요약 생성 중 오류가 발생했습니다: ${msg}`,
        });
      }
    },
  );
};

export default billRoutes;

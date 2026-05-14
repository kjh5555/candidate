// 법안 AI 요약 서비스
//
// - getBillSummary(billId): DB에 캐시된 요약을 반환 (없으면 빈 필드)
// - generateBillSummary(billId): Gemini googleSearch grounding으로
//   요약을 생성하고 Bill 모델에 캐시 후 반환

import type { BillSummaryResponseDTO, BillAiSourceDTO } from "@repo/shared";
import { prisma } from "../db.js";
import {
  summarizeBillWithGrounding,
  isLlmEnabled,
} from "../lib/llmClient.js";

type BillRow = Awaited<ReturnType<typeof prisma.bill.findUnique>>;

function toDto(bill: NonNullable<BillRow>): BillSummaryResponseDTO {
  // aiSourceSnippets는 Json 컬럼 — Array 형태일 때만 사용
  let sources: BillAiSourceDTO[] | null = null;
  const raw = bill.aiSourceSnippets;
  if (Array.isArray(raw)) {
    sources = raw
      .map((s): BillAiSourceDTO | null => {
        if (!s || typeof s !== "object") return null;
        const obj = s as { uri?: unknown; title?: unknown };
        const uri = typeof obj.uri === "string" ? obj.uri : null;
        if (!uri) return null;
        const out: BillAiSourceDTO = { uri };
        if (typeof obj.title === "string" && obj.title.trim()) {
          out.title = obj.title;
        }
        return out;
      })
      .filter((s): s is BillAiSourceDTO => s !== null);
  }

  return {
    billId: bill.id,
    billNo: bill.billNo ?? null,
    name: bill.name,
    proposedDate: bill.proposedDate ? bill.proposedDate.toISOString() : null,
    primaryProposerName: bill.primaryProposerName ?? null,
    committee: bill.committee ?? null,
    linkUrl:
      bill.linkUrl && bill.linkUrl.trim()
        ? bill.linkUrl
        : `https://likms.assembly.go.kr/bill/billDetail.do?billId=${bill.id}`,
    aiSummary: bill.aiSummary ?? null,
    aiChanges: bill.aiChanges ?? null,
    aiSourceSnippets: sources,
    aiGeneratedAt: bill.aiGeneratedAt ? bill.aiGeneratedAt.toISOString() : null,
    aiModel: bill.aiModel ?? null,
  };
}

/**
 * 식별자(`idOrBillNo`)는 Bill.id (PRC_…) 우선, 못 찾으면 Bill.billNo로 fallback.
 * Vote 테이블의 일부 안건(예산안·기금변경안 등)은 Bill.id 없이 billNo만 있는 경우가 있어
 * UI에서 billId가 없을 때 billNo로 호출할 수 있도록 둔다.
 */
async function findBillByIdOrBillNo(idOrBillNo: string) {
  const byId = await prisma.bill.findUnique({ where: { id: idOrBillNo } });
  if (byId) return byId;
  return prisma.bill.findFirst({
    where: { billNo: idOrBillNo },
    orderBy: { proposedDate: "desc" },
  });
}

export async function getBillSummary(
  idOrBillNo: string,
): Promise<BillSummaryResponseDTO | null> {
  const bill = await findBillByIdOrBillNo(idOrBillNo);
  if (!bill) return null;
  return toDto(bill);
}

export class LlmDisabledError extends Error {
  constructor() {
    super("LLM 미설정");
    this.name = "LlmDisabledError";
  }
}

export async function generateBillSummary(
  idOrBillNo: string,
): Promise<BillSummaryResponseDTO | null> {
  const bill = await findBillByIdOrBillNo(idOrBillNo);
  if (!bill) return null;
  if (!isLlmEnabled()) {
    throw new LlmDisabledError();
  }

  const result = await summarizeBillWithGrounding({
    name: bill.name,
    billNo: bill.billNo,
    primaryProposerName: bill.primaryProposerName,
    proposedDate: bill.proposedDate ? bill.proposedDate.toISOString() : null,
    committee: bill.committee,
    linkUrl: bill.linkUrl,
  });

  if (!result) {
    // 실패 — 캐시 갱신 없이 현재 상태 그대로 반환 (null이면 생성 실패 의미)
    return null;
  }

  const model = process.env.LLM_MODEL?.trim() || "gemini-2.5-flash";
  const now = new Date();

  // 실제 Bill의 canonical id로 업데이트 (URL param이 billNo였을 수 있어 bill.id 사용)
  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      aiSummary: result.summary,
      aiChanges: result.changes,
      aiSourceSnippets: result.sources as unknown as object[],
      aiGeneratedAt: now,
      aiModel: model,
    },
  });
  return toDto(updated);
}

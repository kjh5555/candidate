// CLIK 의안(조례안·건의안) AI 요약 서비스
//
// - getCouncilBillSummary(docId): DB에 캐시된 요약 DTO 반환 (의안 없으면 null)
// - generateCouncilBillSummary(docId): Gemini googleSearch grounding으로
//   요약을 생성하고 CouncilBill 모델에 캐시 후 반환
//
// 본문 텍스트가 없는 CLIK 의안의 특성상, 메타데이터(제목·제안자·일자)와
// 의회명을 토대로 Gemini가 웹 검색·grounding으로 의안의 취지·변경점을
// 정리한다.

import type { CouncilBillSummaryDTO, BillAiSourceDTO } from "@repo/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  summarizeCouncilBillWithGrounding,
  isLlmEnabled,
} from "../lib/llmClient.js";

type CouncilBillRow = Awaited<
  ReturnType<typeof prisma.councilBill.findUnique>
>;

function formatYmd(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return t;
}

function toDto(bill: NonNullable<CouncilBillRow>): CouncilBillSummaryDTO {
  let sources: BillAiSourceDTO[] = [];
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
    docId: bill.docId,
    biSj: bill.biSj,
    biKndNm: bill.biKndNm ?? null,
    biNo: bill.biNo ?? null,
    rasmblyNm: bill.rasmblyNm ?? null,
    itncDe: formatYmd(bill.itncDe),
    propsr: bill.propsr ?? null,
    viewUrl: bill.viewUrl ?? null,
    aiSummary: bill.aiSummary ?? null,
    aiChanges: bill.aiChanges ?? null,
    aiSourceSnippets: sources,
    aiGeneratedAt: bill.aiGeneratedAt
      ? bill.aiGeneratedAt.toISOString()
      : null,
    aiModel: bill.aiModel ?? null,
  };
}

export async function getCouncilBillSummary(
  docId: string,
): Promise<CouncilBillSummaryDTO | null> {
  const bill = await prisma.councilBill.findUnique({ where: { docId } });
  if (!bill) return null;
  return toDto(bill);
}

export class CouncilBillLlmDisabledError extends Error {
  constructor() {
    super("LLM 미설정");
    this.name = "CouncilBillLlmDisabledError";
  }
}

export async function generateCouncilBillSummary(
  docId: string,
): Promise<CouncilBillSummaryDTO | null> {
  const bill = await prisma.councilBill.findUnique({ where: { docId } });
  if (!bill) return null;
  if (!isLlmEnabled()) {
    throw new CouncilBillLlmDisabledError();
  }

  const result = await summarizeCouncilBillWithGrounding({
    rasmblyNm: bill.rasmblyNm ?? "",
    biKndNm: bill.biKndNm,
    biSj: bill.biSj,
    biNo: bill.biNo,
    propsr: bill.propsr,
    itncDe: bill.itncDe,
  });

  if (!result) {
    // 실패 — 캐시 갱신 없이 null 반환 (생성 실패 의미)
    return null;
  }

  const model = process.env.LLM_MODEL?.trim() || "gemini-2.5-flash";
  const now = new Date();

  const updated = await prisma.councilBill.update({
    where: { docId },
    data: {
      aiSummary: result.summary,
      aiChanges: result.changes,
      aiSourceSnippets: result.sources as unknown as Prisma.InputJsonValue,
      aiGeneratedAt: now,
      aiModel: model,
    },
  });
  return toDto(updated);
}

"use client";

import { useState } from "react";
import {
  FileText,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { generateBillSummary, ApiError } from "@/lib/api";
import type { BillSummaryResponseDTO } from "@repo/shared";

interface BillAiSummaryProps {
  billId: string;
  initial: BillSummaryResponseDTO; // SSR에서 fetch한 캐시 (없으면 aiSummary=null)
}

export function BillAiSummary({ billId, initial }: BillAiSummaryProps) {
  const [data, setData] = useState<BillSummaryResponseDTO>(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCached = !!data.aiSummary;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const fresh = await generateBillSummary(billId);
      setData(fresh);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 429) {
          setError(
            "잠시 후 다시 시도해주세요. (1분에 1회만 생성할 수 있습니다)",
          );
        } else if (e.status === 503) {
          setError("AI 요약 서비스가 현재 비활성화되어 있습니다.");
        } else if (e.status === 502) {
          setError(
            "AI 요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
          );
        } else {
          setError(e.message || "요약 생성 중 오류가 발생했습니다.");
        }
      } else {
        setError("요약 생성 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">AI 요약 보기</h3>
            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              BETA
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {hasCached
              ? "Gemini가 web 검색으로 정리한 법안 요약"
              : "버튼을 누르면 Gemini가 web 검색으로 요약을 만듭니다 (5~15초)"}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {/* 캐시 없음 + 비로딩 → CTA */}
          {!hasCached && !loading && !error && (
            <div className="flex flex-col items-start gap-3 pt-4">
              <p className="text-sm text-slate-700">
                AI가 의안정보시스템과 관련 보도를 web 검색으로 종합해 한국어로 요약합니다.
                개정안인 경우 변경되는 조항도 함께 정리됩니다.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-sm transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                지금 생성하기
              </button>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center gap-3 pt-4 text-sm text-slate-600">
              <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
              <span>
                Gemini가 의안정보시스템 + 관련 보도 검색 중... (보통 5~15초 소요)
              </span>
            </div>
          )}

          {/* 에러 */}
          {error && !loading && (
            <div className="flex items-start gap-3 pt-4 p-3 mt-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {/* 캐시 표시 */}
          {hasCached && !loading && (
            <div className="flex flex-col gap-4 pt-4">
              {/* 요약 본문 */}
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    제안이유·주요내용 요약
                  </h4>
                  <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {data.aiSummary}
                  </div>
                </div>
              </div>

              {/* 변경점 (개정안) */}
              {data.aiChanges && (
                <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                      개정안 — 변경되는 부분
                    </h4>
                    <div className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                      {data.aiChanges}
                    </div>
                  </div>
                </div>
              )}

              {/* 출처 */}
              {data.aiSourceSnippets && data.aiSourceSnippets.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    참고 출처 ({data.aiSourceSnippets.length}개)
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {data.aiSourceSnippets.slice(0, 8).map((s, idx) => (
                      <li key={`${s.uri}-${idx}`} className="text-xs">
                        <a
                          href={s.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 hover:underline break-all"
                        >
                          <span className="truncate">
                            {s.title?.trim() ? s.title : s.uri}
                          </span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* meta + 재생성 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-400">
                  {data.aiGeneratedAt &&
                    `생성일 ${data.aiGeneratedAt.slice(0, 10)}`}
                  {data.aiModel && (
                    <>
                      {data.aiGeneratedAt ? " · " : ""}
                      {data.aiModel}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="text-xs text-slate-500 hover:text-amber-700 hover:underline disabled:opacity-50"
                >
                  다시 생성
                </button>
              </div>
            </div>
          )}

          {/* Disclaimer (항상 표시) */}
          <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-100 leading-relaxed">
            AI 자동 요약입니다. 정확성은 원문 직접 확인을 권장합니다.
          </p>
        </div>
      )}
    </div>
  );
}

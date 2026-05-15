"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCouncilBills,
  getCouncilBillSummary,
  generateCouncilBillSummary,
} from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { CouncilBillDTO, CouncilBillSummaryDTO } from "@repo/shared";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  FileText,
} from "lucide-react";

const LIMIT = 20;

interface CouncilBillsTabProps {
  rasmblyNm: string;
  legislatorName: string;
}

function billKindClass(kind: string | null): string {
  if (!kind) return "bg-slate-100 text-slate-600 border-slate-200";
  if (kind.includes("조례")) return "bg-blue-100 text-blue-800 border-blue-200";
  if (kind.includes("건의")) return "bg-amber-100 text-amber-800 border-amber-200";
  if (kind.includes("결의")) return "bg-purple-100 text-purple-800 border-purple-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function CouncilBillsTab({
  rasmblyNm,
  legislatorName,
}: CouncilBillsTabProps) {
  const [bills, setBills] = useState<CouncilBillDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCouncilBills(rasmblyNm, { limit: LIMIT, offset });
      setBills(data.bills);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [rasmblyNm, offset]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const externalSearchUrl = `https://clik.nanet.go.kr/potal/search/searchList.do?collection=bill&query=${encodeURIComponent(
    legislatorName,
  )}`;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-500">{error}</div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="py-8">
        <EmptyState message="의안 데이터를 수집 중입니다. 곧 표시됩니다." />
        <div className="mt-4 text-center">
          <a
            href={externalSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            CLIK에서 &quot;{legislatorName}&quot; 의안 직접 검색
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        ※ 의회 단위 의안입니다. 개별 의원의 발의 안건만 보려면
        <a
          href={externalSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-blue-600 hover:underline inline-flex items-center gap-0.5"
        >
          CLIK 직접 검색
          <ExternalLink className="w-3 h-3" />
        </a>
        을 이용하세요.
      </p>
      <div className="space-y-2">
        {bills.map((b) => (
          <CouncilBillRow key={b.id} bill={b} />
        ))}
      </div>
      <Pagination
        offset={offset}
        limit={LIMIT}
        total={total}
        onPrev={() => setOffset((o) => Math.max(0, o - LIMIT))}
        onNext={() => setOffset((o) => o + LIMIT)}
      />
    </div>
  );
}

function CouncilBillRow({ bill }: { bill: CouncilBillDTO }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 transition-colors">
      {/* 상단: 종류 배지 + 안건제목 */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {bill.biKndNm && (
              <span
                className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${billKindClass(bill.biKndNm)}`}
              >
                {bill.biKndNm}
              </span>
            )}
            {bill.biNo && (
              <span className="text-xs text-slate-500">{bill.biNo}</span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800 leading-snug">
            {bill.biSj}
          </p>
        </div>
      </div>

      {/* 메타 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {bill.itncDe && <span>{bill.itncDe}</span>}
        {bill.itncDe && bill.propsr && <span className="text-slate-300">·</span>}
        {bill.propsr && (
          <span className="line-clamp-1 max-w-[20rem]">{bill.propsr}</span>
        )}
      </div>

      {/* 액션 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> 내용 접기
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> 내용 보기
            </>
          )}
        </button>
        {bill.viewUrl && (
          <a
            href={bill.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-blue-500 transition-colors inline-flex items-center gap-1"
          >
            CLIK 원문 보기 <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {expanded && <CouncilBillSummary docId={bill.docId} />}
    </div>
  );
}

function CouncilBillSummary({ docId }: { docId: string }) {
  const [data, setData] = useState<CouncilBillSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCouncilBillSummary(docId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "요약을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const fresh = await generateCouncilBillSummary(docId);
      setData(fresh);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 px-3 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 inline-flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 요약 불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 px-3 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
        {error}
      </div>
    );
  }

  if (!data || !data.aiSummary) {
    return (
      <div className="mt-3 px-3 py-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="mb-2">
            아직 AI 요약이 없습니다. Gemini가 web 검색으로 5~15초 안에 생성합니다.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> 생성 중…
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" /> AI 요약 생성하기
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3 text-xs">
      <div>
        <div className="flex items-center gap-1 mb-1.5 text-slate-600 font-semibold">
          <FileText className="w-3.5 h-3.5" /> 요약
        </div>
        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
          {data.aiSummary}
        </p>
      </div>
      {data.aiChanges && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
          <p className="text-amber-900 font-semibold mb-1">개정 변경점</p>
          <p className="text-amber-900 leading-relaxed whitespace-pre-wrap">
            {data.aiChanges}
          </p>
        </div>
      )}
      {data.aiSourceSnippets && data.aiSourceSnippets.length > 0 && (
        <div>
          <p className="text-slate-500 mb-1">출처</p>
          <ul className="space-y-0.5">
            {data.aiSourceSnippets.slice(0, 5).map((s, i) => (
              <li key={i}>
                <a
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {s.title ?? s.uri} <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-slate-400 leading-relaxed">
        AI 자동 요약입니다 ({data.aiModel ?? "Gemini"}). 정확성은 CLIK 원본 보기를 권장합니다.
      </p>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import { getLegislatorVotes, getBillSummary, generateBillSummary } from "@/lib/api";
import { VoteResultBadge } from "@/components/VoteResultBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { BillSummaryResponseDTO, VoteRecordDTO, VoteResult } from "@repo/shared";

const LIMIT = 20;

const RESULT_FILTERS: { label: string; value: string }[] = [
  { label: "전체", value: "" },
  { label: "찬성", value: "YES" },
  { label: "반대", value: "NO" },
  { label: "기권", value: "ABSTAIN" },
  { label: "불참", value: "ABSENT" },
];

interface VotesTabProps {
  legislatorId: string;
}

export function VotesTab({ legislatorId }: VotesTabProps) {
  const [votes, setVotes] = useState<VoteRecordDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLegislatorVotes(legislatorId, {
        limit: LIMIT,
        offset,
        result: result || undefined,
      });
      setVotes(data.votes);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [legislatorId, offset, result]);

  useEffect(() => {
    fetchVotes();
  }, [fetchVotes]);

  function handleResultChange(val: string) {
    setResult(val);
    setOffset(0);
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {RESULT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleResultChange(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              result === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : votes.length === 0 ? (
        <EmptyState message="표결 이력이 없습니다." />
      ) : (
        <>
          <div className="space-y-2">
            {votes.map((vote) => (
              <VoteRow key={vote.id} vote={vote} />
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={LIMIT}
            total={total}
            onPrev={() => setOffset((o) => Math.max(0, o - LIMIT))}
            onNext={() => setOffset((o) => o + LIMIT)}
          />
        </>
      )}
    </div>
  );
}

function VoteRow({ vote }: { vote: VoteRecordDTO }) {
  const billName = vote.billName ?? vote.billNo;
  const [expanded, setExpanded] = useState(false);
  const canExpand = !!vote.billId;

  return (
    <div className="border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 transition-colors">
      {/* Top row: bill name + result badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {vote.billId ? (
            <Link
              href={`/bill/${vote.billId}`}
              className="text-sm font-medium text-blue-600 hover:underline leading-snug line-clamp-2"
            >
              {billName}
            </Link>
          ) : (
            <span className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">
              {billName}
            </span>
          )}
        </div>
        <div className="flex-shrink-0">
          <VoteResultBadge result={vote.result as VoteResult} />
        </div>
      </div>

      {/* Middle row: meta info */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {vote.committee && (
          <span>{vote.committee}</span>
        )}
        {vote.committee && (vote.primaryProposerName || vote.coProposerCount > 0) && (
          <span className="text-slate-300">·</span>
        )}
        {vote.primaryProposerName && (
          <span>
            대표발의{" "}
            {vote.primaryProposerLegislatorId ? (
              <Link
                href={`/legislator/${vote.primaryProposerLegislatorId}`}
                className="text-blue-600 hover:underline font-medium"
              >
                {vote.primaryProposerName}
              </Link>
            ) : (
              <span className="text-slate-700 font-medium">{vote.primaryProposerName}</span>
            )}
          </span>
        )}
        {vote.primaryProposerName && vote.coProposerCount > 0 && (
          <span className="text-slate-300">·</span>
        )}
        {vote.coProposerCount > 0 && (
          <span>공동 {vote.coProposerCount}명</span>
        )}
        {(vote.committee || vote.primaryProposerName || vote.coProposerCount > 0) && (
          <span className="text-slate-300">·</span>
        )}
        <span>{vote.voteDate.slice(0, 10)}</span>
      </div>

      {/* Action row: expand toggle + 원문 보기 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {canExpand ? (
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
        ) : (
          <span />
        )}
        {vote.linkUrl && (
          <a
            href={vote.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-blue-500 transition-colors inline-flex items-center gap-1"
          >
            원문 보기 <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Expanded: AI summary inline */}
      {expanded && vote.billId && (
        <VoteContentDetail billId={vote.billId} />
      )}
    </div>
  );
}

function VoteContentDetail({ billId }: { billId: string }) {
  const [data, setData] = useState<BillSummaryResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBillSummary(billId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "요약을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const fresh = await generateBillSummary(billId);
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
        AI 자동 요약입니다 ({data.aiModel ?? "Gemini"}). 정확성은 원문 직접 확인을 권장합니다.
      </p>
    </div>
  );
}

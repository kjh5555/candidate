"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getLegislatorVotes } from "@/lib/api";
import { VoteResultBadge } from "@/components/VoteResultBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { VoteRecordDTO, VoteResult } from "@repo/shared";

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
                className="text-blue-500 hover:underline"
              >
                {vote.primaryProposerName}
              </Link>
            ) : (
              <span className="text-slate-600">{vote.primaryProposerName}</span>
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

      {/* Bottom row: 원문 보기 link */}
      {vote.linkUrl && (
        <div className="mt-1.5 text-right">
          <a
            href={vote.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-blue-500 transition-colors"
          >
            원문 보기 →
          </a>
        </div>
      )}
    </div>
  );
}

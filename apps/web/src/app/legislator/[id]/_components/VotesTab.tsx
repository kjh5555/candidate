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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : votes.length === 0 ? (
        <EmptyState message="표결 이력이 없습니다." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">의안번호</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">의안명</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">표결일</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">결과</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((vote) => (
                  <tr
                    key={vote.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2 px-3 text-slate-500 hidden sm:table-cell text-xs">
                      {vote.billNo}
                    </td>
                    <td className="py-2 px-3">
                      {vote.billId ? (
                        <Link
                          href={`/bill/${vote.billId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {vote.billName ?? vote.billNo}
                        </Link>
                      ) : (
                        <span className="text-slate-700">{vote.billName ?? vote.billNo}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-500 hidden sm:table-cell">
                      {vote.voteDate ? vote.voteDate.slice(0, 10) : "-"}
                    </td>
                    <td className="py-2 px-3">
                      <VoteResultBadge result={vote.result as VoteResult} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

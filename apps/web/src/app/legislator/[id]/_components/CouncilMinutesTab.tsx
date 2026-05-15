"use client";

import { useState, useEffect, useCallback } from "react";
import { getCouncilMinutes } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { CouncilMinutesDTO } from "@repo/shared";
import { ExternalLink } from "lucide-react";

const LIMIT = 20;

interface CouncilMinutesTabProps {
  rasmblyNm: string;
  legislatorName: string;
}

export function CouncilMinutesTab({
  rasmblyNm,
  legislatorName,
}: CouncilMinutesTabProps) {
  const [minutes, setMinutes] = useState<CouncilMinutesDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMinutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCouncilMinutes(rasmblyNm, { limit: LIMIT, offset });
      setMinutes(data.minutes);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [rasmblyNm, offset]);

  useEffect(() => {
    fetchMinutes();
  }, [fetchMinutes]);

  const externalSearchUrl = `https://clik.nanet.go.kr/potal/search/searchList.do?collection=minutes&query=${encodeURIComponent(
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

  if (minutes.length === 0) {
    return (
      <div className="py-8">
        <EmptyState message="회의록 데이터를 수집 중입니다. 곧 표시됩니다." />
        <div className="mt-4 text-center">
          <a
            href={externalSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            CLIK에서 &quot;{legislatorName}&quot; 회의록 직접 검색
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        ※ 의회 단위 회의록입니다. 개별 의원 발언 검색은
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium">회의일자</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">회기</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium hidden md:table-cell">차수</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">회의명</th>
            </tr>
          </thead>
          <tbody>
            {minutes.map((m) => (
              <tr
                key={m.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => {
                  if (m.viewUrl) window.open(m.viewUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                  {m.mtgDe ?? "-"}
                </td>
                <td className="py-2 px-3 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                  {m.sesn ? `${m.sesn}회` : "-"}
                </td>
                <td className="py-2 px-3 text-slate-500 hidden md:table-cell whitespace-nowrap">
                  {m.numpr ? `${m.numpr}차` : "-"}
                </td>
                <td className="py-2 px-3">
                  {m.viewUrl ? (
                    <a
                      href={m.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      {m.mtgNm?.replace(/\n/g, " ") ?? "(이름 없음)"}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span>{m.mtgNm?.replace(/\n/g, " ") ?? "(이름 없음)"}</span>
                  )}
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
    </div>
  );
}

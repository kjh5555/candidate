"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCouncilMinutes } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { CouncilMinutesDTO } from "@repo/shared";
import { ExternalLink, FileText } from "lucide-react";

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

  // 같은 날짜·회기·차수·회의명에서 "[임시]" 제거 후 중복 제거
  // (CLIK이 동일 회의를 "본회의"·"본회의 [임시]"로 이중 등록하는 경우가 있음)
  const deduped = (() => {
    const seen = new Set<string>();
    return minutes.filter((m) => {
      const cleanedNm = (m.mtgNm ?? "")
        .replace(/\n/g, " ")
        .replace(/\s*\[임시\]\s*/g, "")
        .trim();
      const key = `${m.mtgDe ?? ""}|${m.sesn ?? ""}|${m.numpr ?? ""}|${cleanedNm}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

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
            {deduped.map((m) => {
              const rawNm = m.mtgNm?.replace(/\n/g, " ") ?? "";
              const isTemp = rawNm.includes("[임시]");
              const cleanNm = rawNm.replace(/\s*\[임시\]\s*/g, "").trim() || "(이름 없음)";
              const detailHref = `/minutes/${encodeURIComponent(m.docId)}`;
              return (
                <tr
                  key={m.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                    <Link href={detailHref} className="block">
                      {m.mtgDe ?? "-"}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                    {m.sesn ? `${m.sesn}회` : "-"}
                  </td>
                  <td className="py-2 px-3 text-slate-500 hidden md:table-cell whitespace-nowrap">
                    {m.numpr ? `${m.numpr}차` : "-"}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isTemp && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium shrink-0">
                          임시
                        </span>
                      )}
                      <Link
                        href={detailHref}
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        {cleanNm}
                      </Link>
                      {m.viewUrl && (
                        <a
                          href={m.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-slate-400 hover:text-slate-600 inline-flex items-center gap-0.5"
                          title="CLIK 원본 보기"
                        >
                          원본
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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

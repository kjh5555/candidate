"use client";

import { useState, useEffect, useCallback } from "react";
import { getCouncilBills } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { CouncilBillDTO } from "@repo/shared";
import { ExternalLink } from "lucide-react";

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell whitespace-nowrap">번호</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium whitespace-nowrap">종류</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">안건제목</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium hidden md:table-cell whitespace-nowrap">접수일</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium hidden lg:table-cell">제안자</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr
                key={b.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => {
                  if (b.viewUrl) window.open(b.viewUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <td className="py-2 px-3 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                  {b.biNo ?? "-"}
                </td>
                <td className="py-2 px-3 whitespace-nowrap">
                  {b.biKndNm ? (
                    <span
                      className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${billKindClass(b.biKndNm)}`}
                    >
                      {b.biKndNm}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-2 px-3">
                  {b.viewUrl ? (
                    <a
                      href={b.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <span className="line-clamp-2">{b.biSj}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="line-clamp-2">{b.biSj}</span>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-500 hidden md:table-cell whitespace-nowrap">
                  {b.itncDe ?? "-"}
                </td>
                <td className="py-2 px-3 text-slate-500 hidden lg:table-cell">
                  <span className="line-clamp-1 max-w-[16rem]">
                    {b.propsr ?? "-"}
                  </span>
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

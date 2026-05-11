"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getLegislatorBills } from "@/lib/api";
import { BillResultBadge } from "@/components/BillResultBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import type { BillSummaryDTO, ProposerRole } from "@repo/shared";

const LIMIT = 20;

const ROLE_FILTERS: { label: string; value: string }[] = [
  { label: "전체", value: "" },
  { label: "대표발의", value: "PRIMARY" },
  { label: "공동발의", value: "CO" },
];

const ROLE_LABELS: Record<ProposerRole, string> = {
  PRIMARY: "대표발의",
  CO: "공동발의",
};

interface BillsTabProps {
  legislatorId: string;
}

export function BillsTab({ legislatorId }: BillsTabProps) {
  const [bills, setBills] = useState<BillSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLegislatorBills(legislatorId, {
        limit: LIMIT,
        offset,
        role: role || undefined,
      });
      setBills(data.bills);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [legislatorId, offset, role]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  function handleRoleChange(val: string) {
    setRole(val);
    setOffset(0);
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleRoleChange(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              role === f.value
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
      ) : bills.length === 0 ? (
        <EmptyState message="발의 법안이 없습니다." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">법안명</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">위원회</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">발의일</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">결과</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium hidden sm:table-cell">역할</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2 px-3">
                      <Link
                        href={`/bill/${bill.id}`}
                        className="text-blue-600 hover:underline line-clamp-2"
                      >
                        {bill.name}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-slate-500 hidden sm:table-cell">
                      {bill.committee ?? "-"}
                    </td>
                    <td className="py-2 px-3 text-slate-500 hidden sm:table-cell">
                      {bill.proposedDate ? bill.proposedDate.slice(0, 10) : "-"}
                    </td>
                    <td className="py-2 px-3">
                      <BillResultBadge result={bill.result} />
                    </td>
                    <td className="py-2 px-3 hidden sm:table-cell">
                      {bill.role ? (
                        <span className="text-xs text-slate-500">
                          {ROLE_LABELS[bill.role]}
                        </span>
                      ) : "-"}
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

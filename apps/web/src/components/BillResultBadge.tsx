import type { BillResult } from "@repo/shared";

const BILL_LABELS: Record<BillResult, string> = {
  PASSED: "가결",
  PASSED_AMENDED: "수정가결",
  REJECTED: "부결",
  WITHDRAWN: "철회",
  SUPERSEDED: "대안반영",
  PENDING: "계류중",
};

const BILL_COLORS: Record<BillResult, string> = {
  PASSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PASSED_AMENDED: "bg-teal-50 text-teal-700 border-teal-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  WITHDRAWN: "bg-slate-100 text-slate-500 border-slate-200",
  SUPERSEDED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
};

interface BillResultBadgeProps {
  result: BillResult | null | undefined;
}

export function BillResultBadge({ result }: BillResultBadgeProps) {
  if (!result) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${BILL_COLORS[result]}`}
    >
      {BILL_LABELS[result]}
    </span>
  );
}

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
  PASSED: "bg-green-100 text-green-800",
  PASSED_AMENDED: "bg-teal-100 text-teal-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-gray-100 text-gray-600",
  SUPERSEDED: "bg-purple-100 text-purple-800",
  PENDING: "bg-yellow-100 text-yellow-800",
};

interface BillResultBadgeProps {
  result: BillResult | null | undefined;
}

export function BillResultBadge({ result }: BillResultBadgeProps) {
  if (!result) return <span className="text-slate-400 text-xs">-</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BILL_COLORS[result]}`}
    >
      {BILL_LABELS[result]}
    </span>
  );
}

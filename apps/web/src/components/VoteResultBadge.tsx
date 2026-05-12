import type { VoteResult } from "@repo/shared";

const VOTE_LABELS: Record<VoteResult, string> = {
  YES: "찬성",
  NO: "반대",
  ABSTAIN: "기권",
  ABSENT: "불참",
};

const VOTE_COLORS: Record<VoteResult, string> = {
  YES: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NO: "bg-red-50 text-red-700 border-red-200",
  ABSTAIN: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-slate-100 text-slate-500 border-slate-200",
};

interface VoteResultBadgeProps {
  result: VoteResult;
}

export function VoteResultBadge({ result }: VoteResultBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${VOTE_COLORS[result]}`}
    >
      {VOTE_LABELS[result]}
    </span>
  );
}

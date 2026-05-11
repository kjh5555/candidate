import type { VoteResult } from "@repo/shared";

const VOTE_LABELS: Record<VoteResult, string> = {
  YES: "찬성",
  NO: "반대",
  ABSTAIN: "기권",
  ABSENT: "불참",
};

const VOTE_COLORS: Record<VoteResult, string> = {
  YES: "bg-green-100 text-green-800",
  NO: "bg-red-100 text-red-800",
  ABSTAIN: "bg-yellow-100 text-yellow-800",
  ABSENT: "bg-gray-100 text-gray-600",
};

interface VoteResultBadgeProps {
  result: VoteResult;
}

export function VoteResultBadge({ result }: VoteResultBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${VOTE_COLORS[result]}`}
    >
      {VOTE_LABELS[result]}
    </span>
  );
}

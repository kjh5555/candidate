import { getPartyColorClass } from "@/lib/partyColors";

interface PartyBadgeProps {
  party: string | null | undefined;
}

export function PartyBadge({ party }: PartyBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getPartyColorClass(party)}`}
    >
      {party ?? "무소속"}
    </span>
  );
}

export function getPartyColorClass(party: string | null | undefined): string {
  if (!party) return "bg-gray-100 text-gray-700";
  if (party.includes("더불어민주당")) return "bg-blue-100 text-blue-800";
  if (party.includes("국민의힘")) return "bg-red-100 text-red-800";
  if (party.includes("정의당")) return "bg-yellow-100 text-yellow-800";
  if (party.includes("진보당")) return "bg-orange-100 text-orange-800";
  if (party.includes("무소속")) return "bg-gray-100 text-gray-600";
  return "bg-slate-100 text-slate-700";
}

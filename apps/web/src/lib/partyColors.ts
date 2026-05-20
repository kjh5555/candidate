// 정당 대표색 — 공식 로고/공약지 기준 근사치
// 사용처: PartyBadge, 의원 카드 좌측 보더 등
export interface PartyColor {
  bg: string; // tailwind bg class (light tint)
  text: string; // tailwind text class
  hex: string; // raw hex for inline style (border-l, dots)
}

export function getPartyColor(party: string | null | undefined): PartyColor {
  if (!party) {
    return { bg: "bg-slate-100", text: "text-slate-600", hex: "#64748b" };
  }
  // 더불어민주당 계열 (파랑)
  if (party.includes("더불어민주당") || party.includes("민주당")) {
    return { bg: "bg-blue-50", text: "text-blue-700", hex: "#1e40af" };
  }
  // 국민의힘 (빨강)
  if (party.includes("국민의힘")) {
    return { bg: "bg-red-50", text: "text-red-700", hex: "#dc2626" };
  }
  // 개혁신당 (주황)
  if (party.includes("개혁신당")) {
    return { bg: "bg-orange-50", text: "text-orange-700", hex: "#ea580c" };
  }
  // 조국혁신당 (하늘)
  if (party.includes("조국혁신당")) {
    return { bg: "bg-sky-50", text: "text-sky-700", hex: "#0284c7" };
  }
  // 정의당 (노랑)
  if (party.includes("정의당")) {
    return { bg: "bg-yellow-50", text: "text-yellow-700", hex: "#ca8a04" };
  }
  // 진보당 (로즈)
  if (party.includes("진보당")) {
    return { bg: "bg-rose-50", text: "text-rose-700", hex: "#e11d48" };
  }
  // 새로운미래 (보라)
  if (party.includes("새로운미래")) {
    return { bg: "bg-violet-50", text: "text-violet-700", hex: "#7c3aed" };
  }
  // 기본소득당 (틸)
  if (party.includes("기본소득당")) {
    return { bg: "bg-teal-50", text: "text-teal-700", hex: "#0d9488" };
  }
  // 무소속
  if (party.includes("무소속")) {
    return { bg: "bg-slate-100", text: "text-slate-600", hex: "#64748b" };
  }
  return { bg: "bg-slate-100", text: "text-slate-700", hex: "#475569" };
}

// 하위호환: 기존 코드의 getPartyColorClass 호출 보존
export function getPartyColorClass(party: string | null | undefined): string {
  const c = getPartyColor(party);
  return `${c.bg} ${c.text}`;
}

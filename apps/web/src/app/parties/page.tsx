"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { getParties, type PartySummaryDTO } from "@/lib/api";
import { getPartyColor } from "@/lib/partyColors";

const POSITION_LABEL: Record<string, string> = {
  GOVERNOR: "시·도지사",
  MAYOR: "시장·군수·구청장",
  PROVINCIAL_COUNCILOR: "광역의원",
  BASIC_COUNCILOR: "기초의원",
  SUPERINTENDENT: "교육감",
  PROVINCIAL_COUNCILOR_PROP: "광역 비례",
  BASIC_COUNCILOR_PROP: "기초 비례",
  NATIONAL_ASSEMBLY: "국회 보궐",
};

const LEVEL_LABEL: Record<string, string> = {
  NATIONAL: "국회",
  PROVINCIAL: "광역의회",
  BASIC: "기초의회",
};

export default function PartiesPage() {
  const [items, setItems] = useState<PartySummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getParties()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">정당</h1>
        <p className="text-sm text-slate-500 mt-1">
          대한민국 등록 정당별 6.3 지방선거 후보 수, 현직 의원 수, 정당 정보.
          정당 카드를 클릭하면 소속 후보·의원 명단을 볼 수 있습니다.
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 bg-slate-50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          정당 데이터를 불러오지 못했습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <PartyCard key={p.party} party={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PartyCard({ party }: { party: PartySummaryDTO }) {
  const color = getPartyColor(party.party);
  const topPositions = Object.entries(party.candidatesByPosition)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topLevels = Object.entries(party.legislatorsByLevel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <Link
      href={`/parties/${encodeURIComponent(party.party)}`}
      className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: color.hex }}
          />
          <h2 className="font-bold text-slate-900 group-hover:text-blue-700">
            {party.party}
          </h2>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            현직 의원
          </p>
          <p className="text-lg font-bold text-slate-900">
            {party.totalLegislators}
            <span className="text-xs text-slate-500 font-medium ml-0.5">명</span>
          </p>
          <div className="text-[10px] text-slate-500 mt-1 leading-tight">
            {topLevels.map(([k, v]) => (
              <div key={k}>
                {LEVEL_LABEL[k] ?? k} {v}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            6.3 후보
          </p>
          <p className="text-lg font-bold text-slate-900">
            {party.totalCandidates}
            <span className="text-xs text-slate-500 font-medium ml-0.5">명</span>
          </p>
          <div className="text-[10px] text-slate-500 mt-1 leading-tight">
            {topPositions.map(([k, v]) => (
              <div key={k}>
                {POSITION_LABEL[k] ?? k} {v}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, User, ExternalLink } from "lucide-react";
import {
  getPartyDetail,
  type PartyDetailResponse,
  type PartyDetailCandidate,
  type PartyDetailLegislator,
} from "@/lib/api";
import { getPartyColor } from "@/lib/partyColors";

const POSITION_LABEL: Record<string, string> = {
  GOVERNOR: "시·도지사",
  MAYOR: "시장·군수·구청장",
  PROVINCIAL_COUNCILOR: "광역의원(지역구)",
  BASIC_COUNCILOR: "기초의원(지역구)",
  SUPERINTENDENT: "교육감",
  PROVINCIAL_COUNCILOR_PROP: "광역의원(비례)",
  BASIC_COUNCILOR_PROP: "기초의원(비례)",
  NATIONAL_ASSEMBLY: "국회 보궐",
};

const LEVEL_LABEL: Record<string, string> = {
  NATIONAL: "국회의원",
  PROVINCIAL: "광역의원",
  BASIC: "기초의원",
};

export default function PartyDetailPage() {
  const params = useParams();
  const partyName = decodeURIComponent(String(params?.name ?? ""));
  const [data, setData] = useState<PartyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const color = getPartyColor(partyName);

  useEffect(() => {
    if (!partyName) return;
    setLoading(true);
    getPartyDetail(partyName)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [partyName]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-16 bg-slate-50 rounded animate-pulse mb-6" />
        <div className="h-96 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-slate-400">
        정당 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const candidatesByPosition: Record<string, PartyDetailCandidate[]> = {};
  for (const c of data.candidates) {
    if (!candidatesByPosition[c.positionType]) {
      candidatesByPosition[c.positionType] = [];
    }
    candidatesByPosition[c.positionType].push(c);
  }
  const legislatorsByLevel: Record<string, PartyDetailLegislator[]> = {};
  for (const l of data.legislators) {
    if (!legislatorsByLevel[l.level]) legislatorsByLevel[l.level] = [];
    legislatorsByLevel[l.level].push(l);
  }

  const wikiUrl = `https://ko.wikipedia.org/wiki/${encodeURIComponent(partyName)}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/parties"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        정당 목록
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="w-5 h-5 rounded-full shrink-0"
            style={{ background: color.hex }}
          />
          <h1 className="text-3xl font-bold text-slate-900">{partyName}</h1>
        </div>
        <p className="text-sm text-slate-500">
          현직 의원 {data.counts.legislators}명 · 6.3 지방선거 후보{" "}
          {data.counts.candidates}명
        </p>
        <a
          href={wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
        >
          위키피디아에서 당대표·강령·역사 보기
          <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          현직 의원
        </h2>
        {data.legislators.length === 0 ? (
          <p className="text-sm text-slate-400">현직 의원 정보가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(legislatorsByLevel).map(([lv, list]) => (
              <div
                key={lv}
                className="bg-white rounded-xl border border-slate-200 p-5"
              >
                <h3 className="font-semibold text-slate-700 text-sm mb-3">
                  {LEVEL_LABEL[lv] ?? lv}{" "}
                  <span className="text-slate-400">({list.length}명)</span>
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                  {list.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/legislator/${l.id}`}
                        className="block px-3 py-2 rounded hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-800">
                          {l.name}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                          {l.region ?? l.councilName ?? ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          6.3 지방선거 후보
        </h2>
        {data.candidates.length === 0 ? (
          <p className="text-sm text-slate-400">등록 후보가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(candidatesByPosition).map(([pos, list]) => (
              <div
                key={pos}
                className="bg-white rounded-xl border border-slate-200 p-5"
              >
                <h3 className="font-semibold text-slate-700 text-sm mb-3">
                  {POSITION_LABEL[pos] ?? pos}{" "}
                  <span className="text-slate-400">({list.length}명)</span>
                </h3>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {list.map((c) => (
                    <CandidateMiniCard key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CandidateMiniCard({ c }: { c: PartyDetailCandidate }) {
  const region = [c.sido, c.wiwName].filter(Boolean).join(" ");
  return (
    <li>
      <Link
        href={`/candidate/${c.id}`}
        className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 transition-colors"
      >
        {c.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.photoUrl}
            alt={c.name}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">
            {c.name}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {region || c.districtName || "—"}
          </div>
        </div>
      </Link>
    </li>
  );
}


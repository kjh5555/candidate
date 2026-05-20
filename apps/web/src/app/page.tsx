"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  ArrowRight,
  Building2,
  Users,
  PieChart,
  Vote,
  CalendarDays,
  BookOpen,
  Database,
  TrendingUp,
} from "lucide-react";
import { getBasicRegions, getRegionHub } from "@/lib/api";
import { setMyRegion, getMyRegion } from "@/lib/myRegion";
import type {
  BasicRegionDTO,
  LegislatorSummaryDTO,
  RegionHubDTO,
} from "@repo/shared";

const ELECTION_DATE = new Date("2026-06-03T00:00:00+09:00");

function calcDaysToElection(): number {
  const now = new Date();
  const ms = ELECTION_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function HomePage() {
  const router = useRouter();
  const [regions, setRegions] = useState<BasicRegionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedWiw, setSelectedWiw] = useState<string>("");
  const [myRegion, setMyRegionState] = useState<{
    sido: string | null;
    wiwName: string | null;
  }>({ sido: null, wiwName: null });
  const [hub, setHub] = useState<RegionHubDTO | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<
    "ALL" | "NATIONAL" | "PROVINCIAL" | "BASIC"
  >("ALL");

  // Hydrate from localStorage
  useEffect(() => {
    const stored = getMyRegion();
    if (stored.sido) setSelectedSido(stored.sido);
    if (stored.wiwName) setSelectedWiw(stored.wiwName);
    setMyRegionState(stored);
  }, []);

  // Fetch regions list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBasicRegions()
      .then((res) => {
        if (cancelled) return;
        setRegions(res.regions);
      })
      .catch(() => {
        if (cancelled) return;
        setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch region hub if user has region set
  useEffect(() => {
    if (!myRegion.sido || !myRegion.wiwName) {
      setHub(null);
      return;
    }
    let cancelled = false;
    setHubLoading(true);
    getRegionHub(myRegion.sido, myRegion.wiwName)
      .then((res) => {
        if (cancelled) return;
        setHub(res);
      })
      .catch(() => {
        if (cancelled) return;
        setHub(null);
      })
      .finally(() => {
        if (!cancelled) setHubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myRegion.sido, myRegion.wiwName]);

  const sidoList = useMemo(() => {
    const set = new Set<string>();
    for (const r of regions) set.add(r.sido);
    return Array.from(set).sort();
  }, [regions]);

  const wiwList = useMemo(() => {
    if (!selectedSido) return [];
    return regions
      .filter((r) => r.sido === selectedSido)
      .map((r) => r.wiwName)
      .sort();
  }, [regions, selectedSido]);

  function handleSidoChange(sido: string) {
    setSelectedSido(sido);
    setSelectedWiw("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSido || !selectedWiw) return;
    setMyRegion(selectedSido, selectedWiw);
    setMyRegionState({ sido: selectedSido, wiwName: selectedWiw });
  }

  const canSubmit = Boolean(selectedSido && selectedWiw);
  const hasRegion = Boolean(myRegion.sido && myRegion.wiwName);

  // Filtered members
  const filteredMembers: LegislatorSummaryDTO[] = useMemo(() => {
    if (!hub) return [];
    const all = [
      ...hub.legislators.national,
      ...hub.legislators.provincial,
      ...hub.legislators.basic,
    ];
    if (levelFilter === "ALL") return all;
    return all.filter((l) => l.level === levelFilter);
  }, [hub, levelFilter]);

  const daysToElection = calcDaysToElection();

  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <section className="pt-4 sm:pt-8">
        <p className="text-xs font-bold tracking-widest text-[#b89766] uppercase mb-3">
          내 의원·내 예산 · 시민 거버넌스 허브
        </p>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-[#031635] leading-tight tracking-tight mb-3">
          우리 동네 정치를
          <br className="hidden sm:block" /> 한 화면에서.
        </h1>
        <p className="text-[#5a6473] text-base sm:text-lg leading-relaxed max-w-2xl">
          내 지역 의원·예산·후보·법안을 5분 안에 확인하고 책무를 확인하세요.
        </p>

        {/* Region selector */}
        <form
          onSubmit={handleSubmit}
          className="mt-7 bg-white border border-[#e8e4d8] rounded-2xl shadow-sm p-5 max-w-3xl"
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[#031635]" />
            <p className="text-sm font-semibold text-[#031635]">
              {hasRegion ? "내 지역 변경" : "내 지역 선택"}
            </p>
            {hasRegion && (
              <span className="ml-auto text-xs text-[#5a6473]">
                현재:{" "}
                <b className="text-[#031635]">
                  {myRegion.sido} {myRegion.wiwName}
                </b>
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <select
                value={selectedSido}
                onChange={(e) => handleSidoChange(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-3 bg-white border border-[#e8e4d8] rounded-xl text-[#031635] outline-none focus:border-[#031635] focus:ring-1 focus:ring-[#031635] disabled:opacity-60"
              >
                <option value="">시/도 선택</option>
                {sidoList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <select
                value={selectedWiw}
                onChange={(e) => setSelectedWiw(e.target.value)}
                disabled={!selectedSido || loading}
                className="w-full px-3 py-3 bg-white border border-[#e8e4d8] rounded-xl text-[#031635] outline-none focus:border-[#031635] focus:ring-1 focus:ring-[#031635] disabled:opacity-60"
              >
                <option value="">시/군/구 선택</option>
                {wiwList.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-3 bg-[#031635] text-white rounded-xl font-semibold hover:bg-[#0a2150] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" /> 조회
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-[#8a8775]">
          286 국회의원 · 872 광역의원 · 3,563 기초의원 · 1,493 후보 ·
          17,151 법안
        </p>
      </section>

      {/* Body — show member dashboard if region set */}
      {hasRegion ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Members */}
          <section className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#031635]">
                내 지역 의원
              </h2>
              <div className="flex gap-1 bg-[#ece8dc] rounded-full p-1">
                {(
                  [
                    { value: "ALL", label: "전체" },
                    { value: "NATIONAL", label: "국회" },
                    { value: "PROVINCIAL", label: "광역" },
                    { value: "BASIC", label: "기초" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLevelFilter(opt.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      levelFilter === opt.value
                        ? "bg-[#031635] text-white"
                        : "text-[#5a6473] hover:text-[#031635]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {hubLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-[#e8e4d8] h-56 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#e8e4d8] p-8 text-center text-sm text-[#5a6473]">
                해당 레벨 의원 정보가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredMembers.slice(0, 6).map((m) => (
                  <MemberCard key={m.id} m={m} />
                ))}
              </div>
            )}

            {/* Bento data cards */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-[#031635] to-[#0a2150] text-white rounded-2xl p-6 overflow-hidden relative">
                <div className="relative z-10">
                  <p className="text-xs font-bold tracking-wider text-[#b89766] mb-2">
                    내 지역 의정 데이터
                  </p>
                  <p className="text-2xl font-bold leading-snug">
                    {hub
                      ? `의원 ${
                          hub.legislators.national.length +
                          hub.legislators.provincial.length +
                          hub.legislators.basic.length
                        }명`
                      : "—"}
                  </p>
                  <p className="text-sm opacity-80 mt-1">
                    국회·광역·기초 의원 통합 표시
                  </p>
                  {hub && (
                    <Link
                      href={`/region-hub?sido=${encodeURIComponent(myRegion.sido ?? "")}&wiwName=${encodeURIComponent(myRegion.wiwName ?? "")}`}
                      className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:gap-2 transition-all"
                    >
                      지역 허브 보기 <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
                <Users className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10" />
              </div>

              <div className="bg-white border border-[#e8e4d8] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold tracking-wider text-[#5a6473]">
                    최신 데이터 적재 현황
                  </p>
                  <TrendingUp className="w-4 h-4 text-[#b89766]" />
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#b89766]" />
                    <span className="text-[#031635] flex-1">기초의원 사진</span>
                    <span className="text-xs font-semibold text-[#5a6473]">
                      매일 +400명
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#031635]" />
                    <span className="text-[#031635] flex-1">9회 지선 후보</span>
                    <span className="text-xs font-semibold text-[#5a6473]">
                      1,493명
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0a2150]" />
                    <span className="text-[#031635] flex-1">법안 표결</span>
                    <span className="text-xs font-semibold text-[#5a6473]">
                      450k건
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Right: Sidebar */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Budget widget */}
            <div className="bg-white border border-[#e8e4d8] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#031635]">우리 지역 예산</h3>
                <PieChart className="w-4 h-4 text-[#8a8775]" />
              </div>
              {hub?.settlement && hub.settlement.items.length > 0 ? (
                <BudgetWidget settlement={hub.settlement} />
              ) : (
                <p className="text-sm text-[#5a6473] py-6 text-center">
                  결산 데이터가 아직 적재되지 않았습니다.
                </p>
              )}
            </div>

            {/* Election widget */}
            <div className="bg-white border border-[#e8e4d8] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#031635]">다가오는 선거</h3>
                <CalendarDays className="w-4 h-4 text-[#8a8775]" />
              </div>
              <div className="bg-[#031635] text-white rounded-xl p-4 mb-3 relative overflow-hidden">
                <p className="text-xs font-bold tracking-wider text-[#b89766] mb-0.5">
                  D-{daysToElection}
                </p>
                <p className="font-bold">제9회 전국동시지방선거</p>
                <p className="text-xs opacity-70 mt-1">2026. 06. 03 (수)</p>
                <Vote className="absolute -right-3 -bottom-3 w-20 h-20 opacity-10" />
              </div>
              <div className="space-y-2">
                <Link
                  href={`/candidates?electionId=20260603&sido=${encodeURIComponent(myRegion.sido ?? "")}&wiwName=${encodeURIComponent(myRegion.wiwName ?? "")}`}
                  className="flex items-center justify-between p-3 hover:bg-[#f7f5ee] rounded-xl border border-[#e8e4d8] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#031635]/10 flex items-center justify-center">
                      <Vote className="w-4 h-4 text-[#031635]" />
                    </div>
                    <span className="text-sm font-semibold text-[#031635]">
                      내 지역 후보 보기
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8a8775]" />
                </Link>
                <Link
                  href="/about"
                  className="flex items-center justify-between p-3 hover:bg-[#f7f5ee] rounded-xl border border-[#e8e4d8] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#b89766]/15 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-[#b89766]" />
                    </div>
                    <span className="text-sm font-semibold text-[#031635]">
                      뭘 뽑는지 알아보기
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8a8775]" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        // No region: feature cards
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/about"
            className="group flex flex-col gap-3 bg-white border border-[#e8e4d8] rounded-2xl p-6 hover:border-[#031635] hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-[#031635]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[#031635]" />
            </div>
            <p className="font-bold text-[#031635]">제도 알아보기</p>
            <p className="text-sm text-[#5a6473] leading-relaxed">
              국회의원·광역·기초의원이 무엇을 하는지, 지방선거에서 무엇을
              뽑는지 알아보세요.
            </p>
          </Link>
          <Link
            href="/budget"
            className="group flex flex-col gap-3 bg-white border border-[#e8e4d8] rounded-2xl p-6 hover:border-[#b89766] hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-[#b89766]/15 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-[#b89766]" />
            </div>
            <p className="font-bold text-[#031635]">전체 예산 보기</p>
            <p className="text-sm text-[#5a6473] leading-relaxed">
              국가·광역·기초 예산이 어디에 얼마나 쓰이는지 분야별로 확인하세요.
            </p>
          </Link>
          <Link
            href="/candidates"
            className="group flex flex-col gap-3 bg-white border border-[#e8e4d8] rounded-2xl p-6 hover:border-[#031635] hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-[#031635]/10 flex items-center justify-center">
              <Vote className="w-5 h-5 text-[#031635]" />
            </div>
            <p className="font-bold text-[#031635]">9회 지선 후보 검색</p>
            <p className="text-sm text-[#5a6473] leading-relaxed">
              2026.6.3 시·도지사·시장·군수·구청장 후보의 전과·재산·공약.
            </p>
          </Link>
          <div className="sm:col-span-3 flex items-center gap-3 bg-[#031635] text-white rounded-2xl p-5">
            <Database className="w-5 h-5 text-[#b89766] shrink-0" />
            <p className="text-sm leading-relaxed opacity-90">
              국회·NEC·지방재정365·CLIK·공공데이터포털 기반 비영리 시민
              정보 서비스. 모든 데이터는 원본 출처와 함께 표시됩니다.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function MemberCard({ m }: { m: LegislatorSummaryDTO }) {
  const levelLabel =
    m.level === "NATIONAL"
      ? "국회의원"
      : m.level === "PROVINCIAL"
        ? "광역의원"
        : "기초의원";
  const badgeClass =
    m.level === "NATIONAL"
      ? "bg-[#031635] text-white"
      : m.level === "PROVINCIAL"
        ? "bg-[#0a2150] text-white"
        : "bg-[#b89766] text-white";

  return (
    <Link
      href={`/legislator/${m.id}`}
      className="group bg-white border border-[#e8e4d8] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#031635] transition-all"
    >
      <div className="relative h-44 bg-[#ece8dc] overflow-hidden">
        {m.photoUrl ? (
          <Image
            src={m.photoUrl}
            alt={m.name}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#c9c4b3]">
            <Users className="w-16 h-16" />
          </div>
        )}
        <span
          className={`absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded ${badgeClass}`}
        >
          {levelLabel}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-[#031635]">{m.name}</h3>
          {m.party && (
            <span className="text-[10px] text-[#5a6473] bg-[#f7f5ee] px-2 py-0.5 rounded-full shrink-0">
              {m.party}
            </span>
          )}
        </div>
        <p className="text-xs text-[#5a6473] truncate">
          {m.electoralDistrictName ?? m.councilName ?? "—"}
        </p>
        {m.committee && (
          <p className="text-xs text-[#8a8775] mt-1 truncate">{m.committee}</p>
        )}
      </div>
    </Link>
  );
}

function BudgetWidget({
  settlement,
}: {
  settlement: RegionHubDTO["settlement"];
}) {
  if (!settlement) return null;
  const top = settlement.items.slice(0, 3);
  const others = settlement.items.slice(3);
  const otherSum = others.reduce((a, b) => a + b.percent, 0);

  // Build conic gradient (navy + warm gold + cream palette)
  const colors = ["#031635", "#0a2150", "#b89766", "#d9c79a"];
  let acc = 0;
  const segments: string[] = [];
  const allItems = [...top.map((t, i) => ({ ...t, color: colors[i] }))];
  if (otherSum > 0)
    allItems.push({
      field: "기타",
      amount: "0",
      percent: otherSum,
      color: colors[3],
    });
  for (const s of allItems) {
    segments.push(`${s.color} ${acc}% ${acc + s.percent}%`);
    acc += s.percent;
  }
  const conic = `conic-gradient(${segments.join(", ")})`;

  return (
    <>
      <div
        className="w-40 h-40 mx-auto rounded-full relative mb-4"
        style={{ background: conic }}
      >
        <div className="absolute inset-6 bg-white rounded-full flex flex-col items-center justify-center">
          <p className="text-[10px] font-semibold text-[#b89766] uppercase tracking-widest">
            총결산
          </p>
          <p className="text-lg font-extrabold text-[#031635]">
            {settlement.fiscalYear}년
          </p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {allItems.map((item) => (
          <li key={item.field} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              <span className="text-[#031635] truncate">{item.field}</span>
            </div>
            <span className="font-semibold text-[#031635] tabular-nums">
              {item.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

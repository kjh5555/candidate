"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  ArrowRight,
  Users,
  PieChart,
  Vote,
  CalendarDays,
  BookOpen,
  Database,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { getBasicRegions, getRegionHub } from "@/lib/api";
import { setMyRegion, getMyRegion } from "@/lib/myRegion";
import { getPartyColor } from "@/lib/partyColors";
import type {
  BasicRegionDTO,
  LegislatorSummaryDTO,
  OfficialPledgeDTO,
  RegionHubDTO,
} from "@repo/shared";

const ELECTION_DATE = new Date("2026-06-03T00:00:00+09:00");
const PRIMARY = "#031635";
const PRIMARY_HOVER = "#0a2150";
const SECONDARY = "#206298";
const BORDER = "#e5e7eb";
const SURFACE = "#f8f9fa";
const SURFACE_CONTAINER = "#edeeef";
const ON_VARIANT = "#44474e";

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

  // 사용자가 폼에서 지역을 새로 선택했을 때만 의원 섹션으로 스크롤.
  // 페이지 진입 시 localStorage 복원에서는 스크롤하지 않음.
  const dashboardRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);

  useEffect(() => {
    const stored = getMyRegion();
    if (stored.sido) setSelectedSido(stored.sido);
    if (stored.wiwName) setSelectedWiw(stored.wiwName);
    setMyRegionState(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBasicRegions()
      .then((res) => {
        if (!cancelled) setRegions(res.regions);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!myRegion.sido || !myRegion.wiwName) {
      setHub(null);
      return;
    }
    let cancelled = false;
    setHubLoading(true);
    getRegionHub(myRegion.sido, myRegion.wiwName)
      .then((res) => {
        if (!cancelled) setHub(res);
      })
      .catch(() => {
        if (!cancelled) setHub(null);
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
    pendingScrollRef.current = true;
  }

  // hub fetch가 끝나고 dashboard가 렌더된 뒤 한 번만 부드럽게 스크롤
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    if (hubLoading) return;
    if (!hub) return;
    const node = dashboardRef.current;
    if (!node) return;
    pendingScrollRef.current = false;
    // 다음 paint에서 실행 — 카드 그리드가 페인트된 후 스크롤
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [hub, hubLoading]);

  const canSubmit = Boolean(selectedSido && selectedWiw);
  const hasRegion = Boolean(myRegion.sido && myRegion.wiwName);

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
        <p
          className="text-xs font-bold tracking-widest uppercase mb-3"
          style={{ color: SECONDARY }}
        >
          내 의원·내 예산 · 시민 거버넌스 허브
        </p>
        <h1
          className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-3"
          style={{ color: PRIMARY }}
        >
          우리 동네 정치를
          <br className="hidden sm:block" /> 한 화면에서.
        </h1>
        <p
          className="text-base sm:text-lg leading-relaxed max-w-2xl"
          style={{ color: ON_VARIANT }}
        >
          내 지역 의원·예산·후보·법안을 5분 안에 확인하고 책무를 확인하세요.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-7 bg-white rounded-2xl shadow-sm p-5 max-w-3xl"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4" style={{ color: PRIMARY }} />
            <p className="text-sm font-semibold" style={{ color: PRIMARY }}>
              {hasRegion ? "내 지역 변경" : "내 지역 선택"}
            </p>
            {hasRegion && (
              <span className="ml-auto text-xs" style={{ color: ON_VARIANT }}>
                현재:{" "}
                <b style={{ color: PRIMARY }}>
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
                className="w-full px-3 py-3 bg-white rounded-xl outline-none disabled:opacity-60"
                style={{
                  color: PRIMARY,
                  border: `1px solid ${BORDER}`,
                }}
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
                className="w-full px-3 py-3 bg-white rounded-xl outline-none disabled:opacity-60"
                style={{
                  color: PRIMARY,
                  border: `1px solid ${BORDER}`,
                }}
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
              className="px-6 py-3 text-white rounded-xl font-semibold active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: PRIMARY }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = PRIMARY_HOVER)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = PRIMARY)
              }
            >
              <Search className="w-4 h-4" /> 조회
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs" style={{ color: "#75777f" }}>
          286 국회의원 · 872 광역의원 · 3,563 기초의원 · 1,493 후보 ·
          17,151 법안
        </p>
      </section>

      {hasRegion ? (
        <>
        <div
          ref={dashboardRef}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-20"
        >
          <section className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: PRIMARY }}>
                내 지역 의원
              </h2>
              <div
                className="flex gap-1 rounded-full p-1"
                style={{ backgroundColor: SURFACE_CONTAINER }}
              >
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
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                    style={
                      levelFilter === opt.value
                        ? { backgroundColor: PRIMARY, color: "#fff" }
                        : { color: ON_VARIANT, background: "transparent" }
                    }
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
                    className="bg-white rounded-2xl h-72 animate-pulse"
                    style={{ border: `1px solid ${BORDER}` }}
                  />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div
                className="bg-white rounded-2xl p-8 text-center text-sm"
                style={{
                  border: `1px solid ${BORDER}`,
                  color: ON_VARIANT,
                }}
              >
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
              <div
                className="rounded-2xl p-6 overflow-hidden relative text-white"
                style={{
                  background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
                }}
              >
                <div className="relative z-10">
                  <p className="text-xs font-bold tracking-wider opacity-70 mb-2">
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

              <div
                className="bg-white rounded-2xl p-6"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p
                    className="text-xs font-bold tracking-wider"
                    style={{ color: ON_VARIANT }}
                  >
                    최신 데이터 적재 현황
                  </p>
                  <TrendingUp className="w-4 h-4" style={{ color: SECONDARY }} />
                </div>
                <ul className="space-y-2 text-sm">
                  {[
                    { label: "기초의원 사진", note: "매일 +400명", dot: SECONDARY },
                    {
                      label: "9회 지선 후보",
                      note: "1,493명",
                      dot: PRIMARY,
                    },
                    {
                      label: "법안 표결",
                      note: "450k건",
                      dot: "#8bc3fe",
                    },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.dot }}
                      />
                      <span className="flex-1" style={{ color: PRIMARY }}>
                        {row.label}
                      </span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: ON_VARIANT }}
                      >
                        {row.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <aside className="lg:col-span-4 space-y-6">
            {hub?.settlement && hub.settlement.items.length > 0 ? (
              <Link
                href={`/budget?tab=settlement&sido=${encodeURIComponent(myRegion.sido ?? "")}${hub.settlement.unitCode ? `&unitCode=${encodeURIComponent(hub.settlement.unitCode)}` : ""}`}
                className="block bg-white rounded-2xl p-6 hover:shadow-md transition-all group"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold" style={{ color: PRIMARY }}>
                    우리 지역 예산
                  </h3>
                  <div className="flex items-center gap-1">
                    <span
                      className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: SECONDARY }}
                    >
                      자세히
                    </span>
                    <ArrowRight
                      className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                      style={{ color: SECONDARY }}
                    />
                  </div>
                </div>
                <BudgetWidget settlement={hub.settlement} />
              </Link>
            ) : (
              <div
                className="bg-white rounded-2xl p-6"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold" style={{ color: PRIMARY }}>
                    우리 지역 예산
                  </h3>
                  <PieChart className="w-4 h-4" style={{ color: "#75777f" }} />
                </div>
                <p
                  className="text-sm py-6 text-center"
                  style={{ color: ON_VARIANT }}
                >
                  결산 데이터가 아직 적재되지 않았습니다.
                </p>
              </div>
            )}

            <div
              className="bg-white rounded-2xl p-6"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold" style={{ color: PRIMARY }}>
                  다가오는 선거
                </h3>
                <CalendarDays
                  className="w-4 h-4"
                  style={{ color: "#75777f" }}
                />
              </div>
              <div
                className="text-white rounded-xl p-4 mb-3 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
                }}
              >
                <p className="text-xs font-bold tracking-wider opacity-80 mb-0.5">
                  D-{daysToElection}
                </p>
                <p className="font-bold">제9회 전국동시지방선거</p>
                <p className="text-xs opacity-70 mt-1">2026. 06. 03 (수)</p>
                <Vote className="absolute -right-3 -bottom-3 w-20 h-20 opacity-10" />
              </div>
              <div className="space-y-2">
                <Link
                  href={`/candidates?electionId=20260603&sido=${encodeURIComponent(myRegion.sido ?? "")}&wiwName=${encodeURIComponent(myRegion.wiwName ?? "")}`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f3f4f5] transition-colors"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#eef1f7" }}
                    >
                      <Vote
                        className="w-4 h-4"
                        style={{ color: SECONDARY }}
                      />
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: PRIMARY }}
                    >
                      내 지역 후보 보기
                    </span>
                  </div>
                  <ChevronRight
                    className="w-4 h-4"
                    style={{ color: "#75777f" }}
                  />
                </Link>
                <Link
                  href="/about"
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f3f4f5] transition-colors"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#eef1f7" }}
                    >
                      <BookOpen
                        className="w-4 h-4"
                        style={{ color: SECONDARY }}
                      />
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: PRIMARY }}
                    >
                      뭘 뽑는지 알아보기
                    </span>
                  </div>
                  <ChevronRight
                    className="w-4 h-4"
                    style={{ color: "#75777f" }}
                  />
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* 단체장 공약 */}
        {hub?.officialPledges &&
          (hub.officialPledges.governor ||
            hub.officialPledges.mayor ||
            hub.officialPledges.superintendent) && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-1 h-6 rounded-full"
                  style={{ backgroundColor: PRIMARY }}
                />
                <div>
                  <h2
                    className="text-xl font-bold"
                    style={{ color: PRIMARY }}
                  >
                    현 단체장 공약
                  </h2>
                  <p className="text-xs" style={{ color: ON_VARIANT }}>
                    2022 지선 당선 시점 NEC 등록 공약. 의정활동과 직접 대조해 평가하세요.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hub.officialPledges.governor && (
                  <HomePledgeCard pledge={hub.officialPledges.governor} />
                )}
                {hub.officialPledges.mayor && (
                  <HomePledgeCard pledge={hub.officialPledges.mayor} />
                )}
                {hub.officialPledges.superintendent && (
                  <HomePledgeCard pledge={hub.officialPledges.superintendent} />
                )}
              </div>
            </section>
          )}

        {/* 후보자 (시·도지사·기초단체장) */}
        {hub &&
          (hub.candidates.governor.length > 0 ||
            hub.candidates.mayor.length > 0) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-1 h-6 rounded-full"
                    style={{ backgroundColor: PRIMARY }}
                  />
                  <h2
                    className="text-xl font-bold"
                    style={{ color: PRIMARY }}
                  >
                    2026.6.3 지방선거 후보
                  </h2>
                </div>
                <Link
                  href={`/candidates?electionId=20260603&sido=${encodeURIComponent(myRegion.sido ?? "")}&wiwName=${encodeURIComponent(myRegion.wiwName ?? "")}`}
                  className="text-xs font-semibold inline-flex items-center gap-0.5"
                  style={{ color: SECONDARY }}
                >
                  전체 보기 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {hub.candidates.governor.length > 0 && (
                  <div
                    className="bg-white rounded-2xl p-5"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    <p
                      className="text-[10px] font-bold tracking-widest uppercase mb-3"
                      style={{ color: SECONDARY }}
                    >
                      {myRegion.sido} 시·도지사 후보
                    </p>
                    <ul className="space-y-2">
                      {hub.candidates.governor.slice(0, 6).map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className="w-1 h-4 rounded shrink-0"
                            style={{
                              backgroundColor: getPartyColor(c.party).hex,
                            }}
                          />
                          <span style={{ color: PRIMARY, fontWeight: 600 }}>
                            {c.name}
                          </span>
                          {c.party && (
                            <span
                              className="text-[11px]"
                              style={{ color: ON_VARIANT }}
                            >
                              {c.party}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hub.candidates.mayor.length > 0 && (
                  <div
                    className="bg-white rounded-2xl p-5"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    <p
                      className="text-[10px] font-bold tracking-widest uppercase mb-3"
                      style={{ color: SECONDARY }}
                    >
                      {myRegion.wiwName} 단체장 후보
                    </p>
                    <ul className="space-y-2">
                      {hub.candidates.mayor.slice(0, 6).map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className="w-1 h-4 rounded shrink-0"
                            style={{
                              backgroundColor: getPartyColor(c.party).hex,
                            }}
                          />
                          <span style={{ color: PRIMARY, fontWeight: 600 }}>
                            {c.name}
                          </span>
                          {c.party && (
                            <span
                              className="text-[11px]"
                              style={{ color: ON_VARIANT }}
                            >
                              {c.party}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

        {/* 외부 의회 링크 */}
        {hub?.externalLinks &&
          (hub.externalLinks.sidoSite ||
            hub.externalLinks.provincialCouncil) && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-1 h-6 rounded-full"
                  style={{ backgroundColor: PRIMARY }}
                />
                <h2
                  className="text-xl font-bold"
                  style={{ color: PRIMARY }}
                >
                  공식 사이트
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hub.externalLinks.sidoSite && (
                  <a
                    href={hub.externalLinks.sidoSite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    <div>
                      <p
                        className="text-[10px] font-bold tracking-widest uppercase mb-1"
                        style={{ color: SECONDARY }}
                      >
                        {myRegion.sido}
                      </p>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: PRIMARY }}
                      >
                        공식 홈페이지
                      </p>
                    </div>
                    <ArrowRight
                      className="w-4 h-4"
                      style={{ color: "#75777f" }}
                    />
                  </a>
                )}
                {hub.externalLinks.provincialCouncil && (
                  <a
                    href={hub.externalLinks.provincialCouncil}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    <div>
                      <p
                        className="text-[10px] font-bold tracking-widest uppercase mb-1"
                        style={{ color: SECONDARY }}
                      >
                        {myRegion.sido}의회
                      </p>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: PRIMARY }}
                      >
                        광역의회 홈페이지
                      </p>
                    </div>
                    <ArrowRight
                      className="w-4 h-4"
                      style={{ color: "#75777f" }}
                    />
                  </a>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            href="/about"
            icon={<BookOpen className="w-5 h-5" style={{ color: PRIMARY }} />}
            title="제도 알아보기"
            desc="국회의원·광역·기초의원이 무엇을 하는지, 지방선거에서 무엇을 뽑는지 알아보세요."
          />
          <FeatureCard
            href="/legislators"
            icon={<Users className="w-5 h-5" style={{ color: SECONDARY }} />}
            title="의원 검색"
            desc="국회·광역·기초 의원을 이름·지역으로 검색하고, 발의 법안·표결·재산을 한눈에 확인하세요."
            iconBg="#eef1f7"
          />
          <FeatureCard
            href="/candidates"
            icon={<Vote className="w-5 h-5" style={{ color: PRIMARY }} />}
            title="9회 지선 후보 검색"
            desc="2026.6.3 시·도지사·시장·군수·구청장 후보의 전과·재산·공약."
          />
          <div
            className="sm:col-span-3 flex items-center gap-3 text-white rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
            }}
          >
            <Database className="w-5 h-5 shrink-0 opacity-80" />
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

function HomePledgeCard({ pledge }: { pledge: OfficialPledgeDTO }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pledge.pledges : pledge.pledges.slice(0, 3);
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="p-4 text-white"
        style={{
          background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
        }}
      >
        <p className="text-[10px] font-bold tracking-widest opacity-70 uppercase mb-1">
          {pledge.positionLabel}
        </p>
        <p className="text-base font-bold">
          {pledge.name}
          {pledge.party && (
            <span className="text-xs font-normal opacity-80 ml-2">
              {pledge.party}
            </span>
          )}
        </p>
      </div>
      <div className="p-4 space-y-2.5">
        {visible.map((p) => (
          <div key={p.ord}>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span
                className="text-[10px] font-bold tabular-nums shrink-0"
                style={{ color: "#75777f" }}
              >
                {p.ord}
              </span>
              {p.realm && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: SURFACE_CONTAINER,
                    color: ON_VARIANT,
                  }}
                >
                  {p.realm}
                </span>
              )}
              <h4
                className="text-sm font-semibold leading-snug"
                style={{ color: PRIMARY }}
              >
                {p.title}
              </h4>
            </div>
            {p.content && (
              <p
                className="text-xs leading-relaxed line-clamp-2 ml-4"
                style={{ color: ON_VARIANT }}
              >
                {p.content}
              </p>
            )}
          </div>
        ))}
        {pledge.pledges.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-xs font-semibold pt-2"
            style={{
              color: SECONDARY,
              borderTop: `1px solid ${BORDER}`,
            }}
          >
            {expanded
              ? "접기"
              : `공약 ${pledge.pledges.length - 3}개 더 보기`}
          </button>
        )}
      </div>
    </div>
  );
}

function FeatureCard({
  href,
  icon,
  title,
  desc,
  iconBg = "#eef1f7",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  iconBg?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 bg-white rounded-2xl p-6 hover:shadow-md transition-all"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <p className="font-bold" style={{ color: PRIMARY }}>
        {title}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: ON_VARIANT }}>
        {desc}
      </p>
    </Link>
  );
}

function MemberCard({ m }: { m: LegislatorSummaryDTO }) {
  const levelLabel =
    m.level === "NATIONAL"
      ? "국회의원"
      : m.level === "PROVINCIAL"
        ? "광역의원"
        : "기초의원";
  const levelBg =
    m.level === "NATIONAL"
      ? SECONDARY
      : m.level === "PROVINCIAL"
        ? PRIMARY
        : "#5a6473";
  const partyColor = getPartyColor(m.party);
  const stats = m.stats ?? null;

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-all flex flex-col"
      style={{
        border: `1px solid ${BORDER}`,
        borderLeft: `4px solid ${partyColor.hex}`,
      }}
    >
      <Link href={`/legislator/${m.id}`} className="block">
        <div
          className="relative h-44 overflow-hidden"
          style={{ backgroundColor: SURFACE_CONTAINER }}
        >
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
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ color: "#c5c6cf" }}
            >
              <Users className="w-16 h-16" />
            </div>
          )}
          <span
            className="absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded text-white"
            style={{ backgroundColor: levelBg }}
          >
            {levelLabel}
          </span>
        </div>
      </Link>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold truncate" style={{ color: PRIMARY }}>
              {m.name}
            </h3>
            <p className="text-xs truncate" style={{ color: ON_VARIANT }}>
              {m.electoralDistrictName ?? m.councilName ?? "—"}
            </p>
          </div>
          {m.party && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${partyColor.bg} ${partyColor.text}`}
            >
              {m.party}
            </span>
          )}
        </div>

        {stats && (stats.primaryBills !== null || stats.attendanceRate !== null) ? (
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: SURFACE_CONTAINER }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: ON_VARIANT }}
              >
                대표 발의
              </p>
              <p
                className="text-lg font-extrabold tabular-nums"
                style={{ color: PRIMARY }}
              >
                {stats.primaryBills ?? "—"}건
              </p>
            </div>
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: SURFACE_CONTAINER }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: ON_VARIANT }}
              >
                출석률
              </p>
              <p
                className="text-lg font-extrabold tabular-nums"
                style={{ color: PRIMARY }}
              >
                {stats.attendanceRate !== null
                  ? `${stats.attendanceRate.toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p
            className="text-xs truncate"
            style={{ color: "#75777f" }}
          >
            {m.committee ?? ""}
          </p>
        )}

        <Link
          href={`/legislator/${m.id}`}
          className="mt-auto w-full text-center py-2 rounded font-semibold text-xs hover:bg-[#f3f4f5] transition-colors"
          style={{
            color: PRIMARY,
            border: `1px solid ${BORDER}`,
          }}
        >
          상세 활동 보기
        </Link>
      </div>
    </div>
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

  const colors = [PRIMARY, SECONDARY, "#8bc3fe", "#c5c6cf"];
  let acc = 0;
  const segments: string[] = [];
  const allItems = [...top.map((t, i) => ({ ...t, color: colors[i] }))];
  if (otherSum > 0) {
    allItems.push({
      field: "기타",
      amount: "0",
      percent: otherSum,
      color: colors[3],
    });
  }
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
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: ON_VARIANT }}
          >
            총결산
          </p>
          <p className="text-lg font-extrabold" style={{ color: PRIMARY }}>
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
              <span className="truncate" style={{ color: PRIMARY }}>
                {item.field}
              </span>
            </div>
            <span
              className="font-semibold tabular-nums"
              style={{ color: PRIMARY }}
            >
              {item.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search, Vote, Database, BookOpen, PieChart } from "lucide-react";
import { getBasicRegions } from "@/lib/api";
import { setMyRegion, getMyRegion } from "@/lib/myRegion";
import type { BasicRegionDTO } from "@repo/shared";

export default function HomePage() {
  const router = useRouter();
  const [regions, setRegions] = useState<BasicRegionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedWiw, setSelectedWiw] = useState<string>("");

  // Hydrate from localStorage so returning users see their region pre-selected.
  useEffect(() => {
    const stored = getMyRegion();
    if (stored.sido) setSelectedSido(stored.sido);
    if (stored.wiwName) setSelectedWiw(stored.wiwName);
  }, []);

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
    router.push(
      `/region-hub?sido=${encodeURIComponent(selectedSido)}&wiwName=${encodeURIComponent(selectedWiw)}`,
    );
  }

  const canSubmit = Boolean(selectedSido && selectedWiw);

  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <section className="pt-4 sm:pt-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
            열린의회 · 시민 거버넌스 허브
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
            내 지역 거버넌스를 5분 안에
          </h1>
          <p className="text-slate-500 text-base sm:text-lg leading-relaxed">
            내 지역구 의원·후보·예산·법안을 한 페이지에서 확인하세요.
          </p>
        </div>
      </section>

      {/* 단일 입력 — 시·도 + 시·군·구 */}
      <section>
        <div className="w-full max-w-2xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-slate-700">내 지역 선택</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* 시·도 */}
              <div className="flex-1">
                <label
                  htmlFor="hub-sido-select"
                  className="block text-xs font-medium text-slate-500 mb-1.5"
                >
                  시/도
                </label>
                <select
                  id="hub-sido-select"
                  value={selectedSido}
                  onChange={(e) => handleSidoChange(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">시/도 선택</option>
                  {sidoList.map((sido) => (
                    <option key={sido} value={sido}>
                      {sido}
                    </option>
                  ))}
                </select>
              </div>

              {/* 시·군·구 */}
              <div className="flex-1">
                <label
                  htmlFor="hub-wiw-select"
                  className="block text-xs font-medium text-slate-500 mb-1.5"
                >
                  시/군/구
                </label>
                <select
                  id="hub-wiw-select"
                  value={selectedWiw}
                  onChange={(e) => setSelectedWiw(e.target.value)}
                  disabled={!selectedSido || loading}
                  className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">시/군/구 선택</option>
                  {wiwList.map((wiw) => (
                    <option key={wiw} value={wiw}>
                      {wiw}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search className="w-4 h-4" />내 지역 허브 보기
            </button>
          </form>

          {/* 데이터 통계 */}
          <p className="mt-4 text-xs text-slate-400 text-center">
            286 국회의원 · 872 광역의원 · 2,987 기초의원 · 8,907 예산 항목
          </p>
        </div>
      </section>

      {/* 보조 카드: 사이트 소개 · 데이터 출처 · 제도 알아보기 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/about"
          className="group flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-700" />
          </div>
          <p className="font-semibold text-slate-900">제도 알아보기</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            국회의원·광역·기초의원이 무엇을 하는지, 지방선거에서 무엇을 뽑는지
            알아보세요.
          </p>
        </Link>

        <Link
          href="/budget"
          className="group flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <PieChart className="w-5 h-5 text-emerald-700" />
          </div>
          <p className="font-semibold text-slate-900">전체 예산 보기</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            국가·광역·기초 예산이 어디에 얼마나 쓰이는지 분야별로 확인하세요.
          </p>
        </Link>

        <div className="flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-violet-700" />
          </div>
          <p className="font-semibold text-slate-900">데이터 출처</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            국회·중앙선거관리위원회·지방재정365·공공데이터포털 기반
            비영리 시민 정보 서비스.
          </p>
        </div>
      </section>

      {/* 보조: 지방선거 후보 검색 (추후 통합검색으로 확장 가능) */}
      <section>
        <Link
          href="/candidates?electionId=20260603&positionType=ALL"
          className="group flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl p-5 hover:border-violet-400 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Vote className="w-5 h-5 text-violet-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                2026.6.3 지방선거 전체 후보 검색
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                시·도지사·시장·군수·구청장 후보의 전과·재산·공약을 통합 검색하세요.
              </p>
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}

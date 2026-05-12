"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getBudgetYears,
  getBudgetByField,
  getBudgetByMinistry,
  getBudgetBySido,
  getBudgetSidoDetail,
} from "@/lib/api";
import type { BudgetBreakdownDTO } from "@repo/shared";
import { BudgetChart } from "@/components/budget/BudgetChart";
import { Amount } from "@/components/budget/AmountFormatter";

type BudgetTab = "national" | "metropolitan";

const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시",
  "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-slate-700 mb-3">{children}</h3>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
      {message}
    </div>
  );
}

function LoadingBar() {
  return (
    <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
      불러오는 중...
    </div>
  );
}

function SourceNote({ text }: { text: string }) {
  return (
    <p className="text-xs text-slate-400 mt-4 text-right">{text}</p>
  );
}

export default function BudgetPage() {
  const [tab, setTab] = useState<BudgetTab>("national");

  // Years
  const [nationalYears, setNationalYears] = useState<number[]>([]);
  const [metroYears, setMetroYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);

  // National state
  const [natYear, setNatYear] = useState<number | null>(null);
  const [natFieldData, setNatFieldData] = useState<BudgetBreakdownDTO | null>(null);
  const [natMinistryData, setNatMinistryData] = useState<BudgetBreakdownDTO | null>(null);
  const [natLoading, setNatLoading] = useState(false);

  // Metro state
  const [metYear, setMetYear] = useState<number | null>(null);
  const [selectedSido, setSelectedSido] = useState<string>(SIDO_LIST[0]);
  const [sidoDetailData, setSidoDetailData] = useState<BudgetBreakdownDTO | null>(null);
  const [allSidoData, setAllSidoData] = useState<BudgetBreakdownDTO | null>(null);
  const [metLoading, setMetLoading] = useState(false);

  // Load years on mount
  useEffect(() => {
    setYearsLoading(true);
    Promise.all([
      getBudgetYears("NATIONAL").catch(() => ({ years: [] as number[] })),
      getBudgetYears("METROPOLITAN").catch(() => ({ years: [] as number[] })),
    ]).then(([nat, met]) => {
      setNationalYears(nat.years);
      setMetroYears(met.years);
      if (nat.years.length > 0) setNatYear(nat.years[0]);
      if (met.years.length > 0) setMetYear(met.years[0]);
      setYearsLoading(false);
    });
  }, []);

  // Load national data when year changes
  const loadNational = useCallback(async (year: number) => {
    setNatLoading(true);
    setNatFieldData(null);
    setNatMinistryData(null);
    try {
      const [field, ministry] = await Promise.all([
        getBudgetByField(year).catch(() => null),
        getBudgetByMinistry(year).catch(() => null),
      ]);
      setNatFieldData(field);
      setNatMinistryData(ministry);
    } finally {
      setNatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (natYear !== null) loadNational(natYear);
  }, [natYear, loadNational]);

  // Load metro data when year or sido changes
  const loadMetro = useCallback(async (year: number, sido: string) => {
    setMetLoading(true);
    setSidoDetailData(null);
    setAllSidoData(null);
    try {
      const [detail, all] = await Promise.all([
        getBudgetSidoDetail(sido, year).catch(() => null),
        getBudgetBySido(year).catch(() => null),
      ]);
      setSidoDetailData(detail);
      setAllSidoData(all);
    } finally {
      setMetLoading(false);
    }
  }, []);

  useEffect(() => {
    if (metYear !== null) loadMetro(metYear, selectedSido);
  }, [metYear, selectedSido, loadMetro]);

  if (yearsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        데이터 불러오는 중...
      </div>
    );
  }

  const noData = nationalYears.length === 0 && metroYears.length === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">예산 정보</h1>
        <p className="text-slate-500 text-sm sm:text-base">
          국가와 시·도 예산이 어디에 얼마나 쓰였는지 확인하세요
        </p>
      </div>

      {noData ? (
        <EmptyState message="예산 데이터가 아직 적재되지 않았습니다" />
      ) : (
        <>
          {/* Tab + Year selector row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div
              role="tablist"
              aria-label="예산 구분"
              className="inline-flex bg-slate-100 p-1 rounded-xl"
            >
              <button
                role="tab"
                aria-selected={tab === "national"}
                onClick={() => setTab("national")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === "national"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                국가 예산
              </button>
              <button
                role="tab"
                aria-selected={tab === "metropolitan"}
                onClick={() => setTab("metropolitan")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === "metropolitan"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                광역 예산
              </button>
            </div>

            {/* Year selector */}
            {tab === "national" && nationalYears.length > 0 && (
              <select
                value={natYear ?? ""}
                onChange={(e) => setNatYear(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {nationalYears.map((y) => (
                  <option key={y} value={y}>{y}년도</option>
                ))}
              </select>
            )}
            {tab === "metropolitan" && metroYears.length > 0 && (
              <select
                value={metYear ?? ""}
                onChange={(e) => setMetYear(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {metroYears.map((y) => (
                  <option key={y} value={y}>{y}년도</option>
                ))}
              </select>
            )}
          </div>

          {/* National tab */}
          {tab === "national" && (
            <div className="space-y-10">
              {nationalYears.length === 0 ? (
                <EmptyState message="국가 예산 데이터가 아직 적재되지 않았습니다" />
              ) : natLoading ? (
                <LoadingBar />
              ) : (
                <>
                  {/* Total */}
                  {natFieldData && (
                    <div className="bg-blue-50 rounded-xl p-5 flex items-center gap-4 border border-blue-100">
                      <div>
                        <p className="text-xs text-blue-500 font-medium mb-1">
                          {natYear}년 국가 총예산
                        </p>
                        <p className="text-2xl font-bold text-blue-700">
                          <Amount amount={natFieldData.totalAmount} unit="조" />
                        </p>
                      </div>
                    </div>
                  )}

                  {/* By field */}
                  <div>
                    <SectionTitle>분야별 예산</SectionTitle>
                    {natFieldData && natFieldData.items.length > 0 ? (
                      <BudgetChart data={natFieldData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="분야별 데이터가 없습니다" />
                    )}
                  </div>

                  {/* By ministry */}
                  <div>
                    <SectionTitle>부처별 TOP 10</SectionTitle>
                    {natMinistryData && natMinistryData.items.length > 0 ? (
                      <BudgetChart data={natMinistryData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="부처별 데이터가 없습니다" />
                    )}
                  </div>

                  <SourceNote text="출처: 기획재정부 / 열린재정포털" />
                </>
              )}
            </div>
          )}

          {/* Metropolitan tab */}
          {tab === "metropolitan" && (
            <div className="space-y-10">
              {metroYears.length === 0 ? (
                <EmptyState message="광역 예산 데이터가 아직 적재되지 않았습니다" />
              ) : metLoading ? (
                <LoadingBar />
              ) : (
                <>
                  {/* Sido selector */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-slate-700">시·도 선택</label>
                    <select
                      value={selectedSido}
                      onChange={(e) => setSelectedSido(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SIDO_LIST.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sido total */}
                  {sidoDetailData && (
                    <div className="bg-emerald-50 rounded-xl p-5 flex items-center gap-4 border border-emerald-100">
                      <div>
                        <p className="text-xs text-emerald-600 font-medium mb-1">
                          {metYear}년 {selectedSido} 총예산
                        </p>
                        <p className="text-2xl font-bold text-emerald-700">
                          <Amount amount={sidoDetailData.totalAmount} />
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Sido detail */}
                  <div>
                    <SectionTitle>{selectedSido} 분야별 예산</SectionTitle>
                    {sidoDetailData && sidoDetailData.items.length > 0 ? (
                      <BudgetChart data={sidoDetailData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="해당 시·도 예산 데이터가 없습니다" />
                    )}
                  </div>

                  {/* All sidos comparison */}
                  <div>
                    <SectionTitle>17개 시·도 비교</SectionTitle>
                    {allSidoData && allSidoData.items.length > 0 ? (
                      <BudgetChart data={allSidoData.items} valueLabel="총예산" />
                    ) : (
                      <EmptyState message="시·도 비교 데이터가 없습니다" />
                    )}
                  </div>

                  <SourceNote text="출처: 행정안전부 지방재정365" />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

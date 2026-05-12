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
import { EmptyState } from "@/components/EmptyState";

type BudgetTab = "national" | "metropolitan";

const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시",
  "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold text-slate-900 mb-1">{children}</h3>
  );
}

function LoadingBar() {
  return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-200 animate-pulse">
      데이터 불러오는 중...
    </div>
  );
}

function SourceNote({ text }: { text: string }) {
  return (
    <p className="text-xs text-slate-400 mt-2 text-right">{text}</p>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 shrink-0">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {children}
      </select>
    </div>
  );
}

export default function BudgetPage() {
  const [tab, setTab] = useState<BudgetTab>("national");

  const [nationalYears, setNationalYears] = useState<number[]>([]);
  const [metroYears, setMetroYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);

  const [natYear, setNatYear] = useState<number | null>(null);
  const [natFieldData, setNatFieldData] = useState<BudgetBreakdownDTO | null>(null);
  const [natMinistryData, setNatMinistryData] = useState<BudgetBreakdownDTO | null>(null);
  const [natLoading, setNatLoading] = useState(false);

  const [metYear, setMetYear] = useState<number | null>(null);
  const [selectedSido, setSelectedSido] = useState<string>(SIDO_LIST[0]);
  const [sidoDetailData, setSidoDetailData] = useState<BudgetBreakdownDTO | null>(null);
  const [allSidoData, setAllSidoData] = useState<BudgetBreakdownDTO | null>(null);
  const [metLoading, setMetLoading] = useState(false);

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
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400 text-sm">
        데이터 불러오는 중...
      </div>
    );
  }

  const noData = nationalYears.length === 0 && metroYears.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Page hero */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">예산 정보</h1>
        <p className="text-slate-500 text-base">
          국가와 시·도 예산이 어디에 얼마나 쓰였는지 확인하세요
        </p>
      </div>

      {noData ? (
        <EmptyState
          message="예산 데이터가 아직 적재되지 않았습니다."
          description="잠시 후 다시 시도해주세요."
        />
      ) : (
        <>
          {/* Tab + controls row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Segmented tab */}
            <div
              role="tablist"
              aria-label="예산 구분"
              className="inline-flex bg-slate-100 p-1 rounded-xl self-start"
            >
              {(["national", "metropolitan"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === t
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "national" ? "국가 예산" : "광역 예산"}
                </button>
              ))}
            </div>

            {/* Year selector */}
            {tab === "national" && nationalYears.length > 0 && (
              <SelectField
                id="nat-year"
                label="연도"
                value={natYear ?? ""}
                onChange={(v) => setNatYear(Number(v))}
              >
                {nationalYears.map((y) => (
                  <option key={y} value={y}>{y}년도</option>
                ))}
              </SelectField>
            )}
            {tab === "metropolitan" && metroYears.length > 0 && (
              <SelectField
                id="met-year"
                label="연도"
                value={metYear ?? ""}
                onChange={(v) => setMetYear(Number(v))}
              >
                {metroYears.map((y) => (
                  <option key={y} value={y}>{y}년도</option>
                ))}
              </SelectField>
            )}
          </div>

          {/* National tab */}
          {tab === "national" && (
            <div className="flex flex-col gap-8">
              {nationalYears.length === 0 ? (
                <EmptyState message="국가 예산 데이터가 아직 적재되지 않았습니다." />
              ) : natLoading ? (
                <LoadingBar />
              ) : (
                <>
                  {natFieldData && (
                    <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">
                        {natYear}년 국가 총예산
                      </p>
                      <p className="text-3xl font-bold text-blue-800">
                        <Amount amount={natFieldData.totalAmount} unit="조" />
                      </p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <SectionTitle>분야별 예산</SectionTitle>
                    <p className="text-sm text-slate-400 mb-4">항목을 클릭하면 상세 정보를 볼 수 있습니다</p>
                    {natFieldData && natFieldData.items.length > 0 ? (
                      <BudgetChart data={natFieldData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="분야별 데이터가 없습니다." />
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <SectionTitle>부처별 TOP 10</SectionTitle>
                    <p className="text-sm text-slate-400 mb-4">예산 규모 상위 10개 부처</p>
                    {natMinistryData && natMinistryData.items.length > 0 ? (
                      <BudgetChart data={natMinistryData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="부처별 데이터가 없습니다." />
                    )}
                  </div>

                  <SourceNote text="출처: 기획재정부 / 열린재정포털" />
                </>
              )}
            </div>
          )}

          {/* Metropolitan tab */}
          {tab === "metropolitan" && (
            <div className="flex flex-col gap-8">
              {metroYears.length === 0 ? (
                <EmptyState message="광역 예산 데이터가 아직 적재되지 않았습니다." />
              ) : metLoading ? (
                <LoadingBar />
              ) : (
                <>
                  <SelectField
                    id="sido-select"
                    label="시·도"
                    value={selectedSido}
                    onChange={(v) => setSelectedSido(v)}
                  >
                    {SIDO_LIST.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </SelectField>

                  {sidoDetailData && (
                    <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                        {metYear}년 {selectedSido} 총예산
                      </p>
                      <p className="text-3xl font-bold text-emerald-800">
                        <Amount amount={sidoDetailData.totalAmount} />
                      </p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <SectionTitle>{selectedSido} 분야별 예산</SectionTitle>
                    <p className="text-sm text-slate-400 mb-4">분야별 예산 배분 현황</p>
                    {sidoDetailData && sidoDetailData.items.length > 0 ? (
                      <BudgetChart data={sidoDetailData.items} valueLabel="예산" />
                    ) : (
                      <EmptyState message="해당 시·도 예산 데이터가 없습니다." />
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <SectionTitle>17개 시·도 예산 비교</SectionTitle>
                    <p className="text-sm text-slate-400 mb-4">전국 광역자치단체 총예산 규모 비교</p>
                    {allSidoData && allSidoData.items.length > 0 ? (
                      <BudgetChart data={allSidoData.items} valueLabel="총예산" />
                    ) : (
                      <EmptyState message="시·도 비교 데이터가 없습니다." />
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

"use client";

import { Suspense } from "react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  getBudgetYears,
  getBudgetByField,
  getBudgetByMinistry,
  getBudgetBySido,
  getBudgetSidoDetail,
  getSettlementYears,
  getSettlementBySido,
  getSettlementSidoDetail,
  getSettlementUnits,
  getSettlementUnitDetail,
  getSettlementUnitFieldDetail,
  getSettlementSidoFieldDetail,
  getSettlementReport,
} from "@/lib/api";
import type {
  BudgetBreakdownDTO,
  SettlementBreakdownDTO,
  SettlementFieldDetailDTO,
  SettlementReportDTO,
  SettlementUnitDTO,
} from "@repo/shared";
import { BudgetChart } from "@/components/budget/BudgetChart";
import { Amount } from "@/components/budget/AmountFormatter";
import { EmptyState } from "@/components/EmptyState";

type BudgetTab = "national" | "metropolitan" | "settlement";

const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시",
  "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

const ALL_UNITS_KEY = "__ALL__"; // sentinel value for "전체 (광역 본청)"

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

function StructureBreakdownCard({
  policy,
  finance,
  admin,
}: {
  policy: bigint;
  finance: bigint;
  admin: bigint;
}) {
  const total = policy + finance + admin;
  if (total === 0n) return null;
  const totalNum = Number(total);
  const pct = (v: bigint) =>
    Math.round((Number(v) * 1000) / totalNum) / 10;
  const policyPct = pct(policy);
  const financePct = pct(finance);
  const adminPct = pct(admin);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">
        구조별 세출 (정책사업 · 재무활동 · 행정운영)
      </h4>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-4">
        {policyPct > 0 && (
          <div
            className="bg-blue-500 h-full"
            style={{ width: `${policyPct}%` }}
            title={`정책사업비 ${policyPct.toFixed(1)}%`}
          />
        )}
        {financePct > 0 && (
          <div
            className="bg-emerald-500 h-full"
            style={{ width: `${financePct}%` }}
            title={`재무활동비 ${financePct.toFixed(1)}%`}
          />
        )}
        {adminPct > 0 && (
          <div
            className="bg-amber-500 h-full"
            style={{ width: `${adminPct}%` }}
            title={`행정운영경비 ${adminPct.toFixed(1)}%`}
          />
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-xs text-slate-500">정책사업비</span>
          </div>
          <div className="text-base font-bold text-blue-800">
            <Amount amount={policy.toString()} />
          </div>
          <div className="text-xs text-blue-600 mt-0.5">
            {policyPct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-xs text-slate-500">재무활동비</span>
          </div>
          <div className="text-base font-bold text-emerald-800">
            <Amount amount={finance.toString()} />
          </div>
          <div className="text-xs text-emerald-600 mt-0.5">
            {financePct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 bg-amber-500 rounded-full" />
            <span className="text-xs text-slate-500">행정운영경비</span>
          </div>
          <div className="text-base font-bold text-amber-800">
            <Amount amount={admin.toString()} />
          </div>
          <div className="text-xs text-amber-600 mt-0.5">
            {adminPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportLink({ report }: { report: SettlementReportDTO }) {
  return (
    <a
      href={report.reportUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
    >
      <span>📄</span>
      <span className="font-medium">
        {report.reportName ?? "원본 결산서"} PDF →
      </span>
    </a>
  );
}

// Clickable horizontal bar list for field-level breakdowns.
// Replaces the per-item BudgetChart (which created one chart per row).
function FieldClickableList({
  items,
  selectedKey,
  onSelect,
}: {
  items: { key: string; amount: bigint | string; percent: number }[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const maxPercent = items.reduce((m, i) => Math.max(m, i.percent), 0);
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const widthPct = maxPercent > 0 ? (item.percent / maxPercent) * 100 : 0;
        const isSelected = selectedKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={`group w-full text-left rounded-lg px-3 py-2 transition-colors ${
              isSelected
                ? "bg-blue-50 ring-2 ring-blue-400"
                : "hover:bg-slate-50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-sm font-medium text-slate-800 truncate">
                {item.key}
              </span>
              <span className="text-sm tabular-nums text-slate-600 shrink-0">
                <Amount amount={item.amount} /> ({item.percent.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isSelected ? "bg-blue-500" : "bg-blue-400 group-hover:bg-blue-500"
                }`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
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

function BudgetPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<BudgetTab>(() => {
    const t = searchParams.get("tab");
    if (t === "national" || t === "metropolitan" || t === "settlement") return t;
    return "national";
  });

  const [nationalYears, setNationalYears] = useState<number[]>([]);
  const [metroYears, setMetroYears] = useState<number[]>([]);
  const [settlementYears, setSettlementYears] = useState<number[]>([]);
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

  // ── Settlement tab state ───────────────────────────────────────────
  const [setYear, setSetYear] = useState<number | null>(null);
  const [setSido, setSetSido] = useState<string>(() => {
    const s = searchParams.get("sido");
    return s && SIDO_LIST.includes(s) ? s : SIDO_LIST[0];
  });
  const [setUnitCode, setSetUnitCode] = useState<string>(
    () => searchParams.get("unitCode") ?? ALL_UNITS_KEY,
  );
  const [setUnits, setSetUnits] = useState<SettlementUnitDTO[]>([]);
  const [setSidoData, setSetSidoData] = useState<SettlementBreakdownDTO | null>(null);
  const [setBudgetCompareData, setSetBudgetCompareData] = useState<BudgetBreakdownDTO | null>(null);
  const [setUnitData, setSetUnitData] = useState<SettlementBreakdownDTO | null>(null);
  const [setLoading, setSetLoading] = useState(false);

  // ── Field drill-down state ─────────────────────────────────────────
  const [selectedField, setSelectedField] = useState<string | null>(
    () => searchParams.get("field"),
  );
  const [fieldDetailData, setFieldDetailData] =
    useState<SettlementFieldDetailDTO | null>(null);
  const [fieldDetailLoading, setFieldDetailLoading] = useState(false);
  // Ref to scroll the 부문별 drill-down section into view on field click
  const fieldDetailRef = useRef<HTMLDivElement | null>(null);

  // ── Settlement report (PDF link) state ─────────────────────────────
  const [reportData, setReportData] = useState<SettlementReportDTO | null>(null);

  useEffect(() => {
    setYearsLoading(true);
    Promise.all([
      getBudgetYears("NATIONAL").catch(() => ({ years: [] as number[] })),
      getBudgetYears("METROPOLITAN").catch(() => ({ years: [] as number[] })),
      getSettlementYears().catch(() => ({ years: [] as number[] })),
    ]).then(([nat, met, settle]) => {
      setNationalYears(nat.years);
      setMetroYears(met.years);
      setSettlementYears(settle.years);
      if (nat.years.length > 0) setNatYear(nat.years[0]);
      if (met.years.length > 0) setMetYear(met.years[0]);
      if (settle.years.length > 0) setSetYear(settle.years[0]);
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

  // ── Settlement effects ─────────────────────────────────────────────

  // Load list of 자치단체 (시·군·구 + 본청) for the selected sido & year
  useEffect(() => {
    if (setYear === null) return;
    let cancelled = false;
    setSetUnits([]);
    getSettlementUnits(setYear, setSido)
      .then((res) => {
        if (cancelled) return;
        setSetUnits(res.units);
      })
      .catch(() => {
        if (cancelled) return;
        setSetUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [setYear, setSido]);

  // Reset unit selection when sido or year changes.
  // 페이지 진입 시 query string에 unitCode가 있으면 mount + setYear가
  // null→number로 채워지는 첫 두 번의 effect 실행을 모두 skip.
  const skipUnitResetCountRef = useRef(
    searchParams.get("unitCode") !== null ? 2 : 0,
  );
  useEffect(() => {
    if (skipUnitResetCountRef.current > 0) {
      skipUnitResetCountRef.current -= 1;
      return;
    }
    setSetUnitCode(ALL_UNITS_KEY);
  }, [setSido, setYear]);

  const loadSettlement = useCallback(
    async (year: number, sido: string, unitCode: string) => {
      setSetLoading(true);
      setSetSidoData(null);
      setSetBudgetCompareData(null);
      setSetUnitData(null);
      try {
        if (unitCode === ALL_UNITS_KEY) {
          // 시·도 본청 결산 + (가능하면) 같은 시·도의 광역 예산편성 비교
          const [sidoData, budgetCompare] = await Promise.all([
            getSettlementSidoDetail(sido, year).catch(() => null),
            getBudgetSidoDetail(sido, year).catch(() => null),
          ]);
          setSetSidoData(sidoData);
          setSetBudgetCompareData(budgetCompare);
        } else {
          // 자치단체 (시·군·구 또는 본청) 단위 결산
          const unitData = await getSettlementUnitDetail(unitCode, year).catch(
            () => null,
          );
          setSetUnitData(unitData);
        }
      } finally {
        setSetLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (setYear !== null) loadSettlement(setYear, setSido, setUnitCode);
  }, [setYear, setSido, setUnitCode, loadSettlement]);

  // Sync selectedField with URL search params
  const handleSelectField = useCallback(
    (field: string | null) => {
      setSelectedField(field);
      setFieldDetailData(null);
      const params = new URLSearchParams(searchParams.toString());
      if (field) {
        params.set("field", field);
      } else {
        params.delete("field");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      // Smoothly scroll the drill-down section into view after it mounts
      if (field) {
        // Wait a frame for the section to render, then scroll.
        requestAnimationFrame(() => {
          fieldDetailRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    },
    [searchParams, router, pathname],
  );

  // Load sector drill-down when selectedField changes
  useEffect(() => {
    if (!selectedField || setYear === null) {
      setFieldDetailData(null);
      return;
    }
    let cancelled = false;
    setFieldDetailLoading(true);
    setFieldDetailData(null);
    const fetcher =
      setUnitCode === ALL_UNITS_KEY
        ? getSettlementSidoFieldDetail(setSido, selectedField, setYear)
        : getSettlementUnitFieldDetail(setUnitCode, selectedField, setYear);
    fetcher
      .then((data) => {
        if (!cancelled) setFieldDetailData(data);
      })
      .catch(() => {
        if (!cancelled) setFieldDetailData(null);
      })
      .finally(() => {
        if (!cancelled) setFieldDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedField, setYear, setSido, setUnitCode]);

  // Clear selected field when sido/unit/year changes
  useEffect(() => {
    setSelectedField(null);
    setFieldDetailData(null);
  }, [setSido, setUnitCode, setYear]);

  // Load 결산서 PDF link when a specific unit (시·군·구 or 본청) is selected.
  // For ALL_UNITS_KEY (시·도 합산 뷰) we don't fetch — there is no single PDF.
  useEffect(() => {
    if (setYear === null || setUnitCode === ALL_UNITS_KEY) {
      setReportData(null);
      return;
    }
    let cancelled = false;
    setReportData(null);
    getSettlementReport(setUnitCode, setYear)
      .then((data) => {
        if (!cancelled) setReportData(data);
      })
      .catch(() => {
        if (!cancelled) setReportData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setUnitCode, setYear]);

  // Build the comparison rows: 분야 -> (예산편성, 결산)
  const sidoCompareRows = useMemo(() => {
    if (!setSidoData) return [];
    const budgetMap = new Map<string, bigint>();
    if (setBudgetCompareData) {
      for (const it of setBudgetCompareData.items) {
        budgetMap.set(it.key, BigInt(it.amount));
      }
    }
    return setSidoData.items.map((item) => {
      const settle = BigInt(item.amount);
      const budget = budgetMap.get(item.key) ?? null;
      const exec =
        budget && budget > 0n
          ? Math.round((Number(settle) * 1000) / Number(budget)) / 10
          : null;
      return {
        field: item.key,
        settle,
        budget,
        executionPct: exec,
      };
    });
  }, [setSidoData, setBudgetCompareData]);

  const selectedUnit = useMemo(
    () => setUnits.find((u) => u.unitCode === setUnitCode) ?? null,
    [setUnits, setUnitCode],
  );

  if (yearsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400 text-sm">
        데이터 불러오는 중...
      </div>
    );
  }

  const noData =
    nationalYears.length === 0 &&
    metroYears.length === 0 &&
    settlementYears.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Page hero */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">예산 정보</h1>
        <p className="text-slate-500 text-base">
          국가와 지자체 예산이 어디에 얼마나 쓰였는지 확인하세요
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
              {(["national", "metropolitan", "settlement"] as const).map((t) => (
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
                  {t === "national"
                    ? "국가 예산"
                    : t === "metropolitan"
                      ? "광역 예산"
                      : "지자체 결산"}
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
            {tab === "settlement" && settlementYears.length > 0 && (
              <SelectField
                id="set-year"
                label="연도"
                value={setYear ?? ""}
                onChange={(v) => setSetYear(Number(v))}
              >
                {settlementYears.map((y) => (
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

          {/* Settlement tab */}
          {tab === "settlement" && (
            <div className="flex flex-col gap-8">
              {settlementYears.length === 0 ? (
                <EmptyState message="결산 데이터가 아직 적재되지 않았습니다." />
              ) : (
                <>
                  {/* sido + unit dropdowns */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <SelectField
                      id="set-sido-select"
                      label="시·도"
                      value={setSido}
                      onChange={(v) => setSetSido(v)}
                    >
                      {SIDO_LIST.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </SelectField>

                    <SelectField
                      id="set-unit-select"
                      label="시·군·구"
                      value={setUnitCode}
                      onChange={(v) => setSetUnitCode(v)}
                    >
                      <option value={ALL_UNITS_KEY}>전체 (시·도 본청)</option>
                      {setUnits
                        .filter((u) => u.level === "BASIC")
                        .map((u) => (
                          <option key={u.unitCode} value={u.unitCode}>
                            {u.unitName}
                          </option>
                        ))}
                    </SelectField>
                  </div>

                  {setLoading ? (
                    <LoadingBar />
                  ) : setUnitCode === ALL_UNITS_KEY ? (
                    // ── 시·도 본청 결산 view ─────────────────────────
                    <>
                      {setSidoData && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
                              {setYear}년 {setSido} 본청 총결산
                            </p>
                            <p className="text-3xl font-bold text-amber-800">
                              <Amount amount={setSidoData.totalAmount} unit="조" />
                            </p>
                          </div>
                          {setBudgetCompareData && (
                            <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                                {setYear}년 {setSido} 예산편성 (비교)
                              </p>
                              <p className="text-3xl font-bold text-emerald-800">
                                <Amount
                                  amount={setBudgetCompareData.totalAmount}
                                  unit="조"
                                />
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-white rounded-xl border border-slate-200 p-6">
                        <SectionTitle>{setSido} 본청 분야별 결산</SectionTitle>
                        <p className="text-sm text-slate-400 mb-4">
                          분야를 클릭하면 부문별 내역을 볼 수 있습니다
                        </p>
                        {setSidoData && setSidoData.items.length > 0 ? (
                          <FieldClickableList
                            items={setSidoData.items}
                            selectedKey={selectedField}
                            onSelect={(k) =>
                              handleSelectField(selectedField === k ? null : k)
                            }
                          />
                        ) : (
                          <EmptyState message="결산 데이터가 없습니다." />
                        )}
                      </div>

                      {/* 부문별 drill-down */}
                      {selectedField && (
                        <div ref={fieldDetailRef} className="bg-white rounded-xl border border-blue-200 p-6 scroll-mt-24">
                          <div className="flex items-center justify-between mb-1">
                            <SectionTitle>
                              {selectedField} 부문별 세출결산
                            </SectionTitle>
                            <button
                              type="button"
                              onClick={() => handleSelectField(null)}
                              className="text-sm text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                              aria-label="선택 해제"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="text-sm text-slate-400 mb-4">
                            {setSido} 본청 · {setYear}년 세출결산 (부문별)
                          </p>

                          {/* 구조 breakdown (정책사업/재무활동/행정운영) */}
                          {fieldDetailData?.policyBizAmount &&
                            fieldDetailData?.financeActivityAmount &&
                            fieldDetailData?.adminOperAmount && (
                              <div className="mb-5">
                                <StructureBreakdownCard
                                  policy={BigInt(fieldDetailData.policyBizAmount)}
                                  finance={BigInt(
                                    fieldDetailData.financeActivityAmount,
                                  )}
                                  admin={BigInt(fieldDetailData.adminOperAmount)}
                                />
                              </div>
                            )}

                          {fieldDetailLoading ? (
                            <LoadingBar />
                          ) : fieldDetailData &&
                            fieldDetailData.items.length > 0 ? (
                            <BudgetChart
                              data={fieldDetailData.items.map((i) => ({
                                key: i.sector,
                                amount: i.amount,
                                percent: i.percent,
                              }))}
                              valueLabel="결산"
                            />
                          ) : (
                            <EmptyState message="부문별 데이터가 없습니다." />
                          )}
                          <SourceNote text="출처: lofin365.go.kr" />
                        </div>
                      )}

                      {sidoCompareRows.length > 0 && setBudgetCompareData && (
                        <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-x-auto">
                          <SectionTitle>예산편성 vs 결산 (분야별)</SectionTitle>
                          <p className="text-sm text-slate-400 mb-4">
                            편성된 예산 대비 실제 집행률
                          </p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="text-left py-2 px-2 font-medium">분야</th>
                                <th className="text-right py-2 px-2 font-medium">예산편성</th>
                                <th className="text-right py-2 px-2 font-medium">결산</th>
                                <th className="text-right py-2 px-2 font-medium">집행률</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sidoCompareRows.map((row) => (
                                <tr
                                  key={row.field}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <td className="py-2 px-2 text-slate-700">{row.field}</td>
                                  <td className="py-2 px-2 text-right text-slate-600">
                                    {row.budget !== null ? (
                                      <Amount amount={row.budget.toString()} />
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-right text-slate-900 font-medium">
                                    <Amount amount={row.settle.toString()} />
                                  </td>
                                  <td className="py-2 px-2 text-right">
                                    {row.executionPct !== null ? (
                                      <span
                                        className={`font-medium ${
                                          row.executionPct >= 100
                                            ? "text-red-600"
                                            : row.executionPct >= 80
                                              ? "text-emerald-600"
                                              : "text-amber-600"
                                        }`}
                                      >
                                        {row.executionPct.toFixed(1)}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    // ── 시·군·구 결산 view ─────────────────────────
                    <>
                      {setUnitData && (
                        <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
                            {setYear}년 {selectedUnit?.unitName ?? "자치단체"} 총결산
                          </p>
                          <p className="text-3xl font-bold text-amber-800">
                            <Amount amount={setUnitData.totalAmount} />
                          </p>
                        </div>
                      )}

                      <div className="bg-white rounded-xl border border-slate-200 p-6">
                        <SectionTitle>
                          {selectedUnit?.unitName ?? "자치단체"} 분야별 결산
                        </SectionTitle>
                        <p className="text-sm text-slate-400 mb-4">
                          분야를 클릭하면 부문별 내역을 볼 수 있습니다
                        </p>
                        {setUnitData && setUnitData.items.length > 0 ? (
                          <FieldClickableList
                            items={setUnitData.items}
                            selectedKey={selectedField}
                            onSelect={(k) =>
                              handleSelectField(selectedField === k ? null : k)
                            }
                          />
                        ) : (
                          <EmptyState message="해당 자치단체 결산 데이터가 없습니다." />
                        )}
                      </div>

                      {/* 부문별 drill-down */}
                      {selectedField && (
                        <div ref={fieldDetailRef} className="bg-white rounded-xl border border-blue-200 p-6 scroll-mt-24">
                          <div className="flex items-center justify-between mb-1">
                            <SectionTitle>
                              {selectedField} 부문별 세출결산
                            </SectionTitle>
                            <button
                              type="button"
                              onClick={() => handleSelectField(null)}
                              className="text-sm text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                              aria-label="선택 해제"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="text-sm text-slate-400 mb-4">
                            {selectedUnit?.unitName ?? "자치단체"} · {setYear}년 세출결산 (부문별)
                          </p>

                          {/* 구조 breakdown (정책사업/재무활동/행정운영) */}
                          {fieldDetailData?.policyBizAmount &&
                            fieldDetailData?.financeActivityAmount &&
                            fieldDetailData?.adminOperAmount && (
                              <div className="mb-5">
                                <StructureBreakdownCard
                                  policy={BigInt(fieldDetailData.policyBizAmount)}
                                  finance={BigInt(
                                    fieldDetailData.financeActivityAmount,
                                  )}
                                  admin={BigInt(fieldDetailData.adminOperAmount)}
                                />
                              </div>
                            )}

                          {fieldDetailLoading ? (
                            <LoadingBar />
                          ) : fieldDetailData &&
                            fieldDetailData.items.length > 0 ? (
                            <BudgetChart
                              data={fieldDetailData.items.map((i) => ({
                                key: i.sector,
                                amount: i.amount,
                                percent: i.percent,
                              }))}
                              valueLabel="결산"
                            />
                          ) : (
                            <EmptyState message="부문별 데이터가 없습니다." />
                          )}

                          {/* 원본 결산서 PDF 링크 */}
                          {reportData && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <ReportLink report={reportData} />
                            </div>
                          )}

                          <SourceNote text="출처: lofin365.go.kr" />
                        </div>
                      )}
                    </>
                  )}

                  <SourceNote text="출처: 지방재정365 (lofin365.go.kr)" />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BudgetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh] text-slate-400 text-sm">
          데이터 불러오는 중...
        </div>
      }
    >
      <BudgetPageInner />
    </Suspense>
  );
}

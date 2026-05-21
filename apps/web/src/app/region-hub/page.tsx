"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  ExternalLink,
  Landmark,
  MapPin,
  PieChart,
  Sparkles,
  User,
  Users,
  Vote,
  X,
} from "lucide-react";
import { getRegionHub, getSettlementUnitFieldDetail } from "@/lib/api";
import { LegislatorCard } from "@/components/LegislatorCard";
import { PartyBadge } from "@/components/PartyBadge";
import { EmptyState } from "@/components/EmptyState";
import { Amount } from "@/components/budget/AmountFormatter";
import { getMyRegion, setMyRegion } from "@/lib/myRegion";
import type {
  CandidateSummaryDTO,
  LegislatorSummaryDTO,
  RegionHubDTO,
  RegionHubSettlementItemDTO,
  SettlementFieldDetailDTO,
} from "@repo/shared";

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  accent = "blue",
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  accent?: "blue" | "indigo" | "teal" | "violet" | "emerald" | "amber";
}) {
  const accentColors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    indigo: "bg-indigo-100 text-indigo-700",
    teal: "bg-teal-100 text-teal-700",
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accentColors[accent]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function LegislatorGroup({
  title,
  legislators,
  emptyMessage,
}: {
  title: string;
  legislators: LegislatorSummaryDTO[];
  emptyMessage: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400">
          {legislators.length}명
        </span>
      </div>
      {legislators.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {legislators.map((l) => (
            <LegislatorCard key={l.id} legislator={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateMiniCard({
  candidate,
  positionLabel,
}: {
  candidate: CandidateSummaryDTO;
  positionLabel: string;
}) {
  return (
    <Link href={`/candidate/${candidate.id}`} className="group">
      <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex items-center gap-3 h-full">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
          <User className="w-6 h-6 text-slate-400" />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="font-bold text-slate-900 text-base leading-tight">
            {candidate.name}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <PartyBadge party={candidate.party} />
            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">
              {positionLabel}
            </span>
          </div>
          {candidate.districtName && (
            <p className="text-xs text-slate-400 truncate">
              {candidate.districtName}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function SettlementFieldList({
  items,
  selectedField,
  onSelectField,
}: {
  items: RegionHubSettlementItemDTO[];
  selectedField: string | null;
  onSelectField: ((field: string) => void) | null;
}) {
  const maxPercent = items.reduce((m, i) => Math.max(m, i.percent), 0);
  const clickable = onSelectField !== null;
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const widthPct = maxPercent > 0 ? (item.percent / maxPercent) * 100 : 0;
        const isSelected = selectedField === item.field;
        const rowBase =
          "w-full text-left rounded-lg px-3 py-2 transition-colors";
        const rowState = isSelected
          ? "bg-blue-50 ring-1 ring-blue-200"
          : clickable
            ? "hover:bg-slate-50 cursor-pointer"
            : "";
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                {item.field}
                {clickable && (
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      isSelected ? "rotate-90 text-blue-600" : "text-slate-400"
                    }`}
                  />
                )}
              </span>
              <span className="text-sm tabular-nums text-slate-600 shrink-0">
                <Amount amount={item.amount} /> ({item.percent.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  isSelected ? "bg-blue-600" : "bg-blue-400"
                }`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </>
        );
        if (!clickable) {
          return (
            <div key={item.field} className={`${rowBase} ${rowState}`}>
              {inner}
            </div>
          );
        }
        return (
          <button
            key={item.field}
            type="button"
            onClick={() => onSelectField!(item.field)}
            className={`${rowBase} ${rowState}`}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

function SettlementFieldDetailPanel({
  field,
  loading,
  error,
  detail,
  onClose,
}: {
  field: string;
  loading: boolean;
  error: string | null;
  detail: SettlementFieldDetailDTO | null;
  onClose: () => void;
}) {
  const maxPercent = detail
    ? detail.items.reduce((m, i) => Math.max(m, i.percent), 0)
    : 0;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-0.5">분야 세부사항</p>
          <h3 className="text-lg font-bold text-slate-900 truncate">{field}</h3>
          {detail && (
            <p className="text-sm tabular-nums text-emerald-700 font-semibold mt-1">
              <Amount amount={detail.totalAmount} />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-200/60" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        ) : !detail || detail.items.length === 0 ? (
          <p className="text-sm text-slate-500">세부 항목이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.items.map((it) => {
              const widthPct =
                maxPercent > 0 ? (it.percent / maxPercent) * 100 : 0;
              return (
                <li
                  key={it.sector}
                  className="bg-white rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {it.sector}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600 shrink-0">
                      <Amount amount={it.amount} /> ({it.percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ExternalLinkCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Landmark;
  accent: "blue" | "emerald" | "violet";
}) {
  const accentColors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accentColors[accent]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate">
          {title}
        </p>
        <p className="text-xs text-slate-500 truncate">{description}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
    </a>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="bg-blue-50 rounded-xl p-6 h-32" />
      <div className="bg-slate-100 rounded-xl h-48" />
      <div className="bg-slate-100 rounded-xl h-64" />
      <div className="bg-slate-100 rounded-xl h-40" />
    </div>
  );
}

function RegionHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<RegionHubDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedSido, setResolvedSido] = useState<string | null>(null);
  const [resolvedWiwName, setResolvedWiwName] = useState<string | null>(null);

  // 분야별 결산 drill-down state
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [fieldDetail, setFieldDetail] =
    useState<SettlementFieldDetailDTO | null>(null);
  const [fieldDetailLoading, setFieldDetailLoading] = useState(false);
  const [fieldDetailError, setFieldDetailError] = useState<string | null>(null);

  useEffect(() => {
    // Resolve sido/wiwName from URL or fall back to localStorage
    const urlSido = searchParams.get("sido");
    const urlWiwName = searchParams.get("wiwName");
    let sido = urlSido?.trim() || null;
    let wiwName = urlWiwName?.trim() || null;

    if (!sido || !wiwName) {
      const stored = getMyRegion();
      if (!sido) sido = stored.sido;
      if (!wiwName) wiwName = stored.wiwName;
    }

    if (!sido || !wiwName) {
      // No region — redirect home
      router.replace("/");
      return;
    }

    // Persist to localStorage for "내 지역" nav consistency
    setMyRegion(sido, wiwName);

    setResolvedSido(sido);
    setResolvedWiwName(wiwName);

    let cancelled = false;
    setLoading(true);
    setError(null);
    getRegionHub(sido, wiwName)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "지역 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  // Reset drill-down whenever the underlying settlement (unit/year) changes
  const settlementUnitCode = data?.settlement?.unitCode ?? null;
  const settlementYear = data?.settlement?.fiscalYear ?? null;
  useEffect(() => {
    setSelectedField(null);
    setFieldDetail(null);
    setFieldDetailError(null);
  }, [settlementUnitCode, settlementYear]);

  // Load sector drill-down when a field is selected
  useEffect(() => {
    if (!selectedField || !settlementUnitCode || !settlementYear) {
      setFieldDetail(null);
      setFieldDetailError(null);
      return;
    }
    let cancelled = false;
    setFieldDetailLoading(true);
    setFieldDetailError(null);
    setFieldDetail(null);
    getSettlementUnitFieldDetail(settlementUnitCode, selectedField, settlementYear)
      .then((res) => {
        if (cancelled) return;
        setFieldDetail(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFieldDetailError(
          err instanceof Error ? err.message : "세부 결산을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setFieldDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedField, settlementUnitCode, settlementYear]);

  if (loading || !resolvedSido || !resolvedWiwName) {
    return <HubSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          홈으로
        </Link>
        <EmptyState
          message="지역 정보를 불러오지 못했습니다."
          description={error ?? "잠시 후 다시 시도해주세요."}
          ctaLabel="홈으로"
          ctaHref="/"
        />
      </div>
    );
  }

  const totalLegislators =
    data.legislators.national.length +
    data.legislators.provincial.length +
    data.legislators.basic.length;

  const totalCandidates =
    data.candidates.mayor.length + data.candidates.governor.length;

  return (
    <div className="flex flex-col gap-10">
      {/* Top breadcrumb */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors -mb-4 self-start"
      >
        <ArrowLeft className="w-4 h-4" />
        홈으로
      </Link>

      {/* Hero */}
      <section>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm text-blue-700 mb-2">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">내 지역</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            {data.sido} {data.wiwName}
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            우리 지역 의원·예산·후보·기관 정보를 한 페이지에서
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">
            <div className="bg-white/70 rounded-xl px-4 py-3 border border-blue-100">
              <p className="text-xs text-slate-500 mb-0.5">우리 지역 의원</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalLegislators}
                <span className="text-sm text-slate-500 font-normal ml-1">명</span>
              </p>
            </div>
            <div className="bg-white/70 rounded-xl px-4 py-3 border border-blue-100">
              <p className="text-xs text-slate-500 mb-0.5">지방선거 후보</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalCandidates}
                <span className="text-sm text-slate-500 font-normal ml-1">명</span>
              </p>
            </div>
            <div className="bg-white/70 rounded-xl px-4 py-3 border border-blue-100 col-span-2 sm:col-span-2">
              <p className="text-xs text-slate-500 mb-0.5">
                {data.settlement
                  ? `${data.settlement.fiscalYear}년 ${data.settlement.unitName ?? data.wiwName} 총결산`
                  : "결산 정보"}
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {data.settlement ? (
                  <Amount amount={data.settlement.totalAmount} />
                ) : (
                  <span className="text-slate-400 text-base font-normal">
                    데이터 없음
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 우리 지역 의원 */}
      <section>
        <SectionHeader
          icon={Users}
          title="우리 지역 의원"
          subtitle="국회·광역·기초 의원 정보"
          accent="blue"
        />
        <div className="flex flex-col gap-6">
          <LegislatorGroup
            title="국회의원"
            legislators={data.legislators.national}
            emptyMessage="해당 지역구를 담당하는 국회의원 정보가 없습니다."
          />
          <LegislatorGroup
            title="광역의원 (시·도의회)"
            legislators={data.legislators.provincial}
            emptyMessage="해당 지역 광역의원 정보가 없습니다."
          />
          <LegislatorGroup
            title="기초의원 (시·군·구의회)"
            legislators={data.legislators.basic}
            emptyMessage="해당 지역 기초의원 정보가 없습니다."
          />
        </div>
      </section>

      {/* 우리 지역 예산·결산 */}
      <section>
        <SectionHeader
          icon={PieChart}
          title="우리 지역 예산·결산"
          subtitle={
            data.settlement
              ? `${data.settlement.fiscalYear}년 분야별 세출결산 (지방재정365)`
              : "지방재정365 기반 결산 정보"
          }
          accent="emerald"
        />
        {data.settlement && data.settlement.items.length > 0 ? (
          (() => {
            const canDrillDown = !!data.settlement.unitCode;
            const isSplit = canDrillDown && selectedField !== null;
            return (
              <div
                className={`grid gap-4 transition-all duration-300 ${
                  isSplit ? "lg:grid-cols-2" : "grid-cols-1"
                }`}
              >
                <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        {data.settlement.fiscalYear}년 {data.settlement.unitName ?? data.wiwName} 총결산
                      </p>
                      <p className="text-2xl font-bold text-emerald-800">
                        <Amount amount={data.settlement.totalAmount} />
                      </p>
                    </div>
                    {data.settlement.reportUrl && (
                      <a
                        href={data.settlement.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors self-start sm:self-auto"
                      >
                        <span>📄</span>
                        <span className="font-medium">원본 결산서 PDF →</span>
                      </a>
                    )}
                  </div>
                  {canDrillDown && (
                    <p className="text-xs text-slate-500 mb-2">
                      분야를 클릭하면 부문별 세부 결산이 오른쪽에 표시됩니다.
                    </p>
                  )}
                  <SettlementFieldList
                    items={data.settlement.items}
                    selectedField={selectedField}
                    onSelectField={canDrillDown ? setSelectedField : null}
                  />
                  {data.settlement.sidoAverages &&
                    data.settlement.sidoAverages.length > 0 &&
                    (data.settlement.sidoAverageUnitCount ?? 0) > 0 && (
                      <SidoAverageCompare
                        items={data.settlement.items}
                        averages={data.settlement.sidoAverages}
                        sido={data.sido}
                        unitName={data.settlement.unitName ?? data.wiwName}
                        unitCount={data.settlement.sidoAverageUnitCount ?? 0}
                      />
                    )}
                  <p className="text-xs text-slate-400 mt-4 text-right">
                    출처: 지방재정365 (lofin365.go.kr)
                  </p>
                </div>
                {isSplit && (
                  <SettlementFieldDetailPanel
                    field={selectedField}
                    loading={fieldDetailLoading}
                    error={fieldDetailError}
                    detail={fieldDetail}
                    onClose={() => setSelectedField(null)}
                  />
                )}
              </div>
            );
          })()
        ) : (
          <EmptyState
            message="해당 지역 결산 데이터가 아직 적재되지 않았습니다."
            description="지방재정365 데이터 수집 후 표시됩니다."
          />
        )}
      </section>

      {/* 지방선거 후보 */}
      {totalCandidates > 0 && (
        <section>
          <SectionHeader
            icon={Vote}
            title="2026.6.3 지방선거 후보"
            subtitle="시·도지사 · 시장·군수·구청장 후보"
            accent="violet"
          />
          <div className="flex flex-col gap-6">
            {data.candidates.governor.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {data.sido} 시·도지사 후보
                  </h3>
                  <span className="text-xs text-slate-400">
                    {data.candidates.governor.length}명
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.candidates.governor.map((c) => (
                    <CandidateMiniCard
                      key={c.id}
                      candidate={c}
                      positionLabel="시·도지사"
                    />
                  ))}
                </div>
              </div>
            )}
            {data.candidates.mayor.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {data.wiwName} 시장·군수·구청장 후보
                  </h3>
                  <span className="text-xs text-slate-400">
                    {data.candidates.mayor.length}명
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.candidates.mayor.map((c) => (
                    <CandidateMiniCard
                      key={c.id}
                      candidate={c}
                      positionLabel="시장·군수·구청장"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 단체장 공약 (8회 지선 2022) */}
      {data.officialPledges &&
        (data.officialPledges.governor ||
          data.officialPledges.mayor ||
          data.officialPledges.superintendent) && (
          <section>
            <SectionHeader
              icon={Sparkles}
              title="현 단체장 공약 (2022 지선 등록)"
              subtitle="당선 시점 NEC에 등록한 공약. 4년 임기 동안 이행 여부는 시민이 의정활동과 직접 대조해 평가하세요."
              accent="violet"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.officialPledges.governor && (
                <OfficialPledgeCard pledge={data.officialPledges.governor} />
              )}
              {data.officialPledges.mayor && (
                <OfficialPledgeCard pledge={data.officialPledges.mayor} />
              )}
              {data.officialPledges.superintendent && (
                <OfficialPledgeCard
                  pledge={data.officialPledges.superintendent}
                />
              )}
            </div>
          </section>
        )}

      {/* 외부 링크 */}
      <section>
        <SectionHeader
          icon={Building2}
          title="외부 링크"
          subtitle="공식 홈페이지 바로가기"
          accent="amber"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.externalLinks.sidoHomepage && (
            <ExternalLinkCard
              href={data.externalLinks.sidoHomepage}
              title={`${data.sido} 홈페이지`}
              description={data.externalLinks.sidoHomepage.replace(/^https?:\/\//, "")}
              icon={Landmark}
              accent="blue"
            />
          )}
          {data.externalLinks.provincialCouncil && (
            <ExternalLinkCard
              href={data.externalLinks.provincialCouncil}
              title={`${data.sido}의회`}
              description={data.externalLinks.provincialCouncil.replace(/^https?:\/\//, "")}
              icon={Landmark}
              accent="emerald"
            />
          )}
          {!data.externalLinks.sidoHomepage &&
            !data.externalLinks.provincialCouncil && (
              <div className="col-span-full">
                <EmptyState
                  message="외부 링크 정보가 없습니다."
                  description="시·도 매핑이 아직 추가되지 않았습니다."
                />
              </div>
            )}
        </div>
      </section>
    </div>
  );
}

export default function RegionHubPage() {
  return (
    <Suspense fallback={<HubSkeleton />}>
      <RegionHubInner />
    </Suspense>
  );
}

function OfficialPledgeCard({
  pledge,
}: {
  pledge: import("@repo/shared").OfficialPledgeDTO;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pledge.pledges : pledge.pledges.slice(0, 3);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-[#031635] to-[#1a2b4b] text-white">
        <p className="text-[10px] font-bold tracking-widest opacity-70 uppercase mb-1">
          {pledge.positionLabel}
        </p>
        <p className="text-lg font-bold">
          {pledge.name}
          {pledge.party && (
            <span className="text-xs font-normal opacity-80 ml-2">
              {pledge.party}
            </span>
          )}
        </p>
      </div>
      <div className="p-4 space-y-3">
        {visible.map((p) => (
          <div key={p.ord}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                {p.ord}
              </span>
              {p.realm && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                  {p.realm}
                </span>
              )}
              <h4 className="text-sm font-semibold text-slate-800 leading-snug">
                {p.title}
              </h4>
            </div>
            {p.content && (
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 ml-4">
                {p.content}
              </p>
            )}
          </div>
        ))}
        {pledge.pledges.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-xs text-slate-500 hover:text-blue-600 font-medium pt-2 border-t border-slate-100"
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

function SidoAverageCompare({
  items,
  averages,
  sido,
  unitName,
  unitCount,
}: {
  items: { field: string; amount: string; percent: number }[];
  averages: { field: string; avgAmount: string }[];
  sido: string;
  unitName: string;
  unitCount: number;
}) {
  // 상위 6개 분야만 비교 (settlement.items는 이미 amount desc 정렬됨)
  const avgMap = new Map(averages.map((a) => [a.field, BigInt(a.avgAmount)]));
  const rows = items.slice(0, 6).map((it) => {
    const ours = BigInt(it.amount);
    const avg = avgMap.get(it.field) ?? 0n;
    const diff = avg > 0n ? Number(((ours - avg) * 1000n) / avg) / 10 : null;
    return { field: it.field, ours, avg, diff };
  });
  const maxVal = rows.reduce((m, r) => {
    const big = r.ours > r.avg ? r.ours : r.avg;
    return big > m ? big : m;
  }, 0n);
  const maxNum = Number(maxVal);
  function pct(v: bigint): number {
    if (maxNum <= 0) return 0;
    return (Number(v) / maxNum) * 100;
  }
  function fmtEok(v: bigint): string {
    const eok = Number(v / 100000000n);
    return `${eok.toLocaleString()}억`;
  }
  return (
    <div className="mt-5 pt-5 border-t border-slate-100">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h4 className="text-sm font-bold text-slate-800">
          광역 평균 비교
          <span className="ml-2 text-xs font-normal text-slate-500">
            {sido} 다른 기초 {unitCount}곳의 평균 vs {unitName}
          </span>
        </h4>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.field}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm text-slate-700 truncate">{r.field}</span>
              {r.diff !== null && (
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    r.diff > 0
                      ? "text-emerald-700"
                      : r.diff < 0
                        ? "text-rose-700"
                        : "text-slate-500"
                  }`}
                >
                  {r.diff > 0 ? "+" : ""}
                  {r.diff.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-500 w-12 shrink-0">
                  우리
                </span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-[#031635] rounded-full transition-all"
                    style={{ width: `${pct(r.ours)}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-slate-700 w-16 text-right shrink-0">
                  {fmtEok(r.ours)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-400 w-12 shrink-0">
                  평균
                </span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-[#8bc3fe] rounded-full transition-all"
                    style={{ width: `${pct(r.avg)}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-slate-500 w-16 text-right shrink-0">
                  {fmtEok(r.avg)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

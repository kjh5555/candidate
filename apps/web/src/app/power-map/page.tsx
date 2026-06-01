"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveSankey } from "@nivo/sankey";
import { ArrowRight, Info, MapPin, Network } from "lucide-react";
import {
  getPowerMap,
  getRegionHub,
  type PowerMapResponse,
} from "@/lib/api";
import { getMyRegion } from "@/lib/myRegion";
import { Amount } from "@/components/budget/AmountFormatter";

function PowerMapInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const unitCodeParam = sp.get("unitCode");
  const fyParam = sp.get("fiscalYear");

  const [unitCode, setUnitCode] = useState<string | null>(unitCodeParam);
  const [region, setRegion] = useState<{
    sido: string | null;
    wiwName: string | null;
  }>({ sido: null, wiwName: null });
  const [data, setData] = useState<PowerMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // unitCode 미지정 시 myRegion → region-hub.settlement.unitCode 자동 lookup.
  useEffect(() => {
    if (unitCode) return;
    const my = getMyRegion();
    setRegion(my);
    if (!my.sido || !my.wiwName) {
      setLoading(false);
      setError(
        "지역이 설정되지 않았습니다. 홈에서 내 지역을 먼저 설정하세요.",
      );
      return;
    }
    getRegionHub(my.sido, my.wiwName)
      .then((hub) => {
        if (hub.settlement?.unitCode) {
          const u = hub.settlement.unitCode;
          setUnitCode(u);
          router.replace(`/power-map?unitCode=${encodeURIComponent(u)}`);
        } else if (hub.budgetPlan?.unitCode) {
          const u = hub.budgetPlan.unitCode;
          setUnitCode(u);
          router.replace(`/power-map?unitCode=${encodeURIComponent(u)}`);
        } else {
          setLoading(false);
          setError("해당 지역의 자치단체 코드를 찾을 수 없습니다.");
        }
      })
      .catch(() => {
        setLoading(false);
        setError("지역 정보를 불러오지 못했습니다.");
      });
  }, [unitCode, router]);

  useEffect(() => {
    if (!unitCode) return;
    setLoading(true);
    setError(null);
    getPowerMap(
      unitCode,
      fyParam ? parseInt(fyParam, 10) : undefined,
    )
      .then((res) => setData(res))
      .catch(() => setError("권력 지도 데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [unitCode, fyParam]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-6 h-6 text-blue-700" />
          <h1 className="text-2xl font-bold text-slate-900">
            우리 동네 권력 지도
          </h1>
        </div>
        <p className="text-sm text-slate-500 max-w-3xl">
          국가(국비) → 광역(도비) → 기초(시·군·구비) 재원이 모여 우리 지역
          예산이 되고, 그 예산이 분야별로 어떻게 흘러가는지 시각화한 흐름도.
          LOFIN 세부사업별 결산 데이터 기반.
        </p>
      </header>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          불러오는 중…
        </div>
      ) : error ? (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6 text-sm text-amber-700 flex items-start gap-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            {!region.sido && (
              <Link
                href="/"
                className="inline-flex items-center gap-1 mt-2 text-amber-800 hover:underline"
              >
                <MapPin className="w-4 h-4" />
                내 지역 설정하기 <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      ) : data ? (
        <PowerMapView data={data} />
      ) : null}
    </div>
  );
}

function PowerMapView({ data }: { data: PowerMapResponse }) {
  // nivo Sankey expects: { nodes: [{ id }], links: [{ source, target, value }] }
  const nivoData = {
    nodes: data.nodes.map((n) => ({
      id: n.id,
      // 카테고리별 색상 — 재원 출처는 푸른 계열, 단체는 진한 군청, 분야는 회녹.
      nodeColor:
        n.category === "source"
          ? "#206298"
          : n.category === "unit"
            ? "#031635"
            : "#5b8e7d",
    })),
    links: data.links,
  };

  const heightPx = Math.max(420, data.nodes.length * 28);

  const sources = [
    { key: "natl", label: "국비", color: "#206298", amount: data.sourceBreakdown.natl },
    { key: "sido", label: `도비 (${data.sido})`, color: "#0ea5e9", amount: data.sourceBreakdown.sido },
    { key: "sgg", label: "시·군·구비", color: "#10b981", amount: data.sourceBreakdown.sgg },
    { key: "etc", label: "기타", color: "#94a3b8", amount: data.sourceBreakdown.etc },
  ];
  const totalNum = Number(data.totalAmount);

  return (
    <div className="space-y-4">
      {/* 헤드라인 카드 */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            {data.fiscalYear}년 {data.unitName} 총 세출 (집행+계획)
          </p>
        </div>
        <p className="text-4xl font-bold text-blue-900">
          <Amount amount={data.totalAmount} />
        </p>
      </div>

      {/* 재원 출처 막대 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">재원 출처별 비중</h2>
        <div className="flex h-3 rounded-full overflow-hidden mb-3">
          {sources.map((s) => {
            const pct = totalNum > 0 ? (Number(s.amount) / totalNum) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={s.key}
                style={{ width: `${pct}%`, backgroundColor: s.color }}
                title={`${s.label} ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {sources.map((s) => {
            const pct = totalNum > 0 ? (Number(s.amount) / totalNum) * 100 : 0;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded shrink-0"
                  style={{ background: s.color }}
                />
                <div className="min-w-0">
                  <div className="text-slate-700 truncate">{s.label}</div>
                  <div className="font-semibold text-slate-900 tabular-nums">
                    {pct.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sankey */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">
          재원 → 자치단체 → 분야 흐름
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          각 흐름의 두께가 금액 크기. 분야는 상위 10개 + "기타 분야"로 합산.
        </p>
        <div style={{ height: heightPx }}>
          <ResponsiveSankey
            data={nivoData}
            margin={{ top: 12, right: 200, bottom: 12, left: 160 }}
            align="justify"
            colors={(node) =>
              (node as unknown as { nodeColor?: string }).nodeColor ?? "#94a3b8"
            }
            nodeOpacity={1}
            nodeHoverOpacity={1}
            nodeThickness={14}
            nodeSpacing={18}
            nodeBorderWidth={0}
            nodeBorderRadius={3}
            linkOpacity={0.45}
            linkHoverOpacity={0.75}
            linkContract={2}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={8}
            labelTextColor={{ from: "color", modifiers: [["darker", 1.4]] }}
            theme={{
              labels: { text: { fontSize: 11, fontWeight: 600 } },
              tooltip: { container: { fontSize: 12 } },
            }}
          />
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        출처: 지방재정365 LOFIN QWGJK (세부사업별 세출현황). {data.fiscalYear}회계연도 누적.
      </p>
    </div>
  );
}

export default function PowerMapPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-slate-400 text-sm">
          불러오는 중…
        </div>
      }
    >
      <PowerMapInner />
    </Suspense>
  );
}

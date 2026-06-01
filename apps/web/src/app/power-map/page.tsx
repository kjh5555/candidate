"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveSankey } from "@nivo/sankey";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveNetwork } from "@nivo/network";
import { ArrowRight, Info, MapPin, Network } from "lucide-react";
import {
  getPowerMap,
  getPowerMapTimeline,
  getPowerMapBills,
  getPowerMapNetwork,
  getRegionHub,
  type PowerMapResponse,
  type PowerMapTimelineResponse,
  type PowerMapBillsResponse,
  type PowerMapNetworkResponse,
} from "@/lib/api";
import { getMyRegion } from "@/lib/myRegion";
import { Amount } from "@/components/budget/AmountFormatter";
import { getPartyColor } from "@/lib/partyColors";

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
  // 현 단체장 정당 색상 — Sankey unit 노드에 적용.
  const headPartyColor = data.currentHead?.party
    ? getPartyColor(data.currentHead.party).hex
    : "#031635";

  // nivo Sankey expects: { nodes: [{ id }], links: [{ source, target, value }] }
  const nivoData = {
    nodes: data.nodes.map((n) => ({
      id: n.id,
      nodeColor:
        n.category === "source"
          ? "#206298"
          : n.category === "unit"
            ? headPartyColor // 단체장 정당 색
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
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              {data.fiscalYear}년 {data.unitName} 총 세출
            </p>
            <p className="text-4xl font-bold text-blue-900 mt-1">
              <Amount amount={data.totalAmount} />
            </p>
          </div>
          {data.currentHead && (
            <div
              className="text-right"
              style={{ minWidth: 160 }}
            >
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                현 {data.currentHead.label}
              </p>
              <div className="inline-flex items-center gap-2 mt-1">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: headPartyColor }}
                />
                <p className="text-base font-bold text-slate-900">
                  {data.currentHead.name}
                </p>
              </div>
              {data.currentHead.party && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {data.currentHead.party}
                </p>
              )}
            </div>
          )}
        </div>
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

      {/* C2: 시간 축 — 단체장 임기 분야별 변화 */}
      <TimelineSection unitCode={data.unitCode} />

      {/* C3: 의원 입법 활동 — 의회 조례 발의 */}
      <BillsSection unitCode={data.unitCode} />

      {/* C5: 인물 네트워크 — 단체장 + 의원 + 후보 정당별 클러스터 */}
      <NetworkSection unitCode={data.unitCode} />
    </div>
  );
}

function NetworkSection({ unitCode }: { unitCode: string }) {
  const [data, setData] = useState<PowerMapNetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPowerMapNetwork(unitCode)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitCode]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="h-80 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }
  if (!data || data.nodes.length === 0) return null;

  // 정당별 색상 매핑.
  const partyColorMap = new Map<string, string>();
  for (const n of data.nodes) {
    if (n.party) partyColorMap.set(n.party, getPartyColor(n.party).hex);
  }

  // nivo Network는 distance 사용 — 정당 노드는 가까이, 인물은 거리 더 멀게.
  const links = data.links.map((l) => ({
    source: l.source,
    target: l.target,
    distance: 50,
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        인물 네트워크 — 정당별 클러스터
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        단체장(가장 큰 원) · 의원 · 6.3 후보가 소속 정당 노드(중앙)에 연결.
        같은 정당끼리 모이는 모양으로 지역 정당 영향력 분포 시각화.
      </p>
      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <Stat label="정당" value={data.counts.parties} color="#206298" />
        <Stat label="의원" value={data.counts.legislators} color="#031635" />
        <Stat
          label="6.3 후보"
          value={data.counts.candidates}
          color="#0ea5e9"
        />
      </div>
      <div style={{ height: 480 }}>
        <ResponsiveNetwork
          data={{ nodes: data.nodes, links }}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          linkDistance={(l) =>
            (l as unknown as { distance: number }).distance
          }
          centeringStrength={0.3}
          repulsivity={50}
          nodeSize={(n) =>
            (n as unknown as { size: number }).size
          }
          activeNodeSize={(n) =>
            (n as unknown as { size: number }).size * 1.5
          }
          inactiveNodeSize={(n) =>
            (n as unknown as { size: number }).size
          }
          nodeColor={(n) => {
            const node = n as unknown as PowerMapNetworkNode;
            return node.party ? partyColorMap.get(node.party) ?? "#94a3b8" : "#94a3b8";
          }}
          nodeBorderWidth={1}
          nodeBorderColor={{ from: "color", modifiers: [["darker", 0.8]] }}
          linkThickness={1}
          linkColor={{ from: "source.color", modifiers: [["opacity", 0.3]] }}
          nodeTooltip={({ node }) => {
            const n = node as unknown as PowerMapNetworkNode;
            const kindLabel =
              n.kind === "party"
                ? "정당"
                : n.kind === "head"
                  ? (n.positionLabel ?? "단체장")
                  : n.kind === "legislator"
                    ? n.level === "NATIONAL"
                      ? "국회의원"
                      : n.level === "PROVINCIAL"
                        ? "광역의원"
                        : "기초의원"
                    : "6.3 후보";
            return (
              <div className="bg-white shadow-lg rounded px-3 py-2 text-xs border border-slate-200">
                <div className="font-semibold text-slate-800">{n.label}</div>
                <div className="text-slate-500 mt-0.5">
                  {kindLabel}
                  {n.party && n.kind !== "party" ? ` · ${n.party}` : ""}
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50">
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-base font-bold text-slate-900 tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}

function BillsSection({ unitCode }: { unitCode: string }) {
  const [data, setData] = useState<PowerMapBillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPowerMapBills(unitCode)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitCode]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="h-32 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }
  if (!data || data.totalBills === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        {data.councilKeyword} 입법 활동
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        총 {data.totalBills.toLocaleString()}건 발의 · 의원이 만든 조례·규칙이
        예산 사업의 법적 근거가 됩니다.
      </p>

      {data.topProposers.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            발의자 top {data.topProposers.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.topProposers.map((p) => (
              <span
                key={p.name}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-xs"
              >
                <span className="font-semibold text-slate-800">{p.name}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-600 tabular-nums">{p.count}건</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          최근 발의 조례·규칙
        </p>
        <ul className="space-y-1.5 text-sm">
          {data.recentBills.map((b) => (
            <li
              key={b.docId}
              className="flex items-start gap-3 py-1.5 border-b border-slate-100"
            >
              <span className="text-[11px] text-slate-400 tabular-nums shrink-0 mt-0.5">
                {formatItncDe(b.itncDe)}
              </span>
              <div className="min-w-0 flex-1">
                {b.viewUrl ? (
                  <a
                    href={b.viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-800 hover:text-blue-700 hover:underline"
                  >
                    {b.biSj}
                  </a>
                ) : (
                  <span className="text-slate-800">{b.biSj}</span>
                )}
                {b.propsr && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    발의: {b.propsr}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatItncDe(d: string | null): string {
  if (!d || d.length < 8) return "—";
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function TimelineSection({ unitCode }: { unitCode: string }) {
  const [data, setData] = useState<PowerMapTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPowerMapTimeline(unitCode, { topN: 6 })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitCode]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="h-64 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }
  if (!data || data.series.length === 0 || data.availableYears.length < 2) {
    return null;
  }

  // 원 → 억 단위 변환 (그래프 가독성).
  const lineData = data.series.map((s) => ({
    id: s.id,
    data: s.data.map((p) => ({ x: p.x, y: Math.round(p.y / 1e8) })),
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        분야별 세출 추이 ({data.from}~{data.to})
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        단위: 억원. 상위 6개 분야의 회계연도별 실집행액 추이 — 단체장 임기
        동안 정책 방향 변화 확인 가능.
      </p>
      {data.availableYears.length < (data.to - data.from + 1) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          ⓘ 가용 회계연도: {data.availableYears.join(", ")} (다른 연도는 ingest
          후 자동 채워짐)
        </p>
      )}
      <div style={{ height: 320 }}>
        <ResponsiveLine
          data={lineData}
          margin={{ top: 16, right: 140, bottom: 40, left: 60 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
          curve="monotoneX"
          axisBottom={{ tickSize: 5, tickPadding: 6, legend: "회계연도", legendOffset: 32, legendPosition: "middle" }}
          axisLeft={{ tickSize: 5, tickPadding: 6, legend: "억원", legendOffset: -48, legendPosition: "middle" }}
          colors={{ scheme: "category10" }}
          pointSize={6}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          useMesh={true}
          enableArea={false}
          legends={[
            {
              anchor: "right",
              direction: "column",
              translateX: 130,
              itemWidth: 120,
              itemHeight: 18,
              itemTextColor: "#475569",
              symbolSize: 10,
              symbolShape: "circle",
            },
          ]}
          theme={{
            axis: { ticks: { text: { fontSize: 11 } }, legend: { text: { fontSize: 11 } } },
            legends: { text: { fontSize: 11 } },
          }}
        />
      </div>
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

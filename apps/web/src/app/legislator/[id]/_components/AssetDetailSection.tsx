"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getLegislatorAssets,
  type LegislatorAssetsResponseDTO,
  type LegislatorAssetItem,
} from "@/lib/api";

// 색상은 페이지 톤과 일치시킴.
const BORDER = "#e5e7eb";
const PRIMARY = "#1f2937";
const ON_VARIANT = "#75777f";
const SECONDARY = "#2563eb";

// 단위: 신고 가액은 천원 단위. UI는 만원/억원으로 사람-읽기 변환.
function formatCheonwon(raw: string | null): string {
  if (raw == null || raw === "") return "—";
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "—";
  }
  if (v === 0n) return "0원";
  const negative = v < 0n;
  const abs = negative ? -v : v;
  // abs는 천원 단위. 1억=10,000만원=100,000천원
  const eok = abs / 100000n;
  const remManwon = (abs % 100000n) / 10n; // 만원 단위
  let out: string;
  if (eok > 0n) {
    out = remManwon > 0n
      ? `${eok.toLocaleString()}억 ${remManwon.toLocaleString()}만원`
      : `${eok.toLocaleString()}억원`;
  } else {
    const manwon = abs / 10n;
    if (manwon > 0n) out = `${manwon.toLocaleString()}만원`;
    else out = `${abs.toLocaleString()}천원`;
  }
  return negative ? `-${out}` : out;
}

// 관계 정렬 순서: 본인 → 배우자 → 부모/장남/장녀/...
const RELATION_ORDER = [
  "본인",
  "배우자",
  "부",
  "모",
  "장남",
  "차남",
  "삼남",
  "장녀",
  "차녀",
  "삼녀",
  "손자1",
  "손녀1",
];
function relationRank(r: string): number {
  const i = RELATION_ORDER.indexOf(r);
  return i < 0 ? 99 : i;
}

// 재산구분(assetKind)을 5개 버킷으로 분류.
function bucket(kind: string): string {
  if (kind === "토지" || kind === "건물") return "부동산";
  if (kind.startsWith("부동산에 관한 규정")) return "차량/항공기/선박";
  if (kind === "예금" || kind === "현금") return "예금·현금";
  if (kind.startsWith("정치자금")) return "정치자금";
  if (kind === "증권" || kind === "채권") return "증권·채권";
  if (kind === "채무") return "채무";
  if (kind === "가상자산") return "가상자산";
  if (kind === "금 및 백금" || kind === "보석류") return "귀금속·보석";
  if (kind.startsWith("골동품")) return "골동품·예술품";
  if (kind === "회원권") return "회원권";
  if (kind.startsWith("합명") || kind === "출자지분") return "출자지분";
  if (kind.startsWith("고지거부")) return "고지거부";
  return kind;
}

interface Props {
  legislatorId: string;
  reportYm?: string;
}

export default function AssetDetailSection({ legislatorId, reportYm }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LegislatorAssetsResponseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      setError(null);
      try {
        const r = await getLegislatorAssets(legislatorId, reportYm);
        setData(r);
      } catch (e) {
        setError((e as Error).message || "재산 상세 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div
      className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#f3f4f5] transition-colors"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold" style={{ color: PRIMARY }}>
          재산 상세 내역 보기 (2026.3 정기공개)
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4" style={{ color: ON_VARIANT }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: ON_VARIANT }} />
        )}
      </button>

      {open && (
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {loading && (
            <div className="text-sm" style={{ color: ON_VARIANT }}>
              불러오는 중…
            </div>
          )}
          {error && (
            <div className="text-sm" style={{ color: "#dc2626" }}>
              {error}
            </div>
          )}
          {!loading && !error && data && data.count === 0 && (
            <div className="text-sm" style={{ color: ON_VARIANT }}>
              이 의원의 2026년 3월 정기공개 재산내역이 아직 적재되지 않았습니다.
            </div>
          )}
          {!loading && !error && data && data.count > 0 && (
            <AssetGroups data={data} />
          )}
        </div>
      )}
    </div>
  );
}

function AssetGroups({ data }: { data: LegislatorAssetsResponseDTO }) {
  // 관계별 그룹.
  const byRelation = new Map<string, LegislatorAssetItem[]>();
  for (const item of data.items) {
    const list = byRelation.get(item.relation) ?? [];
    list.push(item);
    byRelation.set(item.relation, list);
  }
  const relations = Array.from(byRelation.keys()).sort(
    (a, b) => relationRank(a) - relationRank(b),
  );

  return (
    <div className="space-y-5">
      {/* 관계별 합계 칩 */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.totalsByRelation)
          .sort(([a], [b]) => relationRank(a) - relationRank(b))
          .map(([rel, total]) => (
            <div
              key={rel}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: "#f3f4f5", color: PRIMARY }}
            >
              <span className="font-semibold mr-1.5">{rel}</span>
              <span style={{ color: SECONDARY }}>{formatCheonwon(total)}</span>
            </div>
          ))}
      </div>

      {/* 관계별 섹션 */}
      {relations.map((rel) => {
        const items = byRelation.get(rel)!;
        // 버킷별 sub-그룹.
        const byBucket = new Map<string, LegislatorAssetItem[]>();
        for (const it of items) {
          const b = bucket(it.assetKind);
          const list = byBucket.get(b) ?? [];
          list.push(it);
          byBucket.set(b, list);
        }
        return (
          <div key={rel}>
            <h3 className="text-sm font-bold mb-2" style={{ color: PRIMARY }}>
              {rel} <span className="font-normal" style={{ color: ON_VARIANT }}>({items.length}건)</span>
            </h3>
            <div className="space-y-3">
              {Array.from(byBucket.entries()).map(([buck, list]) => (
                <div key={buck}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: ON_VARIANT }}>
                    {buck}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#fafafa", color: ON_VARIANT }}>
                          <th className="text-left px-2 py-1.5 font-medium">종류</th>
                          <th className="text-left px-2 py-1.5 font-medium">명세</th>
                          <th className="text-right px-2 py-1.5 font-medium">현재가액</th>
                          <th className="text-left px-2 py-1.5 font-medium">사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((it) => (
                          <tr key={it.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                            <td className="px-2 py-1.5" style={{ color: PRIMARY }}>
                              {it.itemType ?? "—"}
                            </td>
                            <td className="px-2 py-1.5" style={{ color: PRIMARY }}>
                              {it.description ?? "—"}
                            </td>
                            <td
                              className="px-2 py-1.5 text-right font-mono"
                              style={{
                                color: it.assetKind === "채무" ? "#dc2626" : PRIMARY,
                              }}
                            >
                              {formatCheonwon(it.currentValue)}
                            </td>
                            <td className="px-2 py-1.5" style={{ color: ON_VARIANT }}>
                              {it.changeReason ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="text-xs pt-2" style={{ color: ON_VARIANT, borderTop: `1px solid ${BORDER}` }}>
        출처: 공직자윤리위원회 / 국회공보 ({data.reportYm.slice(0, 4)}년 {data.reportYm.slice(4)}월 정기공개)
      </div>
    </div>
  );
}

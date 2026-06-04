"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { getCandidates, getCandidateRegions } from "@/lib/api";
import { PartyBadge } from "@/components/PartyBadge";
import { EmptyState } from "@/components/EmptyState";
import type {
  CandidatePositionType,
  CandidateSummaryDTO,
} from "@repo/shared";

const POSITION_LABEL: Record<CandidatePositionType, string> = {
  GOVERNOR: "시·도지사",
  MAYOR: "시장·군수·구청장",
  PROVINCIAL_COUNCILOR: "광역의원(지역구)",
  BASIC_COUNCILOR: "기초의원(지역구)",
  SUPERINTENDENT: "교육감",
  PROVINCIAL_COUNCILOR_PROP: "광역의원(비례)",
  BASIC_COUNCILOR_PROP: "기초의원(비례)",
};

// 탭 정의 — 광역의원(지역구+비례)와 기초의원(지역구+비례)를 각각 하나로 묶음
type PositionTab =
  | "ALL"
  | "GOVERNOR"
  | "MAYOR"
  | "PROVINCIAL_COUNCILOR"
  | "BASIC_COUNCILOR"
  | "SUPERINTENDENT";

const POSITION_TABS: ReadonlyArray<{ value: PositionTab; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "GOVERNOR", label: "시·도지사" },
  { value: "MAYOR", label: "시장·군수·구청장" },
  { value: "PROVINCIAL_COUNCILOR", label: "광역의원" },
  { value: "BASIC_COUNCILOR", label: "기초의원" },
  { value: "SUPERINTENDENT", label: "교육감" },
];

// 탭 값을 실제 API positionType 파라미터로 매핑
// 광역의원 탭 → PROVINCIAL_COUNCILOR + PROVINCIAL_COUNCILOR_PROP 둘 다 요청
// 기초의원 탭 → BASIC_COUNCILOR + BASIC_COUNCILOR_PROP 둘 다 요청
// 그 외 탭은 단일 positionType 또는 ALL

function tabToApiPositionTypes(tab: PositionTab): Array<CandidatePositionType | "ALL"> {
  switch (tab) {
    case "PROVINCIAL_COUNCILOR":
      return ["PROVINCIAL_COUNCILOR", "PROVINCIAL_COUNCILOR_PROP"];
    case "BASIC_COUNCILOR":
      return ["BASIC_COUNCILOR", "BASIC_COUNCILOR_PROP"];
    case "ALL":
      return ["ALL"];
    default:
      return [tab];
  }
}

function OfficialCard({ candidate }: { candidate: CandidateSummaryDTO }) {
  const positionLabel = POSITION_LABEL[candidate.positionType] ?? candidate.positionType;

  return (
    <Link href={`/candidate/${candidate.id}`} className="group">
      <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col items-center text-center gap-3 h-full">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200 transition-colors">
          {candidate.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.photoUrl}
              alt={candidate.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <User className="w-10 h-10 text-slate-400" />
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5 w-full">
          <p className="font-bold text-slate-900 text-lg leading-tight">
            {candidate.name}
          </p>
          <PartyBadge party={candidate.party} />
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {positionLabel}
          </span>
          {(candidate.districtName || candidate.wiwName) && (
            <p className="text-xs text-slate-400 truncate max-w-full">
              {candidate.districtName ?? candidate.wiwName}
            </p>
          )}
          {candidate.voteCount != null && (
            <p className="text-xs text-slate-500">
              득표: {candidate.voteCount.toLocaleString()}표
              {candidate.voteRate != null && (
                <span className="ml-1">({candidate.voteRate.toFixed(2)}%)</span>
              )}
            </p>
          )}
          {candidate.rank != null && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 font-semibold">
              {candidate.rank}위 당선
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-semibold">
            당선
          </span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse flex flex-col items-center gap-3">
      <div className="w-20 h-20 rounded-full bg-slate-100" />
      <div className="h-5 w-20 bg-slate-100 rounded" />
      <div className="h-4 w-16 bg-slate-100 rounded" />
    </div>
  );
}

export default function OfficialsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      }
    >
      <OfficialsPageInner />
    </Suspense>
  );
}

function OfficialsPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const electionId = "20260603";
  const tab = (params.get("tab") as PositionTab | null) ?? "ALL";
  const sido = params.get("sido") ?? "";

  const [candidates, setCandidates] = useState<CandidateSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidoOptions, setSidoOptions] = useState<string[]>([]);

  // sido 목록 초기 로드
  useEffect(() => {
    getCandidateRegions(electionId)
      .then((data) => {
        const sidos = Array.from(
          new Set(data.regions.map((r) => r.sido).filter(Boolean) as string[])
        ).sort();
        setSidoOptions(sidos);
      })
      .catch(() => {
        // sido 목록 실패는 무시 — 드롭다운 없이 계속 작동
      });
  }, []);

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "") {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    router.push(`/officials?${next.toString()}`);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const positionTypes = tabToApiPositionTypes(tab);

    // 광역의원·기초의원은 두 positionType을 병렬 조회 후 합산
    const fetches = positionTypes.map((pt) =>
      getCandidates({
        electionId,
        positionType: pt,
        sido: sido || undefined,
        status: "ELECTED",
      })
    );

    Promise.all(fetches)
      .then((results) => {
        if (cancelled) return;
        const all = results.flatMap((r) => r.candidates);
        // 중복 제거 (같은 id가 두 번 들어올 경우 대비)
        const seen = new Set<string>();
        const deduped = all.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        setCandidates(deduped);
        setTotal(deduped.length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "당선인 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, sido]);

  const currentTabLabel =
    POSITION_TABS.find((t) => t.value === tab)?.label ?? "전체";

  return (
    <div className="flex flex-col gap-8">
      {/* Page hero */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">9대 지방의원</h1>
        <p className="text-slate-500 text-sm mt-2">
          2026.6.3 제9회 전국동시지방선거 당선인. 임기 2026.7.1 ~ 2030.6.30.
        </p>
        {!loading && !error && total > 0 && (
          <p className="text-slate-500 text-sm mt-1">
            총 <span className="font-semibold text-slate-700">{total}</span>명
          </p>
        )}
      </div>

      {/* 필터 영역 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
        {/* positionType 탭 */}
        <div className="flex flex-wrap gap-1.5">
          {POSITION_TABS.map((opt) => {
            const active = tab === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateParams({ tab: opt.value })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 시·도 드롭다운 */}
        {sidoOptions.length > 0 && (
          <div>
            <select
              value={sido}
              onChange={(e) => updateParams({ sido: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">전체 시·도</option>
              {sidoOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
          {error}
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          message="당선 결과가 아직 집계되지 않았습니다."
          description="NEC 결과 공개 후 매일 04시(KST) 자동 갱신됩니다."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <OfficialCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}

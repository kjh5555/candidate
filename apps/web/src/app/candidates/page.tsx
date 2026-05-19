"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Search, User } from "lucide-react";
import { getCandidates } from "@/lib/api";
import { PartyBadge } from "@/components/PartyBadge";
import { EmptyState } from "@/components/EmptyState";
import { getMyRegion } from "@/lib/myRegion";
import type {
  CandidatePositionType,
  CandidateStatus,
  CandidateSummaryDTO,
} from "@repo/shared";

const POSITION_LABEL: Record<CandidatePositionType, string> = {
  GOVERNOR: "시·도지사",
  MAYOR: "시장·군수·구청장",
};

const STATUS_LABEL: Record<CandidateStatus, string> = {
  REGISTERED: "등록",
  WITHDRAWN: "사퇴",
  CANCELLED: "무효",
  UNKNOWN: "—",
};

function statusBadgeClass(status: CandidateStatus): string {
  switch (status) {
    case "REGISTERED":
      return "bg-green-50 text-green-700 border-green-200";
    case "WITHDRAWN":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function CandidateCard({ candidate }: { candidate: CandidateSummaryDTO }) {
  return (
    <Link href={`/candidate/${candidate.id}`} className="group">
      <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col items-center text-center gap-3 h-full">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200 transition-colors">
          <User className="w-10 h-10 text-slate-400" />
        </div>
        <div className="flex flex-col items-center gap-1.5 w-full">
          <p className="font-bold text-slate-900 text-lg leading-tight">
            {candidate.name}
          </p>
          <PartyBadge party={candidate.party} />
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {POSITION_LABEL[candidate.positionType]}
          </span>
          {candidate.age !== null && (
            <p className="text-xs text-slate-500">만 {candidate.age}세</p>
          )}
          {candidate.occupation && (
            <p className="text-xs text-slate-500 truncate max-w-full">
              {candidate.occupation}
            </p>
          )}
          {candidate.districtName && (
            <p className="text-xs text-slate-400 truncate max-w-full">
              {candidate.districtName}
            </p>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadgeClass(candidate.status)}`}
          >
            {STATUS_LABEL[candidate.status]}
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

export default function CandidatesPage() {
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
      <CandidatesPageInner />
    </Suspense>
  );
}

function CandidatesPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const electionId = params.get("electionId") ?? "20260603";
  const positionType =
    (params.get("positionType") as CandidatePositionType | "ALL" | null) ??
    "ALL";
  const sido = params.get("sido") ?? undefined;
  const wiwName = params.get("wiwName") ?? undefined;
  const q = params.get("q") ?? "";
  const district = params.get("district") ?? "";

  const [candidates, setCandidates] = useState<CandidateSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 디바운스용 로컬 input 상태
  const [inputQ, setInputQ] = useState(q);
  const [inputDistrict, setInputDistrict] = useState(district);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL이 외부 변경되면 input도 동기화 (예: 뒤로가기)
  useEffect(() => {
    setInputQ(q);
  }, [q]);
  useEffect(() => {
    setInputDistrict(district);
  }, [district]);

  // 페이지 진입 시 "내 지역"이 설정되어 있고 URL에 지역 필터가 없으면
  // localStorage의 지역으로 자동 필터 (URL replace). 사용자가 명시적으로
  // 다른 지역/전체로 바꾸면 그 의도를 존중하므로 mount 시 1회만 적용.
  const regionApplyRef = useRef(false);
  useEffect(() => {
    if (regionApplyRef.current) return;
    regionApplyRef.current = true;
    // URL에 이미 sido/wiwName이 명시되어 있으면 그대로 둠
    if (sido || wiwName) return;
    const my = getMyRegion();
    if (!my.sido && !my.wiwName) return;
    const next = new URLSearchParams(params.toString());
    if (my.sido) next.set("sido", my.sido);
    if (my.wiwName) next.set("wiwName", my.wiwName);
    router.replace(`/candidates?${next.toString()}`);
  }, [sido, wiwName, params, router]);

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "") {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    router.push(`/candidates?${next.toString()}`);
  }

  function handleSearchChange(key: "q" | "district", value: string) {
    if (key === "q") setInputQ(value);
    else setInputDistrict(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ [key]: value });
    }, 300);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCandidates({
      electionId,
      positionType,
      sido,
      wiwName,
      name: q || undefined,
      districtName: district || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setCandidates(data.candidates);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "후보 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [electionId, positionType, sido, wiwName, q, district]);

  const breadcrumbParts: string[] = ["지방선거"];
  if (sido) breadcrumbParts.push(sido);
  if (wiwName) breadcrumbParts.push(wiwName);

  const positionLabel =
    positionType === "ALL"
      ? "전체"
      : POSITION_LABEL[positionType as CandidatePositionType];

  return (
    <div className="flex flex-col gap-8">
      {/* Page hero */}
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          뒤로가기
        </button>
        <p className="text-xs text-slate-400 mb-1.5">
          {breadcrumbParts.join(" / ")}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          {positionLabel} 후보
        </h1>
        {!loading && !error && (
          <p className="text-slate-500 text-sm mt-1.5">
            총 <span className="font-semibold text-slate-700">{total}</span>명의 후보가 등록되었습니다.
          </p>
        )}
      </div>

      {/* 검색 — 이름 + 지역구 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={inputQ}
            onChange={(e) => handleSearchChange("q", e.target.value)}
            placeholder="이름으로 검색..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex-1 relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={inputDistrict}
            onChange={(e) => handleSearchChange("district", e.target.value)}
            placeholder="지역(시·도, 시·군·구, 지역구)..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
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
          message="조건에 맞는 후보가 없습니다."
          description="다른 지역이나 선거 종류를 선택해보세요."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}

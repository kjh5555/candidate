"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { getLegislators } from "@/lib/api";
import { LegislatorCard } from "@/components/LegislatorCard";
import { Pagination } from "@/components/Pagination";
import type { LegislatorSummaryDTO } from "@repo/shared";

const LIMIT = 24;

type Level = "NATIONAL" | "PROVINCIAL" | "BASIC" | "ALL";

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "NATIONAL", label: "국회의원" },
  { value: "PROVINCIAL", label: "광역의원" },
  { value: "BASIC", label: "기초의원" },
];

const SIDOS = [
  "전체",
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

const PARTIES = [
  "전체",
  "더불어민주당",
  "국민의힘",
  "조국혁신당",
  "개혁신당",
  "진보당",
  "무소속",
];

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse flex flex-col items-center gap-3">
      <div className="w-20 h-20 rounded-full bg-slate-100" />
      <div className="h-5 w-20 bg-slate-100 rounded" />
      <div className="h-4 w-16 bg-slate-100 rounded" />
    </div>
  );
}

export default function LegislatorsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      }
    >
      <LegislatorsPageInner />
    </Suspense>
  );
}

function LegislatorsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const level = (searchParams.get("level") as Level) || "ALL";
  const sido = searchParams.get("sido") || "전체";
  const party = searchParams.get("party") || "전체";
  const q = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  const [legislators, setLegislators] = useState<LegislatorSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce input
  const [inputQ, setInputQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v === "전체") {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    // Reset page on filter change (unless page is the update)
    if (!("page" in updates)) next.delete("page");
    router.push(`/legislators?${next.toString()}`);
  }

  function handleQChange(val: string) {
    setInputQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: val });
    }, 300);
  }

  const offset = (page - 1) * LIMIT;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Parameters<typeof getLegislators>[0] = {
      level: level === "ALL" ? undefined : level,
      region: sido === "전체" ? undefined : sido,
      party: party === "전체" ? undefined : party,
      name: q || undefined,
      limit: LIMIT,
      offset,
    };

    // If no filters at all, still fetch (browse mode — level=ALL accepted by updated API)
    // We pass limit so the API gate lets it through.
    getLegislators(params)
      .then((data) => {
        if (cancelled) return;
        setLegislators(data.legislators);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "의원 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [level, sido, party, q, offset]);

  // Keep inputQ in sync when URL changes externally
  useEffect(() => {
    setInputQ(q);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">의원 검색</h1>
        <p className="text-slate-500 text-sm mt-1.5">
          국회의원·광역의원·기초의원을 이름, 정당, 지역으로 검색하세요.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-4">
        {/* Level radio */}
        <div className="flex flex-wrap gap-2">
          {LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParams({ level: opt.value })}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                level === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sido + Party dropdowns */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">시·도</label>
            <select
              value={sido}
              onChange={(e) => updateParams({ sido: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {SIDOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">정당</label>
            <select
              value={party}
              onChange={(e) => updateParams({ party: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {PARTIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Name search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={inputQ}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="이름으로 검색..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
          {error}
        </div>
      ) : legislators.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          조건에 맞는 의원이 없습니다.
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            총 <span className="font-semibold text-slate-600">{total}</span>명
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {legislators.map((leg) => (
              <LegislatorCard key={leg.id} legislator={leg} />
            ))}
          </div>
          {total > LIMIT && (
            <Pagination
              offset={offset}
              limit={LIMIT}
              total={total}
              onPrev={() => updateParams({ page: String(page - 1) })}
              onNext={() => updateParams({ page: String(page + 1) })}
            />
          )}
        </>
      )}
    </div>
  );
}

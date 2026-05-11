"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock } from "lucide-react";
import { getRegionMatch } from "@/lib/api";
import type { RegionMatchResponseDTO } from "@repo/shared";

const HISTORY_KEY = "address_search_history";
const MAX_HISTORY = 6;

function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addHistory(address: string) {
  const prev = getHistory().filter((h) => h !== address);
  const next = [address, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function removeHistory(address: string) {
  const next = getHistory().filter((h) => h !== address);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function AddressSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  async function handleSearch(address: string) {
    const trimmed = address.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const data: RegionMatchResponseDTO = await getRegionMatch(trimmed);
      addHistory(trimmed);
      setHistory(getHistory());
      // Navigate: prefer national district, fallback to provincial
      const districtId =
        data.nationalDistrict?.id ?? data.provincialDistrict?.id;
      if (!districtId) {
        setError("해당 주소에 대한 지역구 정보를 찾을 수 없습니다.");
        return;
      }
      router.push(`/region/${districtId}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "주소 검색 중 오류가 발생했습니다.");
      } else {
        setError("주소 검색 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSearch(query);
  }

  function handleRemoveHistory(addr: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeHistory(addr);
    setHistory(getHistory());
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center bg-white border-2 border-slate-200 rounded-2xl shadow-sm focus-within:border-blue-500 focus-within:shadow-md transition-all overflow-hidden">
          <Search className="ml-4 w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="도로명 주소 또는 지번 주소를 입력하세요"
            className="flex-1 px-3 py-4 text-slate-800 placeholder-slate-400 outline-none bg-transparent text-base"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="m-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {loading ? "검색 중..." : "검색"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            최근 검색
          </p>
          <div className="flex flex-wrap gap-2">
            {history.map((addr) => (
              <button
                key={addr}
                onClick={() => {
                  setQuery(addr);
                  handleSearch(addr);
                }}
                className="group flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
              >
                <span>{addr}</span>
                <span
                  role="button"
                  onClick={(e) => handleRemoveHistory(addr, e)}
                  className="text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { getDistricts } from "@/lib/api";
import type { DistrictListItemDTO } from "@repo/shared";

export function DistrictPicker() {
  const router = useRouter();
  const [districts, setDistricts] = useState<DistrictListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDistricts("NATIONAL")
      .then((data) => {
        if (cancelled) return;
        setDistricts(data.districts);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "선거구 목록을 불러오지 못했습니다.";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct sido list, preserving sort order (sido ASC).
  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const d of districts) {
      const key = d.sido ?? "";
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }
    return result;
  }, [districts]);

  // Districts filtered by selected sido.
  const filteredDistricts = useMemo(() => {
    if (!selectedSido) return [];
    return districts.filter((d) => d.sido === selectedSido);
  }, [districts, selectedSido]);

  function handleSidoChange(value: string) {
    setSelectedSido(value);
    // For 비례대표, auto-select the single available district.
    if (value === "비례") {
      const proportional = districts.find((d) => d.sido === "비례");
      setSelectedDistrictId(proportional?.id ?? "");
    } else {
      setSelectedDistrictId("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDistrictId) return;
    router.push(`/region/${selectedDistrictId}`);
  }

  const canSubmit = Boolean(selectedDistrictId) && !loading;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label
              htmlFor="sido-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              시/도
            </label>
            <select
              id="sido-select"
              value={selectedSido}
              onChange={(e) => handleSidoChange(e.target.value)}
              disabled={loading || !!error}
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {loading ? "불러오는 중..." : "시/도 선택"}
              </option>
              {sidoList.map((sido) => (
                <option key={sido} value={sido}>
                  {sido === "비례" ? "비례대표" : sido}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="district-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              선거구
            </label>
            <select
              id="district-select"
              value={selectedDistrictId}
              onChange={(e) => setSelectedDistrictId(e.target.value)}
              disabled={!selectedSido || loading}
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {selectedSido ? "선거구 선택" : "시/도를 먼저 선택하세요"}
              </option>
              {filteredDistricts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <MapPin className="w-4 h-4" />
          조회
        </button>
      </form>

      {error && (
        <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

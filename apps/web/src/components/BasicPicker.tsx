"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { getBasicRegions } from "@/lib/api";
import type { BasicRegionDTO } from "@repo/shared";

export function BasicPicker() {
  const router = useRouter();
  const [regions, setRegions] = useState<BasicRegionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedWiw, setSelectedWiw] = useState<string>("");

  useEffect(() => {
    getBasicRegions()
      .then((res) => setRegions(res.regions))
      .catch(() => setRegions([]))
      .finally(() => setLoading(false));
  }, []);

  const sidoList = useMemo(() => {
    const set = new Set<string>();
    for (const r of regions) set.add(r.sido);
    return Array.from(set).sort();
  }, [regions]);

  const wiwList = useMemo(() => {
    if (!selectedSido) return [];
    return regions
      .filter((r) => r.sido === selectedSido)
      .map((r) => r.wiwName)
      .sort();
  }, [regions, selectedSido]);

  function handleSidoChange(sido: string) {
    setSelectedSido(sido);
    setSelectedWiw("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSido || !selectedWiw) return;
    router.push(
      `/basic?region=${encodeURIComponent(selectedSido)}&wiwName=${encodeURIComponent(selectedWiw)}`
    );
  }

  const canSubmit = Boolean(selectedSido && selectedWiw);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 시·도 */}
          <div className="flex-1">
            <label
              htmlFor="basic-sido-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              시/도
            </label>
            <select
              id="basic-sido-select"
              value={selectedSido}
              onChange={(e) => handleSidoChange(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="">시/도 선택</option>
              {sidoList.map((sido) => (
                <option key={sido} value={sido}>
                  {sido}
                </option>
              ))}
            </select>
          </div>

          {/* 시·군·구 */}
          <div className="flex-1">
            <label
              htmlFor="basic-wiw-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              시/군/구
            </label>
            <select
              id="basic-wiw-select"
              value={selectedWiw}
              onChange={(e) => setSelectedWiw(e.target.value)}
              disabled={!selectedSido || loading}
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="">시/군/구 선택</option>
              {wiwList.map((wiw) => (
                <option key={wiw} value={wiw}>
                  {wiw}
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
          <Building2 className="w-4 h-4" />
          기초의회 의원 조회
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-400 text-center">
        제8회 지방선거(2022-06-01) 당선자 기준 — 임기 2022.07.01 ~ 2026.06.30
      </p>
    </div>
  );
}

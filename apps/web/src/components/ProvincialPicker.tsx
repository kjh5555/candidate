"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";

// 17 시·도 (행정안전부 표준).
const SIDO_LIST: string[] = [
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

export function ProvincialPicker() {
  const router = useRouter();
  const [selectedSido, setSelectedSido] = useState<string>("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSido) return;
    router.push(`/provincial?region=${encodeURIComponent(selectedSido)}`);
  }

  const canSubmit = Boolean(selectedSido);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6"
      >
        <div>
          <label
            htmlFor="provincial-sido-select"
            className="block text-xs font-medium text-slate-500 mb-1.5"
          >
            시/도
          </label>
          <select
            id="provincial-sido-select"
            value={selectedSido}
            onChange={(e) => setSelectedSido(e.target.value)}
            className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500"
          >
            <option value="">시/도 선택</option>
            {SIDO_LIST.map((sido) => (
              <option key={sido} value={sido}>
                {sido}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Landmark className="w-4 h-4" />
          광역의회 의원 조회
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-400 text-center">
        제8회 지방선거(2022-06-01) 당선자 기준 — 임기 2022.07.01 ~ 2026.06.30
      </p>
    </div>
  );
}

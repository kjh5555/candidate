"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Vote } from "lucide-react";
import { getCandidateRegions } from "@/lib/api";
import type {
  CandidatePositionType,
  CandidateRegionDTO,
} from "@repo/shared";

const ELECTION_ID = "20260603";

export function CandidatePicker() {
  const router = useRouter();
  const [regions, setRegions] = useState<CandidateRegionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positionType, setPositionType] =
    useState<CandidatePositionType>("GOVERNOR");
  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedWiwName, setSelectedWiwName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCandidateRegions(ELECTION_ID)
      .then((data) => {
        if (cancelled) return;
        setRegions(data.regions);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "후보 지역 목록을 불러오지 못했습니다.";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of regions) {
      if (!r.sido) continue;
      if (!seen.has(r.sido)) {
        seen.add(r.sido);
        result.push(r.sido);
      }
    }
    return result;
  }, [regions]);

  const wiwList = useMemo(() => {
    if (!selectedSido) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of regions) {
      if (r.sido !== selectedSido) continue;
      if (!r.wiwName) continue;
      if (!seen.has(r.wiwName)) {
        seen.add(r.wiwName);
        result.push(r.wiwName);
      }
    }
    return result;
  }, [regions, selectedSido]);

  function handleSidoChange(value: string) {
    setSelectedSido(value);
    setSelectedWiwName("");
  }

  function handlePositionChange(value: CandidatePositionType) {
    setPositionType(value);
    if (value === "GOVERNOR") {
      // GOVERNOR is sido-level — clear wiwName
      setSelectedWiwName("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSido) return;
    const query = new URLSearchParams();
    query.set("electionId", ELECTION_ID);
    query.set("positionType", positionType);
    query.set("sido", selectedSido);
    if (positionType === "MAYOR" && selectedWiwName) {
      query.set("wiwName", selectedWiwName);
    }
    router.push(`/candidates?${query.toString()}`);
  }

  const canSubmit =
    Boolean(selectedSido) &&
    !loading &&
    (positionType === "GOVERNOR" ||
      // for MAYOR: wiwName optional (let users browse by sido too)
      true);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6"
      >
        {/* Position type radio */}
        <fieldset className="mb-4">
          <legend className="block text-xs font-medium text-slate-500 mb-2">
            선거 종류
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "GOVERNOR" as const, label: "시·도지사 후보" },
                { value: "MAYOR" as const, label: "시장·군수·구청장 후보" },
              ]
            ).map((opt) => {
              const active = positionType === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-50 border-blue-500 text-blue-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="positionType"
                    value={opt.value}
                    checked={active}
                    onChange={() => handlePositionChange(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label
              htmlFor="candidate-sido-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              시·도
            </label>
            <select
              id="candidate-sido-select"
              value={selectedSido}
              onChange={(e) => handleSidoChange(e.target.value)}
              disabled={loading || !!error}
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {loading ? "불러오는 중..." : "시·도 선택"}
              </option>
              {sidoList.map((sido) => (
                <option key={sido} value={sido}>
                  {sido}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="candidate-wiw-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              시·군·구 {positionType === "GOVERNOR" && (
                <span className="text-slate-400">(시·도지사는 해당 없음)</span>
              )}
            </label>
            <select
              id="candidate-wiw-select"
              value={selectedWiwName}
              onChange={(e) => setSelectedWiwName(e.target.value)}
              disabled={
                !selectedSido ||
                loading ||
                positionType === "GOVERNOR" ||
                wiwList.length === 0
              }
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-base outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {positionType === "GOVERNOR"
                  ? "—"
                  : !selectedSido
                    ? "시·도를 먼저 선택하세요"
                    : wiwList.length === 0
                      ? "해당 시·도에 후보 없음"
                      : "전체 (시·군·구 미지정)"}
              </option>
              {positionType !== "GOVERNOR" &&
                wiwList.map((w) => (
                  <option key={w} value={w}>
                    {w}
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
          <Vote className="w-4 h-4" />
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

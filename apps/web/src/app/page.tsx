"use client";

import { useState } from "react";
import { DistrictPicker } from "@/components/DistrictPicker";
import { CandidatePicker } from "@/components/CandidatePicker";
import { MapPin, Vote } from "lucide-react";

type Tab = "national" | "local";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("national");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100 mb-6">
          {tab === "national" ? (
            <MapPin className="w-8 h-8 text-blue-600" />
          ) : (
            <Vote className="w-8 h-8 text-blue-600" />
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3">
          {tab === "national"
            ? "내 지역구 의원 보기"
            : "지방선거 후보 보기"}
        </h1>
        <p className="text-slate-500 text-base sm:text-lg max-w-md mx-auto">
          {tab === "national"
            ? "지역구를 선택하면 해당 국회의원의 정보를 확인할 수 있습니다."
            : "제9회 전국동시지방선거 (2026.6.3) 후보자 정보를 조회합니다."}
        </p>
      </div>

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="조회 대상 선택"
        className="inline-flex bg-slate-100 p-1 rounded-xl mb-6"
      >
        <button
          role="tab"
          aria-selected={tab === "national"}
          onClick={() => setTab("national")}
          className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "national"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          국회의원
        </button>
        <button
          role="tab"
          aria-selected={tab === "local"}
          onClick={() => setTab("local")}
          className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "local"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          지방선거 후보 (2026.6.3)
        </button>
      </div>

      {tab === "national" ? <DistrictPicker /> : <CandidatePicker />}

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl text-left">
        {[
          { title: "국회의원 정보", desc: "대표발의 법안, 표결 이력을 한눈에" },
          { title: "광역의회 의원", desc: "지역 광역의회 의원 현황 및 프로필" },
          {
            title: "지방선거 후보",
            desc: "2026.6.3 시·도지사 · 시장·군수·구청장 후보",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="bg-white rounded-xl border border-slate-200 p-4"
          >
            <p className="font-semibold text-slate-700 mb-1">{item.title}</p>
            <p className="text-sm text-slate-400">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

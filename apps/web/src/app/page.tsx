"use client";

import { useState } from "react";
import Link from "next/link";
import { DistrictPicker } from "@/components/DistrictPicker";
import { CandidatePicker } from "@/components/CandidatePicker";
import { ProvincialPicker } from "@/components/ProvincialPicker";
import { MapPin, Vote, Landmark, PieChart } from "lucide-react";

type Tab = "national" | "provincial" | "local";

const TAB_META: Record<
  Tab,
  { title: string; subtitle: string; icon: typeof MapPin }
> = {
  national: {
    title: "내 지역구 의원 보기",
    subtitle:
      "지역구를 선택하면 해당 국회의원의 정보를 확인할 수 있습니다.",
    icon: MapPin,
  },
  provincial: {
    title: "광역의회 의원 보기",
    subtitle:
      "시·도를 선택하면 해당 광역의회 의원 현황을 확인할 수 있습니다.",
    icon: Landmark,
  },
  local: {
    title: "지방선거 후보 보기",
    subtitle:
      "제9회 전국동시지방선거 (2026.6.3) 후보자 정보를 조회합니다.",
    icon: Vote,
  },
};

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("national");
  const meta = TAB_META[tab];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100 mb-6">
          <Icon className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3">
          {meta.title}
        </h1>
        <p className="text-slate-500 text-base sm:text-lg max-w-md mx-auto">
          {meta.subtitle}
        </p>
      </div>

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="조회 대상 선택"
        className="inline-flex bg-slate-100 p-1 rounded-xl mb-6 flex-wrap gap-1 justify-center"
      >
        <button
          role="tab"
          aria-selected={tab === "national"}
          onClick={() => setTab("national")}
          className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "national"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          국회의원
        </button>
        <button
          role="tab"
          aria-selected={tab === "provincial"}
          onClick={() => setTab("provincial")}
          className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "provincial"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          광역의회 의원
        </button>
        <button
          role="tab"
          aria-selected={tab === "local"}
          onClick={() => setTab("local")}
          className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "local"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          지방선거 후보 (2026.6.3)
        </button>
      </div>

      {tab === "national" ? (
        <DistrictPicker />
      ) : tab === "provincial" ? (
        <ProvincialPicker />
      ) : (
        <CandidatePicker />
      )}

      {/* Budget shortcut */}
      <Link
        href="/budget"
        className="mt-8 inline-flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors"
      >
        <PieChart className="w-4 h-4" />
        예산 보기 (국가 · 광역)
      </Link>

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

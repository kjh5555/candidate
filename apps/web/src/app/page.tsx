"use client";

import { useState } from "react";
import Link from "next/link";
import { DistrictPicker } from "@/components/DistrictPicker";
import { CandidatePicker } from "@/components/CandidatePicker";
import { ProvincialPicker } from "@/components/ProvincialPicker";
import { BasicPicker } from "@/components/BasicPicker";
import { Users, Vote, PieChart, ChevronRight, Building2 } from "lucide-react";

type Tab = "national" | "provincial" | "basic" | "local";

const FEATURE_CARDS = [
  {
    tab: "national" as Tab,
    icon: Users,
    title: "국회의원 찾기",
    desc: "내 지역구 국회의원의 발의 법안과 표결 이력을 확인하세요.",
    cta: "의원 조회",
    accent: "blue",
  },
  {
    tab: "provincial" as Tab,
    icon: Vote,
    title: "광역의회 의원",
    desc: "시·도별 광역의회 의원 현황과 프로필을 한눈에 봅니다.",
    cta: "광역의원 조회",
    accent: "indigo",
  },
  {
    tab: "basic" as Tab,
    icon: Building2,
    title: "기초의회 의원",
    desc: "시·군·구의회 의원 약 3,000명의 프로필을 확인하세요.",
    cta: "기초의원 조회",
    accent: "teal",
  },
  {
    tab: "local" as Tab,
    icon: PieChart,
    title: "지방선거 후보",
    desc: "2026.6.3 지방선거 후보자의 전과·재산·공약 정보를 확인하세요.",
    cta: "후보 조회",
    accent: "violet",
  },
] as const;

const ACCENT_STYLES = {
  blue: {
    icon: "bg-blue-100 text-blue-700",
    border: "border-blue-500",
    cta: "text-blue-700",
  },
  indigo: {
    icon: "bg-indigo-100 text-indigo-700",
    border: "border-indigo-500",
    cta: "text-indigo-700",
  },
  teal: {
    icon: "bg-teal-100 text-teal-700",
    border: "border-teal-500",
    cta: "text-teal-700",
  },
  violet: {
    icon: "bg-violet-100 text-violet-700",
    border: "border-violet-500",
    cta: "text-violet-700",
  },
} as const;

const TAB_LABEL: Record<Tab, string> = {
  national: "내 지역구 국회의원 바로 찾기",
  provincial: "광역의회 의원 바로 찾기",
  basic: "기초의회 의원 바로 찾기",
  local: "지방선거 후보 바로 찾기",
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("national");

  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <section className="pt-4 sm:pt-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
            열린의회 · 시민 정보 서비스
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
            내 지역의 의원·후보·예산
          </h1>
          <p className="text-slate-500 text-base sm:text-lg leading-relaxed">
            내 세금이 어디 쓰이고, 우리 지역 의원들이 무엇을 하는지 한눈에 확인하세요.
          </p>
        </div>
      </section>

      {/* Feature cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            const styles = ACCENT_STYLES[card.accent];
            const isActive = activeTab === card.tab;
            return (
              <button
                key={card.tab}
                onClick={() => setActiveTab(card.tab)}
                className={`text-left bg-white rounded-xl border-2 p-5 transition-all cursor-pointer hover:shadow-md focus:outline-none ${
                  isActive
                    ? `${styles.border} shadow-sm`
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-4 ${styles.icon}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <p className="font-semibold text-slate-900 mb-1.5">{card.title}</p>
                <p className="text-sm text-slate-500 leading-relaxed mb-3">
                  {card.desc}
                </p>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${styles.cta}`}
                >
                  {card.cta}
                  <ChevronRight className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Quick finder */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-semibold text-slate-800">
            {TAB_LABEL[activeTab]}
          </h2>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        {activeTab === "national" ? (
          <DistrictPicker />
        ) : activeTab === "provincial" ? (
          <ProvincialPicker />
        ) : activeTab === "basic" ? (
          <BasicPicker />
        ) : (
          <CandidatePicker />
        )}
      </section>

      {/* Budget shortcut */}
      <section>
        <Link
          href="/budget"
          className="group flex items-center justify-between bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <PieChart className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">예산 정보 보기</p>
              <p className="text-sm text-slate-500 mt-0.5">
                국가·광역 예산이 어디에 얼마나 쓰이는지 분야별로 확인하세요
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0 ml-4" />
        </Link>
      </section>
    </div>
  );
}

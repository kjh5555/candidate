"use client";

import { useState, useEffect } from "react";
import { getCouncilBills, getCouncilMinutes } from "@/lib/api";
import { CouncilBillsTab } from "./CouncilBillsTab";
import { CouncilMinutesTab } from "./CouncilMinutesTab";
import { ExternalLink, ScrollText, FileText } from "lucide-react";

interface CouncilActivitySectionProps {
  councilName: string;
  legislatorName: string;
  legislatorLevel: "PROVINCIAL" | "BASIC";
}

type SubTab = "bills" | "minutes";

export function CouncilActivitySection({
  councilName,
  legislatorName,
  legislatorLevel,
}: CouncilActivitySectionProps) {
  const [subTab, setSubTab] = useState<SubTab>("bills");
  const [billsCount, setBillsCount] = useState<number | null>(null);
  const [minutesCount, setMinutesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Prefetch counts to decide whether to render data tabs or fallback notice.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      getCouncilBills(councilName, { limit: 1, offset: 0 }),
      getCouncilMinutes(councilName, { limit: 1, offset: 0 }),
    ]).then(([billsRes, minutesRes]) => {
      if (cancelled) return;
      setBillsCount(billsRes.status === "fulfilled" ? billsRes.value.total : 0);
      setMinutesCount(
        minutesRes.status === "fulfilled" ? minutesRes.value.total : 0,
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [councilName]);

  const externalSearchUrl = `https://clik.nanet.go.kr/potal/search/searchList.do?collection=minutes&query=${encodeURIComponent(
    legislatorName,
  )}`;

  const levelLabel = legislatorLevel === "PROVINCIAL" ? "광역의원" : "기초의원";

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-slate-100 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const hasData = (billsCount ?? 0) > 0 || (minutesCount ?? 0) > 0;

  if (!hasData) {
    // 데이터 없으면 기존 안내 카드 유지
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          의정활동 (조례안·회의·출석)
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {levelLabel}은 법률안이 아닌 <strong>조례안</strong>을 발의합니다.
          조례안 발의 이력, 본회의·상임위 출석률, 시정질문, 5분 자유발언 등
          의정활동 데이터는 국회도서관 지방의정포털(CLIK) 데이터 연동 후
          표시됩니다.
        </p>
        <a
          href={externalSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
        >
          CLIK에서 &quot;{legislatorName}&quot; 직접 검색
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  const subTabs: { value: SubTab; label: string; count: number; icon: React.ReactNode }[] = [
    {
      value: "bills",
      label: "조례안 / 건의안",
      count: billsCount ?? 0,
      icon: <FileText className="w-3.5 h-3.5" />,
    },
    {
      value: "minutes",
      label: "회의록",
      count: minutesCount ?? 0,
      icon: <ScrollText className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-semibold text-slate-900">의정활동</h2>
        <span className="text-xs text-slate-400">
          {councilName} · 국회도서관 지방의정포털 데이터
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 -mx-6 px-6 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setSubTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              subTab === t.value
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {t.icon}
            {t.label}
            <span className="text-xs text-slate-400 ml-0.5">({t.count.toLocaleString()})</span>
          </button>
        ))}
      </div>

      {subTab === "bills" ? (
        <CouncilBillsTab
          rasmblyNm={councilName}
          legislatorName={legislatorName}
        />
      ) : (
        <CouncilMinutesTab
          rasmblyNm={councilName}
          legislatorName={legislatorName}
        />
      )}
    </div>
  );
}

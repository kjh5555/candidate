"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLegislatorControversies,
  syncLegislatorControversies,
} from "@/lib/api";
import type {
  ControversyTopicsResponseDTO,
  ControversyTopicDTO,
  NewsArticleDTO,
} from "@repo/shared";
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

interface ControversiesTabProps {
  legislatorId: string;
}

function credibilityColor(score: number | null): {
  border: string;
  bg: string;
  text: string;
  label: string;
} {
  if (score === null) {
    return {
      border: "border-slate-200",
      bg: "bg-slate-50",
      text: "text-slate-400",
      label: "산정 전",
    };
  }
  if (score >= 70) {
    return {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "신뢰도 높음",
    };
  }
  if (score >= 40) {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-700",
      label: "신뢰도 보통",
    };
  }
  return {
    border: "border-red-200",
    bg: "bg-red-50",
    text: "text-red-700",
    label: "신뢰도 낮음",
  };
}

function stanceBadge(stance: NewsArticleDTO["stance"]): {
  label: string;
  className: string;
} | null {
  if (stance === "claim") {
    return {
      label: "의혹 제기",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  if (stance === "explanation") {
    return {
      label: "해명·반박",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }
  if (stance === "neutral") {
    return {
      label: "사실 보도",
      className: "bg-slate-100 text-slate-600 border-slate-200",
    };
  }
  return null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

function topicDateRange(articles: NewsArticleDTO[]): string | null {
  const dates = articles
    .map((a) => a.publishedAt)
    .filter((d): d is string => !!d)
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0]!.slice(0, 10);
  const last = dates[dates.length - 1]!.slice(0, 10);
  if (first === last) return last;
  return `${first} ~ ${last}`;
}

function ArticleRow({ article }: { article: NewsArticleDTO }) {
  const badge = stanceBadge(article.stance);
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-slate-100 last:border-b-0">
      {badge && (
        <span
          className={`inline-flex items-center self-start text-xs px-2 py-0.5 rounded-full border font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
      <span className="text-xs text-slate-400 shrink-0">
        {article.source} · {formatDate(article.publishedAt)}
      </span>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 flex-1 min-w-0 truncate"
        title={article.title}
      >
        <span className="truncate">{article.title}</span>
        <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    </li>
  );
}

function SignalsDetail({
  signals,
}: {
  signals: Record<string, unknown> | null;
}) {
  if (!signals) return null;
  const get = (key: string): string | null => {
    const v = signals[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "number") {
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
  };
  const articleCount = get("articleCount");
  const uniqueSourceCount = get("uniqueSourceCount");
  const uniqueSourcesRatio = get("uniqueSourcesRatio");
  const primarySourceRatio = get("primarySourceRatio");
  const correctionRatio = get("correctionRatio");

  return (
    <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1 border border-slate-200">
      <span>
        기사 수: <b className="text-slate-800">{articleCount ?? "-"}</b>
      </span>
      <span>
        고유 언론사:{" "}
        <b className="text-slate-800">{uniqueSourceCount ?? "-"}</b>
      </span>
      <span>
        출처 다양성:{" "}
        <b className="text-slate-800">{uniqueSourcesRatio ?? "-"}</b>
      </span>
      <span>
        1차 출처 비율:{" "}
        <b className="text-slate-800">{primarySourceRatio ?? "-"}</b>
      </span>
      <span>
        정정·반박 비율:{" "}
        <b className="text-slate-800">{correctionRatio ?? "-"}</b>
      </span>
    </div>
  );
}

function TopicCard({ topic }: { topic: ControversyTopicDTO }) {
  const [expanded, setExpanded] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const tone = credibilityColor(topic.credibility);

  return (
    <div className={`rounded-xl border ${tone.border} bg-white overflow-hidden`}>
      <div className="flex flex-col sm:flex-row">
        {/* 점수 영역 */}
        <div
          className={`flex flex-row sm:flex-col items-center justify-center px-5 py-4 sm:py-6 sm:w-32 shrink-0 ${tone.bg} gap-2 sm:gap-1`}
        >
          <span className={`text-4xl sm:text-5xl font-bold ${tone.text}`}>
            {topic.credibility ?? "-"}
          </span>
          <span className={`text-xs font-medium ${tone.text}`}>
            {tone.label}
          </span>
        </div>

        {/* 본문 영역 */}
        <div className="flex-1 p-5 flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className="text-base font-semibold text-slate-900 flex-1 min-w-0">
              {topic.title}
            </h3>
            {topic.category && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium border border-slate-200 shrink-0">
                {topic.category}
              </span>
            )}
          </div>

          {topic.summary ? (
            <p className="text-sm text-slate-700 leading-relaxed">
              {topic.summary}
            </p>
          ) : (
            <p className="text-sm text-slate-400 italic">
              요약 준비 중 (LLM 미설정 시 휴리스틱 분석만 적용)
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {(() => {
              const range = topicDateRange(topic.articles);
              return range ? (
                <>
                  <span className="text-slate-600">
                    보도 일자: <b className="text-slate-800">{range}</b>
                  </span>
                  <span>·</span>
                </>
              ) : null;
            })()}
            <span>기사 {topic.articles.length}건</span>
            <span>·</span>
            <span>동기화: {formatDate(topic.lastSyncedAt)}</span>
            <button
              type="button"
              onClick={() => setShowSignals((v) => !v)}
              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline ml-auto"
            >
              <Info className="w-3 h-3" />왜 이 점수?
            </button>
          </div>

          {showSignals && <SignalsDetail signals={topic.signals} />}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 self-start"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                기사 접기
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                기사 펼치기 ({topic.articles.length})
              </>
            )}
          </button>

          {expanded && (
            <ul className="flex flex-col">
              {topic.articles.map((a) => (
                <ArticleRow key={a.id} article={a} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function ControversiesTab({ legislatorId }: ControversiesTabProps) {
  const [data, setData] = useState<ControversyTopicsResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLegislatorControversies(legislatorId);
      setData(res);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [legislatorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await syncLegislatorControversies(legislatorId);
      setData(res);
      setInfo("최신 기사를 가져왔습니다.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "수집에 실패했습니다.",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm">
            마지막 동기화:{" "}
            <b className="text-slate-900">
              {data?.lastSyncedAt
                ? new Date(data.lastSyncedAt).toLocaleString("ko-KR")
                : "수집 전"}
            </b>
          </span>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "수집 중…" : "새로고침"}
        </button>
      </div>

      {/* 안내문 */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 leading-relaxed">
        이 점수는 LLM 의견이 아니라 인용·출처 시그널 집계입니다. 항상 원문을
        직접 확인하세요. Google News 검색 결과를 자동수집하며, 일부 기사는
        본문 추출에 실패할 수 있습니다.
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      {/* 본문 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-slate-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : !data || data.topics.length === 0 ? (
        <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 mb-1">
            수집된 기사가 없습니다.
          </p>
          <p className="text-xs text-slate-400 mb-4">
            새로고침을 눌러 최신 기사를 가져오세요.
          </p>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "수집 중…" : "지금 수집하기"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}

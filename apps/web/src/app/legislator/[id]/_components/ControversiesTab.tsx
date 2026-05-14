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
  /** "general" = 일반 정치 활동 기사 | "controversy" = 논란/해명 기사 */
  filter?: "general" | "controversy";
  /** Google 검색 링크 생성을 위해 사용 */
  legislatorName?: string;
}

const CONTROVERSY_TITLE_PATTERN =
  /(논란|의혹|비판|폭로|사퇴|해명|반박|고발|특혜|수사|기소|구속|영장|조사)/;

function isControversyTopic(topic: ControversyTopicDTO): boolean {
  const articles = topic.articles;
  if (articles.length === 0) return false;
  // 1) 제목에 명시적 논란 키워드가 있으면 즉시 controversy
  if (CONTROVERSY_TITLE_PATTERN.test(topic.title)) return true;
  // 2) 카테고리 라벨이 있으면 그대로 따른다
  if (topic.category && CONTROVERSY_TITLE_PATTERN.test(topic.category)) return true;
  // 3) 기사들의 stance에서 claim/explanation이 절반 이상이면 controversy
  const issueCount = articles.filter(
    (a) => a.stance === "claim" || a.stance === "explanation",
  ).length;
  return issueCount * 2 >= articles.length;
}

/** 좌측 컬럼에 표시할 "최근 보도" 일자 포맷 (월/일 + 연도). */
function formatLatestForBadge(iso: string | null): {
  primary: string;
  secondary: string;
  relative: string;
} {
  if (!iso) {
    return { primary: "—", secondary: "보도일", relative: "" };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { primary: "—", secondary: "보도일", relative: "" };
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let relative = "";
  if (diffDays < 0) relative = "예정";
  else if (diffDays === 0) relative = "오늘";
  else if (diffDays === 1) relative = "어제";
  else if (diffDays < 7) relative = `${diffDays}일 전`;
  else if (diffDays < 30) relative = `${Math.floor(diffDays / 7)}주 전`;
  else if (diffDays < 365) relative = `${Math.floor(diffDays / 30)}개월 전`;
  else relative = `${Math.floor(diffDays / 365)}년 전`;
  return {
    primary: `${month}/${day}`,
    secondary: `${year}`,
    relative,
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

/** 토픽 내 가장 최근 기사 발행일 (ISO). 없으면 null. */
function topicLatestDate(topic: ControversyTopicDTO): string | null {
  let latest: string | null = null;
  for (const a of topic.articles) {
    if (!a.publishedAt) continue;
    if (latest === null || a.publishedAt > latest) latest = a.publishedAt;
  }
  return latest;
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

/**
 * 토픽 제목에서 검색 키워드를 뽑는다 — "[TF사진관] '양평 공흥지구 특혜 의혹' 공판
 * 출석한 김건희 일가와 김선교 의원" 같은 제목에서 작은따옴표·큰따옴표 안의 핵심
 * 구절이나 가장 의미있는 토큰을 추출.
 */
function extractTopicKeyword(title: string): string {
  const quoted = title.match(/['‘"“]([^'’"”]{4,40})['’"”]/);
  if (quoted) return quoted[1]!;
  // 대괄호 prefix 제거 후 앞 30자
  const stripped = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return stripped.length > 40 ? stripped.slice(0, 40) : stripped;
}

function SignalsDetail({
  signals,
  articles,
  mode,
  topicTitle,
  legislatorName,
  topicSummary,
}: {
  signals: Record<string, unknown> | null;
  articles: NewsArticleDTO[];
  mode: "general" | "controversy";
  topicTitle: string;
  legislatorName?: string;
  topicSummary: string | null;
}) {
  const get = (key: string): string | null => {
    if (!signals) return null;
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

  const isControversy = mode === "controversy";

  // 대표 기사: 일반 모드는 3건, 논란 모드는 5건
  const limit = isControversy ? 5 : 3;
  const representative = [...articles]
    .sort((a, b) => {
      const aw = a.stance === "claim" || a.stance === "explanation" ? 1 : 0;
      const bw = b.stance === "claim" || b.stance === "explanation" ? 1 : 0;
      if (aw !== bw) return bw - aw;
      const ad = a.publishedAt ?? "";
      const bd = b.publishedAt ?? "";
      return bd.localeCompare(ad);
    })
    .slice(0, limit);

  const excerptCap = isControversy ? 360 : 160;

  // 외부 검색 링크 (논란 모드만): 토픽 핵심 키워드 + 의원 이름
  const keyword = extractTopicKeyword(topicTitle);
  const searchQuery = legislatorName
    ? `${keyword} ${legislatorName}`
    : keyword;
  const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=ko&gl=KR&ceid=KR:ko`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=ko`;
  const namuUrl = `https://namu.wiki/Search?q=${encodeURIComponent(keyword)}`;

  return (
    <div className="flex flex-col gap-2">
      {/* 논란 모드: 요약/배경 우선 노출 */}
      {isControversy && topicSummary && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-1">요약</p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {topicSummary}
          </p>
        </div>
      )}

      {representative.length > 0 && (
        <div
          className={`rounded-lg p-3 border ${
            isControversy
              ? "bg-amber-50/40 border-amber-100"
              : "bg-blue-50/50 border-blue-100"
          }`}
        >
          <p className="text-xs font-semibold text-slate-700 mb-2">
            {isControversy ? "어떤 논란인가요?" : "어떤 내용?"}
          </p>
          <ul className="flex flex-col gap-2">
            {representative.map((a) => {
              const badge = stanceBadge(a.stance);
              return (
                <li
                  key={a.id}
                  className="text-xs text-slate-700 pb-2 border-b border-slate-100 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    {badge && (
                      <span
                        className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="text-slate-400 shrink-0">
                      {a.source} · {formatDate(a.publishedAt)}
                    </span>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium break-keep"
                    >
                      {a.title}
                    </a>
                  </div>
                  {a.excerpt && (
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      {a.excerpt.slice(0, excerptCap)}
                      {a.excerpt.length > excerptCap ? "…" : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 논란 모드: 외부 출처에서 배경/맥락 직접 찾아보기 */}
      {isControversy && (
        <div className="rounded-lg p-3 bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-slate-700 mb-1.5">
            더 자세히 찾아보기
          </p>
          <p className="text-[11px] text-slate-500 mb-2">
            "{keyword}"
            {legislatorName ? ` · ${legislatorName}` : ""} 관련 외부 검색
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={googleNewsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded border border-slate-200 bg-white"
            >
              <ExternalLink className="w-3 h-3" />
              Google 뉴스
            </a>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded border border-slate-200 bg-white"
            >
              <ExternalLink className="w-3 h-3" />
              Google 검색
            </a>
            <a
              href={namuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded border border-slate-200 bg-white"
            >
              <ExternalLink className="w-3 h-3" />
              나무위키
            </a>
          </div>
        </div>
      )}

      {/* 시그널 — 일반 모드에선 위, 논란 모드에선 아래(작게) */}
      {signals && (
        <div className="bg-slate-50 rounded-lg p-2.5 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 border border-slate-200">
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
      )}
    </div>
  );
}

function TopicCard({
  topic,
  mode,
  legislatorName,
}: {
  topic: ControversyTopicDTO;
  mode: "general" | "controversy";
  legislatorName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const isControversy = mode === "controversy";
  const latestIso = topicLatestDate(topic);
  const dateBadge = formatLatestForBadge(latestIso);
  const sideBg = isControversy ? "bg-amber-50" : "bg-blue-50";
  const sidePrimaryText = isControversy ? "text-amber-700" : "text-blue-700";
  const sideSecondaryText = isControversy ? "text-amber-600" : "text-blue-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* 좌측: 최근 보도 일자 */}
        <div
          className={`flex flex-row sm:flex-col items-center justify-center px-5 py-4 sm:py-6 sm:w-32 shrink-0 ${sideBg} gap-2 sm:gap-1`}
        >
          <span className={`text-3xl sm:text-4xl font-bold ${sidePrimaryText}`}>
            {dateBadge.primary}
          </span>
          <div className="flex flex-col items-center">
            <span className={`text-xs font-medium ${sideSecondaryText}`}>
              {dateBadge.secondary}
            </span>
            {dateBadge.relative && (
              <span className="text-[10px] text-slate-500 mt-0.5">
                {dateBadge.relative}
              </span>
            )}
          </div>
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
                    보도 기간: <b className="text-slate-800">{range}</b>
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
              className={`inline-flex items-center gap-1 hover:underline ml-auto ${
                isControversy
                  ? "text-amber-700 hover:text-amber-800 font-medium"
                  : "text-blue-600 hover:text-blue-700"
              }`}
            >
              <Info className="w-3 h-3" />
              {isControversy ? "논란 정보" : "상세 정보"}
            </button>
          </div>

          {showSignals && (
            <SignalsDetail
              signals={topic.signals}
              articles={topic.articles}
              mode={mode}
              topicTitle={topic.title}
              legislatorName={legislatorName}
              topicSummary={topic.summary}
            />
          )}

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

export function ControversiesTab({
  legislatorId,
  filter = "general",
  legislatorName,
}: ControversiesTabProps) {
  const [data, setData] = useState<ControversyTopicsResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 필터 + 최신 뉴스 기준 정렬 (대표 뉴스의 publishedAt이 가장 최근인 토픽이 위로)
  const displayedTopics = (data?.topics ?? [])
    .filter((t) =>
      filter === "controversy"
        ? isControversyTopic(t)
        : !isControversyTopic(t),
    )
    .sort((a, b) => {
      const ad = topicLatestDate(a) ?? "";
      const bd = topicLatestDate(b) ?? "";
      if (ad === bd) {
        // 동일 날짜면 신뢰도 desc, 그 다음 기사 수 desc로 안정 정렬
        const ac = a.credibility ?? -1;
        const bc = b.credibility ?? -1;
        if (ac !== bc) return bc - ac;
        return b.articles.length - a.articles.length;
      }
      return bd.localeCompare(ad);
    });

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
      ) : displayedTopics.length === 0 ? (
        <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 mb-1">
            {filter === "controversy"
              ? "감지된 논란이 없습니다."
              : data && data.topics.length > 0
                ? "이 탭에 해당하는 기사가 없습니다."
                : "수집된 기사가 없습니다."}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            {filter === "controversy"
              ? "논란·의혹·해명 키워드 기사가 발견되면 자동으로 분류됩니다."
              : "새로고침을 눌러 최신 기사를 가져오세요."}
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
          {displayedTopics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              mode={filter}
              legislatorName={legislatorName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

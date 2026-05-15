"use client";

import { useState, useEffect, useRef } from "react";
import {
  FileText,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ListOrdered,
  Hash,
} from "lucide-react";
import {
  fetchMinutesContent,
  analyzeMinutes,
  ApiError,
} from "@/lib/api";
import type { CouncilMinutesDetailDTO } from "@repo/shared";

interface MinutesViewerProps {
  initial: CouncilMinutesDetailDTO;
}

export function MinutesViewer({ initial }: MinutesViewerProps) {
  const [data, setData] = useState<CouncilMinutesDetailDTO>(initial);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showFullBody, setShowFullBody] = useState(false);
  const [openSpeaker, setOpenSpeaker] = useState<string | null>(null);

  // 본문이 없으면 자동으로 한 번 fetch 시도
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (autoFetchedRef.current) return;
    if (data.bodyText) return;
    autoFetchedRef.current = true;
    void handleFetchBody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFetchBody(force = false) {
    setBodyLoading(true);
    setBodyError(null);
    try {
      const fresh = await fetchMinutesContent(data.docId, force);
      setData(fresh);
    } catch (e) {
      if (e instanceof ApiError) {
        setBodyError(e.message || "본문 수집에 실패했습니다.");
      } else {
        setBodyError("본문 수집에 실패했습니다.");
      }
    } finally {
      setBodyLoading(false);
    }
  }

  async function handleAnalyze() {
    setAiLoading(true);
    setAiError(null);
    try {
      const fresh = await analyzeMinutes(data.docId);
      setData(fresh);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 429) {
          setAiError(
            "잠시 후 다시 시도해주세요. (1분에 1회만 분석할 수 있습니다)",
          );
        } else if (e.status === 503) {
          setAiError("AI 분석 서비스가 현재 비활성화되어 있습니다.");
        } else if (e.status === 422) {
          setAiError("본문이 비어 있어 분석할 수 없습니다.");
        } else {
          setAiError(e.message || "AI 분석에 실패했습니다.");
        }
      } else {
        setAiError("AI 분석에 실패했습니다.");
      }
    } finally {
      setAiLoading(false);
    }
  }

  const hasBody = !!data.bodyText && data.bodyText.length > 0;
  const hasAi = !!data.aiSummary;

  return (
    <div className="flex flex-col gap-6">
      {/* ── AI 요약 ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">AI 요약</h3>
              <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                BETA
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gemini가 회의록 본문을 분석해 요약·발언자별 발언·핵심 주제를 생성합니다.
            </p>
          </div>
          {hasAi && (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={aiLoading}
              className="text-xs text-slate-500 hover:text-blue-700 hover:underline disabled:opacity-50 shrink-0"
            >
              다시 분석
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          {/* 본문 없음 → 본문 먼저 */}
          {!hasBody && !bodyLoading && (
            <div className="text-sm text-slate-500">
              본문을 먼저 가져와야 분석할 수 있습니다.
              <button
                type="button"
                onClick={() => handleFetchBody()}
                className="ml-2 text-blue-600 hover:underline"
              >
                본문 가져오기
              </button>
            </div>
          )}

          {/* 본문 로딩 */}
          {bodyLoading && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <span>CLIK에서 회의록 본문을 가져오는 중...</span>
            </div>
          )}

          {/* 본문 에러 */}
          {bodyError && !bodyLoading && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-700">{bodyError}</p>
                <button
                  type="button"
                  onClick={() => handleFetchBody()}
                  className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {/* 본문 있음, AI 없음 → 분석 CTA */}
          {hasBody && !hasAi && !aiLoading && !aiError && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-slate-700">
                회의록 본문이 준비되었습니다. AI 분석을 시작하시겠습니까? (5~15초)
              </p>
              <button
                type="button"
                onClick={handleAnalyze}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                분석하기
              </button>
            </div>
          )}

          {/* AI 로딩 */}
          {aiLoading && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <span>Gemini가 회의록을 분석 중... (보통 5~15초)</span>
            </div>
          )}

          {/* AI 에러 */}
          {aiError && !aiLoading && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-700">{aiError}</p>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {/* AI 결과 */}
          {hasAi && !aiLoading && (
            <div className="flex flex-col gap-4">
              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {data.aiSummary}
              </div>
              {data.aiKeyTopics.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    <Hash className="w-3 h-3" />
                    핵심 주제
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.aiKeyTopics.map((t) => (
                      <span
                        key={t}
                        className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                {data.aiGeneratedAt &&
                  `생성일 ${data.aiGeneratedAt.slice(0, 10)}`}
                {data.aiModel && (
                  <>
                    {data.aiGeneratedAt ? " · " : ""}
                    {data.aiModel}
                  </>
                )}
                {" · AI 자동 요약입니다. 정확성은 원문 직접 확인을 권장합니다."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 의사일정 ─────────────────────────────────── */}
      {data.agenda.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListOrdered className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">의사일정</h2>
            <span className="text-xs text-slate-400">{data.agenda.length}건</span>
          </div>
          <ol className="flex flex-col gap-2">
            {data.agenda.map((a) => (
              <li
                key={a.ord}
                className="flex items-start gap-3 text-sm p-3 bg-slate-50 rounded-lg border border-slate-100"
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shrink-0">
                  {a.ord}
                </span>
                <span className="text-slate-800 leading-snug">{a.title}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── 발언자별 요약 ─────────────────────────────── */}
      {data.speakers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">발언자별 요약</h2>
            <span className="text-xs text-slate-400">
              {data.speakers.length}명
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {data.speakers.map((sp) => {
              const key = `${sp.role}|${sp.name}`;
              const summary = data.aiSpeakerSummaries.find(
                (s) => s.name === sp.name && s.role === sp.role,
              );
              const isOpen = openSpeaker === key;
              return (
                <div
                  key={key}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSpeaker((cur) => (cur === key ? null : key))
                    }
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{sp.role}</span>
                        <span className="font-medium text-slate-900">
                          {sp.name}
                        </span>
                      </div>
                      {summary && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                          {summary.summary}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {sp.totalChars.toLocaleString()}자
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/50">
                      {summary ? (
                        <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap mb-3">
                          {summary.summary}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic mb-3">
                          AI 요약이 아직 없습니다. 위의 분석하기를 눌러보세요.
                        </p>
                      )}
                      {data.bodyText && (
                        <SpeakerExcerpt
                          bodyText={data.bodyText}
                          speakerName={sp.name}
                          role={sp.role}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 원문 ───────────────────────────────────────── */}
      {hasBody && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFullBody((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900">회의록 원문</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {(data.bodyText?.length ?? 0).toLocaleString()}자 ·
                {showFullBody ? " 접으려면 클릭" : " 펼치려면 클릭"}
              </p>
            </div>
            {showFullBody ? (
              <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
            )}
          </button>
          {showFullBody && (
            <div className="px-5 pb-5 border-t border-slate-100">
              <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans mt-4 max-h-[600px] overflow-y-auto bg-slate-50 p-4 rounded-lg border border-slate-100">
                {data.bodyText}
              </pre>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => handleFetchBody(true)}
                  disabled={bodyLoading}
                  className="text-xs text-slate-500 hover:text-blue-700 hover:underline disabled:opacity-50"
                >
                  원문 다시 가져오기
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 본문에서 특정 발언자의 모든 발언만 추출해 보여준다.
 * bodyText의 "○{role} {name}: {speech}" 라인 패턴을 사용.
 */
function SpeakerExcerpt({
  bodyText,
  speakerName,
  role,
}: {
  bodyText: string;
  speakerName: string;
  role: string;
}) {
  const lines = bodyText.split("\n");
  // "○{role} {name}" 또는 "○{name} 의원" 패턴에 해당하는 라인만
  const matched: string[] = [];
  const patternA = `○${role} ${speakerName}`;
  const patternB = `○${speakerName} 의원`;
  const patternC = `○${speakerName}`;
  for (const ln of lines) {
    if (
      ln.startsWith(patternA + ":") ||
      ln.startsWith(patternA + " ") ||
      ln.startsWith(patternB + ":") ||
      ln.startsWith(patternB + " ") ||
      ln.startsWith(patternC + " ")
    ) {
      matched.push(ln);
    }
  }
  if (matched.length === 0) {
    return (
      <p className="text-xs text-slate-500 italic">
        본문에서 발언을 찾지 못했습니다.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold text-slate-500 mb-1.5">
        발언 전체 ({matched.length}건)
      </div>
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
        {matched.map((m, i) => (
          <div
            key={i}
            className="text-xs text-slate-700 leading-relaxed p-2 bg-white rounded border border-slate-100"
          >
            {m.replace(/^○[^:]*:\s*/, "")}
          </div>
        ))}
      </div>
    </div>
  );
}

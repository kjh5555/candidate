"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ListOrdered,
} from "lucide-react";
import Image from "next/image";
import {
  fetchMinutesContent,
  analyzeMinutes,
  getCouncilLegislatorPhotos,
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
  const [openSpeaker, setOpenSpeaker] = useState<string | null>(null);
  // 발언자 이름 → 사진 URL 매핑 (없는 의원은 누락. 채팅 아바타용)
  const [speakerPhotos, setSpeakerPhotos] = useState<Record<string, string>>({});

  // 의회 소속 의원 사진 조회 (있는 만큼만 사용, 실패해도 무시)
  useEffect(() => {
    if (!data.rasmblyNm) return;
    let cancelled = false;
    getCouncilLegislatorPhotos(data.rasmblyNm)
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of res.photos) {
          if (p.photoUrl && p.photoUrl.length > 0) {
            map[p.name] = p.photoUrl;
          }
        }
        setSpeakerPhotos(map);
      })
      .catch(() => {
        // 사진 없는 경우는 정상 동작 — 텍스트 아바타로 대체됨
      });
    return () => {
      cancelled = true;
    };
  }, [data.rasmblyNm]);

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
  const PRIMARY = "#031635";
  const SECONDARY = "#206298";
  const BORDER = "#e5e7eb";
  const ON_VARIANT = "#44474e";

  // 참석자 아바타 (사진 있는 발언자 우선 3명)
  const speakersWithPhoto = data.speakers.filter((s) => speakerPhotos[s.name]);
  const avatars = speakersWithPhoto.slice(0, 3);
  const restCount = Math.max(0, data.speakers.length - avatars.length);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero: AI 요약 + 참석자 ──────────────────────── */}
      <section
        className="bg-white rounded-2xl p-5"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs mb-2">
              <span style={{ color: ON_VARIANT }}>참석자</span>
              <div className="flex -space-x-2">
                {avatars.length === 0 ? (
                  <span style={{ color: "#75777f" }}>—</span>
                ) : (
                  avatars.map((s) => (
                    <div
                      key={s.name}
                      className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 border-2 border-white relative"
                    >
                      {speakerPhotos[s.name] && (
                        <Image
                          src={speakerPhotos[s.name]!}
                          alt={s.name}
                          fill
                          sizes="28px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                  ))
                )}
                {restCount > 0 && (
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold"
                    style={{
                      backgroundColor: "#e1e3e4",
                      color: ON_VARIANT,
                    }}
                  >
                    +{restCount}
                  </div>
                )}
              </div>
              <span style={{ color: ON_VARIANT }}>
                총 {data.speakers.length}명
              </span>
            </div>
            {hasAi && data.aiKeyTopics.length > 0 && (
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: SECONDARY }}
                >
                  핵심 주제
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.aiKeyTopics.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: "#eef1f7",
                        color: PRIMARY,
                        border: `1px solid ${BORDER}`,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!hasAi && hasBody && !aiLoading && !aiError && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: PRIMARY }}
              >
                <Sparkles className="w-3.5 h-3.5" /> AI 분석 시작
              </button>
            )}
          </div>

          {/* AI Summary 다크 카드 */}
          <div
            className="lg:w-1/3 text-white p-4 rounded-xl relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
            }}
          >
            <Sparkles className="absolute top-3 right-3 w-12 h-12 opacity-10" />
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                Gemini AI Summary
              </span>
            </div>
            {bodyLoading && (
              <div className="flex items-center gap-2 text-xs opacity-90">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                회의록 본문 수집 중…
              </div>
            )}
            {aiLoading && (
              <div className="flex items-center gap-2 text-xs opacity-90">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Gemini 분석 중 (5~15초)
              </div>
            )}
            {bodyError && (
              <div className="flex items-start gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <p className="opacity-90">{bodyError}</p>
                  <button
                    type="button"
                    onClick={() => handleFetchBody()}
                    className="underline text-xs mt-1"
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            )}
            {aiError && (
              <div className="flex items-start gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <p className="opacity-90">{aiError}</p>
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    className="underline text-xs mt-1"
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            )}
            {hasAi && !aiLoading && (
              <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-95">
                {data.aiSummary}
              </p>
            )}
            {!hasAi && !aiLoading && !aiError && !bodyLoading && !bodyError && (
              <p className="text-xs opacity-70 leading-relaxed">
                본문이 준비되면 자동으로 분석을 시작합니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── 2-col: 채팅 + 사이드 ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌: 채팅 본문 */}
        <div
          className="lg:col-span-8 bg-white rounded-2xl overflow-hidden flex flex-col"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <div
            className="p-3 flex items-center justify-between"
            style={{
              backgroundColor: "#edeeef",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span
              className="text-xs font-bold inline-flex items-center gap-2"
              style={{ color: PRIMARY }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: "#ba1a1a" }}
              />
              실시간 대화 흐름
            </span>
            <span className="text-xs" style={{ color: ON_VARIANT }}>
              {hasBody
                ? `${data.bodyText!.length.toLocaleString()}자`
                : "본문 준비 중"}
            </span>
          </div>
          <div className="p-4 max-h-[calc(100vh-200px)] min-h-[500px] overflow-y-auto">
            {hasBody ? (
              <ChatView
                bodyText={data.bodyText ?? ""}
                speakerPhotos={speakerPhotos}
              />
            ) : bodyLoading ? (
              <div className="flex items-center justify-center h-64 text-sm gap-2" style={{ color: ON_VARIANT }}>
                <Loader2 className="w-4 h-4 animate-spin" /> 본문 가져오는 중…
              </div>
            ) : bodyError ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-sm" style={{ color: "#ba1a1a" }}>
                <AlertCircle className="w-5 h-5" />
                {bodyError}
                <button
                  type="button"
                  onClick={() => handleFetchBody()}
                  className="text-xs underline"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-sm" style={{ color: ON_VARIANT }}>
                <p>회의록 본문이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => handleFetchBody()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  본문 가져오기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 우: 사이드 */}
        <aside className="lg:col-span-4 space-y-4">
          {/* 의사일정 = 핵심 주제별 대화 */}
          {data.agenda.length > 0 && (
            <div
              className="bg-white rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div
                className="p-3"
                style={{
                  backgroundColor: "#edeeef",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <h3
                  className="text-xs font-bold inline-flex items-center gap-1.5"
                  style={{ color: PRIMARY }}
                >
                  <ListOrdered className="w-3.5 h-3.5" /> 의사일정
                  <span className="text-[10px] font-normal" style={{ color: ON_VARIANT }}>
                    ({data.agenda.length}건)
                  </span>
                </h3>
              </div>
              <ol className="divide-y" style={{ borderColor: BORDER }}>
                {data.agenda.map((a) => (
                  <li
                    key={a.ord}
                    className="p-3 text-xs leading-relaxed"
                  >
                    <span
                      className="text-[10px] font-bold mb-1 block"
                      style={{ color: SECONDARY }}
                    >
                      AGENDA {a.ord}
                    </span>
                    <span style={{ color: PRIMARY }}>{a.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 발언자별 요약 */}
          {data.speakers.length > 0 && (
            <div
              className="bg-white rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div
                className="p-3"
                style={{
                  backgroundColor: "#edeeef",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <h3
                  className="text-xs font-bold inline-flex items-center gap-1.5"
                  style={{ color: PRIMARY }}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> 발언자별 요약
                  <span className="text-[10px] font-normal" style={{ color: ON_VARIANT }}>
                    ({data.speakers.length}명)
                  </span>
                </h3>
              </div>
          <div className="flex flex-col gap-2 p-3">
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

        </aside>
      </div>
    </div>
  );
}

// ── 채팅 스타일 회의록 뷰어 ─────────────────────────────────

interface ChatTurn {
  role: string;
  name: string;
  content: string;
}

/**
 * bodyText를 발언 단위로 파싱.
 * 패턴: `○{role} {name} {speech}` 또는 `○{name} 의원 {speech}` 또는
 *       `○{role} {name}: {speech}` (정규화 후).
 * 다음 ○ 마커까지가 한 turn.
 */
function parseTurns(bodyText: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const lines = bodyText.split("\n");
  let current: { role: string; name: string; lines: string[] } | null = null;

  // 의원 역할로 인식할 토큰들
  const ROLES_AS_SECOND = new Set([
    "의원", "부의장", "위원장", "간사", "위원",
  ]);

  const flush = () => {
    if (current) {
      const content = current.lines.join("\n").trim();
      if (content.length > 0) {
        turns.push({ role: current.role, name: current.name, content });
      }
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 발언 시작 마커: ○로 시작
    const m = line.match(/^○([^\s]+)\s+([^\s:]+)(?::|\s+)(.*)$/);
    if (m) {
      flush();
      const [, w1, w2, rest] = m;
      // "○{name} 의원" 패턴 vs "○{role} {name}" 패턴 구분
      if (ROLES_AS_SECOND.has(w2 ?? "")) {
        current = {
          role: w2 ?? "",
          name: w1 ?? "",
          lines: rest ? [rest] : [],
        };
      } else {
        current = {
          role: w1 ?? "",
          name: w2 ?? "",
          lines: rest ? [rest] : [],
        };
      }
      continue;
    }
    // ◎자유발언(...) 같은 섹션 마커는 건너뜀 (시각적 잡음)
    if (/^◎/.test(line)) continue;
    // 빈 줄·머리부 메타정보(일시·의사일정·부의된 안건)는 그대로 무시
    if (current) {
      // 연속 라인은 발언 본문에 추가 (앞 공백 1칸 제거)
      current.lines.push(line.replace(/^\s/, ""));
    }
  }
  flush();
  return turns;
}

/**
 * 발언자별 일관된 색상을 위해 이름 해시로 팔레트 선택.
 */
const BUBBLE_PALETTES = [
  "bg-blue-100 text-blue-900 border-blue-200",
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-amber-100 text-amber-900 border-amber-200",
  "bg-violet-100 text-violet-900 border-violet-200",
  "bg-rose-100 text-rose-900 border-rose-200",
  "bg-cyan-100 text-cyan-900 border-cyan-200",
  "bg-teal-100 text-teal-900 border-teal-200",
  "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200",
];

function paletteFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return BUBBLE_PALETTES[Math.abs(h) % BUBBLE_PALETTES.length]!;
}

function avatarFor(name: string): string {
  // 이름 마지막 두 글자 (예: "이상숙" → "상숙", "박두형" → "두형")
  return name.length >= 2 ? name.slice(-2) : name;
}

/**
 * 긴 발언을 읽기 좋은 단락으로 분리.
 * - 이미 \n으로 단락이 있으면 그대로 사용
 * - 없으면 마침표·느낌표·물음표 + 공백 기준으로 분리해 3~4문장씩 묶음
 * - "존경하는 ... 여러분!" "이상으로 ..." "감사합니다" 등은 단락 경계로 인식
 */
function chunkContent(content: string): string[] {
  const trimmed = content.trim();
  if (trimmed.length === 0) return [];

  // 이미 명시적 줄바꿈이 있으면 우선 사용
  if (/\n\s*\n/.test(trimmed) || trimmed.split("\n").length >= 4) {
    return trimmed
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // 문장 단위 분리 (한국어 마침표·느낌표·물음표 + 공백 기준)
  const sentences = trimmed
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 2) return [trimmed];

  // 단락 경계 단서 — 호명·맺음말은 새 단락으로
  const PARA_HINTS = [
    /^(존경하는|사랑하는|안녕하십니까|친애하는|먼저)/,
    /^(이상으로|마지막으로|결론적으로|끝으로|감사합니다)/,
    /^(첫째,|둘째,|셋째,|넷째,)/,
    /^(따라서|그러나|하지만|즉|또한|아울러|그래서|그리고)/,
    /^(이에|이를|이번|오늘은?)/,
  ];

  const paragraphs: string[] = [];
  let buf: string[] = [];
  const MAX_SENTENCES = 3;

  const flush = () => {
    if (buf.length > 0) {
      paragraphs.push(buf.join(" "));
      buf = [];
    }
  };

  for (const s of sentences) {
    const hintMatched = PARA_HINTS.some((re) => re.test(s));
    if (hintMatched && buf.length > 0) flush();
    buf.push(s);
    if (buf.length >= MAX_SENTENCES) flush();
  }
  flush();
  return paragraphs;
}

function ChatView({
  bodyText,
  speakerPhotos = {},
}: {
  bodyText: string;
  speakerPhotos?: Record<string, string>;
}) {
  const turns = parseTurns(bodyText);
  if (turns.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        본문에서 발언을 인식하지 못했습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.map((turn, i) => (
        <ChatBubble
          key={i}
          turn={turn}
          photoUrl={speakerPhotos[turn.name] ?? null}
        />
      ))}
    </div>
  );
}

/**
 * 채팅 버블 1개. 긴 발언은 단락으로 자동 분리 + "더 보기" 토글.
 */
function ChatBubble({
  turn,
  photoUrl,
}: {
  turn: ChatTurn;
  photoUrl?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isChair = turn.role === "의장" || turn.role === "부의장";
  const palette = isChair
    ? "bg-yellow-100 text-yellow-900 border-yellow-200"
    : paletteFor(turn.name);
  const avatar = avatarFor(turn.name);

  const paragraphs = chunkContent(turn.content);
  const TOTAL = turn.content.length;
  const LONG_THRESHOLD = 600; // 600자 이상이면 접기 토글
  const isLong = TOTAL > LONG_THRESHOLD;
  // 접힌 상태에선 첫 2단락(또는 첫 ~400자)만 노출
  let visibleParagraphs = paragraphs;
  if (isLong && !expanded) {
    let chars = 0;
    visibleParagraphs = [];
    for (const p of paragraphs) {
      if (chars > 0 && chars + p.length > 400) break;
      visibleParagraphs.push(p);
      chars += p.length;
    }
    if (visibleParagraphs.length === 0) visibleParagraphs = [paragraphs[0] ?? ""];
  }

  return (
    <div
      className={`flex gap-2 items-start ${isChair ? "flex-row-reverse" : ""}`}
    >
      {photoUrl ? (
        <div
          className="w-9 h-9 rounded-full border border-slate-200 overflow-hidden shrink-0 bg-slate-100 relative"
          title={`${turn.role} ${turn.name}`}
        >
          <Image
            src={photoUrl}
            alt={turn.name}
            fill
            sizes="36px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div
          className={`w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${palette}`}
          title={`${turn.role} ${turn.name}`}
        >
          {avatar}
        </div>
      )}
      <div
        className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${isChair ? "items-end" : "items-start"}`}
      >
        <div
          className={`text-[11px] text-slate-500 mb-1 px-1 ${isChair ? "text-right" : ""}`}
        >
          <span className="font-semibold text-slate-700">{turn.name}</span>
          {turn.role && (
            <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              {turn.role}
            </span>
          )}
          {isLong && (
            <span className="ml-1 text-[10px] text-slate-400">
              ({TOTAL.toLocaleString()}자)
            </span>
          )}
        </div>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-[1.75] break-words border ${palette} ${
            isChair ? "rounded-tr-sm" : "rounded-tl-sm"
          }`}
        >
          {visibleParagraphs.map((p, i) => (
            <p
              key={i}
              className={i > 0 ? "mt-2.5" : ""}
              style={{ wordBreak: "keep-all" }}
            >
              {p}
            </p>
          ))}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`mt-2 text-xs font-medium underline underline-offset-2 ${
                isChair
                  ? "text-yellow-800 hover:text-yellow-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {expanded ? "접기 ▲" : `더 보기 (${paragraphs.length - visibleParagraphs.length}단락 더) ▼`}
            </button>
          )}
        </div>
      </div>
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

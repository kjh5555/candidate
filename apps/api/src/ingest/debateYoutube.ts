/**
 * 후보자 토론회 ingest — 자동 YouTube 검색 + 자막 + Gemini 요약.
 *
 * 대상: 시·도지사·교육감 (광역) + 시장·군수·구청장 (기초장).
 *
 * 흐름:
 *   1) DB의 활성 후보 명단을 기준으로 검색어 자동 생성
 *      (광역: sido × 직위 / 기초: sido × wiwName)
 *   2) youtube-sr로 검색, 제목이 "토론회 + sido + 직위" 시그니처에
 *      부합하는 영상만 추림
 *   3) youtube-transcript로 한글 자막 수집 (자동자막 포함)
 *   4) Gemini 2.5 Flash로 쟁점·후보 입장·인용 요약
 *   5) Debate 테이블에 upsert (videoId unique → 같은 영상 재실행 시 스킵)
 *
 * 환경변수:
 *   - GEMINI_API_KEY: 필수
 *   - DEBATE_YOUTUBE_CHANNEL_IDS: 선택 — 추가 채널 RSS도 보조 소스로 사용
 *   - DEBATE_MAX_VIDEOS_PER_QUERY: 검색 결과 상위 N개 (기본 10)
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/debateYoutube.ts
 */

import { GoogleGenAI } from "@google/genai";
import { YoutubeTranscript } from "youtube-transcript";
import { YouTube as YouTubeSR } from "youtube-sr";
import Parser from "rss-parser";
import { prisma } from "../db.js";

const ELECTION_ID = "20260603";

// 17개 시·도와 검색용 단축 표기.
const SIDOS: { sido: string; alts: string[] }[] = [
  { sido: "서울특별시", alts: ["서울"] },
  { sido: "부산광역시", alts: ["부산"] },
  { sido: "대구광역시", alts: ["대구"] },
  { sido: "인천광역시", alts: ["인천"] },
  { sido: "광주광역시", alts: ["광주"] },
  { sido: "대전광역시", alts: ["대전"] },
  { sido: "울산광역시", alts: ["울산"] },
  { sido: "세종특별자치시", alts: ["세종"] },
  { sido: "경기도", alts: ["경기"] },
  { sido: "강원특별자치도", alts: ["강원"] },
  { sido: "충청북도", alts: ["충북", "충청북"] },
  { sido: "충청남도", alts: ["충남", "충청남"] },
  { sido: "전북특별자치도", alts: ["전북", "전라북"] },
  { sido: "전라남도", alts: ["전남", "전라남"] },
  { sido: "경상북도", alts: ["경북", "경상북"] },
  { sido: "경상남도", alts: ["경남", "경상남"] },
  { sido: "제주특별자치도", alts: ["제주"] },
];

const DEBATE_KEYWORDS = ["토론회", "토론", "후보자 토론", "정책 토론"];

interface YoutubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string | null;
  publishedAt: Date | null;
  sourceUrl: string;
}

interface SearchTask {
  query: string;
  sido: string;
  positionType: "GOVERNOR" | "SUPERINTENDENT" | "MAYOR";
  wiwName: string | null;
}

const MAX_PER_QUERY = Math.max(
  1,
  Math.min(parseInt(process.env.DEBATE_MAX_VIDEOS_PER_QUERY ?? "10", 10) || 10, 25),
);

const rssParser = new Parser({
  customFields: { item: [["yt:videoId", "videoId"]] },
});

// ───────── 검색 ─────────────────────────────────────────────

async function searchVideos(query: string): Promise<YoutubeVideoMeta[]> {
  try {
    const results = await YouTubeSR.search(query, {
      type: "video",
      limit: MAX_PER_QUERY,
      safeSearch: false,
    });
    return results
      .filter((v) => v.id)
      .map((v) => ({
        videoId: v.id!,
        title: v.title ?? "",
        channelTitle: v.channel?.name ?? null,
        publishedAt: v.uploadedAt ? parseRelativeDate(v.uploadedAt) : null,
        sourceUrl: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
      }));
  } catch (err) {
    console.warn(`[debate] search failed "${query}":`, (err as Error).message);
    return [];
  }
}

// youtube-sr는 "2 days ago" 식 상대 표기를 줘서 대략값으로만 환산.
function parseRelativeDate(rel: string): Date | null {
  const now = Date.now();
  const m = rel.match(/(\d+)\s*(분|시간|일|주|개월|년)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms =
    unit === "분" ? n * 60_000 :
    unit === "시간" ? n * 3_600_000 :
    unit === "일" ? n * 86_400_000 :
    unit === "주" ? n * 7 * 86_400_000 :
    unit === "개월" ? n * 30 * 86_400_000 :
    unit === "년" ? n * 365 * 86_400_000 :
    0;
  return ms > 0 ? new Date(now - ms) : null;
}

// 보조: 채널 RSS (env가 있을 때만, 부가 소스로 활용).
async function fetchChannelVideos(channelId: string): Promise<YoutubeVideoMeta[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  try {
    const feed = await rssParser.parseURL(url);
    const channelTitle = feed.title ?? null;
    return (feed.items ?? []).map((it) => {
      const videoId =
        (it as { videoId?: string }).videoId ??
        (it.link?.split("v=")[1]?.split("&")[0] ?? "");
      return {
        videoId,
        title: it.title ?? "",
        channelTitle,
        publishedAt: it.pubDate ? new Date(it.pubDate) : null,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }).filter((v) => v.videoId);
  } catch {
    return [];
  }
}

// ───────── 분류 ─────────────────────────────────────────────

function looksLikeDebate(title: string): boolean {
  return DEBATE_KEYWORDS.some((kw) => title.includes(kw));
}

function matchSido(title: string): { sido: string; alt: string } | null {
  for (const s of SIDOS) {
    if (title.includes(s.sido)) return { sido: s.sido, alt: s.sido };
    const altHit = s.alts.find((a) => title.includes(a));
    if (altHit) return { sido: s.sido, alt: altHit };
  }
  return null;
}

function matchPosition(
  title: string,
): "GOVERNOR" | "SUPERINTENDENT" | "MAYOR" | null {
  if (title.includes("교육감")) return "SUPERINTENDENT";
  if (
    title.includes("시·도지사") ||
    title.includes("도지사") ||
    title.includes("광역단체장")
  ) {
    return "GOVERNOR";
  }
  if (
    title.includes("시장") ||
    title.includes("군수") ||
    title.includes("구청장") ||
    title.includes("기초단체장")
  ) {
    return "MAYOR";
  }
  return null;
}

// ───────── 자막 ─────────────────────────────────────────────

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const segs = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ko" });
    if (!segs || segs.length === 0) return null;
    return segs.map((s) => s.text).join(" ");
  } catch (err) {
    console.warn(`[debate] no transcript ${videoId}: ${(err as Error).message}`);
    return null;
  }
}

// ───────── 요약 ─────────────────────────────────────────────

async function summarizeWithGemini(
  transcript: string,
  meta: {
    sido: string;
    positionType: string;
    wiwName: string | null;
    title: string;
    candidateNames: string[];
  },
): Promise<{ summary: string; keyTopics: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  const posLabel =
    meta.positionType === "GOVERNOR" ? "시·도지사" :
    meta.positionType === "SUPERINTENDENT" ? "교육감" :
    "시장·군수·구청장";
  const where = meta.wiwName ? `${meta.sido} ${meta.wiwName}` : meta.sido;
  const candHint = meta.candidateNames.length
    ? `등록 후보: ${meta.candidateNames.join(", ")}`
    : "후보 명단 정보 없음 — 자막에서 호명되는 이름으로 식별";

  const prompt = `당신은 한국 지방선거 시민 안내 서비스의 편집자입니다. 다음은 2026.6.3 지방선거 ${where} ${posLabel} 후보자 토론회 자막입니다.

영상 제목: ${meta.title}
${candHint}

[자막]
${transcript.slice(0, 100_000)}

다음 두 가지를 출력하세요. 자막에 근거한 사실만 추출하고, 추측·의견은 금지합니다.

(1) 마크다운 요약 (한국어, 약 600자)
  - 토론 핵심 쟁점 3-5개 (## 쟁점)
  - 각 쟁점별 후보 입장 한 줄씩
  - 인상적 발언 2-3개 인용 (> 인용문 — 후보명)

(2) 구조화된 핵심 쟁점을 JSON 배열로 출력 (요약 뒤에 별도 코드블록).
  스키마: [{ "topic": string, "statements": [{ "candidate": string, "point": string }] }]
  3-5개 쟁점만, 각 후보별 1-2문장.

출력 형식:
[SUMMARY]
...(마크다운 요약)...
[/SUMMARY]
[TOPICS_JSON]
...(JSON 배열)...
[/TOPICS_JSON]`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const text = result.text ?? "";

  const sumMatch = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  const topMatch = text.match(/\[TOPICS_JSON\]([\s\S]*?)\[\/TOPICS_JSON\]/);
  const summary = (sumMatch?.[1] ?? text).trim();
  let keyTopics: unknown = null;
  if (topMatch) {
    try {
      keyTopics = JSON.parse(topMatch[1].trim());
    } catch {
      keyTopics = null;
    }
  }
  return { summary, keyTopics };
}

// ───────── 후보 인덱스 ──────────────────────────────────────

async function loadCandidatesIndex(): Promise<
  Map<string, { id: string; name: string; positionType: string }[]>
> {
  const freshSince = new Date(Date.now() - 3 * 86400_000);
  const rows = await prisma.candidate.findMany({
    where: {
      electionId: ELECTION_ID,
      status: "REGISTERED",
      positionType: { in: ["GOVERNOR", "SUPERINTENDENT", "MAYOR"] },
      backgroundLastSyncedAt: { gte: freshSince },
    },
    select: { id: true, name: true, positionType: true, sido: true, wiwName: true },
  });
  const idx = new Map<
    string,
    { id: string; name: string; positionType: string }[]
  >();
  const push = (key: string, v: { id: string; name: string; positionType: string }) => {
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key)!.push(v);
  };
  for (const r of rows) {
    if (!r.sido) continue;
    const v = { id: r.id, name: r.name, positionType: r.positionType };
    if (r.positionType === "MAYOR" && r.wiwName) {
      push(`${r.sido}|MAYOR|${r.wiwName}`, v);
    } else {
      push(`${r.sido}|${r.positionType}`, v);
      // 광주·전남 통합 entry 별칭.
      if (r.sido === "전남광주통합특별시") {
        push(`광주광역시|${r.positionType}`, v);
        push(`전라남도|${r.positionType}`, v);
      }
    }
  }
  return idx;
}

// ───────── 검색어 자동 생성 ─────────────────────────────────

async function buildSearchTasks(): Promise<SearchTask[]> {
  const tasks: SearchTask[] = [];

  // 광역(GOVERNOR + SUPERINTENDENT).
  for (const s of SIDOS) {
    tasks.push({ query: `${s.alts[0]} 시·도지사 후보 토론회`, sido: s.sido, positionType: "GOVERNOR", wiwName: null });
    tasks.push({ query: `${s.alts[0]} 도지사 후보 토론회 2026`, sido: s.sido, positionType: "GOVERNOR", wiwName: null });
    tasks.push({ query: `${s.alts[0]} 교육감 후보 토론회`, sido: s.sido, positionType: "SUPERINTENDENT", wiwName: null });
  }

  // 기초장(MAYOR) — DB에서 distinct (sido, wiwName).
  const freshSince = new Date(Date.now() - 3 * 86400_000);
  const wiws = await prisma.candidate.findMany({
    where: {
      electionId: ELECTION_ID,
      positionType: "MAYOR",
      status: "REGISTERED",
      backgroundLastSyncedAt: { gte: freshSince },
      sido: { not: null },
      wiwName: { not: null },
    },
    select: { sido: true, wiwName: true },
    distinct: ["sido", "wiwName"],
  });
  for (const w of wiws) {
    if (!w.sido || !w.wiwName) continue;
    const sidoAlt = SIDOS.find((s) => s.sido === w.sido)?.alts[0] ?? w.sido;
    tasks.push({
      query: `${sidoAlt} ${w.wiwName} 후보 토론회`,
      sido: w.sido,
      positionType: "MAYOR",
      wiwName: w.wiwName,
    });
  }

  return tasks;
}

// ───────── 메인 ─────────────────────────────────────────────

export async function ingestDebates(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("[debate] GEMINI_API_KEY not set — abort.");
    return;
  }

  console.log("[debate] building search tasks…");
  const tasks = await buildSearchTasks();
  console.log(`[debate] ${tasks.length} search queries planned`);

  // 1) 후보 영상 수집 (dedupe by videoId).
  const videoMap = new Map<string, {
    meta: YoutubeVideoMeta;
    hint: { sido: string; positionType: SearchTask["positionType"]; wiwName: string | null };
  }>();

  for (const t of tasks) {
    const results = await searchVideos(t.query);
    for (const v of results) {
      if (!looksLikeDebate(v.title)) continue;
      // 제목으로 한 번 더 검증 — 검색 hint와 정확히 어긋나면 일단 hint 사용.
      const titleSido = matchSido(v.title);
      const titlePos = matchPosition(v.title);
      const sido = titleSido?.sido ?? t.sido;
      const positionType = (titlePos ?? t.positionType) as SearchTask["positionType"];
      // sido 충돌(검색 hint와 제목이 다른 시·도일 경우)이면 스킵.
      if (titleSido && titleSido.sido !== t.sido) continue;
      videoMap.set(v.videoId, {
        meta: v,
        hint: { sido, positionType, wiwName: t.wiwName },
      });
    }
  }

  // 채널 RSS 보조 소스.
  const extraChannels = (process.env.DEBATE_YOUTUBE_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const channelId of extraChannels) {
    const vids = await fetchChannelVideos(channelId);
    for (const v of vids) {
      if (!looksLikeDebate(v.title)) continue;
      const ts = matchSido(v.title);
      const tp = matchPosition(v.title);
      if (!ts || !tp) continue;
      videoMap.set(v.videoId, {
        meta: v,
        hint: { sido: ts.sido, positionType: tp, wiwName: null },
      });
    }
  }

  console.log(`[debate] unique candidate videos: ${videoMap.size}`);

  // 2) 각 영상에 대해 자막 + 요약 + upsert.
  const candidatesIdx = await loadCandidatesIndex();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [videoId, { meta, hint }] of videoMap.entries()) {
    // 이미 처리된 영상은 스킵.
    const existing = await prisma.debate.findUnique({
      where: { electionId_videoId: { electionId: ELECTION_ID, videoId } },
    });
    if (existing?.summary) {
      skipped++;
      continue;
    }

    const transcript = await fetchTranscript(videoId);
    if (!transcript || transcript.length < 500) {
      skipped++;
      continue;
    }

    const key =
      hint.positionType === "MAYOR" && hint.wiwName
        ? `${hint.sido}|MAYOR|${hint.wiwName}`
        : `${hint.sido}|${hint.positionType}`;
    const candidates = candidatesIdx.get(key) ?? [];
    const candidateNames = candidates.map((c) => c.name);

    try {
      const { summary, keyTopics } = await summarizeWithGemini(transcript, {
        sido: hint.sido,
        positionType: hint.positionType,
        wiwName: hint.wiwName,
        title: meta.title,
        candidateNames,
      });

      const matchedIds = candidates
        .filter((c) => transcript.includes(c.name) || meta.title.includes(c.name))
        .map((c) => c.id);

      await prisma.debate.upsert({
        where: { electionId_videoId: { electionId: ELECTION_ID, videoId } },
        create: {
          electionId: ELECTION_ID,
          sido: hint.sido,
          wiwName: hint.wiwName,
          positionType: hint.positionType,
          videoId,
          title: meta.title,
          channelTitle: meta.channelTitle,
          publishedAt: meta.publishedAt,
          sourceUrl: meta.sourceUrl,
          transcript: transcript.slice(0, 200_000),
          summary,
          keyTopics: (keyTopics ?? undefined) as never,
          candidateIds: matchedIds as never,
        },
        update: {
          title: meta.title,
          channelTitle: meta.channelTitle,
          publishedAt: meta.publishedAt,
          transcript: transcript.slice(0, 200_000),
          summary,
          keyTopics: (keyTopics ?? undefined) as never,
          candidateIds: matchedIds as never,
        },
      });
      processed++;
      console.log(
        `[debate] OK ${hint.sido} ${hint.wiwName ?? ""} ${hint.positionType} — ${meta.title.slice(0, 40)}…`,
      );
    } catch (err) {
      failed++;
      console.error(`[debate] FAIL ${videoId}:`, (err as Error).message);
    }
  }

  console.log(
    `[debate] done — videos=${videoMap.size} processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestDebates()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

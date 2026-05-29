/**
 * 후보자 토론회 ingest — YouTube 채널 RSS → 자막 → Gemini 요약 → Debate 테이블.
 *
 * 광역(시·도지사·교육감)만 처리. 기초장 확장은 wiwName 필터 추가 시 가능.
 *
 * 환경변수:
 * - DEBATE_YOUTUBE_CHANNEL_IDS: 콤마 구분 YouTube channelId 목록.
 *   예: "UCxxxxxxxxxxxx,UCyyyyyyyyyyyy" — 중앙선거방송토론위원회 공식 채널 등.
 * - GEMINI_API_KEY: Google AI Studio 키.
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/debateYoutube.ts
 */

import { GoogleGenAI } from "@google/genai";
import { YoutubeTranscript } from "youtube-transcript";
import Parser from "rss-parser";
import { prisma } from "../db.js";

const ELECTION_ID = "20260603";

// NEC 8회/9회 공식 표기와 일상 표기 차이가 있어 변형 허용.
const SIDO_KEYWORDS: { sido: string; alts: string[] }[] = [
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

// 직위 키워드.
const POSITION_PATTERNS = [
  { positionType: "GOVERNOR", keywords: ["시·도지사", "도지사", "시장 후보", "광역단체장"] },
  { positionType: "SUPERINTENDENT", keywords: ["교육감"] },
];

const DEBATE_KEYWORDS = ["토론회", "토론", "후보자 토론", "정책 토론"];

interface YoutubeVideo {
  videoId: string;
  title: string;
  publishedAt: Date | null;
  channelTitle: string | null;
  sourceUrl: string;
}

const rssParser = new Parser({
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["media:group", "mediaGroup"],
    ],
  },
});

async function fetchChannelVideos(channelId: string): Promise<YoutubeVideo[]> {
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
        publishedAt: it.pubDate ? new Date(it.pubDate) : null,
        channelTitle,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }).filter((v) => v.videoId);
  } catch (err) {
    console.error(`[debate] channel RSS failed ${channelId}:`, err);
    return [];
  }
}

function classifyVideo(title: string): {
  sido: string | null;
  positionType: string | null;
  isDebate: boolean;
} {
  const isDebate = DEBATE_KEYWORDS.some((kw) => title.includes(kw));
  if (!isDebate) return { sido: null, positionType: null, isDebate: false };

  const matchedSido = SIDO_KEYWORDS.find(
    (s) => title.includes(s.sido) || s.alts.some((a) => title.includes(a)),
  );

  const matchedPos = POSITION_PATTERNS.find((p) =>
    p.keywords.some((k) => title.includes(k)),
  );

  return {
    sido: matchedSido?.sido ?? null,
    positionType: matchedPos?.positionType ?? null,
    isDebate: true,
  };
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: "ko",
    });
    if (!segments || segments.length === 0) return null;
    return segments.map((s) => s.text).join(" ");
  } catch (err) {
    // 자막 없는 영상이거나 잠긴 경우.
    console.warn(`[debate] transcript unavailable for ${videoId}:`, (err as Error).message);
    return null;
  }
}

async function summarizeWithGemini(
  transcript: string,
  meta: { sido: string; positionType: string; title: string; candidateNames: string[] },
): Promise<{ summary: string; keyTopics: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  const posLabel = meta.positionType === "GOVERNOR" ? "시·도지사" : "교육감";
  const candHint = meta.candidateNames.length
    ? `등록 후보: ${meta.candidateNames.join(", ")}`
    : "후보 명단 정보 없음 — 자막에서 호명되는 이름으로 식별";

  const prompt = `당신은 한국 지방선거 시민 안내 서비스의 편집자입니다. 다음은 2026.6.3 지방선거 ${meta.sido} ${posLabel} 후보자 토론회 자막입니다.

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

async function loadActiveCandidates(): Promise<
  Map<string, { id: string; name: string; positionType: string }[]>
> {
  const freshSince = new Date(Date.now() - 3 * 86400_000);
  const rows = await prisma.candidate.findMany({
    where: {
      electionId: ELECTION_ID,
      status: "REGISTERED",
      positionType: { in: ["GOVERNOR", "SUPERINTENDENT"] },
      backgroundLastSyncedAt: { gte: freshSince },
    },
    select: { id: true, name: true, positionType: true, sido: true },
  });
  const bySidoPos = new Map<string, { id: string; name: string; positionType: string }[]>();
  for (const r of rows) {
    if (!r.sido) continue;
    const key = `${r.sido}|${r.positionType}`;
    if (!bySidoPos.has(key)) bySidoPos.set(key, []);
    bySidoPos.get(key)!.push({ id: r.id, name: r.name, positionType: r.positionType });
    if (r.sido === "전남광주통합특별시") {
      for (const alias of ["광주광역시", "전라남도"]) {
        const ak = `${alias}|${r.positionType}`;
        if (!bySidoPos.has(ak)) bySidoPos.set(ak, []);
        bySidoPos.get(ak)!.push({ id: r.id, name: r.name, positionType: r.positionType });
      }
    }
  }
  return bySidoPos;
}

export async function ingestDebates(): Promise<void> {
  const channelIdsEnv = process.env.DEBATE_YOUTUBE_CHANNEL_IDS;
  if (!channelIdsEnv) {
    console.error(
      "[debate] DEBATE_YOUTUBE_CHANNEL_IDS not set — skip. " +
        "Set comma-separated YouTube channel IDs (e.g., 중앙선거방송토론위원회).",
    );
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("[debate] GEMINI_API_KEY not set — skip.");
    return;
  }

  const channelIds = channelIdsEnv.split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`[debate] scanning ${channelIds.length} channel(s)`);

  const candidatesIdx = await loadActiveCandidates();

  let scanned = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const channelId of channelIds) {
    const videos = await fetchChannelVideos(channelId);
    console.log(`[debate] channel ${channelId}: ${videos.length} videos`);
    for (const v of videos) {
      scanned++;
      const cls = classifyVideo(v.title);
      if (!cls.isDebate || !cls.sido || !cls.positionType) {
        skipped++;
        continue;
      }

      // 이미 처리된 영상은 스킵.
      const existing = await prisma.debate.findUnique({
        where: { electionId_videoId: { electionId: ELECTION_ID, videoId: v.videoId } },
      });
      if (existing?.summary) {
        skipped++;
        continue;
      }

      const transcript = await fetchTranscript(v.videoId);
      if (!transcript || transcript.length < 500) {
        skipped++;
        continue;
      }

      const candidates = candidatesIdx.get(`${cls.sido}|${cls.positionType}`) ?? [];
      const candidateNames = candidates.map((c) => c.name);

      try {
        const { summary, keyTopics } = await summarizeWithGemini(transcript, {
          sido: cls.sido,
          positionType: cls.positionType,
          title: v.title,
          candidateNames,
        });

        const matchedCandidateIds = candidates
          .filter((c) => transcript.includes(c.name) || v.title.includes(c.name))
          .map((c) => c.id);

        await prisma.debate.upsert({
          where: {
            electionId_videoId: { electionId: ELECTION_ID, videoId: v.videoId },
          },
          create: {
            electionId: ELECTION_ID,
            sido: cls.sido,
            positionType: cls.positionType,
            videoId: v.videoId,
            title: v.title,
            channelTitle: v.channelTitle,
            publishedAt: v.publishedAt,
            sourceUrl: v.sourceUrl,
            transcript: transcript.slice(0, 200_000),
            summary,
            keyTopics: (keyTopics ?? undefined) as never,
            candidateIds: matchedCandidateIds as never,
          },
          update: {
            title: v.title,
            channelTitle: v.channelTitle,
            publishedAt: v.publishedAt,
            transcript: transcript.slice(0, 200_000),
            summary,
            keyTopics: (keyTopics ?? undefined) as never,
            candidateIds: matchedCandidateIds as never,
          },
        });
        processed++;
        console.log(
          `[debate] OK ${cls.sido} ${cls.positionType} — ${v.title.slice(0, 40)}…`,
        );
      } catch (err) {
        failed++;
        console.error(`[debate] FAIL ${v.videoId}:`, (err as Error).message);
      }
    }
  }

  console.log(
    `[debate] done — scanned=${scanned} processed=${processed} skipped=${skipped} failed=${failed}`,
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

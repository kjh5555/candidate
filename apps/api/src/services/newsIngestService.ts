// 의원별 논란·해명 자동수집 서비스.
//
// Pipeline:
//   1. Google News RSS로 의원 이름 검색
//   2. 각 기사 URL의 본문을 @mozilla/readability + jsdom으로 추출
//   3. 기사 라벨링 (LLM 또는 휴리스틱)
//   4. 토픽 클러스터링 (LLM 또는 jaccard 휴리스틱)
//   5. 신뢰도 점수 산출 (출처 시그널 집계, LLM 없어도 동작)
//   6. DB upsert

import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import pLimit from "p-limit";
import { prisma } from "../db.js";
import {
  analyzeArticle,
  clusterArticlesIntoTopics,
  summarizeTopic,
  isLlmEnabled,
} from "../lib/llmClient.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_ARTICLES_PER_LEGISLATOR = 25;
const FETCH_TIMEOUT_MS = 15_000;

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  source?: string;
}

export interface ExtractedArticle {
  url: string;
  source: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
}

export interface IngestResult {
  topicsCreated: number;
  topicsUpdated: number;
  articlesAdded: number;
}

// ── 1. Google News RSS ────────────────────────────────────────

const rssParser = new Parser({
  headers: { "User-Agent": USER_AGENT },
});

export async function fetchGoogleNewsRss(
  legislatorName: string,
): Promise<RssItem[]> {
  const query = encodeURIComponent(`"${legislatorName}"`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
  const feed = await rssParser.parseURL(url);
  const items: RssItem[] = [];
  for (const item of feed.items) {
    const link = item.link;
    const title = item.title;
    if (!link || !title) continue;
    // Google News의 source 정보는 item.creator 또는 title 끝의 " - 언론사"
    const sourceFromTitle = extractSourceFromTitle(title);
    items.push({
      title: stripSourceFromTitle(title),
      link,
      pubDate: item.pubDate,
      source: item.creator ?? sourceFromTitle ?? undefined,
    });
  }
  return items.slice(0, MAX_ARTICLES_PER_LEGISLATOR);
}

function extractSourceFromTitle(title: string): string | null {
  // Google News 기본 포맷: "기사 제목 - 언론사명"
  const idx = title.lastIndexOf(" - ");
  if (idx === -1) return null;
  const candidate = title.slice(idx + 3).trim();
  if (candidate.length === 0 || candidate.length > 30) return null;
  return candidate;
}

function stripSourceFromTitle(title: string): string {
  const idx = title.lastIndexOf(" - ");
  if (idx === -1) return title;
  return title.slice(0, idx).trim();
}

// ── 2. 본문 추출 (Readability + jsdom) ────────────────────────

export async function fetchAndExtractArticle(
  url: string,
): Promise<ExtractedArticle | null> {
  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const finalUrl = url;
  try {
    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) {
      return shallowExtract(html, finalUrl);
    }
    const excerpt =
      (article.textContent ?? "").trim().slice(0, 1200) || null;
    const source = deriveSourceName(finalUrl, dom);
    const publishedAt = deriveDate(dom);
    const title = (article.title ?? "").trim() || extractTitleFromHtml(html);
    return {
      url: finalUrl,
      source,
      title,
      excerpt,
      publishedAt,
    };
  } catch {
    return shallowExtract(html, finalUrl);
  }
}

function shallowExtract(html: string, url: string): ExtractedArticle | null {
  const title = extractTitleFromHtml(html);
  if (!title) return null;
  return {
    url,
    source: hostnameOf(url),
    title,
    excerpt: null,
    publishedAt: null,
  };
}

function extractTitleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1]!.trim() : "";
}

function deriveSourceName(url: string, dom: JSDOM): string {
  // 메타 태그에서 사이트명 추출 시도
  const ogSite = dom.window.document
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute("content");
  if (ogSite && ogSite.trim().length > 0 && ogSite.trim().length < 30) {
    return ogSite.trim();
  }
  return hostnameOf(url);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function deriveDate(dom: JSDOM): Date | null {
  const doc = dom.window.document;
  const candidates = [
    doc.querySelector('meta[property="article:published_time"]'),
    doc.querySelector('meta[name="article:published_time"]'),
    doc.querySelector('meta[property="og:published_time"]'),
    doc.querySelector('meta[name="pubdate"]'),
    doc.querySelector('meta[name="date"]'),
    doc.querySelector("time[datetime]"),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const v =
      el.getAttribute("content") ?? el.getAttribute("datetime") ?? null;
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// ── 3. 휴리스틱 라벨링 (LLM fallback) ─────────────────────────

const PRIMARY_SOURCE_KEYWORDS = [
  "녹취",
  "회의록",
  "보도자료",
  "성명서",
  "원문",
  "공식 입장",
  "본인 입장",
  "본인은",
  "라고 밝혔다",
  "라고 말했다",
  "라고 강조했다",
  "녹음",
  "공보",
  "성명",
];

const CORRECTION_KEYWORDS = [
  "정정보도",
  "반박",
  "사실과 다르",
  "사실 무근",
  "허위 사실",
  "취재 결과",
  "확인 결과",
  "오보",
  "정정",
  "사과",
  "유감",
];

const EXPLANATION_KEYWORDS = [
  "해명",
  "반박",
  "입장 표명",
  "사과",
  "유감",
  "본인은",
  "측은",
  "라고 해명",
];

const CLAIM_KEYWORDS = ["의혹", "논란", "비판", "지적", "폭로", "주장"];

function heuristicAnalyze(text: string): {
  stance: "claim" | "explanation" | "neutral";
  hasPrimarySource: boolean;
  hasCorrection: boolean;
} {
  const haystack = text.toLowerCase();
  const hasPrimarySource = PRIMARY_SOURCE_KEYWORDS.some((kw) =>
    haystack.includes(kw.toLowerCase()),
  );
  const hasCorrection = CORRECTION_KEYWORDS.some((kw) =>
    haystack.includes(kw.toLowerCase()),
  );
  const claimHits = CLAIM_KEYWORDS.filter((kw) =>
    haystack.includes(kw.toLowerCase()),
  ).length;
  const explainHits = EXPLANATION_KEYWORDS.filter((kw) =>
    haystack.includes(kw.toLowerCase()),
  ).length;
  let stance: "claim" | "explanation" | "neutral" = "neutral";
  if (explainHits > claimHits && explainHits > 0) stance = "explanation";
  else if (claimHits > 0) stance = "claim";
  return { stance, hasPrimarySource, hasCorrection };
}

// ── 4. 클러스터링 휴리스틱 (jaccard) ──────────────────────────

function tokenize(text: string, stopwords: Set<string> = new Set()): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .split(/\s+/)
      .filter((tok) => tok.length >= 2 && !stopwords.has(tok)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface ClusterInput {
  id: string;
  title: string;
}

function heuristicCluster(
  inputs: ClusterInput[],
  stopwords: Set<string> = new Set(),
  threshold = 0.3,
): { title: string; articleIds: string[] }[] {
  const tokenMap = new Map<string, Set<string>>();
  for (const inp of inputs) tokenMap.set(inp.id, tokenize(inp.title, stopwords));

  const groups: { title: string; ids: string[]; tokens: Set<string> }[] = [];
  for (const inp of inputs) {
    const toks = tokenMap.get(inp.id)!;
    let bestGroup: (typeof groups)[number] | null = null;
    let bestScore = 0;
    for (const g of groups) {
      const s = jaccard(toks, g.tokens);
      if (s > bestScore) {
        bestScore = s;
        bestGroup = g;
      }
    }
    if (bestGroup && bestScore >= threshold && toks.size > 0) {
      bestGroup.ids.push(inp.id);
      for (const t of toks) bestGroup.tokens.add(t);
    } else {
      groups.push({
        title: inp.title.length > 60 ? inp.title.slice(0, 60) + "…" : inp.title,
        ids: [inp.id],
        tokens: new Set(toks),
      });
    }
  }
  return groups.map((g) => ({ title: g.title, articleIds: g.ids }));
}

// ── 5. 신뢰도 점수 산출 ──────────────────────────────────────

export interface CredibilitySignals {
  articleCount: number;
  uniqueSourceCount: number;
  uniqueSourcesRatio: number;
  primarySourceRatio: number;
  correctionRatio: number;
  computedAt: string;
  [key: string]: number | string;
}

export interface CredibilityResult {
  score: number;
  signals: CredibilitySignals;
}

export function computeCredibility(
  articles: Array<{
    source: string;
    hasPrimarySource: boolean | null;
    hasCorrection: boolean | null;
  }>,
): CredibilityResult {
  const articleCount = articles.length;
  const sourceSet = new Set<string>();
  for (const a of articles) sourceSet.add(a.source);
  const uniqueSourceCount = sourceSet.size;
  const uniqueSourcesRatio =
    articleCount === 0 ? 0 : uniqueSourceCount / articleCount;
  const primaryCount = articles.filter((a) => a.hasPrimarySource === true)
    .length;
  const correctionCount = articles.filter((a) => a.hasCorrection === true)
    .length;
  const primarySourceRatio =
    articleCount === 0 ? 0 : primaryCount / articleCount;
  const correctionRatio =
    articleCount === 0 ? 0 : correctionCount / articleCount;

  let score = 50;
  score += Math.min(30, articleCount * 5);
  score += uniqueSourcesRatio * 20;
  score += primarySourceRatio * 20;
  score -= correctionRatio * 40;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    signals: {
      articleCount,
      uniqueSourceCount,
      uniqueSourcesRatio: round2(uniqueSourcesRatio),
      primarySourceRatio: round2(primarySourceRatio),
      correctionRatio: round2(correctionRatio),
      computedAt: new Date().toISOString(),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── 6. 메인: 의원별 수집기 ─────────────────────────────────────

export async function ingestControversiesForLegislator(
  legislatorId: string,
): Promise<IngestResult> {
  const legislator = await prisma.legislator.findUnique({
    where: { id: legislatorId },
    select: { id: true, name: true, level: true },
  });
  if (!legislator) {
    throw new Error(`Legislator not found: ${legislatorId}`);
  }

  // 1. RSS fetch
  const rssItems = await fetchGoogleNewsRss(legislator.name);

  // 2. 본문 추출 — 새 URL만 처리
  const existing = await prisma.newsArticle.findMany({
    where: {
      legislatorId,
      url: { in: rssItems.map((i) => i.link) },
    },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((e) => e.url));

  const newRssItems = rssItems.filter((i) => !existingUrls.has(i.link));

  const limit = pLimit(3);
  const extractedNullable = await Promise.all(
    newRssItems.map((rss) =>
      limit(async () => {
        const ext = await fetchAndExtractArticle(rss.link);
        if (!ext) return null;
        // RSS의 source(언론사명)가 더 정확. Readability는 redirector를 제대로
        // 못 따라가는 경우 "Google 뉴스"로 잡힐 수 있어 RSS 메타데이터 우선.
        const rssSource = rss.source && rss.source.trim().length > 0
          ? rss.source.trim()
          : null;
        const extSourceLooksGeneric =
          !ext.source ||
          /google/i.test(ext.source) ||
          ext.source === "news.google.com";
        // Title: Google News redirector는 본문 추출이 안 되어 "Google 뉴스" 같은
        // 일반 제목이 잡힘. RSS title이 거의 항상 더 정확.
        const extTitleLooksGeneric =
          !ext.title ||
          /^google\s*뉴스/i.test(ext.title) ||
          /^google\s*news/i.test(ext.title) ||
          ext.title.length < 5;
        const finalTitle = extTitleLooksGeneric ? rss.title : ext.title;
        // Excerpt: redirector면 본문도 의미 없음. "Google 뉴스" 류면 비움.
        const finalExcerpt = extTitleLooksGeneric ? null : ext.excerpt;
        return {
          ...ext,
          source: rssSource ?? (extSourceLooksGeneric ? hostnameOf(rss.link) : ext.source),
          publishedAt:
            ext.publishedAt ??
            (rss.pubDate ? new Date(rss.pubDate) : null),
          title: finalTitle,
          excerpt: finalExcerpt,
        } as ExtractedArticle;
      }),
    ),
  );

  // Readability 실패해도 RSS title+link은 유효 → fallback 저장
  const newExtracted: ExtractedArticle[] = [];
  for (let i = 0; i < newRssItems.length; i++) {
    const rss = newRssItems[i]!;
    const ext = extractedNullable[i];
    if (ext) {
      newExtracted.push(ext);
    } else {
      newExtracted.push({
        url: rss.link,
        source: rss.source ?? hostnameOf(rss.link),
        title: rss.title,
        excerpt: null,
        publishedAt: rss.pubDate ? new Date(rss.pubDate) : null,
      });
    }
  }

  // 3. 새 기사 라벨링 (LLM 또는 휴리스틱)
  const labeled = await Promise.all(
    newExtracted.map((ext) =>
      limit(async () => {
        let analysis: {
          stance: "claim" | "explanation" | "neutral";
          hasPrimarySource: boolean;
          hasCorrection: boolean;
        };
        if (isLlmEnabled()) {
          const r = await analyzeArticle({
            url: ext.url,
            title: ext.title,
            excerpt: ext.excerpt,
          });
          analysis =
            r ?? heuristicAnalyze(`${ext.title}\n${ext.excerpt ?? ""}`);
        } else {
          analysis = heuristicAnalyze(`${ext.title}\n${ext.excerpt ?? ""}`);
        }
        return { ext, analysis };
      }),
    ),
  );

  // 4. 새 기사 DB insert (토픽은 일단 null로)
  let articlesAdded = 0;
  for (const { ext, analysis } of labeled) {
    try {
      await prisma.newsArticle.create({
        data: {
          legislatorId,
          url: ext.url,
          source: ext.source,
          title: ext.title,
          excerpt: ext.excerpt,
          publishedAt: ext.publishedAt,
          stance: analysis.stance,
          hasPrimarySource: analysis.hasPrimarySource,
          hasCorrection: analysis.hasCorrection,
        },
      });
      articlesAdded += 1;
    } catch (err) {
      // Unique constraint (URL) 충돌은 무시
      const msg = err instanceof Error ? err.message : String(err);
      if (!/Unique constraint/i.test(msg)) {
        console.warn("[newsIngest] insert failed:", ext.url, msg);
      }
    }
  }

  // 5. 토픽 클러스터링 — 의원의 모든 기사 대상으로 재구성
  const allArticles = await prisma.newsArticle.findMany({
    where: { legislatorId },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      excerpt: true,
      source: true,
      hasPrimarySource: true,
      hasCorrection: true,
      topicId: true,
    },
  });

  if (allArticles.length === 0) {
    return { topicsCreated: 0, topicsUpdated: 0, articlesAdded };
  }

  // 클러스터링 시도
  let clusters: { title: string; articleIds: string[] }[] = [];
  if (isLlmEnabled()) {
    const llmResult = await clusterArticlesIntoTopics(
      allArticles.map((a) => ({
        id: a.id,
        title: a.title,
        excerpt: a.excerpt,
      })),
    );
    if (llmResult) {
      for (const [title, ids] of llmResult) {
        clusters.push({ title, articleIds: ids });
      }
    }
  }
  if (clusters.length === 0) {
    const stopwords = new Set<string>([
      legislator.name.toLowerCase(),
      // 일반 흔한 토큰 — 차후 보강 가능
      "의원",
      "국회의원",
      "더불어민주당",
      "국민의힘",
    ]);
    clusters = heuristicCluster(
      allArticles.map((a) => ({ id: a.id, title: a.title })),
      stopwords,
    );
  }

  // 6. 기존 토픽 모두 삭제 후 재생성 (단순/명확) — 단, 기사는 보존됨
  await prisma.controversyTopic.deleteMany({ where: { legislatorId } });

  let topicsCreated = 0;
  for (const cluster of clusters) {
    if (cluster.articleIds.length === 0) continue;
    const articlesInCluster = allArticles.filter((a) =>
      cluster.articleIds.includes(a.id),
    );
    if (articlesInCluster.length === 0) continue;

    const cred = computeCredibility(
      articlesInCluster.map((a) => ({
        source: a.source,
        hasPrimarySource: a.hasPrimarySource,
        hasCorrection: a.hasCorrection,
      })),
    );

    // 토픽 요약 시도 (LLM)
    let summary: string | null = null;
    let category: string | null = null;
    let finalTitle = cluster.title;
    if (isLlmEnabled()) {
      const ts = await summarizeTopic(
        articlesInCluster.slice(0, 8).map((a) => ({
          url: a.id,
          title: a.title,
          excerpt: a.excerpt,
        })),
      );
      if (ts) {
        summary = ts.summary;
        category = ts.category;
        finalTitle = ts.title || cluster.title;
      }
    }

    const topic = await prisma.controversyTopic.create({
      data: {
        legislatorId,
        title: finalTitle,
        summary,
        category,
        credibility: cred.score,
        signals: cred.signals,
        lastSyncedAt: new Date(),
      },
    });
    topicsCreated += 1;

    await prisma.newsArticle.updateMany({
      where: { id: { in: articlesInCluster.map((a) => a.id) } },
      data: { topicId: topic.id },
    });
  }

  return { topicsCreated, topicsUpdated: 0, articlesAdded };
}

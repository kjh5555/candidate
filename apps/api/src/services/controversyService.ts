// 조회용 서비스 — ControversyTopic + NewsArticle DB 조회 후 DTO 변환.

import type {
  ControversyTopicDTO,
  ControversyTopicsResponseDTO,
  NewsArticleDTO,
  NewsStance,
} from "@repo/shared";
import { prisma } from "../db.js";

function toStance(s: string | null): NewsStance | null {
  if (s === "claim" || s === "explanation" || s === "neutral") return s;
  return null;
}

export async function getControversyTopicsForLegislator(
  legislatorId: string,
): Promise<ControversyTopicsResponseDTO> {
  const topics = await prisma.controversyTopic.findMany({
    where: { legislatorId },
    orderBy: [
      { credibility: "desc" },
      { lastSyncedAt: "desc" },
    ],
    include: {
      articles: {
        orderBy: [{ publishedAt: "desc" }],
      },
    },
  });

  // 토픽이 비어있을 수도 있으므로 lastSyncedAt 계산
  let lastSyncedAt: string | null = null;
  if (topics.length > 0) {
    const max = topics
      .map((t) => t.lastSyncedAt.getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    lastSyncedAt = new Date(max).toISOString();
  } else {
    // 토픽이 없어도 의원 기사가 있으면 가장 최근 fetchedAt 반환
    const latestArticle = await prisma.newsArticle.findFirst({
      where: { legislatorId },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    if (latestArticle) lastSyncedAt = latestArticle.fetchedAt.toISOString();
  }

  const topicDtos: ControversyTopicDTO[] = topics.map((t) => {
    const articles: NewsArticleDTO[] = t.articles.map((a) => ({
      id: a.id,
      url: a.url,
      source: a.source,
      title: a.title,
      excerpt: a.excerpt,
      publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
      stance: toStance(a.stance),
      hasPrimarySource: a.hasPrimarySource,
      hasCorrection: a.hasCorrection,
    }));
    return {
      id: t.id,
      legislatorId: t.legislatorId,
      title: t.title,
      summary: t.summary,
      category: t.category,
      credibility: t.credibility,
      signals: (t.signals as Record<string, unknown> | null) ?? null,
      firstSeenAt: t.firstSeenAt.toISOString(),
      lastSyncedAt: t.lastSyncedAt.toISOString(),
      articles,
    };
  });

  return { topics: topicDtos, lastSyncedAt };
}

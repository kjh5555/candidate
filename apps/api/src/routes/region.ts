import type { FastifyPluginAsync } from "fastify";
import Parser from "rss-parser";
import {
  AddressNotFoundError,
  KakaoApiError,
  matchRegion,
} from "../services/regionMatcher.js";

const rssParser = new Parser({});

interface MatchQuery {
  address: string;
}

interface NewsQuery {
  sido?: string;
  wiwName?: string;
  q?: string; // 자유 검색어 (예: 의원 이름+지역). 있으면 sido/wiwName보다 우선
  today?: string; // "true" 이면 오늘 날짜 뉴스만
  limit?: string;
}

const regionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: MatchQuery }>(
    "/match",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["address"],
          properties: {
            address: { type: "string", minLength: 2, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const { address } = request.query;
      try {
        const result = await matchRegion(address);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof AddressNotFoundError) {
          return reply.status(404).send({
            error: "ADDRESS_NOT_FOUND",
            message: err.message,
          });
        }
        if (err instanceof KakaoApiError) {
          return reply.status(502).send({
            error: "KAKAO_API_ERROR",
            message: err.message,
            detail: err.detail,
          });
        }
        request.log.error({ err }, "region/match unexpected error");
        return reply.status(500).send({
          error: "INTERNAL_ERROR",
          message: "Failed to match region",
        });
      }
    },
  );

  fastify.get<{ Querystring: NewsQuery }>(
    "/news",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            sido: { type: "string" },
            wiwName: { type: "string" },
            q: { type: "string" },
            today: { type: "string" },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { sido, wiwName, q, today, limit } = request.query;
      const query =
        q?.trim() ||
        [sido, wiwName].filter(Boolean).join(" ").trim() ||
        "지방선거";
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
      const max = Math.min(Math.max(parseInt(limit ?? "8", 10) || 8, 1), 20);
      try {
        const feed = await rssParser.parseURL(url);
        let items = (feed.items ?? []).map((it) => ({
          title: it.title ?? "",
          link: it.link ?? "",
          source: it.creator ?? "",
          publishedAt: it.pubDate ?? null,
        }));
        if (today === "true") {
          // KST 자정 기준 오늘 (UTC 15:00 전날)
          const now = new Date();
          const kstNow = new Date(now.getTime() + 9 * 3600_000);
          const y = kstNow.getUTCFullYear();
          const m = kstNow.getUTCMonth();
          const d = kstNow.getUTCDate();
          const kstMidnight = Date.UTC(y, m, d) - 9 * 3600_000;
          items = items.filter((it) => {
            if (!it.publishedAt) return false;
            const t = new Date(it.publishedAt).getTime();
            return Number.isFinite(t) && t >= kstMidnight;
          });
        }
        items = items.slice(0, max);
        return reply.send({ items, query });
      } catch (err) {
        request.log.error({ err }, "region news fetch failed");
        return reply.status(503).send({
          error: "NEWS_FETCH_FAILED",
          message: "뉴스를 불러오지 못했습니다.",
        });
      }
    },
  );
};

export default regionRoutes;

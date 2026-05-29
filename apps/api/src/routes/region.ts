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
          },
        },
      },
    },
    async (request, reply) => {
      const { sido, wiwName } = request.query;
      const query = [sido, wiwName].filter(Boolean).join(" ").trim() || "지방선거";
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
      try {
        const feed = await rssParser.parseURL(url);
        const items = (feed.items ?? []).slice(0, 8).map((it) => ({
          title: it.title ?? "",
          link: it.link ?? "",
          source: it.creator ?? "",
          publishedAt: it.pubDate ?? null,
        }));
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

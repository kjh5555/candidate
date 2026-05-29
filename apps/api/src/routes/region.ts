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
  category?: string; // 분야: politics|budget|education|welfare|transport|environment|culture|society
}

// Google News는 RSS에 category 메타가 없어 검색어 보강으로 분류.
// 너무 좁은 단일 키워드 대신 OR로 묶어 해당 분야 기사 커버리지를 키움.
const CATEGORY_QUERY: Record<string, string> = {
  politics: "(정치 OR 의회 OR 선거 OR 시장 OR 시정 OR 시·도지사 OR 도지사)",
  budget: "(예산 OR 재정 OR 세금 OR 결산 OR 추경)",
  education: "(교육 OR 학교 OR 학생 OR 교육감 OR 학군)",
  welfare: "(복지 OR 보건 OR 의료 OR 노인 OR 돌봄 OR 장애)",
  transport: "(교통 OR 도로 OR 버스 OR 지하철 OR GTX OR 철도)",
  environment: "(환경 OR 미세먼지 OR 폐기물 OR 재활용 OR 기후)",
  culture: "(문화 OR 체육 OR 축제 OR 관광 OR 도서관)",
  society: "(사건 OR 사고 OR 화재 OR 치안 OR 범죄 OR 안전)",
};

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
            category: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { sido, wiwName, q, today, limit, category } = request.query;
      const baseQuery =
        q?.trim() ||
        [sido, wiwName].filter(Boolean).join(" ").trim() ||
        "지방선거";
      const catKey = category?.trim().toLowerCase();
      const catExpr = catKey && CATEGORY_QUERY[catKey] ? CATEGORY_QUERY[catKey] : null;
      const query = catExpr ? `${baseQuery} ${catExpr}` : baseQuery;
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
        // KST 자정 기준 "오늘" 그룹을 위로, 그 안에선 최신 발행일 순.
        const kstMidnight = (() => {
          const now = new Date();
          const k = new Date(now.getTime() + 9 * 3600_000);
          return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600_000;
        })();
        items.sort((a, b) => {
          const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          const aToday = ta >= kstMidnight ? 1 : 0;
          const bToday = tb >= kstMidnight ? 1 : 0;
          if (aToday !== bToday) return bToday - aToday;
          return tb - ta;
        });
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

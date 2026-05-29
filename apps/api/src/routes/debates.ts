import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

interface ListQuery {
  sido?: string;
  positionType?: string;
  candidateId?: string;
  limit?: string;
}

const debateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ListQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            sido: { type: "string" },
            positionType: { type: "string" },
            candidateId: { type: "string" },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { sido, positionType, candidateId, limit } = request.query;
      const max = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 50);

      // 광주광역시·전라남도 통합 entry 같이 노출.
      const sidoIn =
        sido === "광주광역시" || sido === "전라남도"
          ? [sido, "전남광주통합특별시"]
          : sido
            ? [sido]
            : null;

      const rows = await prisma.debate.findMany({
        where: {
          electionId: "20260603",
          ...(sidoIn ? { sido: { in: sidoIn } } : {}),
          ...(positionType ? { positionType } : {}),
          ...(candidateId
            ? { candidateIds: { array_contains: [candidateId] } as never }
            : {}),
          summary: { not: null },
        },
        orderBy: [{ publishedAt: "desc" }, { syncedAt: "desc" }],
        take: max,
        select: {
          id: true,
          sido: true,
          positionType: true,
          videoId: true,
          title: true,
          channelTitle: true,
          publishedAt: true,
          sourceUrl: true,
          summary: true,
          keyTopics: true,
          candidateIds: true,
        },
      });

      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          sido: r.sido,
          positionType: r.positionType,
          videoId: r.videoId,
          title: r.title,
          channelTitle: r.channelTitle,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          sourceUrl: r.sourceUrl,
          summary: r.summary,
          keyTopics: r.keyTopics,
          candidateIds: (r.candidateIds as string[] | null) ?? [],
        })),
      });
    },
  );

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const row = await prisma.debate.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        sido: true,
        positionType: true,
        videoId: true,
        title: true,
        channelTitle: true,
        publishedAt: true,
        sourceUrl: true,
        summary: true,
        keyTopics: true,
        candidateIds: true,
      },
    });
    if (!row) return reply.status(404).send({ error: "NOT_FOUND" });
    return reply.send({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      candidateIds: (row.candidateIds as string[] | null) ?? [],
    });
  });
};

export default debateRoutes;

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

const ELECTION_ID = "20260603";

const partyRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/parties — 정당별 6.3 지선 후보 + 현직 의원 집계.
  fastify.get("/", async (_request, reply) => {
    const freshSince = new Date(Date.now() - 3 * 86400_000);

    // 후보 집계 (정당별 + 직위별).
    const candidateRows = await prisma.candidate.groupBy({
      by: ["party", "positionType"],
      where: {
        electionId: ELECTION_ID,
        status: "REGISTERED",
        backgroundLastSyncedAt: { gte: freshSince },
        party: { not: null },
      },
      _count: { _all: true },
    });

    // 현직 의원 집계 (국회+광역+기초 모두).
    const legislatorRows = await prisma.legislator.groupBy({
      by: ["party", "level"],
      where: { party: { not: null } },
      _count: { _all: true },
    });

    type Bucket = {
      party: string;
      totalCandidates: number;
      candidatesByPosition: Record<string, number>;
      totalLegislators: number;
      legislatorsByLevel: Record<string, number>;
    };
    const map = new Map<string, Bucket>();
    const ensure = (party: string) => {
      if (!map.has(party)) {
        map.set(party, {
          party,
          totalCandidates: 0,
          candidatesByPosition: {},
          totalLegislators: 0,
          legislatorsByLevel: {},
        });
      }
      return map.get(party)!;
    };
    for (const r of candidateRows) {
      if (!r.party) continue;
      const b = ensure(r.party);
      b.totalCandidates += r._count._all;
      b.candidatesByPosition[r.positionType] =
        (b.candidatesByPosition[r.positionType] ?? 0) + r._count._all;
    }
    for (const r of legislatorRows) {
      if (!r.party) continue;
      const b = ensure(r.party);
      b.totalLegislators += r._count._all;
      b.legislatorsByLevel[r.level] =
        (b.legislatorsByLevel[r.level] ?? 0) + r._count._all;
    }

    // 현직 의원 수 우선 → 다음 6.3 후보 수 (시민이 보는 정당 영향력 기준).
    const items = Array.from(map.values()).sort((a, b) => {
      if (b.totalLegislators !== a.totalLegislators) {
        return b.totalLegislators - a.totalLegislators;
      }
      return b.totalCandidates - a.totalCandidates;
    });
    return reply.send({ items });
  });

  // GET /api/parties/:name — 정당 상세 (후보·의원 리스트 + 위키 요약 stub).
  fastify.get<{ Params: { name: string } }>("/:name", async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    const freshSince = new Date(Date.now() - 3 * 86400_000);

    const [candidates, legislators, partyAggMatch] = await Promise.all([
      prisma.candidate.findMany({
        where: {
          electionId: ELECTION_ID,
          status: "REGISTERED",
          backgroundLastSyncedAt: { gte: freshSince },
          party: name,
        },
        select: {
          id: true,
          name: true,
          positionType: true,
          sido: true,
          wiwName: true,
          districtName: true,
          photoUrl: true,
        },
        orderBy: [{ positionType: "asc" }, { sido: "asc" }, { wiwName: "asc" }, { name: "asc" }],
        take: 500,
      }),
      prisma.legislator.findMany({
        where: { party: name },
        select: {
          id: true,
          name: true,
          level: true,
          region: true,
          councilName: true,
          assemblyAge: true,
        },
        orderBy: [{ level: "asc" }, { region: "asc" }, { name: "asc" }],
        take: 500,
      }),
      prisma.candidate.count({
        where: {
          electionId: ELECTION_ID,
          status: "REGISTERED",
          backgroundLastSyncedAt: { gte: freshSince },
          party: name,
        },
      }),
    ]);

    return reply.send({
      party: name,
      candidates,
      legislators,
      counts: {
        candidates: partyAggMatch,
        legislators: legislators.length,
      },
    });
  });
};

export default partyRoutes;

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

interface UnitParams { unitCode: string }
interface YearQuery { fiscalYear?: string }

/**
 * Sankey 데이터: 재원 출처 → 자치단체 → 분야.
 *
 * 시민 관점: "여주시 예산이 국비/도비/시비에서 얼마씩 들어와서 분야별로
 * 어떻게 분배되나" 흐름 시각화.
 */
interface TimelineQuery {
  from?: string;
  to?: string;
  topN?: string;
}

const powerMapRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/power-map/unit/:unitCode/timeline?from=2022&to=2026&topN=6
  // 분야별 연도별 집행 합계 — 4년 단체장 임기 변화 추이 시각화.
  fastify.get<{ Params: UnitParams; Querystring: TimelineQuery }>(
    "/unit/:unitCode/timeline",
    async (request, reply) => {
      const { unitCode } = request.params;
      const from = request.query.from
        ? parseInt(request.query.from, 10)
        : new Date().getUTCFullYear() - 4;
      const to = request.query.to
        ? parseInt(request.query.to, 10)
        : new Date().getUTCFullYear();
      const topN = Math.min(
        Math.max(parseInt(request.query.topN ?? "6", 10) || 6, 1),
        12,
      );

      const rows = await prisma.budgetExpense.groupBy({
        by: ["fiscalYear", "field"],
        where: {
          unitCode,
          fiscalYear: { gte: from, lte: to },
        },
        _sum: { spendAmount: true, budgetAmount: true },
      });

      // 상위 N개 분야 식별 (전체 기간 합계 기준).
      const fieldTotals = new Map<string, bigint>();
      for (const r of rows) {
        const cur = fieldTotals.get(r.field) ?? 0n;
        fieldTotals.set(r.field, cur + (r._sum.spendAmount ?? 0n));
      }
      const topFields = Array.from(fieldTotals.entries())
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .slice(0, topN)
        .map((e) => e[0]);

      // 연도별 시리즈 생성.
      const yearList: number[] = [];
      for (let y = from; y <= to; y++) yearList.push(y);
      const byKey = new Map<string, { spend: bigint; budget: bigint }>();
      for (const r of rows) {
        byKey.set(`${r.fiscalYear}|${r.field}`, {
          spend: r._sum.spendAmount ?? 0n,
          budget: r._sum.budgetAmount ?? 0n,
        });
      }
      const series = topFields.map((field) => ({
        id: field,
        data: yearList.map((y) => {
          const v = byKey.get(`${y}|${field}`);
          return {
            x: String(y),
            y: v ? Number(v.spend) : 0,
            budget: v ? v.budget.toString() : "0",
            spend: v ? v.spend.toString() : "0",
          };
        }),
      }));

      return reply.send({
        unitCode,
        from,
        to,
        series,
        availableYears: Array.from(
          new Set(rows.map((r) => r.fiscalYear)),
        ).sort(),
      });
    },
  );

  fastify.get<{ Params: UnitParams; Querystring: YearQuery }>(
    "/unit/:unitCode",
    async (request, reply) => {
      const { unitCode } = request.params;
      const fyParam = request.query.fiscalYear;
      let fiscalYear: number;
      if (fyParam && Number.isFinite(parseInt(fyParam, 10))) {
        fiscalYear = parseInt(fyParam, 10);
      } else {
        const latest = await prisma.budgetExpense.findFirst({
          where: { unitCode },
          select: { fiscalYear: true },
          orderBy: { fiscalYear: "desc" },
        });
        if (!latest) return reply.status(404).send({ error: "NO_DATA" });
        fiscalYear = latest.fiscalYear;
      }

      // 단체 unit 이름 + sido prefix 제거.
      const first = await prisma.budgetExpense.findFirst({
        where: { unitCode, fiscalYear },
        select: { unitName: true, sido: true },
      });
      if (!first) return reply.status(404).send({ error: "NO_DATA" });

      // 현 단체장 정보 — ElectedOfficialPledge에서 2022 지선 당선자 매칭.
      // sgTypecode: 3=시·도지사(unitCode 끝 6자리 0), 4=시·군·구청장.
      // unitCode 패턴: NN00000(광역 본청), NNXX000(시·군·구).
      const isMetroOnly = unitCode.endsWith("00000");
      const head = await prisma.electedOfficialPledge.findFirst({
        where: {
          electionId: "20220601",
          sgTypecode: isMetroOnly ? "3" : "4",
          sido: first.sido,
          // 광역은 wiwName 무관, 기초는 unitName으로 매칭.
          ...(isMetroOnly
            ? {}
            : { wiwName: { contains: first.unitName.replace(/^[가-힣]{2}/, "") } }),
        },
        select: { name: true, party: true, positionLabel: true },
      });

      // 분야별 재원 출처 합계 — groupBy field.
      const rows = await prisma.budgetExpense.groupBy({
        by: ["field"],
        where: { unitCode, fiscalYear },
        _sum: {
          natlFundAmt: true,
          sidoFundAmt: true,
          sggFundAmt: true,
          etcAmt: true,
          spendAmount: true,
        },
      });

      // 분야별 총액 desc 정렬 + 상위 N개만 (Sankey 가독성).
      const TOP_N = 10;
      const sortedFields = rows
        .map((r) => {
          const natl = Number(r._sum.natlFundAmt ?? 0n);
          const sido = Number(r._sum.sidoFundAmt ?? 0n);
          const sgg = Number(r._sum.sggFundAmt ?? 0n);
          const etc = Number(r._sum.etcAmt ?? 0n);
          const total = natl + sido + sgg + etc;
          return { field: r.field, natl, sido, sgg, etc, total };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);

      const topFields = sortedFields.slice(0, TOP_N);
      const otherFields = sortedFields.slice(TOP_N);
      const otherSum =
        otherFields.length > 0
          ? otherFields.reduce(
              (acc, r) => ({
                natl: acc.natl + r.natl,
                sido: acc.sido + r.sido,
                sgg: acc.sgg + r.sgg,
                etc: acc.etc + r.etc,
                total: acc.total + r.total,
              }),
              { natl: 0, sido: 0, sgg: 0, etc: 0, total: 0 },
            )
          : null;

      // 재원 출처 라벨 — 시민이 즉시 이해할 수 있게 단순화.
      const SRC_NATL = "국비 (중앙정부)";
      const SRC_SIDO = `도비 (${first.sido})`;
      const SRC_SGG = "시·군·구비";
      const SRC_ETC = "기타 재원";
      const UNIT = first.unitName; // "경기여주시" 등

      // Node 수집 (Sankey는 unique id 필요).
      const nodes: { id: string; category: "source" | "unit" | "field" }[] = [
        { id: SRC_NATL, category: "source" },
        { id: SRC_SIDO, category: "source" },
        { id: SRC_SGG, category: "source" },
        { id: SRC_ETC, category: "source" },
        { id: UNIT, category: "unit" },
      ];
      for (const f of topFields) {
        nodes.push({ id: f.field, category: "field" });
      }
      if (otherSum) nodes.push({ id: "기타 분야", category: "field" });

      // Link: 재원 → unit + unit → 분야.
      const allFields = otherSum
        ? [...topFields, { field: "기타 분야", ...otherSum }]
        : topFields;

      const totalNatl = allFields.reduce((s, f) => s + f.natl, 0);
      const totalSido = allFields.reduce((s, f) => s + f.sido, 0);
      const totalSgg = allFields.reduce((s, f) => s + f.sgg, 0);
      const totalEtc = allFields.reduce((s, f) => s + f.etc, 0);

      const links: { source: string; target: string; value: number }[] = [];
      if (totalNatl > 0) links.push({ source: SRC_NATL, target: UNIT, value: totalNatl });
      if (totalSido > 0) links.push({ source: SRC_SIDO, target: UNIT, value: totalSido });
      if (totalSgg > 0) links.push({ source: SRC_SGG, target: UNIT, value: totalSgg });
      if (totalEtc > 0) links.push({ source: SRC_ETC, target: UNIT, value: totalEtc });
      for (const f of allFields) {
        if (f.total > 0) {
          links.push({ source: UNIT, target: f.field, value: f.total });
        }
      }

      // 사용되지 않은 source 노드 제거 (Sankey 빈 노드 회피).
      const usedIds = new Set([
        ...links.map((l) => l.source),
        ...links.map((l) => l.target),
      ]);
      const filteredNodes = nodes.filter((n) => usedIds.has(n.id));

      const totalAll = totalNatl + totalSido + totalSgg + totalEtc;
      return reply.send({
        fiscalYear,
        unitCode,
        unitName: UNIT,
        sido: first.sido,
        currentHead: head
          ? { name: head.name, party: head.party, label: head.positionLabel }
          : null,
        totalAmount: totalAll.toString(),
        sourceBreakdown: {
          natl: totalNatl.toString(),
          sido: totalSido.toString(),
          sgg: totalSgg.toString(),
          etc: totalEtc.toString(),
        },
        nodes: filteredNodes,
        links,
      });
    },
  );
};

export default powerMapRoutes;

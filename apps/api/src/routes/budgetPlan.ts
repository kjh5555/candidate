import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

interface UnitParams {
  unitCode: string;
}
interface YearQuery {
  fiscalYear?: string;
}

// 분야별 본예산 합 (정책사업 + 재무활동 + 행정운영). LOFIN AIDFA 기반.
async function fetchUnitBudgetPlan(unitCode: string, fiscalYear: number) {
  const rows = await prisma.budgetPlan.findMany({
    where: { unitCode, fiscalYear },
    select: {
      field: true,
      bizBdgTotalAmt: true,
      finActTotalAmt: true,
      admOperTotalAmt: true,
      unitName: true,
    },
  });
  if (rows.length === 0) return null;
  const byField = new Map<string, bigint>();
  let total = 0n;
  for (const r of rows) {
    const amt =
      r.bizBdgTotalAmt +
      (r.finActTotalAmt ?? 0n) +
      (r.admOperTotalAmt ?? 0n);
    byField.set(r.field, (byField.get(r.field) ?? 0n) + amt);
    total += amt;
  }
  const items = Array.from(byField.entries())
    .map(([field, amount]) => ({
      field,
      amount: amount.toString(),
      percent:
        total === 0n
          ? 0
          : Math.round((Number((amount * 10000n) / total) / 100) * 100) / 100,
    }))
    .sort((a, b) => {
      const av = BigInt(a.amount);
      const bv = BigInt(b.amount);
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
  return {
    fiscalYear,
    unitCode,
    unitName: rows[0]!.unitName,
    totalAmount: total.toString(),
    items,
  };
}

const budgetPlanRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/budget-plan/unit/:unitCode?fiscalYear=YYYY
  // fiscalYear 미지정 시 가장 최근에 끝난 회계연도(=오늘 연도-1) 우선, 없으면 latest.
  fastify.get<{ Params: UnitParams; Querystring: YearQuery }>(
    "/unit/:unitCode",
    async (request, reply) => {
      const { unitCode } = request.params;
      const requestedFy = request.query.fiscalYear
        ? parseInt(request.query.fiscalYear, 10)
        : null;
      let fiscalYear: number;
      if (requestedFy && Number.isFinite(requestedFy)) {
        fiscalYear = requestedFy;
      } else {
        const preferred = new Date().getUTCFullYear() - 1;
        const exact = await prisma.budgetPlan.findFirst({
          where: { unitCode, fiscalYear: preferred },
          select: { fiscalYear: true },
        });
        if (exact) {
          fiscalYear = preferred;
        } else {
          const latest = await prisma.budgetPlan.findFirst({
            where: { unitCode },
            select: { fiscalYear: true },
            orderBy: { fiscalYear: "desc" },
          });
          if (!latest) return reply.status(404).send({ error: "NO_DATA" });
          fiscalYear = latest.fiscalYear;
        }
      }
      const data = await fetchUnitBudgetPlan(unitCode, fiscalYear);
      if (!data) return reply.status(404).send({ error: "NO_DATA" });
      return reply.send(data);
    },
  );

  // GET /api/budget-plan/unit/:unitCode/years — 어떤 연도들이 있는지.
  fastify.get<{ Params: UnitParams }>(
    "/unit/:unitCode/years",
    async (request, reply) => {
      const { unitCode } = request.params;
      const rows = await prisma.budgetPlan.findMany({
        where: { unitCode },
        select: { fiscalYear: true },
        distinct: ["fiscalYear"],
        orderBy: { fiscalYear: "desc" },
      });
      return reply.send({ years: rows.map((r) => r.fiscalYear) });
    },
  );
};

export default budgetPlanRoutes;

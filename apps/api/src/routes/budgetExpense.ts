import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

interface UnitParams { unitCode: string }
interface UnitQuery {
  fiscalYear?: string;
  field?: string;     // 분야명으로 필터 (분야별 드릴다운)
  sector?: string;    // 부문명으로 필터
  limit?: string;     // 상위 N (기본 50)
  sortBy?: "spend" | "budget";
}

type Row = {
  detailBizCode: string;
  detailBizName: string;
  field: string;
  fieldCode: string;
  sector: string | null;
  sectorCode: string | null;
  accountType: string | null;
  budgetAmount: bigint;
  spendAmount: bigint;
  natlFundAmt: bigint | null;
  sidoFundAmt: bigint | null;
  sggFundAmt: bigint | null;
  etcAmt: bigint | null;
};

function serializeRow(r: Row) {
  const exec =
    r.budgetAmount > 0n
      ? Math.round((Number(r.spendAmount) * 1000) / Number(r.budgetAmount)) / 10
      : null;
  return {
    detailBizCode: r.detailBizCode,
    detailBizName: r.detailBizName,
    field: r.field,
    fieldCode: r.fieldCode,
    sector: r.sector,
    sectorCode: r.sectorCode,
    accountType: r.accountType,
    budgetAmount: r.budgetAmount.toString(),
    spendAmount: r.spendAmount.toString(),
    natlFundAmt: r.natlFundAmt?.toString() ?? null,
    sidoFundAmt: r.sidoFundAmt?.toString() ?? null,
    sggFundAmt: r.sggFundAmt?.toString() ?? null,
    etcAmt: r.etcAmt?.toString() ?? null,
    executionRate: exec,
  };
}

const budgetExpenseRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/budget-expense/unit/:unitCode?fiscalYear=YYYY&field=&sector=&limit=&sortBy=
  fastify.get<{ Params: UnitParams; Querystring: UnitQuery }>(
    "/unit/:unitCode",
    async (request, reply) => {
      const { unitCode } = request.params;
      const { field, sector, limit, sortBy } = request.query;
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
      const take = Math.min(Math.max(parseInt(limit ?? "50", 10) || 50, 1), 200);
      const order = sortBy === "budget"
        ? [{ budgetAmount: "desc" as const }]
        : [{ spendAmount: "desc" as const }];

      const rows = await prisma.budgetExpense.findMany({
        where: {
          unitCode,
          fiscalYear,
          ...(field ? { field } : {}),
          ...(sector ? { sector } : {}),
        },
        orderBy: order,
        take,
        select: {
          detailBizCode: true, detailBizName: true,
          field: true, fieldCode: true, sector: true, sectorCode: true,
          accountType: true,
          budgetAmount: true, spendAmount: true,
          natlFundAmt: true, sidoFundAmt: true, sggFundAmt: true, etcAmt: true,
        },
      });
      return reply.send({ fiscalYear, unitCode, items: rows.map(serializeRow) });
    },
  );

  // GET /api/budget-expense/unit/:unitCode/years
  fastify.get<{ Params: UnitParams }>(
    "/unit/:unitCode/years",
    async (request, reply) => {
      const rows = await prisma.budgetExpense.findMany({
        where: { unitCode: request.params.unitCode },
        select: { fiscalYear: true },
        distinct: ["fiscalYear"],
        orderBy: { fiscalYear: "desc" },
      });
      return reply.send({ years: rows.map((r) => r.fiscalYear) });
    },
  );

  // GET /api/budget-expense/unit/:unitCode/sectors?fiscalYear=&field=
  // 분야 안의 부문(sector) 리스트 + 부문별 집행 합계.
  fastify.get<{ Params: UnitParams; Querystring: { fiscalYear?: string; field?: string } }>(
    "/unit/:unitCode/sectors",
    async (request, reply) => {
      const { unitCode } = request.params;
      const { field } = request.query;
      const fyParam = request.query.fiscalYear;
      const fiscalYear =
        fyParam && Number.isFinite(parseInt(fyParam, 10))
          ? parseInt(fyParam, 10)
          : (await prisma.budgetExpense.findFirst({
              where: { unitCode },
              select: { fiscalYear: true },
              orderBy: { fiscalYear: "desc" },
            }))?.fiscalYear;
      if (!fiscalYear) return reply.status(404).send({ error: "NO_DATA" });
      const rows = await prisma.budgetExpense.groupBy({
        by: ["sector"],
        where: { unitCode, fiscalYear, ...(field ? { field } : {}) },
        _sum: { budgetAmount: true, spendAmount: true },
      });
      const items = rows
        .filter((r) => r.sector !== null)
        .map((r) => ({
          sector: r.sector,
          budgetAmount: (r._sum.budgetAmount ?? 0n).toString(),
          spendAmount: (r._sum.spendAmount ?? 0n).toString(),
          executionRate:
            (r._sum.budgetAmount ?? 0n) > 0n
              ? Math.round(
                  (Number(r._sum.spendAmount ?? 0n) * 1000) /
                    Number(r._sum.budgetAmount ?? 1n),
                ) / 10
              : null,
        }))
        .sort((a, b) => {
          const av = BigInt(a.spendAmount);
          const bv = BigInt(b.spendAmount);
          return av < bv ? 1 : av > bv ? -1 : 0;
        });
      return reply.send({ fiscalYear, unitCode, field: field ?? null, items });
    },
  );
};

export default budgetExpenseRoutes;

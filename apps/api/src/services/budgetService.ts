import type {
  BudgetBreakdownDTO,
  BudgetItemDTO,
  BudgetLevel,
} from "@repo/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function bigintAdd(a: bigint, b: bigint): bigint {
  return a + b;
}

function buildItems(
  rows: Array<{ groupValue: string; totalAmount: bigint }>,
  totalAmount: bigint,
  keyTransform?: (groupValue: string) => string,
): BudgetItemDTO[] {
  const totalNum = Number(totalAmount);
  return rows.map((row) => {
    const key = keyTransform ? keyTransform(row.groupValue) : row.groupValue;
    const amount = row.totalAmount;
    const percent =
      totalAmount > 0n ? (Number(amount) * 100) / totalNum : 0;
    return {
      key,
      amount: amount.toString(),
      percent: Math.round(percent * 100) / 100, // 2 decimals
    };
  });
}

function sortItemsDesc(items: BudgetItemDTO[]): BudgetItemDTO[] {
  return [...items].sort((a, b) => {
    const ab = BigInt(a.amount);
    const bb = BigInt(b.amount);
    if (ab > bb) return -1;
    if (ab < bb) return 1;
    return 0;
  });
}

async function fetchGroup(
  level: BudgetLevel,
  fiscalYear: number,
  groupKey: string,
): Promise<{ rows: Array<{ groupValue: string; totalAmount: bigint }>; total: bigint }> {
  const rows = await prisma.budgetSummary.findMany({
    where: { level, fiscalYear, groupKey },
    select: { groupValue: true, totalAmount: true },
  });
  const total = rows.reduce<bigint>(
    (acc, r) => bigintAdd(acc, r.totalAmount),
    0n,
  );
  return { rows, total };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getNationalBudgetByField(
  fiscalYear: number,
): Promise<BudgetBreakdownDTO> {
  const { rows, total } = await fetchGroup("NATIONAL", fiscalYear, "field");
  const items = sortItemsDesc(buildItems(rows, total));
  return {
    fiscalYear,
    level: "NATIONAL",
    groupBy: "field",
    items,
    totalAmount: total.toString(),
  };
}

export async function getNationalBudgetByMinistry(
  fiscalYear: number,
): Promise<BudgetBreakdownDTO> {
  const { rows, total } = await fetchGroup(
    "NATIONAL",
    fiscalYear,
    "ministry",
  );
  const items = sortItemsDesc(buildItems(rows, total));
  return {
    fiscalYear,
    level: "NATIONAL",
    groupBy: "ministry",
    items,
    totalAmount: total.toString(),
  };
}

export async function getNationalBudgetByMinistryAndField(
  fiscalYear: number,
  ministry: string,
): Promise<BudgetBreakdownDTO> {
  // ministry-field summary keys are "${ministry}|${field}". Filter by prefix.
  const prefix = `${ministry}|`;
  const rows = await prisma.budgetSummary.findMany({
    where: {
      level: "NATIONAL",
      fiscalYear,
      groupKey: "ministry-field",
      groupValue: { startsWith: prefix },
    },
    select: { groupValue: true, totalAmount: true },
  });
  const total = rows.reduce<bigint>(
    (acc, r) => bigintAdd(acc, r.totalAmount),
    0n,
  );
  // Strip the "ministry|" prefix from the displayed key.
  const items = sortItemsDesc(
    buildItems(rows, total, (g) =>
      g.startsWith(prefix) ? g.slice(prefix.length) : g,
    ),
  );
  return {
    fiscalYear,
    level: "NATIONAL",
    groupBy: "ministry-field",
    items,
    totalAmount: total.toString(),
  };
}

export async function getMetropolitanBudgetBySido(
  fiscalYear: number,
): Promise<BudgetBreakdownDTO> {
  const { rows, total } = await fetchGroup(
    "METROPOLITAN",
    fiscalYear,
    "sido",
  );
  const items = sortItemsDesc(buildItems(rows, total));
  return {
    fiscalYear,
    level: "METROPOLITAN",
    groupBy: "sido",
    items,
    totalAmount: total.toString(),
  };
}

export async function getMetropolitanBudgetByField(
  fiscalYear: number,
  sido: string,
): Promise<BudgetBreakdownDTO> {
  const prefix = `${sido}|`;
  const rows = await prisma.budgetSummary.findMany({
    where: {
      level: "METROPOLITAN",
      fiscalYear,
      groupKey: "sido-field",
      groupValue: { startsWith: prefix },
    },
    select: { groupValue: true, totalAmount: true },
  });
  const total = rows.reduce<bigint>(
    (acc, r) => bigintAdd(acc, r.totalAmount),
    0n,
  );
  const items = sortItemsDesc(
    buildItems(rows, total, (g) =>
      g.startsWith(prefix) ? g.slice(prefix.length) : g,
    ),
  );
  return {
    fiscalYear,
    level: "METROPOLITAN",
    groupBy: "sido-field",
    items,
    totalAmount: total.toString(),
  };
}

export async function getAvailableYears(
  level: BudgetLevel,
): Promise<number[]> {
  const rows = await prisma.budgetSummary.findMany({
    where: { level },
    select: { fiscalYear: true },
    distinct: ["fiscalYear"],
    orderBy: { fiscalYear: "desc" },
  });
  return rows.map((r) => r.fiscalYear);
}

// Suppress unused-import warning for Prisma in case Prisma helpers are added
// later. (Currently kept for forward compatibility.)
const _ensurePrisma: typeof Prisma = Prisma;
void _ensurePrisma;

import type {
  SettlementBreakdownDTO,
  SettlementItemDTO,
  SettlementLevel,
  SettlementUnitDTO,
} from "@repo/shared";
import { prisma } from "../db.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function buildItems(
  rows: Array<{ groupValue: string; totalAmount: bigint }>,
  totalAmount: bigint,
  splitKeyLabel?: (groupValue: string) => { key: string; label?: string },
): SettlementItemDTO[] {
  const totalNum = Number(totalAmount);
  return rows.map((row) => {
    const split = splitKeyLabel
      ? splitKeyLabel(row.groupValue)
      : { key: row.groupValue };
    const amount = row.totalAmount;
    const percent =
      totalAmount > 0n ? (Number(amount) * 100) / totalNum : 0;
    return {
      key: split.key,
      ...(split.label !== undefined ? { label: split.label } : {}),
      amount: amount.toString(),
      percent: Math.round(percent * 100) / 100,
    };
  });
}

function sortItemsDesc(items: SettlementItemDTO[]): SettlementItemDTO[] {
  return [...items].sort((a, b) => {
    const ab = BigInt(a.amount);
    const bb = BigInt(b.amount);
    if (ab > bb) return -1;
    if (ab < bb) return 1;
    return 0;
  });
}

function sumAmounts(
  rows: Array<{ totalAmount: bigint }>,
): bigint {
  return rows.reduce<bigint>((acc, r) => acc + r.totalAmount, 0n);
}

// ── Public API ────────────────────────────────────────────────────────────

// 분야별 결산 (per-level). Optionally restrict to a single level.
export async function getSettlementByField(
  fiscalYear: number,
  level: SettlementLevel,
): Promise<SettlementBreakdownDTO> {
  const rows = await prisma.settlementSummary.findMany({
    where: { fiscalYear, level, groupKey: "field" },
    select: { groupValue: true, totalAmount: true },
  });
  const total = sumAmounts(rows);
  const items = sortItemsDesc(buildItems(rows, total));
  return {
    fiscalYear,
    level,
    groupBy: "field",
    items,
    totalAmount: total.toString(),
  };
}

// 시·도별 결산 (광역단체 본청 기준).
export async function getSettlementBySido(
  fiscalYear: number,
): Promise<SettlementBreakdownDTO> {
  const rows = await prisma.settlementSummary.findMany({
    where: { fiscalYear, level: "METROPOLITAN", groupKey: "sido" },
    select: { groupValue: true, totalAmount: true },
  });
  const total = sumAmounts(rows);
  const items = sortItemsDesc(buildItems(rows, total));
  return {
    fiscalYear,
    level: "METROPOLITAN",
    groupBy: "sido",
    items,
    totalAmount: total.toString(),
  };
}

// 단일 시·도의 분야별 결산 (광역 본청).
export async function getSettlementBySidoDetail(
  fiscalYear: number,
  sido: string,
): Promise<SettlementBreakdownDTO> {
  const prefix = `${sido}|`;
  const rows = await prisma.settlementSummary.findMany({
    where: {
      fiscalYear,
      level: "METROPOLITAN",
      groupKey: "sido-field",
      groupValue: { startsWith: prefix },
    },
    select: { groupValue: true, totalAmount: true },
  });
  const total = sumAmounts(rows);
  const items = sortItemsDesc(
    buildItems(rows, total, (g) => ({
      key: g.startsWith(prefix) ? g.slice(prefix.length) : g,
    })),
  );
  return {
    fiscalYear,
    level: "METROPOLITAN",
    groupBy: "sido-field",
    scope: sido,
    items,
    totalAmount: total.toString(),
  };
}

// 단일 자치단체 (시·군·구 OR 본청) 분야별 결산.
// Level is inferred from the stored data via the unit-field rollup.
export async function getSettlementByUnitDetail(
  fiscalYear: number,
  unitCode: string,
): Promise<SettlementBreakdownDTO> {
  const prefix = `${unitCode}|`;
  const rows = await prisma.settlementSummary.findMany({
    where: {
      fiscalYear,
      groupKey: "unit-field",
      groupValue: { startsWith: prefix },
    },
    select: { groupValue: true, totalAmount: true, level: true },
  });
  // Determine level from any row (all rows for a given unitCode share the level).
  const level: SettlementLevel = rows[0]?.level ?? "BASIC";
  const total = sumAmounts(rows);
  const items = sortItemsDesc(
    buildItems(rows, total, (g) => ({
      key: g.startsWith(prefix) ? g.slice(prefix.length) : g,
    })),
  );
  return {
    fiscalYear,
    level,
    groupBy: "unit-field",
    scope: unitCode,
    items,
    totalAmount: total.toString(),
  };
}

// 자치단체 목록 (UI dropdown 용).
// Optionally filter by sido. Returns unique unit (code, name, sido, level, total).
export async function getSettlementUnits(
  fiscalYear: number,
  sido?: string,
): Promise<SettlementUnitDTO[]> {
  // Use BudgetSettlement directly: distinct on (unitCode) is awkward in Prisma,
  // so we query and aggregate.
  const where: { fiscalYear: number; sido?: string } = { fiscalYear };
  if (sido) where.sido = sido;
  const rows = await prisma.budgetSettlement.findMany({
    where,
    select: {
      unitCode: true,
      unitName: true,
      sido: true,
      level: true,
      amount: true,
    },
  });

  // Aggregate by unitCode
  const map = new Map<
    string,
    {
      unitCode: string;
      unitName: string;
      sido: string;
      level: SettlementLevel;
      total: bigint;
    }
  >();
  for (const r of rows) {
    const existing = map.get(r.unitCode);
    if (existing) {
      existing.total += r.amount;
    } else {
      map.set(r.unitCode, {
        unitCode: r.unitCode,
        unitName: r.unitName,
        sido: r.sido,
        level: r.level as SettlementLevel,
        total: r.amount,
      });
    }
  }
  const units = Array.from(map.values()).map<SettlementUnitDTO>((u) => ({
    unitCode: u.unitCode,
    unitName: u.unitName,
    sido: u.sido,
    level: u.level,
    totalAmount: u.total.toString(),
  }));

  // Sort: 본청 first, then 기초 by name
  units.sort((a, b) => {
    if (a.level !== b.level) {
      return a.level === "METROPOLITAN" ? -1 : 1;
    }
    return a.unitName.localeCompare(b.unitName, "ko");
  });
  return units;
}

export async function getAvailableSettlementYears(): Promise<number[]> {
  const rows = await prisma.settlementSummary.findMany({
    select: { fiscalYear: true },
    distinct: ["fiscalYear"],
    orderBy: { fiscalYear: "desc" },
  });
  return rows.map((r) => r.fiscalYear);
}

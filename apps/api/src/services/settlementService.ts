import type {
  SettlementBreakdownDTO,
  SettlementFieldDetailDTO,
  SettlementFieldDetailItemDTO,
  SettlementItemDTO,
  SettlementLevel,
  SettlementReportDTO,
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

// 시·도별 결산 — 광역 본청 + 기초 자치단체 합산 (시·도 전체 살림 기준).
// (METROPOLITAN만 쓰면 자치구 없는 제주가 25 자치구를 가진 서울과 비교돼 비대칭)
export async function getSettlementBySido(
  fiscalYear: number,
): Promise<SettlementBreakdownDTO> {
  const rows = await prisma.settlementSummary.findMany({
    where: { fiscalYear, groupKey: "sido" }, // both METROPOLITAN + BASIC
    select: { groupValue: true, totalAmount: true },
  });
  // 같은 sido에 METRO/BASIC 두 합계가 있으므로 sido별로 합산
  const bySido = new Map<string, bigint>();
  for (const r of rows) {
    bySido.set(r.groupValue, (bySido.get(r.groupValue) ?? 0n) + r.totalAmount);
  }
  const aggregated = Array.from(bySido, ([groupValue, totalAmount]) => ({
    groupValue,
    totalAmount,
  }));
  const total = sumAmounts(aggregated);
  const items = sortItemsDesc(buildItems(aggregated, total));
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

// ── Sector drill-down helpers ─────────────────────────────────────────────

function buildFieldDetailItems(
  rows: Array<{ sector: string | null; totalAmount: bigint }>,
  totalAmount: bigint,
): SettlementFieldDetailItemDTO[] {
  const totalNum = Number(totalAmount);
  return rows.map((row) => {
    const sector = row.sector ?? "(미분류)";
    const percent =
      totalAmount > 0n ? (Number(row.totalAmount) * 100) / totalNum : 0;
    return {
      sector,
      amount: row.totalAmount.toString(),
      percent: Math.round(percent * 100) / 100,
    };
  });
}

// Aggregate GGNSE structure fields across rows (deduped per row.id since the
// same triple appears on every sector row for a given (unit, field)).
async function aggregateStructure(where: {
  fiscalYear: number;
  unitCode?: string;
  sido?: string;
  field: string;
  level?: SettlementLevel;
}): Promise<{ policy: bigint; finance: bigint; admin: bigint; hasAny: boolean }> {
  const rows = await prisma.budgetSettlement.findMany({
    where,
    select: {
      unitCode: true,
      policyBizManwon: true,
      financeActivityManwon: true,
      adminOperManwon: true,
    },
  });
  // GGNSE is unique per (unit, field) — but BudgetSettlement is per-sector.
  // Dedupe by unitCode and pick the first non-null triple.
  const seen = new Map<
    string,
    { policy: bigint | null; finance: bigint | null; admin: bigint | null }
  >();
  for (const r of rows) {
    if (
      r.policyBizManwon === null &&
      r.financeActivityManwon === null &&
      r.adminOperManwon === null
    ) {
      continue;
    }
    if (!seen.has(r.unitCode)) {
      seen.set(r.unitCode, {
        policy: r.policyBizManwon,
        finance: r.financeActivityManwon,
        admin: r.adminOperManwon,
      });
    }
  }
  let policy = 0n;
  let finance = 0n;
  let admin = 0n;
  let hasAny = false;
  for (const v of seen.values()) {
    if (v.policy !== null) {
      policy += v.policy;
      hasAny = true;
    }
    if (v.finance !== null) {
      finance += v.finance;
      hasAny = true;
    }
    if (v.admin !== null) {
      admin += v.admin;
      hasAny = true;
    }
  }
  return { policy, finance, admin, hasAny };
}

// 단일 자치단체의 특정 분야 → 부문별 결산
export async function getSettlementByFieldDetail(
  fiscalYear: number,
  unitCode: string,
  field: string,
): Promise<SettlementFieldDetailDTO> {
  const rawRows = await prisma.budgetSettlement.groupBy({
    by: ["sector"],
    where: { fiscalYear, unitCode, field },
    _sum: { amount: true },
  });
  const rows = rawRows.map((r) => ({
    sector: r.sector,
    totalAmount: r._sum.amount ?? 0n,
  }));
  rows.sort((a, b) => (a.totalAmount > b.totalAmount ? -1 : a.totalAmount < b.totalAmount ? 1 : 0));
  const total = rows.reduce<bigint>((acc, r) => acc + r.totalAmount, 0n);

  // Determine level from any matching row
  const sample = await prisma.budgetSettlement.findFirst({
    where: { fiscalYear, unitCode, field },
    select: { level: true, sido: true },
  });
  const level: SettlementLevel = (sample?.level as SettlementLevel) ?? "BASIC";

  const struct = await aggregateStructure({ fiscalYear, unitCode, field });

  return {
    fiscalYear,
    level,
    unitCode,
    field,
    items: buildFieldDetailItems(rows, total),
    totalAmount: total.toString(),
    ...(struct.hasAny
      ? {
          policyBizAmount: struct.policy.toString(),
          financeActivityAmount: struct.finance.toString(),
          adminOperAmount: struct.admin.toString(),
        }
      : {}),
  };
}

// 시·도 본청 레벨: 특정 분야 → 부문별 결산 (해당 sido의 모든 레코드 집계)
export async function getSettlementSidoFieldDetail(
  fiscalYear: number,
  sido: string,
  field: string,
): Promise<SettlementFieldDetailDTO> {
  const rawRows = await prisma.budgetSettlement.groupBy({
    by: ["sector"],
    where: { fiscalYear, sido, field, level: "METROPOLITAN" },
    _sum: { amount: true },
  });
  const rows = rawRows.map((r) => ({
    sector: r.sector,
    totalAmount: r._sum.amount ?? 0n,
  }));
  rows.sort((a, b) => (a.totalAmount > b.totalAmount ? -1 : a.totalAmount < b.totalAmount ? 1 : 0));
  const total = rows.reduce<bigint>((acc, r) => acc + r.totalAmount, 0n);

  // Structure: aggregate across ALL units in the sido (both METROPOLITAN
  // and BASIC) per spec "if only sido selected, sum across all units in sido".
  const struct = await aggregateStructure({
    fiscalYear,
    sido,
    field,
  });

  return {
    fiscalYear,
    level: "METROPOLITAN",
    sido,
    field,
    items: buildFieldDetailItems(rows, total),
    totalAmount: total.toString(),
    ...(struct.hasAny
      ? {
          policyBizAmount: struct.policy.toString(),
          financeActivityAmount: struct.finance.toString(),
          adminOperAmount: struct.admin.toString(),
        }
      : {}),
  };
}

// 결산서 PDF 링크 조회 (lofin365 SETLK)
export async function getSettlementReport(
  fiscalYear: number,
  unitCode: string,
): Promise<SettlementReportDTO | null> {
  const row = await prisma.settlementReport.findUnique({
    where: { fiscalYear_unitCode: { fiscalYear, unitCode } },
  });
  if (!row) return null;
  return {
    fiscalYear: row.fiscalYear,
    unitCode: row.unitCode,
    unitName: row.unitName,
    sido: row.sido,
    reportUrl: row.reportUrl,
    reportName: row.reportName,
  };
}

// Ingest 예산 정보 from two data.go.kr endpoints:
//
//   NATIONAL — 기획재정부 세부사업 예산편성 (data.go.kr 15076058)
//   METROPOLITAN — 지방재정365 기능별 단체별 세출 (data.go.kr 15058011)
//
// IMPORTANT: At the time this code was written, the user had just applied for
// both API keys and they had not yet activated (30 min ~ 2 h activation lag at
// data.go.kr). Exact endpoint URLs and field names below are BEST-GUESS based
// on the standard data.go.kr `apis.data.go.kr/<provider-id>/<service>/<method>`
// pattern. They MUST be re-verified once keys are live. Each unverified piece
// is tagged with `TODO: confirm endpoint URL` comments.
//
// Defensive parsing:
//   - We accept arbitrary field names in the response rows and try multiple
//     candidate keys (e.g. "fldNm", "fldName", "field").
//   - Unknown shapes are logged but do not throw.
//   - Empty / Unauthorized responses are caught and turned into no-ops with
//     warnings.

import type { Prisma } from "@prisma/client";
import { BudgetLevel, Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

// ── Endpoint configuration (CONFIRM AT RUNTIME) ───────────────────────────

// TODO: confirm endpoint URL — 기획재정부 세부사업 예산편성 (15076058).
// data.go.kr listing references "openfiscaldata.go.kr" as the canonical host;
// the apis.data.go.kr proxy is assumed under provider 1051000 (기획재정부).
const NATIONAL_BUDGET_BASE_URL = "http://apis.data.go.kr/1051000";
const NATIONAL_BUDGET_SERVICE = "UOPKOSDA01"; // TODO: confirm endpoint URL
const NATIONAL_BUDGET_METHOD = "getUOPKOSDA01"; // TODO: confirm endpoint URL

// TODO: confirm endpoint URL — 지방재정365 기능별 단체별 세출 (15058011).
// Provider ID 1741000 is행정안전부 / 지방재정365. Service name is best-guess.
const METRO_BUDGET_BASE_URL = "http://apis.data.go.kr/1741000";
const METRO_BUDGET_SERVICE = "LocalFinanceFunctionExp"; // TODO: confirm endpoint URL
const METRO_BUDGET_METHOD = "getLocalFinanceFunctionExp"; // TODO: confirm endpoint URL

// ── Defensive raw row shapes ──────────────────────────────────────────────

interface NationalBudgetRow {
  // Candidates seen across various 기획재정부 OpenAPI flavors:
  fyr?: string | number; // 회계연도
  fy?: string | number;
  fiscalYear?: string | number;
  acntYr?: string | number;
  mnstNm?: string; // 부처명
  mnstryNm?: string;
  ministry?: string;
  fldNm?: string; // 분야
  fldName?: string;
  field?: string;
  sectNm?: string; // 부문
  sectName?: string;
  sector?: string;
  prgmNm?: string; // 프로그램
  prgmName?: string;
  program?: string;
  prjNm?: string; // 세부사업
  prjName?: string;
  subProject?: string;
  amt?: string | number; // 예산액
  amount?: string | number;
  budgAmt?: string | number;
  prjAmt?: string | number;
}

interface MetroBudgetRow {
  fyr?: string | number;
  fiscalYear?: string | number;
  actrYr?: string | number;
  laAdNm?: string; // 자치단체명 / 시·도
  sidoNm?: string;
  sido?: string;
  fnctnCdNm?: string; // 분야 (기능별)
  fnctnNm?: string;
  field?: string;
  budgAmt?: string | number; // 세출 예산
  amt?: string | number;
  amount?: string | number;
  expnAmt?: string | number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function firstNonEmpty(...values: Array<string | number | undefined | null>): string | null {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const t = String(v).trim();
    if (t !== "") return t;
  }
  return null;
}

function pickAmount(...values: Array<string | number | undefined | null>): bigint {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      try {
        return BigInt(Math.trunc(v));
      } catch {
        // fall through
      }
    }
    const t = String(v).trim().replace(/[, ]+/g, "");
    if (t === "") continue;
    if (!/^-?\d+(\.\d+)?$/.test(t)) continue;
    try {
      // Strip decimals, treat amounts as whole 원.
      const intPart = t.split(".")[0]!;
      return BigInt(intPart);
    } catch {
      continue;
    }
  }
  return 0n;
}

function pickYear(...values: Array<string | number | undefined | null>): number | null {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const t = String(v).trim();
    if (t === "") continue;
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n >= 1900 && n <= 9999) return n;
  }
  return null;
}

function resolveServiceKey(): string | undefined {
  const fiscal = process.env.FISCAL_API_KEY;
  if (fiscal && fiscal.trim() !== "") return fiscal;
  return process.env.NEC_API_KEY;
}

// ── National budget ingestion ─────────────────────────────────────────────

interface IngestStats {
  total: number;
  inserted: number;
}

async function deleteExistingCategories(
  level: BudgetLevel,
  fiscalYear: number,
): Promise<void> {
  await prisma.budgetCategory.deleteMany({
    where: { level, fiscalYear },
  });
  await prisma.budgetSummary.deleteMany({
    where: { level, fiscalYear },
  });
}

async function upsertSummary(
  level: BudgetLevel,
  fiscalYear: number,
  groupKey: string,
  groupValue: string,
  totalAmount: bigint,
): Promise<void> {
  await prisma.budgetSummary.upsert({
    where: {
      level_fiscalYear_groupKey_groupValue: {
        level,
        fiscalYear,
        groupKey,
        groupValue,
      },
    },
    create: { level, fiscalYear, groupKey, groupValue, totalAmount },
    update: { totalAmount },
  });
}

export async function ingestNationalBudget(
  fiscalYear: number,
): Promise<IngestStats> {
  console.log(
    `[budget-national] Starting ingest for fiscalYear=${fiscalYear}.`,
  );

  const serviceKey = resolveServiceKey();
  if (!serviceKey) {
    console.warn(
      "[budget-national] No FISCAL_API_KEY or NEC_API_KEY set. Skipping.",
    );
    return { total: 0, inserted: 0 };
  }

  let rows: NationalBudgetRow[] = [];
  try {
    rows = await fetchAllNecPages<NationalBudgetRow>(
      NATIONAL_BUDGET_SERVICE,
      NATIONAL_BUDGET_METHOD,
      {
        // TODO: confirm endpoint URL — official param name may be FY, acntYr,
        // or fyr depending on the service.
        FY: String(fiscalYear),
        fiscalYear: String(fiscalYear),
        acntYr: String(fiscalYear),
      },
      {
        baseUrl: NATIONAL_BUDGET_BASE_URL,
        serviceKey,
      },
    );
  } catch (err) {
    console.error(
      `[budget-national] Fetch failed (likely endpoint not yet active or key not yet enabled): ${(err as Error).message}`,
    );
    return { total: 0, inserted: 0 };
  }

  console.log(`[budget-national] Got ${rows.length} rows.`);

  // Reset rows for this fiscalYear to keep upsert semantics simple.
  await deleteExistingCategories("NATIONAL", fiscalYear);

  // Accumulators for summary rollups.
  const byMinistry = new Map<string, bigint>();
  const byField = new Map<string, bigint>();
  const byMinistryField = new Map<string, bigint>();

  let inserted = 0;
  for (const row of rows) {
    const rowYear =
      pickYear(row.fyr, row.fy, row.fiscalYear, row.acntYr) ?? fiscalYear;
    const ministry = firstNonEmpty(row.mnstNm, row.mnstryNm, row.ministry);
    const field = firstNonEmpty(row.fldNm, row.fldName, row.field);
    const sector = firstNonEmpty(row.sectNm, row.sectName, row.sector);
    const program = firstNonEmpty(row.prgmNm, row.prgmName, row.program);
    const subProject = firstNonEmpty(row.prjNm, row.prjName, row.subProject);
    const amount = pickAmount(row.amt, row.amount, row.budgAmt, row.prjAmt);

    if (!field) {
      // 분야 is required for our schema. Log and skip otherwise.
      console.warn(
        "[budget-national] Skipping row with no 분야:",
        JSON.stringify(row).slice(0, 200),
      );
      continue;
    }

    try {
      await prisma.budgetCategory.create({
        data: {
          level: "NATIONAL",
          fiscalYear: rowYear,
          ministry,
          sido: null,
          field,
          sector,
          program,
          subProject,
          amount,
          // rawSourceJson not in schema; if needed, add a Json column later.
        } as Prisma.BudgetCategoryUncheckedCreateInput,
      });
      inserted += 1;
    } catch (err) {
      console.error("[budget-national] Insert failed:", err);
      continue;
    }

    if (ministry) {
      byMinistry.set(ministry, (byMinistry.get(ministry) ?? 0n) + amount);
      const key = `${ministry}|${field}`;
      byMinistryField.set(key, (byMinistryField.get(key) ?? 0n) + amount);
    }
    byField.set(field, (byField.get(field) ?? 0n) + amount);
  }

  // Persist rollups.
  for (const [ministry, total] of byMinistry) {
    await upsertSummary("NATIONAL", fiscalYear, "ministry", ministry, total);
  }
  for (const [field, total] of byField) {
    await upsertSummary("NATIONAL", fiscalYear, "field", field, total);
  }
  for (const [key, total] of byMinistryField) {
    await upsertSummary("NATIONAL", fiscalYear, "ministry-field", key, total);
  }

  console.log(
    `[budget-national] Done. Inserted ${inserted}/${rows.length} categories; ` +
      `${byMinistry.size} ministry rollups, ${byField.size} field rollups, ` +
      `${byMinistryField.size} ministry+field rollups.`,
  );
  return { total: rows.length, inserted };
}

// ── Metropolitan budget ingestion ─────────────────────────────────────────

export async function ingestMetropolitanBudget(
  fiscalYear: number,
): Promise<IngestStats> {
  console.log(
    `[budget-metro] Starting ingest for fiscalYear=${fiscalYear}.`,
  );

  const serviceKey = resolveServiceKey();
  if (!serviceKey) {
    console.warn(
      "[budget-metro] No FISCAL_API_KEY or NEC_API_KEY set. Skipping.",
    );
    return { total: 0, inserted: 0 };
  }

  let rows: MetroBudgetRow[] = [];
  try {
    rows = await fetchAllNecPages<MetroBudgetRow>(
      METRO_BUDGET_SERVICE,
      METRO_BUDGET_METHOD,
      {
        // TODO: confirm endpoint URL — official param name may be actrYr or
        // FYR or just YEAR. We send several candidates; data.go.kr typically
        // ignores unknown extras.
        actrYr: String(fiscalYear),
        fiscalYear: String(fiscalYear),
      },
      {
        baseUrl: METRO_BUDGET_BASE_URL,
        serviceKey,
      },
    );
  } catch (err) {
    console.error(
      `[budget-metro] Fetch failed (likely endpoint not yet active or key not yet enabled): ${(err as Error).message}`,
    );
    return { total: 0, inserted: 0 };
  }

  console.log(`[budget-metro] Got ${rows.length} rows.`);

  await deleteExistingCategories("METROPOLITAN", fiscalYear);

  const bySido = new Map<string, bigint>();
  const byField = new Map<string, bigint>();
  const bySidoField = new Map<string, bigint>();

  let inserted = 0;
  for (const row of rows) {
    const rowYear =
      pickYear(row.fyr, row.fiscalYear, row.actrYr) ?? fiscalYear;
    const sido = firstNonEmpty(row.laAdNm, row.sidoNm, row.sido);
    const field = firstNonEmpty(row.fnctnCdNm, row.fnctnNm, row.field);
    const amount = pickAmount(row.budgAmt, row.amt, row.amount, row.expnAmt);

    if (!sido || !field) {
      console.warn(
        "[budget-metro] Skipping row with missing 시·도 or 분야:",
        JSON.stringify(row).slice(0, 200),
      );
      continue;
    }

    try {
      await prisma.budgetCategory.create({
        data: {
          level: "METROPOLITAN",
          fiscalYear: rowYear,
          ministry: null,
          sido,
          field,
          sector: null,
          program: null,
          subProject: null,
          amount,
        } as Prisma.BudgetCategoryUncheckedCreateInput,
      });
      inserted += 1;
    } catch (err) {
      console.error("[budget-metro] Insert failed:", err);
      continue;
    }

    bySido.set(sido, (bySido.get(sido) ?? 0n) + amount);
    byField.set(field, (byField.get(field) ?? 0n) + amount);
    const key = `${sido}|${field}`;
    bySidoField.set(key, (bySidoField.get(key) ?? 0n) + amount);
  }

  for (const [sido, total] of bySido) {
    await upsertSummary("METROPOLITAN", fiscalYear, "sido", sido, total);
  }
  for (const [field, total] of byField) {
    await upsertSummary("METROPOLITAN", fiscalYear, "field", field, total);
  }
  for (const [key, total] of bySidoField) {
    await upsertSummary("METROPOLITAN", fiscalYear, "sido-field", key, total);
  }

  console.log(
    `[budget-metro] Done. Inserted ${inserted}/${rows.length} categories; ` +
      `${bySido.size} sido rollups, ${byField.size} field rollups, ` +
      `${bySidoField.size} sido+field rollups.`,
  );
  return { total: rows.length, inserted };
}

// Re-export the enum so callers can reference BudgetLevel without importing
// from @prisma/client directly.
export { BudgetLevel } from "@prisma/client";
// (PrismaNS re-export kept available for future extensions.)
export type _PrismaExt = typeof PrismaNS;

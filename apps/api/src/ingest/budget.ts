// Ingest 예산 정보 from 열린재정포털 (openfiscaldata.go.kr).
//
// Service ID: ExpenditureBudgetInit5 (세출/지출 세부사업 예산편성현황(총액))
//   - Provides 4-level hierarchy: 소관(OFFC_NM) → 분야(FLD_NM) → 부문(SECT_NM)
//                                → 프로그램(PGM_NM) → 단위사업(ACTV_NM)
//                                → 세부사업(SACTV_NM)
//   - Amounts: Y_YY_DFN_MEDI_KCUR_AMT = 국회확정금액 (단위: 원)
//
// Env: FISCAL_API_KEY (열린재정포털 key issued via SNS login).
// Metropolitan budget ingest is currently disabled — 지방재정365 기능별 단체별
// 세출결산 is only available as SHEET download, not OpenAPI.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const BUDGET_BASE = "https://www.openfiscaldata.go.kr/openApi";
const NATIONAL_SERVICE = "ExpenditureBudgetInit5";

const PAGE_SIZE = 1000; // openfiscaldata max per call
const PAGE_DELAY_MS = 250;

// ── Raw row from API ───────────────────────────────────────────────────────

interface ExpenditureRow {
  FSCL_YY?: string | number;
  OFFC_NM?: string;
  FSCL_NM?: string;
  ACCT_NM?: string;
  FLD_NM?: string;
  SECT_NM?: string;
  PGM_NM?: string;
  ACTV_NM?: string;
  SACTV_NM?: string;
  BZ_CLS_NM?: string;
  FIN_DE_EP_NM?: string;
  Y_YY_MEDI_KCUR_AMT?: string | number;     // 정부안금액
  Y_YY_DFN_MEDI_KCUR_AMT?: string | number; // 국회확정금액 (use this as canonical)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nonEmpty(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function toBigInt(v: string | number | undefined | null): bigint {
  if (v === undefined || v === null) return 0n;
  if (typeof v === "number") {
    return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  }
  const t = String(v).trim().replace(/[, ]+/g, "");
  if (t === "") return 0n;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return 0n;
  const intPart = t.split(".")[0]!;
  try {
    return BigInt(intPart);
  } catch {
    return 0n;
  }
}

async function fetchExpenditurePage(
  apiKey: string,
  fiscalYear: number,
  pageIndex: number,
): Promise<{ rows: ExpenditureRow[]; total: number; resultCode: string | null }> {
  const params = new URLSearchParams({
    Key: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(PAGE_SIZE),
    FSCL_YY: String(fiscalYear),
  });
  const url = `${BUDGET_BASE}/${NATIONAL_SERVICE}?${params.toString()}`;
  const res = await fetch(url);
  const text = await res.text();
  // The endpoint returns the JSON as a string-wrapped value sometimes.
  // First try parsing as-is; if that yields a string, parse again.
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    throw new Error(`Non-JSON response from openfiscaldata: ${text.slice(0, 200)}`);
  }

  const block = (data as Record<string, unknown>)[NATIONAL_SERVICE];
  if (!Array.isArray(block)) {
    // Top-level RESULT object on errors
    const result = (data as Record<string, unknown>).RESULT as
      | { CODE?: string; MESSAGE?: string }
      | undefined;
    return { rows: [], total: 0, resultCode: result?.CODE ?? null };
  }

  let total = 0;
  let resultCode: string | null = null;
  let rows: ExpenditureRow[] = [];
  for (const entry of block) {
    if (entry && typeof entry === "object" && "head" in entry) {
      const head = (entry as { head: Array<Record<string, unknown>> }).head;
      for (const h of head) {
        if (typeof h.list_total_count === "number") total = h.list_total_count;
        const r = h.RESULT as { CODE?: string } | undefined;
        if (r?.CODE) resultCode = r.CODE;
      }
    }
    if (entry && typeof entry === "object" && "row" in entry) {
      rows = (entry as { row: ExpenditureRow[] }).row ?? [];
    }
  }
  return { rows, total, resultCode };
}

async function fetchAllExpenditureRows(
  apiKey: string,
  fiscalYear: number,
): Promise<ExpenditureRow[]> {
  const collected: ExpenditureRow[] = [];
  let pageIndex = 1;
  let total = Infinity;
  while (collected.length < total && pageIndex <= 100) {
    const { rows, total: pageTotal, resultCode } = await fetchExpenditurePage(
      apiKey,
      fiscalYear,
      pageIndex,
    );
    if (resultCode && resultCode !== "INFO-000") {
      if (resultCode === "INFO-200") break; // no more data
      throw new Error(`API error code ${resultCode}`);
    }
    if (pageTotal > 0) total = pageTotal;
    if (rows.length === 0) break;
    collected.push(...rows);
    pageIndex += 1;
    if (collected.length < total) await sleep(PAGE_DELAY_MS);
  }
  return collected;
}

// ── DB helpers ───────────────────────────────────────────────────────────

async function clearYear(level: "NATIONAL" | "METROPOLITAN", year: number) {
  await prisma.budgetCategory.deleteMany({ where: { level, fiscalYear: year } });
  await prisma.budgetSummary.deleteMany({ where: { level, fiscalYear: year } });
}

async function upsertSummary(
  level: "NATIONAL" | "METROPOLITAN",
  fiscalYear: number,
  groupKey: string,
  groupValue: string,
  totalAmount: bigint,
) {
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

// ── National budget ingestion ─────────────────────────────────────────────

interface IngestStats {
  total: number;
  inserted: number;
}

export async function ingestNationalBudget(fiscalYear: number): Promise<IngestStats> {
  console.log(`[budget-national] Starting fiscalYear=${fiscalYear}`);
  const apiKey = process.env.FISCAL_API_KEY;
  if (!apiKey) {
    console.warn("[budget-national] FISCAL_API_KEY not set. Skipping.");
    return { total: 0, inserted: 0 };
  }

  let rows: ExpenditureRow[];
  try {
    rows = await fetchAllExpenditureRows(apiKey, fiscalYear);
  } catch (err) {
    console.error(`[budget-national] Fetch failed: ${(err as Error).message}`);
    return { total: 0, inserted: 0 };
  }

  console.log(`[budget-national] Got ${rows.length} rows. Inserting...`);
  await clearYear("NATIONAL", fiscalYear);

  const byMinistry = new Map<string, bigint>();
  const byField = new Map<string, bigint>();
  const byMinistryField = new Map<string, bigint>();

  // Batch inserts for speed
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const data = slice
      .map((row) => {
        const ministry = nonEmpty(row.OFFC_NM);
        const field = nonEmpty(row.FLD_NM);
        const sector = nonEmpty(row.SECT_NM);
        const program = nonEmpty(row.PGM_NM);
        const subProject = nonEmpty(row.SACTV_NM) ?? nonEmpty(row.ACTV_NM);
        // openfiscaldata expenditure amounts are in 천원 (thousand won).
        // Multiply by 1000 to store as raw 원 for consistent downstream
        // formatting (조원/억원/만원).
        const amount = toBigInt(
          row.Y_YY_DFN_MEDI_KCUR_AMT ?? row.Y_YY_MEDI_KCUR_AMT,
        ) * 1000n;
        if (!field) return null;
        return {
          level: "NATIONAL" as const,
          fiscalYear,
          ministry,
          sido: null,
          field,
          sector,
          program,
          subProject,
          amount,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (data.length > 0) {
      await prisma.budgetCategory.createMany({
        data: data as Prisma.BudgetCategoryUncheckedCreateInput[],
      });
      inserted += data.length;
    }

    // Accumulate rollups
    for (const d of data) {
      if (d.ministry) {
        byMinistry.set(d.ministry, (byMinistry.get(d.ministry) ?? 0n) + d.amount);
        const key = `${d.ministry}|${d.field}`;
        byMinistryField.set(key, (byMinistryField.get(key) ?? 0n) + d.amount);
      }
      byField.set(d.field, (byField.get(d.field) ?? 0n) + d.amount);
    }
    console.log(`[budget-national] Inserted ${inserted}/${rows.length}`);
  }

  // Persist rollups
  for (const [k, v] of byMinistry) {
    await upsertSummary("NATIONAL", fiscalYear, "ministry", k, v);
  }
  for (const [k, v] of byField) {
    await upsertSummary("NATIONAL", fiscalYear, "field", k, v);
  }
  for (const [k, v] of byMinistryField) {
    await upsertSummary("NATIONAL", fiscalYear, "ministry-field", k, v);
  }

  console.log(
    `[budget-national] Done. Inserted ${inserted}/${rows.length}; ` +
      `${byMinistry.size} ministry rollups, ${byField.size} field rollups, ` +
      `${byMinistryField.size} ministry-field rollups.`,
  );
  return { total: rows.length, inserted };
}

// ── Metropolitan budget ingestion (lofin365.go.kr) ───────────────────────

const LOFIN_BASE = "https://www.lofin365.go.kr/lf/hub/BEDDH";
const LOFIN_PAGE_SIZE = 100;

interface LofinRow {
  fyr?: string | number;
  wa_laf_cd?: string;
  wa_laf_hg_nm?: string;
  fld_cd?: string;
  fld_nm?: string;
  bfae_totl_amt?: string | number;
  bfae_prsm_amt?: string | number;
}

async function fetchLofinPage(
  apiKey: string,
  fiscalYear: number,
  pageIndex: number,
): Promise<{ rows: LofinRow[]; total: number }> {
  const params = new URLSearchParams({
    Key: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(LOFIN_PAGE_SIZE),
    fyr: String(fiscalYear),
  });
  const url = `${LOFIN_BASE}?${params.toString()}`;
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    throw new Error(`Non-JSON response from lofin365: ${text.slice(0, 200)}`);
  }

  const block = (data as Record<string, unknown>)["BEDDH"];
  if (!Array.isArray(block)) {
    throw new Error(`Unexpected lofin365 response shape: ${text.slice(0, 200)}`);
  }

  let total = 0;
  let rows: LofinRow[] = [];
  for (const entry of block) {
    if (entry && typeof entry === "object" && "head" in entry) {
      const head = (entry as { head: Array<Record<string, unknown>> }).head;
      for (const h of head) {
        if (typeof h.list_total_count === "number") total = h.list_total_count;
      }
    }
    if (entry && typeof entry === "object" && "row" in entry) {
      rows = (entry as { row: LofinRow[] }).row ?? [];
    }
  }
  return { rows, total };
}

export async function ingestMetropolitanBudget(
  fiscalYear: number,
): Promise<IngestStats> {
  console.log(`[budget-metro] Starting fiscalYear=${fiscalYear}`);
  const apiKey = process.env.LOFIN_API_KEY;
  if (!apiKey) {
    console.warn("[budget-metro] LOFIN_API_KEY not set. Skipping.");
    return { total: 0, inserted: 0 };
  }

  // Fetch all pages
  const allRows: LofinRow[] = [];
  let pageIndex = 1;
  let total = Infinity;
  while (allRows.length < total && pageIndex <= 100) {
    const { rows, total: pageTotal } = await fetchLofinPage(apiKey, fiscalYear, pageIndex);
    if (pageTotal > 0) total = pageTotal;
    if (rows.length === 0) break;
    allRows.push(...rows);
    pageIndex += 1;
  }

  console.log(`[budget-metro] Got ${allRows.length} rows. Inserting...`);
  await clearYear("METROPOLITAN", fiscalYear);

  const bySido = new Map<string, bigint>();
  const byField = new Map<string, bigint>();
  const bySidoField = new Map<string, bigint>();

  // lofin365 returns short sido names ("서울", "경기"); the rest of the app
  // (frontend pickers, Legislator.region for PROVINCIAL) uses full names.
  const SIDO_SHORT_TO_FULL: Record<string, string> = {
    서울: "서울특별시",
    부산: "부산광역시",
    대구: "대구광역시",
    인천: "인천광역시",
    광주: "광주광역시",
    대전: "대전광역시",
    울산: "울산광역시",
    세종: "세종특별자치시",
    경기: "경기도",
    강원: "강원특별자치도",
    충북: "충청북도",
    충남: "충청남도",
    전북: "전북특별자치도",
    전남: "전라남도",
    경북: "경상북도",
    경남: "경상남도",
    제주: "제주특별자치도",
  };

  const data = allRows
    .map((row) => {
      const rawSido = nonEmpty(row.wa_laf_hg_nm);
      const sido = rawSido ? SIDO_SHORT_TO_FULL[rawSido] ?? rawSido : null;
      const field = nonEmpty(row.fld_nm);
      if (!sido || !field) return null;
      const amount = toBigInt(row.bfae_totl_amt); // already in 원
      return {
        level: "METROPOLITAN" as const,
        fiscalYear,
        ministry: null,
        sido,
        field,
        sector: null,
        program: null,
        subProject: null,
        amount,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (data.length > 0) {
    await prisma.budgetCategory.createMany({
      data: data as Prisma.BudgetCategoryUncheckedCreateInput[],
    });
  }

  // Accumulate rollups
  for (const d of data) {
    bySido.set(d.sido, (bySido.get(d.sido) ?? 0n) + d.amount);
    byField.set(d.field, (byField.get(d.field) ?? 0n) + d.amount);
    const key = `${d.sido}|${d.field}`;
    bySidoField.set(key, (bySidoField.get(key) ?? 0n) + d.amount);
  }

  // Persist rollups
  for (const [k, v] of bySido) {
    await upsertSummary("METROPOLITAN", fiscalYear, "sido", k, v);
  }
  for (const [k, v] of byField) {
    await upsertSummary("METROPOLITAN", fiscalYear, "field", k, v);
  }
  for (const [k, v] of bySidoField) {
    await upsertSummary("METROPOLITAN", fiscalYear, "sido-field", k, v);
  }

  console.log(
    `[budget-metro] Done. Inserted ${data.length}/${allRows.length}; ` +
      `${bySido.size} sido rollups, ${byField.size} field rollups, ` +
      `${bySidoField.size} sido-field rollups.`,
  );
  return { total: allRows.length, inserted: data.length };
}

export { BudgetLevel } from "@prisma/client";

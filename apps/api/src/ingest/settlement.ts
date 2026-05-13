// Ingest 세출결산 (actual expenditure) from 지방재정365 (lofin365.go.kr).
//
// Endpoint: https://www.lofin365.go.kr/lf/hub/ABIFB
//   - Returns ~8,658 rows per fiscalYear for fyr=2024
//   - Includes both 광역 (시·도본청) AND 기초 (시·군·구)
//   - Granularity: 단체 × 분야 × 부문
//
// Env: LOFIN_API_KEY (지방재정365 issued key).
//
// Distinct from BudgetCategory (예산편성) — this is what was ACTUALLY spent.

import type { Prisma, SettlementLevel } from "@prisma/client";
import { prisma } from "../db.js";

const LOFIN_SETTLE_BASE = "https://www.lofin365.go.kr/lf/hub/ABIFB";
const PAGE_SIZE = 1000;
const PAGE_DELAY_MS = 200;
const MAX_PAGES = 100;

// ── Raw row from API ───────────────────────────────────────────────────────

interface SettlementRow {
  fyr?: string | number;
  wa_laf_cd?: string;
  wa_laf_hg_nm?: string;
  laf_cd?: string;
  laf_hg_nm?: string;
  fld_cd?: string;
  fld_nm?: string;
  sect_cd?: string;
  sect_nm?: string;
  ep_amt?: string | number;
  rgstr_dt?: string;
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

function parseDate(v: string | undefined | null): Date | null {
  if (!v) return null;
  const t = String(v).trim();
  if (t === "") return null;
  // Common formats: "YYYYMMDD", "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss"
  let iso: string;
  if (/^\d{8}$/.test(t)) {
    iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  } else {
    iso = t.replace(" ", "T");
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// lofin365 returns short sido names ("서울", "경기"); we normalize to the
// full canonical names used elsewhere in the app.
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

function normalizeSido(raw: string | null): string | null {
  if (!raw) return null;
  return SIDO_SHORT_TO_FULL[raw] ?? raw;
}

// Determine whether a row is for the 광역 단체 (시·도본청) or a 기초 단체.
// Rule:
//   - if laf_cd == wa_laf_cd → 광역 (METROPOLITAN)
//   - else if laf_hg_nm contains "본청" → 광역
//   - else → 기초 (BASIC)
function detectLevel(row: SettlementRow): SettlementLevel {
  const laf = nonEmpty(row.laf_cd);
  const wa = nonEmpty(row.wa_laf_cd);
  const lafName = nonEmpty(row.laf_hg_nm) ?? "";
  if (laf && wa && laf === wa) return "METROPOLITAN";
  if (lafName.includes("본청")) return "METROPOLITAN";
  return "BASIC";
}

// ── API fetch ────────────────────────────────────────────────────────────

async function fetchSettlementPage(
  apiKey: string,
  fiscalYear: number,
  pageIndex: number,
): Promise<{ rows: SettlementRow[]; total: number }> {
  const params = new URLSearchParams({
    Key: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(PAGE_SIZE),
    fyr: String(fiscalYear),
  });
  const url = `${LOFIN_SETTLE_BASE}?${params.toString()}`;
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    throw new Error(`Non-JSON response from lofin365 ABIFB: ${text.slice(0, 200)}`);
  }

  const block = (data as Record<string, unknown>)["ABIFB"];
  if (!Array.isArray(block)) {
    // No data or error envelope
    const result = (data as Record<string, unknown>).RESULT as
      | { CODE?: string; MESSAGE?: string }
      | undefined;
    if (result?.CODE && result.CODE !== "INFO-000") {
      if (result.CODE === "INFO-200") return { rows: [], total: 0 };
      throw new Error(`ABIFB error ${result.CODE}: ${result.MESSAGE ?? ""}`);
    }
    return { rows: [], total: 0 };
  }

  let total = 0;
  let rows: SettlementRow[] = [];
  for (const entry of block) {
    if (entry && typeof entry === "object" && "head" in entry) {
      const head = (entry as { head: Array<Record<string, unknown>> }).head;
      for (const h of head) {
        if (typeof h.list_total_count === "number") total = h.list_total_count;
      }
    }
    if (entry && typeof entry === "object" && "row" in entry) {
      rows = (entry as { row: SettlementRow[] }).row ?? [];
    }
  }
  return { rows, total };
}

async function fetchAllSettlementRows(
  apiKey: string,
  fiscalYear: number,
): Promise<SettlementRow[]> {
  const collected: SettlementRow[] = [];
  let pageIndex = 1;
  let total = Infinity;
  while (collected.length < total && pageIndex <= MAX_PAGES) {
    const { rows, total: pageTotal } = await fetchSettlementPage(
      apiKey,
      fiscalYear,
      pageIndex,
    );
    if (pageTotal > 0) total = pageTotal;
    if (rows.length === 0) break;
    collected.push(...rows);
    pageIndex += 1;
    if (collected.length < total) await sleep(PAGE_DELAY_MS);
  }
  return collected;
}

// ── DB helpers ───────────────────────────────────────────────────────────

async function clearYear(year: number) {
  await prisma.budgetSettlement.deleteMany({ where: { fiscalYear: year } });
  await prisma.settlementSummary.deleteMany({ where: { fiscalYear: year } });
}

async function upsertSummary(
  level: SettlementLevel,
  fiscalYear: number,
  groupKey: string,
  groupValue: string,
  totalAmount: bigint,
) {
  await prisma.settlementSummary.upsert({
    where: {
      fiscalYear_level_groupKey_groupValue: {
        fiscalYear,
        level,
        groupKey,
        groupValue,
      },
    },
    create: { fiscalYear, level, groupKey, groupValue, totalAmount },
    update: { totalAmount },
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

interface IngestStats {
  total: number;
  inserted: number;
}

interface NormalizedRow {
  fiscalYear: number;
  level: SettlementLevel;
  sido: string;
  unitCode: string;
  unitName: string;
  field: string;
  fieldCode: string | null;
  sector: string | null;
  sectorCode: string | null;
  amount: bigint;
  rgstrDt: Date | null;
}

export async function ingestSettlement(fiscalYear: number): Promise<IngestStats> {
  console.log(`[settlement] Starting fiscalYear=${fiscalYear}`);
  const apiKey = process.env.LOFIN_API_KEY;
  if (!apiKey) {
    console.warn("[settlement] LOFIN_API_KEY not set. Skipping.");
    return { total: 0, inserted: 0 };
  }

  let rawRows: SettlementRow[];
  try {
    rawRows = await fetchAllSettlementRows(apiKey, fiscalYear);
  } catch (err) {
    console.error(`[settlement] Fetch failed: ${(err as Error).message}`);
    return { total: 0, inserted: 0 };
  }

  console.log(`[settlement] Got ${rawRows.length} rows. Normalizing...`);

  const normalized: NormalizedRow[] = [];
  for (const row of rawRows) {
    const sido = normalizeSido(nonEmpty(row.wa_laf_hg_nm));
    const unitCode = nonEmpty(row.laf_cd);
    const unitName = nonEmpty(row.laf_hg_nm);
    const field = nonEmpty(row.fld_nm);
    if (!sido || !unitCode || !unitName || !field) continue;
    normalized.push({
      fiscalYear,
      level: detectLevel(row),
      sido,
      unitCode,
      unitName,
      field,
      fieldCode: nonEmpty(row.fld_cd),
      sector: nonEmpty(row.sect_nm),
      sectorCode: nonEmpty(row.sect_cd),
      amount: toBigInt(row.ep_amt),
      rgstrDt: parseDate(row.rgstr_dt),
    });
  }

  console.log(
    `[settlement] Normalized ${normalized.length}/${rawRows.length} rows. Clearing year ${fiscalYear}...`,
  );
  await clearYear(fiscalYear);

  // Batch insert
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const slice = normalized.slice(i, i + BATCH_SIZE);
    if (slice.length === 0) continue;
    await prisma.budgetSettlement.createMany({
      data: slice as Prisma.BudgetSettlementUncheckedCreateInput[],
    });
    inserted += slice.length;
    console.log(`[settlement] Inserted ${inserted}/${normalized.length}`);
  }

  // ── Aggregate rollups ───────────────────────────────────────────────
  // Per-level rollups. groupKey values:
  //   "sido"        → 시·도 (level=METROPOLITAN aggregated across 시·도본청)
  //                 (BASIC: 시·도 aggregated across all 시·군·구 in that 시·도)
  //   "unit"        → 자치단체 (unitCode)
  //   "field"       → 분야 (across all units of that level)
  //   "sido-field"  → 시·도 × 분야
  //   "unit-field"  → 자치단체 × 분야

  type Bucket = Map<string, bigint>;
  const rollups: Record<SettlementLevel, {
    bySido: Bucket;
    byUnit: Bucket;
    byField: Bucket;
    bySidoField: Bucket;
    byUnitField: Bucket;
  }> = {
    METROPOLITAN: {
      bySido: new Map(),
      byUnit: new Map(),
      byField: new Map(),
      bySidoField: new Map(),
      byUnitField: new Map(),
    },
    BASIC: {
      bySido: new Map(),
      byUnit: new Map(),
      byField: new Map(),
      bySidoField: new Map(),
      byUnitField: new Map(),
    },
  };

  // Track unitCode → unitName for "unit" rollup display
  const unitNameByCode = new Map<string, string>();

  for (const d of normalized) {
    const r = rollups[d.level];
    r.bySido.set(d.sido, (r.bySido.get(d.sido) ?? 0n) + d.amount);
    r.byUnit.set(d.unitCode, (r.byUnit.get(d.unitCode) ?? 0n) + d.amount);
    r.byField.set(d.field, (r.byField.get(d.field) ?? 0n) + d.amount);
    r.bySidoField.set(
      `${d.sido}|${d.field}`,
      (r.bySidoField.get(`${d.sido}|${d.field}`) ?? 0n) + d.amount,
    );
    r.byUnitField.set(
      `${d.unitCode}|${d.field}`,
      (r.byUnitField.get(`${d.unitCode}|${d.field}`) ?? 0n) + d.amount,
    );
    unitNameByCode.set(d.unitCode, d.unitName);
  }

  for (const level of ["METROPOLITAN", "BASIC"] as const) {
    const r = rollups[level];
    for (const [k, v] of r.bySido) {
      await upsertSummary(level, fiscalYear, "sido", k, v);
    }
    for (const [k, v] of r.byUnit) {
      // Store as "code|name" so consumers can render the name without a join.
      const name = unitNameByCode.get(k) ?? k;
      await upsertSummary(level, fiscalYear, "unit", `${k}|${name}`, v);
    }
    for (const [k, v] of r.byField) {
      await upsertSummary(level, fiscalYear, "field", k, v);
    }
    for (const [k, v] of r.bySidoField) {
      await upsertSummary(level, fiscalYear, "sido-field", k, v);
    }
    for (const [k, v] of r.byUnitField) {
      await upsertSummary(level, fiscalYear, "unit-field", k, v);
    }
  }

  console.log(
    `[settlement] Done. Inserted ${inserted}/${rawRows.length}; ` +
      `METROPOLITAN(${rollups.METROPOLITAN.byUnit.size} units, ` +
      `${rollups.METROPOLITAN.byField.size} fields), ` +
      `BASIC(${rollups.BASIC.byUnit.size} units, ` +
      `${rollups.BASIC.byField.size} fields)`,
  );
  return { total: rawRows.length, inserted };
}

export { SettlementLevel } from "@prisma/client";

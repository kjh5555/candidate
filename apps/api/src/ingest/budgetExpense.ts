/**
 * 세부사업별 세출현황 ingest — LOFIN QWGJK endpoint.
 *
 * 분야→부문→세부사업 드릴다운용. exe_ymd=YYYY1231 한 번 호출로 1년 누적
 * 집행액(ep_amt)과 예산현액(bdg_cash_amt)을 자치단체 × 세부사업 단위로 확보.
 *
 * 환경변수:
 *   - LOFIN_API_KEY 또는 FISCAL_API_KEY
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/budgetExpense.ts 2024
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const BASE = "https://www.lofin365.go.kr/lf/hub/QWGJK";
const PAGE_SIZE = 1000;
const MAX_PAGES = 600;
const PAGE_DELAY_MS = 300;

type Row = {
  fyr?: string;
  wa_laf_cd?: string;
  wa_laf_hg_nm?: string;
  laf_cd?: string;
  laf_hg_nm?: string;
  acnt_dv_nm?: string;
  dept_cd?: string;
  dbiz_cd?: string;
  dbiz_nm?: string;
  exe_ymd?: string;
  bdg_cash_amt?: string | number;
  bdg_ntep?: string | number;
  capep?: string | number;
  sggep?: string | number;
  etc_amt?: string | number;
  ep_amt?: string | number;
  cpl_amt?: string | number;
  fld_cd?: string;
  fld_nm?: string;
  ane_part_cd?: string;
  part_nm?: string;
};

const SIDO_MAP: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
};

function toBigInt(v: string | number | undefined): bigint {
  if (v === undefined || v === null || v === "") return 0n;
  try { return BigInt(String(v).replace(/[^0-9-]/g, "") || "0"); }
  catch { return 0n; }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchPage(
  apiKey: string,
  fiscalYear: number,
  exeYmd: string,
  pageIndex: number,
): Promise<{ rows: Row[]; total: number; code: string }> {
  const params = new URLSearchParams({
    Key: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(PAGE_SIZE),
    fyr: String(fiscalYear),
    exe_ymd: exeYmd,
  });
  const url = `${BASE}?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    throw new Error(`Non-JSON: ${text.slice(0, 200)}`);
  }
  const block = (data as Record<string, unknown>)["QWGJK"];
  if (!Array.isArray(block)) {
    const result = (data as Record<string, unknown>).RESULT as
      | { CODE?: string; MESSAGE?: string } | undefined;
    return { rows: [], total: 0, code: result?.CODE ?? "" };
  }
  let total = 0;
  let rows: Row[] = [];
  for (const e of block) {
    if (e && typeof e === "object" && "head" in e) {
      const head = (e as { head: Array<Record<string, unknown>> }).head;
      for (const h of head) {
        if (typeof h.list_total_count === "number") total = h.list_total_count;
      }
    }
    if (e && typeof e === "object" && "row" in e) {
      rows = (e as { row: Row[] }).row ?? [];
    }
  }
  return { rows, total, code: "INFO-000" };
}

export async function ingestBudgetExpense(fiscalYear: number): Promise<void> {
  const apiKey = process.env.LOFIN_API_KEY ?? process.env.FISCAL_API_KEY;
  if (!apiKey) {
    console.error("[budget-expense] LOFIN_API_KEY/FISCAL_API_KEY not set");
    return;
  }
  // 회계연도가 과거면 연말(YYYY1231), 현재 진행 중이면 어제 날짜로
  // 누적 집행 현황을 받음.
  const today = new Date();
  const todayYear = today.getUTCFullYear();
  let exeYmd: string;
  if (fiscalYear < todayYear) {
    exeYmd = `${fiscalYear}1231`;
  } else {
    // 어제 (KST 영업일 안정성).
    const y = new Date(today.getTime() - 86400_000);
    exeYmd = `${y.getUTCFullYear()}${String(y.getUTCMonth() + 1).padStart(2, "0")}${String(y.getUTCDate()).padStart(2, "0")}`;
  }
  console.log(`[budget-expense] starting fyr=${fiscalYear} exe_ymd=${exeYmd}`);

  // 기존 데이터 삭제 후 재삽입 (LOFIN 마지막 영업일 누적 데이터).
  await prisma.budgetExpense.deleteMany({ where: { fiscalYear } });

  const seen = new Map<string, NonNullable<ReturnType<typeof toEntity>>>();
  let pageIndex = 1;
  let total = Infinity;
  let scanned = 0;

  while (scanned < total && pageIndex <= MAX_PAGES) {
    let result;
    try {
      result = await fetchPage(apiKey, fiscalYear, exeYmd, pageIndex);
    } catch (err) {
      console.error(`[budget-expense] page ${pageIndex} fetch failed:`, (err as Error).message);
      await sleep(2000);
      continue;
    }
    if (result.code === "INFO-200" || result.rows.length === 0) break;
    if (result.code !== "INFO-000") {
      console.error(`[budget-expense] error code ${result.code}, abort.`);
      break;
    }
    if (result.total > 0) total = result.total;
    scanned += result.rows.length;

    for (const r of result.rows) {
      const ent = toEntity(r, fiscalYear);
      if (!ent) continue;
      // 같은 (unitCode, detailBizCode) 중복 — 마지막 페이지 우선 (드물게 발생).
      const key = `${ent.unitCode}|${ent.detailBizCode}`;
      seen.set(key, ent);
    }
    if (pageIndex % 50 === 0) {
      console.log(`[budget-expense] page ${pageIndex} → ${scanned}/${total} (uniq=${seen.size})`);
    }
    pageIndex++;
    await sleep(PAGE_DELAY_MS);
  }

  console.log(`[budget-expense] fetched ${scanned} rows, ${seen.size} unique. inserting…`);

  // chunk insert.
  const all = Array.from(seen.values());
  const CHUNK = 500;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    await prisma.budgetExpense.createMany({
      data: chunk as Prisma.BudgetExpenseUncheckedCreateInput[],
      skipDuplicates: true,
    });
  }
  console.log(`[budget-expense] done — fyr=${fiscalYear} inserted=${all.length}`);
}

function toEntity(r: Row, fiscalYear: number) {
  const sidoShort = r.wa_laf_hg_nm ?? "";
  const sido = SIDO_MAP[sidoShort] ?? sidoShort;
  const unitCode = r.laf_cd ?? "";
  const unitName = r.laf_hg_nm ?? "";
  const fieldCode = r.fld_cd ?? "";
  const field = r.fld_nm ?? "";
  const detailBizCode = r.dbiz_cd ?? "";
  const detailBizName = r.dbiz_nm ?? "";
  const exeYmd = r.exe_ymd ?? "";
  if (!sido || !unitCode || !detailBizCode || !field) return null;
  return {
    fiscalYear,
    sido,
    unitCode,
    unitName,
    accountType: r.acnt_dv_nm ?? null,
    deptCode: r.dept_cd ?? null,
    fieldCode,
    field,
    sectorCode: r.ane_part_cd ?? null,
    sector: r.part_nm ?? null,
    detailBizCode,
    detailBizName,
    exeYmd,
    budgetAmount: toBigInt(r.bdg_cash_amt),
    spendAmount: toBigInt(r.ep_amt),
    appropAmount: toBigInt(r.cpl_amt),
    natlFundAmt: toBigInt(r.bdg_ntep),
    sidoFundAmt: toBigInt(r.capep),
    sggFundAmt: toBigInt(r.sggep),
    etcAmt: toBigInt(r.etc_amt),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] ?? String(new Date().getUTCFullYear() - 1);
  const yr = parseInt(arg, 10);
  if (!Number.isFinite(yr)) {
    console.error("Usage: tsx src/ingest/budgetExpense.ts [fiscalYear]");
    process.exit(1);
  }
  ingestBudgetExpense(yr)
    .then(() => prisma.$disconnect())
    .catch((err) => { console.error(err); process.exit(1); });
}

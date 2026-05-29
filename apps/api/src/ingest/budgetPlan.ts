/**
 * 시·군·구 본예산 ingest — LOFIN AIDFA endpoint.
 *
 * 광역(시·도 본청) + 기초(시·군·구) 243개 단체의 분야×부문×회계별 본예산.
 * BudgetSettlement(결산)의 본예산 짝.
 *
 * 회계연도 종료 후 6개월 내 공시되는 결산과 달리, 본예산은 그 해 1~3월에
 * 즉시 공시 — 따라서 2026년 본예산은 5월 현재 가용.
 *
 * 환경변수:
 *   - LOFIN_API_KEY 또는 FISCAL_API_KEY (LOFIN open API key)
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/budgetPlan.ts 2026
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const LOFIN_BASE = "https://www.lofin365.go.kr/lf/hub/AIDFA";
const PAGE_SIZE = 1000;
const MAX_PAGES = 30;

type LofinRow = {
  fyr?: string;
  wa_laf_cd?: string;
  wa_laf_hg_nm?: string;
  laf_cd?: string;
  laf_hg_nm?: string;
  acnt_dv_nm?: string;
  fld_cd?: string;
  fld_nm?: string;
  sect_cd?: string;
  sect_nm?: string;
  biz_bdg_tott_amt?: string | number;
  biz_bdg_prsm_amt?: string | number;
  fin_acv_tott_amt?: string | number;
  fin_acv_prsm_amt?: string | number;
  padm_oper_exps_tott_amt?: string | number;
  padm_oper_prsm_exps?: string | number;
};

// lofin365 wa_laf_hg_nm 단축형 → 우리 DB sido 정식명.
const SIDO_MAP: Record<string, string> = {
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

function toBigInt(v: string | number | undefined): bigint {
  if (v === undefined || v === null || v === "") return 0n;
  try {
    return BigInt(String(v).replace(/[^0-9-]/g, "") || "0");
  } catch {
    return 0n;
  }
}

async function fetchPage(
  apiKey: string,
  fiscalYear: number,
  pageIndex: number,
): Promise<{ rows: LofinRow[]; total: number }> {
  const params = new URLSearchParams({
    Key: apiKey,
    Type: "json",
    pIndex: String(pageIndex),
    pSize: String(PAGE_SIZE),
    fyr: String(fiscalYear),
  });
  const url = `${LOFIN_BASE}?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    throw new Error(`Non-JSON AIDFA response: ${text.slice(0, 200)}`);
  }
  const block = (data as Record<string, unknown>)["AIDFA"];
  if (!Array.isArray(block)) {
    const result = (data as Record<string, unknown>).RESULT as
      | { CODE?: string; MESSAGE?: string }
      | undefined;
    if (result?.CODE === "INFO-200") return { rows: [], total: 0 };
    throw new Error(`AIDFA error ${result?.CODE}: ${result?.MESSAGE ?? ""}`);
  }
  let total = 0;
  let rows: LofinRow[] = [];
  for (const e of block) {
    if (e && typeof e === "object" && "head" in e) {
      const head = (e as { head: Array<Record<string, unknown>> }).head;
      for (const h of head) {
        if (typeof h.list_total_count === "number") total = h.list_total_count;
      }
    }
    if (e && typeof e === "object" && "row" in e) {
      rows = (e as { row: LofinRow[] }).row ?? [];
    }
  }
  return { rows, total };
}

function detectLevel(row: LofinRow): "METROPOLITAN" | "BASIC" {
  // LOFIN: laf_cd === wa_laf_cd 또는 laf_hg_nm 끝이 "본청"이면 광역 본청.
  // 나머지는 기초 시·군·구.
  const laf = row.laf_cd ?? "";
  const wa = row.wa_laf_cd ?? "";
  const name = row.laf_hg_nm ?? "";
  if (laf && wa && laf === wa) return "METROPOLITAN";
  if (name.endsWith("본청")) return "METROPOLITAN";
  return "BASIC";
}

export async function ingestBudgetPlan(fiscalYear: number): Promise<void> {
  const apiKey = process.env.LOFIN_API_KEY ?? process.env.FISCAL_API_KEY;
  if (!apiKey) {
    console.error("[budget-plan] LOFIN_API_KEY/FISCAL_API_KEY not set");
    return;
  }
  console.log(`[budget-plan] starting fiscalYear=${fiscalYear}`);

  const collected: LofinRow[] = [];
  let pageIndex = 1;
  let total = Infinity;
  while (collected.length < total && pageIndex <= MAX_PAGES) {
    const { rows, total: pageTotal } = await fetchPage(apiKey, fiscalYear, pageIndex);
    if (pageTotal > 0) total = pageTotal;
    if (rows.length === 0) break;
    collected.push(...rows);
    console.log(`[budget-plan] page ${pageIndex} → ${collected.length}/${total}`);
    pageIndex++;
  }

  // 같은 fiscalYear 기존 데이터 삭제 후 재삽입 (NEC와 달리 매 회 전량 재공시 가정).
  await prisma.budgetPlan.deleteMany({ where: { fiscalYear } });

  // 단체별 unit_code 검증: LOFIN 데이터 결측 행 제외.
  const data = collected
    .map((r) => {
      const sidoShort = r.wa_laf_hg_nm ?? "";
      const sido = SIDO_MAP[sidoShort] ?? sidoShort;
      const unitCode = r.laf_cd ?? "";
      const unitName = r.laf_hg_nm ?? "";
      const fieldCode = r.fld_cd ?? "";
      const field = r.fld_nm ?? "";
      if (!sido || !unitCode || !fieldCode || !field) return null;
      const level = detectLevel(r);
      return {
        fiscalYear,
        level,
        sido,
        unitCode,
        unitName,
        accountType: r.acnt_dv_nm ?? null,
        field,
        fieldCode,
        sector: r.sect_nm ?? null,
        sectorCode: r.sect_cd ?? null,
        bizBdgTotalAmt: toBigInt(r.biz_bdg_tott_amt),
        bizBdgPrsmAmt: toBigInt(r.biz_bdg_prsm_amt),
        finActTotalAmt: toBigInt(r.fin_acv_tott_amt),
        finActPrsmAmt: toBigInt(r.fin_acv_prsm_amt),
        admOperTotalAmt: toBigInt(r.padm_oper_exps_tott_amt),
        admOperPrsmAmt: toBigInt(r.padm_oper_prsm_exps),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (data.length === 0) {
    console.log("[budget-plan] no data to insert");
    return;
  }

  // createMany는 unique 충돌이 있을 수 있어 chunk + skipDuplicates.
  const CHUNK = 500;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    await prisma.budgetPlan.createMany({
      data: chunk as Prisma.BudgetPlanUncheckedCreateInput[],
      skipDuplicates: true,
    });
  }

  console.log(
    `[budget-plan] done — fiscalYear=${fiscalYear} rows=${data.length} units=${
      new Set(data.map((d) => d.unitCode)).size
    }`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] ?? "2026";
  const yr = parseInt(arg, 10);
  if (!Number.isFinite(yr)) {
    console.error("Usage: tsx src/ingest/budgetPlan.ts [fiscalYear=2026]");
    process.exit(1);
  }
  ingestBudgetPlan(yr)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

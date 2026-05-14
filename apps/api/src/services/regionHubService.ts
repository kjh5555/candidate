// Integrated region-hub service.
//
// Given a (sido, wiwName) pair, returns everything a citizen needs for their
// region in a single payload:
//   - 국회의원 (NATIONAL) — matched by electoralDistrictName CONTAINS wiwName
//   - 광역의원 (PROVINCIAL) — region == sido, with 지역구 first, then 비례
//   - 기초의원 (BASIC) — region == wiwName
//   - 예산·결산 (BudgetSettlement aggregated by field, top 14)
//   - 결산서 PDF (SettlementReport)
//   - 2026.6.3 지방선거 후보 (MAYOR for wiwName, GOVERNOR for sido)
//   - 외부 링크 (시·도 홈페이지, 광역의회 홈페이지)

import type {
  CandidatePositionType,
  CandidateStatus,
  CandidateSummaryDTO,
  LegislatorSummaryDTO,
  RegionHubDTO,
  RegionHubSettlementItemDTO,
} from "@repo/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

// ── External link directories ────────────────────────────────────────────

// 시·도 홈페이지 (official sido portal).
const SIDO_HOMEPAGES: Record<string, string> = {
  서울특별시: "https://www.seoul.go.kr",
  부산광역시: "https://www.busan.go.kr",
  대구광역시: "https://www.daegu.go.kr",
  인천광역시: "https://www.incheon.go.kr",
  광주광역시: "https://www.gwangju.go.kr",
  대전광역시: "https://www.daejeon.go.kr",
  울산광역시: "https://www.ulsan.go.kr",
  세종특별자치시: "https://www.sejong.go.kr",
  경기도: "https://www.gg.go.kr",
  강원특별자치도: "https://www.gangwon.go.kr",
  충청북도: "https://www.chungbuk.go.kr",
  충청남도: "https://www.chungnam.go.kr",
  전북특별자치도: "https://www.jeonbuk.go.kr",
  전라남도: "https://www.jeonnam.go.kr",
  경상북도: "https://www.gb.go.kr",
  경상남도: "https://www.gyeongnam.go.kr",
  제주특별자치도: "https://www.jeju.go.kr",
};

// 광역의회 (시·도의회) 홈페이지.
const PROVINCIAL_COUNCIL_URLS: Record<string, string> = {
  서울특별시: "https://www.smc.seoul.kr",
  부산광역시: "https://council.busan.go.kr",
  대구광역시: "https://council.daegu.go.kr",
  인천광역시: "https://council.incheon.go.kr",
  광주광역시: "https://council.gwangju.go.kr",
  대전광역시: "https://council.daejeon.go.kr",
  울산광역시: "https://council.ulsan.go.kr",
  세종특별자치시: "https://council.sejong.go.kr",
  경기도: "https://www.ggc.go.kr",
  강원특별자치도: "https://council.gwd.go.kr",
  충청북도: "https://council.cb21.net",
  충청남도: "https://www.cnac.go.kr",
  전북특별자치도: "https://council.jeonbuk.go.kr",
  전라남도: "https://www.jnassembly.go.kr",
  경상북도: "https://council.gb.go.kr",
  경상남도: "https://council.gyeongnam.go.kr",
  제주특별자치도: "https://www.council.jeju.kr",
};

// ── Helpers ──────────────────────────────────────────────────────────────

const SUMMARY_SELECT = {
  id: true,
  name: true,
  level: true,
  party: true,
  gender: true,
  photoUrl: true,
  electoralDistrictName: true,
  committee: true,
  termCount: true,
  assemblyAge: true,
  councilName: true,
} satisfies Prisma.LegislatorSelect;

type LegislatorSummaryRow = Prisma.LegislatorGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

function rowToLegislatorSummary(row: LegislatorSummaryRow): LegislatorSummaryDTO {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    party: row.party,
    gender: row.gender,
    photoUrl: row.photoUrl,
    electoralDistrictName: row.electoralDistrictName,
    committee: row.committee,
    termCount: row.termCount,
    assemblyAge: row.assemblyAge,
    councilName: row.councilName,
  };
}

const CANDIDATE_SUMMARY_SELECT = {
  id: true,
  name: true,
  party: true,
  positionType: true,
  sido: true,
  wiwName: true,
  districtName: true,
  age: true,
  occupation: true,
  status: true,
} satisfies Prisma.CandidateSelect;

type CandidateSummaryRow = Prisma.CandidateGetPayload<{
  select: typeof CANDIDATE_SUMMARY_SELECT;
}>;

function rowToCandidateSummary(row: CandidateSummaryRow): CandidateSummaryDTO {
  return {
    id: row.id,
    name: row.name,
    party: row.party,
    positionType: row.positionType as CandidatePositionType,
    sido: row.sido,
    wiwName: row.wiwName,
    districtName: row.districtName,
    age: row.age,
    occupation: row.occupation,
    status: row.status as CandidateStatus,
  };
}

// PROVINCIAL ordering: 지역구 (specific district) first, then 비례 (proportional).
function isProportional(districtName: string | null): boolean {
  if (!districtName) return false;
  return districtName.includes("비례");
}

// Aggregate BudgetSettlement rows by field and return top N.
function aggregateByField(
  rows: Array<{ field: string; amount: bigint }>,
  topN: number,
): { items: RegionHubSettlementItemDTO[]; total: bigint } {
  const byField = new Map<string, bigint>();
  for (const r of rows) {
    byField.set(r.field, (byField.get(r.field) ?? 0n) + r.amount);
  }
  let total = 0n;
  for (const v of byField.values()) total += v;
  const totalNum = Number(total);
  const items = Array.from(byField, ([field, amount]) => ({
    field,
    amount,
    percent:
      total > 0n ? Math.round((Number(amount) * 10000) / totalNum) / 100 : 0,
  }));
  items.sort((a, b) =>
    a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0,
  );
  const top = items.slice(0, topN).map<RegionHubSettlementItemDTO>((i) => ({
    field: i.field,
    amount: i.amount.toString(),
    percent: i.percent,
  }));
  return { items: top, total };
}

// ── Public API ───────────────────────────────────────────────────────────

export interface GetRegionHubParams {
  sido: string;
  wiwName: string;
}

export async function getRegionHub(
  params: GetRegionHubParams,
): Promise<RegionHubDTO> {
  const { sido, wiwName } = params;

  // ── 1. 국회의원 (NATIONAL) ───────────────────────────────────────────
  // Match by electoralDistrictName CONTAINS wiwName. e.g.
  //   wiwName="여주시" matches "경기 여주시·양평군".
  const nationalRows = await prisma.legislator.findMany({
    where: {
      level: "NATIONAL",
      electoralDistrictName: { contains: wiwName },
    },
    select: SUMMARY_SELECT,
    orderBy: [{ name: "asc" }],
  });

  // ── 2. 광역의원 (PROVINCIAL) ─────────────────────────────────────────
  // Filter by region (Legislator.region == sido) AND
  //   (electoralDistrictName CONTAINS wiwName OR 비례대표).
  // Ordering: 지역구 first (matches wiwName), then 비례.
  const provincialRows = await prisma.legislator.findMany({
    where: {
      level: "PROVINCIAL",
      region: sido,
      OR: [
        { electoralDistrictName: { contains: wiwName } },
        { electoralDistrictName: { contains: "비례" } },
      ],
    },
    select: SUMMARY_SELECT,
    orderBy: [{ name: "asc" }],
  });
  provincialRows.sort((a, b) => {
    const aProp = isProportional(a.electoralDistrictName);
    const bProp = isProportional(b.electoralDistrictName);
    if (aProp !== bProp) return aProp ? 1 : -1;
    return a.name.localeCompare(b.name, "ko");
  });

  // ── 3. 기초의원 (BASIC) ──────────────────────────────────────────────
  const basicRows = await prisma.legislator.findMany({
    where: {
      level: "BASIC",
      region: wiwName,
    },
    select: SUMMARY_SELECT,
    orderBy: [{ name: "asc" }],
  });

  // ── 4. 예산 결산 (BudgetSettlement) ──────────────────────────────────
  // Find the latest fiscalYear for BASIC settlement records matching
  // (sido, unitName == wiwName).
  const settlementYears = await prisma.budgetSettlement.findMany({
    where: { level: "BASIC", sido, unitName: wiwName },
    select: { fiscalYear: true },
    distinct: ["fiscalYear"],
    orderBy: { fiscalYear: "desc" },
    take: 1,
  });

  let settlement: RegionHubDTO["settlement"] = null;
  if (settlementYears.length > 0) {
    const fiscalYear = settlementYears[0]!.fiscalYear;
    const settlementRows = await prisma.budgetSettlement.findMany({
      where: {
        level: "BASIC",
        sido,
        unitName: wiwName,
        fiscalYear,
      },
      select: { field: true, amount: true, unitCode: true, unitName: true },
    });

    if (settlementRows.length > 0) {
      const { items, total } = aggregateByField(settlementRows, 14);
      const unitCode = settlementRows[0]!.unitCode;
      const unitName = settlementRows[0]!.unitName;

      // ── 5. 결산서 PDF (SettlementReport) ─────────────────────────────
      const report = await prisma.settlementReport.findUnique({
        where: { fiscalYear_unitCode: { fiscalYear, unitCode } },
      });

      settlement = {
        fiscalYear,
        totalAmount: total.toString(),
        items,
        reportUrl: report?.reportUrl ?? null,
        unitCode,
        unitName,
      };
    }
  }

  // ── 6. 2026.6.3 지방선거 후보 ─────────────────────────────────────────
  const ELECTION_ID = "20260603";
  const [mayorRows, governorRows] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        electionId: ELECTION_ID,
        positionType: "MAYOR",
        sido,
        wiwName,
      },
      select: CANDIDATE_SUMMARY_SELECT,
      orderBy: [{ party: "asc" }, { name: "asc" }],
    }),
    prisma.candidate.findMany({
      where: {
        electionId: ELECTION_ID,
        positionType: "GOVERNOR",
        sido,
      },
      select: CANDIDATE_SUMMARY_SELECT,
      orderBy: [{ party: "asc" }, { name: "asc" }],
    }),
  ]);

  // ── 7. 외부 링크 ─────────────────────────────────────────────────────
  const externalLinks = {
    sidoSite: SIDO_HOMEPAGES[sido] ?? null,
    provincialCouncil: PROVINCIAL_COUNCIL_URLS[sido] ?? null,
    sidoHomepage: SIDO_HOMEPAGES[sido] ?? null,
  };

  return {
    sido,
    wiwName,
    legislators: {
      national: nationalRows.map(rowToLegislatorSummary),
      provincial: provincialRows.map(rowToLegislatorSummary),
      basic: basicRows.map(rowToLegislatorSummary),
    },
    settlement,
    candidates: {
      mayor: mayorRows.map(rowToCandidateSummary),
      governor: governorRows.map(rowToCandidateSummary),
    },
    externalLinks,
  };
}

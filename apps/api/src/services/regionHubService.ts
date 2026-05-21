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
  LegislatorSummaryStatsDTO,
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

// 국회 선거구 명칭은 보통 "<시·도 약칭> <시·군·구>[갑/을/병/정]" 형식
// (예: "광주 남구갑", "경기 여주시·양평군"). wiwName(예: "남구")만 substring
// 매칭하면 "강남구"·"하남구" 또는 다른 시·도의 같은 이름 시·군·구도 매치되어
// 잘못된 국회의원이 노출된다. sido 약칭 + 공백 + wiwName 형태로 좁힌다.
const SIDO_TO_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
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

function rowToLegislatorSummary(
  row: LegislatorSummaryRow,
  stats: LegislatorSummaryStatsDTO | null = null,
): LegislatorSummaryDTO {
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
    stats,
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
  // 선거구 명칭이 "<sido 약칭> <wiwName>[갑/을/병/정/·...]" 패턴이므로
  // 두 가지 조건을 AND로 건다:
  //   1) electoralDistrictName 이 sido 약칭(예: "광주")을 포함
  //   2) electoralDistrictName 이 " <wiwName>" (앞 공백 포함)을 포함
  //      → "남구"가 "강남구"·"하남구" 등의 substring으로 잘못 매칭되는 것을
  //      차단. 동시에 "광주 남구"·"광주 남구갑"·"광주 남구을" 등은 모두 매치.
  const sidoShort = SIDO_TO_SHORT[sido];
  const nationalWhere: Prisma.LegislatorWhereInput = sidoShort
    ? {
        level: "NATIONAL",
        AND: [
          { electoralDistrictName: { contains: sidoShort } },
          { electoralDistrictName: { contains: ` ${wiwName}` } },
        ],
      }
    : {
        // sido 매핑이 없으면 보수적으로 ` ${wiwName}` 만이라도 leading-space 적용
        level: "NATIONAL",
        electoralDistrictName: { contains: ` ${wiwName}` },
      };
  const nationalRows = await prisma.legislator.findMany({
    where: nationalWhere,
    select: SUMMARY_SELECT,
    orderBy: [{ name: "asc" }],
  });

  // NATIONAL 통계 (대표발의 건수 + 출석률) — 카드 노출용
  // 광역·기초는 표결 데이터가 없으므로 null
  const nationalIds = nationalRows.map((r) => r.id);
  const nationalStats = new Map<
    string,
    { primaryBills: number; totalVotes: number; absentVotes: number }
  >();
  if (nationalIds.length > 0) {
    const [billGroups, voteGroups] = await Promise.all([
      // 대표 발의 (BillProposer.role === "PRIMARY")
      prisma.billProposer.groupBy({
        by: ["legislatorId"],
        where: { legislatorId: { in: nationalIds }, role: "PRIMARY" },
        _count: { _all: true },
      }),
      // 표결 — 결과별로 카운트
      prisma.vote.groupBy({
        by: ["legislatorId", "result"],
        where: { legislatorId: { in: nationalIds } },
        _count: { _all: true },
      }),
    ]);
    for (const id of nationalIds) {
      nationalStats.set(id, {
        primaryBills: 0,
        totalVotes: 0,
        absentVotes: 0,
      });
    }
    for (const b of billGroups) {
      const s = nationalStats.get(b.legislatorId);
      if (s) s.primaryBills = b._count._all;
    }
    for (const v of voteGroups) {
      const s = nationalStats.get(v.legislatorId);
      if (!s) continue;
      s.totalVotes += v._count._all;
      if (v.result === "ABSENT") s.absentVotes += v._count._all;
    }
  }

  // ── 2. 광역의원 (PROVINCIAL) ─────────────────────────────────────────
  // region (Legislator.region == sido)으로 시·도 단위 제약 + wiwName 매칭은
  // 단순 contains로 충분 (region이 이미 시·도를 잠그므로 동명이인 광역구 위험
  // 없음). 비례는 별도 OR로 포함. 광역 선거구 명칭은 형식이 다양해서 leading-
  // space 강제는 하지 않음 (예: "남구1", "남구2" 같은 분할 선거구 존재).
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

      // ── 5b. 같은 시·도 안 다른 기초 단체의 분야별 평균 ──────────────
      // 우리 지역 vs 광역 평균 비교 차트용. 본인 단체는 제외.
      type SidoAvgRow = {
        field: string;
        avg_amount: bigint | null;
      };
      type UnitCountRow = { count: bigint | null };
      const [avgRows, unitCountRows] = await Promise.all([
        prisma.$queryRaw<SidoAvgRow[]>`
          WITH unit_amounts AS (
            SELECT field, "unitCode", SUM(amount)::BIGINT AS unit_amount
            FROM "BudgetSettlement"
            WHERE level = 'BASIC'
              AND sido = ${sido}
              AND "fiscalYear" = ${fiscalYear}
              AND "unitCode" != ${unitCode}
            GROUP BY field, "unitCode"
          )
          SELECT field, AVG(unit_amount)::BIGINT AS avg_amount
          FROM unit_amounts
          GROUP BY field
        `,
        prisma.$queryRaw<UnitCountRow[]>`
          SELECT COUNT(DISTINCT "unitCode")::BIGINT AS count
          FROM "BudgetSettlement"
          WHERE level = 'BASIC'
            AND sido = ${sido}
            AND "fiscalYear" = ${fiscalYear}
            AND "unitCode" != ${unitCode}
        `,
      ]);
      const sidoAverages = avgRows
        .filter((r) => r.avg_amount !== null)
        .map((r) => ({
          field: r.field,
          avgAmount: (r.avg_amount as bigint).toString(),
        }));
      const sidoAverageUnitCount = Number(unitCountRows[0]?.count ?? 0n);

      settlement = {
        fiscalYear,
        totalAmount: total.toString(),
        items,
        reportUrl: report?.reportUrl ?? null,
        unitCode,
        unitName,
        sidoAverages,
        sidoAverageUnitCount,
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
      national: nationalRows.map((r) => {
        const raw = nationalStats.get(r.id);
        const stats: LegislatorSummaryStatsDTO | null = raw
          ? {
              primaryBills: raw.primaryBills,
              totalVotes: raw.totalVotes,
              attendanceRate:
                raw.totalVotes > 0
                  ? Math.round(
                      ((raw.totalVotes - raw.absentVotes) /
                        raw.totalVotes) *
                        1000,
                    ) / 10
                  : null,
            }
          : null;
        return rowToLegislatorSummary(r, stats);
      }),
      provincial: provincialRows.map((r) => rowToLegislatorSummary(r, null)),
      basic: basicRows.map((r) => rowToLegislatorSummary(r, null)),
    },
    settlement,
    candidates: {
      mayor: mayorRows.map(rowToCandidateSummary),
      governor: governorRows.map(rowToCandidateSummary),
    },
    externalLinks,
  };
}

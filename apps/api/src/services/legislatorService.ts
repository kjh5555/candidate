import type {
  BillSummaryDTO,
  LegislatorDetailDTO,
  LegislatorSummaryDTO,
  VoteRecordDTO,
  ProposerRole,
  VoteResult,
  BillResult,
} from "@repo/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type ListLevel = "NATIONAL" | "PROVINCIAL" | "BASIC" | "ALL";

// ── Basic regions ─────────────────────────────────────────────

export interface BasicRegionRow {
  sido: string;
  wiwName: string;
}

/**
 * Returns distinct (sido, wiwName) pairs for all BASIC legislators,
 * ordered by sido then wiwName.
 * sdName is extracted from rawSourceJson (stored at ingest time).
 */
export async function listBasicRegions(): Promise<BasicRegionRow[]> {
  const rows = await prisma.$queryRaw<{ sido: string; wiwName: string }[]>`
    SELECT DISTINCT
      "rawSourceJson"->>'sdName' AS sido,
      "region"                   AS "wiwName"
    FROM "Legislator"
    WHERE level = 'BASIC'
      AND "rawSourceJson"->>'sdName' IS NOT NULL
      AND "region" IS NOT NULL
    ORDER BY sido, "wiwName"
  `;
  return rows.map((r) => ({ sido: r.sido, wiwName: r.wiwName }));
}

export interface ListLegislatorsParams {
  nationalDistrictId?: string;
  provincialDistrictId?: string;
  level?: ListLevel;
  /**
   * 시·도 (region/sdName) filter, mainly used to scope 광역의회 의원 listings
   * (e.g. region="서울특별시"). Applies as Legislator.region exact match.
   */
  region?: string;
  /** 이름 contains 검색 */
  name?: string;
  /** 정당 exact match */
  party?: string;
  /** 페이지네이션 */
  limit?: number;
  offset?: number;
}

const summarySelect = {
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

function rowToSummary(
  row: Prisma.LegislatorGetPayload<{ select: typeof summarySelect }>,
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
  };
}

export async function listLegislators(
  params: ListLegislatorsParams,
): Promise<{ legislators: LegislatorSummaryDTO[]; total: number }> {
  const {
    nationalDistrictId,
    provincialDistrictId,
    level = "ALL",
    region,
    name,
    party,
    limit,
    offset,
  } = params;

  const orConditions: Prisma.LegislatorWhereInput[] = [];

  if (level === "NATIONAL" || level === "ALL") {
    if (nationalDistrictId) {
      orConditions.push({
        level: "NATIONAL",
        electoralDistrictId: nationalDistrictId,
      });
    }
  }
  if (level === "PROVINCIAL" || level === "ALL") {
    if (provincialDistrictId) {
      orConditions.push({
        level: "PROVINCIAL",
        electoralDistrictId: provincialDistrictId,
      });
    }
  }
  // BASIC level uses region filter only (no district IDs)

  // Build the base where clause from the district filters above.
  const baseWhere: Prisma.LegislatorWhereInput =
    orConditions.length === 0
      ? {}
      : orConditions.length === 1
        ? orConditions[0]!
        : { OR: orConditions };

  // Layer additional filters: region (Legislator.region) and level-only listing.
  const extraConditions: Prisma.LegislatorWhereInput[] = [];
  if (region && region.trim() !== "") {
    extraConditions.push({ region });
  }
  // If no district filter was supplied but the caller passed a `level`, still
  // narrow on level so the frontend can do "all PROVINCIAL in 서울특별시".
  if (orConditions.length === 0 && level !== "ALL") {
    extraConditions.push({ level });
  }
  if (name && name.trim() !== "") {
    extraConditions.push({ name: { contains: name.trim(), mode: "insensitive" } });
  }
  if (party && party.trim() !== "") {
    extraConditions.push({ party });
  }

  const where: Prisma.LegislatorWhereInput =
    extraConditions.length === 0
      ? baseWhere
      : Object.keys(baseWhere).length === 0
        ? extraConditions.length === 1
          ? extraConditions[0]!
          : { AND: extraConditions }
        : { AND: [baseWhere, ...extraConditions] };

  const resolvedLimit = limit && limit > 0 ? Math.min(limit, 200) : undefined;
  const resolvedOffset = offset && offset > 0 ? offset : undefined;

  const [rows, total] = await Promise.all([
    prisma.legislator.findMany({
      where,
      select: summarySelect,
      orderBy: [{ level: "asc" }, { name: "asc" }],
      ...(resolvedLimit !== undefined ? { take: resolvedLimit } : {}),
      ...(resolvedOffset !== undefined ? { skip: resolvedOffset } : {}),
    }),
    prisma.legislator.count({ where }),
  ]);

  return { legislators: rows.map(rowToSummary), total };
}

export async function getLegislatorDetail(
  id: string,
): Promise<LegislatorDetailDTO | null> {
  const row = await prisma.legislator.findUnique({ where: { id } });
  if (!row) return null;

  const [billsPrimary, billsCo, votesTotal, votesByResult] = await Promise.all([
    prisma.billProposer.count({
      where: { legislatorId: id, role: "PRIMARY" },
    }),
    prisma.billProposer.count({ where: { legislatorId: id, role: "CO" } }),
    prisma.vote.count({ where: { legislatorId: id } }),
    prisma.vote.groupBy({
      by: ["result"],
      where: { legislatorId: id },
      _count: { _all: true },
    }),
  ]);

  const counts = {
    billsPrimary,
    billsCo,
    votesTotal,
    votesYes: 0,
    votesNo: 0,
    votesAbstain: 0,
    votesAbsent: 0,
  };
  for (const g of votesByResult) {
    const c = g._count._all;
    switch (g.result) {
      case "YES":
        counts.votesYes = c;
        break;
      case "NO":
        counts.votesNo = c;
        break;
      case "ABSTAIN":
        counts.votesAbstain = c;
        break;
      case "ABSENT":
        counts.votesAbsent = c;
        break;
    }
  }

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
    birthDate: row.birthDate,
    phoneNumber: row.phoneNumber,
    email: row.email,
    homepage: row.homepage,
    officeAddress: row.officeAddress,
    titleDescription: row.titleDescription,
    region: row.region,
    hasCriminalRecord: row.hasCriminalRecord ?? false,
    criminalRecordPdfUrl: row.criminalRecordPdfUrl,
    hasAssetDisclosure: row.hasAssetDisclosure ?? false,
    assetDisclosurePdfUrl: row.assetDisclosurePdfUrl,
    hasMilitaryRecord: row.hasMilitaryRecord ?? false,
    militaryRecordPdfUrl: row.militaryRecordPdfUrl,
    hasTaxRecord: row.hasTaxRecord ?? false,
    taxRecordPdfUrl: row.taxRecordPdfUrl,
    disclosureElectionId: row.disclosureElectionId,
    _counts: counts,
    // 재산공개 — BigInt 직렬화 (JSON은 BigInt 미지원)
    assetTotalManwon:      row.assetTotalManwon      != null ? String(row.assetTotalManwon)      : null,
    assetRealEstateManwon: row.assetRealEstateManwon != null ? String(row.assetRealEstateManwon) : null,
    assetSecuritiesManwon: row.assetSecuritiesManwon != null ? String(row.assetSecuritiesManwon) : null,
    assetCashManwon:       row.assetCashManwon       != null ? String(row.assetCashManwon)       : null,
    assetDebtManwon:       row.assetDebtManwon       != null ? String(row.assetDebtManwon)       : null,
    assetReportYear:       row.assetReportYear       ?? null,
    assetSourceUrl:        row.assetSourceUrl        ?? null,
    assetSourceName:       row.assetSourceName       ?? null,
    assetLastSyncedAt:     row.assetLastSyncedAt     ? row.assetLastSyncedAt.toISOString() : null,
    // 병역
    militaryStatus:        row.militaryStatus        ?? null,
    militaryRank:          row.militaryRank          ?? null,
    militaryEnteredAt:     row.militaryEnteredAt     ?? null,
    militaryDischargedAt:  row.militaryDischargedAt  ?? null,
    militaryReason:        row.militaryReason        ?? null,
    militaryReportYear:    row.militaryReportYear    ?? null,
    militarySourceUrl:     row.militarySourceUrl     ?? null,
    militaryLastSyncedAt:  row.militaryLastSyncedAt  ? row.militaryLastSyncedAt.toISOString() : null,
  };
}

export interface ListLegislatorBillsParams {
  role?: ProposerRole;
  result?: BillResult;
  limit?: number;
  offset?: number;
}

export interface ListLegislatorBillsResult {
  bills: BillSummaryDTO[];
  total: number;
  limit: number;
  offset: number;
}

export async function listLegislatorBills(
  legislatorId: string,
  params: ListLegislatorBillsParams,
): Promise<ListLegislatorBillsResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const where: Prisma.BillProposerWhereInput = {
    legislatorId,
    ...(params.role ? { role: params.role } : {}),
    ...(params.result ? { bill: { result: params.result } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.billProposer.findMany({
      where,
      include: { bill: true },
      orderBy: { bill: { proposedDate: "desc" } },
      skip: offset,
      take: limit,
    }),
    prisma.billProposer.count({ where }),
  ]);

  const bills: BillSummaryDTO[] = rows.map((p) => ({
    id: p.bill.id,
    billNo: p.bill.billNo,
    name: p.bill.name,
    proposedDate: p.bill.proposedDate ? p.bill.proposedDate.toISOString() : null,
    committee: p.bill.committee,
    result: p.bill.result,
    assemblyAge: p.bill.assemblyAge,
    linkUrl: p.bill.linkUrl,
    role: p.role,
  }));

  return { bills, total, limit, offset };
}

export interface ListLegislatorVotesParams {
  result?: VoteResult;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ListLegislatorVotesResult {
  votes: VoteRecordDTO[];
  total: number;
  limit: number;
  offset: number;
}

export async function listLegislatorVotes(
  legislatorId: string,
  params: ListLegislatorVotesParams,
): Promise<ListLegislatorVotesResult> {
  const limit = clamp(params.limit ?? 20, 1, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const voteDateFilter: Prisma.DateTimeFilter | undefined =
    params.from || params.to
      ? {
          ...(params.from ? { gte: params.from } : {}),
          ...(params.to ? { lte: params.to } : {}),
        }
      : undefined;

  const where: Prisma.VoteWhereInput = {
    legislatorId,
    ...(params.result ? { result: params.result } : {}),
    ...(voteDateFilter ? { voteDate: voteDateFilter } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.vote.findMany({
      where,
      orderBy: { voteDate: "desc" },
      skip: offset,
      take: limit,
      include: {
        bill: {
          include: {
            proposers: {
              where: { role: "PRIMARY" },
              select: { legislatorId: true },
            },
          },
        },
      },
    }),
    prisma.vote.count({ where }),
  ]);

  // Batch-count CO proposers for all bills that have a billId
  const billIds = rows.map((v) => v.billId).filter((id): id is string => id !== null);
  const coCountMap = new Map<string, number>();
  if (billIds.length > 0) {
    const coCounts = await prisma.billProposer.groupBy({
      by: ["billId"],
      where: { billId: { in: billIds }, role: "CO" },
      _count: { _all: true },
    });
    for (const c of coCounts) {
      coCountMap.set(c.billId, c._count._all);
    }
  }

  const votes: VoteRecordDTO[] = rows.map((v) => {
    const bill = v.bill;
    // Fallback coProposerCount: split coProposerNamesRaw if BillProposer table has no data
    let coProposerCount = 0;
    if (bill) {
      const fromMap = coCountMap.get(bill.id);
      if (fromMap !== undefined && fromMap > 0) {
        coProposerCount = fromMap;
      } else if (bill.coProposerNamesRaw) {
        coProposerCount = bill.coProposerNamesRaw
          .split(/[,，、\n]/)
          .map((s) => s.trim())
          .filter(Boolean).length;
      }
    }

    const primaryProposerLegislatorId =
      bill?.proposers?.[0]?.legislatorId ?? null;

    return {
      id: v.id,
      billNo: v.billNo,
      billName: v.billName,
      billId: v.billId,
      result: v.result,
      voteDate: v.voteDate.toISOString(),
      assemblyAge: v.assemblyAge,
      committee: bill?.committee ?? null,
      primaryProposerName: bill?.primaryProposerName ?? null,
      primaryProposerLegislatorId,
      coProposerCount,
      linkUrl: bill?.linkUrl ?? null,
    };
  });

  return { votes, total, limit, offset };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

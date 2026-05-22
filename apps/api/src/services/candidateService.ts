import type {
  CandidateDetailDTO,
  CandidatePledgeDTO,
  CandidatePositionType,
  CandidateRegionDTO,
  CandidateStatus,
  CandidateSummaryDTO,
} from "@repo/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type ListPositionType = CandidatePositionType | "ALL";

export interface ListCandidatesParams {
  electionId: string;
  positionType?: ListPositionType;
  sido?: string;
  wiwName?: string;
  /** 이름 contains (insensitive) */
  name?: string;
  /** 지역구 이름 contains (insensitive). districtName 컬럼 또는 wiwName 컬럼 OR 매칭. */
  districtName?: string;
}

const summarySelect = {
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

function rowToSummary(
  row: Prisma.CandidateGetPayload<{ select: typeof summarySelect }>,
): CandidateSummaryDTO {
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

export async function listCandidates(
  params: ListCandidatesParams,
): Promise<CandidateSummaryDTO[]> {
  const {
    electionId,
    positionType = "ALL",
    sido,
    wiwName,
    name,
    districtName,
  } = params;

  const trimmedName = name?.trim();
  const trimmedDistrict = districtName?.trim();

  const where: Prisma.CandidateWhereInput = {
    electionId,
    ...(positionType !== "ALL" ? { positionType } : {}),
    ...(sido ? { sido } : {}),
    ...(wiwName ? { wiwName } : {}),
    ...(trimmedName && trimmedName.length > 0
      ? { name: { contains: trimmedName, mode: "insensitive" } }
      : {}),
    ...(trimmedDistrict && trimmedDistrict.length > 0
      ? {
          OR: [
            { districtName: { contains: trimmedDistrict, mode: "insensitive" } },
            { wiwName: { contains: trimmedDistrict, mode: "insensitive" } },
            { sido: { contains: trimmedDistrict, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.candidate.findMany({
    where,
    select: summarySelect,
    orderBy: [
      { wiwName: "asc" },
      { party: "asc" },
      { name: "asc" },
    ],
  });

  return rows.map(rowToSummary);
}

export async function getCandidateDetail(
  id: string,
): Promise<CandidateDetailDTO | null> {
  const row = await prisma.candidate.findUnique({
    where: { id },
    include: {
      pledges: {
        orderBy: { ord: "asc" },
      },
    },
  });
  if (!row) return null;

  let pledges: CandidatePledgeDTO[] = row.pledges.map((p) => ({
    ord: p.ord,
    category: p.category,
    title: p.title,
    content: p.content,
  }));

  // ElectedOfficialPledge 폴백 — 9회 지선 후보 공약은 별도 테이블에 ingest됨.
  // CandidatePledge가 비어 있으면 ElectedOfficialPledge에서 매칭(cnddtId=id).
  if (pledges.length === 0) {
    const ext = await prisma.electedOfficialPledge.findFirst({
      where: { electionId: row.electionId, cnddtId: row.id },
      select: { pledges: true },
    });
    if (ext && Array.isArray(ext.pledges)) {
      pledges = (ext.pledges as Array<{
        ord: number;
        title: string;
        content: string;
        realm: string | null;
      }>).map((p) => ({
        ord: p.ord,
        category: p.realm,
        title: p.title,
        content: p.content,
      }));
    }
  }

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
    hanjaName: row.hanjaName,
    gender: row.gender,
    birthDate: row.birthDate,
    education: row.education,
    career1: row.career1,
    career2: row.career2,
    address: row.address,
    registeredAt: row.registeredAt ? row.registeredAt.toISOString() : null,
    pledges,
    // Background disclosure fields (전과/재산/병역/세금).
    // BigInt fields must be serialized to string for JSON.
    hasCriminalRecord: row.hasCriminalRecord ?? false,
    criminalRecordPdfUrl: row.criminalRecordPdfUrl,
    hasAssetDisclosure: row.hasAssetDisclosure ?? false,
    assetDisclosurePdfUrl: row.assetDisclosurePdfUrl,
    hasMilitaryRecord: row.hasMilitaryRecord ?? false,
    militaryRecordPdfUrl: row.militaryRecordPdfUrl,
    hasTaxRecord: row.hasTaxRecord ?? false,
    taxRecordPdfUrl: row.taxRecordPdfUrl,
    criminalRecordCount: row.criminalRecordCount,
    assetTotalManwon: bigintToString(row.assetTotalManwon),
    militaryStatus: row.militaryStatus,
    taxPaidManwon: bigintToString(row.taxPaidManwon),
    taxOutstandingManwon: bigintToString(row.taxOutstandingManwon),
  };
}

function bigintToString(v: bigint | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toString();
}

export interface ListCandidateRegionsParams {
  electionId: string;
}

/**
 * Returns the distinct (sido, wiwName) pairs that have at least one candidate
 * for the given election. GOVERNOR candidates surface as (sido, null) entries
 * (sido-level only); MAYOR candidates surface their wiwName.
 */
export async function listCandidateRegions(
  params: ListCandidateRegionsParams,
): Promise<CandidateRegionDTO[]> {
  const { electionId } = params;
  const rows = await prisma.candidate.findMany({
    where: { electionId, sido: { not: null } },
    select: { sido: true, wiwName: true },
    distinct: ["sido", "wiwName"],
    orderBy: [{ sido: "asc" }, { wiwName: "asc" }],
  });

  return rows
    .filter((r) => r.sido != null)
    .map((r) => ({
      sido: r.sido as string,
      wiwName: r.wiwName,
    }));
}

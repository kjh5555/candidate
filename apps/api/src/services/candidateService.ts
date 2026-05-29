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
  photoUrl: true,
} satisfies Prisma.CandidateSelect;

function rowToSummary(
  row: Prisma.CandidateGetPayload<{ select: typeof summarySelect }>,
  hasPledges = false,
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
    photoUrl: row.photoUrl,
    hasPledges,
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

  // wiwName 필터는 OR로 확장:
  //   1) wiwName 정확 매칭 (시·군·구청장·기초의원·기초비례)
  //   2) wiwName이 null이고 sido 일치 (시·도지사·교육감·광역비례)
  //   3) districtName에 wiwName 포함 (광역의원 지역구·국회보궐 — 선거구 명에
  //      "여주시"·"여주시·양평군" 등이 들어감)
  // 이로써 한 지역구 시민이 6월 지선에서 실제 투표할 모든 직위가 같이 보임.
  // sidoIn은 광주광역시/전라남도일 때 통합 entry까지 같이 포함.
  const sidoForWiwOr =
    sido === "광주광역시" || sido === "전라남도"
      ? [sido, "전남광주통합특별시"]
      : sido
        ? [sido]
        : null;
  const wiwOr = wiwName
    ? [
        { wiwName },
        ...(sidoForWiwOr
          ? [{ AND: [{ wiwName: null }, { sido: { in: sidoForWiwOr } }] }]
          : []),
        { districtName: { contains: wiwName } },
      ]
    : null;

  const districtOr = trimmedDistrict && trimmedDistrict.length > 0
    ? [
        { districtName: { contains: trimmedDistrict, mode: "insensitive" as const } },
        { wiwName: { contains: trimmedDistrict, mode: "insensitive" as const } },
        { sido: { contains: trimmedDistrict, mode: "insensitive" as const } },
      ]
    : null;

  // 활성 후보 신선도 — NEC가 매일 후보 명단을 재공시하므로 backgroundLastSyncedAt이
  // 3일 이내인 후보만 노출. 사퇴/탈락한 옛 후보가 자동으로 빠짐.
  // (status=REGISTERED 필터만으로는 NEC가 사퇴 상태로 기록 안 한 후보가 남음.)
  const freshSince = new Date(Date.now() - 3 * 86400_000);

  // 광주광역시·전라남도는 NEC가 광역 단위 직위(시·도지사·교육감·광역비례)를
  // "전남광주통합특별시" 단일 entry로 응답해서 우리 DB sido에 그대로 저장됨.
  // 시민이 "광주광역시" 또는 "전라남도"로 검색하면 통합 entry 후보도 같이 잡히도록.
  const sidoIn =
    sido === "광주광역시" || sido === "전라남도"
      ? [sido, "전남광주통합특별시"]
      : sido
        ? [sido]
        : null;

  const where: Prisma.CandidateWhereInput = {
    electionId,
    status: "REGISTERED",
    backgroundLastSyncedAt: { gte: freshSince },
    ...(positionType !== "ALL" ? { positionType } : {}),
    ...(sidoIn ? { sido: { in: sidoIn } } : {}),
    ...(trimmedName && trimmedName.length > 0
      ? { name: { contains: trimmedName, mode: "insensitive" } }
      : {}),
    AND: [
      ...(wiwOr ? [{ OR: wiwOr }] : []),
      ...(districtOr ? [{ OR: districtOr }] : []),
    ],
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

  // 공약 보유 여부 — ElectedOfficialPledge에서 cnddtId in [...]로 한 번에 조회.
  const ids = rows.map((r) => r.id);
  const pledgeRows = ids.length > 0
    ? await prisma.electedOfficialPledge.findMany({
        where: { electionId, cnddtId: { in: ids } },
        select: { cnddtId: true },
      })
    : [];
  const withPledges = new Set(pledgeRows.map((p) => p.cnddtId));

  return rows.map((r) => rowToSummary(r, withPledges.has(r.id)));
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
    photoUrl: row.photoUrl,
    hasPledges: pledges.length > 0,
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

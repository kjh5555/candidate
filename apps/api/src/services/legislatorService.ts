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

export type ListLevel = "NATIONAL" | "PROVINCIAL" | "ALL";

export interface ListLegislatorsParams {
  nationalDistrictId?: string;
  provincialDistrictId?: string;
  level?: ListLevel;
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
): Promise<LegislatorSummaryDTO[]> {
  const { nationalDistrictId, provincialDistrictId, level = "ALL" } = params;

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

  const where: Prisma.LegislatorWhereInput =
    orConditions.length === 0
      ? {}
      : orConditions.length === 1
        ? orConditions[0]!
        : { OR: orConditions };

  const rows = await prisma.legislator.findMany({
    where,
    select: summarySelect,
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  return rows.map(rowToSummary);
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
    _counts: counts,
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
    }),
    prisma.vote.count({ where }),
  ]);

  const votes: VoteRecordDTO[] = rows.map((v) => ({
    id: v.id,
    billNo: v.billNo,
    billName: v.billName,
    billId: v.billId,
    result: v.result,
    voteDate: v.voteDate.toISOString(),
    assemblyAge: v.assemblyAge,
  }));

  return { votes, total, limit, offset };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

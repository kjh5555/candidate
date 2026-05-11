import type {
  BillDetailDTO,
  ProposerDTO,
  VotesSummaryDTO,
} from "@repo/shared";
import { prisma } from "../db.js";

export async function getBillDetail(
  billId: string,
): Promise<BillDetailDTO | null> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      proposers: {
        include: { legislator: true },
      },
    },
  });

  if (!bill) return null;

  const proposers: ProposerDTO[] = bill.proposers.map((p) => ({
    legislatorId: p.legislatorId,
    name: p.legislator.name,
    party: p.legislator.party,
    photoUrl: p.legislator.photoUrl,
    role: p.role,
    matchConfidence: p.matchConfidence,
  }));

  // Sort: PRIMARY first, then by name
  proposers.sort((a, b) => {
    if (a.role !== b.role) return a.role === "PRIMARY" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const voteGroups = await prisma.vote.groupBy({
    by: ["result"],
    where: { billId },
    _count: { _all: true },
  });

  const votesSummary: VotesSummaryDTO = {
    yes: 0,
    no: 0,
    abstain: 0,
    absent: 0,
    total: 0,
  };
  for (const g of voteGroups) {
    const c = g._count._all;
    votesSummary.total += c;
    switch (g.result) {
      case "YES":
        votesSummary.yes = c;
        break;
      case "NO":
        votesSummary.no = c;
        break;
      case "ABSTAIN":
        votesSummary.abstain = c;
        break;
      case "ABSENT":
        votesSummary.absent = c;
        break;
    }
  }

  return {
    id: bill.id,
    billNo: bill.billNo,
    name: bill.name,
    proposedDate: bill.proposedDate ? bill.proposedDate.toISOString() : null,
    committee: bill.committee,
    result: bill.result,
    assemblyAge: bill.assemblyAge,
    linkUrl: bill.linkUrl,
    coProposerNamesRaw: bill.coProposerNamesRaw,
    proposerMatchStatus: bill.proposerMatchStatus,
    proposers,
    votesSummary,
  };
}

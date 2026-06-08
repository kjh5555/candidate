import { prisma } from "../src/db.js";

const rows = await prisma.candidate.groupBy({
  by: ["status"],
  where: { electionId: "20260603" },
  _count: { _all: true },
});
console.log("status counts:", rows);

const elected = await prisma.candidate.count({
  where: { electionId: "20260603", status: "ELECTED" },
});
console.log("ELECTED total:", elected);

const sample = await prisma.candidate.findMany({
  where: { electionId: "20260603", status: "ELECTED" },
  take: 3,
  select: {
    name: true,
    party: true,
    sido: true,
    wiwName: true,
    positionType: true,
    voteCount: true,
    voteRate: true,
    resultSyncedAt: true,
  },
});
console.log("samples:", JSON.stringify(sample, null, 2));

await prisma.$disconnect();

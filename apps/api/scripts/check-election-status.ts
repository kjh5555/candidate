import { prisma } from "../src/db.js";

const total = await prisma.candidate.count({ where: { electionId: "20260603" } });
const hasCrime = await prisma.candidate.count({
  where: { electionId: "20260603", hasCriminalRecord: true },
});
const withCrimePdf = await prisma.candidate.count({
  where: { electionId: "20260603", criminalRecordPdfUrl: { not: null } },
});
const elected = await prisma.candidate.count({
  where: { electionId: "20260603", status: "ELECTED" },
});

console.log(`9회 후보 ${total}명:`);
console.log(`  ELECTED:              ${elected}`);
console.log(`  hasCriminalRecord:    ${hasCrime}`);
console.log(`  criminalRecordPdfUrl: ${withCrimePdf}`);

const sample = await prisma.candidate.findMany({
  where: { electionId: "20260603", hasCriminalRecord: true },
  take: 3,
  select: { name: true, sido: true, criminalRecordCount: true, criminalRecordPdfUrl: true },
});
console.log(`\n전과 있는 샘플 3명:`);
for (const c of sample) {
  console.log(`  ${c.sido} ${c.name}: ${c.criminalRecordCount}건  ${c.criminalRecordPdfUrl?.slice(0, 80)}...`);
}

await prisma.$disconnect();

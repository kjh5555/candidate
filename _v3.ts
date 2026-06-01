import { prisma } from "./src/db.js";
(async () => {
  const r = await prisma.budgetExpense.groupBy({
    by: ["fiscalYear"], _count: { _all: true },
    orderBy: { fiscalYear: "desc" },
  });
  for (const x of r) console.log(`  ${x.fiscalYear}: ${x._count._all}`);
})().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });

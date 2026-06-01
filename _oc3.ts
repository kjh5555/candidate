import { prisma } from "./src/db.js";
(async () => {
  const c = await prisma.ordinance.count();
  console.log(`Ordinance: ${c}`);
})().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });

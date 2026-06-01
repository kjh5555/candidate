import { prisma } from "./src/db.js";
(async () => {
  const c = await prisma.ordinance.count();
  const orgs = await prisma.$queryRawUnsafe<{c: bigint}[]>(
    `SELECT COUNT(DISTINCT "orgName")::bigint AS c FROM "Ordinance" WHERE "orgName" IS NOT NULL`,
  );
  const nullOrg = await prisma.ordinance.count({ where: { orgName: null } });
  console.log(`Ordinance total: ${c} · distinct orgs: ${orgs[0].c} · null orgName: ${nullOrg}`);
  // 여주시 샘플
  const ye = await prisma.ordinance.count({ where: { orgName: { contains: "여주" } } });
  console.log(`여주 매칭: ${ye}`);
  // 광역 시·도 매칭
  const top = await prisma.$queryRawUnsafe<{orgName: string, c: bigint}[]>(
    `SELECT "orgName", COUNT(*) AS c FROM "Ordinance" GROUP BY "orgName" ORDER BY c DESC LIMIT 10`,
  );
  console.log("\norgName top 10:");
  for (const r of top) console.log(`  ${r.orgName}: ${r.c}`);
})().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });

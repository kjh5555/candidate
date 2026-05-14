// 일회성 수집 스크립트.
// 사용: tsx src/ingest/controversies.ts <legislatorId>
//
// 자동 cron 등록은 의도적으로 하지 않음 — 사용자 트리거 또는 1회성 검증용.

import { ingestControversiesForLegislator } from "../services/newsIngestService.js";
import { prisma } from "../db.js";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx src/ingest/controversies.ts <legislatorId>");
    process.exit(1);
  }

  const leg = await prisma.legislator.findUnique({
    where: { id },
    select: { id: true, name: true, level: true },
  });
  if (!leg) {
    console.error(`Legislator not found: ${id}`);
    process.exit(1);
  }
  console.log(`[ingest] Legislator: ${leg.name} (${leg.id}, ${leg.level})`);

  const result = await ingestControversiesForLegislator(id);
  console.log("[ingest] Result:", result);

  const topics = await prisma.controversyTopic.findMany({
    where: { legislatorId: id },
    orderBy: { credibility: "desc" },
    include: { articles: { take: 5 } },
  });
  console.log(`[ingest] Topics: ${topics.length}`);
  for (const t of topics.slice(0, 5)) {
    console.log(
      `  - "${t.title}" | credibility=${t.credibility} | category=${t.category} | articles=${t.articles.length}`,
    );
    if (t.signals) console.log("    signals:", JSON.stringify(t.signals));
  }
}

main()
  .catch((err) => {
    console.error("[ingest] Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

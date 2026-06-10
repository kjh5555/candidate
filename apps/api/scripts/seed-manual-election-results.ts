// NEC OpenAPI(WinnerInfoInqireService2) 미공개 기간(선거 후 약 2개월)에
// 위키백과 데이터를 기반으로 17(전남광주통합 16) 광역단체장 당선자를 수동으로 마킹.
//
// 매칭 키: (electionId, positionType=GOVERNOR, sido, name, party) — 광역 한 명만 매칭되므로 동명이인 충돌 없음.
// 멱등: 같은 데이터로 재실행해도 동일한 row만 update.
//
// 향후 NEC OpenAPI 공개 시 electionResults.ts cron이 huboid 기반으로 덮어쓰면서
// voteCount/voteRate까지 채워줌. 본 스크립트는 임시방편.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CandidateStatus, CandidatePositionType } from "@prisma/client";
import { prisma } from "../src/db.js";

interface ManualSeed {
  source: string;
  sgId: string;
  fetchedAt: string;
  governors: Array<{ sido: string; name: string; party: string }>;
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dataPath = path.join(here, "..", "data", "election-results-20260603-manual.json");
  const raw = await readFile(dataPath, "utf8");
  const data: ManualSeed = JSON.parse(raw);

  console.log(`📋 출처: ${data.source}`);
  console.log(`   sgId=${data.sgId}, 수집일=${data.fetchedAt}, 광역단체장 ${data.governors.length}명\n`);

  const NOW = new Date();
  let matched = 0;
  let multiMatch = 0;
  let notFound = 0;
  const issues: string[] = [];

  for (const g of data.governors) {
    const rows = await prisma.candidate.findMany({
      where: {
        electionId: data.sgId,
        positionType: CandidatePositionType.GOVERNOR,
        sido: g.sido,
        name: g.name,
        party: g.party,
      },
      select: { id: true, status: true },
    });

    if (rows.length === 0) {
      notFound++;
      issues.push(`  [미매칭] ${g.sido} ${g.party} ${g.name}`);
      continue;
    }
    if (rows.length > 1) {
      multiMatch++;
      issues.push(`  [복수매칭] ${g.sido} ${g.party} ${g.name} → ${rows.length}건`);
      continue;
    }

    const row = rows[0];
    await prisma.candidate.update({
      where: { id: row.id },
      data: {
        status: CandidateStatus.ELECTED,
        rank: 1,
        resultSyncedAt: NOW,
      },
    });
    matched++;
    console.log(`  ✓ ${g.sido.padEnd(16)} ${g.party.padEnd(10)} ${g.name} (id=${row.id}, prev=${row.status})`);
  }

  console.log(`\n✅ 완료`);
  console.log(`  매칭·마킹: ${matched}/${data.governors.length}`);
  if (notFound > 0) console.log(`  미매칭: ${notFound}`);
  if (multiMatch > 0) console.log(`  복수매칭: ${multiMatch}`);
  for (const i of issues) console.log(i);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

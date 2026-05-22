// Ingest 9회 지선(20260603) 후보 공약 from NEC ElecPrmsInfoInqireService.
//
// 기존 officialPledges.ts와 차이:
//   - 후보자 huboid 소스가 WinnerInfoInqireService가 아니라 우리 Candidate
//     테이블 (9회는 아직 당선자 없음)
//   - 같은 ElectedOfficialPledge 모델에 저장. electionId="20260603"로 구분.
//
// Usage:
//   pnpm --filter @repo/api tsx src/ingest/candidatePledges.ts [sgTypecode]

import type { CandidatePositionType, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

const POSITION_MAP: Array<{
  positionType: CandidatePositionType;
  sgTypecode: string;
  label: string;
  hasWiw: boolean;
}> = [
  { positionType: "GOVERNOR", sgTypecode: "3", label: "시·도지사 후보", hasWiw: false },
  { positionType: "MAYOR", sgTypecode: "4", label: "시·군·구청장 후보", hasWiw: true },
  { positionType: "SUPERINTENDENT", sgTypecode: "11", label: "교육감 후보", hasWiw: false },
];

interface PledgeRow {
  [key: string]: unknown;
  cnddtId?: string;
  prmsCnt?: string;
}

function extractPledges(row: PledgeRow): Array<{
  ord: number;
  title: string;
  content: string;
  realm: string | null;
}> {
  const out: Array<{
    ord: number;
    title: string;
    content: string;
    realm: string | null;
  }> = [];
  for (let i = 1; i <= 10; i++) {
    const title = String(row[`prmsTitle${i}`] ?? "").trim();
    const content = String(row[`prmmCont${i}`] ?? "").trim();
    const realm = String(row[`prmsRealmName${i}`] ?? "").trim();
    if (!title && !content) continue;
    out.push({
      ord: i,
      title,
      content,
      realm: realm.length > 0 ? realm : null,
    });
  }
  return out;
}

async function fetchPledges(
  sgId: string,
  sgTypecode: string,
  huboid: string,
): Promise<PledgeRow[]> {
  return fetchAllNecPages<PledgeRow>(
    "ElecPrmsInfoInqireService",
    "getCnddtElecPrmsInfoInqire",
    { sgId, sgTypecode, cnddtId: huboid },
    { pageSize: 10, delayMs: 200 },
  );
}

async function main() {
  const sgId = "20260603";
  const filterCode = process.argv[2];

  console.log(
    `\n📜 9회 지선 후보 공약 ingest 시작 (sgId=${sgId}${filterCode ? `, sgTypecode=${filterCode}만` : ""})`,
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const positions = filterCode
    ? POSITION_MAP.filter((p) => p.sgTypecode === filterCode)
    : POSITION_MAP;

  for (const { positionType, sgTypecode, label, hasWiw } of positions) {
    console.log(`\n── ${label} (sgTypecode=${sgTypecode}) ──`);
    const candidates = await prisma.candidate.findMany({
      where: { electionId: sgId, positionType },
      select: {
        id: true,
        name: true,
        party: true,
        sido: true,
        wiwName: true,
      },
    });
    console.log(`  대상 ${candidates.length}명`);

    let processed = 0;
    for (const c of candidates) {
      try {
        const rows = await fetchPledges(sgId, sgTypecode, c.id);
        if (rows.length === 0) {
          totalSkipped++;
          continue;
        }
        const row = rows[0]!;
        const list = extractPledges(row);
        if (list.length === 0) {
          totalSkipped++;
          continue;
        }
        await prisma.electedOfficialPledge.upsert({
          where: {
            electionId_cnddtId: { electionId: sgId, cnddtId: c.id },
          },
          create: {
            electionId: sgId,
            sgTypecode,
            positionLabel: label,
            cnddtId: c.id,
            name: c.name,
            party: c.party,
            sido: c.sido,
            wiwName: hasWiw ? c.wiwName : null,
            pledges: list as unknown as Prisma.InputJsonValue,
            rawSourceJson: row as unknown as Prisma.InputJsonValue,
          },
          update: {
            sgTypecode,
            positionLabel: label,
            name: c.name,
            party: c.party,
            sido: c.sido,
            wiwName: hasWiw ? c.wiwName : null,
            pledges: list as unknown as Prisma.InputJsonValue,
            rawSourceJson: row as unknown as Prisma.InputJsonValue,
            syncedAt: new Date(),
          },
        });
        totalCreated++;
        processed++;
        if (processed % 20 === 0) {
          console.log(`  ✅ ${processed}명 처리…`);
        }
      } catch (err) {
        totalFailed++;
        console.warn(`  ⚠️  ${c.name} (${c.id}) 실패:`, err);
      }
    }
  }

  console.log(
    `\n📜 완료 — upsert ${totalCreated}건 / skip ${totalSkipped}건 / 실패 ${totalFailed}건`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

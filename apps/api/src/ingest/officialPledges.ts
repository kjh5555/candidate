// Ingest 단체장 공약 from NEC ElecPrmsInfoInqireService (data.go.kr 15040587).
//
// Step 1: NEC WinnerInfoInqireService2로 8회 지선(20220601) 당선자 메타데이터
//         (huboid·name·party·sido·wiwName) 수집. sgTypecode 3(시·도지사),
//         4(시·군·구청장), 11(교육감).
// Step 2: 각 huboid로 ElecPrmsInfoInqireService 호출 → 공약 최대 10개.
// Step 3: ElectedOfficialPledge 모델에 upsert.
//
// Usage:
//   pnpm --filter @repo/api tsx src/ingest/officialPledges.ts [sgId]
//
// sgId 기본값: 20220601 (8회 지선).

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

const SG_TYPECODES: Array<{
  code: string;
  label: string;
  hasWiw: boolean;
}> = [
  { code: "3", label: "시·도지사", hasWiw: false },
  { code: "4", label: "시·군·구청장", hasWiw: true },
  { code: "11", label: "교육감", hasWiw: false },
];

interface WinnerRow {
  sgId?: string;
  sgTypecode?: string;
  huboid?: string;
  name?: string;
  jdName?: string; // 정당
  sdName?: string; // 시·도
  wiwName?: string; // 시·군·구
  sggName?: string;
}

interface PledgeRow {
  // prms* 1~10 dynamic — 인덱스 동적
  [key: string]: unknown;
  cnddtId?: string;
  krName?: string;
  partyName?: string;
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
    // NEC raw 키는 prmmCont* (publishMain content) — 우리가 prmsCont로 잘못
    // 읽어서 빈 문자열만 저장하던 버그 수정.
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

async function fetchWinners(
  sgId: string,
  sgTypecode: string,
): Promise<WinnerRow[]> {
  return fetchAllNecPages<WinnerRow>(
    "WinnerInfoInqireService2",
    "getWinnerInfoInqire",
    { sgId, sgTypecode },
    { pageSize: 100, delayMs: 400 },
  );
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
  const sgId = process.argv[2] ?? "20220601";
  const filterCode = process.argv[3]; // 선택적 sgTypecode 필터
  console.log(
    `\n📜 단체장 공약 ingest 시작 (sgId=${sgId}${filterCode ? `, sgTypecode=${filterCode}만` : ""})`,
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const codesToProcess = filterCode
    ? SG_TYPECODES.filter((t) => t.code === filterCode)
    : SG_TYPECODES;
  for (const { code, label, hasWiw } of codesToProcess) {
    console.log(`\n── sgTypecode=${code} (${label}) ──`);
    const winners = await fetchWinners(sgId, code);
    console.log(`  당선자 ${winners.length}명`);

    for (const w of winners) {
      const huboid = w.huboid?.trim();
      const name = w.name?.trim();
      if (!huboid || !name) {
        totalSkipped++;
        continue;
      }
      try {
        const pledges = await fetchPledges(sgId, code, huboid);
        if (pledges.length === 0) {
          totalSkipped++;
          continue;
        }
        // ElecPrms API는 후보자당 한 행 (prms1~10). 첫 행만 사용.
        const row = pledges[0]!;
        const list = extractPledges(row);
        if (list.length === 0) {
          totalSkipped++;
          continue;
        }
        await prisma.electedOfficialPledge.upsert({
          where: {
            electionId_cnddtId: { electionId: sgId, cnddtId: huboid },
          },
          create: {
            electionId: sgId,
            sgTypecode: code,
            positionLabel: label,
            cnddtId: huboid,
            name,
            party: w.jdName ?? null,
            sido: w.sdName ?? null,
            wiwName: hasWiw ? (w.wiwName ?? null) : null,
            pledges: list as unknown as Prisma.InputJsonValue,
            rawSourceJson: row as unknown as Prisma.InputJsonValue,
          },
          update: {
            sgTypecode: code,
            positionLabel: label,
            name,
            party: w.jdName ?? null,
            sido: w.sdName ?? null,
            wiwName: hasWiw ? (w.wiwName ?? null) : null,
            pledges: list as unknown as Prisma.InputJsonValue,
            rawSourceJson: row as unknown as Prisma.InputJsonValue,
            syncedAt: new Date(),
          },
        });
        totalCreated++;
        if (totalCreated % 20 === 0) {
          console.log(`  ✅ ${totalCreated}명 처리…`);
        }
      } catch (err) {
        totalFailed++;
        console.warn(`  ⚠️  ${name} (${huboid}) 실패:`, err);
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

/**
 * 9회 전국동시지방선거(20260603) 당선/낙선 결과 ingest.
 *
 * 데이터 소스: NEC WinnerInfoInqireService2 (당선자) + ElectInqireService2 (전체 결과)
 *   - WinnerInfoInqireService2: 당선자 메타 (huboid, name, 정당, 득표수, 득표율 등)
 *   - 낙선자는 등록된 Candidate 중 당선자에 없는 후보를 DEFEATED로 마킹.
 *
 * sgTypecode (선거 유형):
 *   3  = 시·도지사 (GOVERNOR)
 *   4  = 시·군·구 단체장 (MAYOR)
 *   5  = 시·도의원 (PROVINCIAL_COUNCIL)
 *   6  = 시·군·구의원 (BASIC_COUNCIL)
 *   7  = 시·도의원 비례 (PROVINCIAL_PROPORTIONAL)
 *   8  = 시·군·구의원 비례 (BASIC_PROPORTIONAL)
 *   11 = 교육감 (SUPERINTENDENT)
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/electionResults.ts [sgId]
 *   기본 sgId: 20260603 (9회 지선)
 *
 * 멱등: 같은 sgId 재실행 시 update 만 일어남.
 */

import { CandidateStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

const SG_TYPECODES = [
  { code: "3", label: "시·도지사" },
  { code: "4", label: "시·군·구 단체장" },
  { code: "5", label: "시·도의원" },
  { code: "6", label: "시·군·구의원" },
  { code: "7", label: "시·도의원 비례" },
  { code: "8", label: "시·군·구의원 비례" },
  { code: "11", label: "교육감" },
];

interface WinnerRow {
  sgId?: string;
  sgTypecode?: string;
  huboid?: string;
  name?: string;
  jdName?: string;
  sdName?: string;
  wiwName?: string;
  sggName?: string;
  // 득표수·득표율 필드 (NEC 응답 키 후보)
  // 확인된 키 (8회 지선 20220601 시도지사 응답): dugsu / dugyul
  dugsu?: string;         // 득표수 (예: "2608277")
  dugyul?: string;        // 득표율 % (예: "59.05")
  vtescnt?: string;
  votegetCnt?: string;
  vtTcnt?: string;
  vtRate?: string;
  votegetRate?: string;
  voteRate?: string;
  [key: string]: unknown;
}

function toInt(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[,\s]/g, "");
  if (!s || s === "-") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[,\s%]/g, "");
  if (!s || s === "-") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// NEC 응답 키 다변성 대응: 여러 후보 키 중 첫 비어있지 않은 값.
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

async function fetchWinners(sgId: string, sgTypecode: string): Promise<WinnerRow[]> {
  return fetchAllNecPages<WinnerRow>(
    "WinnerInfoInqireService2",
    "getWinnerInfoInqire",
    { sgId, sgTypecode },
    { pageSize: 100, delayMs: 400 },
  );
}

export async function ingestElectionResults(sgId: string): Promise<void> {
  console.log(`\n🗳️  선거 결과 ingest 시작 (sgId=${sgId})`);
  const NOW = new Date();
  const electionId = sgId; // Candidate.electionId 와 동일 포맷.

  let totalWinners = 0;
  let totalMarkedElected = 0;
  let totalMarkedDefeated = 0;
  let totalUnmatched = 0;
  const unmatchedSamples: string[] = [];

  // 1. 모든 sgTypecode를 돌며 당선자 수집 + Candidate 업데이트
  for (const t of SG_TYPECODES) {
    console.log(`\n📌 ${t.label} (sgTypecode=${t.code}) 당선자 fetch…`);
    let winners: WinnerRow[] = [];
    try {
      winners = await fetchWinners(sgId, t.code);
    } catch (e) {
      console.error(`  fetch 실패 (${t.label}):`, (e as Error).message);
      continue;
    }
    console.log(`  당선자 ${winners.length}명`);
    totalWinners += winners.length;

    const electedHuboids = new Set<string>();
    for (const w of winners) {
      const huboid = String(w.huboid ?? "").trim();
      if (!huboid) continue;
      electedHuboids.add(huboid);

      const voteCount = toInt(pick(w, ["dugsu", "vtescnt", "votegetCnt", "vtTcnt", "voteCount"]));
      const voteRate = toFloat(pick(w, ["dugyul", "vtRate", "votegetRate", "voteRate", "vtRatio"]));

      const updated = await prisma.candidate.updateMany({
        where: { id: huboid, electionId },
        data: {
          status: CandidateStatus.ELECTED,
          voteCount: voteCount ?? undefined,
          voteRate: voteRate ?? undefined,
          rank: 1,
          resultSyncedAt: NOW,
        },
      });
      if (updated.count > 0) totalMarkedElected += updated.count;
      else {
        totalUnmatched++;
        if (unmatchedSamples.length < 10) {
          unmatchedSamples.push(`${w.name ?? "?"}(${huboid})`);
        }
      }
    }
  }

  // 2. 같은 electionId에서 ELECTED가 아닌, 그리고 WITHDRAWN/CANCELLED도 아닌 후보 → DEFEATED
  //    (REGISTERED 상태인데 당선자에 못 들어간 후보들 = 낙선)
  //
  // 안전장치: 당선자가 1명도 fetch 되지 않은 경우엔 DEFEATED 마킹을 건너뜀.
  // (NEC 결과 미공개 시점에 호출하면 모든 후보를 낙선 처리하는 사고 방지)
  if (totalWinners === 0) {
    console.warn(
      `\n⚠️  당선자 0명 — NEC 결과 미공개로 판단, DEFEATED 마킹 건너뜀.` +
      `\n   선거 다음 날 또는 결과 공개 후 다시 실행하세요.`,
    );
  } else {
    const defeated = await prisma.candidate.updateMany({
      where: {
        electionId,
        status: { in: [CandidateStatus.REGISTERED, CandidateStatus.UNKNOWN] },
      },
      data: { status: CandidateStatus.DEFEATED, resultSyncedAt: NOW },
    });
    totalMarkedDefeated = defeated.count;
  }

  console.log(`\n✅ 완료`);
  console.log(`  당선자 fetch 합계: ${totalWinners}`);
  console.log(`  ELECTED 마킹: ${totalMarkedElected}`);
  console.log(`  DEFEATED 마킹: ${totalMarkedDefeated}`);
  console.log(`  Candidate 미매칭 당선자: ${totalUnmatched}`);
  if (unmatchedSamples.length > 0) {
    console.log(`  미매칭 샘플: ${unmatchedSamples.join(", ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sgId = process.argv[2] ?? "20260603";
  ingestElectionResults(sgId)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

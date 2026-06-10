// 시민정치마당(cpmadang.org) 당선인 페이지를 스크래핑하여 ELECTED 마킹.
//
// 출처: https://cpmadang.org/people/list_of_candidates_2026/winner
// 라이선스: 사이트 표기 "모든 자료 및 정보는 자유롭게 복사, 배포, 수정하여 사용할 수 있습니다."
// 원천 데이터: NEC 당선자 명부 (info.nec.go.kr) — 시민정치마당이 수집·게시.
//
// 매칭 키: 카드 썸네일 파일명에 NEC huboid가 포함됨 — Candidate.id와 1:1 매칭.
//   예: src="/sites/default/files/thumbnail.100164084.JPG" → huboid = 100164084
//
// 페이지 구조: ?page=N (0-based), 한 페이지 50명, 총 약 156페이지.
// 당선인 표시: <span class="meta-item status badge-elected">당선인</span>
//
// 멱등 + 안전: 본 스크립트는 ELECTED 마킹만 함 (DEFEATED 마킹 X).
//   NEC OpenAPI 미공개 기간 임시 데이터 보강용. OpenAPI 공개 시 cron이 덮어쓰며
//   득표수/율도 함께 채워줌.

import { CandidateStatus } from "@prisma/client";
import { prisma } from "../src/db.js";

// 주의: /winner 서브패스는 페이지네이션이 작동 안 함 (모든 page=N이 동일 응답).
// canonical URL을 사용하고, 페이지의 모든 카드 = 당선인 가정 (사이트 자체가 "당선인 명단" 뷰).
const BASE_URL = "https://cpmadang.org/people/list_of_candidates_2026";
const MAX_PAGES = 200; // 안전 상한 (실제 ~156)
const DELAY_MS = 600;
const USER_AGENT = "civic-data-bot handspolitics.co.kr (contact: support@handspolitics.co.kr)";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 한 페이지 HTML에서 (huboid, isWinner) 추출.
// 카드 단위로 분할 후 각 카드의 썸네일·당선 배지 검사.
function extractFromPage(html: string): Array<{ huboid: string; winner: boolean }> {
  const results: Array<{ huboid: string; winner: boolean }> = [];

  // 카드 시작 마커로 분할
  const cards = html.split('<div class="candidate-card">');
  // 첫 split 결과는 헤더 부분이므로 버림
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    // 다음 카드 시작 전까지 자르기
    const nextIdx = card.indexOf('<div class="candidate-card">');
    const slice = nextIdx > 0 ? card.slice(0, nextIdx) : card;

    // huboid: thumbnail.{digits}.{ext}
    const thumbMatch = /thumbnail\.(\d{6,})\./.exec(slice);
    if (!thumbMatch) continue;
    const huboid = thumbMatch[1];

    // 당선 배지 존재 여부
    const winner = /badge-elected/.test(slice);

    results.push({ huboid, winner });
  }
  return results;
}

async function fetchPage(pageNo: number): Promise<string> {
  const url = `${BASE_URL}?page=${pageNo}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for page ${pageNo}`);
  }
  return res.text();
}

async function main(): Promise<void> {
  console.log(`🌐 출처: ${BASE_URL}`);
  console.log(`   원천: NEC 당선자 명부 (info.nec.go.kr)`);
  console.log(`   매칭 키: 썸네일 파일명의 huboid → Candidate.id\n`);

  const winnerHuboids = new Set<string>();
  const allHuboids = new Set<string>();

  for (let p = 0; p < MAX_PAGES; p++) {
    let html: string;
    try {
      html = await fetchPage(p);
    } catch (e) {
      console.error(`  page ${p} fetch 실패: ${(e as Error).message}`);
      await sleep(DELAY_MS);
      continue;
    }

    const rows = extractFromPage(html);
    if (rows.length === 0) {
      console.log(`  page ${p}: 카드 0개 → 끝`);
      break;
    }

    const prevSize = winnerHuboids.size;
    let pageWinners = 0;
    for (const r of rows) {
      allHuboids.add(r.huboid);
      if (r.winner) {
        winnerHuboids.add(r.huboid);
        pageWinners++;
      }
    }
    const newWinners = winnerHuboids.size - prevSize;
    console.log(`  page ${p}: 카드 ${rows.length}개 (당선 ${pageWinners}, 신규 ${newWinners}, 누적 ${winnerHuboids.size})`);

    // 새 huboid가 한 명도 추가 안 됐다면 페이지네이션 wrap-around 또는 끝.
    if (p > 0 && newWinners === 0) {
      console.log(`  → 신규 huboid 0명: 페이지 끝으로 판단, 중단.`);
      break;
    }

    if (p < MAX_PAGES - 1) await sleep(DELAY_MS);
  }

  console.log(`\n📊 스크래핑 결과`);
  console.log(`  총 카드: ${allHuboids.size}`);
  console.log(`  당선인 카드: ${winnerHuboids.size}`);

  if (winnerHuboids.size === 0) {
    console.log(`\n⚠️  당선인 0명 — DB 업데이트 건너뜀.`);
    await prisma.$disconnect();
    return;
  }

  // DB UPDATE: id ∈ winnerHuboids AND electionId=20260603 인 후보를 ELECTED로
  const NOW = new Date();
  const ids = Array.from(winnerHuboids);

  // 우선 매칭되는 후보 수 확인
  const matchedRows = await prisma.candidate.findMany({
    where: { id: { in: ids }, electionId: "20260603" },
    select: { id: true, status: true },
  });
  const matchedSet = new Set(matchedRows.map((r) => r.id));
  const alreadyElected = matchedRows.filter((r) => r.status === "ELECTED").length;

  console.log(`\n🔍 DB 매칭`);
  console.log(`  매칭된 Candidate: ${matchedSet.size}/${winnerHuboids.size}`);
  console.log(`  이미 ELECTED: ${alreadyElected}`);
  console.log(`  미매칭(huboid가 DB에 없음): ${winnerHuboids.size - matchedSet.size}`);

  // UPDATE
  const updated = await prisma.candidate.updateMany({
    where: {
      id: { in: ids },
      electionId: "20260603",
      status: { not: CandidateStatus.ELECTED },
    },
    data: {
      status: CandidateStatus.ELECTED,
      resultSyncedAt: NOW,
    },
  });

  console.log(`\n✅ 완료`);
  console.log(`  새로 ELECTED 마킹: ${updated.count}`);
  console.log(`  (rank/voteCount/voteRate는 NEC OpenAPI 공개 시 cron이 보강)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

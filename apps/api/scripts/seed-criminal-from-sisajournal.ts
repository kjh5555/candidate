// 시사저널(sisajournal-vote.pages.dev) 홈페이지에서 9회 지선 후보 전과 데이터 스크래핑.
//
// 시사저널은 NEC info portal이 dynamic API를 막은 상태에서도 살아있는
// static PDF URL(info.nec.go.kr/unielec_pdf_file/...)을 직접 링크함.
// 우리도 그 PDF URL을 가져와 Candidate.criminalRecordPdfUrl에 저장.
//
// 카드 구조:
//   <li class="cand" id="c{huboid}" data-has-crime="0|1" ...>
//     <span class="crime-cnt">N건</span>  또는  <span class="crime-cnt zero">없음</span>
//     <a class="pdf-btn" href="/pdf/{huboid}?u={URL-encoded NEC PDF URL}">
//
// 라이선스: 시사저널 운영, 출처는 NEC 공개 PDF (사실 정보 + 공공 데이터).
//
// 매칭 키: huboid → Candidate.id (1:1, NEC 공식 ID).

import { prisma } from "../src/db.js";

const URL_TARGET = "https://sisajournal-vote.pages.dev/";
const USER_AGENT = "civic-data-bot handspolitics.co.kr";

interface Card {
  huboid: string;
  hasCrime: boolean;
  crimeCount: number | null;
  pdfUrl: string | null;
}

function extractCards(html: string): Card[] {
  const results: Card[] = [];

  // 카드 단위로 자르기 — <li class="cand" id="cXXX" ...> 로 시작
  // 다음 카드의 <li class="cand" 가 나올 때까지가 한 카드.
  const cardRegex = /<li class="cand" id="c(\d+)"[^>]*data-has-crime="([01])"[^>]*>([\s\S]*?)(?=<li class="cand" id="c\d+"|<\/ul>)/g;

  let m: RegExpExecArray | null;
  while ((m = cardRegex.exec(html)) !== null) {
    const huboid = m[1];
    const hasCrime = m[2] === "1";
    const body = m[3];

    // 전과 건수
    let crimeCount: number | null = null;
    if (hasCrime) {
      const cntMatch = /<span class="crime-cnt"[^>]*>(\d+)건<\/span>/.exec(body);
      if (cntMatch) crimeCount = parseInt(cntMatch[1], 10);
    } else {
      crimeCount = 0;
    }

    // PDF URL
    let pdfUrl: string | null = null;
    const pdfMatch = /<a class="pdf-btn"[^>]*href="\/pdf\/\d+\?u=([^"]+)"/.exec(body);
    if (pdfMatch) {
      try {
        pdfUrl = decodeURIComponent(pdfMatch[1]);
      } catch {
        pdfUrl = null;
      }
    }

    results.push({ huboid, hasCrime, crimeCount, pdfUrl });
  }

  return results;
}

async function main(): Promise<void> {
  console.log(`🌐 출처: ${URL_TARGET}`);
  console.log(`   PDF 원본: NEC info.nec.go.kr/unielec_pdf_file/ (공공 데이터)\n`);

  console.log("페이지 fetch 중…");
  const res = await fetch(URL_TARGET, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  console.log(`  HTML ${(html.length / 1024).toFixed(0)} KB 수신`);

  const cards = extractCards(html);
  console.log(`  카드 추출: ${cards.length}개`);

  const withCrime = cards.filter((c) => c.hasCrime);
  const withPdf = cards.filter((c) => c.pdfUrl);
  console.log(`  전과 보유: ${withCrime.length}`);
  console.log(`  PDF URL 추출: ${withPdf.length}\n`);

  if (cards.length === 0) {
    console.log("⚠️  카드 0개 — 페이지 구조 변경 또는 fetch 실패. 중단.");
    await prisma.$disconnect();
    return;
  }

  // DB 매칭 + 업데이트
  const NOW = new Date();
  let updated = 0;
  let unmatched = 0;
  const unmatchedSample: string[] = [];

  // 청크 단위 업데이트 (100명씩 트랜잭션) — Railway PG 연결 timeout 방지
  const CHUNK_SIZE = 100;
  for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
    const chunk = cards.slice(i, i + CHUNK_SIZE);

    // 매칭 가능한 후보만 미리 조회
    const ids = chunk.map((c) => c.huboid);
    const exists = await prisma.candidate.findMany({
      where: { id: { in: ids }, electionId: "20260603" },
      select: { id: true },
    });
    const existsSet = new Set(exists.map((e) => e.id));

    const ops = [] as Array<ReturnType<typeof prisma.candidate.update>>;
    for (const card of chunk) {
      if (!existsSet.has(card.huboid)) {
        unmatched++;
        if (unmatchedSample.length < 10) unmatchedSample.push(card.huboid);
        continue;
      }
      ops.push(
        prisma.candidate.update({
          where: { id: card.huboid },
          data: {
            hasCriminalRecord: card.hasCrime,
            criminalRecordCount: card.crimeCount,
            criminalRecordPdfUrl: card.pdfUrl,
            backgroundLastSyncedAt: NOW,
          },
        }),
      );
    }
    if (ops.length > 0) {
      await prisma.$transaction(ops);
      updated += ops.length;
    }

    console.log(`  ${Math.min(i + CHUNK_SIZE, cards.length)}/${cards.length} 처리 (누적 업데이트 ${updated})`);
  }

  console.log(`\n✅ 완료`);
  console.log(`  업데이트: ${updated}`);
  console.log(`  미매칭(huboid가 DB에 없음): ${unmatched}`);
  if (unmatchedSample.length > 0) {
    console.log(`  미매칭 샘플: ${unmatchedSample.join(", ")}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

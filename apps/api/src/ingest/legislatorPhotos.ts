// ALLNAMEMBER API에서 국회의원 사진 URL을 가져와 DB에 업데이트하는 ingest 모듈.
// 22대 의원 필터링을 통해 현역 의원의 최신 사진만 반영한다.

import { prisma } from "../db.js";
import { fetchAllPages } from "./utils/apiClient.js";

// ALLNAMEMBER API 응답 행 타입
interface AllNameMemberRow {
  NAAS_CD: string;       // 의원코드 (MONA_CD와 동일)
  NAAS_NM?: string;      // 의원명
  PLPT_NM?: string;      // 정당명
  ELECD_NM?: string;     // 선거구명
  GTELT_ERACO?: string;  // 당선대수 (예: "제22대")
  NAAS_PIC?: string;     // 사진 URL
}

/**
 * ALLNAMEMBER API에서 22대 의원 사진 URL을 가져와 Legislator 레코드에 업데이트한다.
 * - PROVINCIAL/BASIC 의원은 별도 소스이므로 NATIONAL만 처리.
 * - NAAS_CD가 여러 대에 걸쳐 동일할 수 있으므로 반드시 22대만 필터링.
 */
export async function ingestLegislatorPhotos(): Promise<void> {
  console.log("[legislator-photos] ALLNAMEMBER API에서 전체 페이지 수집 중...");

  // 전체 역대 의원 데이터 수집 (pageSize=1000으로 최소 요청 횟수)
  const allRows = await fetchAllPages<AllNameMemberRow>("ALLNAMEMBER", {}, {
    pageSize: 1000,
    delayMs: 300,
  });

  console.log(`[legislator-photos] 총 ${allRows.length}건 수신. 22대 필터링 중...`);

  // 22대 의원만 필터링하고 NAAS_CD → NAAS_PIC 맵 구성
  // (22대 중복 NAAS_CD가 있다면 마지막 값을 사용하지만 실제로는 없어야 함)
  const photoMap = new Map<string, string>();
  const nameMap = new Map<string, string>();

  for (const row of allRows) {
    if (!row.NAAS_CD) continue;
    // "제22대" 포함 여부로 22대 필터링
    if (!row.GTELT_ERACO?.includes("제22대")) continue;
    if (!row.NAAS_PIC) continue;

    photoMap.set(row.NAAS_CD, row.NAAS_PIC);
    if (row.NAAS_NM) nameMap.set(row.NAAS_CD, row.NAAS_NM);
  }

  console.log(`[legislator-photos] 22대 사진 보유 의원: ${photoMap.size}명`);

  // DB에서 NATIONAL 의원 목록 조회
  const legislators = await prisma.legislator.findMany({
    where: { level: "NATIONAL" },
    select: { id: true, name: true },
  });

  console.log(`[legislator-photos] DB NATIONAL 의원: ${legislators.length}명. 업데이트 시작...`);

  let matched = 0;
  let updated = 0;
  const samples: Array<{ name: string; photoUrl: string }> = [];

  for (const legislator of legislators) {
    const photoUrl = photoMap.get(legislator.id);
    if (!photoUrl) continue;

    matched += 1;

    try {
      await prisma.legislator.update({
        where: { id: legislator.id },
        data: { photoUrl },
      });
      updated += 1;

      // 샘플 3건 수집
      if (samples.length < 3) {
        samples.push({ name: legislator.name, photoUrl });
      }
    } catch (err) {
      console.error(`[legislator-photos] 업데이트 실패 ${legislator.id}:`, err);
    }
  }

  console.log(
    `[legislator-photos] 완료. 매칭: ${matched}/${legislators.length}, 업데이트: ${updated}건`,
  );

  // 샘플 3건 출력
  if (samples.length > 0) {
    console.log("[legislator-photos] 샘플 (의원명 + 사진 URL):");
    for (const s of samples) {
      console.log(`  - ${s.name}: ${s.photoUrl}`);
    }
  }
}

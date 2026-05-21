// Ingest 단체장 사진 from NEC info.nec.go.kr photo URL 패턴.
//
// URL 패턴:
//   https://info.nec.go.kr/photo_<sgId>/Gsg<sggCode>/Hb<huboid>/gicho/thumbnail.<huboid>.JPG
//
// 광역단체장(sgTypecode=3)·교육감(sgTypecode=11)은 시·도 단위라 sggCode가
// `<sido코드>00` 패턴(17개 시·도 매핑 테이블)으로 단순 추정 가능.
// 기초단체장(sgTypecode=4)은 sggCode가 시·군·구별로 흩어져 있어 brute-force
// 필요 — 별도 작업으로 보류.
//
// 검증: HEAD 요청으로 200 응답일 때만 저장.

import { prisma } from "../db.js";

const SGG_CODE_BY_SIDO: Record<string, string> = {
  서울특별시: "1100",
  부산광역시: "2600",
  대구광역시: "2700",
  인천광역시: "2800",
  광주광역시: "2900",
  대전광역시: "3000",
  울산광역시: "3100",
  세종특별자치시: "3600",
  경기도: "4100",
  강원특별자치도: "4200",
  강원도: "4200",
  충청북도: "4300",
  충청남도: "4400",
  전북특별자치도: "4500",
  전라북도: "4500",
  전라남도: "4600",
  경상북도: "4700",
  경상남도: "4800",
  제주특별자치도: "5000",
  제주도: "5000",
};

function buildPhotoUrl(
  sgId: string,
  sggCode: string,
  huboid: string,
): string {
  return `https://info.nec.go.kr/photo_${sgId}/Gsg${sggCode}/Hb${huboid}/gicho/thumbnail.${huboid}.JPG`;
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  const filterCode = process.argv[2]; // 선택적 sgTypecode 필터
  const codes = filterCode ? [filterCode] : ["3", "11"];

  console.log(`📸 단체장 사진 ingest 시작 (sgTypecode: ${codes.join(", ")})`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const targets = await prisma.electedOfficialPledge.findMany({
    where: {
      sgTypecode: { in: codes },
      photoUrl: null,
    },
    select: {
      id: true,
      name: true,
      sgTypecode: true,
      sido: true,
      cnddtId: true,
      electionId: true,
    },
  });
  console.log(`  대상 ${targets.length}명`);

  for (const t of targets) {
    if (!t.sido) {
      skipped++;
      continue;
    }
    const sggCode = SGG_CODE_BY_SIDO[t.sido];
    if (!sggCode) {
      console.warn(`  ⚠️  ${t.sido} sggCode 매핑 없음 (${t.name})`);
      failed++;
      continue;
    }
    const url = buildPhotoUrl(t.electionId, sggCode, t.cnddtId);
    const ok = await probeUrl(url);
    if (!ok) {
      console.warn(`  ❌ ${t.name} (${t.sido}) — URL 404: ${url}`);
      failed++;
      continue;
    }
    await prisma.electedOfficialPledge.update({
      where: { id: t.id },
      data: { photoUrl: url },
    });
    console.log(`  ✅ ${t.name} (${t.sido}) — ${url}`);
    updated++;
  }

  console.log(
    `\n📸 완료 — 업데이트 ${updated}명 / skip ${skipped}명 / 실패 ${failed}명`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

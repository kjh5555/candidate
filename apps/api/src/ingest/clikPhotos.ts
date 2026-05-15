// CLIK assemblyinfo API로 광역·기초의원 사진 URL을 가져와 Legislator.photoUrl 갱신.
//
// 사용법:
//   tsx src/ingest/clikPhotos.ts           — 사진 없는 의원 전체
//   tsx src/ingest/clikPhotos.ts basic     — 기초의원만
//   tsx src/ingest/clikPhotos.ts provincial — 광역의원만
//
// CLIK rate limit: 1일 1000회. 조회 사이 200ms sleep.
// PHOTO URL 구조: https://clik.nanet.go.kr{OFFM_TLPHON}

import { prisma } from "../db.js";

const KEY = process.env.CLIK_API_KEY ?? "";
const CLIK_BASE = "https://clik.nanet.go.kr";
const SLEEP_MS = 250; // 4 req/sec

if (!KEY) {
  console.error("❌ CLIK_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface AssemblyInfoRow {
  DOCID: string;
  RASMBLY_ID: string;
  RASMBLY_NM: string;
  ASEMBY_NM: string;
  PPRTY_NM: string;
  PHOTO_FILE_URL: string;
}

interface AssemblyInfoDetail {
  DOCID: string;
  ASEMBY_NM: string;
  PPRTY_NM: string;
  RASMBLY_ID: string;
  RASMBLY_NM: string;
  PHOTO_FILE_URL: string;
  OFFM_TLPHON: string; // 실제로 사진 경로가 저장된 필드 (이름 이상하지만 CLIK 버그)
  BRTHDY: string;
  ACDMCR_MATTER: string;
  CAREER_MATTER: string;
  MTGNM_KND_NM: string;
}

async function fetchAssemblyInfoDetail(
  docId: string,
): Promise<AssemblyInfoDetail | null> {
  const url =
    `${CLIK_BASE}/openapi/assemblyinfo.do` +
    `?key=${encodeURIComponent(KEY)}&type=json&displayType=detail&docid=${encodeURIComponent(docId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  CLIK detail 오류: ${res.status} (docId=${docId})`);
      return null;
    }
    const arr = (await res.json()) as AssemblyInfoDetail[];
    const d = Array.isArray(arr) ? arr[0] : (arr as AssemblyInfoDetail);
    if (!d || d.DOCID === undefined) return null;
    return d;
  } catch (e) {
    console.warn(`  fetch 실패 (docId=${docId}):`, e);
    return null;
  }
}

async function searchAssemblyInfo(
  name: string,
  rasmblyId?: string,
): Promise<AssemblyInfoRow[]> {
  const params = new URLSearchParams({
    key: KEY,
    type: "json",
    displayType: "list",
    startCount: "0",
    listCount: "10",
    searchType: "ASEMBY_NM",
    searchKeyword: name,
  });
  if (rasmblyId) params.set("rasmblyId", rasmblyId);

  const url = `${CLIK_BASE}/openapi/assemblyinfo.do?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  CLIK list 오류: ${res.status}`);
      return [];
    }
    // CLIK 응답은 [{SERVICE, RESULT_CODE, LIST, ...}] 형태의 배열로 감싸져 옴
    const raw = await res.json();
    const data = Array.isArray(raw) ? raw[0] : raw;
    if (!data || data.RESULT_CODE !== "SUCCESS" || !data.LIST) return [];
    return (data.LIST as { ROW: AssemblyInfoRow }[]).map((x) => x.ROW);
  } catch (e) {
    console.warn(`  fetch 실패 (name=${name}):`, e);
    return [];
  }
}

// rasmblyNm → rasmblyId 캐시 (CLIK list 응답에서 수집)
const rasmblyIdCache = new Map<string, string>();

async function resolveRasmblyId(
  councilName: string,
  legislatorName: string,
): Promise<string | null> {
  const cached = rasmblyIdCache.get(councilName);
  if (cached) return cached;

  // 의원 이름 검색 → rasmblyNm이 councilName과 일치하는 row에서 rasmblyId 추출
  const rows = await searchAssemblyInfo(legislatorName);
  const match = rows.find(
    (r) =>
      r.RASMBLY_NM?.trim() === councilName.trim() ||
      r.RASMBLY_NM?.includes(councilName.split(" ").slice(-1)[0] ?? ""),
  );
  if (match?.RASMBLY_ID) {
    rasmblyIdCache.set(councilName, match.RASMBLY_ID);
    return match.RASMBLY_ID;
  }
  return null;
}

async function getPhotoUrl(
  name: string,
  rasmblyId: string | null,
): Promise<string | null> {
  const rows = await searchAssemblyInfo(name, rasmblyId ?? undefined);
  if (rows.length === 0) return null;

  // 이름 정확 일치 먼저
  const exact = rows.find(
    (r) =>
      r.ASEMBY_NM?.replace(/\s/g, "") === name.replace(/\s/g, ""),
  );
  const row = exact ?? rows[0];
  if (!row) return null;

  // 상세 조회로 사진 경로 확보
  await sleep(SLEEP_MS);
  const detail = await fetchAssemblyInfoDetail(row.DOCID);
  if (!detail) return null;

  // PHOTO_FILE_URL이 비어 있으면 OFFM_TLPHON 사용 (CLIK 데이터 버그 우회)
  const photoPath =
    detail.PHOTO_FILE_URL?.trim() || detail.OFFM_TLPHON?.trim() || "";
  if (!photoPath || photoPath.length < 5) return null;

  // 상대경로 → 절대 URL 변환
  if (photoPath.startsWith("http")) return photoPath;
  return `${CLIK_BASE}${photoPath.startsWith("/") ? "" : "/"}${photoPath}`;
}

async function main() {
  const modeArg = process.argv[2] ?? "all";

  const levelFilter =
    modeArg === "basic"
      ? { level: "BASIC" as const }
      : modeArg === "provincial"
        ? { level: "PROVINCIAL" as const }
        : { level: { in: ["BASIC", "PROVINCIAL"] as ("BASIC" | "PROVINCIAL")[] } };

  console.log(
    `\n📸 CLIK 의원 사진 ingest 시작 (모드: ${modeArg})`,
  );

  // 사진 없는(또는 placeholder) 광역·기초의원 조회
  const legislators = await prisma.legislator.findMany({
    where: {
      ...(modeArg === "all" ? { OR: [{ level: "BASIC" }, { level: "PROVINCIAL" }] } : levelFilter as object),
      OR: [
        { photoUrl: null },
        { photoUrl: "" },
      ],
    },
    select: {
      id: true,
      name: true,
      level: true,
      councilName: true,
    },
    orderBy: { councilName: "asc" },
  });

  console.log(`  사진 없는 의원: ${legislators.length}명`);

  let updated = 0;
  let notFound = 0;
  let apiCalls = 0;

  for (const leg of legislators) {
    const { id, name, councilName } = leg;

    // rasmblyId 해석
    let rasmblyId: string | null = null;
    if (councilName) {
      rasmblyId = await resolveRasmblyId(councilName, name);
    }
    apiCalls++;
    await sleep(SLEEP_MS);

    const photoUrl = await getPhotoUrl(name, rasmblyId);
    apiCalls += 2; // list + detail

    if (photoUrl) {
      await prisma.legislator.update({
        where: { id },
        data: { photoUrl },
      });
      updated++;
      console.log(`  ✅ ${name} (${councilName ?? "-"}) → ${photoUrl.slice(0, 80)}`);
    } else {
      notFound++;
      if (notFound % 20 === 0) {
        console.log(
          `  [${updated} 업데이트 / ${notFound} 미발견 / API ${apiCalls}회 호출]`,
        );
      }
    }

    // rate limit 보호: API 호출이 950회 근접하면 경고 후 중단
    if (apiCalls >= 900) {
      console.warn(
        "\n⚠️ 일일 API 호출 한도(1000회)에 근접. 오늘 ingest 종료.",
      );
      break;
    }
  }

  console.log(
    `\n완료: ${updated}명 사진 업데이트 / ${notFound}명 미발견 / API ${apiCalls}회 사용`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});

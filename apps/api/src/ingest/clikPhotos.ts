// CLIK assemblyinfo API로 광역·기초의원 사진 URL을 가져와 Legislator.photoUrl 갱신.
//
// 사용법:
//   tsx src/ingest/clikPhotos.ts           — 사진 없는 의원 전체
//   tsx src/ingest/clikPhotos.ts basic     — 기초의원만
//   tsx src/ingest/clikPhotos.ts provincial — 광역의원만
//
// CLIK rate limit: 1일 1000회. 조회 사이 250ms sleep (4 req/sec).
//
// 전략:
//   1) 사진 없는 의원을 councilName 그룹으로 정리
//   2) 그룹별로 ONE 검색 → rasmblyId 해석 (1회)
//   3) 그룹 내 각 의원마다 list+detail 호출 (2회)
//   ~ 의원당 평균 2.X 호출 → 일 ~400명 처리 가능
//
// 사진 위치: 명세상 PHOTO_FILE_URL이지만 일부 의원은 OFFM_TLPHON에 (CLIK 데이터 quirk).
// 두 필드 모두 확인.

import { prisma } from "../db.js";

const KEY = process.env.CLIK_API_KEY ?? "";
const CLIK_BASE = "https://clik.nanet.go.kr";
const SLEEP_MS = 250;
const MAX_API_CALLS = 900; // 안전 마진 (실제 한도 1000)

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
  OFFM_TLPHON: string; // CLIK 데이터 quirk: 일부 의원은 여기에 사진 경로
  BRTHDY: string;
  HMPG: string;
}

let apiCallsToday = 0;

async function callClik(params: Record<string, string>): Promise<unknown> {
  apiCallsToday++;
  const qs = new URLSearchParams({ ...params, key: KEY }).toString();
  const url = `${CLIK_BASE}/openapi/assemblyinfo.do?${qs}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  CLIK 오류: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`  fetch 실패:`, e);
    return null;
  }
}

function unwrapResponse<T>(raw: unknown): T | null {
  if (!raw) return null;
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") return null;
  const obj = data as { RESULT_CODE?: string };
  if (obj.RESULT_CODE === "ERROR09") {
    console.error("\n❌ CLIK 일별 한도 초과 (ERROR09). 내일 다시 시도하세요.");
    return null;
  }
  if (obj.RESULT_CODE !== "SUCCESS") {
    console.warn(`  CLIK RESULT_CODE: ${obj.RESULT_CODE}`);
    return null;
  }
  return data as T;
}

async function searchByNameAndId(
  name: string,
  rasmblyId?: string,
): Promise<AssemblyInfoRow[]> {
  const params: Record<string, string> = {
    type: "json",
    displayType: "list",
    startCount: "0",
    listCount: "10",
    searchType: "ASEMBY_NM",
    searchKeyword: name,
  };
  if (rasmblyId) params.rasmblyId = rasmblyId;
  const raw = await callClik(params);
  const data = unwrapResponse<{ LIST?: { ROW: AssemblyInfoRow }[] }>(raw);
  if (!data?.LIST) return [];
  return data.LIST.map((x) => x.ROW);
}

async function fetchDetail(docId: string): Promise<AssemblyInfoDetail | null> {
  const raw = await callClik({
    type: "json",
    displayType: "detail",
    docid: docId,
  });
  return unwrapResponse<AssemblyInfoDetail>(raw);
}

function extractPhotoPath(detail: AssemblyInfoDetail): string | null {
  // 명세상 PHOTO_FILE_URL이 표준이지만, 일부 CLIK 데이터는 OFFM_TLPHON에 사진 경로 (데이터 quirk)
  const candidates = [
    detail.PHOTO_FILE_URL?.trim(),
    detail.OFFM_TLPHON?.trim(),
  ].filter((v): v is string => !!v && v.length > 5);
  for (const c of candidates) {
    // jpg/png/gif/webp 등 이미지 확장자 또는 /clikr-collection/ 경로
    if (
      /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(c) ||
      c.includes("clikr-collection")
    ) {
      return c.startsWith("http")
        ? c
        : `${CLIK_BASE}${c.startsWith("/") ? "" : "/"}${c}`;
    }
  }
  return null;
}

/**
 * Legislator.rawSourceJson에서 sido(시·도 풀네임)를 추출.
 * BASIC: sdName 필드. PROVINCIAL: region 필드 사용.
 */
function extractSido(
  rawSourceJson: unknown,
  region: string | null,
  level: string,
): string | null {
  if (level === "PROVINCIAL") return region;
  if (!rawSourceJson || typeof rawSourceJson !== "object") return null;
  const obj = rawSourceJson as Record<string, unknown>;
  const sd =
    typeof obj.sdName === "string"
      ? obj.sdName
      : typeof obj.SD_NAME === "string"
        ? (obj.SD_NAME as string)
        : null;
  return sd;
}

/**
 * 의회 단위 rasmblyId 해석 캐시.
 * key = (sido + councilName), value = rasmblyId or "MISS"
 */
const councilIdCache = new Map<string, string | "MISS">();

async function resolveCouncilId(
  sido: string | null,
  councilName: string,
  sampleName: string,
): Promise<string | null> {
  const cacheKey = `${sido ?? ""}|${councilName}`;
  const cached = councilIdCache.get(cacheKey);
  if (cached === "MISS") return null;
  if (cached) return cached;

  // CLIK에서 sampleName으로 검색해 sido+councilName 매칭되는 행의 rasmblyId 채택
  const rows = await searchByNameAndId(sampleName);
  await sleep(SLEEP_MS);

  // CLIK RASMBLY_NM 포맷: "<sido full> <councilName>" 예: "울산광역시 남구의회"
  const targetNm = sido ? `${sido} ${councilName}`.trim() : councilName.trim();

  let match: AssemblyInfoRow | undefined;
  // 1) 정확 일치
  match = rows.find((r) => r.RASMBLY_NM?.trim() === targetNm);
  // 2) sido prefix가 같고 councilName 포함
  if (!match && sido) {
    match = rows.find(
      (r) =>
        r.RASMBLY_NM?.startsWith(sido) &&
        r.RASMBLY_NM?.includes(councilName.replace("의회", "")),
    );
  }
  // 3) sido 없으면 councilName 포함 (모호하지만 fallback)
  if (!match) {
    match = rows.find((r) =>
      r.RASMBLY_NM?.includes(councilName.replace("의회", "")),
    );
  }

  if (match?.RASMBLY_ID) {
    councilIdCache.set(cacheKey, match.RASMBLY_ID);
    return match.RASMBLY_ID;
  }
  councilIdCache.set(cacheKey, "MISS");
  return null;
}

async function processLegislator(input: {
  id: string;
  name: string;
  rasmblyId: string;
}): Promise<{ ok: boolean; url: string | null }> {
  const rows = await searchByNameAndId(input.name, input.rasmblyId);
  await sleep(SLEEP_MS);
  if (rows.length === 0) return { ok: false, url: null };

  // 정확 이름 일치 우선
  const exact =
    rows.find((r) => r.ASEMBY_NM?.replace(/\s/g, "") === input.name.replace(/\s/g, "")) ?? rows[0];
  if (!exact) return { ok: false, url: null };

  const detail = await fetchDetail(exact.DOCID);
  await sleep(SLEEP_MS);
  if (!detail) return { ok: false, url: null };

  const photoUrl = extractPhotoPath(detail);
  if (!photoUrl) return { ok: false, url: null };

  await prisma.legislator.update({
    where: { id: input.id },
    data: { photoUrl },
  });
  return { ok: true, url: photoUrl };
}

async function main() {
  const modeArg = process.argv[2] ?? "all";
  // 두 번째 인자: 최대 처리 의원 수 (테스트용). 미지정 시 한도까지.
  const limitArg = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;

  const levelClause =
    modeArg === "basic"
      ? { level: "BASIC" as const }
      : modeArg === "provincial"
        ? { level: "PROVINCIAL" as const }
        : { level: { in: ["BASIC", "PROVINCIAL"] as ("BASIC" | "PROVINCIAL")[] } };

  console.log(
    `\n📸 CLIK 의원 사진 ingest 시작 (모드: ${modeArg}${Number.isFinite(limitArg) ? `, 최대 ${limitArg}명` : ""})`,
  );

  const legislators = await prisma.legislator.findMany({
    where: {
      ...levelClause,
      OR: [{ photoUrl: null }, { photoUrl: "" }],
    },
    select: {
      id: true,
      name: true,
      level: true,
      councilName: true,
      region: true,
      rawSourceJson: true,
    },
    orderBy: [{ councilName: "asc" }, { name: "asc" }],
  });

  console.log(`  사진 없는 의원: ${legislators.length}명`);

  // 의회 단위로 그룹핑
  const groups = new Map<
    string,
    { sido: string | null; councilName: string; members: typeof legislators }
  >();
  for (const leg of legislators) {
    if (!leg.councilName) continue; // councilName 없는 의원은 매칭 불가
    const sido = extractSido(leg.rawSourceJson, leg.region, leg.level);
    const key = `${sido ?? ""}|${leg.councilName}`;
    const grp = groups.get(key) ?? {
      sido,
      councilName: leg.councilName,
      members: [] as typeof legislators,
    };
    grp.members.push(leg);
    groups.set(key, grp);
  }

  const groupCount = groups.size;
  const memberTotal = Array.from(groups.values()).reduce(
    (a, g) => a + g.members.length,
    0,
  );
  const estCalls = groupCount * 1 + memberTotal * 2;
  console.log(
    `  의회 그룹: ${groupCount}개 / 매칭 대상 의원: ${memberTotal}명 / 예상 API 호출: ~${estCalls}회 (한도 ${MAX_API_CALLS})`,
  );

  let updated = 0;
  let notFound = 0;
  let groupIdx = 0;

  outer: for (const grp of groups.values()) {
    groupIdx++;
    if (apiCallsToday >= MAX_API_CALLS) {
      console.warn(
        `\n⚠️ API 호출 한도 ${MAX_API_CALLS}회 근접. 오늘 종료. (처리: ${updated}명 / ${groupIdx - 1}/${groupCount}개 그룹)`,
      );
      break;
    }
    if (updated + notFound >= limitArg) {
      break;
    }

    // 의회 ID 해석 — 첫 멤버 이름으로 1회 검색
    const rasmblyId = await resolveCouncilId(
      grp.sido,
      grp.councilName,
      grp.members[0]!.name,
    );
    if (!rasmblyId) {
      console.log(
        `  ⏭️  [${groupIdx}/${groupCount}] ${grp.sido ?? ""} ${grp.councilName} — CLIK에서 의회 ID 찾지 못함, ${grp.members.length}명 skip`,
      );
      notFound += grp.members.length;
      continue;
    }

    console.log(
      `  📂 [${groupIdx}/${groupCount}] ${grp.sido ?? ""} ${grp.councilName} (rasmblyId=${rasmblyId}, ${grp.members.length}명)`,
    );

    for (const m of grp.members) {
      if (apiCallsToday >= MAX_API_CALLS) break;
      if (updated + notFound >= limitArg) {
        console.log(`\n  ⏸️  테스트 한도 ${limitArg}명 도달, 종료.`);
        break outer;
      }
      const res = await processLegislator({
        id: m.id,
        name: m.name,
        rasmblyId,
      });
      if (res.ok) {
        updated++;
        console.log(
          `    ✅ ${m.name} → ${res.url?.slice(0, 80)}${(res.url?.length ?? 0) > 80 ? "…" : ""}`,
        );
      } else {
        notFound++;
      }
    }
  }

  console.log(
    `\n완료: ${updated}명 사진 업데이트 / ${notFound}명 미발견 / API ${apiCallsToday}회 사용`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});

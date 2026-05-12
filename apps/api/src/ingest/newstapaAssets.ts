/**
 * 광역의원 / 기초의원 재산공개 데이터 수집 (뉴스타파 jaesan.newstapa.org)
 *
 * 출처: 뉴스타파 "공직자 재산정보"  https://jaesan.newstapa.org
 *
 * 발견된 비공식 API (2026-05 기준):
 *   GET https://jaesan.newstapa.org/api/search?q=의회사무처&page=N
 *     → { totalLength: number, results: [{ uniqueId, peopleId, name, belong, position,
 *                                          open_year_first, open_year_last,
 *                                          price_total_last }], total }
 *     - 50개 / page
 *     - q는 belong / name / position 부분일치
 *     - 'belong' 예: "서울특별시 의회사무처", "경기도 의회사무처", "전북특별자치도 의회사무처"
 *     - 기초의회: "서울특별시 강남구의회", "경기도 안양시의회" 등
 *
 *   GET https://jaesan.newstapa.org/people/{uniqueId}
 *     → Next.js 서버 컴포넌트 HTML. 데이터는 `self.__next_f.push(...)` 청크에
 *       JSON 으로 인라인됨. 가장 최근 연도(open_year)의 `summary` 배열에서
 *       카테고리별 `value_now` 추출.  단위는 **천원** (× 0.001 = 만원 / 10).
 *       채무는 `value_now` 가 음수.
 *
 * 매칭:
 *   PROVINCIAL: prisma.legislator × {name, region(시·도)} → Newstapa person
 *   BASIC:      prisma.legislator × {name, region(시·군·구)} → Newstapa person
 *
 * 단위 변환: 천원 → 만원  (÷ 10)
 *
 * CLI:
 *   pnpm --filter @repo/api ingest provincial-assets
 *   pnpm --filter @repo/api ingest newstapa-provincial
 *   pnpm --filter @repo/api ingest basic-assets
 *   pnpm --filter @repo/api ingest newstapa-basic
 */

import { prisma } from "../db.js";

// ─── Constants ────────────────────────────────────────────────

const BASE = "https://jaesan.newstapa.org";
const USER_AGENT = "Mozilla/5.0 (compatible; civic-data/0.1)";
const DETAIL_DELAY_MS = 1500;
const SOURCE_NAME = "뉴스타파 (jaesan.newstapa.org)";

/**
 * Newstapa `belong` 문자열에서 시·도 이름을 추출하기 위한 매핑.
 * DB region 값 (legislatorHuboids 가 채워둔 sdName) 과 일치시킨다.
 */
const NEWSTAPA_BELONG_TO_DB_REGION: Record<string, string> = {
  "서울특별시 의회사무처": "서울특별시",
  "부산광역시 의회사무처": "부산광역시",
  "대구광역시 의회사무처": "대구광역시",
  "인천광역시 의회사무처": "인천광역시",
  "광주광역시 의회사무처": "광주광역시",
  "대전광역시 의회사무처": "대전광역시",
  "울산광역시 의회사무처": "울산광역시",
  "세종특별자치시 의회사무처": "세종특별자치시",
  "경기도 의회사무처": "경기도",
  "강원특별자치도 의회사무처": "강원도", // DB 는 옛 명칭 유지
  "충청북도 의회사무처": "충청북도",
  "충청남도 의회사무처": "충청남도",
  "전북특별자치도 의회사무처": "전라북도", // DB 는 옛 명칭 유지
  "전라남도 의회사무처": "전라남도",
  "경상북도 의회사무처": "경상북도",
  "경상남도 의회사무처": "경상남도",
  "제주특별자치도 의회사무처": "제주특별자치도",
  // 변종 (사무처 없는 belong) — 뉴스타파 DB 에 1건 있음
  "서울특별시 의회": "서울특별시",
};

const ALLOWED_POSITIONS = new Set(["의원", "의장"]);

// ─── Types ────────────────────────────────────────────────────

interface NewstapaSearchHit {
  peopleId: string;
  uniqueId: string;
  name: string;
  belong: string;
  position: string;
  open_year_first: string;
  open_year_last: string;
  price_total_last: string | number;
}

interface NewstapaSearchResponse {
  totalLength: number;
  results: NewstapaSearchHit[];
  total?: number;
}

interface SummaryRow {
  prop_1: string;
  value_now: number;
  price_ratio?: number | string;
}

interface YearBreakdown {
  open_year: string;
  price_now: number;
  summary: SummaryRow[];
}

// ─── HTTP helpers ─────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Search enumeration ──────────────────────────────────────

/**
 * Iterate every page of `q=의회사무처`. The API returns 50 hits / page.
 */
async function* enumerateProvincialMembers(): AsyncGenerator<NewstapaSearchHit> {
  const q = encodeURIComponent("의회사무처");
  // First page to learn totalLength.
  const first = await fetchJson<NewstapaSearchResponse>(`${BASE}/api/search?q=${q}&page=1`);
  const total = first.totalLength;
  for (const h of first.results) yield h;
  const pageSize = first.results.length || 50;
  const lastPage = Math.ceil(total / pageSize);
  for (let page = 2; page <= lastPage; page++) {
    await sleep(300); // gentle pacing on the search API
    const data = await fetchJson<NewstapaSearchResponse>(`${BASE}/api/search?q=${q}&page=${page}`);
    for (const h of data.results) yield h;
  }
}

/**
 * Iterate every page of a single basic council query (e.g. "강남구의회").
 * Yields all search hits without position filtering — caller handles that.
 */
async function* enumerateBasicCouncilMembers(
  councilQuery: string,
): AsyncGenerator<NewstapaSearchHit> {
  const q = encodeURIComponent(councilQuery);
  let first: NewstapaSearchResponse;
  try {
    first = await fetchJson<NewstapaSearchResponse>(`${BASE}/api/search?q=${q}&page=1`);
  } catch (err) {
    console.warn(`[basic-assets] 검색 실패 (q="${councilQuery}"): ${(err as Error).message}`);
    return;
  }
  const total = first.totalLength;
  if (total === 0) return;
  for (const h of first.results) yield h;
  const pageSize = first.results.length || 50;
  const lastPage = Math.ceil(total / pageSize);
  for (let page = 2; page <= lastPage; page++) {
    await sleep(300);
    try {
      const data = await fetchJson<NewstapaSearchResponse>(`${BASE}/api/search?q=${q}&page=${page}`);
      for (const h of data.results) yield h;
    } catch (err) {
      console.warn(
        `[basic-assets] 페이지 fetch 실패 (q="${councilQuery}" page=${page}): ${(err as Error).message}`,
      );
    }
  }
}

// ─── Detail page parser ──────────────────────────────────────

/**
 * Extract the `self.__next_f.push([1, "..."])` JS-string payloads, decode them,
 * and return the resulting concatenated server-payload text.
 * Next.js streams data with mojibake-style UTF-8: the JS string contains
 * `\uXXXX` escapes that, when decoded as UTF-16 → Latin-1 bytes → UTF-8,
 * recover the original Korean.  We use TextDecoder for this.
 */
function decodeNextStream(html: string): string {
  const pattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    chunks.push(jsUnescape(m[1] ?? ""));
  }
  return chunks.join("");
}

function jsUnescape(raw: string): string {
  // Convert JS string escapes (\n, \t, \", \\, \uXXXX, \xXX) into characters,
  // then if the resulting code-points are all < 256 and form valid UTF-8 we
  // re-decode as UTF-8 to fix the Latin-1 ↔ UTF-8 mojibake.
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    if (ch === 0x5c /* \ */ && i + 1 < raw.length) {
      const next = raw[i + 1]!;
      if (next === "u" && i + 5 < raw.length) {
        const hex = raw.slice(i + 2, i + 6);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else if (next === "x" && i + 3 < raw.length) {
        const hex = raw.slice(i + 2, i + 4);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
      } else if (next === "n") {
        out += "\n";
        i++;
      } else if (next === "r") {
        out += "\r";
        i++;
      } else if (next === "t") {
        out += "\t";
        i++;
      } else if (next === '"' || next === "\\" || next === "/") {
        out += next;
        i++;
      } else {
        out += next;
        i++;
      }
    } else {
      out += raw[i];
    }
  }
  // De-mojibake: each char code is a latin-1 byte. Re-decode as UTF-8.
  const bytes = new Uint8Array(out.length);
  let allByteSized = true;
  for (let i = 0; i < out.length; i++) {
    const c = out.charCodeAt(i);
    if (c > 0xff) {
      allByteSized = false;
      break;
    }
    bytes[i] = c;
  }
  if (allByteSized) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return out;
    }
  }
  return out;
}

/**
 * Find every per-year breakdown block in the decoded stream and return the
 * one with the highest `open_year`.
 *
 * The block we're looking for looks like:
 *   "open_year":"2026",...,"price_now":N,"summary":[...]
 */
function extractLatestYearBreakdown(streamText: string): YearBreakdown | null {
  // Find every `"open_year":"<year>"` occurrence.
  const yearPattern = /"open_year":"(\d{4})","institution":/g;
  const candidates: Array<{ year: number; offset: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = yearPattern.exec(streamText)) !== null) {
    candidates.push({ year: parseInt(m[1]!, 10), offset: m.index });
  }
  if (candidates.length === 0) return null;
  // Pick latest year.
  candidates.sort((a, b) => b.year - a.year);
  const best = candidates[0]!;

  // From this offset, capture up to `"summary":[...] ` — i.e. the array that follows.
  // We need to find the matching `]` that closes the summary array.
  const slice = streamText.slice(best.offset);
  const summaryIdx = slice.indexOf('"summary":[');
  if (summaryIdx === -1) return null;
  const arrStart = summaryIdx + '"summary":'.length;
  const arrEnd = findMatchingBracket(slice, arrStart);
  if (arrEnd === -1) return null;
  const summaryJson = slice.slice(arrStart, arrEnd + 1);

  // price_now
  const priceMatch = slice.match(/"price_now":(-?\d+)/);
  const priceNow = priceMatch ? parseInt(priceMatch[1]!, 10) : 0;

  let summary: SummaryRow[];
  try {
    summary = JSON.parse(summaryJson) as SummaryRow[];
  } catch {
    return null;
  }

  return { open_year: String(best.year), price_now: priceNow, summary };
}

/** Find the index of the matching `]` for the `[` at `startIdx` (inclusive). */
function findMatchingBracket(text: string, startIdx: number): number {
  if (text[startIdx] !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── Category aggregation ────────────────────────────────────

interface CategoryTotals {
  realEstate: bigint;
  cash: bigint;
  securities: bigint;
  debt: bigint; // 양수로 저장 (절댓값)
  other: bigint;
}

function classifyProp(prop: string): keyof CategoryTotals | "skip" {
  const c = prop.trim();
  if (c === "토지" || c === "건물" || c.startsWith("부동산에 관한 규정이 준용되는")) {
    return "realEstate";
  }
  if (
    c === "현금" ||
    c === "예금" ||
    c.startsWith("정치자금법")
  ) {
    return "cash";
  }
  if (c === "증권" || c === "채권" || c === "가상자산") {
    return "securities";
  }
  if (c === "채무") {
    return "debt";
  }
  if (c.startsWith("고지거부")) {
    // 고지거부 항목은 합산되지만 별도 카테고리 없음
    return "skip";
  }
  return "other";
}

function aggregateSummary(summary: SummaryRow[]): CategoryTotals {
  const totals: CategoryTotals = {
    realEstate: 0n,
    cash: 0n,
    securities: 0n,
    debt: 0n,
    other: 0n,
  };
  for (const row of summary) {
    const v = BigInt(Math.trunc(row.value_now ?? 0));
    const bucket = classifyProp(row.prop_1);
    if (bucket === "skip") continue;
    if (bucket === "debt") {
      totals.debt += v < 0n ? -v : v;
    } else if (bucket === "realEstate") {
      totals.realEstate += v;
    } else if (bucket === "cash") {
      totals.cash += v;
    } else if (bucket === "securities") {
      totals.securities += v;
    } else {
      totals.other += v;
    }
  }
  return totals;
}

/** 천원 → 만원 (정수 나눗셈) */
function cheonwonToManwon(cheonwon: bigint): bigint {
  return cheonwon / 10n;
}

// ─── Detail fetch & parse ────────────────────────────────────

async function fetchPersonBreakdown(
  uniqueId: string,
): Promise<{ year: number; totals: CategoryTotals; priceNowCheonwon: bigint } | null> {
  const url = `${BASE}/people/${uniqueId}`;
  const html = await fetchText(url);
  if (!html) return null; // 404
  const stream = decodeNextStream(html);
  const breakdown = extractLatestYearBreakdown(stream);
  if (!breakdown) return null;
  return {
    year: parseInt(breakdown.open_year, 10),
    totals: aggregateSummary(breakdown.summary),
    priceNowCheonwon: BigInt(Math.trunc(breakdown.price_now)),
  };
}

// ─── Main ingest ─────────────────────────────────────────────

export async function ingestProvincialAssetsFromNewstapa(): Promise<void> {
  console.log("[provincial-assets] 광역의원 재산 데이터 수집 시작 (뉴스타파)");
  console.log("[provincial-assets] 1단계: 광역의원 목록 enumerate 중…");

  const allHits: NewstapaSearchHit[] = [];
  for await (const hit of enumerateProvincialMembers()) {
    allHits.push(hit);
  }
  console.log(`[provincial-assets] 검색 결과 수집: ${allHits.length}건`);

  // Filter: position ∈ {의원, 의장}, belong 매핑 가능
  const eligible = allHits.filter((h) => {
    if (!ALLOWED_POSITIONS.has(h.position)) return false;
    const belongKey = h.belong.trim();
    return belongKey in NEWSTAPA_BELONG_TO_DB_REGION;
  });
  console.log(
    `[provincial-assets] 필터 적용 후 광역의원 후보: ${eligible.length}건 ` +
      `(position ∈ {의원, 의장}, 17개 시·도 의회사무처 belong 만)`,
  );

  const NOW = new Date();
  let matched = 0;
  let unmatched = 0;
  let parseFailed = 0;
  let fetched = 0;
  const unmatchedNames: Array<{ name: string; region: string }> = [];
  const samples: Array<{
    name: string;
    region: string;
    year: number;
    total: bigint;
  }> = [];

  for (const hit of eligible) {
    const region = NEWSTAPA_BELONG_TO_DB_REGION[hit.belong.trim()]!;
    const name = hit.name.trim();

    // DB 매칭 먼저 — 매칭 안 되면 굳이 fetch 안 함 (속도/예의)
    const candidates = await prisma.legislator.findMany({
      where: { level: "PROVINCIAL", name, region },
      select: { id: true },
    });

    if (candidates.length === 0) {
      unmatched++;
      if (unmatchedNames.length < 10) unmatchedNames.push({ name, region });
      continue;
    }
    if (candidates.length > 1) {
      console.warn(
        `[provincial-assets] 동명이인 다중 매칭: ${name} (${region}) — ${candidates.length}건. 모두 업데이트.`,
      );
    }

    // Detail fetch
    fetched++;
    let breakdown: Awaited<ReturnType<typeof fetchPersonBreakdown>> = null;
    try {
      breakdown = await fetchPersonBreakdown(hit.uniqueId);
    } catch (err) {
      console.warn(
        `[provincial-assets] 상세 페이지 fetch 실패: ${name} (${hit.uniqueId}) — ${(err as Error).message}`,
      );
    }

    // Throttle BEFORE next iteration regardless of outcome
    if (!breakdown) {
      parseFailed++;
      await sleep(DETAIL_DELAY_MS);
      continue;
    }

    const totalManwon = cheonwonToManwon(breakdown.priceNowCheonwon);
    const url = `${BASE}/people/${hit.uniqueId}`;

    for (const leg of candidates) {
      await prisma.legislator.update({
        where: { id: leg.id },
        data: {
          assetTotalManwon: totalManwon,
          assetRealEstateManwon: cheonwonToManwon(breakdown.totals.realEstate),
          assetCashManwon: cheonwonToManwon(breakdown.totals.cash),
          assetSecuritiesManwon: cheonwonToManwon(breakdown.totals.securities),
          assetDebtManwon: cheonwonToManwon(breakdown.totals.debt),
          assetReportYear: breakdown.year,
          assetSourceName: SOURCE_NAME,
          assetSourceUrl: url,
          assetLastSyncedAt: NOW,
        },
      });
    }
    matched++;
    if (samples.length < 3) {
      samples.push({ name, region, year: breakdown.year, total: totalManwon });
    }

    if (matched % 25 === 0) {
      console.log(
        `[provincial-assets] 진행: ${matched + parseFailed}/${eligible.length} ` +
          `(matched=${matched}, parseFail=${parseFailed}, unmatched=${unmatched})`,
      );
    }

    await sleep(DETAIL_DELAY_MS);
  }

  console.log("\n[provincial-assets] 완료");
  console.log(`  - 검색 결과 (의회사무처):      ${allHits.length}`);
  console.log(`  - 광역의원 후보 (의원/의장):   ${eligible.length}`);
  console.log(`  - 상세 페이지 fetch 시도:      ${fetched}`);
  console.log(`  - 매칭 성공 (DB 업데이트):     ${matched}`);
  console.log(`  - 파싱/네트워크 실패:          ${parseFailed}`);
  console.log(`  - DB 미매칭 (이름+region):     ${unmatched}`);

  if (unmatchedNames.length > 0) {
    console.log("[provincial-assets] 미매칭 샘플 (최대 10):");
    for (const u of unmatchedNames) {
      console.log(`    - ${u.name} (${u.region})`);
    }
  }
  if (samples.length > 0) {
    console.log("[provincial-assets] 매칭 샘플 (참고):");
    for (const s of samples) {
      console.log(`    - ${s.name} (${s.region}) ${s.year}년 총액 ${s.total.toString()}만원`);
    }
  }
}

// ─── Basic (기초의원) ingest ──────────────────────────────────

/**
 * Newstapa belong 문자열에서 시·군·구 의회 이름을 추출한다.
 *
 * Newstapa 기초의회 belong 형식:
 *   "서울특별시 강남구의회"     → councilName="강남구의회", region="강남구"
 *   "경기도 안양시의회"          → councilName="안양시의회", region="안양시"
 *   "강원특별자치도 영월군의회"  → councilName="영월군의회", region="영월군"
 *
 * DB의 BASIC legislator.region = 시·군·구 이름 (예: "강남구").
 * DB의 BASIC legislator.councilName = 의회 이름 (예: "강남구의회").
 *
 * 매칭 키: name + councilName (가장 정밀; councilName 이 전국 유니크함)
 */

interface BasicCouncilKey {
  /** DB councilName 값 (예: "강남구의회") — 검색 쿼리로 직접 사용 */
  councilName: string;
  /** DB region 값 = 시·군·구 이름 (예: "강남구") */
  region: string;
}

/**
 * DB에서 BASIC 의원의 모든 distinct (region, councilName) 조합을 읽어
 * Newstapa 검색 쿼리 목록을 생성한다.
 */
async function buildBasicCouncilList(): Promise<BasicCouncilKey[]> {
  const rows = await prisma.legislator.findMany({
    where: { level: "BASIC" },
    select: { region: true, councilName: true },
    distinct: ["region", "councilName"],
  });

  const seen = new Set<string>();
  const list: BasicCouncilKey[] = [];

  for (const row of rows) {
    if (!row.councilName || !row.region) continue;
    const key = `${row.region}|${row.councilName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ councilName: row.councilName, region: row.region });
  }
  return list;
}

/**
 * Newstapa belong 문자열에서 시·군·구 의회 이름을 추출한다.
 * 형식: "<시·도> <시·군·구>의회"
 * Returns the council name portion (e.g. "강남구의회"), or null.
 */
function parseBelongBasicCouncilName(belong: string): string | null {
  const trimmed = belong.trim();
  if (!trimmed.endsWith("의회")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return null;
  const rest = trimmed.slice(spaceIdx + 1); // e.g. "강남구의회"
  if (!rest.endsWith("의회")) return null;
  return rest;
}

export async function ingestBasicAssetsFromNewstapa(): Promise<void> {
  console.log("[basic-assets] 기초의원 재산 데이터 수집 시작 (뉴스타파)");
  console.log("[basic-assets] 1단계: DB에서 기초의회 목록 구성 중…");

  const councils = await buildBasicCouncilList();
  console.log(`[basic-assets] 기초의회 수: ${councils.length}`);

  const NOW = new Date();
  let totalMatched = 0;
  let totalUnmatched = 0;
  let totalParseFailed = 0;
  let totalFetched = 0;
  let totalProcessed = 0;

  const unmatchedSamples: Array<{ name: string; region: string; councilName: string }> = [];
  const matchedSamples: Array<{ name: string; region: string; year: number; total: bigint }> = [];

  for (let ci = 0; ci < councils.length; ci++) {
    const council = councils[ci]!;
    const { councilName, region } = council;

    // Enumerate all Newstapa search hits for this council
    const hits: NewstapaSearchHit[] = [];
    for await (const hit of enumerateBasicCouncilMembers(councilName)) {
      hits.push(hit);
    }
    await sleep(400); // gentle pacing between council queries

    // Filter: position ∈ {의원, 의장} AND belong's council name matches this council
    const eligible = hits.filter((h) => {
      if (!ALLOWED_POSITIONS.has(h.position)) return false;
      const hitCouncil = parseBelongBasicCouncilName(h.belong);
      return hitCouncil === councilName;
    });

    for (const hit of eligible) {
      const name = hit.name.trim();

      // DB lookup — match by level=BASIC, name, region (= 시·군·구), councilName
      const candidates = await prisma.legislator.findMany({
        where: { level: "BASIC", name, region, councilName },
        select: { id: true },
      });

      if (candidates.length === 0) {
        totalUnmatched++;
        if (unmatchedSamples.length < 10) unmatchedSamples.push({ name, region, councilName });
        continue;
      }
      if (candidates.length > 1) {
        console.warn(
          `[basic-assets] 동명이인 다중 매칭: ${name} (${region} ${councilName}) — ${candidates.length}건. 모두 업데이트.`,
        );
      }

      // Detail fetch
      totalFetched++;
      let breakdown: Awaited<ReturnType<typeof fetchPersonBreakdown>> = null;
      try {
        breakdown = await fetchPersonBreakdown(hit.uniqueId);
      } catch (err) {
        console.warn(
          `[basic-assets] 상세 페이지 fetch 실패: ${name} (${hit.uniqueId}) — ${(err as Error).message}`,
        );
      }

      if (!breakdown) {
        totalParseFailed++;
        await sleep(DETAIL_DELAY_MS);
        continue;
      }

      const totalManwon = cheonwonToManwon(breakdown.priceNowCheonwon);
      const url = `${BASE}/people/${hit.uniqueId}`;

      for (const leg of candidates) {
        await prisma.legislator.update({
          where: { id: leg.id },
          data: {
            assetTotalManwon: totalManwon,
            assetRealEstateManwon: cheonwonToManwon(breakdown.totals.realEstate),
            assetCashManwon: cheonwonToManwon(breakdown.totals.cash),
            assetSecuritiesManwon: cheonwonToManwon(breakdown.totals.securities),
            assetDebtManwon: cheonwonToManwon(breakdown.totals.debt),
            assetReportYear: breakdown.year,
            assetSourceName: SOURCE_NAME,
            assetSourceUrl: url,
            assetLastSyncedAt: NOW,
          },
        });
      }
      totalMatched++;
      if (matchedSamples.length < 3) {
        matchedSamples.push({ name, region, year: breakdown.year, total: totalManwon });
      }

      totalProcessed++;
      if (totalProcessed % 100 === 0) {
        console.log(
          `[basic-assets] 진행: ${totalProcessed}명 처리 완료 ` +
            `(matched=${totalMatched}, parseFail=${totalParseFailed}, unmatched=${totalUnmatched}) ` +
            `[의회 ${ci + 1}/${councils.length}]`,
        );
      }

      await sleep(DETAIL_DELAY_MS);
    }
  }

  console.log("\n[basic-assets] 완료");
  console.log(`  - 기초의회 수:                     ${councils.length}`);
  console.log(`  - 상세 페이지 fetch 시도:          ${totalFetched}`);
  console.log(`  - 매칭 성공 (DB 업데이트):         ${totalMatched}`);
  console.log(`  - 파싱/네트워크 실패:              ${totalParseFailed}`);
  console.log(`  - DB 미매칭 (이름+region+council): ${totalUnmatched}`);

  if (unmatchedSamples.length > 0) {
    console.log("[basic-assets] 미매칭 샘플 (최대 10):");
    for (const u of unmatchedSamples) {
      console.log(`    - ${u.name} (${u.region} / ${u.councilName})`);
    }
  }
  if (matchedSamples.length > 0) {
    console.log("[basic-assets] 매칭 샘플 (참고):");
    for (const s of matchedSamples) {
      console.log(`    - ${s.name} (${s.region}) ${s.year}년 총액 ${s.total.toString()}만원`);
    }
  }
}

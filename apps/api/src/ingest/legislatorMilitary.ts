/**
 * 병역 (military service) 데이터 수집 모듈
 *
 * 출처: 행정안전부 관보 공직자등의 병역사항 공개
 *   data.go.kr ID: 15110207
 *   Endpoint: http://apis.data.go.kr/1741000/MilitaryReportInfo/getMilitaryReportInfo
 *
 * Auth: data.go.kr 일반인증키 (env NEC_API_KEY — same key used for NEC endpoints)
 *
 * Response shape (standard data.go.kr NEC envelope, JSON):
 *   response.body.items.item[] with fields:
 *     - nm          : 성명
 *     - position    : 직위 (e.g. "국회의원", "시·도지사", "시장·군수·구청장")
 *     - orgNm       : 소속 (council/org name)
 *     - sido        : 시·도
 *     - militaryStat: 병역사항 (e.g. "복무를 마침", "복무 사항 없음", "미필")
 *     - militaryRank: 계급 (e.g. "병장", "중사")
 *     - enlistDt    : 입영일 (YYYYMMDD or YYYY-MM-DD)
 *     - dischargeDt : 전역일
 *     - reason      : 면제/면접 사유
 *     - pubYear     : 관보 공개 연도 (YYYY string)
 *     - pubUrl      : 관보 URL (optional)
 *
 * Field names are inferred from the data.go.kr API specification document and
 * standard naming conventions for this class of 행안부 openAPI. Adjust if the
 * actual field names differ once the API key is approved.
 *
 * CLI:
 *   DATABASE_URL=... NEC_API_KEY=... tsx src/ingest/index.ts military
 */

import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

// ─── Constants ────────────────────────────────────────────────

const SERVICE_BASE_URL = "http://apis.data.go.kr/1741000";
const SERVICE_PATH = "MilitaryReportInfo";
const SERVICE_METHOD = "getMilitaryReportInfo";

// Source attribution URL (landing page for the dataset)
const SOURCE_URL = "https://www.data.go.kr/data/15110207/openapi.do";

/**
 * 직위 values that correspond to the legislators we track.
 * The 관보 공개 dataset covers 시도지사, 고위공직자, 국회의원, 지방의회의원 etc.
 * We accept all of these since our Legislator table covers national + provincial + basic.
 */
const RELEVANT_POSITIONS = new Set([
  "국회의원",
  "국회의장",
  "국회부의장",
  "시·도지사",
  "도지사",
  "시장",
  "군수",
  "구청장",
  "시장·군수·구청장",
  "시·도의회의원",
  "시·도의회 의원",
  "시·군·구의회의원",
  "시·군·구의회 의원",
  "광역의회의원",
  "기초의회의원",
  // 부지사·부시장 등 부단체장 — kept for completeness
  "부지사",
  "부시장",
]);

// ─── Types ────────────────────────────────────────────────────

/**
 * Raw item shape returned by the API.
 * Field names follow standard 행안부 openAPI naming patterns.
 * Actual names may differ — adjust when API key is live.
 */
interface MilitaryReportItem {
  // 인적사항
  nm?: string;           // 성명
  position?: string;     // 직위
  orgNm?: string;        // 소속 기관명
  sido?: string;         // 시·도

  // 병역사항
  militaryStat?: string; // 병역사항 (복무를 마침 / 복무 사항 없음 / 미필 / 현역 / 면제 등)
  militaryRank?: string; // 계급
  enlistDt?: string;     // 입영일 (YYYYMMDD)
  dischargeDt?: string;  // 전역일 (YYYYMMDD)
  reason?: string;       // 면제 사유

  // 관보 메타
  pubYear?: string;      // 공개 연도
  pubUrl?: string;       // 관보 URL

  // Alternative field name variants sometimes used by 행안부 APIs
  name?: string;         // alias for nm
  militaryStatus?: string; // alias for militaryStat
  rank?: string;         // alias for militaryRank
  entrDt?: string;       // alias for enlistDt
  retireDt?: string;     // alias for dischargeDt
  exemptReason?: string; // alias for reason
  openYear?: string;     // alias for pubYear
}

// ─── Helpers ─────────────────────────────────────────────────

/** Normalize a date string: YYYYMMDD → YYYY-MM-DD. Leave other formats as-is. */
function normDate(raw: string | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim().replace(/[^0-9\-]/g, "");
  // Already has dashes → return as-is
  if (s.includes("-")) return s.slice(0, 10) || null;
  // 8 digits → YYYY-MM-DD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return raw.trim() || null;
}

/** Resolve field name with alias fallback. */
function field(item: MilitaryReportItem, ...keys: (keyof MilitaryReportItem)[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * Try to match an API record to a Legislator row.
 *
 * Strategy:
 *  1. Exact name match scoped to NATIONAL level (for 국회의원/의장/부의장)
 *  2. Exact name match with councilName containing the orgNm (for 광역/기초 의원)
 *  3. Exact name match with region = sido (for 지사/시장/군수/구청장 who are stored as PROVINCIAL)
 *  4. Fallback: any Legislator with matching name (first hit)
 *
 * Returns array of matching legislator IDs (there may be homonyms — we update all).
 */
async function findLegislatorIds(
  name: string,
  position: string | null,
  orgNm: string | null,
  sido: string | null,
): Promise<string[]> {
  // Narrow by level based on position string
  const isNational =
    position === "국회의원" ||
    position === "국회의장" ||
    position === "국회부의장";

  if (isNational) {
    const rows = await prisma.legislator.findMany({
      where: { level: "NATIONAL", name },
      select: { id: true },
    });
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  // Provincial/Basic council members: match on name + councilName fuzzy
  if (orgNm) {
    const rows = await prisma.legislator.findMany({
      where: {
        name,
        OR: [
          { councilName: { contains: orgNm } },
          { councilName: { contains: orgNm.replace(/의회$/, "").replace(/시|군|구/, "") } },
        ],
      },
      select: { id: true },
    });
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  // Match on sido/region (시도지사, 부단체장 etc.)
  if (sido) {
    const rows = await prisma.legislator.findMany({
      where: {
        name,
        OR: [{ region: { contains: sido } }, { councilName: { contains: sido } }],
      },
      select: { id: true },
    });
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  // Broadest fallback: name only
  const rows = await prisma.legislator.findMany({
    where: { name },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ─── Main Ingest ──────────────────────────────────────────────

export async function ingestLegislatorMilitary(): Promise<void> {
  console.log("[military] 병역 데이터 수집 시작 (행안부 관보 공직자 병역사항 공개)");

  // Fetch all pages from the API
  let rawItems: MilitaryReportItem[];
  try {
    rawItems = await fetchAllNecPages<MilitaryReportItem>(
      SERVICE_PATH,
      SERVICE_METHOD,
      {}, // no extra filter params — fetch all, then filter locally
      {
        baseUrl: SERVICE_BASE_URL,
        pageSize: 100,
        delayMs: 500,
      },
    );
  } catch (err) {
    const msg = (err as Error).message;
    // 401/403/key errors: surface clearly
    if (
      msg.includes("Unauthorized") ||
      msg.includes("SERVICE_ACCESS_DENIED") ||
      msg.includes("INVALID_REQUEST_PARAMETER") ||
      msg.includes("XML error")
    ) {
      console.error(
        "[military] API 키 오류 또는 접근 권한 없음. 활용신청 승인 후 재시도하세요.",
      );
      console.error(`[military] 오류 상세: ${msg}`);
      return;
    }
    throw err;
  }

  console.log(`[military] API에서 ${rawItems.length}건 수신`);

  // Filter to positions we care about
  const relevant = rawItems.filter((item) => {
    const pos = field(item, "position");
    if (!pos) return true; // keep if no position field — let matching decide
    return RELEVANT_POSITIONS.has(pos);
  });

  console.log(
    `[military] 관련 직위 필터 후: ${relevant.length}건 (전체 ${rawItems.length}건 중)`,
  );

  const NOW = new Date();
  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  const unmatchedSample: string[] = [];

  for (const item of relevant) {
    const name = field(item, "nm", "name");
    if (!name) continue;

    const position = field(item, "position");
    const orgNm = field(item, "orgNm");
    const sido = field(item, "sido");

    const militaryStatus = field(item, "militaryStat", "militaryStatus");
    const militaryRank = field(item, "militaryRank", "rank");
    const militaryEnteredAt = normDate(
      field(item, "enlistDt", "entrDt") ?? undefined,
    );
    const militaryDischargedAt = normDate(
      field(item, "dischargeDt", "retireDt") ?? undefined,
    );
    const militaryReason = field(item, "reason", "exemptReason");
    const pubYearRaw = field(item, "pubYear", "openYear");
    const militaryReportYear = pubYearRaw ? parseInt(pubYearRaw, 10) : null;
    const militarySourceUrl = field(item, "pubUrl") ?? SOURCE_URL;

    const ids = await findLegislatorIds(name, position, orgNm, sido);

    if (ids.length === 0) {
      unmatched++;
      if (unmatchedSample.length < 10) {
        unmatchedSample.push(`${name}(${position ?? "직위미상"})`);
      }
      continue;
    }

    matched++;
    for (const id of ids) {
      await prisma.legislator.update({
        where: { id },
        data: {
          militaryStatus: militaryStatus ?? undefined,
          militaryRank: militaryRank ?? undefined,
          militaryEnteredAt: militaryEnteredAt ?? undefined,
          militaryDischargedAt: militaryDischargedAt ?? undefined,
          militaryReason: militaryReason ?? undefined,
          militaryReportYear:
            militaryReportYear != null && Number.isFinite(militaryReportYear)
              ? militaryReportYear
              : undefined,
          militarySourceUrl: militarySourceUrl ?? undefined,
          militaryLastSyncedAt: NOW,
        },
      });
      updated++;
    }
  }

  console.log(
    `\n[military] 완료 — API 수신: ${rawItems.length}건 / 필터 후: ${relevant.length}건`,
  );
  console.log(
    `[military] 매칭: ${matched}명 (DB 업데이트: ${updated}건) / 미매칭: ${unmatched}명`,
  );
  if (unmatchedSample.length > 0) {
    console.log(
      `[military] 미매칭 샘플 (최대 10): ${unmatchedSample.join(", ")}`,
    );
  }
}

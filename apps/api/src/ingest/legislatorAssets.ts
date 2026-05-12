/**
 * 국회의원 재산공개 데이터 수집 모듈
 *
 * 출처: opengirok 정보공개센터 (https://github.com/opengirok/congress_asset_disclosure)
 * 단위: 원본은 천원(千원) → 만원(萬원)으로 변환 (÷10)
 *
 * CSV 컬럼 (expected, flexible):
 *   이름, 정당, 선거구, 총계, 부동산, 증권, 예금, 채무
 *
 * 실제 데이터 다운로드:
 *   https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw
 *   → 파일 > 다운로드 > CSV (.csv) 로 내려받은 뒤 csvPath 인자로 전달
 */

import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import readline from "readline";
import { prisma } from "../db.js";

// ─── Types ────────────────────────────────────────────────────

interface AssetRow {
  name: string;
  party: string;
  district: string;
  totalCheonwon: bigint | null;      // 총계 (천원)
  realEstateCheonwon: bigint | null; // 부동산 (천원)
  securitiesCheonwon: bigint | null; // 증권 (천원)
  cashCheonwon: bigint | null;       // 예금 (천원)
  debtCheonwon: bigint | null;       // 채무 (천원, 음수 가능)
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * 숫자 문자열 파싱 — 쉼표, 공백, 따옴표, ₩ 기호 제거.
 * 빈 값 / "-" / "N/A" → null.
 */
function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s₩"']/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "n/a" || cleaned === "0") {
    return cleaned === "0" ? 0n : null;
  }
  // Handle negative values
  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) return null;
  const val = BigInt(digits);
  return negative ? -val : val;
}

/** 천원 → 만원 변환 (÷10, 반올림) */
function cheonwonToManwon(cheonwon: bigint | null): bigint | null {
  if (cheonwon === null) return null;
  // integer division — truncate (not round) for financial data
  return cheonwon / 10n;
}

/** CSV 행의 따옴표 처리 포함 파싱 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** 헤더 행 감지 — 이름/성명 컬럼이 있어야 함 */
function isHeaderRow(cols: string[]): boolean {
  return cols.some((c) => c === "이름" || c === "성명");
}

/** 주석/빈 행 건너뜀 */
function isSkipRow(line: string): boolean {
  const t = line.trim();
  return !t || t.startsWith("#") || t.startsWith("<") || t.startsWith("*");
}

// ─── CSV Parser ───────────────────────────────────────────────

async function parseCsv(filePath: string): Promise<AssetRow[]> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const rows: AssetRow[] = [];
  let headers: string[] = [];
  let headerFound = false;

  for await (const line of rl) {
    if (isSkipRow(line)) continue;

    const cols = parseCsvLine(line);

    if (!headerFound) {
      if (isHeaderRow(cols)) {
        headers = cols.map((h) => h.replace(/\s+/g, "").toLowerCase());
        headerFound = true;
      }
      continue;
    }

    if (cols.length < 3) continue;

    // Column index lookup (flexible — different sheets may differ)
    const idx = (candidates: string[]): number => {
      for (const c of candidates) {
        const i = headers.indexOf(c);
        if (i !== -1) return i;
      }
      return -1;
    };

    const nameIdx   = idx(["이름", "성명"]);
    const partyIdx  = idx(["정당", "소속정당", "소속(정당)"]);
    const distIdx   = idx(["선거구", "지역구", "선거구명"]);
    const totalIdx  = idx(["총계", "본인+가족총액", "합계"]);
    const reIdx     = idx(["부동산"]);
    const secIdx    = idx(["증권", "유가증권"]);
    const cashIdx   = idx(["예금", "현금예금"]);
    const debtIdx   = idx(["채무", "부채"]);

    const name = nameIdx >= 0 ? (cols[nameIdx] ?? "").trim() : "";
    if (!name) continue;

    rows.push({
      name,
      party: partyIdx >= 0 ? (cols[partyIdx] ?? "").trim() : "",
      district: distIdx >= 0 ? (cols[distIdx] ?? "").trim() : "",
      totalCheonwon:      totalIdx >= 0 ? parseAmount(cols[totalIdx]) : null,
      realEstateCheonwon: reIdx   >= 0 ? parseAmount(cols[reIdx])    : null,
      securitiesCheonwon: secIdx  >= 0 ? parseAmount(cols[secIdx])   : null,
      cashCheonwon:       cashIdx >= 0 ? parseAmount(cols[cashIdx])  : null,
      debtCheonwon:       debtIdx >= 0 ? parseAmount(cols[debtIdx])  : null,
    });
  }

  return rows;
}

// ─── Main Ingest ──────────────────────────────────────────────

export async function ingestNationalLegislatorAssets(csvPath?: string): Promise<void> {
  const resolvedPath =
    csvPath ??
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "seed-data",
      "national-assets-22.csv",
    );

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `CSV 파일을 찾을 수 없습니다: ${resolvedPath}\n` +
        "opengirok 구글시트에서 CSV를 내려받아 경로를 지정하거나,\n" +
        "seed-data/national-assets-22.csv 에 배치하세요.\n" +
        "출처: https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw",
    );
  }

  console.log(`[legislator-assets] CSV 읽는 중: ${resolvedPath}`);
  const rows = await parseCsv(resolvedPath);
  console.log(`[legislator-assets] 파싱 완료: ${rows.length}개 행`);

  const SOURCE_NAME = "opengirok";
  const SOURCE_URL =
    "https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw";
  // 2024년 8월 29일 공보 기준 데이터 → 신고연도 2024
  const REPORT_YEAR = 2024;
  const NOW = new Date();

  let matched = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const row of rows) {
    // Find candidate legislators: NATIONAL level, name match
    const candidates = await prisma.legislator.findMany({
      where: { level: "NATIONAL", name: row.name },
      select: { id: true, name: true, party: true, electoralDistrictName: true },
    });

    if (candidates.length === 0) {
      console.warn(`[unmatched] "${row.name}" (${row.party} / ${row.district}) — DB에 없음`);
      unmatched++;
      continue;
    }

    if (candidates.length > 1) {
      // Try to narrow by party
      const byParty = candidates.filter(
        (c) => row.party && c.party && c.party.includes(row.party),
      );
      if (byParty.length === 1) {
        // Unique after party filter — use it
        const leg = byParty[0]!;
        await updateLegislator(leg.id, row, REPORT_YEAR, SOURCE_NAME, SOURCE_URL, NOW);
        matched++;
        continue;
      }
      // Try to narrow by district
      const byDistrict = candidates.filter(
        (c) =>
          row.district &&
          c.electoralDistrictName &&
          c.electoralDistrictName.includes(row.district),
      );
      if (byDistrict.length === 1) {
        const leg = byDistrict[0]!;
        await updateLegislator(leg.id, row, REPORT_YEAR, SOURCE_NAME, SOURCE_URL, NOW);
        matched++;
        continue;
      }
      console.warn(
        `[homonym] "${row.name}" — ${candidates.length}명 동명이인 발견, 건너뜀. ` +
          `(정당: ${row.party}, 지역구: ${row.district})`,
      );
      skipped++;
      continue;
    }

    // Exactly one match
    const leg = candidates[0]!;
    await updateLegislator(leg.id, row, REPORT_YEAR, SOURCE_NAME, SOURCE_URL, NOW);
    matched++;
  }

  console.log(
    `\n[legislator-assets] 완료 — 매칭: ${matched}명 / 동명이인 건너뜀: ${skipped}명 / 미매칭: ${unmatched}명 (전체 ${rows.length}행)`,
  );
}

async function updateLegislator(
  id: string,
  row: AssetRow,
  reportYear: number,
  sourceName: string,
  sourceUrl: string,
  now: Date,
): Promise<void> {
  await prisma.legislator.update({
    where: { id },
    data: {
      assetTotalManwon:      cheonwonToManwon(row.totalCheonwon),
      assetRealEstateManwon: cheonwonToManwon(row.realEstateCheonwon),
      assetSecuritiesManwon: cheonwonToManwon(row.securitiesCheonwon),
      assetCashManwon:       cheonwonToManwon(row.cashCheonwon),
      assetDebtManwon:       cheonwonToManwon(row.debtCheonwon),
      assetReportYear:       reportYear,
      assetSourceName:       sourceName,
      assetSourceUrl:        sourceUrl,
      assetLastSyncedAt:     now,
    },
  });
}

/**
 * 국회의원 재산공개 데이터 수집 모듈 (상세 CSV 포맷)
 *
 * 출처: 정보공개센터 "2025 국회고위공직자 재산정보(공개본) - 상세"
 *   https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw
 *
 * CSV 컬럼:
 *   NO, 구분, 소속, 직위, 이름, 재산구분, 본인과의 관계, 재산의종류,
 *   소재지 면적 등 권리의 명세, 종전가액, 증가액, 증가액실거래가격,
 *   감소액, 감소액실거래가격, 현재가액, 변동사유
 *
 * 단위: 원본 천원(千원) → 만원(萬원)으로 변환 (÷10)
 *
 * 필터: 직위 ∈ {국회의원, 국회의장, 국회부의장}
 *
 * CLI:
 *   DATABASE_URL=... pnpm --filter @repo/api ingest legislator-assets "/path/to/상세.csv"
 */

import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import readline from "readline";
import { prisma } from "../db.js";

// ─── Constants ────────────────────────────────────────────────

const ALLOWED_POSITIONS = new Set(["국회의원", "국회의장", "국회부의장"]);

const SOURCE_NAME = "정보공개센터/국회공보";
const SOURCE_URL =
  "https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw";
const REPORT_YEAR = 2025;

// ─── Category Classification ──────────────────────────────────

/**
 * Normalize whitespace in category strings (the CSV has extra spaces)
 */
function normCategory(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function classifyCategory(raw: string): "realEstate" | "cash" | "securities" | "debt" | "other" {
  const c = normCategory(raw);
  if (c === "토지" || c === "건물" || c.startsWith("부동산에 관한 규정이 준용되는")) {
    return "realEstate";
  }
  if (
    c === "예금" ||
    c === "현금" ||
    c.startsWith("정치자금법에 따른")
  ) {
    return "cash";
  }
  if (c === "증권" || c === "채권" || c === "가상자산") {
    return "securities";
  }
  if (c === "채무") {
    return "debt";
  }
  return "other";
}

// ─── Types ────────────────────────────────────────────────────

interface LegislatorAssets {
  realEstate: bigint; // 천원 합계
  cash: bigint;
  securities: bigint;
  debt: bigint;       // 양수 저장 (채무 절댓값)
  otherAssets: bigint; // 채무 제외 기타 자산
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * 숫자 문자열 파싱 — 쉼표, 공백, 따옴표 제거.
 * 빈 값 / "-" → 0n
 */
function parseAmount(raw: string | undefined): bigint {
  if (!raw) return 0n;
  const cleaned = raw.replace(/[,\s₩"']/g, "").trim();
  if (!cleaned || cleaned === "-") return 0n;
  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) return 0n;
  const val = BigInt(digits);
  return negative ? -val : val;
}

/** 천원 → 만원 변환 (÷10, 버림) */
function cheonwonToManwon(cheonwon: bigint): bigint {
  return cheonwon / 10n;
}

/** CSV 행 파싱 — 따옴표 중첩 처리 포함 */
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

// ─── CSV Parser ───────────────────────────────────────────────

/**
 * Parse the 상세 CSV format.
 * Returns a Map of legislator name → accumulated assets (in 천원).
 */
async function parseCsv(
  filePath: string,
): Promise<{ byName: Map<string, LegislatorAssets>; totalRows: number; distinctNames: number }> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const byName = new Map<string, LegislatorAssets>();
  let headerParsed = false;
  let headers: string[] = [];
  let totalRows = 0;

  // Column indices (set after header parse)
  let idxPosition = -1;   // 직위
  let idxName = -1;        // 이름
  let idxCategory = -1;    // 재산구분
  let idxCurrentValue = -1; // 현재가액

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!headerParsed) {
      const cols = parseCsvLine(line);
      // Normalise header names
      headers = cols.map((h) => h.replace(/\s+/g, "").trim());
      idxPosition    = headers.indexOf("직위");
      idxName        = headers.indexOf("이름");
      idxCategory    = headers.indexOf("재산구분");
      idxCurrentValue = headers.indexOf("현재가액");
      if (idxName >= 0 && idxPosition >= 0) {
        headerParsed = true;
      }
      continue;
    }

    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;

    const position = idxPosition >= 0 ? (cols[idxPosition] ?? "").trim() : "";
    if (!ALLOWED_POSITIONS.has(position)) continue;

    const name = idxName >= 0 ? (cols[idxName] ?? "").trim() : "";
    if (!name) continue;

    const categoryRaw = idxCategory >= 0 ? (cols[idxCategory] ?? "") : "";
    const currentValueRaw = idxCurrentValue >= 0 ? (cols[idxCurrentValue] ?? "") : "";
    const amount = parseAmount(currentValueRaw);

    totalRows++;

    let entry = byName.get(name);
    if (!entry) {
      entry = { realEstate: 0n, cash: 0n, securities: 0n, debt: 0n, otherAssets: 0n };
      byName.set(name, entry);
    }

    const bucket = classifyCategory(categoryRaw);
    if (bucket === "realEstate") {
      entry.realEstate += amount;
    } else if (bucket === "cash") {
      entry.cash += amount;
    } else if (bucket === "securities") {
      entry.securities += amount;
    } else if (bucket === "debt") {
      // Store absolute value; amount in CSV is already positive for 채무
      entry.debt += amount < 0n ? -amount : amount;
    } else {
      // Other asset categories count toward total but have no dedicated field
      entry.otherAssets += amount;
    }
  }

  return { byName, totalRows, distinctNames: byName.size };
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
        "정보공개센터 구글시트에서 상세 CSV를 내려받아 경로를 지정하세요.\n" +
        "출처: https://docs.google.com/spreadsheets/d/1DHOsfx3rMxZniGvr3bEIUVZCQLBPIAcpIfvozDbsDhw",
    );
  }

  console.log(`[legislator-assets] CSV 읽는 중: ${resolvedPath}`);
  const { byName, totalRows, distinctNames } = await parseCsv(resolvedPath);
  console.log(
    `[legislator-assets] 파싱 완료: 전체 ${totalRows}행 / 의원 ${distinctNames}명 (국회의원·의장·부의장 필터 적용)`,
  );

  const NOW = new Date();
  let matched = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];

  for (const [name, assets] of byName) {
    const candidates = await prisma.legislator.findMany({
      where: { level: "NATIONAL", name },
      select: { id: true, name: true },
    });

    if (candidates.length === 0) {
      unmatched++;
      if (unmatchedNames.length < 10) unmatchedNames.push(name);
      continue;
    }

    // If multiple homonyms exist, update all of them (국회의원 동명이인은 실제로 드묾)
    const totalAssetCheonwon =
      assets.realEstate + assets.cash + assets.securities + assets.otherAssets - assets.debt;

    for (const leg of candidates) {
      await prisma.legislator.update({
        where: { id: leg.id },
        data: {
          assetTotalManwon:      cheonwonToManwon(totalAssetCheonwon),
          assetRealEstateManwon: cheonwonToManwon(assets.realEstate),
          assetCashManwon:       cheonwonToManwon(assets.cash),
          assetSecuritiesManwon: cheonwonToManwon(assets.securities),
          assetDebtManwon:       cheonwonToManwon(assets.debt),
          assetReportYear:       REPORT_YEAR,
          assetSourceName:       SOURCE_NAME,
          assetSourceUrl:        SOURCE_URL,
          assetLastSyncedAt:     NOW,
        },
      });
    }
    matched++;
  }

  console.log(
    `\n[legislator-assets] 완료 — 매칭: ${matched}명 / 미매칭: ${unmatched}명 (전체 ${distinctNames}명 중)`,
  );

  if (unmatchedNames.length > 0) {
    console.log(
      `[legislator-assets] 미매칭 이름 샘플 (최대 10): ${unmatchedNames.join(", ")}`,
    );
  }
}

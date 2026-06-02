/**
 * 국회의원 재산공개 — 라인아이템 ingest (LegislatorAsset 테이블).
 *
 * 기존 legislatorAssets.ts (Legislator 집계 컬럼 업데이트)와 별개로,
 * 의원별 모든 신고 항목을 LegislatorAsset 테이블에 그대로 저장한다.
 * 상세페이지 "재산" 섹션에서 항목별로 보여주기 위함.
 *
 * 입력 파일: apps/api/data/legislator-assets-{REPORT_YM}.tsv
 *   - 헤더 1행 + 데이터 N행. 필드 구분자: 탭 또는 2+ 공백.
 *   - 컬럼: 연월 NO monaCode 구분 소속 직위 이름 재산구분 본인과의관계
 *           재산의종류 명세 종전가액 증가액 증가액실거래가격 감소액
 *           감소액실거래가격 현재가액 변동사유
 *
 * 환경변수:
 *   - REPORT_YM   (기본 202603)
 *   - DATA_FILE   (지정 시 우선)
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/legislatorAssetItems.ts
 */

import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../db.js";

type Row = {
  reportYm: string;
  rowNumber: number;
  monaCode: string | null;
  category: string | null;
  affiliation: string | null;
  position: string | null;
  legislatorName: string;
  assetKind: string;
  relation: string;
  itemType: string | null;
  description: string | null;
  prevValue: bigint | null;
  increaseValue: bigint | null;
  increaseRealPrice: bigint | null;
  decreaseValue: bigint | null;
  decreaseRealPrice: bigint | null;
  currentValue: bigint | null;
  changeReason: string | null;
};

function toBigInt(raw: string | undefined | null): bigint | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/,/g, "");
  if (!t || t === "-" || t === "—") return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  try {
    return BigInt(m[0]);
  } catch {
    return null;
  }
}

// 필드 분리: 탭이 있으면 탭, 없으면 2+ 공백.
function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(/\s{2,}/).map((s) => s.trim());
}

function parseLine(line: string): Row | null {
  const parts = splitRow(line);
  if (parts.length < 7) return null;
  while (parts.length < 18) parts.push("");

  const [reportYm, no, monaCode, category, affiliation, position, name,
    assetKind, relation, itemType, description,
    prevValue, increaseValue, increaseRealPrice,
    decreaseValue, decreaseRealPrice, currentValue, changeReason] = parts;

  const rowNum = parseInt(no, 10);
  if (!Number.isFinite(rowNum)) return null;
  if (!reportYm || !/^\d{6}$/.test(reportYm)) return null;

  return {
    reportYm,
    rowNumber: rowNum,
    monaCode: monaCode || null,
    category: category || null,
    affiliation: affiliation || null,
    position: position || null,
    legislatorName: (name || "").trim(),
    assetKind: (assetKind || "").trim(),
    relation: (relation || "본인").trim(),
    itemType: itemType ? itemType.trim() : null,
    description: description ? description.trim() : null,
    prevValue: toBigInt(prevValue),
    increaseValue: toBigInt(increaseValue),
    increaseRealPrice: toBigInt(increaseRealPrice),
    decreaseValue: toBigInt(decreaseValue),
    decreaseRealPrice: toBigInt(decreaseRealPrice),
    currentValue: toBigInt(currentValue),
    changeReason: changeReason ? changeReason.trim() : null,
  };
}

export async function ingestLegislatorAssetItems(): Promise<void> {
  const reportYm = process.env.REPORT_YM ?? "202603";
  const defaultPath = resolve(process.cwd(), `data/legislator-assets-${reportYm}.tsv`);
  const filePath = process.env.DATA_FILE ?? defaultPath;

  console.log(`[asset-items] reading ${filePath}`);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    console.error(`[asset-items] cannot read ${filePath}:`, (e as Error).message);
    return;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const dataLines = lines[0]?.startsWith("연월") ? lines.slice(1) : lines;
  console.log(`[asset-items] parsing ${dataLines.length} rows`);

  const rows: Row[] = [];
  for (const line of dataLines) {
    const r = parseLine(line);
    if (r) rows.push(r);
  }
  console.log(`[asset-items] parsed ${rows.length} valid rows`);

  // 같은 reportYm 기존 데이터 모두 제거 후 재적재 (idempotent).
  const before = await prisma.legislatorAsset.deleteMany({ where: { reportYm } });
  console.log(`[asset-items] cleared ${before.count} previous rows for ${reportYm}`);

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const r = await prisma.legislatorAsset.createMany({
      data: slice as Prisma.LegislatorAssetUncheckedCreateInput[],
      skipDuplicates: true,
    });
    inserted += r.count;
  }
  console.log(`[asset-items] done — inserted=${inserted} / parsed=${rows.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestLegislatorAssetItems()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

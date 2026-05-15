// CLIK (국회도서관 지방의정포털) 회의록·의안정보 ingest 서비스.
//
// Endpoints:
//   GET /openapi/minutes.do  — 회의록
//   GET /openapi/bill.do     — 의안정보 (조례안·건의안 등)
//
// 응답 구조 (JSON):
//   { RESULT: "0000", TOTAL_COUNT: <number>, ITEM: [ {...}, ... ] }
//
// Rate limits: 일 1,000회 / 회당 최대 100건. 페이지간 200ms sleep.
//
// 회의록 viewer URL:
//   https://clik.nanet.go.kr/minutes/viewer.do?collection=minutes&DOCID={docid}
// 의안 viewer URL:
//   https://clik.nanet.go.kr/potal/search/searchView.do?collection=bill&DOCID={docid}

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const CLIK_BASE_URL = "https://clik.nanet.go.kr/openapi";
const PAGE_SIZE = 100;
const REQUEST_SLEEP_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const key = process.env.CLIK_API_KEY;
  if (!key) {
    throw new Error(
      "[clik] CLIK_API_KEY is not set. apps/api/.env 에 CLIK_API_KEY 를 설정하세요.",
    );
  }
  return key;
}

// ── 응답 타입 (defensive — 필드명 변동 가능) ───────────────────

interface ClikMinutesRow {
  DOCID?: string;
  RASMBLY_ID?: string;
  RASMBLY_NM?: string;
  RASMBLY_SESN?: string;
  MTG_DE?: string;
  RASMBLY_NUMPR?: string;
  MINTS_ODR?: string;
  MTGNM?: string;
  [key: string]: unknown;
}

interface ClikBillRow {
  DOCID?: string;
  RASMBLY_ID?: string;
  RASMBLY_NM?: string;
  BI_KND_NM?: string;
  RASMBLY_NUMPR?: string;
  ITNC_DE?: string;
  BI_SJ?: string;
  BI_NO?: string;
  PROPSR?: string;
  [key: string]: unknown;
}

// CLIK 응답 구조:
//   [{ SERVICE, RESULT_CODE, RESULT_MESSAGE, TOTAL_COUNT, LIST_COUNT, LIST: [{ ROW: {...} }, ...] }]
//
// 응답이 배열로 감싸져 있고, 각 항목은 다시 ROW로 감싸져 있다.

interface ClikRowWrapper<T> {
  ROW?: T;
}

interface ClikResponseBlock<T> {
  SERVICE?: string;
  RESULT_CODE?: string;
  RESULT_MESSAGE?: string;
  TOTAL_COUNT?: number | string;
  LIST_COUNT?: number | string;
  LIST?: ClikRowWrapper<T>[];
}

type ClikResponse<T> = ClikResponseBlock<T> | ClikResponseBlock<T>[];

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function unwrapResponse<T>(data: ClikResponse<T>): ClikResponseBlock<T> {
  if (Array.isArray(data)) {
    return data[0] ?? {};
  }
  return data;
}

function toItemsArray<T>(list: ClikRowWrapper<T>[] | undefined): T[] {
  if (!list || !Array.isArray(list)) return [];
  return list
    .map((entry) => entry?.ROW)
    .filter((v): v is T => v !== undefined && v !== null);
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function buildMinutesViewUrl(docId: string): string {
  return `https://clik.nanet.go.kr/minutes/viewer.do?collection=minutes&DOCID=${encodeURIComponent(
    docId,
  )}`;
}

function buildBillViewUrl(docId: string): string {
  return `https://clik.nanet.go.kr/potal/search/searchView.do?collection=bill&DOCID=${encodeURIComponent(
    docId,
  )}`;
}

// ── Fetcher ────────────────────────────────────────────────────

async function fetchClikRaw<T>(
  endpoint: "minutes.do" | "bill.do",
  searchKeyword: string,
  startCount: number,
  listCount: number,
): Promise<ClikResponse<T>> {
  const params = new URLSearchParams({
    key: getApiKey(),
    type: "json",
    displayType: "list",
    startCount: String(startCount),
    listCount: String(listCount),
    searchType: endpoint === "minutes.do" ? "RASMBLY_NM" : "ALL",
    searchKeyword,
  });
  const url = `${CLIK_BASE_URL}/${endpoint}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[clik] HTTP ${res.status} from ${url}`);
  }
  // CLIK 응답이 가끔 text/html content-type으로 오는 경우가 있어 명시적으로 처리
  const text = await res.text();
  let data: ClikResponse<T>;
  try {
    data = JSON.parse(text) as ClikResponse<T>;
  } catch (err) {
    throw new Error(
      `[clik] JSON parse 실패 (${endpoint}, keyword=${searchKeyword}): ${
        (err as Error).message
      } — body[0..200]=${text.slice(0, 200)}`,
    );
  }
  return data;
}

export async function fetchClikMinutes(
  councilName: string,
  startCount: number,
  listCount: number,
): Promise<{ rows: ClikMinutesRow[]; total: number }> {
  const data = await fetchClikRaw<ClikMinutesRow>(
    "minutes.do",
    councilName,
    startCount,
    listCount,
  );
  const block = unwrapResponse(data);
  return {
    rows: toItemsArray(block.LIST),
    total: asNumber(block.TOTAL_COUNT),
  };
}

export async function fetchClikBills(
  councilName: string,
  startCount: number,
  listCount: number,
): Promise<{ rows: ClikBillRow[]; total: number }> {
  const data = await fetchClikRaw<ClikBillRow>(
    "bill.do",
    councilName,
    startCount,
    listCount,
  );
  const block = unwrapResponse(data);
  return {
    rows: toItemsArray(block.LIST),
    total: asNumber(block.TOTAL_COUNT),
  };
}

// ── Ingest (페이지네이션 + createMany skipDuplicates) ────────────

export interface IngestResult {
  added: number;
  skipped: number;
  total: number;
}

export async function ingestCouncilMinutes(
  councilName: string,
  options: { maxPages?: number } = {},
): Promise<IngestResult> {
  const maxPages = options.maxPages ?? 1000;
  let startCount = 0;
  let pageIdx = 0;
  let added = 0;
  let skipped = 0;
  let total = 0;

  console.log(`[clik:minutes] [${councilName}] 회의록 적재 시작`);

  while (pageIdx < maxPages) {
    const { rows, total: pageTotal } = await fetchClikMinutes(
      councilName,
      startCount,
      PAGE_SIZE,
    );
    total = pageTotal;
    if (rows.length === 0) break;

    const records: Prisma.CouncilMinutesCreateManyInput[] = [];
    for (const row of rows) {
      const docId = emptyToNull(row.DOCID);
      const rasmblyId = emptyToNull(row.RASMBLY_ID);
      const rasmblyNm = emptyToNull(row.RASMBLY_NM);
      if (!docId || !rasmblyId || !rasmblyNm) continue;
      records.push({
        docId,
        rasmblyId,
        rasmblyNm,
        sesn: emptyToNull(row.RASMBLY_SESN),
        mtgDe: emptyToNull(row.MTG_DE),
        numpr: emptyToNull(row.RASMBLY_NUMPR),
        mitsOdr: emptyToNull(row.MINTS_ODR),
        mtgNm: emptyToNull(row.MTGNM),
        viewUrl: buildMinutesViewUrl(docId),
        rawSourceJson: row as unknown as Prisma.InputJsonValue,
      });
    }

    if (records.length > 0) {
      const result = await prisma.councilMinutes.createMany({
        data: records,
        skipDuplicates: true,
      });
      added += result.count;
      skipped += records.length - result.count;
    }

    pageIdx += 1;
    if (pageIdx % 1 === 0 || added % 50 < records.length) {
      console.log(
        `[clik:minutes] [${councilName}] 회의록 ${added}건 적재 (페이지 ${pageIdx}, 전체 ${total}건 중 ${
          startCount + rows.length
        }건 처리)`,
      );
    }

    startCount += rows.length;
    if (startCount >= total) break;

    await sleep(REQUEST_SLEEP_MS);
  }

  console.log(
    `[clik:minutes] [${councilName}] 완료 — 신규 ${added}건 / 중복 ${skipped}건 / 전체 ${total}건`,
  );
  return { added, skipped, total };
}

/**
 * 회의록 API를 통해 의회명에 매칭되는 RASMBLY_ID 집합을 찾는다.
 * bill API는 RASMBLY_NM 검색을 지원하지 않으므로, 의회별 ID를 사전에 알아두어야
 * 검색 결과에서 다른 의회의 안건을 걸러낼 수 있다.
 *
 * 1페이지(최대 100건)만 조회하여 RASMBLY_ID 집합을 추출한다.
 */
async function resolveCouncilIds(
  councilName: string,
): Promise<Map<string, string>> {
  const { rows } = await fetchClikMinutes(councilName, 0, PAGE_SIZE);
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = emptyToNull(row.RASMBLY_ID);
    const nm = emptyToNull(row.RASMBLY_NM);
    if (id && nm) map.set(id, nm);
  }
  return map;
}

export async function ingestCouncilBills(
  councilName: string,
  options: { maxPages?: number } = {},
): Promise<IngestResult> {
  const maxPages = options.maxPages ?? 1000;
  let startCount = 0;
  let pageIdx = 0;
  let added = 0;
  let skipped = 0;
  let filteredOut = 0;
  let total = 0;

  console.log(`[clik:bills] [${councilName}] 의안 적재 시작`);

  // 의회명 → RASMBLY_ID 매핑 사전 조회 (bill API가 RASMBLY_NM 검색 미지원)
  let councilIdMap: Map<string, string>;
  try {
    councilIdMap = await resolveCouncilIds(councilName);
  } catch (err) {
    console.warn(
      `[clik:bills] [${councilName}] RASMBLY_ID 조회 실패, ID 필터 없이 진행:`,
      err instanceof Error ? err.message : err,
    );
    councilIdMap = new Map();
  }

  if (councilIdMap.size === 0) {
    console.warn(
      `[clik:bills] [${councilName}] 매칭되는 RASMBLY_ID 없음. 0건 적재 처리.`,
    );
    return { added: 0, skipped: 0, total: 0 };
  }
  console.log(
    `[clik:bills] [${councilName}] RASMBLY_ID 매핑: ${
      [...councilIdMap.entries()].map(([k, v]) => `${k}=${v}`).join(", ")
    }`,
  );

  await sleep(REQUEST_SLEEP_MS);

  while (pageIdx < maxPages) {
    const { rows, total: pageTotal } = await fetchClikBills(
      councilName,
      startCount,
      PAGE_SIZE,
    );
    total = pageTotal;
    if (rows.length === 0) break;

    const records: Prisma.CouncilBillCreateManyInput[] = [];
    for (const row of rows) {
      const docId = emptyToNull(row.DOCID);
      const rasmblyId = emptyToNull(row.RASMBLY_ID);
      const biSj = emptyToNull(row.BI_SJ);
      if (!docId || !rasmblyId || !biSj) continue;

      // 의회 ID 필터: 매핑되지 않은 의회의 안건은 다른 의회 결과이므로 제외
      const mappedNm = councilIdMap.get(rasmblyId);
      if (!mappedNm) {
        filteredOut += 1;
        continue;
      }

      records.push({
        docId,
        rasmblyId,
        rasmblyNm: emptyToNull(row.RASMBLY_NM) ?? mappedNm,
        biKndNm: emptyToNull(row.BI_KND_NM),
        biNo: emptyToNull(row.BI_NO),
        biSj,
        itncDe: emptyToNull(row.ITNC_DE),
        numpr: emptyToNull(row.RASMBLY_NUMPR),
        propsr: emptyToNull(row.PROPSR),
        viewUrl: buildBillViewUrl(docId),
        rawSourceJson: row as unknown as Prisma.InputJsonValue,
      });
    }

    if (records.length > 0) {
      const result = await prisma.councilBill.createMany({
        data: records,
        skipDuplicates: true,
      });
      added += result.count;
      skipped += records.length - result.count;
    }

    pageIdx += 1;
    console.log(
      `[clik:bills] [${councilName}] 의안 ${added}건 적재 (페이지 ${pageIdx}, 전체 ${total}건 중 ${
        startCount + rows.length
      }건 처리, 타 의회 필터링 ${filteredOut}건)`,
    );

    startCount += rows.length;
    if (startCount >= total) break;

    await sleep(REQUEST_SLEEP_MS);
  }

  console.log(
    `[clik:bills] [${councilName}] 완료 — 신규 ${added}건 / 중복 ${skipped}건 / 타 의회 ${filteredOut}건 / 전체 ${total}건`,
  );
  return { added, skipped, total };
}

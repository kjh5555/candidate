/**
 * 자치법규(조례) ingest — open.law.go.kr OPEN API.
 *
 * Endpoints:
 *   - lnkOrd: 연계 조례 목록 (자치법규 + 메타데이터)
 *   - lnkLsOrd: 법령별 조례 목록 (조례 ↔ 상위 법령 매핑)
 *
 * 환경변수:
 *   - LAW_OC: open.law.go.kr 활용신청 후 받는 OC 인증값
 *   - 서비스 도메인 등록 필요: api.handspolitics.co.kr
 *
 * 실행:
 *   pnpm --filter @repo/api exec tsx src/ingest/ordinances.ts
 *   pnpm --filter @repo/api exec tsx src/ingest/ordinances.ts links   # 법령 연계만
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const BASE = "http://www.law.go.kr/DRF/lawSearch.do";
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type LnkOrdRow = {
  자치법규일련번호?: string;
  자치법규명?: string;
  자치법규ID?: string;
  공포일자?: string;
  공포번호?: string;
  제개정구분명?: string;
  자치법규종류?: string;
  시행일자?: string;
  지자체명?: string;
  기관코드?: string;
};

type LnkLsOrdRow = {
  자치법규ID?: string;
  자치법규명?: string;
  시행일자?: string;
  법령ID?: string;
  법령명한글?: string;
};

async function fetchPage<T>(
  target: "lnkOrd" | "lnkLsOrd" | "lnkOrg",
  page: number,
  extra: Record<string, string> = {},
): Promise<{ rows: T[]; totalCount: number }> {
  const oc = process.env.LAW_OC;
  if (!oc) throw new Error("LAW_OC env not set");
  const params = new URLSearchParams({
    OC: oc,
    target,
    type: "JSON",
    display: String(PAGE_SIZE),
    page: String(page),
    ...extra,
  });
  const url = `${BASE}?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON law API response: ${text.slice(0, 200)}`);
  }
  if (typeof data === "object" && data && "result" in data) {
    throw new Error(`law API error: ${JSON.stringify(data).slice(0, 200)}`);
  }
  // 응답 wrap 분석 — open.law.go.kr는 target 별로 wrapper 키가 다름.
  const root = data as Record<string, unknown>;
  // 후보 키: "OrdinSearch", "OrdinanceSearch", "lawSearch" 등.
  let payload: Record<string, unknown> | null = null;
  for (const k of Object.keys(root)) {
    const v = root[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      payload = v as Record<string, unknown>;
      break;
    }
  }
  if (!payload) return { rows: [], totalCount: 0 };
  const totalCount = parseInt(String(payload.totalCnt ?? "0"), 10) || 0;
  // 결과 배열 키 — "law", "ordin", "lnkOrd" 등 다양. 첫 array 사용.
  let rows: T[] = [];
  for (const k of Object.keys(payload)) {
    const v = payload[k];
    if (Array.isArray(v)) {
      rows = v as T[];
      break;
    }
  }
  return { rows, totalCount };
}

export async function ingestOrdinances(): Promise<void> {
  if (!process.env.LAW_OC) {
    console.error("[ordinances] LAW_OC not set — abort.");
    return;
  }
  console.log("[ordinances] 자치법규 목록 ingest 시작…");

  let page = 1;
  let total = Infinity;
  let scanned = 0;
  let inserted = 0;

  while (scanned < total && page <= 500) {
    let result;
    try {
      result = await fetchPage<LnkOrdRow>("lnkOrd", page);
    } catch (err) {
      console.error(`[ordinances] page ${page} fetch failed:`, (err as Error).message);
      await sleep(2000);
      continue;
    }
    if (result.totalCount > 0) total = result.totalCount;
    if (result.rows.length === 0) break;
    scanned += result.rows.length;

    const data = result.rows
      .map((r) => ({
        ordSeq: r.자치법규일련번호 ?? "",
        ordId: r.자치법규ID ?? null,
        ordName: r.자치법규명 ?? "",
        ordKind: r.자치법규종류 ?? null,
        orgName: r.지자체명 ?? null,
        orgCode: r.기관코드 ?? null,
        promlgDate: r.공포일자 ?? null,
        promlgNo: r.공포번호 ?? null,
        enforceDate: r.시행일자 ?? null,
        revisionKind: r.제개정구분명 ?? null,
      }))
      .filter((d) => d.ordSeq && d.ordName);

    for (const d of data) {
      try {
        await prisma.ordinance.upsert({
          where: { ordSeq: d.ordSeq },
          create: d as Prisma.OrdinanceUncheckedCreateInput,
          update: d as Prisma.OrdinanceUncheckedUpdateInput,
        });
        inserted++;
      } catch {
        // skip conflicts.
      }
    }
    if (page % 10 === 0) {
      console.log(`[ordinances] page ${page} → ${scanned}/${total} (inserted=${inserted})`);
    }
    page++;
    await sleep(PAGE_DELAY_MS);
  }
  console.log(`[ordinances] done — scanned=${scanned} inserted=${inserted}`);
}

export async function ingestOrdinanceLawLinks(): Promise<void> {
  if (!process.env.LAW_OC) {
    console.error("[ord-links] LAW_OC not set — abort.");
    return;
  }
  console.log("[ord-links] 조례-법령 매핑 ingest 시작…");

  let page = 1;
  let total = Infinity;
  let scanned = 0;
  let linked = 0;

  while (scanned < total && page <= 500) {
    let result;
    try {
      result = await fetchPage<LnkLsOrdRow>("lnkLsOrd", page);
    } catch (err) {
      console.error(`[ord-links] page ${page} fetch failed:`, (err as Error).message);
      await sleep(2000);
      continue;
    }
    if (result.totalCount > 0) total = result.totalCount;
    if (result.rows.length === 0) break;
    scanned += result.rows.length;

    for (const r of result.rows) {
      const ordId = r.자치법규ID;
      const lawId = r.법령ID;
      const lawName = r.법령명한글;
      if (!ordId || !lawId || !lawName) continue;

      // ordId → Ordinance 룩업.
      const ord = await prisma.ordinance.findFirst({
        where: { ordId },
        select: { id: true },
      });
      if (!ord) continue;

      try {
        await prisma.ordinanceLawLink.upsert({
          where: { ordinanceId_lawId: { ordinanceId: ord.id, lawId } },
          create: { ordinanceId: ord.id, lawId, lawName },
          update: { lawName },
        });
        linked++;
      } catch {
        // skip.
      }
    }
    if (page % 10 === 0) {
      console.log(`[ord-links] page ${page} → ${scanned}/${total} (linked=${linked})`);
    }
    page++;
    await sleep(PAGE_DELAY_MS);
  }
  console.log(`[ord-links] done — scanned=${scanned} linked=${linked}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "all";
  (async () => {
    if (cmd === "links") {
      await ingestOrdinanceLawLinks();
    } else if (cmd === "list") {
      await ingestOrdinances();
    } else {
      await ingestOrdinances();
      await ingestOrdinanceLawLinks();
    }
  })()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

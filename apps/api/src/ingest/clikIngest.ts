// CLIK (국회도서관 지방의정포털) ingest CLI 엔트리포인트.
//
// Usage:
//   tsx src/ingest/clikIngest.ts                              # 전체 (minutes + bills, 모든 의회)
//   tsx src/ingest/clikIngest.ts minutes                      # 모든 의회 회의록만
//   tsx src/ingest/clikIngest.ts bills                        # 모든 의회 의안만
//   tsx src/ingest/clikIngest.ts minutes 여주시의회            # 특정 의회 회의록
//   tsx src/ingest/clikIngest.ts bills 여주시의회              # 특정 의회 의안
//   tsx src/ingest/clikIngest.ts all 여주시의회                # 특정 의회 minutes+bills
//
// 옵션 --max-pages=1 로 검증용 1페이지만 적재 가능.

import { prisma } from "../db.js";
import {
  ingestCouncilBills,
  ingestCouncilMinutes,
} from "./clikService.js";

type Mode = "all" | "minutes" | "bills";

function printUsageAndExit(code = 1): never {
  console.error(
    "Usage:\n" +
      "  tsx src/ingest/clikIngest.ts [all|minutes|bills] [councilName] [--max-pages=N]\n" +
      "  예) tsx src/ingest/clikIngest.ts minutes 여주시의회 --max-pages=1",
  );
  process.exit(code);
}

function parseArgs(): { mode: Mode; councilName: string | null; maxPages: number | undefined } {
  const argv = process.argv.slice(2);
  let mode: Mode = "all";
  let councilName: string | null = null;
  let maxPages: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--max-pages=")) {
      const n = parseInt(arg.split("=", 2)[1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) maxPages = n;
      continue;
    }
    if (arg === "all" || arg === "minutes" || arg === "bills") {
      mode = arg;
      continue;
    }
    // 위치 인자: councilName
    if (!councilName) {
      councilName = arg;
    }
  }

  return { mode, councilName, maxPages };
}

async function collectCouncilNames(filter?: string | null): Promise<string[]> {
  // Legislator 테이블에서 PROVINCIAL + BASIC 의원의 councilName 고유 목록.
  if (filter) {
    return [filter];
  }
  const rows = await prisma.legislator.findMany({
    where: {
      level: { in: ["PROVINCIAL", "BASIC"] },
      councilName: { not: null },
    },
    select: { councilName: true },
    distinct: ["councilName"],
  });
  const names = rows
    .map((r) => r.councilName)
    .filter((v): v is string => !!v && v.trim() !== "");
  return Array.from(new Set(names)).sort();
}

async function runForCouncil(
  councilName: string,
  mode: Mode,
  maxPages: number | undefined,
): Promise<void> {
  if (mode === "all" || mode === "minutes") {
    try {
      await ingestCouncilMinutes(councilName, { maxPages });
    } catch (err) {
      console.error(
        `[clik] [${councilName}] 회의록 적재 실패:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (mode === "all" || mode === "bills") {
    try {
      await ingestCouncilBills(councilName, { maxPages });
    } catch (err) {
      console.error(
        `[clik] [${councilName}] 의안 적재 실패:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function main(): Promise<void> {
  const { mode, councilName, maxPages } = parseArgs();

  if (mode === undefined) printUsageAndExit();

  const councils = await collectCouncilNames(councilName);
  if (councils.length === 0) {
    console.warn(
      "[clik] 적재 대상 의회를 찾지 못했습니다. PROVINCIAL/BASIC Legislator 데이터가 비어있을 수 있습니다.",
    );
    return;
  }

  console.log(
    `[clik] ingest 시작 — mode=${mode}, 의회 ${councils.length}곳, maxPages=${
      maxPages ?? "무제한"
    }`,
  );

  let idx = 0;
  for (const name of councils) {
    idx += 1;
    console.log(`\n[clik] (${idx}/${councils.length}) ${name} 진행 중...`);
    await runForCouncil(name, mode, maxPages);
  }

  console.log(`\n[clik] 전체 ingest 완료 — ${councils.length}개 의회 처리`);
}

main()
  .catch((err) => {
    console.error("[clik] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

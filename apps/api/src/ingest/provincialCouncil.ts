// Ingest 광역의원 (provincial council members).
// Currently a stub for the 국회도서관 지방의정포털 API (clik.nanet.go.kr).
// Optional CSV bulk-load for demo purposes via PROVINCIAL_CSV_PATH env var.

import { readFile } from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { parseCsv } from "./districtMapping.js";

interface ProvincialRow {
  의원명: string;
  정당명?: string;
  지방의회명: string;
  지역?: string;
  대수: string;
}

function buildSyntheticId(councilName: string, name: string, term: string): string {
  return `PROV-${councilName}-${name}-${term}`;
}

/**
 * Ingest provincial legislators.
 *
 * TODO: Implement the clik.nanet.go.kr API integration once a CLIK_API_KEY is obtained.
 *       Register for an API key at https://clik.nanet.go.kr
 *       Rate limit: 100 records/call, 1000 calls/day.
 */
export async function ingestProvincialLegislators(): Promise<void> {
  const apiKey = process.env.CLIK_API_KEY;
  const csvPath = process.env.PROVINCIAL_CSV_PATH;

  if (!apiKey && !csvPath) {
    console.warn(
      "[provincial] CLIK_API_KEY not set and PROVINCIAL_CSV_PATH not provided. Skipping.",
    );
    return;
  }

  if (apiKey) {
    // TODO: implement clik.nanet.go.kr API integration.
    //       See https://clik.nanet.go.kr for endpoint registration & docs.
    console.log("[provincial] TODO: implement clik.nanet.go.kr API");
  }

  if (!csvPath) {
    // No fallback data; nothing to do until the API is implemented.
    return;
  }

  console.log(`[provincial] Loading from CSV ${csvPath}...`);
  const text = await readFile(csvPath, "utf-8");
  const rows = parseCsv(text) as unknown as ProvincialRow[];
  console.log(`[provincial] Got ${rows.length} rows. Upserting...`);

  let success = 0;
  for (const row of rows) {
    const name = (row.의원명 ?? "").trim();
    const council = (row.지방의회명 ?? "").trim();
    const term = (row.대수 ?? "").trim();
    if (!name || !council || !term) continue;

    const id = buildSyntheticId(council, name, term);
    const data = {
      level: "PROVINCIAL" as const,
      name,
      party: (row.정당명 ?? "").trim() || null,
      councilName: council,
      region: (row.지역 ?? "").trim() || null,
      termCount: term,
      rawSourceJson: row as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };

    try {
      await prisma.legislator.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      success += 1;
    } catch (err) {
      console.error(`[provincial] Failed for ${id}:`, err);
    }
  }
  console.log(`[provincial] Done. Upserted ${success}/${rows.length}.`);
}

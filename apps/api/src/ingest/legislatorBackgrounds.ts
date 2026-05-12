// Ingest 의원 (legislator) background disclosures (전과/재산/병역/세금)
// from info.nec.go.kr.
//
// Disclosures were filed when each legislator ran as a candidate in their
// "last" election (national=22대 총선 0020240410, local=8회 지선 0020220601).
// Legislator.huboid + Legislator.disclosureElectionId must be set first
// (run `legislator-huboids` step).
//
// Reuses the same fetchScanCategory helper as candidateBackground.ts, so the
// HTTP behavior (Referer header, gubun mapping, defensive 403 handling) is
// identical.

import { prisma } from "../db.js";
import { fetchScanCategory } from "./candidateBackground.js";

const THROTTLE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ingest disclosure data for all Legislator rows with huboid +
 * disclosureElectionId set. Updates the presence flags + PDF URLs +
 * backgroundLastSyncedAt.
 *
 * Errors are caught per-legislator so one bad row doesn't abort the batch.
 */
export async function ingestLegislatorBackgrounds(): Promise<void> {
  console.log("[legis-bg] Starting legislator background ingest.");

  const legislators = await prisma.legislator.findMany({
    where: {
      huboid: { not: null },
      disclosureElectionId: { not: null },
    },
    select: {
      id: true,
      name: true,
      huboid: true,
      disclosureElectionId: true,
    },
  });

  console.log(`[legis-bg] Found ${legislators.length} legislators with huboid linked.`);

  let success = 0;
  let withAny = 0;
  let processed = 0;

  for (const legis of legislators) {
    processed += 1;
    const huboid = legis.huboid;
    const electionId = legis.disclosureElectionId;
    if (!huboid || !electionId) continue;

    try {
      // gubun: 2=재산, 3=납세/체납, 4=병역, 5=전과
      const [asset, tax, military, criminal] = await Promise.all([
        fetchScanCategory(electionId, huboid, "2"),
        fetchScanCategory(electionId, huboid, "3"),
        fetchScanCategory(electionId, huboid, "4"),
        fetchScanCategory(electionId, huboid, "5"),
      ]);

      const hasAny =
        asset.has || tax.has || military.has || criminal.has;
      if (hasAny) withAny += 1;

      await prisma.legislator.update({
        where: { id: legis.id },
        data: {
          hasAssetDisclosure: asset.has,
          assetDisclosurePdfUrl: asset.pdfUrl,
          hasTaxRecord: tax.has,
          taxRecordPdfUrl: tax.pdfUrl,
          hasMilitaryRecord: military.has,
          militaryRecordPdfUrl: military.pdfUrl,
          hasCriminalRecord: criminal.has,
          criminalRecordPdfUrl: criminal.pdfUrl,
          backgroundLastSyncedAt: new Date(),
        },
      });

      success += 1;

      if (processed % 50 === 0) {
        console.log(
          `[legis-bg] Progress: ${processed}/${legislators.length} (${withAny} with disclosures)`,
        );
      }
    } catch (err) {
      console.error(
        `[legis-bg] Failed for ${legis.id} (${legis.name}):`,
        (err as Error).message,
      );
    }

    // Throttle between legislators to be polite to info.nec.go.kr.
    if (processed < legislators.length) {
      await sleep(THROTTLE_MS);
    }
  }

  console.log(
    `[legis-bg] Done. Updated ${success}/${legislators.length}; ${withAny} had at least one disclosure.`,
  );
}

// Ingest 후보자 background data (전과/재산/병역/세금) from info.nec.go.kr.
//
// The candidate_detail_scanSearchJson endpoint returns only PDF file
// references — NOT structured numeric fields like 재산 총액 or 전과 횟수.
// For MVP we store:
//   - PDF file URLs (so users can click through)
//   - Simple "있음/없음" presence flags (items[] non-empty)
//
// Endpoint:
//   GET http://info.nec.go.kr/electioninfo/candidate_detail_scanSearchJson.json
//     ?statementId=CPRI03_candidate_scanSearch
//     &electionId={0020260603}
//     &huboId={huboId}
//     &gubun={2|3|4|5}
//
// gubun:
//   2 = 재산 (asset disclosure)
//   3 = 납세/체납 (tax records)
//   4 = 병역 (military service)
//   5 = 전과 (criminal records)
//
// Required header: Referer: http://info.nec.go.kr (server returns 403 otherwise).
//
// Response shape:
//   {
//     jsonResult: {
//       header: { result: "success" },
//       body: { items: [ { gubun, scanFileNm, fileUrl, ... } ] }
//     }
//   }

import { prisma } from "../db.js";

const SCAN_BASE_URL =
  "http://info.nec.go.kr/electioninfo/candidate_detail_scanSearchJson.json";
const STATEMENT_ID = "CPRI03_candidate_scanSearch";
const THROTTLE_MS = 200;

type Gubun = "2" | "3" | "4" | "5";

interface ScanItem {
  gubun?: string;
  scanFileNm?: string;
  fileUrl?: string;
  [key: string]: unknown;
}

interface ScanResponse {
  jsonResult?: {
    header?: { result?: string };
    body?: { items?: ScanItem[] };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert internal electionId ("20260603") to info.nec.go.kr long form
 * ("0020260603"). If the value is already prefixed (10+ digits) we return it
 * as-is. The info portal expects a 10-char ID with a "00" prefix.
 */
function toInfoNecElectionId(electionId: string): string {
  const digits = electionId.replace(/\D/g, "");
  if (digits.length >= 10) return digits;
  return `00${digits}`.slice(-10).padStart(10, "0").replace(/^(\d{2})/, "00").slice(0, 10) ||
    `00${digits}`;
}

/**
 * Fetch one (gubun) category for a candidate. Returns presence + first PDF
 * URL. Defensive: returns { has: false, pdfUrl: null } on any error, 403,
 * malformed JSON, or empty arrays. We log the error but don't throw.
 */
export async function fetchScanCategory(
  electionId: string,
  huboId: string,
  gubun: Gubun,
): Promise<{ has: boolean; pdfUrl: string | null }> {
  const infoElectionId = toInfoNecElectionId(electionId);
  const url =
    `${SCAN_BASE_URL}?statementId=${encodeURIComponent(STATEMENT_ID)}` +
    `&electionId=${encodeURIComponent(infoElectionId)}` +
    `&huboId=${encodeURIComponent(huboId)}` +
    `&gubun=${encodeURIComponent(gubun)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Referer: "http://info.nec.go.kr",
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!response.ok) {
      // 403 is common — server rejects bad referer or rate-limited. Be quiet.
      if (response.status !== 403) {
        console.warn(
          `[candidate-backgrounds] HTTP ${response.status} for ${huboId} gubun=${gubun}`,
        );
      }
      return { has: false, pdfUrl: null };
    }

    const text = await response.text();
    let parsed: ScanResponse;
    try {
      parsed = JSON.parse(text) as ScanResponse;
    } catch {
      console.warn(
        `[candidate-backgrounds] Malformed JSON for ${huboId} gubun=${gubun}`,
      );
      return { has: false, pdfUrl: null };
    }

    const result = parsed.jsonResult?.header?.result;
    if (result && result !== "success") {
      return { has: false, pdfUrl: null };
    }

    const items = parsed.jsonResult?.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { has: false, pdfUrl: null };
    }

    const firstUrl = items
      .map((it) => (typeof it.fileUrl === "string" ? it.fileUrl.trim() : ""))
      .find((u) => u.length > 0);

    return { has: true, pdfUrl: firstUrl ?? null };
  } catch (err) {
    console.warn(
      `[candidate-backgrounds] Fetch failed for ${huboId} gubun=${gubun}:`,
      (err as Error).message,
    );
    return { has: false, pdfUrl: null };
  }
}

/**
 * Ingest background disclosure data (전과/재산/병역/세금) for all candidates
 * of the given election. Uses the public info.nec.go.kr scan-file endpoint —
 * NO API key required.
 *
 * The endpoint returns only PDF references; structured numeric fields (재산
 * 총액 etc.) are not available without scraping the PDFs. We store presence
 * flags + PDF URLs for the frontend to link to.
 *
 * Errors are caught per-candidate to avoid aborting the entire batch.
 */
export async function ingestCandidateBackgrounds(
  electionId: string = "20260603",
): Promise<void> {
  console.log(
    `[candidate-backgrounds] Starting background ingest for election ${electionId}.`,
  );

  const candidates = await prisma.candidate.findMany({
    where: { electionId },
    select: { id: true, name: true },
  });

  console.log(
    `[candidate-backgrounds] Found ${candidates.length} candidates to process.`,
  );

  let success = 0;
  let withAny = 0;
  let processed = 0;

  for (const c of candidates) {
    processed += 1;
    try {
      // Fetch all 4 gubun values in parallel for this candidate.
      const [asset, tax, military, criminal] = await Promise.all([
        fetchScanCategory(electionId, c.id, "2"),
        fetchScanCategory(electionId, c.id, "3"),
        fetchScanCategory(electionId, c.id, "4"),
        fetchScanCategory(electionId, c.id, "5"),
      ]);

      const hasAny =
        asset.has || tax.has || military.has || criminal.has;
      if (hasAny) withAny += 1;

      await prisma.candidate.update({
        where: { id: c.id },
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
          `[candidate-backgrounds] Progress: ${processed}/${candidates.length} (${withAny} with disclosures)`,
        );
      }
    } catch (err) {
      console.error(
        `[candidate-backgrounds] Failed for ${c.id} (${c.name}):`,
        (err as Error).message,
      );
    }

    // Throttle between candidates to be polite to info.nec.go.kr.
    if (processed < candidates.length) {
      await sleep(THROTTLE_MS);
    }
  }

  console.log(
    `[candidate-backgrounds] Done. Updated ${success}/${candidates.length} candidates; ${withAny} had at least one disclosure.`,
  );
}

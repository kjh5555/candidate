// Ingest 제9회 전국동시지방선거 candidates (2026-06-03) from data.go.kr
// PofelcddInfoInqireService.
//
// Scope (Option A):
//   - 시·도지사 (GOVERNOR)      sgTypecode=3
//   - 시장·군수·구청장 (MAYOR)   sgTypecode=4
//
// Skips: 광역의원, 기초의원, 교육감
//
// Pledge ingestion (getCnddtElecPrmsInfoInqire) is a TODO — we just create the
// CandidatePledge schema; wiring is deferred.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

const SERVICE_PATH = "PofelcddInfoInqireService";
const REGISTER_METHOD = "getPoelpcddRegistSttusInfoInqire";

const SG_TYPECODE_GOVERNOR = "3"; // 시·도지사
const SG_TYPECODE_MAYOR = "4"; // 시장·군수·구청장

const DEFAULT_ELECTION_ID = "20260603";

// ---------- Raw row type ----------
interface NecCandidateRow {
  huboid?: string;
  name?: string;
  hanjaName?: string;
  gender?: string;
  birthday?: string; // YYYYMMDD
  age?: string | number;
  jdName?: string; // party
  job?: string;
  edu?: string;
  career1?: string;
  career2?: string;
  addr?: string;
  sdName?: string;
  wiwName?: string;
  sggName?: string;
  status?: string;
  regdate?: string;
  sgId?: string;
  sgTypecode?: string | number;
}

// ---------- Helpers ----------
function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function parseBirthDate(raw: string | undefined): string | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length !== 8) return t;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function parseIntOrNull(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateTime(raw: string | undefined): Date | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 8) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    // If a time portion is present (>= 14 digits) use it.
    if (digits.length >= 14) {
      const hh = digits.slice(8, 10);
      const mm = digits.slice(10, 12);
      const ss = digits.slice(12, 14);
      const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const fallback = new Date(t);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function mapStatus(raw: string | undefined): "REGISTERED" | "WITHDRAWN" | "CANCELLED" | "UNKNOWN" {
  const t = emptyToNull(raw);
  if (!t) return "UNKNOWN";
  if (t.includes("등록")) return "REGISTERED";
  if (t.includes("사퇴")) return "WITHDRAWN";
  if (t.includes("무효") || t.includes("취소")) return "CANCELLED";
  return "UNKNOWN";
}

// ---------- Per-position ingestion ----------
async function ingestPositionType(
  electionId: string,
  sgTypecode: string,
  positionType: "GOVERNOR" | "MAYOR",
): Promise<{ total: number; success: number }> {
  const label = positionType === "GOVERNOR" ? "시·도지사" : "시장·군수·구청장";
  console.log(
    `[local-candidates] Fetching ${label} (sgId=${electionId}, sgTypecode=${sgTypecode})...`,
  );

  const rows = await fetchAllNecPages<NecCandidateRow>(
    SERVICE_PATH,
    REGISTER_METHOD,
    {
      sgId: electionId,
      sgTypecode,
    },
  );

  console.log(
    `[local-candidates] Got ${rows.length} ${label} rows. Upserting...`,
  );

  let success = 0;
  for (const row of rows) {
    const id = emptyToNull(row.huboid);
    if (!id) continue;

    const name = emptyToNull(row.name) ?? emptyToNull(row.hanjaName) ?? id;

    const data = {
      electionId,
      positionType,
      name,
      hanjaName: emptyToNull(row.hanjaName),
      party: emptyToNull(row.jdName),
      gender: emptyToNull(row.gender),
      birthDate: parseBirthDate(row.birthday),
      age: parseIntOrNull(row.age),
      occupation: emptyToNull(row.job),
      education: emptyToNull(row.edu),
      career1: emptyToNull(row.career1),
      career2: emptyToNull(row.career2),
      address: emptyToNull(row.addr),
      sido: emptyToNull(row.sdName),
      wiwName: emptyToNull(row.wiwName),
      districtName: emptyToNull(row.sggName),
      status: mapStatus(row.status),
      registeredAt: parseDateTime(row.regdate),
      rawSourceJson: row as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };

    try {
      await prisma.candidate.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      success += 1;
    } catch (err) {
      console.error(`[local-candidates] Failed for ${id}:`, err);
    }
  }

  console.log(
    `[local-candidates] Done ${label}. Upserted ${success}/${rows.length}.`,
  );
  return { total: rows.length, success };
}

/**
 * Ingest all 시·도지사 and 시장·군수·구청장 candidates for the given election.
 *
 * Pledges are NOT ingested here — that's a separate API
 * (getCnddtElecPrmsInfoInqire) and we'll wire it in a follow-up.
 */
export async function ingestLocalCandidates(
  electionId: string = DEFAULT_ELECTION_ID,
): Promise<void> {
  console.log(
    `[local-candidates] Starting ingestion for election ${electionId}.`,
  );

  await ingestPositionType(electionId, SG_TYPECODE_GOVERNOR, "GOVERNOR");
  await ingestPositionType(electionId, SG_TYPECODE_MAYOR, "MAYOR");

  // TODO: ingest pledges via PofelcddInfoInqireService/getCnddtElecPrmsInfoInqire
  // for each candidate (huboid). Stubbed for now — CandidatePledge table exists
  // but is left empty.

  console.log(`[local-candidates] All done for election ${electionId}.`);
}

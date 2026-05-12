// Ingest 광역의회 의원 (시·도의회 의원) from NEC 당선인 정보 API.
//
// Source: data.go.kr "당선인정보조회서비스" (15000864)
//   Endpoint: http://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire
//
// Election scope:
//   - sgId=20220601 (제8회 전국동시지방선거, 2022-06-01)
//   - sgTypecode=4 → 광역의원 지역구
//   - sgTypecode=5 → 광역의원 비례
//
// 8회 지선 광역의원 당선자 임기: 2022-07-01 ~ 2026-06-30 (제11대).
//
// Key notes:
//   - We use the same NEC_API_KEY (일반인증키, URL-encoded form) used by
//     localElection.ts. fetchAllNecPages handles the quirky encoding.
//   - huboid is unique per candidate; we prefix with "PROV-WIN-" to ensure
//     ID space cannot collide with national MONA_CDs.
//   - 비례 candidates have sggName == "비례대표" — store as-is.
//
// Defensive parsing: API field names may vary slightly across releases. We
// accept undefined fields gracefully and log unknown shapes.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";

const SERVICE_PATH = "WinnerInfoInqireService2";
const QUERY_METHOD = "getWinnerInfoInqire";

const SG_TYPECODE_PROVINCIAL_LOCAL = "5"; // 광역의원 지역구 (779명)
const SG_TYPECODE_PROVINCIAL_PROP = "8"; // 광역의원 비례 (93명)
const SG_TYPECODE_BASIC_LOCAL = "6"; // 기초의원 지역구 (2,601명)
const SG_TYPECODE_BASIC_PROP = "9"; // 기초의원 비례 (386명)

const DEFAULT_SG_ID = "20220601"; // 제8회 지방선거
const PROVINCIAL_ASSEMBLY_AGE = 11; // 제11대 광역의회
const BASIC_ASSEMBLY_AGE = 9; // 제9대 기초의회 (2022-07 ~ 2026-06)

// ---------- Raw row type (defensive) ----------
interface NecWinnerRow {
  huboid?: string | number;
  name?: string;
  hanjaName?: string;
  gender?: string;
  birthday?: string; // YYYYMMDD
  age?: string | number;
  jdName?: string; // party
  sdName?: string; // sido
  wiwName?: string; // sigungu (often empty for provincial)
  sggName?: string; // 선거구명 / "비례대표"
  job?: string;
  jobName?: string;
  edu?: string;
  career1?: string;
  career2?: string;
  addr?: string;
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

function mapGender(raw: string | undefined): "MALE" | "FEMALE" | "UNKNOWN" {
  const t = emptyToNull(raw);
  if (!t) return "UNKNOWN";
  if (t === "남" || t.startsWith("남")) return "MALE";
  if (t === "여" || t.startsWith("여")) return "FEMALE";
  return "UNKNOWN";
}

function buildCouncilName(sdName: string | null): string | null {
  if (!sdName) return null;
  // e.g. 서울특별시 -> 서울특별시의회, 경기도 -> 경기도의회
  return `${sdName}의회`;
}

function buildId(huboid: string, prefix = "PROV-WIN"): string {
  return `${prefix}-${huboid}`;
}

function buildBasicCouncilName(
  sdName: string | null,
  wiwName: string | null,
): string | null {
  if (!sdName && !wiwName) return null;
  // 강원도 영월군 -> 영월군의회, 서울특별시 강남구 -> 강남구의회
  if (wiwName) return `${wiwName}의회`;
  return sdName ? `${sdName}의회` : null;
}

async function ingestOnePool(
  sgId: string,
  sgTypecode: string,
  poolLabel: string,
  options: {
    level: "PROVINCIAL" | "BASIC";
    assemblyAge: number;
    idPrefix: string;
  } = {
    level: "PROVINCIAL",
    assemblyAge: PROVINCIAL_ASSEMBLY_AGE,
    idPrefix: "PROV-WIN",
  },
): Promise<{ total: number; success: number }> {
  console.log(
    `[provincial-legis] Fetching ${poolLabel} (sgId=${sgId}, sgTypecode=${sgTypecode})...`,
  );

  let rows: NecWinnerRow[] = [];
  try {
    rows = await fetchAllNecPages<NecWinnerRow>(
      SERVICE_PATH,
      QUERY_METHOD,
      {
        sgId,
        sgTypecode,
      },
    );
  } catch (err) {
    console.error(
      `[provincial-legis] Failed to fetch ${poolLabel}:`,
      (err as Error).message,
    );
    return { total: 0, success: 0 };
  }

  console.log(
    `[provincial-legis] Got ${rows.length} ${poolLabel} rows. Upserting...`,
  );

  let success = 0;
  for (const row of rows) {
    const huboidRaw = row.huboid != null ? String(row.huboid).trim() : "";
    if (!huboidRaw) continue;
    const id = buildId(huboidRaw, options.idPrefix);

    const name =
      emptyToNull(row.name) ?? emptyToNull(row.hanjaName) ?? huboidRaw;
    const sdName = emptyToNull(row.sdName);
    const sggName = emptyToNull(row.sggName);
    const wiwName = emptyToNull((row as { wiwName?: string }).wiwName);
    const careerSummary =
      emptyToNull(row.jobName) ??
      emptyToNull(row.job) ??
      emptyToNull(row.career1);

    const councilName =
      options.level === "BASIC"
        ? buildBasicCouncilName(sdName, wiwName)
        : buildCouncilName(sdName);
    // For 기초의원, region should be 시·군·구 to differentiate from 광역
    const region = options.level === "BASIC" ? wiwName ?? sdName : sdName;

    const data = {
      level: options.level,
      name,
      party: emptyToNull(row.jdName),
      gender: mapGender(row.gender),
      birthDate: parseBirthDate(row.birthday),
      electoralDistrictName: sggName,
      assemblyAge: options.assemblyAge,
      committee: careerSummary,
      councilName,
      region,
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
      console.error(`[provincial-legis] Failed for ${id}:`, err);
    }
  }

  console.log(
    `[provincial-legis] Done ${poolLabel}. Upserted ${success}/${rows.length}.`,
  );
  return { total: rows.length, success };
}

/**
 * Ingest 광역의회 의원 (지역구 + 비례) for the given local-election sgId.
 *
 * Stores rows as Legislator with level=PROVINCIAL.
 * ID = `PROV-WIN-${huboid}` to avoid collisions with national MONA_CDs.
 *
 * Defaults to sgId=20220601 (제8회 지방선거).
 *
 * Falls back to the old clik.nanet.go.kr / CSV path if NEC_API_KEY is missing.
 * If both NEC_API_KEY and CLIK_API_KEY/CSV are missing, this is a no-op with
 * a warning.
 */
export async function ingestProvincialLegislators(
  sgId: string = DEFAULT_SG_ID,
): Promise<void> {
  if (!process.env.NEC_API_KEY) {
    console.warn(
      "[provincial-legis] NEC_API_KEY not set. Skipping NEC-based ingest.",
    );
    return;
  }

  console.log(
    `[provincial-legis] Starting NEC 광역의회 ingest for sgId=${sgId}.`,
  );

  const local = await ingestOnePool(
    sgId,
    SG_TYPECODE_PROVINCIAL_LOCAL,
    "광역의원 지역구",
  );
  const proportional = await ingestOnePool(
    sgId,
    SG_TYPECODE_PROVINCIAL_PROP,
    "광역의원 비례",
  );

  const totalRows = local.total + proportional.total;
  const totalSuccess = local.success + proportional.success;
  console.log(
    `[provincial-legis] All done. Upserted ${totalSuccess}/${totalRows} provincial legislators (sgId=${sgId}).`,
  );
}

/**
 * Ingest 기초의원 (시·군·구의회 의원, 지역구 + 비례) for the given local-election sgId.
 *
 * Stores rows as Legislator with level=BASIC.
 * ID = `BASIC-WIN-${huboid}` to avoid collisions with provincial/national.
 *
 * Defaults to sgId=20220601 (제8회 지방선거 = 제9대 기초의회).
 */
export async function ingestBasicLegislators(
  sgId: string = DEFAULT_SG_ID,
): Promise<void> {
  if (!process.env.NEC_API_KEY) {
    console.warn(
      "[basic-legis] NEC_API_KEY not set. Skipping NEC-based ingest.",
    );
    return;
  }

  console.log(`[basic-legis] Starting NEC 기초의회 ingest for sgId=${sgId}.`);

  const opts = {
    level: "BASIC" as const,
    assemblyAge: BASIC_ASSEMBLY_AGE,
    idPrefix: "BASIC-WIN",
  };

  const local = await ingestOnePool(
    sgId,
    SG_TYPECODE_BASIC_LOCAL,
    "기초의원 지역구",
    opts,
  );
  const proportional = await ingestOnePool(
    sgId,
    SG_TYPECODE_BASIC_PROP,
    "기초의원 비례",
    opts,
  );

  const totalRows = local.total + proportional.total;
  const totalSuccess = local.success + proportional.success;
  console.log(
    `[basic-legis] All done. Upserted ${totalSuccess}/${totalRows} basic legislators (sgId=${sgId}).`,
  );
}

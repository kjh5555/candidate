// Link Legislator rows to NEC huboid so we can fetch disclosures from
// info.nec.go.kr (전과/재산/병역/세금).
//
// For PROVINCIAL/BASIC legislators, the Legislator.id already encodes the
// huboid (PROV-WIN-{huboid} / BASIC-WIN-{huboid}), so this is a pure DB-side
// update. They map to sgId=20220601 (제8회 지방선거, electionId=0020220601).
//
// For NATIONAL legislators the id is MONA_CD from open.assembly.go.kr — NOT
// the NEC huboid. We must call NEC's WinnerInfoInqireService2 for the 22대
// 총선 (sgId=20240410, sgTypecode=2) and match by Korean name + 선거구
// (sggName / electoralDistrictName). 비례 candidates have sggName="비례대표";
// we fall back to name+party for those.
//
// Matching strategy (national):
//   1. Build (normalizedName → list<winnerRow>) index
//   2. For each legislator:
//      a. exact (name + electoralDistrictName) match
//      b. for 비례 (electoralDistrictName==="비례대표" or null),
//         name + party fallback
//      c. log unmatched
//
// Sets Legislator.huboid + Legislator.disclosureElectionId.

import { prisma } from "../db.js";
import { fetchAllNecPages } from "./utils/necClient.js";
import { normalizeName, compareName } from "./utils/nameNormalizer.js";

const NATIONAL_DISCLOSURE_ELECTION_ID = "0020240410"; // 22대 총선
const LOCAL_DISCLOSURE_ELECTION_ID = "0020220601"; // 8회 지선

const NATIONAL_SG_ID = "20240410";
const NATIONAL_SG_TYPECODE = "2"; // 국회의원

interface NecWinnerRow {
  huboid?: string | number;
  name?: string;
  hanjaName?: string;
  gender?: string;
  jdName?: string; // party
  sdName?: string; // sido
  sggName?: string; // 선거구명 / "비례대표"
  wiwName?: string;
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function extractHuboidFromId(id: string): string | null {
  // PROV-WIN-{huboid}, BASIC-WIN-{huboid}
  const m = /^(?:PROV|BASIC)-WIN-(.+)$/.exec(id);
  if (m && m[1]) return m[1];
  return null;
}

function isProportional(districtName: string | null): boolean {
  if (!districtName) return false;
  const t = districtName.replace(/\s+/g, "");
  return t === "비례대표" || t.includes("비례");
}

/**
 * Update huboid + disclosureElectionId for all PROVINCIAL/BASIC legislators.
 * For these, the huboid is already encoded in the id, so this is a pure
 * raw SQL bulk update.
 */
async function linkLocalLegislatorHuboids(): Promise<{
  provincial: number;
  basic: number;
}> {
  // PROVINCIAL
  const provincialRows = await prisma.legislator.findMany({
    where: { level: "PROVINCIAL", id: { startsWith: "PROV-WIN-" } },
    select: { id: true },
  });
  let provincial = 0;
  for (const r of provincialRows) {
    const hub = extractHuboidFromId(r.id);
    if (!hub) continue;
    await prisma.legislator.update({
      where: { id: r.id },
      data: {
        huboid: hub,
        disclosureElectionId: LOCAL_DISCLOSURE_ELECTION_ID,
      },
    });
    provincial += 1;
  }
  console.log(
    `[legis-huboids] PROVINCIAL: linked huboid for ${provincial}/${provincialRows.length}.`,
  );

  // BASIC
  const basicRows = await prisma.legislator.findMany({
    where: { level: "BASIC", id: { startsWith: "BASIC-WIN-" } },
    select: { id: true },
  });
  let basic = 0;
  for (const r of basicRows) {
    const hub = extractHuboidFromId(r.id);
    if (!hub) continue;
    await prisma.legislator.update({
      where: { id: r.id },
      data: {
        huboid: hub,
        disclosureElectionId: LOCAL_DISCLOSURE_ELECTION_ID,
      },
    });
    basic += 1;
  }
  console.log(
    `[legis-huboids] BASIC: linked huboid for ${basic}/${basicRows.length}.`,
  );

  return { provincial, basic };
}

/**
 * Link 국회의원 (NATIONAL) legislators to their 22대 총선 huboid via NEC
 * WinnerInfoInqireService2.
 */
export async function linkNationalLegislatorHuboids(): Promise<{
  matched: number;
  total: number;
}> {
  if (!process.env.NEC_API_KEY) {
    console.warn(
      "[legis-huboids] NEC_API_KEY not set. Skipping NATIONAL huboid linking.",
    );
    return { matched: 0, total: 0 };
  }

  console.log(
    `[legis-huboids] Fetching 22대 총선 당선인 (sgId=${NATIONAL_SG_ID}, sgTypecode=${NATIONAL_SG_TYPECODE})...`,
  );

  let winners: NecWinnerRow[] = [];
  try {
    winners = await fetchAllNecPages<NecWinnerRow>(
      "WinnerInfoInqireService2",
      "getWinnerInfoInqire",
      {
        sgId: NATIONAL_SG_ID,
        sgTypecode: NATIONAL_SG_TYPECODE,
      },
    );
  } catch (err) {
    console.error(
      `[legis-huboids] Failed to fetch 22대 총선 당선인:`,
      (err as Error).message,
    );
    return { matched: 0, total: 0 };
  }

  console.log(`[legis-huboids] Got ${winners.length} 당선인 rows.`);

  // Build name index: normalizedName -> rows
  const byName = new Map<string, NecWinnerRow[]>();
  for (const w of winners) {
    const n = normalizeName(w.name ?? "");
    if (!n) continue;
    const list = byName.get(n) ?? [];
    list.push(w);
    byName.set(n, list);
  }

  const legislators = await prisma.legislator.findMany({
    where: { level: "NATIONAL" },
    select: {
      id: true,
      name: true,
      party: true,
      electoralDistrictName: true,
    },
  });

  console.log(
    `[legis-huboids] Matching ${legislators.length} NATIONAL legislators...`,
  );

  let matched = 0;
  const unmatched: Array<{ id: string; name: string; district: string | null }> =
    [];

  for (const legis of legislators) {
    const normalizedLegName = normalizeName(legis.name);
    const candidates = byName.get(normalizedLegName) ?? [];

    let chosen: NecWinnerRow | null = null;

    if (candidates.length === 1) {
      chosen = candidates[0]!;
    } else if (candidates.length > 1) {
      const legisDistrict = legis.electoralDistrictName ?? "";
      const legisProportional = isProportional(legisDistrict);

      // Try exact district match first
      for (const w of candidates) {
        const wDistrict = w.sggName ?? "";
        const wProportional = isProportional(wDistrict);
        if (
          !legisProportional &&
          !wProportional &&
          compareName(legisDistrict, wDistrict) >= 0.9
        ) {
          chosen = w;
          break;
        }
        if (legisProportional && wProportional && legis.party && w.jdName) {
          if (normalizeName(legis.party) === normalizeName(w.jdName)) {
            chosen = w;
            break;
          }
        }
      }

      // Fallback: 비례 by party only
      if (!chosen && legisProportional) {
        for (const w of candidates) {
          const wProportional = isProportional(w.sggName ?? "");
          if (
            wProportional &&
            legis.party &&
            w.jdName &&
            normalizeName(legis.party) === normalizeName(w.jdName)
          ) {
            chosen = w;
            break;
          }
        }
      }

      // Fallback: relaxed district similarity (e.g. "서울특별시 강남구갑" vs "강남구갑")
      if (!chosen && !legisProportional) {
        for (const w of candidates) {
          if (compareName(legisDistrict, w.sggName ?? "") >= 0.6) {
            chosen = w;
            break;
          }
        }
      }
    }

    if (!chosen) {
      unmatched.push({
        id: legis.id,
        name: legis.name,
        district: legis.electoralDistrictName,
      });
      continue;
    }

    const huboidRaw =
      chosen.huboid != null ? String(chosen.huboid).trim() : "";
    if (!huboidRaw) {
      unmatched.push({
        id: legis.id,
        name: legis.name,
        district: legis.electoralDistrictName,
      });
      continue;
    }

    try {
      await prisma.legislator.update({
        where: { id: legis.id },
        data: {
          huboid: huboidRaw,
          disclosureElectionId: NATIONAL_DISCLOSURE_ELECTION_ID,
        },
      });
      matched += 1;
    } catch (err) {
      console.error(
        `[legis-huboids] Failed to update ${legis.id}:`,
        (err as Error).message,
      );
    }
  }

  console.log(
    `[legis-huboids] NATIONAL: matched ${matched}/${legislators.length}. ${unmatched.length} unmatched.`,
  );
  if (unmatched.length > 0) {
    const sample = unmatched.slice(0, 20);
    console.warn(
      `[legis-huboids] Unmatched sample (up to 20):`,
      sample.map((u) => `${u.name} (${u.district ?? "—"}) [${u.id}]`).join("; "),
    );
  }

  return { matched, total: legislators.length };
}

/**
 * Orchestrator: link huboids for all legislator levels.
 * - PROVINCIAL/BASIC: extract huboid from id, set disclosureElectionId=0020220601
 * - NATIONAL: match by name + 선거구 against 22대 총선 당선인 API,
 *   set disclosureElectionId=0020240410
 */
export async function linkAllLegislatorHuboids(): Promise<void> {
  console.log("[legis-huboids] Starting huboid linking for all levels.");
  const local = await linkLocalLegislatorHuboids();
  const national = await linkNationalLegislatorHuboids();
  console.log(
    `[legis-huboids] Done. PROVINCIAL=${local.provincial}, BASIC=${local.basic}, NATIONAL=${national.matched}/${national.total}.`,
  );
  // Silence unused param warning
  void emptyToNull;
}

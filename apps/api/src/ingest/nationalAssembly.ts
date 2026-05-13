// Ingest legislators, bills, and votes from the 열린국회정보 OpenAPI.
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { fetchAllPages } from "./utils/apiClient.js";

// ---------- Raw row types ----------
interface LegislatorRow {
  MONA_CD: string;
  HG_NM?: string;
  HJ_NM?: string;
  POLY_NM?: string;
  ORIG_NM?: string;
  CMIT_NM?: string;
  REELE_GBN_NM?: string;
  UNITS?: string;
  BTH_DATE?: string;
  SEX_GBN_NM?: string;
  TEL_NO?: string;
  E_MAIL?: string;
  HOMEPAGE?: string;
  ASSEM_ADDR?: string;
  MEM_TITLE?: string;
  MEMO?: string;
}

interface BillRow {
  BILL_ID: string;
  BILL_NO?: string;
  BILL_NAME?: string;
  PROPOSER?: string;
  RST_PROPOSER?: string;
  PUBL_PROPOSER?: string;
  PROPOSE_DT?: string;
  COMMITTEE?: string;
  PROC_RESULT?: string;
  LINK_URL?: string;
  AGE?: string;
}

interface VoteEventRow {
  // 본회의 표결 집계 (ncocpgfiaoituanbr)
  BILL_ID: string;
  BILL_NO: string;
  BILL_NAME?: string;
  PROC_DT?: string;
  PROC_RESULT_CD?: string;
  AGE?: string | number;
}

interface MemberVoteRow {
  // 본회의 표결 의원별 (nojepdqqaweusdfbi)
  BILL_ID: string;
  BILL_NO: string;
  BILL_NAME?: string;
  MONA_CD: string;
  HG_NM?: string;
  HJ_NM?: string;
  POLY_NM?: string;
  RESULT_VOTE_MOD?: string;
  VOTE_DATE?: string;
  AGE?: string | number;
}

// ---------- Helpers ----------
function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseBirthDate(raw: string | undefined): string | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  // Expect YYYYMMDD; insert dashes
  const digits = t.replace(/\D/g, "");
  if (digits.length !== 8) return t;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function mapGender(raw: string | undefined): "MALE" | "FEMALE" | "UNKNOWN" {
  const t = emptyToNull(raw);
  if (t === "남") return "MALE";
  if (t === "여") return "FEMALE";
  return "UNKNOWN";
}

function mapBillResult(raw: string | undefined): Prisma.BillCreateInput["result"] {
  const t = emptyToNull(raw);
  if (!t) return "PENDING";
  if (t.includes("원안가결")) return "PASSED";
  if (t.includes("수정가결")) return "PASSED_AMENDED";
  if (t.includes("부결")) return "REJECTED";
  if (t.includes("철회")) return "WITHDRAWN";
  if (t.includes("대안반영폐기")) return "SUPERSEDED";
  return "PENDING";
}

function mapVoteResult(raw: string | undefined): "YES" | "NO" | "ABSTAIN" | "ABSENT" | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  if (t.includes("찬성")) return "YES";
  if (t.includes("반대")) return "NO";
  if (t.includes("기권")) return "ABSTAIN";
  if (t.includes("불참")) return "ABSENT";
  return null;
}

function parseDateTime(raw: string | undefined): Date | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  // Accept YYYY-MM-DD, YYYYMMDD, or YYYYMMDD HHMMSS (votes API returns 14-digit)
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 14) {
    return new Date(
      `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T` +
        `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}Z`,
    );
  }
  if (digits.length === 8) {
    return new Date(
      `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`,
    );
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIntOrNull(raw: string | undefined): number | null {
  const t = emptyToNull(raw);
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- Public API ----------

/**
 * Ingest all 의원 records for a given assembly age (e.g. 22).
 */
export async function ingestLegislators(assemblyAge: number): Promise<void> {
  console.log(`[legislators] Fetching for AGE=${assemblyAge}...`);
  const rows = await fetchAllPages<LegislatorRow>("nwvrqwxyaytdsfvhu", {
    AGE: String(assemblyAge),
  });
  console.log(`[legislators] Got ${rows.length} rows. Upserting...`);

  let success = 0;
  for (const row of rows) {
    if (!row.MONA_CD) continue;
    // assembly.go.kr photo URLs no longer follow the /photo/{MONA_CD}.jpg pattern.
    // Frontend renders a silhouette fallback when photoUrl is null.
    const photoUrl = null;
    const birthDate = parseBirthDate(row.BTH_DATE);
    const gender = mapGender(row.SEX_GBN_NM);
    const data = {
      level: "NATIONAL" as const,
      name: emptyToNull(row.HG_NM) ?? emptyToNull(row.HJ_NM) ?? row.MONA_CD,
      party: emptyToNull(row.POLY_NM),
      gender,
      birthDate,
      electoralDistrictName: emptyToNull(row.ORIG_NM),
      committee: emptyToNull(row.CMIT_NM),
      termCount: emptyToNull(row.REELE_GBN_NM),
      assemblyAge: parseIntOrNull(row.UNITS) ?? assemblyAge,
      phoneNumber: emptyToNull(row.TEL_NO),
      email: emptyToNull(row.E_MAIL),
      homepage: emptyToNull(row.HOMEPAGE),
      officeAddress: emptyToNull(row.ASSEM_ADDR),
      titleDescription: emptyToNull(row.MEM_TITLE),
      memo: emptyToNull(row.MEMO),
      photoUrl,
      rawSourceJson: row as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };

    try {
      await prisma.legislator.upsert({
        where: { id: row.MONA_CD },
        create: { id: row.MONA_CD, ...data },
        update: data,
      });
      success += 1;
    } catch (err) {
      console.error(`[legislators] Failed for ${row.MONA_CD}:`, err);
    }
  }
  console.log(`[legislators] Done. Upserted ${success}/${rows.length}.`);
}

/**
 * Ingest all 법안 records for a given assembly age.
 */
export async function ingestBills(assemblyAge: number): Promise<void> {
  console.log(`[bills] Fetching for AGE=${assemblyAge}...`);
  const rows = await fetchAllPages<BillRow>("nzmimeepazxkubdpn", {
    AGE: String(assemblyAge),
  });
  console.log(`[bills] Got ${rows.length} rows. Upserting...`);

  let success = 0;
  for (const row of rows) {
    if (!row.BILL_ID) continue;
    const data = {
      billNo: emptyToNull(row.BILL_NO) ?? "",
      name: emptyToNull(row.BILL_NAME) ?? "",
      proposerText: emptyToNull(row.PROPOSER),
      primaryProposerName: emptyToNull(row.RST_PROPOSER),
      coProposerNamesRaw: emptyToNull(row.PUBL_PROPOSER),
      proposedDate: parseDateTime(row.PROPOSE_DT),
      committee: emptyToNull(row.COMMITTEE),
      result: mapBillResult(row.PROC_RESULT),
      linkUrl: emptyToNull(row.LINK_URL),
      assemblyAge: parseIntOrNull(row.AGE) ?? assemblyAge,
      rawSourceJson: row as unknown as Prisma.InputJsonValue,
      proposerMatchStatus: "pending",
      lastSyncedAt: new Date(),
    };

    try {
      await prisma.bill.upsert({
        where: { id: row.BILL_ID },
        create: { id: row.BILL_ID, ...data },
        update: data,
      });
      success += 1;
    } catch (err) {
      console.error(`[bills] Failed for ${row.BILL_ID}:`, err);
    }
  }
  console.log(`[bills] Done. Upserted ${success}/${rows.length}.`);
}

/**
 * Ingest all 본회의 표결 records for a given assembly age.
 * Keyed on the unique (billNo, legislatorId, voteDate).
 */
export async function ingestVotes(assemblyAge: number): Promise<void> {
  console.log(`[votes] Step 1/2: fetching vote events for AGE=${assemblyAge}...`);
  const events = await fetchAllPages<VoteEventRow>("ncocpgfiaoituanbr", {
    AGE: String(assemblyAge),
  });
  console.log(`[votes] Got ${events.length} vote events.`);

  // Pre-fetch existing bills + legislators to populate FKs and skip orphans.
  const [bills, legislators] = await Promise.all([
    prisma.bill.findMany({
      where: { assemblyAge },
      select: { id: true, billNo: true },
    }),
    prisma.legislator.findMany({
      where: { level: "NATIONAL" },
      select: { id: true },
    }),
  ]);
  const billIdByNo = new Map(bills.map((b) => [b.billNo, b.id]));
  const legislatorIds = new Set(legislators.map((l) => l.id));

  let totalUpserted = 0;
  let totalSkipped = 0;
  let billIndex = 0;
  for (const event of events) {
    billIndex += 1;
    if (!event.BILL_ID) continue;

    // Fetch per-member votes for this bill
    let memberRows: MemberVoteRow[] = [];
    try {
      memberRows = await fetchAllPages<MemberVoteRow>(
        "nojepdqqaweusdfbi",
        {
          AGE: String(assemblyAge),
          BILL_ID: event.BILL_ID,
        },
        { pageSize: 300, delayMs: 150 },
      );
    } catch (err) {
      console.error(
        `[votes] Failed to fetch members for bill ${event.BILL_ID}:`,
        (err as Error).message,
      );
      continue;
    }

    const billId = billIdByNo.get(event.BILL_NO) ?? null;

    for (const row of memberRows) {
      if (!row.MONA_CD || !row.BILL_NO) {
        totalSkipped += 1;
        continue;
      }
      // Skip votes from legislators not in our DB (FK would fail)
      if (!legislatorIds.has(row.MONA_CD)) {
        totalSkipped += 1;
        continue;
      }
      const voteDate = parseDateTime(row.VOTE_DATE);
      const result = mapVoteResult(row.RESULT_VOTE_MOD);
      if (!voteDate || !result) {
        totalSkipped += 1;
        continue;
      }

      const data = {
        billNo: row.BILL_NO,
        billName: emptyToNull(row.BILL_NAME),
        billId,
        legislatorId: row.MONA_CD,
        result,
        voteDate,
        assemblyAge:
          parseIntOrNull(row.AGE != null ? String(row.AGE) : undefined) ??
          assemblyAge,
      };

      try {
        await prisma.vote.upsert({
          where: {
            billNo_legislatorId_voteDate: {
              billNo: data.billNo,
              legislatorId: data.legislatorId,
              voteDate: data.voteDate,
            },
          },
          create: data,
          update: data,
        });
        totalUpserted += 1;
      } catch (err) {
        console.error(
          `[votes] Upsert failed billNo=${row.BILL_NO} legis=${row.MONA_CD}:`,
          (err as Error).message,
        );
      }
    }

    if (billIndex % 50 === 0 || billIndex === events.length) {
      console.log(
        `[votes] Progress: ${billIndex}/${events.length} bills, ` +
          `${totalUpserted} upserted, ${totalSkipped} skipped`,
      );
    }
  }

  console.log(
    `[votes] Done. Upserted ${totalUpserted} vote records ` +
      `(skipped ${totalSkipped}) across ${events.length} bills.`,
  );
}

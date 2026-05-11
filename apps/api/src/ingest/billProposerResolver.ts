// Resolve free-text bill proposer fields (RST_PROPOSER, PUBL_PROPOSER) to
// concrete Legislator records via BillProposer relations.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { compareName, normalizeName } from "./utils/nameNormalizer.js";

interface MatchCandidate {
  id: string;
  name: string;
}

interface MatchResult {
  legislatorId: string;
  confidence: number;
}

function splitCoProposerNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Split on commas (with or without space), bullets, semicolons
  const parts = raw
    .split(/[,;·]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  // Strip 의원/위원장 suffixes and dedupe
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const stripped = normalizeName(p);
    if (!stripped) continue;
    if (seen.has(stripped)) continue;
    seen.add(stripped);
    out.push(p);
  }
  return out;
}

function findBestMatch(
  rawName: string,
  candidates: MatchCandidate[],
): MatchResult | null {
  if (!rawName) return null;
  const normalized = normalizeName(rawName);
  if (!normalized) return null;

  let exact: MatchCandidate[] = [];
  let normExact: MatchCandidate[] = [];
  let fuzzyBest: { c: MatchCandidate; score: number } | null = null;

  for (const c of candidates) {
    const score = compareName(rawName, c.name);
    if (score === 1.0) {
      exact.push(c);
    } else if (score === 0.9) {
      normExact.push(c);
    } else if (score >= 0.7) {
      if (!fuzzyBest || score > fuzzyBest.score) {
        fuzzyBest = { c, score };
      }
    }
  }

  // Prefer exact, then normalized exact (only if unique)
  if (exact.length === 1) {
    return { legislatorId: exact[0]!.id, confidence: 1.0 };
  }
  if (exact.length === 0 && normExact.length === 1) {
    return { legislatorId: normExact[0]!.id, confidence: 0.9 };
  }
  if (exact.length === 0 && normExact.length === 0 && fuzzyBest) {
    return { legislatorId: fuzzyBest.c.id, confidence: fuzzyBest.score };
  }
  // Ambiguous (multiple exact / normExact matches) -> no result
  return null;
}

/**
 * Resolve proposers for every Bill whose proposerMatchStatus is not "matched"
 * for the given assembly age. Creates BillProposer rows and updates Bill status.
 */
export async function resolveBillProposers(assemblyAge: number): Promise<void> {
  console.log(`[resolver] Loading legislators for AGE=${assemblyAge}...`);
  const candidates = await prisma.legislator.findMany({
    where: { assemblyAge, level: "NATIONAL" },
    select: { id: true, name: true },
  });
  console.log(`[resolver] ${candidates.length} candidates.`);

  const bills = await prisma.bill.findMany({
    where: {
      assemblyAge,
      NOT: { proposerMatchStatus: "matched" },
    },
    select: {
      id: true,
      primaryProposerName: true,
      coProposerNamesRaw: true,
    },
  });
  console.log(`[resolver] Resolving ${bills.length} bills...`);

  let matchedCount = 0;
  let partialCount = 0;
  let unmatchedCount = 0;

  for (const bill of bills) {
    const proposerEntries: Array<{ name: string; role: "PRIMARY" | "CO" }> = [];
    if (bill.primaryProposerName) {
      proposerEntries.push({ name: bill.primaryProposerName, role: "PRIMARY" });
    }
    for (const co of splitCoProposerNames(bill.coProposerNamesRaw)) {
      proposerEntries.push({ name: co, role: "CO" });
    }

    if (proposerEntries.length === 0) {
      await prisma.bill.update({
        where: { id: bill.id },
        data: { proposerMatchStatus: "unmatched" },
      });
      unmatchedCount += 1;
      continue;
    }

    let matched = 0;
    const seenLegislators = new Set<string>();
    for (const entry of proposerEntries) {
      const result = findBestMatch(entry.name, candidates);
      if (!result || result.confidence < 0.8) continue;
      const key = `${result.legislatorId}|${entry.role}`;
      if (seenLegislators.has(key)) continue;
      seenLegislators.add(key);

      const upsertData: Prisma.BillProposerUncheckedCreateInput = {
        billId: bill.id,
        legislatorId: result.legislatorId,
        role: entry.role,
        matchConfidence: result.confidence,
      };
      try {
        await prisma.billProposer.upsert({
          where: {
            billId_legislatorId_role: {
              billId: bill.id,
              legislatorId: result.legislatorId,
              role: entry.role,
            },
          },
          create: upsertData,
          update: { matchConfidence: result.confidence },
        });
        matched += 1;
      } catch (err) {
        console.error(
          `[resolver] Failed to upsert proposer for bill ${bill.id}:`,
          err,
        );
      }
    }

    let status: "matched" | "partial" | "unmatched";
    if (matched === proposerEntries.length) {
      status = "matched";
      matchedCount += 1;
    } else if (matched > 0) {
      status = "partial";
      partialCount += 1;
    } else {
      status = "unmatched";
      unmatchedCount += 1;
    }
    await prisma.bill.update({
      where: { id: bill.id },
      data: { proposerMatchStatus: status },
    });
  }

  console.log(
    `[resolver] Done. matched=${matchedCount}, partial=${partialCount}, unmatched=${unmatchedCount}.`,
  );
}

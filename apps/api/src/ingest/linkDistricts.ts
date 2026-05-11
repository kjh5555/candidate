// Link Legislator rows to ElectoralDistrict rows by parsing
// `electoralDistrictName` (e.g., "서울 종로구", "경기 수원시갑", "비례대표").
//
// Strategy:
//   1. Collect all distinct non-null electoralDistrictName values for a given
//      assemblyAge.
//   2. For each name, parse into (sido, sigungu).
//   3. Upsert an ElectoralDistrict row (level=NATIONAL) using the
//      `@@unique([level, name, assemblyAge])` constraint.
//   4. Update every matching Legislator's electoralDistrictId.

import { prisma } from "../db.js";

interface ParsedDistrict {
  sido: string | null;
  sigungu: string | null;
}

export function parseDistrictName(name: string): ParsedDistrict {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sido: null, sigungu: null };
  }

  // Proportional representation seats — no geographic sido/sigungu.
  if (trimmed === "비례대표" || trimmed.startsWith("비례")) {
    return { sido: "비례", sigungu: null };
  }

  // Split on first whitespace; first token = sido, remainder = sigungu.
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { sido: parts[0] ?? null, sigungu: null };
  }
  const [first, ...rest] = parts;
  return {
    sido: first ?? null,
    sigungu: rest.length > 0 ? rest.join(" ") : null,
  };
}

export async function linkLegislatorDistricts(
  assemblyAge: number,
): Promise<void> {
  console.log(
    `[linkDistricts] Linking legislators to districts for age=${assemblyAge}`,
  );

  const distinctRows = await prisma.legislator.findMany({
    where: {
      assemblyAge,
      electoralDistrictName: { not: null },
    },
    select: { electoralDistrictName: true },
    distinct: ["electoralDistrictName"],
  });

  const names = distinctRows
    .map((r) => r.electoralDistrictName)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  console.log(`[linkDistricts] Found ${names.length} distinct district names`);

  let upserted = 0;
  let updatedLegislators = 0;

  for (const name of names) {
    const { sido, sigungu } = parseDistrictName(name);

    // findFirst-then-create upsert, leveraging @@unique([level, name, assemblyAge]).
    let district = await prisma.electoralDistrict.findFirst({
      where: {
        level: "NATIONAL",
        name,
        assemblyAge,
      },
    });

    if (!district) {
      district = await prisma.electoralDistrict.create({
        data: {
          level: "NATIONAL",
          name,
          sido,
          sigungu,
          assemblyAge,
        },
      });
    } else if (district.sido !== sido || district.sigungu !== sigungu) {
      // Keep sido/sigungu in sync with current parsing rules.
      district = await prisma.electoralDistrict.update({
        where: { id: district.id },
        data: { sido, sigungu },
      });
    }
    upserted += 1;

    const updateResult = await prisma.legislator.updateMany({
      where: {
        assemblyAge,
        electoralDistrictName: name,
      },
      data: { electoralDistrictId: district.id },
    });
    updatedLegislators += updateResult.count;
  }

  console.log(
    `[linkDistricts] Upserted ${upserted} districts; updated ${updatedLegislators} legislators`,
  );
}

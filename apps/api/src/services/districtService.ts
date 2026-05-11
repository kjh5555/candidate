import type { DistrictListItemDTO } from "@repo/shared";
import { prisma } from "../db.js";

export type DistrictLevelInput = "NATIONAL" | "PROVINCIAL";

export async function listDistricts(
  level: DistrictLevelInput,
): Promise<DistrictListItemDTO[]> {
  const rows = await prisma.electoralDistrict.findMany({
    where: { level },
    select: {
      id: true,
      name: true,
      sido: true,
      sigungu: true,
    },
    orderBy: [{ sido: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sido: row.sido,
    sigungu: row.sigungu,
  }));
}

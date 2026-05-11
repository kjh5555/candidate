// Seed ElectoralDistrict, HangjeongDong, and DistrictMapping tables from a CSV file.
//
// For the full pipeline (which we defer to a later iteration):
//   - 22대 국회의원 선거구 GeoJSON:  https://github.com/OhmyNews/2024_22_elec_map
//     (files: 2024_22_Elec.json, 22_Elec_SGG.csv)
//   - 행정동 GeoJSON: https://github.com/vuski/admdongkor (admCd2 = 10-digit)
//   - 광역의원 선거구: 선관위 개표결과 CSV (manual seed deferred)
//
// For MVP we read a small flat CSV listing each 행정동 with its national/provincial
// district names + administrative metadata.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";

export interface DistrictMappingCsvRow {
  admCd2: string;
  dongName: string;
  sido: string;
  sigungu: string;
  nationalDistrictName: string;
  provincialDistrictName: string;
  assemblyAge: string;
}

// ---------- Tiny CSV parser (handles quoted commas) ----------

/**
 * Parse a single CSV line that may contain double-quoted fields with embedded commas.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse a CSV string into an array of objects keyed by header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]!] = (fields[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

// ---------- Seed pipeline ----------

const DEFAULT_CSV_PATH = path.resolve(
  process.cwd(),
  "src/ingest/seed-data/sample-mapping.csv",
);

/**
 * Seed HangjeongDong, ElectoralDistrict (NATIONAL + PROVINCIAL), and DistrictMapping
 * from a CSV file. The expected columns are:
 *   admCd2, dongName, sido, sigungu, nationalDistrictName, provincialDistrictName, assemblyAge
 */
export async function seedDistrictMapping(
  csvPath: string = DEFAULT_CSV_PATH,
): Promise<void> {
  console.log(`[districts] Reading ${csvPath}...`);
  const text = await readFile(csvPath, "utf-8");
  const rows = parseCsv(text) as unknown as DistrictMappingCsvRow[];
  console.log(`[districts] Got ${rows.length} rows. Seeding...`);

  let success = 0;
  for (const row of rows) {
    const admCd2 = (row.admCd2 ?? "").trim();
    const dongName = (row.dongName ?? "").trim();
    const sido = (row.sido ?? "").trim();
    const sigungu = (row.sigungu ?? "").trim();
    const nationalName = (row.nationalDistrictName ?? "").trim();
    const provincialName = (row.provincialDistrictName ?? "").trim();
    const ageNum = parseInt(row.assemblyAge ?? "", 10);

    if (!admCd2 || !sido || !sigungu || !Number.isFinite(ageNum)) {
      console.warn(`[districts] Skipping invalid row admCd2=${admCd2}`);
      continue;
    }

    try {
      // 1. Upsert HangjeongDong
      const dongData = {
        name: dongName,
        sido,
        sigungu,
        eupmyeondong: dongName,
      };
      await prisma.hangjeongDong.upsert({
        where: { admCd2 },
        create: { admCd2, ...dongData },
        update: dongData,
      });

      // 2. Upsert ElectoralDistrict (NATIONAL) via findFirst (composite unique)
      let nationalDistrictId: string | null = null;
      if (nationalName) {
        let national = await prisma.electoralDistrict.findFirst({
          where: { level: "NATIONAL", name: nationalName, assemblyAge: ageNum },
        });
        if (!national) {
          national = await prisma.electoralDistrict.create({
            data: {
              level: "NATIONAL",
              name: nationalName,
              sido,
              sigungu,
              assemblyAge: ageNum,
            },
          });
        }
        nationalDistrictId = national.id;
      }

      // 3. Upsert ElectoralDistrict (PROVINCIAL)
      let provincialDistrictId: string | null = null;
      if (provincialName) {
        let provincial = await prisma.electoralDistrict.findFirst({
          where: { level: "PROVINCIAL", name: provincialName, assemblyAge: ageNum },
        });
        if (!provincial) {
          provincial = await prisma.electoralDistrict.create({
            data: {
              level: "PROVINCIAL",
              name: provincialName,
              sido,
              sigungu,
              assemblyAge: ageNum,
            },
          });
        }
        provincialDistrictId = provincial.id;
      }

      // 4. Upsert DistrictMapping
      const mappingData = {
        hangjeongDongCode: admCd2,
        nationalDistrictId,
        provincialDistrictId,
        source: "sample-csv",
      };
      await prisma.districtMapping.upsert({
        where: {
          hangjeongDongCode_assemblyAge: {
            hangjeongDongCode: admCd2,
            assemblyAge: ageNum,
          },
        },
        create: { ...mappingData, assemblyAge: ageNum },
        update: mappingData,
      });

      success += 1;
    } catch (err) {
      console.error(`[districts] Failed for admCd2=${admCd2}:`, err);
    }
  }
  console.log(`[districts] Done. Seeded ${success}/${rows.length}.`);
}

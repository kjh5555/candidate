// Ingest 9회 지선 후보 background from NEC info.nec.go.kr 비공식 endpoint.
//
// 공식 OpenAPI(PofelcddInfoInqireService, candidate_detail_scanSearchJson)가
// 9회 후보에 INFO-03 / 403을 반환해서 막힌 상태에서, NEC info 사이트의
// `electionInfo_report.json` endpoint가 사진 path + 전과 + 재산 + 납세 +
// 체납 + 병역 + 학력 + 경력 + 직업 + 주소를 한 번에 제공함.
//
// 이 endpoint는 두 가지 호출 패턴이 있다:
//
//   [시·도 단위] electionCode 3(시·도지사) / 5(광역의원 지역구) /
//                7(교육감) / 8(광역의원 비례)
//     - cityCode = 시·도 코드 (1100 서울, 4100 경기 ...)
//     - selectbox_cityCodeDIBySgJson.json 에서 16개 시·도 받음
//
//   [시·군·구 단위] electionCode 4(시·군·구청장) / 6(기초의원 지역구) /
//                  9(기초의원 비례)
//     - cityCode = 시·도 코드
//     - sggCityCode = 시·군·구 코드 (4110100 종로구 ...)
//     - selectbox_getSggCityCodeJson.json?cityCode=<시·도> 에서 sgg list 받음
//
// 매칭 안 되는 huboid는 Candidate를 새로 생성한다. 9회 후보 list endpoint가
// NEC에서 막혀있어 GOVERNOR/MAYOR 외에는 우리 DB에 없으므로.

import type { CandidatePositionType, Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const BASE = "https://info.nec.go.kr";
const ELECTION_ID = "0020260603";

// callMode:
//   "city": cityCode (시·도)만으로 호출 — 시·도지사·교육감·광역비례
//   "sgg":  cityCode + sggCityCode (시·군·구 7자리) — 시·군·구청장·기초비례
//   "town": cityCode → townCode (시·군·구 4자리) → sggCityCode (선거구 7자리)
//           — 광역의원·기초의원 지역구 (선거구별)
const ELECTION_CODES: Array<{
  code: string;
  label: string;
  positionType: CandidatePositionType;
  callMode: "city" | "sgg" | "town";
}> = [
  { code: "2", label: "국회의원 보궐", positionType: "NATIONAL_ASSEMBLY", callMode: "sgg" },
  { code: "3", label: "시·도지사", positionType: "GOVERNOR", callMode: "city" },
  { code: "4", label: "시·군·구청장", positionType: "MAYOR", callMode: "sgg" },
  { code: "5", label: "광역의원 지역구", positionType: "PROVINCIAL_COUNCILOR", callMode: "town" },
  { code: "6", label: "기초의원 지역구", positionType: "BASIC_COUNCILOR", callMode: "town" },
  { code: "11", label: "교육감", positionType: "SUPERINTENDENT", callMode: "city" },
  { code: "8", label: "광역의원 비례", positionType: "PROVINCIAL_COUNCILOR_PROP", callMode: "city" },
  { code: "9", label: "기초의원 비례", positionType: "BASIC_COUNCILOR_PROP", callMode: "sgg" },
];

interface CityCode {
  CODE: number | string;
  NAME: string;
}

interface ReportRow {
  HUBOID: number;
  K_HBJNAME?: string;
  H_HBJNAME?: string;
  GENDER?: string;
  AGE?: string;
  BIRTHDAY?: string;
  JIKUP?: string;
  HAKRUK?: string;
  KYUNGRUK?: string;
  KYUNGRUK2?: string;
  JUSO?: string;
  SDNAME?: string;
  SGGNAME?: string;
  JDNAME?: string;
  GIHO?: string;
  IHBCNT?: string;
  JAESAN?: string;
  NAPSE?: string;
  CHENAP?: string;
  CHENAP2?: string;
  JUNKWASU?: string;
  BYUNGYUK?: string;
  SAJINPATH?: string;
}

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Referer: "https://info.nec.go.kr/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

async function fetchCityCodes(
  mode: "city" | "sgg" | "town",
  electionCode: string,
): Promise<CityCode[]> {
  // 시·도지사·광역의원·교육감·광역비례(mode=city)는 DIBySg (16개, 광주+전남
  // 통합 entry "2900=전남광주통합특별시"). 시·군·구청장·기초의원·기초비례
  // (mode=sgg|town)는 BySg (15개, 광주광역시·전라남도 분리)를 써야 전남
  // 시·군·구가 누락되지 않음.
  const endpoint =
    mode === "city" ? "selectbox_cityCodeDIBySgJson.json" : "selectbox_cityCodeBySgJson.json";
  const data = await fetchJson<{ jsonResult: { body: CityCode[] } }>(
    `${BASE}/m/bizcommon/selectbox/${endpoint}?electionId=${ELECTION_ID}&secondMenuId=CPRI03&electionCode=${electionCode}`,
  );
  return data.jsonResult.body;
}

async function fetchSggCityCodes(
  cityCode: number,
  electionCode: string,
): Promise<CityCode[]> {
  // sgg list endpoint도 electionCode + secondMenuId + statementId가 모두
  // 필요. 누락하면 빈 응답.
  const data = await fetchJson<{ jsonResult: { body: CityCode[] } }>(
    `${BASE}/m/bizcommon/selectbox/selectbox_getSggCityCodeJson.json?electionId=${ELECTION_ID}&secondMenuId=CPRI03&electionCode=${electionCode}&cityCode=${cityCode}&statementId=CPRI03_%23${electionCode}&dateCode=0`,
  );
  return data.jsonResult.body ?? [];
}

async function fetchTownCodes(
  cityCode: number,
  electionCode: string,
): Promise<CityCode[]> {
  const data = await fetchJson<{ jsonResult: { body: CityCode[] } }>(
    `${BASE}/m/bizcommon/selectbox/selectbox_townCodeBySgJson.json?electionId=${ELECTION_ID}&secondMenuId=CPRI03&electionCode=${electionCode}&cityCode=${cityCode}&statementId=CPRI03_%23${electionCode}&dateCode=0`,
  );
  return data.jsonResult.body ?? [];
}

async function fetchSggByTownCodes(
  cityCode: number,
  townCode: string,
  electionCode: string,
): Promise<CityCode[]> {
  const data = await fetchJson<{ jsonResult: { body: CityCode[] } }>(
    `${BASE}/m/bizcommon/selectbox/selectbox_getSggTownCodeJson.json?electionId=${ELECTION_ID}&secondMenuId=CPRI03&electionCode=${electionCode}&cityCode=${cityCode}&townCode=${townCode}&statementId=CPRI03_%23${electionCode}&dateCode=0`,
  );
  return data.jsonResult.body ?? [];
}

async function fetchReport(
  electionCode: string,
  cityCode: number | string,
  sggCityCode?: string,
  townCode?: string,
): Promise<ReportRow[]> {
  let url = `${BASE}/m/electioninfo/electionInfo_report.json?electionId=${ELECTION_ID}&secondMenuId=CPRI03&electionCode=${electionCode}&cityCode=${cityCode}&statementId=CPRI03_%23${electionCode}&dateCode=0`;
  if (townCode) url += `&townCode=${townCode}`;
  if (sggCityCode) url += `&sggCityCode=${sggCityCode}`;
  const data = await fetchJson<{ jsonResult: { body: ReportRow[] | null } }>(
    url,
  );
  return data.jsonResult.body ?? [];
}

function parseThousandToManwonBigInt(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[, ]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.floor(n / 10));
}

function parseCriminalCount(raw: string | undefined): number {
  if (!raw) return 0;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : 0;
}

function buildPhotoUrl(sajinPath: string | undefined): string | null {
  if (!sajinPath) return null;
  // info.nec.go.kr photo path는 외부 차단(:8043/error.html)인데 동일 path가
  // cdn.nec.go.kr에 200 OK로 공개됨. ver 쿼리는 캐시 버스터(SAJINPATH 자체에
  // 포함).
  return `https://cdn.nec.go.kr/photo_20260603${sajinPath}`;
}

function parseBirthDate(raw: string | undefined): string | null {
  if (!raw) return null;
  // "1968.08.12" → "1968-08-12"
  return raw.replace(/\./g, "-");
}

function rowToCandidateData(
  r: ReportRow,
  positionType: CandidatePositionType,
): Prisma.CandidateCreateInput {
  const chenap1 = parseFloat((r.CHENAP ?? "0").replace(/[, ]/g, "")) || 0;
  const chenap2 = parseFloat((r.CHENAP2 ?? "0").replace(/[, ]/g, "")) || 0;
  return {
    id: String(r.HUBOID),
    electionId: "20260603",
    positionType,
    name: r.K_HBJNAME ?? "",
    hanjaName: r.H_HBJNAME?.replace(/[()&;#0-9a-z]/gi, "").trim() || null,
    gender: r.GENDER ?? null,
    birthDate: parseBirthDate(r.BIRTHDAY),
    age: r.AGE ? parseInt(r.AGE, 10) || null : null,
    party: r.JDNAME ?? null,
    occupation: r.JIKUP ?? null,
    education: r.HAKRUK ?? null,
    career1: r.KYUNGRUK ?? null,
    career2: r.KYUNGRUK2 ?? null,
    address: r.JUSO ?? null,
    sido: r.SDNAME ?? null,
    // 시·도 단위 후보(GOVERNOR·SUPERINTENDENT·광역비례)는 NEC가 SGGNAME에
    // 시·도 이름을 그대로 넣음. 그 경우 wiwName은 null로 정리.
    wiwName: r.SGGNAME && r.SGGNAME !== r.SDNAME ? r.SGGNAME : null,
    districtName: r.SGGNAME ?? null,
    status: "REGISTERED",
    photoUrl: buildPhotoUrl(r.SAJINPATH),
    assetTotalManwon: parseThousandToManwonBigInt(r.JAESAN),
    taxPaidManwon: parseThousandToManwonBigInt(r.NAPSE),
    taxOutstandingManwon: parseThousandToManwonBigInt(
      String(chenap1 + chenap2),
    ),
    hasCriminalRecord: parseCriminalCount(r.JUNKWASU) > 0,
    criminalRecordCount: parseCriminalCount(r.JUNKWASU),
    hasAssetDisclosure: !!r.JAESAN,
    hasTaxRecord: !!r.NAPSE,
    hasMilitaryRecord: !!r.BYUNGYUK,
    militaryStatus: r.BYUNGYUK ?? null,
    backgroundLastSyncedAt: new Date(),
    rawSourceJson: r as unknown as Prisma.InputJsonValue,
  };
}

async function upsertCandidate(
  r: ReportRow,
  positionType: CandidatePositionType,
): Promise<"created" | "updated"> {
  const huboid = String(r.HUBOID);
  const data = rowToCandidateData(r, positionType);
  const existing = await prisma.candidate.findUnique({
    where: { id: huboid },
    select: { id: true },
  });
  if (existing) {
    await prisma.candidate.update({
      where: { id: huboid },
      data: {
        ...data,
        id: undefined,
        electionId: undefined,
      },
    });
    return "updated";
  }
  await prisma.candidate.create({ data });
  return "created";
}

async function main() {
  const filterCode = process.argv[2];
  const filterSet = filterCode
    ? new Set(filterCode.split(",").map((s) => s.trim()))
    : null;
  const codes = filterSet
    ? ELECTION_CODES.filter((e) => filterSet.has(e.code))
    : ELECTION_CODES;

  console.log("📥 NEC report ingest 시작");

  let created = 0;
  let updated = 0;
  let failed = 0;

  async function handleRow(
    r: ReportRow,
    positionType: CandidatePositionType,
  ): Promise<void> {
    try {
      const result = await upsertCandidate(r, positionType);
      if (result === "created") created++;
      else updated++;
    } catch (e) {
      failed++;
      console.warn(
        `  ⚠️  ${r.K_HBJNAME} (${r.HUBOID}) 실패:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  for (const { code, label, positionType, callMode } of codes) {
    console.log(`\n── ${label} (electionCode=${code}) ──`);
    let perType = 0;
    let cities: CityCode[] = [];
    try {
      cities = await fetchCityCodes(callMode, code);
    } catch (e) {
      console.warn(`  ⚠️  시·도 list 실패:`, e instanceof Error ? e.message : e);
      continue;
    }
    console.log(`  시·도 ${cities.length}개`);

    for (const city of cities) {
      if (callMode === "city") {
        try {
          const rows = await fetchReport(code, city.CODE);
          for (const r of rows) {
            await handleRow(r, positionType);
            perType++;
          }
        } catch (e) {
          console.warn(`  ⚠️  ${city.NAME} report 실패:`, e instanceof Error ? e.message : e);
        }
      } else if (callMode === "sgg") {
        let sggList: CityCode[] = [];
        try {
          sggList = await fetchSggCityCodes(Number(city.CODE), code);
        } catch (e) {
          console.warn(`  ⚠️  ${city.NAME} sgg list 실패:`, e instanceof Error ? e.message : e);
          continue;
        }
        for (const sgg of sggList) {
          try {
            const rows = await fetchReport(code, city.CODE, String(sgg.CODE));
            for (const r of rows) {
              await handleRow(r, positionType);
              perType++;
            }
          } catch (e) {
            console.warn(`  ⚠️  ${city.NAME} ${sgg.NAME} report 실패:`, e instanceof Error ? e.message : e);
          }
        }
      } else {
        // callMode === "town"
        let townList: CityCode[] = [];
        try {
          townList = await fetchTownCodes(Number(city.CODE), code);
        } catch (e) {
          console.warn(`  ⚠️  ${city.NAME} town list 실패:`, e instanceof Error ? e.message : e);
          continue;
        }
        for (const town of townList) {
          let sggList: CityCode[] = [];
          try {
            sggList = await fetchSggByTownCodes(
              Number(city.CODE),
              String(town.CODE),
              code,
            );
          } catch (e) {
            console.warn(
              `  ⚠️  ${city.NAME} ${town.NAME} sgg list 실패:`,
              e instanceof Error ? e.message : e,
            );
            continue;
          }
          for (const sgg of sggList) {
            try {
              const rows = await fetchReport(
                code,
                city.CODE,
                String(sgg.CODE),
                String(town.CODE),
              );
              for (const r of rows) {
                await handleRow(r, positionType);
                perType++;
              }
            } catch (e) {
              console.warn(
                `  ⚠️  ${city.NAME} ${town.NAME} ${sgg.NAME} report 실패:`,
                e instanceof Error ? e.message : e,
              );
            }
          }
        }
      }
    }
    console.log(`  ✅ ${label}: ${perType}건 처리`);
  }

  console.log(
    `\n📥 완료 — 신규 ${created}건 / 업데이트 ${updated}건 / 실패 ${failed}건`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import type { RegionMatchResponseDTO } from "@repo/shared";
import { prisma } from "../db.js";
import {
  KakaoApiError,
  coord2RegionCode,
  searchAddress,
} from "./kakaoLocal.js";

export { KakaoApiError };

function deriveCouncilName(sido: string | null | undefined): string | undefined {
  if (!sido) return undefined;
  return `${sido}의회`;
}

export class AddressNotFoundError extends Error {
  constructor(message = "Address could not be resolved") {
    super(message);
    this.name = "AddressNotFoundError";
  }
}

export type RegionMatchResult = RegionMatchResponseDTO;

export async function matchRegion(address: string): Promise<RegionMatchResult> {
  // Step 1: resolve address to coordinates
  const addrDoc = await searchAddress(address);
  if (!addrDoc) {
    throw new AddressNotFoundError(`No results for address: ${address}`);
  }

  const xRaw = addrDoc.x;
  const yRaw = addrDoc.y;
  const lng = Number(xRaw);
  const lat = Number(yRaw);

  const resolvedAddress =
    addrDoc.road_address?.address_name ??
    addrDoc.address?.address_name ??
    addrDoc.address_name;

  // Step 2: coord -> 행정동 (H-type)
  const regionDoc = await coord2RegionCode(xRaw, yRaw);
  if (!regionDoc) {
    throw new AddressNotFoundError(
      "Could not determine 행정동 (H-type region) for coordinates",
    );
  }

  const hangjeongDongCode = regionDoc.code;
  const hangjeongDongName = regionDoc.region_3depth_name;

  // Step 3: lookup HangjeongDong row
  const hjd = await prisma.hangjeongDong.findUnique({
    where: { admCd2: hangjeongDongCode },
  });

  if (!hjd) {
    return {
      hangjeongDongCode,
      hangjeongDongName,
      nationalDistrict: null,
      provincialDistrict: null,
      resolvedAddress,
      coordinates: { lat, lng },
    };
  }

  // Step 4: latest mapping (highest assemblyAge)
  const mapping = await prisma.districtMapping.findFirst({
    where: { hangjeongDongCode },
    orderBy: { assemblyAge: "desc" },
    include: {
      nationalDistrict: true,
      provincialDistrict: true,
    },
  });

  const nationalDistrict = mapping?.nationalDistrict
    ? {
        id: mapping.nationalDistrict.id,
        name: mapping.nationalDistrict.name,
        sido: mapping.nationalDistrict.sido ?? undefined,
        sigungu: mapping.nationalDistrict.sigungu ?? undefined,
      }
    : null;

  const provincialDistrict = mapping?.provincialDistrict
    ? {
        id: mapping.provincialDistrict.id,
        name: mapping.provincialDistrict.name,
        councilName: deriveCouncilName(mapping.provincialDistrict.sido),
      }
    : null;

  return {
    hangjeongDongCode,
    hangjeongDongName,
    nationalDistrict,
    provincialDistrict,
    resolvedAddress,
    coordinates: { lat, lng },
  };
}

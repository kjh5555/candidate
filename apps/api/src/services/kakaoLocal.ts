import { config } from "../config.js";

export class KakaoApiError extends Error {
  public readonly status: number;
  public readonly detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "KakaoApiError";
    this.status = status;
    this.detail = detail;
  }
}

const KAKAO_BASE = "https://dapi.kakao.com";

function authHeaders(): Record<string, string> {
  return {
    Authorization: `KakaoAK ${config.KAKAO_REST_API_KEY}`,
  };
}

async function kakaoFetch<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    throw new KakaoApiError(
      `Kakao API request failed: ${(err as Error).message}`,
      0,
      err,
    );
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new KakaoApiError(
      `Kakao API returned ${res.status} ${res.statusText}`,
      res.status,
      body,
    );
  }

  return (await res.json()) as T;
}

// ── Address search ────────────────────────────────────────────

export interface KakaoRoadAddress {
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  road_name: string;
  underground_yn: string;
  main_building_no: string;
  sub_building_no: string;
  building_name: string;
  zone_no: string;
}

export interface KakaoAddress {
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  region_3depth_h_name: string;
  h_code: string;
  b_code: string;
  mountain_yn: string;
  main_address_no: string;
  sub_address_no: string;
}

export interface KakaoAddressDocument {
  address_name: string;
  address_type: string;
  x: string;
  y: string;
  address: KakaoAddress | null;
  road_address: KakaoRoadAddress | null;
}

interface KakaoAddressSearchResponse {
  meta: { total_count: number; pageable_count: number; is_end: boolean };
  documents: KakaoAddressDocument[];
}

export async function searchAddress(
  query: string,
): Promise<KakaoAddressDocument | null> {
  const url = `${KAKAO_BASE}/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
  const data = await kakaoFetch<KakaoAddressSearchResponse>(url);
  if (!data.documents || data.documents.length === 0) return null;
  return data.documents[0] ?? null;
}

// ── Coord -> region code ──────────────────────────────────────

export interface KakaoRegionDocument {
  region_type: "B" | "H";
  code: string;
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  region_4depth_name: string;
  x: number;
  y: number;
}

interface KakaoCoord2RegionResponse {
  meta: { total_count: number };
  documents: KakaoRegionDocument[];
}

export async function coord2RegionCode(
  x: number | string,
  y: number | string,
): Promise<KakaoRegionDocument | null> {
  const url = `${KAKAO_BASE}/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(String(x))}&y=${encodeURIComponent(String(y))}`;
  const data = await kakaoFetch<KakaoCoord2RegionResponse>(url);
  const hDoc = data.documents.find((d) => d.region_type === "H");
  return hDoc ?? null;
}

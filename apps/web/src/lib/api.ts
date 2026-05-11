import type {
  RegionMatchResponseDTO,
  LegislatorsResponseDTO,
  LegislatorDetailDTO,
  BillsResponseDTO,
  VotesResponseDTO,
  BillDetailDTO,
  DistrictsResponseDTO,
} from "@repo/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { error?: string }).error || "UNKNOWN",
      (body as { message?: string }).message || res.statusText
    );
  }
  return res.json() as Promise<T>;
}

export function getRegionMatch(address: string): Promise<RegionMatchResponseDTO> {
  return apiFetch<RegionMatchResponseDTO>(
    `/api/region/match?address=${encodeURIComponent(address)}`
  );
}

export function getLegislators(params: {
  nationalDistrictId?: string;
  provincialDistrictId?: string;
}): Promise<LegislatorsResponseDTO> {
  const query = new URLSearchParams();
  if (params.nationalDistrictId) query.set("nationalDistrictId", params.nationalDistrictId);
  if (params.provincialDistrictId) query.set("provincialDistrictId", params.provincialDistrictId);
  return apiFetch<LegislatorsResponseDTO>(`/api/legislators?${query.toString()}`);
}

export function getLegislatorDetail(id: string): Promise<LegislatorDetailDTO> {
  return apiFetch<LegislatorDetailDTO>(`/api/legislators/${id}`);
}

export function getLegislatorBills(
  id: string,
  params: { limit?: number; offset?: number; role?: string }
): Promise<BillsResponseDTO> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.role) query.set("role", params.role);
  return apiFetch<BillsResponseDTO>(`/api/legislators/${id}/bills?${query.toString()}`);
}

export function getLegislatorVotes(
  id: string,
  params: { limit?: number; offset?: number; result?: string }
): Promise<VotesResponseDTO> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.result) query.set("result", params.result);
  return apiFetch<VotesResponseDTO>(`/api/legislators/${id}/votes?${query.toString()}`);
}

export function getBillDetail(billId: string): Promise<BillDetailDTO> {
  return apiFetch<BillDetailDTO>(`/api/bills/${billId}`);
}

export function getDistricts(
  level: "NATIONAL" | "PROVINCIAL" = "NATIONAL"
): Promise<DistrictsResponseDTO> {
  return apiFetch<DistrictsResponseDTO>(
    `/api/districts?level=${encodeURIComponent(level)}`
  );
}

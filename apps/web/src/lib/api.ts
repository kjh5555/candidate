import type {
  RegionMatchResponseDTO,
  LegislatorsResponseDTO,
  LegislatorDetailDTO,
  BillsResponseDTO,
  VotesResponseDTO,
  BillDetailDTO,
  DistrictsResponseDTO,
  CandidatesResponseDTO,
  CandidateDetailDTO,
  CandidateRegionsResponseDTO,
  CandidatePositionType,
  BudgetLevel,
  BudgetBreakdownDTO,
  BudgetYearsResponseDTO,
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
  level?: "NATIONAL" | "PROVINCIAL" | "ALL";
  region?: string;
}): Promise<LegislatorsResponseDTO> {
  const query = new URLSearchParams();
  if (params.nationalDistrictId) query.set("nationalDistrictId", params.nationalDistrictId);
  if (params.provincialDistrictId) query.set("provincialDistrictId", params.provincialDistrictId);
  if (params.level) query.set("level", params.level);
  if (params.region) query.set("region", params.region);
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

// ── Candidates (2026 지방선거) ─────────────────────────────────

export function getCandidateRegions(
  electionId: string = "20260603"
): Promise<CandidateRegionsResponseDTO> {
  return apiFetch<CandidateRegionsResponseDTO>(
    `/api/candidates/regions?electionId=${encodeURIComponent(electionId)}`
  );
}

export function getCandidates(params: {
  electionId?: string;
  positionType?: CandidatePositionType | "ALL";
  sido?: string;
  wiwName?: string;
}): Promise<CandidatesResponseDTO> {
  const query = new URLSearchParams();
  query.set("electionId", params.electionId ?? "20260603");
  if (params.positionType) query.set("positionType", params.positionType);
  if (params.sido) query.set("sido", params.sido);
  if (params.wiwName) query.set("wiwName", params.wiwName);
  return apiFetch<CandidatesResponseDTO>(
    `/api/candidates?${query.toString()}`
  );
}

export function getCandidateDetail(id: string): Promise<CandidateDetailDTO> {
  return apiFetch<CandidateDetailDTO>(
    `/api/candidates/${encodeURIComponent(id)}`
  );
}

// ── Budget (예산 정보) ────────────────────────────────────────

export function getBudgetYears(
  level: BudgetLevel
): Promise<BudgetYearsResponseDTO> {
  return apiFetch<BudgetYearsResponseDTO>(
    `/api/budget/years?level=${encodeURIComponent(level)}`
  );
}

export function getBudgetByField(year: number): Promise<BudgetBreakdownDTO> {
  return apiFetch<BudgetBreakdownDTO>(
    `/api/budget/national/by-field?year=${encodeURIComponent(String(year))}`
  );
}

export function getBudgetByMinistry(
  year: number
): Promise<BudgetBreakdownDTO> {
  return apiFetch<BudgetBreakdownDTO>(
    `/api/budget/national/by-ministry?year=${encodeURIComponent(String(year))}`
  );
}

export function getBudgetMinistryDetail(
  ministry: string,
  year: number
): Promise<BudgetBreakdownDTO> {
  return apiFetch<BudgetBreakdownDTO>(
    `/api/budget/national/ministry/${encodeURIComponent(ministry)}?year=${encodeURIComponent(String(year))}`
  );
}

export function getBudgetBySido(year: number): Promise<BudgetBreakdownDTO> {
  return apiFetch<BudgetBreakdownDTO>(
    `/api/budget/metropolitan/by-sido?year=${encodeURIComponent(String(year))}`
  );
}

export function getBudgetSidoDetail(
  sido: string,
  year: number
): Promise<BudgetBreakdownDTO> {
  return apiFetch<BudgetBreakdownDTO>(
    `/api/budget/metropolitan/sido/${encodeURIComponent(sido)}?year=${encodeURIComponent(String(year))}`
  );
}

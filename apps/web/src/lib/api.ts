import type {
  RegionMatchResponseDTO,
  LegislatorsResponseDTO,
  LegislatorDetailDTO,
  BillsResponseDTO,
  VotesResponseDTO,
  BillDetailDTO,
  BillSummaryResponseDTO,
  DistrictsResponseDTO,
  CandidatesResponseDTO,
  CandidateDetailDTO,
  CandidateRegionsResponseDTO,
  CandidatePositionType,
  BudgetLevel,
  BudgetBreakdownDTO,
  BudgetYearsResponseDTO,
  BasicRegionsResponseDTO,
  SettlementBreakdownDTO,
  SettlementFieldDetailDTO,
  SettlementReportDTO,
  SettlementUnitsResponseDTO,
  SettlementYearsResponseDTO,
  RegionHubDTO,
  ControversyTopicsResponseDTO,
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

export function getBasicRegions(): Promise<BasicRegionsResponseDTO> {
  return apiFetch<BasicRegionsResponseDTO>("/api/legislators/basic-regions");
}

export function getLegislators(params: {
  nationalDistrictId?: string;
  provincialDistrictId?: string;
  level?: "NATIONAL" | "PROVINCIAL" | "BASIC" | "ALL";
  region?: string;
  wiwName?: string;
  name?: string;
  party?: string;
  limit?: number;
  offset?: number;
}): Promise<LegislatorsResponseDTO> {
  const query = new URLSearchParams();
  if (params.nationalDistrictId) query.set("nationalDistrictId", params.nationalDistrictId);
  if (params.provincialDistrictId) query.set("provincialDistrictId", params.provincialDistrictId);
  if (params.level) query.set("level", params.level);
  if (params.region) query.set("region", params.region);
  if (params.wiwName) query.set("wiwName", params.wiwName);
  if (params.name) query.set("name", params.name);
  if (params.party) query.set("party", params.party);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
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

export function getBillSummary(
  billId: string,
): Promise<BillSummaryResponseDTO> {
  return apiFetch<BillSummaryResponseDTO>(
    `/api/bills/${encodeURIComponent(billId)}/summary`,
  );
}

export function generateBillSummary(
  billId: string,
): Promise<BillSummaryResponseDTO> {
  return apiFetch<BillSummaryResponseDTO>(
    `/api/bills/${encodeURIComponent(billId)}/summary/generate`,
    { method: "POST" },
  );
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
  name?: string;
  districtName?: string;
}): Promise<CandidatesResponseDTO> {
  const query = new URLSearchParams();
  query.set("electionId", params.electionId ?? "20260603");
  if (params.positionType) query.set("positionType", params.positionType);
  if (params.sido) query.set("sido", params.sido);
  if (params.wiwName) query.set("wiwName", params.wiwName);
  if (params.name) query.set("name", params.name);
  if (params.districtName) query.set("districtName", params.districtName);
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

// ── Settlement (세출결산 — 실제 지출) ─────────────────────────

export function getSettlementYears(): Promise<SettlementYearsResponseDTO> {
  return apiFetch<SettlementYearsResponseDTO>(`/api/settlement/years`);
}

export function getSettlementBySido(
  year: number
): Promise<SettlementBreakdownDTO> {
  return apiFetch<SettlementBreakdownDTO>(
    `/api/settlement/by-sido?year=${encodeURIComponent(String(year))}`
  );
}

export function getSettlementSidoDetail(
  sido: string,
  year: number
): Promise<SettlementBreakdownDTO> {
  return apiFetch<SettlementBreakdownDTO>(
    `/api/settlement/sido/${encodeURIComponent(sido)}?year=${encodeURIComponent(String(year))}`
  );
}

export function getSettlementUnits(
  year: number,
  sido?: string
): Promise<SettlementUnitsResponseDTO> {
  const query = new URLSearchParams();
  query.set("year", String(year));
  if (sido) query.set("sido", sido);
  return apiFetch<SettlementUnitsResponseDTO>(
    `/api/settlement/units?${query.toString()}`
  );
}

export function getSettlementUnitDetail(
  unitCode: string,
  year: number
): Promise<SettlementBreakdownDTO> {
  return apiFetch<SettlementBreakdownDTO>(
    `/api/settlement/unit/${encodeURIComponent(unitCode)}?year=${encodeURIComponent(String(year))}`
  );
}

export function getSettlementUnitFieldDetail(
  unitCode: string,
  field: string,
  year: number
): Promise<SettlementFieldDetailDTO> {
  return apiFetch<SettlementFieldDetailDTO>(
    `/api/settlement/unit/${encodeURIComponent(unitCode)}/field/${encodeURIComponent(field)}?year=${encodeURIComponent(String(year))}`
  );
}

export function getSettlementSidoFieldDetail(
  sido: string,
  field: string,
  year: number
): Promise<SettlementFieldDetailDTO> {
  return apiFetch<SettlementFieldDetailDTO>(
    `/api/settlement/sido/${encodeURIComponent(sido)}/field/${encodeURIComponent(field)}?year=${encodeURIComponent(String(year))}`
  );
}

export function getSettlementReport(
  unitCode: string,
  year: number
): Promise<SettlementReportDTO> {
  return apiFetch<SettlementReportDTO>(
    `/api/settlement/report?year=${encodeURIComponent(String(year))}&unitCode=${encodeURIComponent(unitCode)}`
  );
}

// 시·도 단위 (전 자치단체 합산) 결산서는 단일 PDF가 아니므로, sido는 본청 unitCode 사용.
// UI에서는 unitCode가 있을 때만 호출.

// ── Region Hub (지역 허브) ────────────────────────────────────

export function getRegionHub(
  sido: string,
  wiwName: string
): Promise<RegionHubDTO> {
  const query = new URLSearchParams();
  query.set("sido", sido);
  query.set("wiwName", wiwName);
  return apiFetch<RegionHubDTO>(`/api/region-hub?${query.toString()}`);
}

// ── Controversies (논란·해명) ─────────────────────────────────

export function getLegislatorControversies(
  id: string
): Promise<ControversyTopicsResponseDTO> {
  return apiFetch<ControversyTopicsResponseDTO>(
    `/api/legislators/${encodeURIComponent(id)}/controversies`
  );
}

export function syncLegislatorControversies(
  id: string
): Promise<ControversyTopicsResponseDTO> {
  return apiFetch<ControversyTopicsResponseDTO>(
    `/api/legislators/${encodeURIComponent(id)}/controversies/sync`,
    { method: "POST" }
  );
}

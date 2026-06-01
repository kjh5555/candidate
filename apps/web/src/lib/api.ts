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
  CouncilMinutesResponseDTO,
  CouncilBillsResponseDTO,
  CouncilMinutesDetailDTO,
  CouncilLegislatorPhotosResponseDTO,
  CouncilBillSummaryDTO,
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

export interface RegionNewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

export interface RegionNewsResponse {
  items: RegionNewsItem[];
  query: string;
}

export type RegionNewsCategory =
  | "all"
  | "politics"
  | "budget"
  | "education"
  | "welfare"
  | "transport"
  | "environment"
  | "culture"
  | "society";

export const REGION_NEWS_CATEGORIES: { key: RegionNewsCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "politics", label: "정치·행정" },
  { key: "budget", label: "예산·재정" },
  { key: "education", label: "교육" },
  { key: "welfare", label: "복지·보건" },
  { key: "transport", label: "교통·도시" },
  { key: "environment", label: "환경·안전" },
  { key: "culture", label: "문화·체육" },
  { key: "society", label: "사회" },
];

export function getRegionNews(
  sido: string | null,
  wiwName: string | null,
  opts: {
    q?: string;
    today?: boolean;
    limit?: number;
    category?: RegionNewsCategory;
  } = {},
): Promise<RegionNewsResponse> {
  const p = new URLSearchParams();
  if (sido) p.set("sido", sido);
  if (wiwName) p.set("wiwName", wiwName);
  if (opts.q) p.set("q", opts.q);
  if (opts.today) p.set("today", "true");
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.category && opts.category !== "all") p.set("category", opts.category);
  return apiFetch<RegionNewsResponse>(`/api/region/news?${p.toString()}`);
}

export function getBasicRegions(): Promise<BasicRegionsResponseDTO> {
  return apiFetch<BasicRegionsResponseDTO>("/api/legislators/basic-regions");
}

export function getCouncilLegislatorPhotos(
  rasmblyNm: string,
): Promise<CouncilLegislatorPhotosResponseDTO> {
  return apiFetch<CouncilLegislatorPhotosResponseDTO>(
    `/api/legislators/by-council?rasmblyNm=${encodeURIComponent(rasmblyNm)}`,
  );
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

export type ControversySyncStatus =
  | { state: "idle" }
  | { state: "running"; startedAt: number; message?: string }
  | {
      state: "completed";
      startedAt: number;
      completedAt: number;
      topicsCreated: number;
      articlesAdded: number;
    }
  | { state: "failed"; startedAt: number; failedAt: number; error: string };

// 백그라운드 수집 시작 (202 응답: state="running"). 페이지 떠나도 서버에서 계속 실행.
export function syncLegislatorControversies(
  id: string,
): Promise<ControversySyncStatus> {
  return apiFetch<ControversySyncStatus>(
    `/api/legislators/${encodeURIComponent(id)}/controversies/sync`,
    { method: "POST" },
  );
}

// 진행 상태 폴링용 — running/completed/failed/idle
export function getLegislatorControversiesSyncStatus(
  id: string,
): Promise<ControversySyncStatus> {
  return apiFetch<ControversySyncStatus>(
    `/api/legislators/${encodeURIComponent(id)}/controversies/sync-status`,
  );
}

// ── CLIK 의정활동 (광역·기초의원 회의록·의안) ─────────────────

export function getCouncilMinutes(
  rasmblyNm: string,
  params: { limit?: number; offset?: number } = {}
): Promise<CouncilMinutesResponseDTO> {
  const query = new URLSearchParams();
  query.set("rasmblyNm", rasmblyNm);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  return apiFetch<CouncilMinutesResponseDTO>(
    `/api/council/minutes?${query.toString()}`
  );
}

export function getCouncilBills(
  rasmblyNm: string,
  params: { limit?: number; offset?: number } = {}
): Promise<CouncilBillsResponseDTO> {
  const query = new URLSearchParams();
  query.set("rasmblyNm", rasmblyNm);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  return apiFetch<CouncilBillsResponseDTO>(
    `/api/council/bills?${query.toString()}`
  );
}

// ── CLIK 회의록 상세 (본문 + AI 요약) ─────────────────────────

export function getMinutesDetail(
  docId: string,
): Promise<CouncilMinutesDetailDTO> {
  return apiFetch<CouncilMinutesDetailDTO>(
    `/api/council/minutes/${encodeURIComponent(docId)}`,
  );
}

export function fetchMinutesContent(
  docId: string,
  force = false,
): Promise<CouncilMinutesDetailDTO> {
  const qs = force ? "?force=true" : "";
  return apiFetch<CouncilMinutesDetailDTO>(
    `/api/council/minutes/${encodeURIComponent(docId)}/fetch${qs}`,
    { method: "POST" },
  );
}

export function analyzeMinutes(
  docId: string,
): Promise<CouncilMinutesDetailDTO> {
  return apiFetch<CouncilMinutesDetailDTO>(
    `/api/council/minutes/${encodeURIComponent(docId)}/analyze`,
    { method: "POST" },
  );
}

// ── CLIK 의안 AI 요약 (조례안·건의안) ─────────────────────────

export function getCouncilBillSummary(
  docId: string,
): Promise<CouncilBillSummaryDTO> {
  return apiFetch<CouncilBillSummaryDTO>(
    `/api/council/bills/${encodeURIComponent(docId)}/summary`,
  );
}

export function generateCouncilBillSummary(
  docId: string,
): Promise<CouncilBillSummaryDTO> {
  return apiFetch<CouncilBillSummaryDTO>(
    `/api/council/bills/${encodeURIComponent(docId)}/summary/generate`,
    { method: "POST" },
  );
}

// ── 후보자 토론회 (Debate) ─────────────────────────

export interface DebateSummaryItem {
  id: string;
  sido: string;
  positionType: string;
  videoId: string;
  title: string;
  channelTitle: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  summary: string | null;
  keyTopics: unknown;
  candidateIds: string[];
}

export interface DebateListResponse {
  items: DebateSummaryItem[];
}

// ── 본예산 (BudgetPlan) ───────────────────────

export interface BudgetPlanItem {
  field: string;
  amount: string;
  percent: number;
}

export interface BudgetPlanUnitResponse {
  fiscalYear: number;
  unitCode: string;
  unitName: string;
  totalAmount: string;
  items: BudgetPlanItem[];
}

// ── 우리 동네 권력 지도 (Sankey) ─────────────────────────

export interface PowerMapNode {
  id: string;
  category: "source" | "unit" | "field";
}
export interface PowerMapLink {
  source: string;
  target: string;
  value: number;
}
export interface PowerMapResponse {
  fiscalYear: number;
  unitCode: string;
  unitName: string;
  sido: string;
  currentHead: { name: string; party: string | null; label: string } | null;
  totalAmount: string;
  sourceBreakdown: {
    natl: string;
    sido: string;
    sgg: string;
    etc: string;
  };
  nodes: PowerMapNode[];
  links: PowerMapLink[];
}
export function getPowerMap(
  unitCode: string,
  fiscalYear?: number,
): Promise<PowerMapResponse> {
  const p = new URLSearchParams();
  if (fiscalYear) p.set("fiscalYear", String(fiscalYear));
  const qs = p.toString();
  return apiFetch<PowerMapResponse>(
    `/api/power-map/unit/${encodeURIComponent(unitCode)}${qs ? `?${qs}` : ""}`,
  );
}

export interface PowerMapTimelinePoint {
  x: string; // fiscalYear (string)
  y: number; // spend amount in won
  budget: string;
  spend: string;
}
export interface PowerMapTimelineSeries {
  id: string; // field
  data: PowerMapTimelinePoint[];
}
export interface PowerMapTimelineResponse {
  unitCode: string;
  from: number;
  to: number;
  series: PowerMapTimelineSeries[];
  availableYears: number[];
}
export interface PowerMapBillsResponse {
  unitCode: string;
  unitName: string;
  councilKeyword: string;
  totalBills: number;
  topProposers: { name: string; count: number }[];
  recentBills: {
    docId: string;
    biSj: string;
    propsr: string | null;
    itncDe: string | null;
    rasmblyNm: string;
    viewUrl: string | null;
  }[];
}
export function getPowerMapBills(
  unitCode: string,
  opts: { keyword?: string } = {},
): Promise<PowerMapBillsResponse> {
  const p = new URLSearchParams();
  if (opts.keyword) p.set("keyword", opts.keyword);
  const qs = p.toString();
  return apiFetch<PowerMapBillsResponse>(
    `/api/power-map/unit/${encodeURIComponent(unitCode)}/bills${qs ? `?${qs}` : ""}`,
  );
}

export function getPowerMapTimeline(
  unitCode: string,
  opts: { from?: number; to?: number; topN?: number } = {},
): Promise<PowerMapTimelineResponse> {
  const p = new URLSearchParams();
  if (opts.from) p.set("from", String(opts.from));
  if (opts.to) p.set("to", String(opts.to));
  if (opts.topN) p.set("topN", String(opts.topN));
  const qs = p.toString();
  return apiFetch<PowerMapTimelineResponse>(
    `/api/power-map/unit/${encodeURIComponent(unitCode)}/timeline${qs ? `?${qs}` : ""}`,
  );
}

// ── 정당 정보 ─────────────────────────

export interface PartySummaryDTO {
  party: string;
  totalCandidates: number;
  candidatesByPosition: Record<string, number>;
  totalLegislators: number;
  legislatorsByLevel: Record<string, number>;
}
export interface PartyListResponse {
  items: PartySummaryDTO[];
}
export interface PartyDetailCandidate {
  id: string;
  name: string;
  positionType: string;
  sido: string | null;
  wiwName: string | null;
  districtName: string | null;
  photoUrl: string | null;
}
export interface PartyDetailLegislator {
  id: string;
  name: string;
  level: string;
  region: string | null;
  councilName: string | null;
  assemblyAge: number | null;
}
export interface PartyDetailResponse {
  party: string;
  candidates: PartyDetailCandidate[];
  legislators: PartyDetailLegislator[];
  counts: { candidates: number; legislators: number };
}
export function getParties(): Promise<PartyListResponse> {
  return apiFetch<PartyListResponse>("/api/parties");
}
export function getPartyDetail(name: string): Promise<PartyDetailResponse> {
  return apiFetch<PartyDetailResponse>(`/api/parties/${encodeURIComponent(name)}`);
}

export interface BudgetExpenseItem {
  detailBizCode: string;
  detailBizName: string;
  field: string;
  fieldCode: string;
  sector: string | null;
  sectorCode: string | null;
  accountType: string | null;
  budgetAmount: string;
  spendAmount: string;
  natlFundAmt: string | null;
  sidoFundAmt: string | null;
  sggFundAmt: string | null;
  etcAmt: string | null;
  executionRate: number | null;
}
export interface BudgetExpenseResponse {
  fiscalYear: number;
  unitCode: string;
  items: BudgetExpenseItem[];
}
export interface BudgetExpenseSectorItem {
  sector: string | null;
  budgetAmount: string;
  spendAmount: string;
  executionRate: number | null;
}
export interface BudgetExpenseSectorResponse {
  fiscalYear: number;
  unitCode: string;
  field: string | null;
  items: BudgetExpenseSectorItem[];
}
export function getBudgetExpenseUnit(
  unitCode: string,
  opts: {
    fiscalYear?: number;
    field?: string;
    sector?: string;
    limit?: number;
    sortBy?: "spend" | "budget";
  } = {},
): Promise<BudgetExpenseResponse> {
  const p = new URLSearchParams();
  if (opts.fiscalYear) p.set("fiscalYear", String(opts.fiscalYear));
  if (opts.field) p.set("field", opts.field);
  if (opts.sector) p.set("sector", opts.sector);
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.sortBy) p.set("sortBy", opts.sortBy);
  const qs = p.toString();
  return apiFetch<BudgetExpenseResponse>(
    `/api/budget-expense/unit/${encodeURIComponent(unitCode)}${qs ? `?${qs}` : ""}`,
  );
}
export function getBudgetExpenseUnitSectors(
  unitCode: string,
  opts: { fiscalYear?: number; field?: string } = {},
): Promise<BudgetExpenseSectorResponse> {
  const p = new URLSearchParams();
  if (opts.fiscalYear) p.set("fiscalYear", String(opts.fiscalYear));
  if (opts.field) p.set("field", opts.field);
  const qs = p.toString();
  return apiFetch<BudgetExpenseSectorResponse>(
    `/api/budget-expense/unit/${encodeURIComponent(unitCode)}/sectors${qs ? `?${qs}` : ""}`,
  );
}

export function getBudgetPlanUnit(
  unitCode: string,
  fiscalYear?: number,
): Promise<BudgetPlanUnitResponse> {
  const p = new URLSearchParams();
  if (fiscalYear) p.set("fiscalYear", String(fiscalYear));
  const qs = p.toString();
  return apiFetch<BudgetPlanUnitResponse>(
    `/api/budget-plan/unit/${encodeURIComponent(unitCode)}${qs ? `?${qs}` : ""}`,
  );
}

export function getDebates(opts: {
  sido?: string | null;
  positionType?: string | null;
  candidateId?: string | null;
  limit?: number;
} = {}): Promise<DebateListResponse> {
  const p = new URLSearchParams();
  if (opts.sido) p.set("sido", opts.sido);
  if (opts.positionType) p.set("positionType", opts.positionType);
  if (opts.candidateId) p.set("candidateId", opts.candidateId);
  if (opts.limit) p.set("limit", String(opts.limit));
  return apiFetch<DebateListResponse>(`/api/debates?${p.toString()}`);
}

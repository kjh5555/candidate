// Korean political information service — shared DTOs
// Mirrors Prisma schema enums; kept in sync manually.

export type LegislatorLevel = "NATIONAL" | "PROVINCIAL";
export type Gender = "MALE" | "FEMALE" | "UNKNOWN";
export type VoteResult = "YES" | "NO" | "ABSTAIN" | "ABSENT";
export type BillResult =
  | "PASSED"
  | "PASSED_AMENDED"
  | "REJECTED"
  | "WITHDRAWN"
  | "SUPERSEDED"
  | "PENDING";
export type ProposerRole = "PRIMARY" | "CO";
export type DistrictLevel = "NATIONAL" | "PROVINCIAL";

// ── Region / District ─────────────────────────────────────────

export interface DistrictSummaryDTO {
  id: string;
  name: string;
  sido?: string;
  sigungu?: string;
}

export interface ProvincialDistrictSummaryDTO {
  id: string;
  name: string;
  councilName?: string;
}

export interface RegionMatchResponseDTO {
  hangjeongDongCode: string;
  hangjeongDongName: string;
  nationalDistrict: DistrictSummaryDTO | null;
  provincialDistrict: ProvincialDistrictSummaryDTO | null;
  resolvedAddress: string;
  coordinates: { lat: number; lng: number };
}

export interface DistrictListItemDTO {
  id: string;
  name: string;
  sido: string | null;
  sigungu: string | null;
}

export interface DistrictsResponseDTO {
  districts: DistrictListItemDTO[];
  total: number;
}

// ── Legislator ────────────────────────────────────────────────

export interface LegislatorSummaryDTO {
  id: string;
  name: string;
  level: LegislatorLevel;
  party: string | null;
  gender: Gender;
  photoUrl: string | null;
  electoralDistrictName: string | null;
  committee: string | null;
  termCount: string | null;
  assemblyAge: number | null;
  councilName: string | null;
}

export interface LegislatorCountsDTO {
  billsPrimary: number;
  billsCo: number;
  votesTotal: number;
  votesYes: number;
  votesNo: number;
  votesAbstain: number;
  votesAbsent: number;
}

export interface LegislatorDetailDTO extends LegislatorSummaryDTO {
  birthDate: string | null;
  phoneNumber: string | null;
  email: string | null;
  homepage: string | null;
  officeAddress: string | null;
  titleDescription: string | null;
  region: string | null;
  _counts: LegislatorCountsDTO;
}

export interface LegislatorsResponseDTO {
  legislators: LegislatorSummaryDTO[];
  total: number;
}

// ── Bill ──────────────────────────────────────────────────────

export interface BillSummaryDTO {
  id: string;
  billNo: string;
  name: string;
  proposedDate: string | null;
  committee: string | null;
  result: BillResult | null;
  assemblyAge: number | null;
  linkUrl: string | null;
  role?: ProposerRole;
}

export interface ProposerDTO {
  legislatorId: string;
  name: string;
  party: string | null;
  photoUrl: string | null;
  role: ProposerRole;
  matchConfidence: number;
}

export interface VotesSummaryDTO {
  yes: number;
  no: number;
  abstain: number;
  absent: number;
  total: number;
}

export interface BillDetailDTO {
  id: string;
  billNo: string;
  name: string;
  proposedDate: string | null;
  committee: string | null;
  result: BillResult | null;
  assemblyAge: number | null;
  linkUrl: string | null;
  coProposerNamesRaw: string | null;
  proposerMatchStatus: string | null;
  proposers: ProposerDTO[];
  votesSummary: VotesSummaryDTO;
}

export interface BillsResponseDTO {
  bills: BillSummaryDTO[];
  total: number;
  limit: number;
  offset: number;
}

// ── Vote ──────────────────────────────────────────────────────

export interface VoteRecordDTO {
  id: string;
  billNo: string;
  billName: string | null;
  billId: string | null;
  result: VoteResult;
  voteDate: string;
  assemblyAge: number | null;
}

export interface VotesResponseDTO {
  votes: VoteRecordDTO[];
  total: number;
  limit: number;
  offset: number;
}

// ── Candidate (2026 지방선거) ──────────────────────────────────

export type CandidatePositionType = "GOVERNOR" | "MAYOR";
export type CandidateStatus =
  | "REGISTERED"
  | "WITHDRAWN"
  | "CANCELLED"
  | "UNKNOWN";

export interface CandidatePledgeDTO {
  ord: number;
  category: string | null;
  title: string;
  content: string | null;
}

export interface CandidateSummaryDTO {
  id: string;
  name: string;
  party: string | null;
  positionType: CandidatePositionType;
  sido: string | null;
  wiwName: string | null;
  districtName: string | null;
  age: number | null;
  occupation: string | null;
  status: CandidateStatus;
}

export interface CandidateDetailDTO extends CandidateSummaryDTO {
  hanjaName: string | null;
  gender: string | null;
  birthDate: string | null;
  education: string | null;
  career1: string | null;
  career2: string | null;
  address: string | null;
  registeredAt: string | null;
  pledges: CandidatePledgeDTO[];

  // ── Background disclosures (전과/재산/병역/세금) ──
  hasCriminalRecord: boolean;
  criminalRecordPdfUrl: string | null;
  hasAssetDisclosure: boolean;
  assetDisclosurePdfUrl: string | null;
  hasMilitaryRecord: boolean;
  militaryRecordPdfUrl: string | null;
  hasTaxRecord: boolean;
  taxRecordPdfUrl: string | null;
  criminalRecordCount: number | null;
  assetTotalManwon: string | null; // BigInt serialized as string
  militaryStatus: string | null;
  taxPaidManwon: string | null; // BigInt serialized as string
  taxOutstandingManwon: string | null; // BigInt serialized as string
}

export interface CandidatesResponseDTO {
  candidates: CandidateSummaryDTO[];
  total: number;
}

export interface CandidateRegionDTO {
  sido: string;
  wiwName: string | null; // null for GOVERNOR (only sido-level)
}

export interface CandidateRegionsResponseDTO {
  regions: CandidateRegionDTO[];
}

// ── Budget (예산 정보) ─────────────────────────────────────────

export type BudgetLevel = "NATIONAL" | "METROPOLITAN";

export interface BudgetItemDTO {
  key: string; // ministry name OR field name OR sido name
  amount: string; // BigInt serialized as string
  percent: number; // 0-100, 2 decimals
}

export interface BudgetBreakdownDTO {
  fiscalYear: number;
  level: BudgetLevel;
  groupBy: "field" | "ministry" | "sido" | "ministry-field" | "sido-field";
  items: BudgetItemDTO[];
  totalAmount: string; // BigInt serialized as string
}

export interface BudgetYearsResponseDTO {
  years: number[];
}

// ── Misc ──────────────────────────────────────────────────────

export interface ApiErrorDTO {
  error: string;
  message: string;
  detail?: unknown;
}

export interface HealthResponseDTO {
  status: "ok" | "error";
  timestamp: string;
  db: "connected" | "disconnected";
}

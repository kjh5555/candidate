// Korean political information service — shared DTOs
// Mirrors Prisma schema enums; kept in sync manually.

export type LegislatorLevel = "NATIONAL" | "PROVINCIAL" | "BASIC";
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

  // ── 공직 후보자 공개 정보 (출마 시점 disclosure) ──
  hasCriminalRecord: boolean;
  criminalRecordPdfUrl: string | null;
  hasAssetDisclosure: boolean;
  assetDisclosurePdfUrl: string | null;
  hasMilitaryRecord: boolean;
  militaryRecordPdfUrl: string | null;
  hasTaxRecord: boolean;
  taxRecordPdfUrl: string | null;
  disclosureElectionId: string | null;

  // ── 재산공개 (공직자윤리위원회 정기공개 — opengirok / newstapa 정제 데이터) ──
  assetTotalManwon: string | null;       // BigInt serialized as string (만원)
  assetRealEstateManwon: string | null;  // 부동산 (만원)
  assetSecuritiesManwon: string | null;  // 증권 (만원)
  assetCashManwon: string | null;        // 예금 (만원)
  assetDebtManwon: string | null;        // 채무 (만원, 음수 가능)
  assetReportYear: number | null;        // 신고 연도
  assetSourceUrl: string | null;         // 출처 URL
  assetSourceName: string | null;        // "opengirok", "newstapa", "peti.go.kr"
  assetLastSyncedAt: string | null;      // ISO timestamp

  // ── 병역 (행안부 관보 공직자 병역사항 공개 — data.go.kr 15110207) ──
  militaryStatus: string | null;         // e.g. "복무를 마침", "미필", "면제"
  militaryRank: string | null;           // e.g. "병장", "중사"
  militaryEnteredAt: string | null;      // YYYY-MM-DD
  militaryDischargedAt: string | null;   // YYYY-MM-DD
  militaryReason: string | null;         // 면제/면접 사유
  militaryReportYear: number | null;     // 관보 공개 연도
  militarySourceUrl: string | null;      // 출처 URL
  militaryLastSyncedAt: string | null;   // ISO timestamp
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
  primaryProposerNameText: string | null;
  coProposerNamesText: string[];
  // ── AI 요약 (Gemini grounding) ──
  aiSummary?: string | null;
  aiChanges?: string | null;
  aiSourceSnippets?: BillAiSourceDTO[] | null;
  aiGeneratedAt?: string | null;
  aiModel?: string | null;
}

// ── AI 법안 요약 ──────────────────────────────────────────────

export interface BillAiSourceDTO {
  uri: string;
  title?: string;
}

export interface BillSummaryResponseDTO {
  billId: string;
  billNo: string | null;
  name: string;
  proposedDate: string | null; // ISO
  primaryProposerName: string | null;
  committee: string | null;
  linkUrl: string | null;
  // AI 생성 필드
  aiSummary: string | null;
  aiChanges: string | null; // 개정안 변경점 (해당없으면 null)
  aiSourceSnippets: BillAiSourceDTO[] | null;
  aiGeneratedAt: string | null; // ISO
  aiModel: string | null;
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
  // Bill context fields
  committee: string | null;
  primaryProposerName: string | null;
  primaryProposerLegislatorId: string | null;
  coProposerCount: number;
  linkUrl: string | null;
}

export interface VotesResponseDTO {
  votes: VoteRecordDTO[];
  total: number;
  limit: number;
  offset: number;
}

// ── Candidate (2026 지방선거) ──────────────────────────────────

export type CandidatePositionType =
  | "GOVERNOR"                     // 시·도지사 (sgTypecode=3)
  | "MAYOR"                        // 시·군·구청장 (sgTypecode=4)
  | "PROVINCIAL_COUNCILOR"         // 광역의원 지역구 (sgTypecode=5)
  | "BASIC_COUNCILOR"              // 기초의원 지역구 (sgTypecode=6)
  | "SUPERINTENDENT"               // 교육감 (sgTypecode=7)
  | "PROVINCIAL_COUNCILOR_PROP"    // 광역의원 비례 (sgTypecode=8)
  | "BASIC_COUNCILOR_PROP";        // 기초의원 비례 (sgTypecode=9)
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

// ── Basic council regions ──────────────────────────────────────

export interface BasicRegionDTO {
  sido: string;
  wiwName: string;
}

export interface BasicRegionsResponseDTO {
  regions: BasicRegionDTO[];
}

// 의회별 의원 이름·사진 (회의록 채팅 뷰의 아바타용)
export interface CouncilLegislatorPhotoDTO {
  name: string;
  photoUrl: string | null;
}

export interface CouncilLegislatorPhotosResponseDTO {
  photos: CouncilLegislatorPhotoDTO[];
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

// ── Settlement (세출결산 — 실제 지출) ──────────────────────────

export type SettlementLevel = "METROPOLITAN" | "BASIC";

export interface SettlementItemDTO {
  key: string; // sido | unitCode | field, depending on groupBy
  label?: string; // 표시명 (e.g. unitName when key=unitCode)
  amount: string; // BigInt serialized as string (원)
  percent: number; // 0-100, 2 decimals
}

export interface SettlementBreakdownDTO {
  fiscalYear: number;
  level: SettlementLevel;
  groupBy: "sido" | "unit" | "field" | "sido-field" | "unit-field";
  scope?: string; // optional context — e.g. selected sido or unitCode
  items: SettlementItemDTO[];
  totalAmount: string; // BigInt serialized as string
}

export interface SettlementUnitDTO {
  unitCode: string;
  unitName: string;
  sido: string;
  level: SettlementLevel;
  totalAmount: string;
}

export interface SettlementUnitsResponseDTO {
  units: SettlementUnitDTO[];
}

export interface SettlementYearsResponseDTO {
  years: number[];
}

export interface SettlementFieldDetailItemDTO {
  sector: string; // 부문명
  amount: string; // BigInt serialized as string (원)
  percent: number; // 0-100, 2 decimals
}

export interface SettlementFieldDetailDTO {
  fiscalYear: number;
  level: SettlementLevel;
  sido?: string;
  unitCode?: string;
  field: string;
  items: SettlementFieldDetailItemDTO[];
  totalAmount: string; // BigInt serialized as string

  // ── GGNSE 구조별 (정책사업/재무활동/행정운영) — aggregated per field ──
  // Optional: present when ingestSettlementStructure has been run for this year.
  policyBizAmount?: string;        // 정책사업비 (원, BigInt as string)
  financeActivityAmount?: string;  // 재무활동비 (원)
  adminOperAmount?: string;        // 행정운영경비 (원)
}

// 결산서 원본 PDF (lofin365 SETLK)
export interface SettlementReportDTO {
  fiscalYear: number;
  unitName: string;
  unitCode: string;
  sido: string;
  reportUrl: string;
  reportName: string | null;
}

// ── Region Hub (지역 허브) ─────────────────────────────────────
//
// Integrated single-page view for a citizen's region (sido + wiwName).
// Aggregates legislators (national/provincial/basic), settlement (budget
// expenditure), 2026 지방선거 candidates, and external links.

export interface RegionHubLegislatorsDTO {
  national: LegislatorSummaryDTO[];
  provincial: LegislatorSummaryDTO[];
  basic: LegislatorSummaryDTO[];
}

export interface RegionHubSettlementItemDTO {
  field: string;
  amount: string; // BigInt serialized as string (원)
  percent: number; // 0-100, 2 decimals
}

export interface RegionHubSettlementDTO {
  fiscalYear: number;
  totalAmount: string; // BigInt serialized as string (원)
  items: RegionHubSettlementItemDTO[];
  reportUrl: string | null;
  unitCode: string | null;
  unitName: string | null;
}

export interface RegionHubCandidatesDTO {
  mayor: CandidateSummaryDTO[];
  governor: CandidateSummaryDTO[];
}

export interface RegionHubExternalLinksDTO {
  sidoSite: string | null;
  provincialCouncil: string | null;
  sidoHomepage: string | null;
}

export interface RegionHubDTO {
  sido: string;
  wiwName: string;
  legislators: RegionHubLegislatorsDTO;
  settlement: RegionHubSettlementDTO | null;
  candidates: RegionHubCandidatesDTO;
  externalLinks: RegionHubExternalLinksDTO;
}

// ── Controversy / News (논란·해명) ─────────────────────────────

export type NewsStance = "claim" | "explanation" | "neutral";

export interface NewsArticleDTO {
  id: string;
  url: string;
  source: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null; // ISO
  stance: NewsStance | null;
  hasPrimarySource: boolean | null;
  hasCorrection: boolean | null;
}

export interface ControversyTopicDTO {
  id: string;
  legislatorId: string;
  title: string;
  summary: string | null;
  category: string | null;
  credibility: number | null;
  signals: Record<string, unknown> | null;
  firstSeenAt: string;
  lastSyncedAt: string;
  articles: NewsArticleDTO[];
}

export interface ControversyTopicsResponseDTO {
  topics: ControversyTopicDTO[];
  lastSyncedAt: string | null;
}

// ── CLIK 의정활동 (회의록·의안) ────────────────────────────────
//
// Source: 국회도서관 지방의정포털 (clik.nanet.go.kr) OpenAPI.
// 광역·기초의원 상세 페이지에서 의회 단위로 표시.

export interface CouncilMinutesDTO {
  id: string;
  docId: string;
  rasmblyNm: string;
  mtgDe: string | null;   // YYYY-MM-DD
  sesn: string | null;
  numpr: string | null;
  mtgNm: string | null;
  viewUrl: string | null;
}

export interface CouncilBillDTO {
  id: string;
  docId: string;
  rasmblyNm: string | null;
  biKndNm: string | null;  // 조례안, 건의안 등
  biNo: string | null;
  biSj: string;            // 안건제목
  itncDe: string | null;   // YYYY-MM-DD
  propsr: string | null;
  viewUrl: string | null;
}

export interface CouncilMinutesResponseDTO {
  minutes: CouncilMinutesDTO[];
  total: number;
}

export interface CouncilBillsResponseDTO {
  bills: CouncilBillDTO[];
  total: number;
}

// ── CLIK 의안 AI 요약 ──────────────────────────────────────────

export interface CouncilBillSummaryDTO {
  docId: string;
  biSj: string;
  biKndNm: string | null;
  biNo: string | null;
  rasmblyNm: string | null;
  itncDe: string | null;     // YYYY-MM-DD
  propsr: string | null;
  viewUrl: string | null;
  aiSummary: string | null;
  aiChanges: string | null;
  aiSourceSnippets: BillAiSourceDTO[];
  aiGeneratedAt: string | null;  // ISO
  aiModel: string | null;
}

// ── CLIK 회의록 상세 (본문 + AI 요약) ────────────────────────

export interface CouncilMinutesAgendaItemDTO {
  ord: number;
  title: string;
}

export interface CouncilMinutesSpeakerDTO {
  role: string;
  name: string;
  totalChars: number;
}

export interface CouncilMinutesSpeakerSummaryDTO {
  name: string;
  role: string;
  summary: string;
}

export interface CouncilMinutesDetailDTO {
  id: string;
  docId: string;
  rasmblyId: string;
  rasmblyNm: string;
  sesn: string | null;
  mtgDe: string | null;     // YYYY-MM-DD
  numpr: string | null;
  mtgNm: string | null;
  viewUrl: string | null;

  // 본문
  bodyText: string | null;
  agenda: CouncilMinutesAgendaItemDTO[];
  speakers: CouncilMinutesSpeakerDTO[];
  fetchedAt: string | null;

  // AI
  aiSummary: string | null;
  aiSpeakerSummaries: CouncilMinutesSpeakerSummaryDTO[];
  aiKeyTopics: string[];
  aiGeneratedAt: string | null;
  aiModel: string | null;
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

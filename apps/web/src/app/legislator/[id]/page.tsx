"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getLegislatorDetail } from "@/lib/api";
import { PartyBadge } from "@/components/PartyBadge";
import { BillsTab } from "./_components/BillsTab";
import { VotesTab } from "./_components/VotesTab";
import type { LegislatorDetailDTO } from "@repo/shared";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Globe,
  CalendarDays,
  Scale,
  Wallet,
  Shield,
  Receipt,
  ExternalLink,
} from "lucide-react";

// ─── 의회 외부 링크 ──────────────────────────────────────────

const PROVINCIAL_COUNCIL_URLS: Record<string, string> = {
  서울특별시: "https://www.smc.seoul.kr",
  부산광역시: "https://council.busan.go.kr",
  대구광역시: "https://council.daegu.go.kr",
  인천광역시: "https://council.incheon.go.kr",
  광주광역시: "https://council.gjcity.go.kr",
  대전광역시: "https://council.daejeon.go.kr",
  울산광역시: "https://council.ulsan.go.kr",
  세종특별자치시: "https://council.sejong.go.kr",
  경기도: "https://www.ggc.go.kr",
  강원특별자치도: "https://www.council.gwd.go.kr",
  충청북도: "https://council.cb21.net",
  충청남도: "https://www.cnacl.go.kr",
  전북특별자치도: "https://council.jeonbuk.go.kr",
  전라남도: "https://www.jnassembly.go.kr",
  경상북도: "https://council.gb.go.kr",
  경상남도: "https://www.gnacl.go.kr",
  제주특별자치도: "https://council.jeju.go.kr",
};

function getCouncilUrl(legislator: { level: string; region: string | null; name: string; councilName: string | null }): string | null {
  if (legislator.level === "PROVINCIAL") {
    return (legislator.region ? PROVINCIAL_COUNCIL_URLS[legislator.region] : null) ?? null;
  }
  if (legislator.level === "BASIC") {
    // 이름만으로 검색 — CLIK 검색은 의회명 같이 보내면 결과가 빔
    return `https://clik.nanet.go.kr/potal/search/searchList.do?collection=assemblyinfo&searchSelect=Y&query=${encodeURIComponent(legislator.name)}`;
  }
  return null;
}

// ─── 재산 포맷 헬퍼 ──────────────────────────────────────────

/** 만원 단위 BigInt(string) → 읽기 좋은 표시 (예: 52억 3,065만원) */
function formatManwon(manwonStr: string): string {
  const n = BigInt(manwonStr);
  const abs = n < 0n ? -n : n;
  const prefix = n < 0n ? "-" : "";
  const eok = abs / 10000n;
  const man = abs % 10000n;
  if (eok > 0n && man > 0n) {
    return `${prefix}${eok.toLocaleString()}억 ${man.toLocaleString()}만원`;
  } else if (eok > 0n) {
    return `${prefix}${eok.toLocaleString()}억원`;
  } else {
    return `${prefix}${man.toLocaleString()}만원`;
  }
}

function AssetCell({
  label,
  value,
  accent = false,
  debt = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  debt?: boolean;
}) {
  const formatted = formatManwon(value);
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-sm font-bold ${debt ? "text-red-600" : accent ? "text-blue-800" : "text-slate-800"}`}>
        {formatted}
      </p>
    </div>
  );
}

type DisclosureTone = "neutral" | "warn" | "ok" | "info";

function toneClass(tone: DisclosureTone): string {
  switch (tone) {
    case "warn": return "text-red-600";
    case "ok": return "text-green-700";
    case "info": return "text-blue-700";
    default: return "text-slate-600";
  }
}

function DisclosureCard({
  icon,
  title,
  status,
  statusTone,
  pdfUrl,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  statusTone: DisclosureTone;
  pdfUrl: string | null;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      <p className={`text-base font-semibold ${toneClass(statusTone)}`}>{status}</p>
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline mt-auto"
        >
          원본 PDF
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="text-xs text-slate-300 mt-auto">PDF 없음</span>
      )}
    </div>
  );
}

// ─── 병역 카드 ────────────────────────────────────────────────

type MilitaryBadgeVariant = "green" | "red" | "yellow" | "gray";

function militaryBadgeVariant(status: string | null): MilitaryBadgeVariant {
  if (!status) return "gray";
  if (status.includes("마침") || status.includes("전역") || status.includes("소집해제")) return "green";
  if (status.includes("미필") || status.includes("현역")) return "yellow";
  if (status.includes("면제")) return "red";
  return "gray";
}

function militaryBadgeClass(variant: MilitaryBadgeVariant): string {
  switch (variant) {
    case "green":  return "bg-green-100 text-green-800 border-green-200";
    case "red":    return "bg-red-100 text-red-700 border-red-200";
    case "yellow": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default:       return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

function MilitaryCard({ legislator }: { legislator: LegislatorDetailDTO }) {
  // Derive enriched status: prefer 행안부 관보 data, fall back to NEC disclosure flag
  const enriched = !!legislator.militaryLastSyncedAt;
  const hasMilitary = legislator.hasMilitaryRecord;

  const statusLabel: string =
    legislator.militaryStatus ??
    (hasMilitary ? "신고됨" : "해당없음");

  const variant = militaryBadgeVariant(legislator.militaryStatus);
  const badgeClass = militaryBadgeClass(variant);

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-500">
        <Shield className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide">병역</span>
      </div>

      {/* Status badge */}
      <span
        className={`inline-flex self-start text-sm font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}
      >
        {statusLabel}
      </span>

      {/* Enriched detail rows (행안부 관보 데이터 있을 때만) */}
      {enriched && (
        <dl className="text-xs text-slate-600 flex flex-col gap-1 mt-1">
          {legislator.militaryRank && (
            <div className="flex gap-1.5">
              <dt className="text-slate-400 min-w-[2.5rem]">계급</dt>
              <dd className="font-medium">{legislator.militaryRank}</dd>
            </div>
          )}
          {legislator.militaryEnteredAt && (
            <div className="flex gap-1.5">
              <dt className="text-slate-400 min-w-[2.5rem]">입영</dt>
              <dd>{legislator.militaryEnteredAt}</dd>
            </div>
          )}
          {legislator.militaryDischargedAt && (
            <div className="flex gap-1.5">
              <dt className="text-slate-400 min-w-[2.5rem]">전역</dt>
              <dd>{legislator.militaryDischargedAt}</dd>
            </div>
          )}
          {legislator.militaryReason && (
            <div className="flex gap-1.5">
              <dt className="text-slate-400 min-w-[2.5rem]">사유</dt>
              <dd className="text-slate-500">{legislator.militaryReason}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Source links */}
      <div className="flex flex-col gap-1 mt-auto">
        {legislator.militaryRecordPdfUrl ? (
          <a
            href={legislator.militaryRecordPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            선관위 신고 PDF
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-xs text-slate-300">PDF 없음</span>
        )}
        {enriched && legislator.militarySourceUrl && (
          <a
            href={legislator.militarySourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 hover:underline"
          >
            행안부 관보
            {legislator.militaryReportYear && ` (${legislator.militaryReportYear}년)`}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function LegislatorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [legislator, setLegislator] = useState<LegislatorDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"bills" | "votes">("bills");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getLegislatorDetail(id)
      .then(setLegislator)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.")
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-6 w-24 bg-slate-200 rounded animate-pulse" />
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex gap-6 animate-pulse">
          <div className="w-24 h-24 rounded-full bg-slate-200 shrink-0" />
          <div className="flex flex-col gap-3 flex-1">
            <div className="h-8 w-40 bg-slate-200 rounded" />
            <div className="h-5 w-24 bg-slate-100 rounded-full" />
            <div className="h-4 w-32 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !legislator) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">{error ?? "의원 정보를 찾을 수 없습니다."}</p>
        <Link href="/" className="inline-block text-blue-600 hover:underline text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const levelLabel = legislator.level === "NATIONAL" ? "국회의원" : legislator.level === "PROVINCIAL" ? "광역의회 의원" : "기초의회 의원";
  const counts = legislator._counts;
  const hasDisclosureData = !!legislator.disclosureElectionId;
  const councilUrl = getCouncilUrl(legislator);

  return (
    <div className="flex flex-col gap-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors self-start"
      >
        <ArrowLeft className="w-4 h-4" />
        뒤로가기
      </button>

      {/* Profile hero */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 ring-2 ring-slate-200">
            {legislator.photoUrl ? (
              <Image
                src={legislator.photoUrl}
                alt={legislator.name}
                width={96}
                height={96}
                className="object-cover w-full h-full"
              />
            ) : (
              <User className="w-12 h-12 text-slate-400" />
            )}
          </div>

          {/* Name + chips */}
          <div className="flex flex-col gap-2 items-center sm:items-start text-center sm:text-left">
            <h1 className="text-3xl font-bold text-slate-900">{legislator.name}</h1>
            <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
              <PartyBadge party={legislator.party} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-medium border border-slate-200">
                {levelLabel}
              </span>
              {legislator.electoralDistrictName && (
                <span className="text-xs bg-slate-50 text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">
                  {legislator.electoralDistrictName}
                </span>
              )}
              {legislator.committee && legislator.level === "NATIONAL" && (
                <span className="text-xs bg-slate-50 text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">
                  {legislator.committee}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 공식 의회 외부 링크 (PROVINCIAL / BASIC only) */}
      {councilUrl && legislator.level !== "NATIONAL" && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <div className="flex gap-4">
            <ExternalLink className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-1">의정활동 자세히 보기</h3>
              <p className="text-sm text-slate-700 mb-4">
                이 의원의 조례안 발의·회의 출석·시정질문 등 의정활동은 공식 의회 페이지에서 확인하세요.
              </p>
              <a
                href={councilUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-sm transition-colors"
              >
                {legislator.councilName ? `${legislator.councilName}에서 보기` : "공식 의회에서 보기"}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-sm transition-shadow">
          <p className="text-3xl font-bold text-slate-900">{counts.billsPrimary}</p>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">대표발의</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-sm transition-shadow">
          <p className="text-3xl font-bold text-slate-900">{counts.billsCo}</p>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">공동발의</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-sm transition-shadow">
          <p className="text-3xl font-bold text-slate-900">{counts.votesTotal}</p>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">표결 참여</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">찬성</span>
              <span className="font-bold text-slate-800">{counts.votesYes}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">반대</span>
              <span className="font-bold text-slate-800">{counts.votesNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">기권</span>
              <span className="font-bold text-slate-800">{counts.votesAbstain}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">불참</span>
              <span className="font-bold text-slate-600">{counts.votesAbsent}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">프로필</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {legislator.birthDate && (
            <div className="flex items-center gap-2.5">
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">출생일</dt>
              <dd className="text-slate-700">{legislator.birthDate.slice(0, 10)}</dd>
            </div>
          )}
          {legislator.email && (
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">이메일</dt>
              <dd>
                <a href={`mailto:${legislator.email}`} className="text-blue-600 hover:underline">
                  {legislator.email}
                </a>
              </dd>
            </div>
          )}
          {legislator.phoneNumber && (
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">전화</dt>
              <dd className="text-slate-700">{legislator.phoneNumber}</dd>
            </div>
          )}
          {legislator.homepage && (
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">홈페이지</dt>
              <dd>
                <a
                  href={legislator.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  바로가기
                </a>
              </dd>
            </div>
          )}
          {legislator.titleDescription && (
            <div className="flex items-start gap-2.5 col-span-full">
              <span className="w-4 h-4 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">약력</dt>
              <dd className="text-slate-700 whitespace-pre-line">{legislator.titleDescription}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* 공직 후보자 공개 정보 */}
      {hasDisclosureData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-xl font-semibold text-slate-900">공직 후보자 공개 정보</h2>
            <span className="text-xs text-slate-400">중앙선거관리위원회 기준</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <DisclosureCard
              icon={<Scale className="w-3.5 h-3.5" />}
              title="전과"
              status={legislator.hasCriminalRecord ? "신고됨" : "없음"}
              statusTone={legislator.hasCriminalRecord ? "warn" : "neutral"}
              pdfUrl={legislator.criminalRecordPdfUrl}
            />
            <DisclosureCard
              icon={<Wallet className="w-3.5 h-3.5" />}
              title="재산"
              status={
                legislator.assetTotalManwon != null
                  ? `신고됨 (총 ${formatManwon(legislator.assetTotalManwon)})`
                  : legislator.hasAssetDisclosure
                    ? "신고됨"
                    : "없음"
              }
              statusTone={
                legislator.assetTotalManwon != null || legislator.hasAssetDisclosure
                  ? "info"
                  : "neutral"
              }
              pdfUrl={legislator.assetDisclosurePdfUrl}
            />
            <MilitaryCard legislator={legislator} />
            <DisclosureCard
              icon={<Receipt className="w-3.5 h-3.5" />}
              title="납세"
              status={legislator.hasTaxRecord ? "신고됨" : "없음"}
              statusTone={legislator.hasTaxRecord ? "info" : "neutral"}
              pdfUrl={legislator.taxRecordPdfUrl}
            />
          </div>
        </div>
      )}

      {/* 재산공개 상세 (opengirok 정제 데이터) */}
      {legislator.assetTotalManwon != null && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-xl font-semibold text-slate-900">재산 신고 내역</h2>
            <span className="text-xs text-slate-400">
              {legislator.assetReportYear}년 정기공개
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <AssetCell label="재산 총액" value={legislator.assetTotalManwon} accent />
            {legislator.assetRealEstateManwon != null && (
              <AssetCell label="부동산" value={legislator.assetRealEstateManwon} />
            )}
            {legislator.assetSecuritiesManwon != null && (
              <AssetCell label="증권" value={legislator.assetSecuritiesManwon} />
            )}
            {legislator.assetCashManwon != null && (
              <AssetCell label="예금" value={legislator.assetCashManwon} />
            )}
            {legislator.assetDebtManwon != null && (
              <AssetCell label="채무" value={legislator.assetDebtManwon} debt />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>출처:</span>
            {legislator.assetSourceUrl ? (
              <a
                href={legislator.assetSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 hover:underline inline-flex items-center gap-0.5"
              >
                {legislator.assetSourceName ?? "opengirok"}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span>{legislator.assetSourceName ?? "opengirok"}</span>
            )}
            {legislator.assetReportYear && (
              <span>({legislator.assetReportYear}년 기준)</span>
            )}
          </div>
        </div>
      )}

      {/* Bills / Votes tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {/* Segmented control */}
        <div className="flex gap-1 mb-6 border-b border-slate-200 -mx-6 px-6">
          {(["bills", "votes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              {t === "bills" ? "발의 법안" : "표결 이력"}
            </button>
          ))}
        </div>
        {tab === "bills" ? (
          <BillsTab legislatorId={id} />
        ) : (
          <VotesTab legislatorId={id} />
        )}
      </div>
    </div>
  );
}

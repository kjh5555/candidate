"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  CalendarDays,
  MapPin,
  Briefcase,
  GraduationCap,
  FileText,
  Scale,
  Wallet,
  Shield,
  Receipt,
  ExternalLink,
} from "lucide-react";
import { getCandidateDetail } from "@/lib/api";
import { PartyBadge } from "@/components/PartyBadge";
import type {
  CandidateDetailDTO,
  CandidatePositionType,
  CandidateStatus,
} from "@repo/shared";

const POSITION_LABEL: Record<CandidatePositionType, string> = {
  GOVERNOR: "시·도지사 후보",
  MAYOR: "시장·군수·구청장 후보",
};

const STATUS_LABEL: Record<CandidateStatus, string> = {
  REGISTERED: "등록",
  WITHDRAWN: "사퇴",
  CANCELLED: "무효",
  UNKNOWN: "—",
};

function statusBadgeClass(status: CandidateStatus): string {
  switch (status) {
    case "REGISTERED":
      return "bg-green-50 text-green-700 border-green-200";
    case "WITHDRAWN":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

/**
 * Format an amount in 만원 (man-won) as a human-readable Korean currency
 * string. E.g. `129800` → `₩12억 9,800만원`, `350` → `₩350만원`.
 * Accepts a string (from BigInt JSON serialization) or null.
 */
function formatManwon(raw: string | null): string | null {
  if (!raw) return null;
  let n: number;
  try {
    n = Number(raw);
  } catch {
    return null;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) {
    return `₩${eok}억 ${man.toLocaleString("ko-KR")}만원`;
  }
  if (eok > 0) {
    return `₩${eok}억원`;
  }
  return `₩${man.toLocaleString("ko-KR")}만원`;
}

interface BackgroundCardProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  statusTone: "neutral" | "warn" | "ok" | "info";
  pdfUrl: string | null;
}

function backgroundStatusToneClass(tone: BackgroundCardProps["statusTone"]): string {
  switch (tone) {
    case "warn":
      return "text-red-600";
    case "ok":
      return "text-green-700";
    case "info":
      return "text-blue-700";
    default:
      return "text-slate-500";
  }
}

function BackgroundCard({
  icon,
  title,
  status,
  statusTone,
  pdfUrl,
}: BackgroundCardProps) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-600">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className={`text-base font-semibold ${backgroundStatusToneClass(statusTone)}`}>
        {status}
      </p>
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline mt-auto"
        >
          원본 PDF 보기
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="text-xs text-slate-300 mt-auto">PDF 없음</span>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getCandidateDetail(id)
      .then(setCandidate)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "후보 정보를 불러오지 못했습니다.",
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div>
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-6" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 flex gap-6">
          <div className="w-28 h-28 rounded-full bg-slate-200 animate-pulse" />
          <div className="flex flex-col gap-3">
            <div className="h-8 w-36 bg-slate-200 rounded animate-pulse" />
            <div className="h-5 w-24 bg-slate-100 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500">{error ?? "후보 정보를 찾을 수 없습니다."}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-blue-600 hover:underline text-sm"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const regionLabel = [candidate.sido, candidate.wiwName]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        뒤로가기
      </button>

      {/* Hero / Profile header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
            <User className="w-14 h-14 text-slate-400" />
          </div>
          <div className="flex flex-col gap-2 items-center sm:items-start text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-baseline gap-2 justify-center sm:justify-start">
              <h1 className="text-2xl font-bold text-slate-800">
                {candidate.name}
              </h1>
              {candidate.hanjaName && (
                <span className="text-sm text-slate-400">
                  ({candidate.hanjaName})
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
              <PartyBadge party={candidate.party} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {POSITION_LABEL[candidate.positionType]}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadgeClass(candidate.status)}`}
              >
                {STATUS_LABEL[candidate.status]}
              </span>
            </div>
            {regionLabel && (
              <p className="text-slate-500 text-sm">{regionLabel}</p>
            )}
            {candidate.districtName && (
              <p className="text-slate-400 text-xs">
                선거구: {candidate.districtName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-700 mb-4">프로필</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {candidate.birthDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">출생일</dt>
              <dd className="text-slate-700">
                {candidate.birthDate}
                {candidate.age !== null && (
                  <span className="text-slate-400"> (만 {candidate.age}세)</span>
                )}
              </dd>
            </div>
          )}
          {candidate.gender && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">성별</dt>
              <dd className="text-slate-700">{candidate.gender}</dd>
            </div>
          )}
          {candidate.occupation && (
            <div className="flex items-start gap-2">
              <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4rem]">직업</dt>
              <dd className="text-slate-700">{candidate.occupation}</dd>
            </div>
          )}
          {candidate.education && (
            <div className="flex items-start gap-2 col-span-full">
              <GraduationCap className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4rem]">학력</dt>
              <dd className="text-slate-700 whitespace-pre-line">
                {candidate.education}
              </dd>
            </div>
          )}
          {(candidate.career1 || candidate.career2) && (
            <div className="flex items-start gap-2 col-span-full">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4rem]">경력</dt>
              <dd className="text-slate-700 whitespace-pre-line">
                {[candidate.career1, candidate.career2]
                  .filter(Boolean)
                  .join("\n\n")}
              </dd>
            </div>
          )}
          {candidate.address && (
            <div className="flex items-start gap-2 col-span-full">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4rem]">주소</dt>
              <dd className="text-slate-700">{candidate.address}</dd>
            </div>
          )}
          {candidate.registeredAt && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">등록일</dt>
              <dd className="text-slate-700">
                {candidate.registeredAt.slice(0, 10)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* 공직 후보자 공개 정보 section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-700 mb-1">
          공직 후보자 공개 정보
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          중앙선거관리위원회 후보자 정보 공개 자료 기준
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <BackgroundCard
            icon={<Scale className="w-4 h-4 text-slate-400" />}
            title="전과"
            status={
              candidate.criminalRecordCount !== null &&
              candidate.criminalRecordCount > 0
                ? `${candidate.criminalRecordCount}건`
                : candidate.hasCriminalRecord
                  ? "있음"
                  : "없음"
            }
            statusTone={candidate.hasCriminalRecord ? "warn" : "neutral"}
            pdfUrl={candidate.criminalRecordPdfUrl}
          />
          <BackgroundCard
            icon={<Wallet className="w-4 h-4 text-slate-400" />}
            title="재산"
            status={
              formatManwon(candidate.assetTotalManwon) ??
              (candidate.hasAssetDisclosure ? "신고" : "없음")
            }
            statusTone={candidate.hasAssetDisclosure ? "info" : "neutral"}
            pdfUrl={candidate.assetDisclosurePdfUrl}
          />
          <BackgroundCard
            icon={<Shield className="w-4 h-4 text-slate-400" />}
            title="병역"
            status={
              candidate.militaryStatus ??
              (candidate.hasMilitaryRecord ? "신고" : "해당없음")
            }
            statusTone={candidate.hasMilitaryRecord ? "ok" : "neutral"}
            pdfUrl={candidate.militaryRecordPdfUrl}
          />
          <BackgroundCard
            icon={<Receipt className="w-4 h-4 text-slate-400" />}
            title="납세/체납"
            status={(() => {
              const paid = formatManwon(candidate.taxPaidManwon);
              const outstanding = formatManwon(candidate.taxOutstandingManwon);
              if (paid && outstanding) {
                return `납세 ${paid} / 체납 ${outstanding}`;
              }
              if (paid) return `납세 ${paid}`;
              if (outstanding) return `체납 ${outstanding}`;
              return candidate.hasTaxRecord ? "신고" : "없음";
            })()}
            statusTone={
              candidate.taxOutstandingManwon &&
              Number(candidate.taxOutstandingManwon) > 0
                ? "warn"
                : candidate.hasTaxRecord
                  ? "info"
                  : "neutral"
            }
            pdfUrl={candidate.taxRecordPdfUrl}
          />
        </div>
      </div>

      {/* 공약 section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-700 mb-4">공약</h2>
        {candidate.pledges.length === 0 ? (
          <p className="text-sm text-slate-400">
            등록된 공약 정보가 없습니다.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {candidate.pledges.map((p) => (
              <li
                key={p.ord}
                className="border-l-2 border-blue-200 pl-4 py-1"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-600">
                    공약 {p.ord}
                  </span>
                  {p.category && (
                    <span className="text-xs text-slate-400">
                      · {p.category}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-slate-800 mb-1">{p.title}</p>
                {p.content && (
                  <p className="text-sm text-slate-600 whitespace-pre-line">
                    {p.content}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

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
  if (eok > 0 && man > 0) return `₩${eok}억 ${man.toLocaleString("ko-KR")}만원`;
  if (eok > 0) return `₩${eok}억원`;
  return `₩${man.toLocaleString("ko-KR")}만원`;
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
        setError(err instanceof Error ? err.message : "후보 정보를 불러오지 못했습니다."),
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
          </div>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">{error ?? "후보 정보를 찾을 수 없습니다."}</p>
        <Link href="/" className="inline-block text-blue-600 hover:underline text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const regionLabel = [candidate.sido, candidate.wiwName].filter(Boolean).join(" ");

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
          <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 ring-2 ring-slate-200">
            <User className="w-12 h-12 text-slate-400" />
          </div>
          <div className="flex flex-col gap-2 items-center sm:items-start text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-baseline gap-2 justify-center sm:justify-start">
              <h1 className="text-3xl font-bold text-slate-900">{candidate.name}</h1>
              {candidate.hanjaName && (
                <span className="text-sm text-slate-400">({candidate.hanjaName})</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
              <PartyBadge party={candidate.party} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-medium border border-slate-200">
                {POSITION_LABEL[candidate.positionType]}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusBadgeClass(candidate.status)}`}>
                {STATUS_LABEL[candidate.status]}
              </span>
            </div>
            {regionLabel && (
              <p className="text-slate-500 text-sm">{regionLabel}</p>
            )}
            {candidate.districtName && (
              <p className="text-slate-400 text-xs">선거구: {candidate.districtName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">프로필</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {candidate.birthDate && (
            <div className="flex items-center gap-2.5">
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">출생일</dt>
              <dd className="text-slate-700">
                {candidate.birthDate}
                {candidate.age !== null && (
                  <span className="text-slate-400"> (만 {candidate.age}세)</span>
                )}
              </dd>
            </div>
          )}
          {candidate.gender && (
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">성별</dt>
              <dd className="text-slate-700">{candidate.gender}</dd>
            </div>
          )}
          {candidate.occupation && (
            <div className="flex items-start gap-2.5">
              <Briefcase className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4.5rem]">직업</dt>
              <dd className="text-slate-700">{candidate.occupation}</dd>
            </div>
          )}
          {candidate.education && (
            <div className="flex items-start gap-2.5 col-span-full">
              <GraduationCap className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4.5rem]">학력</dt>
              <dd className="text-slate-700 whitespace-pre-line">{candidate.education}</dd>
            </div>
          )}
          {(candidate.career1 || candidate.career2) && (
            <div className="flex items-start gap-2.5 col-span-full">
              <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4.5rem]">경력</dt>
              <dd className="text-slate-700 whitespace-pre-line">
                {[candidate.career1, candidate.career2].filter(Boolean).join("\n\n")}
              </dd>
            </div>
          )}
          {candidate.address && (
            <div className="flex items-start gap-2.5 col-span-full">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <dt className="text-slate-500 min-w-[4.5rem]">주소</dt>
              <dd className="text-slate-700">{candidate.address}</dd>
            </div>
          )}
          {candidate.registeredAt && (
            <div className="flex items-center gap-2.5">
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <dt className="text-slate-500 min-w-[4.5rem]">등록일</dt>
              <dd className="text-slate-700">{candidate.registeredAt.slice(0, 10)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* 공직 후보자 공개 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">공직 후보자 공개 정보</h2>
          <span className="text-xs text-slate-400">중앙선거관리위원회 기준</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <DisclosureCard
            icon={<Scale className="w-3.5 h-3.5" />}
            title="전과"
            status={
              candidate.criminalRecordCount !== null && candidate.criminalRecordCount > 0
                ? `${candidate.criminalRecordCount}건`
                : candidate.hasCriminalRecord
                  ? "있음"
                  : "없음"
            }
            statusTone={candidate.hasCriminalRecord ? "warn" : "neutral"}
            pdfUrl={candidate.criminalRecordPdfUrl}
          />
          <DisclosureCard
            icon={<Wallet className="w-3.5 h-3.5" />}
            title="재산"
            status={
              formatManwon(candidate.assetTotalManwon) ??
              (candidate.hasAssetDisclosure ? "신고" : "없음")
            }
            statusTone={candidate.hasAssetDisclosure ? "info" : "neutral"}
            pdfUrl={candidate.assetDisclosurePdfUrl}
          />
          <DisclosureCard
            icon={<Shield className="w-3.5 h-3.5" />}
            title="병역"
            status={
              candidate.militaryStatus ??
              (candidate.hasMilitaryRecord ? "신고" : "해당없음")
            }
            statusTone={candidate.hasMilitaryRecord ? "ok" : "neutral"}
            pdfUrl={candidate.militaryRecordPdfUrl}
          />
          <DisclosureCard
            icon={<Receipt className="w-3.5 h-3.5" />}
            title="납세/체납"
            status={(() => {
              const paid = formatManwon(candidate.taxPaidManwon);
              const outstanding = formatManwon(candidate.taxOutstandingManwon);
              if (paid && outstanding) return `납세 ${paid} / 체납 ${outstanding}`;
              if (paid) return `납세 ${paid}`;
              if (outstanding) return `체납 ${outstanding}`;
              return candidate.hasTaxRecord ? "신고" : "없음";
            })()}
            statusTone={
              candidate.taxOutstandingManwon && Number(candidate.taxOutstandingManwon) > 0
                ? "warn"
                : candidate.hasTaxRecord
                  ? "info"
                  : "neutral"
            }
            pdfUrl={candidate.taxRecordPdfUrl}
          />
        </div>
      </div>

      {/* 공약 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">공약</h2>
        {candidate.pledges.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 공약 정보가 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-5">
            {candidate.pledges.map((p) => (
              <li key={p.ord} className="border-l-2 border-blue-200 pl-4 py-0.5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-600">공약 {p.ord}</span>
                  {p.category && (
                    <span className="text-xs text-slate-400">· {p.category}</span>
                  )}
                </div>
                <p className="font-semibold text-slate-900 mb-1">{p.title}</p>
                {p.content && (
                  <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
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

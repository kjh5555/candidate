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

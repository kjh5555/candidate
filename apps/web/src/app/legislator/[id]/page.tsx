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
} from "lucide-react";

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

  if (error || !legislator) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500">{error ?? "의원 정보를 찾을 수 없습니다."}</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const levelLabel = legislator.level === "NATIONAL" ? "국회의원" : "광역의회 의원";
  const counts = legislator._counts;

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        뒤로가기
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
            {legislator.photoUrl ? (
              <Image
                src={legislator.photoUrl}
                alt={legislator.name}
                width={112}
                height={112}
                className="object-cover w-full h-full"
              />
            ) : (
              <User className="w-14 h-14 text-slate-400" />
            )}
          </div>
          <div className="flex flex-col gap-2 items-center sm:items-start text-center sm:text-left">
            <h1 className="text-2xl font-bold text-slate-800">{legislator.name}</h1>
            <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
              <PartyBadge party={legislator.party} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {levelLabel}
              </span>
            </div>
            {legislator.electoralDistrictName && (
              <p className="text-slate-500 text-sm">{legislator.electoralDistrictName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-700 mb-4">프로필</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {legislator.birthDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">출생일</dt>
              <dd className="text-slate-700">{legislator.birthDate.slice(0, 10)}</dd>
            </div>
          )}
          {legislator.committee && legislator.level === "NATIONAL" && (
            <div className="flex items-start gap-2">
              <span className="w-4 h-4 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">위원회</dt>
              <dd className="text-slate-700">{legislator.committee}</dd>
            </div>
          )}
          {legislator.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">이메일</dt>
              <dd>
                <a href={`mailto:${legislator.email}`} className="text-blue-600 hover:underline">
                  {legislator.email}
                </a>
              </dd>
            </div>
          )}
          {legislator.phoneNumber && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">전화</dt>
              <dd className="text-slate-700">{legislator.phoneNumber}</dd>
            </div>
          )}
          {legislator.homepage && (
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">홈페이지</dt>
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
            <div className="flex items-start gap-2 col-span-full">
              <span className="w-4 h-4 flex-shrink-0" />
              <dt className="text-slate-500 min-w-[4rem]">약력</dt>
              <dd className="text-slate-700 whitespace-pre-line">{legislator.titleDescription}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{counts.billsPrimary}</p>
          <p className="text-xs text-slate-500 mt-1">대표발의</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{counts.billsCo}</p>
          <p className="text-xs text-slate-500 mt-1">공동발의</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{counts.votesTotal}</p>
          <p className="text-xs text-slate-500 mt-1">표결 참여</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-500 flex flex-col justify-center gap-1">
          <div className="flex justify-between">
            <span className="text-green-600">찬성</span>
            <span className="font-medium text-slate-700">{counts.votesYes}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-red-500">반대</span>
            <span className="font-medium text-slate-700">{counts.votesNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-600">기권</span>
            <span className="font-medium text-slate-700">{counts.votesAbstain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">불참</span>
            <span className="font-medium text-slate-700">{counts.votesAbsent}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {(["bills", "votes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
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

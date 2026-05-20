"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getLegislatorDetail } from "@/lib/api";
import { getPartyColor } from "@/lib/partyColors";
import { BillsTab } from "./_components/BillsTab";
import { VotesTab } from "./_components/VotesTab";
import { ControversiesTab } from "./_components/ControversiesTab";
import { CouncilActivitySection } from "./_components/CouncilActivitySection";
import type { LegislatorDetailDTO } from "@repo/shared";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Globe,
  CalendarDays,
  ExternalLink,
  Newspaper,
  AlertTriangle,
  FileText,
  Vote as VoteIcon,
  Sparkles,
} from "lucide-react";

const PRIMARY = "#031635";
const SECONDARY = "#206298";
const BORDER = "#e5e7eb";
const SURFACE_CONTAINER = "#edeeef";
const SURFACE_LOW = "#f3f4f5";
const ON_VARIANT = "#44474e";

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

function getCouncilUrl(legislator: {
  level: string;
  region: string | null;
  name: string;
  councilName: string | null;
}): string | null {
  if (legislator.level === "PROVINCIAL") {
    return (
      (legislator.region ? PROVINCIAL_COUNCIL_URLS[legislator.region] : null) ??
      null
    );
  }
  if (legislator.level === "BASIC") {
    return `https://clik.nanet.go.kr/potal/search/searchList.do?collection=assemblyinfo&searchSelect=Y&query=${encodeURIComponent(legislator.name)}`;
  }
  return null;
}

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
  }
  return `${prefix}${man.toLocaleString()}만원`;
}

export default function LegislatorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [legislator, setLegislator] = useState<LegislatorDetailDTO | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "bills" | "votes" | "controversies" | "issues"
  >("bills");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getLegislatorDetail(id)
      .then(setLegislator)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.",
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!legislator) return;
    if (
      legislator.level !== "NATIONAL" &&
      (tab === "bills" || tab === "votes")
    ) {
      setTab("controversies");
    }
  }, [legislator, tab]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div
          className="md:col-span-4 lg:col-span-3 bg-white rounded-2xl p-5 animate-pulse h-96"
          style={{ border: `1px solid ${BORDER}` }}
        />
        <div
          className="md:col-span-8 lg:col-span-9 bg-white rounded-2xl p-5 animate-pulse h-96"
          style={{ border: `1px solid ${BORDER}` }}
        />
      </div>
    );
  }

  if (error || !legislator) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">
          {error ?? "의원 정보를 찾을 수 없습니다."}
        </p>
        <Link
          href="/"
          className="inline-block text-blue-600 hover:underline text-sm"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const levelLabel =
    legislator.level === "NATIONAL"
      ? "국회의원"
      : legislator.level === "PROVINCIAL"
        ? "광역의회 의원"
        : "기초의회 의원";
  const counts = legislator._counts;
  const partyColor = getPartyColor(legislator.party);
  const councilUrl = getCouncilUrl(legislator);

  const attendancePercent =
    counts.votesTotal > 0
      ? ((counts.votesTotal - counts.votesAbsent) / counts.votesTotal) * 100
      : null;

  const isNational = legislator.level === "NATIONAL";

  const tabs: { value: typeof tab; label: string; icon?: React.ReactNode }[] =
    isNational
      ? [
          {
            value: "bills",
            label: "발의 법안",
            icon: <FileText className="w-3.5 h-3.5" />,
          },
          {
            value: "votes",
            label: "표결 이력",
            icon: <VoteIcon className="w-3.5 h-3.5" />,
          },
          {
            value: "controversies",
            label: "주요 뉴스",
            icon: <Newspaper className="w-3.5 h-3.5" />,
          },
          {
            value: "issues",
            label: "논란",
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
          },
        ]
      : [
          {
            value: "controversies",
            label: "주요 뉴스",
            icon: <Newspaper className="w-3.5 h-3.5" />,
          },
          {
            value: "issues",
            label: "논란",
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
          },
        ];

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm transition-colors self-start"
        style={{ color: ON_VARIANT }}
      >
        <ArrowLeft className="w-4 h-4" />
        뒤로가기
      </button>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* ── Left: profile sidebar ───────────────────────── */}
        <aside
          className="md:col-span-4 lg:col-span-3 bg-white rounded-2xl p-5 shadow-sm"
          style={{
            border: `1px solid ${BORDER}`,
            borderLeft: `4px solid ${partyColor.hex}`,
          }}
        >
          <div
            className="aspect-square w-full rounded-xl overflow-hidden mb-4 relative"
            style={{ backgroundColor: SURFACE_CONTAINER }}
          >
            {legislator.photoUrl ? (
              <Image
                src={legislator.photoUrl}
                alt={legislator.name}
                fill
                sizes="(max-width: 768px) 100vw, 25vw"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ color: "#c5c6cf" }}
              >
                <User className="w-20 h-20" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {legislator.party && (
                <span
                  className={`px-2 py-0.5 text-[11px] font-bold rounded ${partyColor.bg} ${partyColor.text}`}
                  style={{ borderLeft: `3px solid ${partyColor.hex}` }}
                >
                  {legislator.party}
                </span>
              )}
              {legislator.electoralDistrictName && (
                <span className="text-xs" style={{ color: ON_VARIANT }}>
                  {legislator.electoralDistrictName}
                </span>
              )}
            </div>
            <h1
              className="text-2xl font-extrabold leading-tight"
              style={{ color: PRIMARY }}
            >
              {legislator.name}{" "}
              <span
                className="text-base font-normal"
                style={{ color: ON_VARIANT }}
              >
                의원
              </span>
            </h1>
            <p className="text-xs leading-relaxed" style={{ color: ON_VARIANT }}>
              {levelLabel}
              {legislator.committee && isNational
                ? ` · ${legislator.committee}`
                : ""}
              {legislator.termCount ? ` · ${legislator.termCount}` : ""}
            </p>
          </div>

          {/* 약력 */}
          {legislator.titleDescription && (
            <>
              <hr
                className="my-4"
                style={{ borderColor: BORDER, borderTopWidth: 1 }}
              />
              <h3
                className="text-xs font-bold mb-2 uppercase tracking-wider"
                style={{ color: ON_VARIANT }}
              >
                주요 약력
              </h3>
              <p
                className="text-xs leading-relaxed whitespace-pre-line"
                style={{ color: PRIMARY }}
              >
                {legislator.titleDescription}
              </p>
            </>
          )}

          {/* 연락 */}
          {(legislator.email ||
            legislator.phoneNumber ||
            legislator.homepage ||
            legislator.birthDate) && (
            <>
              <hr
                className="my-4"
                style={{ borderColor: BORDER, borderTopWidth: 1 }}
              />
              <h3
                className="text-xs font-bold mb-2 uppercase tracking-wider"
                style={{ color: ON_VARIANT }}
              >
                연락·프로필
              </h3>
              <dl className="space-y-1.5 text-xs">
                {legislator.birthDate && (
                  <SidebarRow
                    icon={<CalendarDays className="w-3.5 h-3.5" />}
                    label="출생"
                    value={legislator.birthDate.slice(0, 10)}
                  />
                )}
                {legislator.email && (
                  <SidebarRow
                    icon={<Mail className="w-3.5 h-3.5" />}
                    label="이메일"
                    value={legislator.email}
                    href={`mailto:${legislator.email}`}
                  />
                )}
                {legislator.phoneNumber && (
                  <SidebarRow
                    icon={<Phone className="w-3.5 h-3.5" />}
                    label="전화"
                    value={legislator.phoneNumber}
                  />
                )}
                {legislator.homepage && (
                  <SidebarRow
                    icon={<Globe className="w-3.5 h-3.5" />}
                    label="홈"
                    value="바로가기"
                    href={legislator.homepage}
                  />
                )}
              </dl>
            </>
          )}

          {/* 공직 후보자 공개 정보 (압축) */}
          {legislator.disclosureElectionId && (
            <>
              <hr
                className="my-4"
                style={{ borderColor: BORDER, borderTopWidth: 1 }}
              />
              <h3
                className="text-xs font-bold mb-2 uppercase tracking-wider"
                style={{ color: ON_VARIANT }}
              >
                공직 후보자 공개 정보
              </h3>
              <ul className="grid grid-cols-2 gap-1.5 text-[11px]">
                <DisclosurePill
                  label="전과"
                  value={legislator.hasCriminalRecord ? "신고됨" : "없음"}
                  warn={legislator.hasCriminalRecord}
                  pdfUrl={legislator.criminalRecordPdfUrl}
                />
                <DisclosurePill
                  label="재산"
                  value={
                    legislator.assetTotalManwon != null
                      ? formatManwon(legislator.assetTotalManwon)
                      : legislator.hasAssetDisclosure
                        ? "신고됨"
                        : "없음"
                  }
                  pdfUrl={legislator.assetDisclosurePdfUrl}
                />
                <DisclosurePill
                  label="병역"
                  value={legislator.militaryStatus ?? (legislator.hasMilitaryRecord ? "신고됨" : "—")}
                  pdfUrl={legislator.militaryRecordPdfUrl}
                />
                <DisclosurePill
                  label="납세"
                  value={legislator.hasTaxRecord ? "신고됨" : "없음"}
                  pdfUrl={legislator.taxRecordPdfUrl}
                />
              </ul>
            </>
          )}

          {/* 외부 공식 의회 */}
          {councilUrl && !isNational && (
            <>
              <hr
                className="my-4"
                style={{ borderColor: BORDER, borderTopWidth: 1 }}
              />
              <a
                href={councilUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-[#f3f4f5] transition-colors"
                style={{ border: `1px solid ${BORDER}`, color: PRIMARY }}
              >
                {legislator.councilName
                  ? `${legislator.councilName}에서 보기`
                  : "공식 의회 페이지"}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </>
          )}
        </aside>

        {/* ── Right: main content ─────────────────────────── */}
        <div className="md:col-span-8 lg:col-span-9 space-y-6">
          {/* Stats strip (NATIONAL only — meaningful with vote data) */}
          {isNational && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCell label="대표발의" value={counts.billsPrimary} />
              <StatCell label="공동발의" value={counts.billsCo} />
              <StatCell label="표결 참여" value={counts.votesTotal} />
              <StatCell
                label="출석률"
                value={
                  attendancePercent !== null
                    ? `${attendancePercent.toFixed(1)}%`
                    : "—"
                }
                accent
              />
            </div>
          )}

          {/* 재산 신고 내역 */}
          {legislator.assetTotalManwon != null && (
            <div
              className="bg-white rounded-2xl p-5 shadow-sm"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-base font-bold" style={{ color: PRIMARY }}>
                  재산 신고 내역
                </h2>
                <span className="text-xs" style={{ color: ON_VARIANT }}>
                  {legislator.assetReportYear
                    ? `${legislator.assetReportYear}년 정기공개`
                    : "정기공개"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <AssetCell
                  label="재산 총액"
                  value={legislator.assetTotalManwon}
                  accent
                />
                {legislator.assetRealEstateManwon != null && (
                  <AssetCell
                    label="부동산"
                    value={legislator.assetRealEstateManwon}
                  />
                )}
                {legislator.assetSecuritiesManwon != null && (
                  <AssetCell
                    label="증권"
                    value={legislator.assetSecuritiesManwon}
                  />
                )}
                {legislator.assetCashManwon != null && (
                  <AssetCell label="예금" value={legislator.assetCashManwon} />
                )}
                {legislator.assetDebtManwon != null && (
                  <AssetCell
                    label="채무"
                    value={legislator.assetDebtManwon}
                    debt
                  />
                )}
              </div>
              <div
                className="flex items-center gap-1.5 text-xs mt-4"
                style={{ color: "#75777f" }}
              >
                <span>출처:</span>
                {legislator.assetSourceUrl ? (
                  <a
                    href={legislator.assetSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 hover:underline"
                    style={{ color: SECONDARY }}
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

          {/* Tabs */}
          <div
            className="bg-white rounded-2xl overflow-hidden shadow-sm"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <nav
              className="flex overflow-x-auto"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              {tabs.map((t) => {
                const active = tab === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className="flex-1 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 min-w-max"
                    style={
                      active
                        ? {
                            color: SECONDARY,
                            borderBottom: `2px solid ${SECONDARY}`,
                            marginBottom: -1,
                          }
                        : {
                            color: ON_VARIANT,
                            borderBottom: "2px solid transparent",
                            marginBottom: -1,
                          }
                    }
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
            </nav>

            <div className="p-5">
              {tab === "bills" && isNational ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2
                      className="text-base font-bold"
                      style={{ color: PRIMARY }}
                    >
                      대표 발의 법안{" "}
                      <span style={{ color: SECONDARY }}>
                        {counts.billsPrimary}건
                      </span>
                    </h2>
                    <span
                      className="text-xs italic"
                      style={{ color: ON_VARIANT }}
                    >
                      Source: open.assembly.go.kr
                    </span>
                  </div>
                  <BillsTab legislatorId={id} />
                </div>
              ) : tab === "votes" && isNational ? (
                <VotesTab legislatorId={id} />
              ) : tab === "controversies" ? (
                <ControversiesTab
                  legislatorId={id}
                  filter="general"
                  legislatorName={legislator.name}
                />
              ) : (
                <ControversiesTab
                  legislatorId={id}
                  filter="controversy"
                  legislatorName={legislator.name}
                />
              )}
            </div>
          </div>

          {/* AI summary teaser (NATIONAL with controversies tab feel) */}
          {isNational && (
            <div
              className="rounded-2xl p-5 text-white"
              style={{
                background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-sm font-bold tracking-wide">
                  Gemini AI 종합 안내
                </h3>
              </div>
              <p className="text-xs leading-relaxed opacity-90">
                개별 법안의 AI 핵심 요약은{" "}
                <b>발의 법안</b> 탭의 각 법안 카드에서 "AI 요약 보기"를
                펼쳐 확인할 수 있습니다. 표결 통계·출석률은 좌측 사이드바
                상단에 실시간 집계되어 표시됩니다.
              </p>
            </div>
          )}

          {/* 광역·기초: CLIK 의정활동 */}
          {!isNational && legislator.councilName && (
            <CouncilActivitySection
              councilName={legislator.councilName}
              legislatorName={legislator.name}
              legislatorLevel={legislator.level as "PROVINCIAL" | "BASIC"}
            />
          )}
          {!isNational && !legislator.councilName && (
            <div
              className="bg-white rounded-2xl p-5"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <h2
                className="text-base font-bold mb-2"
                style={{ color: PRIMARY }}
              >
                의정활동 (조례안·회의·출석)
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: ON_VARIANT }}>
                {legislator.level === "PROVINCIAL" ? "광역의원" : "기초의원"}은
                법률안이 아닌 <strong>조례안</strong>을 발의합니다. 의회
                정보가 등록된 후 국회도서관 지방의정포털(CLIK) 데이터가
                표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = href ? (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="truncate"
      style={{ color: SECONDARY }}
    >
      {value}
    </a>
  ) : (
    <span className="truncate" style={{ color: PRIMARY }}>
      {value}
    </span>
  );
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span style={{ color: "#75777f" }}>{icon}</span>
      <span className="shrink-0" style={{ color: ON_VARIANT, minWidth: 32 }}>
        {label}
      </span>
      {content}
    </div>
  );
}

function DisclosurePill({
  label,
  value,
  warn,
  pdfUrl,
}: {
  label: string;
  value: string;
  warn?: boolean;
  pdfUrl?: string | null;
}) {
  return (
    <li
      className="rounded-lg p-2"
      style={{
        backgroundColor: SURFACE_LOW,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
        style={{ color: ON_VARIANT }}
      >
        {label}
      </p>
      <p
        className="text-xs font-semibold truncate"
        style={{ color: warn ? "#dc2626" : PRIMARY }}
      >
        {value}
      </p>
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] mt-0.5"
          style={{ color: SECONDARY }}
        >
          PDF <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
    </li>
  );
}

function AssetCell({
  label,
  value,
  accent,
  debt,
}: {
  label: string;
  value: string;
  accent?: boolean;
  debt?: boolean;
}) {
  const formatted = formatManwon(value);
  return (
    <div
      className="rounded-xl p-3"
      style={{
        border: `1px solid ${BORDER}`,
        backgroundColor: accent ? "#eef1f7" : "#fff",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: ON_VARIANT }}
      >
        {label}
      </p>
      <p
        className="text-sm font-bold tabular-nums leading-tight"
        style={{ color: debt ? "#dc2626" : PRIMARY }}
      >
        {formatted}
      </p>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-4 text-center"
      style={{
        border: `1px solid ${BORDER}`,
        ...(accent
          ? { background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`, color: "#fff" }
          : {}),
      }}
    >
      <p
        className="text-2xl font-extrabold tabular-nums"
        style={accent ? { color: "#fff" } : { color: PRIMARY }}
      >
        {value}
      </p>
      <p
        className="text-[11px] mt-1 font-semibold"
        style={accent ? { color: "#b6c6ef" } : { color: ON_VARIANT }}
      >
        {label}
      </p>
    </div>
  );
}

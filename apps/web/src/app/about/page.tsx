"use client";

import Link from "next/link";
import {
  Landmark,
  Building2,
  Home as HomeIcon,
  CheckCircle2,
  Network,
  Repeat,
  MapPin,
  ArrowRight,
  Vote,
  Sparkles,
} from "lucide-react";

const PRIMARY = "#031635";
const SECONDARY = "#206298";
const BORDER = "#e5e7eb";
const SURFACE_LOW = "#f3f4f5";
const ON_VARIANT = "#44474e";

interface Role {
  key: "national" | "provincial" | "basic";
  title: string;
  english: string;
  desc: string;
  responsibilities: string[];
  icon: React.ReactNode;
  iconColor: string;
  tagBg: string;
  tagText: string;
}

const ROLES: Role[] = [
  {
    key: "national",
    title: "국회의원",
    english: "National Assembly",
    desc: "국가의 법률을 제정하고 정부의 예산을 심의하며, 외교·안보 정책에 관여합니다. 중앙정부의 운영을 감사하고 견제합니다.",
    responsibilities: [
      "국가 법률 제정",
      "정부 예산 심의",
      "국정 감사 실시",
      "외교·통일 정책",
    ],
    icon: <Landmark className="w-8 h-8" />,
    iconColor: PRIMARY,
    tagBg: "#eef1f7",
    tagText: PRIMARY,
  },
  {
    key: "provincial",
    title: "광역의원",
    english: "Provincial Council",
    desc: "시·도 단위의 조례를 제정하고 광역 예산을 관리합니다. 시·도지사의 행정을 감시하며 지역 균형 발전을 꾀합니다.",
    responsibilities: [
      "시·도 조례 제정",
      "광역 예산 편성",
      "시·도정 질의",
      "행정사무 감사",
    ],
    icon: <Building2 className="w-8 h-8" />,
    iconColor: SECONDARY,
    tagBg: "#d0e4ff",
    tagText: "#005084",
  },
  {
    key: "basic",
    title: "기초의원",
    english: "Local Council",
    desc: "구·시·군 단위의 생활 밀착형 조례를 만듭니다. 쓰레기 처리, 동네 공원, 도로 보수 등 우리 삶에 가장 가까운 예산을 다룹니다.",
    responsibilities: [
      "동네 조례 제정",
      "구·군 예산 확정",
      "민원 현장 점검",
      "5분 자유발언",
    ],
    icon: <HomeIcon className="w-8 h-8" />,
    iconColor: "#b89766",
    tagBg: "#fef3c7",
    tagText: "#7d5a1a",
  },
];

interface Case {
  badge: string;
  badgeBg: string;
  badgeText: string;
  title: string;
  body: string;
  solution?: string;
  quote?: string;
  span: number;
}

const CASES: Case[] = [
  {
    badge: "광역·기초의원 사례",
    badgeBg: "#eef1f7",
    badgeText: PRIMARY,
    title: "동네 교차로가 너무 위험하다면?",
    body: "출퇴근길 신호등 체계가 이상하고 사고가 잦다고 느낄 때, 당신의 목소리를 듣고 구청·시청에 예산 집행을 요구할 수 있는 사람이 바로 기초·광역의원입니다.",
    solution: "해결: 생활 밀착형 조례 제정 + 교통 안전 예산 편성",
    span: 2,
  },
  {
    badge: "국회의원 사례",
    badgeBg: "#fef3c7",
    badgeText: "#7d5a1a",
    title: "전국 공통 육아 수당 확대",
    body: "대한민국 어디에 살아도 똑같은 혜택을 받게 하는 건 국회에서 통과되는 법률과 국가 예산의 힘입니다.",
    quote: "전국 아동수당 지급 대상 확대 법안 통과",
    span: 1,
  },
];

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section
        className="rounded-2xl text-white p-8 sm:p-10 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, #1a2b4b 100%)`,
        }}
      >
        <div className="absolute -right-6 -bottom-6 opacity-10">
          <Vote className="w-48 h-48" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <p className="text-xs font-bold tracking-widest uppercase opacity-70 mb-2">
            Meaning of My Vote
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight mb-4">
            내 한 표가
            <br />
            어디로 가는가
          </h1>
          <p className="text-base sm:text-lg opacity-90 leading-relaxed">
            우리의 한 표는 사람을 뽑는 것을 넘어, 동네 공원부터 국가의 외교
            정책까지 결정합니다. 선출직 의원들의 구체적인 역할과 책임을 한
            화면에서 확인하세요.
          </p>
        </div>
      </section>

      {/* 의원의 역할과 책임 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span
            className="w-1 h-6 rounded-full"
            style={{ backgroundColor: PRIMARY }}
          />
          <h2
            className="text-xl sm:text-2xl font-bold"
            style={{ color: PRIMARY }}
          >
            의원의 역할과 책임
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ROLES.map((r) => (
            <div
              key={r.key}
              className="bg-white rounded-2xl p-5 flex flex-col hover:shadow-lg transition-shadow"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div className="mb-3" style={{ color: r.iconColor }}>
                {r.icon}
              </div>
              <h3 className="text-lg font-bold mb-1" style={{ color: PRIMARY }}>
                {r.title}{" "}
                <span
                  className="text-xs font-normal"
                  style={{ color: ON_VARIANT }}
                >
                  ({r.english})
                </span>
              </h3>
              <p
                className="text-sm leading-relaxed mb-4 flex-1"
                style={{ color: ON_VARIANT }}
              >
                {r.desc}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {r.responsibilities.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-bold px-2 py-1 rounded"
                    style={{ backgroundColor: r.tagBg, color: r.tagText }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 사례로 보는 정치의 영향 */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span
            className="w-1 h-6 rounded-full"
            style={{ backgroundColor: PRIMARY }}
          />
          <h2
            className="text-xl sm:text-2xl font-bold"
            style={{ color: PRIMARY }}
          >
            사례로 보는 정치의 영향
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {CASES.map((c) => (
            <div
              key={c.title}
              className={`bg-white rounded-2xl overflow-hidden flex flex-col ${
                c.span === 2 ? "lg:col-span-2" : ""
              }`}
              style={{ border: `1px solid ${BORDER}` }}
            >
              <div className="p-5 flex-1 flex flex-col">
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full mb-3 self-start"
                  style={{ backgroundColor: c.badgeBg, color: c.badgeText }}
                >
                  {c.badge}
                </span>
                <h3
                  className="text-base sm:text-lg font-bold mb-2"
                  style={{ color: PRIMARY }}
                >
                  {c.title}
                </h3>
                <p
                  className="text-sm leading-relaxed mb-4 flex-1"
                  style={{ color: ON_VARIANT }}
                >
                  {c.body}
                </p>
                {c.solution && (
                  <div
                    className="inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: SECONDARY }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {c.solution}
                  </div>
                )}
                {c.quote && (
                  <div
                    className="text-xs italic p-3 rounded-lg"
                    style={{ backgroundColor: SURFACE_LOW, color: ON_VARIANT }}
                  >
                    “{c.quote}”
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 우리 동네 권력 지도 */}
      <section
        className="bg-white rounded-2xl p-6 sm:p-8"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold mb-2"
              style={{ color: PRIMARY }}
            >
              우리 동네 권력 지도
            </h2>
            <p
              className="text-sm leading-relaxed mb-5"
              style={{ color: ON_VARIANT }}
            >
              내 지역 의원들이 서로 어떻게 협력해서 예산을 집행하는지, 국가
              법률이 우리 조례에 어떻게 흘러내려오는지 한 화면에서 확인할 수
              있도록 준비 중입니다.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-full text-white shrink-0"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <h5
                    className="text-sm font-bold mb-0.5"
                    style={{ color: PRIMARY }}
                  >
                    수직적 예산 흐름
                  </h5>
                  <p className="text-xs" style={{ color: ON_VARIANT }}>
                    국가 예산이 광역을 거쳐 기초 지자체로 배분되는 과정을
                    추적합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-full text-white shrink-0"
                  style={{ backgroundColor: SECONDARY }}
                >
                  <Repeat className="w-4 h-4" />
                </div>
                <div>
                  <h5
                    className="text-sm font-bold mb-0.5"
                    style={{ color: PRIMARY }}
                  >
                    입법 상호작용
                  </h5>
                  <p className="text-xs" style={{ color: ON_VARIANT }}>
                    상위 법령과 지역 조례가 충돌하거나 상호 보완하는 지점을
                    보여줍니다.
                  </p>
                </div>
              </div>
            </div>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ border: `1px solid ${PRIMARY}`, color: PRIMARY }}
            >
              <MapPin className="w-4 h-4" /> 내 지역구 설정하기
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div
            className="aspect-video rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
            }}
          >
            <Sparkles className="absolute top-4 right-4 w-8 h-8 text-white opacity-20" />
            <Network className="absolute bottom-4 left-4 w-10 h-10 text-white opacity-15" />
            <div
              className="bg-white/95 backdrop-blur-sm px-5 py-4 rounded-xl flex flex-col items-center shadow-xl"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <MapPin className="w-6 h-6 mb-2" style={{ color: PRIMARY }} />
              <p className="text-sm font-bold" style={{ color: PRIMARY }}>
                준비 중인 기능
              </p>
              <p className="text-xs mt-1" style={{ color: ON_VARIANT }}>
                내 지역구 권력 지도
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 지방선거 안내 */}
      <section
        className="rounded-2xl p-6 sm:p-8 text-white"
        style={{
          background: `linear-gradient(135deg, ${PRIMARY}, #1a2b4b)`,
        }}
      >
        <p className="text-xs font-bold tracking-widest uppercase opacity-70 mb-1">
          2026.6.3 제9회 전국동시지방선거
        </p>
        <h2 className="text-xl sm:text-2xl font-extrabold mb-3">
          지방선거에서 무엇을 뽑나요?
        </h2>
        <p className="text-sm opacity-90 leading-relaxed mb-5 max-w-3xl">
          지방선거에서는 시·도지사, 시장·군수·구청장, 광역의원, 기초의원,
          교육감을 한 번에 뽑습니다. 국회의원은 별도의 총선에서 뽑습니다 —
          헷갈리지 마세요.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "시·도지사", desc: "17개 광역단체장" },
            { label: "시장·군수·구청장", desc: "기초단체장" },
            { label: "광역·기초의원", desc: "지방의회 의원" },
            { label: "교육감", desc: "시·도 교육 책임자" },
          ].map((row) => (
            <div
              key={row.label}
              className="p-3 rounded-lg bg-white/10 backdrop-blur-sm"
            >
              <p className="text-sm font-bold">{row.label}</p>
              <p className="text-xs opacity-80 mt-0.5">{row.desc}</p>
            </div>
          ))}
        </div>
        <Link
          href="/candidates"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold underline opacity-90 hover:opacity-100"
        >
          후보 보러가기 <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>
    </div>
  );
}

import Link from "next/link";
import {
  Landmark,
  Users,
  Vote,
  Building2,
  Calendar,
  Award,
  ShieldCheck,
  Banknote,
  Scale,
  ChevronRight,
  Info,
  MapPin,
  BookOpen,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InfoItem {
  label: string;
  value: string;
}

interface RoleCard {
  accentClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
  title: string;
  icon: React.ElementType;
  sections: {
    heading: string;
    icon: React.ElementType;
    items: string[];
  }[];
  meta: InfoItem[];
}

// ─── Data ────────────────────────────────────────────────────────────────────

const ROLE_CARDS: RoleCard[] = [
  {
    accentClass: "bg-blue-700",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    textClass: "text-blue-700",
    badgeClass: "bg-blue-100 text-blue-800",
    title: "국회의원",
    icon: Landmark,
    sections: [
      {
        heading: "하는 일",
        icon: BookOpen,
        items: [
          "법률 제정 — 법안 발의·심의·표결",
          "정부 예산 심의·확정",
          "국정감사·국정조사",
          "인사청문회 (장관·대법관 등)",
          "외교·통상 조약 비준",
        ],
      },
      {
        heading: "권한",
        icon: ShieldCheck,
        items: [
          "입법권 — 모든 법률은 국회를 거쳐야 함",
          "예산 심의권 — 정부 제출 예산 수정 가능",
          "면책특권 — 직무상 발언·표결 책임 면제",
          "불체포특권 — 회기 중 체포 시 국회 동의 필요",
        ],
      },
      {
        heading: "대우·혜택",
        icon: Banknote,
        items: [
          "의원 세비 월 약 1,300만원 (연 ~1.5억원)",
          "보좌진 9명 + 의원회관 사무실",
          "정책개발비·차량유지비·출장비",
          "보좌관·비서관 채용권",
        ],
      },
    ],
    meta: [
      { label: "임기", value: "4년" },
      { label: "인원", value: "300명 (지역구 254 + 비례 46)" },
      { label: "현 의회", value: "22대 (2024.05.30 ~ 2028.05.29)" },
      { label: "선거", value: "총선 — 4년마다 / 만 18세 이상 투표" },
    ],
  },
  {
    accentClass: "bg-indigo-700",
    bgClass: "bg-indigo-50",
    borderClass: "border-indigo-200",
    textClass: "text-indigo-700",
    badgeClass: "bg-indigo-100 text-indigo-800",
    title: "광역의원",
    icon: MapPin,
    sections: [
      {
        heading: "하는 일",
        icon: BookOpen,
        items: [
          "광역자치단체(시·도) 조례 제정·개정·폐지",
          "광역 예산 심의·확정",
          "시·도 행정사무 감사",
          "도지사·시장 견제",
        ],
      },
      {
        heading: "권한",
        icon: ShieldCheck,
        items: [
          "조례 입법권 — 광역 단위 법규 제·개정",
          "광역단체장 시정질문·해임건의",
          "예산 심의권 — 광역 예산은 수십조원 규모",
        ],
      },
      {
        heading: "대우·혜택",
        icon: Banknote,
        items: [
          "의정활동비 월 약 400~500만원 (광역마다 상이)",
          "보좌관 1~2명",
          "의정활동 지원비",
        ],
      },
    ],
    meta: [
      { label: "임기", value: "4년" },
      { label: "인원", value: "872명 (지역구 779 + 비례 93)" },
      { label: "현 의회", value: "제11대 (2022.07.01 ~ 2026.06.30)" },
      { label: "선거", value: "지방선거 — 4년마다 / 제9회 2026.06.03" },
      { label: "예시", value: "서울특별시의회·경기도의회·부산광역시의회 등 17개" },
    ],
  },
  {
    accentClass: "bg-teal-700",
    bgClass: "bg-teal-50",
    borderClass: "border-teal-200",
    textClass: "text-teal-700",
    badgeClass: "bg-teal-100 text-teal-800",
    title: "기초의원",
    icon: Building2,
    sections: [
      {
        heading: "하는 일",
        icon: BookOpen,
        items: [
          "기초자치단체(시·군·구) 조례 제정",
          "기초 예산 심의",
          "시장·군수·구청장 견제",
          "지역 민원 처리",
        ],
      },
      {
        heading: "권한",
        icon: ShieldCheck,
        items: [
          "기초 단위 조례 입법권",
          "기초단체장 시정질문",
          "예산 심의권 — 기초 예산 수천억원 규모",
        ],
      },
      {
        heading: "대우·혜택",
        icon: Banknote,
        items: [
          "의정활동비 월 약 300~400만원",
          "일부 지역 의원실 제공",
        ],
      },
    ],
    meta: [
      { label: "임기", value: "4년" },
      { label: "인원", value: "약 2,987명 (지역구 2,601 + 비례 386)" },
      { label: "현 의회", value: "제9대 (2022.07.01 ~ 2026.06.30)" },
      { label: "예시", value: "강남구의회·안양시의회·영월군의회 등 226개" },
    ],
  },
];

const ELECTION_PICKS = [
  { no: 1, title: "시·도지사", count: "17명", note: "광역단체장", color: "text-blue-700" },
  { no: 2, title: "시장·군수·구청장", count: "226명", note: "기초단체장", color: "text-indigo-700" },
  { no: 3, title: "광역의원", count: "872명", note: "지역구 + 비례", color: "text-violet-700" },
  { no: 4, title: "기초의원", count: "~3,000명", note: "지역구 + 비례", color: "text-teal-700" },
  { no: 5, title: "교육감", count: "17명", note: "광역 교육 수장", color: "text-amber-700" },
  { no: 6, title: "교육의원", count: "제주만 해당", note: "제주특별자치도", color: "text-rose-600" },
];

const TOC_ITEMS = [
  { href: "#overview", label: "구조 한눈에 보기" },
  { href: "#national", label: "국회의원" },
  { href: "#provincial", label: "광역의원" },
  { href: "#basic", label: "기초의원" },
  { href: "#election", label: "지방선거" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionAnchor({ id, label }: { id: string; label: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-8 pt-2">
      <h2 className="text-2xl font-bold text-slate-900 leading-tight">{label}</h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function MetaBadge({ label, value }: InfoItem) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-700 font-medium leading-snug">{value}</span>
    </div>
  );
}

function RoleSection({ card }: { card: RoleCard }) {
  const Icon = card.icon;
  return (
    <div className={`rounded-2xl border ${card.borderClass} overflow-hidden`}>
      {/* Header */}
      <div className={`${card.bgClass} px-6 py-5 flex items-center gap-3`}>
        <div className={`w-10 h-10 rounded-xl ${card.accentClass} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className={`text-xl font-bold ${card.textClass}`}>{card.title}</h3>
      </div>

      {/* Body */}
      <div className="bg-white px-6 py-5 flex flex-col gap-6">
        {/* Info sections grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {card.sections.map((sec) => {
            const SIcon = sec.icon;
            return (
              <div key={sec.heading} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <SIcon className={`w-4 h-4 ${card.textClass}`} />
                  <span className="text-sm font-semibold text-slate-700">{sec.heading}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {sec.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${card.accentClass} shrink-0`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Meta strip */}
        <div className={`rounded-xl ${card.bgClass} border ${card.borderClass} px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`}>
          {card.meta.map((m) => (
            <MetaBadge key={m.label} {...m} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-16">

      {/* ── Hero ── */}
      <section className="pt-4 sm:pt-8">
        <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
          열린의회 · 시민 교육
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
          한국 정치 구조 알아보기
        </h1>
        <p className="text-slate-500 text-base sm:text-lg leading-relaxed max-w-2xl">
          내가 누구를 뽑는지, 그 사람이 무엇을 하는지 알아야 의미 있는 한 표가 됩니다.
          국회의원부터 기초의원까지, 각 직책의 역할과 권한을 정리했습니다.
        </p>

        {/* Why it matters box */}
        <div className="mt-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 max-w-2xl">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>왜 알아야 하나요?</strong> 다음 지방선거(2026.6.3)에서 유권자 한 명이
            최대 <strong>7장의 투표용지</strong>를 받습니다. 각 직책이 무엇을 하는지 알아야
            제대로 판단할 수 있습니다.
          </p>
        </div>
      </section>

      {/* ── TOC (mobile — inline, desktop — layout guide only, sticky handled by layout) ── */}
      <div className="lg:hidden">
        <nav className="flex flex-wrap gap-2" aria-label="목차">
          {TOC_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      {/* ── Two-column layout: sticky TOC on desktop ── */}
      <div className="flex gap-10 items-start">

        {/* Sticky TOC — desktop only */}
        <aside className="hidden lg:block w-44 shrink-0 sticky top-20 self-start">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">목차</p>
          <nav className="flex flex-col gap-1" aria-label="페이지 목차">
            {TOC_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-slate-500 hover:text-blue-700 py-1 pl-3 border-l-2 border-transparent hover:border-blue-500 transition-all leading-snug"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-16">

          {/* ── Section 1: Overview ── */}
          <section id="overview">
            <SectionAnchor id="overview-anchor" label="한국 정치 구조 한눈에" />

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                <p className="text-sm font-semibold text-slate-600">중앙 ↔ 지방 권력 구조</p>
              </div>

              {/* Structure table */}
              <div className="px-6 py-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">단위</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">기관</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">직책</th>
                      <th className="text-left py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-blue-700">중앙정부</td>
                      <td className="py-3 pr-4 text-slate-600">국회 (입법)</td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">국회의원</span>
                      </td>
                      <td className="py-3 text-slate-500">300명 · 임기 4년</td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-indigo-700" rowSpan={2}>광역 지방</td>
                      <td className="py-3 pr-4 text-slate-600">17개 시·도</td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold">광역의원</span>
                      </td>
                      <td className="py-3 text-slate-500">872명 · 임기 4년</td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-slate-600">17개 시·도</td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-xs font-semibold">시·도지사</span>
                      </td>
                      <td className="py-3 text-slate-500">17명 · 임기 4년</td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-teal-700" rowSpan={2}>기초 지방</td>
                      <td className="py-3 pr-4 text-slate-600">226개 시·군·구</td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-semibold">기초의원</span>
                      </td>
                      <td className="py-3 text-slate-500">~2,987명 · 임기 4년</td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-slate-600">226개 시·군·구</td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">시장·군수·구청장</span>
                      </td>
                      <td className="py-3 text-slate-500">226명 · 임기 4년</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-100 px-6 py-3 bg-slate-50">
                <p className="text-xs text-slate-400">출처: 중앙선거관리위원회 · 행정안전부 · 대한민국헌법</p>
              </div>
            </div>
          </section>

          {/* ── Section 2: 국회의원 ── */}
          <section id="national">
            <SectionAnchor id="national-anchor" label="국회의원 (國會議員)" />
            <p className="text-slate-500 text-sm leading-relaxed mb-6 -mt-4">
              전국 단위로 뽑히는 입법부 구성원. 국가 전체에 적용되는 법률을 만들고,
              정부가 요청한 예산을 심의·확정하는 핵심 역할을 합니다.
            </p>
            <RoleSection card={ROLE_CARDS[0]} />
          </section>

          {/* ── Section 3: 광역의원 ── */}
          <section id="provincial">
            <SectionAnchor id="provincial-anchor" label="광역의원 (廣域議員)" />
            <p className="text-slate-500 text-sm leading-relaxed mb-6 -mt-4">
              서울·경기·부산 등 17개 시·도 단위에서 뽑히는 지방 입법자.
              해당 광역자치단체에만 적용되는 조례를 만들고, 수십조원대 광역 예산을 심의합니다.
            </p>
            <RoleSection card={ROLE_CARDS[1]} />
          </section>

          {/* ── Section 4: 기초의원 ── */}
          <section id="basic">
            <SectionAnchor id="basic-anchor" label="기초의원 (基礎議員)" />
            <p className="text-slate-500 text-sm leading-relaxed mb-6 -mt-4">
              구·시·군 단위에서 뽑히는 가장 생활 밀착형 의원.
              동네 도로, 공원, 복지관 등 일상과 직결된 조례와 예산을 다룹니다.
            </p>
            <RoleSection card={ROLE_CARDS[2]} />
          </section>

          {/* ── Section 5: 지방선거 ── */}
          <section id="election">
            <SectionAnchor id="election-anchor" label="지방선거 (地方選擧)" />
            <p className="text-slate-500 text-sm leading-relaxed mb-6 -mt-4">
              4년마다 전국에서 동시에 치러지는 지방선거. 단 하루에 지역 정치 전체를 결정합니다.
            </p>

            {/* Next election banner */}
            <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">다음 지방선거</p>
                <p className="text-xl font-bold text-amber-900">제9회 전국동시지방선거</p>
                <p className="text-base font-semibold text-amber-700 mt-0.5">2026년 6월 3일 (수)</p>
              </div>
              <div className="flex flex-col gap-1 text-sm text-amber-700">
                <span>임기 시작: 2026년 7월 1일</span>
                <span>사전투표: 5월 29~30일 (예정)</span>
              </div>
            </div>

            {/* What you vote for */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                <Vote className="w-4 h-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-700">한 번에 뽑는 직책 — 최대 6장 투표용지</p>
              </div>
              <div className="divide-y divide-slate-50">
                {ELECTION_PICKS.map((pick) => (
                  <div key={pick.no} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {pick.no}
                    </span>
                    <div className="flex-1">
                      <span className={`font-semibold ${pick.color}`}>{pick.title}</span>
                      <span className="ml-2 text-sm text-slate-400">{pick.note}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-500 tabular-nums">{pick.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How to vote */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { icon: Users, title: "투표 자격", body: "만 18세 이상 대한민국 국민" },
                { icon: Calendar, title: "투표 방법", body: "사전투표(2일) + 본투표(당일)" },
                { icon: Award, title: "선거 주기", body: "4년마다 전국 동시 실시" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-0.5">{item.title}</p>
                      <p className="text-sm text-slate-500 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── CTA ── */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-lg font-semibold text-slate-800">현재 선출된 의원 확인하기</h2>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  href: "/?tab=national",
                  icon: Landmark,
                  color: "bg-blue-100 text-blue-700",
                  title: "국회의원 조회",
                  desc: "내 지역구 의원 발의 법안·표결 이력",
                },
                {
                  href: "/?tab=provincial",
                  icon: MapPin,
                  color: "bg-indigo-100 text-indigo-700",
                  title: "광역의원 조회",
                  desc: "시·도별 광역의회 의원 현황",
                },
                {
                  href: "/?tab=basic",
                  icon: Building2,
                  color: "bg-teal-100 text-teal-700",
                  title: "기초의원 조회",
                  desc: "시·군·구의회 의원 약 3,000명",
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${card.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{card.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{card.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── Source note ── */}
          <div className="flex items-start gap-2 py-4 border-t border-slate-100">
            <Scale className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              출처: 중앙선거관리위원회 · 행정안전부 · 대한민국헌법 · 지방자치법 · 공직선거법
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

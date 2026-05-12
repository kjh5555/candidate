import Link from "next/link";
import { getLegislators } from "@/lib/api";
import { LegislatorCard } from "@/components/LegislatorCard";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft } from "lucide-react";
import type { LegislatorSummaryDTO } from "@repo/shared";

export const dynamic = "force-dynamic";

interface BasicPageProps {
  searchParams: Promise<{ region?: string | string[]; wiwName?: string | string[] }>;
}

function pickParam(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  return raw.trim() || null;
}

async function fetchBasic(wiwName: string): Promise<LegislatorSummaryDTO[]> {
  try {
    // For BASIC legislators, Legislator.region stores wiwName (시·군·구).
    const res = await getLegislators({ level: "BASIC", region: wiwName });
    return res.legislators;
  } catch {
    return [];
  }
}

export default async function BasicPage({ searchParams }: BasicPageProps) {
  const params = await searchParams;
  // `region` = 시·도 (sido), `wiwName` = 시·군·구
  const sido = pickParam(params.region);
  const wiwName = pickParam(params.wiwName);

  const pageTitle = wiwName
    ? `${wiwName} 기초의회 의원`
    : sido
      ? `${sido} 기초의회 의원`
      : "기초의회 의원";

  return (
    <div className="flex flex-col gap-8">
      {/* Page hero */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          홈으로
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">{pageTitle}</h1>
        {wiwName && (
          <p className="text-slate-500 text-sm mt-1.5">
            제8회 지방선거 당선자 (제9대) · 임기 2022.07.01 ~ 2026.06.30
          </p>
        )}
        {!wiwName && (
          <p className="text-slate-500 text-sm mt-1.5">
            시·군·구의회 의원 약 3,000명
          </p>
        )}
      </div>

      {!wiwName ? (
        <EmptyState
          message="조회할 시·군·구가 지정되지 않았습니다."
          description="홈에서 기초의회 의원 탭을 통해 시·도와 시·군·구를 선택해 주세요."
        />
      ) : (
        <BasicList wiwName={wiwName} />
      )}
    </div>
  );
}

async function BasicList({ wiwName }: { wiwName: string }) {
  const legislators = await fetchBasic(wiwName);
  if (legislators.length === 0) {
    return (
      <EmptyState
        message="해당 시·군·구의 기초의회 의원 정보가 없습니다."
        description="데이터 수집이 아직 진행되지 않았을 수 있습니다."
      />
    );
  }
  return (
    <>
      <p className="text-slate-500 text-sm -mt-4">
        총 <span className="font-semibold text-slate-700">{legislators.length}</span>명
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {legislators.map((l) => (
          <LegislatorCard key={l.id} legislator={l} />
        ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { getLegislators } from "@/lib/api";
import { LegislatorCard } from "@/components/LegislatorCard";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft } from "lucide-react";
import type { LegislatorSummaryDTO } from "@repo/shared";

export const dynamic = "force-dynamic";

interface ProvincialPageProps {
  searchParams: Promise<{ region?: string | string[] }>;
}

function pickRegion(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  return raw.trim() || null;
}

async function fetchProvincial(region: string): Promise<LegislatorSummaryDTO[]> {
  try {
    const res = await getLegislators({ level: "PROVINCIAL", region });
    return res.legislators;
  } catch {
    return [];
  }
}

export default async function ProvincialPage({
  searchParams,
}: ProvincialPageProps) {
  const params = await searchParams;
  const region = pickRegion(params.region);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          처음으로
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">
          {region ? `${region} 광역의회 의원` : "광역의회 의원"}
        </h1>
        {region && (
          <p className="text-slate-500 text-sm mt-1">
            제8회 지방선거 당선자 (제11대) — 임기 2022.07.01 ~ 2026.06.30
          </p>
        )}
      </div>

      {!region ? (
        <EmptyState
          message="조회할 시·도가 지정되지 않았습니다."
          description="홈에서 광역의회 의원 탭을 통해 시·도를 선택해 주세요."
        />
      ) : (
        <ProvincialList region={region} />
      )}
    </div>
  );
}

async function ProvincialList({ region }: { region: string }) {
  const legislators = await fetchProvincial(region);
  if (legislators.length === 0) {
    return (
      <EmptyState
        message="해당 시·도의 광역의회 의원 정보가 없습니다."
        description="데이터 수집이 아직 진행되지 않았을 수 있습니다."
      />
    );
  }
  return (
    <>
      <p className="text-slate-500 text-sm mb-4">총 {legislators.length}명</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {legislators.map((l) => (
          <LegislatorCard key={l.id} legislator={l} />
        ))}
      </div>
    </>
  );
}

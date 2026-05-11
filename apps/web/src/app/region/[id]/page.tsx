import Link from "next/link";
import { getLegislators } from "@/lib/api";
import { LegislatorCard } from "@/components/LegislatorCard";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft } from "lucide-react";
import type { LegislatorSummaryDTO } from "@repo/shared";

export const dynamic = "force-dynamic";

interface RegionPageProps {
  params: Promise<{ id: string }>;
}

async function fetchLegislators(id: string): Promise<LegislatorSummaryDTO[]> {
  try {
    const national = await getLegislators({ nationalDistrictId: id });
    if (national.legislators.length > 0) return national.legislators;
  } catch {
    // fall through
  }
  try {
    const provincial = await getLegislators({ provincialDistrictId: id });
    return provincial.legislators;
  } catch {
    return [];
  }
}

export default async function RegionPage({ params }: RegionPageProps) {
  const { id } = await params;
  const legislators = await fetchLegislators(id);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          주소 다시 입력
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">지역구 의원 목록</h1>
        <p className="text-slate-500 text-sm mt-1">총 {legislators.length}명</p>
      </div>

      {legislators.length === 0 ? (
        <EmptyState
          message="해당 지역구 의원을 찾을 수 없습니다."
          description="주소를 다시 확인하거나 다른 주소로 검색해보세요."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {legislators.map((legislator) => (
            <LegislatorCard key={legislator.id} legislator={legislator} />
          ))}
        </div>
      )}
    </div>
  );
}

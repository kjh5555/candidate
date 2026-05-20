import Link from "next/link";
import { getMinutesDetail } from "@/lib/api";
import { MinutesViewer } from "./_components/MinutesViewer";
import { ArrowLeft, ExternalLink, Calendar, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface MinutesPageProps {
  params: Promise<{ docId: string }>;
}

export default async function MinutesPage({ params }: MinutesPageProps) {
  const { docId } = await params;

  let detail;
  try {
    detail = await getMinutesDetail(docId);
  } catch {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">회의록을 불러오지 못했습니다.</p>
        <Link
          href="/"
          className="inline-block text-blue-600 hover:underline text-sm"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const cleanMtgNm = (detail.mtgNm ?? "회의록")
    .replace(/\n/g, " ")
    .replace(/\s*\[임시\]\s*/g, "")
    .trim();
  const isTemp = (detail.mtgNm ?? "").includes("[임시]");

  return (
    <div className="flex flex-col gap-6">
      {/* Back */}
      <Link
        href="javascript:history.back()"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors self-start"
      >
        <ArrowLeft className="w-4 h-4" />
        뒤로가기
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #e5e7eb" }}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "#eef1f7", color: "#031635" }}
          >
            <Building2 className="w-3 h-3" />
            {detail.rasmblyNm}
          </span>
          {detail.sesn && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#d0e4ff", color: "#005084" }}
            >
              제{detail.sesn}회
            </span>
          )}
          {detail.numpr && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#edeeef", color: "#44474e" }}
            >
              제{detail.numpr}차
            </span>
          )}
          {isTemp && (
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#ffe7c2", color: "#7d2c1c" }}
            >
              임시
            </span>
          )}
        </div>
        <h1
          className="text-2xl sm:text-3xl font-extrabold mb-3 leading-tight"
          style={{ color: "#031635" }}
        >
          {cleanMtgNm}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {detail.mtgDe && (
            <span className="inline-flex items-center gap-1.5" style={{ color: "#44474e" }}>
              <Calendar className="w-4 h-4" />
              {detail.mtgDe}
            </span>
          )}
          {detail.viewUrl && (
            <a
              href={detail.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: "#206298" }}
            >
              CLIK 원본 보기
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Body — 클라이언트 컴포넌트에서 fetch/analyze 처리 */}
      <MinutesViewer initial={detail} />
    </div>
  );
}

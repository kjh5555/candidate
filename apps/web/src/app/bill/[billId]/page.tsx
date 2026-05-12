import Link from "next/link";
import Image from "next/image";
import { getBillDetail } from "@/lib/api";
import { BillResultBadge } from "@/components/BillResultBadge";
import { PartyBadge } from "@/components/PartyBadge";
import { ArrowLeft, User, ExternalLink } from "lucide-react";
import type { ProposerDTO } from "@repo/shared";

export const dynamic = "force-dynamic";

interface BillPageProps {
  params: Promise<{ billId: string }>;
}

const ROLE_LABELS = { PRIMARY: "대표발의", CO: "공동발의" };

function VoteBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-8 text-slate-500 text-right text-xs font-medium">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 text-slate-700 text-xs font-medium tabular-nums">
        {count}명 ({pct}%)
      </span>
    </div>
  );
}

function ProposerCard({ proposer }: { proposer: ProposerDTO }) {
  return (
    <Link href={`/legislator/${proposer.legislatorId}`}>
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
          {proposer.photoUrl ? (
            <Image
              src={proposer.photoUrl}
              alt={proposer.name}
              width={40}
              height={40}
              className="object-cover w-full h-full"
            />
          ) : (
            <User className="w-5 h-5 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800 text-sm truncate">{proposer.name}</p>
          <PartyBadge party={proposer.party} />
        </div>
        <span className="text-xs text-slate-400 shrink-0">{ROLE_LABELS[proposer.role]}</span>
      </div>
    </Link>
  );
}

export default async function BillPage({ params }: BillPageProps) {
  const { billId } = await params;

  let bill;
  try {
    bill = await getBillDetail(billId);
  } catch {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">법안 정보를 불러오지 못했습니다.</p>
        <Link href="/" className="inline-block text-blue-600 hover:underline text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const primary = bill.proposers.filter((p) => p.role === "PRIMARY");
  const co = bill.proposers.filter((p) => p.role === "CO");
  const vs = bill.votesSummary;

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

      {/* Bill header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
            {bill.billNo}
          </span>
          {bill.assemblyAge && (
            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              제{bill.assemblyAge}대
            </span>
          )}
          <BillResultBadge result={bill.result} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-4 leading-snug">{bill.name}</h1>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
          {bill.committee && (
            <>
              <dt className="text-slate-500">위원회</dt>
              <dd className="text-slate-700">{bill.committee}</dd>
            </>
          )}
          {bill.proposedDate && (
            <>
              <dt className="text-slate-500">발의일</dt>
              <dd className="text-slate-700">{bill.proposedDate.slice(0, 10)}</dd>
            </>
          )}
        </dl>
        {bill.linkUrl && (
          <a
            href={bill.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            의안 원문 보기
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Proposers */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">발의자</h2>
        {primary.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">대표발의자</p>
            <div className="flex flex-col gap-2">
              {primary.map((p) => (
                <ProposerCard key={p.legislatorId} proposer={p} />
              ))}
            </div>
          </div>
        )}
        {co.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              공동발의자 ({co.length}명)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {co.map((p) => (
                <ProposerCard key={p.legislatorId} proposer={p} />
              ))}
            </div>
          </div>
        )}
        {bill.proposers.length === 0 && (
          <p className="text-sm text-slate-400">발의자 정보가 없습니다.</p>
        )}
      </div>

      {/* Vote results */}
      {vs.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-baseline gap-2 mb-5">
            <h2 className="text-xl font-semibold text-slate-900">표결 결과</h2>
            <span className="text-sm text-slate-400">총 {vs.total}표</span>
          </div>
          <div className="flex flex-col gap-3">
            <VoteBar label="찬성" count={vs.yes} total={vs.total} color="bg-emerald-500" />
            <VoteBar label="반대" count={vs.no} total={vs.total} color="bg-red-400" />
            <VoteBar label="기권" count={vs.abstain} total={vs.total} color="bg-amber-400" />
            <VoteBar label="불참" count={vs.absent} total={vs.total} color="bg-slate-300" />
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import type { LegislatorSummaryDTO } from "@repo/shared";
import { PartyBadge } from "./PartyBadge";
import { User } from "lucide-react";

interface LegislatorCardProps {
  legislator: LegislatorSummaryDTO;
}

export function LegislatorCard({ legislator }: LegislatorCardProps) {
  const levelLabel = legislator.level === "NATIONAL" ? "국회의원" : "광역의회 의원";

  return (
    <Link href={`/legislator/${legislator.id}`} className="group">
      <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col items-center text-center gap-3 h-full">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 ring-2 ring-slate-100 group-hover:ring-slate-200 transition-all">
          {legislator.photoUrl ? (
            <Image
              src={legislator.photoUrl}
              alt={legislator.name}
              width={80}
              height={80}
              className="object-cover w-full h-full"
            />
          ) : (
            <User className="w-10 h-10 text-slate-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col items-center gap-1.5 w-full min-w-0">
          <p className="font-bold text-slate-900 text-base leading-tight">{legislator.name}</p>
          <PartyBadge party={legislator.party} />
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            {levelLabel}
          </span>
          {legislator.electoralDistrictName && (
            <p className="text-xs text-slate-500 truncate max-w-full">
              {legislator.electoralDistrictName}
            </p>
          )}
          {legislator.committee && (
            <p className="text-xs text-slate-400 truncate max-w-full">{legislator.committee}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

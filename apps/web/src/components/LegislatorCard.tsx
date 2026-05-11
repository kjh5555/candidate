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
  const termLabel = legislator.termCount ? `${legislator.termCount}` : null;

  return (
    <Link href={`/legislator/${legislator.id}`}>
      <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col items-center text-center gap-3">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
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
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-bold text-slate-800 text-lg leading-tight">{legislator.name}</p>
          <PartyBadge party={legislator.party} />
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {levelLabel}
          </span>
          {legislator.electoralDistrictName && (
            <p className="text-xs text-slate-500">{legislator.electoralDistrictName}</p>
          )}
          {legislator.committee && (
            <p className="text-xs text-slate-400 truncate max-w-full">{legislator.committee}</p>
          )}
          {termLabel && (
            <p className="text-xs text-slate-400">{termLabel}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

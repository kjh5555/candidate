"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { clearMyRegion, getMyRegion, type MyRegion } from "@/lib/myRegion";

export function MyRegionBanner() {
  const router = useRouter();
  const [region, setRegion] = useState<MyRegion>({ sido: null, wiwName: null });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRegion(getMyRegion());
    function onChange() {
      setRegion(getMyRegion());
    }
    window.addEventListener("myRegionChange", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("myRegionChange", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!mounted) return null;
  if (!region.sido || !region.wiwName) return null;

  function handleChange() {
    clearMyRegion();
    router.push("/");
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-sm mb-6">
      <div className="flex items-center gap-2 text-blue-800 min-w-0">
        <MapPin className="w-4 h-4 shrink-0" />
        <span className="truncate">
          내 지역: <span className="font-semibold">{region.sido}</span>{" "}
          <span className="font-semibold">{region.wiwName}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={handleChange}
        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline shrink-0"
      >
        변경
      </button>
    </div>
  );
}

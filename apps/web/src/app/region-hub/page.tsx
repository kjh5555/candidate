"use client";

// /region-hub는 더 이상 사용하지 않고 홈(/)으로 통합되었습니다.
// 기존 deep-link(?sido=&wiwName=)는 localStorage에 region을 저장하고
// 홈으로 리다이렉트합니다.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setMyRegion } from "@/lib/myRegion";

function Redirector() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const sido = params.get("sido");
    const wiwName = params.get("wiwName");
    if (sido && wiwName) {
      setMyRegion(sido, wiwName);
    }
    router.replace("/");
  }, [router, params]);
  return (
    <div className="py-16 text-center text-sm text-slate-500">
      홈으로 이동 중…
    </div>
  );
}

export default function RegionHubPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          이동 중…
        </div>
      }
    >
      <Redirector />
    </Suspense>
  );
}

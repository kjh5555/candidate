import { DistrictPicker } from "@/components/DistrictPicker";
import { MapPin } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100 mb-6">
          <MapPin className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3">
          내 지역구 의원 보기
        </h1>
        <p className="text-slate-500 text-base sm:text-lg max-w-md mx-auto">
          지역구를 선택하면 해당 국회의원의 정보를 확인할 수 있습니다.
        </p>
      </div>

      <DistrictPicker />

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl text-left">
        {[
          { title: "국회의원 정보", desc: "대표발의 법안, 표결 이력을 한눈에" },
          { title: "광역의회 의원", desc: "지역 광역의회 의원 현황 및 프로필" },
          { title: "법안 상세", desc: "발의자, 표결 결과, 처리 현황 확인" },
        ].map((item) => (
          <div
            key={item.title}
            className="bg-white rounded-xl border border-slate-200 p-4"
          >
            <p className="font-semibold text-slate-700 mb-1">{item.title}</p>
            <p className="text-sm text-slate-400">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

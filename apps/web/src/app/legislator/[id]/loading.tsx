export default function LegislatorLoading() {
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <div className="w-28 h-28 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
          <div className="flex flex-col gap-3 flex-1 items-center sm:items-start">
            <div className="h-8 w-36 bg-slate-200 rounded animate-pulse" />
            <div className="h-5 w-24 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-6 w-12 bg-slate-200 rounded animate-pulse mb-1" />
            <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
    </div>
  );
}

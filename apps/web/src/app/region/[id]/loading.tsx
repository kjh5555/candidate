export default function RegionLoading() {
  return (
    <div>
      <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-2" />
      <div className="h-4 w-32 bg-slate-100 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-3"
          >
            <div className="w-20 h-20 rounded-full bg-slate-200 animate-pulse" />
            <div className="h-5 w-16 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

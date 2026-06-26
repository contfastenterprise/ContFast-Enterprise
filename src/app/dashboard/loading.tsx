'use client';

export default function DashboardLoading() {
  return (
    <div className="w-full h-full animate-pulse space-y-6">
      {/* Page Header Skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant/10 pb-5">
        <div className="space-y-2 w-full md:w-auto">
          <div className="h-8 bg-surface-variant/40 rounded-lg w-48"></div>
          <div className="h-4 bg-surface-variant/30 rounded-lg w-72"></div>
        </div>
        <div className="h-10 bg-surface-variant/40 rounded-xl w-32 shrink-0"></div>
      </div>

      {/* Grid of Cards (Stats) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-surface-variant/30 rounded w-24"></div>
              <div className="h-8 w-8 bg-surface-variant/40 rounded-lg"></div>
            </div>
            <div className="h-8 bg-surface-variant/50 rounded-lg w-32"></div>
            <div className="h-3 bg-surface-variant/30 rounded w-16"></div>
          </div>
        ))}
      </div>

      {/* Table / List Skeleton */}
      <div className="bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-outline-variant/10">
          <div className="h-5 bg-surface-variant/40 rounded w-36"></div>
          <div className="h-9 bg-surface-variant/30 rounded-lg w-28"></div>
        </div>
        
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-outline-variant/5 last:border-0">
              <div className="flex items-center gap-4 w-1/2">
                <div className="h-10 w-10 bg-surface-variant/40 rounded-full shrink-0"></div>
                <div className="space-y-2 w-full">
                  <div className="h-4 bg-surface-variant/40 rounded w-3/4"></div>
                  <div className="h-3 bg-surface-variant/30 rounded w-1/2"></div>
                </div>
              </div>
              <div className="h-6 bg-surface-variant/40 rounded w-20"></div>
              <div className="h-4 bg-surface-variant/30 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

export default function Loading() {
  return (
    <div className="w-full h-full space-y-6 animate-pulse p-6">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center border-b border-outline-variant/10 pb-5">
        <div className="space-y-2">
          <div className="h-8 bg-surface-variant/40 rounded-lg w-48"></div>
          <div className="h-4 bg-surface-variant/30 rounded-lg w-72"></div>
        </div>
        <div className="h-10 bg-surface-variant/40 rounded-xl w-32"></div>
      </div>

      {/* Main Content Area Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-32 bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6">
          <div className="h-4 bg-surface-variant/30 rounded w-24 mb-4"></div>
          <div className="h-8 bg-surface-variant/50 rounded w-36"></div>
        </div>
        <div className="h-32 bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6">
          <div className="h-4 bg-surface-variant/30 rounded w-24 mb-4"></div>
          <div className="h-8 bg-surface-variant/50 rounded w-36"></div>
        </div>
        <div className="h-32 bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6">
          <div className="h-4 bg-surface-variant/30 rounded w-24 mb-4"></div>
          <div className="h-8 bg-surface-variant/50 rounded w-36"></div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-surface-bright/50 border border-outline-variant/20 rounded-2xl p-6 space-y-4">
        <div className="h-6 bg-surface-variant/40 rounded w-48 mb-6"></div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-outline-variant/5 last:border-0">
            <div className="h-4 bg-surface-variant/30 rounded w-1/4"></div>
            <div className="h-4 bg-surface-variant/30 rounded w-1/4"></div>
            <div className="h-4 bg-surface-variant/30 rounded w-1/6"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

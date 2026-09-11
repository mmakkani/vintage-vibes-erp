import React from 'react';

interface SkeletonLoaderProps {
  rows?: number;
  className?: string;
}

export const SkeletonTable: React.FC<SkeletonLoaderProps> = ({ rows = 5, className = '' }) => {
  return (
    <div className={`w-full animate-pulse bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs ${className}`}>
      <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-between">
        <div className="h-4 bg-slate-300 rounded w-48"></div>
        <div className="h-4 bg-slate-300 rounded w-24"></div>
      </div>
      <div className="divide-y divide-slate-100 p-3 space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={`skeleton-row-${idx}`} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-slate-200"></div>
              <div className="space-y-1.5">
                <div className="h-3.5 bg-slate-300 rounded w-36"></div>
                <div className="h-2.5 bg-slate-200 rounded w-24"></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 bg-slate-200 rounded w-16"></div>
              <div className="h-6 bg-slate-300 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonCardGrid: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={`skel-card-${idx}`} className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3.5 bg-slate-300 rounded w-28"></div>
            <div className="w-7 h-7 rounded-lg bg-slate-200"></div>
          </div>
          <div className="h-6 bg-slate-300 rounded w-20"></div>
          <div className="h-3 bg-slate-200 rounded w-full"></div>
        </div>
      ))}
    </div>
  );
};

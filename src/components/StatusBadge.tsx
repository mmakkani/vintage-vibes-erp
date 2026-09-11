import React from 'react';
import { DocumentStatus } from '../types/common.types.ts';

interface StatusBadgeProps {
  status: DocumentStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const isSm = size === 'sm';
  const sizeClasses = isSm ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';

  switch (status) {
    case 'POSTED':
      return (
        <span
          id={`status-badge-${status.toLowerCase()}`}
          className={`inline-flex items-center gap-1 font-black uppercase tracking-wider rounded bg-green-100 text-green-700 border border-green-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          POSTED
        </span>
      );
    case 'DRAFT':
      return (
        <span
          id={`status-badge-${status.toLowerCase()}`}
          className={`inline-flex items-center gap-1 font-black uppercase tracking-wider rounded bg-amber-100 text-amber-700 border border-amber-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          DRAFT
        </span>
      );
    case 'UNPOSTED':
      return (
        <span
          id={`status-badge-${status.toLowerCase()}`}
          className={`inline-flex items-center gap-1 font-black uppercase tracking-wider rounded bg-slate-100 text-slate-500 border border-slate-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          UNPOSTED
        </span>
      );
    case 'ARCHIVED':
      return (
        <span
          id={`status-badge-${status.toLowerCase()}`}
          className={`inline-flex items-center gap-1 font-black uppercase tracking-wider rounded bg-purple-100 text-purple-800 border border-purple-200 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          ARCHIVED
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 ${sizeClasses}`}>
          {status}
        </span>
      );
  }
};

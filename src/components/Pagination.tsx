import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  isLoading?: boolean;
  itemLabel?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  isLoading = false,
  itemLabel = 'records',
  className = ''
}) => {
  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safeTotalItems = Math.max(0, totalItems || 0);

  const fromItem = safeTotalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toItem = Math.min(safePage * pageSize, safeTotalItems);

  // Generate numbered page buttons with smart windowing & ellipsis
  const getPageNumbers = (): (number | '...')[] => {
    if (safeTotalPages <= 7) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [1];

    if (safePage > 3) {
      pages.push('...');
    }

    const start = Math.max(2, safePage - 1);
    const end = Math.min(safeTotalPages - 1, safePage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (safePage < safeTotalPages - 2) {
      pages.push('...');
    }

    pages.push(safeTotalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-600 rounded-b-xl ${className}`}
    >
      {/* Left: Summary and Page Size Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          Showing{' '}
          <span className="font-bold font-mono text-slate-900">{fromItem}</span> to{' '}
          <span className="font-bold font-mono text-slate-900">{toItem}</span> of{' '}
          <span className="font-bold font-mono text-slate-900">{safeTotalItems.toLocaleString()}</span>{' '}
          {itemLabel}
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
          <span className="text-[11px] text-slate-500">Per page:</span>
          <select
            value={pageSize}
            disabled={isLoading}
            onChange={(e) => {
              const newSize = Number(e.target.value) || 10;
              onPageSizeChange(newSize);
            }}
            className="px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
            aria-label="Select items per page"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1 || isLoading}
          className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors text-slate-700"
          title="First Page"
          aria-label="Go to first page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1 || isLoading}
          className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium text-slate-700 flex items-center gap-1"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {/* Numbered Page Buttons */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-1.5 py-1 text-slate-400 font-mono font-bold select-none"
                >
                  &hellip;
                </span>
              );
            }

            const isCurrent = p === safePage;
            return (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => onPageChange(p)}
                disabled={isLoading}
                className={`min-w-[28px] h-7 px-2 rounded font-mono font-bold text-xs transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-600 text-white shadow-2xs border border-amber-600'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label={`Page ${p}`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage >= safeTotalPages || isLoading}
          className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium text-slate-700 flex items-center gap-1"
          aria-label="Go to next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={safePage >= safeTotalPages || isLoading}
          className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors text-slate-700"
          title="Last Page"
          aria-label="Go to last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

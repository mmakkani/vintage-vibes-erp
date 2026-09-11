import React, { useState, useRef, useEffect } from 'react';
import { DocumentStatus } from '../types/common.types.ts';
import { ChevronDown, Check, Clock, Archive, CheckCircle2, RotateCcw } from 'lucide-react';

interface BatchStatusIndicatorProps {
  id?: string;
  status: DocumentStatus;
  disabled?: boolean;
  disabledReason?: string;
  onStatusChange: (newStatus: DocumentStatus) => void | Promise<void>;
}

export const BatchStatusIndicator: React.FC<BatchStatusIndicatorProps> = ({
  id,
  status,
  disabled = false,
  disabledReason,
  onStatusChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = async (newStatus: DocumentStatus) => {
    if (newStatus === status || disabled || loading) {
      setIsOpen(false);
      return;
    }
    setLoading(true);
    setIsOpen(false);
    try {
      await onStatusChange(newStatus);
    } finally {
      setLoading(false);
    }
  };

  const getBadgeStyle = (st: DocumentStatus) => {
    switch (st) {
      case 'POSTED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200';
      case 'DRAFT':
        return 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200';
      case 'ARCHIVED':
        return 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200';
      case 'UNPOSTED':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
    }
  };

  const getDotColor = (st: DocumentStatus) => {
    switch (st) {
      case 'POSTED':
        return 'bg-emerald-600';
      case 'DRAFT':
        return 'bg-amber-500';
      case 'ARCHIVED':
        return 'bg-purple-600';
      case 'UNPOSTED':
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        id={id || `status-toggle-${status.toLowerCase()}`}
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen(!isOpen)}
        title={disabledReason || 'Click to toggle batch state directly'}
        className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border transition-all shadow-2xs select-none ${getBadgeStyle(
          status
        )} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-xs'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${getDotColor(status)} ${loading ? 'animate-ping' : ''}`}></span>
        <span>{loading ? 'Updating...' : status}</span>
        {!disabled && (
          <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-transform duration-150" />
        )}
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 mt-1 w-36 bg-white rounded shadow-xl border border-slate-200 py-1 z-50 text-[11px] animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            Set Batch State
          </div>

          <button
            type="button"
            onClick={() => handleSelect('DRAFT')}
            className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-amber-50 transition-colors ${
              status === 'DRAFT' ? 'font-black text-amber-900 bg-amber-50/60' : 'text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="font-semibold">Draft</span>
            </div>
            {status === 'DRAFT' && <Check className="w-3 h-3 text-amber-700" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('POSTED')}
            className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-emerald-50 transition-colors ${
              status === 'POSTED' ? 'font-black text-emerald-900 bg-emerald-50/60' : 'text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span className="font-semibold">Posted</span>
            </div>
            {status === 'POSTED' && <Check className="w-3 h-3 text-emerald-700" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('ARCHIVED')}
            className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-purple-50 transition-colors ${
              status === 'ARCHIVED' ? 'font-black text-purple-900 bg-purple-50/60' : 'text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              <span className="font-semibold">Archived</span>
            </div>
            {status === 'ARCHIVED' && <Check className="w-3 h-3 text-purple-700" />}
          </button>

          <div className="border-t border-slate-100 my-1"></div>

          <button
            type="button"
            onClick={() => handleSelect('UNPOSTED')}
            className={`w-full text-left px-2.5 py-1 flex items-center justify-between hover:bg-slate-50 transition-colors ${
              status === 'UNPOSTED' ? 'font-black text-slate-900 bg-slate-100' : 'text-slate-500'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Unposted</span>
            </div>
            {status === 'UNPOSTED' && <Check className="w-3 h-3 text-slate-600" />}
          </button>
        </div>
      )}
    </div>
  );
};

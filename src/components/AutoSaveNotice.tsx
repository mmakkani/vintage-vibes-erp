import React from 'react';
import { Save, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';

interface AutoSaveDraftBannerProps {
  lastSavedTime: string | null;
  onRestore: () => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
}

export const AutoSaveDraftBanner: React.FC<AutoSaveDraftBannerProps> = ({
  lastSavedTime,
  onRestore,
  onDiscard,
  title = 'Unsubmitted Draft Recovered',
  description = 'We found temporarily auto-saved input from an earlier session in your local storage.'
}) => {
  return (
    <div className="mb-3.5 p-2.5 sm:p-3 bg-amber-50 border border-amber-300 rounded-lg shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-200">
      <div className="flex items-start sm:items-center gap-2.5">
        <div className="p-1.5 bg-amber-100 text-amber-800 rounded-md shrink-0">
          <Save className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
            <span>{title}</span>
            {lastSavedTime && (
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950">
                Auto-saved at {lastSavedTime}
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-800 leading-tight mt-0.5">
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <button
          type="button"
          onClick={onRestore}
          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restore Draft</span>
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-2 py-1 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-300 hover:border-rose-300 text-[11px] font-semibold rounded transition-colors cursor-pointer flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          <span>Discard</span>
        </button>
      </div>
    </div>
  );
};

interface AutoSaveIndicatorProps {
  isAutoSaved: boolean;
  lastSavedTime: string | null;
  className?: string;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  isAutoSaved,
  lastSavedTime,
  className = ''
}) => {
  if (!isAutoSaved && !lastSavedTime) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-200 font-medium ${className}`}>
      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
      <span>Auto-saved to localStorage {lastSavedTime ? `@ ${lastSavedTime}` : ''}</span>
    </div>
  );
};

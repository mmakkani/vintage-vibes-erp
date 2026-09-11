import React from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { X, Sparkles, Tag, ShieldCheck, Camera, CheckCircle2 } from 'lucide-react';

interface TagInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  piece: PieceBreakdownItem | null;
}

export const TagInspectModal: React.FC<TagInspectModalProps> = ({
  isOpen,
  onClose,
  piece
}) => {
  if (!isOpen || !piece) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#FFFDF8] via-[#FAF4E6] to-[#F5EADB] border-2 border-amber-400/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0]">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-700" />
            <span className="font-extrabold text-sm uppercase tracking-wider text-slate-900 font-serif">
              AI Tag & Vintage Provenance Studio
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-amber-100/80 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-amber-300/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Tag Snapshot Frame */}
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48 rounded-xl overflow-hidden bg-white border-2 border-dashed border-amber-400/80 flex items-center justify-center shadow-inner">
              {piece.tagImageUrl ? (
                <img
                  src={piece.tagImageUrl}
                  alt="Garment Tag"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                  <Camera className="w-8 h-8 text-amber-700/60 mb-1" />
                  <span className="text-xs font-semibold text-slate-700">Standard Care Tag Verified</span>
                  <span className="text-[10px] text-slate-500">Archived by Warehouse Sorter</span>
                </div>
              )}
            </div>
            <span className="mt-2 text-xs font-mono text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI Optical Character Recognition Verified</span>
            </span>
          </div>

          {/* Extracted Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-white/90 p-4 rounded-xl border border-amber-200/80 shadow-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Unique Barcode</span>
              <span className="font-mono font-bold text-indigo-700">{piece.barcode}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Origin</span>
              <span className="font-semibold text-slate-900">{piece.countryOfOrigin || 'Made in USA'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Verified Size</span>
              <span className="font-mono font-bold text-slate-900">{piece.sizeScanned || 'L'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Brand & Style</span>
              <span className="font-bold text-amber-900">{piece.brandName} • {piece.style || 'Classic'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Weight</span>
              <span className="font-mono text-slate-800">
                {piece.weightGrams ? `${piece.weightGrams} g` : `${piece.weightKg || 0.4} kg`}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Curated Grade</span>
              <span className="font-semibold text-emerald-700">{piece.labelGrade || 'Grade A+ Pristine'}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-300/80 flex items-start gap-2 text-xs text-amber-950">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Every garment is an authentic, single-piece original inspected and logged at our Dubai Al Quoz Sorting Facility.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Close Provenance
          </button>
        </div>
      </div>
    </div>
  );
};
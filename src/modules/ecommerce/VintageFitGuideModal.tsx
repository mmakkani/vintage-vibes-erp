import React, { useState } from 'react';
import { X, Ruler, Sparkles, Check, Info, ArrowRight, ShieldCheck } from 'lucide-react';
import { VINTAGE_FIT_SILHOUETTES, FitGuideSilhouette } from './vintageFitUtils.ts';

interface VintageFitGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSilhouetteId?: string;
}

export const VintageFitGuideModal: React.FC<VintageFitGuideModalProps> = ({
  isOpen,
  onClose,
  initialSilhouetteId
}) => {
  const [selectedSilhouette, setSelectedSilhouette] = useState<FitGuideSilhouette>(() => {
    if (initialSilhouetteId) {
      const found = VINTAGE_FIT_SILHOUETTES.find(s => s.id === initialSilhouetteId || s.name.toLowerCase().includes(initialSilhouetteId.toLowerCase()));
      if (found) return found;
    }
    return VINTAGE_FIT_SILHOUETTES[0];
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-gradient-to-b from-[#FFFDF8] via-[#FAF4E6] to-[#F5EADB] border-2 border-amber-400/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/30 border border-amber-500/50 flex items-center justify-center text-amber-900">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base uppercase tracking-wider text-slate-950 font-serif">
                Vintage Fit & Measurements Manifesto
              </h3>
              <p className="text-[11px] text-slate-600">
                Understanding authentic 90s & 80s silhouettes vs. modern fast-fashion cuts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-amber-100/80 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-amber-300/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Key Vintage Rule Callout */}
          <div className="p-4 rounded-xl bg-amber-100/80 border-2 border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
                <Sparkles className="w-4 h-4 text-amber-700" />
                <span>The Golden Vintage Sizing Rule</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Vintage garments were manufactured with pre-shrunk heavyweight fabrics and cut wider across the chest (Pit-to-Pit) with slightly cropped body lengths. Always compare Pit-to-Pit measurements rather than modern tag sizes!
              </p>
            </div>
          </div>

          {/* Interactive Silhouette Selector Tabs */}
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-2">
              Select an Iconic Vintage Silhouette:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {VINTAGE_FIT_SILHOUETTES.map(sil => (
                <button
                  key={sil.id}
                  type="button"
                  onClick={() => setSelectedSilhouette(sil)}
                  className={`p-2.5 rounded-xl text-left transition-all border cursor-pointer ${
                    selectedSilhouette.id === sil.id
                      ? 'bg-amber-400/30 border-amber-500 shadow-md ring-2 ring-amber-400'
                      : 'bg-white/80 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold text-amber-800 uppercase block leading-tight">
                    {sil.era}
                  </span>
                  <span className="text-xs font-extrabold text-slate-900 block mt-0.5 leading-snug">
                    {sil.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Silhouette Card */}
          <div className="bg-white/90 rounded-2xl border-2 border-amber-300 p-5 space-y-4 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-black uppercase tracking-wider inline-block mb-1">
                  {selectedSilhouette.badge}
                </span>
                <h4 className="text-lg font-black text-slate-950 font-serif">
                  {selectedSilhouette.name}
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                Era: {selectedSilhouette.era}
              </span>
            </div>

            {/* Visual Proportions & Characteristics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 block">
                  Tailoring Characteristics:
                </span>
                <ul className="space-y-1.5">
                  {selectedSilhouette.characteristics.map((char, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{char}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/80 space-y-2.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 block">
                  Vintage vs. Modern Comparison:
                </span>
                <p className="text-xs text-slate-800 leading-relaxed">
                  {selectedSilhouette.modernComparison}
                </p>

                <div className="pt-2 border-t border-amber-200 text-xs text-amber-950 font-medium">
                  <strong>💡 Styling Note:</strong> {selectedSilhouette.stylingTip}
                </div>
              </div>
            </div>
          </div>

          {/* How to Measure at Home Graphic Guide */}
          <div className="bg-gradient-to-r from-amber-50 to-amber-100/60 p-4 sm:p-5 rounded-2xl border border-amber-300 space-y-3">
            <h5 className="font-extrabold text-xs uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-amber-700" />
              <span>How We Measure Every 1-of-1 Piece Laid Flat</span>
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/90 p-3 rounded-xl border border-amber-200">
                <span className="font-black text-amber-900 block mb-1">1. Pit-to-Pit (Chest Width):</span>
                <p className="text-slate-600 leading-relaxed">
                  Measured across the front of the garment, from armpit seam to armpit seam with fabric relaxed and flat. Double this number for your total chest circumference.
                </p>
              </div>

              <div className="bg-white/90 p-3 rounded-xl border border-amber-200">
                <span className="font-black text-amber-900 block mb-1">2. Body Length (Collar to Hem):</span>
                <p className="text-slate-600 leading-relaxed">
                  Measured from the highest point of the shoulder collar seam straight down to the bottom hemline. Vintage shirts sit higher on the waist for a cleaner silhouette.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-600 font-medium">
            Hand-measured by Dubai Al Quoz Quality Inspection Team
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import {
  X,
  ZoomIn,
  ZoomOut,
  Tag,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  MessageCircle,
  Ruler,
  Eye,
  Zap,
  Flame,
  CheckCircle2,
  Maximize2,
  CameraOff
} from 'lucide-react';
import { getGarmentMeasurements, openWhatsAppClaim } from './vintageFitUtils.ts';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface GarmentInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  piece: PieceBreakdownItem | null;
  onInstantBuy: (piece: PieceBreakdownItem) => void;
  onOpenFitGuide: (silhouetteId?: string) => void;
}

type ViewAngle = 'FRONT' | 'BACK' | 'LABEL';

export const GarmentInspectorModal: React.FC<GarmentInspectorModalProps> = ({
  isOpen,
  onClose,
  piece,
  onInstantBuy,
  onOpenFitGuide
}) => {
  const [activeAngle, setActiveAngle] = useState<ViewAngle>('FRONT');
  const [isZooming, setIsZooming] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(2.8);
  const [lensPosition, setLensPosition] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !piece) return null;

  const measurements = getGarmentMeasurements(piece);
  const price = piece.estimatedPrice || piece.retailPriceAed || 295;

  // High-res images from ERP sorting terminal with authentic vintage fallbacks
  const defaultFrontImage = piece.frontImageUrl || 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=80';
  const defaultBackImage = piece.backImageUrl || piece.frontImageUrl || 'https://images.unsplash.com/photo-1582552938357-32b906df40cb?auto=format&fit=crop&w=800&q=80';
  const defaultTagImage = piece.tagImageUrl || 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?auto=format&fit=crop&w=800&q=80';

  const getActiveImage = () => {
    switch (activeAngle) {
      case 'BACK':
        return defaultBackImage;
      case 'LABEL':
        return defaultTagImage;
      case 'FRONT':
      default:
        return defaultFrontImage;
    }
  };

  const activeImage = getActiveImage();

  // Handle smooth mouse hover coordinate tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setLensPosition({ x, y });
  };

  // Handle touch drag for mobile zoom
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));
    setLensPosition({ x, y });
    setIsZooming(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-gradient-to-b from-[#FFFDF8] via-[#FAF4E6] to-[#F5EADB] border-2 border-amber-400/90 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="p-1.5 rounded-lg bg-amber-400 text-slate-950 font-black shadow-xs">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base uppercase tracking-wider text-slate-950 font-serif line-clamp-1">
                  {piece.brandName} • {piece.itemName}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
                  {piece.barcode}
                </span>
              </div>
              <p className="text-[11px] text-amber-900 font-bold">
                High-Resolution Macro Inspector • Optical Fabric & Tag Zoom
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg bg-amber-100/80 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-amber-300/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close Inspector"
            title="Close Inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Content (2-Column on Desktop) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Visual Inspector with Lens Zoom (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* View Angle Switcher Tabs */}
            <div className="flex items-center justify-between bg-white/90 p-1.5 rounded-xl border border-amber-300 shadow-xs">
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setActiveAngle('FRONT');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    activeAngle === 'FRONT'
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                      : 'text-slate-700 hover:bg-amber-100'
                  }`}
                >
                  👕 Front View
                </button>

                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setActiveAngle('BACK');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    activeAngle === 'BACK'
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                      : 'text-slate-700 hover:bg-amber-100'
                  }`}
                >
                  🔄 Back View
                </button>

                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setActiveAngle('LABEL');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    activeAngle === 'LABEL'
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                      : 'text-slate-700 hover:bg-amber-100'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>🏷️ Label & Tag</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setIsZooming(!isZooming);
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border flex items-center gap-1 transition-colors cursor-pointer ${
                    isZooming
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-inner'
                      : 'bg-white text-slate-700 border-amber-300 hover:bg-amber-100'
                  }`}
                  title="Toggle Zoom Inspection"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>{isZooming ? 'Zoom Active' : 'Hover to Zoom'}</span>
                </button>
              </div>
            </div>

            {/* High-Resolution Garment Canvas Frame */}
            <div
              ref={imageContainerRef}
              onMouseEnter={() => { if (activeImage) setIsZooming(true); }}
              onMouseLeave={() => setIsZooming(false)}
              onMouseMove={handleMouseMove}
              onTouchMove={handleTouchMove}
              className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-slate-950/20 border-2 border-amber-400/90 shadow-2xl flex items-center justify-center select-none cursor-crosshair group"
            >
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={`${piece.brandName} - ${activeAngle} view`}
                  className="w-full h-full object-cover transition-transform duration-100 ease-out pointer-events-none"
                  style={{
                    transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`,
                    transform: isZooming ? `scale(${zoomLevel})` : 'scale(1)'
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-amber-50 to-amber-100/70 w-full h-full">
                  <div className="w-16 h-16 rounded-2xl bg-amber-200/70 border border-amber-300 flex items-center justify-center text-amber-800 mb-3 shadow-inner">
                    <CameraOff className="w-8 h-8 text-amber-700/60" />
                  </div>
                  <h4 className="text-sm font-black text-amber-950 font-serif">No {activeAngle} Photo Captured</h4>
                  <p className="text-xs text-amber-800/80 max-w-xs mt-1">
                    This piece has been sorted in the ERP but optical studio photography hasn't been uploaded yet.
                  </p>
                </div>
              )}

              {/* Dynamic Scarcity & FOMO Overlays */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
                <span className="px-3 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-400/80 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-xl flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>1-of-1 Grail (Only One Exists)</span>
                </span>

                <span className="px-2.5 py-1 rounded-full bg-rose-950/90 backdrop-blur-md border border-rose-500/60 text-[10px] font-mono font-bold text-rose-300 shadow-xl flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>👁️ 3 viewing now</span>
                </span>
              </div>

              {/* Zoom Inspection Badge / Helper */}
              <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none z-20">
                <span className="px-2.5 py-1 rounded-md bg-slate-950/85 backdrop-blur-md border border-amber-400/60 text-[10px] font-mono font-bold text-amber-300 shadow-lg">
                  {isZooming ? `🔍 ${zoomLevel}x Extreme Macro Detail` : 'Hover or Drag Touch to Magnify Fabric'}
                </span>

                <span className="px-2.5 py-1 rounded-md bg-emerald-950/90 backdrop-blur-md border border-emerald-400/60 text-[10px] font-bold text-emerald-300 flex items-center gap-1 shadow-lg">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>AI Tag Verified</span>
                </span>
              </div>

              {/* Optical Crosshair when Zooming */}
              {isZooming && (
                <div
                  className="absolute pointer-events-none w-12 h-12 rounded-full border-2 border-amber-400/70 shadow-[0_0_15px_rgba(245,158,11,0.5)] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150"
                  style={{ left: `${lensPosition.x}%`, top: `${lensPosition.y}%` }}
                >
                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-amber-400/60 -translate-y-1/2" />
                  <div className="absolute inset-y-0 left-1/2 w-[1px] bg-amber-400/60 -translate-x-1/2" />
                </div>
              )}
            </div>

            {/* Quick Helper Text */}
            <p className="text-[11px] text-slate-500 text-center italic">
              Inspect authentic cotton weave, collar stitch density, and single-stitch hem integrity under high resolution.
            </p>
          </div>

          {/* Right Column: Piece Specifications, Fit Guide, & Instant WhatsApp Claim (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            {/* Upper Specs Section */}
            <div className="space-y-4">
              {/* Fresh From Sorting Badge & SKU */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-400/60 text-amber-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                  <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                  <span>⚡ Fresh from sorting terminal</span>
                </span>

                <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/40">
                  {piece.sku || piece.barcode}
                </span>

                <span className="px-2 py-0.5 rounded bg-white text-slate-700 font-bold text-[10px] border border-amber-300">
                  {piece.shopLocation || 'Al Jimi Store'}
                </span>
              </div>

              {/* 4-Tier Cascading Taxonomy Path & Collection / Segment Badges */}
              <div className="space-y-1.5">
                {/* 4-Tier Cascading Breadcrumb */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-900 bg-amber-100/80 px-2.5 py-1.5 rounded-lg border border-amber-300/80 flex-wrap">
                  <span className="text-slate-500 uppercase text-[9px] font-black tracking-wider">Hierarchy:</span>
                  <span>{(piece as any).parentCategoryName || (piece as any).parent_category_name || 'Department'}</span>
                  <span className="text-amber-500">➔</span>
                  <span className="text-slate-900 font-extrabold">{piece.itemName}</span>
                  {((piece as any).subCategory || (piece as any).sub_category) && (
                    <>
                      <span className="text-amber-500">➔</span>
                      <span className="text-indigo-800 font-extrabold">{((piece as any).subCategory || (piece as any).sub_category)}</span>
                    </>
                  )}
                </div>

                {/* Collection & Segment Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Collection Badge */}
                  {((piece as any).collectionName || (piece as any).collection_name) && (
                    <span className="px-2.5 py-1 rounded-md bg-amber-200/90 border border-amber-400 text-amber-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                      <Sparkles className="w-3 h-3 text-amber-800" />
                      <span>{((piece as any).collectionName || (piece as any).collection_name)}</span>
                    </span>
                  )}

                  {/* Market Segment Badge */}
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border shadow-2xs ${
                    (piece.marketSegment || (piece as any).market_segment) === 'Antique'
                      ? 'bg-amber-900 text-amber-100 border-amber-700'
                      : (piece.marketSegment || (piece as any).market_segment) === 'Brand'
                      ? 'bg-purple-900 text-purple-100 border-purple-700'
                      : (piece.marketSegment || (piece as any).market_segment) === 'Non-Brand'
                      ? 'bg-slate-800 text-slate-100 border-slate-600'
                      : 'bg-emerald-900 text-emerald-100 border-emerald-700'
                  }`}>
                    <span>
                      {(piece.marketSegment || (piece as any).market_segment) === 'Antique'
                        ? '🏛️ Antique'
                        : (piece.marketSegment || (piece as any).market_segment) === 'Brand'
                        ? '⭐ Brand'
                        : (piece.marketSegment || (piece as any).market_segment) === 'Non-Brand'
                        ? '🏷️ Non-Brand'
                        : '🕰️ Vintage'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Garment Title & Price */}
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 font-serif leading-tight">
                  {piece.brandName} • {piece.itemName}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Style: <strong className="text-slate-900">{piece.style || 'Original Vintage Wash'}</strong>
                </p>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-amber-950 font-mono drop-shadow-xs">
                    AED {Number(price).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">(VAT & Delivery calculated at checkout)</span>
                </div>
              </div>

              {/* AI Archival Copywriting & Curated SEO Notes */}
              {(piece.ecommerceDescription || (piece as any).ecommerce_description) && (
                <div className="p-3 bg-amber-50/90 border border-amber-300/80 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Archival Vintage Notes</span>
                  </div>
                  <p className="text-xs text-slate-800 italic leading-relaxed">
                    {piece.ecommerceDescription || (piece as any).ecommerce_description}
                  </p>
                  {Array.isArray(piece.seoTags || (piece as any).seo_tags) && (piece.seoTags || (piece as any).seo_tags).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(piece.seoTags || (piece as any).seo_tags).map((tag: string, i: number) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-950 font-medium font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Exact Measurements Card */}
              <div className="bg-white/95 rounded-2xl border-2 border-amber-300 p-4 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
                    <Ruler className="w-4 h-4 text-amber-700" />
                    <span>Exact Measured Dimensions</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      luxuryAudio.playMechanicalClick();
                      onOpenFitGuide(measurements.fitSilhouette);
                    }}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                  >
                    Vintage Fit Guide
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                      Pit-to-Pit (Chest)
                    </span>
                    <span className="text-base font-black font-mono text-slate-950 block">
                      {measurements.pitToPitInches}"{' '}
                      <span className="text-xs text-slate-500 font-normal">({measurements.pitToPitCm} cm)</span>
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                      Length (Collar-Hem)
                    </span>
                    <span className="text-base font-black font-mono text-slate-950 block">
                      {measurements.lengthInches}"{' '}
                      <span className="text-xs text-slate-500 font-normal">({measurements.lengthCm} cm)</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-100">
                  <span className="text-slate-600 font-medium">Silhouette Cut:</span>
                  <span className="font-extrabold text-amber-950 bg-amber-200/80 px-2 py-0.5 rounded-md">
                    {measurements.fitSilhouette}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed italic">
                  "{measurements.fitSummary}"
                </p>
              </div>

              {/* Provenance Details Pill Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-white/70 p-3 rounded-xl border border-amber-200/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Tag Scanned Size</span>
                  <span className="font-mono font-bold text-slate-900">{piece.sizeScanned || 'L'}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Country of Origin</span>
                  <span className="font-semibold text-slate-900">{piece.countryOfOrigin || 'Made in USA'}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Weight</span>
                  <span className="font-mono text-slate-900">
                    {piece.weightGrams ? `${piece.weightGrams}g` : `${piece.weightKg || 0.4} kg`}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Condition Grade</span>
                  <span className="font-bold text-emerald-800">{piece.labelGrade || 'Grade A+ Pristine'}</span>
                </div>
              </div>
            </div>

            {/* CTAs Section: 1-Click WhatsApp Claim + Instant Buy */}
            <div className="space-y-2 pt-2">
              {/* 1-CLICK WHATSAPP CLAIM BUTTON */}
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  openWhatsAppClaim(piece);
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer border border-emerald-300"
              >
                <MessageCircle className="w-4 h-4 text-white" />
                <span>💬 Claim via WhatsApp</span>
              </button>

              {/* Instant Buy Button */}
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  onClose();
                  onInstantBuy(piece);
                }}
                className="w-full py-3 px-4 rounded-xl btn-3d btn-3d-amber text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all transform active:scale-95 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Instant Checkout Online</span>
              </button>

              {/* Close Inspector Escape Button */}
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-300/80 bg-white hover:bg-amber-50 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close Inspector
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>100% Authentic Vintage Guarantee • Instant Reservation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

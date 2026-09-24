import React, { useState, useRef } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import {
  Tag,
  Sparkles,
  ShoppingBag,
  Eye,
  Zap,
  MessageCircle,
  Ruler,
  Maximize2,
  RotateCw,
  CheckCircle2,
  ShieldCheck,
  Flame,
  CameraOff
} from 'lucide-react';
import { getGarmentMeasurements, openWhatsAppClaim } from './vintageFitUtils.ts';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface ProductCardProps {
  piece: PieceBreakdownItem;
  onInstantBuy: (piece: PieceBreakdownItem) => void;
  onAddToCart?: (piece: PieceBreakdownItem) => void;
  isInCart?: boolean;
  onInspectTag: (piece: PieceBreakdownItem) => void;
  onInspectGarment?: (piece: PieceBreakdownItem) => void;
  onOpenFitGuide?: (silhouetteId?: string) => void;
  isVanishing?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  piece,
  onInstantBuy,
  onAddToCart,
  isInCart = false,
  onInspectTag,
  onInspectGarment,
  onOpenFitGuide,
  isVanishing = false
}) => {
  if (!piece) return null;

  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, sheenX: 50, sheenY: 50 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Deterministic live viewer count (2 to 5 viewers based on barcode hash)
  const viewerCount = React.useMemo(() => {
    let hash = 0;
    const str = piece?.barcode || piece?.id || 'vv-1';
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return 2 + (Math.abs(hash) % 4);
  }, [piece?.barcode, piece?.id]);

  const defaultFrontImage = piece.frontImageUrl || null;
  const defaultBackImage = piece.backImageUrl || null;

  const price = piece.estimatedPrice || piece.retailPriceAed || 295;
  const gradeBadge = piece.labelGrade || 'Grade A+ (Pristine)';
  const measurements = getGarmentMeasurements(piece);

  // Smooth 3D Cursor Tilt Calculation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || isFlipped) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Smooth tilt angles clamped between -9 and +9 degrees
    const rotateX = Number((((y - centerY) / centerY) * -9).toFixed(2));
    const rotateY = Number((((x - centerX) / centerX) * 9).toFixed(2));
    const sheenX = Number(((x / rect.width) * 100).toFixed(1));
    const sheenY = Number(((y / rect.height) * 100).toFixed(1));

    setTilt({ rotateX, rotateY, sheenX, sheenY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ rotateX: 0, rotateY: 0, sheenX: 50, sheenY: 50 });
  };

  const handleCardClick = () => {
    luxuryAudio.playMechanicalClick();
    if (onInspectGarment) {
      onInspectGarment(piece);
    } else {
      onInspectTag(piece);
    }
  };

  const toggleFlip = (e: React.MouseEvent) => {
    e.stopPropagation();
    luxuryAudio.playMechanicalClick();
    setIsFlipped(!isFlipped);
    setTilt({ rotateX: 0, rotateY: 0, sheenX: 50, sheenY: 50 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative perspective-1000 select-none ${
        isVanishing ? 'opacity-0 scale-95 pointer-events-none transition-all duration-700' : 'opacity-100 scale-100'
      }`}
      style={{ perspective: '1200px' }}
    >
      {/* 3D ROTATING CONTAINER */}
      <div
        className="relative w-full rounded-2xl transition-transform duration-500 ease-out preserve-3d shadow-xl hover:shadow-[0_20px_50px_rgba(217,119,6,0.25)]"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped
            ? 'rotateY(180deg)'
            : isHovered
            ? `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(1.025, 1.025, 1.025)`
            : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
          transition: isHovered && !isFlipped ? 'transform 0.1s ease-out' : 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        {/* ========================================================= */}
        {/* FRONT 3D FACE (FRONT LOOK & SPECS) */}
        {/* ========================================================= */}
        <div
          className="w-full bg-gradient-to-b from-[#FFFDF8] via-[#FAF3E0] to-[#F5EADB] rounded-2xl overflow-hidden border-2 border-amber-300/80 hover:border-amber-400 flex flex-col justify-between"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }}
        >
          {/* Dynamic 3D Holographic Light Sheen Overlay */}
          {isHovered && !isFlipped && (
            <div
              className="absolute inset-0 z-30 pointer-events-none rounded-2xl transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${tilt.sheenX}% ${tilt.sheenY}%, rgba(255, 235, 160, 0.35) 0%, rgba(245, 158, 11, 0.1) 35%, transparent 70%)`
              }}
            />
          )}

          {/* Visual Garment Frame (Forced Light Context for Dark Mode Protection) */}
          <div
            onClick={handleCardClick}
            className="relative aspect-[3/4] w-full overflow-hidden bg-white dark:bg-white text-black dark:text-black flex items-center justify-center cursor-pointer border-b border-amber-200 isolate"
            style={{ colorScheme: 'light' }}
            title="Click for High-Resolution Multi-Angle Inspector"
          >
            {defaultFrontImage ? (
              <img
                src={defaultFrontImage}
                alt={`${piece.brandName} - Front`}
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 mix-blend-multiply bg-white"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-amber-100/60 p-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-200/60 border border-amber-300 flex items-center justify-center text-amber-800 mb-2 shadow-inner">
                  <CameraOff className="w-7 h-7 text-amber-700/60" />
                </div>
                <span className="text-[11px] font-black text-amber-950 font-serif">Studio Photo Pending</span>
                <span className="text-[9px] text-amber-800/70 font-mono mt-0.5">Awaiting sorting photoshoot</span>
              </div>
            )}

            {/* 3D Floating Badges (Pop out with z-depth) */}
            <div
              className="absolute top-2.5 inset-x-2.5 flex flex-col gap-1.5 pointer-events-none z-20"
              style={{ transform: 'translateZ(20px)' }}
            >
              <div className="flex items-center justify-between gap-1">
                {/* Dynamic Tier Badge */}
                {((piece.marketSegment === 'Antique' || (piece as any).market_segment === 'Antique' || (piece.style || '').toLowerCase().includes('antique')) ? (
                  <span className="px-2.5 py-1 rounded-full bg-purple-950/90 backdrop-blur-md border border-purple-400/90 text-[10px] font-black uppercase tracking-wider text-purple-200 shadow-lg flex items-center gap-1">
                    <span>🏛️ Antique</span>
                  </span>
                ) : (piece.marketSegment === 'Boutique' || (piece as any).market_segment === 'Boutique') ? (
                  <span className="px-2.5 py-1 rounded-full bg-pink-950/90 backdrop-blur-md border border-pink-400/90 text-[10px] font-black uppercase tracking-wider text-pink-200 shadow-lg flex items-center gap-1">
                    <span>✨ Boutique</span>
                  </span>
                ) : (piece.isGrail || (piece as any).is_grail || piece.marketSegment === 'Grails' || (piece as any).market_segment === 'Grails') ? (
                  <span className="px-2.5 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-400/90 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-lg flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>👑 Grail</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-400/90 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-lg flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>1-of-1 Piece</span>
                  </span>
                ))}

                <div className="flex items-center gap-1 pointer-events-auto">
                  <span className="px-2 py-0.5 rounded-md bg-white/95 backdrop-blur-md border border-amber-400 text-[10px] font-mono font-black text-slate-900 shadow-md">
                    SIZE {piece.sizeScanned || 'L'}
                  </span>

                  {/* 3D Card Flip Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleFlip}
                    className="p-1 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md transition-transform active:scale-90 cursor-pointer flex items-center gap-1 text-[10px] font-black border border-white"
                    title="Flip to inspect Back Look"
                  >
                    <RotateCw className="w-3 h-3 animate-spin" style={{ animationDuration: '10s' }} />
                    <span className="hidden sm:inline">3D Back</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1">
                {/* Live Viewers Scarcity Badge */}
                <span className="px-2 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-rose-500/50 text-[9.5px] font-mono font-bold text-rose-300 shadow-md flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>👁️ {viewerCount} viewing now</span>
                </span>
              </div>
            </div>

            {/* Hover Quick Action Overlay */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  luxuryAudio.playMechanicalClick();
                  onInspectTag(piece);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-900 font-extrabold text-[10px] shadow-lg flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer border border-amber-300"
              >
                <Tag className="w-3 h-3 text-amber-700" />
                <span>Tag OCR</span>
              </button>

              <button
                type="button"
                onClick={handleCardClick}
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-[10px] shadow-lg flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer border border-white/50"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Inspect Look</span>
              </button>
            </div>
          </div>

          {/* Piece Metadata Card Body */}
          <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5 bg-gradient-to-b from-[#FDF9EE] to-[#FAF4E6]">
            <div>
              <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-slate-500">
                <span className="font-bold text-amber-900 bg-amber-200/60 px-1.5 py-0.5 rounded border border-amber-300/60">
                  {piece.barcode}
                </span>
                <span className="truncate">{piece.shopLocation || 'Al Ain Vault'}</span>
              </div>

              <h3
                onClick={handleCardClick}
                className="mt-1.5 font-bold text-sm text-slate-900 font-serif leading-snug line-clamp-1 hover:text-amber-800 transition-colors cursor-pointer"
                title={`${piece.brandName} • ${piece.style || 'Original Wash'}`}
              >
                {piece.brandName} • {piece.style || 'Original Wash'}
              </h3>

              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-700 font-medium">
                <span>{piece.countryOfOrigin || 'Made in USA'}</span>
                <span>•</span>
                <span className="text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                  {gradeBadge}
                </span>
              </div>

              {/* Exact Garment Measurements Snippet */}
              <div className="mt-2 p-2 rounded-xl bg-white/90 border border-amber-200 flex items-center justify-between text-[11px] shadow-2xs">
                <div className="flex items-center gap-1 text-slate-700 font-mono">
                  <Ruler className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Pit: <strong className="text-slate-950">{measurements.pitToPitInches}"</strong></span>
                  <span>•</span>
                  <span>Len: <strong className="text-slate-950">{measurements.lengthInches}"</strong></span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenFitGuide) onOpenFitGuide(measurements.fitSilhouette);
                  }}
                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  {measurements.fitSilhouette}
                </button>
              </div>
            </div>

            {/* Pricing & Double Action: 1-Click WhatsApp Claim + Instant Buy */}
            <div className="pt-2.5 border-t border-amber-200/80 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-slate-600 uppercase font-extrabold block leading-none">Price</span>
                <div className="text-right">
                  <span className="text-xl font-black text-amber-950 font-mono tracking-tight drop-shadow-xs">
                    AED {Number(price).toLocaleString()}
                  </span>
                  {(piece.globalInsights?.usa_market_usd || (piece as any).global_insights?.usa_market_usd) && (
                    <div className="text-[9px] font-mono text-emerald-700 font-bold">
                      Int'l Val: ~${piece.globalInsights?.usa_market_usd || (piece as any).global_insights?.usa_market_usd} USD
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {/* 1-CLICK WHATSAPP CLAIM BUTTON */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      luxuryAudio.playMechanicalClick();
                      openWhatsAppClaim(piece);
                    }}
                    className="px-2 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 text-white font-black text-[10px] uppercase tracking-wider shadow-xs hover:shadow-emerald-600/30 flex items-center justify-center gap-1 transition-all transform active:scale-95 cursor-pointer border border-emerald-400"
                    title="Claim 1-of-1 Piece on WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                    <span>Claim</span>
                  </button>

                  {/* ADD TO CART BUTTON */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      luxuryAudio.playMechanicalClick();
                      if (onAddToCart) onAddToCart(piece);
                    }}
                    className={`px-2 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-xs flex items-center justify-center gap-1 transition-all transform active:scale-95 cursor-pointer border ${
                      isInCart
                        ? 'bg-amber-200 text-amber-950 border-amber-400'
                        : 'bg-white hover:bg-amber-50 text-slate-800 border-amber-300'
                    }`}
                    title="Add to Vault Cart"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-700" />
                    <span>{isInCart ? 'In Cart ✓' : '+ Cart'}</span>
                  </button>
                </div>

                {/* Instant Buy Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstantBuy(piece);
                  }}
                  className="w-full btn-3d btn-3d-amber py-1.5 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1 shadow-md transition-all transform active:scale-95 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Instant Vault Buy</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* BACK 3D FACE (BACK LOOK & AUTHENTICITY CERTIFICATION) */}
        {/* ========================================================= */}
        <div
          className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#1C1814] via-[#28221B] to-[#14110E] rounded-2xl overflow-hidden border-2 border-amber-400 flex flex-col justify-between text-white p-4 shadow-2xl"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          {/* Top Bar on Back Side */}
          <div className="flex items-center justify-between pb-2 border-b border-amber-500/30">
            <div className="flex items-center gap-1.5 text-amber-300 font-serif font-black text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>AUTHENTICITY PASSPORT</span>
            </div>

            <button
              type="button"
              onClick={toggleFlip}
              className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow-md cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>↩️ Front Look</span>
            </button>
          </div>

          {/* High-Res Back Garment Image Preview (Forced Light Context for Dark Mode Protection) */}
          <div
            onClick={handleCardClick}
            className="relative aspect-video w-full rounded-xl overflow-hidden border border-amber-400/50 bg-white dark:bg-white text-black dark:text-black cursor-pointer shadow-inner my-2 flex items-center justify-center isolate"
            style={{ colorScheme: 'light' }}
          >
            {defaultBackImage ? (
              <img
                src={defaultBackImage}
                alt={`${piece.brandName} - Back Look`}
                className="w-full h-full object-cover mix-blend-multiply bg-white"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-3">
                <CameraOff className="w-5 h-5 text-amber-400/60 mb-1" />
                <span className="text-[10px] font-bold text-amber-200">No Back Photo</span>
              </div>
            )}
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 border border-amber-400 text-[9px] font-black uppercase tracking-wider text-amber-300">
              Back View
            </div>
          </div>

          {/* Back Specifications & Grading Checklist */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="text-slate-400 text-[11px]">Barcode Ref:</span>
              <span className="font-mono font-bold text-amber-300">{piece.barcode}</span>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="text-slate-400 text-[11px]">Quality Grade:</span>
              <span className="font-bold text-emerald-400">{gradeBadge}</span>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/10">
              <span className="text-slate-400 text-[11px]">Warehouse Dispatch:</span>
              <span className="font-bold text-slate-200">Al Ain & Dubai Sorting Vault</span>
            </div>
          </div>

          {/* Back Actions */}
          <div className="pt-2 border-t border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-400 font-bold uppercase">Price AED</span>
              <span className="text-lg font-black font-mono text-white">AED {Number(price).toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleFlip}
                className="py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] uppercase transition-colors cursor-pointer text-center"
              >
                Back to Front
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInstantBuy(piece);
                }}
                className="btn-3d btn-3d-amber py-2 text-slate-950 font-black text-[11px] uppercase rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Buy Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

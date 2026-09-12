import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Radio,
  CheckCircle2,
  Flame,
  ShieldCheck,
  ShoppingBag,
  Clock,
  Globe,
  Tag
} from 'lucide-react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { LiveStreamSessionStatus, ChatClaimRecord } from '../marketing.types.ts';
import { LiveStreamService } from '../../../services/liveStreamService.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';

export const LiveOBSOverlayView: React.FC = () => {
  const [session, setSession] = useState<LiveStreamSessionStatus | null>(null);
  const [claims, setClaims] = useState<ChatClaimRecord[]>([]);
  const [activePiece, setActivePiece] = useState<PieceBreakdownItem | null>(null);
  const [recentTickerClaim, setRecentTickerClaim] = useState<ChatClaimRecord | null>(null);

  // Read URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('booth') || 'booth_01';
  const theme = urlParams.get('theme') || 'gold'; // 'gold' | 'neon' | 'noir'
  const isTransparent = urlParams.get('transparent') !== '0';

  const fetchSession = async () => {
    try {
      // 1. Direct Supabase Query for ultra-low latency & zero serverless failure
      const [liveBooths, allPieces] = await Promise.all([
        LiveStreamService.getBooths(),
        PurchaseService.getPieces()
      ]);

      const normalizedBoothId = boothId.replace('-', '_');
      const currentBooth = liveBooths.find(b => b.id === boothId || b.id === normalizedBoothId || b.id.replace('_', '-') === boothId) || liveBooths[0];
      const inStock = (allPieces || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
      const matched = inStock.find((p: PieceBreakdownItem) => p.barcode === currentBooth?.active_product_sku || p.id === currentBooth?.active_product_sku) || inStock[0] || null;

      if (matched) {
        setActivePiece(matched);
      }

      setSession({
        isBroadcasting: Boolean(currentBooth?.is_broadcasting),
        startedAt: Date.now() - 600000,
        uptimeSeconds: 600,
        activeBoothId: currentBooth?.id || boothId,
        activeBoothName: currentBooth?.booth_name || 'Live Stage',
        activeOnAirPiece: matched,
        scannerFeed: [],
        totalClaimsInSession: currentBooth?.viewer_count || 12,
        totalRevenueAedInSession: Number(currentBooth?.current_deal_price || 0),
        obsOverlayUrl: window.location.href
      });

      // Claims ticker fallback
      try {
        const claimsRes = await fetch('/api/marketing/chat-claim/logs');
        if (claimsRes.ok) {
          const claimsData = await claimsRes.json();
          if (Array.isArray(claimsData) && claimsData.length > 0) {
            setClaims(claimsData);
            setRecentTickerClaim(claimsData[0]);
          }
        }
      } catch (_) {}
    } catch (err) {
      console.warn('OBS overlay direct fetch error:', err);
    }
  };

  useEffect(() => {
    fetchSession();
    // Fast 2-second polling for live OBS stream updates
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [boothId]);

  // Rotate claims in ticker every 6 seconds
  useEffect(() => {
    if (claims.length <= 1) return;
    let idx = 0;
    const tickerInterval = setInterval(() => {
      idx = (idx + 1) % claims.length;
      setRecentTickerClaim(claims[idx]);
    }, 6000);
    return () => clearInterval(tickerInterval);
  }, [claims]);

  const priceAed = activePiece?.retailPriceAed || activePiece?.estimatedPrice || activePiece?.costPrice || 120;
  const priceUsd = Math.round(Number(priceAed) * 0.272);

  return (
    <div
      className={`min-h-screen w-screen relative overflow-hidden flex flex-col justify-between p-6 select-none font-sans ${
        isTransparent ? 'bg-transparent' : 'bg-slate-950/80'
      }`}
    >
      {/* TOP BAR: MULTI-PLATFORM LIVE BADGE & NOTIFICATION TICKER */}
      <div className="flex items-center justify-between w-full">
        {/* Left: Vintage Vibes Brand + Multi-Platform Indicators */}
        <div className="flex items-center gap-3 bg-black/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-amber-400/70 shadow-2xl">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black text-sm shadow-md">
            VV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-black text-white text-sm tracking-wider">
                VINTAGE VIBES DUBAI
              </span>
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                LIVE
              </span>
            </div>
            {/* Multi-Platform Social Stream Pills */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] font-mono font-bold text-amber-300">TIKTOK</span>
              <span className="text-slate-600">•</span>
              <span className="text-[9px] font-mono font-bold text-rose-400">INSTAGRAM</span>
              <span className="text-slate-600">•</span>
              <span className="text-[9px] font-mono font-bold text-red-500">YOUTUBE</span>
              <span className="text-slate-600">•</span>
              <span className="text-[9px] font-mono font-bold text-blue-400">FACEBOOK</span>
            </div>
          </div>
        </div>

        {/* Right: Live Buyer Claim Notification Toast */}
        {recentTickerClaim && (
          <div className="bg-black/90 backdrop-blur-md border border-amber-400/70 rounded-2xl px-4 py-2 text-white shadow-2xl flex items-center gap-3 animate-slide-in">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
            </div>
            <div className="text-xs">
              <span className="text-amber-400 font-bold font-mono">{recentTickerClaim.customerHandle}</span>{' '}
              <span className="text-slate-300">claimed</span>{' '}
              <span className="font-mono font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                {recentTickerClaim.sku}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM LOWER-THIRD: PRODUCT SHOWCASE CARD */}
      {activePiece ? (
        <div className="w-full max-w-2xl bg-gradient-to-r from-black/95 via-slate-950/95 to-black/90 backdrop-blur-xl border-2 border-amber-400/80 rounded-3xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-white relative animate-fade-in">
          <div className="flex items-center gap-4">
            {/* High-res Garment Image with glowing gold frame */}
            <div className="relative shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-amber-400/90 shadow-xl bg-black">
                <img
                  src={activePiece.frontImageUrl || activePiece.images?.[0] || '/vintage_logo.svg'}
                  alt={activePiece.itemName}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute -top-2 -left-2 bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-md animate-pulse">
                ON AIR
              </span>
              <span className="absolute bottom-1 right-1 bg-black/85 text-amber-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                {activePiece.labelGrade || 'Grade A'}
              </span>
            </div>

            {/* Product Details & Dual Currency Price */}
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-amber-400 font-bold uppercase tracking-widest truncate">
                  {activePiece.brandName || 'VINTAGE'} • {activePiece.style || activePiece.itemName || 'ARCHIVE'}
                </span>
                <span className="text-[10px] font-mono text-slate-200 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                  Size: {activePiece.sizeScanned || 'M'}
                </span>
                {activePiece.category && (
                  <span className="text-[9px] font-mono text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase">
                    {activePiece.category}
                  </span>
                )}
              </div>

              <h3 className="font-serif font-black text-base sm:text-lg text-white leading-tight truncate">
                {activePiece.itemName}
              </h3>

              {/* Price Tag Bar */}
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 px-3.5 py-1 rounded-xl font-mono font-black text-base shadow-lg">
                  AED {priceAed}
                  <span className="text-xs font-bold text-slate-800 ml-1.5">/ ${priceUsd}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Origin: {activePiece.countryOfOrigin || 'USA / Europe'}
                </span>
              </div>

              {/* Order Instructions Callout Bar */}
              <div className="bg-amber-400/10 border border-amber-400/50 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-sans text-amber-200 font-medium">
                  💬 Comment on Chat or WhatsApp +971554186086:
                </span>
                <span className="font-mono text-xs font-black text-amber-300 tracking-wider bg-black/70 px-2.5 py-0.5 rounded-md border border-amber-400 shadow-inner">
                  MINE {activePiece.barcode}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Standby Watermark when waiting for next piece */
        <div className="bg-black/80 backdrop-blur-sm border border-amber-400/40 rounded-2xl px-5 py-3 text-xs text-amber-200 self-start flex items-center gap-3 shadow-2xl">
          <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
          <div>
            <span className="font-bold block text-white">Live Stream Active • Auto-Presenter Standby</span>
            <span className="text-[10px] text-amber-300/80 font-mono">Broadcasting across TikTok, Instagram, YouTube & Facebook</span>
          </div>
        </div>
      )}
    </div>
  );
};


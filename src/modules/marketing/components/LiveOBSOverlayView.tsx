import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Radio,
  CheckCircle2,
  Flame,
  ShieldCheck,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { LiveStreamSessionStatus, ChatClaimRecord } from '../marketing.types.ts';

export const LiveOBSOverlayView: React.FC = () => {
  const [session, setSession] = useState<LiveStreamSessionStatus | null>(null);
  const [claims, setClaims] = useState<ChatClaimRecord[]>([]);
  const [activePiece, setActivePiece] = useState<PieceBreakdownItem | null>(null);
  const [recentTickerClaim, setRecentTickerClaim] = useState<ChatClaimRecord | null>(null);

  // Read URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('booth') || 'booth-01';
  const theme = urlParams.get('theme') || 'gold'; // 'gold' | 'neon' | 'noir'
  const isTransparent = urlParams.get('transparent') !== '0';

  const fetchSession = async () => {
    try {
      const [sessRes, claimsRes] = await Promise.all([
        fetch('/api/marketing/live-session'),
        fetch('/api/marketing/chat-claim/logs')
      ]);

      if (sessRes.ok) {
        const sessData = await sessRes.json();
        setSession(sessData);
        if (sessData.activeOnAirPiece) {
          setActivePiece(sessData.activeOnAirPiece);
        }
      }

      if (claimsRes.ok) {
        const claimsData = await claimsRes.json();
        setClaims(claimsData || []);
        if (claimsData.length > 0) {
          setRecentTickerClaim(claimsData[0]);
        }
      }
    } catch (err) {
      console.warn('OBS overlay fetch error:', err);
    }
  };

  useEffect(() => {
    fetchSession();
    // Fast 2-second polling for OBS broadcast source
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

  const priceAed = activePiece?.retailPriceAed || activePiece?.estimatedPrice || 120;
  const priceUsd = Math.round(priceAed * 0.272);

  return (
    <div
      className={`min-h-screen w-screen relative overflow-hidden flex flex-col justify-between p-6 select-none font-sans ${
        isTransparent ? 'bg-transparent' : 'bg-slate-950/80'
      }`}
    >
      {/* Top Bar: Official Stream Ticker & Brand Badge */}
      <div className="flex items-center justify-between w-full">
        {/* Left: Vintage Vibes Live Badge */}
        <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-amber-400/60 shadow-2xl">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xs shadow-md">
            VV
          </div>
          <div>
            <span className="font-serif font-black text-white text-sm tracking-wider block">
              VINTAGE VIBES DUBAI
            </span>
            <span className="text-[10px] font-mono text-amber-300 font-bold uppercase tracking-widest block">
              AUTHENTIC 1-OF-1 ARCHIVE
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ml-2 animate-pulse shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            LIVE
          </span>
        </div>

        {/* Right: Live Claim Notification Toast */}
        {recentTickerClaim && (
          <div className="bg-black/85 backdrop-blur-md border border-amber-400/70 rounded-xl px-4 py-2 text-white shadow-2xl flex items-center gap-3 animate-slide-in">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
            </div>
            <div className="text-xs">
              <span className="text-amber-400 font-bold font-mono">{recentTickerClaim.customerHandle}</span>{' '}
              <span className="text-slate-300">just claimed</span>{' '}
              <span className="font-mono font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                {recentTickerClaim.sku}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area: Main Lower-Third Product Showcase Card */}
      {activePiece ? (
        <div className="w-full max-w-2xl bg-gradient-to-r from-black/95 via-slate-950/95 to-black/90 backdrop-blur-xl border-2 border-amber-400/80 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white relative animate-fade-in">
          <div className="flex items-center gap-4">
            {/* High-res Garment Image with glowing gold frame */}
            <div className="relative shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-400/90 shadow-xl bg-black">
                <img
                  src={activePiece.frontImageUrl || '/vintage_vibes_seal.svg'}
                  alt={activePiece.itemName}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute -top-2 -left-2 bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-md animate-pulse">
                ON AIR NOW
              </span>
              <span className="absolute bottom-1 right-1 bg-black/80 text-amber-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                {activePiece.labelGrade || 'Grade A'}
              </span>
            </div>

            {/* Product Details & Dual Price */}
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest truncate">
                  {activePiece.brandName} • {activePiece.style || 'Vintage Archive'}
                </span>
                <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                  Size: {activePiece.sizeScanned}
                </span>
              </div>

              <h3 className="font-serif font-black text-base sm:text-lg text-white leading-tight truncate">
                {activePiece.itemName}
              </h3>

              {/* Price Tag Bar */}
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-3 py-1 rounded-lg font-mono font-black text-sm shadow-md">
                  AED {priceAed}
                  <span className="text-xs font-bold text-slate-800 ml-1">/ ${priceUsd}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-300">Origin: {activePiece.countryOfOrigin || 'USA'}</span>
              </div>

              {/* Auto-Claim Command Callout Bar */}
              <div className="bg-amber-400/10 border border-amber-400/50 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-sans text-amber-200">
                  Comment in chat to lock & purchase:
                </span>
                <span className="font-mono text-xs font-black text-amber-400 tracking-wider bg-black/60 px-2 py-0.5 rounded border border-amber-500/60 shadow-inner">
                  MINE {activePiece.barcode}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Standby Watermark when no piece is on-air */
        <div className="bg-black/60 backdrop-blur-sm border border-amber-400/30 rounded-xl px-4 py-2.5 text-xs text-amber-200/80 self-start flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Live Stream Ready • Waiting for host to scan next piece...</span>
        </div>
      )}
    </div>
  );
};

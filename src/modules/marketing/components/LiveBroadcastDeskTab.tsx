import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Play,
  Square,
  Barcode,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Layers,
  Tv,
  Eye,
  Flame,
  CheckCircle2,
  Clock,
  RefreshCw,
  Tag,
  Share2,
  Video,
  MonitorPlay,
  Zap,
  Globe,
  FastForward,
  Rewind,
  Pause,
  Smartphone,
  ChevronRight
} from 'lucide-react';
import { LiveStreamSessionStatus } from '../marketing.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { LiveStreamService, LiveBooth } from '../../../services/liveStreamService.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';

export const LiveBroadcastDeskTab: React.FC = () => {
  const [session, setSession] = useState<LiveStreamSessionStatus | null>(null);
  const [selectedBooth, setSelectedBooth] = useState('booth_01');
  const [scannerInput, setScannerInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTogglingStream, setIsTogglingStream] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [obsTheme, setObsTheme] = useState<'gold' | 'neon' | 'noir'>('gold');
  const [obsTransparentBg, setObsTransparentBg] = useState(true);
  const [availablePieces, setAvailablePieces] = useState<PieceBreakdownItem[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 24/7 AUTO-PRESENTER ENGINE STATES
  // ==========================================
  const [isAutoPresenterActive, setIsAutoPresenterActive] = useState(false);
  const [autoPresenterPaused, setAutoPresenterPaused] = useState(false);
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState(30);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [selectedCategorySequence, setSelectedCategorySequence] = useState<string>('CATEGORY_SEQUENCE');
  const [rotationQueue, setRotationQueue] = useState<PieceBreakdownItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);

  // Helper: Build organized queue based on category sequence
  const buildRotationQueue = (pieces: PieceBreakdownItem[], sequenceMode: string): PieceBreakdownItem[] => {
    const inStock = pieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
    if (inStock.length === 0) return [];

    if (sequenceMode === 'CATEGORY_SEQUENCE') {
      // 1. Mens items first
      const mens = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('men') || text.includes('jacket') || text.includes('denim') || text.includes('hoodie');
      });
      // 2. Ladies items next
      const ladies = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return !mens.includes(p) && (text.includes('lad') || text.includes('women') || text.includes('dress') || text.includes('skirt') || text.includes('knit'));
      });
      // 3. Cream / Grade A
      const cream = inStock.filter(p => {
        const grade = `${p.labelGrade || ''}`.toLowerCase();
        return !mens.includes(p) && !ladies.includes(p) && (grade.includes('cream') || grade.includes('grade a'));
      });
      // 4. Remaining vintage
      const others = inStock.filter(p => !mens.includes(p) && !ladies.includes(p) && !cream.includes(p));

      const combined = [...mens, ...ladies, ...cream, ...others];
      return combined.length > 0 ? combined : inStock;
    }

    if (sequenceMode === 'CREAM_GRADE_A') {
      const filtered = inStock.filter(p => `${p.labelGrade || ''}`.toLowerCase().includes('cream') || `${p.labelGrade || ''}`.toLowerCase().includes('grade a'));
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'VINTAGE_ARCHIVE') {
      const filtered = inStock.filter(p => `${p.style || ''} ${p.brandTier || ''} ${p.itemName || ''}`.toLowerCase().includes('vintage') || `${p.brandTier || ''}`.toLowerCase().includes('luxury'));
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'MENS_ONLY') {
      const filtered = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('men') || text.includes('jacket') || text.includes('denim') || text.includes('hoodie');
      });
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'LADIES_ONLY') {
      const filtered = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('lad') || text.includes('women') || text.includes('dress') || text.includes('skirt') || text.includes('knit');
      });
      return filtered.length > 0 ? filtered : inStock;
    }

    return inStock;
  };

  const fetchSessionStatus = async () => {
    try {
      const [liveBooths, allPieces] = await Promise.all([
        LiveStreamService.getBooths(),
        PurchaseService.getPieces()
      ]);
      const currentBooth = liveBooths.find(b => b.id === selectedBooth) || liveBooths[0];
      const inStock = (allPieces || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
      setAvailablePieces(inStock);

      const activeOnAir = inStock.find((p: PieceBreakdownItem) => p.barcode === currentBooth?.active_product_sku || p.id === currentBooth?.active_product_sku) || inStock[0] || null;

      setSession({
        isBroadcasting: Boolean(currentBooth?.is_broadcasting),
        startedAt: currentBooth?.is_broadcasting ? (sessionStartTime || Date.now() - 300000) : null,
        uptimeSeconds: currentBooth?.is_broadcasting ? Math.floor((Date.now() - (sessionStartTime || Date.now() - 300000)) / 1000) : 0,
        activeBoothId: currentBooth?.id || selectedBooth,
        activeBoothName: currentBooth?.booth_name || 'Live Booth 01',
        activeOnAirPiece: activeOnAir,
        scannerFeed: [],
        totalClaimsInSession: currentBooth?.viewer_count || 14,
        totalRevenueAedInSession: Number(currentBooth?.current_deal_price || 0),
        obsOverlayUrl: `${window.location.origin}/live-overlay?booth=${selectedBooth}`
      });
    } catch (err) {
      console.warn('Error fetching live session status from Supabase:', err);
    }
  };

  useEffect(() => {
    fetchSessionStatus();
    const interval = setInterval(fetchSessionStatus, 5000);
    return () => clearInterval(interval);
  }, [selectedBooth]);

  // Sync available pieces into rotation queue
  useEffect(() => {
    if (availablePieces.length > 0) {
      const queue = buildRotationQueue(availablePieces, selectedCategorySequence);
      setRotationQueue(queue);
    }
  }, [availablePieces, selectedCategorySequence]);

  // ==========================================
  // AUTO-PRESENTER TIMER LOOP
  // ==========================================
  useEffect(() => {
    if (!isAutoPresenterActive || autoPresenterPaused || rotationQueue.length === 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          const nextIdx = (currentQueueIndex + 1) % rotationQueue.length;
          setCurrentQueueIndex(nextIdx);
          const nextPiece = rotationQueue[nextIdx];
          if (nextPiece) {
            LiveStreamService.updateBooth(selectedBooth, {
              is_broadcasting: true,
              active_product_sku: nextPiece.barcode || nextPiece.id,
              current_deal_price: Number(nextPiece.retailPriceAed || nextPiece.estimatedPrice || nextPiece.costPrice || 0)
            }).then(() => fetchSessionStatus()).catch(e => console.warn('Auto-rotation update error:', e));
          }
          return autoIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoPresenterActive, autoPresenterPaused, rotationQueue, currentQueueIndex, selectedBooth, autoIntervalSeconds]);

  // Toggle Auto-Presenter On/Off
  const handleToggleAutoPresenter = async () => {
    const newState = !isAutoPresenterActive;
    setIsAutoPresenterActive(newState);

    if (newState) {
      if (!isBroadcasting) {
        await handleToggleStream(true);
      }
      const queue = buildRotationQueue(availablePieces, selectedCategorySequence);
      setRotationQueue(queue);
      setCurrentQueueIndex(0);
      setTimeRemaining(autoIntervalSeconds);
      setAutoPresenterPaused(false);

      if (queue.length > 0) {
        const first = queue[0];
        await LiveStreamService.updateBooth(selectedBooth, {
          is_broadcasting: true,
          active_product_sku: first.barcode || first.id,
          current_deal_price: Number(first.retailPriceAed || first.estimatedPrice || 0)
        });
        await fetchSessionStatus();
      }
    }
  };

  const handleSkipNext = async () => {
    if (rotationQueue.length === 0) return;
    const nextIdx = (currentQueueIndex + 1) % rotationQueue.length;
    setCurrentQueueIndex(nextIdx);
    setTimeRemaining(autoIntervalSeconds);
    const nextPiece = rotationQueue[nextIdx];
    if (nextPiece) {
      await LiveStreamService.updateBooth(selectedBooth, {
        active_product_sku: nextPiece.barcode || nextPiece.id,
        current_deal_price: Number(nextPiece.retailPriceAed || nextPiece.estimatedPrice || 0)
      });
      await fetchSessionStatus();
    }
  };

  const handleSkipPrev = async () => {
    if (rotationQueue.length === 0) return;
    const prevIdx = (currentQueueIndex - 1 + rotationQueue.length) % rotationQueue.length;
    setCurrentQueueIndex(prevIdx);
    setTimeRemaining(autoIntervalSeconds);
    const prevPiece = rotationQueue[prevIdx];
    if (prevPiece) {
      await LiveStreamService.updateBooth(selectedBooth, {
        active_product_sku: prevPiece.barcode || prevPiece.id,
        current_deal_price: Number(prevPiece.retailPriceAed || prevPiece.estimatedPrice || 0)
      });
      await fetchSessionStatus();
    }
  };

  // Format uptime
  const formatUptime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Toggle Stream On / Off directly in Supabase
  const handleToggleStream = async (start: boolean) => {
    setIsTogglingStream(true);
    try {
      if (start) setSessionStartTime(Date.now());
      else {
        setSessionStartTime(null);
        setIsAutoPresenterActive(false);
      }
      await LiveStreamService.updateBooth(selectedBooth, { is_broadcasting: start });
      await LiveStreamService.updateMulticastSettings({ is_live: start });
      await fetchSessionStatus();
    } catch (err) {
      console.warn('Error toggling live stream:', err);
    } finally {
      setIsTogglingStream(false);
    }
  };

  // Handle Scan Barcode directly with Supabase inventory
  const handleScanBarcode = async (codeToScan?: string) => {
    const code = (codeToScan || scannerInput).trim().toUpperCase();
    if (!code) return;

    setIsScanning(true);
    setScanMessage(null);

    try {
      const allPieces = await PurchaseService.getPieces();
      const matched = allPieces.find((p: PieceBreakdownItem) => p.barcode === code || p.id === code);
      if (matched) {
        await LiveStreamService.updateBooth(selectedBooth, {
          active_product_sku: matched.barcode || matched.id,
          current_deal_price: Number(matched.retailPriceAed || matched.costPrice || 0)
        });
        setScanMessage({ type: 'success', text: `Loaded piece: ${matched.itemName || code} (AED ${matched.retailPriceAed || 0})` });
        setScannerInput('');
        await fetchSessionStatus();
      } else {
        setScanMessage({ type: 'error', text: `Barcode '${code}' not found in inventory pieces` });
      }
    } catch (err: any) {
      setScanMessage({ type: 'error', text: err?.message || 'Scanner request failed' });
    } finally {
      setIsScanning(false);
      scannerInputRef.current?.focus();
    }
  };

  const obsOverlayFullUrl = `${window.location.origin}/live-overlay?booth=${selectedBooth}&theme=${obsTheme}&transparent=${obsTransparentBg ? '1' : '0'}`;

  const handleCopyObsUrl = () => {
    navigator.clipboard.writeText(obsOverlayFullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const isBroadcasting = Boolean(session?.isBroadcasting);
  const activePiece = session?.activeOnAirPiece;
  const progressPercent = autoIntervalSeconds > 0 ? Math.round(((autoIntervalSeconds - timeRemaining) / autoIntervalSeconds) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 1. STREAM CONTROLLER BAR: MULTI-PLATFORM & OBS SOURCE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                isBroadcasting
                  ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse shadow-lg shadow-red-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif font-bold text-lg text-white">
                  Multi-Channel Live Stream Broadcast Desk
                </h3>
                {isBroadcasting ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-black tracking-widest uppercase flex items-center gap-1.5 shadow-md animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                    ON AIR LIVE
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-mono">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified live selling control across TikTok, Instagram, YouTube & Facebook with instant OBS overlays.
              </p>
            </div>
          </div>

          {/* Start / Stop Toggle Button */}
          <div className="flex items-center gap-3 self-end lg:self-center">
            {isBroadcasting && (
              <div className="text-right font-mono mr-2 hidden sm:block">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Broadcast Uptime</span>
                <span className="text-base font-black text-amber-400">
                  {formatUptime(session?.uptimeSeconds || 0)}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleToggleStream(!isBroadcasting)}
              disabled={isTogglingStream}
              className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer ${
                isBroadcasting
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {isBroadcasting ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>⏹️ END STREAM</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>🔴 START LIVE STREAM</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Multi-Platform Social Stream Badges */}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2 pt-1 border-b border-slate-800 pb-3">
          <span className="text-[11px] font-mono uppercase font-bold text-slate-400">
            Multi-Cast Stream Targets:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-slate-700 text-xs font-mono text-amber-300 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              TikTok Live <span className="text-[10px] text-emerald-400 font-bold">● Active</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-slate-700 text-xs font-mono text-rose-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-rose-400" />
              Instagram Live <span className="text-[10px] text-emerald-400 font-bold">● Active</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-slate-700 text-xs font-mono text-red-300 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-red-500" />
              YouTube Live <span className="text-[10px] text-emerald-400 font-bold">● Active</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-slate-700 text-xs font-mono text-blue-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              Facebook Live <span className="text-[10px] text-emerald-400 font-bold">● Active</span>
            </span>
          </div>
        </div>

        {/* OBS Browser Source Generator Configuration */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Active Stream Booth
            </label>
            <select
              value={selectedBooth}
              onChange={e => setSelectedBooth(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              <option value="booth_01">Booth 01 - Main Stage (Vintage Denim & Tees)</option>
              <option value="booth_02">Booth 02 - Rare Grails (Cream Grade A)</option>
              <option value="booth_03">Booth 03 - Wholesale B2B Bales</option>
              <option value="booth_04">Booth 04 - Flash Auction Desk</option>
              <option value="booth_05">Booth 05 - VIP Archive Clearance</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              OBS Theme
            </label>
            <select
              value={obsTheme}
              onChange={e => setObsTheme(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              <option value="gold">Vintage Gold Luxury</option>
              <option value="neon">Cyber Streetwear Neon</option>
              <option value="noir">Minimalist Heritage Noir</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Direct OBS Browser Source URL:
            </label>
            <input
              type="text"
              readOnly
              value={obsOverlayFullUrl}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-amber-300 select-all"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyObsUrl}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
              title="Copy URL for OBS Studio Browser Source"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Copied' : 'Copy OBS'}</span>
            </button>
            <a
              href={obsOverlayFullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer shrink-0"
              title="Open OBS Overlay HUD in New Tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 24/7 AUTO-PRESENTER STREAM ENGINE (CATEGORY-WISE AUTO-CAROUSEL) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border-2 border-amber-500/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-serif font-black text-base text-white">
                  ⚡ 24/7 Auto-Presenter Stream Engine
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-mono font-bold uppercase">
                  Automated Multi-Cast
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Automatically rotates through in-stock pieces category-wise without requiring a physical host.
              </p>
            </div>
          </div>

          {/* Toggle Auto-Presenter Button */}
          <button
            type="button"
            onClick={handleToggleAutoPresenter}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-xl transition flex items-center gap-2 cursor-pointer ${
              isAutoPresenterActive
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/30 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
            }`}
          >
            {isAutoPresenterActive ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>⏹ STOP AUTO-PRESENTER</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>⚡ START AUTO-PRESENTER STREAM</span>
              </>
            )}
          </button>
        </div>

        {/* Controls: Category Sequence & Interval Speed */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-amber-200 uppercase tracking-wider block mb-1">
              Category Sequence Mode:
            </label>
            <select
              value={selectedCategorySequence}
              onChange={e => setSelectedCategorySequence(e.target.value)}
              className="w-full bg-slate-950 border border-amber-400/40 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
            >
              <option value="CATEGORY_SEQUENCE">
                🔥 Category Sequence (Men's ➔ Ladies ➔ Cream Grade A ➔ Vintage Archive)
              </option>
              <option value="ALL_IN_STOCK">📦 All In-Stock Inventory (Continuous Shuffle)</option>
              <option value="CREAM_GRADE_A">✨ Cream Grade A Garments Only</option>
              <option value="VINTAGE_ARCHIVE">🏛️ Vintage Archive & Rare Grails Only</option>
              <option value="MENS_ONLY">👔 Men's Outerwear, Denim & Hoodies Only</option>
              <option value="LADIES_ONLY">👗 Ladies Knitwear, Dresses & Tops Only</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-[11px] font-bold text-amber-200 uppercase tracking-wider block mb-1">
              Rotation Speed (Seconds per Piece):
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[15, 30, 45, 60].map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setAutoIntervalSeconds(sec);
                    setTimeRemaining(sec);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer text-center ${
                    autoIntervalSeconds === sec
                      ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                      : 'bg-slate-950 text-slate-300 border border-slate-700 hover:border-amber-400'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Live Auto-Timer Telemetry */}
          <div className="md:col-span-4 bg-black/60 border border-amber-400/40 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-mono text-amber-300 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                {isAutoPresenterActive
                  ? autoPresenterPaused
                    ? 'PAUSED'
                    : `Next piece in: ${timeRemaining}s`
                  : 'Engine Standby'}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Queue: {rotationQueue.length > 0 ? `${currentQueueIndex + 1}/${rotationQueue.length}` : '0'}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${isAutoPresenterActive ? progressPercent : 0}%` }}
              />
            </div>

            {/* Manual Step Controls */}
            {isAutoPresenterActive && (
              <div className="flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleSkipPrev}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                >
                  <Rewind className="w-3 h-3" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPresenterPaused(!autoPresenterPaused)}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  {autoPresenterPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {autoPresenterPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={handleSkipNext}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                >
                  Next <FastForward className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LIVE ON-AIR SPOTLIGHT & MANUAL DESK SCANNER */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Manual Barcode Scanner & Inventory Queue */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-slate-800" />
                <h4 className="font-bold text-slate-900 text-sm">Host Desk Barcode Scanner (Manual Mode)</h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                USB Gun Ready
              </span>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Scan garment tag or enter SKU to immediately override auto-presenter and push this specific piece on-air.
            </p>

            <div className="flex items-center gap-2">
              <input
                ref={scannerInputRef}
                type="text"
                value={scannerInput}
                onChange={e => setScannerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScanBarcode()}
                placeholder="Scan barcode (e.g. VV-BAL-001-0001)"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => handleScanBarcode()}
                disabled={isScanning || !scannerInput.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span>{isScanning ? 'Loading...' : 'Air'}</span>
              </button>
            </div>

            {scanMessage && (
              <div
                className={`mt-2.5 p-2 rounded text-xs flex items-center gap-1.5 ${
                  scanMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {scanMessage.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Flame className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                <span>{scanMessage.text}</span>
              </div>
            )}

            {/* Quick Click Samples from available inventory */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                Available In-Stock Pieces ({availablePieces.length}):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {availablePieces.slice(0, 10).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleScanBarcode(p.barcode)}
                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded text-[11px] font-mono text-amber-950 transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{p.barcode}</span>
                    <span className="text-slate-500 text-[10px]">({p.brandName})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Up Next in Auto-Presenter Queue */}
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Up Next in Stream Queue</span>
              <span className="font-mono text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {rotationQueue.length} Pieces Sequenced
              </span>
            </h4>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {rotationQueue.length > 0 ? (
                rotationQueue.slice(currentQueueIndex, currentQueueIndex + 6).map((piece, idx) => (
                  <div
                    key={piece.id || idx}
                    onClick={() => handleScanBarcode(piece.barcode)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                      idx === 0
                        ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={piece.frontImageUrl || piece.images?.[0] || '/vintage_logo.svg'}
                        alt=""
                        className="w-9 h-9 rounded object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{piece.barcode}</span>
                          {idx === 0 && (
                            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-bold rounded">
                              ON-AIR
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 truncate max-w-[170px] block">
                          {piece.itemName}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="font-bold text-emerald-700 block">
                        AED {piece.retailPriceAed || piece.estimatedPrice || piece.costPrice}
                      </span>
                      <span className="text-[10px] text-slate-400">{piece.labelGrade || 'Grade A'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No pieces available in this category sequence.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live On-Air Piece Spotlight Card */}
        <div className="lg:col-span-7">
          <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-400/80 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden">
            {/* Background luxury gradient glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {/* Header Status Bar */}
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                  <span className="font-mono text-xs uppercase font-bold text-amber-400 tracking-wider">
                    CURRENT ON-AIR SPOTLIGHT PIECE
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {selectedBooth.toUpperCase()} • Multi-Cast 1080p
                </span>
              </div>

              {activePiece ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                  {/* Garment Image */}
                  <div className="sm:col-span-5 relative group">
                    <div className="aspect-square w-full rounded-2xl overflow-hidden border-2 border-amber-400/70 bg-black/60 shadow-xl">
                      <img
                        src={activePiece.frontImageUrl || activePiece.images?.[0] || '/vintage_logo.svg'}
                        alt={activePiece.itemName}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                    <span className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded text-[10px] font-mono text-amber-300 font-bold border border-amber-500/40">
                      {activePiece.labelGrade || 'Grade A Archive'}
                    </span>
                  </div>

                  {/* Garment Details & Claim Callout */}
                  <div className="sm:col-span-7 space-y-3">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
                        {activePiece.brandName} • {activePiece.style || 'Vintage Classic'}
                      </span>
                      <h3 className="font-serif font-bold text-xl text-white mt-0.5 leading-snug">
                        {activePiece.itemName}
                      </h3>
                    </div>

                    {/* Pricing & Size Pills */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-3.5 py-1.5 rounded-xl font-mono font-black text-base shadow-sm">
                        AED {activePiece.retailPriceAed || activePiece.estimatedPrice || 120}
                        <span className="text-xs font-bold text-slate-800 ml-1">
                          / ${Math.round((activePiece.retailPriceAed || activePiece.estimatedPrice || 120) * 0.272)}
                        </span>
                      </div>

                      <span className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200">
                        SIZE: {activePiece.sizeScanned || 'L'}
                      </span>
                      <span className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200">
                        ORIGIN: {activePiece.countryOfOrigin || 'USA / Europe'}
                      </span>
                    </div>

                    {/* Big Bold SKU Box for Live Stream Chat Claiming */}
                    <div className="bg-black/60 border-2 border-amber-400/80 rounded-xl p-3 shadow-inner">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                        Social Stream Chat Claim Command:
                      </span>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="font-mono text-lg font-black text-amber-300 tracking-wider">
                          MINE {activePiece.barcode}
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                          INSTANT LOCK
                        </span>
                      </div>
                    </div>

                    {/* Authenticity Guarantee Seal Banner */}
                    <div className="flex items-center gap-2 text-xs text-amber-200/90 pt-1">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>100% Certified Authentic Vintage • Ready for Instant Despatch</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center space-y-3">
                  <MonitorPlay className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                  <h4 className="font-bold text-base text-slate-300">No Piece Currently On Air</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Activate the 24/7 Auto-Presenter above or scan a barcode to air pieces on your live stream.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

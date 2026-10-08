import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  X,
  Volume2,
  VolumeX,
  Radio,
  TrendingUp,
  Clock,
  Zap,
  RefreshCw,
  Tv,
  CheckCircle2,
  Wifi,
  Package,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { soundEffects } from '../utils/soundEffects.ts';
import { supabase } from '../supabaseClient.ts';

interface ExecutiveCommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGrossRevenue?: number;
}

interface LiveBoothTelemetry {
  boothId: string;
  boothName: string;
  hostName: string;
  isBroadcasting: boolean;
  streamHealth: string;
  fps: number;
  bitrateKbps: number;
  viewerCount: number;
  itemsClaimed: number;
  netRevenueAed: number;
  itemsSoldPerMin: number;
  activeOnAirSku: string | null;
  currentDealPrice: number;
  activePieceDetails?: {
    itemName: string;
    brandName: string;
    retailPriceAed: number;
    category: string;
    size?: string;
    style?: string;
    imageUrl?: string;
  } | null;
  destinations?: Array<{
    platform: string;
    isConnected: boolean;
  }>;
}

interface RealSaleItem {
  id: string;
  reference: string;
  title: string;
  priceAed: number;
  buyer: string;
  time: string;
  channel: string;
}

export const ExecutiveCommandCenterModal: React.FC<ExecutiveCommandCenterModalProps> = ({
  isOpen,
  onClose,
  initialGrossRevenue = 0
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundEffects.isEnabled());
  const [grossRevenue, setGrossRevenue] = useState(initialGrossRevenue);
  const [yesterdayGrossRevenue, setYesterdayGrossRevenue] = useState(0);
  const [liveClock, setLiveClock] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  
  // Real telemetry state
  const [booths, setBooths] = useState<LiveBoothTelemetry[]>([]);
  const [totalLiveViewers, setTotalLiveViewers] = useState<number>(0);
  const [salesVelocity, setSalesVelocity] = useState<number>(0);
  const [pendingSettlement, setPendingSettlement] = useState<{ totalAed: number; count: number }>({
    totalAed: 0,
    count: 0
  });
  const [recentSales, setRecentSales] = useState<RealSaleItem[]>([]);

  const previousSalesIdsRef = useRef<Set<string>>(new Set());

  // Clock in GST (Dubai Time)
  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Dubai',
          hour12: false
        });
        setLiveClock(timeStr + ' GST');
      } catch (_) {
        setLiveClock(new Date().toLocaleTimeString() + ' GST');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleToggleSound = () => {
    const next = soundEffects.toggleSound();
    setSoundEnabled(next);
  };

  // ==========================================
  // REAL TELEMETRY FETCH ENGINE
  // ==========================================
  const fetchLiveTelemetry = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsSyncing(true);
    try {
      // 1. Fetch live booth statuses from backend API
      let boothsData: LiveBoothTelemetry[] = [];
      try {
        const res = await fetch('/api/live/booths', { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.booths)) {
            boothsData = json.booths;
          }
        }
      } catch (err) {
        console.warn('[ExecutiveLiveDesk] Warning fetching booths from API:', err);
      }

      // If API returned empty, fallback to live_stream_booths table
      if (boothsData.length === 0) {
        try {
          const { data: dbBooths } = await supabase
            .from('live_stream_booths')
            .select('*')
            .order('booth_id');
          if (Array.isArray(dbBooths) && dbBooths.length > 0) {
            boothsData = dbBooths.map((b: any) => ({
              boothId: b.booth_id,
              boothName: b.booth_name || `Booth ${b.booth_id}`,
              hostName: b.host_name || 'No Host Assigned',
              isBroadcasting: Boolean(b.is_broadcasting),
              streamHealth: b.stream_health || 'OFFLINE',
              fps: Number(b.fps || 0),
              bitrateKbps: Number(b.bitrate_kbps || 0),
              viewerCount: Number(b.viewer_count || 0),
              itemsClaimed: Number(b.items_claimed || 0),
              netRevenueAed: Number(b.net_revenue_aed || 0),
              itemsSoldPerMin: Number(b.items_sold_per_min || 0),
              activeOnAirSku: b.active_on_air_sku || null,
              currentDealPrice: Number(b.current_deal_price || 0)
            }));
          }
        } catch (_) {}
      }

      // Lookup piece details for any activeOnAirSku
      const activeSkus = boothsData.map(b => b.activeOnAirSku).filter(Boolean) as string[];
      let pieceMap = new Map<string, any>();
      if (activeSkus.length > 0) {
        try {
          const { data: pieces } = await supabase
            .from('inventory_pieces')
            .select('barcode, sku, item_name, brand_name, retail_price_aed, estimated_price, cost_price, parent_category_name, sub_category, style, front_image_url')
            .in('barcode', activeSkus);
          if (Array.isArray(pieces)) {
            pieces.forEach(p => {
              if (p.barcode) pieceMap.set(p.barcode, p);
              if (p.sku) pieceMap.set(p.sku, p);
            });
          }
        } catch (_) {}
      }

      const enrichedBooths = boothsData.map(b => {
        const p = b.activeOnAirSku ? pieceMap.get(b.activeOnAirSku) : null;
        return {
          ...b,
          activePieceDetails: p ? {
            itemName: p.item_name || 'Curated Garment',
            brandName: p.brand_name || 'Vintage',
            retailPriceAed: Number(p.retail_price_aed || p.estimated_price || b.currentDealPrice || 0),
            category: p.parent_category_name || p.sub_category || 'Vintage Apparel',
            style: p.style || undefined,
            imageUrl: p.front_image_url || undefined
          } : null
        };
      });

      setBooths(enrichedBooths);

      // Sum of active live viewers across broadcasting booths
      const viewersSum = enrichedBooths.reduce((sum, b) => sum + (b.isBroadcasting ? (b.viewerCount || 0) : 0), 0);
      setTotalLiveViewers(viewersSum);

      // 2. Fetch real sales and compute Today's Gross Revenue
      const todayIso = new Date().toISOString().split('T')[0];
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayIso = yesterdayDate.toISOString().split('T')[0];

      const [invRes, posRes, liveSalesRes] = await Promise.all([
        supabase
          .from('sales_invoices')
          .select('id, invoice_no, total_amount, customer_name, channel, created_at, status')
          .neq('status', 'VOID')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('pos_sales')
          .select('id, invoice_number, grand_total, customer_name, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('live_stream_sales')
          .select('id, piece_id, price_aed, buyer_username, created_at')
          .order('created_at', { ascending: false })
          .limit(30)
      ]);

      let todayTotal = 0;
      let yesterdayTotal = 0;
      const combinedRecent: RealSaleItem[] = [];

      // Process Sales Invoices
      if (Array.isArray(invRes.data)) {
        invRes.data.forEach((inv: any) => {
          const invDate = (inv.created_at || '').split('T')[0];
          const amt = Number(inv.total_amount || 0);
          if (invDate === todayIso) todayTotal += amt;
          else if (invDate === yesterdayIso) yesterdayTotal += amt;

          combinedRecent.push({
            id: String(inv.id),
            reference: inv.invoice_no || `INV-${String(inv.id).slice(-4)}`,
            title: `Sales Invoice #${inv.invoice_no || inv.id}`,
            priceAed: amt,
            buyer: inv.customer_name || 'Retail Client',
            time: inv.created_at,
            channel: inv.channel || 'WHOLESALE'
          });
        });
      }

      // Process POS Sales
      if (Array.isArray(posRes.data)) {
        posRes.data.forEach((pos: any) => {
          const posDate = (pos.created_at || '').split('T')[0];
          const amt = Number(pos.grand_total || 0);
          if (posDate === todayIso) todayTotal += amt;
          else if (posDate === yesterdayIso) yesterdayTotal += amt;

          combinedRecent.push({
            id: String(pos.id),
            reference: pos.invoice_number || `POS-${String(pos.id).slice(-4)}`,
            title: `Counter POS Sale #${pos.invoice_number || pos.id}`,
            priceAed: amt,
            buyer: pos.customer_name || 'Walk-in Customer',
            time: pos.created_at,
            channel: 'POS_STORE'
          });
        });
      }

      // Process Live Stream Sales
      if (Array.isArray(liveSalesRes.data)) {
        liveSalesRes.data.forEach((ls: any) => {
          const lsDate = (ls.created_at || '').split('T')[0];
          const amt = Number(ls.price_aed || 0);
          if (lsDate === todayIso) todayTotal += amt;
          else if (lsDate === yesterdayIso) yesterdayTotal += amt;

          combinedRecent.push({
            id: String(ls.id),
            reference: `LIVE-${String(ls.id).slice(-4)}`,
            title: `Live Claim Garment`,
            priceAed: amt,
            buyer: ls.buyer_username || 'Live Viewer',
            time: ls.created_at,
            channel: 'LIVE_AUCTION'
          });
        });
      }

      // Sort recent sales descending by time
      combinedRecent.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      // Play audio chime if a brand new sale arrived
      if (previousSalesIdsRef.current.size > 0 && combinedRecent.length > 0) {
        const newest = combinedRecent[0];
        if (!previousSalesIdsRef.current.has(newest.id)) {
          soundEffects.playCashChime();
        }
      }
      previousSalesIdsRef.current = new Set(combinedRecent.map(s => s.id));

      setGrossRevenue(todayTotal);
      setYesterdayGrossRevenue(yesterdayTotal);

      // Format relative time for recent transactions
      const formattedRecent = combinedRecent.slice(0, 8).map(s => {
        let relativeTime = 'Just now';
        try {
          const diffMs = Date.now() - new Date(s.time).getTime();
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 1) relativeTime = 'Just now';
          else if (diffMins < 60) relativeTime = `${diffMins}m ago`;
          else relativeTime = `${Math.floor(diffMins / 60)}h ago`;
        } catch (_) {}
        return { ...s, time: relativeTime };
      });
      setRecentSales(formattedRecent);

      // 3. Compute real live sales velocity (pieces sold in last 60 minutes / 60)
      const oneHourAgo = Date.now() - 3600000;
      const salesLastHour = combinedRecent.filter(s => new Date(s.time).getTime() >= oneHourAgo).length;
      const velocity = Number((salesLastHour / 60).toFixed(2));
      setSalesVelocity(velocity);

      // 4. Compute real Pending Settlement (Holds)
      // Check inventory_pieces on hold or locked
      const [holdsPieces, draftInvoices] = await Promise.all([
        supabase
          .from('inventory_pieces')
          .select('id, retail_price_aed, estimated_price')
          .or(`locked_by_buyer.not.is.null,status.eq.RESERVED`),
        supabase
          .from('sales_invoices')
          .select('id, total_amount')
          .or(`payment_status.eq.PENDING,status.eq.DRAFT`)
      ]);

      let holdCount = 0;
      let holdTotalAed = 0;

      if (Array.isArray(holdsPieces.data)) {
        holdCount += holdsPieces.data.length;
        holdTotalAed += holdsPieces.data.reduce((acc, p) => acc + Number(p.retail_price_aed || p.estimated_price || 0), 0);
      }
      if (Array.isArray(draftInvoices.data)) {
        holdCount += draftInvoices.data.length;
        holdTotalAed += draftInvoices.data.reduce((acc, i) => acc + Number(i.total_amount || 0), 0);
      }

      setPendingSettlement({
        totalAed: holdTotalAed,
        count: holdCount
      });

      setLastSyncTime(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    } catch (error) {
      console.warn('[ExecutiveLiveDesk] Telemetry fetch warning:', error);
    } finally {
      if (isManualRefresh) {
        setTimeout(() => setIsSyncing(false), 500);
      }
    }
  }, []);

  // Initial load and periodic polling
  useEffect(() => {
    if (!isOpen) return;
    fetchLiveTelemetry();

    // 1. Polling interval (every 8 seconds for rock-solid freshness)
    const timer = setInterval(() => {
      fetchLiveTelemetry();
    }, 8000);

    // 2. Realtime subscription to live streaming, sales and inventory mutations
    const channel = supabase
      .channel('executive-live-trading-desk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_stream_booths' }, () => {
        fetchLiveTelemetry();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_booths' }, () => {
        fetchLiveTelemetry();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_pieces' }, () => {
        fetchLiveTelemetry();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_invoices' }, () => {
        fetchLiveTelemetry();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales' }, () => {
        fetchLiveTelemetry();
      })
      .subscribe();

    // 3. SSE event listener
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events/subscribe');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.module === 'SALES' ||
            payload.module === 'MARKETING' ||
            payload.entity === 'LIVE_STREAM' ||
            payload.entity === 'LIVE_CLAIM'
          ) {
            fetchLiveTelemetry();
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
      if (es) es.close();
    };
  }, [isOpen, fetchLiveTelemetry]);

  if (!isOpen) return null;

  // Percentage vs yesterday calculation
  const revenuePercentVsYesterday = yesterdayGrossRevenue > 0
    ? (((grossRevenue - yesterdayGrossRevenue) / yesterdayGrossRevenue) * 100).toFixed(1)
    : (grossRevenue > 0 ? '+100.0' : '+0.0');

  const activeBoothsCount = booths.filter(b => b.isBroadcasting).length;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#07080c] text-slate-100 flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200">
      {/* Top Trading Desk HUD Header */}
      <header className="px-5 py-3.5 bg-gradient-to-r from-stone-950 via-slate-900 to-amber-950/40 border-b border-amber-500/25 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${activeBoothsCount > 0 ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`} />
              <h1 className="font-cinzel text-sm md:text-base font-black tracking-widest text-amber-300 uppercase">
                Vintage Vibe • Executive Live Trading Desk
              </h1>
              <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded border ${
                activeBoothsCount > 0
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {activeBoothsCount > 0 ? `${activeBoothsCount} ON-AIR` : 'LIVE TELEMETRY'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              DUBAI CENTRAL WAREHOUSE • WALL-STREET COMMAND CONSOLE • {booths.length || 2} BROADCAST FLOORS CONFIGURED
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-lg bg-stone-900 border border-slate-800 font-mono text-xs text-amber-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{liveClock || 'DUBAI GST'}</span>
          </div>

          <button
            type="button"
            onClick={() => fetchLiveTelemetry(true)}
            disabled={isSyncing}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              isSyncing
                ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                : 'bg-stone-900 hover:bg-stone-800 border-slate-800 text-slate-300'
            }`}
            title={lastSyncTime ? `Synced at ${lastSyncTime}. Click to refresh telemetry` : 'Refresh Live Telemetry'}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                : 'bg-stone-900 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Mute Sound FX' : 'Enable Golden Chime & Alerts'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            title="Toggle TV Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 transition-colors cursor-pointer"
            title="Close Executive Terminal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Command Center Body */}
      <main className="flex-1 p-5 overflow-y-auto space-y-4 max-w-[1600px] mx-auto w-full">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {/* 1. Today's Gross Revenue */}
          <div className="p-4 rounded-xl bg-stone-950/90 border border-amber-500/30 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              TODAY'S GROSS REVENUE
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-amber-300 mt-1.5 tracking-tight">
              AED {grossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold mt-1">
              <span>{revenuePercentVsYesterday.startsWith('-') ? '▼' : '▲'} {revenuePercentVsYesterday}% vs yesterday</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-normal">(${Math.round(grossRevenue / 3.6725).toLocaleString()} USD)</span>
            </div>
          </div>

          {/* 2. Total Live Viewers */}
          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              TOTAL LIVE VIEWERS
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-blue-400 mt-1.5 tracking-tight">
              {totalLiveViewers.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${totalLiveViewers > 0 ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`} />
              <span>
                {activeBoothsCount > 0
                  ? `${activeBoothsCount} Floor${activeBoothsCount > 1 ? 's' : ''} Broadcasting`
                  : 'All Floors Standby'}
              </span>
            </div>
          </div>

          {/* 3. Live Sales Velocity */}
          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              LIVE SALES VELOCITY
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-purple-400 mt-1.5 tracking-tight">
              {salesVelocity.toFixed(1)} pcs/min
            </div>
            <div className="text-[11px] text-amber-400 font-bold mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>{salesVelocity > 0 ? 'Active Sales Liquidity' : 'Floor Idle • Ready for Drops'}</span>
            </div>
          </div>

          {/* 4. Pending Settlement (Holds) */}
          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              PENDING SETTLEMENT (HOLDS)
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-rose-400 mt-1.5 tracking-tight">
              AED {pendingSettlement.totalAed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rose-400/80 mt-1 font-mono">
              {pendingSettlement.count} claim{pendingSettlement.count === 1 ? '' : 's'} awaiting settlement
            </div>
          </div>
        </div>

        {/* Dual Floor Telemetry: Booth 1 & Booth 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Booth 1 Monitor */}
          {(() => {
            const b1 = booths[0] || {
              boothId: 'booth-1',
              boothName: 'Booth 1: Main Auction Floor',
              hostName: 'Host 1',
              isBroadcasting: false,
              streamHealth: 'OFFLINE',
              fps: 0,
              bitrateKbps: 0,
              viewerCount: 0,
              activeOnAirSku: null,
              currentDealPrice: 0
            };
            const p1 = b1.activePieceDetails;
            const isOnAir1 = b1.isBroadcasting;

            return (
              <div className={`rounded-2xl border ${isOnAir1 ? 'border-amber-500/40 bg-stone-950' : 'border-slate-800 bg-stone-950/80'} p-4 shadow-xl relative overflow-hidden flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${isOnAir1 ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                        {isOnAir1 ? '● ON AIR' : '○ STANDBY'}
                      </span>
                      <span className="font-black text-xs text-white uppercase tracking-wider">
                        {b1.boothName}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-amber-300 font-bold bg-stone-900 px-2.5 py-1 rounded-lg border border-slate-800">
                      Host: {b1.hostName} ({b1.viewerCount} Viewers)
                    </span>
                  </div>

                  {/* Central Active On-Air Frame */}
                  <div className="w-full h-44 rounded-xl bg-gradient-to-br from-stone-900 to-[#0c0e14] border border-amber-500/20 relative flex items-center justify-center overflow-hidden p-4">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.18)_0%,transparent_70%)] pointer-events-none" />
                    <div className="text-center z-10 space-y-1.5 max-w-md">
                      <span className="text-[10px] font-mono text-amber-400 font-extrabold uppercase tracking-widest">
                        {b1.activeOnAirSku ? `ACTIVE LOT: ${b1.activeOnAirSku}` : 'NO ACTIVE LOT ON AIR'}
                      </span>
                      <div className="text-base font-black text-white font-cinzel line-clamp-2">
                        {p1 ? `${p1.brandName ? p1.brandName + ' - ' : ''}${p1.itemName}` : (isOnAir1 ? 'WAITING FOR SCANNER DROP' : 'BROADCAST STANDBY')}
                      </div>
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono font-black text-xs">
                        <span>DEAL PRICE: AED {(p1?.retailPriceAed || b1.currentDealPrice || 0).toFixed(2)}</span>
                        {p1?.size && (
                          <>
                            <span className="text-amber-500">•</span>
                            <span className="text-emerald-400">SIZE {p1.size}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stream Health & Quality Indicator */}
                    <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>FEED: {b1.streamHealth}</span>
                      <span className="text-emerald-400 font-bold">
                        {isOnAir1 && b1.fps > 0 ? `${b1.fps} FPS • ${b1.bitrateKbps} kbps` : 'Camera Ready'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="truncate max-w-[280px]">
                    Category: {p1?.category || 'Vintage Apparel & Rare Grails'}
                  </span>
                  <span className={isOnAir1 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {isOnAir1 ? 'Live Streaming' : 'Floor Offline'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Booth 2 Monitor */}
          {(() => {
            const b2 = booths[1] || {
              boothId: 'booth-2',
              boothName: 'Booth 2: Premium Floor',
              hostName: 'Host 2',
              isBroadcasting: false,
              streamHealth: 'OFFLINE',
              fps: 0,
              bitrateKbps: 0,
              viewerCount: 0,
              activeOnAirSku: null,
              currentDealPrice: 0
            };
            const p2 = b2.activePieceDetails;
            const isOnAir2 = b2.isBroadcasting;

            return (
              <div className={`rounded-2xl border ${isOnAir2 ? 'border-blue-500/40 bg-stone-950' : 'border-slate-800 bg-stone-950/80'} p-4 shadow-xl relative overflow-hidden flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${isOnAir2 ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                        {isOnAir2 ? '● ON AIR' : '○ STANDBY'}
                      </span>
                      <span className="font-black text-xs text-white uppercase tracking-wider">
                        {b2.boothName}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-blue-300 font-bold bg-stone-900 px-2.5 py-1 rounded-lg border border-slate-800">
                      Host: {b2.hostName} ({b2.viewerCount} Viewers)
                    </span>
                  </div>

                  {/* Central Active On-Air Frame */}
                  <div className="w-full h-44 rounded-xl bg-gradient-to-br from-stone-900 to-[#0c0e14] border border-blue-500/20 relative flex items-center justify-center overflow-hidden p-4">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18)_0%,transparent_70%)] pointer-events-none" />
                    <div className="text-center z-10 space-y-1.5 max-w-md">
                      <span className="text-[10px] font-mono text-blue-400 font-extrabold uppercase tracking-widest">
                        {b2.activeOnAirSku ? `ACTIVE LOT: ${b2.activeOnAirSku}` : 'NO ACTIVE LOT ON AIR'}
                      </span>
                      <div className="text-base font-black text-white font-cinzel line-clamp-2">
                        {p2 ? `${p2.brandName ? p2.brandName + ' - ' : ''}${p2.itemName}` : (isOnAir2 ? 'WAITING FOR SCANNER DROP' : 'BROADCAST STANDBY')}
                      </div>
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/20 border border-blue-400 text-blue-300 font-mono font-black text-xs">
                        <span>DEAL PRICE: AED {(p2?.retailPriceAed || b2.currentDealPrice || 0).toFixed(2)}</span>
                        {p2?.size && (
                          <>
                            <span className="text-blue-500">•</span>
                            <span className="text-amber-300">SIZE {p2.size}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stream Health & Quality Indicator */}
                    <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>FEED: {b2.streamHealth}</span>
                      <span className="text-blue-400 font-bold">
                        {isOnAir2 && b2.fps > 0 ? `${b2.fps} FPS • ${b2.bitrateKbps} kbps` : 'Camera Ready'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="truncate max-w-[280px]">
                    Category: {p2?.category || 'Premium Outerwear & Knitwear'}
                  </span>
                  <span className={isOnAir2 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {isOnAir2 ? 'Live Streaming' : 'Floor Offline'}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Recent Transactions Stream */}
        <div className="bg-stone-950 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-mono font-extrabold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Real-Time Sales Log Stream</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>PostgreSQL Relational Ledger Sync</span>
            </span>
          </div>

          {recentSales.length === 0 ? (
            <div className="p-6 rounded-lg bg-stone-900/50 border border-dashed border-slate-800 text-center text-slate-500 font-mono text-xs">
              No sales logged yet today. Live stream ready for incoming transactions and POS counter sales.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {recentSales.map(c => (
                <div key={c.id} className="p-3 rounded-lg bg-stone-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-amber-400 font-bold truncate max-w-[140px]">{c.buyer}</span>
                      <span>{c.time}</span>
                    </div>
                    <h5 className="font-bold text-xs text-white mt-1 truncate">{c.title}</h5>
                    <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.2 rounded bg-stone-800 text-slate-400 border border-slate-700">
                      {c.channel}
                    </span>
                  </div>
                  <div className="text-sm font-mono font-black text-emerald-400 mt-2">
                    +AED {c.priceAed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Continuous Wall-Street Stock Ticker Tape */}
      <footer className="bg-stone-950 border-t border-amber-500/25 p-2.5 overflow-hidden flex items-center gap-3">
        <div className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider shrink-0 shadow-sm">
          LIVE TICKER 🔴
        </div>
        <div className="overflow-hidden w-full relative">
          <div className="inline-flex whitespace-nowrap animate-ticker text-xs font-mono font-bold text-slate-300 space-x-6">
            <span className="text-blue-300">FX: 1 USD = 3.6725 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-300">FX: 1 SAR = 0.9790 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-300">FX: 1 EUR = 4.0210 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">DATABASE: Supabase PostgreSQL Connected & Telemetry Active</span>
            <span className="text-slate-600">•</span>
            <span className="text-purple-300 font-black">GROSS BOOKED TODAY: AED {grossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-300">LOGISTICS HUB: Al Ain Central Consignment Terminal Active</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          display: inline-flex;
          white-space: nowrap;
          animation: ticker 32s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default ExecutiveCommandCenterModal;

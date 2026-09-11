import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Radio,
  Bot,
  Palette,
  Rss,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
  ShoppingBag,
  Flame,
  FileCheck2,
  RefreshCw,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { ChannelHealthStatus, MarketingQuickStats } from '../marketing.types.ts';
import { ChatClaimAutomationTab } from './ChatClaimAutomationTab.tsx';
import { LiveBroadcastDeskTab } from './LiveBroadcastDeskTab.tsx';
import { SocialAssetGeneratorTab } from './SocialAssetGeneratorTab.tsx';
import { AdCatalogFeedsTab } from './AdCatalogFeedsTab.tsx';
import { AutoPhotoBroadcastTab } from './AutoPhotoBroadcastTab.tsx';
import { WhatsAppDeviceModal } from './WhatsAppDeviceModal.tsx';

interface MarketingAutomationViewProps {
  onRefreshAll?: () => void;
  currentUserRole?: string;
}

export type MarketingSubTab = 'hub' | 'auto-broadcast' | 'chat-claim' | 'live-desk' | 'social-cards' | 'ad-feeds';

export const MarketingAutomationView: React.FC<MarketingAutomationViewProps> = ({
  onRefreshAll,
  currentUserRole
}) => {
  const [activeSubTab, setActiveSubTab] = useState<MarketingSubTab>('auto-broadcast');
  const [channels, setChannels] = useState<ChannelHealthStatus[]>([]);
  const [quickStats, setQuickStats] = useState<MarketingQuickStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);

  const fetchHubData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/marketing/status');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setQuickStats(data.quickStats || null);
        setLastRefreshed(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.warn('Error loading marketing hub status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHubData();
    const interval = setInterval(fetchHubData, 10000); // 10s live pulse
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-none space-y-6 pb-12">
      {/* 1. TOP HEADER & MULTI-CHANNEL STATUS BANNER */}
      <div className="bg-gradient-to-r from-[#FDF9EE] via-[#F5ECCE] to-[#FAF4E6] border border-amber-300/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-amber-300/60">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 flex items-center justify-center text-amber-950 shadow-md">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif font-black text-xl text-slate-900 tracking-tight">
                  Marketing & AI Automation Command Center
                </h2>
                <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-amber-200/90 text-amber-950 border border-amber-400/80 font-bold">
                  Omnichannel Suite
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Centralized live stream broadcast desk, social marketing drops, auto-chat claim bot, and real-time ad catalog feeds.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Link WhatsApp Phone</span>
            </button>

            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline-block">
              Last Synced: {lastRefreshed || 'Just now'}
            </span>
            <button
              type="button"
              onClick={() => {
                fetchHubData();
                onRefreshAll?.();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow transition cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync All</span>
            </button>
          </div>
        </div>

        {/* Live Channels Status Cards (Meta Ads, Google Merchant, WhatsApp API, TikTok Live) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map(ch => {
            const isOnline = ch.status === 'ACTIVE' || ch.status === 'CONNECTED';
            return (
              <div
                key={ch.id}
                className="bg-white/80 backdrop-blur-xs border border-amber-200/90 rounded-xl p-3 shadow-2xs hover:shadow-xs transition"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-slate-900 truncate">{ch.name}</span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOnline ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {ch.statusLabel}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{ch.syncItemCount} Synced</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 line-clamp-1" title={ch.details}>
                  {ch.details}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. QUICK STATS KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Listed Garments</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-black text-slate-900">
              {quickStats?.activeListedProducts ?? '...'}
            </span>
            <span className="text-[11px] font-mono text-emerald-600 font-bold">In-Stock</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Included in real-time XML feeds</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Claims Today</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-black text-amber-700">
              {quickStats?.liveClaimsToday ?? '...'}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              (AED {quickStats?.liveClaimsValueAed?.toLocaleString() || 0})
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Auto-locked via bot keyword engine</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Marketing Drops</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-black text-slate-900">
              {quickStats?.activeMarketingDrops ?? '...'}
            </span>
            <span className="text-[11px] font-mono text-emerald-600 font-bold">VIP Drops</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">WhatsApp Broadcasts to Gold VIPs</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Catalogs Synced</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-black text-slate-900">
              {quickStats?.totalCatalogsSynced ?? 4}
            </span>
            <span className="text-[11px] font-mono text-indigo-600 font-bold">Channels</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Google, Meta, TikTok, WhatsApp</span>
        </div>
      </div>

      {/* 3. SECTION SUB-TAB NAVIGATION */}
      <div className="flex items-center space-x-2 border-b border-amber-300/80 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('auto-broadcast')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'auto-broadcast'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <span className="text-sm">📢</span>
          <span>Automated WhatsApp Broadcast & Drops</span>
          <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black border border-emerald-300">
            Voice & Queue
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('chat-claim')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'chat-claim'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Section A: Chat & Live Claim Automation</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('live-desk')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'live-desk'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Section B: Live Stream Broadcast Desk & OBS Overlay</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('social-cards')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'social-cards'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Section C: Auto Asset Generator (Social Cards)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ad-feeds')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'ad-feeds'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Rss className="w-4 h-4" />
          <span>Section D: Multi-Channel Ad Catalog Feeds</span>
        </button>
      </div>

      {/* 4. ACTIVE SUB-TAB CONTENT RENDER */}
      <div className="w-full">
        {activeSubTab === 'auto-broadcast' && <AutoPhotoBroadcastTab />}
        {activeSubTab === 'chat-claim' && <ChatClaimAutomationTab />}
        {activeSubTab === 'live-desk' && <LiveBroadcastDeskTab />}
        {activeSubTab === 'social-cards' && <SocialAssetGeneratorTab />}
        {activeSubTab === 'ad-feeds' && <AdCatalogFeedsTab />}
      </div>

      {/* 5. MULTI-USER WHATSAPP DEVICE LINKING MODAL */}
      <WhatsAppDeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentUserId="usr-admin-1"
        currentUserName="Admin Store Owner"
      />
    </div>
  );
};

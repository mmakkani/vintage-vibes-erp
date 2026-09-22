import React, { useState, useEffect } from 'react';
import {
  Rss,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Code2,
  FileCode,
  Sparkles,
  Layers,
  Search,
  Activity,
  Zap,
  Target,
  Send,
  Eye,
  ShoppingBag,
  CreditCard,
  CheckCheck,
  Save
} from 'lucide-react';
import { AdFeedMetrics } from '../marketing.types.ts';
import { CompanyProfileService } from '../../../services/companyProfileService.ts';
import { pixelTracking } from '../../../utils/pixelTracking.ts';
import { PixelTrackingConfig } from '../../setup/setup.types.ts';

export const AdCatalogFeedsTab: React.FC = () => {
  const [metrics, setMetrics] = useState<AdFeedMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState<string | null>(null);
  const [selectedFeedXml, setSelectedFeedXml] = useState<'google' | 'meta'>('google');
  const [xmlContent, setXmlContent] = useState<string>('');
  const [isXmlLoading, setIsXmlLoading] = useState(false);
  const [xmlSearch, setXmlSearch] = useState('');
  const [secondsUntilEvictionSweep, setSecondsUntilEvictionSweep] = useState(60);

  // Pixel Tracking Configuration State
  const [pixelConfig, setPixelConfig] = useState<PixelTrackingConfig>({
    metaPixelId: '',
    tiktokPixelId: '',
    enableMetaPixel: true,
    enableTiktokPixel: true,
    testEventCode: ''
  });
  const [isSavingPixels, setIsSavingPixels] = useState(false);
  const [pixelSavedSuccess, setPixelSavedSuccess] = useState(false);
  const [testEventFeedback, setTestEventFeedback] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/marketing/feeds/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.warn('Error loading feed metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchXmlPreview = async (type: 'google' | 'meta') => {
    setSelectedFeedXml(type);
    setIsXmlLoading(true);
    try {
      const endpoint = type === 'google' ? '/api/feed/google-merchant.xml' : '/api/feed/meta-catalog.xml';
      const res = await fetch(endpoint);
      const text = await res.text();
      setXmlContent(text);
    } catch (err) {
      setXmlContent('<!-- Error loading feed XML snippet -->');
    } finally {
      setIsXmlLoading(false);
    }
  };

  // Load existing pixel configuration from CompanyProfile
  const loadPixelConfig = async () => {
    try {
      const prof = await CompanyProfileService.getCompanyProfile();
      if (prof) {
        setPixelConfig({
          metaPixelId: prof.pixelTracking?.metaPixelId || prof.metaPixelId || '',
          tiktokPixelId: prof.pixelTracking?.tiktokPixelId || prof.tiktokPixelId || '',
          enableMetaPixel: prof.pixelTracking?.enableMetaPixel ?? true,
          enableTiktokPixel: prof.pixelTracking?.enableTiktokPixel ?? true,
          testEventCode: prof.pixelTracking?.testEventCode || ''
        });
      }
    } catch (err) {
      console.warn('Failed to load company profile for pixels:', err);
    }
  };

  const handleSavePixels = async () => {
    setIsSavingPixels(true);
    setPixelSavedSuccess(false);
    try {
      const current = await CompanyProfileService.getCompanyProfile();
      const updated = {
        ...current,
        pixelTracking: {
          ...pixelConfig
        },
        metaPixelId: pixelConfig.metaPixelId,
        tiktokPixelId: pixelConfig.tiktokPixelId
      };
      await CompanyProfileService.updateCompanyProfile(updated);
      setPixelSavedSuccess(true);

      // Re-initialize runtime tracker with fresh IDs
      pixelTracking.initPixels(pixelConfig);

      setTimeout(() => setPixelSavedSuccess(false), 3500);
    } catch (err) {
      alert('Failed to save pixel configuration. Please check network connection.');
    } finally {
      setIsSavingPixels(false);
    }
  };

  const handleFireTestEvent = (platform: 'meta' | 'tiktok' | 'both') => {
    pixelTracking.initPixels(pixelConfig);
    const res = pixelTracking.fireTestEvent(platform);
    if (res.metaFired && res.tiktokFired) {
      setTestEventFeedback('✓ Fired test events to Meta & TikTok! Check your Events Manager.');
    } else if (res.metaFired) {
      setTestEventFeedback('✓ Fired test event to Meta Pixel! Check Meta Events Manager Test Events tab.');
    } else if (res.tiktokFired) {
      setTestEventFeedback('✓ Fired test event to TikTok Pixel! Check TikTok Test Events tab.');
    } else {
      setTestEventFeedback('Notice: Pixel script is loading or blocked by an active browser ad-blocker.');
    }
    setTimeout(() => setTestEventFeedback(null), 5000);
  };

  useEffect(() => {
    fetchMetrics();
    fetchXmlPreview('google');
    loadPixelConfig();

    // 60-second real-time eviction countdown visualizer
    const countdown = setInterval(() => {
      setSecondsUntilEvictionSweep(prev => (prev <= 1 ? 60 : prev - 1));
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedFeed(id);
    setTimeout(() => setCopiedFeed(null), 2500);
  };

  const googleUrl = metrics?.googleMerchantFeedUrl || `${window.location.origin}/api/feed/google-merchant.xml`;
  const metaUrl = metrics?.metaCatalogFeedUrl || `${window.location.origin}/api/feed/meta-catalog.xml`;

  // Filter XML preview lines by search query
  const displayedXmlLines = React.useMemo(() => {
    if (!xmlContent) return [];
    const lines = xmlContent.split('\n');
    if (!xmlSearch.trim()) return lines.slice(0, 120);
    return lines.filter(l => l.toLowerCase().includes(xmlSearch.toLowerCase()));
  }, [xmlContent, xmlSearch]);

  return (
    <div className="space-y-6">
      {/* Top Banner Notice: 60-Second Real-Time Eviction Guarantee */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border border-amber-500/40 rounded-xl p-4 sm:p-5 text-amber-100 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shrink-0 text-amber-300">
            <Rss className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif font-bold text-base text-white">
                Multi-Channel Real-Time Product Catalog Feeds
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                60s Sold Eviction Active
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-1 max-w-2xl">
              Strictly syncs only verified in-stock vintage garments. Claimed or sold items are automatically pruned within 60 seconds to eliminate wasted ad spend across Meta Ads & Google Merchant campaigns.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <div className="text-right hidden sm:block font-mono">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Auto-Evict Sweep in</span>
            <span className="text-sm font-black text-amber-400">{secondsUntilEvictionSweep}s</span>
          </div>
          <button
            type="button"
            onClick={() => {
              fetchMetrics();
              fetchXmlPreview(selectedFeedXml);
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow transition cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Feeds</span>
          </button>
        </div>
      </div>

      {/* Feed Cards: Google Merchant & Meta Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Google Merchant Center Feed */}
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-black text-xs shrink-0">
                GMC
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  Google Merchant Center Feed (XML)
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ● ACTIVE
                  </span>
                </h4>
                <span className="text-xs text-slate-500 font-mono">RSS 2.0 Base XML Specification</span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              {metrics?.totalInStockGarments ?? '...'} In-Stock
            </span>
          </div>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Public Feed Endpoint:</span>
              <span className="font-mono text-[11px] text-blue-700 font-semibold truncate max-w-[220px]">
                /api/feed/google-merchant.xml
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Evicted Sold Garments:</span>
              <span className="font-mono font-bold text-amber-700">
                {metrics?.evictedSoldGarmentsCount ?? 0} pieces excluded
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Tax & Currency:</span>
              <span className="font-medium text-slate-800">AED (UAE Dirhams) + 5% VAT</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={googleUrl}
              className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 select-all"
            />
            <button
              type="button"
              onClick={() => handleCopy(googleUrl, 'google')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Copy public feed URL"
            >
              {copiedFeed === 'google' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFeed === 'google' ? 'Copied' : 'Copy'}</span>
            </button>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs flex items-center justify-center transition"
              title="Open XML directly"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Google Shopping & Free Product Listings Ready
            </span>
            <button
              type="button"
              onClick={() => fetchXmlPreview('google')}
              className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
            >
              Inspect XML
            </button>
          </div>
        </div>

        {/* 2. Meta Ads Commerce Feed */}
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-black text-xs shrink-0">
                META
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  Meta Catalog Commerce Feed (XML)
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ● ACTIVE
                  </span>
                </h4>
                <span className="text-xs text-slate-500 font-mono">Instagram & Facebook Dynamic Catalog</span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              {metrics?.totalInStockGarments ?? '...'} In-Stock
            </span>
          </div>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Public Feed Endpoint:</span>
              <span className="font-mono text-[11px] text-indigo-700 font-semibold truncate max-w-[220px]">
                /api/feed/meta-catalog.xml
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Evicted Sold Garments:</span>
              <span className="font-mono font-bold text-amber-700">
                {metrics?.evictedSoldGarmentsCount ?? 0} pieces excluded
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Sync Protocol:</span>
              <span className="font-medium text-slate-800">Meta Commerce Manager Recurring Poll</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={metaUrl}
              className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 select-all"
            />
            <button
              type="button"
              onClick={() => handleCopy(metaUrl, 'meta')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Copy public feed URL"
            >
              {copiedFeed === 'meta' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFeed === 'meta' ? 'Copied' : 'Copy'}</span>
            </button>
            <a
              href={metaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs flex items-center justify-center transition"
              title="Open XML directly"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Instagram Shop Tagging & Retargeting Ready
            </span>
            <button
              type="button"
              onClick={() => fetchXmlPreview('meta')}
              className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
            >
              Inspect XML
            </button>
          </div>
        </div>
      </div>

      {/* 3. META & TIKTOK STOREFRONT PIXEL TRACKING HUB */}
      <div className="bg-white border-2 border-indigo-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-indigo-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shrink-0">
              <Target className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-slate-900">
                  Storefront Meta (Facebook/IG) &amp; TikTok Pixel Integration
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-indigo-500" />
                  Auto-Conversion Engine Active
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                Automatically tracks high-intent vintage shoppers and synchronizes conversion events with Meta &amp; TikTok Ads algorithms to build high-spending UAE lookalikes and retarget cart-abandoners.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => handleFireTestEvent('both')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition cursor-pointer active:scale-95"
              title="Dispatches live test payload to Meta and TikTok Events Manager"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>Fire Test Event</span>
            </button>
            <button
              type="button"
              onClick={handleSavePixels}
              disabled={isSavingPixels}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSavingPixels ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : pixelSavedSuccess ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{pixelSavedSuccess ? 'Saved!' : 'Save Pixels'}</span>
            </button>
          </div>
        </div>

        {/* Live Feedback Toast Banner */}
        {testEventFeedback && (
          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{testEventFeedback}</span>
          </div>
        )}

        {/* Pixel Input Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* A. Meta Pixel (Facebook & Instagram) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  f
                </span>
                <span className="font-bold text-xs text-slate-900">Meta Pixel (Facebook &amp; Instagram)</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={pixelConfig.enableMetaPixel !== false}
                  onChange={e => setPixelConfig(prev => ({ ...prev, enableMetaPixel: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Active</span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Meta Pixel ID / Dataset ID:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pixelConfig.metaPixelId || ''}
                  onChange={e => setPixelConfig(prev => ({ ...prev, metaPixelId: e.target.value.trim() }))}
                  placeholder="e.g. 892341238912345"
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner"
                />
                <a
                  href="https://business.facebook.com/events_manager2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-lg font-medium flex items-center gap-1 shrink-0"
                  title="Open Meta Business Events Manager"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="text-[11px]">Get ID</span>
                </a>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Found in Meta Business Suite &rarr; Events Manager &rarr; Data Sources &rarr; Settings.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Meta Test Event Code (Optional for verification):
              </label>
              <input
                type="text"
                value={pixelConfig.testEventCode || ''}
                onChange={e => setPixelConfig(prev => ({ ...prev, testEventCode: e.target.value.trim() }))}
                placeholder="e.g. TEST12345"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Copy from "Test Events" tab in Meta Events Manager to see real-time testing.
              </span>
            </div>
          </div>

          {/* B. TikTok Pixel */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-black text-white flex items-center justify-center font-bold text-xs">
                  ♫
                </span>
                <span className="font-bold text-xs text-slate-900">TikTok Pixel</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={pixelConfig.enableTiktokPixel !== false}
                  onChange={e => setPixelConfig(prev => ({ ...prev, enableTiktokPixel: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Active</span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                TikTok Pixel ID:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pixelConfig.tiktokPixelId || ''}
                  onChange={e => setPixelConfig(prev => ({ ...prev, tiktokPixelId: e.target.value.trim() }))}
                  placeholder="e.g. C9ABCDEF123456"
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner"
                />
                <a
                  href="https://ads.tiktok.com/i18n/events_manager/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-lg font-medium flex items-center gap-1 shrink-0"
                  title="Open TikTok Ads Events Manager"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="text-[11px]">Get ID</span>
                </a>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Found in TikTok Ads Manager &rarr; Assets &rarr; Events &rarr; Web Events &rarr; Pixel Code.
              </span>
            </div>

            <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg text-[11px] text-indigo-950 space-y-1">
              <span className="font-bold flex items-center gap-1 text-indigo-900">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                TikTok Live &amp; Video Shopping Sync
              </span>
              <p className="text-[10px] text-indigo-900/80 leading-normal">
                Matches visitors who discover Vintage Vibes through TikTok Live drops, streaming clips, and viral streetwear reels.
              </p>
            </div>
          </div>
        </div>

        {/* 5-Stage Automated Event Flow Visualization */}
        <div className="bg-slate-900 text-slate-200 rounded-xl p-4 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4" />
              Automated E-Commerce Conversion Pipeline (Zero Manual Tracking Needed):
            </span>
            <span className="font-mono text-[10px] text-slate-400">Strict UAE Dirhams (AED) Valuation</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center font-mono text-[11px]">
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
              <Eye className="w-4 h-4 mx-auto text-blue-400" />
              <div className="font-bold text-white text-xs">1. PageView</div>
              <div className="text-[10px] text-slate-400">Storefront Visit</div>
            </div>

            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
              <Search className="w-4 h-4 mx-auto text-purple-400" />
              <div className="font-bold text-white text-xs">2. ViewContent</div>
              <div className="text-[10px] text-slate-400">Inspect Garment</div>
            </div>

            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
              <ShoppingBag className="w-4 h-4 mx-auto text-amber-400" />
              <div className="font-bold text-white text-xs">3. AddToCart</div>
              <div className="text-[10px] text-slate-400">Reserve / Bag Item</div>
            </div>

            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1">
              <CreditCard className="w-4 h-4 mx-auto text-emerald-400" />
              <div className="font-bold text-white text-xs">4. InitiateCheckout</div>
              <div className="text-[10px] text-slate-400">Checkout Modal</div>
            </div>

            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/60 space-y-1 col-span-2 sm:col-span-1">
              <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-400" />
              <div className="font-bold text-emerald-300 text-xs">5. Purchase</div>
              <div className="text-[10px] text-emerald-200">Order Confirmed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed Health & Real-Time Eviction Policy Rulebook */}
      <div className="bg-amber-50/70 border border-amber-300/80 rounded-xl p-4 text-xs text-amber-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
          <div>
            <span className="font-bold block text-sm">Automated Feed Guardrails</span>
            <span className="text-amber-800">
              Only items marked <code className="bg-amber-200/80 px-1 py-0.5 rounded font-mono font-bold">IN_STOCK</code> and verified unreserved are included in feeds. Sold garments vanish on the next poll to prevent advertising out-of-stock items.
            </span>
          </div>
        </div>
        <span className="font-mono text-[11px] text-amber-900 bg-amber-100 px-2.5 py-1 rounded border border-amber-300 shrink-0">
          Last Verified: {metrics?.lastRefreshedAt ? new Date(metrics.lastRefreshedAt).toLocaleTimeString() : 'Just now'}
        </span>
      </div>

      {/* Real-time XML Schema Inspector Drawer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-slate-200">
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-xs text-white">Live XML Feed Previewer:</span>
            <div className="flex items-center bg-slate-800 p-0.5 rounded-md border border-slate-700">
              <button
                type="button"
                onClick={() => fetchXmlPreview('google')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  selectedFeedXml === 'google' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Google Merchant XML
              </button>
              <button
                type="button"
                onClick={() => fetchXmlPreview('meta')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  selectedFeedXml === 'meta' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Meta Catalog XML
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={xmlSearch}
                onChange={e => setXmlSearch(e.target.value)}
                placeholder="Search XML tags..."
                className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="button"
              onClick={() => handleCopy(xmlContent, 'raw-xml')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-mono flex items-center gap-1 transition cursor-pointer shrink-0"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedFeed === 'raw-xml' ? 'Copied XML' : 'Copy All'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 font-mono text-xs overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900/90 leading-relaxed">
          {isXmlLoading ? (
            <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Generating real-time XML stream...</span>
            </div>
          ) : displayedXmlLines.length > 0 ? (
            <pre className="text-slate-300">
              {displayedXmlLines.map((line, idx) => (
                <div key={idx} className="hover:bg-slate-800/60 px-1 rounded">
                  <span className="text-slate-600 select-none mr-3 inline-block w-8 text-right text-[10px]">
                    {idx + 1}
                  </span>
                  <span
                    className={
                      line.includes('<item>') || line.includes('</item>')
                        ? 'text-amber-400 font-bold'
                        : line.includes('<g:price>') || line.includes('<g:id>')
                        ? 'text-emerald-400 font-semibold'
                        : line.includes('<g:availability>')
                        ? 'text-cyan-300'
                        : line.includes('<g:title>')
                        ? 'text-white'
                        : 'text-slate-300'
                    }
                  >
                    {line}
                  </span>
                </div>
              ))}
            </pre>
          ) : (
            <div className="py-8 text-center text-slate-500">No XML nodes matched search term.</div>
          )}
        </div>
      </div>
    </div>
  );
};

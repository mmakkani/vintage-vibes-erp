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
  Smartphone,
  Tag,
  Zap,
  Users,
  Send,
  Plus,
  Trash2,
  Calendar,
  Check,
  Percent,
  Clock,
  Globe
} from 'lucide-react';
import {
  MarketingService,
  MarketingCampaign,
  MarketingAutomation,
  Coupon,
  MarketingAudience
} from '../../../services/marketingService.ts';
import { supabase } from '../../../supabaseClient.ts';
import { LiveBroadcastDeskTab } from './LiveBroadcastDeskTab.tsx';
import { AutoPhotoBroadcastTab } from './AutoPhotoBroadcastTab.tsx';
import { ChatClaimAutomationTab } from './ChatClaimAutomationTab.tsx';
import { AdCatalogFeedsTab } from './AdCatalogFeedsTab.tsx';
import { WhatsAppDeviceModal } from './WhatsAppDeviceModal.tsx';
import { WhatsAppService } from '../../../services/whatsappService.ts';
import { StorefrontAnalyticsView } from '../StorefrontAnalyticsView.tsx';

interface MarketingAutomationViewProps {
  onRefreshAll?: () => void;
  currentUserRole?: string;
}

export type MarketingSubTab =
  | 'campaigns'
  | 'automations'
  | 'coupons'
  | 'audiences'
  | 'chat-claim'
  | 'auto-broadcast'
  | 'live-desk'
  | 'ad-catalog-pixels'
  | 'storefront-analytics';

export const MarketingAutomationView: React.FC<MarketingAutomationViewProps> = ({
  onRefreshAll,
  currentUserRole
}) => {
  const currentOperator = WhatsAppService.getCurrentOperator();
  const [activeSubTab, setActiveSubTab] = useState<MarketingSubTab>('campaigns');
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    activeAutomations: 0,
    activeCoupons: 0,
    totalAudienceMembers: 0,
    inStockProducts: 0
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [isAiTrainerOpen, setIsAiTrainerOpen] = useState<boolean>(false);
  const [aiMemoryItems, setAiMemoryItems] = useState<Array<{
    id: string;
    type: 'RULE_OR_FACT' | 'OBSERVED_QA';
    content: string;
    customerQuestion?: string;
    taughtBy: string;
    createdAt: string;
    source: string;
  }>>([]);
  const [newAiRuleText, setNewAiRuleText] = useState<string>('');
  const [newAiQuestionText, setNewAiQuestionText] = useState<string>('');
  const [newAiRuleType, setNewAiRuleType] = useState<'RULE_OR_FACT' | 'OBSERVED_QA'>('RULE_OR_FACT');
  const [isSavingAiRule, setIsSavingAiRule] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAiMemory = async () => {
    try {
      const res = await fetch('/api/marketing/ai-memory');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setAiMemoryItems(data.items);
        }
      }
    } catch (_) {}
  };

  const handleAddAiRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAiRuleText.trim()) return;
    setIsSavingAiRule(true);
    try {
      const payloadContent =
        newAiRuleType === 'OBSERVED_QA' && newAiQuestionText.trim()
          ? `When a customer asks "${newAiQuestionText.trim()}", answer: "${newAiRuleText.trim()}"`
          : newAiRuleText.trim();
      const res = await fetch('/api/marketing/ai-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newAiRuleType,
          content: payloadContent,
          customerQuestion: newAiQuestionText.trim() || undefined,
          taughtBy: currentOperator?.name || 'Mr. Muhammad Akram (ERP Brain Trainer)'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) setAiMemoryItems(data.items);
        setNewAiRuleText('');
        setNewAiQuestionText('');
        showNotification('🧠 AI Brain Updated! Rule saved to permanent memory.');
      } else {
        showNotification('Failed to save AI rule', 'error');
      }
    } catch (_) {
      showNotification('Failed to save AI rule', 'error');
    } finally {
      setIsSavingAiRule(false);
    }
  };

  const handleDeleteAiRule = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/ai-memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) setAiMemoryItems(data.items);
        showNotification('AI Memory item removed.');
      }
    } catch (_) {
      showNotification('Failed to remove AI memory item', 'error');
    }
  };

  // Sub-tab Data States
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [automations, setAutomations] = useState<MarketingAutomation[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [audiences, setAudiences] = useState<MarketingAudience[]>([]);

  // Creation Modal States
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState<Partial<MarketingCampaign>>({
    campaign_name: '',
    channel: 'whatsapp',
    target_audience: 'VIP Gold Buyers',
    message_template: 'Hello {customer_name}! Explore new arrivals at Vintage Vibes. Use code VIP20 for an exclusive discount today!',
    status: 'draft'
  });

  const [showNewAutomationModal, setShowNewAutomationModal] = useState(false);
  const [newAutomation, setNewAutomation] = useState<Partial<MarketingAutomation>>({
    automation_name: '',
    trigger_event: 'order_created',
    action_type: 'send_whatsapp_invoice',
    is_active: true
  });

  const [showNewCouponModal, setShowNewCouponModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState<Partial<Coupon>>({
    coupon_code: '',
    discount_type: 'percentage',
    discount_value: 15,
    min_order_amount: 150,
    is_active: true
  });

  const [showNewAudienceModal, setShowNewAudienceModal] = useState(false);
  const [newAudience, setNewAudience] = useState<Partial<MarketingAudience>>({
    segment_name: '',
    total_members: 50,
    criteria: { channel: 'all' }
  });

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setBannerMsg({ type, text });
    setTimeout(() => setBannerMsg(null), 4000);
  };

  const isLoadingRef = React.useRef<boolean>(false);

  const loadAllMarketingData = async (silent: boolean = false) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    if (!silent) setIsLoading(true);
    try {
      const [overviewStats, camps, autos, coups, auds] = await Promise.all([
        MarketingService.getMarketingOverviewStats(),
        MarketingService.getCampaigns(),
        MarketingService.getAutomations(),
        MarketingService.getCoupons(),
        MarketingService.getAudiences()
      ]);

      setStats(overviewStats);
      setCampaigns(camps);
      setAutomations(autos);
      setCoupons(coups);
      setAudiences(auds);
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.warn('Error loading marketing data:', err);
      if (!silent) showNotification('Failed to sync marketing data', 'error');
    } finally {
      isLoadingRef.current = false;
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllMarketingData(false);

    // 1. Server-Sent Events (SSE) Realtime Listener for multi-device sync
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events/subscribe');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.entity === 'WHATSAPP_DEVICE') return;
          if (
            payload.module === 'MARKETING' ||
            payload.module === 'SALES' ||
            payload.module === 'ALL' ||
            payload.entity === 'BROADCAST_CAMPAIGN_STARTED' ||
            payload.entity === 'BROADCAST_PROGRESS' ||
            payload.entity === 'BROADCAST_COMPLETED' ||
            payload.entity === 'LIVE_CLAIM'
          ) {
            loadAllMarketingData(true);
          }
        } catch (_) {}
      };
    } catch (_) {}

    // 2. Supabase Realtime Channel Subscription for immediate database table updates
    const channel = supabase
      .channel('marketing-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_campaigns' }, () => {
        loadAllMarketingData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_automations' }, () => {
        loadAllMarketingData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => {
        loadAllMarketingData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_audiences' }, () => {
        loadAllMarketingData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_claim_rules' }, () => {
        loadAllMarketingData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_vip_drops' }, () => {
        loadAllMarketingData(true);
      })
      .subscribe();

    return () => {
      if (es) es.close();
      supabase.removeChannel(channel);
    };
  }, []);

  // Handlers for Campaigns
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.campaign_name || !newCampaign.message_template) return;
    try {
      await MarketingService.createCampaign({
        campaign_name: newCampaign.campaign_name,
        channel: newCampaign.channel as any || 'whatsapp',
        target_audience: newCampaign.target_audience || 'All Customers',
        message_template: newCampaign.message_template,
        status: 'draft',
        sent_count: 0,
        delivered_count: 0
      });
      setShowNewCampaignModal(false);
      setNewCampaign({
        campaign_name: '',
        channel: 'whatsapp',
        target_audience: 'VIP Gold Buyers',
        message_template: 'Hello {customer_name}!',
        status: 'draft'
      });
      showNotification('Broadcast campaign created successfully!');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create campaign', 'error');
    }
  };

  const handleSendCampaign = async (id: string, name: string) => {
    try {
      const targetCamp = campaigns.find(c => c.id === id);
      if (!targetCamp) return;
      showNotification(`Dispatching "${name}" via WhatsApp Engine...`);
      const updated = await MarketingService.dispatchCampaign(targetCamp);
      showNotification(`Broadcast "${name}" dispatched (${updated.delivered_count || 0}/${updated.sent_count || 0} delivered)!`);
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to send broadcast', 'error');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this broadcast campaign?')) return;
    try {
      await MarketingService.deleteCampaign(id);
      showNotification('Campaign deleted.');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to delete campaign', 'error');
    }
  };

  // Handlers for Automations
  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAutomation.automation_name) return;
    try {
      await MarketingService.createAutomation({
        automation_name: newAutomation.automation_name,
        trigger_event: newAutomation.trigger_event || 'order_created',
        action_type: newAutomation.action_type || 'send_whatsapp_invoice',
        is_active: true
      });
      setShowNewAutomationModal(false);
      setNewAutomation({
        automation_name: '',
        trigger_event: 'order_created',
        action_type: 'send_whatsapp_invoice',
        is_active: true
      });
      showNotification('Automated trigger created!');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create automation', 'error');
    }
  };

  const handleToggleAutomation = async (id: string, currentStatus?: boolean) => {
    try {
      await MarketingService.toggleAutomation(id, !currentStatus);
      showNotification(`Automation ${!currentStatus ? 'activated' : 'paused'}.`);
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to update automation', 'error');
    }
  };

  const handleDeleteAutomation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation?')) return;
    try {
      await MarketingService.deleteAutomation(id);
      showNotification('Automation deleted.');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to delete automation', 'error');
    }
  };

  // Handlers for Coupons
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoupon.coupon_code) return;
    try {
      await MarketingService.createCoupon({
        coupon_code: newCoupon.coupon_code,
        discount_type: newCoupon.discount_type as any || 'percentage',
        discount_value: Number(newCoupon.discount_value || 10),
        min_order_amount: Number(newCoupon.min_order_amount || 0),
        is_active: true
      });
      setShowNewCouponModal(false);
      setNewCoupon({
        coupon_code: '',
        discount_type: 'percentage',
        discount_value: 15,
        min_order_amount: 150,
        is_active: true
      });
      showNotification('Discount coupon created!');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create coupon', 'error');
    }
  };

  const handleToggleCoupon = async (id: string, currentStatus?: boolean) => {
    try {
      await MarketingService.toggleCoupon(id, !currentStatus);
      showNotification(`Coupon ${!currentStatus ? 'activated' : 'disabled'}.`);
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to toggle coupon', 'error');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Delete this coupon code?')) return;
    try {
      await MarketingService.deleteCoupon(id);
      showNotification('Coupon deleted.');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to delete coupon', 'error');
    }
  };

  // Handlers for Audiences
  const handleCreateAudience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAudience.segment_name) return;
    try {
      await MarketingService.createAudience({
        segment_name: newAudience.segment_name,
        total_members: Number(newAudience.total_members || 0),
        criteria: { target: 'customers' }
      });
      setShowNewAudienceModal(false);
      setNewAudience({ segment_name: '', total_members: 50 });
      showNotification('Audience segment created!');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification(err.message || 'Failed to create audience', 'error');
    }
  };

  const handleDeleteAudience = async (id: string) => {
    if (!confirm('Delete this audience segment?')) return;
    try {
      await MarketingService.deleteAudience(id);
      showNotification('Audience segment deleted.');
      loadAllMarketingData();
    } catch (err: any) {
      showNotification('Failed to delete audience', 'error');
    }
  };

  return (
    <div className="w-full max-w-none space-y-6 pb-12">
      {/* Toast Notification */}
      {bannerMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-xs font-bold flex items-center gap-2 text-white animate-in slide-in-from-bottom-2 ${
            bannerMsg.type === 'error' ? 'bg-red-600' : 'bg-emerald-700'
          }`}
        >
          {bannerMsg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{bannerMsg.text}</span>
        </div>
      )}

      {/* 1. TOP HEADER & MULTI-CHANNEL STATUS BANNER */}
      <div className="bg-gradient-to-r from-[#FDF9EE] via-[#F5ECCE] to-[#FAF4E6] border border-amber-300/80 rounded-2xl p-5 shadow-xs">
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
                <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                  Direct Supabase Cloud Connected
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Manage WhatsApp broadcasts, automated post-order triggers, dynamic coupons, and segmented customer audiences.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
            <button
              type="button"
              onClick={() => {
                loadAiMemory();
                setIsAiTrainerOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer active:scale-95"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>🧠 Teach AI (Brain Trainer)</span>
            </button>

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
                loadAllMarketingData();
                onRefreshAll?.();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow transition cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync Cloud</span>
            </button>
          </div>
        </div>

        {/* Live Channels Health Overview */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white/90 border border-amber-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-slate-900">WhatsApp Broadcast Gateway</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                ACTIVE &amp; READY
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{stats.activeCampaigns} Campaigns</span>
            </div>
          </div>

          <div className="bg-white/90 border border-amber-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-slate-900">Auto Event Triggers</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                ONLINE
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{stats.activeAutomations} Active</span>
            </div>
          </div>

          <div className="bg-white/90 border border-amber-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-slate-900">Discount Coupons Engine</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                ENABLED
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{stats.activeCoupons} Live Codes</span>
            </div>
          </div>

          <div className="bg-white/90 border border-amber-200 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-slate-900">Audience Segmentation</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                SYNCED
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{stats.totalAudienceMembers.toLocaleString()} Profiles</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SECTION SUB-TAB NAVIGATION */}
      <div className="flex items-center space-x-2 border-b border-amber-300/80 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('campaigns')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'campaigns'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>WhatsApp &amp; SMS Broadcasts</span>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded font-black border border-amber-300">
            {campaigns.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('automations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'automations'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Automated Triggers</span>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded font-black border border-amber-300">
            {automations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('coupons')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'coupons'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Discount Coupons</span>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded font-black border border-amber-300">
            {coupons.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audiences')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'audiences'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Audience Segments</span>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded font-black border border-amber-300">
            {audiences.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('chat-claim')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'chat-claim'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Live Chat Auto-Claim Bot</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('auto-broadcast')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'auto-broadcast'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>VIP Media Drops</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('live-desk')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'live-desk'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Live Selling Studio Desk</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ad-catalog-pixels')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'ad-catalog-pixels'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Rss className="w-3.5 h-3.5" />
          <span>Ad Feeds &amp; Tracking Pixels</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('storefront-analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
            activeSubTab === 'storefront-analytics'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black ring-2 ring-amber-400/50'
              : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Storefront Traffic &amp; Analytics</span>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-black border border-emerald-300">
            LIVE
          </span>
        </button>
      </div>

      {/* 3. SUB-TAB 1: WHATSAPP & SMS BROADCASTS */}
      {activeSubTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Broadcast Campaigns (`marketing_campaigns`)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deploy promotional drops and collection launches directly to customer phones via WhatsApp &amp; SMS.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCampaignModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Campaign</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map(c => (
              <div
                key={c.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-black text-sm text-slate-900 block">{c.campaign_name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {c.channel}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">Audience: {c.target_audience}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      c.status === 'sent'
                        ? 'bg-blue-100 text-blue-800'
                        : c.status === 'scheduled'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 leading-relaxed line-clamp-3">
                  {c.message_template}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span>Sent: <strong className="text-slate-900">{c.sent_count || 0}</strong></span>
                    <span>Delivered: <strong className="text-emerald-700">{c.delivered_count || 0}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status !== 'sent' && (
                      <button
                        type="button"
                        onClick={() => handleSendCampaign(c.id!, c.campaign_name)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Now</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteCampaign(c.id!)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* New Campaign Modal */}
          {showNewCampaignModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm text-slate-900">New Broadcast Campaign</h4>
                  <button
                    type="button"
                    onClick={() => setShowNewCampaignModal(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Campaign Title:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramadan Selvedge Drop VIP"
                      value={newCampaign.campaign_name || ''}
                      onChange={e => setNewCampaign({ ...newCampaign, campaign_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Channel:</label>
                      <select
                        value={newCampaign.channel}
                        onChange={e => setNewCampaign({ ...newCampaign, channel: e.target.value as any })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                      >
                        <option value="whatsapp">WhatsApp Direct</option>
                        <option value="sms">SMS Gateway</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Target Audience:</label>
                      <select
                        value={newCampaign.target_audience}
                        onChange={e => setNewCampaign({ ...newCampaign, target_audience: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                      >
                        <option value="VIP Gold Buyers">VIP Gold Buyers</option>
                        <option value="All Registered Customers">All Registered Customers</option>
                        <option value="B2B Wholesale Garment Buyers">B2B Wholesale Buyers</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Message Template:</label>
                    <textarea
                      required
                      rows={4}
                      value={newCampaign.message_template || ''}
                      onChange={e => setNewCampaign({ ...newCampaign, message_template: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                      placeholder="Enter broadcast message template..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => setShowNewCampaignModal(false)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow cursor-pointer"
                    >
                      Save Campaign
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. SUB-TAB 2: AUTOMATED TRIGGERS */}
      {activeSubTab === 'automations' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Event Automation Triggers (`marketing_automations`)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Instant bots and listeners configured to dispatch notifications automatically on system events.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewAutomationModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Event Trigger</span>
            </button>
          </div>

          <div className="space-y-3">
            {automations.map(a => (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{a.automation_name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        Trigger: {a.trigger_event}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                        Action: {a.action_type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleToggleAutomation(a.id!, a.is_active)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer border ${
                      a.is_active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-500 border-slate-300'
                    }`}
                  >
                    {a.is_active ? 'ACTIVE' : 'PAUSED'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAutomation(a.id!)}
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* New Automation Modal */}
          {showNewAutomationModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm text-slate-900">Add Automated Trigger</h4>
                  <button type="button" onClick={() => setShowNewAutomationModal(false)} className="cursor-pointer text-slate-400">✕</button>
                </div>
                <form onSubmit={handleCreateAutomation} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Automation Name:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VIP First Order Welcome Bonus"
                      value={newAutomation.automation_name || ''}
                      onChange={e => setNewAutomation({ ...newAutomation, automation_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Trigger Event:</label>
                    <select
                      value={newAutomation.trigger_event}
                      onChange={e => setNewAutomation({ ...newAutomation, trigger_event: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    >
                      <option value="order_created">Order Placed (Checkout)</option>
                      <option value="cart_abandoned">Cart Abandoned (2 Hours)</option>
                      <option value="live_claim_created">Live Stream Claim Made</option>
                      <option value="customer_registered">New Customer Signup</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Action Type:</label>
                    <select
                      value={newAutomation.action_type}
                      onChange={e => setNewAutomation({ ...newAutomation, action_type: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    >
                      <option value="send_whatsapp_invoice">Send WhatsApp PDF Invoice</option>
                      <option value="send_recovery_sms">Send Cart Recovery SMS</option>
                      <option value="send_whatsapp_claim_link">Send Live Claim Checkout Link</option>
                      <option value="apply_vip_tag">Tag as VIP Buyer</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button type="button" onClick={() => setShowNewAutomationModal(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-[#0056b3] text-white rounded-lg text-xs font-bold shadow cursor-pointer">Save Trigger</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. SUB-TAB 3: DISCOUNT COUPONS */}
      {activeSubTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Discount Coupons (`coupons`)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Active promo codes recognized by online checkout and POS cashier counters.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCouponModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Coupon Code</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {coupons.map(cp => (
              <div
                key={cp.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm px-2.5 py-1 bg-amber-100 text-amber-950 rounded-lg border border-amber-300">
                    {cp.coupon_code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleCoupon(cp.id!, cp.is_active)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer border ${
                      cp.is_active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-500 border-slate-300'
                    }`}
                  >
                    {cp.is_active ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 font-mono">
                    {cp.discount_type === 'percentage' ? `${cp.discount_value}%` : `AED ${cp.discount_value}`}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">DISCOUNT</span>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-100">
                  <div>Min Order: <strong>AED {cp.min_order_amount || 0}</strong></div>
                  <div>Valid: <strong>Always Valid / Ongoing</strong></div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteCoupon(cp.id!)}
                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                    title="Delete Coupon"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* New Coupon Modal */}
          {showNewCouponModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm text-slate-900">Create Discount Coupon</h4>
                  <button type="button" onClick={() => setShowNewCouponModal(false)} className="cursor-pointer text-slate-400">✕</button>
                </div>
                <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Coupon Code (Uppercase):</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FLASH25"
                      value={newCoupon.coupon_code || ''}
                      onChange={e => setNewCoupon({ ...newCoupon, coupon_code: e.target.value.toUpperCase() })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Discount Type:</label>
                      <select
                        value={newCoupon.discount_type}
                        onChange={e => setNewCoupon({ ...newCoupon, discount_type: e.target.value as any })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed_amount">Fixed Amount (AED)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Discount Value:</label>
                      <input
                        type="number"
                        required
                        value={newCoupon.discount_value || ''}
                        onChange={e => setNewCoupon({ ...newCoupon, discount_value: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Minimum Order Amount (AED):</label>
                    <input
                      type="number"
                      value={newCoupon.min_order_amount || ''}
                      onChange={e => setNewCoupon({ ...newCoupon, min_order_amount: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button type="button" onClick={() => setShowNewCouponModal(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow cursor-pointer">Create Coupon</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. SUB-TAB 4: AUDIENCE SEGMENTS */}
      {activeSubTab === 'audiences' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Customer Audience Segments (`marketing_audiences`)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Targeted buyer groups segmented by lifetime value, preferred brand category, or shopping behavior.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewAudienceModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Audience Segment</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {audiences.map(aud => (
              <div
                key={aud.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{aud.segment_name}</span>
                  <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-black text-indigo-950">
                    {(aud.total_members || 0).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">Recipients</span>
                </div>

                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-600 truncate">
                  Criteria: {JSON.stringify(aud.criteria || {})}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteAudience(aud.id!)}
                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                    title="Delete Segment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* New Audience Modal */}
          {showNewAudienceModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm text-slate-900">Create Audience Segment</h4>
                  <button type="button" onClick={() => setShowNewAudienceModal(false)} className="cursor-pointer text-slate-400">✕</button>
                </div>
                <form onSubmit={handleCreateAudience} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Segment Name:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VIP Selvedge Enthusiasts"
                      value={newAudience.segment_name || ''}
                      onChange={e => setNewAudience({ ...newAudience, segment_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Initial Member Estimate:</label>
                    <input
                      type="number"
                      value={newAudience.total_members || ''}
                      onChange={e => setNewAudience({ ...newAudience, total_members: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button type="button" onClick={() => setShowNewAudienceModal(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow cursor-pointer">Save Segment</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. LIVE CHAT AUTO-CLAIM BOT */}
      {activeSubTab === 'chat-claim' && <ChatClaimAutomationTab />}

      {/* 8. SUPPLEMENTARY TAB: VIP MEDIA DROPS */}
      {activeSubTab === 'auto-broadcast' && <AutoPhotoBroadcastTab />}

      {/* 9. SUPPLEMENTARY TAB: LIVE STREAM BROADCAST DESK */}
      {activeSubTab === 'live-desk' && <LiveBroadcastDeskTab />}

      {/* 10. AD CATALOG FEEDS & TRACKING PIXELS */}
      {activeSubTab === 'ad-catalog-pixels' && <AdCatalogFeedsTab />}

      {/* 11. STOREFRONT ANALYTICS & TRAFFIC ENGINE */}
      {activeSubTab === 'storefront-analytics' && <StorefrontAnalyticsView />}

      {/* Multi-Device WhatsApp Linking Modal */}
      <WhatsAppDeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentUserId={currentOperator.id}
        currentUserName={currentOperator.name || currentOperator.username}
      />

      {/* 🧠 AI BRAIN TRAINER & CONTINUOUS LEARNING MODAL (3-WAY TRAINING) */}
      {isAiTrainerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-purple-300 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-amber-300">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-lg tracking-tight flex items-center gap-2">
                    <span>🧠 Vintage Vibes AI Brain Trainer</span>
                    <span className="text-[10px] font-mono bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 px-2 py-0.5 rounded-full">
                      3-Way Live Learning Active
                    </span>
                  </h3>
                  <p className="text-xs text-purple-200 mt-0.5">
                    Teach the WhatsApp AI new offers, shop policies, delivery rules, or custom Q&amp;A replies without touching code.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAiTrainerOpen(false)}
                className="text-purple-200 hover:text-white text-sm font-bold px-2.5 py-1 rounded-lg bg-white/10 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* WhatsApp Direct Training Guide Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-purple-700" />
                    <span>WhatsApp Direct Training (Text &amp; Voice Note Enabled!)</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-purple-200 text-purple-900 px-2 py-0.5 rounded">
                    Authorized Trainers Only
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  <strong>Mr. Muhammad Akram (+971 52 804 9351)</strong> aur <strong>Mr. Murtaza Makkani (+92 302 2190822)</strong> seedha apne WhatsApp se Text ya <strong>Voice Note</strong> bhej kar AI ko train kar sakte hain:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div className="bg-white p-2.5 rounded-lg border border-purple-200">
                    <div className="font-bold text-purple-900">#learn &lt;rule/offer&gt;</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Example: #learn Eid offer mein 3 shirts par 20% discount hai</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-purple-200">
                    <div className="font-bold text-purple-900">#memory / #forget 1</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">View all learned rules on WhatsApp or delete by number</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-purple-200">
                    <div className="font-bold text-purple-900">Auto-Observe Owner</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Jab Owner phone se customer ko jawab dega, AI khud seekh lega!</div>
                  </div>
                </div>
              </div>

              {/* Add New Rule / Q&A Form */}
              <form onSubmit={handleAddAiRule} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">➕ Teach AI a New Rule, Offer, or Q&amp;A Reply</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNewAiRuleType('RULE_OR_FACT')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        newAiRuleType === 'RULE_OR_FACT'
                          ? 'bg-purple-700 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      📌 Business Rule / Offer
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAiRuleType('OBSERVED_QA')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        newAiRuleType === 'OBSERVED_QA'
                          ? 'bg-purple-700 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      💬 Custom Q&amp;A Example
                    </button>
                  </div>
                </div>

                {newAiRuleType === 'OBSERVED_QA' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">When Customer Asks (Question):</label>
                    <input
                      type="text"
                      placeholder="e.g. Wholesale bale ka kya rate hai? / Do you ship to Saudi Arabia?"
                      value={newAiQuestionText}
                      onChange={e => setNewAiQuestionText(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {newAiRuleType === 'OBSERVED_QA'
                      ? 'How AI Should Reply (Answer / Fact):'
                      : 'Rule, Offer, Timing, or Instruction for AI:'}
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Agar koi customer 3 shirts lega to delivery bilkul FREE hogi aur 15% special discount milega."
                    value={newAiRuleText}
                    onChange={e => setNewAiRuleText(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingAiRule}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow cursor-pointer disabled:opacity-50"
                  >
                    {isSavingAiRule ? 'Saving to AI Brain...' : '🧠 Save to AI Brain Memory'}
                  </button>
                </div>
              </form>

              {/* Active AI Brain Memory List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs">
                    📚 Active AI Learned Memory ({aiMemoryItems.length} Rules &amp; Observed Q&amp;As)
                  </h4>
                  <button
                    type="button"
                    onClick={loadAiMemory}
                    className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Refresh Memory
                  </button>
                </div>

                {aiMemoryItems.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-500">
                    No custom rules taught yet. Add a rule above or send <strong>#learn ...</strong> on WhatsApp from +971 52 804 9351 or +92 302 2190822!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {aiMemoryItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                              #{idx + 1}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.type === 'OBSERVED_QA'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                            >
                              {item.type === 'OBSERVED_QA' ? '👁️ Auto-Observed / Q&A' : '📌 Rule / Fact'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              By: {item.taughtBy} • {item.createdAt}
                            </span>
                          </div>
                          <p className="text-xs text-slate-900 font-medium">{item.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAiRule(item.id)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer shrink-0"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingAutomationView;

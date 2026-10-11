import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  MessageSquare,
  RefreshCw,
  Copy,
  Check,
  Send,
  ExternalLink,
  Truck,
  TrendingUp,
  Package,
  CreditCard,
  Building2,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { WhatsAppService } from '../../../services/whatsappService.ts';
import { CompanyProfileService } from '../../../services/companyProfileService.ts';

interface ExecutiveWhatsAppDigestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExecutiveWhatsAppDigestModal: React.FC<ExecutiveWhatsAppDigestModalProps> = ({
  isOpen,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportText, setReportText] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState('/whatsapp_daily_digest_card.png');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [activeTab, setActiveTab] = useState<'CARD' | 'TEXT'>('CARD');
  const [targetPhone, setTargetPhone] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState('');
  const [sendErrorMsg, setSendErrorMsg] = useState('');

  const fetchDigest = async () => {
    setLoading(true);
    setSendSuccessMsg('');
    setSendErrorMsg('');
    try {
      const res = await WhatsAppService.getDailyDigestReport();
      if (res.success && res.reportText) {
        setReportText(res.reportText);
        if (res.metrics) {
          setMetrics(res.metrics);
        }
        if (res.imageUrl) {
          setImageUrl(res.imageUrl);
        }
        setLastRefreshedAt(new Date().toLocaleTimeString());
      } else {
        setReportText(res.reportText || 'Could not load daily digest.');
        setSendErrorMsg(res.error || 'Failed to generate live digest');
      }
    } catch (err: any) {
      setSendErrorMsg(err?.message || 'Error generating report');
    } finally {
      setLoading(false);
    }
  };

  // Real-Time Auto-Refresh Interval: Updates digest metrics every 30 seconds automatically
  useEffect(() => {
    if (isOpen) {
      fetchDigest();
      CompanyProfileService.getCompanyProfile().then(p => {
        if (p?.phone) setTargetPhone(p.phone);
      }).catch(() => {});

      const interval = setInterval(() => {
        fetchDigest();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch (err) {
      // Fallback
    }
  };

  const handleSendApi = async () => {
    setSending(true);
    setSendSuccessMsg('');
    setSendErrorMsg('');

    try {
      const cleanPhone = targetPhone.replace(/\D/g, '');
      const res = await WhatsAppService.sendDailyDigest('', cleanPhone, imageUrl);
      if (res.success) {
        setSendSuccessMsg(res.message || '📸 Official visual PNG card dispatched to WhatsApp (Photo Only)!');
      } else {
        setSendErrorMsg(res.error || 'Failed to dispatch via WhatsApp gateway');
      }
    } catch (err: any) {
      setSendErrorMsg(err?.message || 'Network error dispatching message');
    } finally {
      setSending(false);
    }
  };

  const handleOpenWhatsAppWeb = () => {
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reportText)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  const fmt = (n: number | undefined) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white flex items-center justify-between border-b border-emerald-600/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-black text-base sm:text-lg text-white flex items-center gap-2">
                  <span>Executive WhatsApp Daily Digest</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/40 uppercase font-bold">
                    Live Analytics
                  </span>
                </h3>
                <p className="text-xs text-emerald-200/80">
                  Daily purchases, multi-channel sales (B2B, Shop, POS, E-Com), liquidity & courier liabilities
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchDigest}
                disabled={loading}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Refresh Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white/10 hover:bg-rose-600 text-white transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50">
            
            {/* KPI Summary Cards */}
            {metrics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Daily Purchases */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-amber-600" /> Purchases (Today)
                    </span>
                    <span className="font-mono text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                      {metrics.purchases?.count || 0} Invoices
                    </span>
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono">
                    AED {fmt(metrics.purchases?.total)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Bales: <strong>{metrics.purchases?.balesCount || 0}</strong> ({Number(metrics.purchases?.balesWeight || 0).toFixed(1)} KG)
                  </div>
                </div>

                {/* 2. Total Gross Sales */}
                <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-600" /> Total Gross Sales
                    </span>
                    <span className="font-mono text-[10px] bg-indigo-50 text-indigo-800 px-1.5 py-0.2 rounded font-bold">
                      {metrics.sales?.totalOrders || 0} Orders
                    </span>
                  </div>
                  <div className="text-base font-black text-indigo-950 font-mono">
                    AED {fmt(metrics.sales?.totalGross)}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Live: <strong>AED {fmt(metrics.sales?.live?.total)}</strong></span>
                    <span>POS: <strong>AED {fmt(metrics.sales?.pos?.total)}</strong></span>
                  </div>
                </div>

                {/* 3. Cash & Bank Liquidity */}
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Direct Inflow
                    </span>
                    <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                      Wire / POS
                    </span>
                  </div>
                  <div className="text-base font-black text-emerald-700 font-mono">
                    AED {fmt(metrics.liquidity?.totalCollections || metrics.liquidity?.bankReceived)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    COD in Transit: <strong>AED {fmt(metrics.liquidity?.codInTransit)}</strong> (DHL)
                  </div>
                </div>

                {/* 4. Courier Liabilities */}
                <div className="bg-white p-3 rounded-xl border border-rose-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-rose-600" /> Courier Liability
                    </span>
                    <span className="font-mono text-[10px] bg-rose-50 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                      COA 2120-00
                    </span>
                  </div>
                  <div className="text-base font-black text-rose-700 font-mono">
                    AED {fmt(metrics.courierLiability?.total)}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate" title="Banana Express UAE & Courier Agents">
                    {metrics.courierLiability?.couriers?.find((c: any) => parseFloat(c.current_balance) > 0)?.name || 'Active Transporters'}
                  </div>
                </div>
              </div>
            )}

            {/* Notification Messages */}
            {sendSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{sendSuccessMsg}</span>
              </div>
            )}

            {sendErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{sendErrorMsg}</span>
              </div>
            )}

            {/* Recipient Phone Configuration */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">Dispatch Recipient (WhatsApp):</label>
                <input
                  type="text"
                  value={targetPhone}
                  onChange={e => setTargetPhone(e.target.value)}
                  placeholder="+971 55 418 6086"
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                  <span>{copySuccess ? 'Copied!' : 'Copy Text'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsAppWeb}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Open WhatsApp Web or App directly"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendApi}
                  disabled={sending || loading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>📸 Dispatch PNG Card (Photo Only)</span>
                </button>
              </div>
            </div>

            {/* Tab Selector & Preview Controls */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('CARD')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'CARD'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>📸 Visual PNG Graphic Card</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-400/30 text-white font-mono uppercase font-black">
                    Live Photo
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('TEXT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'TEXT'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>📝 Formatted Caption & Markdown</span>
                </button>
              </div>

              {lastRefreshedAt && (
                <span className="text-[11px] text-slate-500 font-mono hidden sm:inline-block">
                  Auto-Update Active: {lastRefreshedAt} (every 30s)
                </span>
              )}
            </div>

            {/* TAB 1: Visual PNG Graphic Card Preview */}
            {activeTab === 'CARD' && (
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-700 flex flex-col items-center justify-center space-y-2">
                <div className="flex items-center justify-between w-full text-[11px] text-emerald-400 font-bold px-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Actual PNG Graphic Card Dispatched to WhatsApp
                  </span>
                  {lastRefreshedAt && (
                    <span className="font-mono text-slate-400 text-[10px]">Rendered: {lastRefreshedAt}</span>
                  )}
                </div>
                <div className="w-full flex items-center justify-center bg-black/40 rounded-lg p-2 overflow-hidden max-h-[460px]">
                  <img
                    src={`/whatsapp_daily_digest_card.png?t=${lastRefreshedAt || Date.now()}`}
                    alt="Executive WhatsApp Daily Digest Card"
                    className="max-h-[440px] max-w-full object-contain rounded-lg shadow-lg border border-slate-800"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/vintage_logo.svg';
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center font-medium">
                  ⚡ This high-resolution visual PNG photo is sent directly into WhatsApp alongside the executive report summary.
                </p>
              </div>
            )}

            {/* TAB 2: Textarea for Full Text & Markdown */}
            {activeTab === 'TEXT' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>Formatted WhatsApp Message Caption:</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {reportText.length} Characters &bull; Full Markdown & Emojis
                  </span>
                </div>

                <textarea
                  value={reportText}
                  onChange={e => setReportText(e.target.value)}
                  rows={16}
                  className="w-full font-mono text-xs p-3 rounded-xl bg-slate-900 text-emerald-300 border border-slate-700 shadow-inner leading-relaxed focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              <span>Entity: <strong>VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</strong></span>
              <span className="ml-2 font-mono text-slate-400">&bull; License: CN-5888545</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ExecutiveWhatsAppDigestModal;

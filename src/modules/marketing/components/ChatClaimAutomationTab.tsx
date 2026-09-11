import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Bot,
  Zap,
  Lock,
  FileText,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Sparkles,
  Users,
  Smartphone,
  Share2,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  DollarSign,
  Printer,
  Globe,
  CreditCard,
  Receipt
} from 'lucide-react';
import { AutoClaimKeywordRule, BotResponseTemplate, ChatClaimRecord, WhatsAppVipDropPayload } from '../marketing.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { SocialLiveConnectModal } from './SocialLiveConnectModal.tsx';

export const ChatClaimAutomationTab: React.FC = () => {
  // Tab Switcher between Auto-Claim Bot & WhatsApp VIP Drops
  const [activeSubView, setActiveSubView] = useState<'bot-claim' | 'whatsapp-broadcast'>('bot-claim');
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<string | null>(null);

  // Rules & Templates State
  const [keywordRules, setKeywordRules] = useState<AutoClaimKeywordRule[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [responseTemplate, setResponseTemplate] = useState<BotResponseTemplate | null>(null);
  const [claimLogs, setClaimLogs] = useState<ChatClaimRecord[]>([]);
  const [availablePieces, setAvailablePieces] = useState<PieceBreakdownItem[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSavedFeedback, setTemplateSavedFeedback] = useState(false);

  // Simulator State
  const [simPlatform, setSimPlatform] = useState<'tiktok' | 'instagram' | 'facebook' | 'youtube'>('tiktok');
  const [simCustomer, setSimCustomer] = useState('@dubai_collector_77');
  const [simComment, setSimComment] = useState('MINE VV-BAL-001-0001');
  const [simOfferedPrice, setSimOfferedPrice] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{
    isClaim: boolean;
    success: boolean;
    claimRecord?: ChatClaimRecord;
    replyMessage: string;
    error?: string;
  } | null>(null);

  // WhatsApp VIP Broadcast State
  const [vipDrops, setVipDrops] = useState<WhatsAppVipDropPayload[]>([]);
  const [dropTitle, setDropTitle] = useState('Weekend Archive Drop: 90s Carhartt & Single Stitch Grails');
  const [dropTargetGroup, setDropTargetGroup] = useState<'VIP_GOLD_BUYERS' | 'STREETWEAR_VIP' | 'LEATHER_ARCHIVE_VIP' | 'ALL_CUSTOMERS'>('VIP_GOLD_BUYERS');
  const [selectedPieceSkus, setSelectedPieceSkus] = useState<string[]>([]);
  const [customVipNote, setCustomVipNote] = useState('Reserved exclusively for VIP buyers prior to the public live stream!');
  const [isBroadcastingDrop, setIsBroadcastingDrop] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<WhatsAppVipDropPayload | null>(null);

  const fetchBotConfig = async () => {
    try {
      const [rulesRes, tmplRes, logsRes, piecesRes, dropsRes] = await Promise.all([
        fetch('/api/marketing/chat-claim/rules'),
        fetch('/api/marketing/chat-claim/template'),
        fetch('/api/marketing/chat-claim/logs'),
        fetch('/api/purchase/pieces'),
        fetch('/api/marketing/vip-drops')
      ]);

      if (rulesRes.ok) setKeywordRules(await rulesRes.json());
      if (tmplRes.ok) setResponseTemplate(await tmplRes.json());
      if (logsRes.ok) setClaimLogs(await logsRes.json());
      if (piecesRes.ok) {
        const piecesData = await piecesRes.json();
        const inStock = (piecesData || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
        setAvailablePieces(inStock);
        if (inStock.length > 0 && selectedPieceSkus.length === 0) {
          setSelectedPieceSkus(inStock.slice(0, 3).map((p: PieceBreakdownItem) => p.barcode));
        }
      }
      if (dropsRes.ok) setVipDrops(await dropsRes.json());
    } catch (err) {
      console.warn('Error loading chat claim config:', err);
    }
  };

  useEffect(() => {
    fetchBotConfig();
  }, []);

  // Save Keyword Rules
  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    const clean = newKeyword.trim().toUpperCase();
    if (keywordRules.some(r => r.keyword === clean)) return;

    const updated: AutoClaimKeywordRule[] = [
      ...keywordRules,
      {
        id: `kw-${Date.now()}`,
        keyword: clean,
        action: 'LOCK_AND_DRAFT_INVOICE',
        enabled: true,
        matchType: 'STARTS_WITH',
        lockDurationMinutes: 15,
        priority: keywordRules.length + 1
      }
    ];

    setKeywordRules(updated);
    setNewKeyword('');
    await fetch('/api/marketing/chat-claim/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  };

  const handleToggleRule = async (id: string) => {
    const updated = keywordRules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setKeywordRules(updated);
    await fetch('/api/marketing/chat-claim/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  };

  const handleDeleteRule = async (id: string) => {
    const updated = keywordRules.filter(r => r.id !== id);
    setKeywordRules(updated);
    await fetch('/api/marketing/chat-claim/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  };

  // Save Response Template
  const handleSaveTemplate = async () => {
    if (!responseTemplate) return;
    setIsSavingTemplate(true);
    try {
      await fetch('/api/marketing/chat-claim/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responseTemplate)
      });
      setTemplateSavedFeedback(true);
      setTimeout(() => setTemplateSavedFeedback(false), 2500);
    } catch (err) {
      console.warn('Error saving response template:', err);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Run Simulated Comment through Webhook Engine
  const handleRunSimulation = async () => {
    if (!simComment.trim()) return;
    setIsSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/marketing/chat-claim/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: simComment,
          customerHandle: simCustomer,
          platform: simPlatform,
          boothId: 'booth-01',
          offeredPrice: simOfferedPrice ? Number(simOfferedPrice) : undefined
        })
      });

      const data = await res.json();
      setSimResult(data);
      // Refresh claim logs & available pieces
      fetchBotConfig();
    } catch (err: any) {
      setSimResult({
        isClaim: false,
        success: false,
        replyMessage: '',
        error: err?.message || 'Simulation network error'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Broadcast WhatsApp VIP Drop
  const handleBroadcastVipDrop = async () => {
    if (selectedPieceSkus.length === 0) return;
    setIsBroadcastingDrop(true);
    setBroadcastSuccess(null);

    try {
      const res = await fetch('/api/marketing/vip-drops/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignTitle: dropTitle,
          targetGroup: dropTargetGroup,
          pieceIds: selectedPieceSkus,
          customNote: customVipNote
        })
      });

      if (res.ok) {
        const drop = await res.json();
        setBroadcastSuccess(drop);
        setVipDrops(prev => [drop, ...prev]);
      }
    } catch (err) {
      console.warn('VIP drop broadcast failure:', err);
    } finally {
      setIsBroadcastingDrop(false);
    }
  };

  // 1-Click Generate & Post Official Sales Invoice into General Ledger
  const handleGenerateAutoInvoice = async (claimId: string) => {
    setIsGeneratingInvoice(claimId);
    try {
      const res = await fetch('/api/marketing/auto-invoice/generate-from-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Sales Invoice Created & Posted into Ledger!\n\nInvoice No: ${data.invoice.invoiceNo}\nTotal: AED ${data.invoice.totalAmount} (5% VAT included)\nCustomer: ${data.invoice.customerName}\nLedger Status: ${data.invoice.status}`);
        // Refresh claim logs
        const logsRes = await fetch('/api/marketing/chat-claim/logs');
        if (logsRes.ok) setClaimLogs(await logsRes.json());
      } else {
        alert(`Failed to generate invoice: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error generating invoice: ${err.message}`);
    } finally {
      setIsGeneratingInvoice(null);
    }
  };

  // 1-Click Send Mobile Payment Link via WhatsApp (Apple Pay / Google Pay / Card)
  const handleSendPaymentLink = (log: ChatClaimRecord) => {
    const paymentUrl = `https://checkout.vintagevibe.ae/pay/chk-${(log.sku || 'item').toLowerCase()}`;
    const message = `✨ Hello ${log.customerHandle}! Your live claim for ${log.sku} (AED ${log.priceAed}) is confirmed.\n\nComplete instant 1-Tap payment (Apple Pay / Google Pay / Card):\n${paymentUrl}\n\nInvoice: ${log.invoiceNo || 'Draft Reserved'}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  // 1-Click Print Thermal POS Receipt
  const handlePrintReceipt = (log: ChatClaimRecord) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Thermal Receipt - ${log.sku}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 15px; line-height: 1.4; }
            .center { text-align: center; }
            .line { border-top: 1px dashed #000; margin: 10px 0; }
            .row { display: flex; justify-content: space-between; }
            .bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 14px;">VINTAGE VIBES DUBAI</div>
          <div class="center">HQ Live Stream Sales Counter</div>
          <div class="center">TRN: 100492837400003</div>
          <div class="line"></div>
          <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
          <div><strong>Invoice:</strong> ${log.invoiceNo || 'DRAFT-CLAIM'}</div>
          <div><strong>Customer:</strong> ${log.customerHandle}</div>
          <div><strong>Platform:</strong> ${log.platform.toUpperCase()} LIVE</div>
          <div class="line"></div>
          <div class="row">
            <span>${log.sku}</span>
            <span>AED ${Number(log.priceAed).toFixed(2)}</span>
          </div>
          <div class="line"></div>
          <div class="row bold">
            <span>TOTAL AMOUNT</span>
            <span>AED ${Number(log.priceAed).toFixed(2)}</span>
          </div>
          <div class="row" style="font-size: 10px; color: #555;">
            <span>Inc. 5% UAE VAT</span>
            <span>AED ${(Number(log.priceAed) * 0.05 / 1.05).toFixed(2)}</span>
          </div>
          <div class="line"></div>
          <div class="center" style="font-size: 10px;">
            Claim Confirmed • 15-Min Reserve Active<br/>
            Thank you for shopping Vintage Vibes!
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Sub-View Switcher Header */}
      <div className="flex items-center justify-between border-b border-amber-200 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubView('bot-claim')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubView === 'bot-claim'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Auto-Claim Keyword Engine & Simulator</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('whatsapp-broadcast')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubView === 'whatsapp-broadcast'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp VIP Auto-Broadcast Desk</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSocialModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 via-pink-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>🌐 Connect Social Channels (YouTube • IG • TikTok)</span>
          </button>

          <button
            type="button"
            onClick={fetchBotConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync State</span>
          </button>
        </div>
      </div>

      {/* Auto-Invoice & Live Stream Ingest Rules Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border border-emerald-500/40 rounded-xl p-4 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 font-bold text-lg shrink-0">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-white">Automated Claim-to-Invoice Ledger Engine</span>
              <span className="text-[10px] bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2 py-0.5 rounded-full font-bold font-mono">
                UAE VAT 5% • General Ledger Acct 4001 • 15-Min Hold
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Live claims automatically generate and post balanced Sales Invoices into General Ledger with 15-min reservation holds and instant Apple/Google Pay links.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSocialModalOpen(true)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 shrink-0"
        >
          <span>⚙️ Configure Auto-Invoice & Social Streams</span>
        </button>
      </div>

      {activeSubView === 'bot-claim' ? (
        <div className="space-y-6">
          {/* Top Row: Keyword Rules & Bot Response Template */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 1. Keyword Trigger Rules */}
            <div className="lg:col-span-5 bg-white border border-amber-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Auto-Claim Trigger Keywords</h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">Instant Atomic Lock</span>
                </div>
                <p className="text-xs text-slate-600 mb-4">
                  Incoming live comments starting with these trigger words immediately lock the target SKU and generate a draft invoice.
                </p>

                {/* Keyword Pills List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {keywordRules.map(rule => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleRule(rule.id)}
                          className="w-4 h-4 text-amber-600 rounded cursor-pointer accent-amber-500"
                        />
                        <span className={`font-mono font-black ${rule.enabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                          "{rule.keyword}"
                        </span>
                        <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded font-mono">
                          {rule.lockDurationMinutes}m lock
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer transition"
                        title="Delete keyword"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Keyword */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="e.g. COP, DIB, BUY"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs uppercase font-mono text-slate-800 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* 2. Bot Response Template Editor */}
            <div className="lg:col-span-7 bg-white border border-amber-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Bot Auto-Reply & Checkout Link Template</h4>
                  </div>
                  {templateSavedFeedback && (
                    <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  Placeholders: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-amber-900">{`{customer}`}</code>,{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-amber-900">{`{sku}`}</code>,{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-amber-900">{`{item_name}`}</code>,{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-amber-900">{`{price}`}</code>,{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-amber-900">{`{checkout_link}`}</code>
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                      Success Lock Response Message:
                    </label>
                    <textarea
                      rows={3}
                      value={responseTemplate?.successTemplate || ''}
                      onChange={e =>
                        setResponseTemplate(prev =>
                          prev ? { ...prev, successTemplate: e.target.value } : null
                        )
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-sans focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                      Already Claimed / Out-of-Stock Fallback:
                    </label>
                    <input
                      type="text"
                      value={responseTemplate?.alreadyClaimedTemplate || ''}
                      onChange={e =>
                        setResponseTemplate(prev =>
                          prev ? { ...prev, alreadyClaimedTemplate: e.target.value } : null
                        )
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Auto-appends direct payment URL</span>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                  className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition cursor-pointer active:scale-95"
                >
                  {isSavingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Incoming Comment Simulator */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950 border border-amber-500/40 rounded-xl p-5 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-base text-white">
                    Live Chat Claim Simulator & Webhook Tester
                  </h4>
                  <span className="text-xs text-amber-200/80">
                    Simulate real-time buyer comments from TikTok Live, Instagram, or Facebook Live
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ● Webhook Active: /api/marketing/chat-claim/webhook
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              {/* Platform Selector */}
              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Social Platform
                </label>
                <select
                  value={simPlatform}
                  onChange={e => setSimPlatform(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="tiktok">TikTok Live Multistream</option>
                  <option value="instagram">Instagram Live Broadcast</option>
                  <option value="facebook">Facebook VIP Stream</option>
                  <option value="youtube">YouTube SuperChat</option>
                </select>
              </div>

              {/* Customer Handle */}
              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Customer Handle
                </label>
                <input
                  type="text"
                  value={simCustomer}
                  onChange={e => setSimCustomer(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Comment Input */}
              <div className="sm:col-span-4">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Incoming Live Comment Text
                </label>
                <input
                  type="text"
                  value={simComment}
                  onChange={e => setSimComment(e.target.value)}
                  placeholder="e.g. MINE VV-BAL-001-0001"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Action Button */}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className="w-full py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-bounce' : ''}`} />
                  <span>{isSimulating ? 'Processing...' : 'Run Bot'}</span>
                </button>
              </div>
            </div>

            {/* Quick Helper Sample Buttons */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400">Quick Test Samples:</span>
              {availablePieces.slice(0, 4).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSimComment(`MINE ${p.barcode}`)}
                  className="text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-0.5 rounded border border-slate-700 transition cursor-pointer"
                >
                  MINE {p.barcode} ({p.itemName.slice(0, 18)}...)
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSimComment(`CLAIM VV-BAL-001-9999`)}
                className="text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 transition cursor-pointer"
              >
                Test Invalid SKU
              </button>
            </div>

            {/* Simulation Execution Result Breakdown */}
            {simResult && (
              <div
                className={`mt-4 p-4 rounded-lg border text-xs ${
                  simResult.success
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-100'
                    : 'bg-red-950/60 border-red-500/50 text-red-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                    {simResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Instant Auto-Claim Execution Success</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span>Execution Rejected: {simResult.error || 'Claim Not Granted'}</span>
                      </>
                    )}
                  </span>
                  {simResult.claimRecord?.invoiceNo && (
                    <span className="font-mono bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-400/40 text-[11px] font-bold">
                      Invoice: {simResult.claimRecord.invoiceNo}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-2 text-[11px] font-mono">
                  <div className="bg-black/40 p-2 rounded border border-white/10">
                    <span className="text-slate-400 block">1. Atomic Lock:</span>
                    <span className="font-bold text-white">
                      {simResult.success ? '✅ Locked in DB (15 mins)' : '❌ Not Locked'}
                    </span>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-white/10">
                    <span className="text-slate-400 block">2. Pending Sales Invoice:</span>
                    <span className="font-bold text-white">
                      {simResult.claimRecord?.invoiceNo || 'None'}
                    </span>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-white/10">
                    <span className="text-slate-400 block">3. Checkout Payment Link:</span>
                    <span className="font-bold text-amber-300 truncate block">
                      {simResult.claimRecord?.checkoutUrl || 'None'}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-white/10">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">
                    Auto-Dispatched Reply to Customer:
                  </span>
                  <div className="p-2 bg-black/50 rounded font-sans text-xs text-white border border-white/10 flex items-center justify-between gap-2">
                    <span>{simResult.replyMessage}</span>
                    {simResult.claimRecord?.checkoutUrl && (
                      <a
                        href={simResult.claimRecord.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded text-[11px] font-bold shrink-0 flex items-center gap-1"
                      >
                        <span>Test Checkout</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Claim Activity Log Table */}
          <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-amber-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-700" />
                <h4 className="font-bold text-sm text-slate-900">Real-Time Chat Claim Activity Log</h4>
                <span className="text-xs bg-amber-200/80 text-amber-900 font-mono px-2 py-0.5 rounded-full font-bold">
                  {claimLogs.length} Records
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono hidden sm:inline-block">
                Auto-Synced with ERP Sales Invoices
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Comment & Keyword</th>
                    <th className="py-2.5 px-3">Target SKU</th>
                    <th className="py-2.5 px-3">Price (AED)</th>
                    <th className="py-2.5 px-3">Draft Invoice</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Dispatched Reply</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                  {claimLogs.length > 0 ? (
                    claimLogs.map(log => (
                      <tr key={log.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            {log.platform}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {log.customerHandle}
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate">
                          <span className="text-amber-800 font-mono font-bold mr-1">[{log.matchedKeyword}]</span>
                          <span>"{log.rawComment}"</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {log.sku}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          AED {log.priceAed}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold whitespace-nowrap">
                          {log.invoiceNo || '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              log.status === 'LOCK_ACTIVE'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : log.status === 'CONFIRMED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[240px] truncate" title={log.replyDispatched}>
                          {log.replyDispatched}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGenerateAutoInvoice(log.id)}
                              disabled={isGeneratingInvoice === log.id}
                              title="Post Balanced Sales Invoice into ERP Ledger"
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10px] transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              <span>{isGeneratingInvoice === log.id ? 'Posting...' : '📄 Auto Invoice'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendPaymentLink(log)}
                              title="Send 1-Tap Apple/Google Pay Link via WhatsApp"
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[10px] transition cursor-pointer shadow-xs flex items-center gap-1"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>💳 Pay Link</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePrintReceipt(log)}
                              title="Print Instant Thermal POS Receipt"
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-[10px] transition cursor-pointer shadow-xs flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              <span>🖨️ Receipt</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No chat claims recorded yet. Run a test using the simulator above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* WhatsApp Auto-Broadcast Desk Sub-View */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-emerald-500/40 rounded-xl p-5 text-emerald-100 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 text-emerald-300">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-white">
                  WhatsApp VIP Drop Auto-Broadcast Engine
                </h3>
                <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl">
                  Dispatch new high-grade vintage garment arrivals directly to curated VIP customer groups with photo grids, SKU tags, and instant checkout payment links.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 rounded-full text-xs font-mono font-bold shrink-0">
              ● WhatsApp Business API Connected
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Broadcast Form */}
            <div className="lg:col-span-6 bg-white border border-amber-200 rounded-xl p-5 shadow-xs space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>Create VIP Drop Campaign</span>
              </h4>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                  Drop Campaign Title
                </label>
                <input
                  type="text"
                  value={dropTitle}
                  onChange={e => setDropTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                  Target Customer VIP Group
                </label>
                <select
                  value={dropTargetGroup}
                  onChange={e => setDropTargetGroup(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
                >
                  <option value="VIP_GOLD_BUYERS">Dubai Gold VIP Buyers (164 members • 50+ purchases)</option>
                  <option value="STREETWEAR_VIP">Streetwear & Y2K VIP Circle (280 members)</option>
                  <option value="LEATHER_ARCHIVE_VIP">Leather & Moto Archive Collectors (95 members)</option>
                  <option value="ALL_CUSTOMERS">All Registered VIP Customers (840 members)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                  Select Garments to Feature in Drop
                </label>
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {availablePieces.slice(0, 15).map(piece => {
                    const isSelected = selectedPieceSkus.includes(piece.barcode);
                    return (
                      <div
                        key={piece.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPieceSkus(prev => prev.filter(s => s !== piece.barcode));
                          } else {
                            setSelectedPieceSkus(prev => [...prev, piece.barcode]);
                          }
                        }}
                        className={`p-2 flex items-center justify-between text-xs cursor-pointer transition ${
                          isSelected ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                          />
                          <span className="font-mono text-slate-900">{piece.barcode}</span>
                          <span className="truncate max-w-[180px]">{piece.itemName}</span>
                        </div>
                        <span className="font-mono text-emerald-700">AED {piece.retailPriceAed || piece.estimatedPrice}</span>
                      </div>
                    );
                  })}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {selectedPieceSkus.length} pieces selected for broadcast
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                  Custom VIP Announcement Note
                </label>
                <textarea
                  rows={2}
                  value={customVipNote}
                  onChange={e => setCustomVipNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={handleBroadcastVipDrop}
                disabled={isBroadcastingDrop || selectedPieceSkus.length === 0}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isBroadcastingDrop ? 'Transmitting via Cloud API...' : 'Broadcast VIP Drop Collection'}</span>
              </button>
            </div>

            {/* Right: Message Preview & History */}
            <div className="lg:col-span-6 space-y-4">
              {/* WhatsApp Device Preview Box */}
              <div className="bg-[#EFEAE2] border-2 border-[#D1D7DB] rounded-xl p-4 shadow-md font-sans">
                <div className="flex items-center gap-2 border-b border-slate-300 pb-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-black">
                    VV
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Vintage Vibes VIP Concierge</span>
                    <span className="text-[10px] text-slate-500">Official WhatsApp Business Account</span>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-3 shadow-xs border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  🚨 *VINTAGE VIBES VIP COLLECTION DROP* 🚨{'\n\n'}
                  *{dropTitle}*{'\n\n'}
                  {customVipNote}{'\n\n'}
                  {selectedPieceSkus.map((sku, i) => {
                    const p = availablePieces.find(item => item.barcode === sku);
                    const price = p?.retailPriceAed || p?.estimatedPrice || 120;
                    return (
                      <div key={sku} className="my-1 py-1 border-b border-slate-100 last:border-0">
                        {i + 1}. *{p?.itemName || sku}* ({p?.brandName || 'Vintage'})\n
                        &nbsp;&nbsp;• Size: {p?.sizeScanned || 'L'} | Grade: {p?.labelGrade || 'Grade A'}\n
                        &nbsp;&nbsp;• Price: AED {price} / ${Math.round(price * 0.272)}\n
                        &nbsp;&nbsp;• Buy: http://localhost:3000/?checkout={sku}
                      </div>
                    );
                  })}
                  {'\n'}
                  📦 *Complimentary VIP Courier Dispatch across UAE & GCC*{'\n'}
                  💬 Reply to hold your piece instantly!
                </div>

                {broadcastSuccess && (
                  <div className="mt-3 p-2.5 bg-emerald-100 border border-emerald-400 rounded-lg text-emerald-900 text-xs flex items-center justify-between">
                    <span className="font-bold">✅ Drop transmitted to {broadcastSuccess.recipientCount} VIP recipients!</span>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(broadcastSuccess.generatedText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>Open WhatsApp Web</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Past Drops History */}
              <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
                <h5 className="font-bold text-xs text-slate-900 mb-2 uppercase tracking-wide">
                  Recent WhatsApp VIP Drops History
                </h5>
                <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                  {vipDrops.map(drop => (
                    <div key={drop.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 block truncate max-w-[240px]">
                          {drop.campaignTitle}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {drop.targetGroup} • {drop.recipientCount} Recipients • {drop.pieceIds.length} items
                        </span>
                      </div>
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        DELIVERED
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Live Streams Connect Modal (YouTube, Instagram, TikTok) */}
      <SocialLiveConnectModal
        isOpen={isSocialModalOpen}
        onClose={() => setIsSocialModalOpen(false)}
      />
    </div>
  );
};

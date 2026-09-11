import React, { useState, useEffect } from 'react';
import {
  Video,
  Radio,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Layers,
  FileText,
  Check,
  X
} from 'lucide-react';
import { SocialLiveAccountConfig, AutoInvoiceRules } from '../marketing.types.ts';

interface SocialLiveConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SocialLiveConnectModal: React.FC<SocialLiveConnectModalProps> = ({
  isOpen,
  onClose
}) => {
  const [accounts, setAccounts] = useState<SocialLiveAccountConfig[]>([]);
  const [activePlatform, setActivePlatform] = useState<'youtube' | 'instagram' | 'tiktok'>('youtube');
  const [showStreamKey, setShowStreamKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTestingPing, setIsTestingPing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  // Auto-Invoice Setup State
  const [autoInvoiceRules, setAutoInvoiceRules] = useState<AutoInvoiceRules>({
    autoGenerateTaxInvoice: true,
    autoPostToLedger: true,
    defaultVatPercent: 5,
    reservationExpiryMins: 15,
    defaultPaymentMethod: 'DIGITAL_GATEWAY',
    printThermalReceipt: true
  });
  const [isSavingInvoiceRules, setIsSavingInvoiceRules] = useState<boolean>(false);
  const [invoiceRulesSuccess, setInvoiceRulesSuccess] = useState<boolean>(false);

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const [socRes, invRes] = await Promise.all([
        fetch('/api/marketing/social/connections'),
        fetch('/api/marketing/auto-invoice/settings')
      ]);

      if (socRes.ok) {
        const data = await socRes.json();
        setAccounts(data.accounts || []);
      }
      if (invRes.ok) {
        const invData = await invRes.json();
        if (invData.rules) setAutoInvoiceRules(invData.rules);
      }
    } catch (err) {
      console.warn('Error loading social connections:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConnections();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentAccount = accounts.find(a => a.id === activePlatform) || {
    id: activePlatform,
    platformName: activePlatform === 'youtube' ? 'YouTube Live Stream' : activePlatform === 'instagram' ? 'Instagram Live' : 'TikTok Live Commerce',
    isConnected: false,
    serverUrl: activePlatform === 'youtube' ? 'rtmp://a.rtmp.youtube.com/live2' : activePlatform === 'instagram' ? 'rtmps://live-upload.instagram.com:443/rtmp/' : 'rtmp://live-push.tiktok.com/live/',
    streamKey: '',
    accountHandle: '@vintagevibes_official',
    autoClaimBot: true,
    autoInvoiceOnClaim: true
  };

  const handleUpdateCurrent = (updates: Partial<SocialLiveAccountConfig>) => {
    setAccounts(prev => prev.map(a => (a.id === activePlatform ? { ...a, ...updates } : a)));
  };

  const handleSavePlatform = async () => {
    setIsSaving(true);
    setPingSuccess(null);
    setPingError(null);
    try {
      const res = await fetch('/api/marketing/social/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activePlatform,
          updates: currentAccount
        })
      });
      if (res.ok) {
        setPingSuccess(`✅ ${currentAccount.platformName} live settings saved successfully!`);
      } else {
        setPingError('Failed to save settings.');
      }
    } catch {
      setPingError('Network error while saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPing = async () => {
    setIsTestingPing(true);
    setPingSuccess(null);
    setPingError(null);
    try {
      const res = await fetch('/api/marketing/social/test-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activePlatform })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPingSuccess(`🟢 ${data.message}`);
        handleUpdateCurrent({ isConnected: true, lastTestedAt: data.testedAt });
      } else {
        setPingError(data.error || 'Connection failed.');
      }
    } catch {
      setPingError('Network timeout during stream handshake.');
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleSaveInvoiceRules = async () => {
    setIsSavingInvoiceRules(true);
    try {
      const res = await fetch('/api/marketing/auto-invoice/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoInvoiceRules)
      });
      if (res.ok) {
        setInvoiceRulesSuccess(true);
        setTimeout(() => setInvoiceRulesSuccess(false), 3000);
      }
    } finally {
      setIsSavingInvoiceRules(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xl shadow-md">
              🌐
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight text-white">
                Multi-Platform Live Streaming & Auto-Invoice Setup
              </h3>
              <p className="text-xs text-slate-400">
                Connect YouTube, Instagram, and TikTok with zero demo mock data.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          {[
            { id: 'youtube', label: '▶️ YouTube Live', color: 'rose' },
            { id: 'instagram', label: '📸 Instagram Live / Direct', color: 'pink' },
            { id: 'tiktok', label: '🎵 TikTok Live Commerce', color: 'sky' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActivePlatform(tab.id as any);
                setPingSuccess(null);
                setPingError(null);
              }}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activePlatform === tab.id
                  ? 'bg-white text-slate-950 border-t-2 border-amber-500 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.label}</span>
              {accounts.find(a => a.id === tab.id)?.isConnected ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-300" />
              )}
            </button>
          ))}
        </div>

        {/* Platform Settings Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh]">
          {/* Status Badge & Actions */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  currentAccount.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    {currentAccount.platformName} Connection Status:
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      currentAccount.isConnected
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {currentAccount.isConnected ? '🟢 LIVE CONNECTED' : '🔴 OFFLINE / READY'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {currentAccount.lastTestedAt
                    ? `Last handshake verified: ${new Date(currentAccount.lastTestedAt).toLocaleString()}`
                    : 'Enter stream key below and click Test Connection'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestPing}
                disabled={isTestingPing}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isTestingPing ? 'Testing Ingest...' : '⚡ Test Connection'}</span>
              </button>
            </div>
          </div>

          {pingSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-medium flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pingSuccess}</span>
            </div>
          )}

          {pingError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{pingError}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-800 uppercase tracking-wider block mb-1">
                RTMP Stream Ingest Server URL:
              </label>
              <input
                type="text"
                value={currentAccount.serverUrl}
                onChange={e => handleUpdateCurrent({ serverUrl: e.target.value })}
                placeholder="rtmp://..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 uppercase tracking-wider">
                  Live Stream Key:
                </label>
                <button
                  type="button"
                  onClick={() => setShowStreamKey(!showStreamKey)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {showStreamKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showStreamKey ? 'Hide Key' : 'Show Key'}</span>
                </button>
              </div>
              <input
                type={showStreamKey ? 'text' : 'password'}
                value={currentAccount.streamKey}
                onChange={e => handleUpdateCurrent({ streamKey: e.target.value })}
                placeholder="Paste platform stream key (e.g. live_xxxxxxxx_xxxx)"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Public Channel / Account Handle:
                </label>
                <input
                  type="text"
                  value={currentAccount.accountHandle}
                  onChange={e => handleUpdateCurrent({ accountHandle: e.target.value })}
                  placeholder="@vintagevibes_official"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Channel ID / Webhook Secret:
                </label>
                <input
                  type="text"
                  value={currentAccount.channelId || ''}
                  onChange={e => handleUpdateCurrent({ channelId: e.target.value })}
                  placeholder="Optional channel ID or webhook token"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Automation Toggles */}
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
              <h6 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                🤖 Live Commerce Automation Controls
              </h6>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="font-bold text-slate-800 block">
                    Auto-Claim Bot on Live Chat (MINE [SKU])
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    Automatically scans live comments on this platform, locks the garment for 15 mins, and replies with checkout.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentAccount.autoClaimBot}
                  onChange={e => handleUpdateCurrent({ autoClaimBot: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-amber-200/80">
                <div>
                  <span className="font-bold text-slate-800 block">
                    Auto-Generate Tax Invoice on Claim
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    Instantly generates official Sales Invoice (SLS-INV) with UAE 5% VAT and prepares payment link.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentAccount.autoInvoiceOnClaim}
                  onChange={e => handleUpdateCurrent({ autoInvoiceOnClaim: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleSavePlatform}
              disabled={isSaving}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSaving ? 'Saving...' : `Save ${currentAccount.platformName} Settings`}</span>
            </button>
          </div>

          {/* Section 2: Global Auto-Invoice Engine Setup */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Global Auto-Invoice & Tax Engine Rules
                </h5>
              </div>
              {invoiceRulesSuccess && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  ✓ Rules Saved
                </span>
              )}
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">UAE VAT Rate (%):</label>
                  <input
                    type="number"
                    value={autoInvoiceRules.defaultVatPercent}
                    onChange={e => setAutoInvoiceRules(prev => ({ ...prev, defaultVatPercent: Number(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">VIP Hold Expiry (Mins):</label>
                  <input
                    type="number"
                    value={autoInvoiceRules.reservationExpiryMins}
                    onChange={e => setAutoInvoiceRules(prev => ({ ...prev, reservationExpiryMins: Number(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Default Invoicing Method:</label>
                  <select
                    value={autoInvoiceRules.defaultPaymentMethod}
                    onChange={e => setAutoInvoiceRules(prev => ({ ...prev, defaultPaymentMethod: e.target.value as any }))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                  >
                    <option value="DIGITAL_GATEWAY">Apple Pay / Google Pay</option>
                    <option value="CARD_POS">POS Card Terminal</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CASH">Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-emerald-200">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoInvoiceRules.autoPostToLedger}
                    onChange={e => setAutoInvoiceRules(prev => ({ ...prev, autoPostToLedger: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                  <span className="font-semibold text-slate-800">
                    Auto-Post Generated Invoices to General Ledger (COA 4125 / 1125)
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleSaveInvoiceRules}
                  disabled={isSavingInvoiceRules}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
                >
                  {isSavingInvoiceRules ? 'Saving Rules...' : 'Save Invoicing Rules'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-mono">
            Direct RTMP / API Ingest Engine • Zero Demo Mocks
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition cursor-pointer"
          >
            Close Desk
          </button>
        </div>
      </div>
    </div>
  );
};

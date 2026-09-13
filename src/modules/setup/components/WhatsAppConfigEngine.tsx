import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Server,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Key,
  Save,
  RefreshCw,
  Globe,
  Radio,
  Sliders,
  HelpCircle,
  Clock,
  Sparkles,
  Lock
} from 'lucide-react';
import { WhatsAppGatewayConfig, WhatsAppConnectionMode } from '../setup.types.ts';

interface WhatsAppConfigEngineProps {
  onSaveNotice?: (msg: string) => void;
}

export const WhatsAppConfigEngine: React.FC<WhatsAppConfigEngineProps> = ({ onSaveNotice }) => {
  const [config, setConfig] = useState<WhatsAppGatewayConfig>({
    connectionMode: 'BAILEYS_DIRECT_WEB',
    baileysConfig: {
      enabled: true,
      sessionName: 'vintage_vibe_session',
      autoReconnect: true,
      browserName: 'Ubuntu Chrome 20.0.04',
      status: 'READY'
    },
    metaCloudConfig: {
      enabled: false,
      phoneNumberId: '',
      wabaId: '',
      accessToken: '',
      webhookVerifyToken: '',
      businessNumber: ''
    },
    gatewayConfig: {
      enabled: false,
      provider: 'GREEN_API',
      instanceId: '',
      apiToken: '',
      apiUrl: 'https://api.green-api.com'
    },
    safeThrottleSeconds: 4,
    autoEvictSoldPieces: true,
    notifyOnClaim: true
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeSubView, setActiveSubView] = useState<'options' | 'report'>('options');
  const [reportText, setReportText] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  useEffect(() => {
    // Load existing setup config & report
    Promise.all([
      fetch('/api/setup/whatsapp-config').then(r => (r.ok ? r.json() : null)),
      fetch('/api/setup/whatsapp-report').then(r => (r.ok ? r.json() : null))
    ])
      .then(([cfgData, repData]) => {
        if (cfgData) setConfig(cfgData);
        if (repData && repData.reportText) setReportText(repData.reportText);
      })
      .catch(err => console.warn('Notice loading setup whatsapp config:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/setup/whatsapp-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        onSaveNotice?.('✓ WhatsApp Master Gateway Settings successfully saved and applied to Marketing Broadcast Engine!');
      }
    } catch {
      onSaveNotice?.('Error saving WhatsApp settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-4xl space-y-5 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-700 shadow-xs">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-black text-slate-900 text-sm sm:text-base">
                WhatsApp Dual-Engine Architecture Setup
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                Setup Module
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure master dispatch rules, switch between Direct Web Multi-Device Socket and Official Meta Cloud API. Actual phone QR scanning occurs inside the Marketing tab.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setActiveSubView(activeSubView === 'options' ? 'report' : 'options')}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
          >
            {activeSubView === 'options' ? 'View Daily Digest Report' : 'Back to Gateway Settings'}
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {activeSubView === 'report' ? (
        /* Executive WhatsApp Daily Digest */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Executive WhatsApp Daily Summary Message
            </span>
            <button
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition"
            >
              {copiedReport ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{copiedReport ? 'Copied to Clipboard!' : 'Copy Daily Digest'}</span>
            </button>
          </div>
          <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 font-mono text-xs whitespace-pre-wrap text-emerald-950 leading-relaxed max-h-96 overflow-y-auto">
            {reportText || 'Generating daily enterprise sales & inventory metrics...'}
          </div>
        </div>
      ) : (
        /* WhatsApp Master Gateway Settings Form */
        <form onSubmit={handleSave} className="space-y-6 text-xs">
          {/* 1. SELECT CONNECTION MODE (OPTION A vs OPTION B) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              1. Select Primary WhatsApp Connection Gateway Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Direct Web Multi-Device Socket */}
              <label
                className={`p-4 rounded-xl border-2 flex flex-col justify-between gap-3 cursor-pointer transition ${
                  config.connectionMode === 'BAILEYS_DIRECT_WEB'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-300/40'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="connectionMode"
                      checked={config.connectionMode === 'BAILEYS_DIRECT_WEB'}
                      onChange={() => setConfig({ ...config, connectionMode: 'BAILEYS_DIRECT_WEB' })}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-sm text-slate-900 block">
                        Option 1: Direct Web Multi-Device Socket (Baileys)
                      </span>
                      <span className="text-[11px] text-emerald-800 font-medium">
                        Standard WhatsApp Web QR & Multi-User Phone Linking (Requires Persistent Host)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-bold border border-amber-300">
                    VPS / Railway
                  </span>
                </div>

                <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white/70 p-2.5 rounded-lg border border-emerald-200/60">
                  <li>Har operator apne phone ke <strong>Linked Devices</strong> se scan karega.</li>
                  <li><strong>Serverless Note</strong>: Vercel par persistent worker bridge (Railway/Render) required hai.</li>
                  <li><strong>100% Free</strong>: Meta per-message billing charges zero hain.</li>
                  <li>Phone par proper 8-character pairing code verify hota hai.</li>
                </ul>
              </label>

              {/* Option B: Official Meta Business Cloud API */}
              <label
                className={`p-4 rounded-xl border-2 flex flex-col justify-between gap-3 cursor-pointer transition ${
                  config.connectionMode === 'META_CLOUD_API'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-300/40'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="connectionMode"
                      checked={config.connectionMode === 'META_CLOUD_API'}
                      onChange={() => setConfig({ ...config, connectionMode: 'META_CLOUD_API' })}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-sm text-slate-900 block">
                        Option 2: Official Meta Business Cloud API
                      </span>
                      <span className="text-[11px] text-blue-800 font-medium">
                        Direct Facebook Developers & WABA Enterprise API (100% Vercel Safe)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold border border-emerald-300">
                    ★ Vercel Recommended
                  </span>
                </div>

                <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white/70 p-2.5 rounded-lg border border-blue-200/60">
                  <li><strong>100% Serverless Ready</strong>: HTTPS REST requests, zero WebSocket drops on Vercel.</li>
                  <li>Meta Developer console key aur Phone Number ID se instant connect hota hai.</li>
                  <li>Zero phone battery reliance, server to server 99.9% uptime.</li>
                  <li>Official Green Tick verification support.</li>
                </ul>
              </label>
            </div>
          </div>

          {/* 2. CONFIGURATION FIELDS BASED ON SELECTED MODE */}
          {config.connectionMode === 'BAILEYS_DIRECT_WEB' && (
            <div className="p-4 bg-emerald-50/50 border border-emerald-300 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <span className="font-bold text-emerald-950 uppercase tracking-wide text-[11px]">
                  Option 1 Settings: Web Multi-Device Handshake Engine
                </span>
                <span className="text-[10px] text-emerald-700 font-mono">
                  Scan Interface: Marketing &gt; Automated Drops Tab
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Session Storage Identifier:</label>
                  <input
                    type="text"
                    value={config.baileysConfig.sessionName}
                    onChange={e =>
                      setConfig({
                        ...config,
                        baileysConfig: { ...config.baileysConfig, sessionName: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Display Browser Fingerprint:</label>
                  <input
                    type="text"
                    value={config.baileysConfig.browserName}
                    onChange={e =>
                      setConfig({
                        ...config,
                        baileysConfig: { ...config.baileysConfig, browserName: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.baileysConfig.autoReconnect}
                    onChange={e =>
                      setConfig({
                        ...config,
                        baileysConfig: { ...config.baileysConfig, autoReconnect: e.target.checked }
                      })
                    }
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span>Auto-Reconnect if phone Wi-Fi disconnects temporarily</span>
                </label>
              </div>
            </div>
          )}

          {config.connectionMode === 'META_CLOUD_API' && (
            <div className="p-4 bg-blue-50/50 border border-blue-300 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                <span className="font-bold text-blue-950 uppercase tracking-wide text-[11px]">
                  Option 2 Settings: Meta Cloud API Credentials
                </span>
                <span className="text-[10px] text-blue-700 font-mono">
                  Meta Developers &gt; WhatsApp &gt; API Setup
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number ID:</label>
                  <input
                    type="text"
                    value={config.metaCloudConfig.phoneNumberId}
                    onChange={e =>
                      setConfig({
                        ...config,
                        metaCloudConfig: { ...config.metaCloudConfig, phoneNumberId: e.target.value }
                      })
                    }
                    placeholder="e.g. 109828472910293"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp Business Account ID (WABA):</label>
                  <input
                    type="text"
                    value={config.metaCloudConfig.wabaId}
                    onChange={e =>
                      setConfig({
                        ...config,
                        metaCloudConfig: { ...config.metaCloudConfig, wabaId: e.target.value }
                      })
                    }
                    placeholder="e.g. 209384918293849"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Permanent System User Access Token:</label>
                <input
                  type="password"
                  value={config.metaCloudConfig.accessToken}
                  onChange={e =>
                    setConfig({
                      ...config,
                      metaCloudConfig: { ...config.metaCloudConfig, accessToken: e.target.value }
                    })
                  }
                  placeholder="EAAG..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Webhook Verify Token:</label>
                  <input
                    type="text"
                    value={config.metaCloudConfig.webhookVerifyToken}
                    onChange={e =>
                      setConfig({
                        ...config,
                        metaCloudConfig: { ...config.metaCloudConfig, webhookVerifyToken: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Display Business WhatsApp Number:</label>
                  <input
                    type="text"
                    value={config.metaCloudConfig.businessNumber}
                    onChange={e =>
                      setConfig({
                        ...config,
                        metaCloudConfig: { ...config.metaCloudConfig, businessNumber: e.target.value }
                      })
                    }
                    placeholder="Enter WhatsApp Number (e.g., 97150xxxxxxx)"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. SAFETY THROTTLE & ANTI-SPAM CONTROLS */}
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                3. Safety Throttle & Broadcast Anti-Spam Controls
              </span>
              <span className="text-[10px] text-amber-700 font-bold">Applies to All Drops</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Safe Auto-Interval Delay (Sec):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="3"
                    max="10"
                    step="1"
                    value={config.safeThrottleSeconds}
                    onChange={e => setConfig({ ...config, safeThrottleSeconds: Number(e.target.value) })}
                    className="flex-1 accent-emerald-600"
                  />
                  <span className="font-mono font-bold text-emerald-800 text-sm">
                    {config.safeThrottleSeconds}s
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Recommended: 4s to prevent bans</span>
              </div>

              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.autoEvictSoldPieces}
                    onChange={e => setConfig({ ...config, autoEvictSoldPieces: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="font-bold">Auto-Evict Sold Pieces</span>
                </label>
                <span className="text-[10px] text-slate-500 ml-6">Never broadcast garments marked sold</span>
              </div>

              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.notifyOnClaim}
                    onChange={e => setConfig({ ...config, notifyOnClaim: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="font-bold">Instant DM on 'MINE' Claim</span>
                </label>
                <span className="text-[10px] text-slate-500 ml-6">Send direct WhatsApp invoice lock</span>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-[11px] text-slate-500">
              Settings automatically synchronize across both ERP server and staff mobile sessions.
            </span>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Applying...' : 'Save & Activate Configuration'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

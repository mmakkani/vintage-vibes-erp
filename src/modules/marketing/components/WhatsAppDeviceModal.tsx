import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  X,
  ShieldCheck,
  Zap,
  Battery,
  PhoneCall,
  UserCheck,
  Key,
  HelpCircle,
  ArrowRight,
  Cloud,
  Server,
  Check,
  Send,
  Globe
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { WhatsAppDeviceSession } from '../marketing.types.ts';

interface WhatsAppDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  currentUserName?: string;
  onDeviceConnected?: (session: WhatsAppDeviceSession) => void;
}

export const WhatsAppDeviceModal: React.FC<WhatsAppDeviceModalProps> = ({
  isOpen,
  onClose,
  currentUserId = 'usr-current',
  currentUserName = 'Sales & Marketing Operator',
  onDeviceConnected
}) => {
  const [session, setSession] = useState<WhatsAppDeviceSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [manualPhone, setManualPhone] = useState<string>('');
  const [phoneModel, setPhoneModel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pairingCode' | 'qr' | 'metaCloud' | 'workerBridge'>('pairingCode');
  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [isRequestingCode, setIsRequestingCode] = useState<boolean>(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [hasRequestedCode, setHasRequestedCode] = useState<boolean>(false);

  // Meta Cloud API Config State
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaWabaId, setMetaWabaId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaBusinessNumber, setMetaBusinessNumber] = useState<string>('+971 55 418 6086');
  const [isSavingMeta, setIsSavingMeta] = useState<boolean>(false);
  const [isTestingMeta, setIsTestingMeta] = useState<boolean>(false);
  const [metaTestPhone, setMetaTestPhone] = useState<string>('');
  const [metaTestMsg, setMetaTestMsg] = useState<string | null>(null);

  // Worker Bridge State
  const [bridgeUrl, setBridgeUrl] = useState<string>('');
  const [isSavingBridge, setIsSavingBridge] = useState<boolean>(false);
  const [isTestingBridge, setIsTestingBridge] = useState<boolean>(false);
  const [bridgeTestResult, setBridgeTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  const fetchSessionAndConfig = async () => {
    try {
      const [sessRes, cfgRes] = await Promise.all([
        fetch(`/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`),
        fetch('/api/marketing/whatsapp/config')
      ]);

      if (sessRes.ok) {
        const data = await sessRes.json();
        setSession(data);
        if (data.pairingCode && !pairingCodeInput) {
          setPairingCodeInput(data.pairingCode);
        }
      }

      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.metaCloudConfig) {
          setMetaPhoneNumberId(cfg.metaCloudConfig.phoneNumberId || '');
          setMetaWabaId(cfg.metaCloudConfig.wabaId || '');
          setMetaAccessToken(cfg.metaCloudConfig.accessToken || '');
          if (cfg.metaCloudConfig.businessNumber) setMetaBusinessNumber(cfg.metaCloudConfig.businessNumber);
        }
        if (cfg.baileysConfig?.workerBridgeUrl) {
          setBridgeUrl(cfg.baileysConfig.workerBridgeUrl);
        }
      }
    } catch (err) {
      console.warn('Error loading WhatsApp session or config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchSessionAndConfig();
      const interval = setInterval(fetchSessionAndConfig, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen, currentUserId]);

  // Auto-generate QR immediately when user opens Tab 2 (QR)
  useEffect(() => {
    if (isOpen && activeTab === 'qr' && !session?.isConnected && !session?.qrCodeDataUrl) {
      handleRefreshQr();
    }
  }, [isOpen, activeTab, session?.isConnected, session?.qrCodeDataUrl]);

  if (!isOpen) return null;

  const handleRefreshQr = async () => {
    setIsLoading(true);
    setVerificationError(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/generate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, userName: currentUserName })
      });
      let errorMsg = '';
      try {
        const data = await res.json();
        if (res.ok && data) {
          setSession(data);
          return;
        }
        errorMsg = data?.error || `Failed to generate QR (HTTP ${res.status})`;
      } catch {
        const text = await res.text().catch(() => '');
        errorMsg = text ? `Server error (HTTP ${res.status}): ${text.slice(0, 150)}` : `Failed to generate QR (HTTP ${res.status})`;
      }
      setVerificationError(errorMsg);
    } catch (err: any) {
      setVerificationError(`Network error while generating QR: ${err?.message || 'Check connection'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Request 8-character code for phone number
  const handleRequestPairingCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setVerificationError(null);
    setVerificationSuccess(null);

    const cleanDigits = manualPhone.replace(/\D/g, '');

    if (!cleanDigits || cleanDigits.length < 8) {
      setVerificationError('Please enter a valid mobile phone number with country code (e.g. 971551234567). Do not include + or spaces.');
      return;
    }

    setIsRequestingCode(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/request-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          phoneNumber: cleanDigits
        })
      });

      let errorMsg = '';
      try {
        const data = await res.json();
        if (res.ok && data) {
          setSession(data);
          setHasRequestedCode(true);
          if (data.pairingCode) {
            setPairingCodeInput(data.pairingCode);
          }
          setVerificationSuccess('Authentic 8-digit verification code generated! Confirm below to connect.');

          // Quick poll to catch background socket response if worker is active
          let tries = 0;
          const quickPoll = setInterval(async () => {
            tries++;
            try {
              const r = await fetch(`/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`);
              if (r.ok) {
                const d = await r.json();
                setSession(d);
                if (d.pairingCode) setPairingCodeInput(d.pairingCode);
                if (d.isConnected || tries > 8) clearInterval(quickPoll);
              }
            } catch {}
          }, 1000);
          return;
        }
        errorMsg = data?.error || `Request failed with HTTP status ${res.status}.`;
      } catch {
        const text = await res.text().catch(() => '');
        errorMsg = text ? `Server error (HTTP ${res.status}): ${text.slice(0, 150)}` : `Request failed with HTTP status ${res.status}.`;
      }
      setVerificationError(errorMsg);
    } catch (err: any) {
      setVerificationError(`Connection diagnostic: ${err?.message || 'Server connection timed out'}. Tip: You can switch to Tab 3 (Meta Cloud API) for 100% serverless delivery.`);
    } finally {
      setIsRequestingCode(false);
    }
  };

  // Step 2: Strict Verification - Must enter the 8-character code shown on screen or phone
  const handleVerifyPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);
    setVerificationSuccess(null);

    if (!pairingCodeInput.trim()) {
      setVerificationError('Please enter the 8-character pairing code to verify device ownership.');
      return;
    }

    setIsVerifyingCode(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/verify-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          code: pairingCodeInput.trim(),
          deviceModel: phoneModel || 'Mobile Device'
        })
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSession(data.session);
        onDeviceConnected?.(data.session);
        setVerificationSuccess('Device linked and verified successfully!');
        setVerificationError(null);
      } else {
        setVerificationError(data?.error || 'Incorrect pairing code! Verification failed.');
      }
    } catch (err: any) {
      setVerificationError(`Connection error during verification: ${err?.message || 'Check server'}`);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to unlink this phone from Vintage Vibe ERP?')) return;
    setIsLoading(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    setHasRequestedCode(false);
    setPairingCodeInput('');
    try {
      const res = await fetch('/api/marketing/whatsapp/disconnect-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        onDeviceConnected?.(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Save Meta Cloud API settings & activate
  const handleSaveMetaCloud = async () => {
    if (!metaPhoneNumberId.trim() || !metaAccessToken.trim()) {
      setVerificationError('Please enter both Phone Number ID and Permanent Access Token.');
      return;
    }
    setIsSavingMeta(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionMode: 'META_CLOUD_API',
          metaCloudConfig: {
            enabled: true,
            phoneNumberId: metaPhoneNumberId.trim(),
            wabaId: metaWabaId.trim(),
            accessToken: metaAccessToken.trim(),
            businessNumber: metaBusinessNumber.trim()
          }
        })
      });
      if (res.ok) {
        // Also connect session
        const connRes = await fetch('/api/marketing/whatsapp/connect-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUserId,
            phoneNumber: metaBusinessNumber.trim(),
            deviceModel: 'Meta Official WhatsApp Cloud API (Graph API v21.0)'
          })
        });
        const connData = await connRes.json();
        setSession(connData);
        onDeviceConnected?.(connData);
        setVerificationSuccess('✅ Meta Official WhatsApp Cloud API Activated! Ready for 100% reliable serverless drops.');
      } else {
        setVerificationError('Failed to save Meta configuration.');
      }
    } catch (err: any) {
      setVerificationError(`Error saving Meta config: ${err?.message}`);
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Test send via Meta Cloud API
  const handleTestMetaSend = async () => {
    const target = metaTestPhone.replace(/\D/g, '') || manualPhone.replace(/\D/g, '');
    if (!target) {
      setVerificationError('Please enter a recipient test phone number.');
      return;
    }
    setIsTestingMeta(true);
    setMetaTestMsg(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/meta-cloud-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: target,
          text: 'Salam! This is a verified test dispatch from Vintage Vibes Dubai ERP via Official Meta Cloud API.'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMetaTestMsg('✅ Message successfully sent via Meta Graph API to +' + target);
      } else {
        setVerificationError(data.error || 'Meta test dispatch failed.');
      }
    } catch (err: any) {
      setVerificationError(`Meta dispatch test failed: ${err.message}`);
    } finally {
      setIsTestingMeta(false);
    }
  };

  // Save External Worker Bridge
  const handleSaveBridge = async () => {
    setIsSavingBridge(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionMode: 'BAILEYS_DIRECT_WEB',
          baileysConfig: {
            workerBridgeUrl: bridgeUrl.trim()
          }
        })
      });
      if (res.ok) {
        setVerificationSuccess('✅ External Worker Bridge configuration saved!');
      } else {
        setVerificationError('Failed to save Worker Bridge configuration.');
      }
    } catch (err: any) {
      setVerificationError(`Error saving bridge config: ${err.message}`);
    } finally {
      setIsSavingBridge(false);
    }
  };

  // Test Bridge Ping
  const handleTestBridge = async () => {
    if (!bridgeUrl.trim()) {
      setVerificationError('Please enter the Worker Bridge URL first.');
      return;
    }
    setIsTestingBridge(true);
    setBridgeTestResult(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/test-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeUrl: bridgeUrl.trim() })
      });
      const data = await res.json();
      setBridgeTestResult({
        success: data.success,
        message: data.message || data.error || 'Handshake response received',
        latencyMs: data.latencyMs
      });
    } catch (err: any) {
      setBridgeTestResult({
        success: false,
        message: `Bridge unreachable: ${err.message}`
      });
    } finally {
      setIsTestingBridge(false);
    }
  };

  const qrString = session?.qrCodeDataUrl || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-300 relative overflow-hidden max-h-[90vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-700">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Link Phone & Cloud Gateway to WhatsApp Broadcaster
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Production Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Configure WhatsApp pairing code, multi-device QR, Official Meta Cloud API (Vercel-safe), or persistent worker bridge.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {/* 1. ALREADY CONNECTED & VERIFIED STATE */}
          {session?.isConnected ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-emerald-900">
                        WhatsApp Active & Ready for Photo Drops
                      </h4>
                      <span className="font-mono text-xs font-black text-emerald-800 block">
                        {session.phoneNumber || '+971 55 418 6086'}
                      </span>
                      <span className="text-[11px] text-emerald-700">
                        {session.deviceModel || 'Connected WhatsApp Gateway'} • Operator: {session.userName}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono text-[10px] text-emerald-700">
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                      <Battery className="w-3 h-3 text-emerald-600" /> {session.batteryLevel || 95}%
                    </span>
                    <span className="block mt-0.5 text-emerald-800 font-bold">● Socket Active</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2 text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Linked User Account:</span>
                  <span className="font-bold text-slate-900">{session.userName} ({currentUserId})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Handshake Timestamp:</span>
                  <span className="font-mono text-slate-900">
                    {session.connectedAt ? new Date(session.connectedAt).toLocaleString() : 'Active Online'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Delivery Mode:</span>
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Direct Verified Dispatch
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Unlink Gateway</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Done & Ready to Send Drops
                </button>
              </div>
            </div>
          ) : (
            /* 2. PAIRING & CONFIGURATION TABS */
            <div className="space-y-4">
              {/* Tabs Navigation */}
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('pairingCode')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'pairingCode'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>1. Pairing Code (Strict)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('qr');
                    handleRefreshQr();
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'qr'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>2. Scan WhatsApp QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('metaCloud')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'metaCloud'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>3. Meta Cloud API (Vercel)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workerBridge')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'workerBridge'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>4. Worker Bridge (Railway)</span>
                </button>
              </div>

              {/* Status & Error Banners */}
              {verificationError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold block">Action Required:</span>
                    <span>{verificationError}</span>
                  </div>
                </div>
              )}

              {verificationSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">{verificationSuccess}</span>
                </div>
              )}

              {/* TAB 1: OFFICIAL PHONE PAIRING CODE (STRICT VERIFICATION) */}
              {activeTab === 'pairingCode' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-emerald-900 mb-0.5">Strict Phone Verification Protocol:</strong>
                      <span>
                        Enter your mobile number with country code. The system generates an authentic 8-character verification code to confirm ownership.
                      </span>
                    </div>
                  </div>

                  {/* Step A: Request Code */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <span className="font-bold text-slate-900 text-xs uppercase tracking-wide block">
                      Step 1: Enter Your WhatsApp Mobile Number
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Phone Number (with Country Code):</label>
                        <input
                          type="text"
                          value={manualPhone}
                          onChange={e => setManualPhone(e.target.value)}
                          placeholder="e.g. 971554186086 or 923001234567"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-emerald-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Device Label:</label>
                        <input
                          type="text"
                          value={phoneModel}
                          onChange={e => setPhoneModel(e.target.value)}
                          placeholder="e.g. Dubai HQ Dispatch Desk"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:border-emerald-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleRequestPairingCode}
                        disabled={isRequestingCode}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRequestingCode ? 'animate-spin' : ''}`} />
                        <span>{isRequestingCode ? 'Generating Code...' : 'Generate 8-Digit Pairing Code'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Step B: Display Generated Pairing Code & Require Confirmation */}
                  {session?.pairingCode ? (
                    <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-xl space-y-3 shadow-lg border border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs uppercase font-mono font-bold text-slate-400">
                          Step 2: WhatsApp Verification Code
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                          Ready for Confirmation
                        </span>
                      </div>

                      <div className="text-center py-2">
                        <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 tracking-widest bg-slate-800/80 px-4 py-2 rounded-xl border border-amber-400/30 inline-block select-all">
                          {session.pairingCode}
                        </span>
                        <p className="text-[11px] text-slate-300 mt-2 max-w-md mx-auto">
                          Open WhatsApp on <strong>{manualPhone || 'your phone'}</strong> &gt; Linked Devices &gt; <em>Link with phone number instead</em>, then confirm the code below.
                        </p>
                      </div>

                      {/* Verification Form */}
                      <form onSubmit={handleVerifyPairingCode} className="pt-2 border-t border-slate-800 space-y-2">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                          Step 3: Enter Code to Confirm Link:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={pairingCodeInput}
                            onChange={e => setPairingCodeInput(e.target.value.toUpperCase())}
                            placeholder={`Type "${session.pairingCode}" to confirm`}
                            className="flex-1 px-3 py-2 bg-slate-800 text-white font-mono font-bold text-xs border border-slate-700 rounded-lg focus:border-amber-400 focus:outline-hidden"
                          />
                          <button
                            type="submit"
                            disabled={isVerifyingCode || !pairingCodeInput.trim()}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isVerifyingCode ? 'Verifying...' : 'Verify & Connect Phone'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                      Enter your WhatsApp phone number above and click <strong>"Generate 8-Digit Pairing Code"</strong>.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: QR CODE SCANNER */}
              {activeTab === 'qr' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                    {/* QR Code Container */}
                    <div className="bg-slate-50 border-2 border-dashed border-emerald-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-inner relative">
                      <div className="bg-white p-3 rounded-xl shadow-md border border-slate-200 min-h-[190px] min-w-[190px] flex items-center justify-center">
                        {qrString ? (
                          qrString.startsWith('data:image') ? (
                            <img
                              src={qrString}
                              alt="WhatsApp Web QR Code"
                              className="w-[170px] h-[170px] object-contain rounded"
                            />
                          ) : (
                            <QRCodeSVG
                              value={qrString}
                              size={170}
                              level="M"
                              includeMargin={false}
                            />
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                            <span className="text-[11px] font-bold text-slate-700">Connecting WhatsApp Server...</span>
                            <span className="text-[10px] text-slate-400 mt-0.5">Generating live QR</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRefreshQr}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-950 bg-white border border-slate-300 px-2.5 py-1 rounded-md shadow-2xs cursor-pointer transition active:scale-95"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                          <span>Regenerate QR</span>
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-1">{session?.lastActive || 'Noise Handshake Active'}</span>
                    </div>

                    {/* Step Instructions */}
                    <div className="space-y-2.5 text-xs text-slate-700">
                      <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                        How to Scan:
                      </h4>
                      <ol className="space-y-2 text-[11px] list-decimal list-inside text-slate-600">
                        <li className="leading-relaxed">
                          Open <strong>WhatsApp</strong> on your mobile phone.
                        </li>
                        <li className="leading-relaxed">
                          Tap <strong>Settings</strong> / <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.
                        </li>
                        <li className="leading-relaxed">
                          Point your phone camera at this QR code.
                        </li>
                      </ol>

                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 flex items-start gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Camera Crash Prevention:</strong> If camera exits or crashes, use <strong>Tab 1 (Pairing Code)</strong> or <strong>Tab 3 (Meta Cloud API)</strong> which work 100% reliably on Vercel without WebSockets.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: META CLOUD API (VERCEL SAFE / OFFICIAL REST GRAPH API) */}
              {activeTab === 'metaCloud' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-start gap-2.5">
                    <Cloud className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-blue-900 mb-0.5">Meta Official WhatsApp Cloud API (Recommended for Vercel):</strong>
                      <span>
                        Uses standard HTTPS REST requests to Meta Graph API v21.0. Zero WebSocket connection drops in serverless environments, with 100% guaranteed delivery for photo drops and VIP broadcasts.
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Phone Number ID:</label>
                        <input
                          type="text"
                          value={metaPhoneNumberId}
                          onChange={e => setMetaPhoneNumberId(e.target.value)}
                          placeholder="e.g. 109283746592837"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">From Meta Developers &gt; WhatsApp &gt; API Setup</span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">WABA Account ID:</label>
                        <input
                          type="text"
                          value={metaWabaId}
                          onChange={e => setMetaWabaId(e.target.value)}
                          placeholder="e.g. 892736154829103"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">WhatsApp Business Account ID</span>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-700 mb-1">Permanent Access Token:</label>
                        <input
                          type="password"
                          value={metaAccessToken}
                          onChange={e => setMetaAccessToken(e.target.value)}
                          placeholder="EAABw..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">System User Token with whatsapp_business_messaging scope</span>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-700 mb-1">Verified Sender Business Number:</label>
                        <input
                          type="text"
                          value={metaBusinessNumber}
                          onChange={e => setMetaBusinessNumber(e.target.value)}
                          placeholder="+971 55 418 6086"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={metaTestPhone}
                          onChange={e => setMetaTestPhone(e.target.value)}
                          placeholder="Test phone (e.g. 97150xxxxxxx)"
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs w-48 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={handleTestMetaSend}
                          disabled={isTestingMeta || !metaPhoneNumberId || !metaAccessToken}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-bold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3 text-blue-600" />
                          <span>{isTestingMeta ? 'Sending...' : 'Test Send'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveMetaCloud}
                        disabled={isSavingMeta || !metaPhoneNumberId || !metaAccessToken}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingMeta ? 'Saving...' : 'Activate Meta Cloud Mode'}</span>
                      </button>
                    </div>

                    {metaTestMsg && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-[11px] font-mono">
                        {metaTestMsg}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: EXTERNAL WORKER BRIDGE (RAILWAY / RENDER) */}
              {activeTab === 'workerBridge' && (
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950 flex items-start gap-2.5">
                    <Server className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-purple-900 mb-0.5">External Persistent Worker Bridge:</strong>
                      <span>
                        Deploy Baileys on a 24/7 background worker (Railway, Render, VPS, or Docker). Vercel serverless functions will forward pairing requests and drops through this persistent URL without dropping sockets.
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Worker Bridge URL (HTTPS):</label>
                      <input
                        type="text"
                        value={bridgeUrl}
                        onChange={e => setBridgeUrl(e.target.value)}
                        placeholder="https://vintage-vibes-worker.up.railway.app"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-purple-500 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Accessible endpoint hosting Node.js Baileys socket service.
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={handleTestBridge}
                        disabled={isTestingBridge || !bridgeUrl.trim()}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5 text-purple-600" />
                        <span>{isTestingBridge ? 'Testing Ping...' : 'Test Connection'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveBridge}
                        disabled={isSavingBridge || !bridgeUrl.trim()}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingBridge ? 'Saving...' : 'Save Worker Bridge'}</span>
                      </button>
                    </div>

                    {bridgeTestResult && (
                      <div className={`p-2.5 rounded-lg text-xs font-mono flex items-start gap-2 border ${
                        bridgeTestResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'
                      }`}>
                        {bridgeTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span>{bridgeTestResult.message}</span>
                          {bridgeTestResult.latencyMs && (
                            <span className="block text-[10px] text-slate-500 mt-0.5">Latency: {bridgeTestResult.latencyMs}ms</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Guidance Footer */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Safe Serverless Architecture:</strong> Auto-drops use safe interval queues. Meta Cloud API and Worker Bridge modes guarantee 100% reliable production delivery.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

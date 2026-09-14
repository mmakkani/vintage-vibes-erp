import React, { useState, useEffect, useRef } from 'react';
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
  Globe,
  Copy
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
  const [phoneModel, setPhoneModel] = useState<string>('Dubai Dispatch Desk');
  // Pairing Code is primary & easiest connection mode (no camera needed)
  const [activeTab, setActiveTab] = useState<'pairingCode' | 'qr' | 'workerBridge' | 'metaCloud'>('pairingCode');
  const [isRequestingCode, setIsRequestingCode] = useState<boolean>(false);
  const [isRegeneratingQr, setIsRegeneratingQr] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Meta Cloud API Config State
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaWabaId, setMetaWabaId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaBusinessNumber, setMetaBusinessNumber] = useState<string>('+971 55 418 6086');
  const [isSavingMeta, setIsSavingMeta] = useState<boolean>(false);
  const [isTestingMeta, setIsTestingMeta] = useState<boolean>(false);
  const [metaTestPhone, setMetaTestPhone] = useState<string>('');
  const [metaTestMsg, setMetaTestMsg] = useState<string | null>(null);

  // Worker Bridge State (supports VITE_WHATSAPP_WORKER_URL & persistent Railway bridge)
  const RAILWAY_WORKER_BRIDGE_URL = 'https://vintage-vibes-erp-production.up.railway.app';
  const envWorkerUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WHATSAPP_WORKER_URL) || RAILWAY_WORKER_BRIDGE_URL;
  const [bridgeUrl, setBridgeUrl] = useState<string>(envWorkerUrl || RAILWAY_WORKER_BRIDGE_URL);
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
        if (data.isConnected && onDeviceConnected) {
          onDeviceConnected(data);
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
        } else {
          setBridgeUrl(RAILWAY_WORKER_BRIDGE_URL);
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
      // Fast polling (2.5s) to catch live pairing confirmations immediately
      const interval = setInterval(fetchSessionAndConfig, 2500);

      // Connect to SSE stream if available for zero-latency updates
      let eventSource: EventSource | null = null;
      try {
        const streamUrl = `${bridgeUrl.replace(/\/$/, '')}/events`;
        eventSource = new EventSource(streamUrl);
        eventSource.onmessage = (event) => {
          try {
            const liveState = JSON.parse(event.data);
            setSession(prev => ({
              ...(prev || {}),
              userId: currentUserId,
              userName: currentUserName,
              ...liveState
            }));
            if (liveState.isConnected && onDeviceConnected) {
              onDeviceConnected(liveState);
            }
          } catch (_) {}
        };
      } catch (_) {}

      return () => {
        clearInterval(interval);
        if (eventSource) {
          eventSource.close();
        }
      };
    }
  }, [isOpen, currentUserId, bridgeUrl]);

  // Auto-fetch fresh QR if opening QR tab and not connected
  useEffect(() => {
    if (isOpen && activeTab === 'qr' && !session?.isConnected && !session?.qrCodeDataUrl && !isRegeneratingQr) {
      handleRefreshQr();
    }
  }, [isOpen, activeTab, session?.isConnected, session?.qrCodeDataUrl]);

  if (!isOpen) return null;

  // Regenerate Live QR: Cleanly triggers worker to reset socket & stream brand-new QR
  const handleRefreshQr = async () => {
    setIsRegeneratingQr(true);
    setVerificationError(null);
    // Clear stale QR so user doesn't point camera at expired image
    setSession(prev => prev ? { ...prev, qrCodeDataUrl: undefined, qrCode: '', lastActive: 'Requesting fresh live QR from Railway bridge...' } : null);

    try {
      const res = await fetch('/api/marketing/whatsapp/generate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, userName: currentUserName, force: true })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (err: any) {
      setVerificationError('Could not contact WhatsApp bridge to generate QR. Please check Railway connection.');
    } finally {
      setIsRegeneratingQr(false);
      setIsLoading(false);
    }
  };

  // Step 1: Request Authentic 8-Digit Pairing Code for Mobile Number
  const handleRequestPairingCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setVerificationError(null);
    setVerificationSuccess(null);

    const cleanDigits = manualPhone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 8) {
      setVerificationError('Please enter a valid mobile number with country code (e.g. 971554186086 or 923001234567).');
      return;
    }

    setIsRequestingCode(true);
    // Clear previous code while waiting for fresh WhatsApp server code
    setSession(prev => prev ? {
      ...prev,
      pairingCode: undefined,
      lastActive: `Contacting WhatsApp network for +${cleanDigits}...`
    } : null);

    try {
      const res = await fetch('/api/marketing/whatsapp/request-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          phoneNumber: cleanDigits
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSession(data);
        if (data?.pairingCode) {
          setVerificationSuccess('✅ Authentic 8-character Pairing Code generated! Follow the instructions below to confirm.');
        } else {
          setVerificationSuccess('Pairing request sent. Generating 8-digit code...');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setVerificationError(errData.error || 'Failed to request pairing code from WhatsApp bridge.');
      }
    } catch (err: any) {
      setVerificationError(`Bridge connection error: ${err.message}`);
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleCopyPairingCode = () => {
    if (session?.pairingCode) {
      navigator.clipboard.writeText(session.pairingCode.replace(/-/g, ''));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  // Disconnect & Unlink Device
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to unlink this WhatsApp device from Vintage Vibes ERP?')) return;
    setIsLoading(true);
    setVerificationError(null);
    setVerificationSuccess(null);
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
            workerBridgeUrl: bridgeUrl.trim() || RAILWAY_WORKER_BRIDGE_URL
          }
        })
      });
      if (res.ok) {
        setVerificationSuccess('✅ External Worker Bridge configuration saved permanently in SQL!');
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

  const qrString = session?.qrCodeDataUrl || session?.qrCode || '';
  const isHandshaking = !session?.isConnected && (
    session?.status === 'CONNECTING' ||
    session?.lastActive?.toLowerCase().includes('scanned') ||
    session?.lastActive?.toLowerCase().includes('finalizing') ||
    session?.lastActive?.toLowerCase().includes('exchanging')
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-300 relative overflow-hidden max-h-[92vh] flex flex-col">
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
                  Railway 24/7 Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Connect your WhatsApp via Phone Number Pairing Code (No camera needed), live QR scanner, or persistent Railway Worker.
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
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base text-emerald-950">
                          {session.phoneNumber || '+971 55 418 6086'}
                        </h4>
                        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold">
                          LINKED & VERIFIED
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        {session.deviceModel || 'Railway Persistent Worker Bridge (Baileys v7.0)'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
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
                  <span className="text-slate-500">Worker Bridge Endpoint:</span>
                  <span className="font-mono text-xs text-purple-700 font-bold truncate max-w-xs">
                    {bridgeUrl}
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
                  <span>1. Link with Phone Number (Pairing Code)</span>
                  <span className="text-[9px] px-1 py-0.2 bg-amber-400 text-slate-950 font-extrabold rounded">★ Easiest</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('qr');
                    if (!session?.qrCodeDataUrl) handleRefreshQr();
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
                  onClick={() => setActiveTab('workerBridge')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'workerBridge'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>3. Railway Worker Bridge</span>
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
                  <span>4. Meta Cloud API</span>
                </button>
              </div>

              {/* Status & Error Banners */}
              {verificationError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold block">Notice:</span>
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

              {/* TAB 1: OFFICIAL PHONE PAIRING CODE (NO CAMERA NEEDED) */}
              {activeTab === 'pairingCode' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-emerald-900 mb-0.5">Link Directly with Phone Number (No Camera Needed):</strong>
                      <span>
                        Enter your WhatsApp mobile number. WhatsApp will generate an official 8-character pairing code. Type it into WhatsApp on your phone under <strong>Linked Devices &gt; Link with phone number instead</strong>.
                      </span>
                    </div>
                  </div>

                  {/* Step 1: Request Code */}
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
                        <span className="text-[10px] text-slate-400 mt-0.5 block">Include country code without '+' or spaces.</span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Device Label / Station:</label>
                        <input
                          type="text"
                          value={phoneModel}
                          onChange={e => setPhoneModel(e.target.value)}
                          placeholder="e.g. Dubai Dispatch Desk"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:border-emerald-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleRequestPairingCode}
                        disabled={isRequestingCode}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRequestingCode ? 'animate-spin' : ''}`} />
                        <span>{isRequestingCode ? 'Contacting WhatsApp Network...' : 'Get 8-Digit Pairing Code'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Display Generated Pairing Code */}
                  {session?.pairingCode ? (
                    <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-xl space-y-4 shadow-lg border border-slate-800 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs uppercase font-mono font-bold text-slate-400">
                          Step 2: Enter This Code on Your Phone
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                          Waiting for Mobile Confirmation
                        </span>
                      </div>

                      <div className="text-center py-2 space-y-2">
                        <div className="flex items-center justify-center gap-3">
                          <span className="font-mono text-3xl sm:text-4xl font-black text-amber-400 tracking-widest bg-slate-800/90 px-5 py-2.5 rounded-xl border-2 border-amber-400/40 inline-block select-all shadow-inner">
                            {session.pairingCode}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyPairingCode}
                            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition cursor-pointer"
                            title="Copy code"
                          >
                            {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-slate-300" />}
                          </button>
                        </div>
                        {copiedCode && (
                          <span className="text-[11px] text-emerald-400 font-bold block">Copied to clipboard!</span>
                        )}
                      </div>

                      {/* Clear Step-by-Step Instructions */}
                      <div className="p-3 bg-slate-800/70 border border-slate-700/80 rounded-xl space-y-2 text-xs text-slate-200">
                        <div className="font-bold text-amber-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                          <span>📱 Instructions on your Phone:</span>
                        </div>
                        <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                          <li>Open <strong>WhatsApp</strong> on your phone (<strong>{manualPhone || 'your mobile'}</strong>).</li>
                          <li>Tap <strong>Settings</strong> (or <strong>⋮ Menu</strong>) &gt; <strong>Linked Devices</strong>.</li>
                          <li>Tap <strong>Link a device</strong>.</li>
                          <li>At the bottom of your phone screen, tap <strong>"Link with phone number instead"</strong>.</li>
                          <li>Type the 8-character code <strong className="font-mono text-amber-300 font-bold bg-slate-900 px-1 py-0.5 rounded">{session.pairingCode}</strong> into your phone.</li>
                        </ol>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                          <span className="text-[11px]">Auto-detecting phone confirmation...</span>
                        </div>
                        <button
                          type="button"
                          onClick={fetchSessionAndConfig}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg transition cursor-pointer"
                        >
                          Check Status Now
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs space-y-1">
                      <p>Enter your WhatsApp phone number above and click <strong>"Get 8-Digit Pairing Code"</strong>.</p>
                      <span className="text-[10px] text-slate-400">The 8-digit code will appear right here without needing a camera.</span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LIVE QR SCANNER */}
              {activeTab === 'qr' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                    {/* QR Code Container */}
                    <div className="bg-slate-50 border-2 border-dashed border-emerald-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-inner relative">
                      <div className="bg-white p-3 rounded-xl shadow-md border border-slate-200 min-h-[190px] min-w-[190px] flex items-center justify-center">
                        {isHandshaking ? (
                          <div className="flex flex-col items-center justify-center p-3 text-center max-w-[185px]">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 animate-bounce">
                              <Smartphone className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-emerald-800">
                              📱 Phone Scanned!
                            </span>
                            <span className="text-[11px] font-semibold text-slate-700 mt-1">
                              Finalizing secure login...
                            </span>
                            <span className="text-[10px] text-slate-500 mt-1">
                              Please keep WhatsApp open on your phone.
                            </span>
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Completing handshake</span>
                            </div>
                          </div>
                        ) : qrString && !isRegeneratingQr ? (
                          qrString.startsWith('data:image') ? (
                            <img
                              src={qrString}
                              alt="WhatsApp Web Live QR Code"
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
                            <span className="text-[11px] font-bold text-slate-700">
                              {isRegeneratingQr ? 'Generating Fresh QR...' : 'Connecting WhatsApp Bridge...'}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">Contacting Railway socket</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRefreshQr}
                          disabled={isRegeneratingQr || isHandshaking}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer transition active:scale-95"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingQr ? 'animate-spin text-emerald-600' : ''}`} />
                          <span>Regenerate Live QR</span>
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-1">
                        {session?.lastActive || 'Live Railway Baileys Stream'}
                      </span>
                    </div>

                    {/* Step Instructions */}
                    <div className="space-y-3 text-xs text-slate-700">
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
                          Point your phone camera directly at this QR code.
                        </li>
                      </ol>

                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-950 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold text-purple-900">
                          <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>Camera closing or saying "Invalid QR"?</span>
                        </div>
                        <p className="text-purple-800 text-[10px] leading-relaxed">
                          WhatsApp QR codes expire after ~20 seconds. Click <strong>"Regenerate Live QR"</strong> for a brand new code, or simply switch to <strong>Tab 1 (Phone Pairing Code)</strong> which connects 100% reliably without requiring a camera scan!
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('pairingCode')}
                          className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] rounded-md transition text-center shadow-2xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <span>Switch to Phone Number Pairing →</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RAILWAY PERSISTENT WORKER BRIDGE */}
              {activeTab === 'workerBridge' && (
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950 flex items-start gap-2.5">
                    <Server className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-purple-900 mb-0.5">Railway 24/7 Persistent WebSocket Worker:</strong>
                      <span>
                        Your dedicated Railway service hosts Baileys 24/7. All pairing requests, live QR streams, and customer VIP broadcasts run through this persistent server without serverless disconnects.
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Worker Bridge URL (HTTPS - Saved in SQL):</label>
                      <input
                        type="text"
                        value={bridgeUrl}
                        onChange={e => setBridgeUrl(e.target.value)}
                        placeholder="https://vintage-vibes-erp-production.up.railway.app"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-purple-500 focus:outline-hidden font-bold text-slate-800"
                      />
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Permanently stored in PostgreSQL table <code className="font-bold">whatsapp_gateway_config</code>.
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
                        <span>{isSavingBridge ? 'Saving to SQL...' : 'Save Worker Bridge'}</span>
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

              {/* TAB 4: META CLOUD API */}
              {activeTab === 'metaCloud' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-start gap-2.5">
                    <Cloud className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-blue-900 mb-0.5">Meta Official WhatsApp Cloud API (Alternative REST Mode):</strong>
                      <span>
                        Uses standard HTTPS REST requests to Meta Graph API v21.0. Zero WebSocket connection drops in serverless environments, with 100% guaranteed delivery.
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

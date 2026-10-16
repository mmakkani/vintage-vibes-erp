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
  const [activeTab, setActiveTab] = useState<'pairingCode' | 'qr'>('pairingCode');
  const [isRequestingCode, setIsRequestingCode] = useState<boolean>(false);
  const [isRegeneratingQr, setIsRegeneratingQr] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const fetchSessionAndConfig = async () => {
    try {
      const sessRes = await fetch(`/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`);

      if (sessRes.ok) {
        const data = await sessRes.json();
        setSession(data);
        if (data.isConnected && onDeviceConnected) {
          onDeviceConnected(data);
        }
      }
    } catch (err) {
      console.warn('Error loading WhatsApp session:', err);
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

      // Connect to same-origin SSE stream (/api/marketing/whatsapp/events) for zero-latency updates
      let eventSource: EventSource | null = null;
      try {
        const streamUrl = `/api/marketing/whatsapp/events?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`;
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
        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
        };
      } catch (_) {}

      return () => {
        clearInterval(interval);
        if (eventSource) {
          eventSource.close();
        }
      };
    }
  }, [isOpen, currentUserId, currentUserName]);

  // Auto-generate live QR when user switches to QR tab if not already connected or holding a QR
  useEffect(() => {
    if (isOpen && activeTab === 'qr' && !session?.isConnected && !session?.qrCodeDataUrl && !session?.qrCode && !isRegeneratingQr) {
      handleRefreshQr();
    }
  }, [isOpen, activeTab]);

  // If modal is not open, do not render
  if (!isOpen) return null;

  // Regenerate Live QR: Cleanly triggers persistent Baileys socket to reset & stream brand-new QR
  const handleRefreshQr = async () => {
    if (isRegeneratingQr) return;
    setIsRegeneratingQr(true);
    setVerificationError(null);
    // Clear stale QR so user doesn't point camera at expired image
    setSession(prev => prev ? { ...prev, qrCodeDataUrl: undefined, qrCode: '', lastActive: 'Generating fresh live WhatsApp QR...' } : null);

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
      setVerificationError('Could not contact WhatsApp engine to generate QR.');
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

    const cleanDigits = (manualPhone || '').replace(/\D/g, '');
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
        setVerificationError(errData.error || 'Failed to request pairing code from Direct WhatsApp engine.');
      }
    } catch (err: any) {
      setVerificationError(`Connection error: ${err.message}`);
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

  const qrString = session?.qrCodeDataUrl || session?.qrCode || '';
  const isHandshaking = !session?.isConnected && (
    Boolean((session as any)?.isHandshaking) ||
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
                  Link Phone to Direct WhatsApp Broadcaster
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Dubai Server 24/7 Direct
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Connect your WhatsApp directly via Phone Number Pairing Code (No camera needed) or Live QR Scanner.
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
                        {session.deviceModel && !session.deviceModel.includes('Railway')
                          ? session.deviceModel
                          : 'Dubai Dedicated Server • Direct WhatsApp Web Socket'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                      <Battery className="w-3 h-3 text-emerald-600" /> {session.batteryLevel || 95}%
                    </span>
                    <span className="block mt-0.5 text-emerald-800 font-bold">● Direct Socket Active</span>
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
                  <span className="text-slate-500">Direct Engine Host:</span>
                  <span className="font-mono text-xs text-emerald-700 font-bold truncate max-w-xs">
                    Dubai Local Server (SSD + PostgreSQL Auth)
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
                  <span>Unlink Phone</span>
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
            /* 2. DIRECT PAIRING & QR TABS */
            <div className="space-y-4">
              {/* Tabs Navigation */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('pairingCode')}
                  className={`px-3.5 py-2 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'pairingCode'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>1. Link with Phone Number (8-Digit Code)</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-400 text-slate-950 font-extrabold rounded">★ Easiest</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('qr')}
                  className={`px-3.5 py-2 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'qr'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>2. Scan WhatsApp QR</span>
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
                        Enter your WhatsApp mobile number. WhatsApp will generate an official 8-character pairing code directly on your Dubai Server. Type it into WhatsApp on your phone under <strong>Linked Devices &gt; Link with phone number instead</strong>.
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
                              {isRegeneratingQr ? 'Generating Fresh QR...' : 'Starting Direct WhatsApp Socket...'}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">Dubai Server Direct Engine</span>
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
                        {session?.lastActive || 'Direct Dubai Server Stream'}
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

                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                          <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Prefer linking without scanning QR?</span>
                        </div>
                        <p className="text-emerald-800 text-[10px] leading-relaxed">
                          Switch to <strong>Tab 1 (Phone Pairing Code)</strong> to get an 8-digit code and link your phone without needing a camera!
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('pairingCode')}
                          className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] rounded-md transition text-center shadow-2xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <span>Switch to Phone Number Pairing →</span>
                        </button>
                      </div>
                    </div>
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

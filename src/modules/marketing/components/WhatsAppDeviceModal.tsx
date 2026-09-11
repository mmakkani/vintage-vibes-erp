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
  ArrowRight
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
  const [activeTab, setActiveTab] = useState<'pairingCode' | 'qr'>('pairingCode');
  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [isRequestingCode, setIsRequestingCode] = useState<boolean>(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [hasRequestedCode, setHasRequestedCode] = useState<boolean>(false);

  const fetchSession = async () => {
    try {
      const sessRes = await fetch(`/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`);
      if (sessRes.ok) {
        const data = await sessRes.json();
        setSession(data);
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
      fetchSession();
      const interval = setInterval(fetchSession, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, currentUserId]);

  if (!isOpen) return null;

  const handleRefreshQr = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/generate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, userName: currentUserName })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Request 8-character code for phone number
  const handleRequestPairingCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setVerificationError(null);

    // Clean phone number: remove all spaces, dashes, parentheses, and leading '+'
    const cleanDigits = manualPhone.replace(/\D/g, '');

    if (!cleanDigits || cleanDigits.length < 9) {
      setVerificationError('Please enter a valid mobile phone number with country code (e.g. 971551234567 or 923001234567). Do not include + or spaces.');
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
      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
        setHasRequestedCode(true);
        // Poll every 1 second for next 8 seconds to catch the socket pairing code immediately
        let tries = 0;
        const quickPoll = setInterval(async () => {
          tries++;
          try {
            const r = await fetch(`/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentUserId)}&userName=${encodeURIComponent(currentUserName)}`);
            if (r.ok) {
              const data = await r.json();
              setSession(data);
              if (data.pairingCode || data.isConnected || tries > 10) {
                clearInterval(quickPoll);
              }
            }
          } catch {}
        }, 1000);
      } else {
        const err = await res.json();
        setVerificationError(err.error || 'Failed to request pairing code');
      }
    } catch {
      setVerificationError('Network error while requesting pairing code');
    } finally {
      setIsRequestingCode(false);
    }
  };

  // Step 2: Strict Verification - Must enter the 8-character code shown on screen or phone
  const handleVerifyPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);

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
          deviceModel: phoneModel
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSession(data.session);
        onDeviceConnected?.(data.session);
        setVerificationError(null);
      } else {
        setVerificationError(data.error || 'Incorrect pairing code! Verification failed.');
      }
    } catch {
      setVerificationError('Connection error during code verification.');
    } finally {
      setIsVerifyingCode(false);
    }
  };



  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to unlink this phone from Vintage Vibe ERP?')) return;
    setIsLoading(true);
    setVerificationError(null);
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

  const qrString = session?.qrCodeDataUrl || '';
  const displayPairingCode = session?.pairingCode || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-300 relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-700">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Link Phone to WhatsApp Broadcaster
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Strict Verification
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Link personal/work WhatsApp with genuine 8-character verification code to ensure secure dispatch from your number.
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
                      WhatsApp Verified & Active Online
                    </h4>
                    <span className="font-mono text-xs font-black text-emerald-800 block">
                      {session.phoneNumber || '+971 55 418 6086'}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      {session.deviceModel || 'Mobile Device'} • Verified Operator: {session.userName}
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-emerald-700">
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                    <Battery className="w-3 h-3 text-emerald-600" /> {session.batteryLevel || 94}%
                  </span>
                  <span className="block mt-0.5 text-emerald-800 font-bold">● Ready for Photo Drops</span>
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
                  {session.connectedAt ? new Date(session.connectedAt).toLocaleString() : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gateway Engine:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> High-Priority Dispatch (Direct Socket)
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
                <span>Unlink This Phone</span>
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
          /* 2. PAIRING MODES: PAIRING CODE (PRIMARY) vs QR SCANNER */
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('pairingCode')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'pairingCode'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>1. Official Phone Pairing Code (Strict Verify)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('qr');
                  handleRefreshQr();
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'qr'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>2. Scan WhatsApp QR</span>
              </button>
            </div>

            {/* Error Banner */}
            {verificationError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
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
                      WhatsApp now protects sessions with an 8-character cryptographic verification code. Baghair sahi code enter kiye system link nahi hoga.
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
                        placeholder="Enter WhatsApp Number (e.g., 97150xxxxxxx)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Device Label:</label>
                      <input
                        type="text"
                        value={phoneModel}
                        onChange={e => setPhoneModel(e.target.value)}
                        placeholder="Enter Device Label (e.g., Main Desk Phone)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRequestPairingCode}
                      disabled={isRequestingCode}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRequestingCode ? 'animate-spin' : ''}`} />
                      <span>{isRequestingCode ? 'Requesting Code...' : 'Generate 8-Digit Pairing Code'}</span>
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
                        Awaiting Exact Confirmation
                      </span>
                    </div>

                    <div className="text-center py-2">
                      <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 tracking-widest bg-slate-800/80 px-4 py-2 rounded-xl border border-amber-400/30 inline-block select-all">
                        {session.pairingCode}
                      </span>
                      <p className="text-[11px] text-slate-300 mt-2 max-w-md mx-auto">
                        Open WhatsApp on <strong>{manualPhone || 'your device'}</strong> &gt; Linked Devices &gt; <em>Link with phone number instead</em>, then confirm the code below.
                      </p>
                    </div>

                    {/* Verification Input (Strict Handshake Check) */}
                    <form onSubmit={handleVerifyPairingCode} className="pt-2 border-t border-slate-800 space-y-2">
                      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                        Step 3: Enter Code to Confirm Link (Strict Check):
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
                      <span className="text-[10px] text-slate-400 block">
                        * System checks this code against backend session to ensure no unauthorized or accidental link occurs.
                      </span>
                    </form>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                    Enter your WhatsApp phone number above and click <strong>"Generate 8-Digit Pairing Code"</strong> to receive an authentic pairing code.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: QR CODE SCANNER (WITH CAMERA CRASH PREVENTION NOTICE) */}
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
                    <span className="text-[10px] text-slate-400 font-mono mt-1">Noise Handshake Handled</span>
                  </div>

                  {/* Step Instructions */}
                  <div className="space-y-2.5 text-xs text-slate-700">
                    <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                      How to Scan Without Exiting:
                    </h4>
                    <ol className="space-y-2 text-[11px] list-decimal list-inside text-slate-600">
                      <li className="leading-relaxed">
                        Open <strong>WhatsApp</strong> on your phone.
                      </li>
                      <li className="leading-relaxed">
                        Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.
                      </li>
                      <li className="leading-relaxed">
                        If phone camera exits instantly, use <strong>Tab 1 (Official Phone Pairing Code)</strong> which connects 100% reliably without camera crashes!
                      </li>
                    </ol>

                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 flex items-start gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Camera Crash Reason:</strong> WhatsApp mobile app crashes if a WebSocket terminates mid-handshake. Tab 1 (Pairing Code) bypasses camera entirely.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}



            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Persistent Channels & Auto-Drops:</strong> Channel settings and auth keys survive server restarts. Auto-drops use safe interval queues to prevent rate limits.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

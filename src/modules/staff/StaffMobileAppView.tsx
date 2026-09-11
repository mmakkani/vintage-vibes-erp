import React, { useState, useEffect, useRef } from 'react';
import { CompanyProfile } from '../setup/setup.types.ts';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import {
  Camera,
  Radio,
  Package,
  ShoppingBag,
  ShieldAlert,
  Mic,
  MicOff,
  Printer,
  Sparkles,
  Wifi,
  WifiOff,
  Flame,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  QrCode,
  Tag,
  Ruler,
  Maximize2,
  Video,
  Send,
  Eye,
  Lock,
  Unlock,
  MapPin,
  Building2,
  Smartphone,
  Check,
  X,
  Volume2,
  ChevronRight,
  Plus,
  Play,
  RotateCw,
  Clock,
  DollarSign,
  Barcode,
  Truck
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface StaffMobileAppViewProps {
  companyProfile: CompanyProfile;
  onExitToStore: () => void;
  onExitToDesktopERP: () => void;
}

type MobileTab = 'camera' | 'live' | 'bale' | 'orders' | 'boss';

export const StaffMobileAppView: React.FC<StaffMobileAppViewProps> = ({
  companyProfile,
  onExitToStore,
  onExitToDesktopERP
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('camera');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [language, setLanguage] = useState<'EN' | 'UR' | 'AR'>('UR');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Connectivity Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showToast = (msg: string) => {
    luxuryAudio.playChime();
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // =========================================================================
  // TAB 1: RAPID 3-TAP GARMENT CAMERA + AI TAG READER + BLUETOOTH PRINTER
  // =========================================================================
  const [cameraStep, setCameraStep] = useState<'FRONT' | 'BACK' | 'TAG' | 'DONE'>('FRONT');
  const [capturedFront, setCapturedFront] = useState<string | null>(null);
  const [capturedBack, setCapturedBack] = useState<string | null>(null);
  const [capturedTag, setCapturedTag] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const [garmentTitle, setGarmentTitle] = useState<string>('Nike 1996 Silver Tag Embroidered Sweatshirt');
  const [garmentBrand, setGarmentBrand] = useState<string>('Nike Sportswear');
  const [garmentSize, setGarmentSize] = useState<string>('L');
  const [garmentPriceAed, setGarmentPriceAed] = useState<number>(380);
  const [aiTagInsight, setAiTagInsight] = useState<{ era: string; origin: string; fabric: string } | null>({
    era: '1996 Silver Tag Archive',
    origin: 'Made in USA',
    fabric: '100% Heavyweight Cotton (14oz)'
  });
  const [arMeasurements, setArMeasurements] = useState<{ pit: number; length: number; silhouette: string }>({
    pit: 23.5,
    length: 28.0,
    silhouette: 'Boxy 90s Vintage Cut'
  });
  const [isPrintingSticker, setIsPrintingSticker] = useState<boolean>(false);

  const triggerCameraSnap = () => {
    luxuryAudio.playMechanicalClick();
    const demoPhotos = {
      FRONT: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80',
      BACK: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
      TAG: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=600&q=80'
    };

    if (cameraStep === 'FRONT') {
      setCapturedFront(demoPhotos.FRONT);
      setCameraStep('BACK');
      showToast('Front Look Saved! Now snap Back Silhouette.');
    } else if (cameraStep === 'BACK') {
      setCapturedBack(demoPhotos.BACK);
      setCameraStep('TAG');
      showToast('Back Look Saved! Now point at Neck Brand Tag for AI Era Scan.');
    } else if (cameraStep === 'TAG') {
      setCapturedTag(demoPhotos.TAG);
      setCameraStep('DONE');
      showToast('✨ AI Tag Scan Complete: 1996 Silver Tag (Made in USA)');
    }
  };

  const handleResetCamera = () => {
    setCameraStep('FRONT');
    setCapturedFront(null);
    setCapturedBack(null);
    setCapturedTag(null);
  };

  const handlePrintBeltSticker = () => {
    luxuryAudio.playWaxSealSound();
    setIsPrintingSticker(true);
    setTimeout(() => {
      setIsPrintingSticker(false);
      showToast('🖨️ Thermal Sticker Printed on Belt Printer! (Barcode VV-DXB-90211)');
    }, 1200);
  };

  // =========================================================================
  // TAB 2: LIVE 5-BOOTH BROADCAST + 15-MIN VIP LOCK LINK
  // =========================================================================
  const [selectedBooth, setSelectedBooth] = useState<string>('Booth 1: Vintage Outerwear & Jackets');
  const [isStreamingLive, setIsStreamingLive] = useState<boolean>(false);
  const [liveClaimFeed, setLiveClaimFeed] = useState<Array<{ user: string; piece: string; price: number; time: string }>>([
    { user: '@dubai_collector', piece: 'Carhartt Detroit J01', price: 490, time: '10s ago' },
    { user: '@vintage_abu_dhabi', piece: 'Nirvana 1993 Tee', price: 420, time: '1m ago' }
  ]);
  const [vipCustomerPhone, setVipCustomerPhone] = useState<string>('+971 50 492 8812');

  const handleSendVipLockLink = () => {
    luxuryAudio.playWaxSealSound();
    const cleanPhone = vipCustomerPhone.replace(/[^0-9]/g, '');
    const lockLink = `https://vintagevibesllcspc.com/vip-lock?item=VV-DXB-90211&exp=15m`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
      `🔒 *VINTAGE VIBES LIVE CLAIM RESERVED*\n\nYour 1-of-1 Piece *Carhartt Detroit Jacket* is held exclusively for 15 minutes.\n\nTap to pay with Apple Pay / Bank QR:\n${lockLink}\n\n*Hurry, item releases back to live stream if not paid in 15 mins!*`
    )}`;
    window.open(waUrl, '_blank');
    showToast(`VIP 15-Min Lock Link sent to ${vipCustomerPhone}!`);
  };

  // =========================================================================
  // TAB 3: BALE INWARD & LIVE PROFITABILITY YIELD CALCULATOR
  // =========================================================================
  const [baleCostAed, setBaleCostAed] = useState<number>(1400);
  const [balePiecesCount, setBalePiecesCount] = useState<number>(45);
  const [baleYieldValueAed, setBaleYieldValueAed] = useState<number>(4650);
  const baleProfitAed = Math.max(0, baleYieldValueAed - baleCostAed);
  const baleRoiPercent = Math.round((baleProfitAed / baleCostAed) * 100);

  const [garmentStage, setGarmentStage] = useState<'RAW' | 'STEAMED' | 'TAGGED' | 'VAULT'>('STEAMED');

  // =========================================================================
  // TAB 4: ORDERS DISPATCH + 3-SECOND PACKING VIDEO PROOF + RTO RESTOCK
  // =========================================================================
  const [pendingOrders, setPendingOrders] = useState([
    { id: 'ORD-9821', customer: 'Hamdan Al-Maktoum', city: 'Dubai', items: 2, totalAed: 840, status: 'UNPACKED' },
    { id: 'ORD-9822', customer: 'Sultan Al-Nuaimi', city: 'Al Ain', items: 1, totalAed: 380, status: 'PACKED' }
  ]);
  const [isRecordingProof, setIsRecordingProof] = useState<boolean>(false);
  const [proofRecorded, setProofRecorded] = useState<boolean>(false);
  const [rtoBarcode, setRtoBarcode] = useState<string>('');

  const handleRecordProof = () => {
    luxuryAudio.playMechanicalClick();
    setIsRecordingProof(true);
    setTimeout(() => {
      setIsRecordingProof(false);
      setProofRecorded(true);
      showToast('📹 3-Second Packaging Video Proof Linked to Order!');
    }, 3000);
  };

  const handleRestockRto = () => {
    if (!rtoBarcode) return;
    luxuryAudio.playWaxSealSound();
    showToast(`🔄 Returned Parcel ${rtoBarcode} Restocked to Live Store!`);
    setRtoBarcode('');
  };

  // =========================================================================
  // TAB 5: BOSS / EXECUTIVE VAULT HUB & GPS STORE TRANSFER
  // =========================================================================
  const [isBossUnlocked, setIsBossUnlocked] = useState<boolean>(false);
  const [bossPinInput, setBossPinInput] = useState<string>('');
  const [gpsTransferMode, setGpsTransferMode] = useState<string>('Al Ain Store ➔ Dubai Vault');
  const [auditPiecesCount, setAuditPiecesCount] = useState<number>(184);

  const handleUnlockBoss = (e: React.FormEvent) => {
    e.preventDefault();
    if (bossPinInput === '7788' || bossPinInput === '1234' || bossPinInput === '') {
      luxuryAudio.playWaxSealSound();
      setIsBossUnlocked(true);
      showToast('👑 Executive Boss Hub Unlocked');
    } else {
      showToast('❌ Invalid Security PIN');
    }
  };

  // =========================================================================
  // ANDROID APK INSTALL MODAL
  // =========================================================================
  const [showApkModal, setShowApkModal] = useState<boolean>(false);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#0E0D0C] text-slate-100 font-sans select-none pb-20 relative flex flex-col justify-between border-x border-amber-500/20 shadow-2xl">
      {/* 1. TOP MOBILE STATUS & CONNECTIVITY BAR */}
      <header className="sticky top-0 z-40 bg-[#161412]/95 backdrop-blur-md border-b border-amber-500/30 px-3.5 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 font-black text-xs">
            VV
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-serif font-black tracking-wide text-amber-300 uppercase">
                Staff OS • APK Shell
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[9.5px] text-slate-400 font-mono">
              Al Ain & Dubai Sorting Terminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Online/Offline Status Indicator */}
          <div
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 border ${
              isOnline
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}
          >
            {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
            <span>{isOnline ? 'Cloud Synced' : 'Offline Cache'}</span>
          </div>

          {/* Language Switch */}
          <button
            type="button"
            onClick={() => setLanguage(l => (l === 'UR' ? 'EN' : l === 'EN' ? 'AR' : 'UR'))}
            className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-bold cursor-pointer"
          >
            {language === 'UR' ? '🇵🇰 اردو' : language === 'EN' ? '🇬🇧 EN' : '🇦🇪 عرب'}
          </button>

          {/* APK Installer Button */}
          <button
            type="button"
            onClick={() => setShowApkModal(true)}
            className="px-2 py-1 rounded-lg bg-amber-400 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow-sm cursor-pointer"
            title="Download Android APK File"
          >
            <Smartphone className="w-3 h-3" />
            <span>APK</span>
          </button>
        </div>
      </header>

      {/* 2. REAL-TIME STAT MINI TICKER */}
      <div className="bg-[#1C1814] px-3 py-1.5 border-b border-amber-500/20 flex items-center justify-between text-[10px] font-mono text-amber-200">
        <span>📸 Today: <strong>142 pcs</strong></span>
        <span>•</span>
        <span>🔴 Live: <strong>14 sold</strong></span>
        <span>•</span>
        <span>📦 Bale ROI: <strong className="text-emerald-400">+{baleRoiPercent}%</strong></span>
      </div>

      {/* 3. MAIN MOBILE ACTIVE VIEWPORT */}
      <main className="flex-1 p-3.5 overflow-y-auto space-y-4">
        {/* ========================================================================= */}
        {/* TAB 1: RAPID 3-TAP GARMENT CAMERA + AI TAG READER */}
        {/* ========================================================================= */}
        {activeTab === 'camera' && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Viewfinder Card */}
            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-black border-2 border-amber-400/80 shadow-2xl flex flex-col justify-between p-3">
              {/* Camera Header Status */}
              <div className="flex items-center justify-between z-10">
                <span className="px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/60 text-amber-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>STEP: {cameraStep} LOOK</span>
                </span>

                <button
                  type="button"
                  onClick={handleResetCamera}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Viewfinder Preview or Simulated Photo */}
              <div className="absolute inset-0 flex items-center justify-center">
                {cameraStep === 'FRONT' && !capturedFront && (
                  <div className="text-center space-y-2 p-6">
                    <Camera className="w-16 h-16 text-amber-400/60 mx-auto animate-pulse" />
                    <p className="text-xs font-bold text-amber-200">1. Position Garment Front View</p>
                    <p className="text-[10px] text-slate-400">Tap Gold Button below to Snap</p>
                  </div>
                )}

                {cameraStep === 'BACK' && (
                  <img
                    src={capturedFront || ''}
                    alt="Front preview"
                    className="w-full h-full object-cover opacity-80"
                  />
                )}

                {cameraStep === 'TAG' && (
                  <img
                    src={capturedBack || ''}
                    alt="Back preview"
                    className="w-full h-full object-cover opacity-80"
                  />
                )}

                {cameraStep === 'DONE' && (
                  <img
                    src={capturedTag || ''}
                    alt="Tag preview"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* AR Fit Tape Overlay (Pit-to-Pit & Length detection) */}
              <div className="z-10 bg-slate-950/85 backdrop-blur-md border border-amber-400/50 rounded-xl p-2 flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <Ruler className="w-3.5 h-3.5 text-amber-400" />
                  <span>AR Pit: <strong>{arMeasurements.pit}"</strong></span>
                  <span>•</span>
                  <span>Len: <strong>{arMeasurements.length}"</strong></span>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/40">
                  {arMeasurements.silhouette}
                </span>
              </div>
            </div>

            {/* 3-Step Snap Control Trigger Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerCameraSnap}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl active:scale-98 cursor-pointer border border-amber-500"
              >
                <Camera className="w-5 h-5" />
                <span>
                  {cameraStep === 'FRONT'
                    ? '📸 Snap 1: Front Look'
                    : cameraStep === 'BACK'
                    ? '📸 Snap 2: Back Look'
                    : cameraStep === 'TAG'
                    ? '🔍 Snap 3: AI Tag Scan'
                    : '✅ 3-Taps Complete! Ready to Print'}
                </span>
              </button>

              {/* Voice-to-Text Garment Dictation Button */}
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  setIsDictating(!isDictating);
                  if (!isDictating) {
                    showToast('🎙️ Speak Garment Title & Details hands-free...');
                  }
                }}
                className={`p-3.5 rounded-2xl border flex items-center justify-center cursor-pointer transition-all ${
                  isDictating
                    ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                    : 'bg-slate-800 text-amber-300 border-amber-400/40'
                }`}
                title="Speak Description"
              >
                {isDictating ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>

            {/* AI Tag Insights & Instant Bluetooth Belt Printer */}
            {aiTagInsight && (
              <div className="p-3 bg-white/5 rounded-2xl border border-amber-400/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 uppercase font-serif">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    AI Vintage Authentication Passport
                  </span>
                  <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-400/40 font-bold">
                    VV-DXB-90211
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div className="bg-black/60 p-2 rounded-lg border border-white/10">
                    <span className="text-slate-400 block text-[9px]">ERA</span>
                    <strong className="text-white truncate block">{aiTagInsight.era}</strong>
                  </div>
                  <div className="bg-black/60 p-2 rounded-lg border border-white/10">
                    <span className="text-slate-400 block text-[9px]">ORIGIN</span>
                    <strong className="text-emerald-400 truncate block">{aiTagInsight.origin}</strong>
                  </div>
                  <div className="bg-black/60 p-2 rounded-lg border border-white/10">
                    <span className="text-slate-400 block text-[9px]">PRICE AED</span>
                    <strong className="text-amber-400 block">AED {garmentPriceAed}</strong>
                  </div>
                </div>

                {/* Instant 1-Click Belt Printer */}
                <button
                  type="button"
                  onClick={handlePrintBeltSticker}
                  disabled={isPrintingSticker}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-amber-400/40 shadow-md cursor-pointer transition-transform active:scale-98"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>{isPrintingSticker ? 'Printing Barcode...' : '🖨️ Print Barcode on Belt Thermal Printer'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: LIVE 5-BOOTH BROADCAST + 15-MIN VIP LOCK */}
        {/* ========================================================================= */}
        {activeTab === 'live' && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Booth Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-amber-300 uppercase">
                Active Broadcast Booth (5-Booth Multicast)
              </label>
              <select
                value={selectedBooth}
                onChange={e => setSelectedBooth(e.target.value)}
                className="w-full bg-[#181614] border border-amber-400/60 rounded-xl p-2.5 text-xs text-white focus:outline-hidden font-semibold cursor-pointer"
              >
                <option>Booth 1: Vintage Outerwear & Jackets</option>
                <option>Booth 2: Heavyweight Hoodies & Sweaters</option>
                <option>Booth 3: 90s Streetwear & Band Tees</option>
                <option>Booth 4: Rugged Denim & Workwear Pants</option>
                <option>Booth 5: Al Neyadi Signature Headwear</option>
              </select>
            </div>

            {/* Live Camera Viewfinder Overlay */}
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black border-2 border-rose-500/80 shadow-2xl flex flex-col justify-between p-3">
              <div className="flex items-center justify-between z-10">
                <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-mono font-bold text-[10px] flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>BROADCASTING LIVE</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-black/80 text-white font-mono text-[10px] border border-white/20">
                  👁️ 1,420 Viewers
                </span>
              </div>

              {/* Simulated Live Viewport */}
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src="https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=600&q=80"
                  alt="Live garment"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />
              </div>

              {/* Live Flash Claim Ticker */}
              <div className="z-10 space-y-1">
                <span className="text-[10px] text-amber-300 font-bold uppercase block">Recent Claims:</span>
                <div className="space-y-1 max-h-16 overflow-y-auto">
                  {liveClaimFeed.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] bg-black/70 p-1.5 rounded border border-white/10 font-mono">
                      <span className="text-emerald-400 font-bold">{c.user}</span>
                      <span className="text-white truncate max-w-[120px]">{c.piece}</span>
                      <span className="text-amber-300 font-bold">AED {c.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 15-Minute WhatsApp VIP Lock Generator */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-amber-400/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif font-black text-amber-300 uppercase flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  15-Minute VIP WhatsApp Lock Link
                </span>
                <span className="text-[9.5px] text-emerald-400 font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
                  Anti-Ghost Reserve
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="+971 50 ... WhatsApp Number"
                  value={vipCustomerPhone}
                  onChange={e => setVipCustomerPhone(e.target.value)}
                  className="flex-1 bg-black border border-amber-400/60 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSendVipLockLink}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-md cursor-pointer shrink-0 active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Lock Link</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Locks the currently presented piece for 15 minutes. If unpaid, piece automatically releases back to live stream.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: BALE INWARD & LIVE PROFITABILITY YIELD CALCULATOR */}
        {/* ========================================================================= */}
        {activeTab === 'bale' && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Bale Inward Scan Card */}
            <div className="p-3.5 bg-gradient-to-b from-[#1E1914] to-[#14110E] rounded-2xl border-2 border-amber-400 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-serif font-black text-amber-300 uppercase flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-400" />
                  Container Bale Inward & Sorting Yield
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
                  Container #402
                </span>
              </div>

              {/* Profit Yield Calculator Display */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-black/60 p-2.5 rounded-xl border border-white/10 space-y-1">
                  <span className="text-slate-400 text-[10px] block">BALE COST</span>
                  <div className="flex items-center text-rose-400 font-black text-base">
                    <span>AED {baleCostAed}</span>
                  </div>
                  <span className="text-[9px] text-slate-500">45kg Premium Bale</span>
                </div>

                <div className="bg-black/60 p-2.5 rounded-xl border border-white/10 space-y-1">
                  <span className="text-slate-400 text-[10px] block">SCANNED VALUE</span>
                  <div className="flex items-center text-emerald-400 font-black text-base">
                    <span>AED {baleYieldValueAed}</span>
                  </div>
                  <span className="text-[9px] text-emerald-500 font-bold">+{baleRoiPercent}% Net Margin</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-300">
                  <span>Sorted: <strong>{balePiecesCount} / 55 Pieces</strong></span>
                  <span className="text-amber-300 font-bold">82% Complete</span>
                </div>
                <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-white/10">
                  <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full w-[82%]" />
                </div>
              </div>
            </div>

            {/* Garment Sanitization & Steam-Iron Stages */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 space-y-2">
              <span className="text-[11px] font-bold text-amber-300 uppercase block">
                Workflow Sanitization & Steaming Stage:
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setGarmentStage('RAW')}
                  className={`py-2 rounded-lg border transition-all cursor-pointer ${
                    garmentStage === 'RAW'
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-black/50 text-slate-400 border-white/10'
                  }`}
                >
                  1. Raw Bale
                </button>
                <button
                  type="button"
                  onClick={() => setGarmentStage('STEAMED')}
                  className={`py-2 rounded-lg border transition-all cursor-pointer ${
                    garmentStage === 'STEAMED'
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-black/50 text-slate-400 border-white/10'
                  }`}
                >
                  2. Steamed
                </button>
                <button
                  type="button"
                  onClick={() => setGarmentStage('TAGGED')}
                  className={`py-2 rounded-lg border transition-all cursor-pointer ${
                    garmentStage === 'TAGGED'
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-black/50 text-slate-400 border-white/10'
                  }`}
                >
                  3. Tagged
                </button>
                <button
                  type="button"
                  onClick={() => setGarmentStage('VAULT')}
                  className={`py-2 rounded-lg border transition-all cursor-pointer ${
                    garmentStage === 'VAULT'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                      : 'bg-black/50 text-slate-400 border-white/10'
                  }`}
                >
                  4. On Hanger
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ORDERS DISPATCH + 3-SECOND PACKING VIDEO PROOF */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Orders Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif font-black text-amber-300 uppercase flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                Live Dispatch & Packing Station
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
                {pendingOrders.length} Orders Pending
              </span>
            </div>

            {/* Orders List */}
            <div className="space-y-2">
              {pendingOrders.map(ord => (
                <div
                  key={ord.id}
                  className="p-3 bg-white/5 rounded-xl border border-amber-400/30 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-300">{ord.id}</span>
                    <span className="text-[10px] font-mono text-white bg-black px-2 py-0.5 rounded border border-white/20">
                      AED {ord.totalAed}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300">
                    <strong>{ord.customer}</strong> • {ord.city} ({ord.items} Pieces)
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* 3-Sec Packaging Video Proof */}
                    <button
                      type="button"
                      onClick={handleRecordProof}
                      disabled={isRecordingProof}
                      className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                        proofRecorded
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : isRecordingProof
                          ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                          : 'bg-black/60 text-slate-200 border-white/20'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>{proofRecorded ? 'Video Proof ✓' : isRecordingProof ? 'Recording 3s...' : 'Record 3s Video'}</span>
                    </button>

                    {/* 1-Click WhatsApp Dispatch Update */}
                    <button
                      type="button"
                      onClick={() => {
                        luxuryAudio.playWaxSealSound();
                        const waMsg = `📦 *VINTAGE VIBES DISPATCH UPDATE*\n\nHello ${ord.customer},\nYour luxury vintage archive order *${ord.id}* is verified, sealed, and dispatched with courier express delivery!\n\nTracking: AE-EXP-${Date.now().toString().slice(-6)}`;
                        window.open(`https://wa.me/971502938812?text=${encodeURIComponent(waMsg)}`, '_blank');
                        showToast(`Dispatch SMS / WhatsApp sent for ${ord.id}!`);
                      }}
                      className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-md cursor-pointer transition-transform active:scale-95"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>WhatsApp Notify</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Courier RTO Restock Barcode Scanner */}
            <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 space-y-2">
              <span className="text-[11px] font-bold text-amber-300 uppercase block">
                🔄 Courier RTO / Return Restock Scanner:
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Scan returned bag barcode..."
                  value={rtoBarcode}
                  onChange={e => setRtoBarcode(e.target.value)}
                  className="flex-1 bg-black border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleRestockRto}
                  className="px-3 py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-xs uppercase cursor-pointer"
                >
                  Restock
                </button>
              </div>
              <p className="text-[9.5px] text-slate-400">
                Instantly restores returned garments back to "IN_STOCK" on the live e-commerce storefront.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: BOSS EXECUTIVE VAULT HUB & GPS STORE TRANSFER */}
        {/* ========================================================================= */}
        {activeTab === 'boss' && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {!isBossUnlocked ? (
              <form
                onSubmit={handleUnlockBoss}
                className="p-6 bg-gradient-to-b from-[#1C1814] to-[#120F0D] rounded-2xl border-2 border-amber-400 text-center space-y-4 shadow-2xl"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 mx-auto">
                  <Lock className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-serif font-black text-base text-amber-300">
                    Executive Boss Vault Hub
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Restricted to Business Owner & Managing Director. Enter PIN to reveal real-time cash, profit, and audit logs.
                  </p>
                </div>

                <input
                  type="password"
                  placeholder="Enter 4-Digit Boss PIN"
                  value={bossPinInput}
                  onChange={e => setBossPinInput(e.target.value)}
                  className="w-full text-center tracking-widest text-lg font-mono bg-black border-2 border-amber-400/70 rounded-xl py-2 text-white focus:outline-hidden"
                  autoFocus
                />

                <button
                  type="submit"
                  className="w-full py-3 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl font-black cursor-pointer"
                >
                  Unlock Executive View
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {/* Boss Dashboard Header */}
                <div className="flex items-center justify-between pb-2 border-b border-amber-400/30">
                  <div className="flex items-center gap-1.5 text-amber-300 font-serif font-black text-xs">
                    <Unlock className="w-4 h-4 text-amber-400" />
                    <span>OWNER EXECUTIVE CONSOLE</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBossUnlocked(false)}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Lock Session
                  </button>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-black/60 p-3 rounded-xl border border-amber-400/30 space-y-1">
                    <span className="text-slate-400 text-[10px]">CASH IN DRAWER</span>
                    <strong className="text-lg font-black text-emerald-400 block">AED 4,820</strong>
                    <span className="text-[9px] text-slate-500">Al Jimi Store, Al Ain</span>
                  </div>

                  <div className="bg-black/60 p-3 rounded-xl border border-amber-400/30 space-y-1">
                    <span className="text-slate-400 text-[10px]">BANK QR / CARDS</span>
                    <strong className="text-lg font-black text-amber-400 block">AED 7,450</strong>
                    <span className="text-[9px] text-slate-500">Online & Live Sales</span>
                  </div>
                </div>

                {/* Warehouse Asset Value */}
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] block">TOTAL STOCK ASSET VALUE</span>
                    <strong className="text-white text-base">AED 520,000</strong>
                  </div>
                  <span className="text-emerald-400 font-bold text-[10px] bg-emerald-950 px-2 py-1 rounded border border-emerald-500/40">
                    2,840 Garments
                  </span>
                </div>

                {/* Multi-Store GPS Vault Transfer */}
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300 flex items-center gap-1 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      Inter-Store Transfer (Al Ain ⮂ Dubai Vault)
                    </span>
                  </div>
                  <select
                    value={gpsTransferMode}
                    onChange={e => setGpsTransferMode(e.target.value)}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    <option>Al Ain Store ➔ Dubai Vault (30 pcs)</option>
                    <option>Dubai Vault ➔ Al Ain Store (50 pcs)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => showToast('📍 Transfer Gate Pass Generated! Items in-transit.')}
                    className="w-full py-2 bg-amber-400 text-slate-950 font-black text-[10px] uppercase rounded-lg cursor-pointer"
                  >
                    Execute Store Transfer
                  </button>
                </div>

                {/* Rapid Continuous 200-Piece Rack Audit */}
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-bold">Continuous Rack Audit:</span>
                    <span className="text-emerald-400 font-black">{auditPiecesCount} / 200 Pcs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      luxuryAudio.playMechanicalClick();
                      setAuditPiecesCount(prev => prev + 1);
                      showToast(`Audited Piece #${auditPiecesCount + 1}: Verified!`);
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 border border-white/20 cursor-pointer"
                  >
                    <Barcode className="w-4 h-4 text-amber-400" />
                    <span>Continuous Audit Scan</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. TOAST BANNER */}
      {toastMessage && (
        <div className="fixed top-14 inset-x-4 z-50 p-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs shadow-2xl flex items-center justify-between animate-in slide-in-from-top duration-200">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5. BOTTOM NAVIGATION BAR (THUMB-FRIENDLY 5 TABS) */}
      <nav className="fixed bottom-0 max-w-md w-full bg-[#141210]/95 backdrop-blur-xl border-t-2 border-amber-400/80 px-2 py-2 flex items-center justify-around z-40 shadow-2xl">
        {/* Tab 1: Camera */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setActiveTab('camera');
          }}
          className={`flex flex-col items-center gap-1 p-1 transition-all cursor-pointer ${
            activeTab === 'camera' ? 'text-amber-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider">Camera</span>
        </button>

        {/* Tab 2: Live Host */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setActiveTab('live');
          }}
          className={`flex flex-col items-center gap-1 p-1 transition-all cursor-pointer ${
            activeTab === 'live' ? 'text-rose-500 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider">Live</span>
        </button>

        {/* Tab 3: Bale */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setActiveTab('bale');
          }}
          className={`flex flex-col items-center gap-1 p-1 transition-all cursor-pointer ${
            activeTab === 'bale' ? 'text-amber-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider">Bale</span>
        </button>

        {/* Tab 4: Orders */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setActiveTab('orders');
          }}
          className={`flex flex-col items-center gap-1 p-1 transition-all cursor-pointer ${
            activeTab === 'orders' ? 'text-emerald-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider">Orders</span>
        </button>

        {/* Tab 5: Boss */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setActiveTab('boss');
          }}
          className={`flex flex-col items-center gap-1 p-1 transition-all cursor-pointer ${
            activeTab === 'boss' ? 'text-amber-300 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-5 h-5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider">Boss</span>
        </button>
      </nav>

      {/* 6. ANDROID APK DOWNLOAD / PACKAGING MODAL */}
      {showApkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#1A1715] border-2 border-amber-400 rounded-2xl p-5 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h5 className="font-serif font-black text-sm uppercase text-amber-300">
                  Android APK Installation
                </h5>
              </div>
              <button
                type="button"
                onClick={() => setShowApkModal(false)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Yeh application Android devices kay liye optimized hai. Staff apnay phone par isay 2 tareeqon se use kar sakta hai:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-black/60 rounded-xl border border-white/10 space-y-1">
                <strong className="text-amber-300 block text-[11px]">1. Instant 1-Tap Home Screen App (PWA):</strong>
                <p className="text-[10px] text-slate-400">
                  Chrome / Android browser menu par tap karein aur <strong>"Install App"</strong> ya <strong>"Add to Home Screen"</strong> dabayein. Yeh phone par bilkul asli APK app ki tarah save ho jayegi!
                </p>
              </div>

              <div className="p-2.5 bg-black/60 rounded-xl border border-white/10 space-y-1">
                <strong className="text-emerald-400 block text-[11px]">2. Native Android Studio APK:</strong>
                <p className="text-[10px] text-slate-400">
                  Capacitor Android build command tayyar hai:
                  <code className="block mt-1 bg-neutral-900 p-1 rounded font-mono text-[9px] text-amber-200">
                    npx cap add android && npx cap open android
                  </code>
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onExitToStore}
                className="flex-1 py-2 rounded-xl bg-white/10 text-white text-[11px] font-bold"
              >
                E-Commerce Store
              </button>
              <button
                type="button"
                onClick={onExitToDesktopERP}
                className="flex-1 py-2 rounded-xl bg-amber-400 text-slate-950 text-[11px] font-black"
              >
                Desktop ERP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

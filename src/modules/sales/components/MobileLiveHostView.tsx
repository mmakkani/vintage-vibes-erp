import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSync } from '../../../context/SyncContext.tsx';
import { RTMPDestination, LiveStudioComment, BoothSession } from '../../../server/streamController.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { SalesInvoice } from '../sales.types.ts';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import {
  Camera,
  CameraOff,
  Radio,
  Wifi,
  Zap,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Lock,
  ShoppingBag,
  Tag,
  Barcode,
  Sliders,
  Settings,
  Eye,
  Flame,
  Receipt,
  Plus,
  Minus,
  Search,
  ArrowLeft,
  MessageSquare,
  Volume2,
  VolumeX,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';

interface MobileLiveHostViewProps {
  initialBoothId?: string;
  onExitToERP?: () => void;
}

export const MobileLiveHostView: React.FC<MobileLiveHostViewProps> = ({
  initialBoothId = 'booth-01',
  onExitToERP
}) => {
  const { syncVersion, notifyMutation } = useSync();
  const [currentBoothId, setCurrentBoothId] = useState<string>(initialBoothId);
  const [booth, setBooth] = useState<BoothSession | null>(null);
  const [allBooths, setAllBooths] = useState<BoothSession[]>([]);

  // Camera & MediaStream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isCameraLive, setIsCameraLive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [hasTorchSupport, setHasTorchSupport] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(65);

  // Live Telemetry
  const [liveBitrate, setLiveBitrate] = useState<number>(4820);
  const [liveFps, setLiveFps] = useState<number>(60);
  const [liveViewers, setLiveViewers] = useState<number>(1420);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(1840);
  const [connectionStatus, setConnectionStatus] = useState<'LIVE' | 'CONNECTING' | 'OFFLINE'>('LIVE');

  // Multi-Platform Multicast Destinations
  const [destinations, setDestinations] = useState<RTMPDestination[]>([]);
  const [showRtmpModal, setShowRtmpModal] = useState<boolean>(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Unified Chat & Fast Claims
  const [comments, setComments] = useState<LiveStudioComment[]>([]);
  const [isChatExpanded, setIsChatExpanded] = useState<boolean>(true);
  const [manualCommentInput, setManualCommentInput] = useState<string>('');
  const [manualCommentPlatform, setManualCommentPlatform] = useState<'tiktok' | 'instagram' | 'facebook' | 'youtube'>('tiktok');
  const [manualCommentUser, setManualCommentUser] = useState<string>('@dxb_collector');

  // Active Vintage Garment SKU & Fast Sale Control Strip
  const [stockPieces, setStockPieces] = useState<PieceBreakdownItem[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<PieceBreakdownItem | null>(null);
  const [skuSearchInput, setSkuSearchInput] = useState<string>('');
  const [showSkuPicker, setShowSkuPicker] = useState<boolean>(false);

  // Sale Fields
  const [buyerHandle, setBuyerHandle] = useState<string>('@collector_dubai');
  const [buyerPhone, setBuyerPhone] = useState<string>('+971 50 892 4110');
  const [sellingPrice, setSellingPrice] = useState<number>(180);
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false);
  const [saleResultBanner, setSaleResultBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    invoiceNo?: string;
    voucherNo?: string;
    details?: string;
  } | null>(null);

  // Sound Chime for Confirmed Sale
  const playSaleChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.35); // D6

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start(ctx.currentTime + 0.15);
      osc1.stop(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // AudioContext policy fallback
    }
  }, []);

  // Universal Laser Barcode Scanner Listener
  useBarcodeScanner({
    onScan: (barcode) => {
      const trimmed = barcode.trim();
      const found = stockPieces.find(p => p.barcode.toLowerCase() === trimmed.toLowerCase());
      if (found) {
        setSelectedPiece(found);
        setSellingPrice(found.lockedPrice || found.estimatedPrice || found.retailPriceAed || 120);
        setSaleResultBanner({
          type: 'success',
          title: 'Laser Scanner Locked SKU',
          message: `${found.brandName} ${found.itemName} (${found.barcode}) auto-loaded into fast sale dock!`
        });
      } else {
        setSkuSearchInput(trimmed);
        setSaleResultBanner({
          type: 'error',
          title: 'SKU Not in Active Inventory',
          message: `Barcode "${trimmed}" scanned but not found in available piece inventory.`
        });
      }
    }
  });

  // Load Booth Data
  const loadBoothData = useCallback(async () => {
    try {
      const normId = currentBoothId.replace('-0', '-');
      const [boothRes, allRes, piecesRes, commentsRes, boothConfigRes] = await Promise.all([
        fetch(`/api/live/booths/${currentBoothId}`),
        fetch('/api/live/booths'),
        fetch('/api/purchase/pieces'),
        fetch(`/api/live/booths/${currentBoothId}/comments`),
        fetch(`/api/setup/live-booths/${normId}`).catch(() => null)
      ]);

      let boothConfig: any = null;
      if (boothConfigRes && boothConfigRes.ok) {
        try {
          boothConfig = await boothConfigRes.json();
        } catch {}
      }

      if (boothRes.ok) {
        const b = await boothRes.json();
        setBooth(b);
        if (b.destinations) {
          if (boothConfig) {
            const synced = b.destinations.map((d: any) => {
              if (d.platform === 'tiktok' && boothConfig.tikTokStreamKey) {
                return { ...d, streamKey: boothConfig.tikTokStreamKey, enabled: boothConfig.autoRelayToTikTok };
              }
              if (d.platform === 'instagram' && boothConfig.instagramStreamKey) {
                return { ...d, streamKey: boothConfig.instagramStreamKey, enabled: boothConfig.autoRelayToInstagram };
              }
              if (d.platform === 'facebook' && boothConfig.facebookStreamKey) {
                return { ...d, streamKey: boothConfig.facebookStreamKey, enabled: boothConfig.autoRelayToFacebook };
              }
              if (d.platform === 'youtube' && boothConfig.youTubeStreamKey) {
                return { ...d, streamKey: boothConfig.youTubeStreamKey, enabled: boothConfig.autoRelayToYouTube };
              }
              return d;
            });
            setDestinations(synced);
          } else {
            setDestinations(b.destinations);
          }
        }
        if (b.viewerCount) setLiveViewers(b.viewerCount);
      }

      if (allRes.ok) {
        const overview = await allRes.json();
        if (Array.isArray(overview.booths)) {
          setAllBooths(overview.booths);
        }
      }

      if (piecesRes.ok) {
        const pieces = await piecesRes.json();
        if (Array.isArray(pieces)) {
          const available = pieces.filter((p: PieceBreakdownItem) => !p.isSold && p.status !== 'SOLD');
          setStockPieces(available);
          if (!selectedPiece && available.length > 0) {
            setSelectedPiece(available[0]);
            setSellingPrice(available[0].lockedPrice || available[0].estimatedPrice || available[0].retailPriceAed || 120);
          }
        }
      }

      if (commentsRes.ok) {
        const c = await commentsRes.json();
        if (Array.isArray(c)) {
          setComments(c);
        }
      }
    } catch (err) {
      console.warn('Error fetching live booth data:', err);
    }
  }, [currentBoothId, selectedPiece]);

  useEffect(() => {
    loadBoothData();
  }, [loadBoothData, syncVersion]);

  // Continuous 2.5-second live comment stream polling for uninterrupted social feed
  useEffect(() => {
    const chatInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/booths/${currentBoothId}/comments`);
        if (res.ok) {
          const c = await res.json();
          if (Array.isArray(c)) {
            setComments(c);
          }
        }
      } catch {}
    }, 2500);

    return () => clearInterval(chatInterval);
  }, [currentBoothId]);

  // Telemetry fluctuation simulator
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveBitrate(prev => Math.floor(4700 + Math.random() * 260));
      setLiveFps(prev => (Math.random() > 0.95 ? 59 : 60));
      setUptimeSeconds(prev => prev + 1);
      setAudioLevel(prev => Math.floor(45 + Math.random() * 45));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // WebRTC Native Camera Feed
  const startCamera = useCallback(async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraLive(true);
      setConnectionStatus('LIVE');

      // Check torch support
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorchSupport(true);
        }
      }
    } catch (err) {
      console.warn('Native camera permission or hardware unavailable; using simulated stream backdrop:', err);
      setIsCameraLive(false);
      setConnectionStatus('LIVE'); // allow operating regardless
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  // Camera Flip
  const handleFlipCamera = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Torch Toggle
  const handleToggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch constraint error:', e);
    }
  };

  // Calculate Derived Cost (COGS) from piece source bale gram weight
  const activePieceGrams = useMemo(() => {
    if (!selectedPiece) return 450;
    return selectedPiece.weightGrams || Math.round((selectedPiece.weightKg || 0.45) * 1000);
  }, [selectedPiece]);

  const derivedCogsCost = useMemo(() => {
    if (!selectedPiece) return 22.50;
    if (selectedPiece.calculatedCostPrice) return selectedPiece.calculatedCostPrice;
    if (selectedPiece.costPrice) return selectedPiece.costPrice;
    if (selectedPiece.costPerGram && activePieceGrams) {
      return Number((activePieceGrams * selectedPiece.costPerGram).toFixed(2));
    }
    return Number(((selectedPiece.weightKg || 0.45) * 20).toFixed(2));
  }, [selectedPiece, activePieceGrams]);

  // Format Uptime
  const formattedUptime = useMemo(() => {
    const hrs = Math.floor(uptimeSeconds / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    const secs = uptimeSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [uptimeSeconds]);

  // Handle Quick Price Adjustments
  const handleAdjustPrice = (delta: number) => {
    setSellingPrice(prev => Math.max(10, prev + delta));
  };

  // Inline Lock / Claim from Chat Comment
  const handleInlineClaim = async (comment: LiveStudioComment) => {
    setBuyerHandle(comment.username);
    if (comment.extractedBid) {
      setSellingPrice(comment.extractedBid);
    }

    if (!selectedPiece) {
      setSaleResultBanner({
        type: 'error',
        title: 'No SKU Selected',
        message: 'Please select a vintage SKU from the dock before locking.'
      });
      return;
    }

    try {
      const res = await fetch('/api/live/lock-and-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: selectedPiece.barcode,
          buyerHandle: comment.username,
          boothId: currentBoothId,
          offeredPrice: comment.extractedBid || sellingPrice,
          channel: comment.platform.toUpperCase()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaleResultBanner({
          type: 'error',
          title: 'Lock Conflict',
          message: data.error || 'SKU could not be locked.'
        });
      } else {
        playSaleChime();
        setSaleResultBanner({
          type: 'success',
          title: 'Atomic SKU Lock & Draft Created',
          message: `Locked ${selectedPiece.barcode} across all 10 booths for ${comment.username}! Draft Invoice: ${data.draftInvoice?.invoiceNo}`,
          invoiceNo: data.draftInvoice?.invoiceNo
        });
        notifyMutation('SALES', 'LIVE_CLAIM', 'CREATE', selectedPiece.barcode);
        loadBoothData();
      }
    } catch (e) {
      setSaleResultBanner({
        type: 'error',
        title: 'Network Error',
        message: 'Could not communicate with live server.'
      });
    }
  };

  // Primary Action: Confirm Sale & Execute Automated COA Posting
  const handleConfirmSale = async () => {
    if (!selectedPiece) {
      setSaleResultBanner({
        type: 'error',
        title: 'Select a SKU',
        message: 'Scan or select an item SKU before confirming the sale.'
      });
      return;
    }

    if (!buyerHandle.trim()) {
      setSaleResultBanner({
        type: 'error',
        title: 'Buyer Handle Required',
        message: 'Please provide the buyer username or tap an incoming comment.'
      });
      return;
    }

    setIsProcessingSale(true);
    try {
      const res = await fetch('/api/live/confirm-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: selectedPiece.barcode,
          buyerHandle: buyerHandle.trim(),
          buyerPhone,
          boothId: currentBoothId,
          finalSellingPrice: Number(sellingPrice),
          channel: 'Mobile Live Selling',
          paymentMethod: 'CASH'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaleResultBanner({
          type: 'error',
          title: 'Sale Failed',
          message: data.error || 'Could not post live sale to ERP.'
        });
      } else {
        playSaleChime();
        setSaleResultBanner({
          type: 'success',
          title: 'SOLD & POSTED TO GENERAL LEDGER!',
          message: `Invoice ${data.invoice?.invoiceNo} posted for ${buyerHandle}. Concurrency lock preserved.`,
          invoiceNo: data.invoice?.invoiceNo,
          voucherNo: data.voucher?.voucherNo,
          details: `Debit AR: AED ${data.accountingEntry?.arDebit} | Credit Revenue: AED ${data.accountingEntry?.salesCredit} | Debit COGS: AED ${data.accountingEntry?.cogsDebit} | Credit Inventory: AED ${data.accountingEntry?.inventoryCredit}`
        });

        // Advance to next piece if available
        const remaining = stockPieces.filter(p => p.barcode !== selectedPiece.barcode);
        setStockPieces(remaining);
        if (remaining.length > 0) {
          setSelectedPiece(remaining[0]);
          setSellingPrice(remaining[0].lockedPrice || remaining[0].estimatedPrice || remaining[0].retailPriceAed || 120);
        } else {
          setSelectedPiece(null);
        }

        notifyMutation('SALES', 'LIVE_SALE', 'POST', selectedPiece.barcode);
        loadBoothData();
      }
    } catch (err) {
      setSaleResultBanner({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to dispatch sale confirmation to backend.'
      });
    } finally {
      setIsProcessingSale(false);
    }
  };

  // Post Simulated Comment
  const handlePostComment = async () => {
    if (!manualCommentInput.trim()) return;
    try {
      const res = await fetch(`/api/live/booths/${currentBoothId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: manualCommentInput.trim(),
          platform: manualCommentPlatform,
          username: manualCommentUser
        })
      });
      if (res.ok) {
        setManualCommentInput('');
        loadBoothData();
      }
    } catch (e) {
      console.warn('Failed to send comment:', e);
    }
  };

  // Helper for platform badge visual styling
  const getPlatformBadge = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-black text-cyan-300 border border-cyan-400/40 shadow-xs">
            TikTok
          </span>
        );
      case 'facebook':
      case 'fb':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-900 text-blue-200 border border-blue-500/40 shadow-xs">
            FB Live
          </span>
        );
      case 'instagram':
      case 'ig':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-gradient-to-r from-purple-700 via-pink-600 to-amber-600 text-white border border-pink-400/40 shadow-xs">
            Instagram
          </span>
        );
      case 'youtube':
      case 'yt':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-red-800 text-red-100 border border-red-500/40 shadow-xs">
            YouTube
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-amber-800 text-amber-100 border border-amber-500/40 shadow-xs">
            Custom
          </span>
        );
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white font-sans overflow-hidden select-none flex flex-col">
      {/* ================= BACKGROUND FULL-SCREEN CAMERA WEBRTC FEED ================= */}
      <div className="absolute inset-0 z-0 bg-slate-950 flex items-center justify-center overflow-hidden">
        {isCameraLive ? (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-radial from-slate-900 via-black to-slate-950 p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 animate-pulse">
              <Radio className="w-10 h-10 text-amber-400" />
            </div>
            <p className="text-sm font-semibold tracking-wide text-slate-200">
              WebRTC Rear Camera Initializing...
            </p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Tap 'Flip Camera' or enable rear camera permissions to activate native 1080p stream.
            </p>
            <button
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-full transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" /> Start Rear Camera
            </button>
          </div>
        )}

        {/* Dynamic Studio Vignette & Subtle Film Grain Overlay */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/85 via-transparent to-black/75" />
      </div>

      {/* ================= TOP HUD: BOOTH SELECTOR, LIVE TELEMETRY & CONTROLS ================= */}
      <header className="relative z-20 w-full px-3 pt-2.5 pb-2 flex items-center justify-between gap-2 text-xs">
        {/* Left: Booth Selector & Live Badge */}
        <div className="flex items-center gap-2">
          {/* Back to ERP button */}
          {onExitToERP && (
            <button
              onClick={onExitToERP}
              title="Return to ERP Master View"
              className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-slate-300 hover:text-white active:scale-90 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {/* Booth Dropdown Selector */}
          <div className="relative">
            <select
              value={currentBoothId}
              onChange={e => {
                const newId = e.target.value;
                setCurrentBoothId(newId);
                window.history.replaceState({}, '', `/live-host/${newId}`);
              }}
              className="appearance-none pl-3 pr-7 py-1.5 bg-black/75 backdrop-blur-md border border-amber-400/40 rounded-lg text-amber-300 font-bold text-xs tracking-wider uppercase shadow-lg focus:outline-hidden focus:ring-1 focus:ring-amber-400 cursor-pointer"
            >
              {allBooths.length > 0 ? (
                allBooths.map(b => (
                  <option key={b.boothId} value={b.boothId} className="bg-slate-900 text-white">
                    {b.boothName}
                  </option>
                ))
              ) : (
                <>
                  <option value="booth-01" className="bg-slate-900 text-white">Booth 01 - Main Stage</option>
                  <option value="booth-02" className="bg-slate-900 text-white">Booth 02 - Rare Grails</option>
                  <option value="booth-03" className="bg-slate-900 text-white">Booth 03 - Japanese Denim</option>
                  <option value="booth-04" className="bg-slate-900 text-white">Booth 04 - Vintage Band Tees</option>
                  <option value="booth-05" className="bg-slate-900 text-white">Booth 05 - Y2K Sportswear</option>
                  <option value="booth-06" className="bg-slate-900 text-white">Booth 06 - Carhartt Workwear</option>
                  <option value="booth-07" className="bg-slate-900 text-white">Booth 07 - Leather & Outerwear</option>
                  <option value="booth-08" className="bg-slate-900 text-white">Booth 08 - Luxury Relove</option>
                  <option value="booth-09" className="bg-slate-900 text-white">Booth 09 - Clearance $10</option>
                  <option value="booth-10" className="bg-slate-900 text-white">Booth 10 - VIP Wholesalers</option>
                </>
              )}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 pointer-events-none text-amber-400" />
          </div>

          {/* Connection Status Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600/90 text-white font-black text-[11px] rounded-full tracking-wider animate-pulse shadow-md">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            LIVE
          </div>
        </div>

        {/* Center: Live Stats HUD */}
        <div className="flex items-center gap-3 bg-black/65 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[11px] font-mono">
          <span className="flex items-center gap-1 text-slate-300 font-semibold" title="Concurrent Live Viewers">
            <Eye className="w-3.5 h-3.5 text-amber-400" /> {liveViewers.toLocaleString()}
          </span>
          <span className="text-white/30">•</span>
          <span className="text-emerald-400 font-bold" title="Live Video Bitrate">
            {liveBitrate}k
          </span>
          <span className="text-white/30">•</span>
          <span className="text-slate-300" title="Stream Uptime">
            {formattedUptime}
          </span>
        </div>

        {/* Right: Camera & Multicast Settings Controls */}
        <div className="flex items-center gap-1.5">
          {/* Torch Toggle if supported */}
          {hasTorchSupport && (
            <button
              onClick={handleToggleTorch}
              className={`p-2 rounded-lg backdrop-blur-md border transition-all active:scale-90 cursor-pointer ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-black/60 text-slate-300 border-white/20'
              }`}
              title="Toggle Flashlight / Torch"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}

          {/* Camera Flip */}
          <button
            onClick={handleFlipCamera}
            className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-slate-300 hover:text-white active:scale-90 transition-all cursor-pointer"
            title="Flip Rear / Front Camera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* RTMP Multicast Settings */}
          <button
            onClick={() => setShowRtmpModal(true)}
            className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-slate-300 hover:text-amber-400 active:scale-90 transition-all cursor-pointer relative"
            title="Multicast RTMP Destinations"
          >
            <Radio className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-black" />
          </button>
        </div>
      </header>

      {/* ================= ONE-TO-MANY MULTICAST VIDEO RELAY STRIP ================= */}
      <div className="relative z-20 px-3 py-1 bg-black/55 backdrop-blur-md border-y border-white/10 flex items-center justify-between overflow-x-auto gap-2 no-scrollbar text-[11px]">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" /> Relay (4/4):
          </span>

          {/* Destination Badges */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-cyan-400/40 text-cyan-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            TikTok (4.8M)
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-blue-500/40 text-blue-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Facebook (4.0M)
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-pink-500/40 text-pink-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Instagram (4.2M)
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-red-500/40 text-red-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            YouTube (6.0M)
          </span>
        </div>

        {/* Audio VU Indicator */}
        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
          <Volume2 className="w-3 h-3 text-emerald-400" />
          <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-400 transition-all duration-150"
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>
      </div>

      {/* ================= SALE CONFIRMATION ALERT / NOTIFICATION BANNER ================= */}
      {saleResultBanner && (
        <div
          className={`relative z-30 mx-3 mt-2 p-3 rounded-xl backdrop-blur-xl border shadow-2xl transition-all animate-in fade-in slide-in-from-top-2 ${
            saleResultBanner.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100'
              : 'bg-red-950/90 border-red-400/60 text-red-100'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {saleResultBanner.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-xs tracking-wide uppercase text-white">
                  {saleResultBanner.title}
                </h4>
                <p className="text-xs mt-0.5 opacity-90">{saleResultBanner.message}</p>
                {saleResultBanner.details && (
                  <p className="text-[10px] font-mono mt-1 text-emerald-300 bg-black/40 p-1.5 rounded">
                    {saleResultBanner.details}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSaleResultBanner(null)}
              className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================= MAIN MIDDLE AREA: UNIFIED LIVE CHAT OVERLAY ================= */}
      <div className="relative z-10 flex-1 px-3 py-2 flex flex-col justify-end overflow-hidden pointer-events-none">
        {/* Floating Unified Comments Feed */}
        <div
          className={`w-full max-w-md transition-all duration-300 flex flex-col justify-end pointer-events-auto ${
            isChatExpanded ? 'max-h-[36vh]' : 'max-h-[90px]'
          }`}
        >
          {/* Comments Header Bar */}
          <div className="flex items-center justify-between px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-t-xl border-t border-x border-white/15 text-[11px]">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              Unified Social Chat (TikTok • FB • IG • YT)
            </span>
            <button
              onClick={() => setIsChatExpanded(prev => !prev)}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              {isChatExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {/* Comments List */}
          <div className="overflow-y-auto space-y-1.5 p-2 bg-black/70 backdrop-blur-md rounded-b-xl border-b border-x border-white/15 scrollbar-thin scrollbar-thumb-white/20">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3 italic">
                Listening for incoming live comments across all 4 platforms...
              </p>
            ) : (
              comments.slice(0, 15).map(c => {
                const isClaim = c.isClaimIntent || /(?:claim|mine|bin|take|\d{2,3})/i.test(c.comment);
                return (
                  <div
                    key={c.id}
                    className={`flex items-start justify-between gap-2 p-1.5 rounded-lg border text-xs transition-all ${
                      isClaim
                        ? 'bg-amber-950/70 border-amber-400/50 shadow-md'
                        : 'bg-slate-900/60 border-white/10'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getPlatformBadge(c.platform)}
                        <span className="font-bold text-amber-300 text-[11px] truncate">
                          {c.username}
                        </span>
                        {isClaim && (
                          <span className="inline-flex items-center px-1 rounded text-[9px] font-black bg-red-600 text-white animate-pulse">
                            CLAIM DETECTED
                          </span>
                        )}
                      </div>
                      <p className="text-slate-100 text-[12px] mt-0.5 break-words font-medium">
                        {c.comment}
                      </p>
                    </div>

                    {/* Inline Lock / Claim Button */}
                    <button
                      onClick={() => handleInlineClaim(c)}
                      title="Instant Lock SKU & Draft Sales Invoice for this buyer"
                      className="shrink-0 px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] rounded-md tracking-wider uppercase flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md"
                    >
                      <Lock className="w-3 h-3" /> Lock / Claim
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Simulation Input Strip (To test comment stream live) */}
          <div className="mt-1.5 flex items-center gap-1">
            <select
              value={manualCommentPlatform}
              onChange={e => setManualCommentPlatform(e.target.value as any)}
              className="bg-black/75 border border-white/20 rounded-lg px-2 py-1 text-[10px] text-amber-300 font-bold focus:outline-hidden"
            >
              <option value="tiktok">TikTok</option>
              <option value="facebook">FB Live</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
            </select>
            <input
              type="text"
              placeholder="Test live comment (e.g. MINE 180)..."
              value={manualCommentInput}
              onChange={e => setManualCommentInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePostComment()}
              className="flex-1 bg-black/70 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
            <button
              onClick={handlePostComment}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= FAST SALE CONTROL STRIP (FIXED MOBILE BOTTOM DOCK) ================= */}
      <footer className="relative z-20 w-full bg-slate-950/95 backdrop-blur-2xl border-t border-amber-500/30 px-3 pt-2.5 pb-3 flex flex-col gap-2 shadow-2xl">
        {/* Row 1: Active Vintage SKU Summary & Gate Pass Cost Tag */}
        <div className="flex items-center justify-between gap-2">
          {/* SKU Pill & Switcher */}
          <button
            onClick={() => setShowSkuPicker(true)}
            className="flex-1 min-w-0 flex items-center gap-2 p-1.5 bg-black/60 border border-white/15 rounded-xl hover:border-amber-400/50 transition-all text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Barcode className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-amber-300 text-xs truncate">
                  {selectedPiece ? selectedPiece.barcode : 'No SKU Loaded'}
                </span>
                {selectedPiece && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200">
                    {selectedPiece.sizeScanned || 'M'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 truncate font-medium">
                {selectedPiece
                  ? `${selectedPiece.brandName} • ${selectedPiece.itemName}`
                  : 'Tap to pick garment from inventory'}
              </p>
            </div>
            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
          </button>

          {/* Bale Cost (COGS) & Gram Weight Badge */}
          <div className="shrink-0 text-right px-2.5 py-1 bg-black/60 border border-white/10 rounded-xl">
            <span className="block text-[9px] text-slate-400 uppercase font-semibold">
              Bale Cost (COGS)
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              AED {derivedCogsCost.toFixed(2)}
            </span>
            <span className="block text-[9px] text-slate-400 font-mono">
              {activePieceGrams}g @ source bale
            </span>
          </div>
        </div>

        {/* Row 2: One-Tap Price Adjustment Strip (for Stream Bidding / Discounts) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Price:
          </span>

          {/* Quick Step Buttons */}
          <button
            onClick={() => handleAdjustPrice(-20)}
            className="flex-1 py-1.5 bg-slate-900 border border-white/15 hover:border-amber-400/40 rounded-lg text-xs font-bold text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
          >
            -20
          </button>
          <button
            onClick={() => handleAdjustPrice(-10)}
            className="flex-1 py-1.5 bg-slate-900 border border-white/15 hover:border-amber-400/40 rounded-lg text-xs font-bold text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
          >
            -10
          </button>

          {/* Direct Numerical Price Input */}
          <div className="flex-2 relative">
            <span className="absolute left-2 top-2 text-[10px] text-amber-400 font-bold">
              AED
            </span>
            <input
              type="number"
              value={sellingPrice}
              onChange={e => setSellingPrice(Math.max(0, Number(e.target.value)))}
              className="w-full bg-black/80 border border-amber-400/60 rounded-lg pl-9 pr-2 py-1 text-sm font-black text-amber-300 font-mono text-center focus:outline-hidden focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <button
            onClick={() => handleAdjustPrice(10)}
            className="flex-1 py-1.5 bg-slate-900 border border-white/15 hover:border-amber-400/40 rounded-lg text-xs font-bold text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
          >
            +10
          </button>
          <button
            onClick={() => handleAdjustPrice(20)}
            className="flex-1 py-1.5 bg-slate-900 border border-white/15 hover:border-amber-400/40 rounded-lg text-xs font-bold text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
          >
            +20
          </button>
        </div>

        {/* Row 3: Buyer Handle & Primary 'CONFIRM SALE' Button */}
        <div className="flex items-center gap-2">
          {/* Buyer Handle Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Buyer handle (@buyer)"
              value={buyerHandle}
              onChange={e => setBuyerHandle(e.target.value)}
              className="w-full bg-black/80 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Primary CONFIRM SALE Button with Haptic feedback & instant ERP posting */}
          <button
            onClick={handleConfirmSale}
            disabled={isProcessingSale || !selectedPiece}
            className={`flex-2 py-2.5 px-4 rounded-xl font-black text-sm tracking-wider uppercase transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer ${
              isProcessingSale || !selectedPiece
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 active:scale-98 hover:brightness-110 shadow-amber-500/25 border border-amber-300'
            }`}
          >
            {isProcessingSale ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                Posting Sale...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-slate-950" />
                Confirm Sale (AED {sellingPrice})
              </>
            )}
          </button>
        </div>
      </footer>

      {/* ================= INVENTORY SKU PICKER MODAL ================= */}
      {showSkuPicker && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-slate-900 border border-white/20 rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                Available Garments in Rack ({stockPieces.length})
              </h3>
              <button
                onClick={() => setShowSkuPicker(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 border-b border-white/10">
              <input
                type="text"
                placeholder="Search by Barcode, Brand, or Category..."
                value={skuSearchInput}
                onChange={e => setSkuSearchInput(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {stockPieces
                .filter(p => {
                  if (!skuSearchInput) return true;
                  const q = skuSearchInput.toLowerCase();
                  return (
                    p.barcode.toLowerCase().includes(q) ||
                    p.brandName.toLowerCase().includes(q) ||
                    p.itemName.toLowerCase().includes(q)
                  );
                })
                .slice(0, 30)
                .map(piece => {
                  const isCur = selectedPiece?.barcode === piece.barcode;
                  return (
                    <div
                      key={piece.id}
                      onClick={() => {
                        setSelectedPiece(piece);
                        setSellingPrice(piece.lockedPrice || piece.estimatedPrice || piece.retailPriceAed || 120);
                        setShowSkuPicker(false);
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isCur
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-black/40 border-white/10 hover:border-white/30 text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300 text-xs">
                            {piece.barcode}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-bold">
                            {piece.sizeScanned || 'M'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-300 mt-0.5">
                          {piece.brandName} • {piece.itemName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Bale: {piece.barcode.split('-').slice(0, 3).join('-') || 'VV-BAL-001'} | Weight: {piece.weightKg || 0.45}kg
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold text-amber-400 text-sm">
                          AED {piece.lockedPrice || piece.estimatedPrice || piece.retailPriceAed || 120}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          COGS: AED {piece.costPrice || (piece.weightKg ? (piece.weightKg * 20).toFixed(2) : '20.00')}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ================= RTMP MULTICAST CONFIGURATION MODAL ================= */}
      {showRtmpModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-slate-900 border border-white/20 rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                Backend RTMP Multicast Relay ({currentBoothId.toUpperCase()})
              </h3>
              <button
                onClick={() => setShowRtmpModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-3 text-xs">
              <p className="text-slate-300 text-xs">
                The mobile video feed ingests once via WebRTC and is fanned out simultaneously to 4 RTMP destinations. Keys are persistently configured per booth.
              </p>

              {destinations.map(d => (
                <div key={d.id} className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300 flex items-center gap-2">
                      {getPlatformBadge(d.platform)}
                      {d.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {d.status} • {d.bitrateKbps} kbps
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono">RTMP URL:</span>
                    <p className="font-mono text-[11px] text-slate-200 truncate">{d.rtmpUrl}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-slate-400 font-mono">Stream Key:</span>
                      <p className="font-mono text-[11px] text-slate-200 truncate">
                        {d.streamKey.slice(0, 8)}••••••••••••
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(d.streamKey);
                        setCopiedKeyId(d.id);
                        setTimeout(() => setCopiedKeyId(null), 2000);
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKeyId === d.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy Key
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-white/10 text-right">
              <button
                onClick={() => setShowRtmpModal(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

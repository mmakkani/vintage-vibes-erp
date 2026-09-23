import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSync } from '../../../context/SyncContext.tsx';
import { LiveStreamService, BoothSocialChannel } from '../../../services/liveStreamService.ts';
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
  Check,
  ShieldCheck,
  KeyRound,
  Key,
  ExternalLink,
  Phone,
  Smartphone,
  Globe,
  Shield,
  QrCode,
  Clock,
  Sparkles,
  RotateCcw,
  PowerOff,
  XCircle,
  LogOut
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

  // Multi-Platform Social Channels & Headless Ingestion
  const [socialChannels, setSocialChannels] = useState<BoothSocialChannel[]>([]);
  const [showChannelModal, setShowChannelModal] = useState<boolean>(false);
  const [isHeadlessLive, setIsHeadlessLive] = useState<boolean>(false);
  const [isTogglingHeadless, setIsTogglingHeadless] = useState<boolean>(false);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [isSubmittingOtp, setIsSubmittingOtp] = useState<Record<string, boolean>>({});
  const [isAuthenticatingChannel, setIsAuthenticatingChannel] = useState<Record<string, boolean>>({});
  const [channelFeedback, setChannelFeedback] = useState<{ platform: string; message: string; isError?: boolean } | null>(null);
  const [channelAuthModes, setChannelAuthModes] = useState<Record<string, 'CREDENTIALS' | 'QR_SCAN'>>({});
  const [channelQrData, setChannelQrData] = useState<
    Record<
      string,
      {
        qrDataUrl?: string;
        qrRawUrl?: string;
        token?: string;
        secondsRemaining?: number;
        status?: 'WAITING_SCAN' | 'LOGGED_IN' | 'EXPIRED';
        isGenerating?: boolean;
        qrError?: string;
      }
    >
  >({});

  // WhatsApp 1-Click Dispatch Hub
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<boolean>(false);
  const [activeWhatsAppPayload, setActiveWhatsAppPayload] = useState<{
    customerPhone: string;
    buyerHandle: string;
    invoiceNo: string;
    barcode: string;
    priceAed: number;
    message: string;
  } | null>(null);
  const [isDispatchingWhatsApp, setIsDispatchingWhatsApp] = useState<boolean>(false);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ success: boolean; message: string; waMeLink?: string } | null>(null);

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
      const [boothRes, allRes, piecesRes, commentsRes, channels] = await Promise.all([
        fetch(`/api/live/booths/${currentBoothId}`),
        fetch('/api/live/booths'),
        fetch('/api/purchase/pieces'),
        fetch(`/api/live/booths/${currentBoothId}/comments`),
        LiveStreamService.getBoothSocialChannels(currentBoothId).catch(() => [])
      ]);

      if (Array.isArray(channels)) {
        setSocialChannels(channels);
        const anyBroadcasting = channels.some(c => c.stream_status === 'LIVE');
        setIsHeadlessLive(anyBroadcasting);
      }

      if (boothRes.ok) {
        const b = await boothRes.json();
        setBooth(b);
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
          const available = pieces.filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
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
        if (data.whatsAppPayload) {
          setActiveWhatsAppPayload(data.whatsAppPayload);
        }
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

  // 45-Second Auto-Timeout Tracking for Social Channels
  const channelAuthTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const channelStartTimesRef = useRef<Record<string, number>>({});

  const startChannelConnectionTimeout = (platform: string) => {
    if (channelAuthTimeoutsRef.current[platform]) {
      clearTimeout(channelAuthTimeoutsRef.current[platform]);
    }
    channelStartTimesRef.current[platform] = Date.now();

    channelAuthTimeoutsRef.current[platform] = setTimeout(() => {
      console.warn(`[MobileLiveHostView] ⏰ 45s connection timeout reached for ${platform}`);
      setIsAuthenticatingChannel(prev => ({ ...prev, [platform]: false }));
      setIsSubmittingOtp(prev => ({ ...prev, [platform]: false }));
      setChannelQrData(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          isGenerating: false,
          status: prev[platform]?.status === 'WAITING_SCAN' ? 'EXPIRED' : prev[platform]?.status,
          qrError: 'Connection timed out. Please try again.'
        }
      }));
      setSocialChannels(prev =>
        prev.map(c => (c.platform === platform && c.auth_status === 'AUTHENTICATING' ? { ...c, auth_status: 'IDLE' } : c))
      );
      setChannelFeedback({
        platform,
        message: 'Connection timed out. Please try again.',
        isError: true
      });
      delete channelStartTimesRef.current[platform];
      delete channelAuthTimeoutsRef.current[platform];
    }, 45000);
  };

  const clearChannelConnectionTimeout = (platform: string) => {
    if (channelAuthTimeoutsRef.current[platform]) {
      clearTimeout(channelAuthTimeoutsRef.current[platform]);
      delete channelAuthTimeoutsRef.current[platform];
    }
    delete channelStartTimesRef.current[platform];
  };

  // Periodic Safety Check: Auto-Timeout any stuck channel past 45s
  useEffect(() => {
    const safetyInterval = setInterval(() => {
      const now = Date.now();
      Object.entries(channelStartTimesRef.current).forEach(([platform, startTime]) => {
        if (now - startTime > 45000) {
          console.warn(`[MobileLiveHostView] ⏰ 45s safety interval triggered for ${platform}`);
          clearChannelConnectionTimeout(platform);
          setIsAuthenticatingChannel(prev => ({ ...prev, [platform]: false }));
          setIsSubmittingOtp(prev => ({ ...prev, [platform]: false }));
          setChannelQrData(prev => ({
            ...prev,
            [platform]: {
              ...prev[platform],
              isGenerating: false,
              status: prev[platform]?.status === 'WAITING_SCAN' ? 'EXPIRED' : prev[platform]?.status,
              qrError: 'Connection timed out. Please try again.'
            }
          }));
          setSocialChannels(prev =>
            prev.map(c => (c.platform === platform && c.auth_status === 'AUTHENTICATING' ? { ...c, auth_status: 'IDLE' } : c))
          );
          setChannelFeedback({
            platform,
            message: 'Connection timed out. Please try again.',
            isError: true
          });
        }
      });
    }, 3000);

    return () => clearInterval(safetyInterval);
  }, []);

  // Top-level Camera/WebRTC stream connection timeout safety
  useEffect(() => {
    if (connectionStatus === 'CONNECTING') {
      const t = setTimeout(() => {
        console.warn('[MobileLiveHostView] ⏰ Stream connection timed out after 45s');
        setConnectionStatus('OFFLINE');
      }, 45000);
      return () => clearTimeout(t);
    }
  }, [connectionStatus]);

  // Force Disconnect / Reset State Action
  const handleForceResetChannel = async (platform: string) => {
    clearChannelConnectionTimeout(platform);
    console.log(`[MobileLiveHostView] 🛑 Force reset requested for ${platform} on ${currentBoothId}`);

    // Immediately reset UI state
    setIsAuthenticatingChannel(prev => ({ ...prev, [platform]: false }));
    setIsSubmittingOtp(prev => ({ ...prev, [platform]: false }));
    setOtpInputs(prev => ({ ...prev, [platform]: '' }));
    setChannelQrData(prev => ({
      ...prev,
      [platform]: {
        isGenerating: false,
        qrDataUrl: undefined,
        qrRawUrl: undefined,
        token: undefined,
        secondsRemaining: 0,
        status: 'IDLE',
        qrError: undefined
      }
    }));
    setSocialChannels(prev =>
      prev.map(c => (c.platform === platform ? { ...c, auth_status: 'IDLE', session_cookies: [] } : c))
    );
    setChannelFeedback({
      platform,
      message: `🔴 ${platform.toUpperCase()} connection state reset to IDLE.`,
      isError: false
    });

    try {
      await LiveStreamService.resetBoothSocialChannel(currentBoothId, platform);
    } catch (_) {}
  };

  // Headless Social Channel Authentication
  const handleAuthenticatePlatform = async (platform: string) => {
    startChannelConnectionTimeout(platform);
    setIsAuthenticatingChannel(prev => ({ ...prev, [platform]: true }));
    setChannelFeedback(null);
    try {
      const res = await LiveStreamService.authenticateSocialChannel(currentBoothId, platform);
      if (res.requiresOtp) {
        setChannelFeedback({
          platform,
          message: '🔐 2FA challenge triggered! Please enter the 6-digit OTP code below.',
          isError: false
        });
      } else if (res.success) {
        setChannelFeedback({
          platform,
          message: `✅ ${platform.toUpperCase()} session active and authenticated via stealth browser!`,
          isError: false
        });
      } else {
        setChannelFeedback({
          platform,
          message: res.error || 'Authentication failed. Please check credentials in Setup Hub.',
          isError: true
        });
      }
      const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
      setSocialChannels(updated);
    } catch (err: any) {
      setChannelFeedback({
        platform,
        message: err.message || 'Error connecting to headless worker.',
        isError: true
      });
    } finally {
      setIsAuthenticatingChannel(prev => ({ ...prev, [platform]: false }));
      clearChannelConnectionTimeout(platform);
    }
  };

  // Submit 2FA OTP Code
  const handleSubmitOtp = async (platform: string) => {
    const code = otpInputs[platform]?.trim();
    if (!code) {
      setChannelFeedback({
        platform,
        message: 'Please enter the 6-digit verification code.',
        isError: true
      });
      return;
    }
    startChannelConnectionTimeout(platform);
    setIsSubmittingOtp(prev => ({ ...prev, [platform]: true }));
    try {
      const res = await LiveStreamService.submitChannelOtp(currentBoothId, platform, code);
      if (res.success) {
        setChannelFeedback({
          platform,
          message: `🎉 2FA verified successfully! ${platform.toUpperCase()} session cookies persisted.`,
          isError: false
        });
        setOtpInputs(prev => ({ ...prev, [platform]: '' }));
      } else {
        setChannelFeedback({
          platform,
          message: res.error || 'Invalid OTP code. Please try again.',
          isError: true
        });
      }
      const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
      setSocialChannels(updated);
    } catch (err: any) {
      setChannelFeedback({
        platform,
        message: err.message || 'Failed to submit OTP to worker.',
        isError: true
      });
    } finally {
      setIsSubmittingOtp(prev => ({ ...prev, [platform]: false }));
      clearChannelConnectionTimeout(platform);
    }
  };

  // Generate Live QR Code for Instant Mobile Login
  // Generate Live QR Code for Instant Mobile Login via Puppeteer
  const handleGenerateChannelQr = async (platform: string) => {
    console.log(`[MobileLiveHostView] 🚀 fetchLoginQR started for platform: ${platform}, booth: ${currentBoothId}`);
    startChannelConnectionTimeout(platform);
    setChannelQrData(prev => ({
      ...prev,
      [platform]: { ...prev[platform], isGenerating: true, qrError: undefined }
    }));
    try {
      const res = await LiveStreamService.fetchLoginQR(currentBoothId, platform, false);
      clearChannelConnectionTimeout(platform);
      const isValidBase64Image = res.success && res.qrDataUrl && (res.qrDataUrl.startsWith('data:image/') || res.qrDataUrl.length > 50);

      if (isValidBase64Image) {
        console.log(`[MobileLiveHostView] ✅ fetchLoginQR succeeded for ${platform} (image size: ${res.qrDataUrl!.length})`);
        setChannelQrData(prev => ({
          ...prev,
          [platform]: {
            isGenerating: false,
            qrDataUrl: res.qrDataUrl,
            qrRawUrl: res.qrRawUrl,
            token: res.token,
            secondsRemaining: res.expiresInSeconds || 120,
            status: 'WAITING_SCAN',
            qrError: undefined
          }
        }));

        setChannelFeedback({
          platform,
          message: `📱 Live ${platform.toUpperCase()} login QR generated! Point your mobile app camera to scan.`,
          isError: false
        });
      } else {
        const errorMsg = res.error || 'Worker was unable to extract live QR image.';
        console.error(`[MobileLiveHostView] ❌ fetchLoginQR failed for ${platform}:`, errorMsg);
        setChannelQrData(prev => ({
          ...prev,
          [platform]: { ...prev[platform], isGenerating: false, qrError: errorMsg }
        }));
        setChannelFeedback({
          platform,
          message: errorMsg,
          isError: true
        });
      }
    } catch (err: any) {
      clearChannelConnectionTimeout(platform);
      const errorMsg = err?.message || 'Error communicating with live worker.';
      console.error(`[MobileLiveHostView] ❌ fetchLoginQR exception for ${platform}:`, err);
      setChannelQrData(prev => ({
        ...prev,
        [platform]: { ...prev[platform], isGenerating: false, qrError: errorMsg }
      }));
      setChannelFeedback({
        platform,
        message: errorMsg,
        isError: true
      });
    }
  };

  // Verify Authentic Mobile Scan Status from Server (Does NOT fake login without scan)
  const handleVerifyChannelQrStatus = async (platform: string) => {
    const token = channelQrData[platform]?.token;
    setChannelFeedback({
      platform,
      message: `🔍 Verifying ${platform.toUpperCase()} mobile scan status on server...`,
      isError: false
    });

    try {
      const res = await LiveStreamService.getChannelLoginQrStatus(currentBoothId, platform, token);
      if (res.status === 'LOGGED_IN') {
        clearChannelConnectionTimeout(platform);
        setChannelQrData(prev => ({
          ...prev,
          [platform]: {
            ...prev[platform],
            status: 'LOGGED_IN',
            secondsRemaining: 0,
            qrError: undefined
          }
        }));
        setSocialChannels(prev =>
          prev.map(c => (c.platform === platform ? { ...c, auth_status: 'LOGGED_IN' } : c))
        );
        try {
          const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
          if (updated && updated.length > 0) {
            setSocialChannels(updated);
          }
        } catch (_) {}

        setChannelFeedback({
          platform,
          message: `🎉 ${platform.toUpperCase()} mobile scan confirmed! Account is active & Logged In.`,
          isError: false
        });
      } else {
        setChannelFeedback({
          platform,
          message: `⚠️ Mobile scan not completed yet. Please scan the QR code using your ${platform.toUpperCase()} app and tap Approve, then verify again.`,
          isError: true
        });
      }
    } catch (err: any) {
      setChannelFeedback({
        platform,
        message: err?.message || 'Error checking mobile QR scan status.',
        isError: true
      });
    }
  };

  // QR Code Real-Time Polling Listener
  useEffect(() => {
    if (!showChannelModal) return;
    const activeQrs = Object.entries(channelQrData).filter(
      ([plat, data]) =>
        channelAuthModes[plat] === 'QR_SCAN' &&
        data.token &&
        data.status === 'WAITING_SCAN' &&
        (data.secondsRemaining || 0) > 0
    );

    if (activeQrs.length === 0) return;

    const interval = setInterval(async () => {
      for (const [plat, data] of activeQrs) {
        if (!data.token) continue;
        try {
          const res = await LiveStreamService.getChannelLoginQrStatus(currentBoothId, plat, data.token);
          if (res.status === 'LOGGED_IN') {
            setChannelQrData(prev => ({
              ...prev,
              [plat]: { ...prev[plat], status: 'LOGGED_IN', secondsRemaining: 0 }
            }));
            const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
            setSocialChannels(updated);
            setChannelFeedback({
              platform: plat,
              message: `🎉 ${plat.toUpperCase()} authorized via mobile app scan! Session cookies persisted.`,
              isError: false
            });
          } else if (res.status === 'EXPIRED') {
            setChannelQrData(prev => ({
              ...prev,
              [plat]: { ...prev[plat], status: 'EXPIRED', secondsRemaining: 0 }
            }));
          } else {
            setChannelQrData(prev => ({
              ...prev,
              [plat]: {
                ...prev[plat],
                status: res.status,
                secondsRemaining: res.secondsRemaining !== undefined ? res.secondsRemaining : Math.max(0, (prev[plat]?.secondsRemaining || 120) - 2)
              }
            }));
          }
        } catch (_) {}
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [channelQrData, channelAuthModes, showChannelModal, currentBoothId]);

  // Headless Stream Broadcast Toggle across all platforms
  const handleToggleHeadlessBroadcast = async () => {
    setIsTogglingHeadless(true);
    const timeout = setTimeout(() => {
      setIsTogglingHeadless(false);
    }, 12000);
    try {
      if (isHeadlessLive) {
        await LiveStreamService.stopHeadlessStream(currentBoothId);
        setIsHeadlessLive(false);
      } else {
        await LiveStreamService.startHeadlessStream(currentBoothId, {
          streamFeedUrl: `https://vintage-vibes-erp-production.up.railway.app/live/${currentBoothId}.m3u8`
        });
        setIsHeadlessLive(true);
      }
      const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
      setSocialChannels(updated);
    } catch (e) {
      console.warn('Toggle headless error:', e);
    } finally {
      clearTimeout(timeout);
      setIsTogglingHeadless(false);
    }
  };

  // 1-Click WhatsApp Dispatch Handler
  const handleDispatchWhatsApp = async (payloadToDispatch = activeWhatsAppPayload) => {
    if (!payloadToDispatch) return;
    setIsDispatchingWhatsApp(true);
    setWhatsAppFeedback(null);
    try {
      const res = await LiveStreamService.dispatchLiveSaleWhatsApp(payloadToDispatch);
      setWhatsAppFeedback({
        success: res.success,
        message: res.dispatchedViaWorker
          ? '🚀 Order advice dispatched to customer WhatsApp via Railway Persistent Socket!'
          : '⚡ WhatsApp link ready! Tap below to open chat directly.',
        waMeLink: res.waMeLink
      });
    } catch (err: any) {
      const clean = (payloadToDispatch.customerPhone || '').replace(/\D/g, '');
      setWhatsAppFeedback({
        success: true,
        message: 'Direct WhatsApp deep link ready.',
        waMeLink: clean ? `https://wa.me/${clean}?text=${encodeURIComponent(payloadToDispatch.message)}` : undefined
      });
    } finally {
      setIsDispatchingWhatsApp(false);
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
              {Array.isArray(allBooths) && allBooths.length > 0 ? (
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

          {/* Headless Social Channels Settings */}
          <button
            onClick={() => setShowChannelModal(true)}
            className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-slate-300 hover:text-amber-400 active:scale-90 transition-all cursor-pointer relative"
            title="Headless Social Channels & Stealth Broadcasting"
          >
            <Radio className={`w-4 h-4 ${isHeadlessLive ? 'text-emerald-400 animate-pulse' : 'text-slate-300'}`} />
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-black ${
                isHeadlessLive
                  ? 'bg-emerald-400 animate-ping'
                  : socialChannels.some(c => c.auth_status === 'LOGGED_IN')
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
            />
          </button>
        </div>
      </header>

      {/* ================= ONE-TO-MANY SOCIAL CHANNELS & STEALTH INGESTION STRIP ================= */}
      <div className="relative z-20 px-3 py-1 bg-black/55 backdrop-blur-md border-y border-white/10 flex items-center justify-between overflow-x-auto gap-2 no-scrollbar text-[11px]">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <button
            onClick={() => setShowChannelModal(true)}
            className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5 hover:underline cursor-pointer"
          >
            <Radio className={`w-3 h-3 ${isHeadlessLive ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            Channels ({socialChannels.filter(c => c.auth_status === 'LOGGED_IN').length}/{socialChannels.length || 4}):
          </button>

          {/* Dynamic Social Channel Badges */}
          {socialChannels.length > 0 ? (
            socialChannels.map(ch => {
              const isLoggedIn = ch.auth_status === 'LOGGED_IN';
              const isWaitingOtp = ch.auth_status === 'WAITING_OTP';
              const isLive = ch.stream_status === 'LIVE' || isHeadlessLive;
              return (
                <button
                  key={ch.id || ch.platform}
                  onClick={() => setShowChannelModal(true)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono transition-all cursor-pointer ${
                    isLoggedIn
                      ? 'bg-black/80 border-emerald-500/40 text-emerald-300'
                      : isWaitingOtp
                      ? 'bg-amber-950/80 border-amber-400 text-amber-200 animate-pulse'
                      : 'bg-black/60 border-white/15 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isLoggedIn
                        ? isLive
                          ? 'bg-emerald-400 animate-ping'
                          : 'bg-emerald-400'
                        : isWaitingOtp
                        ? 'bg-amber-400'
                        : ch.auth_status === 'AUTHENTICATING'
                        ? 'bg-blue-400 animate-pulse'
                        : 'bg-slate-600'
                    }`}
                  />
                  <span className="capitalize font-bold">{ch.platform}</span>
                  <span className="text-[9px] opacity-75">
                    {isWaitingOtp ? '2FA OTP' : ch.account_username || 'Standby'}
                  </span>
                </button>
              );
            })
          ) : (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-cyan-400/40 text-cyan-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                TikTok
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-blue-500/40 text-blue-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Facebook
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-pink-500/40 text-pink-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Instagram
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-red-500/40 text-red-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                YouTube
              </span>
            </>
          )}
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
                {activeWhatsAppPayload && saleResultBanner.type === 'success' && (
                  <div className="mt-2 pt-2 border-t border-emerald-400/30 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      {activeWhatsAppPayload.customerPhone} ({activeWhatsAppPayload.buyerHandle})
                    </span>
                    <button
                      onClick={() => setShowWhatsAppModal(true)}
                      className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] rounded-md tracking-wider uppercase flex items-center gap-1 cursor-pointer shadow-md transition-all active:scale-95"
                    >
                      <MessageSquare className="w-3 h-3 fill-slate-950" />
                      Dispatch WhatsApp
                    </button>
                  </div>
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
              (comments || []).slice(0, 15).map(c => {
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

      {/* ================= HEADLESS SOCIAL BROADCAST CHANNELS MODAL ================= */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
          <div className="w-full sm:max-w-xl bg-slate-900 border border-white/20 rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Radio className={`w-4 h-4 ${isHeadlessLive ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
                  Social Broadcast Channels ({currentBoothId.toUpperCase()})
                </h3>
                <p className="text-[10px] text-slate-400">Direct Account Ingestion & Stealth Headless Live Hub</p>
              </div>
              <button
                onClick={() => setShowChannelModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Anti-Ban & Master Headless Stream Controls */}
            <div className="p-3 bg-slate-950/60 border-b border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                      Stealth Safeguards & Anti-Ban Active
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Persistent Cookies • Human Jitter (1.2s-3.5s) • Masked Browser Fingerprint
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleToggleHeadlessBroadcast}
                  disabled={isTogglingHeadless}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg transition-all active:scale-95 ${
                    isHeadlessLive
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950'
                  }`}
                >
                  {isTogglingHeadless ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  )}
                  {isHeadlessLive ? 'Stop Broadcast' : 'Go Live Everywhere'}
                </button>
              </div>

              {channelFeedback && !(channelFeedback.isError && channelFeedback.platform && socialChannels.find(c => c.platform === channelFeedback.platform)?.auth_status === 'LOGGED_IN') && (
                <div
                  className={`p-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
                    channelFeedback.isError
                      ? 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
                      : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200'
                  }`}
                >
                  <span>{channelFeedback.message}</span>
                  <button
                    onClick={() => setChannelFeedback(null)}
                    className="text-white/60 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Channels List */}
            <div className="p-3 overflow-y-auto space-y-2.5 text-xs flex-1">
              {socialChannels.map(ch => {
                const isLoggedIn = ch.auth_status === 'LOGGED_IN';
                const isWaitingOtp = ch.auth_status === 'WAITING_OTP';
                const isAuthenticating = isAuthenticatingChannel[ch.platform];
                const isSubmitting = isSubmittingOtp[ch.platform];
                const authMode = channelAuthModes[ch.platform] || 'CREDENTIALS';
                const qr = channelQrData[ch.platform] || {};

                return (
                  <div
                    key={ch.id || ch.platform}
                    className={`p-3 rounded-xl border transition-all ${
                      isWaitingOtp
                        ? 'bg-amber-950/40 border-amber-400 shadow-md ring-1 ring-amber-400/50'
                        : isLoggedIn
                        ? 'bg-black/40 border-emerald-500/30'
                        : 'bg-black/30 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {getPlatformBadge(ch.platform)}
                        <span className="font-bold text-white uppercase text-[11px]">
                          {ch.platform}
                        </span>
                        <span className="text-[11px] font-mono text-amber-300">
                          {ch.account_username || '@unconfigured'}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          isLoggedIn
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                            : isWaitingOtp
                            ? 'bg-amber-900/80 text-amber-200 border border-amber-400 animate-pulse'
                            : ch.auth_status === 'AUTHENTICATING'
                            ? 'bg-blue-900/60 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-800 text-slate-400 border border-white/10'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLoggedIn
                              ? 'bg-emerald-400'
                              : isWaitingOtp
                              ? 'bg-amber-400 animate-ping'
                              : ch.auth_status === 'AUTHENTICATING'
                              ? 'bg-blue-400 animate-pulse'
                              : 'bg-slate-500'
                          }`}
                        />
                        {ch.auth_status}
                      </span>
                    </div>

                    {/* Dual Auth Mode Switcher */}
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950/80 rounded-lg border border-white/10 mb-2.5">
                      <button
                        type="button"
                        onClick={() => setChannelAuthModes(prev => ({ ...prev, [ch.platform]: 'CREDENTIALS' }))}
                        className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          authMode === 'CREDENTIALS'
                            ? 'bg-white/20 text-white shadow-xs border border-white/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Key className="w-3 h-3 text-amber-400" />
                        <span>Credentials & OTP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChannelAuthModes(prev => ({ ...prev, [ch.platform]: 'QR_SCAN' }));
                          if (!qr.qrDataUrl && !isLoggedIn) {
                            handleGenerateChannelQr(ch.platform);
                          }
                        }}
                        className={`py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          authMode === 'QR_SCAN'
                            ? 'bg-white/20 text-white shadow-xs border border-white/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <QrCode className="w-3 h-3 text-emerald-400" />
                        <span>Instant QR Scan</span>
                        <span className="px-1 py-0.2 rounded text-[8px] bg-emerald-500/30 text-emerald-300 font-black">
                          FAST
                        </span>
                      </button>
                    </div>

                    {/* MODE A: CREDENTIALS & OTP */}
                    {authMode === 'CREDENTIALS' && (
                      <div className="space-y-2">
                        {/* 2FA OTP Challenge Interactive Form */}
                        {isWaitingOtp && (
                          <div className="my-2 p-2.5 rounded-lg bg-amber-900/30 border border-amber-400/60 space-y-2">
                            <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold">
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Enter 2-Factor Authentication Code:</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                maxLength={8}
                                placeholder="e.g. 849201"
                                value={otpInputs[ch.platform] || ''}
                                onChange={e =>
                                  setOtpInputs(prev => ({ ...prev, [ch.platform]: e.target.value }))
                                }
                                onKeyDown={e => e.key === 'Enter' && handleSubmitOtp(ch.platform)}
                                className="flex-1 bg-black/80 border border-amber-400 rounded-lg px-2.5 py-1 text-sm font-mono text-amber-300 tracking-widest placeholder-slate-500 focus:outline-hidden"
                              />
                              <button
                                onClick={() => handleSubmitOtp(ch.platform)}
                                disabled={isSubmitting}
                                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                              >
                                {isSubmitting ? 'Verifying...' : 'Verify OTP'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Metadata & Actions */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                          <div className="flex items-center gap-2 font-mono">
                            <span>
                              {ch.session_cookies && ch.session_cookies.length > 0
                                ? '💾 Cookie State Cached'
                                : 'No Saved Session'}
                            </span>
                            {ch.proxy_url && (
                              <span className="text-slate-500 truncate max-w-[110px]">
                                Proxy: {ch.proxy_url}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {(ch.auth_status !== 'IDLE' || isAuthenticating || isWaitingOtp) && (
                              <button
                                type="button"
                                onClick={() => handleForceResetChannel(ch.platform)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-500/40 font-bold text-[10px] cursor-pointer transition-all active:scale-95"
                                title="Force Disconnect & Reset State to IDLE"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleAuthenticatePlatform(ch.platform)}
                              disabled={isAuthenticating}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isAuthenticating ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3 h-3" />
                              )}
                              {isLoggedIn ? 'Re-Sync Session' : 'Authenticate'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MODE B: INSTANT MOBILE QR SCAN */}
                    {authMode === 'QR_SCAN' && (
                      <div className="space-y-3 pt-1">
                        {/* Prominent Error Banner if QR Fetch / Puppeteer Extraction Failed */}
                        {qr.qrError && !isLoggedIn && !qr.qrDataUrl && (
                          <div className="p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-start gap-2 text-rose-200 text-xs">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="font-bold uppercase text-[9px] text-rose-300 tracking-wider">
                                QR Extraction Failure
                              </div>
                              <p className="text-[10px] text-rose-200 font-mono mt-0.5 break-all">
                                {qr.qrError}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleGenerateChannelQr(ch.platform)}
                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9px] uppercase cursor-pointer"
                              >
                                Retry
                              </button>
                            </div>
                          </div>
                        )}

                        {isLoggedIn ? (
                          <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex flex-col items-center text-center space-y-1.5">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-emerald-200 uppercase">
                              {ch.platform} Session Verified & Active
                            </span>
                            <p className="text-[10px] text-emerald-300/80">
                              Authenticated via mobile QR scan. Session cookies are persisted for background comment scraping and live streaming.
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => handleGenerateChannelQr(ch.platform)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Re-Authenticate with New QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleForceResetChannel(ch.platform)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-900/50 hover:bg-rose-800 text-rose-200 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Force Disconnect / Reset</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-950/70 p-3 rounded-xl border border-white/10">
                            {/* High-Contrast Scan-Ready QR Container */}
                            <div className="shrink-0 flex flex-col items-center">
                              <div className="relative p-2.5 bg-white rounded-xl border-2 border-slate-900 shadow-xl flex items-center justify-center">
                                {qr.qrDataUrl ? (
                                  <img
                                    src={qr.qrDataUrl}
                                    alt={`${ch.platform} Login QR`}
                                    className="w-36 h-36 rounded-md object-contain"
                                  />
                                ) : (
                                  <div className="w-36 h-36 rounded-md bg-slate-100 flex flex-col items-center justify-center text-slate-500 gap-1.5 text-center p-2">
                                    {qr.isGenerating ? (
                                      <>
                                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                                        <span className="text-[10px] font-bold text-slate-700">Connecting to worker...</span>
                                        <span className="text-[9px] text-slate-500">Extracting live QR...</span>
                                      </>
                                    ) : qr.qrError ? (
                                      <>
                                        <AlertCircle className="w-6 h-6 text-rose-500" />
                                        <span className="text-[9px] font-bold text-rose-700">Extraction Failed</span>
                                      </>
                                    ) : (
                                      <>
                                        <QrCode className="w-8 h-8 text-slate-400" />
                                        <span className="text-[10px] text-slate-600 font-medium">Tap button to generate QR</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                {qr.status === 'EXPIRED' && (
                                  <div className="absolute inset-0 bg-slate-950/85 rounded-xl backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center">
                                    <Clock className="w-5 h-5 text-amber-400 mb-1" />
                                    <span className="font-bold text-white text-[11px]">QR Expired</span>
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateChannelQr(ch.platform)}
                                      className="mt-1.5 px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black uppercase cursor-pointer"
                                    >
                                      Refresh QR
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Countdown Progress Bar */}
                              {qr.qrDataUrl && qr.status !== 'EXPIRED' && (
                                <div className="w-full mt-2 space-y-1">
                                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-300">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 text-emerald-400" />
                                      <span>Expires:</span>
                                    </span>
                                    <span className="text-amber-300 font-black">
                                      {Math.floor((qr.secondsRemaining || 0) / 60)}:
                                      {String((qr.secondsRemaining || 0) % 60).padStart(2, '0')}
                                    </span>
                                  </div>
                                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-1000"
                                      style={{ width: `${Math.min(100, ((qr.secondsRemaining || 0) / 120) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Mobile Instructions & Action Buttons */}
                            <div className="flex-1 space-y-2 text-left w-full">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 uppercase">
                                <Smartphone className="w-3.5 h-3.5" />
                                <span>Scan with Mobile App</span>
                              </div>

                              <div className="p-2 rounded-lg bg-black/50 border border-white/5 text-[10px] text-slate-300 space-y-1">
                                {ch.platform.toLowerCase() === 'tiktok' && (
                                  <>
                                    <p>1. Open <strong>TikTok</strong> app on phone.</p>
                                    <p>2. Tap <strong>Profile</strong> ➔ <strong>Menu (≡)</strong> ➔ <strong>My QR Code</strong>.</p>
                                    <p>3. Tap <strong>Scan icon</strong> (top right) & scan this code.</p>
                                    <p>4. Tap <strong>"Confirm Login"</strong>.</p>
                                  </>
                                )}
                                {ch.platform.toLowerCase() === 'instagram' && (
                                  <>
                                    <p>1. Open <strong>Instagram</strong> app on phone.</p>
                                    <p>2. Tap <strong>Settings & Privacy</strong> ➔ <strong>QR Code</strong>.</p>
                                    <p>3. Tap <strong>Scan QR Code</strong> and scan the screen.</p>
                                    <p>4. Confirm studio login.</p>
                                  </>
                                )}
                                {(ch.platform.toLowerCase() === 'facebook' || ch.platform.toLowerCase() === 'fb') && (
                                  <>
                                    <p>1. Open <strong>Facebook</strong> on phone.</p>
                                    <p>2. Menu (≡) ➔ Settings ➔ Security ➔ Code Generator / QR.</p>
                                    <p>3. Scan and confirm authorization.</p>
                                  </>
                                )}
                                {ch.platform.toLowerCase() === 'youtube' && (
                                  <>
                                    <p>1. Open <strong>YouTube / Google</strong> app on phone.</p>
                                    <p>2. Tap <strong>Account</strong> ➔ <strong>Sign In</strong>.</p>
                                    <p>3. Point camera at QR code and approve login.</p>
                                  </>
                                )}
                                {!['tiktok', 'instagram', 'facebook', 'fb', 'youtube'].includes(ch.platform.toLowerCase()) && (
                                  <>
                                    <p>1. Open your phone camera or app.</p>
                                    <p>2. Scan this QR code to authorize studio stream session.</p>
                                  </>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleGenerateChannelQr(ch.platform)}
                                  disabled={qr.isGenerating}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-xs"
                                >
                                  <RefreshCw className={`w-3 h-3 ${qr.isGenerating ? 'animate-spin' : ''}`} />
                                  <span>{qr.isGenerating ? 'Fetching QR...' : qr.qrDataUrl ? 'Refresh QR' : 'Generate QR'}</span>
                                </button>

                                {qr.qrDataUrl && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyChannelQrStatus(ch.platform)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-sm"
                                    title="Verify if mobile scan was authorized on server"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Verify Scan Status</span>
                                  </button>
                                )}

                                {(ch.auth_status !== 'IDLE' || qr.qrDataUrl || qr.isGenerating) && (
                                  <button
                                    type="button"
                                    onClick={() => handleForceResetChannel(ch.platform)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-500/40 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-xs"
                                    title="Force Disconnect & Reset to IDLE"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Force Reset</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                To update usernames or passwords, use ERP Setup Hub.
              </span>
              <button
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= WHATSAPP 1-CLICK DISPATCH HUB MODAL ================= */}
      {showWhatsAppModal && activeWhatsAppPayload && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-slate-900 border border-white/20 rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-3 border-b border-white/10 flex items-center justify-between bg-emerald-950/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    WhatsApp Order Dispatch Hub
                  </h3>
                  <p className="text-[10px] text-emerald-300">
                    Live Claim Confirmation & Courier Dispatch Advice
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-3.5 space-y-3 text-xs overflow-y-auto flex-1">
              {/* Customer & Invoice Details */}
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-black/50 border border-white/10">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Buyer Handle</span>
                  <p className="font-bold text-amber-300 text-xs">{activeWhatsAppPayload.buyerHandle}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Invoice Number</span>
                  <p className="font-mono text-white text-xs">{activeWhatsAppPayload.invoiceNo}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">SKU Barcode</span>
                  <p className="font-mono text-emerald-400 text-xs">{activeWhatsAppPayload.barcode}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Amount Payable</span>
                  <p className="font-bold text-amber-400 text-xs font-mono">AED {activeWhatsAppPayload.priceAed}</p>
                </div>
              </div>

              {/* Customer WhatsApp Number */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1">
                  Customer Phone / WhatsApp:
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={activeWhatsAppPayload.customerPhone}
                    onChange={e =>
                      setActiveWhatsAppPayload(prev =>
                        prev ? { ...prev, customerPhone: e.target.value } : null
                      )
                    }
                    className="w-full pl-8 pr-3 py-2 bg-black/60 border border-white/20 rounded-lg text-xs font-mono text-white focus:outline-hidden focus:border-emerald-400"
                    placeholder="+971 50 000 0000"
                  />
                </div>
              </div>

              {/* Message Preview */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1">
                  Message Content (Pre-formatted):
                </label>
                <textarea
                  rows={6}
                  value={activeWhatsAppPayload.message}
                  onChange={e =>
                    setActiveWhatsAppPayload(prev =>
                      prev ? { ...prev, message: e.target.value } : null
                    )
                  }
                  className="w-full p-2.5 bg-black/60 border border-white/20 rounded-lg text-xs font-mono text-emerald-200 leading-relaxed focus:outline-hidden focus:border-emerald-400"
                />
              </div>

              {/* Status Feedback */}
              {whatsAppFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    whatsAppFeedback.success
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                      : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>{whatsAppFeedback.message}</span>
                  </div>
                  {whatsAppFeedback.waMeLink && (
                    <a
                      href={whatsAppFeedback.waMeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-amber-300 hover:underline pt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in WhatsApp Web / App directly
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeWhatsAppPayload.message);
                  setWhatsAppFeedback({
                    success: true,
                    message: '📋 Message copied to clipboard!'
                  });
                }}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>

              <div className="flex items-center gap-2">
                {whatsAppFeedback?.waMeLink && (
                  <a
                    href={whatsAppFeedback.waMeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Chat
                  </a>
                )}

                <button
                  onClick={() => handleDispatchWhatsApp()}
                  disabled={isDispatchingWhatsApp}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isDispatchingWhatsApp ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 fill-current" />
                  )}
                  {isDispatchingWhatsApp ? 'Dispatching...' : '1-Click Dispatch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSync } from '../../../context/SyncContext.tsx';
import { LiveStreamService, BoothSocialChannel } from '../../../services/liveStreamService.ts';
import { RTMPDestination, LiveStudioComment, BoothSession } from '../../../server/streamController.ts';
import { useRtmpStreamer } from '../../liveStreaming/useRtmpStreamer.ts';
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
  CheckCircle,
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
  Maximize2,
  Minimize2,
  RotateCcw,
  PowerOff,
  XCircle,
  LogOut
} from 'lucide-react';

interface MobileLiveHostViewProps {
  initialBoothId?: string;
  onExitToERP?: () => void;
  onNavigateToDrafts?: () => void;
}

const renderCommentTextWithLinks = (text?: string) => {
  const raw = String(text || '');
  if (!raw.includes('http://') && !raw.includes('https://')) return raw;
  return raw.split(/(https?:\/\/[^\s]+)/g).map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      const m = part.match(/^(https?:\/\/[^\s]*?[^\s.,;!?])([.,;!?]+)?$/);
      const url = m ? m[1] : part;
      const trail = m && m[2] ? m[2] : '';
      return (
        <React.Fragment key={idx}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sky-300 underline break-all"
          >
            {url}
          </a>
          {trail}
        </React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

const isGenuineClaimComment = (text?: string, username?: string): boolean => {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (/Auto-Claim Bot|VintageVibesHost|Vintage Vibes Host/i.test(username || '') || /^🎉\s*SOLD/i.test(clean)) {
    return false;
  }
  if (!/\b(?:claim|mine)\b/i.test(clean)) return false;
  if (/[?؟]/.test(clean)) return false;
  if (
    /\b(?:how|what|where|when|why|who|which|can\s+i|could\s+i|do\s+i|should\s+i|would\s+i|is\s+this|are\s+these|is\s+it|tell\s+me|explain|don'?t|do\s+not|not|never|can'?t|cannot|kese|kaisay|kaise|kya|keya|kidhar|kab|kon|kahan)\b/i.test(
      clean
    )
  ) {
    return false;
  }
  return (
    /^\s*(?:pls\s+|please\s+|ok\s+|yes\s+|bro\s+|sir\s+|boss\s+|i\s+want\s+to\s+|want\s+to\s+|i\s+)?(?:claim|mine)\b/i.test(clean) ||
    /\b(?:claim|mine)\s+#?(?:this|it|now|pls|please|for\s+me|one|1|[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\b/i.test(clean) ||
    /\b(?:VV|VIN|BAL|DXB)[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*\s+(?:claim|mine)\b/i.test(clean)
  );
};

export const MobileLiveHostView: React.FC<MobileLiveHostViewProps> = ({
  initialBoothId = 'booth-01',
  onExitToERP,
  onNavigateToDrafts
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
  const [liveViewers, setLiveViewers] = useState<number>(0);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'LIVE' | 'CONNECTING' | 'OFFLINE'>('OFFLINE');

  // Multi-Platform Social Channels & Headless Ingestion
  const [socialChannels, setSocialChannels] = useState<BoothSocialChannel[]>([]);
  const [showChannelModal, setShowChannelModal] = useState<boolean>(false);
  const [isHeadlessLive, setIsHeadlessLive] = useState<boolean>(false);
  const [isTogglingHeadless, setIsTogglingHeadless] = useState<boolean>(false);

  const [isVideoMirrored, setIsVideoMirrored] = useState<boolean>(true);
  const [antiBanHudEnabled, setAntiBanHudEnabled] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__vvCameraMirrorFlip = isVideoMirrored;
    }
  }, [isVideoMirrored]);

  // Native Browser WebRTC to YouTube RTMP Live Streamer
  const {
    isStreaming: isRtmpStreaming,
    streamStatus: rtmpStatus,
    startStreaming: startRtmpStream,
    stopStreaming: stopRtmpStream
  } = useRtmpStreamer({
    boothId: currentBoothId,
    streamKey: (booth as any)?.youtube_stream_key || (booth as any)?.youtubeStreamKey || (booth as any)?.master_stream_key || (booth as any)?.masterStreamKey || '',
    rtmpUrl: (booth as any)?.master_ingest_rtmp_url || (booth as any)?.masterIngestRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
    onStatusChange: (status, msg) => {
      console.log(`[MobileLiveHostView] RTMP stream status -> ${status}:`, msg);
      if (status === 'LIVE') {
        setSaleResultBanner({
          type: 'success',
          title: '🔴 LIVE ON YOUTUBE!',
          message: 'Your camera feed is actively transmitting directly to YouTube RTMP!'
        });
      } else if (status === 'ERROR') {
        setSaleResultBanner({
          type: 'error',
          title: 'Live Stream Error',
          message: msg || 'Could not connect to YouTube RTMP relay.'
        });
      }
    }
  });
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

  // Unified Chat, Locked Claims & Stream Video Session Logs
  const [comments, setComments] = useState<LiveStudioComment[]>([]);
  const [lockedClaimComments, setLockedClaimComments] = useState<LiveStudioComment[]>([]);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [activeChatTab, setActiveChatTab] = useState<'LIVE' | 'CLAIMS' | 'LOGS'>('LIVE');
  const [claimingCommentIds, setClaimingCommentIds] = useState<Record<string, boolean>>({});
  const [isChatExpanded, setIsChatExpanded] = useState<boolean>(true);
  const [manualCommentInput, setManualCommentInput] = useState<string>('');
  const [manualCommentPlatform, setManualCommentPlatform] = useState<'tiktok' | 'instagram' | 'facebook' | 'youtube'>('youtube');
  const [manualCommentUser, setManualCommentUser] = useState<string>('@VintageVibesHost');
  const [isHostReplyMode, setIsHostReplyMode] = useState<boolean>(true);
  const [ytLiveInput, setYtLiveInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vv_last_yt_live_url') || '@VintageVibesLLCSPC';
    }
    return '@VintageVibesLLCSPC';
  });
  const [isYtChatConnected, setIsYtChatConnected] = useState<boolean>(false);
  const [isConnectingYtChat, setIsConnectingYtChat] = useState<boolean>(false);
  const [canSendYtChat, setCanSendYtChat] = useState<boolean>(false);

  // Active Vintage Garment SKU & Fast Sale Control Strip
  const [stockPieces, setStockPieces] = useState<PieceBreakdownItem[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<PieceBreakdownItem | null>(null);
  const [skuSearchInput, setSkuSearchInput] = useState<string>('');
  const [showSkuPicker, setShowSkuPicker] = useState<boolean>(false);

  // Garment Studio Photos & Lightbox Showcase
  const [activePhotoTab, setActivePhotoTab] = useState<'front' | 'back' | 'tag'>('front');
  const [isGarmentCardMinimized, setIsGarmentCardMinimized] = useState<boolean>(false);
  const [showPhotoLightbox, setShowPhotoLightbox] = useState<boolean>(false);

  const currentSelectedPhotoUrl = useMemo(() => {
    if (!selectedPiece) return '';
    const front = selectedPiece.frontImageUrl || (selectedPiece as any).front_image_url || (selectedPiece as any).front_image || '';
    const back = selectedPiece.backImageUrl || (selectedPiece as any).back_image_url || (selectedPiece as any).back_image || front;
    const tag = selectedPiece.tagImageUrl || (selectedPiece as any).tag_image_url || (selectedPiece as any).tag_image || front;
    if (activePhotoTab === 'front') return front;
    if (activePhotoTab === 'back') return back;
    if (activePhotoTab === 'tag') return tag;
    return front;
  }, [selectedPiece, activePhotoTab]);

  // Camera & Broadcast Compositor State + Optical Camera Vision Barcode/Garment Auto-Detector
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);
  const [visionScannerInput, setVisionScannerInput] = useState<string>('');
  const [visionMatchBanner, setVisionMatchBanner] = useState<string>('');
  const lastVisionMatchedSkuRef = useRef<string>('');

  const selectPieceFromVisionOrScan = useCallback(
    (piece: PieceBreakdownItem, sourceLabel: string) => {
      if (!piece) return;
      setSelectedPiece(piece);
      const nextPrice = Number(
        piece.retailPriceAed || (piece as any).retail_price_aed || piece.lockedPrice || piece.estimatedPrice || 0
      );
      lastSyncedBarcodeRef.current = piece.barcode;
      setSellingPrice(nextPrice);
      setActivePhotoTab('front');
      lastVisionMatchedSkuRef.current = piece.barcode;
      setVisionMatchBanner(`${sourceLabel}: ${piece.barcode} • ${piece.brandName || 'Vintage'} (${piece.sizeScanned || 'M'})`);
      setTimeout(() => {
        setVisionMatchBanner(prev => (prev.includes(piece.barcode) ? '' : prev));
      }, 4500);
    },
    []
  );

  // Real-Time Optical Camera Barcode / QR Auto-Recognition (900ms loop while Camera is Live)
  useEffect(() => {
    if (!isCameraLive || typeof window === 'undefined') return;
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) return;

    let detector: any = null;
    try {
      detector = new BarcodeDetectorCtor({
        formats: ['code_128', 'qr_code', 'code_39', 'ean_13', 'ean_8']
      });
    } catch {
      try {
        detector = new BarcodeDetectorCtor();
      } catch {
        return;
      }
    }

    let cancelled = false;
    const scanTimer = setInterval(async () => {
      if (cancelled || !detector || !videoRef.current || !stockPieces.length) return;
      const vid = videoRef.current;
      if (vid.readyState < 2 || !vid.videoWidth) return;
      try {
        const codes = await detector.detect(vid);
        if (Array.isArray(codes) && codes.length > 0) {
          for (const item of codes) {
            const rawVal = String(item?.rawValue || '').trim().toUpperCase();
            if (!rawVal) continue;
            const found = stockPieces.find(p => {
              const b = String(p.barcode || '').toUpperCase();
              return b === rawVal || rawVal.includes(b) || (rawVal.length >= 4 && b.endsWith(rawVal));
            });
            if (found && lastVisionMatchedSkuRef.current !== found.barcode) {
              selectPieceFromVisionOrScan(found, '📷 Camera Recognized');
              break;
            }
          }
        }
      } catch (_) {}
    }, 900);

    return () => {
      cancelled = true;
      clearInterval(scanTimer);
    };
  }, [isCameraLive, stockPieces, selectPieceFromVisionOrScan]);

  // Automatic 2-Hour Post-Live Chat Auto-Clear Enforcement
  useEffect(() => {
    const isLiveNow =
      isRtmpStreaming ||
      isHeadlessLive ||
      Boolean(booth?.isBroadcasting) ||
      socialChannels.some(c => c.stream_status === 'LIVE');
    if (isLiveNow) return;

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const checkExpiry = () => {
      const stoppedAt = Number((booth as any)?.lastBroadcastStoppedAt || 0);
      const now = Date.now();
      if (stoppedAt > 0 && now - stoppedAt >= TWO_HOURS_MS && (comments.length > 0 || lockedClaimComments.length > 0)) {
        setComments([]);
        setLockedClaimComments([]);
        fetch(`/api/live/booths/${currentBoothId}/comments/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearLocked: true })
        }).catch(() => {});
        return;
      }
      setComments(prev => {
        if (!prev.length) return prev;
        const filtered = prev.filter((c: any) => {
          const ts = Number(c?.createdAtMs || 0) || Number(String(c?.id || '').match(/-(\d{13})\b/)?.[1] || 0);
          return !ts || now - ts < TWO_HOURS_MS;
        });
        return filtered.length === prev.length ? prev : filtered;
      });
    };

    checkExpiry();
    const iv = setInterval(checkExpiry, 60000);
    return () => clearInterval(iv);
  }, [isRtmpStreaming, isHeadlessLive, booth, socialChannels, comments.length, lockedClaimComments.length, currentBoothId]);

  const compositorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorAnimFrameRef = useRef<number | null>(null);
  const compositorIntervalRef = useRef<any>(null);
  const activeGarmentImgRef = useRef<HTMLImageElement | null>(null);
  const activeGarmentUrlRef = useRef<string | null>(null);

  // Live Comment Visual Toast & Screen Alert
  const [recentCommentToast, setRecentCommentToast] = useState<LiveStudioComment | null>(null);
  const lastSeenCommentIdRef = useRef<string>('');
  const hasInitializedCommentsRef = useRef<boolean>(false);
  const toastTimeoutRef = useRef<any>(null);

  const triggerCommentToast = useCallback((comment: LiveStudioComment | null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setRecentCommentToast(comment);
    if (comment) {
      toastTimeoutRef.current = setTimeout(() => {
        setRecentCommentToast(prev => (prev?.id === comment.id ? null : prev));
        toastTimeoutRef.current = null;
      }, 5000);
    }
  }, []);

  // Whenever a new comment arrives from polling or socket, trigger on-screen toast (auto-dismisses cleanly after 5s)
  useEffect(() => {
    if (!comments || comments.length === 0) {
      hasInitializedCommentsRef.current = true;
      return;
    }
    const newest = comments[0];
    if (!hasInitializedCommentsRef.current) {
      hasInitializedCommentsRef.current = true;
      if (newest) {
        lastSeenCommentIdRef.current = newest.id;
      }
      return;
    }
    if (newest && newest.id !== lastSeenCommentIdRef.current) {
      lastSeenCommentIdRef.current = newest.id;
      triggerCommentToast(newest);
    }
  }, [comments, triggerCommentToast]);

  // Preload garment photo for live video broadcast overlay HUD & sync activeOnAirSku to backend auto-claim engine
  useEffect(() => {
    if (selectedPiece?.barcode && currentBoothId) {
      const pPrice = Number(sellingPrice || selectedPiece.retailPriceAed || (selectedPiece as any).retail_price_aed || 0);
      fetch(`/api/live-stream/booths/${currentBoothId}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeOnAirSku: selectedPiece.barcode,
          currentDealPrice: pPrice
        })
      }).catch(() => {});
    }
    const imgUrl = currentSelectedPhotoUrl || selectedPiece?.frontImageUrl || (selectedPiece as any)?.front_image_url;
    if (imgUrl && imgUrl !== activeGarmentUrlRef.current) {
      activeGarmentUrlRef.current = imgUrl;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        activeGarmentImgRef.current = img;
      };
      img.onerror = () => {
        console.warn('[MobileLiveHostView] Image anonymous CORS failed, loading directly:', imgUrl);
        const fallback = new Image();
        fallback.onload = () => {
          activeGarmentImgRef.current = fallback;
        };
        fallback.src = imgUrl;
      };
      img.src = imgUrl;
      activeGarmentImgRef.current = img;
    } else if (!imgUrl) {
      activeGarmentUrlRef.current = null;
      activeGarmentImgRef.current = null;
    }
  }, [selectedPiece, currentSelectedPhotoUrl]);

  // Clean up animation frame and background ticker on unmount
  useEffect(() => {
    return () => {
      if (compositorAnimFrameRef.current) {
        cancelAnimationFrame(compositorAnimFrameRef.current);
        compositorAnimFrameRef.current = null;
      }
      if (compositorIntervalRef.current) {
        clearInterval(compositorIntervalRef.current);
        compositorIntervalRef.current = null;
      }
    };
  }, []);

  // Sale Fields
  const [buyerHandle, setBuyerHandle] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const lastSyncedBarcodeRef = useRef<string>('');
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false);
  const [isProcessingLock, setIsProcessingLock] = useState<boolean>(false);
  const [saleResultBanner, setSaleResultBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    invoiceNo?: string;
    voucherNo?: string;
    details?: string;
    youtubeAuthRequired?: boolean;
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
        const price = Number(found.retailPriceAed || (found as any).retail_price_aed || found.lockedPrice || found.estimatedPrice || 0);
        lastSyncedBarcodeRef.current = found.barcode;
        setSellingPrice(price);
        fetch(`/api/live/booths/${currentBoothId}/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeOnAirSku: found.barcode, currentDealPrice: price })
        }).catch(() => {});
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
      const [boothRes, allRes, piecesRes, invOverridesRes, commentsRes, channels] = await Promise.all([
        fetch(`/api/live/booths/${currentBoothId}`),
        fetch('/api/live/booths'),
        fetch('/api/purchase/pieces'),
        fetch('/rest/v1/inventory_pieces?select=barcode,front_image_url,back_image_url,tag_image_url,brand_name,item_name,size_scanned,ready_for_ecommerce').catch(() => null),
        fetch(`/api/live/booths/${currentBoothId}/comments`),
        LiveStreamService.getBoothSocialChannels(currentBoothId).catch(() => [])
      ]);

      const invMap: Record<string, any> = {};
      if (invOverridesRes && invOverridesRes.ok) {
        try {
          const invRows = await invOverridesRes.json();
          if (Array.isArray(invRows)) {
            for (const row of invRows) {
              if (row?.barcode) invMap[String(row.barcode).toUpperCase()] = row;
            }
          }
        } catch (_) {}
      }

      if (Array.isArray(channels)) {
        setSocialChannels(channels);
        const anyBroadcasting = channels.some(c => c.stream_status === 'LIVE');
        setIsHeadlessLive(anyBroadcasting);
      }

      if (boothRes.ok) {
        const b = await boothRes.json();
        setBooth(b);
        if (b.viewerCount) setLiveViewers(b.viewerCount);
        if (Array.isArray(b.lockedClaimComments)) {
          setLockedClaimComments(b.lockedClaimComments);
        }
        if (Array.isArray(b.sessionLogs)) {
          setSessionLogs(b.sessionLogs);
        }
      }

      if (allRes.ok) {
        const overview = await allRes.json();
        if (Array.isArray(overview.booths)) {
          setAllBooths(overview.booths);
        }
      }

      if (piecesRes.ok) {
        const rawPieces = await piecesRes.json();
        if (Array.isArray(rawPieces)) {
          const available: PieceBreakdownItem[] = rawPieces
            .filter((p: any) => {
              const bKey = String(p.barcode || p.sku || '').toUpperCase();
              const ov = invMap[bKey];
              if (ov && ov.ready_for_ecommerce === false) return false;
              return (
                !p.is_sold &&
                !p.isSold &&
                p.ready_for_ecommerce !== false &&
                p.raw_data?.ready_for_ecommerce !== false &&
                (p.status === 'IN_STOCK' || p.status === 'AVAILABLE')
              );
            })
            .map((p: any) => {
              const bKey = String(p.barcode || p.sku || '').toUpperCase();
              const ov = invMap[bKey];
              const brand = ov?.brand_name || p.brand_name || p.brandName || 'Vintage';
              const name = ov?.item_name || p.item_name || p.itemName || 'Garment';
              const size = ov?.size_scanned || p.size_scanned || p.sizeScanned || p.size || 'M';
              const retailVal = Number(p.retail_price_aed || p.retailPriceAed || p.lockedPrice || p.estimatedPrice || p.price || 0);
              const price = retailVal > 0 ? retailVal : Number(p.cost_price || p.costPrice || 0);
              const weight = Number(p.weight_kg ?? p.weightKg ?? (p.weight_grams ? p.weight_grams / 1000 : 0.45));
              const grams = Number(p.weight_grams ?? p.weightGrams ?? Math.round(weight * 1000));
              const cost = Number(p.cost_price ?? p.costPrice ?? p.calculated_cost_price ?? p.calculatedCostPrice ?? (p.cost_per_gram ? Number((grams * p.cost_per_gram).toFixed(2)) : 0));
              const frontImg = ov?.front_image_url || p.front_image_url || p.frontImageUrl || p.front_image || (p.raw_data && (p.raw_data.front_image_url || p.raw_data.front_image)) || '';
              const backImg = ov?.back_image_url || p.back_image_url || p.backImageUrl || p.back_image || (p.raw_data && (p.raw_data.back_image_url || p.raw_data.back_image)) || '';
              const tagImg = ov?.tag_image_url || p.tag_image_url || p.tagImageUrl || p.tag_image || (p.raw_data && (p.raw_data.tag_image_url || p.raw_data.tag_image)) || '';

              return {
                id: p.id,
                barcode: p.barcode || p.sku,
                sku: p.sku || p.barcode,
                itemName: name,
                brandName: brand,
                brand_name: brand,
                item_name: name,
                category: p.category || 'Apparel',
                sizeScanned: size,
                size_scanned: size,
                weightKg: weight,
                weight_kg: weight,
                weightGrams: grams,
                weight_grams: grams,
                costPrice: cost,
                cost_price: cost,
                calculatedCostPrice: cost,
                retailPriceAed: price,
                retail_price_aed: price,
                estimatedPrice: price,
                lockedPrice: price,
                frontImageUrl: frontImg,
                front_image_url: frontImg,
                backImageUrl: backImg,
                back_image_url: backImg,
                tagImageUrl: tagImg,
                tag_image_url: tagImg,
                status: p.status || 'IN_STOCK',
                isSold: Boolean(p.is_sold || p.isSold),
                ready_for_ecommerce: p.ready_for_ecommerce,
                bale_id: p.bale_id,
                raw_data: p
              } as PieceBreakdownItem;
            });

          setStockPieces(available);
          if (available.length > 0) {
            setSelectedPiece(prev => {
              const match = prev ? available.find(p => p.barcode === prev.barcode || p.id === prev.id) : null;
              const nextPiece = match || available[0];
              if (nextPiece && lastSyncedBarcodeRef.current !== nextPiece.barcode) {
                lastSyncedBarcodeRef.current = nextPiece.barcode;
                const nextPrice = Number(nextPiece.retailPriceAed || (nextPiece as any).retail_price_aed || nextPiece.lockedPrice || nextPiece.estimatedPrice || 0);
                setSellingPrice(nextPrice);
              }
              return nextPiece;
            });
          } else {
            lastSyncedBarcodeRef.current = '';
            setSelectedPiece(null);
            setSellingPrice(0);
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
  }, [currentBoothId]);

  useEffect(() => {
    loadBoothData();
  }, [loadBoothData, syncVersion]);

  // Instant 0ms Zero-Latency SSE Real-Time Stream for Mobile Live Comments
  useEffect(() => {
    if (!currentBoothId) return;
    let sse: EventSource | null = null;
    try {
      sse = new EventSource('/api/events/subscribe');
      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'ENTITY_MUTATED') {
            const curNum = parseInt(currentBoothId.replace(/^booth[-_]?0*/i, ''), 10) || 1;
            if (payload.entity === 'LIVE_COMMENT' && payload.data) {
              const incoming = payload.data as LiveStudioComment;
              const inNum = parseInt(String(incoming.boothId || '').replace(/^booth[-_]?0*/i, ''), 10) || 1;
              if (curNum === inNum) {
                lastSeenCommentIdRef.current = incoming.id;
                setComments(prev => {
                  if (prev.some(c => c.id === incoming.id)) {
                    return prev.map(c => (c.id === incoming.id ? { ...c, ...incoming } : c));
                  }
                  return [incoming, ...prev];
                });
                const isClaimMsg =
                  Boolean(incoming.isClaimIntent) &&
                  isGenuineClaimComment(incoming.comment, incoming.username);
                setLockedClaimComments(prev => {
                  if (prev.some(c => c.id === incoming.id)) {
                    return prev.map(c => (c.id === incoming.id ? { ...c, ...incoming } : c));
                  }
                  if (!isClaimMsg) return prev;
                  return [incoming, ...prev];
                });
                setRecentCommentToast(prev => (prev && prev.id === incoming.id ? { ...prev, ...incoming } : prev));
                if (isClaimMsg && payload.action !== 'UPDATE') {
                  playSaleChime();
                }
                if (payload.action !== 'UPDATE') {
                  triggerCommentToast(incoming);
                }
              }
            } else if (payload.entity === 'COMMENTS_CLEARED' && payload.data) {
              const targetBooth = String(payload.data.boothId || '');
              const inNum = parseInt(targetBooth.replace(/^booth[-_]?0*/i, ''), 10) || 1;
              if (targetBooth === 'ALL' || curNum === inNum) {
                setComments([]);
                lastSeenCommentIdRef.current = '';
                triggerCommentToast(null);
                if (Array.isArray(payload.data.lockedClaimComments)) {
                  setLockedClaimComments(payload.data.lockedClaimComments);
                  if (payload.data.lockedClaimComments.length > 0) {
                    setActiveChatTab('CLAIMS');
                  }
                }
                if (payload.data.sessionLog) {
                  setSessionLogs(prev => [
                    payload.data.sessionLog,
                    ...prev.filter((l: any) => l.id !== payload.data.sessionLog.id)
                  ]);
                }
              }
            } else if (payload.entity === 'YOUTUBE_CHAT_OAUTH' && payload.data?.authorized) {
              setCanSendYtChat(true);
            } else if (payload.entity === 'YOUTUBE_CHAT_STATUS' && payload.data) {
              const inNum = parseInt(String(payload.data.boothId || '').replace(/^booth[-_]?0*/i, ''), 10) || 1;
              if (curNum === inNum) {
                const connected = payload.data.status === 'CONNECTED';
                setIsYtChatConnected(connected);
                if (!connected) {
                  setComments([]);
                  lastSeenCommentIdRef.current = '';
                  triggerCommentToast(null);
                  loadBoothData();
                } else {
                  setActiveChatTab('LIVE');
                }
              }
            } else if (payload.entity === 'LIVE_STREAM' && payload.data) {
              const docRef = String(payload.documentRef || '');
              const inNum = parseInt(String(payload.data.boothId || docRef || '').replace(/^booth[-_]?0*/i, ''), 10) || 1;
              if (curNum === inNum && (docRef.endsWith('_STOP') || payload.data.isBroadcasting === false)) {
                setIsHeadlessLive(false);
                setIsYtChatConnected(false);
                setComments([]);
                lastSeenCommentIdRef.current = '';
                triggerCommentToast(null);
                setUptimeSeconds(0);
                if (Array.isArray(payload.data.lockedClaimComments)) {
                  setLockedClaimComments(payload.data.lockedClaimComments);
                  if (payload.data.lockedClaimComments.length > 0) {
                    setActiveChatTab('CLAIMS');
                  }
                }
                if (Array.isArray(payload.data.sessionLogs)) {
                  setSessionLogs(payload.data.sessionLogs);
                }
              }
            }
          }
        } catch (_) {}
      };
    } catch (sseErr) {
      console.warn('[MobileLiveHostView] SSE EventSource init note:', sseErr);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [currentBoothId, triggerCommentToast]);

  // Continuous 2.5-second live comment stream fallback polling
  useEffect(() => {
    const chatInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/booths/${currentBoothId}/comments`);
        if (res.ok) {
          const c = await res.json();
          if (Array.isArray(c)) {
            setComments(c);
            if (c.length === 0) {
              triggerCommentToast(null);
            }
          }
        }
      } catch {}
    }, 2500);

    return () => clearInterval(chatInterval);
  }, [currentBoothId, triggerCommentToast]);

  // Real telemetry: uptime counter + REAL microphone level (AnalyserNode). Bitrate/FPS are no longer simulated.
  useEffect(() => {
    const isActivelyStreaming = isRtmpStreaming || isHeadlessLive;
    if (!isActivelyStreaming) {
      setUptimeSeconds(0);
      setConnectionStatus('OFFLINE');
    } else {
      setConnectionStatus('LIVE');
    }
    let ac: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let srcNode: MediaStreamAudioSourceNode | null = null;
    let srcTrackId = '';
    let buf: Uint8Array | null = null;
    const sampleAudio = () => {
      try {
        const track = mediaStreamRef.current?.getAudioTracks?.()[0];
        if (!track || !track.enabled || track.readyState !== 'live') { setAudioLevel(0); return; }
        if (!ac) {
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AC) { setAudioLevel(0); return; }
          ac = new AC();
        }
        if (!analyser || srcTrackId !== track.id) {
          try { srcNode?.disconnect(); } catch (_) {}
          srcNode = ac!.createMediaStreamSource(new MediaStream([track]));
          srcTrackId = track.id;
          analyser = ac!.createAnalyser();
          analyser.fftSize = 256;
          srcNode.connect(analyser);
          buf = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser!.getByteTimeDomainData(buf as any);
        let sum = 0;
        for (let i = 0; i < buf!.length; i++) { const d = (buf![i] - 128) / 128; sum += d * d; }
        setAudioLevel(Math.min(100, Math.round(Math.sqrt(sum / buf!.length) * 300)));
      } catch (_) {
        setAudioLevel(0);
      }
    };
    const timer = setInterval(() => {
      if (isRtmpStreaming || isHeadlessLive) {
        setUptimeSeconds(prev => prev + 1);
      }
      sampleAudio();
    }, 1000);
    return () => {
      clearInterval(timer);
      try { srcNode?.disconnect(); } catch (_) {}
      try { ac?.close(); } catch (_) {}
    };
  }, [isRtmpStreaming, isHeadlessLive]);

  // WebRTC Native Camera Feed (720p @ 30fps for crisp HD, zero thermal spikes, and 0 computer freeze)
  const startCamera = useCallback(async (explicitRequest = false) => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          resizeMode: 'none'
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (constraintErr) {
        console.warn('[MobileLiveHostView] Ideal camera constraints failed, falling back to standard video/audio:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      // Reset hardware zoom to minimum (1.0x wide field of view) if supported by the camera
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          if (capabilities.torch) {
            setHasTorchSupport(true);
          }
          if (capabilities.zoom && typeof capabilities.zoom.min === 'number') {
            await videoTrack.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as any] });
          }
        } catch (_) {}
      }

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[MobileLiveHostView] Video play error:', playErr);
        }
      }
      setIsCameraLive(true);
      setCameraPermissionError(false);
      setConnectionStatus('LIVE');
    } catch (err: any) {
      console.warn('Native camera permission or hardware unavailable:', err);
      setIsCameraLive(false);
      setConnectionStatus('LIVE');
      if (explicitRequest) {
        setCameraPermissionError(true);
      }
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera(false);
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [startCamera]);

  // Guarantee video element srcObject is attached whenever stream or camera state updates
  useEffect(() => {
    const video = videoRef.current;
    const stream = mediaStreamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [isCameraLive]);

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

  // Broadcast Stream Provider: Burns Anti-Ban Pre-Loved Thrift Store Banner & Garment HUD onto video stream by default
  const getCompositedBroadcastStream = useCallback((): MediaStream | null => {
    const cameraStream = (videoRef.current?.srcObject as MediaStream) || mediaStreamRef.current;
    const liveVideoTrack = cameraStream?.getVideoTracks()?.[0];
    if (!antiBanHudEnabled && cameraStream && liveVideoTrack && liveVideoTrack.readyState === 'live') {
      const directStream = new MediaStream();
      directStream.addTrack(liveVideoTrack);
      const audioTrack = cameraStream.getAudioTracks()[0] || mediaStreamRef.current?.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        directStream.addTrack(audioTrack);
      } else {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const actx = new AudioCtx();
            if (actx.state === 'suspended') actx.resume().catch(() => {});
            const osc = actx.createOscillator();
            const dst = actx.createMediaStreamDestination();
            const gain = actx.createGain();
            gain.gain.value = 0.0001;
            osc.connect(gain);
            gain.connect(dst);
            osc.start();
            const silentTrack = dst.stream.getAudioTracks()[0];
            if (silentTrack) directStream.addTrack(silentTrack);
          }
        } catch (_) {}
      }
      return directStream;
    }

    const canvas = compositorCanvasRef.current || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) return cameraStream || null;

    canvas.width = 1280;
    canvas.height = 720;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return cameraStream || null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let lastDrawTime = 0;

    const paintBroadcastFrame = (_now: number) => {
      const video = videoRef.current;
      if (video && video.paused && video.srcObject) {
        video.play().catch(() => {});
      }

      const hasLiveVideo = Boolean(
        video &&
        video.srcObject &&
        video.videoWidth > 0 &&
        !video.ended
      );

      if (hasLiveVideo && video) {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;

        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, 1280, 720);

        const scale = Math.min(1280 / vw, 720 / vh);
        const dw = Math.round(vw * scale);
        const dh = Math.round(vh * scale);
        const dx = Math.round((1280 - dw) / 2);
        const dy = Math.round((720 - dh) / 2);

        ctx.save();
        if (isVideoMirrored) {
          ctx.translate(1280, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
        ctx.restore();
      } else {
        // Fallback Studio Canvas Backdrop when camera is loading or permission denied
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, 1280, 720);

        // Gold radial glow
        const grad = ctx.createRadialGradient(640, 360, 50, 640, 360, 600);
        grad.addColorStop(0, 'rgba(217, 119, 6, 0.15)');
        grad.addColorStop(1, 'rgba(10, 10, 12, 1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);

        // Header Title
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✨ VINTAGE VIBES LIVE SHOWCASE ✨', 640, 100);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px sans-serif';
        ctx.fillText('AL AIN LUXURY VINTAGE ARCHIVE • ON-AIR BROADCAST', 640, 135);
        ctx.textAlign = 'left';
      }

      // Draw Top-Left Mandatory Anti-Ban Pre-Loved Thrift Store Signboard on the video stream
      ctx.save();
      ctx.fillStyle = 'rgba(6, 78, 59, 0.96)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(22, 14, 1065, 44, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.font = '900 15px sans-serif';
      ctx.fillText('♻️ VINTAGE VIBES THRIFT STORE • 100% USED & SECOND-HAND APPAREL • NOT NEW • CN-5888545', 36, 42);
      ctx.restore();

      // Draw Top-Right Live Indicator & Booth Badge
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(1110, 20, 140, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(1130, 37, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('LIVE HOST', 1145, 42);
      ctx.restore();

      // Draw Garment Overlay Card HUD on the video if a piece is selected
      if (selectedPiece) {
        const cardX = 30;
        const cardY = 500;
        const cardW = 600;
        const cardH = 190;
        const radius = 16;

        // Card Glass Background
        ctx.save();
        ctx.fillStyle = 'rgba(10, 10, 14, 0.92)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.90)'; // Gold luxury border
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, radius);
        ctx.fill();
        ctx.stroke();

        // Draw Garment Thumbnail Photo
        const imgX = cardX + 18;
        const imgY = cardY + 18;
        const imgSize = 154;

        const garmentImg = activeGarmentImgRef.current;
        if (garmentImg && garmentImg.complete && garmentImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
          ctx.clip();
          ctx.drawImage(garmentImg, imgX, imgY, imgSize, imgSize);
          ctx.restore();

          ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
          ctx.stroke();
        } else {
          // Placeholder
          ctx.fillStyle = '#1e1e24';
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
          ctx.fill();
          ctx.fillStyle = '#a8a29e';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText('NO PHOTO', imgX + 32, imgY + 85);
        }

        // Text Info Area
        const textX = imgX + imgSize + 20;

        // Solid Gold Used / Pre-Loved Thrift Stamp
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(textX, cardY + 18, 205, 26, 5);
        ctx.fill();
        ctx.fillStyle = '#090a0f';
        ctx.font = '900 13px sans-serif';
        ctx.fillText('♻️ USED / PRE-LOVED THRIFT', textX + 8, cardY + 35);

        // SKU Code & Size
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 14px monospace';
        const sizeTag = selectedPiece.sizeScanned || (selectedPiece as any).size_scanned || (selectedPiece as any).size || 'M';
        ctx.fillText(`${selectedPiece.barcode || 'SKU'} • ${sizeTag}`, textX + 215, cardY + 36);

        // Brand & Item Name (Explicitly Pre-Loved Labelled)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        const brand = selectedPiece.brandName || (selectedPiece as any).brand_name || 'Vintage';
        const title = (selectedPiece.itemName || (selectedPiece as any).item_name || 'Exclusive Garment');
        const fullTitle = `USED: ${brand} - ${title}`.slice(0, 28);
        ctx.fillText(fullTitle, textX, cardY + 76);

        // Price in AED with THRIFT (USED) clarity
        const displayPrice = sellingPrice || selectedPiece.retailPriceAed || (selectedPiece as any).retail_price_aed || (selectedPiece as any).price || 0;
        ctx.fillStyle = '#34d399';
        ctx.font = '900 26px sans-serif';
        ctx.fillText(`THRIFT: AED ${displayPrice} (USED)`, textX, cardY + 122);

        // Subtext / Call to Action (100% Anti-Ban On-Platform Safe)
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '13px sans-serif';
        ctx.fillText(`Comment: "CLAIM ${selectedPiece.barcode}" or "MINE" • Second-Hand Item`, textX, cardY + 156);

        ctx.restore();
      }
    };

    if (compositorAnimFrameRef.current) {
      cancelAnimationFrame(compositorAnimFrameRef.current);
      compositorAnimFrameRef.current = null;
    }
    if (compositorIntervalRef.current) {
      clearInterval(compositorIntervalRef.current);
      compositorIntervalRef.current = null;
    }

    const animLoop = (now: number) => {
      if (now - lastDrawTime >= 32) {
        lastDrawTime = now;
        paintBroadcastFrame(now);
      }
      compositorAnimFrameRef.current = requestAnimationFrame(animLoop);
    };

    compositorAnimFrameRef.current = requestAnimationFrame(animLoop);

    // Resilient fallback interval: only draws directly if requestAnimationFrame is sleeping/throttled in background tab
    compositorIntervalRef.current = setInterval(() => {
      const now = performance.now();
      if (now - lastDrawTime >= 40) {
        lastDrawTime = now;
        paintBroadcastFrame(now);
      }
    }, 33);

    const canvasStream = canvas.captureStream(30);

    // Attach native camera microphone audio if available
    const audioTrack = cameraStream?.getAudioTracks()[0] || mediaStreamRef.current?.getAudioTracks()[0];
    if (audioTrack && audioTrack.readyState === 'live') {
      canvasStream.addTrack(audioTrack);
    } else {
      // Create synthetic silent audio track so FFmpeg FLV encoder has audio without warnings
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          if (actx.state === 'suspended') {
            actx.resume().catch(() => {});
          }
          const osc = actx.createOscillator();
          const dst = actx.createMediaStreamDestination();
          const gain = actx.createGain();
          gain.gain.value = 0.0001; // Silent tone
          osc.connect(gain);
          gain.connect(dst);
          osc.start();
          const silentTrack = dst.stream.getAudioTracks()[0];
          if (silentTrack) {
            canvasStream.addTrack(silentTrack);
          }
        }
      } catch (_) {}
    }

    return canvasStream;
  }, [isCameraLive, selectedPiece, sellingPrice]);

  // Calculate Derived Cost (COGS) from piece source bale gram weight
  const activePieceGrams = useMemo(() => {
    if (!selectedPiece) return 0;
    return selectedPiece.weightGrams || (selectedPiece as any).weight_grams || Math.round(((selectedPiece.weightKg ?? (selectedPiece as any).weight_kg) || 0.45) * 1000);
  }, [selectedPiece]);

  const derivedCogsCost = useMemo(() => {
    if (!selectedPiece) return 0;
    if (selectedPiece.calculatedCostPrice) return Number(selectedPiece.calculatedCostPrice);
    if (selectedPiece.costPrice) return Number(selectedPiece.costPrice);
    if ((selectedPiece as any).cost_price) return Number((selectedPiece as any).cost_price);
    const weight = selectedPiece.weightKg ?? (selectedPiece as any).weight_kg ?? 0.45;
    return Number((weight * 20).toFixed(2));
  }, [selectedPiece]);

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
    if (comment.isProcessed || (comment.id && claimingCommentIds[comment.id])) {
      return;
    }

    setBuyerHandle(comment.username);
    if (comment.extractedBid) {
      setSellingPrice(comment.extractedBid);
    }

    const explicitSku = comment.extractedSku
      ? stockPieces.find(p => String(p.barcode || '').toUpperCase() === String(comment.extractedSku).toUpperCase())
      : null;
    const targetPiece = explicitSku || selectedPiece;

    if (!targetPiece) {
      setSaleResultBanner({
        type: 'error',
        title: 'No SKU Selected',
        message: 'Please select a vintage SKU from the dock before locking.'
      });
      return;
    }

    if (comment.id) {
      setClaimingCommentIds(prev => ({ ...prev, [comment.id]: true }));
    }

    try {
      const res = await fetch('/api/live/lock-and-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: targetPiece.barcode,
          buyerHandle: comment.username,
          boothId: currentBoothId,
          offeredPrice: comment.extractedBid || sellingPrice,
          channel: (comment.platform || 'youtube').toUpperCase(),
          commentId: comment.id
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
        const lockedBarcode = targetPiece.barcode;
        const markLocked = (c: LiveStudioComment) =>
          c.id === comment.id ? { ...c, isProcessed: true, extractedSku: lockedBarcode } : c;

        setComments(prev => prev.map(markLocked));
        setLockedClaimComments(prev => prev.map(markLocked));
        setRecentCommentToast(prev => (prev && prev.id === comment.id ? markLocked(prev) : prev));
        setSessionLogs(prev =>
          prev.map((log: any) => ({
            ...log,
            claimedMessages: Array.isArray(log.claimedMessages) ? log.claimedMessages.map(markLocked) : log.claimedMessages,
            claimedItems: Array.isArray(log.claimedItems) ? log.claimedItems.map(markLocked) : log.claimedItems
          }))
        );

        // Advance to next available piece so host doesn't double-lock the same piece
        const remaining = stockPieces.filter(p => p.barcode !== lockedBarcode);
        setStockPieces(remaining);
        if (remaining.length > 0) {
          setSelectedPiece(remaining[0]);
          const nextPrice =
            remaining[0].retailPriceAed ||
            (remaining[0] as any).retail_price_aed ||
            remaining[0].lockedPrice ||
            remaining[0].estimatedPrice ||
            remaining[0].costPrice ||
            0;
          lastSyncedBarcodeRef.current = remaining[0].barcode;
          setSellingPrice(nextPrice);
        } else {
          setSelectedPiece(null);
        }

        setSaleResultBanner({
          type: 'success',
          title: 'Atomic SKU Lock & Draft Created',
          message: `Locked ${lockedBarcode} across all 10 booths for ${comment.username}! Draft Invoice: ${data.draftInvoice?.invoiceNo}`,
          invoiceNo: data.draftInvoice?.invoiceNo
        });
        notifyMutation('SALES', 'LIVE_CLAIM', 'CREATE', lockedBarcode);
        loadBoothData();
      }
    } catch (e) {
      setSaleResultBanner({
        type: 'error',
        title: 'Network Error',
        message: 'Could not communicate with live server.'
      });
    } finally {
      if (comment.id) {
        setClaimingCommentIds(prev => {
          const next = { ...prev };
          delete next[comment.id];
          return next;
        });
      }
    }
  };

  // Fast Manual Lock & Draft from Bottom Control Strip
  const handleManualLockDraft = async () => {
    if (!selectedPiece) {
      setSaleResultBanner({
        type: 'error',
        title: 'Select a SKU',
        message: 'Scan or select an item SKU before claiming.'
      });
      return;
    }

    if (!buyerHandle.trim()) {
      setSaleResultBanner({
        type: 'error',
        title: 'Buyer Handle Required',
        message: 'Please provide the buyer username (@handle) to reserve this piece.'
      });
      return;
    }

    setIsProcessingLock(true);

    try {
      const res = await fetch('/api/live/lock-and-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: selectedPiece.barcode,
          buyerHandle: buyerHandle.trim(),
          buyerPhone,
          boothId: currentBoothId,
          offeredPrice: Number(sellingPrice),
          channel: 'LIVE_CLAIM'
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
          title: 'GARMENT RESERVED & DRAFT CREATED!',
          message: `Locked ${selectedPiece.barcode} for ${buyerHandle.trim()}. Draft Invoice: ${data.draftInvoice?.invoiceNo}`,
          invoiceNo: data.draftInvoice?.invoiceNo,
          details: `Piece is now RESERVED. Visible under Live Draft Invoices.`
        });

        // Advance to next piece if available
        const remaining = stockPieces.filter(p => p.barcode !== selectedPiece.barcode);
        setStockPieces(remaining);
        if (remaining.length > 0) {
          setSelectedPiece(remaining[0]);
          setSellingPrice(remaining[0].retailPriceAed || (remaining[0] as any).retail_price_aed || remaining[0].lockedPrice || remaining[0].estimatedPrice || remaining[0].costPrice || 0);
        } else {
          setSelectedPiece(null);
        }

        setBuyerHandle('');
        notifyMutation('SALES', 'LIVE_CLAIM', 'CREATE', selectedPiece.barcode);
        loadBoothData();
      }
    } catch (e) {
      setSaleResultBanner({
        type: 'error',
        title: 'Network Error',
        message: 'Could not communicate with live server.'
      });
    } finally {
      setIsProcessingLock(false);
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
          title: data.invoice?.status === 'POSTED' ? 'SOLD & POSTED TO GENERAL LEDGER!' : 'GARMENT RESERVED & QUEUED IN LIVE DRAFTS!',
          message: data.invoice?.status === 'POSTED'
            ? `Invoice ${data.invoice?.invoiceNo} posted for ${buyerHandle}. Concurrency lock preserved.`
            : `Draft Invoice ${data.invoice?.invoiceNo || data.draftInvoice?.invoiceNo} queued for @${buyerHandle.trim()} in Live Drafts!`,
          invoiceNo: data.invoice?.invoiceNo || data.draftInvoice?.invoiceNo,
          voucherNo: data.voucher?.voucherNo,
          details: data.invoice?.status === 'POSTED'
            ? `Debit AR: AED ${data.accountingEntry?.arDebit} | Credit Revenue: AED ${data.accountingEntry?.salesCredit} | Debit COGS: AED ${data.accountingEntry?.cogsDebit} | Credit Inventory: AED ${data.accountingEntry?.inventoryCredit}`
            : 'Piece is RESERVED. Open Live Drafts & Dispatch Hub to select courier partner, enter tracking, and dispatch.'
        });

        // Advance to next piece if available
        const remaining = stockPieces.filter(p => p.barcode !== selectedPiece.barcode);
        setStockPieces(remaining);
        if (remaining.length > 0) {
          setSelectedPiece(remaining[0]);
          setSellingPrice(remaining[0].retailPriceAed || (remaining[0] as any).retail_price_aed || remaining[0].lockedPrice || remaining[0].estimatedPrice || remaining[0].costPrice || 0);
        } else {
          setSelectedPiece(null);
        }

        setBuyerHandle('');
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

  // Headless & RTMP Stream Broadcast Toggle across all platforms
  const handleToggleHeadlessBroadcast = async () => {
    setIsTogglingHeadless(true);
    const timeout = setTimeout(() => {
      setIsTogglingHeadless(false);
    }, 12000);
    try {
      if (isHeadlessLive || isRtmpStreaming) {
        if (compositorAnimFrameRef.current) {
          cancelAnimationFrame(compositorAnimFrameRef.current);
          compositorAnimFrameRef.current = null;
        }
        if (compositorIntervalRef.current) {
          clearInterval(compositorIntervalRef.current);
          compositorIntervalRef.current = null;
        }
        stopRtmpStream();
        await LiveStreamService.stopHeadlessStream(currentBoothId);
        setIsHeadlessLive(false);
        setComments([]);
        lastSeenCommentIdRef.current = '';
        triggerCommentToast(null);
        setUptimeSeconds(0);
        fetch(`/api/live/booths/${currentBoothId}/comments/clear`, { method: 'POST' }).catch(() => {});
        handleDisconnectYouTubeChat();
        setSaleResultBanner({
          type: 'info',
          title: 'BROADCAST STOPPED',
          message: 'Camera stream disconnected and previous session chat cleared.'
        });
      } else {
        setComments([]);
        lastSeenCommentIdRef.current = '';
        triggerCommentToast(null);
        setUptimeSeconds(0);
        fetch(`/api/live/booths/${currentBoothId}/comments/clear`, { method: 'POST' }).catch(() => {});
        const rawCamStream = (videoRef.current?.srcObject as MediaStream) || mediaStreamRef.current || null;
        await startRtmpStream(rawCamStream);
        await LiveStreamService.startHeadlessStream(currentBoothId, {
          streamFeedUrl: `rtmp://a.rtmp.youtube.com/live2`
        });
        setIsHeadlessLive(true);
        // Automatically sync YouTube Live Chat so incoming viewer comments appear and auto-claim instantly
        setTimeout(() => {
          handleConnectYouTubeChat();
        }, 4000);
      }
      const updated = await LiveStreamService.getBoothSocialChannels(currentBoothId);
      setSocialChannels(updated);
    } catch (e: any) {
      console.warn('Toggle headless error:', e);
      setSaleResultBanner({
        type: 'error',
        title: 'Broadcast Error',
        message: e?.message || 'Could not connect to YouTube stream relay.'
      });
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

  // Post Comment (Optimistic Instant UI + Backend Broadcast + YouTube Stream HUD + NLP Claim Check)
  const handlePostComment = async () => {
    const text = manualCommentInput.trim();
    if (!text) return;

    const optId = `c-user-${Date.now()}`;
    let senderUser = '@VintageVibesHost';
    if (!isHostReplyMode) {
      const rawBuyer = manualCommentUser.trim() || buyerHandle.trim();
      if (!rawBuyer || /VintageVibesHost|Vintage Vibes Host/i.test(rawBuyer)) {
        setSaleResultBanner({
          type: 'error',
          title: 'Buyer Handle Required',
          message: 'Please enter the Buyer @username first.'
        });
        return;
      }
      senderUser = rawBuyer.startsWith('@') ? rawBuyer : `@${rawBuyer}`;
    }

    const isClaim = !isHostReplyMode && isGenuineClaimComment(text, senderUser);
    const claimMatch = isClaim ? text.match(/\b(?:claim|mine)\b(?:\s*#?([A-Za-z0-9\-]+))?/i) : null;

    const newComment: LiveStudioComment = {
      id: optId,
      boothId: currentBoothId,
      platform: isHostReplyMode ? 'youtube' : manualCommentPlatform,
      username: senderUser,
      comment: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isClaimIntent: isClaim,
      extractedSku: claimMatch && claimMatch[1] && /\d/.test(claimMatch[1]) ? claimMatch[1].toUpperCase() : selectedPiece?.barcode,
      isProcessed: false
    };

    // 1. Immediately show in UI list & on-screen toast!
    lastSeenCommentIdRef.current = newComment.id;
    setComments(prev => [newComment, ...prev]);
    if (isClaim) {
      setLockedClaimComments(prev => [newComment, ...prev]);
      playSaleChime();
    }
    setManualCommentInput('');
    triggerCommentToast(newComment);

    try {
      const res = await fetch(`/api/live/booths/${currentBoothId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: text,
          platform: isHostReplyMode ? 'youtube' : manualCommentPlatform,
          username: senderUser,
          isHostReply: isHostReplyMode
        })
      });
      if (res.ok) {
        const saved = await res.json();
        lastSeenCommentIdRef.current = saved.id;
        setComments(prev => [saved, ...prev.filter(x => x.id !== optId && x.id !== saved.id)]);
        if (isClaim) {
          setLockedClaimComments(prev => [saved, ...prev.filter(x => x.id !== optId && x.id !== saved.id)]);
          loadBoothData();
        }
        if (isHostReplyMode && saved.multicastBroadcast) {
          const mb = saved.multicastBroadcast;
          const delivered = Array.isArray(mb.deliveredPlatforms) ? mb.deliveredPlatforms : [];
          const fbNote = mb.platformResults?.facebook?.note;
          const ytNote = mb.platformResults?.youtube?.note;
          if (delivered.length > 0) {
            const notes = [!delivered.includes('YOUTUBE') ? ytNote : '', !delivered.includes('FACEBOOK') ? fbNote : '']
              .filter(Boolean)
              .join(' | ');
            setSaleResultBanner({
              type: 'success',
              title: `✅ Comment Posted (${delivered.join(' + ')})`,
              message: `"${text}" seedha ${delivered.join(' + ')} Live Comments mein post ho gaya!`,
              details: notes || undefined,
              youtubeAuthRequired: Boolean(mb.youtubeNeedsOAuth)
            });
          } else {
            const reasons = [ytNote, fbNote].filter(Boolean).join(' | ');
            setSaleResultBanner({
              type: 'error',
              title: '⚠️ Comment External Chats Par Send Nahi Hua',
              message: mb.youtubeNeedsOAuth
                ? 'YouTube Chat mein comment bhejne ke liye neechay "🔑 Connect Google for YouTube Comments" par ek dafa click karein.'
                : 'Kisi connected platform par comment post nahi ho saka.',
              details: reasons || undefined,
              youtubeAuthRequired: Boolean(mb.youtubeNeedsOAuth)
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to send comment:', e);
    }
  };

  // Poll YouTube Live Chat status
  const checkYouTubeChatStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/booths/${currentBoothId}/youtube-chat/status`);
      if (res.ok) {
        const data = await res.json();
        setIsYtChatConnected(Boolean(data.isConnected));
        if (typeof data.canSendChat === 'boolean') {
          setCanSendYtChat(data.canSendChat);
        }
      }
    } catch (_) {}
  }, [currentBoothId]);

  useEffect(() => {
    checkYouTubeChatStatus();
  }, [checkYouTubeChatStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOAuthMsg = (e: MessageEvent) => {
      if (e.data?.type === 'VV_YOUTUBE_OAUTH_SUCCESS') {
        setCanSendYtChat(true);
        setSaleResultBanner({
          type: 'success',
          title: '✅ YouTube Live Chat Authorized!',
          message: e.data?.channelTitle
            ? `Connected channel "${e.data.channelTitle}". Ab aap ke Host broadcast messages direct YouTube Live Chat mein bhi jayenge!`
            : 'Ab aap ke Host broadcast messages direct YouTube Live Chat mein bhi jayenge!'
        });
      }
    };
    window.addEventListener('message', onOAuthMsg);
    return () => window.removeEventListener('message', onOAuthMsg);
  }, []);

  const handleConnectYouTubeChat = async (overrideTarget?: string) => {
    const target = (overrideTarget || ytLiveInput || '').trim();
    if (!target) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vv_last_yt_live_url', target);
    }
    setIsConnectingYtChat(true);
    try {
      const res = await fetch(`/api/live/booths/${currentBoothId}/youtube-chat/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrId: target })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsYtChatConnected(true);
        setActiveChatTab('LIVE');
        setSaleResultBanner({
          type: 'success',
          title: 'YouTube Live Chat Connected! 🔴',
          message: 'All live comments and claims from YouTube viewers will now sync directly into the software with auto-booking!'
        });
      } else {
        setSaleResultBanner({
          type: 'error',
          title: 'YouTube Chat Connection Error',
          message: data.error || 'Could not connect to YouTube live chat. Ensure the video link is active.'
        });
      }
    } catch (e: any) {
      setSaleResultBanner({
        type: 'error',
        title: 'Connection Error',
        message: e?.message || 'Failed to communicate with YouTube chat listener.'
      });
    } finally {
      setIsConnectingYtChat(false);
    }
  };

  const handleDisconnectYouTubeChat = async () => {
    try {
      const res = await fetch(`/api/live/booths/${currentBoothId}/youtube-chat/disconnect`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setIsYtChatConnected(false);
      setComments([]);
      lastSeenCommentIdRef.current = '';
      triggerCommentToast(null);
      if (Array.isArray(data.lockedClaimComments)) {
        setLockedClaimComments(data.lockedClaimComments);
        if (data.lockedClaimComments.length > 0) {
          setActiveChatTab('CLAIMS');
        }
      }
      if (Array.isArray(data.sessionLogs)) {
        setSessionLogs(data.sessionLogs);
      }
      setSaleResultBanner({
        type: 'success',
        title: 'YouTube Chat Disconnected & Session Archived',
        message: 'Main chat history cleared. Only CLAIM / MINE messages are preserved in Locked Claims & Stream Video Log.'
      });
    } catch (_) {}
  };

  // Helper for platform badge visual styling
  const getPlatformBadge = (platform: string, badge?: string) => {
    if (badge === 'ALL LIVE') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-gradient-to-r from-red-600 via-amber-500 to-blue-600 text-white border border-amber-300/60 shadow-xs">
          🌐 ALL LIVE
        </span>
      );
    }
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

  const activePieceIdx = selectedPiece
    ? stockPieces.findIndex(p => p.barcode === selectedPiece.barcode)
    : -1;

  const isAnyStreamActive =
    isHeadlessLive ||
    isRtmpStreaming ||
    Boolean(booth?.isBroadcasting) ||
    socialChannels.some(c => c.stream_status === 'LIVE');

  const handleVisionInputCommit = (rawVal: string) => {
    setVisionScannerInput(rawVal);
    const q = rawVal.trim().toUpperCase();
    if (q.length < 4) return;
    const exactOrSuffix = stockPieces.find(p => {
      const b = String(p.barcode || '').toUpperCase();
      return b === q || (q.length === 4 && /^\d{4}$/.test(q) && b.endsWith(`-${q}`));
    });
    if (exactOrSuffix) {
      selectPieceFromVisionOrScan(exactOrSuffix, '🔍 Barcode Matched');
      setVisionScannerInput('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10005] w-full h-[100dvh] text-white font-sans overflow-hidden select-none flex flex-col lg:flex-row lg:items-stretch lg:justify-between lg:p-4 xl:p-5 lg:gap-4"
      style={{
        background: 'radial-gradient(circle at center, #101624 0%, #04060b 100%)',
        perspective: '1300px'
      }}
    >
      {/* Off-screen Attached Compositor Canvas: Burns Pre-Loved Thrift Banner + Active Garment Card onto Live Stream for ALL Viewers */}
      <canvas
        ref={compositorCanvasRef}
        width={1280}
        height={720}
        className="fixed -left-[9999px] -top-[9999px] pointer-events-none opacity-0"
        style={{ width: '1px', height: '1px' }}
      />

      {/* ================= FLOATING TOASTS (COMMENT & SALE CONFIRMATION) ================= */}
      {(recentCommentToast || saleResultBanner) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10020] w-[92vw] max-w-xl space-y-1.5 pointer-events-auto">
          {recentCommentToast && (
            <div className="p-2.5 rounded-2xl backdrop-blur-xl border border-amber-400/80 bg-slate-950/95 text-white shadow-2xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {getPlatformBadge(recentCommentToast.platform, recentCommentToast.badge)}
                <span className="font-bold text-amber-300 truncate">{recentCommentToast.username}:</span>
                <span className="text-slate-100 truncate">{recentCommentToast.comment}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {Boolean(recentCommentToast.isClaimIntent) &&
                  isGenuineClaimComment(recentCommentToast.comment, recentCommentToast.username) && (
                    <button
                      type="button"
                      disabled={Boolean(recentCommentToast.isProcessed) || Boolean(recentCommentToast.id && claimingCommentIds[recentCommentToast.id])}
                      onClick={() => handleInlineClaim(recentCommentToast)}
                      className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] uppercase cursor-pointer"
                    >
                      {recentCommentToast.isProcessed ? '✓ Claimed' : '⚡ Lock'}
                    </button>
                  )}
                <button onClick={() => setRecentCommentToast(null)} className="p-0.5 text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {saleResultBanner && (
            <div
              className={`p-2.5 rounded-2xl backdrop-blur-xl border shadow-2xl text-xs ${
                saleResultBanner.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-400/60 text-emerald-100'
                  : 'bg-red-950/95 border-red-400/60 text-red-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {saleResultBanner.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-black uppercase text-white">{saleResultBanner.title}:</span>
                  <span className="opacity-95">{saleResultBanner.message}</span>
                  {saleResultBanner.youtubeAuthRequired && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `/auth/v1/authorize?youtube_chat=1&boothId=${encodeURIComponent(currentBoothId)}`,
                          'vv_yt_oauth',
                          'width=520,height=680'
                        )
                      }
                      className="px-2.5 py-0.5 bg-amber-400 text-slate-950 rounded font-black text-[10px] uppercase cursor-pointer"
                    >
                      🔑 Connect Google YT
                    </button>
                  )}
                  {activeWhatsAppPayload && saleResultBanner.type === 'success' && (
                    <button
                      onClick={() => setShowWhatsAppModal(true)}
                      className="px-2.5 py-0.5 bg-emerald-400 text-slate-950 font-black text-[10px] rounded uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3 fill-slate-950" />
                      WhatsApp Invoice
                    </button>
                  )}
                  {onNavigateToDrafts && saleResultBanner.type === 'success' && (
                    <button
                      onClick={onNavigateToDrafts}
                      className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/50 text-amber-300 rounded font-bold text-[10px] uppercase cursor-pointer"
                    >
                      Open Drafts
                    </button>
                  )}
                </div>
                <button onClick={() => setSaleResultBanner(null)} className="p-0.5 text-white/70 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================================= */}
      {/* 1. LEFT 3D CURVED COCKPIT WING: UNIFIED LIVE CHAT + 2H POST-LIVE AUTO-CLEAR      */}
      {/* ================================================================================= */}
      <aside
        className={`order-2 lg:order-1 w-full lg:w-[330px] xl:w-[355px] shrink-0 flex flex-col justify-between bg-gradient-to-b from-[#101828]/95 to-[#080c16]/95 backdrop-blur-2xl border border-sky-400/40 lg:rounded-[26px] shadow-[0_25px_60px_rgba(0,0,0,0.75),0_0_25px_rgba(56,189,248,0.12)] overflow-hidden transition-all duration-300 xl:[transform:rotateY(11deg)_translateZ(6px)] ${
          isChatExpanded ? 'max-h-[34vh] lg:max-h-none lg:h-full' : 'max-h-[52px] lg:max-h-none lg:h-full'
        }`}
      >
        {/* Left Wing Header */}
        <div className="px-3.5 py-2.5 border-b border-sky-400/25 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-xs tracking-wider uppercase text-sky-300 flex items-center gap-1.5">
              <span>◀ LEFT WING // LIVE CHAT</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/40 text-sky-200 font-bold text-[9.5px]"
                title="Old chat cleared; stays active for 2 hours after Live turns OFF then auto-clears"
              >
                ⏱️ 2h Auto-Clear
              </span>
              <button
                onClick={() => setIsChatExpanded(prev => !prev)}
                className="lg:hidden text-slate-300 hover:text-white p-0.5 cursor-pointer"
              >
                {isChatExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveChatTab('LIVE')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer transition ${
                  activeChatTab === 'LIVE'
                    ? 'bg-sky-400 text-slate-950 font-black'
                    : 'bg-white/5 text-slate-300 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span>Live ({comments.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveChatTab('CLAIMS')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer transition ${
                  activeChatTab === 'CLAIMS'
                    ? 'bg-amber-400 text-slate-950 font-black'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                <Lock className="w-3 h-3" />
                <span>Claims ({lockedClaimComments.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveChatTab('LOGS')}
                className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer transition ${
                  activeChatTab === 'LOGS'
                    ? 'bg-purple-500 text-white font-black'
                    : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                }`}
              >
                🎬 ({sessionLogs.length})
              </button>
            </div>

            {(comments.length > 0 || lockedClaimComments.length > 0) && (
              <button
                type="button"
                onClick={async () => {
                  setComments([]);
                  setLockedClaimComments([]);
                  lastSeenCommentIdRef.current = '';
                  triggerCommentToast(null);
                  try {
                    await fetch(`/api/live/booths/${currentBoothId}/comments/clear`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clearLocked: true })
                    });
                  } catch (_) {}
                }}
                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-[9.5px] cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* YouTube Chat Sync Strip */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 border-b border-white/10 text-[10px] shrink-0">
          <Radio className={`w-3.5 h-3.5 shrink-0 ${isYtChatConnected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`} />
          <input
            type="text"
            placeholder="@VintageVibesLLCSPC or YT Live URL"
            value={ytLiveInput}
            onChange={e => setYtLiveInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConnectYouTubeChat();
              }
            }}
            className="flex-1 min-w-0 px-2 py-1 bg-slate-950/90 border border-white/15 rounded-lg text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
          />
          {!canSendYtChat && (
            <button
              type="button"
              onClick={() =>
                window.open(
                  `/auth/v1/authorize?youtube_chat=1&boothId=${encodeURIComponent(currentBoothId)}`,
                  'vv_yt_oauth',
                  'width=520,height=680'
                )
              }
              className="px-2 py-1 bg-amber-400 text-slate-950 font-black text-[9px] rounded-md cursor-pointer shrink-0"
            >
              OAuth
            </button>
          )}
          {isYtChatConnected ? (
            <button
              type="button"
              onClick={handleDisconnectYouTubeChat}
              className="px-2 py-1 bg-red-600 text-white font-bold text-[9px] rounded-md cursor-pointer shrink-0"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleConnectYouTubeChat()}
              disabled={isConnectingYtChat || !ytLiveInput.trim()}
              className="px-2.5 py-1 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-slate-950 font-black text-[9.5px] rounded-md cursor-pointer shrink-0"
            >
              {isConnectingYtChat ? '...' : 'Sync'}
            </button>
          )}
        </div>

        {/* Scrollable Chat / Claims / Logs Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-white/15">
          {activeChatTab === 'LOGS' ? (
            sessionLogs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10 italic">No completed stream logs yet.</p>
            ) : (
              sessionLogs.slice(0, 15).map((log: any) => {
                const durSecs = Number(log.durationSeconds ?? log.durationSec ?? 0);
                const msgCnt = Number(log.totalMessagesCount ?? log.totalComments ?? 0);
                const clmCnt = Number(log.claimsCount ?? log.totalClaims ?? 0);
                return (
                  <div key={log.id} className="p-2.5 rounded-xl bg-slate-900/90 border border-purple-500/35 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-purple-300">🎬 Session Log</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {Math.max(1, Math.round(durSecs / 60))}m • {msgCnt} msgs • {clmCnt} claims
                      </span>
                    </div>
                    {log.videoUrl && (
                      <a href={log.videoUrl} target="_blank" rel="noreferrer" className="inline-block text-[10px] text-amber-300 underline font-mono truncate max-w-full">
                        🔗 {log.videoUrl}
                      </a>
                    )}
                  </div>
                );
              })
            )
          ) : activeChatTab === 'CLAIMS' ? (
            lockedClaimComments.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10 italic">No CLAIM or MINE messages locked yet.</p>
            ) : (
              lockedClaimComments.slice(0, 30).map(c => {
                const isClaimed = Boolean(c.isProcessed);
                const isBusy = Boolean(c.id && claimingCommentIds[c.id]);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border bg-amber-500/15 border-amber-400/60 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {getPlatformBadge(c.platform)}
                        <button
                          type="button"
                          onClick={() => setBuyerHandle(c.username)}
                          className="font-bold text-amber-300 text-xs truncate hover:underline cursor-pointer"
                        >
                          {c.username}
                        </button>
                      </div>
                      <p className="text-white font-bold mt-0.5 break-words">{renderCommentTextWithLinks(c.comment)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isClaimed || isBusy}
                      onClick={() => handleInlineClaim(c)}
                      className={`shrink-0 px-3 py-1.5 font-black text-[10.5px] rounded-xl uppercase cursor-pointer ${
                        isClaimed
                          ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 opacity-70 cursor-not-allowed'
                          : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                      }`}
                    >
                      {isClaimed ? '✓ Locked' : isBusy ? '...' : 'LOCK'}
                    </button>
                  </div>
                );
              })
            )
          ) : comments.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-12 space-y-2">
              <MessageSquare className="w-6 h-6 text-sky-400/50 mx-auto" />
              <p className="font-medium text-slate-300">Live Chat Ready</p>
              <p className="text-[11px] text-slate-500">
                YT • FB • TT • IG messages appear here. Auto-clears 2 hours after Live ends.
              </p>
            </div>
          ) : (
            (comments || []).slice(0, 35).map(c => {
              const isClaim = Boolean(c.isClaimIntent) && isGenuineClaimComment(c.comment, c.username);
              const isClaimed = Boolean(c.isProcessed);
              const isBusy = Boolean(c.id && claimingCommentIds[c.id]);
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl border text-xs transition-all ${
                    isClaim
                      ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.15)]'
                      : 'bg-white/[0.05] border-white/10'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getPlatformBadge(c.platform, c.badge)}
                      <button
                        type="button"
                        onClick={() => setBuyerHandle(c.username)}
                        className="font-bold text-sky-300 text-xs truncate hover:underline cursor-pointer"
                        title="Tap to fill Buyer Handle"
                      >
                        {c.username}
                      </button>
                      {isClaim && (
                        <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black bg-amber-400 text-slate-950 uppercase">
                          CLAIM
                        </span>
                      )}
                      <span className="text-[9.5px] text-slate-500 ml-auto font-mono">{c.timestamp}</span>
                    </div>
                    <p className="text-slate-100 text-xs mt-1 break-words font-semibold">
                      {renderCommentTextWithLinks(c.comment)}
                    </p>
                  </div>

                  {isClaim && (
                    <button
                      type="button"
                      disabled={isClaimed || isBusy}
                      onClick={() => handleInlineClaim(c)}
                      className={`shrink-0 px-3 py-1.5 font-black text-[10.5px] rounded-xl uppercase cursor-pointer ${
                        isClaimed
                          ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 opacity-70 cursor-not-allowed'
                          : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow'
                      }`}
                    >
                      {isClaimed ? '✓ Locked' : isBusy ? '...' : 'LOCK'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Left Wing Reply Dock */}
        <div className="p-3 border-t border-white/10 bg-black/40 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between gap-1 text-[9.5px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsHostReplyMode(true);
                  setManualCommentPlatform('youtube');
                  setManualCommentUser('@VintageVibesHost');
                }}
                className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                  isHostReplyMode ? 'bg-sky-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                }`}
              >
                📢 Reply All Chats
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsHostReplyMode(false);
                  setManualCommentUser(buyerHandle.trim() || '');
                }}
                className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                  !isHostReplyMode ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                }`}
              >
                🛒 Manual Claim
              </button>
            </div>
            {!isHostReplyMode && (
              <input
                type="text"
                value={manualCommentUser}
                onChange={e => setManualCommentUser(e.target.value)}
                placeholder="@buyer"
                className="w-24 px-2 py-0.5 bg-slate-900 border border-white/20 rounded text-[9.5px] text-white"
              />
            )}
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              handlePostComment();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={manualCommentInput}
              onChange={e => setManualCommentInput(e.target.value)}
              placeholder={isHostReplyMode ? 'Reply all...' : 'Type MINE or CLAIM...'}
              className="flex-1 px-3 py-2 bg-[#060911] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={!manualCommentInput.trim()}
              className="px-4 py-2 disabled:opacity-40 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs uppercase cursor-pointer shrink-0"
            >
              SEND
            </button>
          </form>
        </div>
      </aside>

      {/* ================================================================================= */}
      {/* 2. CENTER CAMERA STUDIO PORTAL + PUBLIC THRIFT BANNER + ON-SCREEN GARMENT CARD   */}
      {/* ================================================================================= */}
      <main className="order-1 lg:order-2 flex-1 min-h-0 relative lg:rounded-[30px] overflow-hidden border-b lg:border-2 border-white/20 bg-slate-950 shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col justify-between">
        {/* Live Hardware Camera Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          onLoadedMetadata={() => {
            if (videoRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }}
          style={{ transform: isVideoMirrored ? 'scaleX(-1)' : 'none' }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isCameraLive ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Camera Standby / Permission Prompt (Clean, Zero Scary Top Error Banner) */}
        {!isCameraLive && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-[radial-gradient(circle_at_center,#172033_0%,#060911_100%)]">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/15 border border-amber-400/45 flex items-center justify-center mb-3 shadow-lg">
              <Camera className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              {cameraPermissionError ? 'Camera Permission Required' : 'Live Studio Camera Ready'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {cameraPermissionError
                ? 'Allow browser camera access in the address bar, then tap Activate Camera below.'
                : 'Tap Activate Camera to start your HD studio camera & optical barcode recognizer.'}
            </p>
            <button
              type="button"
              onClick={() => startCamera(true)}
              className="mt-4 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl cursor-pointer flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>🎥 Activate Studio Camera</span>
            </button>
          </div>
        )}

        {/* TOP STACK INSIDE CAMERA SCREEN: (A) MANDATORY PUBLIC THRIFT BANNER + (B) STUDIO UTILITY CONTROLS */}
        <div className="relative z-20 p-2.5 sm:p-3 space-y-2 pointer-events-auto">
          {/* (A) MANDATORY ON-SCREEN PRE-LOVED THRIFT STORE BANNER (Visible on Screen & Burned onto Outgoing Video Stream!) */}
          <div className="w-full px-3 py-2 rounded-2xl bg-gradient-to-r from-emerald-950/95 via-emerald-900/95 to-emerald-950/95 backdrop-blur-md border-2 border-amber-400 shadow-[0_8px_28px_rgba(0,0,0,0.65)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wide shrink-0">
                ♻️ USED / PRE-LOVED THRIFT STORE
              </span>
              <span className="text-[11px] sm:text-xs font-extrabold text-amber-100 tracking-wide truncate">
                100% SECOND-HAND APPAREL • NOT NEW RETAIL • UAE DED: CN-5888545
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAntiBanHudEnabled(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-black shrink-0 border cursor-pointer transition-all ${
                antiBanHudEnabled
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-white/20 text-slate-400'
              }`}
              title="Burns Thrift Banner & Active Garment Card directly onto outgoing YouTube/FB/TikTok video stream"
            >
              {antiBanHudEnabled ? '🛡️ Stream HUD: ON' : '🛡️ Stream HUD: OFF'}
            </button>
          </div>

          {/* (B) Compact Camera Utility Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {onExitToERP && (
                <button
                  onClick={onExitToERP}
                  className="px-2.5 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-slate-200 hover:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>ERP</span>
                </button>
              )}

              <div className="relative">
                <select
                  value={currentBoothId}
                  onChange={e => {
                    const newId = e.target.value;
                    setCurrentBoothId(newId);
                    window.history.replaceState({}, '', `/live-host/${newId}`);
                  }}
                  className="appearance-none pl-3 pr-7 py-1.5 bg-black/75 backdrop-blur-md border border-amber-400/45 rounded-xl text-amber-300 font-black text-[11px] uppercase cursor-pointer focus:outline-none"
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
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 pointer-events-none text-amber-400" />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {hasTorchSupport && (
                <button
                  onClick={handleToggleTorch}
                  className={`p-1.5 rounded-xl backdrop-blur-md border cursor-pointer ${
                    isTorchOn ? 'bg-amber-400 text-slate-950 border-amber-300' : 'bg-black/70 text-slate-200 border-white/15'
                  }`}
                  title="Flashlight"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsVideoMirrored(prev => !prev)}
                className={`px-2.5 py-1.5 rounded-xl backdrop-blur-md border text-[10.5px] font-bold cursor-pointer ${
                  isVideoMirrored ? 'bg-amber-400/20 text-amber-300 border-amber-400/50' : 'bg-black/70 text-slate-200 border-white/15'
                }`}
              >
                ⇄ Mirror
              </button>
              <button
                onClick={handleFlipCamera}
                className="p-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white cursor-pointer"
                title="Flip Rear / Front Camera"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowChannelModal(true)}
                className="px-2.5 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-amber-400/45 text-amber-300 font-black text-[10.5px] flex items-center gap-1.5 cursor-pointer"
              >
                <Radio className={`w-3.5 h-3.5 ${isAnyStreamActive ? 'text-emerald-400 animate-ping' : 'text-amber-400'}`} />
                <span>Channels ({socialChannels.filter(c => c.auth_status === 'LOGGED_IN').length})</span>
              </button>
            </div>
          </div>

          {/* Vision Auto-Match Flash Confirmation */}
          {visionMatchBanner && (
            <div className="mx-auto w-fit px-3.5 py-1 rounded-full bg-emerald-500/25 backdrop-blur-md border border-emerald-400 text-emerald-200 font-mono font-black text-xs shadow-lg">
              ✓ {visionMatchBanner}
            </div>
          )}
        </div>

        {/* BOTTOM OF CAMERA PORTAL: ON-SCREEN ACTIVE GARMENT SHOWCASE CARD (Visible to Host & Burned onto Stream for ALL Viewers!) */}
        <div className="relative z-20 p-3 pointer-events-auto">
          {selectedPiece ? (
            <div
              data-live-hud-card="true"
              data-hud-barcode={selectedPiece.barcode || ''}
              data-hud-angle={activePhotoTab}
              data-hud-price={String(sellingPrice || selectedPiece.retailPriceAed || (selectedPiece as any).retail_price_aed || 0)}
              data-hud-title={`${selectedPiece.brandName || (selectedPiece as any).brand_name || 'Vintage'} - ${selectedPiece.itemName || (selectedPiece as any).item_name || 'Garment'}`}
              data-hud-size={selectedPiece.sizeScanned || (selectedPiece as any).size_scanned || 'M'}
              data-hud-front={selectedPiece.frontImageUrl || (selectedPiece as any).front_image_url || ''}
              data-hud-back={selectedPiece.backImageUrl || (selectedPiece as any).back_image_url || ''}
              data-hud-tag={selectedPiece.tagImageUrl || (selectedPiece as any).tag_image_url || ''}
              data-hud-sold-out="false"
              className="w-full bg-[#060911]/92 backdrop-blur-2xl border-2 border-amber-400/80 rounded-2xl p-2.5 sm:p-3 shadow-[0_16px_45px_rgba(0,0,0,0.85)] flex items-center gap-3"
            >
              {/* Garment Photo Thumbnail (Tap to Enlarge) */}
              <div
                onClick={() => setShowPhotoLightbox(true)}
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-black border-2 border-amber-400/60 shrink-0 cursor-pointer group"
                title="Tap to enlarge garment photo"
              >
                {currentSelectedPhotoUrl ? (
                  <img
                    src={currentSelectedPhotoUrl}
                    alt={selectedPiece.itemName}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                )}
                <span className="absolute top-1 right-1 px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black text-[9.5px]">
                  {selectedPiece.sizeScanned || (selectedPiece as any).size_scanned || 'M'}
                </span>
              </div>

              {/* Garment Details & Angle Switcher */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
                    ♻️ USED / PRE-LOVED THRIFT
                  </span>
                  <span className="font-mono font-black text-amber-300 text-xs">
                    {selectedPiece.barcode}
                  </span>
                  {((selectedPiece as any).pit_to_pit_inches || (selectedPiece as any).pitToPitInches) && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold">
                      P2P {(selectedPiece as any).pit_to_pit_inches || (selectedPiece as any).pitToPitInches}&quot; × L {(selectedPiece as any).length_inches || (selectedPiece as any).lengthInches || '-'}&quot;
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-sm sm:text-base text-white truncate">
                    {selectedPiece.brandName || (selectedPiece as any).brand_name || 'Vintage'} • {selectedPiece.itemName || (selectedPiece as any).item_name || 'Garment'}
                  </p>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-mono font-black text-sm sm:text-base shrink-0">
                    AED {sellingPrice}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                  {/* Angle Tabs + Prev/Next */}
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        if (!stockPieces.length) return;
                        const nextIdx = activePieceIdx <= 0 ? stockPieces.length - 1 : activePieceIdx - 1;
                        const nextP = stockPieces[nextIdx];
                        if (nextP) selectPieceFromVisionOrScan(nextP, '◀ Prev');
                      }}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-amber-300 cursor-pointer"
                    >
                      ◀
                    </button>
                    {(['front', 'back', 'tag'] as const).map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActivePhotoTab(tab)}
                        className={`px-2 py-0.5 rounded uppercase cursor-pointer ${
                          activePhotoTab === tab ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/5 text-slate-300 hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (!stockPieces.length) return;
                        const nextIdx = activePieceIdx >= stockPieces.length - 1 ? 0 : activePieceIdx + 1;
                        const nextP = stockPieces[nextIdx];
                        if (nextP) selectPieceFromVisionOrScan(nextP, 'Next ▶');
                      }}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-amber-300 cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>
                  <span className="hidden sm:inline text-[10.5px] text-emerald-300 font-bold">
                    🔴 Comment &quot;MINE&quot; or &quot;CLAIM {selectedPiece.barcode}&quot;
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              data-live-hud-card="true"
              data-hud-sold-out="true"
              className="w-full bg-slate-950/90 backdrop-blur-xl border border-amber-400/50 rounded-2xl p-3 text-center"
            >
              <span className="text-xs font-black text-amber-300 uppercase">
                Scan barcode or show garment to camera to display on live screen ({stockPieces.length} clean pieces ready)
              </span>
            </div>
          )}
        </div>
      </main>

      {/* ================================================================================= */}
      {/* 3. RIGHT 3D CURVED COCKPIT WING: GIANT GO LIVE + VISION SCANNER + TOUCH KEYPAD   */}
      {/* ================================================================================= */}
      <aside className="order-3 w-full lg:w-[330px] xl:w-[355px] shrink-0 flex flex-col justify-between gap-2.5 p-3 lg:p-4 bg-gradient-to-b from-[#181220]/95 to-[#0a0c16]/95 backdrop-blur-2xl border-t lg:border border-amber-400/45 lg:rounded-[26px] shadow-[0_25px_60px_rgba(0,0,0,0.75),0_0_25px_rgba(251,191,36,0.12)] xl:[transform:rotateY(-11deg)_translateZ(6px)]">
        {/* 1. UNMISTAKABLE GIANT GO LIVE MASTER TRIGGER */}
        <button
          type="button"
          onClick={handleToggleHeadlessBroadcast}
          disabled={isTogglingHeadless}
          className={`w-full h-14 lg:h-20 rounded-2xl font-black text-base lg:text-lg uppercase tracking-widest cursor-pointer transition-all active:scale-98 border-2 flex flex-col items-center justify-center gap-0.5 ${
            isAnyStreamActive
              ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border-red-300 shadow-[0_0_35px_rgba(239,68,68,0.65)] animate-pulse'
              : 'bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:brightness-110 text-white border-rose-300 shadow-[0_12px_35px_rgba(239,68,68,0.55)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {isTogglingHeadless ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <span className={`w-3 h-3 rounded-full bg-white ${isAnyStreamActive ? 'animate-ping' : ''}`} />
            )}
            <span>{isAnyStreamActive ? 'ON AIR • STOP LIVE' : 'GO LIVE NOW'}</span>
          </div>
          <span className="text-[10px] font-mono font-bold text-rose-100/90 tracking-normal">
            {isAnyStreamActive
              ? `👁️ ${Math.max(1, liveViewers)} Watching • ${formattedUptime} • Mic ${audioLevel}%`
              : '1-Tap Start Camera Broadcast'}
          </span>
        </button>

        {/* 2. OPTICAL CAMERA VISION & BARCODE SCANNER BOX */}
        <div className="p-3 rounded-2xl bg-black/45 border border-white/12 space-y-2">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Barcode className="w-3.5 h-3.5" />
              BARCODE / VISION SCANNER
            </span>
            <span className="text-emerald-400 font-bold text-[10px]">
              {isCameraLive ? '📷 Lens Auto-ID ON' : '⚡ Laser Ready'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={visionScannerInput}
              onChange={e => handleVisionInputCommit(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const q = visionScannerInput.trim().toUpperCase();
                  const match = stockPieces.find(p => {
                    const b = String(p.barcode || '').toUpperCase();
                    return b === q || b.endsWith(q) || String(p.brandName || '').toUpperCase().includes(q);
                  });
                  if (match) {
                    selectPieceFromVisionOrScan(match, '⚡ Matched');
                    setVisionScannerInput('');
                  } else {
                    setSkuSearchInput(visionScannerInput);
                    setShowSkuPicker(true);
                  }
                }
              }}
              placeholder={selectedPiece ? `${selectedPiece.barcode} (Scan or type last 4 digits)` : 'Scan barcode or type last 4 digits...'}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#05070d] border border-amber-400/60 text-amber-300 font-mono font-bold text-xs placeholder-amber-300/50 focus:outline-none focus:border-amber-300"
            />
            <button
              type="button"
              onClick={() => setShowSkuPicker(true)}
              className="px-3 py-2 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/45 text-amber-300 font-black text-xs cursor-pointer shrink-0 flex items-center gap-1"
              title="Browse Clean Studio Rack"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Rack ({stockPieces.length})</span>
            </button>
          </div>
        </div>

        {/* 3. TACTILE FIGHTER-COCKPIT PRICE PADS (2x2 on Desktop, 4-in-row on Mobile) */}
        <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleAdjustPrice(-20)}
            className="py-2.5 lg:py-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-white font-black text-sm lg:text-base active:scale-95 transition cursor-pointer"
          >
            -20
          </button>
          <button
            type="button"
            onClick={() => handleAdjustPrice(20)}
            className="py-2.5 lg:py-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-white font-black text-sm lg:text-base active:scale-95 transition cursor-pointer"
          >
            +20
          </button>
          <button
            type="button"
            onClick={() => handleAdjustPrice(-10)}
            className="py-2.5 lg:py-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-white font-black text-sm lg:text-base active:scale-95 transition cursor-pointer"
          >
            -10
          </button>
          <button
            type="button"
            onClick={() => handleAdjustPrice(10)}
            className="py-2.5 lg:py-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-white font-black text-sm lg:text-base active:scale-95 transition cursor-pointer"
          >
            +10
          </button>
        </div>

        {/* 4. GLOWING GOLD AED PRICE DISPLAY */}
        <div className="relative rounded-2xl bg-[#05070d] border-2 border-amber-400 px-4 py-2.5 flex items-center justify-between shadow-[0_0_20px_rgba(251,191,36,0.15)]">
          <span className="text-xs font-black uppercase tracking-wider text-amber-400">AED</span>
          <input
            type="number"
            value={sellingPrice}
            onChange={e => setSellingPrice(Math.max(0, Number(e.target.value)))}
            className="w-full bg-transparent text-center font-mono font-black text-xl lg:text-2xl text-amber-300 focus:outline-none"
          />
        </div>

        {/* 5. BUYER HANDLE + LOCK & RESERVE ACTIONS */}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Buyer handle (@buyer)"
            value={buyerHandle}
            onChange={e => setBuyerHandle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070d] border border-slate-700 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualLockDraft}
              disabled={isProcessingLock || isProcessingSale || !selectedPiece}
              className={`py-3 px-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                isProcessingLock || isProcessingSale || !selectedPiece
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50'
              }`}
            >
              {isProcessingLock ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Lock</span>
            </button>

            <button
              type="button"
              onClick={handleConfirmSale}
              disabled={isProcessingSale || isProcessingLock || !selectedPiece}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-1.5 cursor-pointer ${
                isProcessingSale || isProcessingLock || !selectedPiece
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 hover:brightness-110 shadow-amber-500/30'
              }`}
            >
              {isProcessingSale ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Reserve &amp; Draft (AED {sellingPrice})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

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
                  const bCode = (p.barcode || p.sku || '').toLowerCase();
                  const bName = (p.brandName || (p as any).brand_name || '').toLowerCase();
                  const iName = (p.itemName || (p as any).item_name || '').toLowerCase();
                  return bCode.includes(q) || bName.includes(q) || iName.includes(q);
                })
                .slice(0, 50)
                .map(piece => {
                  const isCur = selectedPiece?.barcode === piece.barcode;
                  return (
                    <div
                      key={piece.id}
                      onClick={() => {
                        setSelectedPiece(piece);
                        const price = Number(piece.retailPriceAed || (piece as any).retail_price_aed || piece.lockedPrice || piece.estimatedPrice || piece.costPrice || 0);
                        setSellingPrice(price);
                        fetch(`/api/live/booths/${currentBoothId}/metrics`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ activeOnAirSku: piece.barcode, currentDealPrice: price })
                        }).catch(() => {});
                        setShowSkuPicker(false);
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isCur
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-black/40 border-white/10 hover:border-white/30 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {piece.frontImageUrl || (piece as any).front_image_url ? (
                          <img
                            src={piece.frontImageUrl || (piece as any).front_image_url}
                            alt=""
                            className="w-11 h-11 rounded-lg object-cover border border-white/20 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-5 h-5 text-amber-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-300 text-xs">
                              {piece.barcode}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-bold">
                              {piece.sizeScanned || (piece as any).size_scanned || (piece as any).size || 'M'}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-300 mt-0.5 truncate">
                            {piece.brandName || (piece as any).brand_name || 'Vintage'} • {piece.itemName || (piece as any).item_name || 'Garment'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Bale: {(piece.bale_id || (piece as any).gate_pass_id || piece.barcode || '').split('-').slice(0, 3).join('-') || 'VV-BAL-001'} | Weight: {piece.weightKg || (piece as any).weight_kg || 0.45}kg
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold text-amber-400 text-sm">
                          AED {piece.retailPriceAed || (piece as any).retail_price_aed || piece.lockedPrice || piece.estimatedPrice || piece.costPrice || 0}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          COGS: AED {piece.costPrice || (piece as any).cost_price || piece.calculatedCostPrice || (piece as any).calculated_cost_price || (piece.costPerGram && piece.weightGrams ? (piece.costPerGram * piece.weightGrams).toFixed(2) : '0.00')}
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
                    isHeadlessLive || isRtmpStreaming
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950'
                  }`}
                >
                  {isTogglingHeadless ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  )}
                  {isHeadlessLive || isRtmpStreaming ? 'Stop Broadcast' : 'Go Live Everywhere'}
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
                        {isLoggedIn
                          ? 'CONNECTED'
                          : isWaitingOtp
                          ? 'WAITING OTP'
                          : ch.auth_status === 'AUTHENTICATING'
                          ? 'AUTHENTICATING'
                          : 'DISCONNECTED'}
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

      {/* ================= FULL HD GARMENT PHOTO LIGHTBOX MODAL ================= */}
      {showPhotoLightbox && selectedPiece && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-5 animate-in fade-in">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/15">
            <div>
              <span className="text-xs font-mono font-bold text-amber-400">
                {selectedPiece.barcode} • Size: {selectedPiece.sizeScanned || (selectedPiece as any).size_scanned || 'M'}
              </span>
              <h3 className="text-base font-bold text-white">
                {selectedPiece.brandName || (selectedPiece as any).brand_name} {selectedPiece.itemName || (selectedPiece as any).item_name}
              </h3>
            </div>
            <button
              onClick={() => setShowPhotoLightbox(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Center Main View */}
          <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
            {currentSelectedPhotoUrl ? (
              <img
                src={currentSelectedPhotoUrl}
                alt=""
                className="max-h-[65vh] max-w-full rounded-2xl object-contain border border-white/20 shadow-2xl"
              />
            ) : (
              <p className="text-slate-400 italic">No studio photo available for this angle</p>
            )}
          </div>

          {/* Footer Thumbnails & Angle Selector */}
          <div className="pt-3 border-t border-white/15 flex items-center justify-center gap-3">
            {[
              { key: 'front' as const, label: 'Front Angle', url: selectedPiece.frontImageUrl || (selectedPiece as any).front_image_url },
              { key: 'back' as const, label: 'Back Angle', url: selectedPiece.backImageUrl || (selectedPiece as any).back_image_url },
              { key: 'tag' as const, label: 'Care Tag', url: selectedPiece.tagImageUrl || (selectedPiece as any).tag_image_url }
            ].map(photo => (
              <button
                key={photo.key}
                onClick={() => setActivePhotoTab(photo.key)}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all cursor-pointer ${
                  activePhotoTab === photo.key
                    ? 'border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/50'
                    : 'border-white/10 bg-black/40 hover:border-white/30'
                }`}
              >
                {photo.url ? (
                  <img src={photo.url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] text-slate-500">
                    No Img
                  </div>
                )}
                <span className="text-[10px] font-bold text-slate-300">{photo.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

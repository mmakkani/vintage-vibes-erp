import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { SalesInvoice } from '../sales.types.ts';
import { useSync } from '../../../context/SyncContext.tsx';
import { RTMPDestination, LiveStudioComment, StreamTelemetry, BoothSession } from '../../../server/streamController.ts';
import { ThermalBarcodeSticker, StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import {
  Radio,
  Video,
  VideoOff,
  Camera,
  Smartphone,
  QrCode,
  Wifi,
  Scan,
  Zap,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Tag,
  Copy,
  ExternalLink,
  Printer,
  Trash2,
  Sparkles,
  RefreshCw,
  Search,
  Sliders,
  Flame,
  Send,
  Plus,
  Share2,
  Eye,
  Activity,
  Layers,
  ShoppingBag,
  Users,
  Monitor,
  BarChart3,
  Timer,
  Truck,
  FileText,
  RotateCcw,
  Check,
  ChevronDown,
  Settings,
  ShieldCheck,
  ArrowUpRight,
  EyeOff,
  MapPin,
  Phone,
  MessageSquare
} from 'lucide-react';

interface LiveSellingStudioProps {
  stockPieces: PieceBreakdownItem[];
  clients: Party[];
  onRefreshAll: () => void;
  onInvoiceCreated: (inv: SalesInvoice) => void;
}

interface BuyerPool {
  buyerHandle: string;
  channel: string;
  boothId: string;
  itemsCount: number;
  totalWeightKg: number;
  subTotalAed: number;
  vatAed: number;
  shippingAed: number;
  grandTotalAed: number;
  items: PieceBreakdownItem[];
}

export const LiveSellingStudio: React.FC<LiveSellingStudioProps> = ({
  stockPieces,
  clients,
  onRefreshAll,
  onInvoiceCreated
}) => {
  const { syncVersion, notifyMutation } = useSync();

  // Mode: 'STUDIO' (single booth) vs 'SUPERVISOR' (Master Admin Live Overview across 10 booths)
  const [viewMode, setViewMode] = useState<'STUDIO' | 'SUPERVISOR'>('STUDIO');

  // Active Booth State (Booth 01 to Booth 10)
  const [selectedBoothId, setSelectedBoothId] = useState<string>('booth-01');
  const [allBoothsData, setAllBoothsData] = useState<{
    booths: BoothSession[];
    totals: {
      activeStreamers: number;
      totalViewers: number;
      totalRevenueAed: number;
      totalClaimsCount: number;
      avgClaimsPerMin: number;
    };
  } | null>(null);

  const [activeBooth, setActiveBooth] = useState<BoothSession | null>(null);

  // ==================== FUNCTIONAL CAMERA & WEBRTC INGEST ====================
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [availableVideoDevices, setAvailableVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [webrtcStatus, setWebrtcStatus] = useState<'CONNECTING' | 'LIVE' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');
  const [cameraResolution, setCameraResolution] = useState<string>('1920 x 1080 (FHD)');
  const [cameraFps, setCameraFps] = useState<number>(60);
  const [audioMeter, setAudioMeter] = useState<number>(0);
  const [streamUptime, setStreamUptime] = useState<number>(1420);

  // Dynamic QR Code & Mobile Pairing Token
  const [pairToken, setPairToken] = useState<string>(() => `VV-${Date.now().toString(36).toUpperCase().slice(-6)}`);
  const [showPairModal, setShowPairModal] = useState<boolean>(false);
  const [mobilePairingConnected, setMobilePairingConnected] = useState<boolean>(false);

  // Comments Feed
  const [comments, setComments] = useState<LiveStudioComment[]>([]);
  const [simulatedInputComment, setSimulatedInputComment] = useState('');
  const [simulatedPlatform, setSimulatedPlatform] = useState<'tiktok' | 'instagram' | 'facebook'>('tiktok');
  const [simulatedUsername, setSimulatedUsername] = useState('@collector_99');

  // Scanner & Claiming State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeBuyerHandle, setActiveBuyerHandle] = useState('@dubai_vintage_vault');
  const [activeBuyerPhone, setActiveBuyerPhone] = useState('+971 50 892 4110');
  const [activeDiscountPct, setActiveDiscountPct] = useState<number>(0);
  const [lastClaimedPiece, setLastClaimedPiece] = useState<PieceBreakdownItem | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Buyer Pools from backend
  const [buyerPools, setBuyerPools] = useState<BuyerPool[]>([]);
  const [selectedBuyerForFinalize, setSelectedBuyerForFinalize] = useState<BuyerPool | null>(null);
  const [finalizedResult, setFinalizedResult] = useState<{
    invoice?: SalesInvoice;
    whatsAppMessage?: string;
    thermalStickers?: any[];
  } | null>(null);

  // Modals & Drawers
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState<boolean>(false);
  const [showWhatsAppHubModal, setShowWhatsAppHubModal] = useState<boolean>(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [selectedStickerForPrint, setSelectedStickerForPrint] = useState<StickerData | null>(null);

  // UAE Multicast Settings State (TikTok, Instagram, Facebook, YouTube, Snapchat / Custom RTMP)
  const [editTiktokHandle, setEditTiktokHandle] = useState<string>('');
  const [editHostName, setEditHostName] = useState<string>('');
  const [editDestinations, setEditDestinations] = useState<RTMPDestination[]>([]);
  const [editReservationTimeout, setEditReservationTimeout] = useState<number>(120);
  const [showKeyVisibility, setShowKeyVisibility] = useState<Record<string, boolean>>({});

  // WhatsApp Closing Hub State
  const [selectedHubBuyer, setSelectedHubBuyer] = useState<BuyerPool | null>(null);
  const [rawAddressInput, setRawAddressInput] = useState<string>(
    `Rashid Al Nuaimi\n+971 50 482 1993\nVilla 14B, Street 22, Al Barsha 2\nDubai, UAE`
  );
  const [parsedAddressResult, setParsedAddressResult] = useState<{
    name: string;
    phone: string;
    streetAddress: string;
    city: string;
    country: string;
    courierNote: string;
  } | null>(null);

  // Available stock pieces
  const availablePieces = useMemo(() => {
    return stockPieces.filter(p => !p.isSold && p.status !== 'SOLD');
  }, [stockPieces]);

  // Dynamic Browser Session Pairing URL for Dedicated Mobile Streamer App
  const dynamicPairUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vintagevibe.ae';
    return `${origin}/live-host/${selectedBoothId}`;
  }, [selectedBoothId]);

  // Load hardware camera devices
  const refreshDevices = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setAvailableVideoDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn('Could not enumerate video devices:', err);
      }
    }
  }, [selectedDeviceId]);

  // Real HTML5 navigator.mediaDevices.getUserMedia() functional camera and audio ingest
  const startCamera = useCallback(async (facing = cameraFacing, deviceId = selectedDeviceId) => {
    setWebrtcStatus('CONNECTING');
    try {
      // Stop any existing stream
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(t => t.stop());
        activeStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: facing,
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 }
            },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Video play auto error:', e));
      }

      // Read real track telemetry
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.width && settings.height) {
          setCameraResolution(`${settings.width} x ${settings.height}`);
        }
        if (settings.frameRate) {
          setCameraFps(Math.round(settings.frameRate));
        }
      }

      // Connect real Web Audio API Analyser for genuine live decibel meter
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            const updateAudio = () => {
              if (analyser && activeStreamRef.current) {
                analyser.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) {
                  sum += buffer[i];
                }
                const avg = sum / buffer.length;
                const normalizedPct = Math.min(100, Math.round((avg / 128) * 100));
                setAudioMeter(normalizedPct);
                animationFrameRef.current = requestAnimationFrame(updateAudio);
              }
            };
            updateAudio();
          }
        } catch (audioErr) {
          console.warn('Web Audio meter error:', audioErr);
        }
      }

      setIsCameraActive(true);
      setWebrtcStatus('LIVE');
      refreshDevices();
    } catch (err: any) {
      console.warn('Hardware camera capture failed or permission denied:', err);
      setIsCameraActive(false);
      setWebrtcStatus('ERROR');
      // If specific device fails, try default facing
      if (deviceId) {
        setSelectedDeviceId('');
      }
    }
  }, [cameraFacing, selectedDeviceId, refreshDevices]);

  const stopCamera = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsCameraActive(false);
    setWebrtcStatus('DISCONNECTED');
    setAudioMeter(0);
  }, []);

  // Cleanup on unmount or booth change
  useEffect(() => {
    startCamera(cameraFacing, selectedDeviceId);
    return () => {
      stopCamera();
    };
  }, [selectedBoothId, cameraFacing, selectedDeviceId]);

  // Load All Booths Overview & restore settings from localStorage
  const loadBoothsOverview = useCallback(async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch('/api/live-stream/booths');
        if (res.ok) {
          const data = await res.json();
          setAllBoothsData(data);
          const current: BoothSession = data.booths.find((b: BoothSession) => b.boothId === selectedBoothId) || data.booths[0];
          if (current) {
            setActiveBooth(current);
            setComments(current.comments || []);

            // Check localStorage persistence for custom RTMP keys & settings
            const savedLocal = localStorage.getItem(`vv_rtmp_settings_${current.boothId}`);
            if (savedLocal) {
              try {
                const parsed = JSON.parse(savedLocal);
                setEditTiktokHandle(parsed.tiktokHandle || current.tiktokHandle);
                setEditHostName(parsed.hostName || current.hostName);
                setEditDestinations(parsed.destinations || current.destinations || []);
                setEditReservationTimeout(parsed.reservationTimeoutMinutes || current.reservationTimeoutMinutes || 120);
              } catch (e) {
                setEditTiktokHandle(current.tiktokHandle);
                setEditHostName(current.hostName);
                setEditDestinations(current.destinations || []);
                setEditReservationTimeout(current.reservationTimeoutMinutes || 120);
              }
            } else {
              setEditTiktokHandle(current.tiktokHandle);
              setEditHostName(current.hostName);
              setEditDestinations(current.destinations || []);
              setEditReservationTimeout(current.reservationTimeoutMinutes || 120);
            }
          }
          return;
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        } else {
          console.warn('Booths overview sync warning (retrying in background):', err);
        }
      }
    }
  }, [selectedBoothId]);

  // Load backend pool data for current booth
  const loadPoolData = useCallback(async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`/api/live-stream/pool?boothId=${selectedBoothId}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data && Array.isArray(data.pools) ? data.pools : (data && Array.isArray(data.data) ? data.data : []));
          setBuyerPools(list);
          if (list.length > 0 && !selectedHubBuyer) {
            setSelectedHubBuyer(list[0]);
          }
          return;
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        } else {
          console.warn('Live pool sync warning (retrying in background):', err);
        }
      }
    }
  }, [selectedBoothId, selectedHubBuyer]);

  useEffect(() => {
    loadBoothsOverview();
    loadPoolData();
  }, [selectedBoothId, syncVersion, loadBoothsOverview, loadPoolData]);

  // Periodic uptime ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setStreamUptime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const focusScanner = () => {
      if (
        barcodeInputRef.current &&
        !showPairModal &&
        !showSettingsModal &&
        !showFinalizeModal &&
        !showWhatsAppHubModal &&
        !showAnalyticsModal &&
        viewMode === 'STUDIO'
      ) {
        barcodeInputRef.current.focus();
      }
    };
    focusScanner();

    const handleGlobalKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('data-ignore-global') === 'true')) {
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        const handles = ['@dubai_vintage_vault', '@dxb_grails_90s', '@yasir_streetwear', '@rashed_vip_dxb', '@salem_retro'];
        const nextIdx = (handles.indexOf(activeBuyerHandle) + 1) % handles.length;
        setActiveBuyerHandle(handles[nextIdx]);
        setClaimFeedback({ text: `Switched Buyer: ${handles[nextIdx]}`, type: 'success' });
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveDiscountPct(prev => (prev === 10 ? 0 : 10));
      } else if (e.key === 'F5') {
        e.preventDefault();
        setActiveDiscountPct(prev => (prev === 20 ? 0 : 20));
      } else if (e.key === 'Escape') {
        setBarcodeInput('');
        focusScanner();
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [
    showPairModal,
    showSettingsModal,
    showFinalizeModal,
    showWhatsAppHubModal,
    showAnalyticsModal,
    viewMode,
    activeBuyerHandle
  ]);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Atomic SKU Claiming
  const handleClaimSku = async (skuToClaim: string, buyerToCredit: string, offeredPrice?: number) => {
    const cleanSku = skuToClaim.trim();
    if (!cleanSku) {
      setClaimFeedback({ text: 'Please enter or scan a vintage SKU barcode', type: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/live-stream/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: cleanSku,
          buyerHandle: buyerToCredit,
          buyerPhone: activeBuyerPhone,
          channel: activeBooth?.tiktokHandle || 'TikTok Live',
          boothId: selectedBoothId,
          offeredPrice,
          lockDurationSeconds: 180,
          reservationTimeoutMinutes: activeBooth?.reservationTimeoutMinutes || 120
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setClaimFeedback({
          text: data.error || `SKU ${cleanSku} is already locked by another host! Concurrency lock preserved.`,
          type: 'error'
        });
      } else {
        setLastClaimedPiece(data.piece);
        setClaimFeedback({
          text: `🔒 LOCKED: Claimed ${data.piece.brandName} ${data.piece.itemName} for ${buyerToCredit} in ${activeBooth?.boothName} (Hold active).`,
          type: 'success'
        });
        setBarcodeInput('');
        notifyMutation('SALES', 'LIVE_CLAIM', 'UPDATE', cleanSku);
        loadPoolData();
        loadBoothsOverview();
        onRefreshAll();
      }
    } catch (err) {
      setClaimFeedback({ text: 'Network error processing atomic lock', type: 'error' });
    }
  };

  // Fast Drop & Re-Auction Action
  const handleFastDropPiece = async (barcode: string) => {
    try {
      const res = await fetch('/api/live-stream/release-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, boothId: selectedBoothId })
      });
      const data = await res.json();
      if (data.success) {
        setClaimFeedback({
          text: `🔄 FAST DROP: ${barcode} returned to live inventory rack. Ready for immediate re-bidding!`,
          type: 'warning'
        });
        if (lastClaimedPiece?.barcode === barcode) {
          setLastClaimedPiece(null);
        }
        notifyMutation('SALES', 'LIVE_CLAIM', 'UPDATE', barcode);
        loadPoolData();
        loadBoothsOverview();
        onRefreshAll();
      } else {
        setClaimFeedback({ text: data.error || 'Failed to release lock', type: 'error' });
      }
    } catch (err) {
      setClaimFeedback({ text: 'Error executing fast drop', type: 'error' });
    }
  };

  // Reservation Timeout Engine: Sweep Expired Holds
  const handleSweepReservations = async () => {
    try {
      const res = await fetch('/api/live-stream/sweep-reservations', { method: 'POST' });
      const data = await res.json();
      if (data.sweptCount > 0) {
        setClaimFeedback({
          text: `⏰ RESERVATION TIMEOUT SWEEPER: Auto-released ${data.sweptCount} expired/unpaid pieces back into stock!`,
          type: 'warning'
        });
        loadPoolData();
        loadBoothsOverview();
        onRefreshAll();
      } else {
        setClaimFeedback({ text: 'No reservations have exceeded their payment timeout window.', type: 'success' });
      }
    } catch (err) {
      setClaimFeedback({ text: 'Error triggering reservation sweeper', type: 'error' });
    }
  };

  // Save UAE Multicast Settings (TikTok, Instagram, Facebook, YouTube, Snapchat / Custom RTMP) & Persist to localStorage
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const settingsPayload = {
        tiktokHandle: editTiktokHandle,
        hostName: editHostName,
        destinations: editDestinations,
        reservationTimeoutMinutes: Number(editReservationTimeout)
      };

      // Persist reliably in browser localStorage
      localStorage.setItem(`vv_rtmp_settings_${selectedBoothId}`, JSON.stringify(settingsPayload));

      // Also persist to backend
      const res = await fetch(`/api/live-stream/booths/${selectedBoothId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });

      const data = await res.json();
      if (data.success) {
        setShowSettingsModal(false);
        setClaimFeedback({
          text: `✅ Stream keys & UAE platform settings persisted locally and saved for ${activeBooth?.boothName}!`,
          type: 'success'
        });
        loadBoothsOverview();
      }
    } catch (err) {
      setClaimFeedback({ text: 'Failed to save stream settings', type: 'error' });
    }
  };

  // Smart WhatsApp Address Parser Execution
  const handleParseAddress = async (textToParse: string) => {
    try {
      const res = await fetch('/api/live-stream/parse-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: textToParse })
      });
      if (res.ok) {
        const parsed = await res.json();
        setParsedAddressResult(parsed);
      }
    } catch (err) {
      console.error('Address parsing error:', err);
    }
  };

  // Post Comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedInputComment.trim()) return;

    try {
      const res = await fetch(`/api/live-stream/booths/${selectedBoothId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: simulatedInputComment.trim(),
          platform: simulatedPlatform,
          username: simulatedUsername
        })
      });
      if (res.ok) {
        const newC = await res.json();
        setComments(prev => [newC, ...prev]);
        setSimulatedInputComment('');

        if (newC.isClaimIntent && newC.extractedSku) {
          setClaimFeedback({
            text: `🎯 Claim Intent Detected: ${newC.username} on ${newC.extractedSku}! Click 'Lock' to claim.`,
            type: 'warning'
          });
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  // Finalize live session per buyer
  const handleFinalizeBuyerSession = async (pool: BuyerPool) => {
    try {
      const res = await fetch('/api/live-stream/finalize-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerHandle: pool.buyerHandle,
          customerPhone: activeBuyerPhone,
          paymentMethod: 'CASH',
          boothId: selectedBoothId
        })
      });
      const data = await res.json();
      if (data.success) {
        setFinalizedResult(data);
        setSelectedBuyerForFinalize(pool);
        setShowFinalizeModal(true);
        loadPoolData();
        loadBoothsOverview();
        onRefreshAll();
        if (data.invoice) {
          onInvoiceCreated(data.invoice);
        }
      } else {
        setClaimFeedback({ text: data.error || 'Failed to finalize session', type: 'error' });
      }
    } catch (err) {
      setClaimFeedback({ text: 'Error finalizing session', type: 'error' });
    }
  };

  // Helpers for UAE WhatsApp Message Generators
  const generateOrderSummaryWhatsAppText = (pool: BuyerPool) => {
    const itemsList = pool.items
      .map(
        (it, idx) =>
          `${idx + 1}. *${it.brandName} ${it.itemName}* [${it.sizeScanned || 'Standard'}] • SKU: ${it.barcode} — AED ${(
            it.lockedPrice || it.estimatedPrice || it.retailPriceAed || 120
          ).toFixed(2)}`
      )
      .join('\n');

    return (
      `✨ *VINTAGE VIBE LIVE AUCTION - ORDER SUMMARY* ✨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Buyer:* ${pool.buyerHandle}\n` +
      `🎙️ *Live Session:* ${activeBooth?.boothName || 'Booth 01'}\n` +
      `🕒 *Time:* ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n` +
      `📦 *CLAIMED GARMENTS (${pool.itemsCount} Pieces):*\n` +
      `${itemsList}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 *Subtotal:* AED ${pool.subTotalAed.toFixed(2)}\n` +
      `🧾 *UAE VAT (5%):* AED ${pool.vatAed.toFixed(2)}\n` +
      `🚚 *Courier Delivery:* ${pool.shippingAed === 0 ? 'FREE (Orders over AED 500)' : `AED ${pool.shippingAed.toFixed(2)}`}\n` +
      `⭐ *TOTAL PAYABLE: AED ${pool.grandTotalAed.toFixed(2)}*\n\n` +
      `💳 *PAYMENT INSTRUCTIONS:*\n` +
      `• Bank Transfer: Emirates NBD\n` +
      `  IBAN: AE07 0260 0012 3456 7890 123\n` +
      `  Beneficiary: VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C\n` +
      `• Or reply *'COD'* for Cash on Delivery across UAE (Dubai, Abu Dhabi, Sharjah).\n\n` +
      `📍 Please reply with your delivery address or live WhatsApp location pin so our courier dispatch can ship your bale order today!`
    );
  };

  const generateRequestLocationWhatsAppText = (pool: BuyerPool) => {
    return (
      `📍 *Vintage Vibe Dispatch Team:* Salam ${pool.buyerHandle}!\n\n` +
      `Could you please send us your delivery address or drop a WhatsApp live location pin?\n\n` +
      `• *Recipient Name:*\n` +
      `• *Mobile Number:*\n` +
      `• *Emirate:* (Dubai / Abu Dhabi / Sharjah / etc.)\n` +
      `• *Area / Neighborhood:*\n` +
      `• *Street & Villa / Building Number:*\n\n` +
      `We have your ${pool.itemsCount} vintage pieces packed with direct thermal shipping tags ready for handover to our express courier!`
    );
  };

  const totalClaimedItems = useMemo(() => Array.isArray(buyerPools) ? buyerPools.reduce((s, p) => s + (p?.itemsCount || 0), 0) : 0, [buyerPools]);
  const totalSessionGrossAed = useMemo(() => Array.isArray(buyerPools) ? buyerPools.reduce((s, p) => s + (p?.grandTotalAed || 0), 0) : 0, [buyerPools]);

  return (
    <div className="space-y-4">
      {/* ======================= TOP BAR: WORKSPACE SELECTOR & MULTI-BOOTH SWITCHER ======================= */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-3 sm:p-4 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Booth Selector Dropdown & Host Profile */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-red-600 text-white shadow-xs">
                  CONCURRENT MULTI-BOOTH STUDIO
                </span>
                <span className="text-xs text-stone-400 font-mono">10 Dedicated Auction Booths</span>
              </div>

              {/* Booth Select Dropdown */}
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={selectedBoothId}
                  onChange={e => {
                    setSelectedBoothId(e.target.value);
                    setViewMode('STUDIO');
                  }}
                  className="bg-stone-950 border border-amber-500/50 text-amber-300 font-black text-xs sm:text-sm rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                >
                  {allBoothsData?.booths.map(b => (
                    <option key={b.boothId} value={b.boothId}>
                      {b.boothName} • Host: {b.hostName} ({b.isBroadcasting ? '🔴 LIVE' : '⚪ IDLE'})
                    </option>
                  )) || (
                    <option value="booth-01">Booth 01 - Main Stage</option>
                  )}
                </select>

                <span className="text-xs text-stone-300 font-bold hidden sm:inline">
                  {activeBooth?.tiktokHandle}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions: Supervisor View Toggle, Social Settings, WhatsApp Hub, Sweeper */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* View Mode Toggle */}
            <button
              type="button"
              onClick={() => setViewMode(prev => (prev === 'STUDIO' ? 'SUPERVISOR' : 'STUDIO'))}
              className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all ${
                viewMode === 'SUPERVISOR'
                  ? 'bg-amber-500 text-stone-950 border-amber-400 font-black'
                  : 'bg-stone-800 hover:bg-stone-750 border-stone-700 text-stone-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{viewMode === 'SUPERVISOR' ? 'Return to Booth Studio' : 'Master Admin Overview (10 Booths)'}</span>
            </button>

            {/* Dedicated Streamer Mobile App Launcher */}
            <a
              href={`/live-host/${selectedBoothId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 font-black text-stone-950 flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
              title="Launch dedicated mobile operator app for this booth"
            >
              <Smartphone className="w-3.5 h-3.5 text-stone-950" />
              <span>Mobile Streamer App (/live-host)</span>
              <ExternalLink className="w-3 h-3 text-stone-900 ml-0.5" />
            </a>

            {/* Mobile WebRTC Camera QR Code Button */}
            <button
              type="button"
              onClick={() => setShowPairModal(true)}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 border border-stone-700 font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Camera QR Pairing</span>
            </button>

            {/* Real TikTok Live WebSocket Scraper Socket Button */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const statusRes = await fetch('/api/live-stream/tiktok-socket/status');
                  const st = await statusRes.json();
                  if (st.status === 'LIVE' || st.status === 'CONNECTED') {
                    await fetch('/api/live-stream/tiktok-socket/disconnect', { method: 'POST' });
                    setClaimFeedback({ text: 'TikTok Live WebSocket Disconnected', type: 'warning' });
                  } else {
                    const username = activeBooth?.tiktokHandle || '@vintage_dubai_live';
                    setClaimFeedback({ text: `Connecting to TikTok live room ${username}...`, type: 'success' });
                    const connRes = await fetch('/api/live-stream/tiktok-socket/connect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username })
                    });
                    const connData = await connRes.json();
                    if (connData.success) {
                      setClaimFeedback({ text: `🟢 Real TikTok Live Connected to ${username}! Live comments stream active.`, type: 'success' });
                    } else {
                      setClaimFeedback({ text: `TikTok stream offline: ${connData.error || 'Check username in settings'}`, type: 'error' });
                    }
                  }
                } catch {
                  setClaimFeedback({ text: 'TikTok socket service unavailable', type: 'error' });
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 border border-purple-500/50 font-bold text-purple-300 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="Connect real-time TikTok Live chat scraper socket"
            >
              <Wifi className="w-3.5 h-3.5 text-purple-400" />
              <span>TikTok Live Socket</span>
            </button>

            {/* UAE Multi-Platform Broadcast Settings Button */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 border border-stone-700 font-bold text-stone-200 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-blue-400" />
              <span>UAE Multicast (YT / Snap / TT)</span>
            </button>

            {/* Native UAE WhatsApp Checkout & Dispatch Hub */}
            <button
              type="button"
              onClick={() => {
                if (buyerPools.length > 0 && !selectedHubBuyer) {
                  setSelectedHubBuyer(buyerPools[0]);
                }
                handleParseAddress(rawAddressInput);
                setShowWhatsAppHubModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 font-black text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Truck className="w-3.5 h-3.5 text-emerald-200" />
              <span>UAE WhatsApp Dispatch Hub</span>
            </button>

            {/* Host KPI Stats */}
            <button
              type="button"
              onClick={() => setShowAnalyticsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 border border-stone-700 font-bold text-stone-200 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              <span>Host KPI Stats</span>
            </button>

            {/* Expired Reservations Sweeper Button */}
            <button
              type="button"
              onClick={handleSweepReservations}
              className="px-3 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-850 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Release unpaid basket holds past reservation window"
            >
              <Timer className="w-3.5 h-3.5 text-amber-400" />
              <span>Sweep Holds ({activeBooth?.reservationTimeoutMinutes || 120}m)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action/Feedback alert banner */}
      {claimFeedback && (
        <div
          className={`p-3 rounded-lg text-xs font-bold border flex items-center justify-between shadow-xs ${
            claimFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
              : claimFeedback.type === 'error'
              ? 'bg-red-50 text-red-950 border-red-300'
              : 'bg-amber-50 text-amber-950 border-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {claimFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : claimFeedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <Flame className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{claimFeedback.text}</span>
          </div>
          <button onClick={() => setClaimFeedback(null)} className="text-stone-400 hover:text-stone-700 text-sm ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== VIEW MODE 1: MASTER ADMIN OVERVIEW ================ */}
      {/* ========================================================================= */}
      {viewMode === 'SUPERVISOR' && (
        <div className="space-y-4">
          {/* High-level Supervisor Aggregates */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
              <div className="text-[10px] text-stone-500 font-bold uppercase">Active Live Booths</div>
              <div className="text-lg font-black text-emerald-600 mt-0.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{allBoothsData?.totals.activeStreamers || 5} / 10 Online</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
              <div className="text-[10px] text-stone-500 font-bold uppercase">Combined Viewers</div>
              <div className="text-lg font-black text-stone-900 mt-0.5">
                {(allBoothsData?.totals.totalViewers || 4890).toLocaleString()} Viewers
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
              <div className="text-[10px] text-stone-500 font-bold uppercase">Total Live Gross Booked</div>
              <div className="text-lg font-black text-amber-600 mt-0.5">
                AED {(allBoothsData?.totals.totalRevenueAed || 23250).toLocaleString()}
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
              <div className="text-[10px] text-stone-500 font-bold uppercase">Total Claims Today</div>
              <div className="text-lg font-black text-stone-900 mt-0.5">
                {allBoothsData?.totals.totalClaimsCount || 74} Garments
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
              <div className="text-[10px] text-stone-500 font-bold uppercase">Average Velocity</div>
              <div className="text-lg font-black text-purple-600 mt-0.5">
                {allBoothsData?.totals.avgClaimsPerMin || 1.1} items/min
              </div>
            </div>
          </div>

          {/* Bento Grid: 10 Concurrent Booth Monitors */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {allBoothsData?.booths.map(b => (
              <div
                key={b.boothId}
                className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                  b.isBroadcasting
                    ? 'bg-white border-stone-300 shadow-md ring-1 ring-amber-400/30'
                    : 'bg-stone-50 border-stone-200 opacity-75'
                }`}
              >
                <div>
                  {/* Booth Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <span className="font-black text-xs text-stone-900 truncate">
                      {b.boothName.split('-')[0].trim()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        b.isBroadcasting ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {b.isBroadcasting ? 'LIVE' : 'STANDBY'}
                    </span>
                  </div>

                  {/* Host info */}
                  <div className="mt-2 text-xs">
                    <div className="font-extrabold text-stone-800">{b.hostName}</div>
                    <div className="text-[10px] text-amber-700 font-mono">{b.tiktokHandle}</div>
                    <div className="text-[10px] text-stone-500 truncate mt-0.5">{b.categoryFocus}</div>
                  </div>

                  {/* Live Metrics */}
                  <div className="mt-3 p-2 bg-stone-50 rounded-lg border border-stone-200 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Viewers:</span>
                      <span className="font-bold text-stone-900">{b.isBroadcasting ? b.viewerCount.toLocaleString() : 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Claims:</span>
                      <span className="font-bold text-stone-900">{b.itemsClaimed} items</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Revenue:</span>
                      <span className="font-black text-amber-700">AED {b.netRevenueAed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Pace:</span>
                      <span className="font-mono text-purple-700 font-bold">{b.itemsSoldPerMin} / min</span>
                    </div>
                  </div>

                  {/* On Air SKU */}
                  {b.activeOnAirSku && (
                    <div className="mt-2 text-[10px] text-stone-600 font-mono truncate">
                      On-Air: <strong className="text-stone-900">{b.activeOnAirSku}</strong>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[9px] text-stone-400">Hold: {b.reservationTimeoutMinutes}m</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBoothId(b.boothId);
                      setViewMode('STUDIO');
                    }}
                    className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <span>Enter Console</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== VIEW MODE 2: SINGLE BOOTH STUDIO CONSOLE ========== */}
      {/* ========================================================================= */}
      {viewMode === 'STUDIO' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* ======================= COLUMN 1 (LEFT): VIDEO MONITOR & REAL CAMERA (4 COLS) ======================= */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-stone-900 rounded-xl overflow-hidden border border-stone-800 shadow-md relative">
              {/* Monitor Header with Real Hardware Camera Controls */}
              <div className="px-3 py-2 bg-stone-950/90 border-b border-stone-800/90 flex items-center justify-between text-xs text-stone-300">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      webrtcStatus === 'LIVE'
                        ? 'bg-emerald-500 animate-pulse'
                        : webrtcStatus === 'CONNECTING'
                        ? 'bg-yellow-400 animate-spin'
                        : webrtcStatus === 'ERROR'
                        ? 'bg-red-500'
                        : 'bg-stone-500'
                    }`}
                  ></span>
                  <span className="font-mono font-bold text-white text-[11px]">
                    {activeBooth?.boothName.toUpperCase() || 'BOOTH 01'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                      webrtcStatus === 'LIVE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : webrtcStatus === 'CONNECTING'
                        ? 'bg-yellow-950 text-yellow-300 border border-yellow-700'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {webrtcStatus}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Flip Facing Mode */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
                      setCameraFacing(nextFacing);
                      startCamera(nextFacing, '');
                    }}
                    className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white cursor-pointer"
                    title="Flip Camera (Front / Rear Phone Lens)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle On/Off Hardware Ingest */}
                  <button
                    type="button"
                    onClick={() => (isCameraActive ? stopCamera() : startCamera(cameraFacing, selectedDeviceId))}
                    className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white cursor-pointer"
                    title={isCameraActive ? 'Turn Camera Off' : 'Activate Device Camera'}
                  >
                    {isCameraActive ? <Video className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </div>
              </div>

              {/* Hardware Video Selector Dropdown if multiple cameras detected */}
              {availableVideoDevices.length > 1 && (
                <div className="px-3 py-1.5 bg-stone-950/70 border-b border-stone-800 flex items-center justify-between text-[10px] text-stone-400">
                  <span className="font-bold">Camera Source:</span>
                  <select
                    value={selectedDeviceId}
                    onChange={e => {
                      setSelectedDeviceId(e.target.value);
                      startCamera(cameraFacing, e.target.value);
                    }}
                    className="bg-stone-900 border border-stone-700 rounded px-2 py-0.5 text-stone-200 text-[10px] max-w-[200px] truncate focus:outline-none"
                  >
                    {availableVideoDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Functional HTML5 Video Canvas */}
              <div className="relative aspect-[9/16] sm:aspect-[3/4] bg-stone-950 flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    isCameraActive && webrtcStatus === 'LIVE' ? 'opacity-100' : 'opacity-0 absolute'
                  }`}
                />

                {/* Stream Standby Screen when Camera is Off or Connecting */}
                {(!isCameraActive || webrtcStatus !== 'LIVE') && (
                  <div className="w-full h-full bg-gradient-to-b from-stone-900 via-stone-850 to-stone-950 flex flex-col items-center justify-center p-6 text-center text-white relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:16px_16px]"></div>
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                      <Camera className="w-8 h-8 text-amber-400 animate-pulse" />
                    </div>
                    <span className="font-black text-amber-300 text-sm">
                      {webrtcStatus === 'CONNECTING' ? 'CONNECTING CAMERA...' : `${activeBooth?.boothName.toUpperCase()} STANDBY`}
                    </span>
                    <p className="text-[11px] text-stone-400 max-w-xs mt-1">
                      Native browser video & audio capture ready for host {activeBooth?.hostName} ({activeBooth?.tiktokHandle}).
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera(cameraFacing, selectedDeviceId)}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-stone-950 font-extrabold text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-sm"
                      >
                        Start WebCam Video Ingest
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPairModal(true)}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs border border-stone-700 cursor-pointer"
                      >
                        Mobile QR
                      </button>
                    </div>
                  </div>
                )}

                {/* Live HUD Overlays */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                    LIVE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-stone-900/80 backdrop-blur-xs text-white font-mono font-bold text-[9px] border border-stone-700">
                    {(activeBooth?.viewerCount || 1420).toLocaleString()} Viewers
                  </span>
                  <span className="px-2 py-0.5 rounded bg-stone-900/80 backdrop-blur-xs text-amber-300 font-mono text-[9px] border border-stone-700">
                    {cameraResolution} @ {cameraFps}fps
                  </span>
                </div>

                {/* Real Microphone Decibel VU Meter via Web Audio API */}
                <div className="absolute bottom-2 right-2 flex items-end gap-0.5 h-7 z-10 bg-stone-950/80 p-1.5 rounded-lg border border-stone-800 backdrop-blur-xs">
                  <div className="w-1.5 bg-emerald-500 rounded-t transition-all duration-75" style={{ height: `${Math.min(100, audioMeter)}%` }}></div>
                  <div className="w-1.5 bg-emerald-400 rounded-t transition-all duration-75" style={{ height: `${Math.min(100, audioMeter * 0.85)}%` }}></div>
                  <div className="w-1.5 bg-yellow-400 rounded-t transition-all duration-75" style={{ height: `${Math.min(100, audioMeter * 0.65)}%` }}></div>
                  <div className="w-1.5 bg-red-500 rounded-t transition-all duration-75" style={{ height: `${Math.max(10, audioMeter - 35)}%` }}></div>
                </div>

                {/* Active garment piece pinned card HUD */}
                {lastClaimedPiece && (
                  <div className="absolute bottom-2 left-2 right-14 bg-stone-950/90 backdrop-blur-md p-2 rounded-xl border border-amber-500/40 text-white text-xs z-10 shadow-lg">
                    <div className="flex items-center justify-between text-[9px] text-amber-400 font-bold uppercase tracking-tight">
                      <span>ON AUCTION FLOOR</span>
                      <span className="font-mono bg-amber-950/80 px-1 rounded border border-amber-500/30">
                        {lastClaimedPiece.barcode}
                      </span>
                    </div>
                    <div className="font-black text-stone-100 truncate text-[11px] mt-0.5">
                      {lastClaimedPiece.brandName} • {lastClaimedPiece.itemName}
                    </div>
                  </div>
                )}
              </div>

              {/* Multicast Destinations Strip (TikTok, IG, FB, YouTube, Snapchat) */}
              <div className="p-2.5 bg-stone-950 border-t border-stone-800 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-stone-400 flex items-center justify-between">
                  <span>
                    UAE Multicast Relays ({editDestinations.filter(d => d.enabled).length || 2} Active)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="text-amber-400 hover:text-amber-300 text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Keys & Platforms</span>
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-1 text-[9px]">
                  {editDestinations.map(d => (
                    <div
                      key={d.id}
                      className={`p-1 rounded border text-center transition-all ${
                        d.enabled
                          ? 'bg-stone-850 border-emerald-500/50 text-emerald-300 font-bold'
                          : 'bg-stone-900 border-stone-800 text-stone-500'
                      }`}
                      title={`${d.name} - ${d.rtmpUrl}`}
                    >
                      <div className="truncate uppercase">{d.platform}</div>
                      <div className="text-[8px] opacity-75">{d.enabled ? `${d.bitrateKbps / 1000}M` : 'OFF'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ======================= COLUMN 2 (CENTER): AGGREGATED COMMENT FEED (4 COLS) ======================= */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-white rounded-xl border border-stone-200 shadow-xs flex flex-col h-[580px]">
              {/* Feed Header */}
              <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50 rounded-t-xl">
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-tight flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-600" />
                    <span>Booth Chat Feed</span>
                  </h3>
                  <div className="text-[10px] text-stone-500">
                    Listening to <strong className="text-stone-800">{activeBooth?.tiktokHandle}</strong>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900">
                  {comments.length} Messages
                </span>
              </div>

              {/* Scrollable Comments List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
                {comments.map(c => (
                  <div
                    key={c.id}
                    className={`p-2.5 rounded-xl border transition-all text-xs ${
                      c.isClaimIntent
                        ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-200'
                        : 'bg-stone-50 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-white ${
                            c.platform === 'tiktok'
                              ? 'bg-stone-950'
                              : c.platform === 'instagram'
                              ? 'bg-gradient-to-r from-purple-600 to-pink-500'
                              : 'bg-blue-600'
                          }`}
                        >
                          {c.platform}
                        </span>
                        <span className="font-extrabold text-stone-900 text-xs">{c.username}</span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-400">{c.timestamp}</span>
                    </div>

                    <p className="mt-1 text-stone-800 text-xs leading-relaxed font-medium">{c.comment}</p>

                    {/* Highlighted Claim Intent Action */}
                    {c.isClaimIntent && (
                      <div className="mt-2 pt-1.5 border-t border-amber-200 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-bold text-amber-950">
                          {c.extractedSku ? (
                            <span className="font-mono bg-amber-200/80 px-1 py-0.5 rounded">SKU: {c.extractedSku}</span>
                          ) : c.extractedBid ? (
                            <span>BID: AED {c.extractedBid}</span>
                          ) : (
                            <span>⚡ FAST CLAIM REQUEST</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const targetSku = c.extractedSku || (availablePieces[0] ? availablePieces[0].barcode : '');
                            if (targetSku) {
                              handleClaimSku(targetSku, c.username, c.extractedBid);
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-[10px] flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Lock for {c.username}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Simulated Live Comment Input for Auction Testing */}
              <div className="p-2.5 bg-stone-100 border-t border-stone-200 rounded-b-xl">
                <form onSubmit={handlePostComment} className="flex gap-1.5">
                  <select
                    value={simulatedPlatform}
                    onChange={e => setSimulatedPlatform(e.target.value as any)}
                    className="text-[10px] bg-white border border-stone-300 rounded px-1.5 py-1 font-bold text-stone-700"
                  >
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Insta</option>
                    <option value="facebook">FB</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Simulate live comment (e.g. CLAIM VV-BAL-001-0001)..."
                    value={simulatedInputComment}
                    onChange={e => setSimulatedInputComment(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs bg-white border border-stone-300 rounded text-stone-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ======================= COLUMN 3 (RIGHT): FAST-CLAIM CONSOLE & RE-AUCTION (4 COLS) ======================= */}
          <div className="lg:col-span-4 space-y-3">
            {/* Laser Scanner Fast Entry Box */}
            <div className="bg-white p-4 rounded-xl border-2 border-amber-400 shadow-md">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <span className="text-[11px] font-black uppercase text-amber-900 flex items-center gap-1.5">
                  <Scan className="w-4 h-4 text-amber-700" />
                  <span>Fast Barcode Claim ({activeBooth?.boothName.split('-')[0]})</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-950">
                  AUTO-FOCUSED ⚡
                </span>
              </div>

              {/* Active Buyer Selection */}
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-stone-500">Live Buyer Handle (F2)</label>
                  <input
                    type="text"
                    value={activeBuyerHandle}
                    onChange={e => setActiveBuyerHandle(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg font-bold text-stone-900 focus:outline-none focus:border-amber-500 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500">WhatsApp Phone No.</label>
                  <input
                    type="text"
                    value={activeBuyerPhone}
                    onChange={e => setActiveBuyerPhone(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg font-bold text-stone-900 focus:outline-none focus:border-amber-500 text-xs"
                  />
                </div>
              </div>

              {/* Barcode Scanner Form */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (barcodeInput.trim()) {
                    handleClaimSku(barcodeInput.trim(), activeBuyerHandle);
                  }
                }}
                className="mt-3 space-y-2"
              >
                <div className="relative">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="Scan SKU barcode with laser gun..."
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    className="w-full pl-3 pr-20 py-2.5 text-xs font-mono font-black bg-amber-50/60 border-2 border-amber-400 rounded-xl focus:outline-none focus:border-amber-600 text-stone-950 shadow-inner"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-stone-950 hover:bg-stone-850 text-amber-400 rounded-lg font-black text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>Lock</span>
                  </button>
                </div>

                {/* Quick shortcut pills */}
                <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1">
                  <span>[ENTER] Claim</span>
                  <span>[F2] Buyer</span>
                  <span>[F4] -10%</span>
                  <span>[F5] -20%</span>
                  <span>[ESC] Clear</span>
                </div>
              </form>
            </div>

            {/* Atomic Concurrency Lock Card & FAST DROP RE-AUCTION BUTTON */}
            {lastClaimedPiece && (
              <div className="bg-stone-900 text-white p-3 rounded-xl border border-amber-500/50 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-bold text-amber-300">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Atomic Lock Active ({activeBooth?.boothId.toUpperCase()})</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-mono text-[10px] border border-amber-700">
                    Hold: 180s Active
                  </span>
                </div>

                <div className="text-xs">
                  <div className="font-extrabold text-white truncate">
                    {lastClaimedPiece.brandName} • {lastClaimedPiece.itemName}
                  </div>
                  <div className="text-[11px] text-stone-300 flex items-center justify-between mt-1">
                    <span>SKU: <strong className="font-mono text-amber-300">{lastClaimedPiece.barcode}</strong></span>
                    <span>Buyer: <strong className="text-emerald-400">{lastClaimedPiece.lockedByBuyer}</strong></span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-800 flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-amber-400">
                    AED {(lastClaimedPiece.lockedPrice || lastClaimedPiece.estimatedPrice || 120).toFixed(2)}
                  </span>

                  {/* Fast Drop & Re-Auction Action Button */}
                  <button
                    type="button"
                    onClick={() => handleFastDropPiece(lastClaimedPiece.barcode)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    title="Return mistakenly claimed piece back to active stock immediately"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Pass / Release Claim (Re-Auction)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live Session Running Baskets (Isolated to Current Booth) */}
            <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs space-y-2.5 max-h-[350px] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <h4 className="text-xs font-black text-stone-900 uppercase tracking-tight flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-amber-700" />
                  <span>{activeBooth?.boothName.split('-')[0]} Baskets ({buyerPools.length})</span>
                </h4>
                <span className="text-[11px] font-extrabold text-stone-800">
                  {totalClaimedItems} Items Claimed
                </span>
              </div>

              {buyerPools.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs">
                  No active buyer baskets in this booth yet. Scan pieces or click claim in the comment feed!
                </div>
              ) : (
                buyerPools.map(pool => (
                  <div
                    key={pool.buyerHandle}
                    className="p-3 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-amber-50/40 transition-colors space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-extrabold text-stone-900 text-xs">{pool.buyerHandle}</span>
                        <span className="text-[10px] text-stone-500 ml-1.5">({pool.channel})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                        {pool.itemsCount} Garments
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-600 flex items-center justify-between">
                      <span>Weight: {pool.totalWeightKg} KG</span>
                      <span>VAT (5%): AED {pool.vatAed.toFixed(2)}</span>
                    </div>

                    <div className="pt-1.5 border-t border-stone-200 flex items-center justify-between gap-1.5">
                      <div>
                        <div className="text-[9px] text-stone-400 uppercase font-semibold">Total</div>
                        <div className="font-black text-stone-900 text-sm">AED {pool.grandTotalAed.toFixed(2)}</div>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* 1-Click WhatsApp Hub trigger */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHubBuyer(pool);
                            setShowWhatsAppHubModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Open WhatsApp Order Dispatch & Address Parser"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Dispatch Hub</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFinalizeBuyerSession(pool)}
                          className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-300 font-extrabold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Invoice</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== MODAL 1: REAL DYNAMIC QR CAMERA PAIRING =========== */}
      {/* ========================================================================= */}
      {showPairModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                  <QrCode className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-stone-900 text-sm uppercase tracking-tight">
                    Dynamic Mobile Camera Ingest
                  </h3>
                  <div className="text-[11px] text-stone-500">
                    Pair iPhone / Android camera directly to {activeBooth?.boothName}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">✕</button>
            </div>

            {/* Real Canvas-based Dynamic QR Code Component */}
            <div className="flex flex-col items-center justify-center p-4 bg-stone-50 rounded-2xl border border-stone-200 shadow-inner">
              <div className="p-3 bg-white rounded-xl shadow-md border border-stone-200">
                <QRCodeSVG
                  value={dynamicPairUrl}
                  size={190}
                  level="H"
                  includeMargin={true}
                  bgColor="#ffffff"
                  fgColor="#0c0a09"
                />
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="font-mono font-bold text-stone-800">Session Token: {pairToken}</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1 max-w-xs">
                Open Camera App on host phone and point at this QR code. WebRTC establishes direct sub-200ms video feed.
              </p>
            </div>

            {/* Direct Action Links */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(dynamicPairUrl);
                  setClaimFeedback({ text: 'Dynamic pairing link copied to clipboard!', type: 'success' });
                }}
                className="w-full py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Mobile Pairing Link</span>
              </button>

              <a
                href={dynamicPairUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Simulate / Open Mobile Ingest in New Window</span>
              </a>
            </div>

            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
              <button
                type="button"
                onClick={() => setPairToken(`VV-${Date.now().toString(36).toUpperCase().slice(-6)}`)}
                className="text-amber-700 hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate New Token</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="px-4 py-1.5 bg-stone-900 text-white rounded-lg font-bold hover:bg-stone-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== MODAL 2: UAE MULTI-PLATFORM BROADCAST SETTINGS ==== */}
      {/* ========================================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-stone-900 border border-stone-750 text-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm uppercase tracking-tight">
                    {activeBooth?.boothName} • UAE Multicast & Social Settings
                  </h3>
                  <div className="text-[11px] text-stone-400">
                    Supports TikTok, YouTube Live, Snapchat / Custom RTMP, Instagram & Facebook (Saved to Local Storage)
                  </div>
                </div>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-stone-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3.5 text-xs">
              {/* TikTok Chat Handle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-300">
                    TikTok Live Handle (Auto-Chat Listening)
                  </label>
                  <input
                    type="text"
                    value={editTiktokHandle}
                    onChange={e => setEditTiktokHandle(e.target.value)}
                    placeholder="@vintage_dubai_b1"
                    className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-300">
                    Host Profile Name
                  </label>
                  <input
                    type="text"
                    value={editHostName}
                    onChange={e => setEditHostName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg text-white font-bold focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>
              </div>

              {/* Payment Reservation Timeout Engine */}
              <div>
                <label className="block text-[11px] font-bold text-stone-300">
                  Payment Reservation Timeout (Auto-Release Unpaid Baskets)
                </label>
                <select
                  value={editReservationTimeout}
                  onChange={e => setEditReservationTimeout(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg text-amber-300 font-bold focus:outline-none focus:border-amber-400 cursor-pointer text-xs"
                >
                  <option value={15}>15 Minutes (Flash Drop Velocity)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours (Standard UAE Live Selling)</option>
                  <option value={240}>4 Hours (VIP Extended Hold)</option>
                </select>
              </div>

              {/* RTMP Destination Inputs (TikTok, IG, FB, YouTube, Snapchat) */}
              <div className="space-y-3 pt-2 border-t border-stone-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-amber-400 tracking-wider">
                    UAE Multi-Platform Broadcast Endpoints
                  </span>
                  <span className="text-[10px] text-stone-400">Credentials persist in Local Storage</span>
                </div>

                {editDestinations.map((d, index) => (
                  <div key={d.id} className="p-3 bg-stone-950 rounded-xl border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${
                            d.platform === 'tiktok'
                              ? 'bg-stone-800'
                              : d.platform === 'youtube'
                              ? 'bg-red-600'
                              : d.platform === 'snapchat'
                              ? 'bg-yellow-500 text-stone-950'
                              : d.platform === 'instagram'
                              ? 'bg-gradient-to-r from-purple-600 to-pink-500'
                              : 'bg-blue-600'
                          }`}
                        >
                          {d.platform}
                        </span>
                        <span className="font-extrabold text-white text-xs">{d.name}</span>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={d.enabled}
                          onChange={e => {
                            const updated = [...editDestinations];
                            updated[index].enabled = e.target.checked;
                            setEditDestinations(updated);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-stone-400">RTMP Server Ingest URL</label>
                        <input
                          type="text"
                          value={d.rtmpUrl}
                          onChange={e => {
                            const updated = [...editDestinations];
                            updated[index].rtmpUrl = e.target.value;
                            setEditDestinations(updated);
                          }}
                          className="w-full mt-0.5 px-2 py-1.5 bg-stone-900 border border-stone-800 rounded font-mono text-[10px] text-stone-300"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] text-stone-400">
                          <label>Stream Key</label>
                          <button
                            type="button"
                            onClick={() =>
                              setShowKeyVisibility(prev => ({
                                ...prev,
                                [d.id]: !prev[d.id]
                              }))
                            }
                            className="text-[9px] text-amber-400 hover:underline cursor-pointer"
                          >
                            {showKeyVisibility[d.id] ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <input
                          type={showKeyVisibility[d.id] ? 'text' : 'password'}
                          value={d.streamKey}
                          onChange={e => {
                            const updated = [...editDestinations];
                            updated[index].streamKey = e.target.value;
                            setEditDestinations(updated);
                          }}
                          className="w-full mt-0.5 px-2 py-1.5 bg-stone-900 border border-stone-800 rounded font-mono text-[10px] text-amber-300"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer shadow-md"
                >
                  Save & Persist to Storage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== MODAL 3: NATIVE UAE WHATSAPP CHECKOUT & DISPATCH == */}
      {/* ========================================================================= */}
      {showWhatsAppHubModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-base uppercase tracking-tight flex items-center gap-2">
                    <span>Native UAE WhatsApp Closing & Dispatch Hub</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                      1-CLICK DISPATCH
                    </span>
                  </h3>
                  <div className="text-xs text-stone-500">
                    Itemized AED invoices, location requests, text parser, and 4x6" thermal courier shipping slips
                  </div>
                </div>
              </div>
              <button onClick={() => setShowWhatsAppHubModal(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">✕</button>
            </div>

            {/* Buyer Basket Selector if multiple buyers exist */}
            {buyerPools.length > 1 && (
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs">
                <span className="font-bold text-stone-700">Select Active Buyer Basket:</span>
                <select
                  value={selectedHubBuyer?.buyerHandle || ''}
                  onChange={e => {
                    const b = buyerPools.find(p => p.buyerHandle === e.target.value);
                    if (b) setSelectedHubBuyer(b);
                  }}
                  className="bg-white border border-stone-300 rounded-lg px-2.5 py-1 font-extrabold text-stone-900 text-xs focus:outline-none"
                >
                  {buyerPools.map(p => (
                    <option key={p.buyerHandle} value={p.buyerHandle}>
                      {p.buyerHandle} ({p.itemsCount} Garments • AED {p.grandTotalAed.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedHubBuyer ? (
              <div className="space-y-4">
                {/* 1-Click Action Buttons Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Action 1: Share Order Summary */}
                  <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-300 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-xs font-black uppercase text-emerald-950 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-700" />
                        <span>Action 1: Send Order Summary</span>
                      </span>
                      <p className="text-[11px] text-emerald-800 mt-1">
                        Pre-filled wa.me link with itemized breakdown, 5% VAT, delivery fee, and Emirates NBD IBAN details.
                      </p>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <a
                        href={`https://wa.me/${activeBuyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          generateOrderSummaryWhatsAppText(selectedHubBuyer)
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open WhatsApp Summary</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generateOrderSummaryWhatsAppText(selectedHubBuyer));
                          setClaimFeedback({ text: 'Order summary copied to clipboard!', type: 'success' });
                        }}
                        className="p-2 bg-white hover:bg-emerald-100 rounded-lg border border-emerald-300 text-emerald-900 cursor-pointer"
                        title="Copy Summary Text"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Action 2: Request Location / Address */}
                  <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-300 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-xs font-black uppercase text-blue-950 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-700" />
                        <span>Action 2: Request Location Pin</span>
                      </span>
                      <p className="text-[11px] text-blue-800 mt-1">
                        One-tap message asking the buyer to drop their Google Maps pin or UAE delivery address (Emirate/Area/Street).
                      </p>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <a
                        href={`https://wa.me/${activeBuyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          generateRequestLocationWhatsAppText(selectedHubBuyer)
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Location Request</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generateRequestLocationWhatsAppText(selectedHubBuyer));
                          setClaimFeedback({ text: 'Location request copied to clipboard!', type: 'success' });
                        }}
                        className="p-2 bg-white hover:bg-blue-100 rounded-lg border border-blue-300 text-blue-900 cursor-pointer"
                        title="Copy Location Request"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Incoming Text Parser Section */}
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-300 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-stone-200">
                    <span className="text-xs font-black uppercase text-stone-900 flex items-center gap-1.5">
                      <Scan className="w-4 h-4 text-stone-700" />
                      <span>Action 3: Paste Customer WhatsApp Delivery Text</span>
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono">Extracts Name, Mobile & UAE Emirate</span>
                  </div>

                  <textarea
                    rows={3}
                    value={rawAddressInput}
                    onChange={e => {
                      setRawAddressInput(e.target.value);
                      handleParseAddress(e.target.value);
                    }}
                    placeholder="Paste unformatted customer reply here (e.g. Rashid Al Nuaimi +971 50 482 1993 Villa 14B, Al Barsha 2, Dubai)..."
                    className="w-full text-xs font-mono bg-white p-2.5 rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:border-emerald-500"
                  />

                  {/* Parsed Result & Thermal Slip Trigger */}
                  {parsedAddressResult && (
                    <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-300 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-amber-950 flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Parsed Courier Consignment (UAE Format)</span>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                          {parsedAddressResult.city}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-[9px] text-stone-500 uppercase font-semibold">Recipient</span>
                          <div className="font-extrabold text-stone-900 truncate">{parsedAddressResult.name}</div>
                        </div>
                        <div>
                          <span className="text-[9px] text-stone-500 uppercase font-semibold">Phone</span>
                          <div className="font-mono font-bold text-stone-900 truncate">{parsedAddressResult.phone}</div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[9px] text-stone-500 uppercase font-semibold">Address</span>
                          <div className="font-medium text-stone-900 truncate">{parsedAddressResult.streetAddress}</div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${parsedAddressResult.name}\n${parsedAddressResult.phone}\n${parsedAddressResult.streetAddress}\n${parsedAddressResult.city}, UAE`
                            );
                            setClaimFeedback({ text: 'Formatted address copied!', type: 'success' });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Label Text</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStickerForPrint({
                              itemCode: `SHIP-${Date.now().toString().slice(-6)}`,
                              description: `DISPATCH TO: ${parsedAddressResult.name} - ${parsedAddressResult.city}`,
                              category: 'Express UAE Courier',
                              brand: 'Vintage Relove Bale Delivery',
                              retailPriceAed: selectedHubBuyer.grandTotalAed,
                              companyName: 'Vintage Vibe Warehouse 4B, Al Quoz 3, Dubai',
                              trn: '100489201948'
                            });
                          }}
                          className="px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-400 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print 4x6" Thermal Courier Shipping Slip</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-stone-400 text-xs">
                No active buyer baskets found in this booth. Scan garments to start building a basket!
              </div>
            )}

            <div className="pt-2 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWhatsAppHubModal(false)}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 cursor-pointer"
              >
                Close Hub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== MODAL 4: CHECKOUT & SESSION FINALIZATION ========== */}
      {/* ========================================================================= */}
      {showFinalizeModal && finalizedResult && selectedBuyerForFinalize && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-sm uppercase tracking-tight">
                    Session Finalized • {selectedBuyerForFinalize.buyerHandle}
                  </h3>
                  <div className="text-[11px] text-stone-500">
                    Invoice {finalizedResult.invoice?.invoiceNo} • {selectedBuyerForFinalize.itemsCount} Garments Deducted
                  </div>
                </div>
              </div>
              <button onClick={() => setShowFinalizeModal(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">✕</button>
            </div>

            {/* WhatsApp Ready Dispatch Advice Card */}
            <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-emerald-950 text-xs flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Consolidated WhatsApp Order Advice</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (finalizedResult.whatsAppMessage) {
                      navigator.clipboard.writeText(finalizedResult.whatsAppMessage);
                      setClaimFeedback({ text: 'WhatsApp message copied to clipboard!', type: 'success' });
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Message</span>
                </button>
              </div>

              <textarea
                readOnly
                rows={6}
                value={finalizedResult.whatsAppMessage || ''}
                className="w-full text-xs font-mono bg-white p-2.5 rounded-lg border border-emerald-300 text-stone-900 focus:outline-none"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-emerald-800 font-semibold">Direct Customer Link:</span>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(finalizedResult.whatsAppMessage || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open WhatsApp Web Chat</span>
                </a>
              </div>
            </div>

            {/* Thermal Barcode Packing Stickers Generation */}
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-black text-stone-900 text-xs flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-stone-700" />
                  <span>Thermal Barcode Packing Labels ({finalizedResult.thermalStickers?.length || 0} Pieces)</span>
                </span>
                <span className="text-[10px] text-stone-500 font-mono">4x6" Direct Thermal Ready</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                {finalizedResult.thermalStickers?.map((st, idx) => (
                  <div
                    key={st.pieceId}
                    className="p-2 bg-white rounded-lg border border-stone-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-extrabold text-stone-900 text-[11px]">{st.barcode}</div>
                      <div className="text-[10px] text-stone-600 truncate max-w-[160px]">
                        {st.brandName} • {st.itemName} ({st.size})
                      </div>
                      <div className="text-[9px] text-stone-400">Pkg: {st.packageSequence}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStickerForPrint({
                          itemCode: st.barcode,
                          description: `${st.brandName} ${st.itemName} [${st.size}]`,
                          category: 'Live Auction Won',
                          brand: st.brandName,
                          retailPriceAed: 120,
                          companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
                          trn: '100482910300003'
                        });
                      }}
                      className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 cursor-pointer"
              >
                Close & Return to Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== MODAL 5: PER-HOST / BOOTH KPI SUMMARY ============= */}
      {/* ========================================================================= */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-800">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-sm uppercase tracking-tight">
                    Host & Booth Post-Session Performance KPI
                  </h3>
                  <div className="text-[11px] text-stone-500">Instant metrics for items claimed, net revenue & conversion</div>
                </div>
              </div>
              <button onClick={() => setShowAnalyticsModal(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">✕</button>
            </div>

            {/* Active Booth Spotlight */}
            <div className="p-4 bg-purple-50/70 rounded-xl border border-purple-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded bg-purple-700 text-white text-[10px] font-black uppercase">
                    CURRENT SELECTION: {activeBooth?.boothName}
                  </span>
                  <div className="font-black text-stone-900 text-base mt-1">{activeBooth?.hostName}</div>
                  <div className="text-xs text-stone-500">{activeBooth?.tiktokHandle} • {activeBooth?.categoryFocus}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-stone-400 uppercase font-semibold">Net Revenue</div>
                  <div className="font-black text-purple-900 text-xl">AED {activeBooth?.netRevenueAed.toLocaleString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-purple-200 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <div className="text-[10px] text-stone-500 font-bold uppercase">Total Claims</div>
                  <div className="text-base font-black text-stone-900 mt-0.5">{activeBooth?.itemsClaimed} Pieces</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <div className="text-[10px] text-stone-500 font-bold uppercase">Conversion Rate</div>
                  <div className="text-base font-black text-emerald-600 mt-0.5">{activeBooth?.conversionRatePct}%</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <div className="text-[10px] text-stone-500 font-bold uppercase">Velocity</div>
                  <div className="text-base font-black text-purple-600 mt-0.5">{activeBooth?.itemsSoldPerMin} items/min</div>
                </div>
              </div>
            </div>

            {/* Comparison Table Across All 10 Booths */}
            <div className="space-y-2">
              <h4 className="font-black text-stone-900 text-xs uppercase tracking-tight">
                All 10 Booths Leaderboard
              </h4>
              <div className="border border-stone-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 text-[10px] font-black uppercase text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="p-2.5">Booth / Host</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Claims</th>
                      <th className="p-2.5 text-right">Revenue (AED)</th>
                      <th className="p-2.5 text-right">Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {allBoothsData?.booths.map(b => (
                      <tr key={b.boothId} className="hover:bg-stone-50 transition-colors">
                        <td className="p-2.5 font-bold text-stone-900">
                          {b.boothName.split('-')[0].trim()} ({b.hostName})
                        </td>
                        <td className="p-2.5 text-stone-600 truncate max-w-[140px]">{b.categoryFocus}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-stone-800">{b.itemsClaimed}</td>
                        <td className="p-2.5 text-right font-mono font-black text-amber-700">
                          {b.netRevenueAed.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-600">{b.conversionRatePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAnalyticsModal(false)}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 cursor-pointer"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Thermal Barcode Print Modal */}
      {selectedStickerForPrint && (
        <ThermalBarcodeSticker
          sticker={selectedStickerForPrint}
          onClose={() => setSelectedStickerForPrint(null)}
        />
      )}
    </div>
  );
};

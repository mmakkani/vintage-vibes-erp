import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Play,
  Square,
  Barcode,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Layers,
  Tv,
  Eye,
  Flame,
  CheckCircle2,
  Clock,
  RefreshCw,
  Tag,
  Share2,
  Video,
  MonitorPlay,
  Zap,
  Globe,
  FastForward,
  Rewind,
  Pause,
  Smartphone,
  ChevronRight
} from 'lucide-react';
import { LiveStreamSessionStatus } from '../marketing.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { LiveStreamService, LiveBooth } from '../../../services/liveStreamService.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { supabase } from '../../../supabaseClient.ts';

interface SetupLiveBoothConfig {
  id: string;
  boothId?: string;
  name: string;
  boothName?: string;
  assignedOperator?: string;
  masterIngestRtmpUrl?: string;
  masterStreamKey?: string;
  tiktokStreamKey?: string;
  instagramStreamKey?: string;
  facebookStreamKey?: string;
  youtubeStreamKey?: string;
  youTubeStreamKey?: string;
  threadsStreamKey?: string;
  isActive?: boolean;
}

const normalizeSetupBooths = (rawRes: any): SetupLiveBoothConfig[] => {
  const arr = Array.isArray(rawRes?.booths)
    ? rawRes.booths
    : Array.isArray(rawRes?.data)
    ? rawRes.data
    : Array.isArray(rawRes)
    ? rawRes
    : [];
  return arr.map((b: any, idx: number) => ({
    ...b,
    id: b.boothId || b.id || `booth-${idx + 1}`,
    name: b.boothName || b.name || `Booth 0${idx + 1}`,
    youtubeStreamKey: b.youtubeStreamKey || b.youTubeStreamKey || b.masterStreamKey || '',
    tiktokStreamKey: b.tiktokStreamKey || b.tikTokStreamKey || '',
    instagramStreamKey: b.instagramStreamKey || '',
    facebookStreamKey: b.facebookStreamKey || '',
    threadsStreamKey: b.threadsStreamKey || ''
  }));
};

const isValidSetupKey = (k?: string | null): boolean => {
  if (!k || typeof k !== 'string') return false;
  const trimmed = k.trim();
  if (trimmed.length < 6) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'tt_key' ||
    lower === 'ig_key' ||
    lower === 'fb_key' ||
    lower === 'yt_key' ||
    lower === 'th_key' ||
    lower.startsWith('re_live_sec_')
  ) {
    return false;
  }
  return true;
};

const maskKey = (k?: string | null): string => {
  if (!k || typeof k !== 'string') return '';
  const t = k.trim();
  if (t.length <= 4) return '****';
  return `****${t.slice(-4)}`;
};

export const LiveBroadcastDeskTab: React.FC = () => {
  const [session, setSession] = useState<LiveStreamSessionStatus | null>(null);
  const [selectedBooth, setSelectedBooth] = useState('booth-1');
  const [setupBooths, setSetupBooths] = useState<SetupLiveBoothConfig[]>([]);
  const [rtmpStatus, setRtmpStatus] = useState<'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR'>('IDLE');
  const [rtmpMessage, setRtmpMessage] = useState<string>('');
  const [scannerInput, setScannerInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTogglingStream, setIsTogglingStream] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [obsTheme, setObsTheme] = useState<'gold' | 'neon' | 'noir'>('gold');
  const [obsTransparentBg, setObsTransparentBg] = useState(true);
  const [availablePieces, setAvailablePieces] = useState<PieceBreakdownItem[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [activeAngle, setActiveAngle] = useState<'front' | 'back' | 'tag'>('front');
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [youtubeChatConnected, setYoutubeChatConnected] = useState<boolean>(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [isSimulatingClaim, setIsSimulatingClaim] = useState<boolean>(false);

  // ==========================================
  // MATTI BHAI AI VIDEO PRESENTER & VOICE ENGINE STATES
  // ==========================================
  const [aiHostPersona, setAiHostPersona] = useState<'MATTI_JUBBA' | 'YOUNG_HOST' | 'PHOTO_ONLY'>('PHOTO_ONLY');
  const [aiPitchLang, setAiPitchLang] = useState<'URDU' | 'ARABIC' | 'ENGLISH'>('URDU');
  const [autoVoiceoverEnabled, setAutoVoiceoverEnabled] = useState<boolean>(true);
  const [erpLocalSpeakerMuted, setErpLocalSpeakerMuted] = useState<boolean>(true);
  const [isSpeakingPitch, setIsSpeakingPitch] = useState<boolean>(false);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [exportProgressSec, setExportProgressSec] = useState<number>(0);
  const [spotlightViewMode, setSpotlightViewMode] = useState<'AI_STUDIO_MONITOR' | 'PHOTO_INSPECTOR'>('PHOTO_INSPECTOR');
  const [voiceCloneInfo, setVoiceCloneInfo] = useState<{
    sampleExists: boolean;
    sampleUrl: string;
    hasElevenLabsKey: boolean;
    clonedVoiceId: string | null;
    mode: string;
  } | null>(null);
  const [showCloneKeyInput, setShowCloneKeyInput] = useState<boolean>(false);
  const [elevenLabsKeyDraft, setElevenLabsKeyDraft] = useState<string>('');
  const [isSavingCloneKey, setIsSavingCloneKey] = useState<boolean>(false);
  const [isPlayingOriginalSample, setIsPlayingOriginalSample] = useState<boolean>(false);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs for real-time 1280x720 Canvas + Audio -> WebSocket FFmpeg RTMP Streamer
  const wsRelayRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const reconnectTimerRef = useRef<any>(null);
  const isBroadcastingIntentRef = useRef<boolean>(false);
  const fetchInFlightRef = useRef<boolean>(false);
  const lastFetchTsRef = useRef<number>(0);
  const canvasTimerRef = useRef<any>(null);
  const previewLoopRef = useRef<any>(null);
  const pingTimerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const broadcastAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const localMonitorGainRef = useRef<GainNode | null>(null);
  const activeTtsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsRequestIdRef = useRef<number>(0);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const isSpeakingPitchRef = useRef<boolean>(false);
  const lastSpokenTriggerRef = useRef<{ key: string; ts: number }>({ key: '', ts: 0 });
  const erpLocalSpeakerMutedRef = useRef<boolean>(true);
  const activePieceRef = useRef<PieceBreakdownItem | null>(null);
  const frontImgRef = useRef<HTMLImageElement | null>(null);
  const backImgRef = useRef<HTMLImageElement | null>(null);
  const tagImgRef = useRef<HTMLImageElement | null>(null);
  const qrImgRef = useRef<HTMLImageElement | null>(null);
  const lastLoadedBarcodeRef = useRef<string>('');
  const lastSyncedBarcodeRef = useRef<string>('');
  const lastSpokenBarcodeRef = useRef<string>('');
  const activeAngleRef = useRef<'front' | 'back' | 'tag'>('front');
  const aiHostPersonaRef = useRef<'MATTI_JUBBA' | 'YOUNG_HOST' | 'PHOTO_ONLY'>('PHOTO_ONLY');
  const aiPitchLangRef = useRef<'URDU' | 'ARABIC' | 'ENGLISH'>('URDU');
  const recentClaimBannerRef = useRef<{
    handle: string;
    barcode: string;
    itemName: string;
    invoiceNumber: string;
    priceAed: number;
    expiresAt: number;
  } | null>(null);
  const totalClaimsRef = useRef<number>(0);
  const timeRemainingRef = useRef<number>(30);
  const autoIntervalRef = useRef<number>(30);
  const isAutoActiveRef = useRef<boolean>(false);

  // ==========================================
  // 24/7 AUTO-PRESENTER ENGINE STATES
  // ==========================================
  const [isAutoPresenterActive, setIsAutoPresenterActive] = useState(false);
  const [autoPresenterPaused, setAutoPresenterPaused] = useState(false);
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState(30);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [selectedCategorySequence, setSelectedCategorySequence] = useState<string>('CATEGORY_SEQUENCE');
  const [rotationQueue, setRotationQueue] = useState<PieceBreakdownItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);

  useEffect(() => {
    timeRemainingRef.current = timeRemaining;
  }, [timeRemaining]);

  useEffect(() => {
    autoIntervalRef.current = autoIntervalSeconds;
  }, [autoIntervalSeconds]);

  useEffect(() => {
    isAutoActiveRef.current = isAutoPresenterActive;
  }, [isAutoPresenterActive]);

  useEffect(() => {
    activeAngleRef.current = activeAngle;
  }, [activeAngle]);

  useEffect(() => {
    aiHostPersonaRef.current = aiHostPersona;
  }, [aiHostPersona]);

  useEffect(() => {
    aiPitchLangRef.current = aiPitchLang;
  }, [aiPitchLang]);

  useEffect(() => {
    erpLocalSpeakerMutedRef.current = erpLocalSpeakerMuted;
    if (localMonitorGainRef.current && audioCtxRef.current) {
      localMonitorGainRef.current.gain.setValueAtTime(
        erpLocalSpeakerMuted ? 0 : 1.0,
        audioCtxRef.current.currentTime
      );
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
  }, [erpLocalSpeakerMuted]);

  // Fetch WhatsApp PTT Voice Clone Status on mount
  useEffect(() => {
    fetch('/api/marketing/voice-clone/status')
      .then(r => r.json())
      .then(res => {
        if (res?.sampleFound !== undefined) {
          setVoiceCloneInfo({
            sampleExists: Boolean(res.sampleFound),
            sampleUrl: res.cleanedPublicUrl || '/akram_bhai_voice_sample.mp3',
            hasElevenLabsKey: Boolean(res.elevenLabsConfigured),
            clonedVoiceId: res.clonedVoiceId || null,
            mode: res.elevenLabsConfigured ? 'ELEVENLABS_CLONE' : 'BARITONE_ACOUSTIC_MATCH'
          });
        } else if (res?.success && res.data) {
          setVoiceCloneInfo(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveCloneApiKey = async () => {
    if (!elevenLabsKeyDraft.trim()) return;
    setIsSavingCloneKey(true);
    try {
      const r = await fetch('/api/marketing/voice-clone/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elevenLabsApiKey: elevenLabsKeyDraft.trim() })
      });
      const res = await r.json();
      if (res?.success) {
        setVoiceCloneInfo(prev =>
          prev
            ? {
                ...prev,
                hasElevenLabsKey: Boolean(res.elevenLabsConfigured ?? res.data?.hasElevenLabsKey),
                clonedVoiceId: res.clonedVoiceId || res.data?.clonedVoiceId || null,
                mode: 'ELEVENLABS_CLONE'
              }
            : prev
        );
        setShowCloneKeyInput(false);
        setElevenLabsKeyDraft('');
      }
    } catch (_) {
    } finally {
      setIsSavingCloneKey(false);
    }
  };

  const playOriginalWhatsAppVoiceSample = () => {
    if (typeof window === 'undefined') return;
    try {
      setIsPlayingOriginalSample(true);
      const sampleAudio = new Audio('/akram_bhai_voice_sample.mp3');
      sampleAudio.volume = 1.0;
      sampleAudio.onended = () => setIsPlayingOriginalSample(false);
      sampleAudio.onerror = () => setIsPlayingOriginalSample(false);
      sampleAudio.play().catch(() => setIsPlayingOriginalSample(false));
    } catch (_) {
      setIsPlayingOriginalSample(false);
    }
  };

  // Auto-cycle Front -> Back -> Tag angle every 4 seconds
  useEffect(() => {
    const angleTimer = setInterval(() => {
      setActiveAngle(prev => {
        const next = prev === 'front' ? 'back' : prev === 'back' ? 'tag' : 'front';
        activeAngleRef.current = next;
        return next;
      });
    }, 4000);
    return () => clearInterval(angleTimer);
  }, []);

  // Helper: Short Lot Code from full barcode (e.g. BAL-09-2026-0001-LAD-TEE-P0001 -> P0001)
  const getShortLotCode = (barcode?: string): string => {
    if (!barcode) return 'P0001';
    const parts = barcode.split('-');
    const last = parts[parts.length - 1];
    if (last && last.length >= 3) return last.toUpperCase();
    return barcode.slice(-6).toUpperCase();
  };

  // ============================================================================
  // MASTER STUDIO WEB AUDIO MIXER (FEEDS BOTH YOUTUBE LIVE RTMP & LOCAL SPEAKERS)
  // ============================================================================
  const ensureStudioAudioMixer = (): {
    audioCtx: AudioContext;
    broadcastDest: MediaStreamAudioDestinationNode;
    localMonitorGain: GainNode;
  } | null => {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const broadcastDest = ctx.createMediaStreamDestination();
        broadcastAudioDestRef.current = broadcastDest;

        const localMonitorGain = ctx.createGain();
        localMonitorGain.gain.value = erpLocalSpeakerMutedRef.current ? 0 : 1.0;
        localMonitorGain.connect(ctx.destination);
        localMonitorGainRef.current = localMonitorGain;

        // Sub-audible keep-alive carrier so FFmpeg RTMP always has a continuous audio clock
        const carrierOsc = ctx.createOscillator();
        const carrierGain = ctx.createGain();
        carrierGain.gain.value = 0.0002;
        carrierOsc.connect(carrierGain);
        carrierGain.connect(broadcastDest);
        carrierOsc.start();
      }

      const ctx = audioCtxRef.current!;
      const ua = (navigator as any).userActivation;
      if (ctx.state === 'suspended' && (!ua || ua.hasBeenActive || ua.isActive)) {
        ctx.resume().catch(() => {});
      }

      if (localMonitorGainRef.current) {
        localMonitorGainRef.current.gain.value = erpLocalSpeakerMutedRef.current ? 0 : 1.0;
      }

      return {
        audioCtx: ctx,
        broadcastDest: broadcastAudioDestRef.current!,
        localMonitorGain: localMonitorGainRef.current!
      };
    } catch (_) {
      return null;
    }
  };

  // Play a pleasant two-tone luxury showroom chime when a new piece arrives on air
  const playShowroomTransitionChime = () => {
    const mixer = ensureStudioAudioMixer();
    if (!mixer) return;
    try {
      const { audioCtx, broadcastDest, localMonitorGain } = mixer;
      const now = audioCtx.currentTime;
      [587.33, 880].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.14);
        g.gain.setValueAtTime(0.14, now + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.42);
        osc.connect(g);
        g.connect(broadcastDest);
        g.connect(localMonitorGain);
        osc.onended = () => {
          try {
            osc.disconnect();
            g.disconnect();
          } catch (_) {}
        };
        osc.start(now + i * 0.14);
        osc.stop(now + i * 0.14 + 0.43);
      });
    } catch (_) {}
  };

  // Generate Dynamic AI Marketing Script (Visual Subtitle on Screen — matched to WhatsApp Ptt 8.52 PM phrasing)
  const generatePieceMarketingPitch = (
    p: PieceBreakdownItem | null | undefined,
    lang: 'URDU' | 'ARABIC' | 'ENGLISH' = aiPitchLangRef.current
  ): string => {
    if (!p) {
      return 'Ji bhai, Assalamu Alaikum! Inshallah aaj Vintage Vibes Al Ain Live Showroom say 100% original pieces dikha rahay hain.';
    }
    const brand = p.brandName || 'Vintage Archive';
    const title = p.itemName || 'Authentic Vintage Piece';
    const size = p.sizeScanned || 'L';
    const grade = (p.labelGrade || 'Grade A').replace(/\s*\(.*?\)/g, '').trim() || 'Grade A';
    const price = Number(p.retailPriceAed || p.estimatedPrice || p.costPrice || 120);
    const shortCode = getShortLotCode(p.barcode || p.id);

    if (lang === 'ARABIC') {
      return `يا هلا ومرحبا بكم في معرض فينتاج فايبز العين! إن شاء الله نعرض لكم اليوم قطعة أصلية من المخزون: ${brand} ${title}، المقاس ${size}، الدرجة ${grade}. السعر ${price} درهم فقط — اكتبوا MINE ${shortCode} في الشات الآن!`;
    }
    if (lang === 'ENGLISH') {
      return `Assalamu Alaikum brother! Inshallah right now from our Vintage Vibes Al Ain showroom stock we have this authentic ${brand} ${title}, Size ${size} in ${grade} condition. Front, Back and Tag verified on screen — only ${price} Dirhams! Type MINE ${shortCode} in chat to claim!`;
    }
    return `Ji bhai, Assalamu Alaikum! Inshallah aaj humaray Vintage Vibes Al Ain stock say 100% original ${brand} ${title}, Size ${size}, ${grade} condition mein hazir hai. Screen par Front, Back aur Tag dekh saktay hain. To phir abhi chat mein MINE ${shortCode} likhein — sirf ${price} Dirham!`;
  };

  // Generate Native Spoken Script for Cloned WhatsApp PTT Voice / Genuine Male Baritone Voice (ur-PK-AsadNeural -6Hz)
  const generatePieceSpokenScript = (
    p: PieceBreakdownItem | null | undefined,
    lang: 'URDU' | 'ARABIC' | 'ENGLISH' = aiPitchLangRef.current,
    isOneTimeIntro = false
  ): string => {
    if (isOneTimeIntro || !p) {
      if (lang === 'ARABIC') {
        return 'يا هلا ومرحبا بكم في البث المباشر لمعرض فينتاج فايبز العين! إن شاء الله نعرض لكم اليوم قطع أصلية من المخزون مع الصورة الأمامية والخلفية والتاغ الأصلي. لحجز أي قطعة اكتبوا MINE في الشات المباشر!';
      }
      if (lang === 'ENGLISH') {
        return 'Assalamu Alaikum brother! Welcome to Vintage Vibes Al Ain Live Showroom! Inshallah today we are showcasing 100 percent authentic vintage pieces from our stock with front view, back view, and original brand tag. Type MINE in the live chat to claim any piece!';
      }
      return 'جی بھائی، السلام علیکم! ونٹیج وائبز العین لائیو شوروم میں خوش آمدید! انشاء اللہ آج آپ کو ہمارے سٹاک کے سو فیصد اوریجنل پیسز فرنٹ، بیک اور اوریجنل برانڈ ٹیگ کے ساتھ لائیو دکھائے جا رہے ہیں۔ جو بھی پیس پسند آئے، اپنے نام لاک کرنے کے لیے چیٹ میں MINE لکھیں!';
    }
    const brand = p.brandName || 'Vintage Archive';
    const title = p.itemName || 'Authentic Vintage Piece';
    const size = p.sizeScanned || 'L';
    const grade = (p.labelGrade || 'Grade A').replace(/\s*\(.*?\)/g, '').trim() || 'Grade A';
    const price = Number(p.retailPriceAed || p.estimatedPrice || p.costPrice || 120);
    const shortCode = getShortLotCode(p.barcode || p.id);

    if (lang === 'ARABIC') {
      return `قطعة أصلية من المخزون: ${brand} ${title}، المقاس ${size}، بحالة ${grade}. السعر ${price} درهم فقط. اكتبوا في الشات MINE ${shortCode} للحجز!`;
    }
    if (lang === 'ENGLISH') {
      return `Authentic piece on screen: ${brand} ${title}, Size ${size}, ${grade} condition. Live price only ${price} Dirhams! Type MINE ${shortCode} in chat to claim!`;
    }
    return `جی بھائی، سکرین پر موجود ہے سو فیصد اوریجنل ${brand} ${title}، سائز ${size}، ${grade} کنڈیشن میں، قیمت صرف ${price} درہم! لاک کرنے کے لیے چیٹ میں MINE ${shortCode} لکھیں!`;
  };

  // Stop any active or in-flight TTS immediately to guarantee ZERO echo/doubling
  const stopActiveTtsPlayback = () => {
    try {
      if (ttsAbortControllerRef.current) {
        ttsAbortControllerRef.current.abort();
        ttsAbortControllerRef.current = null;
      }
    } catch (_) {}
    try {
      if (activeTtsSourceRef.current) {
        activeTtsSourceRef.current.onended = null;
        activeTtsSourceRef.current.stop();
        activeTtsSourceRef.current.disconnect();
        activeTtsSourceRef.current = null;
      }
    } catch (_) {}
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (_) {}
    isSpeakingPitchRef.current = false;
    setIsSpeakingPitch(false);
  };

  // Speak AI Marketing Pitch through BOTH YouTube Live RTMP Stream AND Local Speakers via /api/marketing/tts
  // Automatic calls run ONLY ONE TIME (1x) for the Showroom Introduction — NEVER repeating bar-bar!
  const speakPieceMarketingPitch = async (
    pieceToSpeak?: PieceBreakdownItem | null,
    langOverride?: 'URDU' | 'ARABIC' | 'ENGLISH',
    forceManual = false
  ) => {
    if (typeof window === 'undefined') return;

    // If triggered automatically (not manual button click), ONLY allow speaking ONE TIME for the session introduction!
    if (!forceManual) {
      if (lastSpokenBarcodeRef.current === 'INTRO_SPOKEN_ONCE') {
        return;
      }
      lastSpokenBarcodeRef.current = 'INTRO_SPOKEN_ONCE';
    }

    const p = pieceToSpeak || activePieceRef.current || session?.activeOnAirPiece;
    const lang = langOverride || aiPitchLangRef.current;

    const reqId = ++ttsRequestIdRef.current;
    stopActiveTtsPlayback();

    const isOneTimeIntro = !forceManual;
    const spokenScript = generatePieceSpokenScript(p, lang, isOneTimeIntro);
    const mixer = ensureStudioAudioMixer();
    if (!mixer) return;

    isSpeakingPitchRef.current = true;
    setIsSpeakingPitch(true);

    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;

    try {
      const res = await fetch(
        `/api/marketing/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(spokenScript)}`,
        { signal: controller.signal }
      );
      if (reqId !== ttsRequestIdRef.current) return;

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        if (reqId !== ttsRequestIdRef.current) return;

        if (arrayBuf.byteLength > 0) {
          const audioBuf = await mixer.audioCtx.decodeAudioData(arrayBuf.slice(0));
          if (reqId !== ttsRequestIdRef.current) return;

          // Ensure any prior source is stopped before starting the new buffer
          try {
            if (activeTtsSourceRef.current) {
              activeTtsSourceRef.current.onended = null;
              activeTtsSourceRef.current.stop();
              activeTtsSourceRef.current.disconnect();
              activeTtsSourceRef.current = null;
            }
          } catch (_) {}

          const source = mixer.audioCtx.createBufferSource();
          source.buffer = audioBuf;

          // Studio voice EQ (85Hz high-pass + 10kHz low-pass) + 0.58 headroom gain + gentle limiter so sound NEVER clips ("phatna")
          const hpFilter = mixer.audioCtx.createBiquadFilter();
          hpFilter.type = 'highpass';
          hpFilter.frequency.setValueAtTime(85, mixer.audioCtx.currentTime);

          const lpFilter = mixer.audioCtx.createBiquadFilter();
          lpFilter.type = 'lowpass';
          lpFilter.frequency.setValueAtTime(10000, mixer.audioCtx.currentTime);

          const ttsGain = mixer.audioCtx.createGain();
          ttsGain.gain.setValueAtTime(0.58, mixer.audioCtx.currentTime);

          const compressor = mixer.audioCtx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-6, mixer.audioCtx.currentTime);
          compressor.knee.setValueAtTime(6, mixer.audioCtx.currentTime);
          compressor.ratio.setValueAtTime(3, mixer.audioCtx.currentTime);
          compressor.attack.setValueAtTime(0.005, mixer.audioCtx.currentTime);
          compressor.release.setValueAtTime(0.12, mixer.audioCtx.currentTime);

          source.connect(hpFilter);
          hpFilter.connect(lpFilter);
          lpFilter.connect(ttsGain);
          ttsGain.connect(compressor);
          compressor.connect(mixer.broadcastDest);
          compressor.connect(mixer.localMonitorGain);

          activeTtsSourceRef.current = source;
          source.onended = () => {
            try {
              source.disconnect();
              hpFilter.disconnect();
              lpFilter.disconnect();
              ttsGain.disconnect();
              compressor.disconnect();
            } catch (_) {}
            if (activeTtsSourceRef.current === source) {
              activeTtsSourceRef.current = null;
              isSpeakingPitchRef.current = false;
              setIsSpeakingPitch(false);
              lastSpokenTriggerRef.current.ts = Date.now();
            }
          };
          source.start(0);
          return;
        }
      }
      isSpeakingPitchRef.current = false;
      setIsSpeakingPitch(false);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('[Studio TTS] Male TTS fetch error:', e?.message);
      }
      if (reqId === ttsRequestIdRef.current) {
        isSpeakingPitchRef.current = false;
        setIsSpeakingPitch(false);
      }
    }
  };

  // Preload all 3 garment images (Front, Back, Tag) + QR Code for the Canvas without huge Base64 string concatenations
  const preloadPieceImages = (piece: PieceBreakdownItem | null) => {
    if (!piece || typeof Image === 'undefined') return;
    const fLen = (piece.frontImageUrl || '').length;
    const bLen = (piece.backImageUrl || '').length;
    const tLen = (piece.tagImageUrl || '').length;
    const key = `${piece.barcode || piece.id}_${fLen}_${bLen}_${tLen}`;
    if (key === lastLoadedBarcodeRef.current) return;
    lastLoadedBarcodeRef.current = key;

    const loadImg = (url: string | undefined, targetRef: React.MutableRefObject<HTMLImageElement | null>) => {
      if (!url) {
        targetRef.current = null;
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const prev = targetRef.current;
        targetRef.current = img;
        if (prev && prev !== img) {
          prev.onload = null;
          prev.onerror = null;
        }
      };
      img.onerror = () => {
        img.onload = null;
        img.onerror = null;
      };
      img.src = url.startsWith('data:') ? url : `${url}${url.includes('?') ? '&' : '?'}cors=1`;
    };

    const frontUrl = piece.frontImageUrl || piece.images?.[0] || '';
    const backUrl = piece.backImageUrl || piece.images?.[1] || frontUrl;
    const tagUrl = piece.tagImageUrl || piece.images?.[2] || frontUrl;

    loadImg(frontUrl, frontImgRef);
    loadImg(backUrl, backImgRef);
    loadImg(tagUrl, tagImgRef);

    const sku = piece.barcode || piece.id || 'VV-001';
    const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(sku)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(checkoutUrl)}`;
    loadImg(qrUrl, qrImgRef);
  };

  // Sync active piece to backend (/api/marketing/live-session/scan) with lightweight payload (avoiding multi-MB Base64 echo loops)
  const syncActivePieceWithServer = async (piece: PieceBreakdownItem | null, boothId: string, force = false) => {
    if (!piece) return;
    const code = piece.barcode || piece.id;
    if (!force && lastSyncedBarcodeRef.current === `${boothId}:${code}`) return;
    lastSyncedBarcodeRef.current = `${boothId}:${code}`;
    try {
      const stripDataUrl = (u?: string) => (u && u.startsWith('data:') && u.length > 4096 ? '' : u || '');
      const lightPiece = {
        ...piece,
        frontImageUrl: stripDataUrl(piece.frontImageUrl),
        backImageUrl: stripDataUrl(piece.backImageUrl),
        tagImageUrl: stripDataUrl(piece.tagImageUrl),
        images: undefined
      };
      await fetch('/api/marketing/live-session/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: code,
          piece: lightPiece,
          boothId
        })
      });
    } catch (_) {}
  };

  // Connect YouTube Live Chat listener for this booth
  const connectYouTubeLiveChat = async (boothId: string) => {
    try {
      const normBooth = boothId.replace(/^booth[-_]?0*/i, 'booth-');
      const res = await fetch(`/api/live/booths/${encodeURIComponent(normBooth)}/youtube/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        setYoutubeChatConnected(Boolean(data.connected));
        if (data.videoId) setYoutubeVideoId(data.videoId);
      }
    } catch (_) {}
  };

  // Normalize booth IDs so 'booth-1' and 'booth_01' match cleanly
  const matchesBoothId = (a?: string, b?: string) => {
    if (!a || !b) return false;
    const norm = (s: string) => s.replace(/^booth[-_]?0*/i, 'booth-');
    return norm(a) === norm(b);
  };

  const currentSetupBooth: SetupLiveBoothConfig | undefined =
    setupBooths.find(b => matchesBoothId(b.id, selectedBooth)) || setupBooths[0];

  // Resolve platform stream keys directly from Global Setup (/api/setup/live-booths)
  const platformTargets = [
    {
      id: 'youtube',
      label: 'YouTube Live',
      key:
        (isValidSetupKey(currentSetupBooth?.youtubeStreamKey) && currentSetupBooth?.youtubeStreamKey) ||
        (isValidSetupKey(currentSetupBooth?.masterStreamKey) && currentSetupBooth?.masterStreamKey) ||
        '',
      rtmpUrl: currentSetupBooth?.masterIngestRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
      color: 'text-red-300',
      iconColor: 'text-red-500'
    },
    {
      id: 'tiktok',
      label: 'TikTok Live',
      key: (isValidSetupKey(currentSetupBooth?.tiktokStreamKey) && currentSetupBooth?.tiktokStreamKey) || '',
      rtmpUrl: 'rtmp://push.tiktok.com/live/',
      color: 'text-amber-300',
      iconColor: 'text-amber-400'
    },
    {
      id: 'instagram',
      label: 'Instagram Live',
      key: (isValidSetupKey(currentSetupBooth?.instagramStreamKey) && currentSetupBooth?.instagramStreamKey) || '',
      rtmpUrl: 'rtmps://live-upload.instagram.com:443/rtmp/',
      color: 'text-rose-300',
      iconColor: 'text-rose-400'
    },
    {
      id: 'facebook',
      label: 'Facebook Live',
      key: (isValidSetupKey(currentSetupBooth?.facebookStreamKey) && currentSetupBooth?.facebookStreamKey) || '',
      rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
      color: 'text-blue-300',
      iconColor: 'text-blue-400'
    },
    {
      id: 'threads',
      label: 'Threads Live',
      key: (isValidSetupKey(currentSetupBooth?.threadsStreamKey) && currentSetupBooth?.threadsStreamKey) || '',
      rtmpUrl: 'rtmps://live-upload.instagram.com:443/rtmp/',
      color: 'text-purple-300',
      iconColor: 'text-purple-400'
    }
  ];

  const connectedPlatforms = platformTargets.filter(p => Boolean(p.key));

  // Helper: Build organized queue based on category sequence
  const buildRotationQueue = (pieces: PieceBreakdownItem[], sequenceMode: string): PieceBreakdownItem[] => {
    const inStock = pieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
    if (inStock.length === 0) return [];

    if (sequenceMode === 'CATEGORY_SEQUENCE') {
      const mens = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('men') || text.includes('jacket') || text.includes('denim') || text.includes('hoodie');
      });
      const ladies = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return !mens.includes(p) && (text.includes('lad') || text.includes('women') || text.includes('dress') || text.includes('skirt') || text.includes('knit'));
      });
      const cream = inStock.filter(p => {
        const grade = `${p.labelGrade || ''}`.toLowerCase();
        return !mens.includes(p) && !ladies.includes(p) && (grade.includes('cream') || grade.includes('grade a'));
      });
      const others = inStock.filter(p => !mens.includes(p) && !ladies.includes(p) && !cream.includes(p));

      const combined = [...mens, ...ladies, ...cream, ...others];
      return combined.length > 0 ? combined : inStock;
    }

    if (sequenceMode === 'CREAM_GRADE_A') {
      const filtered = inStock.filter(p => `${p.labelGrade || ''}`.toLowerCase().includes('cream') || `${p.labelGrade || ''}`.toLowerCase().includes('grade a'));
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'VINTAGE_ARCHIVE') {
      const filtered = inStock.filter(p => `${p.style || ''} ${p.brandTier || ''} ${p.itemName || ''}`.toLowerCase().includes('vintage') || `${p.brandTier || ''}`.toLowerCase().includes('luxury'));
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'MENS_ONLY') {
      const filtered = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('men') || text.includes('jacket') || text.includes('denim') || text.includes('hoodie');
      });
      return filtered.length > 0 ? filtered : inStock;
    }

    if (sequenceMode === 'LADIES_ONLY') {
      const filtered = inStock.filter(p => {
        const text = `${p.itemName || ''} ${p.style || ''} ${p.category || ''}`.toLowerCase();
        return text.includes('lad') || text.includes('women') || text.includes('dress') || text.includes('skirt') || text.includes('knit');
      });
      return filtered.length > 0 ? filtered : inStock;
    }

    return inStock;
  };

  const fetchSessionStatus = async (force = false) => {
    if (!force && (fetchInFlightRef.current || Date.now() - lastFetchTsRef.current < 2500)) {
      return;
    }
    fetchInFlightRef.current = true;
    lastFetchTsRef.current = Date.now();
    try {
      const normBooth = selectedBooth.replace(/^booth[-_]?0*/i, 'booth-');
      const [liveBooths, allPieces, apiLiveSession, setupBoothsRes, overviewRes, ytStatusRes] = await Promise.all([
        LiveStreamService.getBooths(),
        PurchaseService.getPieces(),
        fetch('/api/marketing/live-session').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/setup/live-booths').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/marketing/overview').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/live/booths/${encodeURIComponent(normBooth)}/youtube/status`).then(r => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      const normalizedBooths = normalizeSetupBooths(setupBoothsRes);
      if (normalizedBooths.length > 0) {
        setSetupBooths(normalizedBooths);
      }

      if (ytStatusRes) {
        setYoutubeChatConnected(Boolean(ytStatusRes.connected));
        if (ytStatusRes.videoId) setYoutubeVideoId(ytStatusRes.videoId);
        if (Array.isArray(ytStatusRes.recentMessages) && ytStatusRes.recentMessages.length > 0) {
          setRecentComments(ytStatusRes.recentMessages);
        }
      }

      if (overviewRes) {
        if (Array.isArray(overviewRes.recentClaims)) {
          setRecentClaims(overviewRes.recentClaims);
          totalClaimsRef.current = overviewRes.recentClaims.length;
        }
        if (Array.isArray(overviewRes.recentComments) && (!ytStatusRes?.recentMessages || ytStatusRes.recentMessages.length === 0)) {
          setRecentComments(overviewRes.recentComments);
        }
      }

      const currentBooth = liveBooths.find(b => matchesBoothId(b.id, selectedBooth)) || liveBooths[0];
      const inStock = (allPieces || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
      setAvailablePieces(inStock);

      const activeOnAir =
        inStock.find((p: PieceBreakdownItem) => p.barcode === currentBooth?.active_product_sku || p.id === currentBooth?.active_product_sku) ||
        inStock.find((p: PieceBreakdownItem) => p.barcode === apiLiveSession?.activeOnAirPiece?.barcode) ||
        apiLiveSession?.activeOnAirPiece ||
        inStock[0] ||
        null;

      activePieceRef.current = activeOnAir;
      preloadPieceImages(activeOnAir);
      if (activeOnAir) {
        syncActivePieceWithServer(activeOnAir, selectedBooth);
      }

      const isLive = Boolean(currentBooth?.is_broadcasting || wsRelayRef.current?.readyState === WebSocket.OPEN);
      const startedAtTs = apiLiveSession?.startedAt || (isLive ? (sessionStartTime || Date.now()) : null);
      const publicOrigin =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'https://vintagevibesgk.com'
          : window.location.origin;

      setSession({
        isBroadcasting: isLive,
        startedAt: startedAtTs,
        uptimeSeconds: isLive && startedAtTs ? Math.floor((Date.now() - startedAtTs) / 1000) : 0,
        activeBoothId: currentBooth?.id || selectedBooth,
        activeBoothName: currentSetupBooth?.name || currentBooth?.booth_name || apiLiveSession?.activeBoothName || 'Live Booth 01',
        activeOnAirPiece: activeOnAir,
        scannerFeed: Array.isArray(apiLiveSession?.scannerFeed) ? apiLiveSession.scannerFeed : [],
        totalClaimsInSession: Number(apiLiveSession?.totalClaimsInSession ?? overviewRes?.recentClaims?.length ?? 0),
        totalRevenueAedInSession: Number(apiLiveSession?.totalRevenueAedInSession ?? currentBooth?.current_deal_price ?? 0),
        obsOverlayUrl: `${publicOrigin}/live-overlay?booth=${selectedBooth}`
      });
    } catch (err) {
      console.warn('Error fetching live session status:', err);
    } finally {
      fetchInFlightRef.current = false;
    }
  };

  // ============================================================================
  // SHARED 1280x720 30FPS AI STUDIO CANVAS RENDERER
  // Renders Matti Bhai (White Jubba) + 3-Angle Piece (Front, Back, Tag) + Specs + Subtitles
  // ============================================================================
  const drawStudioCanvasFrame = (ctx: CanvasRenderingContext2D, boothLabel: string) => {
    const p = activePieceRef.current;
    const curAngle = activeAngleRef.current;
    const hostMode = aiHostPersonaRef.current;

    const fitText = (text: string, maxWidth: number): string => {
      const clean = String(text || '').trim();
      if (ctx.measureText(clean).width <= maxWidth) return clean;
      let truncated = clean;
      while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + '…';
    };

    const drawRoundedMedia = (
      media: HTMLImageElement | HTMLVideoElement | null,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fallbackLabel: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.clip();

      const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(x, y, w, h);

      let mediaW = 0;
      let mediaH = 0;
      if (media && 'videoWidth' in media) {
        mediaW = media.videoWidth;
        mediaH = media.videoHeight;
      } else if (media && 'naturalWidth' in media && media.complete) {
        mediaW = media.naturalWidth;
        mediaH = media.naturalHeight;
      }

      if (media && mediaW > 0 && mediaH > 0) {
        try {
          const isCamVideo = 'videoWidth' in media;
          const mediaRatio = mediaW / mediaH;
          const boxRatio = w / h;
          let drawW = w;
          let drawH = h;
          let drawX = x;
          let drawY = y;
          if (isCamVideo) {
            const scale = Math.min(w / mediaW, h / mediaH);
            drawW = mediaW * scale;
            drawH = mediaH * scale;
            drawX = x + (w - drawW) / 2;
            drawY = y + (h - drawH) / 2;
            ctx.save();
            ctx.translate(drawX + drawW, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(media, 0, 0, drawW, drawH);
            ctx.restore();
          } else {
            if (mediaRatio > boxRatio) {
              drawH = h;
              drawW = h * mediaRatio;
              drawX = x - (drawW - w) / 2;
            } else {
              drawW = w;
              drawH = w / mediaRatio;
              drawY = y - (drawH - h) / 2;
            }
            ctx.drawImage(media, drawX, drawY, drawW, drawH);
          }
        } catch (_) {}
      } else {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(fallbackLabel, x + 14, y + h / 2);
      }
      ctx.restore();
    };

    // 1. Rich Luxury Obsidian & Warm Gold Studio Background
    const bg = ctx.createLinearGradient(0, 0, 1280, 720);
    bg.addColorStop(0, '#070a12');
    bg.addColorStop(0.55, '#0f172a');
    bg.addColorStop(1, '#1c1610');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 1272, 712);

    // 2. Top Studio Header Bar (0..62px)
    ctx.fillStyle = 'rgba(7, 10, 18, 0.94)';
    ctx.fillRect(0, 0, 1280, 62);
    const lineGrad = ctx.createLinearGradient(0, 60, 1280, 60);
    lineGrad.addColorStop(0, '#f59e0b');
    lineGrad.addColorStop(0.5, '#fde68a');
    lineGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, 60, 1280, 2);

    const pulse = Math.sin(Date.now() / 300) > 0;
    ctx.fillStyle = pulse ? '#dc2626' : '#b91c1c';
    ctx.beginPath();
    ctx.roundRect(24, 13, 150, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('● LIVE ON AIR', 38, 36);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 20px serif';
    ctx.fillText(
      hostMode === 'MATTI_JUBBA'
        ? 'VINTAGE VIBE • MATTI BHAI AI SHOWROOM STUDIO'
        : 'VINTAGE VIBE • LUXURY ARCHIVE LIVE STUDIO',
      190,
      38
    );

    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(775, 14, 175, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`⚡ CLAIMS: ${totalClaimsRef.current} LOCKED`, 792, 36);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 14px monospace';
    const rightHeader = `${boothLabel.slice(0, 18).toUpperCase()} • ${new Date().toLocaleTimeString()}`;
    ctx.fillText(fitText(rightHeader, 290), 968, 36);

    const heroImg =
      curAngle === 'back'
        ? backImgRef.current || frontImgRef.current
        : curAngle === 'tag'
        ? tagImgRef.current || frontImgRef.current
        : frontImgRef.current;

    const angleTitle =
      curAngle === 'front'
        ? '1/3 • FRONT VIEW'
        : curAngle === 'back'
        ? '2/3 • BACK VIEW'
        : '3/3 • BRAND TAG';

    const shortCode = getShortLotCode(p?.barcode || p?.id);

    // 3. LEFT STAGE: 3-ANGLE GARMENT GALLERY (FRONT, BACK, TAG - ZERO HEAVY VIDEO DECODING)
    drawRoundedMedia(heroImg, 24, 74, 426, 512, 20, 'LOADING ARCHIVE PHOTO...');
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(24, 74, 426, 512, 20);
    ctx.stroke();

    ctx.fillStyle = 'rgba(7, 10, 18, 0.86)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(40, 90, 235, 34, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`📸 ${angleTitle}`, 54, 112);

    const vThumbs: Array<{ id: 'front' | 'back' | 'tag'; label: string; img: HTMLImageElement | null; y: number }> = [
      { id: 'front', label: 'FRONT VIEW', img: frontImgRef.current, y: 74 },
      { id: 'back', label: 'BACK VIEW', img: backImgRef.current || frontImgRef.current, y: 250 },
      { id: 'tag', label: 'TAG / LABEL', img: tagImgRef.current || frontImgRef.current, y: 426 }
    ];
    vThumbs.forEach(t => {
      const isCurrent = curAngle === t.id;
      drawRoundedMedia(t.img, 464, t.y, 134, 160, 14, t.label);
      ctx.strokeStyle = isCurrent ? '#fbbf24' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = isCurrent ? 3.5 : 1.5;
      ctx.beginPath();
      ctx.roundRect(464, t.y, 134, 160, 14);
      ctx.stroke();
    });

    // 4. RIGHT SIDE: GARMENT SPECIFICATIONS & INSTANT CLAIM HUD (x: 614..1254, y: 74..586)
    const brand = (p?.brandName || 'VINTAGE ARCHIVE').toUpperCase();
    const style = (p?.style || 'AUTHENTIC GRAIL').toUpperCase();
    const category = p?.category || 'Vintage Apparel';
    const itemTitle = p?.itemName || 'Authentic Vintage Piece';
    const priceAed = Number(p?.retailPriceAed || p?.estimatedPrice || p?.costPrice || 120);
    const priceUsd = Math.round(priceAed * 0.272);
    const size = p?.sizeScanned || 'L';
    const rawGrade = p?.labelGrade || 'Grade A (Clean Thrift)';
    const cleanGrade = rawGrade.replace(/\s*\(.*?\)/g, '').trim() || 'Grade A';
    const origin = p?.countryOfOrigin || 'USA / Europe';

    ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(612, 74, 642, 512, 20);
    ctx.fill();
    ctx.stroke();

    // Brand & Tier Pill
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(632, 90, 380, 28, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(fitText(`✨ ${brand} • ${style}`, 360), 644, 109);

    // Lot Code Pill
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(1024, 90, 210, 28, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`🏷️ CODE: #${shortCode}`, 1040, 109);

    // Garment Main Title (Zero Overflow!)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px serif';
    ctx.fillText(fitText(itemTitle, 600), 632, 150);

    // Price Banner & Size Highlight Row (y: 166..236)
    const priceGrad = ctx.createLinearGradient(632, 166, 960, 236);
    priceGrad.addColorStop(0, '#fbbf24');
    priceGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = priceGrad;
    ctx.beginPath();
    ctx.roundRect(632, 166, 340, 68, 14);
    ctx.fill();

    ctx.fillStyle = '#070a12';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('LIVE BROADCAST DEAL PRICE', 650, 185);
    ctx.font = '900 28px monospace';
    ctx.fillText(fitText(`AED ${priceAed} / $${priceUsd}`, 310), 650, 220);

    // Big Size Box next to Price
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(986, 166, 248, 68, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SCANNED GARMENT SIZE', 1004, 185);
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 26px monospace';
    ctx.fillText(fitText(`SIZE: ${size}`, 215), 1004, 220);

    // 6-Cell Garment Details Grid (3 cols x 2 rows, y: 246..368)
    const specs = [
      { label: 'BRAND LABEL', value: brand },
      { label: 'CONDITION / GRADE', value: cleanGrade },
      { label: 'CATEGORY', value: category },
      { label: 'STYLE / FIT', value: p?.style || 'Vintage Cut' },
      { label: 'ORIGIN', value: origin },
      { label: '3-PHOTO VERIFIED', value: 'Front • Back • Tag' }
    ];

    specs.forEach((sp, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const bx = 632 + col * 204;
      const by = 246 + row * 60;
      ctx.fillStyle = 'rgba(7, 10, 18, 0.82)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, 194, 52, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(sp.label, bx + 12, by + 18);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(fitText(sp.value, 170), bx + 12, by + 39);
    });

    // 5. INSTANT LIVE CHAT CLAIM & QR CHECKOUT BOX (x: 632, y: 376, w: 602, h: 196)
    const claimGrad = ctx.createLinearGradient(632, 376, 1234, 572);
    claimGrad.addColorStop(0, 'rgba(7, 10, 18, 0.95)');
    claimGrad.addColorStop(1, 'rgba(28, 22, 16, 0.95)');
    ctx.fillStyle = claimGrad;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(632, 376, 602, 196, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('⚡ HOW TO CLAIM THIS PIECE IN LIVE CHAT:', 652, 404);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Type any command below in YouTube / Social Live Chat:', 652, 428);

    const cmdPills = [
      { text: 'MINE', w: 110, x: 652 },
      { text: 'CLAIM', w: 118, x: 772 },
      { text: `MINE ${shortCode}`, w: 170, x: 900 }
    ];
    cmdPills.forEach(pill => {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.roundRect(pill.x, 442, pill.w, 46, 10);
      ctx.fill();
      ctx.fillStyle = '#070a12';
      ctx.font = '900 21px monospace';
      ctx.fillText(fitText(pill.text, pill.w - 20), pill.x + 14, 472);
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('✔ Instant Draft Invoice Created  •  ✔ 15-Min Cart Lock', 652, 514);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(fitText(`Full SKU: ${p?.barcode || 'VV-001'}`, 415), 652, 542);

    // QR Code Card on Right of Claim Box (x: 1088, y: 390, w: 130, h: 168)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(1088, 390, 130, 140, 12);
    ctx.fill();
    if (qrImgRef.current && qrImgRef.current.complete && qrImgRef.current.naturalWidth > 0) {
      try {
        ctx.drawImage(qrImgRef.current, 1096, 396, 114, 114);
      } catch (_) {}
    }
    ctx.fillStyle = '#070a12';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SCAN TO BUY', 1111, 523);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('INSTANT CHECKOUT', 1096, 548);

    // 6. AI MARKETING PITCH TELEPROMPTER BAR (x: 24, y: 598, w: 1230, h: 42)
    ctx.fillStyle = 'rgba(7, 10, 18, 0.94)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(24, 598, 1230, 42, 10);
    ctx.fill();
    ctx.stroke();

    const pitchText = generatePieceMarketingPitch(p, aiPitchLangRef.current);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('🎙️ MATTI BHAI AI PITCH:', 40, 624);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(fitText(pitchText, 1005), 228, 624);

    // 7. CELEBRATION BANNER OVERLAY WHEN A VIEWER CLAIMS A PIECE!
    const claimBanner = recentClaimBannerRef.current;
    if (claimBanner && Date.now() < claimBanner.expiresAt) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 78, 59, 0.96)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(140, 240, 1000, 190, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 28px monospace';
      ctx.fillText('🎉 PIECE CLAIMED & RESERVED LIVE! 🎉', 310, 295);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px serif';
      ctx.fillText(fitText(`SOLD TO ${claimBanner.handle.toUpperCase()}`, 920), 180, 345);

      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(
        fitText(
          `${claimBanner.itemName} • AED ${claimBanner.priceAed} • INVOICE #${claimBanner.invoiceNumber}`,
          920
        ),
        180,
        392
      );
      ctx.restore();
    }

    // 8. Bottom Footer / Auto-Presenter Progress Bar (y: 650..698)
    if (isAutoActiveRef.current) {
      const rem = timeRemainingRef.current;
      const total = Math.max(1, autoIntervalRef.current);
      const pct = Math.max(0, Math.min(1, (total - rem) / total));

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(24, 650, 1230, 46, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
      ctx.beginPath();
      ctx.roundRect(26, 652, Math.max(16, Math.round(1226 * pct)), 42, 10);
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`⚡ 24/7 AI AUTO-PRESENTER • MATTI BHAI + FRONT/BACK/TAG • NEXT PIECE IN ${rem}s`, 44, 678);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('TYPE "MINE" OR "CLAIM" IN CHAT TO LOCK!', 885, 678);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(24, 650, 1230, 46, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(
        '🌐 VINTAGEVIBESGK.COM • MATTI BHAI AI SHOWROOM PRESENTER (FRONT • BACK • TAG) • TYPE "MINE" IN CHAT',
        44,
        678
      );
    }
  };

  // Lightweight Preview Loop on the Desk Monitor Canvas (only active when AI_STUDIO_MONITOR tab is selected, 1 FPS for zero UI lag)
  useEffect(() => {
    if (spotlightViewMode !== 'AI_STUDIO_MONITOR') {
      if (previewLoopRef.current) {
        clearInterval(previewLoopRef.current);
        previewLoopRef.current = null;
      }
      return;
    }
    const renderPreview = () => {
      const pCanvas = previewCanvasRef.current;
      if (pCanvas) {
        const pCtx = pCanvas.getContext('2d');
        if (pCtx) {
          drawStudioCanvasFrame(pCtx, currentSetupBooth?.name || selectedBooth);
        }
      }
    };
    renderPreview();
    previewLoopRef.current = setInterval(renderPreview, 1000);
    return () => {
      if (previewLoopRef.current) {
        clearInterval(previewLoopRef.current);
        previewLoopRef.current = null;
      }
    };
  }, [selectedBooth, currentSetupBooth?.name, spotlightViewMode, activeAngle, session?.activeOnAirPiece?.barcode]);

  // 1-Click Export 15-Second HD AI Marketing Video for the Current Piece (.webm/.mp4)
  const handleExportPieceVideo = async (targetPiece?: PieceBreakdownItem) => {
    const piece = targetPiece || activePieceRef.current || session?.activeOnAirPiece;
    if (!piece || isExportingVideo) return;

    if (targetPiece && targetPiece.barcode !== activePieceRef.current?.barcode) {
      activePieceRef.current = targetPiece;
      preloadPieceImages(targetPiece);
    }

    setIsExportingVideo(true);
    setExportProgressSec(15);
    setSpotlightViewMode('AI_STUDIO_MONITOR');

    // Start AI Voiceover pitch for this piece
    speakPieceMarketingPitch(piece);

    // Cycle Front (0-5s) -> Back (5-10s) -> Tag (10-15s) during recording
    setActiveAngle('front');
    activeAngleRef.current = 'front';
    setTimeout(() => {
      setActiveAngle('back');
      activeAngleRef.current = 'back';
    }, 5000);
    setTimeout(() => {
      setActiveAngle('tag');
      activeAngleRef.current = 'tag';
    }, 10000);

    try {
      const exportCanvas = previewCanvasRef.current || document.createElement('canvas');
      if (!previewCanvasRef.current) {
        exportCanvas.width = 1280;
        exportCanvas.height = 720;
      }
      const stream = exportCanvas.captureStream(30);
      const mixer = ensureStudioAudioMixer();
      if (mixer) {
        const audioTrack = mixer.broadcastDest.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);
      }

      // CRITICAL STABILITY FIX: Prioritize VP8+Opus software codec over H.264/AVC1.
      // Windows Chrome MediaFoundation H.264 hardware encoder crashes with STATUS_BREAKPOINT on offscreen canvas capture.
      const supportedMime =
        [
          'video/webm;codecs=vp8,opus',
          'video/webm'
        ].find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || 'video/webm';

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: supportedMime,
        videoBitsPerSecond: 1800000,
        audioBitsPerSecond: 128000
      });

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        try {
          stream.getVideoTracks().forEach(t => t.stop());
        } catch (_) {}
        const blob = new Blob(chunks, { type: supportedMime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VintageVibe_MattiBhai_${piece.barcode || 'Piece'}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setIsExportingVideo(false);
        setExportProgressSec(0);
        setScanMessage({
          type: 'success',
          text: `🎬 Downloaded Matti Bhai 15s AI Marketing Video (with Voiceover Audio) for ${piece.itemName} (${piece.barcode})!`
        });
      };

      recorder.start(200);

      let rem = 15;
      const countTimer = setInterval(() => {
        rem -= 1;
        setExportProgressSec(Math.max(0, rem));
        if (rem <= 0) {
          clearInterval(countTimer);
          if (recorder.state !== 'inactive') recorder.stop();
        }
      }, 1000);
    } catch (err: any) {
      setIsExportingVideo(false);
      setExportProgressSec(0);
      setScanMessage({ type: 'error', text: err?.message || 'Video export failed' });
    }
  };

  // ============================================================================
  // REAL-TIME 1280x720 CANVAS + AUDIO -> WEBSOCKET FFMPEG RTMP STREAMER
  // ============================================================================
  const stopRtmpBroadcastEngine = (clearIntent = true) => {
    if (clearIntent) {
      isBroadcastingIntentRef.current = false;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopActiveTtsPlayback();
    lastSpokenBarcodeRef.current = '';
    if (canvasTimerRef.current) {
      clearInterval(canvasTimerRef.current);
      canvasTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (_) {}
    mediaRecorderRef.current = null;

    // Stop captured video tracks so Chromium releases GPU/RAM frame buffers immediately
    try {
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getVideoTracks().forEach(t => {
          try {
            t.stop();
          } catch (_) {}
        });
      }
    } catch (_) {}
    canvasStreamRef.current = null;

    try {
      if (offscreenCanvasRef.current) {
        offscreenCanvasRef.current.width = 0;
        offscreenCanvasRef.current.height = 0;
        offscreenCanvasRef.current = null;
      }
    } catch (_) {}

    try {
      const ws = wsRelayRef.current;
      wsRelayRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'User stopped stream');
        } else if (ws.readyState === WebSocket.CONNECTING) {
          // Avoid "WebSocket is closed before the connection is established" console error
          ws.onopen = () => {
            try {
              ws.close(1000, 'Aborted connecting');
            } catch (_) {}
          };
        }
      }
    } catch (_) {}

    if (clearIntent) {
      setRtmpStatus('IDLE');
      setRtmpMessage('');
    }
  };

  const startRtmpBroadcastEngine = async (): Promise<boolean> => {
    stopRtmpBroadcastEngine(false);
    isBroadcastingIntentRef.current = true;

    let latestBooths = setupBooths;
    try {
      const r = await fetch('/api/setup/live-booths');
      if (r.ok) {
        const j = await r.json();
        const normalized = normalizeSetupBooths(j);
        if (normalized.length > 0) {
          latestBooths = normalized;
          setSetupBooths(normalized);
        }
      }
    } catch (_) {}

    const boothCfg = latestBooths.find(b => matchesBoothId(b.id, selectedBooth)) || latestBooths[0];
    const primaryKey =
      (isValidSetupKey(boothCfg?.youtubeStreamKey) && boothCfg?.youtubeStreamKey?.trim()) ||
      (isValidSetupKey(boothCfg?.masterStreamKey) && boothCfg?.masterStreamKey?.trim()) ||
      (isValidSetupKey(boothCfg?.tiktokStreamKey) && boothCfg?.tiktokStreamKey?.trim()) ||
      (isValidSetupKey(boothCfg?.instagramStreamKey) && boothCfg?.instagramStreamKey?.trim()) ||
      (isValidSetupKey(boothCfg?.facebookStreamKey) && boothCfg?.facebookStreamKey?.trim()) ||
      '';

    if (!primaryKey) {
      setRtmpStatus('ERROR');
      setRtmpMessage('No valid Stream Key found in Global Setup for this booth. Please enter a real Stream Key in Global Setup -> Live Booths.');
      return false;
    }

    const primaryRtmpUrl = (boothCfg?.masterIngestRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2').trim();
    setRtmpStatus('CONNECTING');
    setRtmpMessage(`Connecting FFmpeg to Global Setup Key (${maskKey(primaryKey)})...`);

    // Initialize Master Studio Web Audio Mixer first so AI Male TTS Voiceover goes into the RTMP stream
    const mixer = ensureStudioAudioMixer();

    if (activePieceRef.current) {
      preloadPieceImages(activePieceRef.current);
      syncActivePieceWithServer(activePieceRef.current, selectedBooth, true);
    }

    // 1. Build 1280x720 Stream Canvas using drawStudioCanvasFrame (10 FPS lightweight redraw for zero browser lag)
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    offscreenCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d');

    const drawBroadcastFrame = () => {
      if (!ctx) return;
      drawStudioCanvasFrame(ctx, boothCfg?.name || selectedBooth);
    };

    drawBroadcastFrame();
    canvasTimerRef.current = setInterval(drawBroadcastFrame, 50); // 20 FPS smooth redraw

    const canvasStream = canvas.captureStream(24);
    canvasStreamRef.current = canvasStream;

    // 2. Attach Master Studio Audio Track (AI Male TTS Voiceover + Chimes)
    if (mixer) {
      const audioTrack = mixer.broadcastDest.stream.getAudioTracks()[0];
      if (audioTrack) {
        canvasStream.addTrack(audioTrack);
      }
    }

    // 3. Connect WebSocket to /api/live/stream/rtmp-relay
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const normBooth = selectedBooth.replace(/^booth[-_]?0*/i, 'booth-');
    const query = `?boothId=${encodeURIComponent(normBooth)}&streamKey=${encodeURIComponent(primaryKey)}&rtmpUrl=${encodeURIComponent(primaryRtmpUrl)}`;
    const wsUrl = `${wsProtocol}//${window.location.host}/api/live/stream/rtmp-relay${query}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRelayRef.current = ws;

    // CRITICAL CHROME CRASH FIX: Use VP8+Opus software encoder in Chromium instead of H.264/AVC1.
    // Server-side FFmpeg already transcodes incoming WebM chunks to -c:v libx264 for YouTube RTMP.
    const supportedMime =
      [
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || 'video/webm';

    ws.onopen = () => {
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
          } catch (_) {}
        }
      }, 15000);
    };

    ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'SUPERSEDED') {
          isBroadcastingIntentRef.current = false;
          setRtmpStatus('IDLE');
          setRtmpMessage('Stream taken over by Live Selling Studio / Mobile Streamer.');
          return;
        }
        if (msg.type === 'READY_FOR_CHUNKS') {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
              mediaRecorderRef.current.stop();
            } catch (_) {}
          }
          const recorder = new MediaRecorder(canvasStream, {
            mimeType: supportedMime,
            videoBitsPerSecond: 1800000,
            audioBitsPerSecond: 128000
          });
          mediaRecorderRef.current = recorder;

          let sendChain = Promise.resolve();
          recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              const blob = e.data;
              sendChain = sendChain
                .then(() => blob.arrayBuffer())
                .then(buf => {
                  if (ws.readyState === WebSocket.OPEN) ws.send(buf);
                })
                .catch(() => {});
            }
          };

          recorder.start(100);
          setRtmpStatus('LIVE');
          setRtmpMessage(`Broadcasting 720p + Stereo AI Voiceover Audio via Key (${maskKey(primaryKey)}) ➔ ${msg.destination || primaryRtmpUrl}`);

          // Speak AI Male Voiceover ONLY ONE TIME (1x) for the Showroom Introduction once stream is live
          if (autoVoiceoverEnabled && lastSpokenBarcodeRef.current !== 'INTRO_SPOKEN_ONCE') {
            speakPieceMarketingPitch(activePieceRef.current);
          }

          connectYouTubeLiveChat(selectedBooth);
          setTimeout(() => connectYouTubeLiveChat(selectedBooth), 15000);
        } else if (msg.type === 'ERROR' || msg.type === 'STREAM_ENDED') {
          setRtmpStatus('ERROR');
          setRtmpMessage(msg.error || 'FFmpeg stream ended unexpectedly');
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      if (!isBroadcastingIntentRef.current) return;
      setRtmpStatus('CONNECTING');
      setRtmpMessage('Reconnecting WebSocket stream relay...');
    };

    ws.onclose = evt => {
      if (isBroadcastingIntentRef.current && evt.code !== 1000) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (isBroadcastingIntentRef.current) {
            startRtmpBroadcastEngine().catch(() => {});
          }
        }, 3000);
      }
    };

    return true;
  };

  useEffect(() => {
    return () => {
      stopRtmpBroadcastEngine(true);
      try {
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    fetchSessionStatus(true);

    // 1. SSE Realtime Listener for Live Stream and Claims
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events/subscribe');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.entity === 'LIVE_CLAIM') {
            const d = payload.details || payload.data?.claimRecord || payload.data || {};
            if (d.customerHandle || d.invoiceNumber || d.invoiceNo) {
              recentClaimBannerRef.current = {
                handle: d.customerHandle || d.customerName || '@viewer',
                barcode: d.barcode || d.pieceBarcode || d.sku || '',
                itemName: d.itemName || activePieceRef.current?.itemName || 'Vintage Grail Piece',
                invoiceNumber: d.invoiceNumber || d.invoiceNo || 'SLS-DRAFT-LIVE',
                priceAed: Number(d.priceAed || d.amountAed || activePieceRef.current?.retailPriceAed || 120),
                expiresAt: Date.now() + 8000
              };
              totalClaimsRef.current += 1;
              setScanMessage({
                type: 'success',
                text: `🎉 CLAIMED BY ${d.customerHandle || '@viewer'}! Invoice #${d.invoiceNumber || d.invoiceNo || 'SLS-DRAFT'} created (${d.barcode || d.sku || ''})`
              });
            }
          }
          if (
            payload.module === 'SALES' ||
            payload.module === 'MARKETING' ||
            payload.entity === 'LIVE_STREAM' ||
            payload.entity === 'LIVE_CLAIM'
          ) {
            fetchSessionStatus(false);
          }
        } catch (_) {}
      };
    } catch (_) {}

    // 2. Supabase Realtime Channel Subscription for live sessions & booths
    const channel = supabase
      .channel('live-desk-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_live_sessions' }, () => {
        fetchSessionStatus(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_booths' }, () => {
        fetchSessionStatus(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_claim_logs' }, () => {
        fetchSessionStatus(false);
      })
      .subscribe();

    const interval = setInterval(() => fetchSessionStatus(false), 10000);
    return () => {
      if (es) es.close();
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [selectedBooth]);

  // Sync available pieces into rotation queue
  useEffect(() => {
    if (availablePieces.length > 0) {
      const queue = buildRotationQueue(availablePieces, selectedCategorySequence);
      setRotationQueue(queue);
    }
  }, [availablePieces, selectedCategorySequence]);

  // ==========================================
  // AUTO-PRESENTER TIMER LOOP (VISUAL ROTATION ONLY — NO REPEATED VOICEOVER)
  // ==========================================
  useEffect(() => {
    if (!isAutoPresenterActive || autoPresenterPaused || rotationQueue.length === 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          const nextIdx = (currentQueueIndex + 1) % rotationQueue.length;
          setCurrentQueueIndex(nextIdx);
          const nextPiece = rotationQueue[nextIdx];
          if (nextPiece) {
            activePieceRef.current = nextPiece;
            preloadPieceImages(nextPiece);
            syncActivePieceWithServer(nextPiece, selectedBooth, true);
            LiveStreamService.updateBooth(selectedBooth, {
              is_broadcasting: true,
              active_product_sku: nextPiece.barcode || nextPiece.id,
              current_deal_price: Number(nextPiece.retailPriceAed || nextPiece.estimatedPrice || nextPiece.costPrice || 0)
            }).then(() => fetchSessionStatus()).catch(e => console.warn('Auto-rotation update error:', e));
          }
          return autoIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoPresenterActive, autoPresenterPaused, rotationQueue, currentQueueIndex, selectedBooth, autoIntervalSeconds, autoVoiceoverEnabled, aiPitchLang]);

  // Toggle Auto-Presenter On/Off
  const handleToggleAutoPresenter = async () => {
    const newState = !isAutoPresenterActive;
    setIsAutoPresenterActive(newState);

    if (newState) {
      const queue = buildRotationQueue(availablePieces, selectedCategorySequence);
      setRotationQueue(queue);
      setCurrentQueueIndex(0);
      setTimeRemaining(autoIntervalSeconds);
      setAutoPresenterPaused(false);

      if (queue.length > 0) {
        const first = queue[0];
        activePieceRef.current = first;
        preloadPieceImages(first);
        await syncActivePieceWithServer(first, selectedBooth, true);
        await LiveStreamService.updateBooth(selectedBooth, {
          is_broadcasting: true,
          active_product_sku: first.barcode || first.id,
          current_deal_price: Number(first.retailPriceAed || first.estimatedPrice || 0)
        });
      }
      await handleToggleStream(true);
    } else {
      await handleToggleStream(false);
    }
  };

  const handleSkipNext = async () => {
    if (rotationQueue.length === 0) return;
    const nextIdx = (currentQueueIndex + 1) % rotationQueue.length;
    setCurrentQueueIndex(nextIdx);
    setTimeRemaining(autoIntervalSeconds);
    const nextPiece = rotationQueue[nextIdx];
    if (nextPiece) {
      activePieceRef.current = nextPiece;
      preloadPieceImages(nextPiece);
      await syncActivePieceWithServer(nextPiece, selectedBooth, true);
      await LiveStreamService.updateBooth(selectedBooth, {
        active_product_sku: nextPiece.barcode || nextPiece.id,
        current_deal_price: Number(nextPiece.retailPriceAed || nextPiece.estimatedPrice || 0)
      });
      await fetchSessionStatus();
    }
  };

  const handleSkipPrev = async () => {
    if (rotationQueue.length === 0) return;
    const prevIdx = (currentQueueIndex - 1 + rotationQueue.length) % rotationQueue.length;
    setCurrentQueueIndex(prevIdx);
    setTimeRemaining(autoIntervalSeconds);
    const prevPiece = rotationQueue[prevIdx];
    if (prevPiece) {
      activePieceRef.current = prevPiece;
      preloadPieceImages(prevPiece);
      await syncActivePieceWithServer(prevPiece, selectedBooth, true);
      await LiveStreamService.updateBooth(selectedBooth, {
        active_product_sku: prevPiece.barcode || prevPiece.id,
        current_deal_price: Number(prevPiece.retailPriceAed || prevPiece.estimatedPrice || 0)
      });
      await fetchSessionStatus();
    }
  };

  // Format uptime
  const formatUptime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Toggle Stream On / Off + Real WebSocket FFmpeg RTMP Stream
  const handleToggleStream = async (start: boolean) => {
    setIsTogglingStream(true);
    try {
      if (start) {
        lastSpokenBarcodeRef.current = '';
        setSessionStartTime(Date.now());
        await startRtmpBroadcastEngine();
      } else {
        lastSpokenBarcodeRef.current = '';
        setSessionStartTime(null);
        setIsAutoPresenterActive(false);
        stopRtmpBroadcastEngine();
      }
      await LiveStreamService.updateBooth(selectedBooth, { is_broadcasting: start });
      await LiveStreamService.updateMulticastSettings({ is_live: start });
      await fetchSessionStatus();
    } catch (err) {
      console.warn('Error toggling live stream:', err);
    } finally {
      setIsTogglingStream(false);
    }
  };

  // Handle Scan Barcode directly with Supabase inventory + Backend Live Session Sync
  const handleScanBarcode = async (codeToScan?: string) => {
    const code = (codeToScan || scannerInput).trim().toUpperCase();
    if (!code) return;

    setIsScanning(true);
    setScanMessage(null);

    try {
      const allPieces = await PurchaseService.getPieces();
      const matched = allPieces.find(
        (p: PieceBreakdownItem) =>
          p.barcode?.toUpperCase() === code ||
          p.id?.toUpperCase() === code ||
          getShortLotCode(p.barcode) === code
      );
      if (matched) {
        activePieceRef.current = matched;
        preloadPieceImages(matched);
        await syncActivePieceWithServer(matched, selectedBooth, true);
        await LiveStreamService.updateBooth(selectedBooth, {
          active_product_sku: matched.barcode || matched.id,
          current_deal_price: Number(matched.retailPriceAed || matched.costPrice || 0)
        });
        setScanMessage({
          type: 'success',
          text: `Loaded on air with Matti Bhai Presenter: ${matched.itemName || code} • 3 Photos Ready (AED ${matched.retailPriceAed || 0})`
        });
        setScannerInput('');
        await fetchSessionStatus();
      } else {
        setScanMessage({ type: 'error', text: `Barcode '${code}' not found in inventory pieces` });
      }
    } catch (err: any) {
      setScanMessage({ type: 'error', text: err?.message || 'Scanner request failed' });
    } finally {
      setIsScanning(false);
      scannerInputRef.current?.focus();
    }
  };

  // Simulate or Trigger Instant Live Chat Claim for the current On-Air Piece
  const handleTriggerLiveClaim = async (customHandle?: string) => {
    const piece = activePieceRef.current || session?.activeOnAirPiece;
    if (!piece) return;
    setIsSimulatingClaim(true);
    try {
      await syncActivePieceWithServer(piece, selectedBooth, true);
      const handle = customHandle || '@murtazamakkani5608';
      const res = await fetch('/api/marketing/chat-claim/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'YouTube',
          handle,
          text: `MINE ${piece.barcode}`,
          piece
        })
      });
      const data = await res.json();
      if (data?.claimResult?.success) {
        const inv = data.claimResult.invoiceNumber || 'SLS-DRAFT-LIVE';
        recentClaimBannerRef.current = {
          handle,
          barcode: piece.barcode,
          itemName: piece.itemName || 'Vintage Piece',
          invoiceNumber: inv,
          priceAed: Number(piece.retailPriceAed || piece.estimatedPrice || 120),
          expiresAt: Date.now() + 8000
        };
        setScanMessage({
          type: 'success',
          text: `🎉 Claim Confirmed for ${handle}! Draft Invoice #${inv} generated & piece reserved.`
        });
        await fetchSessionStatus();
      } else {
        setScanMessage({
          type: 'error',
          text: data?.claimResult?.reason || 'Piece already claimed or unavailable'
        });
      }
    } catch (err: any) {
      setScanMessage({ type: 'error', text: err?.message || 'Failed to process live claim' });
    } finally {
      setIsSimulatingClaim(false);
    }
  };

  const publicBaseUrl =
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://vintagevibesgk.com'
      : typeof window !== 'undefined'
      ? window.location.origin
      : 'https://vintagevibesgk.com';

  const obsOverlayFullUrl = `${publicBaseUrl}/live-overlay?booth=${selectedBooth}&theme=${obsTheme}&transparent=${obsTransparentBg ? '1' : '0'}`;

  const handleCopyObsUrl = () => {
    navigator.clipboard.writeText(obsOverlayFullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const isBroadcasting = Boolean(session?.isBroadcasting || rtmpStatus === 'LIVE');
  const activePiece = session?.activeOnAirPiece;
  const progressPercent = autoIntervalSeconds > 0 ? Math.round(((autoIntervalSeconds - timeRemaining) / autoIntervalSeconds) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 1. STREAM CONTROLLER BAR: MULTI-PLATFORM & OBS SOURCE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                isBroadcasting
                  ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse shadow-lg shadow-red-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif font-bold text-lg text-white">
                  Multi-Channel Live Stream Broadcast Desk
                </h3>
                {isBroadcasting ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-black tracking-widest uppercase flex items-center gap-1.5 shadow-md animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                    ON AIR LIVE ({connectedPlatforms.length} KEY{connectedPlatforms.length === 1 ? '' : 'S'} ACTIVE)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-mono">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Directly synced with Global Setup Stream Keys & FFmpeg RTMP Multi-Cast Relay.
              </p>
              {rtmpMessage && (
                <div
                  className={`mt-1.5 text-[11px] font-mono px-2.5 py-1 rounded border inline-flex items-center gap-1.5 ${
                    rtmpStatus === 'LIVE'
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                      : rtmpStatus === 'ERROR'
                      ? 'bg-red-950/70 border-red-500/50 text-red-300'
                      : 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                  }`}
                >
                  <span>{rtmpStatus === 'LIVE' ? '🟢' : rtmpStatus === 'ERROR' ? '⚠️' : '⏳'}</span>
                  <span>{rtmpMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Start / Stop Toggle Button */}
          <div className="flex items-center gap-3 self-end lg:self-center">
            {isBroadcasting && (
              <div className="text-right font-mono mr-2 hidden sm:block">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Broadcast Uptime</span>
                <span className="text-base font-black text-amber-400">
                  {formatUptime(session?.uptimeSeconds || 0)}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleToggleStream(!isBroadcasting)}
              disabled={isTogglingStream}
              className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer ${
                isBroadcasting
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {isBroadcasting ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>⏹️ END STREAM</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>🔴 START LIVE STREAM</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Multi-Platform Social Stream Badges (Synced with Global Setup /api/setup/live-booths) */}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2 pt-1 border-b border-slate-800 pb-3">
          <span className="text-[11px] font-mono uppercase font-bold text-slate-400">
            Global Setup Stream Keys ({currentSetupBooth?.name || selectedBooth}):
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {platformTargets.map(target => {
              const hasRealKey = Boolean(target.key);
              return (
                <span
                  key={target.id}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 ${
                    hasRealKey
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                      : 'bg-black/40 border-slate-800 text-slate-500'
                  }`}
                  title={
                    hasRealKey
                      ? `Connected to Global Setup stream key (${maskKey(target.key)})`
                      : `No real stream key configured in Global Setup for ${target.label}`
                  }
                >
                  <Tv className={`w-3.5 h-3.5 ${hasRealKey ? target.iconColor : 'text-slate-600'}`} />
                  <span>{target.label}</span>
                  {hasRealKey ? (
                    <span className="text-[10px] text-emerald-400 font-bold">
                      ● {rtmpStatus === 'LIVE' ? 'LIVE' : 'Key Ready'} ({maskKey(target.key)})
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-normal">○ No Key in Setup</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* OBS Browser Source Generator Configuration */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Active Stream Booth (Global Setup)
            </label>
            <select
              value={selectedBooth}
              onChange={e => setSelectedBooth(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {setupBooths.length > 0 ? (
                setupBooths.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({isValidSetupKey(b.youtubeStreamKey || b.masterStreamKey) ? `YT Key: ${maskKey(b.youtubeStreamKey || b.masterStreamKey)}` : 'No Key'})
                  </option>
                ))
              ) : (
                <>
                  <option value="booth-1">Booth 01 - Main Stage (Vintage Denim & Tees)</option>
                  <option value="booth-2">Booth 02 - Rare Grails (Cream Grade A)</option>
                  <option value="booth-3">Booth 03 - Wholesale B2B Bales</option>
                  <option value="booth-4">Booth 04 - Flash Auction Desk</option>
                  <option value="booth-5">Booth 05 - VIP Archive Clearance</option>
                </>
              )}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              OBS Theme
            </label>
            <select
              value={obsTheme}
              onChange={e => setObsTheme(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              <option value="gold">Vintage Gold Luxury</option>
              <option value="neon">Cyber Streetwear Neon</option>
              <option value="noir">Minimalist Heritage Noir</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Direct OBS Browser Source URL:
            </label>
            <input
              type="text"
              readOnly
              value={obsOverlayFullUrl}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-amber-300 select-all"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyObsUrl}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
              title="Copy URL for OBS Studio Browser Source"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Copied' : 'Copy OBS'}</span>
            </button>
            <a
              href={obsOverlayFullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer shrink-0"
              title="Open OBS Overlay HUD in New Tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 24/7 AUTO-PRESENTER STREAM ENGINE (CATEGORY-WISE AUTO-CAROUSEL) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border-2 border-amber-500/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-serif font-black text-base text-white">
                  ⚡ 24/7 Auto-Presenter Stream Engine (with 👑 Matti Bhai AI Video Host)
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-mono font-bold uppercase">
                  Automated Multi-Cast
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Matti Bhai (in White Jubba) presents each in-stock piece with its Front, Back & Tag photos + AI Marketing Voiceover.
              </p>
            </div>
          </div>

          {/* Toggle Auto-Presenter Button */}
          <button
            type="button"
            onClick={handleToggleAutoPresenter}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-xl transition flex items-center gap-2 cursor-pointer ${
              isAutoPresenterActive
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/30 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
            }`}
          >
            {isAutoPresenterActive ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>⏹ STOP AUTO-PRESENTER</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>⚡ START AUTO-PRESENTER STREAM</span>
              </>
            )}
          </button>
        </div>

        {/* Controls: Category Sequence & Interval Speed */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-amber-200 uppercase tracking-wider block mb-1">
              Category Sequence Mode:
            </label>
            <select
              value={selectedCategorySequence}
              onChange={e => setSelectedCategorySequence(e.target.value)}
              className="w-full bg-slate-950 border border-amber-400/40 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
            >
              <option value="CATEGORY_SEQUENCE">
                🔥 Category Sequence (Men's ➔ Ladies ➔ Cream Grade A ➔ Vintage Archive)
              </option>
              <option value="ALL_IN_STOCK">📦 All In-Stock Inventory (Continuous Shuffle)</option>
              <option value="CREAM_GRADE_A">✨ Cream Grade A Garments Only</option>
              <option value="VINTAGE_ARCHIVE">🏛️ Vintage Archive & Rare Grails Only</option>
              <option value="MENS_ONLY">👔 Men's Outerwear, Denim & Hoodies Only</option>
              <option value="LADIES_ONLY">👗 Ladies Knitwear, Dresses & Tops Only</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-[11px] font-bold text-amber-200 uppercase tracking-wider block mb-1">
              Rotation Speed (Seconds per Piece):
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[15, 30, 45, 60].map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setAutoIntervalSeconds(sec);
                    setTimeRemaining(sec);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer text-center ${
                    autoIntervalSeconds === sec
                      ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                      : 'bg-slate-950 text-slate-300 border border-slate-700 hover:border-amber-400'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Live Auto-Timer Telemetry */}
          <div className="md:col-span-4 bg-black/60 border border-amber-400/40 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-mono text-amber-300 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                {isAutoPresenterActive
                  ? autoPresenterPaused
                    ? 'PAUSED'
                    : `Next piece in: ${timeRemaining}s`
                  : 'Engine Standby'}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Queue: {rotationQueue.length > 0 ? `${currentQueueIndex + 1}/${rotationQueue.length}` : '0'}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${isAutoPresenterActive ? progressPercent : 0}%` }}
              />
            </div>

            {/* Manual Step Controls */}
            {isAutoPresenterActive && (
              <div className="flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleSkipPrev}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                >
                  <Rewind className="w-3 h-3" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPresenterPaused(!autoPresenterPaused)}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  {autoPresenterPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {autoPresenterPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={handleSkipNext}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                >
                  Next <FastForward className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LIVE ON-AIR SPOTLIGHT & MANUAL DESK SCANNER */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Manual Barcode Scanner & Inventory Queue */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-slate-800" />
                <h4 className="font-bold text-slate-900 text-sm">Host Desk Barcode Scanner (Manual Mode)</h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                USB Gun Ready
              </span>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Scan garment tag or enter SKU to immediately override auto-presenter and push this specific piece on-air with Matti Bhai.
            </p>

            <div className="flex items-center gap-2">
              <input
                ref={scannerInputRef}
                type="text"
                value={scannerInput}
                onChange={e => setScannerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScanBarcode()}
                placeholder="Scan barcode (e.g. VV-BAL-001-0001)"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => handleScanBarcode()}
                disabled={isScanning || !scannerInput.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span>{isScanning ? 'Loading...' : 'Air'}</span>
              </button>
            </div>

            {scanMessage && (
              <div
                className={`mt-2.5 p-2 rounded text-xs flex items-center gap-1.5 ${
                  scanMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {scanMessage.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Flame className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                <span>{scanMessage.text}</span>
              </div>
            )}

            {/* Quick Click Samples from available inventory */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                Available In-Stock Pieces ({availablePieces.length}):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {availablePieces.slice(0, 10).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleScanBarcode(p.barcode)}
                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded text-[11px] font-mono text-amber-950 transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{p.barcode}</span>
                    <span className="text-slate-500 text-[10px]">({p.brandName})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Up Next in Auto-Presenter Queue */}
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Up Next in Stream Queue (Click to Air with Matti Bhai)</span>
              <span className="font-mono text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {rotationQueue.length} Pieces Sequenced
              </span>
            </h4>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {rotationQueue.length > 0 ? (
                rotationQueue.slice(currentQueueIndex, currentQueueIndex + 6).map((piece, idx) => (
                  <div
                    key={piece.id || idx}
                    onClick={() => handleScanBarcode(piece.barcode)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                      idx === 0
                        ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={piece.frontImageUrl || piece.images?.[0] || '/vintage_logo.svg'}
                        alt=""
                        className="w-9 h-9 rounded object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{piece.barcode}</span>
                          {idx === 0 && (
                            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-bold rounded">
                              ON-AIR
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 truncate max-w-[170px] block">
                          {piece.itemName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono">
                        <span className="font-bold text-emerald-700 block">
                          AED {piece.retailPriceAed || piece.estimatedPrice || piece.costPrice}
                        </span>
                        <span className="text-[10px] text-slate-400">{piece.labelGrade || 'Grade A'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          speakPieceMarketingPitch(piece);
                        }}
                        className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] shadow-xs cursor-pointer"
                        title="Play Matti Bhai's AI Marketing Voiceover for this piece"
                      >
                        🎙️ Pitch
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No pieces available in this category sequence.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live On-Air Piece Spotlight Card (Matti Bhai White Jubba Studio Video + 3-Angle Front/Back/Tag + Live Claims) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-400/80 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden">
            {/* Background luxury gradient glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              {/* Header Status Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                  <span className="font-mono text-xs uppercase font-bold text-amber-400 tracking-wider">
                    👑 MATTI BHAI AI VIDEO STUDIO & 3-ANGLE SPOTLIGHT
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => connectYouTubeLiveChat(selectedBooth)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                      youtubeChatConnected
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-amber-300'
                    }`}
                    title="Auto-detect active YouTube Live Broadcast & attach live chat claim bot"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>
                      {youtubeChatConnected
                        ? `YT Chat Connected ${youtubeVideoId ? `(${youtubeVideoId})` : ''}`
                        : 'Sync YT Live Chat'}
                    </span>
                  </button>
                  <span className="text-xs font-mono text-slate-400">
                    {selectedBooth.toUpperCase()} • 720p30
                  </span>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* MATTI BHAI (WHITE JUBBA) AI VIDEO MARKETING CONTROL BAR */}
              {/* ========================================================================= */}
              <div className="bg-slate-900/95 border border-amber-400/50 rounded-xl p-3.5 space-y-3 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-black uppercase text-amber-300">
                      📸 Display Mode:
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-black bg-amber-400 text-slate-950 shadow">
                      ⚡ 3-Photo Fast Mode (Front • Back • Tag — Heavy Video Removed)
                    </span>
                  </div>

                  {/* View Mode Switcher */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSpotlightViewMode('AI_STUDIO_MONITOR')}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                        spotlightViewMode === 'AI_STUDIO_MONITOR'
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📺 Live TV Studio Monitor
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpotlightViewMode('PHOTO_INSPECTOR')}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                        spotlightViewMode === 'PHOTO_INSPECTOR'
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔍 3-Photo Inspector
                    </button>
                  </div>
                </div>

                {/* Second Row: Voiceover Language, Speak Now, Auto-Voice Toggle & 15s Video Export */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                      AI Pitch Language:
                    </span>
                    {(['URDU', 'ARABIC', 'ENGLISH'] as const).map(lang => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setAiPitchLang(lang)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                          aiPitchLang === lang
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {lang === 'URDU' ? '🇵🇰 Urdu/Hindi' : lang === 'ARABIC' ? '🇦🇪 Arabic' : '🇬🇧 English'}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setAutoVoiceoverEnabled(!autoVoiceoverEnabled)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                        autoVoiceoverEnabled
                          ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                      title="Automatically speak Matti Bhai's AI marketing pitch whenever a new piece rotates on air"
                    >
                      {autoVoiceoverEnabled ? '🔊 Auto-Voice: ON' : '🔇 Auto-Voice: OFF'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setErpLocalSpeakerMuted(!erpLocalSpeakerMuted)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                        erpLocalSpeakerMuted
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      }`}
                      title="Mute local ERP browser speaker so you can listen directly on YouTube Live without echo (YouTube Live stream still receives 100% audio!)"
                    >
                      {erpLocalSpeakerMuted
                        ? '🔇 ERP Speaker: MUTED (YouTube Audio ON)'
                        : '🔊 ERP Speaker: ON (Click to Mute ERP)'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => speakPieceMarketingPitch(activePiece || undefined, undefined, true)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-black transition cursor-pointer flex items-center gap-1.5 ${
                        isSpeakingPitch
                          ? 'bg-emerald-400 text-slate-950 animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/50'
                      }`}
                    >
                      <span>{isSpeakingPitch ? '🎙️ Matti Bhai Speaking...' : '🎙️ Speak AI Pitch Now'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPieceVideo}
                      disabled={isExportingVideo || !activePiece}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-[11px] font-mono font-black shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      title="Record and download a 15-second HD Marketing Video of Matti Bhai presenting this specific piece (Front, Back & Tag) for WhatsApp Status, Reels or TikTok"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>
                        {isExportingVideo
                          ? `⏺ Recording Video (${exportProgressSec}s)...`
                          : '🎬 Export 15s Piece Video (.webm)'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Third Row: WhatsApp Ptt 2026-10-15 at 8.52.29 PM Voice Clone Profile & Sample Preview */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>
                        🧬 Cloned Voice Profile: WhatsApp Ptt 8.52.29 PM (
                        {voiceCloneInfo?.hasElevenLabsKey
                          ? '1-to-1 Cloud Neural Clone Active'
                          : 'Baritone -6Hz Acoustic Match Active'}
                        )
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={playOriginalWhatsAppVoiceSample}
                      className={`px-2.5 py-0.5 rounded border transition cursor-pointer font-bold ${
                        isPlayingOriginalSample
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-black animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                      }`}
                      title="Listen to the cleaned & denoised WhatsApp Ptt 2026-10-15 at 8.52.29 PM.ogg reference voice sample"
                    >
                      {isPlayingOriginalSample
                        ? '🔊 Playing WhatsApp Ptt Sample...'
                        : '▶️ Original Voice Sample Sunain (8.8s)'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowCloneKeyInput(!showCloneKeyInput)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition"
                      title="Optional: Paste ElevenLabs API Key for 100% 1-to-1 Zero-Shot Instant Voice Cloning from WhatsApp Ptt 8.52.29 PM"
                    >
                      {voiceCloneInfo?.hasElevenLabsKey
                        ? '✅ 1-to-1 Clone Key Connected'
                        : '🔑 Optional: 1-to-1 Clone API Key'}
                    </button>
                  </div>
                </div>

                {showCloneKeyInput && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <input
                      type="password"
                      value={elevenLabsKeyDraft}
                      onChange={e => setElevenLabsKeyDraft(e.target.value)}
                      placeholder="Paste ElevenLabs API Key (xi-api-key) for 100% 1-to-1 Zero-Shot Clone of WhatsApp Ptt 8.52.29 PM..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCloneApiKey}
                      disabled={isSavingCloneKey || !elevenLabsKeyDraft.trim()}
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-[11px] cursor-pointer disabled:opacity-50"
                    >
                      {isSavingCloneKey ? 'Cloning Voice...' : 'Activate 1-to-1 Clone'}
                    </button>
                  </div>
                )}
              </div>

              {/* ========================================================================= */}
              {/* LIVE 1280x720 30FPS AI STUDIO MONITOR (MATTI BHAI IN WHITE JUBBA + 3 PHOTOS) */}
              {/* ========================================================================= */}
              {spotlightViewMode === 'AI_STUDIO_MONITOR' && (
                <div className="space-y-2.5">
                  <div className="relative rounded-2xl overflow-hidden border-2 border-amber-400 shadow-2xl bg-black aspect-video w-full">
                    <canvas
                      ref={previewCanvasRef}
                      width={1280}
                      height={720}
                      className="w-full h-full object-contain block"
                    />
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-amber-400/50 text-[10px] font-mono text-amber-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>LIVE 720p30 AI COMPOSITE FEED</span>
                    </div>
                  </div>

                  {/* Quick Angle Override + Instant Claim Bar under the Studio Monitor */}
                  {activePiece && (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400 uppercase font-bold mr-1">
                          Pin Camera Angle:
                        </span>
                        {(
                          [
                            { id: 'front', label: '1. FRONT VIEW' },
                            { id: 'back', label: '2. BACK VIEW' },
                            { id: 'tag', label: '3. BRAND TAG' }
                          ] as const
                        ).map(ang => (
                          <button
                            key={ang.id}
                            type="button"
                            onClick={() => {
                              setActiveAngle(ang.id);
                              activeAngleRef.current = ang.id;
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer ${
                              activeAngle === ang.id
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            📸 {ang.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-amber-300 font-bold">
                          Type <strong className="text-white">MINE</strong> or <strong className="text-white">MINE {getShortLotCode(activePiece.barcode)}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTriggerLiveClaim()}
                          disabled={isSimulatingClaim}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-xs rounded-lg shadow transition cursor-pointer disabled:opacity-50"
                        >
                          {isSimulatingClaim ? 'Claiming...' : '⚡ Lock & Claim Piece Now'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activePiece ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start pt-1">
                  {/* Left: 3-Angle Garment Showcase (Main Active Angle + 3 Thumbnails: Front, Back, Tag) */}
                  <div className="sm:col-span-5 space-y-2.5">
                    <div className="relative group">
                      <div className="aspect-[4/5] w-full rounded-2xl overflow-hidden border-2 border-amber-400 bg-black/80 shadow-xl">
                        <img
                          src={
                            activeAngle === 'back'
                              ? activePiece.backImageUrl || activePiece.images?.[1] || activePiece.frontImageUrl || '/vintage_logo.svg'
                              : activeAngle === 'tag'
                              ? activePiece.tagImageUrl || activePiece.images?.[2] || activePiece.frontImageUrl || '/vintage_logo.svg'
                              : activePiece.frontImageUrl || activePiece.images?.[0] || '/vintage_logo.svg'
                          }
                          alt={activePiece.itemName}
                          className="w-full h-full object-cover transition duration-300"
                        />
                      </div>
                      <span className="absolute top-2.5 left-2.5 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-amber-300 font-bold border border-amber-400/60 uppercase">
                        📸 {activeAngle === 'front' ? '1/3 • FRONT VIEW' : activeAngle === 'back' ? '2/3 • BACK VIEW' : '3/3 • BRAND TAG'}
                      </span>
                      <span className="absolute bottom-2.5 left-2.5 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-white font-bold border border-amber-500/40">
                        LOT #{getShortLotCode(activePiece.barcode)}
                      </span>
                    </div>

                    {/* 3 Clickable Angle Cards: Front, Back, Tag */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          id: 'front' as const,
                          label: 'FRONT',
                          url: activePiece.frontImageUrl || activePiece.images?.[0] || '/vintage_logo.svg'
                        },
                        {
                          id: 'back' as const,
                          label: 'BACK',
                          url: activePiece.backImageUrl || activePiece.images?.[1] || activePiece.frontImageUrl || '/vintage_logo.svg'
                        },
                        {
                          id: 'tag' as const,
                          label: 'TAG / LABEL',
                          url: activePiece.tagImageUrl || activePiece.images?.[2] || activePiece.frontImageUrl || '/vintage_logo.svg'
                        }
                      ].map(thumb => (
                        <button
                          key={thumb.id}
                          type="button"
                          onClick={() => {
                            setActiveAngle(thumb.id);
                            activeAngleRef.current = thumb.id;
                          }}
                          className={`rounded-xl overflow-hidden border-2 transition cursor-pointer relative group ${
                            activeAngle === thumb.id
                              ? 'border-amber-400 ring-2 ring-amber-400/40 scale-[1.02]'
                              : 'border-slate-700 opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img src={thumb.url} alt={thumb.label} className="w-full h-16 object-cover bg-black" />
                          <span
                            className={`block w-full text-center py-0.5 text-[9px] font-mono font-bold uppercase ${
                              activeAngle === thumb.id ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300'
                            }`}
                          >
                            {thumb.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Complete Garment Details, AI Script Teleprompter & Instant Claim Controls */}
                  <div className="sm:col-span-7 space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                          ✨ {activePiece.brandName || 'Vintage Archive'} • {activePiece.style || 'Authentic Cut'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-amber-300 font-bold">
                          #{getShortLotCode(activePiece.barcode)}
                        </span>
                      </div>
                      <h3 className="font-serif font-bold text-xl text-white mt-1 leading-snug">
                        {activePiece.itemName}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Full SKU: {activePiece.barcode}
                      </p>
                    </div>

                    {/* Pricing & Size Highlight */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-4 py-2 rounded-xl font-mono font-black text-lg shadow-md">
                        AED {activePiece.retailPriceAed || activePiece.estimatedPrice || 120}
                        <span className="text-xs font-bold text-slate-800 ml-1.5">
                          / ${Math.round((activePiece.retailPriceAed || activePiece.estimatedPrice || 120) * 0.272)} USD
                        </span>
                      </div>

                      <div className="px-3.5 py-2 rounded-xl bg-slate-900 border-2 border-amber-400/70 text-xs font-mono font-black text-amber-300">
                        SIZE: {activePiece.sizeScanned || 'L'}
                      </div>
                    </div>

                    {/* Matti Bhai AI Marketing Script Teleprompter Box */}
                    <div className="bg-amber-950/30 border border-amber-400/40 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-black uppercase text-amber-400">
                          👑 Matti Bhai Live Marketing Script ({aiPitchLang}):
                        </span>
                        <button
                          type="button"
                          onClick={() => speakPieceMarketingPitch(activePiece)}
                          className="text-[10px] font-mono font-bold text-emerald-400 hover:underline cursor-pointer"
                        >
                          🔊 Replay Audio
                        </button>
                      </div>
                      <p className="text-xs text-amber-100/95 leading-relaxed font-medium italic">
                        "{generatePieceMarketingPitch(activePiece, aiPitchLang)}"
                      </p>
                    </div>

                    {/* 6-Cell Garment Specifications Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Brand Label</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {activePiece.brandName || 'Archive Brand'}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Grade / Condition</span>
                        <span className="text-xs font-bold text-amber-300 truncate block">
                          {(activePiece.labelGrade || 'Grade A').replace(/\s*\(.*?\)/g, '')}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Category</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {activePiece.category || 'Vintage Apparel'}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Style / Fit</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {activePiece.style || 'Classic Fit'}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Origin</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {activePiece.countryOfOrigin || 'USA / Europe'}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Photos Verified</span>
                        <span className="text-xs font-bold text-emerald-400 truncate block">
                          Front • Back • Tag
                        </span>
                      </div>
                    </div>

                    {/* Instant Live Chat Claim Box + 1-Click Claim Button */}
                    <div className="bg-black/75 border-2 border-amber-400 rounded-xl p-3.5 shadow-inner space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold tracking-wider">
                          ⚡ Live Chat Instant Claim Commands (YouTube / IG / TikTok):
                        </span>
                        <span className="text-[10px] font-mono text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-500/40">
                          Auto-Invoice Ready
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-black text-sm">
                          MINE
                        </span>
                        <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-black text-sm">
                          CLAIM
                        </span>
                        <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-black text-sm">
                          MINE {getShortLotCode(activePiece.barcode)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                        <span className="text-[11px] text-slate-400">
                          Viewers typing <strong className="text-white">mine</strong> or <strong className="text-white">claim</strong> in YouTube Chat auto-lock this piece.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTriggerLiveClaim()}
                          disabled={isSimulatingClaim}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-xs rounded-lg shadow transition cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          {isSimulatingClaim ? 'Claiming...' : '⚡ Lock & Claim Piece Now'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center space-y-3">
                  <MonitorPlay className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                  <h4 className="font-bold text-base text-slate-300">No Piece Currently On Air</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Activate the 24/7 Auto-Presenter above or scan a barcode to air pieces on your live stream.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Real-Time YouTube / Social Live Chat & Instant Claims Feed */}
          <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-slate-900 text-sm">
                  Live Chat Stream, Official Host Replies & Instant Invoicing Desk
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-300">
                  📲 Official WhatsApp AI: +971 55 418 6086
                </span>
                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {recentClaims.length} Claims Locked
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Recent Instant Claims & 1-Click Invoicing */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  🎉 Recent Claimed Pieces & 1-Click Invoicing:
                </span>
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {recentClaims.length > 0 ? (
                    recentClaims.slice(0, 12).map((c: any, i: number) => {
                      const invNo = c.invoiceNo || c.invoiceNumber || 'SLS-DRAFT-LIVE';
                      const skuCode = c.sku || c.pieceBarcode || 'VV-ITEM';
                      const itemTitle = c.itemName || c.pieceTitle || 'Authentic Vintage Piece';
                      const priceVal = Number(c.priceAed || 150);
                      const vatVal = Number((priceVal * 0.05).toFixed(2));
                      const totalVal = Number((priceVal + vatVal).toFixed(2));
                      const buyerHandle = c.customerHandle || '@viewer';
                      const isConfirmed = c.status === 'CONFIRMED';
                      const waBuyerLink = `https://wa.me/971554186086?text=${encodeURIComponent(
                        `CLAIM ${skuCode} ${invNo} (${buyerHandle})`
                      )}`;

                      return (
                        <div
                          key={c.id || i}
                          className={`p-3 rounded-xl border text-xs space-y-2 ${
                            isConfirmed
                              ? 'bg-emerald-50 border-emerald-300'
                              : 'bg-amber-50/70 border-amber-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {c.itemImage ? (
                                <img
                                  src={c.itemImage}
                                  alt={itemTitle}
                                  className="w-11 h-11 rounded-lg object-cover border border-amber-300 bg-black shrink-0"
                                />
                              ) : null}
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-black text-slate-900 text-xs">
                                    {buyerHandle}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 text-white text-[9px] font-mono font-bold rounded ${
                                      isConfirmed ? 'bg-emerald-600' : 'bg-amber-600'
                                    }`}
                                  >
                                    {isConfirmed ? '✔ INVOICE CONFIRMED' : c.status || 'LOCK_ACTIVE'}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    {c.timestamp || ''}
                                  </span>
                                </div>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                  {itemTitle}
                                </span>
                                <span className="text-[11px] text-slate-600 font-mono block">
                                  SKU: <strong>{skuCode}</strong> • Invoice: <strong>#{invNo}</strong>
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono font-black text-emerald-800 text-sm block">
                                AED {priceVal}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500 block">
                                Total w/ VAT: AED {totalVal}
                              </span>
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-amber-200/80 flex items-center justify-between gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-600">
                              📢 Sent by <strong>Vintage Vibes Host</strong> • WhatsApp: <strong>+971 55 418 6086</strong>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  const phoneInput = window.prompt(
                                    `Enter Buyer WhatsApp Phone (optional) to send Official Tax Invoice #${invNo} for ${buyerHandle} (${skuCode}):`,
                                    ''
                                  );
                                  if (phoneInput === null) return;
                                  const addrInput = window.prompt(
                                    `Enter UAE Delivery Address for ${buyerHandle} (or leave blank for Showroom/Express):`,
                                    'Dubai / UAE Express Delivery'
                                  );
                                  try {
                                    const res = await fetch('/api/marketing/chat-claim/confirm-invoice', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        claimId: c.id,
                                        invoiceNo: invNo,
                                        sku: skuCode,
                                        customerHandle: buyerHandle,
                                        customerPhone: phoneInput || '',
                                        deliveryAddress: addrInput || 'UAE Express Delivery',
                                        priceAed: priceVal,
                                        itemName: itemTitle
                                      })
                                    });
                                    if (res.ok) {
                                      setScanMessage({
                                        type: 'success',
                                        text: `✅ Official Tax Invoice #${invNo} Confirmed for ${buyerHandle} (${skuCode} — AED ${totalVal})!`
                                      });
                                      await fetchSessionStatus(true);
                                    }
                                  } catch (_) {}
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 font-mono font-bold text-[10px] cursor-pointer transition shadow-xs"
                              >
                                {isConfirmed ? '🧾 Re-Send / Edit Invoice' : '🧾 Confirm & Generate Invoice'}
                              </button>

                              <a
                                href={waBuyerLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-[10px] transition shadow-xs"
                              >
                                📲 WhatsApp AI Link
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                      No claims yet in this session. Type <strong>"mine"</strong> or <strong>"claim"</strong> in YouTube Chat or click <strong>Lock & Claim Piece Now</strong> above!
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Live Chat Messages */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  💬 Incoming YouTube Chat & Official Host Replies:
                </span>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentComments.length > 0 ? (
                    recentComments.slice(0, 14).map((msg: any, i: number) => {
                      const senderHandle = msg.handle || msg.username || '@viewer';
                      const msgText = msg.text || msg.comment || '';
                      const isOfficialHost = /Vintage Vibes Host/i.test(senderHandle);
                      return (
                        <div
                          key={msg.id || i}
                          className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                            isOfficialHost
                              ? 'bg-slate-900 border-amber-400 text-amber-200 shadow-sm'
                              : msg.isClaimIntent
                              ? 'bg-amber-50 border-amber-300 text-amber-950'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="leading-relaxed">
                            <span
                              className={`font-mono font-black ${
                                isOfficialHost ? 'text-amber-400' : 'text-slate-900'
                              }`}
                            >
                              {senderHandle}:
                            </span>{' '}
                            <span className="font-medium whitespace-pre-line">{msgText}</span>
                          </div>
                          {isOfficialHost ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[9px] shrink-0">
                              HOST REPLY
                            </span>
                          ) : msg.isClaimIntent ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-black text-[9px] shrink-0">
                              {msg.claimResult?.success || msg.isProcessed ? '✔ CLAIMED' : 'CLAIM INTENT'}
                            </span>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                      Waiting for live chat messages...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


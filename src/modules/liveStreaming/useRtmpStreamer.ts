import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseRtmpStreamerOptions {
  boothId: string;
  streamKey?: string;
  rtmpUrl?: string;
  onStatusChange?: (status: 'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR', msg?: string) => void;
}

interface PieceMediaRecord {
  barcode: string;
  title: string;
  size: string;
  price: string;
  frontUrl: string;
  backUrl: string;
  tagUrl: string;
  frontImg: HTMLImageElement | null;
  backImg: HTMLImageElement | null;
  tagImg: HTMLImageElement | null;
}

export function useRtmpStreamer({ boothId, streamKey, rtmpUrl, onStatusChange }: UseRtmpStreamerOptions) {
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamStatus, setStreamStatus] = useState<'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR'>('IDLE');
  const [streamError, setStreamError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isStreamingRef = useRef<boolean>(false);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const boothIdRef = useRef(boothId);
  useEffect(() => {
    boothIdRef.current = boothId;
  }, [boothId]);

  const streamKeyRef = useRef(streamKey);
  useEffect(() => {
    streamKeyRef.current = streamKey;
  }, [streamKey]);

  const rtmpUrlRef = useRef(rtmpUrl);
  useEffect(() => {
    rtmpUrlRef.current = rtmpUrl;
  }, [rtmpUrl]);

  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<any>(null);
  const activeMediaStreamRef = useRef<MediaStream | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const isConnectingRef = useRef<boolean>(false);
  const workerRef = useRef<Worker | null>(null);
  const compositorVideoRef = useRef<HTMLVideoElement | null>(null);
  const compositorCleanupRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const broadcastAudioDstRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const intercomWsRef = useRef<WebSocket | null>(null);
  const intercomBannerElRef = useRef<HTMLDivElement | null>(null);
  const intercomBannerTimerRef = useRef<any>(null);
  const recorderWatchdogRef = useRef<any>(null);
  const aspectModeRef = useRef<'auto' | 'portrait' | 'landscape'>((() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('vv_live_aspect_mode');
        if (saved === 'portrait' || saved === 'landscape' || saved === 'auto') return saved;
      }
    } catch (_) {}
    return 'auto';
  })());
  const aspectPillElRef = useRef<HTMLDivElement | null>(null);

  const corsImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const piecesMapRef = useRef<Map<string, PieceMediaRecord>>(new Map());
  const activeAngleRef = useRef<'front' | 'back' | 'tag'>('front');
  const activeBarcodeRef = useRef<string>('');
  const isLightboxOpenRef = useRef<boolean>(false);
  const fallbackPieceRef = useRef<PieceMediaRecord | null>(null);
  const hostAnnouncementRef = useRef<{ text: string; sender: string; timestamp: number } | null>(null);

  const getCorsSafeImage = useCallback((rawUrl: string | undefined | null): HTMLImageElement | null => {
    if (!rawUrl || typeof rawUrl !== 'string' || typeof Image === 'undefined') return null;
    const trimmed = rawUrl.trim().replace(/[?&]cors=1$/, '');
    if (!trimmed) return null;
    const existing = corsImgCacheRef.current.get(trimmed);
    if (existing) return existing;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = trimmed.startsWith('data:') || trimmed.startsWith('blob:')
      ? trimmed
      : `${trimmed}${trimmed.includes('?') ? '&' : '?'}cors=1`;
    corsImgCacheRef.current.set(trimmed, img);
    return img;
  }, []);

  // Pre-fetch garment metadata without eagerly decoding hundreds of full-res images into RAM
  const preloadInventoryPieces = useCallback(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/purchase/pieces')
      .then(r => (r.ok ? r.json() : []))
      .then((pieces: any[]) => {
        if (!Array.isArray(pieces) || pieces.length === 0) return;
        let firstUnsold: PieceMediaRecord | null = null;
        for (const p of pieces) {
          const barcode = String(p.barcode || p.sku || p.pieceCode || '').trim();
          if (!barcode) continue;
          const frontUrl = p.frontImageUrl || p.front_image_url || p.front_image || (p.raw_data && (p.raw_data.front_image_url || p.raw_data.front_image)) || '';
          const backUrl = p.backImageUrl || p.back_image_url || p.back_image || (p.raw_data && (p.raw_data.back_image_url || p.raw_data.back_image)) || frontUrl;
          const tagUrl = p.tagImageUrl || p.tag_image_url || p.tag_image || (p.raw_data && (p.raw_data.tag_image_url || p.raw_data.tag_image)) || frontUrl;
          const brand = p.brandName || p.brand_name || 'Vintage';
          const item = p.itemName || p.item_name || 'Garment';
          const title = `${brand} • ${item}`.replace(/^•\s*/, '').trim();
          const size = p.sizeScanned || p.size_scanned || p.size || 'M';
          const priceNum = Number(p.retailPriceAed ?? p.retail_price_aed ?? p.lockedPrice ?? p.estimatedPrice ?? 0);

          const isUnsold = !p.isSold && !p.is_sold && (p.status === 'IN_STOCK' || p.status === 'AVAILABLE');
          const isFirst = !firstUnsold && isUnsold;

          const rec: PieceMediaRecord = {
            barcode,
            title,
            size,
            price: `AED ${priceNum}`,
            frontUrl,
            backUrl,
            tagUrl,
            frontImg: isFirst ? getCorsSafeImage(frontUrl) : null,
            backImg: isFirst ? getCorsSafeImage(backUrl) : null,
            tagImg: isFirst ? getCorsSafeImage(tagUrl) : null
          };
          piecesMapRef.current.set(barcode, rec);
          if (isFirst) {
            firstUnsold = rec;
          }
        }
        fallbackPieceRef.current = firstUnsold;
        if (firstUnsold && !activeBarcodeRef.current) {
          activeBarcodeRef.current = firstUnsold.barcode;
        }
      })
      .catch(() => {});
  }, [getCorsSafeImage]);

  // Global click listener to immediately detect Front / Back / Tag tab clicks and synchronize both UI <img> and Live Stream HUD
  useEffect(() => {
    preloadInventoryPieces();
    if (typeof document === 'undefined') return;

    const syncDomGarmentImages = (angle: 'front' | 'back' | 'tag') => {
      try {
        const barcode = activeBarcodeRef.current;
        const rec = (barcode && piecesMapRef.current.get(barcode)) || fallbackPieceRef.current;
        if (!rec) return;
        const targetUrl = angle === 'back' ? rec.backUrl : angle === 'tag' ? rec.tagUrl : rec.frontUrl;
        if (!targetUrl) return;

        // Ensure the Garment Live card <img> and Lightbox <img> in the UI immediately display the chosen angle
        const allSpans = document.querySelectorAll('span');
        for (let i = 0; i < allSpans.length; i++) {
          const s = allSpans[i];
          if (s.textContent?.trim().toUpperCase() === 'GARMENT LIVE') {
            const card = s.parentElement?.parentElement?.parentElement;
            const img = card?.querySelector('img') as HTMLImageElement | null;
            if (img && img.src !== targetUrl) {
              img.src = targetUrl;
            }
          }
        }
        const lightboxImg = document.querySelector('img.max-h-\\[65vh\\]') as HTMLImageElement | null;
        if (lightboxImg && lightboxImg.src !== targetUrl) {
          lightboxImg.src = targetUrl;
        }
      } catch (_) {}
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      // Resume AudioContext on any user interaction if suspended
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      const target = e.target as HTMLElement | null;
      const btn = target?.closest('button');
      if (!btn) return;
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt === 'front' || txt === 'front angle') {
        activeAngleRef.current = 'front';
        syncDomGarmentImages('front');
        setTimeout(() => syncDomGarmentImages('front'), 30);
      } else if (txt === 'back' || txt === 'back angle') {
        activeAngleRef.current = 'back';
        syncDomGarmentImages('back');
        setTimeout(() => syncDomGarmentImages('back'), 30);
      } else if (txt === 'tag' || txt === 'care tag') {
        activeAngleRef.current = 'tag';
        syncDomGarmentImages('tag');
        setTimeout(() => syncDomGarmentImages('tag'), 30);
      }
    };

    document.addEventListener('click', handleGlobalClick, true);
    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
    };
  }, [preloadInventoryPieces]);

  // Mount sleek floating Studio Aspect Switch (📱 9:16 Full | 🖥️ 16:9 HD | ⚡ Auto) without modifying locked UI views
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById('vv-aspect-mode-pill')) return;

    const wrap = document.createElement('div');
    wrap.id = 'vv-aspect-mode-pill';
    wrap.style.position = 'fixed';
    wrap.style.bottom = '14px';
    wrap.style.right = '14px';
    wrap.style.zIndex = '2147482500';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'flex-end';
    wrap.style.gap = '6px';
    wrap.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const notice = document.createElement('div');
    notice.style.display = 'none';
    notice.style.background = 'rgba(12, 10, 9, 0.94)';
    notice.style.border = '1px solid rgba(251, 191, 36, 0.7)';
    notice.style.color = '#fde68a';
    notice.style.fontSize = '11px';
    notice.style.fontWeight = '800';
    notice.style.padding = '5px 10px';
    notice.style.borderRadius = '999px';
    notice.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.45)';
    notice.style.pointerEvents = 'none';
    notice.textContent = 'Saved! Stop & Go Live to apply';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';
    row.style.padding = '4px';
    row.style.borderRadius = '999px';
    row.style.background = 'rgba(9, 10, 15, 0.88)';
    row.style.border = '1px solid rgba(245, 158, 11, 0.55)';
    row.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.45)';
    (row.style as any).backdropFilter = 'blur(8px)';

    const options: Array<{ mode: 'portrait' | 'landscape' | 'auto'; label: string }> = [
      { mode: 'portrait', label: '📱 9:16 Full' },
      { mode: 'landscape', label: '🖥️ 16:9 HD' },
      { mode: 'auto', label: '⚡ Auto' }
    ];

    const buttons: Record<string, HTMLButtonElement> = {};
    let noticeTimer: any = null;

    const refreshButtons = () => {
      const cur = aspectModeRef.current;
      options.forEach((opt) => {
        const b = buttons[opt.mode];
        if (!b) return;
        const active = cur === opt.mode;
        b.style.background = active ? '#f59e0b' : 'transparent';
        b.style.color = active ? '#090a0f' : '#e2e8f0';
      });
    };

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.style.border = 'none';
      btn.style.borderRadius = '999px';
      btn.style.padding = '5px 10px';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = '800';
      btn.style.cursor = 'pointer';
      btn.style.whiteSpace = 'nowrap';
      btn.style.transition = 'all 0.15s ease';
      btn.onclick = (ev) => {
        ev.stopPropagation();
        aspectModeRef.current = opt.mode;
        try {
          window.localStorage.setItem('vv_live_aspect_mode', opt.mode);
        } catch (_) {}
        refreshButtons();
        if (isStreamingRef.current) {
          notice.style.display = 'block';
          if (noticeTimer) clearTimeout(noticeTimer);
          noticeTimer = setTimeout(() => {
            notice.style.display = 'none';
          }, 3500);
        }
      };
      buttons[opt.mode] = btn;
      row.appendChild(btn);
    });

    refreshButtons();
    wrap.appendChild(notice);
    wrap.appendChild(row);
    document.body.appendChild(wrap);
    aspectPillElRef.current = wrap;

    return () => {
      if (noticeTimer) clearTimeout(noticeTimer);
      try {
        if (aspectPillElRef.current && aspectPillElRef.current.parentNode) {
          aspectPillElRef.current.parentNode.removeChild(aspectPillElRef.current);
        }
      } catch (_) {}
      aspectPillElRef.current = null;
    };
  }, []);

  const ensureHdCameraTrack = useCallback(async (vTrack: MediaStreamTrack | null, preferPortrait: boolean) => {
    if (!vTrack || vTrack.readyState !== 'live') return;
    try {
      const settings = vTrack.getSettings?.() || {};
      const maxDim = Math.max(Number(settings.width || 0), Number(settings.height || 0));
      if (maxDim < 1100 && typeof vTrack.applyConstraints === 'function') {
        await vTrack.applyConstraints({
          width: { ideal: preferPortrait ? 720 : 1280 },
          height: { ideal: preferPortrait ? 1280 : 720 },
          frameRate: { ideal: 30 }
        }).catch(() => {});
      }
    } catch (_) {}
    try {
      const caps = typeof (vTrack as any).getCapabilities === 'function' ? (vTrack as any).getCapabilities() : null;
      if (caps && typeof vTrack.applyConstraints === 'function') {
        if (caps.zoom && typeof caps.zoom.min === 'number') {
          await vTrack.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] }).catch(() => {});
        }
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          await vTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
        }
      }
    } catch (_) {}
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[useRtmpStreamer] 🔒 Screen Wake Lock acquired for 24/7 marathon stream');
      }
    } catch (_) {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    try {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    } catch (_) {}
  }, []);

  const stopCompositorWorker = useCallback(() => {
    if (compositorCleanupRef.current) {
      try {
        compositorCleanupRef.current();
      } catch (_) {}
      compositorCleanupRef.current = null;
    }
    if (workerRef.current) {
      try {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
      } catch (_) {}
      workerRef.current = null;
    }
    if (compositorVideoRef.current) {
      try {
        compositorVideoRef.current.pause();
        compositorVideoRef.current.srcObject = null;
      } catch (_) {}
      compositorVideoRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch (_) {}
      audioCtxRef.current = null;
    }
  }, []);

  /**
   * Wrap raw camera MediaStream in a 30fps adaptive 9:16/16:9 HD Canvas Compositor + Clock-Synchronized AudioContext Booster.
   * Ensures:
   * 1) Constant 30.00 FPS output even when room lighting drops webcam to 15fps or host flips Front/Back camera or rotates screen.
   * 2) Clean single-card Front / Back / Tag Garment Photo, SKU Barcode, and AED Price HUD leaving 88%+ of the camera view unobstructed.
   * 3) Zero-offset (t=0) microphone audio with studio noise cancellation & automatic mic hot-swap recovery.
   */
  const createHudCompositedStream = useCallback((rawStream: MediaStream, hardwareMicTrack: MediaStreamTrack | null): MediaStream => {
    if (typeof document === 'undefined') return rawStream;
    stopCompositorWorker();
    preloadInventoryPieces();

    let currentVideoTrack: MediaStreamTrack | null = rawStream?.getVideoTracks()?.[0] || null;
    const mode = aspectModeRef.current;
    const trackSettings = (() => {
      try {
        return currentVideoTrack?.getSettings?.() || {};
      } catch {
        return {} as MediaTrackSettings;
      }
    })();
    const trackIsPortrait = Boolean(trackSettings.height && trackSettings.width && trackSettings.height > trackSettings.width);
    const winIsPortrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    const isPortrait = mode === 'portrait' ? true : mode === 'landscape' ? false : (trackSettings.width ? trackIsPortrait : winIsPortrait);
    const canvasW = isPortrait ? 720 : 1280;
    const canvasH = isPortrait ? 1280 : 720;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = (canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d', { alpha: false })) as CanvasRenderingContext2D | null;
    if (!ctx) return rawStream;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const lastFrameCanvas = document.createElement('canvas');
    lastFrameCanvas.width = canvasW;
    lastFrameCanvas.height = canvasH;
    const lastFrameCtx = lastFrameCanvas.getContext('2d', { alpha: false });
    let lastGoodCameraFrameAt = 0;
    let lastBackupCopyAt = 0;

    let lastFacingMode: 'user' | 'environment' = (() => {
      try {
        const fm = currentVideoTrack?.getSettings?.()?.facingMode;
        return fm === 'environment' ? 'environment' : 'user';
      } catch {
        return 'user';
      }
    })();
    let lastTrackProbeAt = 0;
    let deadCameraSince = 0;
    let recoveringCamera = false;
    let rotationCooldownUntil = 0;
    let paintingFrame = false;

    const onViewportRotate = () => {
      rotationCooldownUntil = performance.now() + 700;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onViewportRotate, { passive: true });
      window.addEventListener('orientationchange', onViewportRotate, { passive: true });
    }
    compositorCleanupRef.current = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onViewportRotate);
        window.removeEventListener('orientationchange', onViewportRotate);
      }
    };

    const hiddenVideo = document.createElement('video');
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.autoplay = true;
    hiddenVideo.srcObject = currentVideoTrack ? new MediaStream([currentVideoTrack]) : rawStream;
    hiddenVideo.play().catch(() => {});
    compositorVideoRef.current = hiddenVideo;

    // Set up Studio-Grade Web Audio Noise Cancellation & Vocal Gate at t=0
    let audioAnalyser: AnalyserNode | null = null;
    let noiseGateGainNode: GainNode | null = null;
    let syncedAudioTrack: MediaStreamTrack | null = null;
    let micHighPassNode: BiquadFilterNode | null = null;
    let micSourceNode: MediaStreamAudioSourceNode | null = null;
    let currentMicTrack: MediaStreamTrack | null = hardwareMicTrack;
    let recoveringMic = false;
    const freqData = new Uint8Array(32);

    const attachMicTrackToGraph = (actx: AudioContext, track: MediaStreamTrack) => {
      if (!micHighPassNode || !track || track.readyState !== 'live') return;
      track.enabled = true;
      try {
        if (typeof track.applyConstraints === 'function') {
          track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } as any).catch(() => {});
        }
      } catch (_) {}
      try {
        if (micSourceNode) {
          micSourceNode.disconnect();
        }
      } catch (_) {}
      const src = actx.createMediaStreamSource(new MediaStream([track]));
      src.connect(micHighPassNode);
      micSourceNode = src;
      currentMicTrack = track;
    };

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const actx = new AudioContextClass({ latencyHint: 'interactive' });
        audioCtxRef.current = actx;
        if (actx.state === 'suspended') {
          actx.resume().catch(() => {});
        }

        const dst = actx.createMediaStreamDestination();
        broadcastAudioDstRef.current = dst;

        // Sub-audible continuous carrier so AAC encoder clock never stalls
        const osc = actx.createOscillator();
        const silentGain = actx.createGain();
        silentGain.gain.value = 0.0001;
        osc.connect(silentGain);
        silentGain.connect(dst);
        osc.start();

        // 1. High-Pass Filter (140 Hz) — Cuts out AC rumble, ceiling fan wind, and desk vibrations
        const highPass = actx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 140;
        highPass.Q.value = 0.707;
        micHighPassNode = highPass;

        // 2. Electrical Mains Hum Notch Filter (50 Hz)
        const humNotch = actx.createBiquadFilter();
        humNotch.type = 'notch';
        humNotch.frequency.value = 50;
        humNotch.Q.value = 10;

        // 3. Low-Pass Filter (6800 Hz) — Eliminates high-frequency mic static, hiss, and whine
        const lowPass = actx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 6800;
        lowPass.Q.value = 0.707;

        // 4. Vocal Band Analyser (measures speech energy after noise filtering)
        const analyser = actx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.4;
        audioAnalyser = analyser;

        // 5. Adaptive Noise Gate Gain (silences background noise when host is not speaking)
        const gateGain = actx.createGain();
        gateGain.gain.value = 1.0;
        noiseGateGainNode = gateGain;

        // 6. Broadcast Voice Compressor for clean, even vocal levels without amplifying room noise
        const compressor = actx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 12;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;

        highPass.connect(humNotch);
        humNotch.connect(lowPass);
        lowPass.connect(analyser);
        analyser.connect(gateGain);
        gateGain.connect(compressor);
        compressor.connect(dst);

        if (hardwareMicTrack && hardwareMicTrack.readyState === 'live') {
          attachMicTrackToGraph(actx, hardwareMicTrack);
          console.log(`[useRtmpStreamer] 🎙️ Studio Noise Cancellation (140Hz HPF + 50Hz Notch + 6.8kHz LPF + Adaptive Vocal Gate) active on: "${hardwareMicTrack.label}"`);
        } else {
          console.warn('[useRtmpStreamer] ⚠️ No live hardware mic track available at compositor init; using carrier tone');
        }

        syncedAudioTrack = dst.stream.getAudioTracks()[0] || null;
      }
    } catch (audioErr) {
      console.warn('[useRtmpStreamer] Web Audio pipeline init warning:', audioErr);
    }

    // Cached HUD state scraped from Studio DOM
    let cachedHud: {
      barcode: string;
      title: string;
      size: string;
      price: string;
      angle: 'front' | 'back' | 'tag';
      imgEl: HTMLImageElement | null;
      frontImg: HTMLImageElement | null;
      backImg: HTMLImageElement | null;
      tagImg: HTMLImageElement | null;
    } | null = null;
    let lastDomScan = 0;
    let lastHeavyDomScan = 0;

    const scanDomForActiveGarment = (now: number) => {
      if (now < rotationCooldownUntil) return;
      if (now - lastDomScan < 300) return;
      lastDomScan = now;
      hostAnnouncementRef.current = null;
      try {
        // Check for explicit [data-live-hud-card] in LiveSellingStudio / MobileLiveHostView
        const explicitCard = document.querySelector('[data-live-hud-card]') as HTMLElement | null;
        if (explicitCard) {
          const isSoldOut = explicitCard.getAttribute('data-hud-sold-out') === 'true';
          if (isSoldOut) {
            cachedHud = null;
            fallbackPieceRef.current = null;
            return;
          }
          const barcode = explicitCard.getAttribute('data-hud-barcode') || activeBarcodeRef.current || '';
          const rawAngle = (explicitCard.getAttribute('data-hud-angle') || activeAngleRef.current || 'front') as 'front' | 'back' | 'tag';
          activeAngleRef.current = rawAngle;
          if (barcode) {
            activeBarcodeRef.current = barcode;
            const pieceRec = piecesMapRef.current.get(barcode);
            const domImg = explicitCard.querySelector('img') as HTMLImageElement | null;
            const frontUrl = explicitCard.getAttribute('data-hud-front') || pieceRec?.frontUrl || domImg?.src || '';
            const backUrl = explicitCard.getAttribute('data-hud-back') || pieceRec?.backUrl || frontUrl;
            const tagUrl = explicitCard.getAttribute('data-hud-tag') || pieceRec?.tagUrl || frontUrl;
            const frontImg = getCorsSafeImage(frontUrl);
            const backImg = getCorsSafeImage(backUrl);
            const tagImg = getCorsSafeImage(tagUrl);
            const imgEl = rawAngle === 'back' ? backImg : rawAngle === 'tag' ? tagImg : frontImg;
            cachedHud = {
              barcode,
              title: explicitCard.getAttribute('data-hud-title') || pieceRec?.title || 'Vintage Garment',
              size: explicitCard.getAttribute('data-hud-size') || pieceRec?.size || 'M',
              price: explicitCard.getAttribute('data-hud-price') || pieceRec?.price || 'AED 0',
              angle: rawAngle,
              imgEl,
              frontImg,
              backImg,
              tagImg
            };
          }
          return;
        }

        // Fast check for Minimized Garment Pill in MobileLiveHostView before any broad DOM query
        const minBtn = document.querySelector('button[title="Expand Garment Photo"]');
        if (minBtn) {
          const spans = minBtn.querySelectorAll('span');
          const barcode = spans[0]?.textContent?.trim() || activeBarcodeRef.current || 'SKU-LIVE';
          const brand = spans[1]?.textContent?.trim() || 'Vintage';
          const price = spans[2]?.textContent?.trim() || 'AED 100';
          activeBarcodeRef.current = barcode;
          const pieceRec = piecesMapRef.current.get(barcode) || fallbackPieceRef.current;
          if (pieceRec) {
            if (!pieceRec.frontImg && pieceRec.frontUrl) pieceRec.frontImg = getCorsSafeImage(pieceRec.frontUrl);
            if (!pieceRec.backImg && pieceRec.backUrl) pieceRec.backImg = getCorsSafeImage(pieceRec.backUrl);
            if (!pieceRec.tagImg && pieceRec.tagUrl) pieceRec.tagImg = getCorsSafeImage(pieceRec.tagUrl);
          }
          const angle = activeAngleRef.current;
          const imgEl = pieceRec
            ? (angle === 'back' ? pieceRec.backImg : angle === 'tag' ? pieceRec.tagImg : pieceRec.frontImg)
            : null;
          cachedHud = {
            barcode,
            title: pieceRec?.title || brand,
            size: pieceRec?.size || 'XL',
            price,
            angle,
            imgEl,
            frontImg: pieceRec?.frontImg || imgEl,
            backImg: pieceRec?.backImg || imgEl,
            tagImg: pieceRec?.tagImg || imgEl
          };
          return;
        }

        // 1. Check if Full-Screen Photo Lightbox is open in MobileLiveHostView
        const lightboxImg = document.querySelector('img.max-h-\\[65vh\\]') as HTMLImageElement | null;
        isLightboxOpenRef.current = Boolean(lightboxImg);
        if (lightboxImg) {
          const allBtns = document.querySelectorAll('button');
          for (let i = 0; i < allBtns.length; i++) {
            const b = allBtns[i];
            if (b.className.includes('border-amber-400')) {
              const t = (b.textContent || '').toLowerCase();
              if (t.includes('front')) activeAngleRef.current = 'front';
              else if (t.includes('back')) activeAngleRef.current = 'back';
              else if (t.includes('tag')) activeAngleRef.current = 'tag';
            }
          }
        }

        // Throttle fallback full-DOM scan to at most once every 1.5s
        if (now - lastHeavyDomScan < 1500) return;
        lastHeavyDomScan = now;

        // 2. Check MobileLiveHostView's "Garment Live" floating card
        const allSpans = document.querySelectorAll('span, div');
        for (let i = 0; i < allSpans.length; i++) {
          const el = allSpans[i];
          if (el.childElementCount !== 0) continue;
          const txt = el.textContent?.trim() || '';

          if (txt.toUpperCase() === 'GARMENT LIVE') {
            const card = el.parentElement?.parentElement?.parentElement;
            if (card) {
              // Read active Front / Back / Tag button inside the card
              const buttons = card.querySelectorAll('button');
              buttons.forEach(b => {
                const bTxt = (b.textContent || '').trim().toLowerCase();
                if (b.className.includes('bg-amber-500')) {
                  if (bTxt === 'front') activeAngleRef.current = 'front';
                  else if (bTxt === 'back') activeAngleRef.current = 'back';
                  else if (bTxt === 'tag') activeAngleRef.current = 'tag';
                }
              });

              const pTags = card.querySelectorAll('p');
              const barcode = pTags[0]?.textContent?.trim() || activeBarcodeRef.current || fallbackPieceRef.current?.barcode || 'SKU-LIVE';
              const rawTitle = pTags[1]?.textContent?.trim() || fallbackPieceRef.current?.title || 'Vintage Garment';
              activeBarcodeRef.current = barcode;

              // Find AED price pill and Size pill inside card
              let price = fallbackPieceRef.current?.price || 'AED 100';
              let size = fallbackPieceRef.current?.size || 'M';
              const divs = card.querySelectorAll('div');
              divs.forEach(d => {
                if (d.childElementCount === 0) {
                  const dTxt = (d.textContent || '').trim();
                  if (dTxt.startsWith('AED ')) {
                    price = dTxt;
                  } else if (dTxt.length >= 1 && dTxt.length <= 4 && /^(XS|S|M|L|XL|XXL|2XL|3XL|\d{2})$/i.test(dTxt)) {
                    size = dTxt;
                  }
                }
              });

              const pieceRec = piecesMapRef.current.get(barcode) || fallbackPieceRef.current;
              if (pieceRec) {
                if (!pieceRec.frontImg && pieceRec.frontUrl) pieceRec.frontImg = getCorsSafeImage(pieceRec.frontUrl);
                if (!pieceRec.backImg && pieceRec.backUrl) pieceRec.backImg = getCorsSafeImage(pieceRec.backUrl);
                if (!pieceRec.tagImg && pieceRec.tagUrl) pieceRec.tagImg = getCorsSafeImage(pieceRec.tagUrl);
              }
              const angle = activeAngleRef.current;
              const domImg = card.querySelector('img') as HTMLImageElement | null;

              // Synchronize DOM <img> src if pieceRec has distinct angle URLs
              if (pieceRec && domImg) {
                const desiredUrl = angle === 'back' ? pieceRec.backUrl : angle === 'tag' ? pieceRec.tagUrl : pieceRec.frontUrl;
                if (desiredUrl && domImg.src !== desiredUrl && !domImg.src.startsWith(desiredUrl)) {
                  domImg.src = desiredUrl;
                }
              }

              const imgEl = pieceRec
                ? (angle === 'back' ? pieceRec.backImg : angle === 'tag' ? pieceRec.tagImg : pieceRec.frontImg)
                : (domImg?.src ? getCorsSafeImage(domImg.src) : null);

              cachedHud = {
                barcode,
                title: rawTitle,
                size,
                price,
                angle,
                imgEl,
                frontImg: pieceRec?.frontImg || imgEl,
                backImg: pieceRec?.backImg || imgEl,
                tagImg: pieceRec?.tagImg || imgEl
              };
              return;
            }
          }

          // 3. Check LiveSellingStudio's "ON AUCTION FLOOR" card
          if (txt === 'ON AUCTION FLOOR') {
            const card = el.closest('div.absolute') || el.parentElement?.parentElement?.parentElement;
            if (card) {
              const domImg = card.querySelector('img') as HTMLImageElement | null;
              const barcode = el.nextElementSibling?.textContent?.trim() || 'SKU-LIVE';
              activeBarcodeRef.current = barcode;
              const pieceRec = piecesMapRef.current.get(barcode) || fallbackPieceRef.current;
              if (pieceRec) {
                if (!pieceRec.frontImg && pieceRec.frontUrl) pieceRec.frontImg = getCorsSafeImage(pieceRec.frontUrl);
                if (!pieceRec.backImg && pieceRec.backUrl) pieceRec.backImg = getCorsSafeImage(pieceRec.backUrl);
                if (!pieceRec.tagImg && pieceRec.tagUrl) pieceRec.tagImg = getCorsSafeImage(pieceRec.tagUrl);
              }
              const angle = activeAngleRef.current;
              const imgEl = pieceRec
                ? (angle === 'back' ? pieceRec.backImg : angle === 'tag' ? pieceRec.tagImg : pieceRec.frontImg)
                : (domImg?.src ? getCorsSafeImage(domImg.src) : null);

              const textContainer = el.parentElement?.parentElement;
              const titleDiv = textContainer?.children?.[1] as HTMLElement | undefined;
              const priceRow = textContainer?.children?.[2] as HTMLElement | undefined;
              const title = titleDiv?.textContent?.trim() || pieceRec?.title || 'Vintage Archive Piece';
              const size = (priceRow?.children?.[0]?.textContent?.trim() || pieceRec?.size || 'L').replace(/^Size:\s*/i, '');
              const price = priceRow?.children?.[1]?.textContent?.trim() || pieceRec?.price || 'AED 100';

              cachedHud = {
                barcode,
                title,
                size,
                price,
                angle,
                imgEl,
                frontImg: pieceRec?.frontImg || imgEl,
                backImg: pieceRec?.backImg || imgEl,
                tagImg: pieceRec?.tagImg || imgEl
              };
              return;
            }
          }
        }
      } catch (_) {}
    };

    const paintFrame = () => {
      if (paintingFrame) return;
      paintingFrame = true;
      try {
      const now = performance.now();
      scanDomForActiveGarment(now);

      // 150ms camera & mic hot-swap probe: seamlessly follows Front <-> Back flips & rotation sensor resets
      if (now - lastTrackProbeAt >= 150) {
        lastTrackProbeAt = now;
        try {
          const allVids = document.querySelectorAll('video');
          let pageVTrack: MediaStreamTrack | null = null;
          let fallbackPageVideo: HTMLVideoElement | null = null;
          let fallbackPageAudioTrack: MediaStreamTrack | null = null;
          for (let i = 0; i < allVids.length; i++) {
            const vEl = allVids[i];
            if (vEl === hiddenVideo) continue;
            if (!fallbackPageVideo) fallbackPageVideo = vEl;
            const s = vEl.srcObject as MediaStream | null;
            if (!s) continue;
            const vt = s.getVideoTracks().find(t => t.readyState === 'live' && !/canvas/i.test(t.label || ''));
            if (vt && !pageVTrack) pageVTrack = vt;
            const at = s.getAudioTracks().find(t => t.readyState === 'live' && !t.label.includes('MediaStreamAudioDestinationNode'));
            if (at && !fallbackPageAudioTrack) fallbackPageAudioTrack = at;
          }

          if (pageVTrack && (!currentVideoTrack || currentVideoTrack.readyState !== 'live' || pageVTrack.id !== currentVideoTrack.id)) {
            currentVideoTrack = pageVTrack;
            ensureHdCameraTrack(pageVTrack, isPortrait).catch(() => {});
            try {
              const fm = pageVTrack.getSettings?.()?.facingMode;
              if (fm === 'environment' || fm === 'user') lastFacingMode = fm;
            } catch (_) {}
            hiddenVideo.srcObject = new MediaStream([pageVTrack]);
            hiddenVideo.play().catch(() => {});
            deadCameraSince = 0;
            console.log(`[useRtmpStreamer] 🔄 Hot-swapped live camera track (${lastFacingMode}): "${pageVTrack.label}"`);
          } else if ((!currentVideoTrack || currentVideoTrack.readyState !== 'live') && isStreamingRef.current) {
            if (deadCameraSince === 0) deadCameraSince = now;
            if (now - deadCameraSince > 750 && !recoveringCamera && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
              recoveringCamera = true;
              navigator.mediaDevices
                .getUserMedia({
                  video: { facingMode: { ideal: lastFacingMode }, width: { ideal: isPortrait ? 720 : 1280 }, height: { ideal: isPortrait ? 1280 : 720 }, frameRate: { ideal: 30 } } as any,
                  audio: false
                })
                .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
                .then(recStream => {
                  const recTrack = recStream.getVideoTracks()[0];
                  if (recTrack && recTrack.readyState === 'live') {
                    currentVideoTrack = recTrack;
                    ensureHdCameraTrack(recTrack, isPortrait).catch(() => {});
                    hiddenVideo.srcObject = new MediaStream([recTrack]);
                    hiddenVideo.play().catch(() => {});
                    if (fallbackPageVideo) {
                      const pStream = fallbackPageVideo.srcObject as MediaStream | null;
                      const pLive = pStream?.getVideoTracks().some(t => t.readyState === 'live');
                      if (!pLive) {
                        fallbackPageVideo.srcObject = recStream;
                        fallbackPageVideo.play().catch(() => {});
                      }
                    }
                    deadCameraSince = 0;
                    console.log(`[useRtmpStreamer] ✅ Auto-recovered camera track (${lastFacingMode})`);
                  }
                })
                .catch(() => {})
                .finally(() => {
                  recoveringCamera = false;
                });
            }
          } else if (currentVideoTrack && currentVideoTrack.readyState === 'live') {
            deadCameraSince = 0;
          }

          if ((!currentMicTrack || currentMicTrack.readyState !== 'live') && isStreamingRef.current && !recoveringMic && audioCtxRef.current && micHighPassNode) {
            const existingDedicated = micStreamRef.current?.getAudioTracks().find(t => t.readyState === 'live' && !t.label.includes('MediaStreamAudioDestinationNode')) || null;
            const candidateAudio = existingDedicated || fallbackPageAudioTrack;
            if (candidateAudio) {
              attachMicTrackToGraph(audioCtxRef.current, candidateAudio);
            } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
              recoveringMic = true;
              navigator.mediaDevices
                .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
                .then(recMicStream => {
                  micStreamRef.current = recMicStream;
                  const newMicTrack = recMicStream.getAudioTracks()[0];
                  if (newMicTrack && newMicTrack.readyState === 'live' && audioCtxRef.current) {
                    attachMicTrackToGraph(audioCtxRef.current, newMicTrack);
                  }
                })
                .catch(() => {})
                .finally(() => {
                  recoveringMic = false;
                });
            }
          }
        } catch (_) {}
      }

      const sourceVideo =
        (hiddenVideo.readyState >= 2 && hiddenVideo.videoWidth > 0)
          ? hiddenVideo
          : (document.querySelector('video') as HTMLVideoElement | null) || hiddenVideo;

      if (sourceVideo && sourceVideo.paused && sourceVideo.srcObject) {
        sourceVideo.play().catch(() => {});
      }

      const hasRealCameraFrame = Boolean(
        currentVideoTrack &&
        currentVideoTrack.readyState === 'live' &&
        sourceVideo &&
        sourceVideo.readyState >= 2 &&
        sourceVideo.videoWidth > 0 &&
        sourceVideo.videoHeight > 0
      );

      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, canvasW, canvasH);

      if (hasRealCameraFrame && sourceVideo) {
        const vw = sourceVideo.videoWidth;
        const vh = sourceVideo.videoHeight;
        const scale = Math.max(canvasW / vw, canvasH / vh);
        const dw = Math.round(vw * scale);
        const dh = Math.round(vh * scale);
        const dx = Math.round((canvasW - dw) / 2);
        const dy = Math.round((canvasH - dh) / 2);
        let fm: string | undefined;
        try { fm = currentVideoTrack?.getSettings?.()?.facingMode || lastFacingMode; } catch (_) { fm = lastFacingMode; }
        const trackLabel = currentVideoTrack?.label || '';
        const isRearOrExternal =
          fm === 'environment' ||
          /back|rear|wide|telephoto|ultra|triple|dual|external|usb|c920|brio|logitech|obs|camo|continuity/i.test(trackLabel);
        const shouldMirror = isRearOrExternal
          ? false
          : (typeof window !== 'undefined' ? (window as any).__vvCameraMirrorFlip !== false : true);
        try {
          ctx.save();
          if (shouldMirror) {
            ctx.translate(canvasW, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(sourceVideo, 0, 0, vw, vh, dx, dy, dw, dh);
          ctx.restore();
          lastGoodCameraFrameAt = now;
          if (lastFrameCtx && now - lastBackupCopyAt >= 250) {
            try {
              lastFrameCtx.drawImage(canvas, 0, 0);
              lastBackupCopyAt = now;
            } catch (_) {}
          }
        } catch (_) {
          try { ctx.restore(); } catch (_) {}
        }
      } else if (lastGoodCameraFrameAt > 0 && now - lastGoodCameraFrameAt < 4500 && lastFrameCtx) {
        try {
          ctx.drawImage(lastFrameCanvas, 0, 0);
        } catch (_) {}
      } else {
        const grad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 50, canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) * 0.6);
        grad.addColorStop(0, 'rgba(217, 119, 6, 0.16)');
        grad.addColorStop(1, 'rgba(10, 10, 12, 1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = isPortrait ? '900 22px sans-serif' : '900 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✨ VINTAGE VIBES LIVE SHOWCASE ✨', canvasW / 2, Math.round(canvasH * 0.25));
        ctx.fillStyle = '#cbd5e1';
        ctx.font = isPortrait ? 'bold 13px sans-serif' : 'bold 15px sans-serif';
        ctx.fillText('AL AIN CURATED PRE-LOVED THRIFT ARCHIVE', canvasW / 2, Math.round(canvasH * 0.25) + 28);
        ctx.textAlign = 'start';
        ctx.restore();
      }

      // Compute real-time microphone audio level (0..1) and drive adaptive studio noise gate
      let micLevel = 0;
      if (audioAnalyser) {
        try {
          audioAnalyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 2; i < 18; i++) sum += freqData[i];
          micLevel = Math.min(1, (sum / (16 * 130)));
          if (noiseGateGainNode && audioCtxRef.current && currentMicTrack?.enabled !== false) {
            const now = audioCtxRef.current.currentTime;
            // Voice threshold: if ambient room/fan noise is below 0.10, gate down to 0.015 (near silence); when speaking, open smoothly to 1.2x
            const targetGain = micLevel > 0.10 ? 1.20 : 0.015;
            const timeConstant = micLevel > 0.10 ? 0.006 : 0.085;
            noiseGateGainNode.gain.setTargetAtTime(targetGain, now, timeConstant);
          }
        } catch (_) {}
      }

      // 1. Slim Single-Row Top Compliance & Status Bar (y=0..34, >90% camera view unobstructed)
      ctx.save();
      ctx.fillStyle = 'rgba(6, 78, 59, 0.90)';
      ctx.fillRect(0, 0, canvasW, 34);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 32, canvasW, 2);

      if (isPortrait) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
        ctx.beginPath();
        ctx.roundRect(12, 5, 84, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px sans-serif';
        ctx.fillText('● LIVE HD', 20, 20);

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(175, 4, 370, 24, 6);
        ctx.fill();
        ctx.fillStyle = '#090a0f';
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('♻️ 100% USED & PRE-LOVED THRIFT', canvasW / 2, 20);
        ctx.textAlign = 'start';

        ctx.fillStyle = 'rgba(12, 10, 9, 0.72)';
        ctx.strokeStyle = micLevel > 0.05 ? 'rgba(52, 211, 153, 0.8)' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(634, 5, 74, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = micLevel > 0.05 ? '#34d399' : '#94a3b8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('🎙️', 641, 20);
        for (let b = 0; b < 4; b++) {
          const threshold = (b + 1) / 4;
          const active = micLevel >= threshold * 0.72 || (b === 0 && hardwareMicTrack?.readyState === 'live');
          ctx.fillStyle = active ? (b >= 3 ? '#fbbf24' : '#10b981') : 'rgba(255,255,255,0.18)';
          const barH = 5 + b * 2.5;
          ctx.fillRect(666 + b * 7, 22 - barH, 4, barH);
        }
      } else {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
        ctx.beginPath();
        ctx.roundRect(16, 5, 86, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px sans-serif';
        ctx.fillText('● LIVE HD', 24, 20);

        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('VINTAGE VIBES • AL AIN', 112, 20);

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(435, 4, 410, 24, 6);
        ctx.fill();
        ctx.fillStyle = '#090a0f';
        ctx.font = '900 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('♻️ 100% USED & PRE-LOVED THRIFT • NOT NEW', canvasW / 2, 20);
        ctx.textAlign = 'start';

        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('UAE CN-5888545', 1054, 20);

        ctx.fillStyle = 'rgba(12, 10, 9, 0.72)';
        ctx.strokeStyle = micLevel > 0.05 ? 'rgba(52, 211, 153, 0.8)' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(1176, 5, 88, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = micLevel > 0.05 ? '#34d399' : '#94a3b8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('🎙️', 1183, 20);
        for (let b = 0; b < 5; b++) {
          const threshold = (b + 1) / 5;
          const active = micLevel >= threshold * 0.72 || (b === 0 && hardwareMicTrack?.readyState === 'live');
          ctx.fillStyle = active ? (b >= 4 ? '#fbbf24' : '#10b981') : 'rgba(255,255,255,0.18)';
          const barH = 4 + b * 2.5;
          ctx.fillRect(1208 + b * 7, 22 - barH, 4, barH);
        }
      }
      ctx.restore();

      // Host chat messages go strictly to platform comment boxes, NEVER burned onto the video canvas

      // Active HUD Data (from DOM or preloaded piece fallback)
      const fb = fallbackPieceRef.current;
      const curAngle = cachedHud?.angle || activeAngleRef.current || 'front';
      const hud = cachedHud || (fb ? {
        barcode: fb.barcode,
        title: fb.title,
        size: fb.size,
        price: fb.price,
        angle: curAngle,
        imgEl: curAngle === 'back' ? fb.backImg : curAngle === 'tag' ? fb.tagImg : fb.frontImg,
        frontImg: fb.frontImg,
        backImg: fb.backImg,
        tagImg: fb.tagImg
      } : null);

      if (hud) {
        const rawPriceStr = String(hud.price || '').trim();
        const cleanPrice = !rawPriceStr ? 'AED 0' : /^\d/.test(rawPriceStr) ? `AED ${rawPriceStr}` : rawPriceStr;
        const cleanSize = String(hud.size || 'M').replace(/^Size:\s*/i, '').trim() || 'M';

        const activeImg =
          hud.angle === 'back'
            ? (hud.backImg || hud.imgEl)
            : hud.angle === 'tag'
              ? (hud.tagImg || hud.imgEl)
              : (hud.frontImg || hud.imgEl);

        const shortAngleLabel =
          hud.angle === 'back'
            ? 'BACK'
            : hud.angle === 'tag'
              ? 'TAG'
              : 'FRONT';

        const angleLabel =
          hud.angle === 'back'
            ? '📸 BACK VIEW'
            : hud.angle === 'tag'
              ? '🏷️ TAG DETAIL'
              : '📸 FRONT VIEW';

        // 2. ONE Clean Compact Active Garment Badge (eliminates duplicate giant cards)
        const cardW = isPortrait ? 344 : 428;
        const cardH = isPortrait ? 92 : 104;
        const cardX = isPortrait ? 14 : 18;
        const cardY = isPortrait ? 44 : canvasH - cardH - 18;
        const imgSize = isPortrait ? 72 : 84;
        const imgX = cardX + 10;
        const imgY = cardY + 10;
        const textX = imgX + imgSize + 12;

        ctx.save();
        ctx.fillStyle = 'rgba(12, 10, 9, 0.86)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.stroke();

        let drewPhoto = false;
        if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgSize, imgSize, 9);
            ctx.clip();
            ctx.drawImage(activeImg, imgX, imgY, imgSize, imgSize);
            ctx.restore();
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgSize, imgSize, 9);
            ctx.stroke();
            drewPhoto = true;
          } catch (_) {
            ctx.restore();
          }
        }
        if (!drewPhoto) {
          ctx.fillStyle = '#1c1917';
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 9);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('THRIFT', imgX + 14, imgY + Math.round(imgSize / 2) + 4);
        }

        // Tiny angle pill tucked inside bottom-right corner of thumbnail
        ctx.fillStyle = 'rgba(9, 10, 15, 0.84)';
        ctx.beginPath();
        ctx.roundRect(imgX + imgSize - 40, imgY + imgSize - 17, 37, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shortAngleLabel, imgX + imgSize - 21.5, imgY + imgSize - 7);
        ctx.textAlign = 'start';

        if (isPortrait) {
          // Row 1: Gold USED badge + SKU
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.roundRect(textX, cardY + 10, 62, 18, 5);
          ctx.fill();
          ctx.fillStyle = '#090a0f';
          ctx.font = '900 10px sans-serif';
          ctx.fillText('♻️ USED', textX + 6, cardY + 23);

          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(hud.barcode.slice(0, 15), textX + 68, cardY + 23);

          // Row 2: Title
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(hud.title.slice(0, 24), textX, cardY + 49);

          // Row 3: Size + Price
          const sizeLabel = `Size ${cleanSize.slice(0, 6)}`;
          ctx.fillStyle = '#fcd34d';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(sizeLabel, textX, cardY + 76);
          const priceX = textX + Math.max(70, Math.round(ctx.measureText(sizeLabel).width) + 12);
          ctx.fillStyle = '#34d399';
          ctx.font = '900 18px sans-serif';
          ctx.fillText(cleanPrice, priceX, cardY + 77);
        } else {
          // Row 1: Gold USED THRIFT pill + SKU
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.roundRect(textX, cardY + 10, 106, 20, 5);
          ctx.fill();
          ctx.fillStyle = '#090a0f';
          ctx.font = '900 11px sans-serif';
          ctx.fillText('♻️ USED THRIFT', textX + 7, cardY + 24);

          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(hud.barcode.slice(0, 16), textX + 114, cardY + 24);

          // Row 2: Title
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText(hud.title.slice(0, 28), textX, cardY + 49);

          // Row 3: Size + Price
          const sizeLabel = `Size ${cleanSize.slice(0, 6)}`;
          ctx.fillStyle = '#fcd34d';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(sizeLabel, textX, cardY + 74);
          const priceX = textX + Math.max(78, Math.round(ctx.measureText(sizeLabel).width) + 14);
          ctx.fillStyle = '#34d399';
          ctx.font = '900 20px sans-serif';
          ctx.fillText(cleanPrice, priceX, cardY + 75);

          // Row 4: Comment CTA
          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`💬 Comment "CLAIM ${hud.barcode.slice(0, 18)}"`, textX, cardY + 95);
        }
        ctx.restore();

        // 3. Center-Screen HD Lightbox Zoom if Host opened Full-Screen Photo View
        if (isLightboxOpenRef.current && activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
          ctx.fillRect(0, 0, canvasW, canvasH);

          const zoomSize = Math.min(canvasW - 80, canvasH - 220, 520);
          const zx = Math.round((canvasW - zoomSize) / 2);
          const zy = Math.max(54, Math.round((canvasH - zoomSize) / 2) - 24);
          ctx.beginPath();
          ctx.roundRect(zx, zy, zoomSize, zoomSize, 20);
          ctx.clip();
          ctx.drawImage(activeImg, zx, zy, zoomSize, zoomSize);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(zx, zy, zoomSize, zoomSize, 20);
          ctx.stroke();

          const capW = Math.min(canvasW - 48, 420);
          const capX = Math.round((canvasW - capW) / 2);
          const capY = zy + zoomSize + 14;
          ctx.fillStyle = 'rgba(12, 10, 9, 0.92)';
          ctx.beginPath();
          ctx.roundRect(capX, capY, capW, 46, 12);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.font = isPortrait ? '900 15px sans-serif' : '900 18px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${angleLabel} • ${cleanPrice} • Size ${cleanSize}`, canvasW / 2, capY + 29);
          ctx.textAlign = 'start';
          ctx.restore();
        }
      }
      } finally {
        paintingFrame = false;
      }
    };

    // Initial paint before capturing stream
    paintFrame();
    const compositedStream = canvas.captureStream(30);
    const canvasVideoTrack = compositedStream.getVideoTracks()[0] as any;

    // Start unthrottled Web Worker timer at 33ms (30.0 FPS)
    try {
      const workerCode = `
        let timer = setInterval(() => postMessage('tick'), 33);
        onmessage = (e) => { if (e.data === 'stop') clearInterval(timer); };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = () => {
        paintFrame();
        if (canvasVideoTrack && typeof canvasVideoTrack.requestFrame === 'function') {
          try { canvasVideoTrack.requestFrame(); } catch (_) {}
        }
      };
      workerRef.current = worker;
    } catch (_) {
      const fallbackTimer = setInterval(paintFrame, 33);
      workerRef.current = {
        postMessage: () => clearInterval(fallbackTimer),
        terminate: () => clearInterval(fallbackTimer)
      } as any;
    }

    // Attach clock-synchronized Web Audio microphone track (or fallback to raw audio track)
    if (syncedAudioTrack) {
      compositedStream.addTrack(syncedAudioTrack);
    } else {
      rawStream.getAudioTracks().forEach(t => compositedStream.addTrack(t));
    }
    return compositedStream;
  }, [stopCompositorWorker, preloadInventoryPieces, getCorsSafeImage, ensureHdCameraTrack]);

  const clearIntercomBanner = useCallback(() => {
    if (intercomBannerTimerRef.current) {
      clearTimeout(intercomBannerTimerRef.current);
      intercomBannerTimerRef.current = null;
    }
    try {
      if (intercomBannerElRef.current && intercomBannerElRef.current.parentNode) {
        intercomBannerElRef.current.parentNode.removeChild(intercomBannerElRef.current);
      }
    } catch (_) {}
    intercomBannerElRef.current = null;
  }, []);

  const showIntercomBanner = useCallback((speaking: boolean, mode: 'private' | 'onair', bossName?: string) => {
    if (typeof document === 'undefined' || !document.body) return;
    if (intercomBannerTimerRef.current) {
      clearTimeout(intercomBannerTimerRef.current);
      intercomBannerTimerRef.current = null;
    }
    let el = intercomBannerElRef.current;
    if (!el) {
      el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.top = '14px';
      el.style.right = '14px';
      el.style.zIndex = '2147483000';
      el.style.padding = '8px 14px';
      el.style.borderRadius = '999px';
      el.style.fontWeight = '900';
      el.style.fontSize = '12px';
      el.style.letterSpacing = '0.4px';
      el.style.pointerEvents = 'none';
      el.style.boxShadow = '0 10px 26px rgba(0,0,0,0.45)';
      el.style.transition = 'opacity 0.2s ease';
      document.body.appendChild(el);
      intercomBannerElRef.current = el;
    }
    const labelName = String(bossName || 'BOSS').toUpperCase();
    if (mode === 'onair') {
      el.style.background = 'linear-gradient(135deg, rgba(225,29,72,0.96), rgba(185,28,28,0.96))';
      el.style.border = '1.5px solid #fecdd3';
      el.style.color = '#ffffff';
      el.textContent = speaking ? `🎙️ ${labelName} ON-AIR LIVE` : `🎙️ ${labelName} ON-AIR ENDED`;
    } else {
      el.style.background = 'linear-gradient(135deg, rgba(6,78,59,0.96), rgba(15,23,42,0.96))';
      el.style.border = '1.5px solid #fde68a';
      el.style.color = '#fde68a';
      el.textContent = speaking ? `🔒 ${labelName} TALKING (PRIVATE)` : `🔒 ${labelName} EARPIECE STANDBY`;
    }
    el.style.opacity = speaking ? '1' : '0.82';
    if (!speaking) {
      intercomBannerTimerRef.current = setTimeout(() => {
        clearIntercomBanner();
      }, 2500);
    }
  }, [clearIntercomBanner]);

  const stopStreaming = useCallback((isExplicit = true) => {
    if (recorderWatchdogRef.current) {
      clearTimeout(recorderWatchdogRef.current);
      recorderWatchdogRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (isExplicit) {
      reconnectAttemptsRef.current = 999;
      releaseWakeLock();
      stopCompositorWorker();
      broadcastAudioDstRef.current = null;
      clearIntercomBanner();
      try {
        if (intercomWsRef.current) {
          const oldIws = intercomWsRef.current;
          intercomWsRef.current = null;
          oldIws.onopen = null;
          oldIws.onmessage = null;
          oldIws.onclose = null;
          oldIws.onerror = null;
          oldIws.close(1000, 'Host stopped stream');
        }
      } catch (_) {}
      if (micStreamRef.current) {
        try {
          micStreamRef.current.getTracks().forEach(t => t.stop());
        } catch (_) {}
        micStreamRef.current = null;
      }
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    isStreamingRef.current = false;
    isConnectingRef.current = false;

    try {
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onerror = null;
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      }
    } catch (_) {}
    recorderRef.current = null;

    try {
      if (wsRef.current) {
        const oldWs = wsRef.current;
        wsRef.current = null;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        oldWs.close(1000, isExplicit ? 'User stopped stream' : 'Stream reset');
      }
    } catch (_) {}
    wsRef.current = null;

    setIsStreaming(false);
    if (isExplicit) {
      setStreamStatus('IDLE');
      onStatusChangeRef.current?.('IDLE');
    }
  }, [releaseWakeLock, stopCompositorWorker]);

  const startStreaming = useCallback(async (activeStream?: MediaStream | null, overrideKey?: string, overrideUrl?: string, isAutoReconnect = false) => {
    if (!isAutoReconnect && (isStreamingRef.current || isConnectingRef.current)) {
      console.log('[useRtmpStreamer] Stream is already connecting or running; ignoring duplicate start call.');
      return true;
    }

    stopStreaming(false);
    if (!isAutoReconnect) {
      reconnectAttemptsRef.current = 0;
    }
    isConnectingRef.current = true;
    isStreamingRef.current = true;
    setStreamStatus('CONNECTING');
    setStreamError(null);
    onStatusChangeRef.current?.('CONNECTING');
    acquireWakeLock();

    try {
      const mode = aspectModeRef.current;
      const winIsPortrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
      const preferPortrait = mode === 'portrait' ? true : mode === 'landscape' ? false : winIsPortrait;

      let rawStream = activeStream;
      if (!rawStream || rawStream.getVideoTracks().length === 0 || rawStream.getVideoTracks()[0]?.readyState === 'ended') {
        console.log('[useRtmpStreamer] Requesting user media stream...');
        try {
          rawStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: preferPortrait ? 720 : 1280, min: 640 },
              height: { ideal: preferPortrait ? 1280 : 720, min: 480 },
              frameRate: { ideal: 30 }
            } as any,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } catch (camErr) {
          console.warn('[useRtmpStreamer] Camera unavailable or permission denied; using Showcase Canvas fallback stream:', camErr);
          rawStream = new MediaStream();
        }
      }

      // Upgrade low-res camera tracks to HD and reset hardware camera zoom / continuous autofocus (Safari-safe)
      await ensureHdCameraTrack(rawStream.getVideoTracks()[0] || null, preferPortrait);

      // Find or acquire a dedicated persistent microphone track FIRST so Front/Back camera stream stops NEVER kill mic audio
      const isRealMicTrack = (t?: MediaStreamTrack | null) =>
        Boolean(t && t.readyState === 'live' && !t.label.includes('MediaStreamAudioDestinationNode'));

      let hardwareMicTrack: MediaStreamTrack | null =
        micStreamRef.current?.getAudioTracks().find(t => isRealMicTrack(t)) || null;

      if (!hardwareMicTrack && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          console.log('[useRtmpStreamer] 🎙️ Requesting dedicated persistent microphone stream...');
          const dedicatedMic = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: false
          });
          micStreamRef.current = dedicatedMic;
          hardwareMicTrack = dedicatedMic.getAudioTracks()[0] || null;
        } catch (micErr) {
          console.warn('[useRtmpStreamer] Dedicated microphone request warning, checking stream tracks:', micErr);
        }
      }

      if (!hardwareMicTrack) {
        hardwareMicTrack = rawStream.getAudioTracks().find(t => isRealMicTrack(t)) || null;
      }

      if (!hardwareMicTrack && typeof document !== 'undefined') {
        const pageVideo = document.querySelector('video') as HTMLVideoElement | null;
        const pageStream = pageVideo?.srcObject as MediaStream | null;
        hardwareMicTrack = pageStream?.getAudioTracks().find(t => isRealMicTrack(t)) || null;
      }

      activeMediaStreamRef.current = rawStream;

      // Wrap in 30fps 1280x720 Canvas Compositor + Clock-Synchronized 2.8x Mic Booster
      const mediaStream = createHudCompositedStream(rawStream, hardwareMicTrack);
      localStreamRef.current = mediaStream;

      // Wait up to 1200ms on cold start for camera video element to decode its first frame (videoWidth > 0) so initial WebM keyframe is never blank
      const waitVideo = compositorVideoRef.current;
      if (waitVideo && (waitVideo.readyState < 2 || waitVideo.videoWidth === 0)) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1200);
          const checkReady = () => {
            if (waitVideo.readyState >= 2 && waitVideo.videoWidth > 0) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(checkReady, 50);
            }
          };
          checkReady();
        });
      }

      let wsBase = '';
      if (import.meta.env?.VITE_WS_RELAY_URL) {
        wsBase = import.meta.env.VITE_WS_RELAY_URL;
      } else if (typeof window !== 'undefined') {
        const isVercel = window.location.hostname.endsWith('.vercel.app');
        if (isVercel) {
          wsBase = 'wss://vintage-vibes-erp-production.up.railway.app/api/live/stream/rtmp-relay';
        } else {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsBase = `${protocol}//${window.location.host}/api/live/stream/rtmp-relay`;
        }
      }

      const currentBooth = boothIdRef.current || 'booth-1';
      let activeKey = (overrideKey || streamKeyRef.current)?.trim() || '';
      let activeUrl = (overrideUrl || rtmpUrlRef.current)?.trim() || '';

      if (!activeKey) {
        try {
          const boothRes = await fetch('/api/setup/live-booths');
          if (boothRes.ok) {
            const boothJson = await boothRes.json();
            const booths = Array.isArray(boothJson?.booths) ? boothJson.booths : Array.isArray(boothJson?.data) ? boothJson.data : [];
            const matched = booths.find((b: any) => String(b.boothId || b.id || '').toLowerCase() === currentBooth.toLowerCase()) || booths[0];
            if (matched) {
              const candidateKey = (matched.youtubeStreamKey || matched.youTubeStreamKey || matched.masterStreamKey || '').trim();
              if (candidateKey && !candidateKey.startsWith('re_live_sec_')) {
                activeKey = candidateKey;
              }
              const candidateUrl = (matched.masterIngestRtmpUrl || '').trim();
              if (candidateUrl && !candidateUrl.includes('live.restream.io')) {
                activeUrl = candidateUrl;
              }
            }
          }
        } catch (_) {}
      }

      if (!activeKey) {
        try {
          const res = await fetch('/api/setup/live-multicast');
          if (res.ok) {
            const json = await res.json();
            const d = json?.data;
            if (d?.youTubeStreamKey || d?.youtube_stream_key) {
              activeKey = (d.youTubeStreamKey || d.youtube_stream_key).trim();
            } else if (d?.masterStreamKey || d?.master_stream_key) {
              const k = (d.masterStreamKey || d.master_stream_key).trim();
              if (!k.startsWith('re_live_sec_10482')) {
                activeKey = k;
              }
            }
            if (d?.masterIngestRtmpUrl || d?.master_ingest_rtmp_url) {
              const u = (d.masterIngestRtmpUrl || d.master_ingest_rtmp_url).trim();
              if (!u.includes('live.restream.io')) {
                activeUrl = u;
              }
            }
          }
        } catch (_) {}
      }

      if (!activeUrl) activeUrl = 'rtmp://a.rtmp.youtube.com/live2';

      const queryParams = `?boothId=${encodeURIComponent(currentBooth)}&streamKey=${encodeURIComponent(activeKey)}&rtmpUrl=${encodeURIComponent(activeUrl)}`;

      const fallbackWsUrl = `${wsBase}${queryParams}`;

      const connectRelaySocket = async (): Promise<WebSocket> => {
        const stdWs = new WebSocket(fallbackWsUrl);
        stdWs.binaryType = 'arraybuffer';
        return stdWs;
      };

      console.log(`[useRtmpStreamer] Connecting to RTMP relay WebSocket for ${currentBooth}...`);
      const ws = await connectRelaySocket();
      wsRef.current = ws;

      // Connect Host 2-Way Intercom Receiver (Private Ear-Piece + On-Air Mixer)
      const connectHostIntercom = () => {
        if (!isStreamingRef.current) return;
        try {
          if (intercomWsRef.current && intercomWsRef.current.readyState === WebSocket.OPEN) return;
          const intercomUrl = `${wsBase.replace(/\/rtmp-relay\/?$/, '/intercom')}?boothId=${encodeURIComponent(currentBooth)}&role=host`;
          const iWs = new WebSocket(intercomUrl);
          iWs.binaryType = 'arraybuffer';
          intercomWsRef.current = iWs;
          let nextIntercomAt = 0;
          let onAirGain: GainNode | null = null;

          iWs.onmessage = (iEvt) => {
            if (intercomWsRef.current !== iWs) return;
            if (typeof iEvt.data === 'string') {
              try {
                const j = JSON.parse(iEvt.data);
                if (j?.type === 'INTERCOM_TALK_STATE') {
                  showIntercomBanner(Boolean(j.speaking), j.mode === 'onair' ? 'onair' : 'private', j.bossName);
                }
              } catch (_) {}
              return;
            }
            if (!(iEvt.data instanceof ArrayBuffer) || iEvt.data.byteLength < 3) return;
            const actx = audioCtxRef.current;
            if (!actx) return;
            if (actx.state === 'suspended') {
              actx.resume().catch(() => {});
            }
            const view = new DataView(iEvt.data);
            const modeByte = view.getUint8(0);
            const sampleCount = Math.floor((iEvt.data.byteLength - 1) / 2);
            if (sampleCount <= 0) return;

            const audioBuf = actx.createBuffer(1, sampleCount, 16000);
            const chData = audioBuf.getChannelData(0);
            for (let s = 0; s < sampleCount; s++) {
              chData[s] = view.getInt16(1 + s * 2, true) / 32768;
            }

            const src = actx.createBufferSource();
            src.buffer = audioBuf;
            src.connect(actx.destination);

            if (modeByte === 1 && broadcastAudioDstRef.current) {
              if (!onAirGain || onAirGain.context !== actx) {
                onAirGain = actx.createGain();
                onAirGain.gain.value = 1.15;
                onAirGain.connect(broadcastAudioDstRef.current);
              }
              src.connect(onAirGain);
            }

            const nowT = actx.currentTime;
            if (nextIntercomAt < nowT || nextIntercomAt > nowT + 0.65) {
              nextIntercomAt = nowT + 0.025;
            }
            try {
              src.start(nextIntercomAt);
              nextIntercomAt += audioBuf.duration;
            } catch (_) {}
          };

          iWs.onclose = () => {
            if (intercomWsRef.current === iWs) {
              intercomWsRef.current = null;
              if (isStreamingRef.current) {
                setTimeout(() => {
                  if (isStreamingRef.current) connectHostIntercom();
                }, 2500);
              }
            }
          };
          iWs.onerror = () => {
            try { iWs.close(); } catch (_) {}
          };
        } catch (iErr) {
          console.warn('[useRtmpStreamer] Intercom socket notice:', iErr);
        }
      };
      connectHostIntercom();

      // Prefer software VP8+Opus in WebM, with clean fallbacks for WebKit/Safari
      const supportedMime = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4'
      ].find(mime => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) || '';

      const setupKeepAlive = () => {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
            } catch (_) {}
          }
        }, 15000);
      };

      if (ws.readyState === WebSocket.OPEN) {
        setupKeepAlive();
      } else {
        ws.onopen = () => {
          if (wsRef.current !== ws) return;
          console.log('[useRtmpStreamer] RTMP WebSocket connected. Initializing 30fps HUD MediaRecorder...');
          setupKeepAlive();
        };
      }

      ws.onmessage = async (evt) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'HEARTBEAT' || msg.type === 'PONG') {
            return;
          }
          if (msg.type === 'SUPERSEDED') {
            console.warn('[useRtmpStreamer] Stream superseded by another active broadcast tab; stopping cleanly.');
            const supersededMsg = 'Broadcast moved to another active studio tab — this tab is no longer transmitting.';
            stopStreaming(true);
            setStreamError(supersededMsg);
            setStreamStatus('ERROR');
            onStatusChangeRef.current?.('ERROR', supersededMsg);
            return;
          }
          if (msg.type === 'READY_FOR_CHUNKS') {
            console.log('[useRtmpStreamer] Server ready for video chunks. Target:', msg.destination);

            reconnectAttemptsRef.current = 0;
            isConnectingRef.current = false;
            if (recorderWatchdogRef.current) {
              clearTimeout(recorderWatchdogRef.current);
              recorderWatchdogRef.current = null;
            }

            let chunksSentCount = 0;
            let sendChain = Promise.resolve();

            const startLocalMediaRecorder = (allowExplicitOpts: boolean) => {
              if (recorderRef.current) {
                try {
                  recorderRef.current.ondataavailable = null;
                  recorderRef.current.onerror = null;
                  if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
                } catch (_) {}
              }
              let recorder: MediaRecorder;
              if (allowExplicitOpts && supportedMime) {
                recorder = new MediaRecorder(mediaStream, {
                  mimeType: supportedMime,
                  videoBitsPerSecond: 4500000,
                  audioBitsPerSecond: 128000
                });
              } else {
                recorder = new MediaRecorder(mediaStream);
              }
              recorderRef.current = recorder;

              recorder.ondataavailable = (e) => {
                if (wsRef.current !== ws) return;
                if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                  chunksSentCount += 1;
                  if (recorderWatchdogRef.current) {
                    clearTimeout(recorderWatchdogRef.current);
                    recorderWatchdogRef.current = null;
                  }
                  const blob = e.data;
                  sendChain = sendChain
                    .then(() => blob.arrayBuffer())
                    .then((buffer) => {
                      if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(buffer);
                      }
                    })
                    .catch(() => {});
                }
              };

              recorder.onerror = (err) => {
                if (wsRef.current !== ws) return;
                const msgText = 'MediaRecorder error: ' + ((err as any)?.message || (err as any)?.error?.message || 'Recorder failed');
                console.error('[useRtmpStreamer] MediaRecorder error:', err);
                setStreamError(msgText);
                onStatusChangeRef.current?.('ERROR', msgText);
                stopStreaming();
              };

              recorder.start(allowExplicitOpts ? 200 : 250);
            };

            try {
              startLocalMediaRecorder(true);
            } catch (recInitErr: any) {
              console.warn('[useRtmpStreamer] Primary MediaRecorder init failed, retrying default codec:', recInitErr);
              try {
                startLocalMediaRecorder(false);
              } catch (recFallbackErr: any) {
                const fatalMsg = recFallbackErr?.message || recInitErr?.message || 'Failed to start MediaRecorder';
                console.error('[useRtmpStreamer] Fatal MediaRecorder failure:', recFallbackErr);
                setStreamError(fatalMsg);
                setStreamStatus('ERROR');
                onStatusChangeRef.current?.('ERROR', fatalMsg);
                stopStreaming();
                return;
              }
            }

            recorderWatchdogRef.current = setTimeout(() => {
              recorderWatchdogRef.current = null;
              if (chunksSentCount === 0 && wsRef.current === ws && ws.readyState === WebSocket.OPEN && isStreamingRef.current) {
                console.warn('[useRtmpStreamer] Watchdog restarted MediaRecorder after 0 chunks in 4.5s');
                try {
                  startLocalMediaRecorder(false);
                } catch (wdErr: any) {
                  const errMsg = wdErr?.message || 'Camera encoder failed to emit video frames';
                  setStreamError(errMsg);
                  setStreamStatus('ERROR');
                  onStatusChangeRef.current?.('ERROR', errMsg);
                }
              }
            }, 4500);

            isStreamingRef.current = true;
            setIsStreaming(true);
            setStreamStatus('LIVE');
            onStatusChangeRef.current?.('LIVE', `Broadcasting to ${msg.destination}`);
          } else if (msg.type === 'ERROR') {
            console.error('[useRtmpStreamer] Server error:', msg.error);
            setStreamError(msg.error);
            setStreamStatus('ERROR');
            onStatusChangeRef.current?.('ERROR', msg.error);
            stopStreaming();
          } else if (msg.type === 'STREAM_ENDED') {
            console.warn('[useRtmpStreamer] Stream ended by server:', msg.error || msg.code);
            const errDetail = msg.error ? `Server stream ended: ${msg.error}` : `Stream ended by server (code ${msg.code})`;

            if (isStreamingRef.current && reconnectAttemptsRef.current < 50) {
              reconnectAttemptsRef.current += 1;
              const attempt = reconnectAttemptsRef.current;
              console.warn(`[useRtmpStreamer] Stream interrupted; auto-reconnecting in 800ms (attempt ${attempt}/50)...`);
              setStreamStatus('CONNECTING');
              onStatusChangeRef.current?.('CONNECTING', `Auto-reconnecting to stream (attempt ${attempt}/50)...`);
              stopStreaming(false);
              reconnectTimeoutRef.current = setTimeout(() => {
                const cur = activeMediaStreamRef.current;
                const liveFallback =
                  cur && cur.getVideoTracks().some(t => t.readyState === 'live')
                    ? cur
                    : (typeof document !== 'undefined'
                        ? (Array.from(document.querySelectorAll('video')).find(v => {
                            const s = v.srcObject as MediaStream | null;
                            return Boolean(s && s.getVideoTracks().some(t => t.readyState === 'live' && !/canvas/i.test(t.label || '')));
                          })?.srcObject as MediaStream | null) || cur
                        : cur);
                startStreaming(liveFallback, activeKey, activeUrl, true);
              }, 800);
              return;
            }

            setStreamError(errDetail);
            setStreamStatus('ERROR');
            onStatusChangeRef.current?.('ERROR', errDetail);
            stopStreaming();
          }
        } catch (msgErr: any) {
          console.error('[useRtmpStreamer] ws.onmessage error:', msgErr);
        }
      };

      ws.onerror = (err) => {
        if (wsRef.current !== ws) return;
        console.error('[useRtmpStreamer] WebSocket error:', err);
      };

      ws.onclose = (evt: CloseEvent) => {
        if (wsRef.current !== ws) return;
        console.log(`[useRtmpStreamer] WebSocket closed: code=${evt.code}, reason=${evt.reason || 'None'}, wasClean=${evt.wasClean}`);
        if (evt.reason?.includes('Superseded') || evt.reason?.includes('User stopped')) {
          return;
        }
        if (isStreamingRef.current && reconnectAttemptsRef.current < 50) {
          reconnectAttemptsRef.current += 1;
          const attempt = reconnectAttemptsRef.current;
          console.warn(`[useRtmpStreamer] Socket closed; auto-reconnecting in 800ms (attempt ${attempt}/50)...`);
          setStreamStatus('CONNECTING');
          onStatusChangeRef.current?.('CONNECTING', `Auto-reconnecting to stream (attempt ${attempt}/50)...`);
          stopStreaming(false);
          reconnectTimeoutRef.current = setTimeout(() => {
            const cur = activeMediaStreamRef.current;
            const liveFallback =
              cur && cur.getVideoTracks().some(t => t.readyState === 'live')
                ? cur
                : (typeof document !== 'undefined'
                    ? (Array.from(document.querySelectorAll('video')).find(v => {
                        const s = v.srcObject as MediaStream | null;
                        return Boolean(s && s.getVideoTracks().some(t => t.readyState === 'live' && !/canvas/i.test(t.label || '')));
                      })?.srcObject as MediaStream | null) || cur
                    : cur);
            startStreaming(liveFallback, activeKey, activeUrl, true);
          }, 800);
          return;
        }
        if (isStreamingRef.current) {
          const closeErr = 'Live relay connection closed — broadcast stopped.';
          stopStreaming(true);
          setStreamError(closeErr);
          setStreamStatus('ERROR');
          onStatusChangeRef.current?.('ERROR', closeErr);
        }
      };

      return true;
    } catch (err: any) {
      console.error('[useRtmpStreamer] Failed to start stream:', err);
      const errMsg = err?.message || 'Camera or microphone access denied';
      setStreamError(errMsg);
      setStreamStatus('ERROR');
      onStatusChangeRef.current?.('ERROR', errMsg);
      stopStreaming();
      return false;
    }
  }, [stopStreaming, acquireWakeLock, createHudCompositedStream, showIntercomBanner, ensureHdCameraTrack]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isStreamingRef.current) {
        acquireWakeLock();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [acquireWakeLock]);

  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (recorderWatchdogRef.current) clearTimeout(recorderWatchdogRef.current);
      releaseWakeLock();
      stopCompositorWorker();
      clearIntercomBanner();
      try {
        if (intercomWsRef.current) {
          intercomWsRef.current.close();
          intercomWsRef.current = null;
        }
      } catch (_) {}
      if (micStreamRef.current) {
        try {
          micStreamRef.current.getTracks().forEach(t => t.stop());
        } catch (_) {}
        micStreamRef.current = null;
      }
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch (_) {}
      try {
        if (wsRef.current) {
          wsRef.current.close();
        }
      } catch (_) {}
    };
  }, [releaseWakeLock, stopCompositorWorker, clearIntercomBanner]);

  return {
    isStreaming,
    streamStatus,
    streamError,
    startStreaming,
    stopStreaming
  };
}

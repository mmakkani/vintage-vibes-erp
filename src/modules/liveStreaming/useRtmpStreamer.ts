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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

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
   * Wrap raw camera MediaStream in a 30fps 1280x720 Canvas Compositor + Clock-Synchronized AudioContext Booster.
   * Ensures:
   * 1) Constant 30.00 FPS output even when room lighting drops webcam to 15fps or host switches browser tabs.
   * 2) Instant Front / Back / Tag Garment Photo switching, SKU Barcode, and AED Price HUD burned onto YouTube Live.
   * 3) Zero-offset (t=0) microphone audio with 2.8x broadcast gain & dynamic compression so audio is loud and never desyncs.
   */
  const createHudCompositedStream = useCallback((rawStream: MediaStream, hardwareMicTrack: MediaStreamTrack | null): MediaStream => {
    if (typeof document === 'undefined') return rawStream;
    stopCompositorWorker();
    preloadInventoryPieces();

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return rawStream;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const hiddenVideo = document.createElement('video');
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.autoplay = true;
    hiddenVideo.srcObject = rawStream;
    hiddenVideo.play().catch(() => {});
    compositorVideoRef.current = hiddenVideo;

    // Set up Studio-Grade Web Audio Noise Cancellation & Vocal Gate at t=0
    let audioAnalyser: AnalyserNode | null = null;
    let noiseGateGainNode: GainNode | null = null;
    let syncedAudioTrack: MediaStreamTrack | null = null;
    const freqData = new Uint8Array(32);

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const actx = new AudioContextClass({ latencyHint: 'interactive' });
        audioCtxRef.current = actx;
        if (actx.state === 'suspended') {
          actx.resume().catch(() => {});
        }

        const dst = actx.createMediaStreamDestination();

        // Sub-audible continuous carrier so AAC encoder clock never stalls
        const osc = actx.createOscillator();
        const silentGain = actx.createGain();
        silentGain.gain.value = 0.0001;
        osc.connect(silentGain);
        silentGain.connect(dst);
        osc.start();

        if (hardwareMicTrack && hardwareMicTrack.readyState === 'live') {
          hardwareMicTrack.enabled = true;
          try {
            if (typeof hardwareMicTrack.applyConstraints === 'function') {
              hardwareMicTrack.applyConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              } as any).catch(() => {});
            }
          } catch (_) {}

          const micMedia = new MediaStream([hardwareMicTrack]);
          const micSource = actx.createMediaStreamSource(micMedia);

          // 1. High-Pass Filter (140 Hz) — Cuts out AC rumble, ceiling fan wind, and desk vibrations
          const highPass = actx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = 140;
          highPass.Q.value = 0.707;

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

          micSource.connect(highPass);
          highPass.connect(humNotch);
          humNotch.connect(lowPass);
          lowPass.connect(analyser);
          analyser.connect(gateGain);
          gateGain.connect(compressor);
          compressor.connect(dst);
          console.log(`[useRtmpStreamer] 🎙️ Studio Noise Cancellation (140Hz HPF + 50Hz Notch + 6.8kHz LPF + Adaptive Vocal Gate) active on: "${hardwareMicTrack.label}"`);
        } else {
          console.warn('[useRtmpStreamer] ⚠️ No live hardware mic track available at compositor init; using carrier tone');
        }

        syncedAudioTrack = dst.stream.getAudioTracks()[0] || null;
      }
    } catch (audioErr) {
      console.warn('[useRtmpStreamer] Web Audio pipeline init warning:', audioErr);
    }

    // Cached HUD state scraped from Studio DOM every 100ms (10x/sec for instant Front/Back/Tag reactivity)
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

    const scanDomForActiveGarment = (now: number) => {
      if (now - lastDomScan < 100) return;
      lastDomScan = now;
      try {
        // 0. Check for explicit [data-host-announcement] element in Studio DOM
        const hostMsgEl = document.querySelector('[data-host-announcement]') as HTMLElement | null;
        if (hostMsgEl) {
          const msgTxt = hostMsgEl.getAttribute('data-host-announcement') || '';
          const msgSender = hostMsgEl.getAttribute('data-host-sender') || 'Vintage Vibes Host';
          const msgTs = Number(hostMsgEl.getAttribute('data-host-ts') || 0);
          if (msgTxt && Date.now() - msgTs < 30000) {
            hostAnnouncementRef.current = { text: msgTxt, sender: msgSender, timestamp: msgTs };
          } else {
            hostAnnouncementRef.current = null;
          }
        }

        // 0b. Check for explicit [data-live-hud-card] in LiveSellingStudio / MobileLiveHostView
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
            return;
          }
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

        // 4. Check Minimized Garment Pill in MobileLiveHostView
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
        }
      } catch (_) {}
    };

    const paintFrame = () => {
      const now = performance.now();
      scanDomForActiveGarment(now);

      const sourceVideo =
        (hiddenVideo.readyState >= 2 && hiddenVideo.videoWidth > 0)
          ? hiddenVideo
          : (document.querySelector('video') as HTMLVideoElement | null) || hiddenVideo;

      if (sourceVideo && sourceVideo.paused && sourceVideo.srcObject) {
        sourceVideo.play().catch(() => {});
      }

      const vw = sourceVideo?.videoWidth || 1280;
      const vh = sourceVideo?.videoHeight || 720;

      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, 1280, 720);

      if (sourceVideo && vw > 0 && vh > 0) {
        const scale = Math.min(1280 / vw, 720 / vh);
        const dw = Math.round(vw * scale);
        const dh = Math.round(vh * scale);
        const dx = Math.round((1280 - dw) / 2);
        const dy = Math.round((720 - dh) / 2);
        const shouldMirror = typeof window !== 'undefined' ? (window as any).__vvCameraMirrorFlip !== false : true;
        try {
          ctx.save();
          if (shouldMirror) {
            ctx.translate(1280, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(sourceVideo, 0, 0, vw, vh, dx, dy, dw, dh);
          ctx.restore();
        } catch (_) {
          try { ctx.restore(); } catch (_) {}
        }
      }

      // Compute real-time microphone audio level (0..1) and drive adaptive studio noise gate
      let micLevel = 0;
      if (audioAnalyser) {
        try {
          audioAnalyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 2; i < 18; i++) sum += freqData[i];
          micLevel = Math.min(1, (sum / (16 * 130)));
          if (noiseGateGainNode && audioCtxRef.current && !isMicMutedRef.current) {
            const now = audioCtxRef.current.currentTime;
            // Voice threshold: if ambient room/fan noise is below 0.10, gate down to 0.015 (near silence); when speaking, open smoothly to 1.2x
            const targetGain = micLevel > 0.10 ? 1.20 : 0.015;
            const timeConstant = micLevel > 0.10 ? 0.006 : 0.085;
            noiseGateGainNode.gain.setTargetAtTime(targetGain, now, timeConstant);
          }
        } catch (_) {}
      }

      // 1. Top-Left Live Broadcast Badge + Live Microphone Level Meter
      ctx.save();
      ctx.fillStyle = 'rgba(220, 38, 38, 0.94)';
      ctx.beginPath();
      ctx.roundRect(24, 20, 96, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 14px sans-serif';
      ctx.fillText('● LIVE HD', 38, 41);

      ctx.fillStyle = 'rgba(12, 10, 9, 0.86)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(128, 20, 232, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('VINTAGE VIBES • DUBAI', 144, 41);

      // Live Audio Level Meter Pill
      ctx.fillStyle = 'rgba(12, 10, 9, 0.86)';
      ctx.strokeStyle = micLevel > 0.05 ? 'rgba(52, 211, 153, 0.85)' : 'rgba(148, 163, 184, 0.4)';
      ctx.beginPath();
      ctx.roundRect(368, 20, 134, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = micLevel > 0.05 ? '#34d399' : '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('🎙️ MIC', 378, 41);

      // 8 Dynamic Equalizer Bars
      for (let b = 0; b < 8; b++) {
        const threshold = (b + 1) / 8;
        const active = micLevel >= threshold * 0.75 || (b === 0 && hardwareMicTrack?.readyState === 'live');
        ctx.fillStyle = active ? (b >= 6 ? '#fbbf24' : '#10b981') : 'rgba(255,255,255,0.18)';
        const barH = 6 + b * 2;
        ctx.fillRect(428 + b * 8, 44 - barH, 5, barH);
      }
      ctx.restore();

      // 1b. Draw Host Live Chat / Announcement Banner on Broadcast Video if active
      const hostAnn = hostAnnouncementRef.current;
      if (hostAnn && Date.now() - hostAnn.timestamp < 30000) {
        ctx.save();
        ctx.fillStyle = 'rgba(12, 10, 9, 0.92)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(24, 62, 620, 52, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(34, 72, 92, 32, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px sans-serif';
        ctx.fillText('📢 HOST', 50, 93);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(hostAnn.text.slice(0, 48), 138, 94);
        ctx.restore();
      }

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
        const activeImg =
          hud.angle === 'back'
            ? (hud.backImg || hud.imgEl)
            : hud.angle === 'tag'
              ? (hud.tagImg || hud.imgEl)
              : (hud.frontImg || hud.imgEl);

        const angleLabel =
          hud.angle === 'back'
            ? '📸 BACK VIEW'
            : hud.angle === 'tag'
              ? '🏷️ TAG DETAIL'
              : '📸 FRONT VIEW';

        // 2. Top-Right "GARMENT LIVE" Floating Showcase Card (mirrors Host UI with Front / Back / Tag selector tabs!)
        const pipW = 248;
        const pipH = 336;
        const pipX = 1280 - pipW - 24;
        const pipY = 20;

        ctx.save();
        ctx.fillStyle = 'rgba(9, 10, 15, 0.92)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(pipX, pipY, pipW, pipH, 16);
        ctx.fill();
        ctx.stroke();

        // Header bar
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 12px sans-serif';
        ctx.fillText('✨ GARMENT LIVE', pipX + 14, pipY + 22);

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(angleLabel, pipX + 138, pipY + 22);

        // Main Square Photo (224x210)
        const pImgX = pipX + 12;
        const pImgY = pipY + 32;
        const pImgW = pipW - 24;
        const pImgH = 210;

        if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(pImgX, pImgY, pImgW, pImgH, 10);
            ctx.clip();
            ctx.drawImage(activeImg, pImgX, pImgY, pImgW, pImgH);
            ctx.restore();
          } catch (_) {
            ctx.restore();
          }
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(pImgX, pImgY, pImgW, pImgH, 10);
          ctx.fill();
        }

        // Size Badge on top-right of photo
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(pImgX + pImgW - 42, pImgY + 8, 34, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#090a0f';
        ctx.font = '900 12px sans-serif';
        ctx.fillText(hud.size.replace(/^Size:\s*/i, ''), pImgX + pImgW - 33, pImgY + 23);

        // Price Badge on bottom-left of photo
        ctx.fillStyle = 'rgba(9, 10, 15, 0.9)';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(pImgX + 8, pImgY + pImgH - 32, 96, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.font = '900 13px monospace';
        ctx.fillText(hud.price, pImgX + 16, pImgY + pImgH - 15);

        // [Front] [Back] [Tag] Angle Tabs
        const tabs: Array<{ key: 'front' | 'back' | 'tag'; label: string }> = [
          { key: 'front', label: 'Front' },
          { key: 'back', label: 'Back' },
          { key: 'tag', label: 'Tag' }
        ];
        const tabW = 70;
        const tabY = pImgY + pImgH + 8;
        tabs.forEach((t, idx) => {
          const tx = pImgX + idx * (tabW + 7);
          const isActive = hud.angle === t.key;
          ctx.fillStyle = isActive ? '#f59e0b' : 'rgba(30, 41, 59, 0.9)';
          ctx.beginPath();
          ctx.roundRect(tx, tabY, tabW, 24, 6);
          ctx.fill();
          ctx.fillStyle = isActive ? '#090a0f' : '#cbd5e1';
          ctx.font = isActive ? '900 12px sans-serif' : 'bold 11px sans-serif';
          ctx.fillText(t.label, tx + 20, tabY + 16);
        });

        // Barcode & Title footer inside Top-Right Card
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(hud.barcode.slice(0, 28), pImgX, tabY + 42);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(hud.title.slice(0, 28), pImgX, tabY + 60);
        ctx.restore();

        // 3. Bottom-Left Active Garment Picture & Price HUD Overlay
        const cardX = 24;
        const cardY = 520;
        const cardW = 610;
        const cardH = 176;

        ctx.save();
        ctx.fillStyle = 'rgba(12, 10, 9, 0.90)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        ctx.fill();
        ctx.stroke();

        // Garment Photo Thumbnail (144x144) showing active angle (Front / Back / Tag)
        const imgX = cardX + 16;
        const imgY = cardY + 16;
        const imgSize = 144;

        let drewPhoto = false;
        if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
            ctx.clip();
            ctx.drawImage(activeImg, imgX, imgY, imgSize, imgSize);
            ctx.restore();

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
            ctx.stroke();
            drewPhoto = true;
          } catch (_) {
            ctx.restore();
          }
        }
        if (!drewPhoto) {
          ctx.fillStyle = '#1c1917';
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('VINTAGE LOT', imgX + 24, imgY + 78);
        }

        const textX = imgX + imgSize + 20;

        // Angle Indicator Badge + SKU Barcode
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(textX, cardY + 18, 124, 24, 6);
        ctx.fill();
        ctx.fillStyle = '#0c0a09';
        ctx.font = '900 11px sans-serif';
        ctx.fillText(angleLabel, textX + 10, cardY + 34);

        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(hud.barcode.slice(0, 28), textX + 134, cardY + 35);

        // Garment Brand & Item Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 21px sans-serif';
        ctx.fillText(hud.title.slice(0, 34), textX, cardY + 74);

        // Size Pill & Price
        ctx.fillStyle = '#fcd34d';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(`Size: ${hud.size.replace(/^Size:\s*/i, '')}`, textX, cardY + 114);

        ctx.fillStyle = '#34d399';
        ctx.font = '900 32px sans-serif';
        ctx.fillText(hud.price, textX + 110, cardY + 118);

        // Call to action footer
        ctx.fillStyle = '#d6d3d1';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`💬 Comment "CLAIM ${hud.barcode}" in Live Chat to Order`, textX, cardY + 154);
        ctx.restore();

        // 4. Center-Screen HD Lightbox Zoom if Host opened Full-Screen Photo View
        if (isLightboxOpenRef.current && activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
          ctx.fillRect(0, 0, 1280, 720);

          const zoomSize = 520;
          const zx = (1280 - zoomSize) / 2;
          const zy = 64;
          ctx.beginPath();
          ctx.roundRect(zx, zy, zoomSize, zoomSize, 20);
          ctx.clip();
          ctx.drawImage(activeImg, zx, zy, zoomSize, zoomSize);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect((1280 - 520) / 2, 64, 520, 520, 20);
          ctx.stroke();

          ctx.fillStyle = 'rgba(12, 10, 9, 0.92)';
          ctx.beginPath();
          ctx.roundRect((1280 - 420) / 2, 600, 420, 48, 12);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.font = '900 18px sans-serif';
          ctx.fillText(`${angleLabel} • ${hud.price} • Size ${hud.size}`, (1280 - 420) / 2 + 32, 630);
          ctx.restore();
        }
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
  }, [stopCompositorWorker, preloadInventoryPieces, getCorsSafeImage]);

  const stopStreaming = useCallback((isExplicit = true) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (isExplicit) {
      reconnectAttemptsRef.current = 999;
      releaseWakeLock();
      stopCompositorWorker();
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
    setStreamStatus('IDLE');
    onStatusChangeRef.current?.('IDLE');
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
      let rawStream = activeStream;
      if (!rawStream || rawStream.getVideoTracks().length === 0 || rawStream.getVideoTracks()[0]?.readyState === 'ended') {
        console.log('[useRtmpStreamer] Requesting user media stream...');
        rawStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, aspectRatio: { ideal: 16 / 9 }, frameRate: { ideal: 30 }, resizeMode: 'none' } as any,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      }

      // Reset hardware camera zoom to minimum (1.0x wide field of view) if supported by the camera
      try {
        const vTrack = rawStream.getVideoTracks()[0];
        if (vTrack && typeof (vTrack as any).getCapabilities === 'function') {
          const caps = (vTrack as any).getCapabilities();
          if (caps && caps.zoom && typeof caps.zoom.min === 'number') {
            await vTrack.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] });
          }
        }
      } catch (_) {}

      // Find a genuine hardware microphone track (ignoring any synthetic silent WebAudio track from MobileLiveHostView)
      const isRealMicTrack = (t?: MediaStreamTrack | null) =>
        Boolean(t && t.readyState === 'live' && !t.label.includes('MediaStreamAudioDestinationNode'));

      let hardwareMicTrack: MediaStreamTrack | null =
        rawStream.getAudioTracks().find(t => isRealMicTrack(t)) || null;

      if (!hardwareMicTrack && typeof document !== 'undefined') {
        const pageVideo = document.querySelector('video') as HTMLVideoElement | null;
        const pageStream = pageVideo?.srcObject as MediaStream | null;
        hardwareMicTrack = pageStream?.getAudioTracks().find(t => isRealMicTrack(t)) || null;
      }

      if (!hardwareMicTrack && micStreamRef.current) {
        hardwareMicTrack = micStreamRef.current.getAudioTracks().find(t => isRealMicTrack(t)) || null;
      }

      // Explicitly acquire real microphone if not present yet
      if (!hardwareMicTrack && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          console.log('[useRtmpStreamer] 🎙️ Requesting dedicated hardware microphone stream...');
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
          console.warn('[useRtmpStreamer] Dedicated microphone request warning:', micErr);
        }
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

      // Prefer software VP8+Opus in WebM to prevent Windows Chrome MediaFoundation H.264 STATUS_BREAKPOINT crashes
      const supportedMime = [
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find(mime => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) || 'video/webm';

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
            stopStreaming(true);
            return;
          }
          if (msg.type === 'READY_FOR_CHUNKS') {
            console.log('[useRtmpStreamer] Server ready for video chunks. Target:', msg.destination);

            reconnectAttemptsRef.current = 0;
            isConnectingRef.current = false;
            const recorder = new MediaRecorder(mediaStream, {
              mimeType: supportedMime,
              videoBitsPerSecond: 1800000,
              audioBitsPerSecond: 128000
            });
            recorderRef.current = recorder;

            // Strict sequential FIFO Promise chain so WebM EBML clusters are NEVER sent out-of-order or dropped mid-stream
            let sendChain = Promise.resolve();
            recorder.ondataavailable = (e) => {
              if (wsRef.current !== ws) return;
              if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
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
              console.error('[useRtmpStreamer] MediaRecorder error:', err);
              setStreamError('MediaRecorder error: ' + (err as any).message);
              stopStreaming();
            };

            // 100ms rock-solid low-latency chunk intervals for continuous EBML WebM streaming
            recorder.start(100);
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
              console.warn(`[useRtmpStreamer] Stream interrupted; auto-reconnecting in 2s (attempt ${attempt}/50)...`);
              setStreamStatus('CONNECTING');
              onStatusChangeRef.current?.('CONNECTING', `Auto-reconnecting to stream (attempt ${attempt}/50)...`);
              stopStreaming(false);
              reconnectTimeoutRef.current = setTimeout(() => {
                startStreaming(activeMediaStreamRef.current, activeKey, activeUrl, true);
              }, 2000);
              return;
            }

            setStreamError(errDetail);
            setStreamStatus('ERROR');
            onStatusChangeRef.current?.('ERROR', errDetail);
            stopStreaming();
          }
        } catch (_) {}
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
          console.warn(`[useRtmpStreamer] Socket closed; auto-reconnecting in 2s (attempt ${attempt}/50)...`);
          setStreamStatus('CONNECTING');
          onStatusChangeRef.current?.('CONNECTING', `Auto-reconnecting to stream (attempt ${attempt}/50)...`);
          stopStreaming(false);
          reconnectTimeoutRef.current = setTimeout(() => {
            startStreaming(activeMediaStreamRef.current, activeKey, activeUrl, true);
          }, 2000);
          return;
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
  }, [stopStreaming, acquireWakeLock, createHudCompositedStream]);

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
      releaseWakeLock();
      stopCompositorWorker();
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
  }, [releaseWakeLock, stopCompositorWorker]);

  return {
    isStreaming,
    streamStatus,
    streamError,
    startStreaming,
    stopStreaming
  };
}

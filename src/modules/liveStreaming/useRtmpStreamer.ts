import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseRtmpStreamerOptions {
  boothId: string;
  streamKey?: string;
  rtmpUrl?: string;
  onStatusChange?: (status: 'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR', msg?: string) => void;
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
  const fallbackPieceRef = useRef<{
    barcode: string;
    title: string;
    size: string;
    price: string;
    img: HTMLImageElement | null;
    imgUrl: string;
  } | null>(null);

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
  }, []);

  /**
   * Wrap raw camera MediaStream in a 30fps 1280x720 Canvas Compositor driven by an unthrottled Web Worker timer.
   * Ensures:
   * 1) Constant 30.00 FPS output even when room lighting drops webcam to 15fps or host switches browser tabs.
   * 2) Live Garment Photo, Brand/Item Name, SKU Barcode, and AED Price HUD are burned onto the YouTube/TikTok video stream.
   */
  const createHudCompositedStream = useCallback((rawStream: MediaStream): MediaStream => {
    if (typeof document === 'undefined') return rawStream;
    stopCompositorWorker();

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

    const corsImgCache = new Map<string, HTMLImageElement>();
    const getCorsSafeImage = (rawUrl: string | undefined | null): HTMLImageElement | null => {
      if (!rawUrl || typeof rawUrl !== 'string') return null;
      const trimmed = rawUrl.trim();
      if (!trimmed) return null;
      const existing = corsImgCache.get(trimmed);
      if (existing) return existing;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      // Append ?cors=1 for http(s) URLs so Chrome bypasses any non-CORS cache entry created by DOM <img> tags
      img.src = trimmed.startsWith('data:') || trimmed.startsWith('blob:')
        ? trimmed
        : `${trimmed}${trimmed.includes('?') ? '&' : '?'}cors=1`;
      corsImgCache.set(trimmed, img);
      return img;
    };

    // Pre-fetch first available inventory piece as fallback in case DOM HUD card isn't mounted yet
    fetch('/api/purchase/pieces')
      .then(r => (r.ok ? r.json() : []))
      .then((pieces: any[]) => {
        if (Array.isArray(pieces) && pieces.length > 0) {
          const p = pieces.find(x => !x.isSold && !x.is_sold && x.status !== 'SOLD') || pieces[0];
          const url = p.frontImageUrl || p.front_image_url || '';
          const img = getCorsSafeImage(url);
          fallbackPieceRef.current = {
            barcode: p.barcode || p.pieceCode || 'SKU-LIVE',
            title: `${p.brandName || ''} • ${p.itemName || 'Vintage Piece'}`.replace(/^•\s*/, '').trim(),
            size: p.sizeScanned || p.size || 'L',
            price: `AED ${Number(p.retailPriceAed || p.retail_price_aed || p.lockedPrice || p.estimatedPrice || p.costPrice || 0).toFixed(2)}`,
            img,
            imgUrl: url
          };
        }
      })
      .catch(() => {});

    // Cached HUD state scraped from Studio DOM every 400ms
    let cachedHud: {
      barcode: string;
      title: string;
      size: string;
      price: string;
      imgEl: HTMLImageElement | null;
    } | null = null;
    let lastDomScan = 0;

    const scanDomForActiveGarment = (now: number) => {
      if (now - lastDomScan < 400) return;
      lastDomScan = now;
      try {
        // Look for the studio's ON AUCTION FLOOR card in DOM
        const allSpans = document.querySelectorAll('span, div');
        for (let i = 0; i < allSpans.length; i++) {
          const el = allSpans[i];
          if (el.childElementCount === 0 && el.textContent?.trim() === 'ON AUCTION FLOOR') {
            const card = el.closest('div.absolute') || el.parentElement?.parentElement?.parentElement;
            if (card) {
              const domImg = card.querySelector('img') as HTMLImageElement | null;
              const imgEl = domImg?.src ? getCorsSafeImage(domImg.src) : (fallbackPieceRef.current?.img || null);
              const barcode = el.nextElementSibling?.textContent?.trim() || 'SKU-LIVE';
              const textContainer = el.parentElement?.parentElement;
              const titleDiv = textContainer?.children?.[1] as HTMLElement | undefined;
              const priceRow = textContainer?.children?.[2] as HTMLElement | undefined;
              const title = titleDiv?.textContent?.trim() || 'Vintage Archive Piece';
              const size = priceRow?.children?.[0]?.textContent?.trim() || 'Size: M';
              const price = priceRow?.children?.[1]?.textContent?.trim() || 'AED 0.00';
              cachedHud = { barcode, title, size, price, imgEl };
              return;
            }
          }
        }
      } catch (_) {}
    };

    const paintFrame = () => {
      const now = performance.now();
      scanDomForActiveGarment(now);

      // Prefer hiddenVideo or visible studio video element
      const sourceVideo =
        (hiddenVideo.readyState >= 2 && hiddenVideo.videoWidth > 0)
          ? hiddenVideo
          : (document.querySelector('video') as HTMLVideoElement | null) || hiddenVideo;

      if (sourceVideo && sourceVideo.paused && sourceVideo.srcObject) {
        sourceVideo.play().catch(() => {});
      }

      const vw = sourceVideo?.videoWidth || 1280;
      const vh = sourceVideo?.videoHeight || 720;

      if (sourceVideo && vw > 0 && vh > 0) {
        // Fill 1280x720 16:9 widescreen cleanly
        const targetAspect = 1280 / 720;
        const videoAspect = vw / vh;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (videoAspect > targetAspect) {
          sw = vh * targetAspect;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / targetAspect;
          sy = (vh - sh) / 2;
        }
        try {
          ctx.drawImage(sourceVideo, sx, sy, sw, sh, 0, 0, 1280, 720);
        } catch (_) {}
      } else {
        ctx.fillStyle = '#0c0a09';
        ctx.fillRect(0, 0, 1280, 720);
      }

      // 1. Top-Left Live Broadcast Badge
      ctx.save();
      ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
      ctx.beginPath();
      ctx.roundRect(28, 24, 96, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 14px sans-serif';
      ctx.fillText('● LIVE HD', 42, 45);

      ctx.fillStyle = 'rgba(12, 10, 9, 0.82)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(132, 24, 240, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('VINTAGE VIBES • DUBAI', 148, 45);
      ctx.restore();

      // 2. Bottom-Left Active Garment Picture & Price HUD Overlay
      const hud = cachedHud || (fallbackPieceRef.current ? {
        barcode: fallbackPieceRef.current.barcode,
        title: fallbackPieceRef.current.title,
        size: `Size: ${fallbackPieceRef.current.size}`,
        price: fallbackPieceRef.current.price,
        imgEl: fallbackPieceRef.current.img
      } : null);

      if (hud) {
        const cardX = 28;
        const cardY = 516;
        const cardW = 600;
        const cardH = 176;

        ctx.save();
        // Dark luxury glass card
        ctx.fillStyle = 'rgba(12, 10, 9, 0.90)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        ctx.fill();
        ctx.stroke();

        // Garment Photo Thumbnail (144x144)
        const imgX = cardX + 16;
        const imgY = cardY + 16;
        const imgSize = 144;
        const imgEl = hud.imgEl;

        let drewPhoto = false;
        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgSize, imgSize, 12);
            ctx.clip();
            ctx.drawImage(imgEl, imgX, imgY, imgSize, imgSize);
            ctx.restore();

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
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

        // "ON AUCTION FLOOR" badge + SKU Barcode
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.roundRect(textX, cardY + 18, 138, 24, 6);
        ctx.fill();
        ctx.fillStyle = '#0c0a09';
        ctx.font = '900 11px sans-serif';
        ctx.fillText('⚡ ON AUCTION FLOOR', textX + 10, cardY + 34);

        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(hud.barcode.slice(0, 28), textX + 148, cardY + 35);

        // Garment Brand & Item Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 21px sans-serif';
        ctx.fillText(hud.title.slice(0, 34), textX, cardY + 74);

        // Size Pill & Price
        ctx.fillStyle = '#fcd34d';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(hud.size, textX, cardY + 114);

        ctx.fillStyle = '#34d399';
        ctx.font = '900 32px sans-serif';
        ctx.fillText(hud.price, textX + 110, cardY + 118);

        // Call to action footer
        ctx.fillStyle = '#d6d3d1';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`💬 Comment "CLAIM ${hud.barcode}" in Live Chat to Order`, textX, cardY + 154);

        ctx.restore();
      }
    };

    // Initial paint before capturing stream
    paintFrame();
    const compositedStream = canvas.captureStream(30);
    const canvasVideoTrack = compositedStream.getVideoTracks()[0] as any;

    // Start unthrottled Web Worker timer at 33ms (30.0 FPS) so background tabs and low-light webcams never drop below 30fps!
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

    // Preserve audio track from rawStream
    rawStream.getAudioTracks().forEach(t => compositedStream.addTrack(t));
    return compositedStream;
  }, [stopCompositorWorker]);

  const stopStreaming = useCallback((isExplicit = true) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (isExplicit) {
      reconnectAttemptsRef.current = 999;
      releaseWakeLock();
      stopCompositorWorker();
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
          video: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, aspectRatio: { ideal: 16 / 9 }, frameRate: { ideal: 30 } },
          audio: true
        });
      }

      // If user's microphone is muted or absent, inject a silent Web Audio track so YouTube/FFmpeg has a valid AAC stream
      if (rawStream.getAudioTracks().length === 0 && typeof window !== 'undefined') {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const dst = ctx.createMediaStreamDestination();
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            osc.connect(gain);
            gain.connect(dst);
            osc.start();
            const silentTrack = dst.stream.getAudioTracks()[0];
            if (silentTrack) {
              rawStream.addTrack(silentTrack);
            }
          }
        } catch (_) {}
      }

      activeMediaStreamRef.current = rawStream;

      // Wrap in 30fps 1280x720 Canvas Compositor so Garment Picture + Price HUD are always shown AND framerate stays at 30fps!
      const mediaStream = createHudCompositedStream(rawStream);
      localStreamRef.current = mediaStream;

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

      let activeKey = (overrideKey || streamKeyRef.current)?.trim() || '';
      let activeUrl = (overrideUrl || rtmpUrlRef.current)?.trim() || '';

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

      if (!activeKey) activeKey = 'edu8-fpef-kc0c-s9cs-dath';
      if (!activeUrl) activeUrl = 'rtmp://a.rtmp.youtube.com/live2';

      const currentBooth = boothIdRef.current || 'booth-1';
      const queryParams = `?boothId=${encodeURIComponent(currentBooth)}&streamKey=${encodeURIComponent(activeKey)}&rtmpUrl=${encodeURIComponent(activeUrl)}`;

      // Zero-Hairpin Localhost Fast-Path: if browser is on the same machine as the server (localhost:3000),
      // connect directly via ws://localhost:3000 to avoid uploading video twice through Cloudflare Tunnel!
      const fallbackWsUrl = `${wsBase}${queryParams}`;
      let wsUrl = fallbackWsUrl;
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        try {
          const localCheck = await fetch('http://localhost:3000/api/health', { mode: 'cors', signal: AbortSignal.timeout(500) });
          if (localCheck.ok) {
            wsUrl = `ws://localhost:3000/api/live/stream/rtmp-relay${queryParams}`;
            console.log('[useRtmpStreamer] ⚡ Localhost server detected! Trying direct zero-latency ws://localhost:3000 pipe (0 internet upload overhead)');
          }
        } catch (_) {}
      }

      console.log(`[useRtmpStreamer] Connecting to RTMP relay WebSocket for ${currentBooth}...`);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (_) {
        ws = new WebSocket(fallbackWsUrl);
      }
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      // Prefer hardware H.264 in WebM for instant keyframe startup (0s delay) and zero VP8 interframe drops
      const supportedMime = [
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=avc1,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find(mime => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) || 'video/webm';

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        console.log('[useRtmpStreamer] RTMP WebSocket connected. Initializing 30fps HUD MediaRecorder & 15s Keep-Alive...');
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
            } catch (_) {}
          }
        }, 15000);
      };

      ws.onmessage = async (evt) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'HEARTBEAT' || msg.type === 'PONG') {
            return;
          }
          if (msg.type === 'READY_FOR_CHUNKS') {
            console.log('[useRtmpStreamer] Server ready for video chunks. Target:', msg.destination);

            reconnectAttemptsRef.current = 0;
            isConnectingRef.current = false;
            const recorder = new MediaRecorder(mediaStream, {
              mimeType: supportedMime,
              videoBitsPerSecond: 1500000, // 1.5 Mbps clean ingest (FFmpeg outputs 2.5 Mbps CBR to YouTube)
              audioBitsPerSecond: 128000
            });
            recorderRef.current = recorder;

            recorder.ondataavailable = async (e) => {
              if (wsRef.current !== ws) return;
              if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                if (ws.bufferedAmount > 1024 * 1024) {
                  console.warn('[useRtmpStreamer] Dropping video chunk due to socket buffer backpressure');
                  return;
                }
                const buffer = await e.data.arrayBuffer();
                if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(buffer);
                }
              }
            };

            recorder.onerror = (err) => {
              if (wsRef.current !== ws) return;
              console.error('[useRtmpStreamer] MediaRecorder error:', err);
              setStreamError('MediaRecorder error: ' + (err as any).message);
              stopStreaming();
            };

            // 200ms ultra-low-latency chunk intervals for real-time YouTube streaming
            recorder.start(200);
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

  // Re-acquire Screen Wake Lock if user switches back to tab during a 4-hour broadcast
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

  // Unmount effect ONLY: stops media/ws/worker when component unmounts
  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      releaseWakeLock();
      stopCompositorWorker();
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

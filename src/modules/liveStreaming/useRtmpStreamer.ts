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

  const stopStreaming = useCallback((isExplicit = true) => {
    // Always clear any pending reconnect timer so it never fires against a newly started stream
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (isExplicit) {
      reconnectAttemptsRef.current = 999; // Disable auto-reconnect when user explicitly stops
      releaseWakeLock();
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
        // Detach event handlers BEFORE closing so the old socket never triggers a reconnect loop
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
  }, [releaseWakeLock]);

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
      let mediaStream = activeStream;
      if (!mediaStream || mediaStream.getVideoTracks().length === 0 || mediaStream.getVideoTracks()[0]?.readyState === 'ended') {
        console.log('[useRtmpStreamer] Requesting user media stream...');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, aspectRatio: { ideal: 16 / 9 }, frameRate: { ideal: 30 } },
          audio: true
        });
      }

      // If user's microphone is muted or absent, inject a silent Web Audio track so YouTube/FFmpeg has a valid AAC stream
      if (mediaStream.getAudioTracks().length === 0 && typeof window !== 'undefined') {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const dst = ctx.createMediaStreamDestination();
            const gain = ctx.createGain();
            gain.gain.value = 0.0001; // Silent carrier tone
            osc.connect(gain);
            gain.connect(dst);
            osc.start();
            const silentTrack = dst.stream.getAudioTracks()[0];
            if (silentTrack) {
              mediaStream.addTrack(silentTrack);
              console.log('[useRtmpStreamer] Injected synthetic silent audio track for YouTube RTMP compliance');
            }
          }
        } catch (audioErr) {
          console.warn('[useRtmpStreamer] Silent audio fallback warning:', audioErr);
        }
      }

      localStreamRef.current = mediaStream;
      activeMediaStreamRef.current = mediaStream;

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

      // Only auto-sync with Global Setup if key is completely missing
      if (!activeKey) {
        try {
          const res = await fetch('/api/setup/live-multicast');
          if (res.ok) {
            const json = await res.json();
            const d = json?.data;
            if (d?.youTubeStreamKey || d?.youtube_stream_key) {
              activeKey = (d.youTubeStreamKey || d.youtube_stream_key).trim();
              console.log('[useRtmpStreamer] Auto-synced YouTube stream key from Global Setup');
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
      const wsUrl = `${wsBase}?boothId=${encodeURIComponent(currentBooth)}&streamKey=${encodeURIComponent(activeKey)}&rtmpUrl=${encodeURIComponent(activeUrl)}`;

      console.log(`[useRtmpStreamer] Connecting to RTMP relay WebSocket at ${wsBase} for ${currentBooth}...`);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const supportedMime = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=avc1,opus',
        'video/webm'
      ].find(mime => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) || 'video/webm';

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        console.log('[useRtmpStreamer] RTMP WebSocket connected. Initializing MediaRecorder & 15s Keep-Alive...');
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
            try {
              const vTrack = mediaStream?.getVideoTracks()?.[0];
              if (vTrack && 'contentHint' in vTrack) {
                (vTrack as any).contentHint = 'motion';
              }
            } catch (_) {}
            const recorder = new MediaRecorder(mediaStream!, {
              mimeType: supportedMime,
              videoBitsPerSecond: 2500000, // 2.5 Mbps smooth upstream over Cloudflare Tunnel; FFmpeg transcodes to 720p30 CFR for YouTube
              audioBitsPerSecond: 128000
            });
            recorderRef.current = recorder;

            recorder.ondataavailable = async (e) => {
              if (wsRef.current !== ws) return;
              if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                if (ws.bufferedAmount > 3 * 1024 * 1024) {
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

            // Stream chunks in 500ms intervals for rock-solid WebSocket frame pacing
            recorder.start(500);
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
  }, [stopStreaming, acquireWakeLock]);

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

  // Unmount effect ONLY (empty deps array): stops media/ws when component unmounts
  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      releaseWakeLock();
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
  }, [releaseWakeLock]);

  return {
    isStreaming,
    streamStatus,
    streamError,
    startStreaming,
    stopStreaming
  };
}

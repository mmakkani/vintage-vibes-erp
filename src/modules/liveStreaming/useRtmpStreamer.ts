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

  const stopStreaming = useCallback(() => {
    isStreamingRef.current = false;

    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch (_) {}
    recorderRef.current = null;

    try {
      if (wsRef.current) {
        wsRef.current.close();
      }
    } catch (_) {}
    wsRef.current = null;

    setIsStreaming(false);
    setStreamStatus('IDLE');
    onStatusChangeRef.current?.('IDLE');
  }, []);

  const startStreaming = useCallback(async (activeStream?: MediaStream | null, overrideKey?: string, overrideUrl?: string) => {
    if (isStreamingRef.current) {
      console.log('[useRtmpStreamer] Stream is already running.');
      return true;
    }

    stopStreaming();
    setStreamStatus('CONNECTING');
    setStreamError(null);
    onStatusChangeRef.current?.('CONNECTING');

    try {
      let mediaStream = activeStream;
      if (!mediaStream || !mediaStream.active || mediaStream.getVideoTracks().length === 0) {
        console.log('[useRtmpStreamer] Requesting user media stream...');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, aspectRatio: { ideal: 16 / 9 }, frameRate: { ideal: 30 } },
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

      let wsBase = '';
      if (import.meta.env?.VITE_WS_RELAY_URL) {
        wsBase = import.meta.env.VITE_WS_RELAY_URL;
      } else if (typeof window !== 'undefined') {
        const isVercel = window.location.hostname.endsWith('.vercel.app');
        if (isVercel) {
          // Vercel serverless lacks persistent WebSockets, routes to external Railway worker
          wsBase = 'wss://vintage-vibes-erp-production.up.railway.app/api/live/stream/rtmp-relay';
        } else {
          // Cloudflare Tunnel (e.g. vintagevibesgk.com), custom domains, and localhost route directly to persistent Node server!
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsBase = `${protocol}//${window.location.host}/api/live/stream/rtmp-relay`;
        }
      }

      let activeKey = (overrideKey || streamKeyRef.current)?.trim() || '';
      let activeUrl = (overrideUrl || rtmpUrlRef.current)?.trim() || '';

      // Auto-sync with Global Setup if key is empty or default
      if (!activeKey || activeKey === 'edu8-fpef-kc0c-s9cs-dath') {
        try {
          const res = await fetch('/api/setup/live-multicast');
          if (res.ok) {
            const json = await res.json();
            const d = json?.data;
            if (d?.masterStreamKey || d?.master_stream_key || d?.youTubeStreamKey || d?.youtube_stream_key) {
              activeKey = (d.masterStreamKey || d.master_stream_key || d.youTubeStreamKey || d.youtube_stream_key).trim();
              console.log('[useRtmpStreamer] Auto-synced stream key from Global Setup');
            }
            if (d?.masterIngestRtmpUrl || d?.master_ingest_rtmp_url) {
              activeUrl = (d.masterIngestRtmpUrl || d.master_ingest_rtmp_url).trim();
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
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=avc1,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find(mime => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) || 'video/webm';

      ws.onopen = () => {
        console.log('[useRtmpStreamer] RTMP WebSocket connected. Initializing MediaRecorder...');
      };

      ws.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'READY_FOR_CHUNKS') {
            console.log('[useRtmpStreamer] Server ready for video chunks. Target:', msg.destination);

            const recorder = new MediaRecorder(mediaStream!, {
              mimeType: supportedMime,
              videoBitsPerSecond: 3500000 // 3.5 Mbps optimal for crisp 1080p without thermal throttling
            });
            recorderRef.current = recorder;

            recorder.ondataavailable = async (e) => {
              if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                // Backpressure safeguard: if network or socket is buffering > 4MB, drop chunk to prevent memory churn
                if (ws.bufferedAmount > 4 * 1024 * 1024) {
                  console.warn('[useRtmpStreamer] Dropping video chunk due to socket buffer backpressure');
                  return;
                }
                const buffer = await e.data.arrayBuffer();
                ws.send(buffer);
              }
            };

            recorder.onerror = (err) => {
              console.error('[useRtmpStreamer] MediaRecorder error:', err);
              setStreamError('MediaRecorder error: ' + (err as any).message);
              stopStreaming();
            };

            // Stream chunks in standard 1000ms (1-second) intervals to eliminate CPU churn & memory spikes
            recorder.start(1000);
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
            setStreamError(errDetail);
            setStreamStatus('ERROR');
            onStatusChangeRef.current?.('ERROR', errDetail);
            stopStreaming();
          }
        } catch (_) {}
      };

      ws.onerror = (err) => {
        console.error('[useRtmpStreamer] WebSocket error:', err);
        setStreamError('Connection to stream relay failed');
        setStreamStatus('ERROR');
        onStatusChangeRef.current?.('ERROR', 'Relay connection failed');
        stopStreaming();
      };

      ws.onclose = (evt: CloseEvent) => {
        console.log(`[useRtmpStreamer] WebSocket closed: code=${evt.code}, reason=${evt.reason || 'None'}, wasClean=${evt.wasClean}`);
        if (isStreamingRef.current) {
          stopStreaming();
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
  }, [stopStreaming]);

  // Unmount effect ONLY (empty deps array): stops media/ws when component unmounts
  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
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
  }, []);

  return {
    isStreaming,
    streamStatus,
    streamError,
    startStreaming,
    stopStreaming
  };
}

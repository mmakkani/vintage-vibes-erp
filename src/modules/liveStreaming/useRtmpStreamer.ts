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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true
        });
      }
      localStreamRef.current = mediaStream;

      const isLocal =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname.endsWith('.localhost'));

      let wsBase = '';
      if (import.meta.env?.VITE_WS_RELAY_URL) {
        wsBase = import.meta.env.VITE_WS_RELAY_URL;
      } else if (isLocal) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsBase = `${protocol}//${window.location.host}/api/live/stream/rtmp-relay`;
      } else {
        // In production on Vercel, serverless cannot maintain persistent WebSockets.
        // Route directly to the persistent Railway worker Node.js server.
        wsBase = 'wss://vintage-vibes-erp-production.up.railway.app/api/live/stream/rtmp-relay';
      }

      const activeKey = (overrideKey || streamKeyRef.current || 'edu8-fpef-kc0c-s9cs-dath').trim();
      const activeUrl = (overrideUrl || rtmpUrlRef.current || 'rtmp://a.rtmp.youtube.com/live2').trim();
      const currentBooth = boothIdRef.current || 'booth-1';

      const wsUrl = `${wsBase}?boothId=${encodeURIComponent(currentBooth)}&streamKey=${encodeURIComponent(activeKey)}&rtmpUrl=${encodeURIComponent(activeUrl)}`;

      console.log(`[useRtmpStreamer] Connecting to RTMP relay WebSocket at ${wsBase} for ${currentBooth}...`);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const supportedMime = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
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
              videoBitsPerSecond: 2500000
            });
            recorderRef.current = recorder;

            recorder.ondataavailable = async (e) => {
              if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                const buffer = await e.data.arrayBuffer();
                ws.send(buffer);
              }
            };

            recorder.onerror = (err) => {
              console.error('[useRtmpStreamer] MediaRecorder error:', err);
              setStreamError('MediaRecorder error: ' + (err as any).message);
              stopStreaming();
            };

            // Start streaming chunks in 500ms intervals
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
            console.log('[useRtmpStreamer] Stream ended by server');
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

      ws.onclose = () => {
        console.log('[useRtmpStreamer] WebSocket closed');
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

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { withDb } from '../../db/pgPool.ts';

interface ActiveRelay {
  connId: number;
  boothId: string;
  ffmpeg: ChildProcess | null;
  ws: WebSocket;
  startedAt: number;
  bytesReceived: number;
  replaced?: boolean;
}

const activeRelays = new Map<string, ActiveRelay>();
let relayConnSeq = 0;

/**
 * Resolve path to ffmpeg executable
 */
function getFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const localPkgFfmpeg = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localPkgFfmpeg)) {
    return localPkgFfmpeg;
  }
  return 'ffmpeg';
}

/**
 * Mount the RTMP Live Stream WebSocket Ingestion Relay onto the HTTP server
 */
export function setupRtmpRelayWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/live/stream/rtmp-relay' || url.pathname.endsWith('/stream/rtmp-relay')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const boothId = url.searchParams.get('boothId') || 'booth-1';
    const connId = ++relayConnSeq;

    console.log(`[RtmpRelay] 🎥 Client #${connId} connected for ${boothId}. Initializing RTMP stream pipe...`);

    // Clean up any stale relay for this booth IMMEDIATELY and mark it replaced so its exit handler never sends STREAM_ENDED
    const existing = activeRelays.get(boothId);
    if (existing) {
      console.log(`[RtmpRelay] Superseding previous relay #${existing.connId} for ${boothId}`);
      existing.replaced = true;
      activeRelays.delete(boothId);
      try {
        existing.ffmpeg?.removeAllListeners('exit');
        existing.ffmpeg?.removeAllListeners('error');
        existing.ffmpeg?.stdin?.end();
        existing.ffmpeg?.kill('SIGTERM');
      } catch (_) {}
      try {
        // Detach message listener on superseded socket without calling close(), preventing old cached clients from firing ws.onclose auto-reconnect loops!
        existing.ws?.removeAllListeners('message');
      } catch (_) {}
    }

    const relayInfo: ActiveRelay = {
      connId,
      boothId,
      ffmpeg: null,
      ws,
      startedAt: Date.now(),
      bytesReceived: 0,
      replaced: false
    };
    activeRelays.set(boothId, relayInfo);

    // Buffer binary chunks immediately in case client sends anything while DB lookup runs
    const pendingChunks: Buffer[] = [];
    let pendingBytes = 0;
    let ffmpegProcess: ChildProcess | null = null;
    let isSpawned = false;
    let isReadyToSpawn = false;
    let bytesReceived = 0;
    let chunkCount = 0;
    let lastStderr = '';
    let destinationRtmp = '';
    let allDestinations: string[] = [];
    const ffmpegExe = getFfmpegPath();

    const spawnFfmpeg = (initialChunk: Buffer) => {
      if (isSpawned || relayInfo.replaced) return;
      isSpawned = true;

      // Single-Encode Multi-Push (-f tee) when 2..5 platforms are active: 0% extra CPU load & onfail=ignore fault isolation
      const useTeeMuxer = allDestinations.length > 1;
      const teeOutputSpec = allDestinations
        .map((dest) => `[f=flv:onfail=ignore]${dest}`)
        .join('|');

      const ffmpegArgs = [
        '-fflags', '+nobuffer+discardcorrupt',
        '-flags', '+low_delay+global_header',
        '-probesize', '65536',
        '-analyzeduration', '300000',
        '-thread_queue_size', '4096',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'main',
        '-level', '3.1',
        '-g', '60',
        '-keyint_min', '60',
        '-sc_threshold', '0',
        '-b:v', '2500k',
        '-minrate', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '2500k',
        '-x264-params', 'nal-hrd=cbr:force-cfr=1',
        '-pix_fmt', 'yuv420p',
        '-threads', '0',
        '-max_muxing_queue_size', '4096',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        ...(useTeeMuxer
          ? ['-f', 'tee', teeOutputSpec]
          : [
              '-f', 'flv',
              '-flvflags', 'no_duration_filesize',
              destinationRtmp
            ])
      ];

      console.log(`[RtmpRelay] 🎬 Spawning HD 720p30 FFmpeg #${connId} (${useTeeMuxer ? `Simulcast Tee x${allDestinations.length}` : 'Direct FLV'}) with initial chunk (${initialChunk.length} bytes)...`);

      try {
        ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe']
        });
        relayInfo.ffmpeg = ffmpegProcess;
      } catch (spawnErr: any) {
        console.error('[RtmpRelay] Failed to spawn FFmpeg:', spawnErr);
        if (!relayInfo.replaced && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to spawn FFmpeg: ${spawnErr.message}` }));
          ws.close(1011, 'FFmpeg spawn failed');
        }
        return;
      }

      if (ffmpegProcess.stderr) {
        ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          lastStderr = (lastStderr + '\n' + text).slice(-3000);
          const lines = text.trim().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('frame=')) {
              console.log(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
            } else if (trimmed.startsWith('frame=')) {
              console.log(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
            }
          }
        });
      }

      ffmpegProcess.on('exit', (code, signal) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        console.warn(`[RtmpRelay] FFmpeg #${connId} for ${boothId} exited with code=${code}, signal=${signal}. Stderr: ${lastStderr.slice(-400)}`);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          const errDetail = signal ? `FFmpeg terminated by ${signal}` : `FFmpeg exited code ${code}`;
          // Only send STREAM_ENDED without calling ws.close() simultaneously so client only triggers a single reconnect timer
          ws.send(JSON.stringify({ type: 'STREAM_ENDED', code, signal, error: `${errDetail}: ${lastStderr.slice(-200)}` }));
        }
      });

      ffmpegProcess.on('error', (err) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        console.error(`[RtmpRelay] FFmpeg #${connId} process error for ${boothId}:`, err);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
          ws.close(1011, err.message);
        }
      });

      if (ffmpegProcess.stdin) {
        ffmpegProcess.stdin.on('error', (stdinErr: any) => {
          if (stdinErr?.code !== 'EPIPE' && stdinErr?.code !== 'EOF') {
            console.warn(`[RtmpRelay] FFmpeg #${connId} stdin notice for ${boothId}:`, stdinErr?.message || stdinErr);
          }
        });
      }

      try {
        ffmpegProcess.stdin?.write(initialChunk);
      } catch (writeErr) {
        console.warn(`[RtmpRelay] Initial chunk write error:`, writeErr);
      }
    };

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (relayInfo.replaced) return;

      // Ignore JSON text control messages (e.g. client PING) so they never corrupt the WebM binary pipe
      if (!isBinary) {
        try {
          const txt = data.toString();
          if (txt.startsWith('{')) {
            const parsed = JSON.parse(txt);
            if (parsed.type === 'PING' && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
            }
            return;
          }
        } catch (_) {
          return;
        }
      }

      let buf: Buffer;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (Array.isArray(data)) {
        buf = Buffer.concat(data);
      } else {
        buf = Buffer.from(data);
      }

      bytesReceived += buf.length;
      relayInfo.bytesReceived = bytesReceived;
      chunkCount++;

      if (!isSpawned) {
        pendingChunks.push(buf);
        pendingBytes += buf.length;
        if (isReadyToSpawn && pendingChunks.length >= 1) {
          const initialBuffer = Buffer.concat(pendingChunks);
          pendingChunks.length = 0;
          spawnFfmpeg(initialBuffer);
        }
      } else if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
        try {
          ffmpegProcess.stdin.write(buf);
        } catch (writeErr) {
          console.warn(`[RtmpRelay] Error writing to FFmpeg stdin:`, writeErr);
        }
      }
    });

    // 15-second WebSocket Keep-Alive Ping to prevent Cloudflare Tunnel / Proxy 100s timeout during 24/7 streams
    const keepAliveTimer = setInterval(() => {
      if (!relayInfo.replaced && ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
          ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            uptimeSec: Math.floor((Date.now() - relayInfo.startedAt) / 1000),
            bytesReceived
          }));
        } catch (_) {}
      }
    }, 15000);

    ws.on('close', (code, reason) => {
      clearInterval(keepAliveTimer);
      console.log(`[RtmpRelay] ⏹️ Client #${connId} disconnected for ${boothId} (chunks=${chunkCount}, bytes=${(bytesReceived / 1024 / 1024).toFixed(2)} MB, code=${code}, reason=${reason})`);
      relayInfo.replaced = true;
      try {
        ffmpegProcess?.removeAllListeners('exit');
        ffmpegProcess?.removeAllListeners('error');
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.end();
        }
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
      }
    });

    ws.on('error', (err) => {
      clearInterval(keepAliveTimer);
      console.warn(`[RtmpRelay] WebSocket #${connId} error for ${boothId}:`, err);
      relayInfo.replaced = true;
      try {
        ffmpegProcess?.removeAllListeners('exit');
        ffmpegProcess?.removeAllListeners('error');
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
      }
    });

    // Lookup RTMP Ingest URL and Stream Key: query params first, then DB lookup, then fallback
    const queryKey = url.searchParams.get('streamKey');
    const queryUrl = url.searchParams.get('rtmpUrl');

    let rtmpUrl = queryUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2';
    let streamKey = queryKey?.trim() || 'edu8-fpef-kc0c-s9cs-dath';
    const extraRtmpTargets: string[] = [];

    try {
      await withDb(async (client) => {
        if (!queryKey) {
          const boothRes = await client.query(
            `SELECT master_stream_key, master_ingest_rtmp_url FROM public.live_stream_booths WHERE booth_id = $1 LIMIT 1`,
            [boothId]
          );
          if (boothRes.rows?.[0]?.master_stream_key) {
            streamKey = boothRes.rows[0].master_stream_key;
            if (boothRes.rows[0].master_ingest_rtmp_url) {
              rtmpUrl = boothRes.rows[0].master_ingest_rtmp_url;
            }
          }
        }

        // Gather all active multi-platform RTMP keys configured for this booth (YouTube, TikTok, Facebook, Instagram, Custom)
        const chRes = await client.query(
          `SELECT platform, account_password, proxy_url FROM public.booth_social_channels WHERE booth_id = $1 AND is_active = true`,
          [boothId]
        );
        const defaultIngests: Record<string, string> = {
          youtube: 'rtmp://a.rtmp.youtube.com/live2',
          tiktok: 'rtmp://push.tiktok.com/live',
          facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
          instagram: 'rtmps://edgetee-upload-shv-01-dub4.facebook.com:443/rtmp'
        };
        for (const row of chRes.rows || []) {
          const plat = String(row.platform || '').toLowerCase();
          const key = String(row.account_password || '').trim();
          if (!key || key.startsWith('OAUTH_') || key.startsWith('HANDLE_') || key.startsWith('enc:v1:') || key === '••••••••') continue;
          const base = String(row.proxy_url || defaultIngests[plat] || '').trim().replace(/\/+$/, '');
          if (base && (base.startsWith('rtmp://') || base.startsWith('rtmps://'))) {
            const fullTarget = `${base}/${key}`;
            extraRtmpTargets.push(fullTarget);
          }
        }
      });
    } catch (e: any) {
      console.warn(`[RtmpRelay] DB lookup warning for ${boothId}:`, e?.message);
    }

    if (relayInfo.replaced || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let safeRtmpUrl = rtmpUrl;
    if (safeRtmpUrl.startsWith('rtmp://live.restream.io')) {
      safeRtmpUrl = safeRtmpUrl.replace('rtmp://live.restream.io', 'rtmps://live.restream.io');
    }
    const cleanRtmpBase = safeRtmpUrl.replace(/\/+$/, '');
    const cleanKey = streamKey.trim();
    destinationRtmp = `${cleanRtmpBase}/${cleanKey}`;
    allDestinations = Array.from(new Set([destinationRtmp, ...extraRtmpTargets])).slice(0, 5);
    isReadyToSpawn = true;

    console.log(`[RtmpRelay] 🚀 Primary target #${connId}: ${cleanRtmpBase}/****${cleanKey.slice(-4)} (Total Simulcast Platforms: ${allDestinations.length})`);

    // Notify client that pipe is established and ready for webm chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${cleanKey.slice(-4)}`
      }));
    }

    if (!isSpawned && pendingChunks.length > 0) {
      const initialBuffer = Buffer.concat(pendingChunks);
      pendingChunks.length = 0;
      spawnFfmpeg(initialBuffer);
    }
  });

  return wss;
}

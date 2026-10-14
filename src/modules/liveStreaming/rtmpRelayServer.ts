import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { withDb } from '../../db/pgPool.ts';

interface ActiveRelay {
  boothId: string;
  ffmpeg: ChildProcess;
  ws: WebSocket;
  startedAt: number;
  bytesReceived: number;
}

const activeRelays = new Map<string, ActiveRelay>();

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

    console.log(`[RtmpRelay] 🎥 Client connected for ${boothId}. Initializing RTMP stream pipe...`);

    // Clean up any stale relay for this booth
    const existing = activeRelays.get(boothId);
    if (existing) {
      console.log(`[RtmpRelay] Cleaning up existing relay for ${boothId}`);
      try {
        existing.ffmpeg.stdin?.end();
        existing.ffmpeg.kill('SIGTERM');
      } catch (_) {}
      activeRelays.delete(boothId);
    }

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
          `SELECT platform, account_password, proxy_url FROM public.booth_social_channels WHERE booth_id = $1 AND status = 'CONNECTED'`,
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
          if (!key || key.startsWith('OAUTH_') || key.startsWith('HANDLE_')) continue;
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

    let safeRtmpUrl = rtmpUrl;
    if (safeRtmpUrl.startsWith('rtmp://live.restream.io')) {
      safeRtmpUrl = safeRtmpUrl.replace('rtmp://live.restream.io', 'rtmps://live.restream.io');
    }
    const cleanRtmpBase = safeRtmpUrl.replace(/\/+$/, '');
    const cleanKey = streamKey.trim();
    const destinationRtmp = `${cleanRtmpBase}/${cleanKey}`;
    const allDestinations = Array.from(new Set([destinationRtmp, ...extraRtmpTargets])).slice(0, 5);
    const ffmpegExe = getFfmpegPath();

    console.log(`[RtmpRelay] 🚀 Primary target: ${cleanRtmpBase}/****${cleanKey.slice(-4)} (Total Simulcast Platforms: ${allDestinations.length})`);

    let ffmpegProcess: ChildProcess | null = null;
    let isSpawned = false;
    let bytesReceived = 0;
    let chunkCount = 0;
    let lastStderr = '';

    const spawnFfmpeg = (initialChunk: Buffer) => {
      if (isSpawned) return;
      isSpawned = true;

      // Single-Encode Multi-Push (-f tee) when 2..5 platforms are active: 0% extra CPU load & onfail=ignore fault isolation
      const useTeeMuxer = allDestinations.length > 1;
      const teeOutputSpec = allDestinations
        .map((dest) => `[f=flv:onfail=ignore]${dest}`)
        .join('|');

      const ffmpegArgs = [
        '-fflags', '+nobuffer+genpts+discardcorrupt',
        '-flags', '+low_delay+global_header',
        '-thread_queue_size', '2048',
        '-f', 'webm',
        '-probesize', '1M',
        '-analyzeduration', '1M',
        '-i', 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'high',
        '-level', '4.1',
        '-fps_mode', 'passthrough',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
        '-b:v', '4500k',
        '-maxrate', '5000k',
        '-bufsize', '5000k',
        '-pix_fmt', 'yuv420p',
        '-threads', '4',
        '-max_muxing_queue_size', '2048',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-af', 'aresample=async=1:first_pts=0',
        ...(useTeeMuxer
          ? ['-f', 'tee', teeOutputSpec]
          : [
              '-f', 'flv',
              '-flvflags', 'no_duration_filesize',
              '-rtmp_buffer', '0',
              '-rtmp_live', 'live',
              '-flush_packets', '1',
              destinationRtmp
            ])
      ];

      console.log(`[RtmpRelay] 🎬 Spawning HD FFmpeg (${useTeeMuxer ? `Simulcast Tee x${allDestinations.length}` : 'Direct FLV'}) with initial chunk (${initialChunk.length} bytes)...`);

      try {
        ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe']
        });
      } catch (spawnErr: any) {
        console.error('[RtmpRelay] Failed to spawn FFmpeg:', spawnErr);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to spawn FFmpeg: ${spawnErr.message}` }));
          ws.close(1011, 'FFmpeg spawn failed');
        }
        return;
      }

      const relayInfo: ActiveRelay = {
        boothId,
        ffmpeg: ffmpegProcess,
        ws,
        startedAt: Date.now(),
        bytesReceived: initialChunk.length
      };
      activeRelays.set(boothId, relayInfo);

      if (ffmpegProcess.stderr) {
        ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          lastStderr = (lastStderr + '\n' + text).slice(-3000);
          const lines = text.trim().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('frame=')) {
              console.log(`[FFmpeg ${boothId}] ${trimmed}`);
            } else if (trimmed.startsWith('frame=') && Math.random() < 0.05) {
              console.log(`[FFmpeg ${boothId}] ${trimmed}`);
            }
          }
        });
      }

      ffmpegProcess.on('exit', (code, signal) => {
        console.warn(`[RtmpRelay] FFmpeg process for ${boothId} exited with code=${code}, signal=${signal}. Stderr: ${lastStderr.slice(-400)}`);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          const errDetail = signal ? `FFmpeg terminated by ${signal}` : `FFmpeg exited code ${code}`;
          ws.send(JSON.stringify({ type: 'STREAM_ENDED', code, signal, error: `${errDetail}: ${lastStderr.slice(-200)}` }));
          ws.close(1000, `Stream ended code ${code || signal}`);
        }
      });

      ffmpegProcess.on('error', (err) => {
        console.error(`[RtmpRelay] FFmpeg process error for ${boothId}:`, err);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
          ws.close(1011, err.message);
        }
      });

      if (ffmpegProcess.stdin) {
        ffmpegProcess.stdin.on('error', (stdinErr: any) => {
          if (stdinErr?.code !== 'EPIPE' && stdinErr?.code !== 'EOF') {
            console.warn(`[RtmpRelay] FFmpeg stdin notice for ${boothId}:`, stdinErr?.message || stdinErr);
          }
        });
      }

      try {
        ffmpegProcess.stdin?.write(initialChunk);
      } catch (writeErr) {
        console.warn(`[RtmpRelay] Initial chunk write error:`, writeErr);
      }
    };

    // 15-second WebSocket Keep-Alive Ping to prevent Cloudflare Tunnel / Proxy 100s timeout during 4-hour streams
    const keepAliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
          ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            uptimeSec: Math.floor((Date.now() - (activeRelays.get(boothId)?.startedAt || Date.now())) / 1000),
            bytesReceived
          }));
        } catch (_) {}
      }
    }, 15000);

    // Notify client that pipe is established and ready for webm chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${cleanKey.slice(-4)}`
      }));
    }

    const pendingChunks: Buffer[] = [];
    let pendingBytes = 0;

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
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
      chunkCount++;

      if (!isSpawned) {
        pendingChunks.push(buf);
        pendingBytes += buf.length;
        // Buffer on first chunk or 64KB before spawning FFmpeg for instant live relay with minimal latency
        if (pendingBytes >= 64000 || pendingChunks.length >= 1) {
          const initialBuffer = Buffer.concat(pendingChunks);
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

    ws.on('close', (code, reason) => {
      clearInterval(keepAliveTimer);
      console.log(`[RtmpRelay] ⏹️ Client disconnected for ${boothId} (chunks=${chunkCount}, bytes=${(bytesReceived / 1024 / 1024).toFixed(2)} MB, code=${code}, reason=${reason})`);
      try {
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.end();
        }
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      activeRelays.delete(boothId);
    });

    ws.on('error', (err) => {
      clearInterval(keepAliveTimer);
      console.warn(`[RtmpRelay] WebSocket error for ${boothId}:`, err);
      try {
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      activeRelays.delete(boothId);
    });
  });

  return wss;
}

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

    if (!queryKey) {
      try {
        await withDb(async (client) => {
          const boothRes = await client.query(
            `SELECT master_stream_key, master_ingest_rtmp_url FROM public.live_stream_booths WHERE booth_id = $1 LIMIT 1`,
            [boothId]
          );
          if (boothRes.rows?.[0]?.master_stream_key) {
            streamKey = boothRes.rows[0].master_stream_key;
            if (boothRes.rows[0].master_ingest_rtmp_url) {
              rtmpUrl = boothRes.rows[0].master_ingest_rtmp_url;
            }
          } else {
            // Check booth_social_channels for youtube
            const chRes = await client.query(
              `SELECT account_password, proxy_url FROM public.booth_social_channels WHERE booth_id = $1 AND platform = 'youtube' LIMIT 1`,
              [boothId]
            );
            if (chRes.rows?.[0]?.account_password) {
              streamKey = chRes.rows[0].account_password;
            }
          }
        });
      } catch (e: any) {
        console.warn(`[RtmpRelay] DB lookup warning for ${boothId}:`, e?.message);
      }
    }

    const cleanRtmpBase = rtmpUrl.replace(/\/+$/, '');
    const cleanKey = streamKey.trim();
    const destinationRtmp = `${cleanRtmpBase}/${cleanKey}`;
    const ffmpegExe = getFfmpegPath();

    console.log(`[RtmpRelay] 🚀 Launching FFmpeg bridge to YouTube RTMP: ${cleanRtmpBase}/****${cleanKey.slice(-4)}`);

    const ffmpegArgs = [
      '-re',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', '2500k',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      destinationRtmp
    ];

    let ffmpegProcess: ChildProcess;
    try {
      ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, {
        stdio: ['pipe', 'ignore', 'pipe']
      });
    } catch (spawnErr: any) {
      console.error('[RtmpRelay] Failed to spawn FFmpeg:', spawnErr);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to spawn FFmpeg: ${spawnErr.message}` }));
        ws.close();
      }
      return;
    }

    const relayInfo: ActiveRelay = {
      boothId,
      ffmpeg: ffmpegProcess,
      ws,
      startedAt: Date.now(),
      bytesReceived: 0
    };
    activeRelays.set(boothId, relayInfo);

    if (ffmpegProcess.stderr) {
      ffmpegProcess.stderr.on('data', (data) => {
        const text = data.toString();
        // Log stream status milestones
        if (text.includes('Stream #0:0') || text.includes('Output #0') || text.includes('bitrate=')) {
          console.log(`[FFmpeg ${boothId}] ${text.trim().split('\n').pop()}`);
        }
      });
    }

    ffmpegProcess.on('exit', (code, signal) => {
      console.log(`[RtmpRelay] FFmpeg process for ${boothId} exited with code ${code}, signal ${signal}`);
      activeRelays.delete(boothId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'STREAM_ENDED', code }));
        ws.close();
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error(`[RtmpRelay] FFmpeg process error for ${boothId}:`, err);
      activeRelays.delete(boothId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
        ws.close();
      }
    });

    // Notify client that pipe is established and ready for webm chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${cleanKey.slice(-4)}`
      }));
    }

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let buf: Buffer;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (Array.isArray(data)) {
        buf = Buffer.concat(data);
      } else {
        buf = Buffer.from(data);
      }

      relayInfo.bytesReceived += buf.length;

      if (ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
        try {
          ffmpegProcess.stdin.write(buf);
        } catch (writeErr) {
          console.warn(`[RtmpRelay] Error writing to FFmpeg stdin:`, writeErr);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[RtmpRelay] ⏹️ Client disconnected for ${boothId}. Shutting down FFmpeg pipe. Total bytes streamed: ${(relayInfo.bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      try {
        if (ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.end();
        }
        ffmpegProcess.kill('SIGTERM');
      } catch (_) {}
      activeRelays.delete(boothId);
    });

    ws.on('error', (err) => {
      console.warn(`[RtmpRelay] WebSocket error for ${boothId}:`, err);
      try {
        ffmpegProcess.kill('SIGTERM');
      } catch (_) {}
      activeRelays.delete(boothId);
    });
  });

  return wss;
}

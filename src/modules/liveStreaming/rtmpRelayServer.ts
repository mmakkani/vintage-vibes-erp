import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { withDb } from '../../db/pgPool.ts';
import { youTubeChatService } from './youtubeChatService.ts';
import { socialChatService } from './socialChatService.ts';
import { streamController } from '../../server/streamController.ts';
import { eventHub } from '../../server/events.ts';
import { decryptCredential } from '../../utils/encryption.ts';

interface ActiveRelay {
  connId: number;
  boothId: string;
  ffmpeg: ChildProcess | null;
  secondaryFfmpeg?: ChildProcess | null;
  ws: WebSocket;
  startedAt: number;
  bytesReceived: number;
  replaced?: boolean;
}

const activeRelays = new Map<string, ActiveRelay>();
let relayConnSeq = 0;

function getBoothAliases(boothId: string): string[] {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const p = n < 10 ? `0${n}` : `${n}`;
    return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
  }
  return [raw];
}

const DUMMY_KEYS = new Set([
  '••••••••',
  'live_tt_dubai_bale_stage',
  'live_ig_relove_vintage',
  'fb-live-page-vv-992',
  'yt_live_channel_dxb_1080',
  're_live_sec_10482_vv_dxb_773'
]);

function isValidRtmpStreamKey(rawKey?: string | null): boolean {
  if (!rawKey) return false;
  const k = rawKey.trim();
  if (k.length < 6) return false;
  if (DUMMY_KEYS.has(k.toLowerCase())) return false;
  if (k.startsWith('OAUTH_') || k.startsWith('HANDLE_') || k.startsWith('enc:v1:') || k.startsWith('stream_key_booth')) {
    return false;
  }
  if (/^vv_[a-z]+_booth\d+_live$/i.test(k)) return false;
  return true;
}

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
        existing.secondaryFfmpeg?.removeAllListeners('exit');
        existing.secondaryFfmpeg?.removeAllListeners('error');
        existing.secondaryFfmpeg?.stdin?.end();
        existing.secondaryFfmpeg?.kill('SIGTERM');
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
      secondaryFfmpeg: null,
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
    let secondaryFfmpegProcess: ChildProcess | null = null;
    let isSpawned = false;
    let isReadyToSpawn = false;
    let bytesReceived = 0;
    let chunkCount = 0;
    let lastStderr = '';
    let destinationRtmp = '';
    let allDestinations: string[] = [];
    const ffmpegExe = getFfmpegPath();

    const baseEncodingArgs = [
      '-fflags', '+nobuffer+discardcorrupt+genpts',
      '-flags', '+low_delay+global_header',
      '-probesize', '512k',
      '-analyzeduration', '1500000',
      '-thread_queue_size', '4096',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
      '-r', '30',
      '-fps_mode', 'cfr',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'main',
      '-level', '3.1',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-b:v', '2500k',
      '-minrate', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '1250k',
      '-x264-params', 'nal-hrd=cbr:force-cfr=1:sliced-threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0',
      '-pix_fmt', 'yuv420p',
      '-threads', '0',
      '-max_muxing_queue_size', '4096',
      '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0,volume=1.5',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-flush_packets', '1'
    ];

    const spawnFfmpeg = (initialChunk: Buffer) => {
      if (isSpawned || relayInfo.replaced) return;
      isSpawned = true;

      // 1. PRIMARY FFMPEG PROCESS (100% Dedicated & Isolated for Primary/YouTube Live Stream — Zero Interference)
      const primaryFfmpegArgs = [
        ...baseEncodingArgs,
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        destinationRtmp
      ];

      // 2. SECONDARY SIMULCAST FFMPEG PROCESS (For additional platforms 2..5: TikTok, Instagram, Facebook, Threads/Custom)
      const secondaryDestinations = allDestinations.filter(d => d !== destinationRtmp).slice(0, 4);

      console.log(`[RtmpRelay] 🎬 Spawning Primary HD 720p30 FFmpeg #${connId} (Direct FLV) + ${secondaryDestinations.length} Secondary Simulcast Platform(s) with initial chunk (${initialChunk.length} bytes)...`);

      try {
        const bRes = streamController.startBroadcast(boothId);
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_STREAM',
          action: 'UPDATE',
          documentRef: `${boothId}_START`,
          data: bRes.booth
        });
      } catch (_) {}

      try {
        ffmpegProcess = spawn(ffmpegExe, primaryFfmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe']
        });
        relayInfo.ffmpeg = ffmpegProcess;
      } catch (spawnErr: any) {
        console.error('[RtmpRelay] Failed to spawn Primary FFmpeg:', spawnErr);
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

      // Spawn isolated secondary simulcast process if extra platforms (2..5) are configured
      if (secondaryDestinations.length > 0) {
        try {
          const useSecondaryTee = secondaryDestinations.length > 1;
          const secondaryTeeSpec = secondaryDestinations
            .map((dest) => `[f=flv:onfail=ignore]${dest}`)
            .join('|');
          const secondaryArgs = [
            ...baseEncodingArgs,
            ...(useSecondaryTee
              ? ['-f', 'tee', secondaryTeeSpec]
              : ['-f', 'flv', '-flvflags', 'no_duration_filesize', secondaryDestinations[0]])
          ];

          secondaryFfmpegProcess = spawn(ffmpegExe, secondaryArgs, {
            stdio: ['pipe', 'ignore', 'pipe']
          });
          relayInfo.secondaryFfmpeg = secondaryFfmpegProcess;

          secondaryFfmpegProcess.on('error', (secErr) => {
            console.warn(`[RtmpRelay] Secondary Simulcast FFmpeg #${connId} notice:`, secErr?.message);
          });
          secondaryFfmpegProcess.on('exit', (code) => {
            console.log(`[RtmpRelay] Secondary Simulcast FFmpeg #${connId} exited (code=${code}); primary stream unaffected.`);
          });
          if (secondaryFfmpegProcess.stdin) {
            secondaryFfmpegProcess.stdin.on('error', () => {});
            secondaryFfmpegProcess.stdin.write(initialChunk);
          }
        } catch (secSpawnErr: any) {
          console.warn(`[RtmpRelay] Secondary Simulcast spawn warning (Primary stream unaffected):`, secSpawnErr?.message);
        }
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
          const combined = Buffer.concat(pendingChunks);
          const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
          const clusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
          const ebmlIdx = combined.indexOf(ebmlMagic);
          const clusterIdx = combined.indexOf(clusterMagic);
          if (ebmlIdx !== -1 && (clusterIdx > ebmlIdx || combined.length >= 12288 || pendingChunks.length >= 4)) {
            const alignedBuffer = ebmlIdx > 0 ? combined.subarray(ebmlIdx) : combined;
            pendingChunks.length = 0;
            spawnFfmpeg(alignedBuffer);
          } else if (combined.length >= 16384 || pendingChunks.length >= 5) {
            pendingChunks.length = 0;
            spawnFfmpeg(combined);
          }
        }
      } else {
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          try {
            ffmpegProcess.stdin.write(buf);
          } catch (writeErr) {
            console.warn(`[RtmpRelay] Error writing to FFmpeg stdin:`, writeErr);
          }
        }
        if (secondaryFfmpegProcess && secondaryFfmpegProcess.stdin && secondaryFfmpegProcess.stdin.writable) {
          try {
            secondaryFfmpegProcess.stdin.write(buf);
          } catch (_) {}
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
      try {
        secondaryFfmpegProcess?.removeAllListeners('exit');
        secondaryFfmpegProcess?.removeAllListeners('error');
        if (secondaryFfmpegProcess && secondaryFfmpegProcess.stdin && secondaryFfmpegProcess.stdin.writable) {
          secondaryFfmpegProcess.stdin.end();
        }
        secondaryFfmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
        try {
          youTubeChatService.disconnectBooth(boothId);
          socialChatService.disconnectAllBoothPlatforms(boothId);
          const bRes = streamController.stopBroadcast(boothId);
          streamController.clearComments(boothId);
          eventHub.broadcast({
            type: 'ENTITY_MUTATED',
            module: 'SALES',
            entity: 'LIVE_STREAM',
            action: 'UPDATE',
            documentRef: `${boothId}_STOP`,
            data: bRes.booth
          });
        } catch (_) {}
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
      try {
        secondaryFfmpegProcess?.removeAllListeners('exit');
        secondaryFfmpegProcess?.removeAllListeners('error');
        secondaryFfmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
      }
    });

    // Lookup RTMP Ingest URL and Stream Key: query params first, then DB lookup across all 5 platforms, then fallback
    const queryKey = url.searchParams.get('streamKey');
    const queryUrl = url.searchParams.get('rtmpUrl');
    const aliases = getBoothAliases(boothId);

    let rtmpUrl = queryUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2';
    let streamKey = queryKey?.trim() || 'edu8-fpef-kc0c-s9cs-dath';
    const extraRtmpTargets: string[] = [];

    const defaultIngests: Record<string, string> = {
      youtube: 'rtmp://a.rtmp.youtube.com/live2',
      tiktok: 'rtmp://push.tiktok.com/live',
      facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
      instagram: 'rtmps://live-upload.instagram.com:443/rtmp',
      threads: 'rtmps://live.threads.net:443/rtmp',
      custom: 'rtmps://live.restream.io/live'
    };

    try {
      await withDb(async (client) => {
        const boothRes = await client.query(
          `SELECT * FROM public.live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1`,
          [aliases]
        );
        const boothRow = boothRes.rows?.[0];

        if (!queryKey && boothRow?.master_stream_key) {
          const decryptedMaster = decryptCredential(String(boothRow.master_stream_key).trim());
          if (isValidRtmpStreamKey(decryptedMaster)) {
            streamKey = decryptedMaster;
            if (boothRow.master_ingest_rtmp_url) {
              rtmpUrl = boothRow.master_ingest_rtmp_url;
            }
          }
        }

        // Check direct platform stream key columns on live_stream_booths
        if (boothRow) {
          const directCols: Array<{ plat: string; key?: string }> = [
            { plat: 'youtube', key: boothRow.youtube_stream_key },
            { plat: 'tiktok', key: boothRow.tiktok_stream_key },
            { plat: 'facebook', key: boothRow.facebook_stream_key },
            { plat: 'instagram', key: boothRow.instagram_stream_key },
            { plat: 'threads', key: boothRow.threads_stream_key }
          ];
          for (const item of directCols) {
            const dec = decryptCredential(String(item.key || '').trim());
            if (isValidRtmpStreamKey(dec)) {
              const base = defaultIngests[item.plat];
              if (base) extraRtmpTargets.push(`${base}/${dec}`);
            }
          }
        }

        // Gather all active multi-platform RTMP keys configured in booth_social_channels (decrypting enc:v1: AES-256 keys!)
        const chRes = await client.query(
          `SELECT platform, account_password, proxy_url, metadata FROM public.booth_social_channels WHERE booth_id = ANY($1::text[]) AND is_active = true`,
          [aliases]
        );
        for (const row of chRes.rows || []) {
          const plat = String(row.platform || '').toLowerCase();
          const rawPwd = String(row.account_password || '').trim();
          const metaKey = String(row.metadata?.streamKey || '').trim();
          const decryptedKey = decryptCredential(rawPwd || metaKey).trim();
          if (!isValidRtmpStreamKey(decryptedKey)) continue;

          const customBase = String(row.proxy_url || row.metadata?.rtmpUrl || '').trim();
          const base = (customBase.startsWith('rtmp://') || customBase.startsWith('rtmps://')
            ? customBase
            : (defaultIngests[plat] || '')
          ).replace(/\/+$/, '');

          if (base) {
            extraRtmpTargets.push(`${base}/${decryptedKey}`);
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

    // Automatically attach YouTube Live Chat poller AND all 5 social platform listeners for this booth
    const chatStatus = youTubeChatService.getBoothChatStatus(boothId);
    if (!chatStatus.isConnected) {
      youTubeChatService.connectBoothToYouTubeChat(boothId).catch(() => {});
    }
    socialChatService.connectAllBoothPlatforms(boothId).catch(() => {});

    // Notify client that pipe is established and ready for webm chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${cleanKey.slice(-4)}`,
        simulcastCount: allDestinations.length
      }));
    }

    if (!isSpawned && pendingChunks.length > 0) {
      const combined = Buffer.concat(pendingChunks);
      const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const clusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
      const ebmlIdx = combined.indexOf(ebmlMagic);
      const clusterIdx = combined.indexOf(clusterMagic);
      if (ebmlIdx !== -1 && (clusterIdx > ebmlIdx || combined.length >= 12288)) {
        const alignedBuffer = ebmlIdx > 0 ? combined.subarray(ebmlIdx) : combined;
        pendingChunks.length = 0;
        spawnFfmpeg(alignedBuffer);
      }
    }
  });

  return wss;
}

import http from 'http';
import net from 'net';
import tls from 'tls';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execFileSync, ChildProcess } from 'child_process';
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
  secondaryFfmpegList?: ChildProcess[];
  ws: WebSocket;
  startedAt: number;
  bytesReceived: number;
  replaced?: boolean;
  keepAliveTimer?: ReturnType<typeof setInterval>;
}

const activeRelays = new Map<string, ActiveRelay>();
const disconnectGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const softwareLiveFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
const softwareIntendedLive = new Set<string>();
let relayConnSeq = 0;

function appendRelayLog(line: string) {
  try {
    const logPath = path.join(process.cwd(), 'rtmp_relay.log');
    const entry = `[${new Date().toISOString()}] ${line}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (_) {}
}

function normalizeBoothKey(boothId: string): string {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  return m ? `booth-${parseInt(m[1], 10)}` : raw;
}

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
  'ig_key',
  'tt_key',
  'fb_key',
  'th_key',
  'yt_key',
  'live_tt_dubai_bale_stage',
  'live_ig_relove_vintage',
  'fb-live-page-vv-992',
  'yt_live_channel_dxb_1080',
  're_live_sec_10482_vv_dxb_773'
]);

export function isValidRtmpStreamKey(rawKey?: string | null): boolean {
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

const activeTlsBridges = new Map<string, Promise<number>>();

async function bridgeRtmpsUrlIfNeeded(targetUrl: string): Promise<string> {
  if (process.platform !== 'win32' || !targetUrl.toLowerCase().startsWith('rtmps://')) {
    return targetUrl;
  }
  try {
    const withoutProto = targetUrl.slice('rtmps://'.length);
    const slashIdx = withoutProto.indexOf('/');
    if (slashIdx === -1) return targetUrl;
    const hostPort = withoutProto.slice(0, slashIdx);
    const pathAndKey = withoutProto.slice(slashIdx); // starts with '/'
    const [remoteHost, portStr] = hostPort.split(':');
    const remotePort = parseInt(portStr || '443', 10) || 443;
    const cacheKey = `${remoteHost}:${remotePort}`;

    let portPromise = activeTlsBridges.get(cacheKey);
    if (!portPromise) {
      portPromise = new Promise<number>((resolve, reject) => {
        const srv = net.createServer((clientSocket) => {
          clientSocket.pause();
          const tlsSocket = tls.connect(
            {
              host: remoteHost,
              port: remotePort,
              servername: remoteHost,
              rejectUnauthorized: false
            },
            () => {
              clientSocket.pipe(tlsSocket);
              tlsSocket.pipe(clientSocket);
              clientSocket.resume();
            }
          );
          tlsSocket.on('error', () => clientSocket.destroy());
          clientSocket.on('error', () => tlsSocket.destroy());
          tlsSocket.on('close', () => clientSocket.destroy());
          clientSocket.on('close', () => tlsSocket.destroy());
        });
        srv.on('error', (err) => {
          activeTlsBridges.delete(cacheKey);
          reject(err);
        });
        srv.listen(0, '127.0.0.1', () => {
          const addr = srv.address();
          const localPort = typeof addr === 'object' && addr ? addr.port : 0;
          console.log(`[RtmpRelay] 🔒 OpenSSL RTMPS Bridge active: 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}`);
          resolve(localPort);
        });
      });
      activeTlsBridges.set(cacheKey, portPromise);
    }

    const localPort = await portPromise;
    return `rtmp://127.0.0.1:${localPort}${pathAndKey}`;
  } catch (e) {
    return targetUrl;
  }
}

/**
 * Resolve path to ffmpeg executable
 */
export function getFfmpegPath(): string {
  const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    process.env.FFMPEG_PATH || '',
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exeName),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', exeName),
    'C:\\vintage-vibe\\node_modules\\ffmpeg-static\\ffmpeg.exe'
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return 'ffmpeg';
}

let cachedNvencAvailable: boolean | null = null;
let cachedGpuName: string = 'CPU Fallback (libx264)';
let cachedGpuTelemetry: any = null;
let cachedGpuTelemetryAt = 0;

export function isNvidiaNvencAvailable(): boolean {
  if (cachedNvencAvailable !== null) return cachedNvencAvailable;
  try {
    const ffmpegExe = getFfmpegPath();
    execFileSync(
      ffmpegExe,
      ['-hide_banner', '-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.05', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
      { stdio: 'ignore', timeout: 5000, windowsHide: true }
    );
    cachedNvencAvailable = true;
    try {
      const smi = execFileSync(
        'nvidia-smi',
        ['--query-gpu=name,memory.total', '--format=csv,noheader'],
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      ).trim();
      if (smi) cachedGpuName = smi.split('\n')[0].trim();
    } catch (_) {
      cachedGpuName = 'NVIDIA GeForce RTX GPU (NVENC)';
    }
    console.log(`[RtmpRelay] 🚀 NVIDIA GPU Hardware Acceleration (h264_nvenc) ACTIVE on ${cachedGpuName}!`);
  } catch (_) {
    cachedNvencAvailable = false;
  }
  return cachedNvencAvailable;
}

export function getGpuTelemetry() {
  const nvenc = isNvidiaNvencAvailable();
  if (cachedGpuTelemetry && Date.now() - cachedGpuTelemetryAt < 15000) {
    return {
      ...cachedGpuTelemetry,
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
  }
  try {
    const raw = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    ).trim();
    const parts = raw.split(',').map((s) => s.trim());
    cachedGpuTelemetry = {
      gpu_available: true,
      gpu_name: parts[0] || cachedGpuName,
      vram_total_mb: Number(parts[1] || 8192),
      vram_used_mb: Number(parts[2] || 0),
      vram_free_mb: Number(parts[3] || 8192),
      utilization_pct: Number(parts[4] || 0),
      temperature_c: Number(parts[5] || 0),
      nvenc_active: nvenc,
      video_encoder: nvenc ? 'h264_nvenc (NVIDIA Hardware CUDA/NVENC)' : 'libx264 (CPU)',
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
    cachedGpuTelemetryAt = Date.now();
    return cachedGpuTelemetry;
  } catch (_) {
    return {
      gpu_available: nvenc,
      gpu_name: cachedGpuName,
      vram_total_mb: nvenc ? 8192 : 0,
      vram_used_mb: 0,
      vram_free_mb: nvenc ? 8192 : 0,
      utilization_pct: 0,
      temperature_c: 0,
      nvenc_active: nvenc,
      video_encoder: nvenc ? 'h264_nvenc (NVIDIA Hardware CUDA/NVENC)' : 'libx264 (CPU)',
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
  }
}

/**
 * Mount the RTMP Live Stream WebSocket Ingestion Relay onto the HTTP server
 */
export function setupRtmpRelayWebSocket(server: http.Server) {
  // Probe GPU NVENC capability on startup
  setImmediate(() => {
    try {
      isNvidiaNvencAvailable();
    } catch (_) {}
  });

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
    const boothId = normalizeBoothKey(url.searchParams.get('boothId') || 'booth-1');
    const connId = ++relayConnSeq;

    softwareIntendedLive.add(boothId);
    const pendingFallback = softwareLiveFallbackTimers.get(boothId);
    if (pendingFallback) {
      clearTimeout(pendingFallback);
      softwareLiveFallbackTimers.delete(boothId);
    }

    // Cancel any pending disconnect grace timer for this booth so brief reconnects never interrupt the session
    const pendingGrace = disconnectGraceTimers.get(boothId);
    if (pendingGrace) {
      clearTimeout(pendingGrace);
      disconnectGraceTimers.delete(boothId);
    }

    console.log(`[RtmpRelay] 🎥 Client #${connId} connected for ${boothId}. Initializing RTMP stream pipe...`);
    appendRelayLog(`[RtmpRelay] 🎥 Client #${connId} connected for ${boothId}.`);

    // Clean up any stale relay for this booth IMMEDIATELY and notify it that it was superseded so it never auto-reconnects
    const existing = activeRelays.get(boothId);
    if (existing) {
      console.log(`[RtmpRelay] Superseding previous relay #${existing.connId} for ${boothId}`);
      existing.replaced = true;
      activeRelays.delete(boothId);
      if (existing.keepAliveTimer) {
        clearInterval(existing.keepAliveTimer);
      }
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
        existing.ws?.removeAllListeners('message');
        if (existing.ws?.readyState === WebSocket.OPEN) {
          existing.ws.send(JSON.stringify({ type: 'SUPERSEDED', reason: 'Superseded by newer stream connection' }));
          existing.ws.close(1000, 'Superseded by new stream');
        }
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
    const bridgedToRawMap = new Map<string, string>();
    const ffmpegExe = getFfmpegPath();
    const useNvenc = isNvidiaNvencAvailable();

    const videoCodecArgs = useNvenc
      ? [
          '-c:v', 'h264_nvenc',
          '-preset', 'p1',
          '-tune', 'ull',
          '-zerolatency', '1',
          '-profile:v', 'main',
          '-rc', 'cbr',
          '-g', '30',
          '-bf', '0',
          '-b:v', '2500k',
          '-minrate', '2500k',
          '-maxrate', '2500k',
          '-bufsize', '1500k',
          '-pix_fmt', 'yuv420p'
        ]
      : [
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
          '-bufsize', '1500k',
          '-x264-params', 'nal-hrd=cbr:force-cfr=1:sliced-threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0',
          '-pix_fmt', 'yuv420p',
          '-threads', '0'
        ];

    const buildEncodingArgs = (hasOpusAudio: boolean, hasVp8Video: boolean) => {
      const inDecoderArgs = hasVp8Video ? ['-c:v', 'libvpx'] : [];
      if (hasOpusAudio) {
        return [
          '-hide_banner',
          '-fflags', '+genpts+igndts',
          '-thread_queue_size', '4096',
          ...inDecoderArgs,
          '-f', 'webm',
          '-i', 'pipe:0',
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
          '-r', '30',
          '-fps_mode', 'cfr',
          ...videoCodecArgs,
          '-flags', '+global_header',
          '-max_muxing_queue_size', '4096',
          '-af', 'aresample=async=1',
          '-c:a', 'aac',
          '-b:a', '160k',
          '-ar', '48000',
          '-ac', '2',
          '-flush_packets', '1'
        ];
      }
      return [
        '-hide_banner',
        '-fflags', '+genpts+igndts',
        '-thread_queue_size', '4096',
        ...inDecoderArgs,
        '-f', 'webm',
        '-i', 'pipe:0',
        '-f', 'lavfi',
        '-i', 'anullsrc=r=48000:cl=stereo',
        '-shortest',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
        '-r', '30',
        '-fps_mode', 'cfr',
        ...videoCodecArgs,
        '-flags', '+global_header',
        '-max_muxing_queue_size', '4096',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '48000',
        '-ac', '2',
        '-flush_packets', '1'
      ];
    };

    const spawnFfmpeg = (initialChunk: Buffer) => {
      if (isSpawned || relayInfo.replaced) return;
      isSpawned = true;

      const hasOpusAudio = initialChunk.includes(Buffer.from('A_OPUS'));
      const hasVp8Video = initialChunk.includes(Buffer.from('V_VP8'));
      const dynamicEncodingArgs = buildEncodingArgs(hasOpusAudio, hasVp8Video);

      const primaryOrigRaw = bridgedToRawMap.get(destinationRtmp) || destinationRtmp;
      const primaryRtmpExtra: string[] = [];
      if (primaryOrigRaw.toLowerCase().startsWith('rtmps://')) {
        const rtmpIdx = primaryOrigRaw.indexOf('/rtmp/');
        const tcBase = rtmpIdx !== -1 ? primaryOrigRaw.slice(0, rtmpIdx + 6) : primaryOrigRaw.replace(/\/[^\/]+$/, '/');
        primaryRtmpExtra.push(
          '-rtmp_tcurl', tcBase,
          '-rtmp_app', 'rtmp/',
          '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
        );
      }

      // 1. PRIMARY FFMPEG PROCESS (100% Dedicated & Isolated for Primary/YouTube Live Stream — Zero Interference)
      const primaryFfmpegArgs = [
        ...dynamicEncodingArgs,
        ...primaryRtmpExtra,
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        destinationRtmp
      ];

      // 2. SECONDARY SIMULCAST FFMPEG PROCESS (For additional platforms 2..5: TikTok, Instagram, Facebook, Threads/Custom)
      const secondaryDestinations = allDestinations.filter(d => d !== destinationRtmp).slice(0, 4);

      const spawnMsg = `[RtmpRelay] 🎬 Spawning Primary HD 720p30 FFmpeg #${connId} (hasOpus=${hasOpusAudio}) + ${secondaryDestinations.length} Secondary Platform(s) with initial chunk (${initialChunk.length} bytes)...`;
      console.log(spawnMsg);
      appendRelayLog(spawnMsg);

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
        stopAutonomousMarketingBroadcaster(boothId);
      } catch (_) {}

      try {
        ffmpegProcess = spawn(ffmpegExe, primaryFfmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true
        });
        relayInfo.ffmpeg = ffmpegProcess;
      } catch (spawnErr: any) {
        console.error('[RtmpRelay] Failed to spawn Primary FFmpeg:', spawnErr);
        appendRelayLog(`[RtmpRelay] Failed to spawn Primary FFmpeg: ${spawnErr?.message}`);
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
          const lines = text.trim().split(/[\r\n]+/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              console.log(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
              appendRelayLog(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
            }
          }
        });
      }

      ffmpegProcess.on('exit', (code, signal) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        const exitMsg = `[RtmpRelay] FFmpeg #${connId} for ${boothId} exited with code=${code}, signal=${signal}. Stderr: ${lastStderr.slice(-400)}`;
        console.warn(exitMsg);
        appendRelayLog(exitMsg);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          const errDetail = signal ? `FFmpeg terminated by ${signal}` : `FFmpeg exited code ${code}`;
          try {
            ws.send(JSON.stringify({ type: 'STREAM_ENDED', code, signal, error: `${errDetail}: ${lastStderr.slice(-200)}` }));
            ws.close(1011, 'FFmpeg stream ended');
          } catch (_) {}
        }
        if (softwareIntendedLive.has(boothId)) {
          handleSoftwareBoothBroadcastToggle(boothId, true);
        }
      });

      ffmpegProcess.on('error', (err) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        console.error(`[RtmpRelay] FFmpeg #${connId} process error for ${boothId}:`, err);
        appendRelayLog(`[RtmpRelay] FFmpeg #${connId} process error for ${boothId}: ${err?.message}`);
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

      // Spawn isolated secondary simulcast processes per platform (Instagram, TikTok, Facebook, Threads)
      const secProcs: ChildProcess[] = [];
      relayInfo.secondaryFfmpegList = secProcs;
      if (secondaryDestinations.length > 0) {
        for (const secDest of secondaryDestinations) {
          try {
            const origRaw = bridgedToRawMap.get(secDest) || secDest;
            const rtmpExtra: string[] = [];
            if (origRaw.toLowerCase().startsWith('rtmps://')) {
              const rtmpIdx = origRaw.indexOf('/rtmp/');
              const tcBase = rtmpIdx !== -1 ? origRaw.slice(0, rtmpIdx + 6) : origRaw.replace(/\/[^\/]+$/, '/');
              rtmpExtra.push(
                '-rtmp_tcurl', tcBase,
                '-rtmp_app', 'rtmp/',
                '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
              );
            }
            const secondaryArgs = [
              ...dynamicEncodingArgs,
              ...rtmpExtra,
              '-f', 'flv',
              '-flvflags', 'no_duration_filesize',
              secDest
            ];

            const secProc = spawn(ffmpegExe, secondaryArgs, {
              stdio: ['pipe', 'ignore', 'pipe'],
              windowsHide: true
            });
            secProcs.push(secProc);
            relayInfo.secondaryFfmpeg = secProc;

            secProc.stderr?.on('data', (d) => {
              const s = d.toString().trim();
              if (s && !s.startsWith('frame=')) {
                appendRelayLog(`[SecFFmpeg ${boothId}#${connId}] ${s.slice(0, 240)}`);
              }
            });
            secProc.on('error', (secErr) => {
              console.warn(`[RtmpRelay] Secondary Simulcast FFmpeg #${connId} notice:`, secErr?.message);
            });
            secProc.on('exit', (code) => {
              const secExit = `[RtmpRelay] Secondary Simulcast FFmpeg #${connId} (${origRaw.slice(0, 36)}...) exited (code=${code}); primary stream unaffected.`;
              console.log(secExit);
              appendRelayLog(secExit);
            });
            if (secProc.stdin) {
              secProc.stdin.on('error', () => {});
              secProc.stdin.write(initialChunk);
            }
          } catch (secSpawnErr: any) {
            console.warn(`[RtmpRelay] Secondary Simulcast spawn warning (Primary stream unaffected):`, secSpawnErr?.message);
          }
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
        if (isReadyToSpawn && pendingChunks.length >= 2) {
          const combined = Buffer.concat(pendingChunks);
          const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
          const clusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
          const ebmlIdx = combined.indexOf(ebmlMagic);
          const clusterIdx = combined.indexOf(clusterMagic);
          if (ebmlIdx !== -1 && (clusterIdx > ebmlIdx || combined.length >= 12288 || pendingChunks.length >= 3)) {
            const alignedBuffer = ebmlIdx > 0 ? combined.subarray(ebmlIdx) : combined;
            pendingChunks.length = 0;
            spawnFfmpeg(alignedBuffer);
          } else if (combined.length >= 16384 || pendingChunks.length >= 4) {
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
        if (relayInfo.secondaryFfmpegList && relayInfo.secondaryFfmpegList.length > 0) {
          for (const sp of relayInfo.secondaryFfmpegList) {
            if (sp && sp.stdin && sp.stdin.writable) {
              try {
                sp.stdin.write(buf);
              } catch (_) {}
            }
          }
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
    relayInfo.keepAliveTimer = keepAliveTimer;

    ws.on('close', (code, reason) => {
      clearInterval(keepAliveTimer);
      const reasonStr = reason ? reason.toString() : '';
      console.log(`[RtmpRelay] ⏹️ Client #${connId} disconnected for ${boothId} (chunks=${chunkCount}, bytes=${(bytesReceived / 1024 / 1024).toFixed(2)} MB, code=${code}, reason=${reasonStr})`);
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
      if (relayInfo.secondaryFfmpegList) {
        for (const sp of relayInfo.secondaryFfmpegList) {
          try {
            sp?.removeAllListeners('exit');
            sp?.removeAllListeners('error');
            if (sp && sp.stdin && sp.stdin.writable) sp.stdin.end();
            sp?.kill('SIGTERM');
          } catch (_) {}
        }
      }
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
        const finalizeStop = () => {
          disconnectGraceTimers.delete(boothId);
          // Only stop broadcast if a new relay hasn't reconnected for this booth during the grace window
          if (activeRelays.has(boothId)) return;
          try {
            const ytStatus = youTubeChatService.getStatus(boothId);
            youTubeChatService.disconnectBooth(boothId);
            socialChatService.disconnectAllBoothPlatforms(boothId);
            const bRes = streamController.stopBroadcast(boothId, ytStatus?.liveId);
            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'LIVE_STREAM',
              action: 'UPDATE',
              documentRef: `${boothId}_STOP`,
              data: bRes.booth
            });
          } catch (_) {}
        };

        if (reasonStr.includes('User stopped')) {
          softwareIntendedLive.delete(boothId);
          stopAutonomousMarketingBroadcaster(boothId);
          finalizeStop();
        } else {
          if (softwareIntendedLive.has(boothId)) {
            handleSoftwareBoothBroadcastToggle(boothId, true);
          }
          // 5-second grace period so auto-reconnects never tear down YouTube chat or trigger false disconnect logs
          const existingTimer = disconnectGraceTimers.get(boothId);
          if (existingTimer) clearTimeout(existingTimer);
          disconnectGraceTimers.set(boothId, setTimeout(finalizeStop, 5000));
        }
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

    const seenPlatforms = new Set<string>();

    try {
      await withDb(async (client) => {
        // 1. Gather all active multi-platform RTMP keys configured in booth_social_channels FIRST (highest priority, preserves custom proxy_url!)
        try {
          const chRes = await client.query(
            `SELECT platform, account_password, proxy_url, metadata FROM public.booth_social_channels WHERE booth_id = ANY($1::text[]) AND is_active = true ORDER BY updated_at DESC NULLS LAST`,
            [aliases]
          );
          for (const row of chRes.rows || []) {
            const plat = String(row.platform || '').toLowerCase();
            if (seenPlatforms.has(plat)) continue;
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
              seenPlatforms.add(plat);
              extraRtmpTargets.push(`${base}/${decryptedKey}`);
            }
          }
        } catch (chErr: any) {
          console.warn(`[RtmpRelay] booth_social_channels lookup notice:`, chErr?.message);
        }

        // 2. Check live_stream_booths for master stream key & any remaining platforms
        try {
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

          if (boothRow) {
            const directCols: Array<{ plat: string; key?: string }> = [
              { plat: 'youtube', key: boothRow.youtube_stream_key },
              { plat: 'tiktok', key: boothRow.tiktok_stream_key },
              { plat: 'facebook', key: boothRow.facebook_stream_key },
              { plat: 'instagram', key: boothRow.instagram_stream_key },
              { plat: 'threads', key: boothRow.threads_stream_key }
            ];
            for (const item of directCols) {
              if (seenPlatforms.has(item.plat)) continue;
              const dec = decryptCredential(String(item.key || '').trim());
              if (isValidRtmpStreamKey(dec)) {
                const base = defaultIngests[item.plat];
                if (base) {
                  seenPlatforms.add(item.plat);
                  extraRtmpTargets.push(`${base}/${dec}`);
                }
              }
            }
          }
        } catch (bErr: any) {
          console.warn(`[RtmpRelay] live_stream_booths lookup notice:`, bErr?.message);
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
    const rawPrimaryDest = `${cleanRtmpBase}/${cleanKey}`;
    const rawAllDests = Array.from(new Set([rawPrimaryDest, ...extraRtmpTargets])).slice(0, 5);
    destinationRtmp = await bridgeRtmpsUrlIfNeeded(rawPrimaryDest);
    bridgedToRawMap.set(destinationRtmp, rawPrimaryDest);
    allDestinations = await Promise.all(
      rawAllDests.map(async (d) => {
        const b = await bridgeRtmpsUrlIfNeeded(d);
        bridgedToRawMap.set(b, d);
        return b;
      })
    );
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

export interface ResolvedPlatformTarget {
  platform: string;
  baseUrl: string;
  streamKey: string;
  rawTargetUrl: string;
  bridgedTargetUrl: string;
  igBroadcastId?: string;
  igCookieHeader?: string;
}

interface AutonomousPlatformWorker {
  platform: string;
  rawTargetUrl: string;
  proc: ChildProcess | null;
  status: 'STREAMING' | 'RECONNECTING' | 'STOPPED';
  startedAt: number;
  lastError?: string;
  retryTimer?: ReturnType<typeof setTimeout>;
  igBroadcastId?: string;
  igCookieHeader?: string;
}

const autonomousBoothWorkers = new Map<string, Map<string, AutonomousPlatformWorker>>();
const autonomousBoothActive = new Set<string>();

async function tryAutoCreateInstagramBroadcast(cookieHeader: string): Promise<{ uploadUrl?: string; broadcastId?: string }> {
  try {
    const body = new URLSearchParams({
      preview_width: '720',
      preview_height: '1280',
      broadcast_message: 'Vintage Vibes Dubai Live Drop',
      internal_only: '0'
    });
    const res = await fetch('https://i.instagram.com/api/v1/live/create/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookieHeader
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return {};
    const data: any = await res.json();
    if (data?.upload_url && data?.broadcast_id) {
      return { uploadUrl: String(data.upload_url), broadcastId: String(data.broadcast_id) };
    }
  } catch (_) {}
  return {};
}

async function tryAutoStartInstagramBroadcast(broadcastId: string, cookieHeader: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ should_send_notifications: '1' });
    const res = await fetch(`https://i.instagram.com/api/v1/live/${encodeURIComponent(broadcastId)}/start/`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookieHeader
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export async function resolveActiveBoothRtmpTargets(boothId: string = 'booth-1'): Promise<ResolvedPlatformTarget[]> {
  const aliases = getBoothAliases(boothId);
  const defaultIngests: Record<string, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    tiktok: 'rtmp://push.tiktok.com/live',
    facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    instagram: 'rtmps://edgetee-upload-kul2-2.xx.fbcdn.net:443/rtmp',
    threads: 'rtmps://live.threads.net:443/rtmp',
    custom: 'rtmps://live.restream.io/live'
  };

  const results: ResolvedPlatformTarget[] = [];
  const seenPlatforms = new Set<string>();

  try {
    await withDb(async (client) => {
      // 1. Check booth_social_channels first
      try {
        const chRes = await client.query(
          `SELECT platform, account_password, proxy_url, metadata, session_cookies FROM public.booth_social_channels WHERE booth_id = ANY($1::text[]) AND is_active = true ORDER BY updated_at DESC NULLS LAST`,
          [aliases]
        );
        for (const row of chRes.rows || []) {
          const plat = String(row.platform || '').toLowerCase();
          if (!plat || seenPlatforms.has(plat)) continue;

          let igBroadcastId: string | undefined;
          let igCookieHeader: string | undefined;

          if (plat === 'instagram' && Array.isArray(row.session_cookies)) {
            const realCookies = row.session_cookies.filter(
              (c: any) => c?.name && c?.value && !String(c.value).startsWith('sid_') && !String(c.value).startsWith('at_')
            );
            if (realCookies.some((c: any) => c.name === 'sessionid')) {
              igCookieHeader = realCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
              const created = await tryAutoCreateInstagramBroadcast(igCookieHeader);
              if (created.uploadUrl) {
                const idx = created.uploadUrl.indexOf('/rtmp/');
                if (idx !== -1) {
                  const baseUrl = created.uploadUrl.slice(0, idx + 5);
                  const streamKey = created.uploadUrl.slice(idx + 6);
                  const rawTargetUrl = `${baseUrl}/${streamKey}`;
                  const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
                  seenPlatforms.add(plat);
                  results.push({
                    platform: plat,
                    baseUrl,
                    streamKey,
                    rawTargetUrl,
                    bridgedTargetUrl,
                    igBroadcastId: created.broadcastId,
                    igCookieHeader
                  });
                  continue;
                }
              }
            }
          }

          const rawPwd = String(row.account_password || '').trim();
          const metaKey = String(row.metadata?.streamKey || '').trim();
          const decryptedKey = decryptCredential(rawPwd || metaKey).trim();
          if (!isValidRtmpStreamKey(decryptedKey)) continue;

          const customBase = String(row.proxy_url || row.metadata?.rtmpUrl || '').trim();
          const baseUrl = (customBase.startsWith('rtmp://') || customBase.startsWith('rtmps://')
            ? customBase
            : (defaultIngests[plat] || '')
          ).replace(/\/+$/, '');

          if (baseUrl) {
            const rawTargetUrl = `${baseUrl}/${decryptedKey}`;
            const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
            seenPlatforms.add(plat);
            results.push({
              platform: plat,
              baseUrl,
              streamKey: decryptedKey,
              rawTargetUrl,
              bridgedTargetUrl,
              igBroadcastId,
              igCookieHeader
            });
          }
        }
      } catch (_) {}

      // 2. Check live_stream_booths for any platform not already found in booth_social_channels
      try {
        const boothRes = await client.query(
          `SELECT * FROM public.live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1`,
          [aliases]
        );
        const boothRow = boothRes.rows?.[0];
        if (boothRow) {
          const directCols: Array<{ plat: string; key?: string }> = [
            { plat: 'youtube', key: boothRow.youtube_stream_key || boothRow.master_stream_key },
            { plat: 'instagram', key: boothRow.instagram_stream_key },
            { plat: 'tiktok', key: boothRow.tiktok_stream_key },
            { plat: 'facebook', key: boothRow.facebook_stream_key },
            { plat: 'threads', key: boothRow.threads_stream_key }
          ];
          for (const item of directCols) {
            if (seenPlatforms.has(item.plat)) continue;
            const dec = decryptCredential(String(item.key || '').trim()).trim();
            if (!isValidRtmpStreamKey(dec)) continue;
            const baseUrl = defaultIngests[item.plat];
            if (baseUrl) {
              const rawTargetUrl = `${baseUrl}/${dec}`;
              const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
              seenPlatforms.add(item.plat);
              results.push({
                platform: item.plat,
                baseUrl,
                streamKey: dec,
                rawTargetUrl,
                bridgedTargetUrl
              });
            }
          }
        }
      } catch (_) {}
    });
  } catch (_) {}

  return results;
}

function resolveMarketingLoopVideoPath(): string {
  const candidates = [
    path.join(process.cwd(), 'public', 'generated_reels', 'Vintage_Vibes_Reel_BAL-09-2026-0001-MEN-TEE-P0003_73703.mp4'),
    path.join(process.cwd(), 'public', 'generated_reels', 'Vintage_Vibes_Reel_BAL-10-2026-0002-MEN-TEE-P0002_42729.mp4'),
    path.join(process.cwd(), 'public', 'mazi_video.mp4'),
    path.join(process.cwd(), 'dist', 'mazi_video.mp4'),
    path.join(process.cwd(), 'public', 'gemini_generated_video_92517395.mp4'),
    path.join(process.cwd(), 'dist', 'gemini_generated_video_92517395.mp4')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).size > 100000) {
        return c;
      }
    } catch (_) {}
  }
  return candidates[2];
}

function spawnPlatformMarketingWorker(boothId: string, target: ResolvedPlatformTarget) {
  const bKey = normalizeBoothKey(boothId);
  if (!autonomousBoothActive.has(bKey)) return;

  let workersMap = autonomousBoothWorkers.get(bKey);
  if (!workersMap) {
    workersMap = new Map();
    autonomousBoothWorkers.set(bKey, workersMap);
  }

  const prev = workersMap.get(target.platform);
  if (prev) {
    if (prev.retryTimer) clearTimeout(prev.retryTimer);
    try {
      prev.proc?.removeAllListeners('exit');
      prev.proc?.kill('SIGTERM');
    } catch (_) {}
  }

  const videoPath = resolveMarketingLoopVideoPath();
  const ffmpegExe = getFfmpegPath();
  const useNvenc = isNvidiaNvencAvailable();
  const isVertical = target.platform === 'instagram' || target.platform === 'tiktok' || target.platform === 'threads';

  const scaleFilter = isVertical
    ? 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,format=yuv420p'
    : 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p';

  const vCodec = useNvenc
    ? ['-c:v', 'h264_nvenc', '-preset', 'p2', '-rc', 'cbr', '-b:v', '2500k', '-minrate', '2500k', '-maxrate', '2500k', '-bufsize', '3000k', '-g', '60', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '3000k', '-g', '60', '-pix_fmt', 'yuv420p'];

  const rtmpExtraOutArgs: string[] = [];
  if (target.rawTargetUrl.toLowerCase().startsWith('rtmps://')) {
    rtmpExtraOutArgs.push(
      '-rtmp_tcurl', `${target.baseUrl}/`,
      '-rtmp_app', 'rtmp/',
      '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
    );
  }

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-shortest',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', scaleFilter,
    '-r', '30',
    ...vCodec,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    ...rtmpExtraOutArgs,
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    target.bridgedTargetUrl
  ];

  console.log(`[LiveMarketing] 📡 Starting ${target.platform.toUpperCase()} Live Stream for ${bKey} -> ${target.baseUrl}/****${target.streamKey.slice(-6)} (source: ${path.basename(videoPath)})`);

  const worker: AutonomousPlatformWorker = {
    platform: target.platform,
    rawTargetUrl: target.rawTargetUrl,
    proc: null,
    status: 'STREAMING',
    startedAt: Date.now(),
    igBroadcastId: target.igBroadcastId,
    igCookieHeader: target.igCookieHeader
  };
  workersMap.set(target.platform, worker);

  try {
    const proc = spawn(ffmpegExe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    worker.proc = proc;

    if (target.platform === 'instagram' && target.igBroadcastId && target.igCookieHeader) {
      const bId = target.igBroadcastId;
      const cHdr = target.igCookieHeader;
      setTimeout(() => {
        if (worker.status === 'STREAMING') {
          tryAutoStartInstagramBroadcast(bId, cHdr).then((ok) => {
            if (ok) console.log(`[LiveMarketing] ✅ Instagram Auto-Go-Live triggered for broadcast ${bId}!`);
          });
        }
      }, 3500);
    }

    let stderrTail = '';
    proc.stderr?.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-500);
    });

    proc.on('exit', (code) => {
      if (!autonomousBoothActive.has(bKey) || workersMap?.get(target.platform) !== worker) {
        return;
      }
      worker.status = 'RECONNECTING';
      worker.lastError = stderrTail.trim() || `Exited code ${code}`;
      worker.retryTimer = setTimeout(async () => {
        if (!autonomousBoothActive.has(bKey)) return;
        const freshTargets = await resolveActiveBoothRtmpTargets(bKey);
        const fresh = freshTargets.find((t) => t.platform === target.platform) || target;
        spawnPlatformMarketingWorker(bKey, fresh);
      }, 8000);
    });
  } catch (err: any) {
    worker.status = 'RECONNECTING';
    worker.lastError = err?.message;
  }
}

export async function startAutonomousMarketingBroadcaster(boothId: string = 'booth-1'): Promise<{
  success: boolean;
  boothId: string;
  videoSource: string;
  activePlatforms: Array<{ platform: string; target: string; status: string }>;
}> {
  const bKey = normalizeBoothKey(boothId);
  autonomousBoothActive.add(bKey);
  const targets = await resolveActiveBoothRtmpTargets(bKey);

  try {
    streamController.startBroadcast(bKey);
  } catch (_) {}

  for (const t of targets) {
    spawnPlatformMarketingWorker(bKey, t);
  }

  const workersMap = autonomousBoothWorkers.get(bKey) || new Map();
  return {
    success: true,
    boothId: bKey,
    videoSource: path.basename(resolveMarketingLoopVideoPath()),
    activePlatforms: Array.from(workersMap.values()).map((w) => ({
      platform: w.platform,
      target: w.rawTargetUrl.replace(/\/([^\/]{6})[^\/]+$/, '/$1••••'),
      status: w.status
    }))
  };
}

export function stopAutonomousMarketingBroadcaster(boothId: string = 'booth-1') {
  const bKey = normalizeBoothKey(boothId);
  autonomousBoothActive.delete(bKey);
  const workersMap = autonomousBoothWorkers.get(bKey);
  if (workersMap) {
    for (const w of workersMap.values()) {
      w.status = 'STOPPED';
      if (w.retryTimer) clearTimeout(w.retryTimer);
      try {
        w.proc?.removeAllListeners('exit');
        w.proc?.kill('SIGTERM');
      } catch (_) {}
    }
    workersMap.clear();
  }
  return { success: true, boothId: bKey };
}

export function getAutonomousMarketingBroadcasterStatus(boothId: string = 'booth-1') {
  const bKey = normalizeBoothKey(boothId);
  const workersMap = autonomousBoothWorkers.get(bKey);
  const list = workersMap
    ? Array.from(workersMap.values()).map((w) => ({
        platform: w.platform,
        target: w.rawTargetUrl.replace(/\/([^\/]{6})[^\/]+$/, '/$1••••'),
        status: w.status,
        uptimeSeconds: Math.floor((Date.now() - w.startedAt) / 1000),
        lastError: w.lastError
      }))
    : [];
  return {
    boothId: bKey,
    isActive: autonomousBoothActive.has(bKey),
    videoSource: path.basename(resolveMarketingLoopVideoPath()),
    platforms: list
  };
}

export function handleSoftwareBoothBroadcastToggle(boothId: string = 'booth-1', isBroadcasting: boolean) {
  const bKey = normalizeBoothKey(boothId);
  const existingFallback = softwareLiveFallbackTimers.get(bKey);
  if (existingFallback) {
    clearTimeout(existingFallback);
    softwareLiveFallbackTimers.delete(bKey);
  }

  if (!isBroadcasting) {
    softwareIntendedLive.delete(bKey);
    appendRelayLog(`[SoftwareToggle] ⏹️ Software requested STOP for ${bKey}`);
    stopAutonomousMarketingBroadcaster(bKey);
    const active = activeRelays.get(bKey);
    if (active) {
      active.replaced = true;
      activeRelays.delete(bKey);
      if (active.keepAliveTimer) clearInterval(active.keepAliveTimer);
      try {
        active.ffmpeg?.removeAllListeners('exit');
        active.ffmpeg?.kill('SIGTERM');
      } catch (_) {}
      if (active.secondaryFfmpegList) {
        for (const sp of active.secondaryFfmpegList) {
          try {
            sp?.removeAllListeners('exit');
            sp?.kill('SIGTERM');
          } catch (_) {}
        }
      }
      try {
        if (active.ws?.readyState === WebSocket.OPEN) {
          active.ws.close(1000, 'User stopped stream');
        }
      } catch (_) {}
    }
    return;
  }

  softwareIntendedLive.add(bKey);
  if (activeRelays.has(bKey) || autonomousBoothActive.has(bKey)) {
    return;
  }

  appendRelayLog(`[SoftwareToggle] 🔴 Software requested GO LIVE for ${bKey}; arming 2.5s multi-platform stream guarantee...`);
  const timer = setTimeout(() => {
    softwareLiveFallbackTimers.delete(bKey);
    if (!softwareIntendedLive.has(bKey)) return;
    if (activeRelays.has(bKey) || autonomousBoothActive.has(bKey)) return;
    appendRelayLog(`[SoftwareToggle] 🚀 Launching server multi-platform stream for ${bKey} (YouTube + Instagram + all configured keys)`);
    startAutonomousMarketingBroadcaster(bKey).catch(() => {});
    try {
      const chatStatus = youTubeChatService.getBoothChatStatus(bKey);
      if (!chatStatus.isConnected) {
        youTubeChatService.connectBoothToYouTubeChat(bKey).catch(() => {});
      }
      socialChatService.connectAllBoothPlatforms(bKey).catch(() => {});
    } catch (_) {}
  }, 2500);

  softwareLiveFallbackTimers.set(bKey, timer);
}


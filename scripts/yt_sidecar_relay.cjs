/**
 * Vintage Vibes UAE — Non-Disruptive YouTube Live Auto-Relay Sidecar (Starts Automatically with AI Live Host)
 *
 * 1) Watches Booth-1 HLS (public/live_hls/booth-1/index.m3u8). Whenever AI Live Host starts (HLS fresh < 18s)
 *    and no native YouTube FFmpeg is running, automatically ensures a Public YouTube Live Broadcast is ready/bound
 *    and streams zero-reencode H.264 + AAC over RTMP to YouTube Live!
 * 2) Monitors YouTube Broadcast lifeCycleStatus and transitions 'testing' -> 'live' if YouTube doesn't auto-start within 15s.
 * 3) Stops cleanly when AI Live Host stops, with zero interruption to Website /live/ or Facebook Live.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
require('dotenv').config({ path: path.join('C:\\vintage-vibe', '.env') });
const { Pool } = require('C:\\vintage-vibe\\node_modules\\pg');

const ROOT = 'C:\\vintage-vibe';
const HLS_M3U8 = path.join(ROOT, 'public', 'live_hls', 'booth-1', 'index.m3u8');
const FFMPEG_EXE = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const PID_FILE = path.join(ROOT, 'logs', 'yt_sidecar_relay.pid');
const LOG_FILE = path.join(ROOT, 'logs', 'yt_sidecar_relay.log');
const ACTIVE_YT_FILE = path.join(ROOT, 'public', 'yt-active-live.json');

fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });

if (fs.existsSync(PID_FILE)) {
  try {
    const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    if (oldPid && oldPid !== process.pid) {
      process.kill(oldPid, 0);
      process.exit(0);
    }
  } catch (_) {}
}
fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
  console.log(line.trim());
}

const RAW_KEY =
  process.env.ENCRYPTION_KEY ||
  process.env.BOOTH_CREDENTIAL_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'vintage-vibes-dubai-aes-256-secret-key-2026';

function decryptCred(ct) {
  if (!ct || !String(ct).startsWith('enc:v1:')) return String(ct || '');
  try {
    const p = String(ct).split(':');
    const key = crypto.scryptSync(RAW_KEY, 'vintage-vibes-broadcaster-salt-2026', 32);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p[2], 'hex'));
    d.setAuthTag(Buffer.from(p[3], 'hex'));
    return d.update(p[4], 'hex', 'utf8') + d.final('utf8');
  } catch (_) {
    return '';
  }
}

async function getYouTubeConfigAndToken() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let meta = {};
  let boothStreamKey = '';
  try {
    const ch = await pool.query(
      "SELECT metadata, account_password FROM public.booth_social_channels WHERE id IN ('b1_youtube','booth-1_youtube','b01_youtube') ORDER BY updated_at DESC NULLS LAST LIMIT 1"
    );
    meta = ch.rows[0]?.metadata || {};
    const mKey = decryptCred(meta.streamKey || '').trim();
    const pKey = decryptCred(ch.rows[0]?.account_password || '').trim();
    boothStreamKey = mKey || pKey;
    if (!boothStreamKey) {
      const br = await pool.query(
        "SELECT youtube_stream_key, master_stream_key FROM public.live_stream_booths WHERE booth_id = 'booth-1' LIMIT 1"
      );
      boothStreamKey = decryptCred(br.rows[0]?.youtube_stream_key || br.rows[0]?.master_stream_key || '').trim();
    }

    let oauthToken = String(meta.oauthAccessToken || '').trim();
    const oauthRefreshToken = String(meta.oauthRefreshToken || '').trim();
    const oauthExpiresAt = Number(meta.oauthExpiresAt || 0);

    if (oauthRefreshToken && (!oauthToken || !oauthExpiresAt || Date.now() >= oauthExpiresAt - 90000)) {
      const clientId =
        process.env.GOOGLE_CLIENT_ID || '186959128141-u3m7iv727mlhdnlfskm3ghvjq0b6u95s.apps.googleusercontent.com';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      const refRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: oauthRefreshToken,
          grant_type: 'refresh_token'
        }),
        signal: AbortSignal.timeout(7000)
      });
      if (refRes.ok) {
        const refData = await refRes.json();
        if (refData?.access_token) {
          oauthToken = String(refData.access_token).trim();
          const nextExp = Date.now() + Number(refData.expires_in || 3500) * 1000;
          await pool.query(
            "UPDATE public.booth_social_channels SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE platform = 'youtube'",
            [JSON.stringify({ oauthAccessToken: oauthToken, oauthExpiresAt: nextExp })]
          );
        }
      }
    }

    return {
      oauthToken,
      preferredStreamKey: boothStreamKey,
      rtmpBaseUrl: String(meta.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2').trim().replace(/\/+$/, '')
    };
  } catch (e) {
    log('DB/OAuth lookup warning: ' + e.message);
    return { oauthToken: '', preferredStreamKey: boothStreamKey, rtmpBaseUrl: 'rtmp://a.rtmp.youtube.com/live2' };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function ytApi(token, url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(init.timeoutMs || 8000)
  });
}

let activeBroadcastId = '';
let activeStreamId = '';
let lastStatusCheckAt = 0;

async function ensureYouTubeIngestAndBroadcast() {
  const cfg = await getYouTubeConfigAndToken();
  let baseUrl = cfg.rtmpBaseUrl || 'rtmp://a.rtmp.youtube.com/live2';
  let streamKey = cfg.preferredStreamKey || '';
  const token = cfg.oauthToken;

  if (!token) {
    if (streamKey) return { baseUrl, streamKey, broadcastId: '' };
    return null;
  }

  try {
    // 1. Resolve YouTube liveStream matching preferredStreamKey or reusable stream
    const lsRes = await ytApi(
      token,
      'https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn,contentDetails,status&mine=true&maxResults=25'
    );
    if (lsRes.ok) {
      const lsData = await lsRes.json().catch(() => ({}));
      const items = Array.isArray(lsData.items) ? lsData.items : [];
      const rtmpList = items.filter((s) => s?.cdn?.ingestionType === 'rtmp' && s?.cdn?.ingestionInfo?.streamName);
      const chosen =
        (streamKey && rtmpList.find((s) => s.cdn.ingestionInfo.streamName === streamKey)) ||
        rtmpList.find((s) => String(s?.snippet?.title || '').trim() === 'Vintage Vibes Auto-Live Stream') ||
        rtmpList[0];

      if (chosen) {
        activeStreamId = String(chosen.id || '');
        baseUrl = String(chosen.cdn.ingestionInfo.ingestionAddress || baseUrl).trim().replace(/\/+$/, '');
        streamKey = String(chosen.cdn.ingestionInfo.streamName || streamKey).trim();
      }
    }

    // 2. Find active / testing / ready broadcast or create fresh Public Auto-Start broadcast
    const brRes = await ytApi(
      token,
      'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status,contentDetails&mine=true&broadcastType=all&maxResults=10'
    );
    if (brRes.ok) {
      const brData = await brRes.json().catch(() => ({}));
      const items = Array.isArray(brData.items) ? brData.items : [];
      const recentCutoff = Date.now() - 24 * 3600 * 1000;
      let targetBr =
        items.find(
          (b) =>
            b?.id &&
            ['live', 'liveStarting', 'testing'].includes(String(b?.status?.lifeCycleStatus || '')) &&
            (!activeStreamId || !b?.contentDetails?.boundStreamId || b.contentDetails.boundStreamId === activeStreamId)
        ) ||
        items.find(
          (b) =>
            b?.id &&
            String(b?.status?.lifeCycleStatus || '') === 'ready' &&
            (!activeStreamId || !b?.contentDetails?.boundStreamId || b.contentDetails.boundStreamId === activeStreamId) &&
            (!b?.snippet?.publishedAt || new Date(b.snippet.publishedAt).getTime() >= recentCutoff)
        );

      if (!targetBr && activeStreamId) {
        const dateLabel = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Dubai',
          day: '2-digit',
          month: 'short'
        }).format(new Date());
        const createRes = await ytApi(
          token,
          'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status',
          {
            method: 'POST',
            body: JSON.stringify({
              snippet: {
                title: `Vintage Vibes UAE 🔴 Live Branded Thrift Drop (${dateLabel})`,
                description:
                  '🔥 Live 1-of-1 Authentic Vintage & Branded Streetwear Drop — Vintage Vibes General Trading LLC SPC (Al Ain, UAE)\n⚡ Instant Claim & Zero-Delay Stream: https://vintagevibesgk.com/live/',
                scheduledStartTime: new Date(Date.now() + 10000).toISOString()
              },
              contentDetails: {
                latencyPreference: 'ultraLow',
                enableAutoStart: true,
                enableAutoStop: true,
                enableDvr: true,
                recordFromStart: true
              },
              status: {
                privacyStatus: 'public',
                selfDeclaredMadeForKids: false
              }
            })
          }
        );
        if (createRes.ok) {
          targetBr = await createRes.json().catch(() => null);
          log(`Created fresh Public YouTube Broadcast: https://youtu.be/${targetBr?.id}`);
        }
      }

      if (targetBr?.id) {
        activeBroadcastId = String(targetBr.id);
        if (activeStreamId && targetBr?.contentDetails?.boundStreamId !== activeStreamId) {
          await ytApi(
            token,
            `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${encodeURIComponent(activeBroadcastId)}&part=id,snippet,contentDetails,status&streamId=${encodeURIComponent(activeStreamId)}`,
            { method: 'POST' }
          ).catch(() => {});
        }
        try {
          fs.writeFileSync(
            ACTIVE_YT_FILE,
            JSON.stringify({ broadcastId: activeBroadcastId, url: `https://youtu.be/${activeBroadcastId}`, updatedAt: Date.now() }),
            'utf8'
          );
        } catch (_) {}
        // Sync YouTube Live Chat on main ERP server
        fetch('http://127.0.0.1:3000/api/live/booths/booth-1/youtube-chat/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vv-internal': process.env.INTERNAL_SERVICE_TOKEN || 'local' },
          body: JSON.stringify({ videoUrlOrId: activeBroadcastId }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});
      }
    }
  } catch (e) {
    log('YouTube API check warning: ' + e.message);
  }

  if (!streamKey) return null;
  return { baseUrl, streamKey, broadcastId: activeBroadcastId };
}

async function checkAndPromoteBroadcastToLive() {
  if (!activeBroadcastId || Date.now() - lastStatusCheckAt < 15000) return;
  lastStatusCheckAt = Date.now();
  try {
    const cfg = await getYouTubeConfigAndToken();
    if (!cfg.oauthToken) return;
    const chk = await ytApi(
      cfg.oauthToken,
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,status&id=${encodeURIComponent(activeBroadcastId)}`
    );
    if (!chk.ok) return;
    const data = await chk.json().catch(() => ({}));
    const life = String(data?.items?.[0]?.status?.lifeCycleStatus || '');
    if (life === 'testing') {
      const tr = await ytApi(
        cfg.oauthToken,
        `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${encodeURIComponent(activeBroadcastId)}&part=id,status`,
        { method: 'POST' }
      );
      if (tr.ok) {
        log(`Promoted YouTube Broadcast ${activeBroadcastId} from testing -> LIVE!`);
      }
    } else if (life === 'complete' || life === 'revoked') {
      log(`YouTube Broadcast ${activeBroadcastId} marked ${life}; refreshing broadcast binding...`);
      activeBroadcastId = '';
      await ensureYouTubeIngestAndBroadcast();
    }
  } catch (_) {}
}

function isBooth1HlsFresh() {
  try {
    if (!fs.existsSync(HLS_M3U8)) return false;
    const st = fs.statSync(HLS_M3U8);
    return Date.now() - st.mtimeMs < 18000;
  } catch (_) {
    return false;
  }
}

function isExternalYouTubeFfmpegAlreadyRunning(ownPid) {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'ffmpeg.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf8', windowsHide: true }
    );
    if (!out || !out.trim()) return false;
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (!item || Number(item.ProcessId) === Number(ownPid)) continue;
      const cmd = String(item.CommandLine || '').toLowerCase();
      if (cmd.includes('rtmp.youtube.com')) return true;
    }
  } catch (_) {}
  return false;
}

let childProc = null;
let childStartedAt = 0;

async function mainLoop() {
  log('Started YouTube Auto-Relay Sidecar Watchdog (linked to AI Live Host HLS).');
  while (true) {
    try {
      const hlsFresh = isBooth1HlsFresh();
      if (!hlsFresh) {
        if (childProc) {
          log('Booth-1 AI HLS stopped; terminating YouTube sidecar cleanly.');
          try {
            childProc.kill('SIGTERM');
          } catch (_) {}
          childProc = null;
          activeBroadcastId = '';
        }
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (childProc) {
        if (Date.now() - childStartedAt > 12000) {
          await checkAndPromoteBroadcastToLive();
        }
        await new Promise((r) => setTimeout(r, 6000));
        continue;
      }

      if (!isExternalYouTubeFfmpegAlreadyRunning(0)) {
        const resolved = await ensureYouTubeIngestAndBroadcast();
        if (resolved && resolved.streamKey) {
          const targetUrl = `${resolved.baseUrl}/${resolved.streamKey}`;
          log(
            `Launching zero-reencode YouTube Live relay -> ${resolved.baseUrl}/****${resolved.streamKey.slice(-4)} (broadcast=${resolved.broadcastId || 'auto'})`
          );
          childStartedAt = Date.now();
          childProc = spawn(
            FFMPEG_EXE,
            [
              '-hide_banner',
              '-loglevel',
              'warning',
              '-re',
              '-http_persistent',
              '0',
              '-live_start_index',
              '-2',
              '-i',
              'http://127.0.0.1:3000/api/live/hls/booth-1/index.m3u8',
              '-c:v',
              'copy',
              '-c:a',
              'copy',
              '-flvflags',
              'no_duration_filesize',
              '-f',
              'flv',
              targetUrl
            ],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
          );
          childProc.stderr.on('data', (d) => {
            const s = d
              .toString()
              .replace(/live2\/[A-Za-z0-9_\-?=&]+/g, 'live2/****')
              .trim();
            if (s) log('[YouTubeFFmpeg] ' + s.slice(0, 220));
          });
          childProc.on('exit', (code) => {
            log(`YouTube Live sidecar FFmpeg exited (code=${code}).`);
            childProc = null;
          });
        }
      }
    } catch (e) {
      log('Loop warning: ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
}

mainLoop();

/**
 * Vintage Vibes UAE — Non-Disruptive Facebook RTMPS Sidecar Relay + Official Graph API Auto-Recovery
 *
 * 1) Supports 1-hour temporary stream key (logs/temp_fb_stream.json) with strict auto-shift back to Official API after 1 hour.
 * 2) When Booth-1 is actively streaming (HLS index.m3u8 fresh) and Facebook simulcast is offline (e.g. recovering from Meta #4),
 *    checks Official Meta Graph API (POST /v21.0/me/live_videos) once every 3 minutes so the exact moment Meta's rolling window
 *    drops below 100%, Facebook Live automatically comes LIVE mid-stream with ZERO interruption to YouTube or Website /live/!
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
require('dotenv').config({ path: 'C:\\vintage-vibe\\.env' });
const { Pool } = require('C:\\vintage-vibe\\node_modules\\pg');

const ROOT = 'C:\\vintage-vibe';
const HLS_M3U8 = path.join(ROOT, 'public', 'live_hls', 'booth-1', 'index.m3u8');
const FFMPEG_EXE = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const PID_FILE = path.join(ROOT, 'logs', 'fb_sidecar_relay.pid');
const LOG_FILE = path.join(ROOT, 'logs', 'fb_sidecar_relay.log');
const TEMP_KEY_FILE = path.join(ROOT, 'logs', 'temp_fb_stream.json');
const ACTIVE_LIVE_PUBLIC = path.join(ROOT, 'public', 'fb-active-live.json');
const ACTIVE_LIVE_DIST = path.join(ROOT, 'dist', 'fb-active-live.json');

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
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
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

let lastApiAttemptAt = 0;
let activeSidecarLiveVideoId = '';
let activeSidecarFbToken = '';

async function resolveFacebookIngestKey() {
  // 1. Check 1-hour temporary stream key (auto-expires after 1h -> shifts back to Official API!)
  try {
    if (fs.existsSync(TEMP_KEY_FILE)) {
      const t = JSON.parse(fs.readFileSync(TEMP_KEY_FILE, 'utf8') || '{}');
      if (t.expiresAt && Date.now() >= Number(t.expiresAt)) {
        log('1-hour temporary stream window finished — shifting 100% back to Official Meta Graph API!');
        try { fs.unlinkSync(TEMP_KEY_FILE); } catch (_) {}
      } else if (t.streamKey && String(t.streamKey).trim().length > 10) {
        return { streamKey: String(t.streamKey).trim(), source: 'temp_1hr' };
      }
    }
  } catch (_) {}

  // 2. Check DB saved streamKey OR create Official Meta Graph API Live Video (at most once every 3 mins)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let fbAccessToken = '';
  let fbTargetId = 'me';
  try {
    const ch = await pool.query(
      "SELECT metadata FROM public.booth_social_channels WHERE id IN ('b1_facebook','booth-1_facebook','b01_facebook') ORDER BY updated_at DESC NULLS LAST LIMIT 1"
    );
    const meta = ch.rows[0]?.metadata || {};
    const mKey = decryptCred(meta.streamKey || '').trim();
    if (mKey && mKey.length > 10) {
      await pool.end().catch(() => {});
      return { streamKey: mKey, source: 'db_saved_key' };
    }
    fbAccessToken = decryptCred(meta.fbAccessToken || '').trim();
    fbTargetId = String(meta.fbTargetId || 'me').trim() || 'me';
  } catch (e) {
    log('DB lookup warning: ' + e.message);
  } finally {
    await pool.end().catch(() => {});
  }

  // 3. Official Meta Graph API Auto-Create (throttled to 1 call per 3 minutes = <0.3% quota!)
  if (fbAccessToken && Date.now() - lastApiAttemptAt >= 180000) {
    lastApiAttemptAt = Date.now();
    try {
      const body = new URLSearchParams({
        status: 'LIVE_NOW',
        title: 'Vintage Vibes UAE - Live Sale',
        description:
          '🔥 Vintage Vibes UAE — Original Branded Vintage Apparel Live Sale!\n💬 Comment "MINE + PRICE + ITEM" to Claim!\n👉 Follow our Official Page: https://www.facebook.com/profile.php?id=1436686246201829\n🛍️ Live Room & Checkout: https://vintagevibesgk.com/live/',
        access_token: fbAccessToken
      });
      if (fbTargetId === 'me') {
        body.set('privacy', JSON.stringify({ value: 'EVERYONE' }));
      }
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(fbTargetId)}/live_videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body.toString(),
        signal: AbortSignal.timeout(10000)
      });
      const usage = res.headers.get('x-app-usage') || '';
      const data = await res.json().catch(() => ({}));
      const ingestUrl = String(data?.secure_stream_url || data?.stream_url || '').trim();
      if (res.ok && ingestUrl && data?.id) {
        const idx = ingestUrl.indexOf('/rtmp/');
        const keyPart = idx !== -1 ? ingestUrl.slice(idx + 6) : ingestUrl;
        activeSidecarLiveVideoId = String(data.id);
        activeSidecarFbToken = fbAccessToken;

        // Fetch underlying video{id} so Watch URL & comment sync match immediately
        let publicVideoId = String(data.id);
        try {
          const vr = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(String(data.id))}?fields=id,video{id}&access_token=${encodeURIComponent(fbAccessToken)}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const vj = await vr.json().catch(() => ({}));
          if (vj?.video?.id) publicVideoId = String(vj.video.id);
        } catch (_) {}

        const activePayload = JSON.stringify({
          liveVideoId: String(data.id),
          videoId: publicVideoId,
          isLive: true,
          updatedAt: Date.now()
        });
        try { fs.writeFileSync(ACTIVE_LIVE_PUBLIC, activePayload, 'utf8'); } catch (_) {}
        try { if (fs.existsSync(path.dirname(ACTIVE_LIVE_DIST))) fs.writeFileSync(ACTIVE_LIVE_DIST, activePayload, 'utf8'); } catch (_) {}

        log(`Official Meta Graph API Live Video created (${data.id} / video=${publicVideoId})! Starting mid-stream relay now.`);
        return { streamKey: keyPart, source: 'official_graph_api' };
      } else {
        log(`Official Graph API cooldown check (usage=${usage}): ${data?.error?.message || res.status}`);
      }
    } catch (apiErr) {
      log('Official Graph API check error: ' + apiErr.message);
    }
  }
  return null;
}

async function endSidecarGraphBroadcastIfAny() {
  if (!activeSidecarLiveVideoId || !activeSidecarFbToken) return;
  const id = activeSidecarLiveVideoId;
  const tok = activeSidecarFbToken;
  activeSidecarLiveVideoId = '';
  activeSidecarFbToken = '';
  try {
    await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ end_live_video: 'true', access_token: tok }).toString(),
      signal: AbortSignal.timeout(7000)
    });
    log(`Cleanly ended Official Graph API Facebook Live Video ${id}.`);
  } catch (_) {}
}

function isBooth1HlsFresh() {
  try {
    if (!fs.existsSync(HLS_M3U8)) return false;
    const st = fs.statSync(HLS_M3U8);
    return Date.now() - st.mtimeMs < 15000;
  } catch (_) {
    return false;
  }
}

function isNativeFacebookFfmpegAlreadyRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'ffmpeg.exe\'\\" | Select-Object -ExpandProperty CommandLine"',
      { encoding: 'utf8', windowsHide: true }
    );
    const lines = out.split(/\r?\n/).filter(Boolean);
    for (const ln of lines) {
      if (ln.includes('live_hls') || ln.includes('127.0.0.1:3000/api/live/hls')) continue;
      if (ln.includes('youtube.com') || ln.includes('edgetee-upload')) continue;
      if (ln.includes('facebook.com') || ln.includes('127.0.0.1:')) return true;
    }
  } catch (_) {}
  return false;
}

let tlsPort = 0;
async function ensureLocalFbTlsBridge() {
  if (tlsPort) return tlsPort;
  return new Promise((resolve, reject) => {
    const srv = net.createServer((clientSocket) => {
      clientSocket.pause();
      const tlsSocket = tls.connect(
        { host: 'live-api-s.facebook.com', port: 443, servername: 'live-api-s.facebook.com', rejectUnauthorized: false },
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
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      tlsPort = srv.address().port;
      log(`Local TLS RTMPS bridge active on 127.0.0.1:${tlsPort} -> live-api-s.facebook.com:443`);
      resolve(tlsPort);
    });
  });
}

let childProc = null;

async function mainLoop() {
  log('Started Facebook RTMPS Sidecar + Official Graph API Auto-Recovery Watchdog.');
  while (true) {
    try {
      // Auto-expire 1-hour temporary key even while running if 1 hour elapsed
      if (fs.existsSync(TEMP_KEY_FILE)) {
        try {
          const t = JSON.parse(fs.readFileSync(TEMP_KEY_FILE, 'utf8') || '{}');
          if (t.expiresAt && Date.now() >= Number(t.expiresAt)) {
            log('1-hour temporary key expired — shifting back to Official Meta Graph API mode!');
            fs.unlinkSync(TEMP_KEY_FILE);
            if (childProc) {
              try { childProc.kill('SIGTERM'); } catch (_) {}
              childProc = null;
            }
          }
        } catch (_) {}
      }

      const hlsFresh = isBooth1HlsFresh();
      if (!hlsFresh) {
        if (childProc) {
          log('Booth-1 HLS stopped; terminating Facebook sidecar cleanly.');
          try { childProc.kill('SIGTERM'); } catch (_) {}
          childProc = null;
          await endSidecarGraphBroadcastIfAny();
        }
        await new Promise((r) => setTimeout(r, 6000));
        continue;
      }

      if (!childProc && !isNativeFacebookFfmpegAlreadyRunning()) {
        const resolved = await resolveFacebookIngestKey();
        if (resolved && resolved.streamKey) {
          const cleanKey = resolved.streamKey.replace(/^rtmps?:\/\/[^/]+\/rtmp\//i, '');
          const port = await ensureLocalFbTlsBridge();
          const targetUrl = `rtmp://127.0.0.1:${port}/rtmp/${cleanKey}`;
          log(`Launching zero-reencode Facebook RTMPS sidecar (source=${resolved.source})...`);
          childProc = spawn(
            FFMPEG_EXE,
            [
              '-hide_banner',
              '-loglevel', 'warning',
              '-re',
              '-live_start_index', '-2',
              '-i', 'http://127.0.0.1:3000/api/live/hls/booth-1/index.m3u8',
              '-c:v', 'copy',
              '-c:a', 'copy',
              '-flvflags', 'no_duration_filesize',
              '-f', 'flv',
              targetUrl
            ],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
          );
          childProc.stderr.on('data', (d) => {
            const s = d.toString().replace(/rtmp\/[A-Za-z0-9_\-?=&]+/g, 'rtmp/***').trim();
            if (s) log('[SidecarFFmpeg] ' + s.slice(0, 220));
          });
          childProc.on('exit', (code) => {
            log(`Facebook RTMPS sidecar exited (code=${code}).`);
            childProc = null;
          });
        }
      }
    } catch (e) {
      log('Loop warning: ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
}

mainLoop();

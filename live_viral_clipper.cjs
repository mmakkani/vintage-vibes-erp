/**
 * Vintage Vibes UAE — Engine #1: Auto Live-Stream Viral Clipper (20-Second Real Human Clips)
 * Runs every 5 minutes via Windows Task Scheduler (VintageVibes-LiveViralClipper):
 * - WHILE LIVE STREAM IS ACTIVE: Pure zero-CPU file copy of 10 consecutive HLS .m2ts segments (20s of real host video + voice!)
 *   up to 3 distinct clips per broadcast session (spaced >= 12 mins apart).
 * - AFTER LIVE STREAM ENDS (0 ffmpeg running): Overlays Official Gold Seal + "ONLY AED <price> IN UAE! COMMENT 'SHOP'!"
 *   frame (-threads 2) and publishes across Facebook Official Page + Instagram Reels + YouTube Shorts!
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, publishVideoTriplePlatform } = require('./triple_platform_publisher.cjs');

const HLS_DIR = path.join(ROOT, 'public', 'live_hls', 'booth-1');
const RAW_CAP_DIR = path.join(ROOT, 'logs', 'raw_live_captures');
const OUT_DIR = path.join(ROOT, 'public', 'uploads', 'live_viral_clips');
const DIST_OUT_DIR = path.join(ROOT, 'dist', 'uploads', 'live_viral_clips');
const STATE_FILE = path.join(ROOT, 'logs', 'live_clipper_state.json');
const OVERLAY_PNG = path.join(ROOT, 'logs', 'live_clip_frame_overlay.png');
const LOG_FILE = path.join(ROOT, 'logs', 'live_viral_clipper.log');
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.log(line.trim());
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {}
  return { sessionStartAt: 0, clipsInCurrentSession: 0, lastCaptureAt: 0, totalPublished: 0 };
}

function saveState(st) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2)); } catch (_) {}
}

async function ensureOverlayPng() {
  if (fs.existsSync(OVERLAY_PNG) && fs.statSync(OVERLAY_PNG).size > 5000) return OVERLAY_PNG;
  const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer'));
  const logoPath = path.join(ROOT, 'public', 'app-icon.png');
  const logoUri = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : '';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI Black','Segoe UI',Arial,sans-serif;}
      html,body{width:1080px;height:1920px;background:transparent;display:flex;flex-direction:column;justify-content:space-between;padding:42px 36px;}
      .top{display:flex;align-items:center;justify-content:space-between;background:rgba(10,12,20,0.88);border:3px solid #f5c451;border-radius:26px;padding:18px 24px;}
      .left{display:flex;align-items:center;gap:16px;}
      .logo{width:76px;height:76px;border-radius:50%;border:2px solid #f5c451;object-fit:cover;}
      .t1{font-size:30px;font-weight:900;color:#fde68a;}
      .t2{font-size:19px;font-weight:800;color:#34d399;margin-top:2px;}
      .live-pill{background:#e11d48;color:#fff;font-size:22px;font-weight:900;padding:10px 20px;border-radius:999px;}
      .bot{background:rgba(10,12,20,0.9);border:3px solid #f5c451;border-radius:26px;padding:20px 26px;text-align:center;}
      .hook{font-size:31px;font-weight:900;color:#fde68a;}
      .sub{font-size:22px;font-weight:800;color:#fff;margin-top:6px;}
      .leg{font-size:16px;font-weight:600;color:#cbd5e1;margin-top:6px;}
    </style></head><body>
      <div class="top">
        <div class="left">
          ${logoUri ? `<img class="logo" src="${logoUri}"/>` : ''}
          <div>
            <div class="t1">VINTAGE VIBES UAE</div>
            <div class="t2">♻️ PRE-LOVED THRIFT LIVE HIGHLIGHT</div>
          </div>
        </div>
        <div class="live-pill">AED 15–45</div>
      </div>
      <div class="bot">
        <div class="hook">💬 COMMENT "SHOP" FOR DIRECT LINK &amp; FOLLOW!</div>
        <div class="sub">🌐 vintagevibesgk.com &nbsp;|&nbsp; 📱 WhatsApp +971 55 418 6086</div>
        <div class="leg">Vintage Vibes General Trading L.L.C-S.P.C — Independent Pre-Loved Thrift Store UAE</div>
      </div>
    </body></html>`;
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    await page.screenshot({ path: OVERLAY_PNG, omitBackground: true });
  } finally {
    await browser.close().catch(() => {});
  }
  return OVERLAY_PNG;
}

async function main() {
  fs.mkdirSync(RAW_CAP_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'dist', 'uploads'))) {
    fs.mkdirSync(DIST_OUT_DIR, { recursive: true });
  }

  // Check if booth-1 is currently streaming live
  let isLive = false;
  let dealPrice = 25;
  let onAirSku = '';
  try {
    const r = await fetch('http://127.0.0.1:3000/api/live/booths', { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const b1 = (j.booths || []).find((b) => b.boothId === 'booth-1');
    if (b1 && b1.isBroadcasting) {
      isLive = true;
      if (b1.currentDealPrice > 0) dealPrice = b1.currentDealPrice;
      if (b1.activeOnAirSku) onAirSku = b1.activeOnAirSku;
    }
  } catch (_) {}

  const state = loadState();

  // MODE A: LIVE STREAM ACTIVE -> ZERO-CPU SEGMENT COPY ONLY!
  if (isLive && fs.existsSync(HLS_DIR)) {
    if (Date.now() - state.lastCaptureAt > 3 * 3600 * 1000) {
      state.clipsInCurrentSession = 0;
      state.sessionStartAt = Date.now();
    }
    // Space captures >= 12 minutes apart, max 3 per live stream session
    if (state.clipsInCurrentSession < 3 && Date.now() - state.lastCaptureAt >= 12 * 60 * 1000) {
      const segs = fs
        .readdirSync(HLS_DIR)
        .filter((f) => /^seg_\d+\.m2ts$/i.test(f))
        .map((f) => ({ name: f, full: path.join(HLS_DIR, f), mtime: fs.statSync(path.join(HLS_DIR, f)).mtimeMs }))
        .filter((s) => Date.now() - s.mtime < 45000)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (segs.length >= 8) {
        // Copy 8 completed segments (~16-20s of real human video + voice!) excluding the very last still-writing segment
        const chosen = segs.slice(Math.max(0, segs.length - 9), segs.length - 1);
        const capId = `cap_${Date.now()}`;
        const destFolder = path.join(RAW_CAP_DIR, capId);
        fs.mkdirSync(destFolder, { recursive: true });
        for (const s of chosen) {
          fs.copyFileSync(s.full, path.join(destFolder, s.name));
        }
        fs.writeFileSync(path.join(destFolder, 'meta.json'), JSON.stringify({ capturedAt: Date.now(), dealPrice, onAirSku }));
        state.clipsInCurrentSession += 1;
        state.lastCaptureAt = Date.now();
        saveState(state);
        log(`Harvested zero-CPU live clip ${capId} (${chosen.length} segments, AED ${dealPrice} ${onAirSku})`);
      }
    }
    return;
  }

  // MODE B: STREAM OFFLINE -> RENDER & PUBLISH 1 QUEUED HUMAN CLIP PER RUN (-threads 2)!
  if (isLive) return;
  state.clipsInCurrentSession = 0;
  saveState(state);

  const pendingFolders = fs
    .readdirSync(RAW_CAP_DIR)
    .filter((d) => d.startsWith('cap_') && fs.statSync(path.join(RAW_CAP_DIR, d)).isDirectory())
    .sort();

  if (pendingFolders.length === 0) return;

  const folder = path.join(RAW_CAP_DIR, pendingFolders[0]);
  const segFiles = fs.readdirSync(folder).filter((f) => f.endsWith('.m2ts')).sort();
  if (segFiles.length < 4) {
    fs.rmSync(folder, { recursive: true, force: true });
    return;
  }

  let meta = { dealPrice: 25, onAirSku: '' };
  try { meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8')); } catch (_) {}

  await ensureOverlayPng();
  const stamp = Date.now();
  const concatList = path.join(folder, 'list.txt');
  fs.writeFileSync(concatList, segFiles.map((f) => `file '${path.join(folder, f).replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

  const outName = `vv_live_highlight_${stamp}.mp4`;
  const outPath = path.join(OUT_DIR, outName);

  const ff = spawnSync(FFMPEG, [
    '-y', '-threads', '2',
    '-f', 'concat', '-safe', '0', '-i', concatList,
    '-i', OVERLAY_PNG,
    '-filter_complex', '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[bg];[bg][1:v]overlay=0:0,format=yuv420p[v]',
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', '22', '-movflags', '+faststart',
    outPath
  ], { encoding: 'utf8' });

  fs.rmSync(folder, { recursive: true, force: true });

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 25000) {
    log('FFmpeg render skipped/failed: ' + (ff.stderr || '').slice(-300));
    return;
  }
  if (fs.existsSync(DIST_OUT_DIR)) {
    fs.copyFileSync(outPath, path.join(DIST_OUT_DIR, outName));
  }

  const priceTag = meta.dealPrice || 25;
  const title = `🔥 AED ${priceTag} Pre-Loved Live Steal in UAE?! Comment "SHOP" Below! #Shorts`;
  const caption =
    `🔥 Real Live Thrift Highlight — Only AED ${priceTag} at Vintage Vibes UAE! ♻️\n\n` +
    `💬 COMMENT "SHOP" below & FOLLOW our page — our bot will send you the direct catalogue & WhatsApp order link in 1 second!\n\n` +
    `🔴 Join Next Live Drop: https://vintagevibesgk.com/live/\n` +
    `🛒 Shop 700+ 1-of-1 Pieces: https://vintagevibesgk.com/\n` +
    `📱 WhatsApp Direct: https://wa.me/971554186086\n` +
    `⭐ All Official Pages: https://vintagevibesgk.com/follow/\n\n` +
    `#VintageVibesUAE #ThriftUAE #DubaiThrift #UkayUkayUAE #PreLovedUAE #Shorts\n` +
    `(Vintage Vibes General Trading L.L.C-S.P.C — Independent Second-Hand Thrift Store UAE)`;
  const firstComment =
    `👇 Shop Direct or Join Our Next AED 15–25 Live Drop:\n` +
    `🛒 Website: https://vintagevibesgk.com/\n` +
    `🔴 Live Room: https://vintagevibesgk.com/live/\n` +
    `💬 WhatsApp: https://wa.me/971554186086`;

  const res = await publishVideoTriplePlatform({
    localFilePath: outPath,
    publicVideoUrl: `https://vintagevibesgk.com/uploads/live_viral_clips/${outName}?t=${stamp}`,
    title,
    caption,
    firstComment
  });

  state.totalPublished = (state.totalPublished || 0) + 1;
  saveState(state);
  log(`Published Live Human Highlight ${outName}: ${JSON.stringify(res)}`);
}

main().catch((e) => {
  log('ERR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

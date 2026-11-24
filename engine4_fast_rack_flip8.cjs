/**
 * Vintage Vibes UAE — Engine #4: Automated "12-Second 8-Piece Fast Rack Flip" Video Reel + Upbeat Music
 * Runs daily at 4:30 PM UAE Time via Windows Task Scheduler (VintageVibes-Engine4-RackFlip8).
 * Pure Video Reel + Upbeat Studio Streetwear Beat (Zero Urdu, Zero robotic TTS) — publishes directly to FB + IG + YT!
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, loadEnv, publishVideoTriplePlatform } = require('./triple_platform_publisher.cjs');
const { pickRandomBgmTrack } = require('./generate_bgm_tracks.cjs');

const OUT_DIR = path.join(ROOT, 'public', 'uploads', 'daily_reels');
const DIST_OUT_DIR = path.join(ROOT, 'dist', 'uploads', 'daily_reels');
const HISTORY_FILE = path.join(ROOT, 'logs', 'engine4_rackflip8_skus.json');
const LOG_FILE = path.join(ROOT, 'logs', 'engine4_rackflip8.log');
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.log(line.trim());
}

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

async function resolveImageDataUri(imgUrl) {
  if (!imgUrl) return null;
  const raw = String(imgUrl).trim();
  const relClean = raw
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/storage\/v1\/object\/public\//i, 'uploads/')
    .replace(/^\//, '')
    .replace(/\//g, '\\');
  for (const base of [path.join(ROOT, 'public'), path.join(ROOT, 'dist'), ROOT]) {
    const cand = path.join(base, relClean);
    if (fs.existsSync(cand) && fs.statSync(cand).size > 2000) return toDataUri(cand);
  }
  try {
    const fullUrl = raw.startsWith('http') ? raw : `http://127.0.0.1:3000${raw.startsWith('/') ? '' : '/'}${raw}`;
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2000) return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
    }
  } catch (_) {}
  return null;
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'dist', 'uploads'))) fs.mkdirSync(DIST_OUT_DIR, { recursive: true });

  let postedSkus = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) postedSkus = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) || [];
  } catch (_) {}

  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer'));

  const db = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/vintage_vibe' });
  await db.connect();
  const q = await db.query(`
    SELECT sku, item_name, sub_category, size_scanned, retail_price_aed, front_image_url
    FROM public.inventory_pieces
    WHERE status = 'IN_STOCK'
      AND COALESCE(retail_price_aed, 0) >= 15
      AND front_image_url IS NOT NULL
      AND front_image_url <> ''
      AND LOWER(COALESCE(item_name, '')) NOT LIKE '%replica%'
      AND LOWER(COALESCE(item_name, '')) NOT LIKE '%copy%'
    ORDER BY RANDOM()
    LIMIT 120
  `);
  await db.end();

  const candidates = [];
  for (const r of q.rows) {
    const code = String(r.sku || '').trim();
    if (!code || postedSkus.includes(code)) continue;
    const imgUri = await resolveImageDataUri(r.front_image_url);
    if (!imgUri) continue;
    candidates.push({
      sku: code,
      category: String(r.sub_category || 'Vintage').trim(),
      size: String(r.size_scanned || 'L').trim(),
      price: Math.round(Number(r.retail_price_aed || 25)),
      imgUri
    });
    if (candidates.length >= 8) break;
  }

  if (candidates.length < 5) {
    postedSkus = [];
    if (candidates.length === 0) return;
  }

  const stamp = Date.now();
  const logoPath = path.join(ROOT, 'public', 'app-icon.png');
  const logoUri = fs.existsSync(logoPath) ? toDataUri(logoPath) : '';
  const slideFiles = [];

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    for (let i = 0; i < candidates.length; i++) {
      const it = candidates[i];
      const num = i + 1;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI Black','Segoe UI',Arial,sans-serif;}
        body{width:1080px;height:1920px;background:radial-gradient(circle at 50% 25%,#291915 0%,#090b12 70%);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:46px 44px;}
        .top{display:flex;align-items:center;justify-content:space-between;background:rgba(12,15,24,0.95);border:3px solid #f5c451;border-radius:26px;padding:18px 24px;}
        .brand{display:flex;align-items:center;gap:16px;}
        .logo{width:80px;height:80px;border-radius:50%;border:3px solid #f5c451;object-fit:cover;}
        .btitle{font-size:32px;font-weight:900;color:#fde68a;}
        .bsub{font-size:18px;font-weight:800;color:#34d399;margin-top:3px;}
        .fast-pill{background:#f59e0b;color:#090b12;font-size:22px;font-weight:900;padding:10px 20px;border-radius:999px;}
        .question{background:#e11d48;color:#fff;font-size:31px;font-weight:900;text-align:center;padding:15px 20px;border-radius:20px;letter-spacing:0.4px;}
        .frame{position:relative;width:992px;height:1180px;border-radius:36px;overflow:hidden;border:5px solid #f5c451;background:#111520;display:flex;align-items:center;justify-content:center;box-shadow:0 28px 60px rgba(0,0,0,0.7);}
        .garment{width:100%;height:100%;object-fit:cover;}
        .giant-num{position:absolute;top:24px;left:24px;width:130px;height:130px;border-radius:50%;background:#e11d48;border:5px solid #fff;color:#fff;font-size:66px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px rgba(0,0,0,0.65);}
        .price-tag{position:absolute;top:28px;right:28px;background:linear-gradient(135deg,#fde68a,#f59e0b);color:#090b12;font-size:54px;font-weight:900;padding:14px 32px;border-radius:24px;box-shadow:0 14px 32px rgba(0,0,0,0.6);}
        .cat-pill{position:absolute;bottom:24px;left:24px;right:24px;background:rgba(9,11,18,0.92);border:2px solid #f5c451;color:#fde68a;font-size:27px;font-weight:800;padding:14px 24px;border-radius:20px;text-align:center;}
        .foot{background:rgba(12,15,24,0.95);border:3px solid #f5c451;border-radius:26px;padding:20px 26px;text-align:center;}
        .cta{font-size:31px;font-weight:900;color:#fde68a;}
        .subcta{font-size:22px;font-weight:800;color:#34d399;margin-top:6px;}
        .legal{font-size:16px;font-weight:600;color:#94a3b8;margin-top:6px;}
      </style></head><body>
        <div class="top">
          <div class="brand">
            ${logoUri ? `<img class="logo" src="${logoUri}"/>` : ''}
            <div>
              <div class="btitle">VINTAGE VIBES UAE</div>
              <div class="bsub">♻️ PRE-LOVED THRIFT • 12s RACK FLIP</div>
            </div>
          </div>
          <div class="fast-pill">1-OF-1</div>
        </div>
        <div class="question">WHICH ONE WOULD YOU WEAR? #1 TO #${candidates.length}? 🔥</div>
        <div class="frame">
          <img class="garment" src="${it.imgUri}"/>
          <div class="giant-num">#${num}</div>
          <div class="price-tag">AED ${it.price}</div>
          <div class="cat-pill">PIECE #${num} • ${it.category.toUpperCase()} • SIZE ${it.size}</div>
        </div>
        <div class="foot">
          <div class="cta">👇 COMMENT YOUR FAVORITE # OR "SHOP" &amp; FOLLOW!</div>
          <div class="subcta">🌐 vintagevibesgk.com &nbsp;|&nbsp; 📱 WhatsApp +971 55 418 6086</div>
          <div class="legal">Vintage Vibes General Trading L.L.C-S.P.C — Independent Second-Hand Thrift Store UAE</div>
        </div>
      </body></html>`;

      await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
      const sp = path.join(OUT_DIR, `rf8_${stamp}_${i}.png`);
      await page.screenshot({ path: sp, type: 'png' });
      slideFiles.push(sp);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const minP = Math.min(...candidates.map((c) => c.price));
  const maxP = Math.max(...candidates.map((c) => c.price));
  const bgmFile = pickRandomBgmTrack();

  const listFile = path.join(OUT_DIR, `list_rf8_${stamp}.txt`);
  const lines = [];
  for (const sf of slideFiles) {
    lines.push(`file '${sf.replace(/'/g, "'\\''")}'`);
    lines.push('duration 1.5');
  }
  lines.push(`file '${slideFiles[slideFiles.length - 1].replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listFile, lines.join('\n'), 'utf8');

  const reelName = `vv_8piece_music_flip_${stamp}.mp4`;
  const reelOut = path.join(OUT_DIR, reelName);
  const totalSec = Math.round(candidates.length * 1.5 * 10) / 10;
  const fadeOutStart = Math.max(1, totalSec - 1.2);

  const ff = spawnSync(FFMPEG, [
    '-y', '-threads', '2',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', bgmFile,
    '-vf', 'fps=30,format=yuv420p',
    '-af', `afade=t=in:st=0:d=0.35,afade=t=out:st=${fadeOutStart}:d=1.2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '160k',
    '-t', String(totalSec),
    '-movflags', '+faststart',
    reelOut
  ], { encoding: 'utf8' });

  for (const sf of slideFiles) { try { fs.unlinkSync(sf); } catch (_) {} }
  try { fs.unlinkSync(listFile); } catch (_) {}

  if (!fs.existsSync(reelOut) || fs.statSync(reelOut).size < 15000) {
    throw new Error('FFmpeg failed: ' + (ff.stderr || '').slice(-300));
  }
  if (fs.existsSync(DIST_OUT_DIR)) fs.copyFileSync(reelOut, path.join(DIST_OUT_DIR, reelName));

  const title = `⚡ 12-Second UAE Thrift Rack Flip (#1 to #${candidates.length}) — Which One Is Best?! #Shorts`;
  const caption =
    `⚡ 12-SECOND FAST RACK FLIP: Piece #1 to #${candidates.length} (AED ${minP}–${maxP})! 🔥\n` +
    `Which piece would you wear in Dubai/UAE? Vote 1–${candidates.length} or comment "SHOP" below! 👇♻️\n\n` +
    candidates.map((c, idx) => `#${idx + 1}: ${c.category} (${c.size}) — AED ${c.price}`).join('\n') +
    `\n\n🛒 Shop 700+ 1-of-1 Pieces: https://vintagevibesgk.com/\n📱 WhatsApp: https://wa.me/971554186086\n⭐ Follow All Official Pages: https://vintagevibesgk.com/follow/\n\n#VintageVibesUAE #ThriftUAE #DubaiThrift #StreetwearUAE #PreLovedUAE #Shorts\n(Vintage Vibes General Trading L.L.C-S.P.C — Independent Pre-Loved Thrift Store UAE)`;

  const firstComment = `👇 Vote 1–${candidates.length} or comment "SHOP" for instant reply!\n🛍️ Full Vault: https://vintagevibesgk.com/\n💬 WhatsApp: https://wa.me/971554186086`;

  const pubRes = await publishVideoTriplePlatform({
    localFilePath: reelOut,
    publicVideoUrl: `https://vintagevibesgk.com/uploads/daily_reels/${reelName}?t=${stamp}`,
    title,
    caption,
    firstComment
  });

  postedSkus.push(...candidates.map((c) => c.sku));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(postedSkus.slice(-500), null, 2));
  log(`Engine #4 Music Reel Published (${reelName}): ${JSON.stringify(pubRes)}`);
}

main().catch((e) => {
  log('ERR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

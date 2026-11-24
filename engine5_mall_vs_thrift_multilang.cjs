/**
 * Vintage Vibes UAE — Engine #5: "UAE Mall Retail AED 450 vs Vintage Vibes 3-Piece Outfit" Video Reel + Upbeat Music
 * Runs daily at 10:00 PM UAE Prime Time via Windows Task Scheduler (VintageVibes-Engine5-MallVsThrift).
 * Pure Video Reel + Upbeat Studio Music (Zero Urdu, Clean International UAE English + Kabayan/Streetwear Appeal) —
 * publishes directly to Official Facebook Page Reels + Instagram Reels + YouTube Shorts!
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, loadEnv, publishVideoTriplePlatform } = require('./triple_platform_publisher.cjs');
const { pickRandomBgmTrack } = require('./generate_bgm_tracks.cjs');

const OUT_DIR = path.join(ROOT, 'public', 'uploads', 'daily_reels');
const DIST_OUT_DIR = path.join(ROOT, 'dist', 'uploads', 'daily_reels');
const STATE_FILE = path.join(ROOT, 'logs', 'engine5_outfit_state.json');
const LOG_FILE = path.join(ROOT, 'logs', 'engine5_multilang.log');
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

  let state = { usedSkus: [] };
  try {
    if (fs.existsSync(STATE_FILE)) state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (_) {}

  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer'));

  const db = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/vintage_vibe' });
  await db.connect();

  const pickPiece = async (catFilter) => {
    const r = await db.query(`
      SELECT sku, item_name, sub_category, size_scanned, retail_price_aed, front_image_url
      FROM public.inventory_pieces
      WHERE status = 'IN_STOCK'
        AND COALESCE(retail_price_aed, 0) BETWEEN 15 AND 45
        AND front_image_url IS NOT NULL AND front_image_url <> ''
        AND LOWER(COALESCE(item_name, '')) NOT LIKE '%replica%'
        AND LOWER(COALESCE(item_name, '')) NOT LIKE '%copy%'
        AND (${catFilter})
      ORDER BY RANDOM()
      LIMIT 25
    `);
    for (const row of r.rows) {
      if (state.usedSkus.includes(row.sku)) continue;
      const imgUri = await resolveImageDataUri(row.front_image_url);
      if (imgUri) {
        return {
          sku: row.sku,
          category: String(row.sub_category || 'Vintage').trim(),
          size: String(row.size_scanned || 'L').trim(),
          price: Math.round(Number(row.retail_price_aed || 30)),
          imgUri
        };
      }
    }
    return null;
  };

  const p1 = await pickPiece("sub_category IN ('Jackets & Outerwear', 'Hoodies & Sweatshirts', 'Vests & Gilets')");
  const p2 = await pickPiece("sub_category IN ('Sportswear & Jerseys', 'Graphic & Band Tees', 'Polo Shirts')");
  const p3 = await pickPiece("sub_category IN ('T-Shirts', 'Shirts', 'Pants & Denim')");
  await db.end();

  const outfit = [p1, p2, p3].filter(Boolean);
  if (outfit.length < 3) {
    state.usedSkus = [];
    if (outfit.length === 0) return;
  }

  const totalThriftAed = outfit.reduce((s, x) => s + x.price, 0);
  const mallCompareAed = 450;
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

    // Slide 0: Hero Mall AED 450 vs Vintage Vibes 3-Piece Outfit Collage
    const heroHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI Black','Segoe UI',Arial,sans-serif;}
      body{width:1080px;height:1920px;background:radial-gradient(circle at 50% 25%,#231b10 0%,#080a11 70%);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:44px 42px;}
      .top{display:flex;align-items:center;gap:18px;background:rgba(14,18,28,0.95);border:3px solid #f5c451;border-radius:26px;padding:18px 24px;}
      .logo{width:78px;height:78px;border-radius:50%;border:3px solid #f5c451;object-fit:cover;}
      .t1{font-size:29px;font-weight:900;color:#fde68a;}
      .t2{font-size:19px;font-weight:800;color:#34d399;margin-top:4px;}
      .vs-box{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
      .mall{background:rgba(127,29,29,0.55);border:3px solid #ef4444;border-radius:24px;padding:20px;text-align:center;}
      .vv{background:rgba(6,95,70,0.65);border:3px solid #10b981;border-radius:24px;padding:20px;text-align:center;}
      .lbl{font-size:22px;font-weight:800;opacity:0.92;}
      .bad-p{font-size:52px;font-weight:900;color:#fca5a5;text-decoration:line-through;margin-top:6px;}
      .good-p{font-size:54px;font-weight:900;color:#fde68a;margin-top:6px;}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;height:930px;}
      .card{position:relative;border-radius:26px;overflow:hidden;border:3px solid #f5c451;background:#111520;}
      .card img{width:100%;height:100%;object-fit:cover;}
      .cp{position:absolute;bottom:14px;left:10px;right:10px;background:rgba(9,11,18,0.92);border:2px solid #f5c451;color:#fde68a;font-size:24px;font-weight:900;padding:8px;border-radius:14px;text-align:center;}
      .hook{background:#f59e0b;color:#080a11;font-size:29px;font-weight:900;padding:14px 20px;border-radius:20px;text-align:center;}
      .foot{background:rgba(14,18,28,0.95);border:3px solid #f5c451;border-radius:26px;padding:20px 24px;text-align:center;}
      .cta{font-size:30px;font-weight:900;color:#fde68a;}
      .sub{font-size:22px;font-weight:800;color:#34d399;margin-top:6px;}
      .leg{font-size:16px;font-weight:600;color:#94a3b8;margin-top:6px;}
    </style></head><body>
      <div class="top">
        ${logoUri ? `<img class="logo" src="${logoUri}"/>` : ''}
        <div>
          <div class="t1">UAE OUTFIT CHALLENGE 🇦🇪🔥</div>
          <div class="t2">♻️ VINTAGE VIBES • 100% PRE-LOVED THRIFT</div>
        </div>
      </div>
      <div class="hook">WHY PAY AED ${mallCompareAed} AT THE MALL?!</div>
      <div class="vs-box">
        <div class="mall"><div class="lbl">❌ MALL RETAIL</div><div class="bad-p">AED ${mallCompareAed}+</div></div>
        <div class="vv"><div class="lbl">✅ FULL 3-PC THRIFT</div><div class="good-p">AED ${totalThriftAed}!</div></div>
      </div>
      <div class="grid3">
        ${outfit.map((it) => `<div class="card"><img src="${it.imgUri}"/><div class="cp">AED ${it.price}</div></div>`).join('')}
      </div>
      <div class="foot">
        <div class="cta">💬 COMMENT "SHOP" FOR DIRECT LINK &amp; FOLLOW!</div>
        <div class="sub">🌐 vintagevibesgk.com &nbsp;|&nbsp; 📱 WhatsApp +971 55 418 6086</div>
        <div class="leg">Vintage Vibes General Trading L.L.C-S.P.C — Independent Pre-Loved Thrift Store UAE</div>
      </div>
    </body></html>`;
    await page.setContent(heroHtml, { waitUntil: 'load', timeout: 20000 });
    const heroFile = path.join(OUT_DIR, `mvt_${stamp}_0.png`);
    await page.screenshot({ path: heroFile, type: 'png' });
    slideFiles.push({ file: heroFile, dur: 3.6 });

    for (let i = 0; i < outfit.length; i++) {
      const it = outfit[i];
      const itemHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI Black','Segoe UI',Arial,sans-serif;}
        body{width:1080px;height:1920px;background:radial-gradient(circle at 50% 25%,#231b10 0%,#080a11 70%);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:46px 42px;}
        .top{display:flex;align-items:center;justify-content:space-between;background:rgba(14,18,28,0.95);border:3px solid #f5c451;border-radius:26px;padding:18px 24px;}
        .brand{display:flex;align-items:center;gap:16px;}
        .logo{width:76px;height:76px;border-radius:50%;border:3px solid #f5c451;object-fit:cover;}
        .t1{font-size:29px;font-weight:900;color:#fde68a;}
        .t2{font-size:18px;font-weight:800;color:#34d399;}
        .step{background:#10b981;color:#052e16;font-size:24px;font-weight:900;padding:10px 22px;border-radius:999px;}
        .frame{position:relative;width:996px;height:1240px;border-radius:36px;overflow:hidden;border:5px solid #f5c451;background:#111520;}
        .frame img{width:100%;height:100%;object-fit:cover;}
        .ptag{position:absolute;top:28px;right:28px;background:linear-gradient(135deg,#fde68a,#f59e0b);color:#080a11;font-size:56px;font-weight:900;padding:14px 34px;border-radius:24px;}
        .cpill{position:absolute;bottom:26px;left:26px;right:26px;background:rgba(9,11,18,0.92);border:2px solid #f5c451;color:#fde68a;font-size:27px;font-weight:800;padding:14px 22px;border-radius:20px;text-align:center;}
        .foot{background:rgba(14,18,28,0.95);border:3px solid #f5c451;border-radius:26px;padding:20px 24px;text-align:center;}
        .cta{font-size:30px;font-weight:900;color:#fde68a;}
        .sub{font-size:22px;font-weight:800;color:#34d399;margin-top:6px;}
      </style></head><body>
        <div class="top">
          <div class="brand">
            ${logoUri ? `<img class="logo" src="${logoUri}"/>` : ''}
            <div><div class="t1">3-PC OUTFIT: AED ${totalThriftAed}</div><div class="t2">♻️ PRE-LOVED THRIFT UAE</div></div>
          </div>
          <div class="step">PIECE ${i + 1} / ${outfit.length}</div>
        </div>
        <div class="frame">
          <img src="${it.imgUri}"/>
          <div class="ptag">AED ${it.price}</div>
          <div class="cpill">${it.category.toUpperCase()} • SIZE ${it.size} • #${it.sku}</div>
        </div>
        <div class="foot">
          <div class="cta">💬 COMMENT "SHOP" FOR DIRECT LINK &amp; FOLLOW!</div>
          <div class="sub">🌐 vintagevibesgk.com &nbsp;|&nbsp; 📱 WhatsApp +971 55 418 6086</div>
        </div>
      </body></html>`;
      await page.setContent(itemHtml, { waitUntil: 'load', timeout: 20000 });
      const sf = path.join(OUT_DIR, `mvt_${stamp}_${i + 1}.png`);
      await page.screenshot({ path: sf, type: 'png' });
      slideFiles.push({ file: sf, dur: 3.0 });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const bgmFile = pickRandomBgmTrack();
  const listFile = path.join(OUT_DIR, `list_mvt_${stamp}.txt`);
  const lines = [];
  for (const s of slideFiles) {
    lines.push(`file '${s.file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${s.dur}`);
  }
  lines.push(`file '${slideFiles[slideFiles.length - 1].file.replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listFile, lines.join('\n'), 'utf8');

  const reelName = `vv_outfit_challenge_music_${stamp}.mp4`;
  const reelOut = path.join(OUT_DIR, reelName);
  const totalSec = 12.6;
  const fadeOutStart = 11.4;

  const ff = spawnSync(FFMPEG, [
    '-y', '-threads', '2',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', bgmFile,
    '-vf', 'fps=30,format=yuv420p',
    '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=1.2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '160k',
    '-t', String(totalSec),
    '-movflags', '+faststart',
    reelOut
  ], { encoding: 'utf8' });

  for (const s of slideFiles) { try { fs.unlinkSync(s.file); } catch (_) {} }
  try { fs.unlinkSync(listFile); } catch (_) {}

  if (!fs.existsSync(reelOut) || fs.statSync(reelOut).size < 15000) {
    throw new Error('FFmpeg failed: ' + (ff.stderr || '').slice(-300));
  }
  if (fs.existsSync(DIST_OUT_DIR)) fs.copyFileSync(reelOut, path.join(DIST_OUT_DIR, reelName));

  const title = `🔥 UAE Outfit Challenge: Mall AED ${mallCompareAed} vs Vintage Vibes AED ${totalThriftAed} (3-Piece Pre-Loved!) #Shorts`;
  const caption =
    `🔥 UAE OUTFIT CHALLENGE: Why spend AED ${mallCompareAed}+ at the mall when you can rock a FULL 3-Piece 1-of-1 Pre-Loved Outfit for just AED ${totalThriftAed} at Vintage Vibes UAE?! ♻️🇦🇪\n\n` +
    outfit.map((it, idx) => `✅ Piece ${idx + 1}: ${it.category} (${it.size}) — AED ${it.price}`).join('\n') +
    `\n\n💬 Comment "SHOP" below & FOLLOW Vintage Vibes — our bot replies in 1 second with the direct link!\n` +
    `🛒 Shop 700+ 1-of-1 Pieces: https://vintagevibesgk.com/\n` +
    `📱 WhatsApp Order: https://wa.me/971554186086\n` +
    `⭐ All Official Pages: https://vintagevibesgk.com/follow/\n\n` +
    `#VintageVibesUAE #ThriftUAE #DubaiThrift #StreetwearUAE #PreLovedUAE #Shorts\n` +
    `(Vintage Vibes General Trading L.L.C-S.P.C — Independent Pre-Loved Thrift Store UAE)`;

  const firstComment = `👇 Comment "SHOP" for instant reply or order here:\n🛍️ Website: https://vintagevibesgk.com/\n💬 WhatsApp: https://wa.me/971554186086\n⭐ Follow All Official Pages: https://vintagevibesgk.com/follow/`;

  const pubRes = await publishVideoTriplePlatform({
    localFilePath: reelOut,
    publicVideoUrl: `https://vintagevibesgk.com/uploads/daily_reels/${reelName}?t=${stamp}`,
    title,
    caption,
    firstComment
  });

  state.usedSkus.push(...outfit.map((o) => o.sku));
  state.usedSkus = state.usedSkus.slice(-400);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  log(`Engine #5 Music Reel Published (${reelName}): ${JSON.stringify(pubRes)}`);
}

main().catch((e) => {
  log('ERR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

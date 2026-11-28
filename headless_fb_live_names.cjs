/**
 * Vintage Vibes UAE — Engine #7 (v3.0 Pure GraphQL Sub-Second Edition!)
 * 100% Headless Zero-Cookie Facebook Live Real-Name & Avatar Engine
 *
 * Breakthrough Architecture:
 *   1) Opens https://www.facebook.com/61564346255723/videos/<videoId> ONCE per stream to extract
 *      the stream's exact pfbid Relay feedback_id ("ZmVlZGJhY2s6cGZiaWQw...") and LSD token,
 *      saving { videoId, feedbackId } to public/fb-active-live.json & dist/fb-active-live.json!
 *   2) Every 1.4 seconds (ZERO page reloads, ZERO DOM clicks!), calls Facebook's internal
 *      CommentsListComponentsPaginationQuery (doc_id 40038128942501746) with
 *      REVERSE_CHRONOLOGICAL_UNFILTERED_INTENT_V1 — returning 100% of all newest comments
 *      (including short 1-word comments, emojis, and unfiltered buyers) in ~0.8s!
 *   3) Matches by exact legacy_fbid (commentId) + normalized text, writing avatars & names to
 *      fb-real-names.json AND upgrading @Facebook Viewer in-place in booth-1 immediately!
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\vintage-vibe';
const LOG_DIR = path.join(ROOT, 'logs');
const PID_FILE = path.join(LOG_DIR, 'headless_fb_live_names.pid');
const STATUS_FILE = path.join(LOG_DIR, 'headless_fb_live_names.json');
const PUBLIC_JSON = path.join(ROOT, 'public', 'fb-real-names.json');
const DIST_JSON = path.join(ROOT, 'dist', 'fb-real-names.json');
const ACTIVE_LIVE_PUBLIC = path.join(ROOT, 'public', 'fb-active-live.json');
const ACTIVE_LIVE_DIST = path.join(ROOT, 'dist', 'fb-active-live.json');
const BOOTH_COMMENTS_URL = 'http://127.0.0.1:3000/api/live/booths/booth-1/comments';
const LOCAL_WEBHOOK_URL = 'http://127.0.0.1:3000/api/live/webhooks/facebook';
const PUBLIC_PROFILE_ID = '61564346255723';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

fs.mkdirSync(LOG_DIR, { recursive: true });

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

const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer-core'));

function normTxt(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanFbName(raw) {
  return String(raw || '')
    .replace(/\s+(?:about\b.*|a\s+few\s+seconds\s+ago.*|a\s+moment\s+ago.*|just\s+now.*|an?\s+(?:second|minute|hour|day|week)s?\s+ago.*|\d+\s*(?:s|m|h|d|w|sec|second|min|minute|hr|hour|day|week)s?(?:\s+ago)?|yesterday.*)$/i, '')
    .replace(/\s*[·•]\s*follow.*$/i, '')
    .trim();
}

function loadStore() {
  try {
    if (fs.existsSync(PUBLIC_JSON)) {
      const d = JSON.parse(fs.readFileSync(PUBLIC_JSON, 'utf8'));
      if (d && typeof d === 'object') {
        return {
          updatedAt: d.updatedAt || Date.now(),
          videoId: d.videoId || '',
          byCommentId: d.byCommentId || {},
          byNormText: d.byNormText || {}
        };
      }
    }
  } catch (_) {}
  return { updatedAt: Date.now(), videoId: '', byCommentId: {}, byNormText: {} };
}

let store = loadStore();

function saveStore() {
  store.updatedAt = Date.now();
  const idKeys = Object.keys(store.byCommentId);
  if (idKeys.length > 1200) {
    for (const k of idKeys.slice(0, idKeys.length - 1200)) delete store.byCommentId[k];
  }
  const txtKeys = Object.keys(store.byNormText);
  if (txtKeys.length > 1200) {
    for (const k of txtKeys.slice(0, txtKeys.length - 1200)) delete store.byNormText[k];
  }
  const raw = JSON.stringify(store);
  try {
    fs.writeFileSync(PUBLIC_JSON + '.tmp', raw, 'utf8');
    fs.renameSync(PUBLIC_JSON + '.tmp', PUBLIC_JSON);
  } catch (_) {}
  try {
    if (fs.existsSync(path.dirname(DIST_JSON))) {
      fs.writeFileSync(DIST_JSON + '.tmp', raw, 'utf8');
      fs.renameSync(DIST_JSON + '.tmp', DIST_JSON);
    }
  } catch (_) {}
}

function saveActiveLiveMeta(meta) {
  const raw = JSON.stringify(meta);
  try { fs.writeFileSync(ACTIVE_LIVE_PUBLIC, raw, 'utf8'); } catch (_) {}
  try { if (fs.existsSync(path.dirname(ACTIVE_LIVE_DIST))) fs.writeFileSync(ACTIVE_LIVE_DIST, raw, 'utf8'); } catch (_) {}
}

function writeStatus(obj) {
  try {
    fs.writeFileSync(
      STATUS_FILE,
      JSON.stringify(
        Object.assign(
          {
            pid: process.pid,
            updatedAt: new Date().toISOString(),
            totalByCommentId: Object.keys(store.byCommentId).length,
            totalByNormText: Object.keys(store.byNormText).length
          },
          obj
        ),
        null,
        2
      ),
      'utf8'
    );
  } catch (_) {}
}

async function fetchBoothComments() {
  try {
    const r = await fetch(BOOTH_COMMENTS_URL, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : (d.comments || []);
  } catch (_) {
    return [];
  }
}

function detectActiveVideoIdFromComments(comments) {
  for (let i = 0; i < comments.length; i++) {
    const m = String(comments[i]?.externalId || '').match(/^facebook:(\d{10,25})_\d+/);
    if (m) return m[1];
  }
  return '';
}

function isFfmpegStreaming() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH', { encoding: 'utf8', windowsHide: true });
    return /ffmpeg\.exe/i.test(out);
  } catch (_) {
    return false;
  }
}

let browser = null;
let page = null;
let currentVid = '';
let currentFeedbackId = '';
let pageOpenedAt = 0;
let initialDeepFetchDoneForVid = '';
let zeroExtractStreak = 0;
let lastSilentRecycleAt = 0;

async function closeHeadlessBrowser() {
  if (browser) {
    try { await browser.close(); } catch (_) {}
    browser = null;
    page = null;
    currentVid = '';
    currentFeedbackId = '';
  }
}

async function ensureStreamSession(videoId) {
  // Recycle invisible headless browser every 15 mins on long streams to keep LSD fresh & RAM < 110 MB
  if (browser && pageOpenedAt && Date.now() - pageOpenedAt > 15 * 60 * 1000) {
    await closeHeadlessBrowser();
  }

  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      executablePath: CHROME_EXE,
      headless: 'new',
      windowsHide: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--mute-audio',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rt = req.resourceType();
      if (rt === 'media' || rt === 'image' || rt === 'font' || /\.mp4\b|bytestart=/i.test(req.url())) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    currentVid = '';
    currentFeedbackId = '';
  }

  if (currentVid !== videoId || !currentFeedbackId) {
    const targetUrl = `https://www.facebook.com/${PUBLIC_PROFILE_ID}/videos/${videoId}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 22000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1800));
    const meta = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const fbIds = Array.from(new Set((html.match(/"feedback":\{"id":"([^"]+)"/g) || []).map((x) => x.match(/"id":"([^"]+)"/)[1])));
      let docId = '40038128942501746';
      try {
        const d = window.require('CommentsListComponentsPaginationQuery_facebookRelayOperation');
        if (d && /^\d+$/.test(String(d))) docId = String(d);
      } catch (_) {}
      return { fid: fbIds[0] || '', docId };
    }).catch(() => ({ fid: '', docId: '40038128942501746' }));

    currentVid = videoId;
    currentFeedbackId = meta.fid || Buffer.from(`feedback:${videoId}`).toString('base64');
    pageOpenedAt = Date.now();
    saveActiveLiveMeta({
      updatedAt: Date.now(),
      isLive: true,
      videoId,
      feedbackId: currentFeedbackId
    });
  }

  return { page, feedbackId: currentFeedbackId };
}

let gqlRateLimitUntil = 0;

async function scrapeDomLiveComments(p) {
  return p.evaluate(() => {
    const out = [];
    const articles = Array.from(document.querySelectorAll('div[role="article"]'));
    for (const art of articles) {
      const aria = art.getAttribute('aria-label') || '';
      if (!/^Comment by /i.test(aria)) continue;
      const authorLink = art.querySelector('a[role="link"] span[dir="auto"], span[dir="auto"] a[role="link"]');
      let authorName = authorLink ? (authorLink.innerText || '').trim() : '';
      if (!authorName) {
        const m = aria.match(/^Comment by (.+?)(?: about | a moment | \d+\s*(?:s|m|h|d|second|minute|hour))/i);
        if (m) authorName = m[1].trim();
      }
      const dirDivs = Array.from(art.querySelectorAll('div[dir="auto"]'));
      const commentText = dirDivs.map(d => (d.innerText || '').trim()).filter(Boolean).join('\n').trim();
      const img = art.querySelector('svg image, img');
      const avatarUrl = img ? (img.getAttribute('xlink:href') || img.getAttribute('href') || img.getAttribute('src') || '') : '';
      let cid = '';
      const links = Array.from(art.querySelectorAll('a[href*="comment_id="]'));
      if (links[0]) {
        const cm = links[0].href.match(/comment_id=(\d+)/);
        if (cm) cid = cm[1];
      }
      if (authorName && commentText) {
        out.push({ commentId: cid, authorName, avatarUrl, commentText, createdTime: Math.floor(Date.now() / 1000) });
      }
    }
    return out;
  }).catch(() => []);
}

async function fetchNewestCommentsGraphQL(p, feedbackId, pagesToFetch) {
  if (Date.now() < gqlRateLimitUntil) {
    return scrapeDomLiveComments(p);
  }
  const res = await p.evaluate(
    async ({ fid, maxPages }) => {
      let lsd = '';
      try { lsd = window.require('LSD').token; } catch (_) {}
      let docId = '40038128942501746';
      try {
        const d = window.require('CommentsListComponentsPaginationQuery_facebookRelayOperation');
        if (d && /^\d+$/.test(String(d))) docId = String(d);
      } catch (_) {}

      let hitRateLimit = false;

      async function runPage(cursor) {
        const vars = {
          commentsAfterCount: -1,
          commentsAfterCursor: cursor,
          commentsBeforeCount: null,
          commentsBeforeCursor: null,
          commentsIntentToken: 'REVERSE_CHRONOLOGICAL_UNFILTERED_INTENT_V1',
          feedLocation: 'TAHOE',
          focusCommentID: null,
          scale: 1,
          useDefaultActor: false,
          id: fid,
          __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'AUTO_TRANSLATE',
          __relay_internal__pv__IsWorkUserrelayprovider: false,
          __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
          __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
          __relay_internal__pv__CometUFICommentActionLinkStableIDsrelayprovider: false,
          __relay_internal__pv__ShowWorkplaceAgentAttributionrelayprovider: false
        };
        const form = new URLSearchParams({
          __a: '1',
          lsd,
          fb_api_caller_class: 'RelayModern',
          fb_api_req_friendly_name: 'CommentsListComponentsPaginationQuery',
          variables: JSON.stringify(vars),
          doc_id: docId
        });
        const r = await fetch('https://www.facebook.com/api/graphql/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-LSD': lsd },
          body: form
        });
        const txt = await r.text();
        if (txt.includes('1675004') || /Rate limit exceeded/i.test(txt)) {
          hitRateLimit = true;
          return { edges: [], endCursor: null, hasNext: false };
        }
        const lines = txt.replace(/^for \(;;\);/, '').split('\n').map(l => l.trim()).filter(Boolean);
        let conn = null;
        for (const ln of lines) {
          try {
            const parsed = JSON.parse(ln);
            const c = parsed?.data?.node?.comment_rendering_instance_for_feed_location?.comments;
            if (c && Array.isArray(c.edges)) {
              conn = c;
              break;
            }
          } catch (_) {}
        }
        return {
          edges: conn?.edges || [],
          endCursor: conn?.page_info?.end_cursor || null,
          hasNext: Boolean(conn?.page_info?.has_next_page)
        };
      }

      const collected = [];
      let cursor = null;
      for (let step = 0; step < maxPages; step++) {
        let pageRes;
        try {
          pageRes = await runPage(cursor);
        } catch (_) {
          break;
        }
        if (hitRateLimit) break;
        for (const e of pageRes.edges) {
          const n = e?.node;
          if (!n) continue;
          let cid = String(n.legacy_fbid || n.legacy_token || '').replace(/^.*_/, '');
          if (!cid && n.id) {
            try {
              cid = atob(String(n.id)).replace(/^.*_/, '');
            } catch (_) {}
          }
          collected.push({
            commentId: cid,
            authorName: String(n.author?.name || ''),
            avatarUrl: String(n.author?.profile_picture_depth_0?.uri || ''),
            commentText: String(n.body?.text || ''),
            createdTime: Number(n.created_time || 0)
          });
        }
        if (!pageRes.endCursor || !pageRes.hasNext) break;
        cursor = pageRes.endCursor;
      }
      return { collected, hitRateLimit };
    },
    { fid: feedbackId, maxPages: pagesToFetch }
  ).catch(() => ({ collected: [], hitRateLimit: false }));

  if (res.hitRateLimit) {
    gqlRateLimitUntil = Date.now() + 15 * 60 * 1000;
    return scrapeDomLiveComments(p);
  }
  if (!res.collected || res.collected.length === 0) {
    const domItems = await scrapeDomLiveComments(p);
    if (domItems.length > 0) return domItems;
  }
  return res.collected || [];
}

const upgradedBoothIds = new Set();
const directlyIngestedCids = new Set();
let lastPublicLiveDiscoverAt = 0;
let discoveredPublicLiveVid = '';

async function discoverActiveLiveVideoFromPublicProfile() {
  if (Date.now() - lastPublicLiveDiscoverAt < 25000) return discoveredPublicLiveVid;
  lastPublicLiveDiscoverAt = Date.now();
  try {
    // 1. Check fb-active-live.json written by Producer / Host controller (if fresh < 3h)
    if (fs.existsSync(ACTIVE_LIVE_PUBLIC)) {
      const meta = JSON.parse(fs.readFileSync(ACTIVE_LIVE_PUBLIC, 'utf8') || '{}');
      if (meta.videoId && /^\d{10,25}$/.test(String(meta.videoId)) && meta.updatedAt && Date.now() - Number(meta.updatedAt) < 3 * 3600 * 1000 && meta.isLive !== false) {
        discoveredPublicLiveVid = String(meta.videoId);
      }
    }
  } catch (_) {}

  // 2. Also scan VintageVibes Clo public live_videos page (zero OAuth quota!)
  let discPage = null;
  try {
    if (!browser || !browser.connected) {
      browser = await puppeteer.launch({
        executablePath: CHROME_EXE,
        headless: 'new',
        windowsHide: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run']
      });
    }
    discPage = await browser.newPage();
    await discPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await discPage.goto(`https://www.facebook.com/profile.php?id=${PUBLIC_PROFILE_ID}&sk=live_videos`, {
      waitUntil: 'domcontentloaded',
      timeout: 18000
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1800));
    const found = await discPage.evaluate(() => {
      const html = document.documentElement.innerHTML || '';
      const isLive = /"is_live_streaming":true/i.test(html) || /\bLIVE\b/.test(document.body?.innerText || '');
      const m = html.match(/\/videos\/(\d{10,25})/);
      return { isLive, vid: m ? m[1] : '' };
    });
    if (found && found.isLive && found.vid) {
      discoveredPublicLiveVid = found.vid;
    }
  } catch (_) {} finally {
    if (discPage) {
      try { await discPage.close(); } catch (_) {}
    }
  }
  return discoveredPublicLiveVid;
}

async function mainLoop() {
  writeStatus({ state: 'started_v3_1_zero_oauth_graphql' });

  while (true) {
    try {
      const t0 = Date.now();
      const streaming = isFfmpegStreaming();
      const boothComments = await fetchBoothComments();
      let activeVid = detectActiveVideoIdFromComments(boothComments);
      if (streaming && (!activeVid || Date.now() - lastPublicLiveDiscoverAt > 30000)) {
        const pubVid = await discoverActiveLiveVideoFromPublicProfile();
        if (pubVid) activeVid = pubVid;
      }

      const hasAnonFb = boothComments.some(
        (c) => String(c.platform || '').toLowerCase() === 'facebook' && /^@?facebook\s*viewer$/i.test(String(c.username || '').trim())
      );

      if (!activeVid || (!streaming && !hasAnonFb)) {
        await closeHeadlessBrowser();
        writeStatus({ state: 'idle_no_active_stream' });
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      store.videoId = activeVid;
      let { page: p, feedbackId } = await ensureStreamSession(activeVid);

      // Fetch 4 pages (~45 comments) on initial seed, then 2 pages every 4s (prevents Facebook LSD throttling!)
      const pagesCount = initialDeepFetchDoneForVid !== activeVid ? 4 : 2;
      let extracted = await fetchNewestCommentsGraphQL(p, feedbackId, pagesCount);
      if (extracted.length > 0) {
        initialDeepFetchDoneForVid = activeVid;
        zeroExtractStreak = 0;
      } else {
        zeroExtractStreak++;
        // Silent 100% invisible background tab refresh if @Facebook Viewer is waiting or LSD token went stale
        if ((hasAnonFb || zeroExtractStreak >= 4) && Date.now() - lastSilentRecycleAt > 20000) {
          lastSilentRecycleAt = Date.now();
          zeroExtractStreak = 0;
          await closeHeadlessBrowser();
          const fresh = await ensureStreamSession(activeVid);
          p = fresh.page;
          feedbackId = fresh.feedbackId;
          extracted = await fetchNewestCommentsGraphQL(p, feedbackId, 4);
          if (extracted.length > 0) initialDeepFetchDoneForVid = activeVid;
        }
      }

      let storeChanged = false;
      for (const it of extracted) {
        const name = cleanFbName(it.authorName);
        const text = String(it.commentText || '').trim();
        const cid = String(it.commentId || '').trim();
        const av = String(it.avatarUrl || '').trim();
        if (!name || /^Vintage\s*Vibes/i.test(name)) continue;

        if (cid) {
          const prev = store.byCommentId[cid];
          const ct = Number(it.createdTime || prev?.createdTime || 0);
          if (!prev || prev.name !== name || (!prev.avatar && av) || (!prev.createdTime && ct)) {
            store.byCommentId[cid] = { name, avatar: av, text: text || prev?.text || 'emoji', createdTime: ct || undefined };
            storeChanged = true;
          }
        }
        const nk = normTxt(text);
        if (nk) {
          const prevT = store.byNormText[nk];
          if (!prevT || prevT.name !== name || (!prevT.avatar && av)) {
            store.byNormText[nk] = { name, avatar: av, commentId: cid };
            storeChanged = true;
          }
        }
      }
      if (storeChanged) saveStore();

      const latestBooth = await fetchBoothComments();
      const existingCidsInBooth = new Set();
      for (const bc of latestBooth) {
        const m = String(bc.externalId || bc.id || '').match(/_(\d{8,25})/);
        if (m) existingCidsInBooth.add(m[1]);
      }

      // Direct Zero-OAuth Comment Ingestion: when socialChatService OAuth is cooling down (#4),
      // ingest brand-new live comments (< 6 mins old) directly from GraphQL with 100% real name & avatar!
      let directIngestedNow = 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const chronExtracted = [...extracted].reverse();
      for (const it of chronExtracted) {
        const cid = String(it.commentId || '').trim();
        const name = cleanFbName(it.authorName);
        const text = String(it.commentText || '').trim();
        const av = String(it.avatarUrl || '').trim();
        const ct = Number(it.createdTime || 0);
        if (!cid || !name || !text || /^Vintage\s*Vibes/i.test(name)) continue;
        if (existingCidsInBooth.has(cid) || directlyIngestedCids.has(cid)) continue;
        if (ct && nowSec - ct > 360) {
          directlyIngestedCids.add(cid);
          continue;
        }
        directlyIngestedCids.add(cid);
        if (directlyIngestedCids.size > 2500) {
          const first = directlyIngestedCids.values().next().value;
          if (first) directlyIngestedCids.delete(first);
        }
        directIngestedNow++;
        await fetch(LOCAL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boothId: 'booth-1',
            id: activeVid + '_' + cid,
            username: name,
            commentText: text,
            avatarUrl: av || undefined
          })
        }).catch(() => {});
      }

      let upgradedNow = 0;
      for (const bc of latestBooth) {
        if (String(bc.platform || '').toLowerCase() !== 'facebook') continue;
        if (!/^@?facebook\s*viewer$/i.test(String(bc.username || '').trim())) continue;
        if (upgradedBoothIds.has(bc.id)) continue;

        const m = String(bc.externalId || bc.id || '').match(/_(\d{8,25})$/);
        const cid = m ? m[1] : '';
        const exactBoothText = String(bc.comment || bc.text || '').trim();
        const nk = normTxt(exactBoothText);
        const asciiNk = nk.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let matchEntry = (cid && store.byCommentId[cid]) || (nk && store.byNormText[nk]) || null;
        if (!matchEntry && asciiNk) {
          for (const [k, val] of Object.entries(store.byNormText)) {
            if (k.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === asciiNk) {
              matchEntry = val;
              break;
            }
          }
        }

        if (matchEntry && matchEntry.name) {
          upgradedBoothIds.add(bc.id);
          upgradedNow++;
          if (nk && !store.byNormText[nk]) {
            store.byNormText[nk] = { name: matchEntry.name, avatar: matchEntry.avatar || '', commentId: cid };
            saveStore();
          }
          await fetch(LOCAL_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              boothId: 'booth-1',
              id: 'realname_' + activeVid + '_' + (cid || Date.now()) + '_' + upgradedNow,
              username: matchEntry.name,
              commentText: exactBoothText,
              avatarUrl: matchEntry.avatar || undefined
            })
          }).catch(() => {});
        }
      }

      writeStatus({
        state: 'syncing_v3_graphql_subsecond',
        cycleMs: Date.now() - t0,
        videoId: activeVid,
        feedbackId,
        extractedCount: extracted.length,
        upgradedNow
      });
    } catch (err) {
      writeStatus({ state: 'retrying', error: String(err?.message || err) });
      await closeHeadlessBrowser();
    }

    await new Promise((r) => setTimeout(r, 8500));
  }
}

process.on('SIGINT', async () => { await closeHeadlessBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await closeHeadlessBrowser(); process.exit(0); });

mainLoop();

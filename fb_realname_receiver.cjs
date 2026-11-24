/**
 * Vintage Vibes UAE — Local Facebook Live Real-Name & Avatar Bridge Receiver (Port 3847)
 * Runs 24/7 on Dubai Server (127.0.0.1:3847) with permissive CORS + Private Network headers so
 * Chrome Extension content.js on https://www.facebook.com never hits HTTP 403 preflight blocks!
 *
 * Responsibilities:
 *   1) POST /sync — Receives extracted { videoId, items: [{ id, commentId, username, commentText, avatarUrl }] },
 *      atomically updates public/fb-real-names.json & dist/fb-real-names.json (with avatars + exact commentId),
 *      and forwards new comments to http://127.0.0.1:3000/api/live/webhooks/facebook (upgrading @Facebook Viewer in-place!).
 *   2) GET /state — Returns { activeVideoId, comments } from http://127.0.0.1:3000/api/live/booths/booth-1/comments
 *      so content.js & background.js can read active stream ID & Host replies with zero CORS issues.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\vintage-vibe';
const PORT = 3847;
const PUBLIC_JSON = path.join(ROOT, 'public', 'fb-real-names.json');
const DIST_JSON = path.join(ROOT, 'dist', 'fb-real-names.json');
const ACTIVE_LIVE_PUBLIC = path.join(ROOT, 'public', 'fb-active-live.json');
const HOST_OUTBOX_PUBLIC = path.join(ROOT, 'public', 'uploads', 'live_bridge', 'host_outbox.json');
const HOST_OUTBOX_DIST = path.join(ROOT, 'dist', 'uploads', 'live_bridge', 'host_outbox.json');
const LOCAL_COMMENTS_API = 'http://127.0.0.1:3000/api/live/booths/booth-1/comments';
const LOCAL_WEBHOOK_API = 'http://127.0.0.1:3000/api/live/webhooks/facebook';

const forwardedExtIds = new Set();

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
let lastDiag = null;

function saveStore() {
  store.updatedAt = Date.now();
  // Trim maps if huge so JSON stays fast (<150KB)
  const idKeys = Object.keys(store.byCommentId);
  if (idKeys.length > 800) {
    for (const k of idKeys.slice(0, idKeys.length - 800)) delete store.byCommentId[k];
  }
  const txtKeys = Object.keys(store.byNormText);
  if (txtKeys.length > 800) {
    for (const k of txtKeys.slice(0, txtKeys.length - 800)) delete store.byNormText[k];
  }

  const raw = JSON.stringify(store);
  try {
    fs.mkdirSync(path.dirname(PUBLIC_JSON), { recursive: true });
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlObj = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && urlObj.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, updatedAt: store.updatedAt, videoId: store.videoId, count: Object.keys(store.byCommentId).length, lastDiag }));
  }

  if (req.method === 'POST' && urlObj.pathname === '/diag') {
    let b = '';
    req.on('data', (c) => { if (b.length < 256000) b += c; });
    req.on('end', () => {
      try {
        const sp = new URLSearchParams(b);
        lastDiag = JSON.parse(sp.get('diag') || b || '{}');
      } catch (_) { lastDiag = { raw: b.slice(0, 500) }; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  if (req.method === 'GET' && urlObj.pathname === '/state') {
    try {
      const r = await fetch(LOCAL_COMMENTS_API);
      const list = await r.json();
      const comments = Array.isArray(list) ? list : (list.comments || []);
      let activeVideoId = '';
      for (let i = 0; i < comments.length; i++) {
        const m = String(comments[i]?.externalId || '').match(/^facebook:(\d{10,25})_\d+/);
        if (m) {
          activeVideoId = m[1];
          break;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, activeVideoId, comments }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, activeVideoId: '', comments: [] }));
    }
  }

  if (req.method === 'POST' && urlObj.pathname === '/sync') {
    let body = '';
    req.on('data', (ch) => {
      if (body.length < 2 * 1024 * 1024) body += ch;
    });
    req.on('end', async () => {
      try {
        let payload = {};
        if (body.trim().startsWith('{')) {
          payload = JSON.parse(body);
        } else {
          const sp = new URLSearchParams(body);
          payload = JSON.parse(sp.get('payload') || '{}');
        }

        const vid = String(payload.videoId || '').trim();
        if (vid) store.videoId = vid;
        const items = Array.isArray(payload.items) ? payload.items : [];
        let changed = false;
        let forwarded = 0;

        for (const it of items) {
          const name = cleanFbName(it.username);
          const text = String(it.commentText || '').trim();
          const cid = String(it.commentId || '').trim();
          const avatar = String(it.avatarUrl || '').trim();
          if (!name || !text || /^@?facebook\s*viewer$/i.test(name)) continue;

          if (cid) {
            const prev = store.byCommentId[cid];
            if (!prev || prev.name !== name || (!prev.avatar && avatar)) {
              store.byCommentId[cid] = { name, avatar, text };
              changed = true;
            }
          }
          const nk = normTxt(text);
          if (nk) {
            const prevT = store.byNormText[nk];
            if (!prevT || prevT.name !== name || (!prevT.avatar && avatar)) {
              store.byNormText[nk] = { name, avatar, commentId: cid };
              changed = true;
            }
          }

          const extKey = String(it.id || (cid ? `${vid}_${cid}` : `${name}|${nk}`));
          if (!forwardedExtIds.has(extKey)) {
            forwardedExtIds.add(extKey);
            if (forwardedExtIds.size > 3000) {
              const first = forwardedExtIds.values().next().value;
              if (first) forwardedExtIds.delete(first);
            }
            forwarded++;
            fetch(LOCAL_WEBHOOK_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                boothId: 'booth-1',
                id: 'realname_' + extKey,
                username: name,
                commentText: text,
                avatarUrl: avatar || undefined
              })
            }).catch(() => {});
          }
        }

        if (changed) saveStore();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, received: items.length, forwarded, saved: changed }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} already running — exiting cleanly.`);
    process.exit(0);
  }
  console.error(err);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[VV FB Real-Name Receiver] Listening on http://127.0.0.1:${PORT}`);
});

// Mirror upgraded real names from booth-1 comments into fb-real-names.json every 2.5s
// AND auto-relay any un-multicasted Murtaza / Host messages straight to YouTube Live Chat!
const relayedMurtazaIds = new Set();
let murtazaSeedDone = false;

setInterval(async () => {
  try {
    const r = await fetch(LOCAL_COMMENTS_API);
    if (!r.ok) return;
    const d = await r.json();
    const list = Array.isArray(d) ? d : (d.comments || []);
    if (!murtazaSeedDone) {
      for (const c of list) if (c && c.id) relayedMurtazaIds.add(c.id);
      murtazaSeedDone = true;
    } else {
      for (let i = Math.min(10, list.length) - 1; i >= 0; i--) {
        const c = list[i];
        if (!c || !c.id || relayedMurtazaIds.has(c.id)) continue;
        const rawU = String(c.username || '').trim();
        const isManualMurtaza = /^@?murtaza\b/i.test(rawU) && c.badge !== 'ALL LIVE' && !c.multicastBroadcast;
        if (isManualMurtaza) {
          relayedMurtazaIds.add(c.id);
          const msgTxt = String(c.comment || c.text || '').trim();
          if (msgTxt) {
            fetch('http://127.0.0.1:3000/api/live/booths/booth-1/comments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: '📢 Vintage Vibes Host',
                comment: msgTxt,
                platform: 'custom',
                isHostReply: true
              })
            }).catch(() => {});
          }
        }
      }
    }
    let changed = false;
    for (const c of list) {
      if (String(c?.platform || '').toLowerCase() !== 'facebook') continue;
      const u = cleanFbName(String(c.username || '').replace(/^@/, ''));
      const txt = String(c.comment || c.text || '').trim();
      if (!u || !txt || /^facebook\s*viewer$/i.test(u) || /Vintage Vibes Host/i.test(u)) continue;
      const m = String(c.externalId || c.id || '').match(/_(\d{8,25})$/);
      const cid = m ? m[1] : '';
      const av = String(c.avatarUrl || '').trim();
      if (cid && (!store.byCommentId[cid] || store.byCommentId[cid].name !== u)) {
        store.byCommentId[cid] = { name: u, avatar: av || store.byCommentId[cid]?.avatar || '', text: txt };
        changed = true;
      }
      const nk = normTxt(txt);
      if (nk && (!store.byNormText[nk] || store.byNormText[nk].name !== u)) {
        store.byNormText[nk] = { name: u, avatar: av || store.byNormText[nk]?.avatar || '', commentId: cid };
        changed = true;
      }
    }
    if (changed) saveStore();

    // Also write CORS-open host_outbox.json (/storage/v1/object/public/live_bridge/host_outbox.json -> Access-Control-Allow-Origin: *!)
    let activeMeta = { videoId: '', feedbackId: '' };
    try {
      if (fs.existsSync(ACTIVE_LIVE_PUBLIC)) activeMeta = JSON.parse(fs.readFileSync(ACTIVE_LIVE_PUBLIC, 'utf8'));
    } catch (_) {}
    if (!activeMeta.videoId) {
      for (let i = 0; i < list.length; i++) {
        const mv = String(list[i]?.externalId || '').match(/^facebook:(\d{10,25})_\d+/);
        if (mv) { activeMeta.videoId = mv[1]; break; }
      }
    }

    const hostMessages = [];
    for (let i = Math.min(20, list.length) - 1; i >= 0; i--) {
      const c = list[i];
      if (!c || !c.id) continue;
      const u = String(c.username || '');
      if (u.includes('Vintage Vibes Host') || c.badge === 'ALL LIVE' || c.badge === 'HOST' || /^@?murtaza\b/i.test(u)) {
        let msg = String(c.comment || c.text || '').trim();
        if (!msg) continue;
        // Replace @Facebook Viewer with real buyer name from adjacent comment or store!
        if (/@Facebook Viewer/i.test(msg)) {
          const nb = list[i + 1] || list[i - 1];
          const nbU = nb && nb.platform === 'facebook' ? String(nb.username || '').trim() : '';
          if (nbU && !/^@?facebook\s*viewer$/i.test(nbU) && !nbU.includes('Vintage Vibes Host')) {
            msg = msg.replace(/@Facebook Viewer/gi, nbU).replace(/%40Facebook%20Viewer/gi, encodeURIComponent(nbU));
          }
        }
        hostMessages.push({ id: c.id, text: msg, timestamp: c.timestamp || '' });
      }
    }

    const outboxRaw = JSON.stringify({
      updatedAt: Date.now(),
      videoId: activeMeta.videoId || '',
      feedbackId: activeMeta.feedbackId || '',
      hostMessages
    });
    try {
      fs.mkdirSync(path.dirname(HOST_OUTBOX_PUBLIC), { recursive: true });
      fs.writeFileSync(HOST_OUTBOX_PUBLIC, outboxRaw, 'utf8');
    } catch (_) {}
    try {
      fs.mkdirSync(path.dirname(HOST_OUTBOX_DIST), { recursive: true });
      fs.writeFileSync(HOST_OUTBOX_DIST, outboxRaw, 'utf8');
    } catch (_) {}
  } catch (_) {}
}, 1400);

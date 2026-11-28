/**
 * Vintage Vibes — MV3 Background Service Worker (v2.5.0)
 * Uses ONLY granted_permissions: https://*.facebook.com/* and https://vintagevibesgk.com/*
 * Posts real commenter names via URLSearchParams Simple Request (zero OPTIONS preflight -> HTTP 200 OK!)
 */
const PUBLIC_PROFILE_ID = '61564346255723';
const PUBLIC_COMMENTS_API = 'https://vintagevibesgk.com/api/live/booths/booth-1/comments';
const PUBLIC_WEBHOOK_API = 'https://vintagevibesgk.com/api/live/webhooks/facebook';
let lastAutoOpenedVid = '';

async function getActiveVideoId() {
  try {
    const metaRes = await fetch('https://vintagevibesgk.com/fb-active-live.json?t=' + Date.now(), { cache: 'no-store' });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta && meta.isLive !== false && meta.videoId && /^\d{10,25}$/.test(String(meta.videoId))) {
        return String(meta.videoId);
      }
    }
  } catch (_) {}
  try {
    const res = await fetch(PUBLIC_COMMENTS_API, { cache: 'no-store' });
    if (!res.ok) return '';
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.comments || []);
    // list[0] is NEWEST in streamController!
    for (let i = 0; i < list.length; i++) {
      const m = String(list[i]?.externalId || '').match(/^facebook:(?:realname_)?(\d{10,25})_\d+/);
      if (m) return m[1];
    }
  } catch (_) {}
  return '';
}

async function checkActiveFacebookStream() {
  try {
    const activeVid = await getActiveVideoId();
    if (!activeVid) return;

    const tabs = await chrome.tabs.query({ url: ['https://www.facebook.com/*', 'https://web.facebook.com/*'] });
    for (const t of tabs) {
      if (t.id) {
        chrome.tabs.sendMessage(t.id, { type: 'VV_TICK' }).catch(() => {});
      }
    }
    const alreadyOpen = tabs.find((t) => String(t.url || '').includes(activeVid));
    if (alreadyOpen) {
      lastAutoOpenedVid = activeVid;
      return;
    }

    if (lastAutoOpenedVid === activeVid) return;
    lastAutoOpenedVid = activeVid;
    const targetUrl = `https://www.facebook.com/${PUBLIC_PROFILE_ID}/videos/${activeVid}`;

    const oldVidTab = tabs.find((t) => /\/(videos\/\d+|watch\/live)/.test(String(t.url || '')));
    if (oldVidTab && oldVidTab.id) {
      await chrome.tabs.update(oldVidTab.id, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.create({ url: targetUrl, active: true });
    }
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'VV_SYNC') {
    const items = Array.isArray(msg.items) ? msg.items : [];
    (async () => {
      for (const it of items) {
        try {
          const form = new URLSearchParams();
          form.set('boothId', 'booth-1');
          form.set('id', 'realname_' + String(it.id || ''));
          form.set('username', String(it.username || ''));
          form.set('commentText', String(it.commentText || ''));
          if (it.avatarUrl) form.set('avatarUrl', String(it.avatarUrl));
          await fetch(PUBLIC_WEBHOOK_API, { method: 'POST', body: form });
        } catch (_) {}
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg.type === 'VV_GET_COMMENTS') {
    Promise.all([
      fetch(PUBLIC_COMMENTS_API, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
      fetch('https://vintagevibesgk.com/fb-active-live.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))
    ])
      .then(([d, meta]) => sendResponse({
        ok: true,
        comments: Array.isArray(d) ? d : (d.comments || []),
        feedbackId: (meta && meta.feedbackId) || '',
        videoId: (meta && meta.videoId) || ''
      }))
      .catch(() => sendResponse({ ok: false, comments: [], feedbackId: '', videoId: '' }));
    return true;
  }
  if (msg.type === 'VV_POST_DIAG') {
    const form = new URLSearchParams();
    form.set('diag', JSON.stringify(msg.diag || {}));
    fetch('http://127.0.0.1:3847/diag', { method: 'POST', mode: 'no-cors', body: form }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.alarms.create('vvFbLiveCheck', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'vvFbLiveCheck') checkActiveFacebookStream();
});
checkActiveFacebookStream();

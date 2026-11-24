/**
 * Vintage Vibes — MV3 Background Service Worker
 * Automatically detects active Booth-1 Facebook Live video ID and ensures
 * https://www.facebook.com/61564346255723/videos/<videoId> is open in Chrome.
 */
const PUBLIC_PROFILE_ID = '61564346255723';
const COMMENTS_API = 'https://vintagevibesgk.com/api/live/booths/booth-1/comments';
let lastAutoOpenedVid = '';

async function checkActiveFacebookStream() {
  try {
    const res = await fetch(COMMENTS_API, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.comments || []);
    let activeVid = '';
    for (const c of list) {
      const m = String(c.externalId || '').match(/^facebook:(\d{10,25})_\d+/);
      if (m) {
        activeVid = m[1];
        break;
      }
    }
    if (!activeVid) return;

    const tabs = await chrome.tabs.query({ url: ['https://www.facebook.com/*', 'https://web.facebook.com/*'] });
    const alreadyOpen = tabs.find((t) => String(t.url || '').includes(activeVid));
    if (alreadyOpen) {
      lastAutoOpenedVid = activeVid;
      return;
    }

    if (lastAutoOpenedVid === activeVid) return;
    lastAutoOpenedVid = activeVid;
    const targetUrl = `https://www.facebook.com/${PUBLIC_PROFILE_ID}/videos/${activeVid}`;

    // Reuse an older finished live video tab if present so tabs never pile up!
    const oldVidTab = tabs.find((t) => /\/(videos\/\d+|watch\/live)/.test(String(t.url || '')));
    if (oldVidTab && oldVidTab.id) {
      await chrome.tabs.update(oldVidTab.id, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.create({ url: targetUrl, active: true });
    }
  } catch (_) {}
}

chrome.alarms.create('vvFbLiveCheck', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'vvFbLiveCheck') checkActiveFacebookStream();
});
checkActiveFacebookStream();

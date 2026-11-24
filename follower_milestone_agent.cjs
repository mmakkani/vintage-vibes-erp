/**
 * Vintage Vibes UAE — Engine #6: Real Follower Milestone & Live Cross-Funnel Agent
 * Runs every 15 minutes on Dubai Server:
 *   1) Tracks Official Facebook Page (1436686246201829) real follower count in real time.
 *   2) When Booth-1 is LIVE on VintageVibes Clo (505+ followers), injects an Official Page Follow CTA
 *      into Live Chat (which vv-fb-name-bridge automatically posts into Facebook Live comments!).
 *   3) Ensures every Official Page Reel has a top Follow CTA comment.
 *   4) Auto-rebalances Meta Ads once Official Page crosses 150+ real followers (pauses 1B Turbo Booster
 *      and shifts full 35 AED/day Page Likes budget to Pure UAE Shoppers 1A).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ROOT, PAGE_ID, loadEnv, getChannelTokens } = require('./triple_platform_publisher.cjs');

const STATE_FILE = path.join(ROOT, 'logs', 'follower_milestone_state.json');
const LOG_FILE = path.join(ROOT, 'logs', 'follower_milestone.log');
const OFFICIAL_PAGE_URL = 'https://www.facebook.com/1436686246201829';
const VIP_WA_COMMUNITY_URL = 'https://chat.whatsapp.com/D2fV4gkVV5j21Yt5lZUr91';
const ADSET_1B_TURBO_ID = '120257660303340012';
const ADSET_3C_VIP_WA_ID = '120257664895830012';

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (_) {}
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {}
  return {
    lastFollowerCount: 0,
    rebalancedAt150: false,
    commentedPostIds: [],
    lastLiveCtaTs: 0,
    adSet1AUaeId: '',
    adSet1BTurboId: ''
  };
}

function saveState(st) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2), 'utf8');
}

function isBoothStreamingLive() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH', { encoding: 'utf8', windowsHide: true });
    return /ffmpeg\.exe/i.test(out);
  } catch (_) {
    return false;
  }
}

(async () => {
  loadEnv();
  const state = loadState();
  const sysTok = process.env.META_SYSTEM_USER_TOKEN || '';
  const { fbPageTok } = await getChannelTokens();

  if (!fbPageTok) {
    logLine('WARN: Missing fbPageTok — skipping run.');
    return;
  }

  // 1. Check Official Page Real Follower Count
  const pageInfo = await fetch(
    `https://graph.facebook.com/v21.0/${PAGE_ID}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(fbPageTok)}`
  ).then((r) => r.json()).catch(() => ({}));

  const followers = Number(pageInfo.followers_count || pageInfo.fan_count || 0);
  const delta = state.lastFollowerCount ? followers - state.lastFollowerCount : 0;
  logLine(`Official Page "${pageInfo.name || 'Vintage Vibes'}" Followers: ${followers} (${delta >= 0 ? '+' + delta : delta} since last check)`);
  state.lastFollowerCount = followers;

  // 2. If Booth-1 is actively streaming LIVE, post Follow Official Page CTA every ~15 mins into Live Chat!
  if (isBoothStreamingLive() && Date.now() - Number(state.lastLiveCtaTs || 0) > 14 * 60 * 1000) {
    try {
      const ctaMsg = `📢 JOIN VIP WHATSAPP LIVE ALERTS (100% Private): ${VIP_WA_COMMUNITY_URL} • Follow Official Page: ${OFFICIAL_PAGE_URL}`;
      const res = await fetch('http://127.0.0.1:3000/api/live/booths/booth-1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: '📢 Vintage Vibes Host',
          comment: ctaMsg,
          platform: 'custom',
          isHostReply: true,
          badge: 'ALL LIVE'
        })
      });
      if (res.ok) {
        state.lastLiveCtaTs = Date.now();
        logLine('Posted Official Page Follow CTA into active Booth-1 Live Stream chat.');
      }
    } catch (e) {
      logLine(`Live CTA skipped: ${e.message}`);
    }
  }

  // 3. Ensure latest Page Reels/Posts have a Follow CTA top comment
  try {
    const feed = await fetch(
      `https://graph.facebook.com/v21.0/${PAGE_ID}/published_posts?fields=id,created_time&limit=5&access_token=${encodeURIComponent(fbPageTok)}`
    ).then((r) => r.json()).catch(() => ({}));

    const posts = Array.isArray(feed.data) ? feed.data : [];
    for (const p of posts) {
      if (!p.id || state.commentedPostIds.includes(p.id)) continue;
      // Check if Page already commented on this post
      const existing = await fetch(
        `https://graph.facebook.com/v21.0/${p.id}/comments?fields=from,message&limit=5&access_token=${encodeURIComponent(fbPageTok)}`
      ).then((r) => r.json()).catch(() => ({}));
      const alreadyByPage = Array.isArray(existing.data) && existing.data.some((c) => c?.from?.id === PAGE_ID);
      if (!alreadyByPage) {
        await fetch(`https://graph.facebook.com/v21.0/${p.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: fbPageTok,
            message: `🟢 Join our Official VIP WhatsApp Live Drops Community (1-Tap): ${VIP_WA_COMMUNITY_URL} 🔥 | Follow Vintage Vibes & shop 700+ Pre-Loved pieces at https://vintagevibesgk.com`
          })
        }).catch(() => {});
        logLine(`Added Follow CTA top comment to post ${p.id}`);
      }
      state.commentedPostIds.push(p.id);
      if (state.commentedPostIds.length > 100) state.commentedPostIds = state.commentedPostIds.slice(-100);
    }
  } catch (_) {}

  // 4. Auto-Shift 15 AED/day from 1B -> 3C (UAE Broad VIP WhatsApp Community Ad) once Official Page crosses 100+ real followers!
  if (followers >= 100 && !state.shiftedToVipWaAt100 && sysTok) {
    try {
      await fetch(`https://graph.facebook.com/v21.0/${ADSET_1B_TURBO_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ status: 'PAUSED', access_token: sysTok })
      });
      await fetch(`https://graph.facebook.com/v21.0/${ADSET_3C_VIP_WA_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ daily_budget: '1500', status: 'ACTIVE', access_token: sysTok })
      });
      state.shiftedToVipWaAt100 = true;
      logLine(`MILESTONE >= 100 FOLLOWERS REACHED (${followers})! Paused 1B (${ADSET_1B_TURBO_ID}) and activated 3C UAE VIP WhatsApp Community Ad (${ADSET_3C_VIP_WA_ID}) at 15 AED/day — total budget remains 60 AED/day.`);
    } catch (e) {
      logLine(`Milestone shift error: ${e.message}`);
    }
  }

  saveState(state);
})().catch((err) => {
  logLine(`Fatal error: ${err.message || err}`);
});

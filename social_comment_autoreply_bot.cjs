/**
 * Vintage Vibes UAE — Engine #2: Official Facebook Page & Instagram "SHOP / PRICE / DROP" Instant Auto-Reply + Messenger DM Bot
 * Runs every 3 minutes via Windows Task Scheduler (VintageVibes-CommentAutoReplyBot).
 * - Scans latest posts/videos/reels on Official Facebook Page (1436686246201829) using Official Page Token (0% User rate limit!)
 *   and Official Instagram Business Account (@vintage.vibe006 — 17841464982930833).
 * - Likes viewer comments, posts an instant personalized Public Reply (boosting algorithmic engagement!),
 *   AND sends an Official Messenger Private Reply DM on Facebook when keywords like SHOP / PRICE / LINK / DROP / HM / MINE appear!
 */
const fs = require('fs');
const path = require('path');
const { ROOT, PAGE_ID, getChannelTokens } = require('./triple_platform_publisher.cjs');

const REPLIED_FILE = path.join(ROOT, 'logs', 'replied_comment_ids.json');
const LOG_FILE = path.join(ROOT, 'logs', 'comment_autoreply_bot.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.log(line.trim());
}

function loadRepliedSet() {
  try {
    if (fs.existsSync(REPLIED_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(REPLIED_FILE, 'utf8')) || []);
    }
  } catch (_) {}
  return new Set();
}

function saveRepliedSet(setObj) {
  const arr = Array.from(setObj).slice(-4000);
  fs.writeFileSync(REPLIED_FILE, JSON.stringify(arr, null, 2));
}

function buildPublicReply(authorName, text, isIg) {
  const cleanName = authorName && !/^facebook/i.test(authorName) ? ` ${authorName}` : '';
  const wantLink = /\b(shop|price|hm|how much|drop|link|order|whatsapp|location|where|available|mine|magkano|kitne)\b/i.test(text || '');
  if (isIg) {
    return wantLink
      ? `Hi${cleanName}! 🔥 All 1-of-1 Pre-Loved pieces (AED 15–45) are live at vintagevibesgk.com 🛍️ Or message us on WhatsApp: +971 55 418 6086 💬 Make sure to FOLLOW @vintage.vibe006 for daily drops!`
      : `Thank you${cleanName}! 🙌♻️ Tap FOLLOW on @vintage.vibe006 & explore 700+ 1-of-1 Pre-Loved steals (AED 15–45) at vintagevibesgk.com 🔥`;
  }
  return wantLink
    ? `Hi${cleanName}! 👋🔥 Browse all 700+ 1-of-1 Pre-Loved pieces (AED 15–45) with UAE delivery here: https://vintagevibesgk.com/ 🛍️ | Order on WhatsApp: https://wa.me/971554186086 💬 | Tap FOLLOW on Vintage Vibes so you never miss our daily live drops!`
    : `Thank you${cleanName}! 🙌♻️ Make sure to FOLLOW Vintage Vibes for daily AED 15–25 Pre-Loved Drops! Shop full vault: https://vintagevibesgk.com/ | WhatsApp: https://wa.me/971554186086`;
}

async function main() {
  const { fbPageTok, igTok, igUserId } = await getChannelTokens();
  const replied = loadRepliedSet();
  let repliesSent = 0;

  // 1. Official Facebook Page (1436686246201829) — Feed Posts & Video Reels
  if (fbPageTok) {
    try {
      const [feedJson, vidsJson] = await Promise.all([
        fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/feed?limit=10&fields=id,comments.limit(20){id,message,from}&access_token=${encodeURIComponent(fbPageTok)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/videos?limit=10&fields=id,comments.limit(20){id,message,from}&access_token=${encodeURIComponent(fbPageTok)}`).then((r) => r.json()).catch(() => ({}))
      ]);

      const objects = [...(feedJson.data || []), ...(vidsJson.data || [])];
      const seenObj = new Set();

      for (const obj of objects) {
        if (!obj || !obj.id || seenObj.has(obj.id)) continue;
        seenObj.add(obj.id);
        const comments = (obj.comments && obj.comments.data) || [];
        for (const c of comments) {
          if (!c || !c.id || replied.has(c.id)) continue;
          const fromId = String(c.from?.id || '');
          const fromName = String(c.from?.name || '');
          if (fromId === PAGE_ID || /^vintage\s*vibes/i.test(fromName)) {
            replied.add(c.id);
            continue;
          }
          const msg = String(c.message || '').trim();
          if (!msg) continue;

          // Like the viewer's comment
          await fetch(`https://graph.facebook.com/v21.0/${c.id}/likes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: fbPageTok })
          }).catch(() => {});

          // Post instant Public Reply
          const replyText = buildPublicReply(fromName, msg, false);
          const rr = await fetch(`https://graph.facebook.com/v21.0/${c.id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: fbPageTok, message: replyText })
          }).then((r) => r.json()).catch(() => ({}));

          // Also send Official Comment-to-Messenger Private Reply DM when buyer asks for link/shop/price!
          if (/\b(shop|price|hm|how much|drop|link|order|available|mine|magkano|kitne)\b/i.test(msg)) {
            const dmText =
              `Hi${fromName ? ' ' + fromName : ''}! 👋 Welcome to Vintage Vibes UAE ♻️\n\n` +
              `🛍️ Shop 700+ 1-of-1 Pre-Loved Pieces (AED 15–45): https://vintagevibesgk.com/\n` +
              `🔴 Watch Zero-Delay Live Drops: https://vintagevibesgk.com/live/\n` +
              `💬 Order on WhatsApp: https://wa.me/971554186086\n\n` +
              `⭐ Follow our Official Page so you get notified on every flash drop!`;
            await fetch(`https://graph.facebook.com/v21.0/${c.id}/private_replies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ access_token: fbPageTok, message: dmText })
            }).catch(() => {});
          }

          replied.add(c.id);
          if (rr && rr.id) {
            repliesSent++;
            log(`FB Auto-Replied to comment ${c.id} (${fromName || 'Viewer'}): "${msg.slice(0, 40)}"`);
          }
          if (repliesSent >= 8) break;
        }
        if (repliesSent >= 8) break;
      }
    } catch (e) {
      log('FB scan warning: ' + String(e.message || e));
    }
  }

  // 2. Official Instagram Business (@vintage.vibe006 — 17841464982930833)
  if (igTok && igUserId) {
    try {
      const mediaJson = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media?limit=8&fields=id,comments.limit(15){id,text,username}&access_token=${encodeURIComponent(igTok)}`
      ).then((r) => r.json()).catch(() => ({}));

      for (const m of mediaJson.data || []) {
        const comments = (m.comments && m.comments.data) || [];
        for (const c of comments) {
          if (!c || !c.id || replied.has(c.id)) continue;
          const uname = String(c.username || '');
          if (/^vintage\.?vibe/i.test(uname)) {
            replied.add(c.id);
            continue;
          }
          const txt = String(c.text || '').trim();
          if (!txt) continue;

          const replyText = buildPublicReply('@' + uname, txt, true);
          const ir = await fetch(`https://graph.facebook.com/v21.0/${c.id}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: igTok, message: replyText })
          }).then((r) => r.json()).catch(() => ({}));

          replied.add(c.id);
          if (ir && ir.id) {
            repliesSent++;
            log(`IG Auto-Replied to comment ${c.id} (@${uname}): "${txt.slice(0, 40)}"`);
          }
          if (repliesSent >= 14) break;
        }
        if (repliesSent >= 14) break;
      }
    } catch (e) {
      log('IG scan warning: ' + String(e.message || e));
    }
  }

  saveRepliedSet(replied);
}

main().catch((e) => {
  log('ERR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

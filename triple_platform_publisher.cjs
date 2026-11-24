/**
 * Vintage Vibes UAE — Direct Triple-Platform Video Reel Publisher
 * Uses non-expiring META_SYSTEM_USER_TOKEN + YouTube OAuth to publish natively to:
 *   1) Facebook Official Business Page Reels (/1436686246201829/video_reels -> https://www.facebook.com/reel/<id>)
 *   2) Instagram Official Business Reels (@vintage.vibe006 — /17841464982930833/media -> media_publish)
 *   3) YouTube Shorts (@VintageVibesLLCSPC — https://youtube.com/shorts/<id>)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'C:\\vintage-vibe';
const PAGE_ID = '1436686246201829';
const DEFAULT_IG_ID = '17841464982930833';

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function decryptCred(ct) {
  if (!ct) return '';
  if (!ct.startsWith('enc:v1:')) return ct;
  try {
    const parts = ct.split(':');
    const rawKey =
      process.env.ENCRYPTION_KEY ||
      process.env.BOOTH_CREDENTIAL_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      'vintage-vibes-dubai-aes-256-secret-key-2026';
    const key = crypto.scryptSync(rawKey, 'vintage-vibes-broadcaster-salt-2026', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[3], 'hex'));
    return decipher.update(parts[4], 'hex', 'utf8') + decipher.final('utf8');
  } catch (_) {
    return '';
  }
}

async function getChannelTokens() {
  loadEnv();
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const db = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/vintage_vibe' });
  await db.connect();
  const r = await db.query("SELECT id, platform, account_password, metadata FROM public.booth_social_channels WHERE id IN ('b1_facebook', 'b1_instagram', 'b1_youtube')");

  let fbUserTok = '';
  let igTok = '';
  let igUserId = DEFAULT_IG_ID;
  let ytAccess = '';
  let ytRefresh = '';
  let ytExp = 0;

  for (const row of r.rows) {
    const m = row.metadata || {};
    if (row.id === 'b1_facebook') {
      fbUserTok = decryptCred(m.fbAccessToken || '') || decryptCred(row.account_password || '');
    } else if (row.id === 'b1_instagram') {
      igTok = decryptCred(m.accessToken || '') || decryptCred(row.account_password || '');
      if (m.igUserId) igUserId = String(m.igUserId);
    } else if (row.id === 'b1_youtube') {
      ytAccess = String(m.oauthAccessToken || '').trim();
      ytRefresh = String(m.oauthRefreshToken || '').trim();
      ytExp = Number(m.oauthExpiresAt || 0);
    }
  }

  if (ytRefresh && (!ytAccess || (ytExp > 0 && Date.now() > ytExp - 120000))) {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || '186959128141-u3m7iv727mlhdnlfskm3ghvjq0b6u95s.apps.googleusercontent.com';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      const rr = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: ytRefresh,
          grant_type: 'refresh_token'
        })
      });
      if (rr.ok) {
        const rj = await rr.json();
        if (rj && rj.access_token) {
          ytAccess = rj.access_token;
          ytExp = Date.now() + Number(rj.expires_in || 3500) * 1000;
          await db.query(
            `UPDATE public.booth_social_channels
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
             WHERE id = 'b1_youtube'`,
            [JSON.stringify({ oauthAccessToken: ytAccess, oauthExpiresAt: ytExp })]
          ).catch(() => {});
        }
      }
    } catch (_) {}
  }
  await db.end();

  const sysTok = String(process.env.META_SYSTEM_USER_TOKEN || '').trim();
  const effectiveFbTok = sysTok || fbUserTok;
  if (sysTok) igTok = sysTok;

  let fbPageTok = '';
  if (effectiveFbTok) {
    try {
      const rp = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(effectiveFbTok)}`);
      const pj = await rp.json();
      if (pj && pj.access_token) fbPageTok = pj.access_token;
    } catch (_) {}
  }

  return { fbPageTok, igTok, igUserId, ytAccess };
}

async function publishVideoTriplePlatform({ localFilePath, publicVideoUrl, title, caption, firstComment }) {
  const { fbPageTok, igTok, igUserId, ytAccess } = await getChannelTokens();
  const out = { facebook: null, instagram: null, youtube: null };

  // Run all 3 platform uploads in PARALLEL so total runtime is ~45s!
  await Promise.all([
    // 1. Official Facebook Page Native Reel (/video_reels)
    (async () => {
      if (!fbPageTok) { out.facebook = { ok: false, error: 'Missing Page token' }; return; }
      try {
        const s1 = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/video_reels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ upload_phase: 'start', access_token: fbPageTok })
        }).then((r) => r.json());

        if (s1 && s1.video_id && s1.upload_url) {
          await fetch(s1.upload_url, {
            method: 'POST',
            headers: { Authorization: `OAuth ${fbPageTok}`, file_url: publicVideoUrl }
          }).then((r) => r.json());

          const s3 = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/video_reels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              upload_phase: 'finish',
              video_id: s1.video_id,
              video_state: 'PUBLISHED',
              description: caption,
              access_token: fbPageTok
            })
          }).then((r) => r.json());

          out.facebook = {
            ok: Boolean(s3.success || s1.video_id),
            id: s1.video_id,
            url: `https://www.facebook.com/reel/${s1.video_id}`
          };
          if (firstComment) {
            await new Promise((r) => setTimeout(r, 5000));
            await fetch(`https://graph.facebook.com/v21.0/${s1.video_id}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ access_token: fbPageTok, message: firstComment })
            }).catch(() => {});
          }
        } else {
          out.facebook = { ok: false, error: s1?.error?.message || 'FB video_reels start failed' };
        }
      } catch (e) {
        out.facebook = { ok: false, error: String(e.message || e) };
      }
    })(),

    // 2. Official Instagram Business Reels (@vintage.vibe006 — 17841464982930833)
    (async () => {
      if (!igTok || !igUserId) { out.instagram = { ok: false, error: 'Missing IG token' }; return; }
      try {
        const contJson = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            media_type: 'REELS',
            video_url: publicVideoUrl,
            caption,
            share_to_feed: 'true',
            access_token: igTok
          })
        }).then((r) => r.json());

        if (contJson && contJson.id) {
          const cid = contJson.id;
          let finished = false;
          for (let i = 0; i < 24; i++) {
            await new Promise((r) => setTimeout(r, 4000));
            const st = await fetch(`https://graph.facebook.com/v21.0/${cid}?fields=status_code,status&access_token=${encodeURIComponent(igTok)}`).then((x) => x.json()).catch(() => ({}));
            if (st.status_code === 'FINISHED') { finished = true; break; }
            if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
              out.instagram = { ok: false, error: st.status || st.status_code };
              break;
            }
          }
          if (finished) {
            const pubJson = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ creation_id: cid, access_token: igTok })
            }).then((r) => r.json());

            if (pubJson && pubJson.id) {
              const perma = await fetch(`https://graph.facebook.com/v21.0/${pubJson.id}?fields=permalink&access_token=${encodeURIComponent(igTok)}`).then((x) => x.json()).catch(() => ({}));
              out.instagram = { ok: true, id: pubJson.id, url: perma.permalink || `https://www.instagram.com/vintage.vibe006/` };
              if (firstComment) {
                await new Promise((r) => setTimeout(r, 2500));
                await fetch(`https://graph.facebook.com/v21.0/${pubJson.id}/comments`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({ access_token: igTok, message: firstComment })
                }).catch(() => {});
              }
            } else {
              out.instagram = { ok: false, error: pubJson?.error?.message || 'IG media_publish failed' };
            }
          } else if (!out.instagram) {
            out.instagram = { ok: false, error: 'IG container processing timeout' };
          }
        } else {
          out.instagram = { ok: false, error: contJson?.error?.message || 'IG container create failed' };
        }
      } catch (e) {
        out.instagram = { ok: false, error: String(e.message || e) };
      }
    })(),

    // 3. Official YouTube Shorts (@VintageVibesLLCSPC)
    (async () => {
      if (!ytAccess || !fs.existsSync(localFilePath)) { out.youtube = { ok: false, error: 'Missing YT token or file' }; return; }
      try {
        const buf = fs.readFileSync(localFilePath);
        const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ytAccess}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(buf.length),
            'X-Upload-Content-Type': 'video/mp4'
          },
          body: JSON.stringify({
            snippet: {
              title: title.slice(0, 98),
              description: caption.slice(0, 4800),
              categoryId: '22',
              tags: ['VintageVibesUAE', 'ThriftUAE', 'PreLovedUAE', 'DubaiThrift', 'StreetwearUAE', 'Shorts']
            },
            status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
          })
        });
        const upUrl = initRes.headers.get('location') || '';
        if (initRes.ok && upUrl) {
          const putRes = await fetch(upUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${ytAccess}`, 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) },
            body: new Uint8Array(buf)
          });
          const putJson = await putRes.json().catch(() => ({}));
          if (putRes.ok && putJson.id) {
            out.youtube = { ok: true, id: putJson.id, url: `https://youtube.com/shorts/${putJson.id}` };
            if (firstComment) {
              await new Promise((r) => setTimeout(r, 3500));
              await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
                method: 'POST',
                headers: { Authorization: `Bearer ${ytAccess}`, 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({ snippet: { videoId: putJson.id, topLevelComment: { snippet: { textOriginal: firstComment } } } })
              }).catch(() => {});
            }
          } else {
            out.youtube = { ok: false, error: putJson?.error?.message || `YT PUT ${putRes.status}` };
          }
        } else {
          const ej = await initRes.json().catch(() => ({}));
          out.youtube = { ok: false, error: ej?.error?.message || `YT init ${initRes.status}` };
        }
      } catch (e) {
        out.youtube = { ok: false, error: String(e.message || e) };
      }
    })()
  ]);

  return out;
}

module.exports = { ROOT, PAGE_ID, loadEnv, decryptCred, getChannelTokens, publishVideoTriplePlatform };

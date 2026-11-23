import fs from 'fs';
import path from 'path';
import { withDb } from '../../db/pgPool.ts';
import { decryptCredential } from '../../utils/encryption.ts';
import { isBoothActuallyStreamingOnServer } from './rtmpRelayServer.ts';

export interface AutoReelPublishHistoryItem {
  timestamp: string;
  fileName: string;
  skuHint: string;
  facebook?: {
    ok: boolean;
    videoId?: string;
    url?: string;
    error?: string;
    commentPosted?: boolean;
    commentId?: string;
    commentError?: string;
  };
  instagram?: {
    ok: boolean;
    mediaId?: string;
    skipped?: boolean;
    error?: string;
    commentPosted?: boolean;
    commentId?: string;
    commentError?: string;
  };
  youtube?: {
    ok: boolean;
    videoId?: string;
    url?: string;
    privacyStatus?: string;
    error?: string;
    commentPosted?: boolean;
    commentId?: string;
    commentError?: string;
  };
}

interface AutoReelPublisherState {
  enabled: boolean;
  intervalHours: number;
  lastPublishedAt: string | null;
  publishedFiles: string[];
  history: AutoReelPublishHistoryItem[];
}

const DEFAULT_STATE: AutoReelPublisherState = {
  enabled: true,
  intervalHours: 12,
  lastPublishedAt: null,
  publishedFiles: [],
  history: []
};

let cachedState: AutoReelPublisherState | null = null;
let publisherDaemonTimer: ReturnType<typeof setInterval> | null = null;
let publishInFlight: Promise<any> | null = null;

function getStateFilePath(): string {
  return path.join(process.cwd(), '.data', 'auto_reel_publisher.json');
}

function getReelsDir(): string {
  return path.join(process.cwd(), 'public', 'generated_reels');
}

function loadState(): AutoReelPublisherState {
  if (cachedState) return cachedState;
  try {
    const p = getStateFilePath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      cachedState = {
        enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : true,
        intervalHours: Number(parsed?.intervalHours) > 0 ? Number(parsed.intervalHours) : 12,
        lastPublishedAt: parsed?.lastPublishedAt ? String(parsed.lastPublishedAt) : null,
        publishedFiles: Array.isArray(parsed?.publishedFiles) ? parsed.publishedFiles.map(String) : [],
        history: Array.isArray(parsed?.history) ? parsed.history.slice(0, 40) : []
      };
      return cachedState;
    }
  } catch (_) {}
  cachedState = { ...DEFAULT_STATE, publishedFiles: [], history: [] };
  return cachedState;
}

function saveState(state: AutoReelPublisherState) {
  cachedState = state;
  try {
    const p = getStateFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

export function listAvailableReelFiles(): string[] {
  try {
    const dir = getReelsDir();
    if (!fs.existsSync(dir)) return [];
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.mp4'))
      .map((name) => {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        return { name, size: st.size, mtimeMs: st.mtimeMs };
      })
      .filter((x) => x.size > 50_000);

    // Strictly prioritize multi-shot Full-HD Cinema Movie Clips over legacy 1-image slideshows
    const cinemaMovies = entries
      .filter((x) => /^Vintage_Vibes_Cinema_Movie_/i.test(x.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (cinemaMovies.length > 0) {
      return cinemaMovies.map((x) => x.name);
    }

    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries.map((x) => x.name);
  } catch (_) {
    return [];
  }
}

function extractSkuHint(fileName: string): string {
  const m = fileName.match(/Reel_([A-Za-z0-9-]+?)(?:_\d+)?\.mp4$/i);
  if (m?.[1]) return m[1];
  return fileName.replace(/\.mp4$/i, '').slice(-20);
}

async function getValidYouTubeAccessTokenFromDb(): Promise<string> {
  let oauthToken = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || '';
  let oauthRefreshToken = '';
  let oauthExpiresAt = 0;

  try {
    await withDb(async (client) => {
      const q = await client.query(
        `SELECT metadata
         FROM public.booth_social_channels
         WHERE platform = 'youtube'
         ORDER BY ((metadata->>'oauthRefreshToken') IS NOT NULL) DESC,
                  ((metadata->>'oauthAccessToken') IS NOT NULL) DESC,
                  updated_at DESC NULLS LAST
         LIMIT 1`
      );
      const meta = q.rows?.[0]?.metadata || {};
      if (meta.oauthAccessToken) oauthToken = String(meta.oauthAccessToken).trim();
      if (meta.oauthRefreshToken) oauthRefreshToken = String(meta.oauthRefreshToken).trim();
      if (meta.oauthExpiresAt) oauthExpiresAt = Number(meta.oauthExpiresAt || 0);
    });
  } catch (_) {}

  if (oauthRefreshToken && (!oauthToken || (oauthExpiresAt > 0 && Date.now() > oauthExpiresAt - 60000))) {
    try {
      const googleClientId =
        process.env.GOOGLE_CLIENT_ID || '186959128141-u3m7iv727mlhdnlfskm3ghvjq0b6u95s.apps.googleusercontent.com';
      const googleClientSecret =
        process.env.GOOGLE_CLIENT_SECRET || '';
      const refRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: oauthRefreshToken,
          grant_type: 'refresh_token'
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (refRes.ok) {
        const refData: any = await refRes.json().catch(() => null);
        if (refData?.access_token) {
          oauthToken = String(refData.access_token).trim();
          oauthExpiresAt = Date.now() + Number(refData.expires_in || 3500) * 1000;
          await withDb(async (client) => {
            await client.query(
              `UPDATE public.booth_social_channels
               SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
                   updated_at = NOW()
               WHERE platform = 'youtube'`,
              [JSON.stringify({ oauthAccessToken: oauthToken, oauthExpiresAt })]
            );
          }).catch(() => {});
        }
      }
    } catch (_) {}
  }

  return oauthToken;
}

async function getFacebookTokenAndTarget(): Promise<{ token: string; targetId: string }> {
  let token = '';
  let targetId = 'me';
  try {
    await withDb(async (client) => {
      const q = await client.query(
        `SELECT metadata
         FROM public.booth_social_channels
         WHERE platform = 'facebook'
           AND (metadata->>'fbAccessToken') IS NOT NULL
         ORDER BY (auth_status = 'LOGGED_IN') DESC, updated_at DESC NULLS LAST
         LIMIT 1`
      );
      const meta = q.rows?.[0]?.metadata || {};
      if (meta.fbAccessToken) {
        token = decryptCredential(String(meta.fbAccessToken).trim()).trim();
      }
      if (meta.fbTargetId) {
        targetId = String(meta.fbTargetId).trim() || 'me';
      }
    });
  } catch (_) {}
  return { token, targetId };
}

async function publishReelToFacebookAndIgBusiness(
  publicVideoUrl: string,
  title: string,
  caption: string,
  firstCommentText: string
): Promise<{
  facebook: NonNullable<AutoReelPublishHistoryItem['facebook']>;
  instagram: NonNullable<AutoReelPublishHistoryItem['instagram']>;
}> {
  const { token, targetId } = await getFacebookTokenAndTarget();
  if (!token) {
    return {
      facebook: { ok: false, error: 'Missing Facebook access token' },
      instagram: { ok: false, skipped: true, error: 'No Facebook token to check IG Business link' }
    };
  }

  let fbResult: NonNullable<AutoReelPublishHistoryItem['facebook']> = {
    ok: false,
    error: 'Not attempted'
  };
  let igResult: NonNullable<AutoReelPublishHistoryItem['instagram']> = {
    ok: false,
    skipped: true,
    error: 'No linked Instagram Business Account on Meta Pages/Business API'
  };

  const postMetaCommentWithRetry = async (objectId: string, commentAccessToken: string) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 4000 : 5000));
      try {
        const cBody = new URLSearchParams({
          message: firstCommentText,
          access_token: commentAccessToken
        });
        const cRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(objectId)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: cBody.toString(),
          signal: AbortSignal.timeout(12000)
        });
        const cJson: any = await cRes.json().catch(() => null);
        if (cRes.ok && cJson?.id) {
          return { commentPosted: true, commentId: String(cJson.id) };
        }
        if (attempt === 2) {
          return {
            commentPosted: false,
            commentError: cJson?.error?.message || `Comment HTTP ${cRes.status}`
          };
        }
      } catch (ce: any) {
        if (attempt === 2) {
          return { commentPosted: false, commentError: ce?.message || 'Comment network error' };
        }
      }
    }
    return { commentPosted: false, commentError: 'Comment failed' };
  };

  try {
    const body = new URLSearchParams({
      access_token: token,
      file_url: publicVideoUrl,
      title,
      description: caption
    });
    const fbRes = await fetch(`https://graph-video.facebook.com/v21.0/${encodeURIComponent(targetId)}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
      signal: AbortSignal.timeout(30000)
    });
    const fbJson: any = await fbRes.json().catch(() => null);
    if (fbRes.ok && fbJson?.id) {
      const vid = String(fbJson.id);
      const cMeta = await postMetaCommentWithRetry(vid, token);
      fbResult = {
        ok: true,
        videoId: vid,
        url: `https://www.facebook.com/watch/?v=${vid}`,
        ...cMeta
      };
    } else {
      fbResult = { ok: false, error: fbJson?.error?.message || `HTTP ${fbRes.status}` };
    }
  } catch (e: any) {
    fbResult = { ok: false, error: e?.message || 'Facebook upload error' };
  }

  try {
    let igUserId = '';
    let igTok = token;

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const pagesJson: any = await pagesRes.json().catch(() => null);
    const linkedPage = Array.isArray(pagesJson?.data)
      ? pagesJson.data.find((p: any) => p?.instagram_business_account?.id)
      : null;

    if (linkedPage?.instagram_business_account?.id) {
      igUserId = String(linkedPage.instagram_business_account.id);
      igTok = String(linkedPage.access_token || token);
    } else {
      // Also inspect Meta Business Manager owned_pages / instagram_business_accounts
      const bizRes = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,owned_pages{id,name,access_token,instagram_business_account{id,username}},instagram_business_accounts{id,username}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) }
      ).catch(() => null);
      const bizJson: any = await bizRes?.json().catch(() => null);
      const bizList: any[] = Array.isArray(bizJson?.data) ? bizJson.data : [];
      for (const biz of bizList) {
        const ownedPages: any[] = Array.isArray(biz?.owned_pages?.data) ? biz.owned_pages.data : [];
        const pHit = ownedPages.find((p: any) => p?.instagram_business_account?.id);
        if (pHit?.instagram_business_account?.id) {
          igUserId = String(pHit.instagram_business_account.id);
          igTok = String(pHit.access_token || token);
          break;
        }
        const directIg = Array.isArray(biz?.instagram_business_accounts?.data)
          ? biz.instagram_business_accounts.data.find((x: any) => x?.id)
          : null;
        if (directIg?.id) {
          igUserId = String(directIg.id);
          igTok = token;
          break;
        }
      }
    }

    if (igUserId) {
      const cBody = new URLSearchParams({
        media_type: 'REELS',
        video_url: publicVideoUrl,
        caption,
        share_to_feed: 'true',
        access_token: igTok
      });
      const cRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: cBody.toString(),
        signal: AbortSignal.timeout(15000)
      });
      const cJson: any = await cRes.json().catch(() => null);
      if (cRes.ok && cJson?.id) {
        const containerId = String(cJson.id);
        let readyToPublish = false;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const stRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(igTok)}`,
            { signal: AbortSignal.timeout(6000) }
          ).catch(() => null);
          const stJson: any = await stRes?.json().catch(() => null);
          const code = String(stJson?.status_code || '');
          if (code === 'FINISHED') {
            readyToPublish = true;
            break;
          }
          if (code === 'ERROR' || code === 'EXPIRED') break;
        }
        if (readyToPublish) {
          const pBody = new URLSearchParams({ creation_id: containerId, access_token: igTok });
          const pubRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: pBody.toString(),
            signal: AbortSignal.timeout(15000)
          });
          const pubJson: any = await pubRes.json().catch(() => null);
          if (pubRes.ok && pubJson?.id) {
            const mediaId = String(pubJson.id);
            await new Promise((r) => setTimeout(r, 2500));
            let igCommentMeta: { commentPosted?: boolean; commentId?: string; commentError?: string } = {};
            try {
              const igCBody = new URLSearchParams({ message: firstCommentText, access_token: igTok });
              const igCRes = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}/comments`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                  body: igCBody.toString(),
                  signal: AbortSignal.timeout(12000)
                }
              );
              const igCJson: any = await igCRes.json().catch(() => null);
              igCommentMeta =
                igCRes.ok && igCJson?.id
                  ? { commentPosted: true, commentId: String(igCJson.id) }
                  : { commentPosted: false, commentError: igCJson?.error?.message || `HTTP ${igCRes.status}` };
            } catch (igCe: any) {
              igCommentMeta = { commentPosted: false, commentError: igCe?.message || 'IG comment error' };
            }
            igResult = { ok: true, mediaId, ...igCommentMeta };
          } else {
            igResult = { ok: false, error: pubJson?.error?.message || `IG publish HTTP ${pubRes.status}` };
          }
        } else {
          igResult = { ok: false, error: 'IG Reel container did not reach FINISHED status in time' };
        }
      } else {
        igResult = { ok: false, error: cJson?.error?.message || `IG media container HTTP ${cRes.status}` };
      }
    }
  } catch (e: any) {
    igResult = { ok: false, error: e?.message || 'IG Business check error' };
  }

  return { facebook: fbResult, instagram: igResult };
}

async function publishReelToYouTubeShorts(
  filePath: string,
  title: string,
  description: string,
  firstCommentText: string
): Promise<NonNullable<AutoReelPublishHistoryItem['youtube']>> {
  const token = await getValidYouTubeAccessTokenFromDb();
  if (!token) {
    return { ok: false, error: 'YouTube OAuth not connected' };
  }

  try {
    const fileBuf = fs.readFileSync(filePath);
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(fileBuf.length),
          'X-Upload-Content-Type': 'video/mp4'
        },
        body: JSON.stringify({
          snippet: {
            title: title.slice(0, 98),
            description: description.slice(0, 4900),
            categoryId: '22',
            tags: ['VintageVibesAlAin', 'ThriftUAE', 'AlAin', 'VintageStreetwear', 'Shorts']
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false
          }
        }),
        signal: AbortSignal.timeout(12000)
      }
    );

    if (!initRes.ok) {
      const errJson: any = await initRes.json().catch(() => null);
      return { ok: false, error: errJson?.error?.message || `YouTube upload init HTTP ${initRes.status}` };
    }

    const uploadUrl = initRes.headers.get('location') || '';
    if (!uploadUrl) {
      return { ok: false, error: 'YouTube resumable upload missing Location header' };
    }

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileBuf.length)
      },
      body: new Uint8Array(fileBuf),
      signal: AbortSignal.timeout(45000)
    });
    const putJson: any = await putRes.json().catch(() => null);
    if (!putRes.ok || !putJson?.id) {
      return { ok: false, error: putJson?.error?.message || `YouTube video upload HTTP ${putRes.status}` };
    }

    const videoId = String(putJson.id);
    const privacyStatus = String(putJson?.status?.privacyStatus || 'public');

    // Automatically post First Comment with Vintage Live & Vintage Catalogue links
    let commentMeta: { commentPosted?: boolean; commentId?: string; commentError?: string } = {};
    for (let attempt = 1; attempt <= 2; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 4000 : 5000));
      try {
        const cmRes = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({
            snippet: {
              videoId,
              topLevelComment: {
                snippet: {
                  textOriginal: firstCommentText
                }
              }
            }
          }),
          signal: AbortSignal.timeout(12000)
        });
        const cmJson: any = await cmRes.json().catch(() => null);
        if (cmRes.ok && cmJson?.id) {
          commentMeta = { commentPosted: true, commentId: String(cmJson.id) };
          break;
        }
        if (attempt === 2) {
          commentMeta = {
            commentPosted: false,
            commentError: cmJson?.error?.message || `YouTube comment HTTP ${cmRes.status}`
          };
        }
      } catch (ce: any) {
        if (attempt === 2) {
          commentMeta = { commentPosted: false, commentError: ce?.message || 'YouTube comment error' };
        }
      }
    }

    return {
      ok: true,
      videoId,
      privacyStatus,
      url: `https://youtube.com/shorts/${videoId}`,
      ...commentMeta
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'YouTube upload error' };
  }
}

export async function publishNextVintageReelNow(specificFileName?: string): Promise<{
  success: boolean;
  entry?: AutoReelPublishHistoryItem;
  error?: string;
}> {
  if (publishInFlight) {
    return await publishInFlight;
  }

  publishInFlight = (async () => {
    const available = listAvailableReelFiles();
    if (available.length === 0) {
      return { success: false, error: 'No generated_reels/*.mp4 files available to publish' };
    }

    const state = loadState();
    let chosenFile = '';
    if (specificFileName && available.includes(specificFileName)) {
      chosenFile = specificFileName;
    } else {
      chosenFile = available.find((f) => !state.publishedFiles.includes(f)) || '';
      if (!chosenFile) {
        state.publishedFiles = [];
        chosenFile = available[0];
      }
    }

    const filePath = path.join(getReelsDir(), chosenFile);
    const publicVideoUrl = `https://vintagevibesgk.com/generated_reels/${encodeURIComponent(chosenFile)}`;
    const skuHint = extractSkuHint(chosenFile);
    const skuShort = skuHint.length > 26 ? skuHint.slice(-14) : skuHint;

    const title = chosenFile.startsWith('Vintage_Vibes_Cinema_Movie_')
      ? chosenFile.includes('Hollywood_Grail_Trailer')
        ? 'Vintage Vibes Al Ain 🎬 1-of-1 Grail Archive & Store Trailer #Shorts'
        : chosenFile.includes('Urdu_Live_Promo')
        ? 'Vintage Vibes Al Ain 🔥 Branded Jackets & Live Thrift Drop (AED 10-25) #Shorts'
        : chosenFile.includes('AlAin_Store_Tour_Arabic')
        ? 'جولة في متجر فينتاج فايبز العين ✨ ملابس براندات أصلية في الإمارات #Shorts'
        : chosenFile.includes('Jackets_And_Streetwear_Cut')
        ? "Vintage Vibes UAE 🔥 Original Levi's Denim, Flannel & Streetwear Drop #Shorts"
        : 'Vintage Vibes Al Ain 🎬 Official Store & 1-of-1 Grail Drop #Shorts'
      : `Vintage Vibes Al Ain 🔥 1-of-1 Branded Vintage Drop (${skuShort}) #Shorts`;
    const firstCommentText =
      `🔴 Watch Vintage Vibes LIVE (0.2s Zero-Delay & 1-Tap Claim):\n` +
      `👉 https://vintagevibesgk.com/live/\n\n` +
      `🛍️ Shop Full 1-of-1 Vintage Catalogue (UAE Delivery):\n` +
      `👉 https://vintagevibesgk.com/\n\n` +
      `📸 Follow All Official Pages:\n` +
      `👉 https://vintagevibesgk.com/follow/`;
    const caption =
      `🔥 1-of-1 Authentic Branded Vintage Piece — Vintage Vibes General Trading LLC SPC (Al Ain, UAE)!\n` +
      `👇 Live Stream & Full Catalogue Links in Comment Box!\n` +
      `🔴 Vintage Live: https://vintagevibesgk.com/live/\n` +
      `🛍️ Vintage Catalogue: https://vintagevibesgk.com/\n` +
      `📸 Follow Instagram: https://www.instagram.com/vintage.vibe006/\n` +
      `🌐 All Links & Counter QR: https://vintagevibesgk.com/follow/\n` +
      `#VintageVibesAlAin #ThriftUAE #AlAinShopping #DubaiStreetwear #1of1Vintage #Shorts`;

    console.log(`[AutoReelPublisher] 🎬 Publishing official Reel ${chosenFile} (${skuHint}) with First-Comment Links...`);

    const [fbAndIg, ytResult] = await Promise.all([
      publishReelToFacebookAndIgBusiness(publicVideoUrl, title, caption, firstCommentText),
      publishReelToYouTubeShorts(filePath, title, caption, firstCommentText)
    ]);

    const entry: AutoReelPublishHistoryItem = {
      timestamp: new Date().toISOString(),
      fileName: chosenFile,
      skuHint,
      facebook: fbAndIg.facebook,
      instagram: fbAndIg.instagram,
      youtube: ytResult
    };

    if (!state.publishedFiles.includes(chosenFile)) {
      state.publishedFiles.push(chosenFile);
    }
    state.lastPublishedAt = entry.timestamp;
    state.history = [entry, ...state.history].slice(0, 40);
    saveState(state);

    console.log(
      `[AutoReelPublisher] ✅ Publish result for ${chosenFile}: FB=${fbAndIg.facebook.ok} YT=${ytResult.ok} (${ytResult.url || ytResult.error || ''}) IG=${fbAndIg.instagram.ok}`
    );

    return {
      success: Boolean(fbAndIg.facebook.ok || ytResult.ok || fbAndIg.instagram.ok),
      entry
    };
  })().finally(() => {
    publishInFlight = null;
  });

  return await publishInFlight;
}

export function getAutoReelPublisherStatus() {
  const state = loadState();
  const availableReels = listAvailableReelFiles();
  return {
    enabled: state.enabled,
    intervalHours: state.intervalHours,
    lastPublishedAt: state.lastPublishedAt,
    publishedCount: state.publishedFiles.length,
    totalReelsAvailable: availableReels.length,
    nextQueuedReel: availableReels.find((f) => !state.publishedFiles.includes(f)) || availableReels[0] || null,
    history: state.history.slice(0, 15)
  };
}

export function setAutoReelPublisherEnabled(enabled: boolean, intervalHours: number = 12) {
  const state = loadState();
  state.enabled = Boolean(enabled);
  if (intervalHours > 0) {
    state.intervalHours = Math.max(4, Math.min(72, Number(intervalHours) || 12));
  }
  saveState(state);
  return getAutoReelPublisherStatus();
}

export function startAutoReelPublisherDaemon() {
  if (publisherDaemonTimer) return;
  loadState();
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  publisherDaemonTimer = setInterval(() => {
    try {
      const state = loadState();
      if (!state.enabled) return;
      if (isBoothActuallyStreamingOnServer('booth-1')) return;
      const elapsedMs = state.lastPublishedAt ? Date.now() - Date.parse(state.lastPublishedAt) : Infinity;
      const dueMs = Math.max(4, state.intervalHours || 12) * 3600 * 1000;
      if (elapsedMs >= dueMs) {
        publishNextVintageReelNow().catch(() => {});
      }
    } catch (_) {}
  }, CHECK_INTERVAL_MS);
  publisherDaemonTimer.unref?.();
  console.log('[AutoReelPublisher] 🤖 Daily Official Auto-Reel & YouTube Shorts Agent initialized (12h schedule).');
}

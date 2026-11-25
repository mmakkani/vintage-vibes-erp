import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  loadDeskMarketingConfig,
  saveDeskMarketingConfig,
  DEFAULT_VIP_LIVE_ALERT_TEMPLATE
} from './deskMarketingConfig.ts';
import { streamController } from '../../server/streamController.ts';
import { socialChatService } from './socialChatService.ts';
import { baileysManager } from '../marketing/baileys.service.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { decryptCredential } from '../../utils/encryption.ts';

export const deskMarketingRouter = Router();

const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_1187895707226100';
const OFFICIAL_FB_PAGE_ID = '1436686246201829';

async function resolveMetaTokens(): Promise<{ sysTok: string; fbPageTok: string }> {
  let sysTok = String(process.env.META_SYSTEM_USER_TOKEN || '').trim();
  let fbPageTok = '';
  const client = await getPgClient();
  if (client) {
    try {
      const r = await client.query(
        `SELECT id, metadata FROM public.booth_social_channels WHERE platform ILIKE '%facebook%' ORDER BY updated_at DESC NULLS LAST`
      );
      for (const row of r.rows || []) {
        const meta = row.metadata || {};
        const tok = decryptCredential(meta.fbAccessToken || '').trim();
        if (tok && String(meta.fbTargetId || '') === OFFICIAL_FB_PAGE_ID) {
          fbPageTok = tok;
        } else if (tok && !fbPageTok) {
          fbPageTok = tok;
        }
      }
    } catch (_) {
    } finally {
      await client.end().catch(() => {});
    }
  }
  return { sysTok, fbPageTok };
}

deskMarketingRouter.get('/overview', async (req, res) => {
  try {
    const boothId = String(req.query.boothId || 'booth-1').toLowerCase();
    const config = loadDeskMarketingConfig();
    const booth = streamController.getBooth(boothId);
    const socialStatus = socialChatService.getBoothSocialChatStatus(boothId);

    // 1. WhatsApp & VIP Community Live Status
    const waSession = await baileysManager.getSession('usr-admin-1');
    const vipStatePath = path.join(process.cwd(), '.data', 'vip_community_state.json');
    let vipRaw: any = {};
    try {
      if (fs.existsSync(vipStatePath)) {
        vipRaw = JSON.parse(fs.readFileSync(vipStatePath, 'utf8') || '{}');
      }
    } catch (_) {}

    const whatsapp = {
      connected: Boolean((waSession as any)?.isConnected || waSession?.status === 'CONNECTED'),
      status: waSession?.status || 'DISCONNECTED',
      phoneNumber: waSession?.phoneNumber || '+971554186086',
      qrCodeDataUrl: waSession?.qrCodeDataUrl || waSession?.qrCode || '',
      lastActive: waSession?.lastActive || '',
      vipCommunity: {
        communityJid: vipRaw.communityJid || '',
        announcementJid: vipRaw.announcementJid || '',
        inviteUrl: vipRaw.inviteUrl || 'https://chat.whatsapp.com/D2fV4gkVV5j21Yt5lZUr91',
        addedCount: Array.isArray(vipRaw.addedPhones) ? vipRaw.addedPhones.length : 0,
        invitedCount: Array.isArray(vipRaw.inviteDmSentPhones) ? vipRaw.inviteDmSentPhones.length : 0,
        pendingCount: Array.isArray(vipRaw.pendingPhones) ? vipRaw.pendingPhones.length : 0,
        lastLiveSessionAlertAt: vipRaw.lastLiveSessionAlertAt || 0,
        liveSessionAlertsCount: vipRaw.liveSessionAlertsCount || 0,
        rateLimitBackoffUntil: vipRaw.rateLimitBackoffUntil || 0
      }
    };

    // 2. Live Chat Overview
    const comments = streamController.getComments(boothId);
    const liveChat = {
      boothId,
      isBroadcasting: Boolean(booth?.isBroadcasting),
      activeFbLiveVideoId: booth?.activeFbLiveVideoId || socialStatus?.platforms?.facebook?.videoId || '',
      commentsCount: comments.length,
      maxLiveComments: config.maxLiveComments,
      recentComments: comments.slice(0, 80),
      socialStatus
    };

    // 3. Meta Ads & Follower Milestone Live Telemetry
    let pageFollowers = 0;
    try {
      const fmPath = path.join(process.cwd(), 'logs', 'follower_milestone_state.json');
      if (fs.existsSync(fmPath)) {
        const fm = JSON.parse(fs.readFileSync(fmPath, 'utf8') || '{}');
        pageFollowers = Number(fm.lastFollowerCount || 0);
      }
    } catch (_) {}

    const { sysTok, fbPageTok } = await resolveMetaTokens();
    if (fbPageTok) {
      try {
        const pr = await fetch(
          `https://graph.facebook.com/v21.0/${OFFICIAL_FB_PAGE_ID}?fields=followers_count,fan_count&access_token=${encodeURIComponent(fbPageTok)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (pr.ok) {
          const pj: any = await pr.json();
          if (pj?.followers_count || pj?.fan_count) {
            pageFollowers = Number(pj.followers_count || pj.fan_count);
          }
        }
      } catch (_) {}
    }

    let adSets: any[] = [];
    let accountSpendTodayAed = 0;
    if (sysTok) {
      try {
        const [asRes, insRes] = await Promise.all([
          fetch(
            `https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/adsets?fields=id,name,status,effective_status,daily_budget,campaign{name}&limit=20&access_token=${encodeURIComponent(sysTok)}`,
            { signal: AbortSignal.timeout(5000) }
          ),
          fetch(
            `https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/insights?level=adset&date_preset=today&fields=adset_id,spend,impressions,clicks&limit=30&access_token=${encodeURIComponent(sysTok)}`,
            { signal: AbortSignal.timeout(5000) }
          )
        ]);
        const insMap = new Map<string, any>();
        if (insRes.ok) {
          const ij: any = await insRes.json();
          for (const row of ij?.data || []) {
            insMap.set(String(row.adset_id), row);
            accountSpendTodayAed += Number(row.spend || 0);
          }
        }
        if (asRes.ok) {
          const aj: any = await asRes.json();
          adSets = (aj?.data || []).map((a: any) => {
            const ins = insMap.get(String(a.id)) || {};
            return {
              id: String(a.id),
              name: String(a.name || ''),
              campaignName: String(a.campaign?.name || ''),
              status: String(a.status || 'PAUSED'),
              effectiveStatus: String(a.effective_status || a.status || 'PAUSED'),
              dailyBudgetAed: Number(a.daily_budget || 0) / 100,
              spendTodayAed: Number(ins.spend || 0),
              impressionsToday: Number(ins.impressions || 0),
              clicksToday: Number(ins.clicks || 0)
            };
          });
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      config,
      defaultAlertTemplate: DEFAULT_VIP_LIVE_ALERT_TEMPLATE,
      whatsapp,
      liveChat,
      metaAds: {
        adAccountId: META_AD_ACCOUNT_ID,
        configured: Boolean(sysTok),
        officialPageFollowers: pageFollowers,
        spendTodayAed: Number(accountSpendTodayAed.toFixed(2)),
        adSets
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to load Desk Marketing overview' });
  }
});

deskMarketingRouter.post('/config', (req, res) => {
  try {
    const saved = saveDeskMarketingConfig(req.body || {});
    return res.json({ success: true, config: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to save config' });
  }
});

deskMarketingRouter.post('/upload-banner', (req, res) => {
  try {
    const dataUrl = String(req.body?.imageBase64 || '').trim();
    const m = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
    if (!m) {
      return res.status(400).json({ success: false, error: 'Invalid image format. Use JPG, PNG, or WebP.' });
    }
    const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 1024 || buf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Banner image must be between 1 KB and 8 MB.' });
    }
    const fileName = `vv_custom_live_alert_banner.${ext}`;
    const pubPath = path.join(process.cwd(), 'public', fileName);
    fs.mkdirSync(path.dirname(pubPath), { recursive: true });
    fs.writeFileSync(pubPath, buf);
    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      try {
        fs.writeFileSync(path.join(distDir, fileName), buf);
      } catch (_) {}
    }
    const config = saveDeskMarketingConfig({ vipLiveAlertBannerPath: `/${fileName}?v=${Date.now()}`.split('?')[0] });
    return res.json({ success: true, bannerUrl: `/${fileName}?t=${Date.now()}`, config });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Banner upload failed' });
  }
});

deskMarketingRouter.post('/whatsapp/send-live-alert', async (req, res) => {
  try {
    const boothId = String(req.body?.boothId || 'booth-1').toLowerCase();
    const result = await baileysManager.dispatchLiveSessionStartToVipCommunity({
      boothId,
      force: true
    });
    return res.json({ success: Boolean(result.sent), ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to send Live Alert' });
  }
});

deskMarketingRouter.post('/whatsapp/generate-qr', async (_req, res) => {
  try {
    const sess = await baileysManager.generateFreshQr('usr-admin-1', 'Murtaza Boss', true);
    return res.json({ success: true, session: sess });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to generate QR' });
  }
});

deskMarketingRouter.post('/live-chat/clear', (req, res) => {
  try {
    const boothId = String(req.body?.boothId || 'booth-1').toLowerCase();
    streamController.clearComments(boothId, false);
    return res.json({ success: true, boothId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to clear chat' });
  }
});

deskMarketingRouter.post('/live-chat/send-promo', async (req, res) => {
  try {
    const boothId = String(req.body?.boothId || 'booth-1').toLowerCase();
    const cfg = loadDeskMarketingConfig();
    const text = String(req.body?.text || cfg.livePromoText || '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'Promo text is empty' });
    streamController.addComment(boothId, text, 'custom', '📢 Vintage Vibes Host');
    const bcast = await socialChatService.broadcastHostMessageToAllPlatforms(boothId, text, '📢 Vintage Vibes Host');
    return res.json({ success: true, broadcast: bcast });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to send promo' });
  }
});

deskMarketingRouter.post('/meta-ads/update', async (req, res) => {
  try {
    const adSetId = String(req.body?.adSetId || '').trim();
    if (!/^\d{8,25}$/.test(adSetId)) {
      return res.status(400).json({ success: false, error: 'Invalid Meta Ad Set ID' });
    }
    const { sysTok } = await resolveMetaTokens();
    if (!sysTok) {
      return res.status(400).json({ success: false, error: 'META_SYSTEM_USER_TOKEN not configured on server' });
    }
    const form = new URLSearchParams({ access_token: sysTok });
    if (req.body?.status === 'ACTIVE' || req.body?.status === 'PAUSED') {
      form.set('status', req.body.status);
    }
    if (req.body?.dailyBudgetAed !== undefined) {
      const aed = Number(req.body.dailyBudgetAed);
      if (!Number.isFinite(aed) || aed < 5 || aed > 500) {
        return res.status(400).json({ success: false, error: 'Daily budget must be between AED 5 and AED 500' });
      }
      form.set('daily_budget', String(Math.round(aed * 100)));
    }
    const r = await fetch(`https://graph.facebook.com/v21.0/${adSetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000)
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {
      return res.status(400).json({ success: false, error: j?.error?.message || `Meta HTTP ${r.status}` });
    }
    return res.json({ success: true, adSetId, updated: j });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Meta Ads update failed' });
  }
});

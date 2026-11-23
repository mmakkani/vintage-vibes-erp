import crypto from 'crypto';
import https from 'https';
import { getPgClient } from '../../db/pgPool.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { decryptCredential, encryptCredential } from '../../utils/encryption.ts';
import { marketingService } from './marketing.service.ts';
import { baileysManager } from './baileys.service.ts';
import { getAutoReelPublisherStatus } from '../liveStreaming/socialReelAutoPublisher.ts';

export const META_APP_ID_DEFAULT = '1201668038973451';
export const META_BUSINESS_ID_DEFAULT = '1708532450859291';
export const DEFAULT_WEBHOOK_VERIFY_TOKEN = 'vv_meta_verified_2026';

export interface MetaGraphFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  jsonBody?: any;
  formBody?: Record<string, string>;
  bearerToken?: string;
  timeoutMs?: number;
  preferIpv4Https?: boolean;
}

export interface MetaGraphFetchResult {
  ok: boolean;
  status: number;
  data: any;
  error?: string;
}

export interface IgAutoDmConfig {
  enabled: boolean;
  keywords: string[];
  replyTemplate: string;
  cooldownMinutes: number;
}

export interface IgAutoDmRecord {
  timestamp: string;
  boothId: string;
  commentId: string;
  username: string;
  keywordMatched?: string;
  sent: boolean;
  error?: string;
  messageId?: string;
}

export interface WhatsAppWebhookEventRecord {
  timestamp: string;
  kind: 'status' | 'inbound_message';
  messageId?: string;
  status?: string;
  fromOrRecipient?: string;
  preview?: string;
}

function getBoothAliases(boothId: string): string[] {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const p = n < 10 ? `0${n}` : `${n}`;
    return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
  }
  return [raw];
}

function normalizeBoothId(boothId?: string): string {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
  return `booth-${num}`;
}

function normalizePhoneDigits(rawPhone?: string | null): string {
  let cleanDigits = String(rawPhone || '').replace(/\D/g, '');
  if (!cleanDigits) return '';
  if (cleanDigits.startsWith('00') && cleanDigits.length > 10) {
    cleanDigits = cleanDigits.slice(2);
  }
  if (cleanDigits.length === 10 && cleanDigits.startsWith('05')) {
    cleanDigits = `971${cleanDigits.slice(1)}`;
  } else if (
    cleanDigits.length === 9 &&
    (cleanDigits.startsWith('50') ||
      cleanDigits.startsWith('52') ||
      cleanDigits.startsWith('54') ||
      cleanDigits.startsWith('55') ||
      cleanDigits.startsWith('56') ||
      cleanDigits.startsWith('58'))
  ) {
    cleanDigits = `971${cleanDigits}`;
  } else if (cleanDigits.length === 11 && cleanDigits.startsWith('03')) {
    cleanDigits = `92${cleanDigits.slice(1)}`;
  }
  return cleanDigits;
}

/**
 * IPv4-safe Meta Graph API fetch helper supporting GET/POST (JSON or Form) with non-pooled IPv4 HTTPS fallback.
 */
export async function fetchMetaGraphJson(
  urlStr: string,
  opts: MetaGraphFetchOptions = {}
): Promise<MetaGraphFetchResult> {
  const method = opts.method || 'GET';
  const timeoutMs = opts.timeoutMs || 8000;
  const headers: Record<string, string> = {
    Connection: 'close',
    'User-Agent': 'VintageVibe-MetaBusinessHub/1.0',
    ...(opts.headers || {})
  };
  if (opts.bearerToken) {
    headers.Authorization = `Bearer ${opts.bearerToken}`;
  }

  let bodyStr: string | undefined;
  if (opts.jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json; charset=UTF-8';
    bodyStr = JSON.stringify(opts.jsonBody);
  } else if (opts.formBody !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    bodyStr = new URLSearchParams(opts.formBody).toString();
  }

  const httpsRequestIpv4 = () =>
    new Promise<MetaGraphFetchResult>((resolve) => {
      try {
        const u = new URL(urlStr);
        const reqHeaders: Record<string, string> = { ...headers };
        if (bodyStr !== undefined) {
          reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr, 'utf8'));
        }
        const req = https.request(
          {
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method,
            family: 4,
            agent: false,
            timeout: timeoutMs,
            headers: reqHeaders
          },
          (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              raw += chunk;
            });
            res.on('end', () => {
              const status = res.statusCode || 0;
              let data: any = null;
              try {
                data = raw ? JSON.parse(raw) : null;
              } catch (_) {}
              const ok = status >= 200 && status < 300;
              const error = ok ? undefined : data?.error?.message || `HTTP ${status}`;
              resolve({ ok, status, data, error });
            });
          }
        );
        req.on('timeout', () => {
          req.destroy(new Error(`HTTPS IPv4 timeout after ${timeoutMs}ms`));
        });
        req.on('error', (err) => {
          resolve({ ok: false, status: 0, data: null, error: err?.message || 'HTTPS IPv4 error' });
        });
        if (bodyStr !== undefined) {
          req.write(bodyStr);
        }
        req.end();
      } catch (err: any) {
        resolve({ ok: false, status: 0, data: null, error: err?.message || 'Invalid URL' });
      }
    });

  if (opts.preferIpv4Https) {
    return await httpsRequestIpv4();
  }

  try {
    const res = await fetch(urlStr, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const data: any = await res.json().catch(() => null);
    if (res.ok) {
      return { ok: true, status: res.status, data };
    }
    return {
      ok: false,
      status: res.status,
      data,
      error: data?.error?.message || `HTTP ${res.status}`
    };
  } catch (_) {
    // Fallback to non-pooled IPv4 HTTPS when undici/IPv6 stalls on half-open keep-alive sockets
    return await httpsRequestIpv4();
  }
}

class MetaBusinessHubService {
  private igAutoDmConfig: IgAutoDmConfig = {
    enabled: true,
    keywords: [
      'PRICE',
      'LINK',
      'MINE',
      'CLAIM',
      'BUY',
      'INFO',
      'DETAILS',
      'HOW MUCH',
      'KITNE',
      'RATE',
      'SHOP',
      'LIVE',
      'DM'
    ],
    replyTemplate:
      `✨ Salaam {{username}}! Thanks for reaching out to Vintage Vibes Official (Al Ain, UAE)!\n\n` +
      `🔴 Watch Our 0.2s Zero-Delay Live Drop & 1-Tap Claim:\nhttps://vintagevibesgk.com/live/\n\n` +
      `🛍️ Shop All 1-of-1 Branded Vintage Pieces:\nhttps://vintagevibesgk.com/\n\n` +
      `📲 VIP Concierge WhatsApp:\nhttps://wa.me/971554186086`,
    cooldownMinutes: 5
  };

  private seenIgCommentIds: Set<string> = new Set();
  private igUserCooldownMap: Map<string, number> = new Map();
  private recentIgAutoDms: IgAutoDmRecord[] = [];
  private recentWaEvents: WhatsAppWebhookEventRecord[] = [];

  public getAppId(): string {
    return String(process.env.META_APP_ID || process.env.FB_APP_ID || META_APP_ID_DEFAULT).trim();
  }

  public getBusinessId(): string {
    return String(process.env.META_BUSINESS_ID || META_BUSINESS_ID_DEFAULT).trim();
  }

  public getWebhookVerifyToken(): string {
    const envTok = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
    if (envTok) return envTok;
    const cfgTok = String(marketingService.getWhatsAppGatewayConfig()?.metaCloudConfig?.webhookVerifyToken || '').trim();
    if (cfgTok) return cfgTok;
    return DEFAULT_WEBHOOK_VERIFY_TOKEN;
  }

  public getAppSecret(): string {
    return String(process.env.META_APP_SECRET || process.env.FB_APP_SECRET || '').trim();
  }

  public getWhatsAppCloudCredentials(): {
    phoneNumberId: string;
    accessToken: string;
    wabaId: string;
    source: 'env' | 'gateway_config' | 'none';
  } {
    const envPhoneId = String(
      process.env.META_WA_PHONE_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID || ''
    ).trim();
    const envToken = String(
      process.env.META_WA_TOKEN || process.env.META_WHATSAPP_ACCESS_TOKEN || ''
    ).trim();
    const envWabaId = String(process.env.META_WABA_ID || '').trim();

    if (envPhoneId && envToken) {
      return {
        phoneNumberId: envPhoneId,
        accessToken: envToken,
        wabaId: envWabaId,
        source: 'env'
      };
    }

    const mc = marketingService.getWhatsAppGatewayConfig()?.metaCloudConfig;
    const cfgPhoneId = String(mc?.phoneNumberId || '').trim();
    const cfgToken = String(mc?.accessToken || '').trim();
    const cfgWabaId = String(mc?.wabaId || envWabaId || '').trim();
    if (mc?.enabled && cfgPhoneId && cfgToken) {
      return {
        phoneNumberId: cfgPhoneId,
        accessToken: cfgToken,
        wabaId: cfgWabaId,
        source: 'gateway_config'
      };
    }

    return {
      phoneNumberId: '',
      accessToken: '',
      wabaId: envWabaId || cfgWabaId,
      source: 'none'
    };
  }

  public isWhatsAppCloudConfigured(): boolean {
    const creds = this.getWhatsAppCloudCredentials();
    return Boolean(creds.phoneNumberId && creds.accessToken);
  }

  public isWhatsAppCloudPrimary(): boolean {
    if (String(process.env.META_WA_PRIMARY || '').trim() === '1') return true;
    return marketingService.getWhatsAppGatewayConfig()?.connectionMode === 'META_CLOUD_API';
  }

  /**
   * Verifies Meta X-Hub-Signature-256 HMAC-SHA256 webhook signature when META_APP_SECRET is configured.
   */
  public verifyMetaWebhookSignature(req: any): {
    ok: boolean;
    mode: 'verified' | 'unconfigured_bypass' | 'non_meta_payload';
    reason?: string;
  } {
    const appSecret = this.getAppSecret();
    if (!appSecret) {
      return { ok: true, mode: 'unconfigured_bypass' };
    }

    const sigHeader = String(req?.headers?.['x-hub-signature-256'] || '').trim();
    if (!sigHeader) {
      const objType = String(req?.body?.object || '').trim();
      const isKnownMetaObj = ['page', 'instagram', 'whatsapp_business_account', 'threads'].includes(objType);
      if (isKnownMetaObj && String(process.env.META_WEBHOOK_ALLOW_UNSIGNED || '').trim() !== '1') {
        return { ok: false, mode: 'non_meta_payload', reason: 'MISSING_SIGNATURE' };
      }
      return { ok: true, mode: 'non_meta_payload' };
    }

    const rawBuf = Buffer.isBuffer(req?.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req?.body || {}), 'utf8');

    const expectedHex = crypto.createHmac('sha256', appSecret).update(rawBuf).digest('hex');
    const expectedSig = `sha256=${expectedHex}`;

    const givenBuf = Buffer.from(sigHeader, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
      return { ok: false, mode: 'verified', reason: 'INVALID_SIGNATURE' };
    }

    return { ok: true, mode: 'verified' };
  }

  /**
   * Connects a Verified Meta System User Token (never-expiring) or User/Page Token,
   * auto-discovers Facebook Pages, linked Instagram Business Account, and WhatsApp Business Accounts,
   * saves encrypted tokens into PostgreSQL booth_social_channels (DML only), and subscribes webhooks.
   */
  public async connectMetaBusinessToken(params: {
    accessToken: string;
    preferredPageId?: string;
    boothId?: string;
    subscribePageWebhook?: boolean;
  }): Promise<{
    success: boolean;
    boothId: string;
    actor?: { id: string; name: string };
    pagesFound: Array<{ id: string; name: string; hasIgBusiness: boolean; igUsername?: string }>;
    selectedPage: { id: string; name: string } | null;
    instagramAccount: { id: string; username: string; name?: string } | null;
    whatsappAccounts: Array<{
      wabaId: string;
      name: string;
      phoneNumbers: Array<{ id: string; displayPhoneNumber: string; verifiedName?: string }>;
    }>;
    webhookSubscribed: boolean;
    webhookSubscribeError?: string;
    grantedPermissions: string[];
    error?: string;
  }> {
    const cleanToken = String(params.accessToken || '').trim();
    const boothId = normalizeBoothId(params.boothId || 'booth-1');
    const aliases = getBoothAliases(boothId);
    const businessId = this.getBusinessId();
    const appId = this.getAppId();

    if (!cleanToken || cleanToken.length < 20) {
      return {
        success: false,
        boothId,
        pagesFound: [],
        selectedPage: null,
        instagramAccount: null,
        whatsappAccounts: [],
        webhookSubscribed: false,
        grantedPermissions: [],
        error: 'Valid Meta System User / Page access token is required.'
      };
    }

    const [meRes, permRes, accRes, bizPagesRes, wabaRes] = await Promise.all([
      fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`,
        { timeoutMs: 8000 }
      ),
      fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(cleanToken)}`,
        { timeoutMs: 8000 }
      ),
      fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(cleanToken)}`,
        { timeoutMs: 8000 }
      ),
      fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(businessId)}/owned_pages?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(cleanToken)}`,
        { timeoutMs: 8000 }
      ),
      fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(businessId)}/owned_whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number,verified_name}&access_token=${encodeURIComponent(cleanToken)}`,
        { timeoutMs: 8000 }
      )
    ]);

    if (!meRes.ok || !meRes.data?.id) {
      return {
        success: false,
        boothId,
        pagesFound: [],
        selectedPage: null,
        instagramAccount: null,
        whatsappAccounts: [],
        webhookSubscribed: false,
        grantedPermissions: [],
        error: meRes.error || 'Failed to validate Meta access token against Graph API /me.'
      };
    }

    const actor = {
      id: String(meRes.data.id),
      name: String(meRes.data.name || 'Meta Business Actor').trim()
    };

    const grantedPermissions: string[] = Array.isArray(permRes.data?.data)
      ? permRes.data.data
          .filter((p: any) => p?.status === 'granted' && p?.permission)
          .map((p: any) => String(p.permission))
      : [];

    // Deduplicate discovered pages by page ID, preserving richer entry (with access_token / instagram_business_account)
    const pageMap = new Map<string, any>();
    const absorbPages = (list: any[]) => {
      for (const p of list) {
        if (!p?.id) continue;
        const pid = String(p.id);
        const existing = pageMap.get(pid);
        if (!existing) {
          pageMap.set(pid, { ...p, id: pid });
        } else {
          pageMap.set(pid, {
            ...existing,
            ...p,
            id: pid,
            access_token: p.access_token || existing.access_token,
            instagram_business_account: p.instagram_business_account || existing.instagram_business_account
          });
        }
      }
    };

    if (Array.isArray(accRes.data?.data)) absorbPages(accRes.data.data);
    if (Array.isArray(bizPagesRes.data?.data)) absorbPages(bizPagesRes.data.data);

    const discoveredPages = Array.from(pageMap.values());
    const preferredId = String(params.preferredPageId || '').trim();
    const chosenPage =
      (preferredId ? discoveredPages.find((p) => p.id === preferredId) : null) ||
      discoveredPages.find((p) => p?.instagram_business_account?.id) ||
      discoveredPages[0] ||
      null;

    const chosenIg = chosenPage?.instagram_business_account?.id
      ? {
          id: String(chosenPage.instagram_business_account.id),
          username: String(chosenPage.instagram_business_account.username || 'vintage.vibe006').replace(/^@/, ''),
          name: chosenPage.instagram_business_account.name
            ? String(chosenPage.instagram_business_account.name)
            : undefined
        }
      : null;

    const whatsappAccounts = Array.isArray(wabaRes.data?.data)
      ? wabaRes.data.data.map((w: any) => ({
          wabaId: String(w.id || ''),
          name: String(w.name || 'WhatsApp Business Account'),
          phoneNumbers: Array.isArray(w?.phone_numbers?.data)
            ? w.phone_numbers.data.map((pn: any) => ({
                id: String(pn.id || ''),
                displayPhoneNumber: String(pn.display_phone_number || ''),
                verifiedName: pn.verified_name ? String(pn.verified_name) : undefined
              }))
            : []
        }))
      : [];

    const effectivePageToken = String(chosenPage?.access_token || cleanToken).trim();
    const encPageOrEffectiveToken = encryptCredential(effectivePageToken);
    const encMasterToken = encryptCredential(cleanToken);
    const nowIso = new Date().toISOString();

    const fbMetaPatch: Record<string, any> = {
      fbAppId: appId,
      fbBusinessId: businessId,
      fbTargetId: chosenPage ? chosenPage.id : 'me',
      fbPageId: chosenPage ? chosenPage.id : null,
      fbPageName: chosenPage ? String(chosenPage.name || actor.name) : null,
      fbAccessToken: encPageOrEffectiveToken,
      fbMasterToken: encMasterToken,
      fbTokenType: chosenPage ? 'BUSINESS_PAGE' : 'USER_OR_SYSTEM',
      fbConnectedAt: nowIso
    };

    const client = await getPgClient();
    if (client) {
      try {
        const fbUsername = chosenPage ? String(chosenPage.name || actor.name) : actor.name;
        await client.query(
          `INSERT INTO public.booth_social_channels
             (id, booth_id, platform, account_username, auth_status, is_active, otp_required, last_login_at, metadata, updated_at)
           VALUES ($1, $2, 'facebook', $3, 'LOGGED_IN', true, false, NOW(), $4::jsonb, NOW())
           ON CONFLICT (booth_id, platform) DO UPDATE SET
             account_username = EXCLUDED.account_username,
             auth_status = 'LOGGED_IN',
             is_active = true,
             otp_required = false,
             last_login_at = NOW(),
             metadata = COALESCE(public.booth_social_channels.metadata, '{}'::jsonb) || EXCLUDED.metadata,
             updated_at = NOW();`,
          [`${boothId}_facebook`, boothId, fbUsername, JSON.stringify(fbMetaPatch)]
        );

        await client
          .query(
            `UPDATE public.booth_social_channels
             SET account_username = $2,
                 auth_status = 'LOGGED_IN',
                 is_active = true,
                 otp_required = false,
                 last_login_at = NOW(),
                 metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                 updated_at = NOW()
             WHERE booth_id = ANY($1::text[]) AND platform = 'facebook'`,
            [aliases, fbUsername, JSON.stringify(fbMetaPatch)]
          )
          .catch(() => {});

        if (chosenIg) {
          const igUsernameHandle = `@${chosenIg.username}`;
          const igMetaPatch: Record<string, any> = {
            igUserId: chosenIg.id,
            igUsername: chosenIg.username,
            fbPageId: chosenPage?.id || null,
            fbBusinessId: businessId,
            accessToken: encPageOrEffectiveToken,
            igConnectedAt: nowIso
          };

          await client.query(
            `INSERT INTO public.booth_social_channels
               (id, booth_id, platform, account_username, auth_status, is_active, otp_required, last_login_at, metadata, updated_at)
             VALUES ($1, $2, 'instagram', $3, 'LOGGED_IN', true, false, NOW(), $4::jsonb, NOW())
             ON CONFLICT (booth_id, platform) DO UPDATE SET
               account_username = EXCLUDED.account_username,
               auth_status = 'LOGGED_IN',
               is_active = true,
               otp_required = false,
               last_login_at = NOW(),
               metadata = COALESCE(public.booth_social_channels.metadata, '{}'::jsonb) || EXCLUDED.metadata,
               updated_at = NOW();`,
            [`${boothId}_instagram`, boothId, igUsernameHandle, JSON.stringify(igMetaPatch)]
          );

          await client
            .query(
              `UPDATE public.booth_social_channels
               SET account_username = $2,
                   auth_status = 'LOGGED_IN',
                   is_active = true,
                   otp_required = false,
                   last_login_at = NOW(),
                   metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                   updated_at = NOW()
               WHERE booth_id = ANY($1::text[]) AND platform = 'instagram'`,
              [aliases, igUsernameHandle, JSON.stringify(igMetaPatch)]
            )
            .catch(() => {});
        }
      } finally {
        await client.end().catch(() => {});
      }
    }

    let webhookSubscribed = false;
    let webhookSubscribeError: string | undefined;
    if (chosenPage?.id && chosenPage?.access_token && params.subscribePageWebhook !== false) {
      const subRes = await fetchMetaGraphJson(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(chosenPage.id)}/subscribed_apps`,
        {
          method: 'POST',
          formBody: {
            subscribed_fields: 'feed,live_videos,messages,messaging_postbacks',
            access_token: String(chosenPage.access_token)
          },
          timeoutMs: 8000
        }
      );
      if (subRes.ok && subRes.data?.success !== false) {
        webhookSubscribed = true;
      } else {
        webhookSubscribeError = subRes.error || `HTTP ${subRes.status}`;
      }
    }

    return {
      success: true,
      boothId,
      actor,
      pagesFound: discoveredPages.map((p) => ({
        id: p.id,
        name: String(p.name || 'Facebook Page'),
        hasIgBusiness: Boolean(p?.instagram_business_account?.id),
        igUsername: p?.instagram_business_account?.username
          ? `@${String(p.instagram_business_account.username).replace(/^@/, '')}`
          : undefined
      })),
      selectedPage: chosenPage
        ? { id: chosenPage.id, name: String(chosenPage.name || 'Facebook Page') }
        : null,
      instagramAccount: chosenIg,
      whatsappAccounts,
      webhookSubscribed,
      ...(webhookSubscribeError ? { webhookSubscribeError } : {}),
      grantedPermissions
    };
  }

  public getIgAutoDmConfig(): IgAutoDmConfig {
    return {
      enabled: this.igAutoDmConfig.enabled,
      keywords: [...this.igAutoDmConfig.keywords],
      replyTemplate: this.igAutoDmConfig.replyTemplate,
      cooldownMinutes: this.igAutoDmConfig.cooldownMinutes
    };
  }

  public updateIgAutoDmConfig(updates: {
    enabled?: boolean;
    keywords?: string[];
    replyTemplate?: string;
    cooldownMinutes?: number;
  }): IgAutoDmConfig {
    if (typeof updates.enabled === 'boolean') {
      this.igAutoDmConfig.enabled = updates.enabled;
    }
    if (Array.isArray(updates.keywords) && updates.keywords.length > 0) {
      const cleaned = updates.keywords
        .map((k) => String(k || '').trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 40);
      if (cleaned.length > 0) this.igAutoDmConfig.keywords = cleaned;
    }
    if (typeof updates.replyTemplate === 'string' && updates.replyTemplate.trim()) {
      this.igAutoDmConfig.replyTemplate = updates.replyTemplate.trim().slice(0, 1000);
    }
    if (typeof updates.cooldownMinutes === 'number' && Number.isFinite(updates.cooldownMinutes)) {
      this.igAutoDmConfig.cooldownMinutes = Math.max(1, Math.min(60, Math.round(updates.cooldownMinutes)));
    }
    return this.getIgAutoDmConfig();
  }

  /**
   * Sends a private Instagram Comment-to-DM reply when a buyer comments a trigger keyword (PRICE, LINK, CLAIM, etc.).
   */
  public async handleInstagramCommentAutoDm(params: {
    boothId?: string;
    commentId: string;
    text: string;
    username: string;
    senderId?: string;
    mediaId?: string;
  }): Promise<{ triggered: boolean; sent: boolean; keywordMatched?: string; reason?: string; messageId?: string }> {
    if (!this.igAutoDmConfig.enabled) {
      return { triggered: false, sent: false, reason: 'IG_AUTO_DM_DISABLED' };
    }

    const commentId = String(params.commentId || '').trim();
    const text = String(params.text || '').trim();
    const boothId = normalizeBoothId(params.boothId || 'booth-1');
    const cleanUser = String(params.username || 'Collector').replace(/^@/, '').trim() || 'Collector';

    if (!commentId || !text) {
      return { triggered: false, sent: false, reason: 'MISSING_COMMENT_OR_TEXT' };
    }

    if (this.seenIgCommentIds.has(commentId)) {
      return { triggered: false, sent: false, reason: 'DUPLICATE_COMMENT_ID' };
    }

    const upperText = text.toUpperCase();
    const matchedKeyword = this.igAutoDmConfig.keywords.find((kw) => {
      if (!kw) return false;
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|[?!.,]|$)`, 'i').test(upperText);
    });
    if (!matchedKeyword) {
      return { triggered: false, sent: false, reason: 'NO_KEYWORD_MATCH' };
    }

    this.seenIgCommentIds.add(commentId);
    if (this.seenIgCommentIds.size > 3000) {
      const oldest = this.seenIgCommentIds.values().next().value;
      if (oldest) this.seenIgCommentIds.delete(oldest);
    }

    const cooldownKey = `${boothId}:${String(params.senderId || cleanUser).toLowerCase()}`;
    const cooldownMs = this.igAutoDmConfig.cooldownMinutes * 60 * 1000;
    const lastSentAt = this.igUserCooldownMap.get(cooldownKey) || 0;
    if (lastSentAt && Date.now() - lastSentAt < cooldownMs) {
      return { triggered: true, sent: false, keywordMatched: matchedKeyword, reason: 'COOLDOWN_ACTIVE' };
    }

    let igUserId = '';
    let igToken = '';
    const client = await getPgClient();
    if (client) {
      try {
        const aliases = getBoothAliases(boothId);
        const q = await client.query(
          `SELECT platform, account_password, auth_status, metadata
           FROM public.booth_social_channels
           WHERE booth_id = ANY($1::text[])
             AND platform IN ('instagram', 'facebook')
             AND is_active IS NOT FALSE
           ORDER BY (platform = 'instagram') DESC, (auth_status = 'LOGGED_IN') DESC, updated_at DESC NULLS LAST`,
          [aliases]
        );
        for (const row of q.rows || []) {
          const meta = row.metadata || {};
          const rawPwd = decryptCredential(String(row.account_password || '').trim());
          if (!igUserId && meta.igUserId) {
            igUserId = String(meta.igUserId).trim();
          }
          if (!igToken) {
            const candidate = String(
              meta.accessToken ||
                meta.fbAccessToken ||
                meta.pageAccessToken ||
                (rawPwd.startsWith('EAA') || rawPwd.startsWith('IG') ? rawPwd : '')
            ).trim();
            if (candidate) {
              igToken = decryptCredential(candidate).trim();
            }
          }
        }
      } catch (_) {
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (!igUserId || !igToken) {
      const rec: IgAutoDmRecord = {
        timestamp: new Date().toISOString(),
        boothId,
        commentId,
        username: `@${cleanUser}`,
        keywordMatched: matchedKeyword,
        sent: false,
        error: 'MISSING_IG_USER_OR_TOKEN'
      };
      this.recentIgAutoDms = [rec, ...this.recentIgAutoDms].slice(0, 30);
      return { triggered: true, sent: false, keywordMatched: matchedKeyword, reason: rec.error };
    }

    const messageText = this.igAutoDmConfig.replyTemplate.replace(/\{\{username\}\}/gi, `@${cleanUser}`);
    const dmRes = await fetchMetaGraphJson(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/messages`,
      {
        method: 'POST',
        bearerToken: igToken,
        jsonBody: {
          recipient: { comment_id: commentId },
          message: { text: messageText }
        },
        timeoutMs: 8000
      }
    );

    if (dmRes.ok) {
      this.igUserCooldownMap.set(cooldownKey, Date.now());
      if (this.igUserCooldownMap.size > 1000) {
        const oldestKey = this.igUserCooldownMap.keys().next().value;
        if (oldestKey) this.igUserCooldownMap.delete(oldestKey);
      }
    }

    const messageId = dmRes.data?.message_id ? String(dmRes.data.message_id) : undefined;
    const rec: IgAutoDmRecord = {
      timestamp: new Date().toISOString(),
      boothId,
      commentId,
      username: `@${cleanUser}`,
      keywordMatched: matchedKeyword,
      sent: Boolean(dmRes.ok),
      ...(messageId ? { messageId } : {}),
      ...(!dmRes.ok ? { error: dmRes.error || `HTTP ${dmRes.status}` } : {})
    };
    this.recentIgAutoDms = [rec, ...this.recentIgAutoDms].slice(0, 30);

    return {
      triggered: true,
      sent: Boolean(dmRes.ok),
      keywordMatched: matchedKeyword,
      ...(messageId ? { messageId } : {}),
      ...(!dmRes.ok ? { reason: rec.error } : {})
    };
  }

  /**
   * Sends an official Meta WhatsApp Cloud API message (text, HTTPS image, HTTPS document, or approved template).
   */
  public async sendWhatsAppCloudMessage(params: {
    to: string;
    text?: string;
    imageUrl?: string;
    documentUrl?: string;
    documentFilename?: string;
    templateName?: string;
    templateLang?: string;
    templateParams?: string[];
  }): Promise<{
    success: boolean;
    messageId?: string;
    provider: 'META_CLOUD_API';
    error?: string;
    statusCode?: number;
  }> {
    const creds = this.getWhatsAppCloudCredentials();
    if (!creds.phoneNumberId || !creds.accessToken) {
      return {
        success: false,
        provider: 'META_CLOUD_API',
        error: 'WhatsApp Cloud API credentials (phoneNumberId + accessToken) are not configured.'
      };
    }

    const digits = normalizePhoneDigits(params.to);
    if (!digits || digits.length < 8) {
      return {
        success: false,
        provider: 'META_CLOUD_API',
        error: 'Invalid recipient phone number for WhatsApp Cloud API.'
      };
    }

    let payload: Record<string, any>;
    const cleanTemplate = String(params.templateName || '').trim();
    const cleanDocUrl = String(params.documentUrl || '').trim();
    const cleanImgUrl = String(params.imageUrl || '').trim();
    const cleanText = String(params.text || '').trim();

    if (cleanTemplate) {
      const components =
        Array.isArray(params.templateParams) && params.templateParams.length > 0
          ? [
              {
                type: 'body',
                parameters: params.templateParams.map((val) => ({
                  type: 'text',
                  text: String(val || '')
                }))
              }
            ]
          : undefined;

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'template',
        template: {
          name: cleanTemplate,
          language: { code: String(params.templateLang || 'en_US').trim() },
          ...(components ? { components } : {})
        }
      };
    } else if (/^https:\/\//i.test(cleanDocUrl)) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'document',
        document: {
          link: cleanDocUrl,
          ...(params.documentFilename ? { filename: String(params.documentFilename) } : {}),
          ...(cleanText ? { caption: cleanText.slice(0, 1024) } : {})
        }
      };
    } else if (/^https:\/\//i.test(cleanImgUrl)) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'image',
        image: {
          link: cleanImgUrl,
          ...(cleanText ? { caption: cleanText.slice(0, 1024) } : {})
        }
      };
    } else {
      if (!cleanText) {
        return {
          success: false,
          provider: 'META_CLOUD_API',
          error: 'Message text, HTTPS media URL, or templateName is required.'
        };
      }
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'text',
        text: {
          preview_url: true,
          body: cleanText.slice(0, 4096)
        }
      };
    }

    const res = await fetchMetaGraphJson(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(creds.phoneNumberId)}/messages`,
      {
        method: 'POST',
        bearerToken: creds.accessToken,
        jsonBody: payload,
        timeoutMs: 8000
      }
    );

    if (res.ok) {
      const messageId = res.data?.messages?.[0]?.id ? String(res.data.messages[0].id) : undefined;
      return {
        success: true,
        messageId,
        provider: 'META_CLOUD_API',
        statusCode: res.status
      };
    }

    return {
      success: false,
      provider: 'META_CLOUD_API',
      statusCode: res.status,
      error: res.error || `Meta Cloud API HTTP ${res.status}`
    };
  }

  public recordWhatsAppWebhookEvent(event: Omit<WhatsAppWebhookEventRecord, 'timestamp'>) {
    const rec: WhatsAppWebhookEventRecord = {
      timestamp: new Date().toISOString(),
      kind: event.kind,
      ...(event.messageId ? { messageId: String(event.messageId) } : {}),
      ...(event.status ? { status: String(event.status) } : {}),
      ...(event.fromOrRecipient ? { fromOrRecipient: String(event.fromOrRecipient) } : {}),
      ...(event.preview ? { preview: String(event.preview).slice(0, 160) } : {})
    };
    this.recentWaEvents = [rec, ...this.recentWaEvents].slice(0, 40);
  }

  /**
   * Dispatches a verification ViewContent CAPI event directly to Meta Graph API v21.0 and returns Meta's ack.
   */
  public async sendTestCapiEvent(params?: { testEventCode?: string }): Promise<{
    ok: boolean;
    status: number;
    pixelId?: string;
    eventsReceived?: number;
    fbtraceId?: string;
    error?: string;
  }> {
    const prof: any = relationalStore.getCompanyProfile() || {};
    const pt = prof.pixelTracking || {};
    const pixelId = String(pt.metaPixelId || prof.metaPixelId || process.env.META_PIXEL_ID || '').trim();
    const token = String(
      pt.metaConversionsApiToken ||
        prof.metaConversionsApiToken ||
        process.env.META_CAPI_ACCESS_TOKEN ||
        process.env.META_SYSTEM_USER_TOKEN ||
        ''
    ).trim();
    const testCode = String(params?.testEventCode || pt.testEventCode || '').trim();

    if (!pixelId) {
      return { ok: false, status: 400, error: 'META_PIXEL_ID is not configured.' };
    }
    if (!token) {
      return { ok: false, status: 400, pixelId, error: 'META_CAPI_ACCESS_TOKEN is not configured.' };
    }

    const payload: Record<string, any> = {
      data: [
        {
          event_name: 'ViewContent',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `vv_capi_test_${Date.now()}`,
          action_source: 'website',
          event_source_url: 'https://vintagevibesgk.com/live/',
          user_data: {
            client_ip_address: '31.215.145.201',
            client_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VintageVibesERP/1.0'
          },
          custom_data: {
            currency: 'AED',
            content_name: 'Vintage Vibes Meta Business CAPI Diagnostic'
          }
        }
      ]
    };
    if (testCode) {
      payload.test_event_code = testCode;
    }

    const res = await fetchMetaGraphJson(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        jsonBody: payload,
        timeoutMs: 8000
      }
    );

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        pixelId,
        eventsReceived: Number(res.data?.events_received ?? 0),
        fbtraceId: res.data?.fbtrace_id ? String(res.data.fbtrace_id) : undefined
      };
    }

    return {
      ok: false,
      status: res.status,
      pixelId,
      error: res.error || `Meta CAPI HTTP ${res.status}`
    };
  }

  /**
   * Secret-free readiness scorecard for Meta Verified Business (Facebook Page, Instagram Business, WhatsApp Cloud, CAPI, Catalog, Auto-Reels).
   */
  public async getMetaBusinessReadinessStatus(rawBoothId = 'booth-1') {
    const boothId = normalizeBoothId(rawBoothId);
    const aliases = getBoothAliases(boothId);
    const appId = this.getAppId();
    const businessId = this.getBusinessId();

    const prof: any = relationalStore.getCompanyProfile() || {};
    const pt = prof.pixelTracking || {};
    const pixelId = String(pt.metaPixelId || prof.metaPixelId || process.env.META_PIXEL_ID || '').trim();
    const capiTokenSet = Boolean(
      String(
        pt.metaConversionsApiToken ||
          prof.metaConversionsApiToken ||
          process.env.META_CAPI_ACCESS_TOKEN ||
          process.env.META_SYSTEM_USER_TOKEN ||
          ''
      ).trim()
    );

    const waCloudCreds = this.getWhatsAppCloudCredentials();
    const baileysSession = baileysManager.getConnectedSession();
    const autoReels = getAutoReelPublisherStatus();

    let fbRow: any = null;
    let igRow: any = null;
    let thRow: any = null;

    const client = await getPgClient();
    if (client) {
      try {
        const q = await client.query(
          `SELECT booth_id, platform, account_username, auth_status, is_active, last_login_at, metadata
           FROM public.booth_social_channels
           WHERE booth_id = ANY($1::text[])
             AND platform IN ('facebook', 'instagram', 'threads')
           ORDER BY (auth_status = 'LOGGED_IN') DESC, updated_at DESC NULLS LAST`,
          [aliases]
        );
        for (const r of q.rows || []) {
          const plat = String(r.platform || '').toLowerCase();
          if (plat === 'facebook' && !fbRow) fbRow = r;
          if (plat === 'instagram' && !igRow) igRow = r;
          if (plat === 'threads' && !thRow) thRow = r;
        }
      } catch (_) {
      } finally {
        await client.end().catch(() => {});
      }
    }

    const fbMeta = fbRow?.metadata || {};
    const igMeta = igRow?.metadata || {};
    const fbTargetId = String(fbMeta.fbTargetId || fbMeta.fbPageId || '').trim() || null;
    const isFbPageConnected = Boolean(fbMeta.fbPageId || (fbTargetId && /^\d{6,25}$/.test(fbTargetId)));

    return {
      verified: true,
      businessName: 'Vintage Vibes Official',
      businessId,
      appName: 'Vintage Vibes Live',
      appId,
      appMode: 'Live',
      boothId,
      webhooks: {
        verifyTokenConfigured: Boolean(this.getWebhookVerifyToken()),
        appSecretHmacConfigured: Boolean(this.getAppSecret()),
        callbackUrls: {
          facebook: 'https://vintagevibesgk.com/api/live/webhooks/facebook',
          instagram: 'https://vintagevibesgk.com/api/live/webhooks/instagram',
          whatsapp: 'https://vintagevibesgk.com/api/live/webhooks/whatsapp'
        }
      },
      facebook: {
        connected: Boolean(fbRow && String(fbRow.auth_status || '').toUpperCase() === 'LOGGED_IN'),
        isPageTarget: isFbPageConnected,
        pageId: fbMeta.fbPageId || (isFbPageConnected ? fbTargetId : null),
        target: fbTargetId || 'me',
        accountName: fbRow?.account_username || null,
        tokenType: fbMeta.fbTokenType || (isFbPageConnected ? 'BUSINESS_PAGE' : 'USER_PROFILE'),
        hasToken: Boolean(fbMeta.fbAccessToken),
        lastLoginAt: fbRow?.last_login_at || null
      },
      instagram: {
        connected: Boolean(igRow && String(igRow.auth_status || '').toUpperCase() === 'LOGGED_IN'),
        igUserId: igMeta.igUserId || null,
        username: igMeta.igUsername ? `@${String(igMeta.igUsername).replace(/^@/, '')}` : igRow?.account_username || null,
        hasToken: Boolean(igMeta.accessToken),
        autoDm: this.getIgAutoDmConfig(),
        recentAutoDms: this.recentIgAutoDms.slice(0, 10)
      },
      threads: {
        connected: Boolean(thRow && String(thRow.auth_status || '').toUpperCase() === 'LOGGED_IN'),
        username: thRow?.account_username || null
      },
      whatsappCloudApi: {
        configured: Boolean(waCloudCreds.phoneNumberId && waCloudCreds.accessToken),
        primaryMode: this.isWhatsAppCloudPrimary(),
        source: waCloudCreds.source,
        phoneNumberId: waCloudCreds.phoneNumberId || null,
        wabaId: waCloudCreds.wabaId || null,
        baileysFallbackConnected: Boolean(baileysSession?.sock),
        recentWebhookEvents: this.recentWaEvents.slice(0, 10)
      },
      conversionsApi: {
        pixelId: pixelId || null,
        pixelConfigured: Boolean(pixelId),
        capiTokenConfigured: capiTokenSet,
        graphApiVersion: 'v21.0'
      },
      commerceCatalog: {
        feedUrl: 'https://vintagevibesgk.com/api/feed/meta-catalog.xml'
      },
      autoReels: {
        enabled: autoReels.enabled,
        intervalHours: autoReels.intervalHours,
        lastPublishedAt: autoReels.lastPublishedAt,
        totalReelsAvailable: autoReels.totalReelsAvailable,
        nextQueuedReel: autoReels.nextQueuedReel
      }
    };
  }
}

const globalForMetaHub = globalThis as unknown as { __vvMetaBusinessHub?: MetaBusinessHubService };
export const metaBusinessHub =
  globalForMetaHub.__vvMetaBusinessHub || (globalForMetaHub.__vvMetaBusinessHub = new MetaBusinessHubService());

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DeskMarketingConfig {
  maxLiveComments: number;
  genuineNewLiveGapMinutes: number;
  livePromoEnabled: boolean;
  livePromoIntervalMinutes: number;
  livePromoMinRealComments: number;
  livePromoText: string;
  liveAiAutoReplyEnabled: boolean;
  vipLiveAlertAutoSend: boolean;
  vipLiveAlertCooldownMinutes: number;
  vipLiveAlertBannerPath: string;
  vipLiveAlertTemplate: string;
  vipOnboardingPaused: boolean;
  vipOnboardingBatchSize: number;
  vipOnboardingIntervalMinutes: number;
  updatedAt: number;
}

export const DEFAULT_VIP_LIVE_ALERT_TEMPLATE =
  `🔴 *WE ARE LIVE NOW — FRESH DROP SESSION!* 🔥\n\n` +
  `*Vintage Vibes UAE* is *LIVE right now* showcasing fresh handpicked *100% Original Branded Pre-Loved Nike, Levi's, Carhartt, Tommy & Streetwear* from just *AED 15 – AED 45*! 👕✨\n\n` +
  `⚡ Every piece is *1-of-1* — simply comment *"MINE + PRICE"* in the live chat to claim yours first! Fast delivery across all UAE 🇦🇪🚚\n\n` +
  `👇 *Tap Below to Watch Live Now:*\n` +
  `🛍️ *Website Zero-Delay Live:* https://vintagevibesgk.com/live/\n` +
  `🔵 *Facebook Live:* {FB_LIVE_URL}\n` +
  `🔴 *YouTube Live:* https://www.youtube.com/@VintageVibesLLCSPC/live`;

export const DEFAULT_DESK_MARKETING_CONFIG: DeskMarketingConfig = {
  maxLiveComments: 500,
  genuineNewLiveGapMinutes: 25,
  livePromoEnabled: true,
  livePromoIntervalMinutes: 120,
  livePromoMinRealComments: 5,
  livePromoText: '📢 JOIN VIP WHATSAPP LIVE ALERTS (100% Private): https://chat.whatsapp.com/D2fV4gkVV5j21Yt5lZUr91',
  liveAiAutoReplyEnabled: false,
  vipLiveAlertAutoSend: true,
  vipLiveAlertCooldownMinutes: 75,
  vipLiveAlertBannerPath: '/vv_official_fb_cover_banner.jpg',
  vipLiveAlertTemplate: DEFAULT_VIP_LIVE_ALERT_TEMPLATE,
  vipOnboardingPaused: false,
  vipOnboardingBatchSize: 4,
  vipOnboardingIntervalMinutes: 45,
  updatedAt: 0
};

function getConfigFilePath(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'desk_marketing_config.json');
  }
  return path.join(process.cwd(), '.data', 'desk_marketing_config.json');
}

let cachedConfig: DeskMarketingConfig | null = null;
let cachedMtimeMs = 0;

function clampNum(val: any, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function loadDeskMarketingConfig(): DeskMarketingConfig {
  try {
    const fp = getConfigFilePath();
    if (!fs.existsSync(fp)) {
      return { ...DEFAULT_DESK_MARKETING_CONFIG };
    }
    const st = fs.statSync(fp);
    if (cachedConfig && st.mtimeMs === cachedMtimeMs) {
      return cachedConfig;
    }
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8') || '{}');
    const merged: DeskMarketingConfig = {
      maxLiveComments: clampNum(raw.maxLiveComments, 50, 2000, DEFAULT_DESK_MARKETING_CONFIG.maxLiveComments),
      genuineNewLiveGapMinutes: clampNum(raw.genuineNewLiveGapMinutes, 5, 240, DEFAULT_DESK_MARKETING_CONFIG.genuineNewLiveGapMinutes),
      livePromoEnabled: raw.livePromoEnabled !== undefined ? Boolean(raw.livePromoEnabled) : DEFAULT_DESK_MARKETING_CONFIG.livePromoEnabled,
      livePromoIntervalMinutes: clampNum(raw.livePromoIntervalMinutes, 15, 480, DEFAULT_DESK_MARKETING_CONFIG.livePromoIntervalMinutes),
      livePromoMinRealComments: clampNum(raw.livePromoMinRealComments, 0, 50, DEFAULT_DESK_MARKETING_CONFIG.livePromoMinRealComments),
      livePromoText: String(raw.livePromoText || DEFAULT_DESK_MARKETING_CONFIG.livePromoText).trim() || DEFAULT_DESK_MARKETING_CONFIG.livePromoText,
      liveAiAutoReplyEnabled: raw.liveAiAutoReplyEnabled !== undefined ? Boolean(raw.liveAiAutoReplyEnabled) : DEFAULT_DESK_MARKETING_CONFIG.liveAiAutoReplyEnabled,
      vipLiveAlertAutoSend: raw.vipLiveAlertAutoSend !== undefined ? Boolean(raw.vipLiveAlertAutoSend) : DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertAutoSend,
      vipLiveAlertCooldownMinutes: clampNum(raw.vipLiveAlertCooldownMinutes, 10, 480, DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertCooldownMinutes),
      vipLiveAlertBannerPath: String(raw.vipLiveAlertBannerPath || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertBannerPath).trim() || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertBannerPath,
      vipLiveAlertTemplate: String(raw.vipLiveAlertTemplate || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertTemplate).trim() || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertTemplate,
      vipOnboardingPaused: raw.vipOnboardingPaused !== undefined ? Boolean(raw.vipOnboardingPaused) : DEFAULT_DESK_MARKETING_CONFIG.vipOnboardingPaused,
      vipOnboardingBatchSize: clampNum(raw.vipOnboardingBatchSize, 1, 10, DEFAULT_DESK_MARKETING_CONFIG.vipOnboardingBatchSize),
      vipOnboardingIntervalMinutes: clampNum(raw.vipOnboardingIntervalMinutes, 15, 240, DEFAULT_DESK_MARKETING_CONFIG.vipOnboardingIntervalMinutes),
      updatedAt: Number(raw.updatedAt || st.mtimeMs || Date.now())
    };
    cachedConfig = merged;
    cachedMtimeMs = st.mtimeMs;
    return merged;
  } catch (_) {
    return { ...DEFAULT_DESK_MARKETING_CONFIG };
  }
}

export function saveDeskMarketingConfig(patch: Partial<DeskMarketingConfig>): DeskMarketingConfig {
  const current = loadDeskMarketingConfig();
  const next: DeskMarketingConfig = {
    maxLiveComments: patch.maxLiveComments !== undefined ? clampNum(patch.maxLiveComments, 50, 2000, current.maxLiveComments) : current.maxLiveComments,
    genuineNewLiveGapMinutes: patch.genuineNewLiveGapMinutes !== undefined ? clampNum(patch.genuineNewLiveGapMinutes, 5, 240, current.genuineNewLiveGapMinutes) : current.genuineNewLiveGapMinutes,
    livePromoEnabled: patch.livePromoEnabled !== undefined ? Boolean(patch.livePromoEnabled) : current.livePromoEnabled,
    livePromoIntervalMinutes: patch.livePromoIntervalMinutes !== undefined ? clampNum(patch.livePromoIntervalMinutes, 15, 480, current.livePromoIntervalMinutes) : current.livePromoIntervalMinutes,
    livePromoMinRealComments: patch.livePromoMinRealComments !== undefined ? clampNum(patch.livePromoMinRealComments, 0, 50, current.livePromoMinRealComments) : current.livePromoMinRealComments,
    livePromoText: patch.livePromoText !== undefined ? (String(patch.livePromoText).trim() || DEFAULT_DESK_MARKETING_CONFIG.livePromoText) : current.livePromoText,
    liveAiAutoReplyEnabled: patch.liveAiAutoReplyEnabled !== undefined ? Boolean(patch.liveAiAutoReplyEnabled) : current.liveAiAutoReplyEnabled,
    vipLiveAlertAutoSend: patch.vipLiveAlertAutoSend !== undefined ? Boolean(patch.vipLiveAlertAutoSend) : current.vipLiveAlertAutoSend,
    vipLiveAlertCooldownMinutes: patch.vipLiveAlertCooldownMinutes !== undefined ? clampNum(patch.vipLiveAlertCooldownMinutes, 10, 480, current.vipLiveAlertCooldownMinutes) : current.vipLiveAlertCooldownMinutes,
    vipLiveAlertBannerPath: patch.vipLiveAlertBannerPath !== undefined ? (String(patch.vipLiveAlertBannerPath).trim() || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertBannerPath) : current.vipLiveAlertBannerPath,
    vipLiveAlertTemplate: patch.vipLiveAlertTemplate !== undefined ? (String(patch.vipLiveAlertTemplate).trim() || DEFAULT_DESK_MARKETING_CONFIG.vipLiveAlertTemplate) : current.vipLiveAlertTemplate,
    vipOnboardingPaused: patch.vipOnboardingPaused !== undefined ? Boolean(patch.vipOnboardingPaused) : current.vipOnboardingPaused,
    vipOnboardingBatchSize: patch.vipOnboardingBatchSize !== undefined ? clampNum(patch.vipOnboardingBatchSize, 1, 10, current.vipOnboardingBatchSize) : current.vipOnboardingBatchSize,
    vipOnboardingIntervalMinutes: patch.vipOnboardingIntervalMinutes !== undefined ? clampNum(patch.vipOnboardingIntervalMinutes, 15, 240, current.vipOnboardingIntervalMinutes) : current.vipOnboardingIntervalMinutes,
    updatedAt: Date.now()
  };
  const fp = getConfigFilePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), 'utf8');
  cachedConfig = next;
  try {
    cachedMtimeMs = fs.statSync(fp).mtimeMs;
  } catch (_) {}
  return next;
}

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { eventHub } from '../../server/events.ts';
import { streamController } from '../../server/streamController.ts';
import { baileysManager } from './baileys.service.ts';
import { liveStreamAgentService, OmniStreamChannel } from './liveStreamAgent.service.ts';
import { fastIngestionService } from './fastIngestion.service.ts';
import { videoMarketingService } from './videoMarketing.service.ts';
import { startAutonomousMarketingBroadcaster, stopAutonomousMarketingBroadcaster } from '../liveStreaming/rtmpRelayServer.ts';

export type StreamPresentationState =
  | 'SHOWCASE_ITEM'
  | 'QNA_ENGAGEMENT'
  | 'FLASH_SALE_COUNTDOWN'
  | 'SOLD_OUT_ALERT';

export interface LiveShowcasedProduct {
  sku: string;
  brandName: string;
  itemName: string;
  category: string;
  size: string;
  priceAED: number;
  floorPriceAED: number;
  eraEstimate: string;
  conditionGrade: string;
  carouselImages: {
    frontImageUrl: string;
    backImageUrl: string;
    tagImageUrl: string;
  };
}

export interface SplitScreenLayoutConfig {
  mode: 'SPLIT_SCREEN_55_45';
  canvasWidth: 1920;
  canvasHeight: 1080;
  leftModelViewport: {
    widthPercent: 55;
    widthPx: 1056;
    heightPx: 1080;
    masterModelImageUrl: string;
    activeLipSyncVideoUrl: string;
    fps: number;
    drivingEngine: string;
    usedFallbackLooper: boolean;
  };
  rightTelemetryCard: {
    widthPercent: 45;
    widthPx: 864;
    heightPx: 1080;
    theme: 'LUXURY_DARK_AND_GOLD';
    livePriceAED: number;
    size: string;
    sku: string;
    brandTag: string;
    conditionGrade: string;
    chatTriggerKeyword: 'MINE';
    qrCodeDataUrl: string;
    whatsappTargetUrl: string;
  };
}

export interface BRollCutawayState {
  active: boolean;
  triggerKeyword: 'tag' | 'stitch' | 'label' | string;
  durationMs: 2500;
  pipViewport: {
    xPx: 680;
    yPx: 660;
    widthPx: 340;
    heightPx: 360;
    zoomScale: 1.85;
  };
  tagImageUrl: string;
  startedAt: string;
  expiresAt: string;
}

export interface LiveClaimFlashBannerState {
  visible: boolean;
  bannerText: string; // "CLAIMED BY @[USERNAME] - INVOICE GENERATED!"
  username: string;
  platform: OmniStreamChannel | string;
  sku: string;
  invoiceNo: string;
  priceAED: number;
  claimedAt: string;
}

export interface DynamicStreamOverlayPayload {
  boothId: string;
  presentationState: StreamPresentationState;
  activeChannels: OmniStreamChannel[];
  activeProduct: LiveShowcasedProduct;
  priceTagBanner: string;
  sizeBanner: string;
  whatsappTargetUrl: string;
  qrCodeDataUrl: string;
  splitScreenLayout: SplitScreenLayoutConfig;
  bRollCutaway?: BRollCutawayState;
  liveClaimFlashBanner?: LiveClaimFlashBannerState;
  flashSaleCountdownSeconds?: number;
  soldAlertBanner?: {
    visible: boolean;
    bannerText: string; // "ITEM [SKU] SOLD!"
    buyerName: string;
    soldPriceAED: number;
    channel: string;
  };
  compositedSplitScreenPreviewUrl?: string;
  updatedAt: string;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class LiveStreamOrchestratorService {
  private isLive = false;
  private boothId = 'booth-1';
  private presentationState: StreamPresentationState = 'SHOWCASE_ITEM';
  private activeChannels: OmniStreamChannel[] = [
    'tiktok',
    'youtube',
    'facebook',
    'instagram',
    'threads',
    'whatsapp',
    'custom'
  ];
  private rtmpTargets: Record<string, string> = {};
  private rotationIntervalMinutes = 4;
  private currentItemIndex = 0;
  private rotationTimer: NodeJS.Timeout | null = null;
  private stateStepTimer: NodeJS.Timeout | null = null;
  private bRollResetTimer: NodeJS.Timeout | null = null;
  private currentOverlay: DynamicStreamOverlayPayload | null = null;
  private obsWebSocketUrl: string = process.env.OBS_WEBSOCKET_URL || 'ws://127.0.0.1:4455';
  private vtonLookbookCache: Map<string, string> = new Map();

  private defaultInventoryPool: LiveShowcasedProduct[] = [
    {
      sku: 'VV-90S-8920',
      brandName: 'Carhartt WIP',
      itemName: '90s Leather Patina Detroit Jacket',
      category: 'Men Jackets',
      size: 'M',
      priceAED: 100,
      floorPriceAED: 85,
      eraEstimate: 'Late 90s',
      conditionGrade: 'A+ Mint',
      carouselImages: {
        frontImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        backImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        tagImageUrl: 'https://vintagevibesgk.com/logo-512.png'
      }
    },
    {
      sku: 'BAL-09-2026-0001-MEN-TEE-P0004',
      brandName: 'Nike Vintage',
      itemName: '90s Single-Stitch Graphic Tee',
      category: 'Graphic Tees',
      size: 'L',
      priceAED: 180,
      floorPriceAED: 145,
      eraEstimate: 'Late 90s',
      conditionGrade: 'Mint',
      carouselImages: {
        frontImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        backImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        tagImageUrl: 'https://vintagevibesgk.com/logo-512.png'
      }
    },
    {
      sku: 'VV-80S-3105',
      brandName: 'Harley-Davidson',
      itemName: 'Vintage 80s Single-Stitch Eagle Tee',
      category: 'Graphic Tees',
      size: 'XL',
      priceAED: 145,
      floorPriceAED: 116,
      eraEstimate: 'Vintage 80s',
      conditionGrade: 'Good Patina',
      carouselImages: {
        frontImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        backImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        tagImageUrl: 'https://vintagevibesgk.com/logo-512.png'
      }
    }
  ];

  private getAvailableShowcasePool(): LiveShowcasedProduct[] {
    const fastItems = fastIngestionService
      .getAllIngestedRecords()
      .filter(r => r.status === 'AVAILABLE')
      .map(r => ({
        sku: r.sku,
        brandName: r.metadata.brand,
        itemName: r.metadata.subCategory,
        category: r.metadata.category,
        size: r.metadata.size,
        priceAED: r.metadata.suggested_retail_price_aed,
        floorPriceAED: r.metadata.minimum_floor_price_aed,
        eraEstimate: r.metadata.era_estimate,
        conditionGrade: r.metadata.condition_rating,
        carouselImages: {
          frontImageUrl: r.imageUrl || 'https://vintagevibesgk.com/logo-512.png',
          backImageUrl: r.imageUrl || 'https://vintagevibesgk.com/logo-512.png',
          tagImageUrl: r.imageUrl || 'https://vintagevibesgk.com/logo-512.png'
        }
      }));

    return [...fastItems, ...this.defaultInventoryPool];
  }

  /**
   * 1. Virtual Try-On Asset Generation for Live Studio:
   *    When a garment is queued for broadcast, pass the garment image to our VTON pipeline
   *    (`generateModelLookbookImage`) to generate the Master Model Image (a stylish streetwear male model wearing the exact piece).
   */
  public async ensureMasterVtonModelForProduct(product: LiveShowcasedProduct): Promise<{
    localPath: string;
    publicUrl: string;
  }> {
    const cached = this.vtonLookbookCache.get(product.sku);
    if (cached && fs.existsSync(cached)) {
      return {
        localPath: cached,
        publicUrl: `/generated_reels/${path.basename(cached)}`
      };
    }

    const prompt = `${product.brandName} ${product.itemName} (${product.eraEstimate}, Size ${product.size})`;
    const savedPath = await videoMarketingService.generateModelLookbookImage(
      product.carouselImages.frontImageUrl,
      prompt,
      product.sku
    );
    this.vtonLookbookCache.set(product.sku, savedPath);

    return {
      localPath: savedPath,
      publicUrl: `/generated_reels/${path.basename(savedPath)}`
    };
  }

  /**
   * 2. Render Luxury 1920x1080 Split-Screen Live Shopping Broadcast Canvas:
   *    - Left 55% (1056x1080): Dynamic AI Model wearing and presenting the item + optional 2.5s B-Roll PiP Tag Cutaway
   *    - Right 45% (864x1080): Sleek Dark & Gold Telemetry Specifications Card (Price in AED, Size, SKU, Grade, Chat Trigger 'MINE', QR Code)
   *    - Top/Center Golden Flash Banner when a viewer claims the item (`"CLAIMED BY @[USERNAME] - INVOICE GENERATED!"`)
   */
  public async renderSplitScreenBroadcastPreviewPng(overlay: DynamicStreamOverlayPayload): Promise<string> {
    try {
      const W = 1920;
      const H = 1080;
      const leftW = 1056; // 55% of 1920
      const rightW = 864; // 45% of 1920

      const vtonAsset = await this.ensureMasterVtonModelForProduct(overlay.activeProduct);
      const leftModelLayer = await sharp(vtonAsset.localPath)
        .resize(leftW, H, { fit: 'cover', position: 'attention' })
        .png()
        .toBuffer();

      const composites: sharp.OverlayOptions[] = [{ input: leftModelLayer, left: 0, top: 0 }];

      // Optional 2.5-second B-Roll PiP Cutaway (Bottom-Right of the Left 55% Model Viewport) when "tag", "stitch", or "label" is spoken
      if (overlay.bRollCutaway?.active) {
        const pipW = 340;
        const pipH = 360;
        const pipImg = await sharp(vtonAsset.localPath)
          .extract({ left: 320, top: 520, width: 420, height: 440 })
          .resize(pipW - 12, pipH - 48, { fit: 'cover' })
          .png()
          .toBuffer();

        const pipFrameSvg = Buffer.from(`<svg width="${pipW}" height="${pipH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${pipW}" height="${pipH}" rx="18" fill="#090d16" stroke="#f59e0b" stroke-width="4"/>
          <rect x="0" y="${pipH - 42}" width="${pipW}" height="42" rx="10" fill="#f59e0b"/>
          <text x="${pipW / 2}" y="${pipH - 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#090d16">🔍 B-ROLL MACRO: ${escapeXml(overlay.bRollCutaway.triggerKeyword.toUpperCase())} DETAIL</text>
        </svg>`);

        composites.push({ input: pipFrameSvg, left: 680, top: 680 });
        composites.push({ input: pipImg, left: 686, top: 686 });
      }

      // Decode QR code data URL if available
      let qrBuf: Buffer | null = null;
      if (overlay.qrCodeDataUrl && overlay.qrCodeDataUrl.includes('base64,')) {
        try {
          qrBuf = await sharp(Buffer.from(overlay.qrCodeDataUrl.split('base64,')[1], 'base64'))
            .resize(210, 210)
            .png()
            .toBuffer();
        } catch {}
      }

      const p = overlay.activeProduct;
      const claimBannerSvg = overlay.liveClaimFlashBanner?.visible
        ? `<g>
            <rect x="180" y="34" width="1560" height="88" rx="22" fill="#f59e0b" stroke="#fef08a" stroke-width="4"/>
            <text x="960" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="#090d16" letter-spacing="1.5">⚡ ${escapeXml(overlay.liveClaimFlashBanner.bannerText)} ⚡</text>
          </g>`
        : '';

      const rightCardSvg = Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="50%" stop-color="#fef08a"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>

        <!-- Left 55% Viewport Live Indicator Pill -->
        <rect x="36" y="36" width="440" height="54" rx="27" fill="#090d16" fill-opacity="0.86" stroke="#f59e0b" stroke-width="2"/>
        <circle cx="68" cy="63" r="10" fill="#ef4444"/>
        <text x="92" y="70" font-family="Arial, sans-serif" font-size="19" font-weight="900" fill="#fde68a">AI LIVE MODEL (${overlay.splitScreenLayout.leftModelViewport.fps} FPS LIP-SYNC)</text>

        <!-- Vertical Gold Divider at 55% (x = 1056) -->
        <line x1="${leftW}" y1="0" x2="${leftW}" y2="${H}" stroke="url(#goldGrad)" stroke-width="6"/>

        <!-- Right 45% (864x1080) Luxury Dark & Gold Telemetry Card -->
        <rect x="${leftW}" y="0" width="${rightW}" height="${H}" fill="#090d16"/>
        <rect x="${leftW + 28}" y="28" width="${rightW - 56}" height="${H - 56}" rx="28" fill="#0f172a" stroke="url(#goldGrad)" stroke-width="3"/>

        <!-- Brand & Header -->
        <text x="${leftW + rightW / 2}" y="94" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="900" fill="#fde68a" letter-spacing="3">VINTAGE VIBES DUBAI</text>
        <rect x="${leftW + 70}" y="118" width="${rightW - 140}" height="46" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
        <text x="${leftW + rightW / 2}" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">🏷️ BRAND TAG: ${escapeXml(p.brandName.toUpperCase())}</text>

        <!-- Product Title & SKU -->
        <text x="${leftW + rightW / 2}" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#f8fafc">${escapeXml(p.itemName.slice(0, 32))}</text>
        <text x="${leftW + rightW / 2}" y="252" text-anchor="middle" font-family="monospace" font-size="21" font-weight="bold" fill="#94a3b8">SKU: #${escapeXml(p.sku)} • ${escapeXml(p.eraEstimate)}</text>

        <!-- Giant Price & Size Telemetry Boxes -->
        <rect x="${leftW + 64}" y="286" width="350" height="140" rx="20" fill="url(#goldGrad)"/>
        <text x="${leftW + 239}" y="332" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#090d16">LIVE VIP PRICE</text>
        <text x="${leftW + 239}" y="396" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="900" fill="#090d16">AED ${p.priceAED}</text>

        <rect x="${leftW + 444}" y="286" width="356" height="140" rx="20" fill="#1e293b" stroke="#f59e0b" stroke-width="2.5"/>
        <text x="${leftW + 622}" y="332" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#94a3b8">VERIFIED SIZE &amp; GRADE</text>
        <text x="${leftW + 622}" y="392" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="#fde68a">${escapeXml(p.size)} • ${escapeXml(p.conditionGrade)}</text>

        <!-- Chat Trigger 'MINE' Instruction Box -->
        <rect x="${leftW + 64}" y="454" width="${rightW - 128}" height="122" rx="20" fill="#064e3b" stroke="#34d399" stroke-width="2.5"/>
        <text x="${leftW + rightW / 2}" y="502" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#ffffff">💬 TYPE "MINE" OR "CLAIM" IN LIVE CHAT</text>
        <text x="${leftW + rightW / 2}" y="546" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="bold" fill="#a7f3d0">Auto-Locks Item #${escapeXml(p.sku)} &amp; Generates Instant Invoice!</text>

        <!-- QR Code & Direct WhatsApp Checkout Section -->
        <rect x="${leftW + 64}" y="606" width="${rightW - 128}" height="290" rx="22" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <text x="${leftW + 440}" y="668" font-family="Arial, sans-serif" font-size="25" font-weight="900" fill="#fde68a">📲 SCAN FOR 1-TAP CHECKOUT</text>
        <text x="${leftW + 440}" y="712" font-family="Arial, sans-serif" font-size="19" font-weight="bold" fill="#e2e8f0">WhatsApp Concierge:</text>
        <text x="${leftW + 440}" y="748" font-family="monospace" font-size="24" font-weight="900" fill="#34d399">+971 55 418 6086</text>
        <text x="${leftW + 440}" y="796" font-family="Arial, sans-serif" font-size="17" fill="#94a3b8">24-48 Hr UAE Doorstep Delivery</text>
        <text x="${leftW + 440}" y="828" font-family="Arial, sans-serif" font-size="17" fill="#94a3b8">COD &amp; Instant Link Available</text>

        <!-- Footer -->
        <text x="${leftW + rightW / 2}" y="965" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#cbd5e1">🌐 STREAMING ON TIKTOK • YOUTUBE • IG • FB • WHATSAPP</text>

        ${claimBannerSvg}
      </svg>`);

      composites.push({ input: rightCardSvg, left: 0, top: 0 });
      if (qrBuf) {
        composites.push({ input: qrBuf, left: leftW + 96, top: 644 });
      }

      const outDir = path.join(process.cwd(), 'public', 'generated_reels');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const fileName = `split_live_${overlay.activeProduct.sku.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
      const outPath = path.join(outDir, fileName);

      await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 9, g: 13, b: 22, alpha: 1 } }
      })
        .composite(composites)
        .png({ compressionLevel: 7 })
        .toFile(outPath);

      return `/generated_reels/${fileName}`;
    } catch (err: any) {
      console.warn('[LiveStreamOrchestrator] Split-screen preview render notice:', err?.message);
      return '';
    }
  }

  /**
   * 3. Detect B-Roll Trigger Keywords ("tag", "stitch", "label") in AI Voice Pitch
   *    and trigger a 2.5-second PiP (Picture-in-Picture) zoom of the authentic garment tag photo over the model stream!
   */
  public detectBRollKeywordInScript(spokenScript: string): 'tag' | 'stitch' | 'label' | null {
    const m = String(spokenScript || '').match(/\b(tag|stitch|stitching|label)\b/i);
    if (!m) return null;
    const w = m[1].toLowerCase();
    if (w.startsWith('stitch')) return 'stitch';
    if (w === 'label') return 'label';
    return 'tag';
  }

  public async triggerBRollCutaway(keyword: 'tag' | 'stitch' | 'label' = 'tag'): Promise<BRollCutawayState | null> {
    if (!this.currentOverlay) return null;
    if (this.bRollResetTimer) {
      clearTimeout(this.bRollResetTimer);
      this.bRollResetTimer = null;
    }

    const now = Date.now();
    const bRoll: BRollCutawayState = {
      active: true,
      triggerKeyword: keyword,
      durationMs: 2500,
      pipViewport: {
        xPx: 680,
        yPx: 660,
        widthPx: 340,
        heightPx: 360,
        zoomScale: 1.85
      },
      tagImageUrl: this.currentOverlay.activeProduct.carouselImages.tagImageUrl,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 2500).toISOString()
    };

    this.currentOverlay.bRollCutaway = bRoll;
    this.currentOverlay.compositedSplitScreenPreviewUrl = await this.renderSplitScreenBroadcastPreviewPng(
      this.currentOverlay
    );

    try {
      eventHub.broadcast({
        type: 'LIVE_BROLL_CUTAWAY',
        boothId: this.boothId,
        bRollCutaway: bRoll,
        overlay: this.currentOverlay
      });
    } catch {}

    // Smoothly transition back to full model view after 2.5 seconds (2500ms)
    this.bRollResetTimer = setTimeout(async () => {
      if (this.currentOverlay?.bRollCutaway) {
        this.currentOverlay.bRollCutaway = {
          ...this.currentOverlay.bRollCutaway,
          active: false
        };
        try {
          eventHub.broadcast({
            type: 'LIVE_BROLL_CUTAWAY_END',
            boothId: this.boothId,
            overlay: this.currentOverlay
          });
        } catch {}
      }
    }, 2500);
    if (typeof this.bRollResetTimer.unref === 'function') {
      this.bRollResetTimer.unref();
    }

    return bRoll;
  }

  /**
   * 4. Live Claim Flash Banner:
   *    When a viewer types "MINE" or "CLAIM" in YouTube / TikTok / Facebook / Instagram live chat,
   *    overlay an animated golden banner across the stream: "CLAIMED BY @[USERNAME] - INVOICE GENERATED!"
   */
  public async triggerLiveClaimFlashBanner(params: {
    username: string;
    platform: OmniStreamChannel | string;
    sku?: string;
    synthesizeAudio?: boolean;
  }): Promise<{
    bannerText: string;
    invoiceNo: string;
    liveClaimFlashBanner: LiveClaimFlashBannerState;
    overlay: DynamicStreamOverlayPayload;
    hostAnnouncement: string;
  }> {
    const cleanUser = String(params.username || 'VIP_Buyer').replace(/^@/, '').trim() || 'VIP_Buyer';
    const platform = String(params.platform || 'tiktok').toLowerCase();
    const pool = this.getAvailableShowcasePool();
    const activeProd =
      (params.sku && pool.find(p => p.sku.toUpperCase() === params.sku!.toUpperCase())) ||
      this.currentOverlay?.activeProduct ||
      pool[0];

    const invoiceNo = `VV-INV-${Date.now().toString().slice(-6)}`;
    const bannerText = `CLAIMED BY @${cleanUser} - INVOICE GENERATED!`;

    const claimState: LiveClaimFlashBannerState = {
      visible: true,
      bannerText,
      username: cleanUser,
      platform,
      sku: activeProd.sku,
      invoiceNo,
      priceAED: activeProd.priceAED,
      claimedAt: new Date().toISOString()
    };

    const overlay = await this.buildDynamicOverlay(activeProd, 'SOLD_OUT_ALERT', {
      liveClaimFlashBanner: claimState,
      soldAlertBanner: {
        visible: true,
        bannerText: `ITEM ${activeProd.sku} SOLD!`,
        buyerName: `@${cleanUser}`,
        soldPriceAED: activeProd.priceAED,
        channel: platform.toUpperCase()
      }
    });

    const hostAnnouncement = `Mubarak ho @${cleanUser}! Aap ne ${activeProd.brandName} ${activeProd.itemName} (${activeProd.priceAED} Dirhams) claim kar liya hai aur aap ka official invoice ${invoiceNo} generate ho chuka hai!`;

    if (params.synthesizeAudio !== false) {
      await this.driveAvatarPitchWithAudio({
        product: activeProd,
        spokenScript: hostAnnouncement,
        eventType: 'ITEM_SOLD',
        lang: 'ROMAN_URDU'
      });
    }

    try {
      eventHub.broadcast({
        type: 'LIVE_CLAIM_FLASH_BANNER',
        boothId: this.boothId,
        bannerText,
        invoiceNo,
        liveClaimFlashBanner: claimState,
        overlay
      });
    } catch {}

    return {
      bannerText,
      invoiceNo,
      liveClaimFlashBanner: claimState,
      overlay,
      hostAnnouncement
    };
  }

  /**
   * Synthesize "Matti Bhai AI Pitch" audio, pipe it into the 25-30 FPS Audio-Driven Lip-Sync Stream
   * (`generateAudioDrivenLipSyncStream`), and auto-trigger the 2.5s B-Roll PiP Cutaway if "tag", "stitch", or "label" is mentioned!
   */
  public async driveAvatarPitchWithAudio(params: {
    product: LiveShowcasedProduct;
    spokenScript: string;
    eventType: 'ITEM_INTRO' | 'FLASH_SALE' | 'ITEM_SOLD';
    lang?: string;
    useFallbackLooper?: boolean;
  }): Promise<{
    spokenScript: string;
    audioBufferMp3?: Buffer;
    activeLipSyncVideoUrl: string;
    drivingEngine: string;
    bRollTriggered?: BRollCutawayState | null;
  }> {
    const vtonAsset = await this.ensureMasterVtonModelForProduct(params.product);
    const hostRes = await liveStreamAgentService.announceLiveEventOnStream({
      boothId: this.boothId,
      eventType: params.eventType,
      spokenScript: params.spokenScript,
      lang: params.lang || 'ROMAN_URDU',
      synthesizeAudio: true
    });

    let activeLipSyncVideoUrl = vtonAsset.publicUrl;
    let drivingEngine = 'LivePortrait 25FPS Avatar Stream';

    if (hostRes.audioBufferMp3 && hostRes.audioBufferMp3.length > 300) {
      const lipSyncRes = await videoMarketingService.generateAudioDrivenLipSyncStream({
        sku: params.product.sku,
        masterModelImagePathOrUrl: vtonAsset.localPath,
        pitchAudioBuffer: hostRes.audioBufferMp3,
        spokenScript: params.spokenScript,
        fps: 25,
        useFallbackLooper: params.useFallbackLooper
      });

      if (lipSyncRes.ok && lipSyncRes.publicStreamUrl) {
        activeLipSyncVideoUrl = lipSyncRes.publicStreamUrl;
        drivingEngine = lipSyncRes.drivingEngine;
      }
    }

    if (this.currentOverlay) {
      this.currentOverlay.splitScreenLayout.leftModelViewport.activeLipSyncVideoUrl = activeLipSyncVideoUrl;
      this.currentOverlay.splitScreenLayout.leftModelViewport.drivingEngine = drivingEngine;
    }

    // Check if the voice pitch mentions "tag", "stitch", or "label" -> trigger 2.5s B-Roll PiP Cutaway!
    const bRollKw = this.detectBRollKeywordInScript(params.spokenScript);
    let bRollTriggered: BRollCutawayState | null = null;
    if (bRollKw) {
      bRollTriggered = await this.triggerBRollCutaway(bRollKw);
    }

    return {
      spokenScript: params.spokenScript,
      audioBufferMp3: hostRes.audioBufferMp3,
      activeLipSyncVideoUrl,
      drivingEngine,
      bRollTriggered
    };
  }

  /**
   * Build Dynamic Split-Screen Overlay Payload (Left 55% AI Video Model + Right 45% Dark & Gold Telemetry Card)
   */
  public async buildDynamicOverlay(
    product: LiveShowcasedProduct,
    state: StreamPresentationState,
    extra?: {
      flashSaleCountdownSeconds?: number;
      soldAlertBanner?: DynamicStreamOverlayPayload['soldAlertBanner'];
      liveClaimFlashBanner?: LiveClaimFlashBannerState;
      bRollCutaway?: BRollCutawayState;
      useFallbackLooper?: boolean;
    }
  ): Promise<DynamicStreamOverlayPayload> {
    const whatsappTargetUrl = `https://wa.me/971554186086?text=Interested_in_Live_Item_${encodeURIComponent(product.sku)}`;
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(whatsappTargetUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220
      });
    } catch {}

    // Generate VTON Master Model Image for the Left 55% Viewport
    const vtonAsset = await this.ensureMasterVtonModelForProduct(product);

    const splitScreenLayout: SplitScreenLayoutConfig = {
      mode: 'SPLIT_SCREEN_55_45',
      canvasWidth: 1920,
      canvasHeight: 1080,
      leftModelViewport: {
        widthPercent: 55,
        widthPx: 1056,
        heightPx: 1080,
        masterModelImageUrl: vtonAsset.publicUrl,
        activeLipSyncVideoUrl:
          this.currentOverlay?.activeProduct?.sku === product.sku &&
          this.currentOverlay?.splitScreenLayout?.leftModelViewport?.activeLipSyncVideoUrl
            ? this.currentOverlay.splitScreenLayout.leftModelViewport.activeLipSyncVideoUrl
            : vtonAsset.publicUrl,
        fps: 25,
        drivingEngine: extra?.useFallbackLooper
          ? 'Fallback Charismatic Host Gesturing Video Looper'
          : 'LivePortrait / MuseTalk 25-30 FPS Audio-Driven Lip-Sync',
        usedFallbackLooper: Boolean(extra?.useFallbackLooper)
      },
      rightTelemetryCard: {
        widthPercent: 45,
        widthPx: 864,
        heightPx: 1080,
        theme: 'LUXURY_DARK_AND_GOLD',
        livePriceAED: product.priceAED,
        size: product.size,
        sku: product.sku,
        brandTag: product.brandName,
        conditionGrade: product.conditionGrade,
        chatTriggerKeyword: 'MINE',
        qrCodeDataUrl,
        whatsappTargetUrl
      }
    };

    const overlay: DynamicStreamOverlayPayload = {
      boothId: this.boothId,
      presentationState: state,
      activeChannels: this.activeChannels,
      activeProduct: product,
      priceTagBanner: `VIP LIVE PRICE: ${product.priceAED} AED`,
      sizeBanner: `VERIFIED SIZE: ${product.size} • ${product.eraEstimate.toUpperCase()}`,
      whatsappTargetUrl,
      qrCodeDataUrl,
      splitScreenLayout,
      bRollCutaway: extra?.bRollCutaway,
      liveClaimFlashBanner: extra?.liveClaimFlashBanner,
      flashSaleCountdownSeconds: extra?.flashSaleCountdownSeconds,
      soldAlertBanner: extra?.soldAlertBanner,
      updatedAt: new Date().toISOString()
    };

    overlay.compositedSplitScreenPreviewUrl = await this.renderSplitScreenBroadcastPreviewPng(overlay);

    this.currentOverlay = overlay;
    this.presentationState = state;

    liveStreamAgentService.setActiveOnAirItem({
      sku: product.sku,
      brandName: product.brandName,
      itemName: product.itemName,
      size: product.size,
      priceAED: product.priceAED,
      floorPriceAED: product.floorPriceAED,
      era: product.eraEstimate,
      origin: 'USA and UK Import'
    });

    try {
      streamController.setActiveSku(this.boothId, product.sku);
    } catch {}

    try {
      eventHub.broadcast({
        type: 'LIVE_OVERLAY_UPDATE',
        boothId: this.boothId,
        overlay
      });
    } catch {}

    return overlay;
  }

  /**
   * Start Autonomous Omni-Channel Split-Screen Live Stream (`/api/livestream/start`)
   */
  public async startAutonomousLiveStream(params?: {
    boothId?: string;
    channels?: OmniStreamChannel[];
    rtmpTargets?: Record<string, string>;
    cycleMinutes?: number;
    announceAudio?: boolean;
    notifyWhatsAppChannel?: boolean;
    useFallbackLooper?: boolean;
  }): Promise<{
    success: boolean;
    isLive: boolean;
    boothId: string;
    activeChannels: OmniStreamChannel[];
    presentationState: StreamPresentationState;
    overlay: DynamicStreamOverlayPayload;
    hostAnnouncement?: string;
  }> {
    this.stopTimers();
    this.isLive = true;
    this.boothId = params?.boothId || 'booth-1';
    this.activeChannels =
      Array.isArray(params?.channels) && params!.channels.length > 0
        ? params!.channels
        : ['tiktok', 'youtube', 'facebook', 'instagram', 'threads', 'whatsapp', 'custom'];
    if (params?.rtmpTargets) {
      this.rtmpTargets = params.rtmpTargets;
    }
    this.rotationIntervalMinutes = Math.max(3, Math.min(5, Number(params?.cycleMinutes || 4)));

    const pool = this.getAvailableShowcasePool();
    this.currentItemIndex = 0;
    const firstProduct = pool[0];

    const overlay = await this.buildDynamicOverlay(firstProduct, 'SHOWCASE_ITEM', {
      useFallbackLooper: params?.useFallbackLooper
    });

    // Intro pitch intentionally mentions authentic "tag" and "stitch" so the 2.5s B-Roll PiP Cutaway is showcased!
    const introScript = `Assalam Alaikum and welcome to Vintage Vibes Dubai Live! Left screen par hamara AI Model pehen kar dikha raha hai 1-of-1 ${firstProduct.brandName} ${firstProduct.itemName} Size ${firstProduct.size}, original vintage tag aur single stitch detail ke sath, sirf ${firstProduct.priceAED} Dirhams mein! Lock karne ke liye chat mein MINE likhein ya QR code scan karein!`;

    if (params?.announceAudio !== false) {
      await this.driveAvatarPitchWithAudio({
        product: firstProduct,
        spokenScript: introScript,
        eventType: 'ITEM_INTRO',
        lang: 'ROMAN_URDU',
        useFallbackLooper: params?.useFallbackLooper
      });
    }

    if (params?.notifyWhatsAppChannel) {
      try {
        const waSession = baileysManager.getConnectedSession();
        if (waSession?.userId) {
          await baileysManager.postToChannel(waSession.userId, '0029Vb7L5CEKWEKsu9123B1n', {
            imageUrl: firstProduct.carouselImages.frontImageUrl,
            caption: `🔴 *WE ARE LIVE NOW ACROSS ALL CHANNELS!* 🔴\n\n🧥 *Now On Air:* ${firstProduct.brandName} — ${firstProduct.itemName} (\`#${firstProduct.sku}\`, Size ${firstProduct.size})\n💰 *Live Price:* *${firstProduct.priceAED} AED*\n👉 *Instant Lock on WhatsApp:* ${overlay.whatsappTargetUrl}`
          });
        }
      } catch {}
    }

    this.scheduleStateAndItemRotation();
    startAutonomousMarketingBroadcaster(this.boothId).catch(() => {});

    return {
      success: true,
      isLive: this.isLive,
      boothId: this.boothId,
      activeChannels: this.activeChannels,
      presentationState: this.presentationState,
      overlay: this.currentOverlay || overlay,
      hostAnnouncement: introScript
    };
  }

  private scheduleStateAndItemRotation(): void {
    this.stopTimers();
    const cycleMs = this.rotationIntervalMinutes * 60 * 1000;

    this.stateStepTimer = setTimeout(async () => {
      if (!this.isLive || !this.currentOverlay) return;
      if (this.presentationState === 'SHOWCASE_ITEM') {
        await this.buildDynamicOverlay(this.currentOverlay.activeProduct, 'QNA_ENGAGEMENT');
      }
      const flashTimer = setTimeout(async () => {
        if (!this.isLive || !this.currentOverlay) return;
        if (this.presentationState !== 'SOLD_OUT_ALERT') {
          await this.buildDynamicOverlay(this.currentOverlay.activeProduct, 'FLASH_SALE_COUNTDOWN', {
            flashSaleCountdownSeconds: 60
          });
        }
      }, Math.round(cycleMs * 0.35));
      if (typeof flashTimer.unref === 'function') flashTimer.unref();
    }, Math.round(cycleMs * 0.35));
    if (typeof this.stateStepTimer.unref === 'function') {
      this.stateStepTimer.unref();
    }

    this.rotationTimer = setInterval(() => {
      if (!this.isLive) return;
      this.advanceToNextShowcaseItem(false).catch(() => {});
    }, cycleMs);
    if (typeof this.rotationTimer.unref === 'function') {
      this.rotationTimer.unref();
    }
  }

  public async advanceToNextShowcaseItem(synthesizeAudio = true): Promise<DynamicStreamOverlayPayload> {
    const pool = this.getAvailableShowcasePool();
    this.currentItemIndex = (this.currentItemIndex + 1) % pool.length;
    const nextProd = pool[this.currentItemIndex];
    const overlay = await this.buildDynamicOverlay(nextProd, 'SHOWCASE_ITEM');

    if (synthesizeAudio) {
      const script = `Agla 1-of-1 piece screen par aa chuka hai! ${nextProd.brandName} ${nextProd.itemName}, original label aur tag ke sath, Size ${nextProd.size}, sirf ${nextProd.priceAED} Dirhams! Chat mein MINE likhein ya QR code scan karein!`;
      await this.driveAvatarPitchWithAudio({
        product: nextProd,
        spokenScript: script,
        eventType: 'ITEM_INTRO',
        lang: 'ROMAN_URDU'
      });
    }

    return this.currentOverlay || overlay;
  }

  /**
   * When a sale is confirmed via `marketing.service.ts` / Baileys / Live Claim,
   * trigger both `"ITEM [SKU] SOLD!"` AND `"CLAIMED BY @[USERNAME] - INVOICE GENERATED!"` golden flash banner!
   */
  public async triggerItemSoldAlert(params: {
    sku: string;
    buyerName: string;
    soldPriceAED?: number;
    channel?: string;
    synthesizeAudio?: boolean;
  }): Promise<{
    overlay: DynamicStreamOverlayPayload;
    bannerText: string;
    claimFlashBannerText: string;
    invoiceNo: string;
    thankYouScript: string;
    audioBufferMp3?: Buffer;
  }> {
    const sku = String(params.sku || this.currentOverlay?.activeProduct?.sku || 'VV-90S-8920')
      .trim()
      .toUpperCase();
    const buyerName = String(params.buyerName || 'VIP Collector').replace(/^@/, '').trim();
    const channel = String(params.channel || 'WhatsApp').trim();
    const pool = this.getAvailableShowcasePool();
    const matchedProd =
      pool.find(p => p.sku === sku) ||
      this.currentOverlay?.activeProduct ||
      pool[0];
    const soldPriceAED = Number(params.soldPriceAED || matchedProd.priceAED || 180);

    const bannerText = `ITEM ${sku} SOLD!`;
    const invoiceNo = `VV-INV-${Date.now().toString().slice(-6)}`;
    const claimFlashBannerText = `CLAIMED BY @${buyerName} - INVOICE GENERATED!`;

    const overlay = await this.buildDynamicOverlay(matchedProd, 'SOLD_OUT_ALERT', {
      soldAlertBanner: {
        visible: true,
        bannerText,
        buyerName,
        soldPriceAED,
        channel
      },
      liveClaimFlashBanner: {
        visible: true,
        bannerText: claimFlashBannerText,
        username: buyerName,
        platform: channel,
        sku,
        invoiceNo,
        priceAED: soldPriceAED,
        claimedAt: new Date().toISOString()
      }
    });

    const thankYouScript = `Mubarak ho! Item ${sku} (${matchedProd.brandName} ${matchedProd.itemName}) SOLD ho chuka hai! Claimed by @${buyerName} (${channel} se) — Invoice ${invoiceNo} generate ho chuka hai!`;

    let audioBufferMp3: Buffer | undefined;
    if (params.synthesizeAudio !== false) {
      const pitchRes = await this.driveAvatarPitchWithAudio({
        product: matchedProd,
        spokenScript: thankYouScript,
        eventType: 'ITEM_SOLD',
        lang: 'ROMAN_URDU'
      });
      audioBufferMp3 = pitchRes.audioBufferMp3;
    }

    return {
      overlay: this.currentOverlay || overlay,
      bannerText,
      claimFlashBannerText,
      invoiceNo,
      thankYouScript,
      audioBufferMp3
    };
  }

  public stopAutonomousLiveStream(): {
    success: boolean;
    isLive: boolean;
    boothId: string;
    stoppedChannels: OmniStreamChannel[];
  } {
    this.stopTimers();
    this.isLive = false;
    stopAutonomousMarketingBroadcaster(this.boothId);
    const stopped = [...this.activeChannels];

    try {
      eventHub.broadcast({
        type: 'LIVE_STREAM_STOPPED',
        boothId: this.boothId,
        stoppedChannels: stopped,
        timestamp: new Date().toISOString()
      });
    } catch {}

    return {
      success: true,
      isLive: false,
      boothId: this.boothId,
      stoppedChannels: stopped
    };
  }

  private stopTimers(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.stateStepTimer) {
      clearTimeout(this.stateStepTimer);
      this.stateStepTimer = null;
    }
    if (this.bRollResetTimer) {
      clearTimeout(this.bRollResetTimer);
      this.bRollResetTimer = null;
    }
  }

  public getStatus(): {
    isLive: boolean;
    boothId: string;
    presentationState: StreamPresentationState;
    activeChannels: OmniStreamChannel[];
    rotationIntervalMinutes: number;
    obsWebSocketUrl: string;
    currentOverlay: DynamicStreamOverlayPayload | null;
  } {
    return {
      isLive: this.isLive,
      boothId: this.boothId,
      presentationState: this.presentationState,
      activeChannels: this.activeChannels,
      rotationIntervalMinutes: this.rotationIntervalMinutes,
      obsWebSocketUrl: this.obsWebSocketUrl,
      currentOverlay: this.currentOverlay
    };
  }
}

export const liveStreamOrchestratorService = new LiveStreamOrchestratorService();

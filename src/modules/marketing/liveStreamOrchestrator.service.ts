import QRCode from 'qrcode';
import { eventHub } from '../../server/events.ts';
import { streamController } from '../../server/streamController.ts';
import { baileysManager } from './baileys.service.ts';
import { liveStreamAgentService, OmniStreamChannel } from './liveStreamAgent.service.ts';
import { fastIngestionService } from './fastIngestion.service.ts';

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

export interface DynamicStreamOverlayPayload {
  boothId: string;
  presentationState: StreamPresentationState;
  activeChannels: OmniStreamChannel[];
  activeProduct: LiveShowcasedProduct;
  priceTagBanner: string;
  sizeBanner: string;
  whatsappTargetUrl: string;
  qrCodeDataUrl: string;
  flashSaleCountdownSeconds?: number;
  soldAlertBanner?: {
    visible: boolean;
    bannerText: string; // "ITEM [SKU] SOLD!"
    buyerName: string;
    soldPriceAED: number;
    channel: string;
  };
  updatedAt: string;
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
  private currentOverlay: DynamicStreamOverlayPayload | null = null;
  private obsWebSocketUrl: string = process.env.OBS_WEBSOCKET_URL || 'ws://127.0.0.1:4455';

  private defaultInventoryPool: LiveShowcasedProduct[] = [
    {
      sku: 'VV-90S-8920',
      brandName: 'Carhartt WIP',
      itemName: '90s Leather Patina Detroit Jacket',
      category: 'Men Jackets',
      size: 'XL',
      priceAED: 180,
      floorPriceAED: 144,
      eraEstimate: 'Late 90s',
      conditionGrade: 'A+ Mint',
      carouselImages: {
        frontImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        backImageUrl: 'https://vintagevibesgk.com/logo-512.png',
        tagImageUrl: 'https://vintagevibesgk.com/logo-512.png'
      }
    },
    {
      sku: 'VV-Y2K-4410',
      brandName: 'Nike ACG',
      itemName: 'Y2K Tactical Sherpa Fleece Hoodie',
      category: 'Men Hoodies',
      size: 'L',
      priceAED: 165,
      floorPriceAED: 132,
      eraEstimate: 'Y2K Archive',
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
   * Build Dynamic Overlay Payload with WhatsApp Direct QR Code (`https://wa.me/971528049351?text=Interested_in_Live_Item_[SKU]`)
   */
  public async buildDynamicOverlay(
    product: LiveShowcasedProduct,
    state: StreamPresentationState,
    extra?: {
      flashSaleCountdownSeconds?: number;
      soldAlertBanner?: DynamicStreamOverlayPayload['soldAlertBanner'];
    }
  ): Promise<DynamicStreamOverlayPayload> {
    const whatsappTargetUrl = `https://wa.me/971528049351?text=Interested_in_Live_Item_${encodeURIComponent(product.sku)}`;
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(whatsappTargetUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220
      });
    } catch {}

    const overlay: DynamicStreamOverlayPayload = {
      boothId: this.boothId,
      presentationState: state,
      activeChannels: this.activeChannels,
      activeProduct: product,
      priceTagBanner: `VIP LIVE PRICE: ${product.priceAED} AED`,
      sizeBanner: `VERIFIED SIZE: ${product.size} • ${product.eraEstimate.toUpperCase()}`,
      whatsappTargetUrl,
      qrCodeDataUrl,
      flashSaleCountdownSeconds: extra?.flashSaleCountdownSeconds,
      soldAlertBanner: extra?.soldAlertBanner,
      updatedAt: new Date().toISOString()
    };

    this.currentOverlay = overlay;
    this.presentationState = state;

    // Sync active item with LiveStreamAgent & StreamController
    liveStreamAgentService.setActiveOnAirItem({
      sku: product.sku,
      brandName: product.brandName,
      itemName: product.itemName,
      size: product.size,
      priceAED: product.priceAED,
      floorPriceAED: product.floorPriceAED,
      era: product.eraEstimate,
      origin: 'USA/UK Import'
    });

    try {
      streamController.setActiveSku(this.boothId, product.sku);
    } catch {}

    // Broadcast Dynamic Overlay update to OBS Browser Source, Studio Screens & All Connected Channels
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
   * 1. Start Autonomous Omni-Channel Live Stream Production (`/api/livestream/start`)
   *    Broadcasts simultaneously across ALL configured channels:
   *    TikTok + YouTube + Facebook + Instagram + Threads + Custom RTMP + WhatsApp Channels
   */
  public async startAutonomousLiveStream(params?: {
    boothId?: string;
    channels?: OmniStreamChannel[];
    rtmpTargets?: Record<string, string>;
    cycleMinutes?: number;
    announceAudio?: boolean;
    notifyWhatsAppChannel?: boolean;
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

    const overlay = await this.buildDynamicOverlay(firstProduct, 'SHOWCASE_ITEM');

    // Have AI Host introduce the showcased item in a sweet, charismatic voice
    const introScript = `Assalam Alaikum and welcome to Vintage Vibes Dubai Live across all channels! Abhi screen par dekhiye 1-of-1 ${firstProduct.brandName} ${firstProduct.itemName} Size ${firstProduct.size}, sirf ${firstProduct.priceAED} AED mein! Lock karne ke liye screen par WhatsApp QR code scan karein ya comment mein CLAIM likhein!`;

    if (params?.announceAudio !== false) {
      await liveStreamAgentService.announceLiveEventOnStream({
        boothId: this.boothId,
        eventType: 'ITEM_INTRO',
        spokenScript: introScript,
        lang: 'ROMAN_URDU',
        synthesizeAudio: true
      });
    }

    // Optionally notify WhatsApp Official Channel (@newsletter) & VIP Groups that we are LIVE
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

    return {
      success: true,
      isLive: this.isLive,
      boothId: this.boothId,
      activeChannels: this.activeChannels,
      presentationState: this.presentationState,
      overlay,
      hostAnnouncement: introScript
    };
  }

  /**
   * Cycle through SHOWCASE_ITEM -> QNA_ENGAGEMENT -> FLASH_SALE_COUNTDOWN -> Next Inventory Item every 3-5 minutes
   */
  private scheduleStateAndItemRotation(): void {
    this.stopTimers();
    const cycleMs = this.rotationIntervalMinutes * 60 * 1000;

    // Transition SHOWCASE_ITEM -> QNA_ENGAGEMENT -> FLASH_SALE_COUNTDOWN within each item's showcase window
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
      const script = `Agla 1-of-1 piece screen par aa chuka hai! ${nextProd.brandName} ${nextProd.itemName}, Size ${nextProd.size}, sirf ${nextProd.priceAED} AED! Screen par QR code scan kar ke foran book karein!`;
      await liveStreamAgentService.announceLiveEventOnStream({
        boothId: this.boothId,
        eventType: 'ITEM_INTRO',
        spokenScript: script,
        lang: 'ROMAN_URDU',
        synthesizeAudio: true
      });
    }

    return overlay;
  }

  /**
   * 3. Event Triggering: When a sale is confirmed via `marketing.service.ts` / Baileys / Live Claim,
   *    trigger overlay graphic `"ITEM [SKU] SOLD!"` and command the AI Host to thank the buyer live on stream!
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
    thankYouScript: string;
    audioBufferMp3?: Buffer;
  }> {
    const sku = String(params.sku || this.currentOverlay?.activeProduct?.sku || 'VV-90S-8920')
      .trim()
      .toUpperCase();
    const buyerName = String(params.buyerName || 'VIP Collector').trim();
    const channel = String(params.channel || 'WhatsApp').trim();
    const pool = this.getAvailableShowcasePool();
    const matchedProd =
      pool.find(p => p.sku === sku) ||
      this.currentOverlay?.activeProduct ||
      pool[0];
    const soldPriceAED = Number(params.soldPriceAED || matchedProd.priceAED || 180);

    const bannerText = `ITEM ${sku} SOLD!`;
    const overlay = await this.buildDynamicOverlay(matchedProd, 'SOLD_OUT_ALERT', {
      soldAlertBanner: {
        visible: true,
        bannerText,
        buyerName,
        soldPriceAED,
        channel
      }
    });

    const thankYouScript = `Mubarak ho! Item ${sku} (${matchedProd.brandName} ${matchedProd.itemName}) SOLD ho chuka hai! Bohat shukriya ${buyerName} bhai (${channel} se) — Director Muhammad Akram aap ka 1-of-1 parcel aaj hi dispatch karwa rahe hain!`;

    const hostRes = await liveStreamAgentService.announceLiveEventOnStream({
      boothId: this.boothId,
      eventType: 'ITEM_SOLD',
      spokenScript: thankYouScript,
      lang: 'ROMAN_URDU',
      synthesizeAudio: params.synthesizeAudio !== false
    });

    return {
      overlay,
      bannerText,
      thankYouScript,
      audioBufferMp3: hostRes.audioBufferMp3
    };
  }

  /**
   * 4. Stop Autonomous Live Stream (`/api/livestream/stop`)
   */
  public stopAutonomousLiveStream(): {
    success: boolean;
    isLive: boolean;
    boothId: string;
    stoppedChannels: OmniStreamChannel[];
  } {
    this.stopTimers();
    this.isLive = false;
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

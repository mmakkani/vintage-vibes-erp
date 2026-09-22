/**
 * Meta (Facebook & Instagram) and TikTok Pixel Tracking Engine
 * 
 * Safely initializes official browser tracking SDKs and dispatches standard e-commerce
 * conversion events (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase).
 * Ad-blocker safe: all operations wrap in try-catch with no-op fallbacks.
 */

import { PieceBreakdownItem } from '../modules/purchase/purchase.types.ts';
import { PixelTrackingConfig } from '../modules/setup/setup.types.ts';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
    ttq?: {
      track: (eventName: string, params?: any) => void;
      page: () => void;
      load: (pixelId: string, options?: any) => void;
      instance?: (id: string) => any;
      methods?: string[];
      [key: string]: any;
    };
    TiktokAnalyticsObject?: string;
  }
}

class PixelTrackingEngine {
  private isMetaInitialized = false;
  private isTiktokInitialized = false;
  private currentConfig: PixelTrackingConfig = {};

  /**
   * Initialize Meta and TikTok Pixels using current configuration
   */
  public initPixels(config?: PixelTrackingConfig): void {
    if (typeof window === 'undefined') return;
    if (!config) return;

    this.currentConfig = config;

    // 1. Initialize Meta Pixel (Facebook & Instagram)
    if (config.metaPixelId && config.enableMetaPixel !== false && !this.isMetaInitialized) {
      try {
        this.injectMetaScript(config.metaPixelId.trim(), config.testEventCode?.trim());
        this.isMetaInitialized = true;
      } catch (err) {
        console.warn('[PixelEngine] Meta Pixel init skipped or blocked:', err);
      }
    }

    // 2. Initialize TikTok Pixel
    if (config.tiktokPixelId && config.enableTiktokPixel !== false && !this.isTiktokInitialized) {
      try {
        this.injectTikTokScript(config.tiktokPixelId.trim());
        this.isTiktokInitialized = true;
      } catch (err) {
        console.warn('[PixelEngine] TikTok Pixel init skipped or blocked:', err);
      }
    }
  }

  private injectMetaScript(pixelId: string, testEventCode?: string): void {
    if (window.fbq) {
      window.fbq('init', pixelId);
      return;
    }

    /* eslint-disable */
    (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */

    if (window.fbq) {
      window.fbq('init', pixelId);
      if (testEventCode) {
        window.fbq('set', 'testEventCode', testEventCode);
      }
      window.fbq('track', 'PageView');
    }
  }

  private injectTikTokScript(pixelId: string): void {
    if (window.ttq && typeof window.ttq.load === 'function') {
      window.ttq.load(pixelId);
      return;
    }

    /* eslint-disable */
    (function (w: any, d: any, t: any) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = [
        'page',
        'track',
        'identify',
        'instances',
        'debug',
        'on',
        'off',
        'once',
        'ready',
        'alias',
        'group',
        'enableCookie',
        'disableCookie',
        'holdConsent',
        'revokeConsent',
        'grantConsent'
      ];
      ttq.setAndDefer = function (t: any, e: any) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (var i = 0; i < ttq.methods.length; i++) {
        ttq.setAndDefer(ttq, ttq.methods[i]);
      }
      ttq.instance = function (t: any) {
        for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) {
          ttq.setAndDefer(e, ttq.methods[n]);
        }
        return e;
      };
      ttq.load = function (e: any, n: any) {
        var r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        var a = document.createElement('script');
        a.type = 'text/javascript';
        a.async = true;
        a.src = r + '?sdkid=' + e + '&lib=' + t;
        var c = document.getElementsByTagName('script')[0];
        c.parentNode.insertBefore(a, c);
      };
      ttq.load(pixelId);
      ttq.page();
    })(window, document, 'ttq');
    /* eslint-enable */
  }

  /**
   * Track Storefront PageView
   */
  public trackPageView(): void {
    try {
      if (window.fbq) {
        window.fbq('track', 'PageView');
      }
      if (window.ttq && typeof window.ttq.page === 'function') {
        window.ttq.page();
      }
    } catch (_) {}
  }

  /**
   * Track inspecting/viewing a vintage garment
   */
  public trackViewContent(piece: PieceBreakdownItem): void {
    if (!piece) return;
    try {
      const price = piece.retailPriceAed || piece.estimatedPrice || 295;
      const sku = piece.barcode || piece.id || 'VINTAGE-PIECE';
      const name = `${piece.brandName || ''} ${piece.itemName || 'Vintage Piece'}`.trim();
      const category = piece.category || 'Apparel';

      // Meta ViewContent
      if (window.fbq) {
        window.fbq('track', 'ViewContent', {
          content_name: name,
          content_category: category,
          content_ids: [sku],
          content_type: 'product',
          value: price,
          currency: 'AED'
        });
      }

      // TikTok ViewContent
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('ViewContent', {
          content_id: sku,
          content_type: 'product',
          content_name: name,
          content_category: category,
          quantity: 1,
          price: price,
          value: price,
          currency: 'AED'
        });
      }
    } catch (_) {}
  }

  /**
   * Track adding a 1-of-1 vintage item to cart or reserving
   */
  public trackAddToCart(piece: PieceBreakdownItem): void {
    if (!piece) return;
    try {
      const price = piece.retailPriceAed || piece.estimatedPrice || 295;
      const sku = piece.barcode || piece.id || 'VINTAGE-PIECE';
      const name = `${piece.brandName || ''} ${piece.itemName || 'Vintage Piece'}`.trim();
      const category = piece.category || 'Apparel';

      // Meta AddToCart
      if (window.fbq) {
        window.fbq('track', 'AddToCart', {
          content_name: name,
          content_category: category,
          content_ids: [sku],
          content_type: 'product',
          value: price,
          currency: 'AED'
        });
      }

      // TikTok AddToCart
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('AddToCart', {
          content_id: sku,
          content_type: 'product',
          content_name: name,
          content_category: category,
          quantity: 1,
          price: price,
          value: price,
          currency: 'AED'
        });
      }
    } catch (_) {}
  }

  /**
   * Track checkout modal opening / checkout initiation
   */
  public trackInitiateCheckout(items: PieceBreakdownItem[], totalAed: number): void {
    if (!items || items.length === 0) return;
    try {
      const contentIds = items.map(it => it.barcode || it.id || 'PIECE');

      // Meta InitiateCheckout
      if (window.fbq) {
        window.fbq('track', 'InitiateCheckout', {
          content_ids: contentIds,
          content_type: 'product',
          num_items: items.length,
          value: totalAed,
          currency: 'AED'
        });
      }

      // TikTok InitiateCheckout
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('InitiateCheckout', {
          contents: items.map(it => ({
            content_id: it.barcode || it.id || 'PIECE',
            content_type: 'product',
            content_name: `${it.brandName || ''} ${it.itemName || ''}`.trim(),
            quantity: 1,
            price: it.retailPriceAed || it.estimatedPrice || 295
          })),
          value: totalAed,
          currency: 'AED'
        });
      }
    } catch (_) {}
  }

  /**
   * Track order completion and successful payment
   */
  public trackPurchase(orderNumber: string, items: PieceBreakdownItem[], totalAed: number): void {
    if (!items || items.length === 0) return;
    try {
      const contentIds = items.map(it => it.barcode || it.id || 'PIECE');

      // Meta Purchase
      if (window.fbq) {
        window.fbq('track', 'Purchase', {
          content_ids: contentIds,
          content_type: 'product',
          num_items: items.length,
          value: totalAed,
          currency: 'AED',
          order_id: orderNumber
        });
      }

      // TikTok CompletePayment
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('CompletePayment', {
          contents: items.map(it => ({
            content_id: it.barcode || it.id || 'PIECE',
            content_type: 'product',
            content_name: `${it.brandName || ''} ${it.itemName || ''}`.trim(),
            quantity: 1,
            price: it.retailPriceAed || it.estimatedPrice || 295
          })),
          value: totalAed,
          currency: 'AED'
        });
      }
    } catch (_) {}
  }

  /**
   * Trigger a test event from the Admin setup console to verify live connection
   */
  public fireTestEvent(platform: 'meta' | 'tiktok' | 'both'): { metaFired: boolean; tiktokFired: boolean } {
    let metaFired = false;
    let tiktokFired = false;

    if (platform === 'meta' || platform === 'both') {
      if (window.fbq) {
        window.fbq('trackCustom', 'VintageVibesAdminTestEvent', {
          timestamp: new Date().toISOString(),
          status: 'CONNECTED',
          channel: 'Meta Pixel Test Hub',
          currency: 'AED'
        });
        metaFired = true;
      }
    }

    if (platform === 'tiktok' || platform === 'both') {
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('Click', {
          content_name: 'VintageVibesAdminTestEvent',
          timestamp: new Date().toISOString(),
          currency: 'AED'
        });
        tiktokFired = true;
      }
    }

    return { metaFired, tiktokFired };
  }
}

export const pixelTracking = new PixelTrackingEngine();

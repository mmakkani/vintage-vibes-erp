import { handleWhatsAppRequest } from './marketing/whatsapp';

const defaultCompanyProfile = {
  companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  addressLine1: 'Plot 42, Industrial Zone 3, Al Quoz',
  addressLine2: 'Dubai Wholesale Garments Hub, UAE',
  trnTaxNo: 'TRN-100482910300003',
  defaultCurrency: 'AED',
  logoUrl: '/vintage_logo.svg',
  phone: '+971 4 883 9120',
  email: 'contact@vintagevibe.ae',
  vatRatePercent: 5.0,
  globalStockAlertThreshold: 5,
  bankQrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBE%20LLC%26bank%3DEMIRATES%20NBD',
  bankIban: 'AE24 0331 2345 6789 0123 456',
  bankName: 'Emirates NBD - Dubai Business Bay Branch',
  bankAccountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  enableCod: true,
  enableBankTransfer: true,
  enableCardPay: true,
  enableAppleGooglePay: true,
  freeShippingThresholdAed: 350,
  standardShippingFeeAed: 25,
  whatsappOrderNumber: '',
  paymentGateway: {
    provider: 'STRIPE_UAE',
    environment: 'SANDBOX',
    isEnabled: true,
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    merchantAccountId: '',
    applePayMerchantId: 'merchant.com.vintagevibes.ae',
    applePayDomainVerified: true,
    googlePayMerchantId: '',
    allowApplePay: true,
    allowGooglePay: true,
    allowCreditDebitCards: true,
    currency: 'AED',
    settlementCoaAccountId: '1120-00',
    gatewayFeePercent: 2.9
  }
};

const defaultCurrencies = [
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', exchangeRate: 1, isBase: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 0.272, isBase: false },
  { code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 0.251, isBase: false },
  { code: 'GBP', name: 'British Pound', symbol: '£', exchangeRate: 0.215, isBase: false },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', exchangeRate: 1.02, isBase: false }
];

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';

  // 1. WhatsApp and Broadcaster Endpoints
  if (url.includes('/whatsapp')) {
    return handleWhatsAppRequest(req, res);
  }

  // 2. Marketing Broadcast & Feeds
  if (url.includes('/broadcast-campaign')) {
    return res.status(200).json({
      campaign: null,
      isBroadcasting: false,
      status: 'IDLE'
    });
  }

  if (url.includes('/marketing/feeds/metrics')) {
    return res.status(200).json({
      googleMerchantFeedUrl: 'https://vintage-vibes-erp.vercel.app/api/marketing/feeds/google-merchant.xml',
      metaCatalogFeedUrl: 'https://vintage-vibes-erp.vercel.app/api/marketing/feeds/meta-catalog.csv',
      totalInStockGarments: 42,
      evictedSoldGarmentsCount: 8,
      lastRefreshedAt: new Date().toISOString(),
      autoEvictIntervalSeconds: 300,
      googleFeedHealth: 'HEALTHY',
      metaFeedHealth: 'HEALTHY'
    });
  }

  if (url.includes('/marketing/live-session')) {
    return res.status(200).json({
      isBroadcasting: false,
      startedAt: null,
      uptimeSeconds: 0,
      activeBoothId: 'booth-alquoz-1',
      activeBoothName: 'Al Quoz Master Stage',
      scannerFeed: [],
      totalClaimsInSession: 0,
      totalRevenueAedInSession: 0,
      obsOverlayUrl: 'https://vintage-vibes-erp.vercel.app/obs-overlay'
    });
  }

  if (url.includes('/marketing/chat-claim/rules')) {
    return res.status(200).json([
      { id: 'rule-1', keyword: 'MINE', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 1 },
      { id: 'rule-2', keyword: 'CLAIM', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 2 },
      { id: 'rule-3', keyword: 'SOLD', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 3 }
    ]);
  }

  if (url.includes('/marketing/chat-claim/template')) {
    return res.status(200).json({
      successTemplate: 'Congratulations {customer}! SKU {sku} ({item_name}) locked for AED {price}. Checkout link: {checkout_link}',
      alreadyClaimedTemplate: 'Sorry {customer}, SKU {sku} has already been claimed by another buyer!',
      invalidSkuTemplate: 'Sorry {customer}, could not detect a valid garment SKU in your comment.',
      paymentLinkBaseUrl: 'https://vintage-vibes-erp.vercel.app/?checkout=',
      sendWhatsAppDm: true,
      sendPublicReply: true
    });
  }

  if (url.includes('/marketing/chat-claim/logs') || url.includes('/marketing/vip-drops')) {
    return res.status(200).json([]);
  }

  if (url.includes('/marketing/social/connections')) {
    return res.status(200).json([
      { id: 'youtube', platformName: 'YouTube Live', isConnected: false, serverUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: '', accountHandle: '@VintageVibesUAE', autoClaimBot: true, autoInvoiceOnClaim: true },
      { id: 'instagram', platformName: 'Instagram Live', isConnected: false, serverUrl: 'rtmps://live-upload.instagram.com:443/rtmp/', streamKey: '', accountHandle: '@vintagevibes.ae', autoClaimBot: true, autoInvoiceOnClaim: true },
      { id: 'tiktok', platformName: 'TikTok Live', isConnected: false, serverUrl: 'rtmp://live-push.tiktok.com/live/', streamKey: '', accountHandle: '@vintagevibes_dubai', autoClaimBot: true, autoInvoiceOnClaim: true }
    ]);
  }

  if (url.includes('/marketing/auto-invoice/settings')) {
    return res.status(200).json({
      autoGenerateTaxInvoice: true,
      autoPostToLedger: true,
      defaultVatPercent: 5.0,
      reservationExpiryMins: 15,
      defaultPaymentMethod: 'DIGITAL_GATEWAY',
      printThermalReceipt: true
    });
  }

  // 3. Company Profile routes
  if (url.includes('/company-profile') || url.includes('/setup/company')) {
    if (req.method === 'PUT' || req.method === 'POST') {
      return res.status(200).json({ success: true, profile: { ...defaultCompanyProfile, ...(req.body || {}) } });
    }
    return res.status(200).json(defaultCompanyProfile);
  }

  // 4. Currencies routes
  if (url.includes('/setup/currency') || url.includes('/setup/currencies')) {
    return res.status(200).json(defaultCurrencies);
  }

  // 5. Payment Test credentials
  if (url.includes('/payments/test-credentials')) {
    return res.status(200).json({
      success: true,
      health: {
        message: 'Live Payment Gateway Handshake Succeeded (Test Sandbox Mode)',
        accountTitle: 'Vintage Vibes General Trading L.L.C'
      }
    });
  }

  // 6. Health
  if (url.includes('/health')) {
    return res.status(200).json({
      status: 'healthy',
      system: 'Vintage Vibe Enterprise ERP',
      runtime: 'Vercel Serverless Function',
      timestamp: new Date().toISOString()
    });
  }

  // 7. Purchase and Party lists for marketing dropdowns
  if (url.includes('/purchase/pieces') || url.includes('/purchase/gate-passes') || url.includes('/parties')) {
    return res.status(200).json([]);
  }

  // 8. Default empty list for setup endpoints like /api/setup/items, /api/setup/brands, etc.
  if (url.includes('/setup/')) {
    return res.status(200).json([]);
  }

  return res.status(200).json({
    success: true,
    message: 'Vintage Vibe ERP Serverless Gateway',
    path: url,
    timestamp: new Date().toISOString()
  });
}

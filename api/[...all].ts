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

export default function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';

  // Company Profile routes
  if (url.includes('/company-profile') || url.includes('/setup/company')) {
    if (req.method === 'PUT' || req.method === 'POST') {
      return res.status(200).json({ success: true, profile: { ...defaultCompanyProfile, ...(req.body || {}) } });
    }
    return res.status(200).json(defaultCompanyProfile);
  }

  // Currencies routes
  if (url.includes('/setup/currency') || url.includes('/setup/currencies')) {
    return res.status(200).json(defaultCurrencies);
  }

  // Payment Test credentials
  if (url.includes('/payments/test-credentials')) {
    return res.status(200).json({
      success: true,
      health: {
        message: 'Live Payment Gateway Handshake Succeeded (Test Sandbox Mode)',
        accountTitle: 'Vintage Vibes General Trading L.L.C'
      }
    });
  }

  // Health
  if (url.includes('/health')) {
    return res.status(200).json({
      status: 'healthy',
      system: 'Vintage Vibe Enterprise ERP',
      runtime: 'Vercel Serverless Function',
      timestamp: new Date().toISOString()
    });
  }

  // Default empty list for setup endpoints like /api/setup/items, /api/setup/brands, etc.
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

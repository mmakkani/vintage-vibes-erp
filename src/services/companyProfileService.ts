import { supabase } from '../supabaseClient.ts';
import { CompanyProfile } from '../modules/setup/setup.types.ts';

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
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
  whatsappOrderNumber: '+971554186086',
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

export function cleanWhatsAppNumber(input?: string): string {
  if (!input) return '';
  let cleaned = input.trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  // Strip leading zeroes (e.g., 00971... -> 971...)
  cleaned = cleaned.replace(/^0+/, '');
  return cleaned ? `+${cleaned}` : '';
}

export class CompanyProfileService {
  public static async getCompanyProfile(): Promise<CompanyProfile> {
    const { data, error } = await supabase
      .from('company_profile')
      .select('*')
      .eq('id', 'default-company')
      .maybeSingle();

    if (error) {
      console.error('Supabase error on company_profile:', error);
      throw new Error(error.message || 'Database error occurred reading company profile');
    }

    if (!data) {
      return DEFAULT_COMPANY_PROFILE;
    }

    const waOrdersNumber = data.whatsapp_orders_number || data.whatsapp_order_number || data.whatsappOrderNumber || DEFAULT_COMPANY_PROFILE.whatsappOrderNumber || '';

    // Map database snake_case or raw profile_data to camelCase
    const prof: CompanyProfile = {
      ...DEFAULT_COMPANY_PROFILE,
      companyName: data.company_name || data.companyName || DEFAULT_COMPANY_PROFILE.companyName,
      addressLine1: data.address_line1 || data.addressLine1 || DEFAULT_COMPANY_PROFILE.addressLine1,
      addressLine2: data.address_line2 || data.addressLine2 || DEFAULT_COMPANY_PROFILE.addressLine2,
      trnTaxNo: data.trn_tax_no || data.trnTaxNo || DEFAULT_COMPANY_PROFILE.trnTaxNo,
      defaultCurrency: (data.default_currency || data.defaultCurrency || 'AED') as any,
      logoUrl: data.logo_url || data.logoUrl || DEFAULT_COMPANY_PROFILE.logoUrl,
      phone: data.phone || DEFAULT_COMPANY_PROFILE.phone,
      email: data.email || DEFAULT_COMPANY_PROFILE.email,
      vatRatePercent: Number(data.vat_rate_percent ?? data.vatRatePercent ?? DEFAULT_COMPANY_PROFILE.vatRatePercent),
      globalStockAlertThreshold: Number(data.global_stock_alert_threshold ?? data.globalStockAlertThreshold ?? 5),
      bankName: data.bank_name || data.bankName || DEFAULT_COMPANY_PROFILE.bankName,
      bankAccountTitle: data.bank_account_title || data.bankAccountTitle || DEFAULT_COMPANY_PROFILE.bankAccountTitle,
      bankIban: data.bank_iban || data.bankIban || DEFAULT_COMPANY_PROFILE.bankIban,
      bankAccountNumber: data.bank_account_number || data.bankAccountNumber || '',
      bankQrCodeUrl: data.bank_qr_code_url || data.bankQrCodeUrl || DEFAULT_COMPANY_PROFILE.bankQrCodeUrl,
      bankAccounts: data.bank_accounts || data.bankAccounts || [],
      enableCod: data.enable_cod !== false && data.enableCod !== false,
      enableBankTransfer: data.enable_bank_transfer !== false && data.enableBankTransfer !== false,
      enableCardPay: data.enable_card_pay !== false && data.enableCardPay !== false,
      enableAppleGooglePay: data.enable_apple_google_pay !== false && data.enableAppleGooglePay !== false,
      freeShippingThresholdAed: Number(data.free_shipping_threshold_aed ?? data.freeShippingThresholdAed ?? 350),
      standardShippingFeeAed: Number(data.standard_shipping_fee_aed ?? data.standardShippingFeeAed ?? 25),
      whatsappOrderNumber: waOrdersNumber,
      whatsapp_orders_number: waOrdersNumber,
      whatsappOrdersNumber: waOrdersNumber,
      posTerminalConfig: data.pos_terminal_config || data.posTerminalConfig,
      paymentGateway: data.payment_gateway || data.paymentGateway || DEFAULT_COMPANY_PROFILE.paymentGateway,
      tiktokLiveSocket: data.tiktok_live_socket || data.tiktokLiveSocket,
      posBridge: data.pos_bridge || data.posBridge,
      ...(data.profile_data || {})
    };

    return prof;
  }

  public static async updateCompanyProfile(profile: Partial<CompanyProfile>): Promise<CompanyProfile> {
    const rawWa = profile.whatsapp_orders_number || profile.whatsappOrdersNumber || profile.whatsappOrderNumber || '';
    const cleanedWa = cleanWhatsAppNumber(rawWa);

    const payload = {
      id: 'default-company',
      company_name: profile.companyName,
      address_line1: profile.addressLine1,
      address_line2: profile.addressLine2,
      trn_tax_no: profile.trnTaxNo,
      default_currency: profile.defaultCurrency || 'AED',
      logo_url: profile.logoUrl,
      phone: profile.phone,
      email: profile.email,
      vat_rate_percent: profile.vatRatePercent ?? 5.0,
      global_stock_alert_threshold: profile.globalStockAlertThreshold ?? 5,
      bank_name: profile.bankName,
      bank_account_title: profile.bankAccountTitle,
      bank_iban: profile.bankIban,
      bank_account_number: profile.bankAccountNumber,
      bank_qr_code_url: profile.bankQrCodeUrl,
      bank_accounts: profile.bankAccounts || [],
      enable_cod: profile.enableCod !== false,
      enable_bank_transfer: profile.enableBankTransfer !== false,
      enable_card_pay: profile.enableCardPay !== false,
      enable_apple_google_pay: profile.enableAppleGooglePay !== false,
      free_shipping_threshold_aed: profile.freeShippingThresholdAed ?? 350,
      standard_shipping_fee_aed: profile.standardShippingFeeAed ?? 25,
      whatsapp_order_number: cleanedWa,
      whatsapp_orders_number: cleanedWa,
      pos_terminal_config: profile.posTerminalConfig,
      payment_gateway: profile.paymentGateway,
      tiktok_live_socket: profile.tiktokLiveSocket,
      pos_bridge: profile.posBridge,
      profile_data: {
        ...profile,
        whatsapp_orders_number: cleanedWa,
        whatsappOrderNumber: cleanedWa
      },
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('company_profile')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on company_profile:', error);
      throw new Error(error.message || 'Database error occurred saving company profile');
    }

    return this.getCompanyProfile();
  }
}

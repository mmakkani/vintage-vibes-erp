import { supabase } from '../supabaseClient.ts';
import { CompanyProfile, BankAccountConfig } from '../modules/setup/setup.types.ts';
import { POSTerminalConfig, POSTerminalDevice } from '../modules/setup/hardware.types.ts';

export const DEFAULT_RAKBANK_POS_DEVICE: POSTerminalDevice = {
  id: 'pos-dev-01',
  name: 'RAKBANK Paymob PAX A960',
  model: 'PAX_A960',
  connectionType: 'CELLULAR_SIM',
  ipAddress: '',
  port: 8080,
  terminalId: '12857001',
  merchantId: '85283',
  serialNumber: '1180511614',
  imei: '350814987795465',
  simCarrier: 'DU',
  paymobTid: '12857001',
  paymobMid: '85283',
  paymobApiKey: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_API_KEY) ||
    (typeof process !== 'undefined' && (process.env.PAYMOB_API_KEY || process.env.VITE_PAYMOB_API_KEY)) || '',
  paymobIntegrationId: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_INTEGRATION_ID) ||
    (typeof process !== 'undefined' && (process.env.PAYMOB_INTEGRATION_ID || process.env.VITE_PAYMOB_INTEGRATION_ID)) || '',
  cloudPushEnabled: true,
  isActive: true,
  status: 'ONLINE',
  location: 'Main Cash Counter',
  bankId: 'bnk-rak-01',
  bankName: 'RAKBANK',
  bankCoaCode: '1120-02'
};

export const DEFAULT_BANK_ACCOUNTS: BankAccountConfig[] = [
  {
    id: 'bnk-rak-01',
    bankName: 'RAKBANK',
    accountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    iban: 'AE24 0331 2345 6789 0123 456',
    accountNumber: '1048291029301',
    branchName: 'Dubai Downtown / Al Ain',
    swiftBic: 'RAKBAEADXXX',
    currency: 'AED',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBES%20GENERAL%20TRADING%26bank%3DRAKBANK',
    isPrimary: true,
    linkedPosTerminalId: '12857001',
    coaAccountCode: '1120-02',
    status: 'ACTIVE',
    posFleet: [DEFAULT_RAKBANK_POS_DEVICE]
  }
];

export const DEFAULT_POS_TERMINAL_CONFIG: POSTerminalConfig = {
  id: 'pos-dev-01',
  terminalName: 'RAKBANK Paymob PAX A960',
  terminalModel: 'PAX_A960',
  model: 'PAX_A960',
  connectionType: 'CELLULAR_SIM',
  terminalId: '12857001',
  merchantId: '114400000012857',
  status: 'ONLINE',
  clearingAccountId: '1125-00',
  settlementCoaAccountCode: '1120-02',
  linkedBankName: 'RAKBANK',
  linkedBankAccountId: 'bnk-rak-01',
  autoPrintCustomerReceipt: true,
  autoPrintMerchantSlip: false,
  allowApplePayNfc: true,
  allowGooglePayNfc: true,
  allowContactlessChip: true,
  currency: 'AED',
  fleet: [DEFAULT_RAKBANK_POS_DEVICE]
};

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  company_display_name: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  companyDisplayName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  addressLine1: 'House 14 Street 4 - Al Jimi - Al Nudood',
  address_line_1: 'House 14 Street 4 - Al Jimi - Al Nudood',
  addressLine2: 'Al Ain, Abu Dhabi, United Arab Emirates',
  address_line_2: 'Al Ain, Abu Dhabi, United Arab Emirates',
  city: 'Al Ain, Abu Dhabi',
  country: 'United Arab Emirates',
  trnTaxNo: 'TRN-100482910300003',
  trn_number: 'TRN-100482910300003',
  trnNumber: 'TRN-100482910300003',
  defaultCurrency: 'AED',
  logoUrl: '/vintage_logo.svg',
  phone: '+971 55 418 6086',
  corporate_phone: '+971 55 418 6086',
  corporatePhone: '+971 55 418 6086',
  email: 'sales@vintagevibesllcspc.com',
  corporate_email: 'sales@vintagevibesllcspc.com',
  corporateEmail: 'sales@vintagevibesllcspc.com',
  social_links: {
    facebook: 'https://www.facebook.com/vintagevibes.ae/',
    instagram: 'https://www.instagram.com/vintagevibes.llc/',
    youtube: 'https://www.youtube.com/@VintageVibesLLCSPC',
    tiktok: 'https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn'
  },
  socialLinks: {
    facebook: 'https://www.facebook.com/vintagevibes.ae/',
    instagram: 'https://www.instagram.com/vintagevibes.llc/',
    youtube: 'https://www.youtube.com/@VintageVibesLLCSPC',
    tiktok: 'https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn'
  },
  vatRatePercent: 5.0,
  globalStockAlertThreshold: 5,
  bankQrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBES%20GENERAL%20TRADING%26bank%3DRAKBANK',
  bankIban: 'AE24 0331 2345 6789 0123 456',
  bankName: 'RAKBANK',
  bankAccountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  bankAccounts: DEFAULT_BANK_ACCOUNTS,
  posTerminalConfig: DEFAULT_POS_TERMINAL_CONFIG,
  enableCod: true,
  enableBankTransfer: true,
  enableCardPay: true,
  enableAppleGooglePay: true,
  freeShippingThresholdAed: 350,
  standardShippingFeeAed: 25,
  whatsappOrderNumber: '+971554186086',
  whatsapp_orders_number: '+971554186086',
  virtualHostVideoUrl: '/mazi_video.mp4',
  virtual_host_video_url: '/mazi_video.mp4',
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
  },
  maintenance_modules: {
    hr_payroll: false,
    purchases: false,
    sales: false,
    sorting: false,
    vouchers: false,
    inventory: false
  },
  maintenanceModules: {
    hr_payroll: false,
    purchases: false,
    sales: false,
    sorting: false,
    vouchers: false,
    inventory: false
  },
  cogsAccountCode: '5100-02',
  cogs_account_code: '5100-02',
  finishedGoodsAccountCode: '1160-01',
  finished_goods_account_code: '1160-01',
  posRevenueAccountCode: '4110-01',
  pos_revenue_account_code: '4110-01',
  walkInCustomerAccountCode: '1130-05',
  walk_in_customer_account_code: '1130-05',
  vatOutputAccountCode: '2140-01',
  vat_output_account_code: '2140-01',
  cashAccountCode: '1110-01',
  cash_account_code: '1110-01',
  bankAccountCode: '1120-01',
  bank_account_code: '1120-01'
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
  public static async uploadAsset(file: File | Blob, bucket: string = 'company_assets', folder: string = 'logos'): Promise<string> {
    const fileExt = (file instanceof File && file.name) ? (file.name.split('.').pop() || 'png') : 'png';
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        upsert: true,
        contentType: (file instanceof File ? file.type : undefined) || 'image/png'
      });

    if (uploadError) {
      console.error(`Storage upload error (${bucket}/${fileName}):`, uploadError);
      throw new Error(uploadError.message || 'File upload failed');
    }

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  private static cachedProfile: CompanyProfile | null = null;
  private static profilePromise: Promise<CompanyProfile> | null = null;
  private static lastFetched: number = 0;
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  public static clearCache(): void {
    this.cachedProfile = null;
    this.profilePromise = null;
    this.lastFetched = 0;
  }

  public static async getCompanyProfile(forceRefresh: boolean = false): Promise<CompanyProfile> {
    if (!forceRefresh && this.cachedProfile && (Date.now() - this.lastFetched < this.TTL_MS)) {
      return this.cachedProfile;
    }
    if (this.profilePromise) {
      return this.profilePromise;
    }

    this.profilePromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('company_profile')
          .select('*')
          .eq('id', 'default-company')
          .maybeSingle();

        if (error) {
          console.error('Supabase error on company_profile:', error);
          if (this.cachedProfile) return this.cachedProfile;
          throw new Error(error.message || 'Database error occurred reading company profile');
        }

        if (!data) {
          this.cachedProfile = DEFAULT_COMPANY_PROFILE;
          this.lastFetched = Date.now();
          return DEFAULT_COMPANY_PROFILE;
        }

    const waOrdersNumber = data.whatsapp_orders_number || data.whatsapp_order_number || data.whatsappOrderNumber || DEFAULT_COMPANY_PROFILE.whatsappOrderNumber || '';
    const companyDisplayName = data.company_display_name || data.companyDisplayName || data.company_name || data.companyName || DEFAULT_COMPANY_PROFILE.companyName;
    const trnNum = data.trn_number || data.trnNumber || data.trn_tax_no || data.trnTaxNo || DEFAULT_COMPANY_PROFILE.trnTaxNo;
    const addr1 = data.address_line_1 || data.address_line1 || data.addressLine1 || DEFAULT_COMPANY_PROFILE.addressLine1;
    const addr2 = data.address_line_2 || data.address_line2 || data.addressLine2 || DEFAULT_COMPANY_PROFILE.addressLine2;
    const city = data.city || DEFAULT_COMPANY_PROFILE.city || 'Al Ain, Abu Dhabi';
    const country = data.country || DEFAULT_COMPANY_PROFILE.country || 'United Arab Emirates';
    const corpPhone = data.corporate_phone || data.corporatePhone || data.phone || DEFAULT_COMPANY_PROFILE.phone;
    const corpEmail = data.corporate_email || data.corporateEmail || data.email || DEFAULT_COMPANY_PROFILE.email;
    const socialLinks = data.social_links || data.socialLinks || DEFAULT_COMPANY_PROFILE.social_links;

    // Parse / normalize bank accounts
    let bankAccounts: BankAccountConfig[] = data.bank_accounts || data.bankAccounts;
    if (!Array.isArray(bankAccounts) || bankAccounts.length === 0) {
      bankAccounts = [...DEFAULT_BANK_ACCOUNTS];
    } else {
      const hasFleet = bankAccounts.some(b => Array.isArray(b.posFleet) && b.posFleet.length > 0);
      if (!hasFleet && DEFAULT_BANK_ACCOUNTS[0]?.posFleet) {
        bankAccounts = bankAccounts.map((b, idx) => {
          if (b.isPrimary || idx === 0) {
            return {
              ...b,
              posFleet: [...(DEFAULT_BANK_ACCOUNTS[0].posFleet || [])]
            };
          }
          return b;
        });
      }
    }

    // Parse / normalize POS terminal config
    let posTerminalConfig: POSTerminalConfig = data.pos_terminal_config || data.posTerminalConfig || DEFAULT_POS_TERMINAL_CONFIG;
    if (!posTerminalConfig || (!posTerminalConfig.fleet?.length && !posTerminalConfig.terminalId)) {
      posTerminalConfig = { ...DEFAULT_POS_TERMINAL_CONFIG };
    } else if (!Array.isArray(posTerminalConfig.fleet) || posTerminalConfig.fleet.length === 0) {
      posTerminalConfig = {
        ...posTerminalConfig,
        fleet: [DEFAULT_RAKBANK_POS_DEVICE]
      };
    }

    // Merge cached profile from localStorage if available in browser
    if (typeof window !== 'undefined') {
      try {
        const cachedStr = localStorage.getItem('vintage_cached_company_profile');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached.bankAccounts) && cached.bankAccounts.some((b: any) => b.posFleet?.length > 0)) {
            bankAccounts = cached.bankAccounts;
          }
          if (cached.posTerminalConfig?.fleet?.length > 0) {
            posTerminalConfig = cached.posTerminalConfig;
          }
        }
      } catch {}
    }

    // Hydrate Paymob integration credentials from env variables without hardcoding
    const envIntegrationId = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_INTEGRATION_ID) ||
      (typeof process !== 'undefined' && (process.env?.PAYMOB_INTEGRATION_ID || process.env?.VITE_PAYMOB_INTEGRATION_ID)) || '';
    const envApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_API_KEY) ||
      (typeof process !== 'undefined' && (process.env?.PAYMOB_API_KEY || process.env?.VITE_PAYMOB_API_KEY)) || '';
    const envTid = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_TID) ||
      (typeof process !== 'undefined' && (process.env?.PAYMOB_TID || process.env?.VITE_PAYMOB_TID)) || '';
    const envMid = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_MID) ||
      (typeof process !== 'undefined' && (process.env?.PAYMOB_MID || process.env?.VITE_PAYMOB_MID)) || '';

    bankAccounts = bankAccounts.map(b => ({
      ...b,
      linkedPosTerminalId: b.linkedPosTerminalId || envTid || '',
      posFleet: (b.posFleet || []).map(dev => ({
        ...dev,
        terminalId: dev.terminalId || envTid || '',
        merchantId: dev.merchantId || envMid || '',
        paymobTid: dev.paymobTid || envTid || '',
        paymobMid: dev.paymobMid || envMid || '',
        paymobIntegrationId: dev.paymobIntegrationId || envIntegrationId || '',
        paymobApiKey: dev.paymobApiKey || envApiKey || ''
      }))
    }));

    // Map database snake_case or raw profile_data to camelCase and snake_case
    const prof: CompanyProfile = {
      ...DEFAULT_COMPANY_PROFILE,
      companyName: companyDisplayName,
      company_display_name: companyDisplayName,
      companyDisplayName: companyDisplayName,
      addressLine1: addr1,
      address_line_1: addr1,
      addressLine2: addr2,
      address_line_2: addr2,
      city,
      country,
      trnTaxNo: trnNum,
      trn_number: trnNum,
      trnNumber: trnNum,
      defaultCurrency: (data.default_currency || data.defaultCurrency || 'AED') as any,
      logoUrl: data.logo_url || data.logoUrl || DEFAULT_COMPANY_PROFILE.logoUrl,
      phone: corpPhone,
      corporate_phone: corpPhone,
      corporatePhone: corpPhone,
      email: corpEmail,
      corporate_email: corpEmail,
      corporateEmail: corpEmail,
      social_links: socialLinks,
      socialLinks: socialLinks,
      vatRatePercent: Number(data.vat_rate_percent ?? data.vatRatePercent ?? DEFAULT_COMPANY_PROFILE.vatRatePercent),
      globalStockAlertThreshold: Number(data.global_stock_alert_threshold ?? data.globalStockAlertThreshold ?? 5),
      bankName: data.bank_name || data.bankName || DEFAULT_COMPANY_PROFILE.bankName,
      bankAccountTitle: data.bank_account_title || data.bankAccountTitle || DEFAULT_COMPANY_PROFILE.bankAccountTitle,
      bankIban: data.bank_iban || data.bankIban || DEFAULT_COMPANY_PROFILE.bankIban,
      bankAccountNumber: data.bank_account_number || data.bankAccountNumber || '',
      bankQrCodeUrl: data.bank_qr_code_url || data.bankQrCodeUrl || DEFAULT_COMPANY_PROFILE.bankQrCodeUrl,
      bankAccounts,
      enableCod: data.enable_cod !== false && data.enableCod !== false,
      enableBankTransfer: data.enable_bank_transfer !== false && data.enableBankTransfer !== false,
      enableCardPay: data.enable_card_pay !== false && data.enableCardPay !== false,
      enableAppleGooglePay: data.enable_apple_google_pay !== false && data.enableAppleGooglePay !== false,
      freeShippingThresholdAed: Number(data.free_shipping_threshold_aed ?? data.freeShippingThresholdAed ?? 350),
      standardShippingFeeAed: Number(data.standard_shipping_fee_aed ?? data.standardShippingFeeAed ?? 25),
      whatsappOrderNumber: waOrdersNumber,
      whatsapp_orders_number: waOrdersNumber,
      whatsappOrdersNumber: waOrdersNumber,
      virtualHostVideoUrl: data.virtual_host_video_url || data.virtualHostVideoUrl || DEFAULT_COMPANY_PROFILE.virtualHostVideoUrl || '/mazi_video.mp4',
      virtual_host_video_url: data.virtual_host_video_url || data.virtualHostVideoUrl || DEFAULT_COMPANY_PROFILE.virtual_host_video_url || '/mazi_video.mp4',
      posTerminalConfig,
      paymentGateway: data.payment_gateway || data.paymentGateway || DEFAULT_COMPANY_PROFILE.paymentGateway,
      tiktokLiveSocket: data.tiktok_live_socket || data.tiktokLiveSocket,
      posBridge: data.pos_bridge || data.posBridge,
      maintenance_modules: data.maintenance_modules || data.maintenanceModules || DEFAULT_COMPANY_PROFILE.maintenance_modules,
      maintenanceModules: data.maintenance_modules || data.maintenanceModules || DEFAULT_COMPANY_PROFILE.maintenance_modules,
      cogsAccountCode: data.cogs_account_code || data.cogsAccountCode || data.profile_data?.cogsAccountCode || DEFAULT_COMPANY_PROFILE.cogsAccountCode,
      finishedGoodsAccountCode: data.finished_goods_account_code || data.finishedGoodsAccountCode || data.profile_data?.finishedGoodsAccountCode || DEFAULT_COMPANY_PROFILE.finishedGoodsAccountCode,
      posRevenueAccountCode: data.pos_revenue_account_code || data.posRevenueAccountCode || data.profile_data?.posRevenueAccountCode || DEFAULT_COMPANY_PROFILE.posRevenueAccountCode,
      walkInCustomerAccountCode: data.walk_in_customer_account_code || data.walkInCustomerAccountCode || data.profile_data?.walkInCustomerAccountCode || DEFAULT_COMPANY_PROFILE.walkInCustomerAccountCode,
      vatOutputAccountCode: data.vat_output_account_code || data.vatOutputAccountCode || data.profile_data?.vatOutputAccountCode || DEFAULT_COMPANY_PROFILE.vatOutputAccountCode,
      cashAccountCode: data.cash_account_code || data.cashAccountCode || data.profile_data?.cashAccountCode || DEFAULT_COMPANY_PROFILE.cashAccountCode,
      bankAccountCode: data.bank_account_code || data.bankAccountCode || data.profile_data?.bankAccountCode || DEFAULT_COMPANY_PROFILE.bankAccountCode,
      ...(data.profile_data || {})
    };

        this.cachedProfile = prof;
        this.lastFetched = Date.now();
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('vintage_cached_company_profile', JSON.stringify(prof));
          } catch {}
        }
        return prof;
      } finally {
        this.profilePromise = null;
      }
    })();

    return this.profilePromise;
  }

  public static async updateCompanyProfile(profile: Partial<CompanyProfile>): Promise<CompanyProfile> {
    const rawWa = profile.whatsapp_orders_number || profile.whatsappOrdersNumber || profile.whatsappOrderNumber || '';
    const cleanedWa = cleanWhatsAppNumber(rawWa);

    const companyDisplayName = profile.company_display_name || profile.companyDisplayName || profile.companyName || DEFAULT_COMPANY_PROFILE.companyName;
    const trnNum = profile.trn_number || profile.trnNumber || profile.trnTaxNo || DEFAULT_COMPANY_PROFILE.trnTaxNo;
    const addr1 = profile.address_line_1 || profile.addressLine1 || DEFAULT_COMPANY_PROFILE.addressLine1;
    const addr2 = profile.address_line_2 || profile.addressLine2 || DEFAULT_COMPANY_PROFILE.addressLine2;
    const city = profile.city || DEFAULT_COMPANY_PROFILE.city;
    const country = profile.country || DEFAULT_COMPANY_PROFILE.country;
    const corpPhone = profile.corporate_phone || profile.corporatePhone || profile.phone || DEFAULT_COMPANY_PROFILE.phone;
    const corpEmail = profile.corporate_email || profile.corporateEmail || profile.email || DEFAULT_COMPANY_PROFILE.email;
    const socialLinks = profile.social_links || profile.socialLinks || DEFAULT_COMPANY_PROFILE.social_links;

    const payload = {
      id: 'default-company',
      company_name: companyDisplayName,
      company_display_name: companyDisplayName,
      address_line1: addr1,
      address_line_1: addr1,
      address_line2: addr2,
      address_line_2: addr2,
      city,
      country,
      trn_tax_no: trnNum,
      trn_number: trnNum,
      phone: corpPhone,
      corporate_phone: corpPhone,
      email: corpEmail,
      corporate_email: corpEmail,
      social_links: socialLinks,
      default_currency: profile.defaultCurrency || 'AED',
      logo_url: profile.logoUrl,
      vat_rate_percent: profile.vatRatePercent ?? 5.0,
      global_stock_alert_threshold: profile.globalStockAlertThreshold ?? 5,
      bank_name: profile.bankName,
      bank_account_title: profile.bankAccountTitle,
      bank_iban: profile.bankIban,
      bank_account_number: profile.bankAccountNumber,
      bank_qr_code_url: profile.bankQrCodeUrl,
      bank_qr_url: profile.bankQrCodeUrl,
      bank_accounts: profile.bankAccounts || [],
      enable_cod: profile.enableCod !== false,
      enable_bank_transfer: profile.enableBankTransfer !== false,
      enable_card_pay: profile.enableCardPay !== false,
      enable_apple_google_pay: profile.enableAppleGooglePay !== false,
      free_shipping_threshold_aed: profile.freeShippingThresholdAed ?? 350,
      standard_shipping_fee_aed: profile.standardShippingFeeAed ?? 25,
      whatsapp_order_number: cleanedWa,
      whatsapp_orders_number: cleanedWa,
      virtual_host_video_url: profile.virtual_host_video_url || profile.virtualHostVideoUrl || '/mazi_video.mp4',
      pos_terminal_config: profile.posTerminalConfig,
      payment_gateway: profile.paymentGateway,
      tiktok_live_socket: profile.tiktokLiveSocket,
      pos_bridge: profile.posBridge,
      maintenance_modules: profile.maintenance_modules || profile.maintenanceModules || (this.cachedProfile?.maintenance_modules ?? DEFAULT_COMPANY_PROFILE.maintenance_modules),
      profile_data: {
        ...profile,
        virtual_host_video_url: profile.virtual_host_video_url || profile.virtualHostVideoUrl || '/mazi_video.mp4',
        virtualHostVideoUrl: profile.virtual_host_video_url || profile.virtualHostVideoUrl || '/mazi_video.mp4',
        company_display_name: companyDisplayName,
        trn_number: trnNum,
        address_line_1: addr1,
        address_line_2: addr2,
        city,
        country,
        corporate_phone: corpPhone,
        corporate_email: corpEmail,
        social_links: socialLinks,
        whatsapp_orders_number: cleanedWa,
        whatsappOrderNumber: cleanedWa,
        maintenance_modules: profile.maintenance_modules || profile.maintenanceModules || (this.cachedProfile?.maintenance_modules ?? DEFAULT_COMPANY_PROFILE.maintenance_modules),
        cogsAccountCode: profile.cogsAccountCode || profile.cogs_account_code || DEFAULT_COMPANY_PROFILE.cogsAccountCode,
        finishedGoodsAccountCode: profile.finishedGoodsAccountCode || profile.finished_goods_account_code || DEFAULT_COMPANY_PROFILE.finishedGoodsAccountCode,
        posRevenueAccountCode: profile.posRevenueAccountCode || profile.pos_revenue_account_code || DEFAULT_COMPANY_PROFILE.posRevenueAccountCode,
        walkInCustomerAccountCode: profile.walkInCustomerAccountCode || profile.walk_in_customer_account_code || DEFAULT_COMPANY_PROFILE.walkInCustomerAccountCode,
        vatOutputAccountCode: profile.vatOutputAccountCode || profile.vat_output_account_code || DEFAULT_COMPANY_PROFILE.vatOutputAccountCode,
        cashAccountCode: profile.cashAccountCode || profile.cash_account_code || DEFAULT_COMPANY_PROFILE.cashAccountCode,
        bankAccountCode: profile.bankAccountCode || profile.bank_account_code || DEFAULT_COMPANY_PROFILE.bankAccountCode
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

    this.clearCache();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vintage_cached_company_profile', JSON.stringify({
          ...DEFAULT_COMPANY_PROFILE,
          ...profile,
          bankAccounts: profile.bankAccounts || DEFAULT_BANK_ACCOUNTS,
          posTerminalConfig: profile.posTerminalConfig || DEFAULT_POS_TERMINAL_CONFIG
        }));
      } catch {}
    }
    return this.getCompanyProfile(true);
  }

  public static async setModuleMaintenance(moduleKey: string, isMaintenance: boolean): Promise<CompanyProfile> {
    const current = await this.getCompanyProfile();
    const updatedModules = {
      ...(current.maintenance_modules || current.maintenanceModules || DEFAULT_COMPANY_PROFILE.maintenance_modules),
      [moduleKey]: isMaintenance
    };
    const updated = await this.updateCompanyProfile({
      ...current,
      maintenance_modules: updatedModules,
      maintenanceModules: updatedModules
    });

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('vintage_maintenance_sync');
        bc.postMessage({ maintenance_modules: updatedModules });
        bc.close();
      }
    } catch {}

    return updated;
  }

  public static subscribeToMaintenanceChanges(callback: (modules: Record<string, boolean>) => void): () => void {
    const channel = supabase
      .channel('company_profile_maintenance_' + Math.random().toString(36).substring(2, 9))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_profile' },
        (payload: any) => {
          CompanyProfileService.clearCache();
          const newModules = payload.new?.maintenance_modules || payload.new?.maintenanceModules;
          if (newModules && typeof newModules === 'object') {
            callback(newModules);
          } else {
            CompanyProfileService.getCompanyProfile(true).then(p => {
              if (p.maintenance_modules) callback(p.maintenance_modules);
            });
          }
        }
      )
      .subscribe();

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('vintage_maintenance_sync');
        bc.onmessage = (event) => {
          if (event.data?.maintenance_modules) {
            CompanyProfileService.clearCache();
            callback(event.data.maintenance_modules);
          }
        };
      }
    } catch {}

    return () => {
      try { supabase.removeChannel(channel); } catch {}
      if (bc) try { bc.close(); } catch {}
    };
  }
}

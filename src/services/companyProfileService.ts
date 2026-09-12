import { supabase } from '../supabaseClient.ts';
import { CompanyProfile } from '../modules/setup/setup.types.ts';

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
  bankQrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBES%20GENERAL%20TRADING%26bank%3DEMIRATES%20NBD',
  bankIban: 'AE24 0331 2345 6789 0123 456',
  bankName: 'Emirates NBD',
  bankAccountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  enableCod: true,
  enableBankTransfer: true,
  enableCardPay: true,
  enableAppleGooglePay: true,
  freeShippingThresholdAed: 350,
  standardShippingFeeAed: 25,
  whatsappOrderNumber: '+971554186086',
  whatsapp_orders_number: '+971554186086',
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
      maintenance_modules: data.maintenance_modules || data.maintenanceModules || DEFAULT_COMPANY_PROFILE.maintenance_modules,
      maintenanceModules: data.maintenance_modules || data.maintenanceModules || DEFAULT_COMPANY_PROFILE.maintenance_modules,
      ...(data.profile_data || {})
    };

        this.cachedProfile = prof;
        this.lastFetched = Date.now();
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
      pos_terminal_config: profile.posTerminalConfig,
      payment_gateway: profile.paymentGateway,
      tiktok_live_socket: profile.tiktokLiveSocket,
      pos_bridge: profile.posBridge,
      maintenance_modules: profile.maintenance_modules || profile.maintenanceModules || (this.cachedProfile?.maintenance_modules ?? DEFAULT_COMPANY_PROFILE.maintenance_modules),
      profile_data: {
        ...profile,
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
        maintenance_modules: profile.maintenance_modules || profile.maintenanceModules || (this.cachedProfile?.maintenance_modules ?? DEFAULT_COMPANY_PROFILE.maintenance_modules)
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

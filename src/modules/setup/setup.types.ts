import { CurrencyCode, PackagingUOM, WeightUOM } from '../../types/common.types.ts';
import { POSTerminalConfig } from './hardware.types.ts';

export interface BankAccountConfig {
  id: string;
  bankName: string; // e.g. Emirates NBD, ADCB, Wio Business, Mashreq Bank, Dubai Islamic Bank
  accountTitle: string; // e.g. Vintage Vibes General Trading LLC SPC
  iban: string; // e.g. AE24 0331 2345 6789 0123 456
  accountNumber?: string;
  branchName?: string;
  swiftBic?: string;
  currency: string; // AED, USD, EUR
  qrCodeUrl?: string; // QR code image URL or data
  isPrimary: boolean;
  linkedPosTerminalId?: string; // ID of POS card terminal settled to this bank
  coaAccountCode?: string; // e.g. 1120-00, 1121-00
  coaAccountId?: string; // Linked COA Account ID
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PaymentGatewayConfig {
  provider: 'STRIPE_UAE' | 'NETWORK_INTERNATIONAL' | 'CHECKOUT_COM' | 'TELR' | 'CUSTOM';
  environment: 'SANDBOX' | 'PRODUCTION';
  isEnabled: boolean;
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  merchantAccountId?: string;
  applePayMerchantId?: string;
  applePayDomainVerified?: boolean;
  googlePayMerchantId?: string;
  allowApplePay: boolean;
  allowGooglePay: boolean;
  allowCreditDebitCards: boolean;
  currency: 'AED' | 'USD';
  settlementCoaAccountId?: string;
  gatewayFeePercent?: number;
}

export interface TikTokLiveSocketConfig {
  enabled: boolean;
  tiktokUsername: string;
  autoReconnect: boolean;
  connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'LIVE' | 'OFFLINE' | 'ERROR';
  lastConnectedAt?: string;
  errorMessage?: string;
  claimKeywords: string[];
  autoLockPieces: boolean;
  defaultLockDurationSeconds: number;
}

export interface PhysicalPOSTerminalBridgeConfig {
  enabled: boolean;
  terminalBrand: 'SUNMI' | 'PAX_A920' | 'INGENICO' | 'VERIFONE' | 'GENERIC_PED';
  terminalIp: string;
  terminalPort: number;
  terminalId: string;
  protocol: 'HTTP_JSON' | 'TCP_SOCKET' | 'WEBSOCKET';
  allowApplePayNfc: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'PAIRING';
}

export interface CompanyProfile {
  companyName: string;
  company_display_name?: string;
  companyDisplayName?: string;
  addressLine1: string;
  address_line_1?: string;
  addressLine2: string;
  address_line_2?: string;
  city?: string;
  country?: string;
  trnTaxNo: string;
  trn_number?: string;
  trnNumber?: string;
  defaultCurrency: CurrencyCode;
  logoUrl: string;
  phone: string;
  corporate_phone?: string;
  corporatePhone?: string;
  email: string;
  corporate_email?: string;
  corporateEmail?: string;
  social_links?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
  vatRatePercent: number; // e.g. 5.0% UAE VAT
  globalStockAlertThreshold?: number; // Minimum defined quantity threshold for bale stock warnings
  bankQrCodeUrl?: string; // Base64 or URL for Bank QR code / wallet scan
  bankIban?: string; // e.g. AE240331234567890123456
  bankName?: string; // e.g. Emirates NBD / ADCB
  bankAccountTitle?: string; // Beneficiary name e.g. Vintage Vibes LLC SPC
  bankAccountNumber?: string;
  bankAccounts?: BankAccountConfig[]; // List of configured bank accounts (auto-synced to COA)
  enableCod?: boolean; // Cash on delivery
  enableBankTransfer?: boolean;
  enableCardPay?: boolean;
  enableAppleGooglePay?: boolean; // 1-Touch Apple Pay & Google Pay (Biometric / Scan-to-Pay QR)
  freeShippingThresholdAed?: number; // Free shipping threshold in AED (e.g. 350)
  standardShippingFeeAed?: number; // Standard courier fee in AED (e.g. 25)
  whatsappOrderNumber?: string; // Direct WhatsApp order confirmation number
  whatsapp_orders_number?: string; // Database binding for WhatsApp orders number
  whatsappOrdersNumber?: string;
  virtualHostVideoUrl?: string; // Virtual host video URL / path for collection drops (e.g. /mazi_video.mp4)
  virtual_host_video_url?: string;
  posTerminalConfig?: POSTerminalConfig; // Physical Smart POS Card Machine link configuration
  paymentGateway?: PaymentGatewayConfig;
  tiktokLiveSocket?: TikTokLiveSocketConfig;
  posBridge?: PhysicalPOSTerminalBridgeConfig;
  maintenance_modules?: Record<string, boolean>;
  maintenanceModules?: Record<string, boolean>;
  financialLockDate?: string; // e.g. "2026-08-31" - Locked financial transactions up to this date
  isFinancialLocked?: boolean;
  pixelTracking?: PixelTrackingConfig;
  metaPixelId?: string;
  tiktokPixelId?: string;
  // Sales & Dynamic COA Routing Configuration
  cogsAccountCode?: string; // e.g. '5100-02' (COGS Finished Goods)
  cogs_account_code?: string;
  finishedGoodsAccountCode?: string; // e.g. '1160-01' (Finished Goods Asset)
  finished_goods_account_code?: string;
  posRevenueAccountCode?: string; // e.g. '4110-01' (POS Counter Retail Sales)
  pos_revenue_account_code?: string;
  walkInCustomerAccountCode?: string; // e.g. '1130-05' (Walk In Customer Control Khata)
  walk_in_customer_account_code?: string;
  vatOutputAccountCode?: string; // e.g. '2140-01' (VAT Output 5%)
  vat_output_account_code?: string;
  cashAccountCode?: string; // e.g. '1110-01' (Cash in Hand Counter)
  cash_account_code?: string;
  bankAccountCode?: string; // e.g. '1120-01' (Bank / Card Clearing)
  bank_account_code?: string;
}

export interface PixelTrackingConfig {
  metaPixelId?: string;
  tiktokPixelId?: string;
  enableMetaPixel?: boolean;
  enableTiktokPixel?: boolean;
  testEventCode?: string;
}

export type MaintenanceModuleKey =
  | 'hr_payroll'
  | 'purchases'
  | 'sales'
  | 'sorting'
  | 'vouchers'
  | 'inventory';

export interface CurrencyItem {
  id: string;
  code: CurrencyCode;
  name: string;
  symbol: string;
  exchangeRate: number; // relative to base (AED = 1.0)
  isBase: boolean;
}

export interface ItemMaster {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  targetUom: WeightUOM;
  weightKg?: number;
  uom?: string;
  coaAccountId?: string;
  minStockThreshold?: number;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
  isActive: boolean;
}

export interface LabelGrade {
  id: string;
  code: string;
  name: string;
  description?: string;
  qualityTier?: 'CREAM' | 'GRADE_A' | 'NON_BRAND' | 'GRADE_B' | 'REWORK';
  priceMultiplier?: number;
  sortOrder: number;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
  isActive?: boolean;
}

export interface BrandMaster {
  id: string;
  name: string;
  tier: string;
  origin?: string;
  era?: string;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
}

export interface CategoryMaster {
  id: string;
  code: string;
  name: string;
  slug?: string;
  description?: string;
  qualityTier?: 'CREAM' | 'GRADE_A' | 'NON_BRAND' | 'GRADE_B' | 'MIXED';
  defaultTargetUom?: WeightUOM;
  sortOrder?: number;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  created_at?: string;
}

export type TaxonomyLevel = 'DEPARTMENT' | 'CATEGORY' | 'SUBCATEGORY';

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  isActive?: boolean;
  taxonomy_level?: TaxonomyLevel;
  taxonomyLevel?: TaxonomyLevel;
  parent_id?: string | null;
  parentId?: string | null;
  parent_name?: string | null;
  parentName?: string | null;
  department_code?: string | null;
  departmentCode?: string | null;
  level?: number;
  display_order?: number;
  displayOrder?: number;
  created_at?: string;
  createdAt?: string;
}

export interface CollectionMaster {
  id: string;
  name: string;
  code: string;
  season?: string;
  year?: number;
  is_active?: boolean;
  isActive?: boolean;
  display_order?: number;
  displayOrder?: number;
  created_at?: string;
  createdAt?: string;
}

export interface SizeMaster {
  id: string;
  code: string;
  name: string;
  category?: string; // e.g. Tops, Bottoms, Outerwear, Free Size, Universal
  sortOrder?: number;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
  isActive?: boolean;
}

export interface ShopMaster {
  id: string;
  shopNo: string;
  name: string;
  location: string;
  city?: string;
  type?: string;
  manager?: string;
  managerName?: string;
  rackCount?: number;
  status?: 'POSTED' | 'UNPOSTED' | 'DRAFT';
  isActive: boolean;
}

export interface DailySummaryData {
  date: string;
  totalPurchasesAmount: number;
  totalPurchasedWeightKg: number;
  totalPiecesBrokenDown: number;
  totalSalesAmount: number;
  vatCollectedAmount: number;
  openReceivablesTotal: number;
  activeEmployeesWorked: number;
}

export interface LiveStreamMulticastConfig {
  provider: 'RESTREAM' | 'LIVEPUSH' | 'DIRECT_CLOUD_RTMP' | 'CUSTOM';
  enabled: boolean;
  apiKey?: string;
  accountEmail?: string;
  accountPassword?: string;
  masterIngestRtmpUrl: string;
  backupServerUrl?: string;
  masterStreamKey: string;
  autoRelayToTikTok: boolean;
  autoRelayToInstagram: boolean;
  autoRelayToFacebook: boolean;
  autoRelayToYouTube: boolean;
  tikTokStreamKey?: string;
  instagramStreamKey?: string;
  facebookStreamKey?: string;
  youTubeStreamKey?: string;
  status: 'CONNECTED' | 'STANDBY' | 'DISCONNECTED' | 'ERROR';
  lastSyncedAt?: string;
}

export interface LiveBoothStreamConfig {
  boothId: string;
  boothName: string;
  category: string;
  hostName?: string;
  hostHandle?: string;
  provider: 'RESTREAM' | 'LIVEPUSH' | 'DIRECT_CLOUD_RTMP' | 'CUSTOM';
  enabled: boolean;
  apiKey?: string;
  accountEmail?: string;
  accountPassword?: string;
  masterIngestRtmpUrl?: string;
  backupServerUrl?: string;
  masterStreamKey?: string;
  // Per-Booth Distinct Social Media Accounts & Headless Credentials
  socialChannels?: Array<{
    platform: string;
    account_username?: string;
    account_password?: string;
    auth_status?: 'IDLE' | 'AUTHENTICATING' | 'WAITING_OTP' | 'LOGGED_IN' | 'AUTH_FAILED';
    last_login_at?: string | null;
    otp_required?: boolean;
    proxy_url?: string | null;
  }>;
  tiktokAccountHandle?: string;
  tiktokAccountPassword?: string;
  tiktokAuthStatus?: 'IDLE' | 'AUTHENTICATING' | 'WAITING_OTP' | 'LOGGED_IN' | 'AUTH_FAILED';
  tiktokStreamKey?: string;
  tiktokRtmpUrl?: string;
  tiktokSocketConnected?: boolean;
  autoRelayToTikTok: boolean;


  instagramAccountHandle?: string;
  instagramStreamKey?: string;
  instagramRtmpUrl?: string;
  instagramSocketConnected?: boolean;
  autoRelayToInstagram: boolean;

  facebookAccountHandle?: string;
  facebookStreamKey?: string;
  facebookRtmpUrl?: string;
  facebookSocketConnected?: boolean;
  autoRelayToFacebook: boolean;

  youTubeAccountHandle?: string;
  youTubeStreamKey?: string;
  youTubeRtmpUrl?: string;
  youTubeSocketConnected?: boolean;
  autoRelayToYouTube: boolean;

  threadsAccountHandle?: string;
  threadsStreamKey?: string;
  threadsRtmpUrl?: string;
  threadsSocketConnected?: boolean;
  autoRelayToThreads?: boolean;
  activePlatforms?: string[];

  claimKeywords?: string[];
  reservationTimeoutMinutes?: number;
  status: 'CONNECTED' | 'STANDBY' | 'DISCONNECTED' | 'ERROR';
  lastSyncedAt?: string;
}

export type WhatsAppConnectionMode = 'BAILEYS_DIRECT_WEB' | 'META_CLOUD_API' | 'GATEWAY_API';

export interface WhatsAppGatewayConfig {
  connectionMode: WhatsAppConnectionMode;
  // Option 1: Baileys Direct Web Socket
  baileysConfig: {
    enabled: boolean;
    sessionName: string;
    autoReconnect: boolean;
    browserName: string;
    status: 'READY' | 'PAIRING' | 'CONNECTED' | 'DISCONNECTED';
  };
  // Option 2: Meta Cloud API / Third Party Gateway
  metaCloudConfig: {
    enabled: boolean;
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    webhookVerifyToken: string;
    businessNumber: string;
  };
  gatewayConfig: {
    enabled: boolean;
    provider: 'GREEN_API' | 'ULTRAMSG' | 'CUSTOM_HTTP';
    instanceId: string;
    apiToken: string;
    apiUrl: string;
  };
  // Dispatch Throttle & Security
  safeThrottleSeconds: number; // default 4 seconds
  autoEvictSoldPieces: boolean;
  notifyOnClaim: boolean;
  // Persistent WhatsApp Channel Setup
  channelConfig?: {
    channelInviteLink: string;
    channelJid: string; // e.g. 120363xxxxxx@newsletter
    channelTitle?: string;
    verifiedAdmin?: boolean;
    lastTestedAt?: string;
  };
}


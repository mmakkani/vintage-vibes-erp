import { PieceBreakdownItem } from '../purchase/purchase.types.ts';

export type MarketingChannelStatus = 'ACTIVE' | 'CONNECTED' | 'READY' | 'STANDBY' | 'ERROR';

export interface ChannelHealthStatus {
  id: string;
  name: string;
  channelType: 'META_ADS' | 'GOOGLE_MERCHANT' | 'WHATSAPP_API' | 'TIKTOK_LIVE';
  status: MarketingChannelStatus;
  statusLabel: string;
  lastPing: string;
  healthPercent: number;
  syncItemCount: number;
  details: string;
}

export interface MarketingQuickStats {
  activeListedProducts: number;
  liveClaimsToday: number;
  liveClaimsValueAed: number;
  activeMarketingDrops: number;
  totalCatalogsSynced: number;
}

export interface AutoClaimKeywordRule {
  id: string;
  keyword: string; // e.g. 'MINE', 'SOLD', 'CLAIM', 'BIN', 'TAKE'
  action: 'LOCK_AND_DRAFT_INVOICE' | 'AUTO_RESERVE' | 'NOTIFY_HOST';
  enabled: boolean;
  matchType: 'EXACT' | 'STARTS_WITH' | 'CONTAINS';
  lockDurationMinutes: number;
  priority: number;
}

export interface BotResponseTemplate {
  successTemplate: string;
  alreadyClaimedTemplate: string;
  invalidSkuTemplate: string;
  paymentLinkBaseUrl: string;
  sendWhatsAppDm: boolean;
  sendPublicReply: boolean;
}

export interface ChatClaimRecord {
  id: string;
  timestamp: string;
  customerHandle: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'whatsapp';
  rawComment: string;
  matchedKeyword: string;
  sku: string;
  itemName?: string;
  itemImage?: string;
  priceAed: number;
  invoiceNo?: string;
  status: 'PENDING_PAYMENT' | 'LOCK_ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'OUT_OF_STOCK';
  replyDispatched: string;
  checkoutUrl: string;
  lockExpiresAt: number;
  boothId: string;
}

export interface WhatsAppVipDropPayload {
  id: string;
  campaignTitle: string;
  targetGroup: 'VIP_GOLD_BUYERS' | 'STREETWEAR_VIP' | 'LEATHER_ARCHIVE_VIP' | 'ALL_CUSTOMERS';
  recipientCount: number;
  pieceIds: string[];
  pieces?: PieceBreakdownItem[];
  customNote?: string;
  generatedText: string;
  sentAt?: string;
  status: 'DRAFT' | 'SENT' | 'SCHEDULED';
}

export interface SocialCardSettings {
  aspectRatio: '1:1' | '9:16';
  theme: 'vintage-gold' | 'neon-street' | 'minimal-lux' | 'heritage-noir';
  showPriceAed: boolean;
  showPriceUsd: boolean;
  usdExchangeRate: number; // e.g. 0.272
  showAuthenticityBadge: boolean;
  showSizePill: boolean;
  showConditionGrade: boolean;
  showBarcodeTag: boolean;
  customBannerText?: string;
}

export interface LiveStreamSessionStatus {
  isBroadcasting: boolean;
  startedAt: number | null;
  uptimeSeconds: number;
  activeBoothId: string;
  activeBoothName: string;
  activeOnAirPiece?: PieceBreakdownItem | null;
  scannerFeed: {
    scannedAt: string;
    piece: PieceBreakdownItem;
    scannedBy: string;
  }[];
  totalClaimsInSession: number;
  totalRevenueAedInSession: number;
  obsOverlayUrl: string;
}

export interface AdFeedMetrics {
  googleMerchantFeedUrl: string;
  metaCatalogFeedUrl: string;
  totalInStockGarments: number;
  evictedSoldGarmentsCount: number;
  lastRefreshedAt: string;
  autoEvictIntervalSeconds: number;
  googleFeedHealth: 'HEALTHY' | 'SYNCING' | 'ATTENTION';
  metaFeedHealth: 'HEALTHY' | 'SYNCING' | 'ATTENTION';
}

export interface BroadcastQueueItem {
  piece: PieceBreakdownItem;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  sentAt?: string;
  caption: string;
  imageMediaUrl: string;
  error?: string;
}

export interface VoiceNotePreset {
  id: string;
  title: string;
  scriptText: string;
  audioUrl?: string;
  durationSeconds: number;
  speaker: string;
}

export interface AutoBroadcastCampaign {
  id: string;
  title: string;
  targetAudience: string;
  targetChatId: string;
  customerPhones?: string[];
  voiceNoteEnabled: boolean;
  voiceNotePresetId?: string;
  voiceNoteText: string;
  voiceNoteAudioUrl?: string;
  voiceNoteStatus?: 'PENDING' | 'SENT' | 'SKIPPED';
  intervalSeconds: number;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABORTED';
  currentIndex: number;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  startedAt?: string;
  completedAt?: string;
  items: BroadcastQueueItem[];
}

export interface WhatsAppDeviceSession {
  userId: string;
  userName: string;
  phoneNumber?: string;
  isConnected: boolean;
  connectedAt?: string;
  deviceModel?: string;
  batteryLevel?: number;
  qrCodeDataUrl?: string; // Standard Multi-Device cryptographic QR string
  pairingCode?: string; // 8-character pairing code for phone verification (e.g. 7X89-KL22)
  pairingCodeRequestedAt?: string;
  simulatedDevice?: boolean;
  status: 'DISCONNECTED' | 'PAIRING' | 'CONNECTED' | 'ERROR';
  connectionMode?: 'BAILEYS_DIRECT_WEB' | 'META_CLOUD_API' | 'GATEWAY_API';
  pairingStatus?: 'NONE' | 'IDLE' | 'PAIRING' | 'AWAITING_CODE_ENTRY' | 'CONNECTED' | 'EXPIRED';
  lastActive?: string;
}

export interface WhatsAppChannelItem {
  id: string;
  name: string;
  jid: string;
  inviteLink: string;
  subscribers?: number;
  isDefault?: boolean;
  role?: string;
  verifiedAdmin?: boolean;
}

export interface SocialLiveAccountConfig {
  id: 'youtube' | 'instagram' | 'tiktok';
  platformName: string;
  isConnected: boolean;
  serverUrl: string;
  streamKey: string;
  accountHandle: string;
  channelId?: string;
  autoClaimBot: boolean;
  autoInvoiceOnClaim: boolean;
  lastTestedAt?: string;
}

export interface AutoInvoiceRules {
  autoGenerateTaxInvoice: boolean;
  autoPostToLedger: boolean;
  defaultVatPercent: number;
  reservationExpiryMins: number;
  defaultPaymentMethod: 'CARD_POS' | 'BANK_TRANSFER' | 'CASH' | 'DIGITAL_GATEWAY';
  printThermalReceipt: boolean;
}

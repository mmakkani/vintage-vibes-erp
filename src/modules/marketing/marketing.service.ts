import fs from 'fs';
import path from 'path';
import os from 'os';
import { relationalStore } from '../../db/relationalStore.ts';
import { streamController } from '../../server/streamController.ts';
import { eventHub } from '../../server/events.ts';
import { baileysManager } from './baileys.service.ts';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import {
  ChannelHealthStatus,
  MarketingQuickStats,
  AutoClaimKeywordRule,
  BotResponseTemplate,
  ChatClaimRecord,
  WhatsAppVipDropPayload,
  LiveStreamSessionStatus,
  AdFeedMetrics,
  BroadcastQueueItem,
  VoiceNotePreset,
  AutoBroadcastCampaign,
  WhatsAppDeviceSession,
  WhatsAppChannelItem,
  SocialLiveAccountConfig,
  AutoInvoiceRules
} from './marketing.types.ts';
import { WhatsAppGatewayConfig } from '../setup/setup.types.ts';
import { getPgClient } from '../../db/pgPool.ts';

class MarketingService {
  private dataFilePath = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(os.tmpdir(), 'marketing_config.json')
    : path.join(process.cwd(), '.data', 'marketing_config.json');

  // Configuration
  private keywordRules: AutoClaimKeywordRule[] = [
    { id: 'kw-1', keyword: 'MINE', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 1 },
    { id: 'kw-2', keyword: 'CLAIM', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 2 },
    { id: 'kw-3', keyword: 'SOLD', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 3 },
    { id: 'kw-4', keyword: 'BIN', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 4 },
    { id: 'kw-5', keyword: 'TAKE', action: 'LOCK_AND_DRAFT_INVOICE', enabled: true, matchType: 'STARTS_WITH', lockDurationMinutes: 15, priority: 5 }
  ];

  private responseTemplate: BotResponseTemplate = {
    successTemplate: '🔥 CLAIM LOCKED @{customer}! You secured {sku} ({item_name}) for AED {price}. Your VIP lock is held for {expiry_mins} mins. Complete instant checkout: {checkout_link}',
    alreadyClaimedTemplate: '⚠️ Sorry @{customer}, {sku} was already locked by another collector! You have been prioritized on the waitlist.',
    invalidSkuTemplate: '👀 @{customer}, we could not locate that SKU. Please comment with a valid item barcode (e.g., MINE VV-BAL-001-0001).',
    paymentLinkBaseUrl: 'https://vintagevibesgk.com/?checkout=',
    sendWhatsAppDm: true,
    sendPublicReply: true
  };

  private claimLogs: ChatClaimRecord[] = [];
  private vipDrops: WhatsAppVipDropPayload[] = [];
  private featuredDropPieceIds: Set<string> = new Set();

  // Multi-Channel WhatsApp Configuration (Zero hardcoded demo links)
  private whatsappChannels: WhatsAppChannelItem[] = [];

  // Connected Social Live Platforms (YouTube, Instagram, TikTok)
  private socialLiveAccounts: SocialLiveAccountConfig[] = [
    {
      id: 'youtube',
      platformName: 'YouTube Live Stream',
      isConnected: false,
      serverUrl: 'rtmp://a.rtmp.youtube.com/live2',
      streamKey: '',
      accountHandle: '@vintagevibes_official',
      channelId: '',
      autoClaimBot: true,
      autoInvoiceOnClaim: true
    },
    {
      id: 'instagram',
      platformName: 'Instagram Live / Direct',
      isConnected: false,
      serverUrl: 'rtmps://live-upload.instagram.com:443/rtmp/',
      streamKey: '',
      accountHandle: '@vintagevibes_dubai',
      channelId: '',
      autoClaimBot: true,
      autoInvoiceOnClaim: true
    },
    {
      id: 'tiktok',
      platformName: 'TikTok Live Commerce',
      isConnected: false,
      serverUrl: 'rtmp://live-push.tiktok.com/live/',
      streamKey: '',
      accountHandle: '@vintagevibes_uae',
      channelId: '',
      autoClaimBot: true,
      autoInvoiceOnClaim: true
    }
  ];

  // Automated Tax Invoicing & Claim Hold Configuration
  private autoInvoiceRules: AutoInvoiceRules = {
    autoGenerateTaxInvoice: true,
    autoPostToLedger: true,
    defaultVatPercent: 5,
    reservationExpiryMins: 15,
    defaultPaymentMethod: 'DIGITAL_GATEWAY',
    printThermalReceipt: true
  };

  // Live Stream Session State
  private isLiveBroadcasting = false;
  private liveStartedAt: number | null = null;
  private activeBoothId = 'booth-01';
  private activeOnAirPiece: PieceBreakdownItem | null = null;
  private liveDeskScannerFeed: {
    scannedAt: string;
    piece: PieceBreakdownItem;
    scannedBy: string;
  }[] = [];

  // Automated WhatsApp Photo-by-Photo Broadcaster & Voice Engine State
  private currentBroadcastCampaign: AutoBroadcastCampaign | null = null;
  private broadcastHistory: AutoBroadcastCampaign[] = [];
  private voiceNotePresets: VoiceNotePreset[] = [
    {
      id: 'vn-hype-vault',
      title: '🔥 Dubai VIP Hype Drop Alert (Authentic Audio Note)',
      scriptText: 'Salam VIP family! We just broke the seal on an untouched Grade A container direct from our Dubai Al Quoz facility. Inspect the photo drop rolling into this chat piece-by-piece right now, and reply MINE [SKU] to lock your grail before public TikTok Live!',
      durationSeconds: 14,
      speaker: 'Rashid (Dubai Vault Master)'
    },
    {
      id: 'vn-rare-grails',
      title: '⚡ Rare Grails & Workwear Early Access',
      scriptText: 'Peace collectors! 25 rare 90s Carhartt Detroit jackets, single stitch band tees, and Japanese raw denim dropping photo-by-photo right now. 1-of-1 pieces only. Free express courier across UAE and GCC on all claims!',
      durationSeconds: 16,
      speaker: 'Marcus (Chief Archivist)'
    },
    {
      id: 'vn-winter-maazi',
      title: '🧥 Winter Maazi Heavy Outerwear Special',
      scriptText: 'Attention vintage VIPs! Premium vintage leather flight jackets, wool trench coats, and heavyweight sportswear dropping into the group now. Reply with your SKU to claim instantly before they sell out!',
      durationSeconds: 12,
      speaker: 'Layla (VIP Hostess)'
    }
  ];

  constructor() {
    this.loadFromDisk();
    this.loadFromSql().catch(err => console.warn('[MarketingService SQL load notice]:', err));
    this.initMockHistoryIfNeeded();
    this.initBaileysAutoClaimListener();

    baileysManager.on('connection.open', ({ userId, user }) => {
      const session = this.getWhatsAppSession(userId);
      session.isConnected = true;
      session.pairingStatus = 'CONNECTED';
      session.phoneNumber = user?.id ? `+${user.id.split(':')[0]}` : session.phoneNumber;
      session.connectedAt = new Date().toISOString();
      session.lastActive = 'Active Online (Real Socket Connected)';
      this.userWhatsAppSessions.set(userId, session);
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'ALL',
        entity: 'WHATSAPP_DEVICE',
        action: 'UPDATE',
        documentRef: userId,
        data: { session }
      });
    });

    baileysManager.on('connection.close', ({ userId, isLoggedOut }) => {
      const session = this.getWhatsAppSession(userId);
      if (isLoggedOut) {
        session.isConnected = false;
        session.pairingStatus = 'IDLE';
        session.phoneNumber = undefined;
        session.lastActive = 'Disconnected / Logged Out';
      } else {
        session.lastActive = 'Reconnecting...';
      }
      this.userWhatsAppSessions.set(userId, session);
    });
  }

  private aiReplyCooldowns: Map<string, number> = new Map();
  private pieceColorCache: Map<string, string[]> = new Map();
  private globalAiAutoReplyEnabled: boolean = true;
  private customerChatStates: Map<
    string,
    {
      selectedCategory?: { key: string; label: string };
      selectedDept?: { key: 'MEN' | 'LADIES' | 'CHILDREN'; label: string };
      preferredColor?: string;
      rejectedColors: Set<string>;
      rejectedSkus: Set<string>;
      minBudgetAed?: number;
      maxBudgetAed?: number;
      lastShownItem?: any;
      shownSkus: Set<string>;
      awaitingStep?: 'CATEGORY' | 'DEPARTMENT' | 'BROWSING';
      fastMovingMode?: boolean;
      humanTakeoverUntil?: number;
      aiPausedPermanently?: boolean;
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  > = new Map();

  private getOrCreateChatState(rawJid: string, altPhoneJid?: string) {
    const barePhone = (altPhoneJid || rawJid || '').split('@')[0].replace(/\D/g, '');
    const key = barePhone && barePhone.length >= 7 ? barePhone : (altPhoneJid || rawJid);
    let state = this.customerChatStates.get(key);
    if (!state) {
      state = {
        shownSkus: new Set<string>(),
        rejectedSkus: new Set<string>(),
        rejectedColors: new Set<string>(),
        awaitingStep: 'CATEGORY',
        chatHistory: []
      };
      this.customerChatStates.set(key, state);
    }
    return { key, state };
  }

  private initBaileysAutoClaimListener() {
    const CATEGORY_RULES: Array<{ key: string; label: string; keywords: string[]; autoDept?: { key: 'MEN' | 'LADIES' | 'CHILDREN'; label: string } }> = [
      { key: 'DRESS', label: 'Dresses', keywords: ['dress', 'dresses', 'frock', 'maxi', 'gown', 'abaya', 'kaftan', 'kurti', 'wom-drs'], autoDept: { key: 'LADIES', label: "Ladies'" } },
      { key: 'POLO', label: 'Polo Shirts', keywords: ['polo', 'polos', 'collar t-shirt', 'collar tee', 'golf shirt'] },
      { key: 'TSHIRT', label: 'T-Shirts', keywords: ['t-shirt', 'tshirt', 'tshirts', 't-shirts', 'tee', 'tees', 'raglan', 'crewneck', 'crew neck', 'v-neck', 'men-tee', 'lad-tee'] },
      { key: 'SHIRT', label: 'Shirts', keywords: ['button shirt', 'formal shirt', 'casual shirt', 'flannel', 'oxford', 'blouse', 'men-sht', 'dress shirt'] },
      { key: 'JACKET', label: 'Jackets & Coats', keywords: ['jacket', 'jackets', 'coat', 'blazer', 'windbreaker', 'bomber', 'parka', 'outerwear'] },
      { key: 'HOODIE', label: 'Hoodies & Sweaters', keywords: ['hoodie', 'hoodies', 'sweatshirt', 'sweater', 'jumper', 'cardigan', 'pullover', 'fleece'] },
      { key: 'PANTS', label: 'Jeans & Trousers', keywords: ['jeans', 'pant', 'pants', 'trouser', 'trousers', 'cargo', 'chino', 'chinos', 'denim', 'shorts', 'joggers', 'tracksuit', 'pent'] },
      { key: 'SKIRT', label: 'Skirts', keywords: ['skirt', 'skirts'], autoDept: { key: 'LADIES', label: "Ladies'" } },
      { key: 'SHOES', label: 'Shoes & Sneakers', keywords: ['shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'trainer', 'footwear'] },
      { key: 'BAGS', label: 'Bags & Accessories', keywords: ['bag', 'bags', 'handbag', 'purse', 'backpack', 'tote'] }
    ];

    const COLOR_LIST = [
      'coral', 'peach', 'pink', 'burgundy', 'maroon', 'red',
      'blue', 'navy', 'black', 'white', 'grey', 'gray',
      'green', 'olive', 'yellow', 'brown', 'beige', 'purple', 'orange'
    ];

    // Group related shades so "red" matches burgundy/maroon/red, "pink" matches coral/peach/pink, "blue" matches blue/navy
    const COLOR_SYNONYMS: Record<string, string[]> = {
      red: ['red', 'maroon', 'burgundy'],
      maroon: ['red', 'maroon', 'burgundy'],
      burgundy: ['red', 'maroon', 'burgundy'],
      pink: ['pink', 'coral', 'peach'],
      coral: ['pink', 'coral', 'peach'],
      peach: ['pink', 'coral', 'peach'],
      blue: ['blue', 'navy'],
      navy: ['blue', 'navy'],
      grey: ['grey', 'gray'],
      gray: ['grey', 'gray'],
      green: ['green', 'olive'],
      olive: ['green', 'olive']
    };

    /**
     * Extract ONLY the TRUE primary garment colors (ignoring secondary trim like "with White Piping" or "navy seagull emblem")
     */
    const getPieceColors = (p: any): string[] => {
      const code = String(p?.barcode || '');
      if (code && this.pieceColorCache.has(code)) {
        return this.pieceColorCache.get(code)!;
      }

      const tagsStr = Array.isArray(p?.seoTags)
        ? p.seoTags.join(' ')
        : typeof p?.seoTags === 'string'
        ? p.seoTags
        : '';

      const rawHay = `${p?.brandName || ''} ${p?.ecommerceDescription || ''} ${tagsStr} ${p?.style || ''}`.toLowerCase();

      // Strip secondary contrast/accent/logo phrases so "with White Piping" or "embroidered navy seagull emblem" never pollute primary color!
      const cleanedHay = rawHay
        .replace(/\b(?:with|accented with|features?|featuring|embroidered)\s+(?:the\s+|clean\s+|iconic\s+|embroidered\s+|a\s+|an\s+)*[a-z]+\s+(?:contrast\s+|seagull\s+)*(?:piping|logo|emblem|stitching|trim|buttons?|collar|accents?|lines?)\b/gi, ' ')
        .replace(/\bwhite\s+(?:contrast\s+)?piping\b/gi, ' ')
        .replace(/\bnavy\s+seagull\s+emblem\b/gi, ' ');

      const colors = new Set<string>();
      for (const c of COLOR_LIST) {
        if (new RegExp(`\\b${c}\\b`, 'i').test(cleanedHay)) {
          colors.add(c);
          const syns = COLOR_SYNONYMS[c] || [];
          syns.forEach(s => colors.add(s));
        }
      }

      const arr = Array.from(colors);
      if (code) this.pieceColorCache.set(code, arr);
      return arr;
    };

    /**
     * Human-readable primary color label for a garment
     */
    const getPiecePrimaryColorLabel = (p: any): string => {
      const cols = getPieceColors(p);
      if (cols.includes('burgundy') || cols.includes('maroon')) return 'Burgundy / Maroon Red';
      if (cols.includes('coral') || cols.includes('peach')) return 'Coral / Peach';
      if (cols.includes('blue')) {
        const hay = `${p?.brandName || ''} ${p?.ecommerceDescription || ''}`.toLowerCase();
        if (hay.includes('striped') || hay.includes('stripe')) return 'Light Blue Striped';
        if (hay.includes('heather')) return 'Heather Blue';
        return 'Blue';
      }
      if (cols.length > 0) {
        return cols[0].charAt(0).toUpperCase() + cols[0].slice(1);
      }
      return 'Classic Vintage';
    };

    /**
     * Decode WhatsApp short-forms, abbreviations, and Roman Urdu into clear English hints for the LLM
     */
    const decodeShortFormsAndRomanUrdu = (rawText: string): string => {
      let s = rawText.trim();
      const replacements: Array<[RegExp, string]> = [
        [/\bwht\s+u\s+hv\b|\bwt\s+u\s+hv\b|\bwht\s+you\s+have\b/gi, 'what do you have in stock'],
        [/\bavl\b|\bavail\b/gi, 'available'],
        [/\bblk\b/gi, 'black'],
        [/\bblu\b/gi, 'blue'],
        [/\bgrn\b/gi, 'green'],
        [/\bylw\b/gi, 'yellow'],
        [/\bsz\b/gi, 'size'],
        [/\bmed\b/gi, 'Medium'],
        [/\blrg\b/gi, 'Large'],
        [/\bpp\b|\bhm\b|\bkitne\s+ka\b|\bkitnay\s+ka\b|\bkya\s+rate\b|\brate\s+kya\b/gi, 'what is the price'],
        [/\bpls\b|\bplz\b/gi, 'please'],
        [/\bpics?\b|\btasweer\b|\bphoto\b/gi, 'photo'],
        [/\bdikhao\b|\bdehkao\b|\bdikhayen\b|\bdehkayen\b|\bdekhna\b/gi, 'show me'],
        [/\bdusra\b|\bdusri\b|\bdosra\b|\bdoosra\b|\baur\b/gi, 'another different item'],
        [/\bpasand\s+nahi\b|\bacha\s+nahi\b|\bpurana\b/gi, 'I do not like this one, show me a better item'],
        [/\bkya\s+hai\b|\bkeya\s+hai\b|\bkya\s+cheez\b|\bkeya\s+chese\b/gi, 'what items do you have'],
        [/\blena\s+hai\b|\bkhareedna\b|\bkharidna\b|\bkharedna\b/gi, 'I want to buy']
      ];
      for (const [rgx, rep] of replacements) {
        s = s.replace(rgx, rep);
      }
      // If standalone "wht" or "wht color" (meaning white)
      if (/^\s*wht(?:\s+colou?r)?\s*$/i.test(rawText)) {
        s = 'white color';
      }
      return s;
    };

    /**
     * Detect if the user explicitly requested a color in their message
     */
    const detectExplicitColorInMessage = (textLower: string): { requestedColor?: string; rejectedColor?: string } => {
      const normalized = decodeShortFormsAndRomanUrdu(textLower).toLowerCase();
      for (const col of COLOR_LIST) {
        const noColRgx = new RegExp(`\\b(?:no|not|nahi|nai|without|except)\\s+${col}\\b|\\b${col}\\s+(?:nahi|nai|no)\\b`, 'i');
        const colRgx = new RegExp(`\\b${col}\\b`, 'i');
        if (noColRgx.test(normalized)) {
          return { rejectedColor: col };
        }
        if (colRgx.test(normalized)) {
          return { requestedColor: col };
        }
      }
      return {};
    };

    const classifyPieceCategory = (p: any): { key: string; label: string } => {
      const hay = `${p.barcode || ''} ${p.brandName || ''} ${p.itemName || ''} ${p.category || ''} ${p.ecommerceDescription || ''}`.toLowerCase();
      if (hay.includes('polo')) return { key: 'POLO', label: 'Polo Shirt' };
      for (const rule of CATEGORY_RULES) {
        if (rule.keywords.some(kw => hay.includes(kw))) {
          return { key: rule.key, label: rule.label };
        }
      }
      if (hay.includes('shirt')) return { key: 'SHIRT', label: 'Shirt' };
      return { key: 'OTHER', label: p.category || p.itemName || 'Vintage Garment' };
    };

    const classifyPieceDepartment = (p: any): { key: 'MEN' | 'LADIES' | 'CHILDREN'; label: string } => {
      const hay = `${p.barcode || ''} ${p.brandName || ''} ${p.itemName || ''} ${p.parentCategoryName || ''} ${p.category || ''}`.toLowerCase();
      if (/\b(kid|kids|child|children|baby|toddler|junior|youth|boy|girl)\b/i.test(hay) || hay.includes('kid-')) {
        return { key: 'CHILDREN', label: "Children's" };
      }
      if (/\b(ladies|lady|women|womens|woman|female|dress|frock|skirt|blouse|abaya|gown|kaftan)\b/i.test(hay) || hay.includes('lad-') || hay.includes('wom-')) {
        return { key: 'LADIES', label: "Ladies'" };
      }
      return { key: 'MEN', label: "Men's" };
    };

    const sanitizeTone = (text: string): string => {
      return text
        .replace(/\b(darling|sweetheart|honey|my love|dearest|ecstatic|overjoyed|divine|breathtaking|treasure)\b[,!]?\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    // ==================== LISTEN FOR MANUAL OWNER MESSAGES FROM PHONE (HUMAN TAKEOVER) ====================
    baileysManager.on('owner_manual_message', ({ remoteJid, phoneJid, text }: any) => {
      try {
        const { key, state } = this.getOrCreateChatState(remoteJid, phoneJid);
        const cmd = String(text || '').trim().toLowerCase();

        // Owner commands to turn AI ON or OFF globally or for this chat
        if (/^(?:#ai|\/ai|ai\s+on|bot\s+on|start\s+ai)$/i.test(cmd)) {
          state.humanTakeoverUntil = 0;
          state.aiPausedPermanently = false;
          this.globalAiAutoReplyEnabled = true;
          console.log(`[Baileys Human Takeover] Owner resumed AI Auto-Reply for chat ${key}`);
          return;
        }
        if (/^(?:#stop|\/stop|ai\s+off|bot\s+off|stop\s+ai)$/i.test(cmd)) {
          state.aiPausedPermanently = true;
          state.humanTakeoverUntil = Date.now() + 24 * 60 * 60 * 1000;
          console.log(`[Baileys Human Takeover] Owner paused AI Auto-Reply permanently for chat ${key}`);
          return;
        }
        if (/^(?:ai\s+off\s+all|bot\s+off\s+all)$/i.test(cmd)) {
          this.globalAiAutoReplyEnabled = false;
          console.log(`[Baileys Human Takeover] Owner paused AI Auto-Reply GLOBALLY for all chats`);
          return;
        }
        if (/^(?:ai\s+on\s+all|bot\s+on\s+all)$/i.test(cmd)) {
          this.globalAiAutoReplyEnabled = true;
          console.log(`[Baileys Human Takeover] Owner resumed AI Auto-Reply GLOBALLY for all chats`);
          return;
        }

        // Owner manually sent a direct message to this person from mobile phone!
        // Pause AI auto-reply in this chat for 30 minutes so the owner can converse directly without AI interrupting in between!
        state.humanTakeoverUntil = Date.now() + 30 * 60 * 1000;
        console.log(`[Baileys Human Takeover] Owner is talking directly with ${key} — AI paused for 30 minutes in this chat.`);
      } catch (err: any) {
        console.warn('[Baileys Human Takeover] Handler notice:', err?.message);
      }
    });

    // ==================== MAIN INCOMING CUSTOMER MESSAGE LISTENER ====================
    baileysManager.on('message', async ({ userId, remoteJid, phoneJid, senderName, text, customerImageBase64 }: any) => {
      try {
        if (!text || typeof text !== 'string') return;
        if (remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter') || remoteJid.includes('@g.us')) {
          return;
        }

        const { key: senderKey, state } = this.getOrCreateChatState(remoteJid, phoneJid);
        const trimmed = text.trim();
        const qLower = trimmed.toLowerCase();

        // Allow explicit command from chat to turn AI on/off
        if (/^(?:#stop|\/stop|ai\s+off|bot\s+off|human|talk\s+to\s+human|operator)$/i.test(qLower)) {
          state.aiPausedPermanently = true;
          state.humanTakeoverUntil = Date.now() + 24 * 60 * 60 * 1000;
          await baileysManager.sendMessage(
            userId,
            remoteJid,
            `👤 *Direct Human Chat Activated:* AI Assistant has been paused for this conversation so you can speak directly. (Send *#ai* anytime to re-enable AI Assistant.)`
          );
          return;
        }
        if (/^(?:#ai|\/ai|ai\s+on|bot\s+on|start\s+ai)$/i.test(qLower)) {
          state.aiPausedPermanently = false;
          state.humanTakeoverUntil = 0;
          this.globalAiAutoReplyEnabled = true;
        }

        // Check if Global AI is disabled or if Owner is currently in a Direct Human conversation with this person
        if (!this.globalAiAutoReplyEnabled || state.aiPausedPermanently || (state.humanTakeoverUntil && Date.now() < state.humanTakeoverUntil)) {
          console.log(`[Baileys AI Concierge] Skipping auto-reply for ${senderKey} (Direct Human Chat active).`);
          return;
        }

        // Prevent rapid loop replies to the same sender within 2 seconds
        const lastReplyAt = this.aiReplyCooldowns.get(senderKey) || 0;
        if (Date.now() - lastReplyAt < 2000) {
          return;
        }
        this.aiReplyCooldowns.set(senderKey, Date.now());

        const recordAndSendImage = async (imgInput: any, captionText: string) => {
          const cleanCaption = sanitizeTone(captionText);
          state.chatHistory.push({ role: 'assistant', content: cleanCaption });
          if (state.chatHistory.length > 16) state.chatHistory.splice(0, state.chatHistory.length - 16);
          try {
            await baileysManager.sendImage(userId, remoteJid, imgInput, cleanCaption);
          } catch (_) {
            if (phoneJid && phoneJid !== remoteJid) {
              await baileysManager.sendImage(userId, phoneJid, imgInput, cleanCaption).catch(async () => {
                await baileysManager.sendMessage(userId, phoneJid, cleanCaption);
              });
            } else {
              await baileysManager.sendMessage(userId, remoteJid, cleanCaption);
            }
          }
        };

        const recordAndSendText = async (msgText: string) => {
          const cleanText = sanitizeTone(msgText);
          state.chatHistory.push({ role: 'assistant', content: cleanText });
          if (state.chatHistory.length > 16) state.chatHistory.splice(0, state.chatHistory.length - 16);
          try {
            await baileysManager.sendMessage(userId, remoteJid, cleanText);
          } catch (_) {
            if (phoneJid && phoneJid !== remoteJid) {
              await baileysManager.sendMessage(userId, phoneJid, cleanText).catch(() => {});
            }
          }
        };

        const expandedMeaning = decodeShortFormsAndRomanUrdu(trimmed);
        state.chatHistory.push({ role: 'user', content: trimmed });
        if (state.chatHistory.length > 16) state.chatHistory.splice(0, state.chatHistory.length - 16);

        // Fetch live in-stock pieces from PostgreSQL (inventory_pieces) + relationalStore
        const dbPieces: any[] = [];
        try {
          const client = await getPgClient();
          if (client) {
            const res = await client.query(`
              SELECT barcode, brand_name AS "brandName", item_name AS "itemName",
                     size_scanned AS "sizeScanned", label_grade AS "labelGrade",
                     COALESCE(retail_price_aed, estimated_price, 120) AS "retailPriceAed",
                     front_image_url AS "frontImageUrl",
                     back_image_url AS "backImageUrl",
                     tag_image_url AS "tagImageUrl",
                     sub_category AS category,
                     sub_category AS "subCategory",
                     parent_category_name AS "parentCategoryName",
                     collection_name AS "collectionName",
                     market_segment AS "marketSegment",
                     style,
                     ecommerce_description AS "ecommerceDescription",
                     seo_tags AS "seoTags",
                     pit_to_pit_inches AS "pitToPitInches",
                     length_inches AS "lengthInches",
                     country_of_origin AS "countryOfOrigin",
                     weight_kg AS "weightKg",
                     shop_location AS "shopLocation"
              FROM public.inventory_pieces
              WHERE COALESCE(is_sold, false) = false
              ORDER BY COALESCE(retail_price_aed, estimated_price, 120) DESC, created_at DESC
              LIMIT 60
            `).catch(() => ({ rows: [] as any[] }));
            await client.end().catch(() => {});
            if (res?.rows?.length) {
              dbPieces.push(...res.rows);
            }
          }
        } catch (_) {}

        const memStock = relationalStore.queryInventoryStock({ status: 'IN_STOCK' }) || [];
        const seenBarcodes = new Set<string>();
        const allStock: any[] = [];
        for (const p of [...dbPieces, ...memStock]) {
          const code = String(p?.barcode || '').trim();
          if (!code || seenBarcodes.has(code)) continue;
          seenBarcodes.add(code);
          allStock.push(p);
        }

        if (allStock.length === 0) {
          await recordAndSendText(`✨ *Welcome to Vintage Vibes Dubai!* Our garment collection is currently being updated. Please check back shortly!`);
          return;
        }

        const baseCheckout = (this.responseTemplate.paymentLinkBaseUrl && !this.responseTemplate.paymentLinkBaseUrl.includes('localhost'))
          ? this.responseTemplate.paymentLinkBaseUrl
          : 'https://vintagevibesgk.com/?checkout=';

        // Enrich allStock with TRUE primary colors & labels
        const pieceColorsMap = new Map<string, string[]>();
        const pieceColorLabelMap = new Map<string, string>();
        const trueAvailableColorSet = new Set<string>();

        for (const p of allStock) {
          const cols = getPieceColors(p);
          const label = getPiecePrimaryColorLabel(p);
          pieceColorsMap.set(p.barcode, cols);
          pieceColorLabelMap.set(p.barcode, label);
          trueAvailableColorSet.add(label);
        }

        const trueColorsSummary = Array.from(trueAvailableColorSet).join(', ') || 'Blue, Burgundy/Maroon, Coral/Peach';

        // Lookup any existing invoices, POS sales, or Live Studio claims for this customer's phone (or mentioned invoice #)
        const cleanSenderPhone = senderKey.replace(/\D/g, '');
        const last7Phone = cleanSenderPhone.slice(-7);
        let customerOrderRecord: {
          invoiceNo: string;
          date: string;
          customerName: string;
          customerPhone: string;
          channel: string;
          paymentMethod: string;
          city?: string;
          deliveryAddress?: string;
          awbNo?: string;
          courierPartner?: string;
          subTotal?: number;
          vatAmount?: number;
          shippingAmount?: number;
          totalAmount: number;
          items: Array<{ barcode: string; description: string; size?: string; quantity: number; price: number; imageUrl?: string }>;
        } | null = null;

        try {
          const mentionedInvMatch = trimmed.match(/\b((?:INV|POS|LIVE|VV-INV|SINV)[-_A-Za-z0-9]+)\b/i);
          const mentionedInv = mentionedInvMatch?.[1]?.trim();
          const client = await getPgClient();
          if (client) {
            try {
              const sRes = await client.query(
                `SELECT * FROM public.sales_invoices
                 WHERE ($1 <> '' AND (invoice_no ILIKE $1 OR id::text = $1))
                    OR ($2 <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '\\D', '', 'g'), 7) = $2)
                 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
                [mentionedInv || '', last7Phone || '9999999']
              ).catch(() => ({ rows: [] as any[] }));

              if (sRes.rows[0]) {
                const r = sRes.rows[0];
                const rawItems = Array.isArray(r.items) ? r.items : [];
                customerOrderRecord = {
                  invoiceNo: r.invoice_no || `INV-${String(r.id).slice(0, 6)}`,
                  date: r.date || new Date().toLocaleDateString('en-GB'),
                  customerName: r.customer_name || r.client_name || senderName || 'Valued Collector',
                  customerPhone: r.customer_phone || `+${cleanSenderPhone}`,
                  channel: r.channel || 'LIVE STUDIO & WHATSAPP CONCIERGE',
                  paymentMethod: r.payment_method || 'ONLINE / COD',
                  city: r.city || 'DUBAI, UAE',
                  deliveryAddress: r.delivery_address || r.shipping_address || 'UAE Doorstep Express Delivery',
                  awbNo: r.tracking_number || r.awb_no,
                  courierPartner: r.courier_partner || 'UAE EXPRESS COURIER',
                  subTotal: Number(r.sub_total || 0) || undefined,
                  vatAmount: Number(r.vat_amount || 0) || undefined,
                  shippingAmount: Number(r.shipping_fee || 0) || undefined,
                  totalAmount: Number(r.total_amount || r.grand_total_aed || 150),
                  items: rawItems.map((it: any) => ({
                    barcode: it.barcode || it.sku || 'VV-ITEM',
                    description: it.description || it.itemName || it.name || 'Curated Vintage Garment',
                    size: it.size || it.sizeScanned,
                    quantity: Number(it.quantity || it.qty || 1),
                    price: Number(it.finalAmount || it.unitPrice || it.price || 150),
                    imageUrl: it.imageUrl || it.frontImageUrl
                  }))
                };
              } else {
                const pRes = await client.query(
                  `SELECT * FROM public.pos_sales
                   WHERE ($1 <> '' AND invoice_number ILIKE $1)
                      OR ($2 <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '\\D', '', 'g'), 7) = $2)
                   ORDER BY created_at DESC NULLS LAST LIMIT 1`,
                  [mentionedInv || '', last7Phone || '9999999']
                ).catch(() => ({ rows: [] as any[] }));

                if (pRes.rows[0]) {
                  const r = pRes.rows[0];
                  const rawItems = Array.isArray(r.items) ? r.items : [];
                  customerOrderRecord = {
                    invoiceNo: r.invoice_number || `POS-${String(r.id).slice(0, 6)}`,
                    date: new Date(r.created_at || Date.now()).toLocaleDateString('en-GB'),
                    customerName: r.customer_name || senderName || 'Valued Collector',
                    customerPhone: r.customer_phone || `+${cleanSenderPhone}`,
                    channel: 'RETAIL POS COUNTER',
                    paymentMethod: r.payment_method || 'CASH / CARD',
                    city: 'AL AIN / DUBAI, UAE',
                    deliveryAddress: 'Showroom Counter / Express Delivery',
                    subTotal: Number(r.subtotal || 0) || undefined,
                    vatAmount: Number(r.vat_amount || 0) || undefined,
                    totalAmount: Number(r.total_amount || 150),
                    items: rawItems.map((it: any) => ({
                      barcode: it.barcode || it.sku || 'VV-POS',
                      description: it.description || it.itemName || it.name || 'Curated Vintage Garment',
                      size: it.size || it.sizeScanned,
                      quantity: Number(it.quantity || it.qty || 1),
                      price: Number(it.finalAmount || it.unitPrice || it.price || 150),
                      imageUrl: it.imageUrl || it.frontImageUrl
                    }))
                  };
                }
              }
            } finally {
              await client.end().catch(() => {});
            }
          }
        } catch (_) {}

        // Also check in-memory Live Studio claim logs if no DB invoice found yet
        if (!customerOrderRecord && last7Phone) {
          const matchingClaim = this.claimLogs.find(
            c =>
              (c.rawComment && c.rawComment.replace(/\D/g, '').endsWith(last7Phone)) ||
              (c.customerHandle && senderName && c.customerHandle.toLowerCase().includes(senderName.toLowerCase()))
          );
          if (matchingClaim) {
            const sub = Number(matchingClaim.priceAed || 150);
            const vat = Number((sub * 0.05).toFixed(2));
            customerOrderRecord = {
              invoiceNo: matchingClaim.invoiceNo || `LIVE-${matchingClaim.id.slice(-5).toUpperCase()}`,
              date: new Date().toLocaleDateString('en-GB'),
              customerName: senderName || matchingClaim.customerHandle || 'Live Studio Buyer',
              customerPhone: `+${cleanSenderPhone}`,
              channel: 'LIVE STUDIO AUCTION BROADCAST',
              paymentMethod: 'INSTANT CHECKOUT / COD',
              city: 'DUBAI / UAE',
              deliveryAddress: 'UAE Doorstep Express Courier',
              subTotal: sub,
              vatAmount: vat,
              shippingAmount: 0,
              totalAmount: Number((sub + vat).toFixed(2)),
              items: [
                {
                  barcode: matchingClaim.sku,
                  description: matchingClaim.itemName || 'Live Studio Claimed Garment',
                  quantity: 1,
                  price: sub,
                  imageUrl: matchingClaim.itemImage
                }
              ]
            };
          }
        }

        // Helper to build a fallback order record from state.lastShownItem or top stock item when user asks for a Sale Slip / Live Studio Slip / Courier Slip
        const getEffectiveOrderSlipData = (isLiveStudioSlip = false) => {
          if (customerOrderRecord) {
            return isLiveStudioSlip ? { ...customerOrderRecord, channel: 'LIVE STUDIO AUCTION BROADCAST' } : customerOrderRecord;
          }
          const refPiece = state.lastShownItem || allStock[0];
          const price = Number(refPiece?.retailPriceAed || refPiece?.estimatedPrice || 150);
          const vat = Number((price * 0.05).toFixed(2));
          return {
            invoiceNo: isLiveStudioSlip ? `LIVE-${Date.now().toString().slice(-5)}` : `VV-INV-${Date.now().toString().slice(-5)}`,
            date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            customerName: senderName || 'Valued Collector',
            customerPhone: `+${cleanSenderPhone}`,
            channel: isLiveStudioSlip ? 'LIVE STUDIO AUCTION BROADCAST' : 'WHATSAPP VIP CONCIERGE',
            paymentMethod: 'ONLINE CHECKOUT / COD',
            city: 'DUBAI / UAE',
            deliveryAddress: 'Express UAE Doorstep Delivery (Confirmed via WhatsApp)',
            courierPartner: 'UAE EXPRESS COURIER',
            subTotal: price,
            vatAmount: vat,
            shippingAmount: 0,
            totalAmount: Number((price + vat).toFixed(2)),
            garmentImageUrl: refPiece?.frontImageUrl,
            items: [
              {
                barcode: refPiece?.barcode || 'VV-ARCHIVE',
                description: `${refPiece?.brandName || 'Vintage'} ${refPiece?.itemName || 'Garment'}`,
                size: refPiece?.sizeScanned || 'M',
                quantity: 1,
                price,
                imageUrl: refPiece?.frontImageUrl
              }
            ]
          };
        };

        // ==================== 1. DETECT COLOR & CATEGORY AVAILABILITY FACTS ====================
        const { requestedColor, rejectedColor } = detectExplicitColorInMessage(qLower);
        if (rejectedColor) {
          const syns = COLOR_SYNONYMS[rejectedColor] || [rejectedColor];
          syns.forEach(s => state.rejectedColors.add(s));
          if (state.preferredColor && syns.includes(state.preferredColor)) {
            state.preferredColor = undefined;
          }
          if (state.lastShownItem?.barcode) {
            state.rejectedSkus.add(state.lastShownItem.barcode);
          }
        }

        let requestedColorInStock = true;
        if (requestedColor) {
          const matchingColorItems = allStock.filter(p => (pieceColorsMap.get(p.barcode) || []).includes(requestedColor));
          if (matchingColorItems.length > 0) {
            state.preferredColor = requestedColor;
            const syns = COLOR_SYNONYMS[requestedColor] || [requestedColor];
            syns.forEach(s => state.rejectedColors.delete(s));
          } else {
            requestedColorInStock = false;
            state.preferredColor = undefined;
          }
        }

        // Check if customer explicitly asked for an unavailable garment category (e.g. Dress, Jeans, Jacket, Shoes, Bag)
        let requestedUnavailableCategory: string | null = null;
        for (const rule of CATEGORY_RULES) {
          if (rule.keywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(expandedMeaning))) {
            const hasCatInStock = allStock.some(p => classifyPieceCategory(p).key === rule.key);
            if (!hasCatInStock) {
              requestedUnavailableCategory = rule.label;
              break;
            }
          }
        }

        // ==================== 2. GEMINI-STYLE CONVERSATIONAL AI BRAIN (GEMMA 3 4B ON RTX 3070 TI) ====================
        const catalogLines = allStock
          .map((p, idx) => {
            const colLabel = pieceColorLabelMap.get(p.barcode) || 'Classic';
            const dept = classifyPieceDepartment(p).label;
            const cat = classifyPieceCategory(p).label;
            const statusTag = state.rejectedSkus.has(p.barcode)
              ? '[CUSTOMER PASSED ON THIS]'
              : state.shownSkus.has(p.barcode)
              ? '[ALREADY SHOWN]'
              : '[FRESH IN STOCK]';
            return `${idx + 1}. SKU: "${p.barcode}" | Title: "${p.brandName} — ${p.itemName}" | Dept: ${dept} | Category: ${cat} | TRUE COLOR: ${colLabel} | Tag Size: ${p.sizeScanned || 'M'} | Exact Measurements: Pit-to-Pit Chest ${p.pitToPitInches || 22}" (Doubled ~${Math.round(Number(p.pitToPitInches || 22) * 2)}"), Length ${p.lengthInches || 29}" | Grade: ${p.labelGrade || 'Grade A Verified'} | Origin: ${p.countryOfOrigin || 'Imported'} | Price: ${p.retailPriceAed || 150} AED | Notes: "${(p.ecommerceDescription || '').slice(0, 120)}" | Status: ${statusTag}`;
          })
          .join('\n');

        const recentHistoryText = state.chatHistory
          .slice(-10)
          .map(m => `${m.role === 'user' ? 'CUSTOMER' : 'VINTAGE VIBES AI'}: ${m.content}`)
          .join('\n');

        const lastShownSummary = state.lastShownItem
          ? `Currently discussed / last shown item: SKU="${state.lastShownItem.barcode}", Name="${state.lastShownItem.brandName} (${state.lastShownItem.itemName})", True Color="${pieceColorLabelMap.get(state.lastShownItem.barcode)}", Size="${state.lastShownItem.sizeScanned || 'M'}", Chest=${state.lastShownItem.pitToPitInches || 22}", Length=${state.lastShownItem.lengthInches || 29}", Price=${state.lastShownItem.retailPriceAed || 150} AED.`
          : 'No garment photo has been sent yet in this conversation.';

        const orderSummaryForPrompt = customerOrderRecord
          ? `Customer's Latest Order/Slip on File: Invoice #${customerOrderRecord.invoiceNo} (${customerOrderRecord.channel}), Total: AED ${customerOrderRecord.totalAmount}, Items: ${customerOrderRecord.items.map(i => `${i.description} [${i.barcode}]`).join(', ')}.`
          : 'No prior finalized invoice found under this phone number yet (can generate a live pro-forma Sale Slip or Courier Slip from the current item if requested).';

        const availabilityAlert = !requestedColorInStock && requestedColor
          ? `CRITICAL INVENTORY ALERT: The customer asked for color "${requestedColor.toUpperCase()}", which is NOT in stock! Do NOT set action="SHOW_ITEM_CARD". You MUST set action="SEND_TEXT_ONLY", tell them naturally that we don't have ${requestedColor} right now, and mention the exact colors & pieces we DO have in stock (${trueColorsSummary}).`
          : requestedUnavailableCategory
          ? `CRITICAL INVENTORY ALERT: The customer asked for "${requestedUnavailableCategory}", which is currently NOT in stock! Do NOT set action="SHOW_ITEM_CARD". You MUST set action="SEND_TEXT_ONLY", warmly let them know ${requestedUnavailableCategory} are currently out of stock, and share what we DO have available today.`
          : '';

        const llmPrompt = `You are the official AI Concierge & Senior Fashion Advisor for **Vintage Vibes General Trading L.L.C - S.P.C** (Dubai & Al Ain, UAE) on WhatsApp.
Converse with the intelligence, warmth, and natural flow of Google Gemini — NEVER sound like a rigid template or robotic menu ("Lakeer ka Faqeer").

=== VINTAGE VIBES COMPANY & SERVICE KNOWLEDGE ===
• Brand & Entity: Vintage Vibes General Trading L.L.C - S.P.C (UAE TRN: 100489201948)
• Showroom & Sorting Hub: Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Al Ain / Dubai, UAE
• Website & Online Storefront: https://vintagevibesgk.com
• What We Specialize In:
  1. Curated 1-of-1 Authentic Vintage & Branded Garments (every piece is individually hand-inspected, AI tag-verified, and flat-measured for Pit-to-Pit chest and Collar-to-Hem length).
  2. Live Studio Broadcast Drops: Live streaming auctions on TikTok, Instagram, YouTube & our Storefront where collectors claim pieces live using "MINE [SKU]" and receive instant Live Studio Sale Slips on WhatsApp.
  3. Wholesale & Graded Bales: Bulk graded vintage clothing bales for trade buyers alongside our retail single-piece collection.
• UAE & GCC Courier Delivery:
  - 24 to 48 Hour Express Doorstep Courier across all UAE Emirates (Dubai, Abu Dhabi, Al Ain, Sharjah, Ajman, RAK, Fujairah).
  - Standard UAE delivery is AED 20–25, and FREE on orders above AED 500.
  - Official Express Courier Waybill (AWB Tracking Slip) and UAE Tax Invoice / Sale Slip (5% VAT) are sent as high-res PNG slips directly on WhatsApp.
• Payment Methods:
  - Instant Online Checkout Link (Apple Pay, Google Pay, Visa/Mastercard)
  - Emirates NBD Bank Transfer (VINTAGE VIBES GENERAL TRADING LLC)
  - Cash on Delivery (COD) available across UAE.

=== LIVE IN-STOCK INVENTORY (ONLY THESE ${allStock.length} PIECES ARE IN STOCK RIGHT NOW) ===
${catalogLines}
• True Colors Available in Stock Today: ${trueColorsSummary}
• (We do NOT have Black, White, Brown, Green, Jeans, Dresses, or Jackets in stock right now — never invent fake items!)

=== CURRENT CHAT CONTEXT ===
• Customer Name: ${senderName || 'Valued Guest'} | Phone: +${cleanSenderPhone}
• ${lastShownSummary}
• ${orderSummaryForPrompt}
${availabilityAlert ? `• ${availabilityAlert}\n` : ''}
=== RECENT CONVERSATION HISTORY ===
${recentHistoryText}

=== CUSTOMER'S NEW MESSAGE ===
Raw Message: "${trimmed}"
Decoded Meaning (if short-form / Roman Urdu): "${expandedMeaning}"

=== HOW TO RESPOND LIKE GEMINI (STRICT GUIDELINES) ===
1. STRICT DOMAIN BOUNDARY ("SIRF VINTAGE VIBES KAY HAWALAY SAY"):
   - You ONLY discuss Vintage Vibes, our garments, sizing/measurements, styling advice, prices, Live Studio drops, Sale Slips/Tax Invoices, Courier/Delivery, payment methods, showroom location, or wholesale bales.
   - If the customer asks an off-topic question unrelated to Vintage Vibes or clothing (e.g., politics, coding, math, general trivia, recipes, movies), politely and warmly explain that you are the Vintage Vibes Dubai AI Advisor and only handle conversations regarding Vintage Vibes apparel and services, then steer the chat back to our collection.
2. NATURAL DISCUSSION & LANGUAGE MATCHING ("PROPER BAAT CHEET"):
   - Answer the customer's actual question directly, thoughtfully, and conversationally!
   - If the customer writes in Roman Urdu / Urdu / Hindi (e.g., "kya haal hai", "koi achi t-shirt dikhao", "sale slip bhej do", "ye kis kapray me hai"), reply in natural, warm, fluent Roman Urdu (or natural Roman Urdu/English mix). If they write in English, reply in fluent, natural English.
   - Do NOT repeat robotic lines like "Reply BUY for checkout link or MORE for next item". Speak like a real human advisor!
3. CHOOSING THE RIGHT ACTION:
   - "SEND_TEXT_ONLY": Choose this when the customer is greeting, having a discussion, asking questions (about sizing, fabric, fit comparison, price, what's in stock, how Live Studio works, delivery, location), asking for a color/category that is NOT in stock, or asking off-topic questions.
   - "SHOW_ITEM_CARD": Choose this ONLY when the customer wants to see a garment/photo (or asks to see a specific available item, color, or another option) AND a matching piece exists in the ${allStock.length} items above. Pick the best matching SKU in "selectedSku".
   - "SEND_CHECKOUT_LINK": Choose this when the customer says they want to buy/order/claim an item or asks for the payment/checkout link.
   - "SEND_SALE_SLIP_PNG": Choose this when the customer asks for their Sale Slip, Tax Invoice, Bill, Receipt, or Order Summary on WhatsApp.
   - "SEND_LIVE_STUDIO_SLIP_PNG": Choose this when the customer specifically asks for their Live Studio Sale Slip / Live Auction Slip.
   - "SEND_COURIER_SLIP_PNG": Choose this when the customer asks for their Courier Slip, Waybill, AWB, Tracking Slip, or Delivery Slip.
   - "SEND_BOTH_SLIPS_PNG": Choose this if the customer asks for both their Sale Slip/Invoice AND Courier Slip together.

Return ONLY valid JSON matching this exact structure:
{
  "thought": "Brief analysis of what the customer is asking and how to respond naturally like Gemini",
  "action": "SEND_TEXT_ONLY" | "SHOW_ITEM_CARD" | "SEND_CHECKOUT_LINK" | "SEND_SALE_SLIP_PNG" | "SEND_LIVE_STUDIO_SLIP_PNG" | "SEND_COURIER_SLIP_PNG" | "SEND_BOTH_SLIPS_PNG",
  "selectedSku": "Exact SKU from the inventory list if action is SHOW_ITEM_CARD or SEND_CHECKOUT_LINK, otherwise null",
  "replyText": "Your natural, intelligent, conversational reply (never use robotic footers, and never use overly dramatic words like darling, sweetheart, ecstatic, divine, or treasure)"
}`;

        let llmDecision: {
          thought?: string;
          action?:
            | 'SEND_TEXT_ONLY'
            | 'SHOW_ITEM_CARD'
            | 'SEND_CHECKOUT_LINK'
            | 'SEND_SALE_SLIP_PNG'
            | 'SEND_LIVE_STUDIO_SLIP_PNG'
            | 'SEND_COURIER_SLIP_PNG'
            | 'SEND_BOTH_SLIPS_PNG';
          selectedSku?: string | null;
          replyText?: string;
        } | null = null;

        try {
          const images = customerImageBase64 ? [customerImageBase64] : undefined;
          const resp = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: process.env.OLLAMA_TEXT_MODEL || 'gemma3:4b',
              prompt: llmPrompt,
              ...(images ? { images } : {}),
              format: 'json',
              stream: false,
              options: { temperature: 0.35, num_predict: 380 }
            }),
            signal: AbortSignal.timeout(10000)
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.response) {
              llmDecision = JSON.parse(String(data.response));
              console.log(`[Baileys AI Brain] Thought: "${llmDecision?.thought}" | Action: ${llmDecision?.action} | SKU: ${llmDecision?.selectedSku}`);
            }
          }
        } catch (aiErr: any) {
          console.warn('[Baileys AI Brain] Ollama generate notice:', aiErr?.message);
        }

        // ==================== 3. DETERMINISTIC OVERRIDES FOR SLIPS, CHECKOUT & UNAVAILABLE COLORS ====================
        // Detect if customer explicitly asked for Sale Slip / Live Studio Slip / Courier Slip
        const asksCourierSlip = /\b(courier\s*slip|waybill|awb|tracking\s*slip|dispatch\s*slip|delivery\s*slip|parchi\s*courier)\b/i.test(expandedMeaning);
        const asksLiveSlip = /\b(live\s*studio\s*slip|live\s*sale\s*slip|live\s*slip|auction\s*slip|live\s*bill|live\s*invoice)\b/i.test(expandedMeaning);
        const asksSaleSlip = /\b(sale\s*slip|sales\s*slip|tax\s*invoice|send\s*invoice|mera\s*bill|bill\s*bhej|slip\s*bhej|receipt\s*bhej|send\s*receipt|send\s*slip|send\s*bill|invoice\s*bhej)\b/i.test(expandedMeaning);

        let effectiveAction = llmDecision?.action || 'SEND_TEXT_ONLY';
        if (asksCourierSlip && (asksSaleSlip || asksLiveSlip)) {
          effectiveAction = 'SEND_BOTH_SLIPS_PNG';
        } else if (asksCourierSlip) {
          effectiveAction = 'SEND_COURIER_SLIP_PNG';
        } else if (asksLiveSlip) {
          effectiveAction = 'SEND_LIVE_STUDIO_SLIP_PNG';
        } else if (asksSaleSlip) {
          effectiveAction = 'SEND_SALE_SLIP_PNG';
        }

        // Strict Buy / Checkout Link detection
        const hasNegativeOrBrowseWords = /\b(no|nahi|nai|not|old|purana|purani|dusra|dusri|dosra|doosra|more|aur|dehkao|dikhao|dikhayen|dekhna|show|what|wht|kya|keya|koi|else|other|another|different|change|badal|slip|invoice|courier)\b/i.test(qLower);
        const explicitSkuMatch = trimmed.match(/^(?:mine|claim|bin|take|sold|buy|order|link)\s+([a-zA-Z0-9_-]{4,})/i);
        if (
          effectiveAction === 'SEND_CHECKOUT_LINK' ||
          Boolean(explicitSkuMatch) ||
          (!hasNegativeOrBrowseWords &&
            /\b(buy|khareedna|kharedna|kharidna|send link|payment link|checkout|order karna|lena hai|leni hai|book|confirm order|mine|claim|i want to buy|i'll take it)\b/i.test(expandedMeaning))
        ) {
          effectiveAction = 'SEND_CHECKOUT_LINK';
        }

        // Hard Guardrail: NEVER show an item card if the customer asked for an unavailable color or unavailable category!
        if (effectiveAction === 'SHOW_ITEM_CARD' && (!requestedColorInStock || requestedUnavailableCategory)) {
          effectiveAction = 'SEND_TEXT_ONLY';
        }

        // ==================== 4. EXECUTE ACTION ====================
        // CASE A: SALE SLIP / LIVE STUDIO SLIP / COURIER SLIP PNG DISPATCH
        if (
          effectiveAction === 'SEND_SALE_SLIP_PNG' ||
          effectiveAction === 'SEND_LIVE_STUDIO_SLIP_PNG' ||
          effectiveAction === 'SEND_COURIER_SLIP_PNG' ||
          effectiveAction === 'SEND_BOTH_SLIPS_PNG'
        ) {
          const isLive = effectiveAction === 'SEND_LIVE_STUDIO_SLIP_PNG';
          const slipData = getEffectiveOrderSlipData(isLive);
          const naturalCaption =
            llmDecision?.replyText ||
            (effectiveAction === 'SEND_COURIER_SLIP_PNG'
              ? `🚚 Here is your official *Vintage Vibes Express Courier Waybill (#${slipData.invoiceNo})*. Let me know if you need any updates on your delivery address!`
              : isLive
              ? `🎙️ Here is your official *Vintage Vibes Live Studio Sale Slip (#${slipData.invoiceNo})*. Let me know if you have any questions about your order!`
              : `🧾 Here is your official *Vintage Vibes Sale Slip & Tax Invoice (#${slipData.invoiceNo})*. Feel free to ask if you need anything else!`);

          if (effectiveAction === 'SEND_SALE_SLIP_PNG' || effectiveAction === 'SEND_LIVE_STUDIO_SLIP_PNG' || effectiveAction === 'SEND_BOTH_SLIPS_PNG') {
            const salePng = await baileysManager.renderSaleInvoiceSlipPng(slipData);
            if (salePng) {
              await recordAndSendImage(salePng, naturalCaption);
            } else {
              await recordAndSendText(naturalCaption);
            }
          }

          if (effectiveAction === 'SEND_COURIER_SLIP_PNG' || effectiveAction === 'SEND_BOTH_SLIPS_PNG') {
            const courierPng = await baileysManager.renderCourierDispatchSlipPng(slipData);
            const courierCaption =
              effectiveAction === 'SEND_BOTH_SLIPS_PNG'
                ? `🚚 And here is your *Express UAE Courier Waybill (AWB)* for order *#${slipData.invoiceNo}*.`
                : naturalCaption;
            if (courierPng) {
              await recordAndSendImage(courierPng, courierCaption);
            } else if (effectiveAction === 'SEND_COURIER_SLIP_PNG') {
              await recordAndSendText(courierCaption);
            }
          }
          console.log(`[Baileys AI Concierge] Dispatched ${effectiveAction} (#${slipData.invoiceNo}) to ${remoteJid}`);
          return;
        }

        // CASE B: CHECKOUT LINK DISPATCH
        if (effectiveAction === 'SEND_CHECKOUT_LINK') {
          let targetPiece: any = null;
          if (explicitSkuMatch) {
            const reqSku = explicitSkuMatch[1].toUpperCase();
            targetPiece = allStock.find(p => String(p.barcode || '').toUpperCase() === reqSku);
          }
          if (!targetPiece && llmDecision?.selectedSku) {
            targetPiece = allStock.find(p => p.barcode === llmDecision!.selectedSku);
          }
          if (!targetPiece) {
            targetPiece = allStock.find(p => p.barcode && qLower.includes(String(p.barcode).toLowerCase()));
          }
          if (!targetPiece) {
            targetPiece = state.lastShownItem || allStock[0];
          }

          if (targetPiece) {
            const buyerHandle = senderName ? `@${senderName.replace(/\s+/g, '_').toLowerCase()}` : `@wa_${cleanSenderPhone}`;
            try {
              relationalStore.claimPieceAtomically({
                barcode: targetPiece.barcode,
                buyerHandle,
                buyerPhone: cleanSenderPhone,
                channel: 'WhatsApp Drop',
                boothId: 'whatsapp-bot',
                lockDurationSeconds: 900,
                reservationTimeoutMinutes: 15
              });
            } catch (_) {}

            const checkoutLink = `${baseCheckout}${encodeURIComponent(targetPiece.barcode)}`;
            const priceAed = targetPiece.retailPriceAed || targetPiece.estimatedPrice || 150;
            const displayTitle = `${targetPiece.brandName || ''} ${targetPiece.itemName || 'Vintage Garment'}`.trim();

            const conversationalIntro =
              llmDecision?.replyText && !llmDecision.replyText.includes('http')
                ? `${sanitizeTone(llmDecision.replyText)}\n\n`
                : `Great choice! I've reserved the *${displayTitle}* (Size ${targetPiece.sizeScanned || 'M'} — *${priceAed} AED*) for you.\n\n`;

            const linkReply =
              `${conversationalIntro}` +
              `🛒 *Instant Checkout Link:*\n${checkoutLink}\n\n` +
              `You can complete payment online via Apple Pay / Card, or simply share your UAE delivery address here if you'd like *Cash on Delivery (COD)* or your *Sale Slip*!`;

            await recordAndSendText(linkReply);
            console.log(`[Baileys AI Concierge] Sent Checkout Link for ${targetPiece.barcode} to ${remoteJid}`);
            return;
          }
        }

        // CASE C: PURE CONVERSATIONAL REPLY ("SEND_TEXT_ONLY")
        if (effectiveAction === 'SEND_TEXT_ONLY') {
          if (llmDecision?.replyText) {
            await recordAndSendText(llmDecision.replyText);
            return;
          }
          // Fallback natural response if Ollama was unreachable
          if (!requestedColorInStock && requestedColor) {
            await recordAndSendText(
              `We don't have *${requestedColor}* in stock at the moment. Right now in our curated collection we have *${trueColorsSummary}* across our Men's Polo Shirts, Men's Nike Raglan Tee, and Ladies' Hollister Tee. Would you like me to show you any of those?`
            );
            return;
          }
          await recordAndSendText(
            `Welcome to *Vintage Vibes Dubai*! 👋 I can help you explore our 1-of-1 vintage & branded garments, check exact flat measurements, share our Live Studio drops, or send your Sale Slip and Courier Tracking Slip. What are you looking for today?`
          );
          return;
        }

        // CASE D: SHOW 3-PHOTO GARMENT CARD PNG ("SHOW_ITEM_CARD")
        let targetPiece: any = null;
        if (llmDecision?.selectedSku) {
          targetPiece = allStock.find(p => p.barcode === llmDecision!.selectedSku);
        }

        // Guardrail: If customer requested a specific available color, verify targetPiece actually has that color!
        if (requestedColor && requestedColorInStock && targetPiece) {
          const tCols = pieceColorsMap.get(targetPiece.barcode) || [];
          if (!tCols.includes(requestedColor)) {
            targetPiece =
              allStock.find(p => (pieceColorsMap.get(p.barcode) || []).includes(requestedColor) && !state.shownSkus.has(p.barcode)) ||
              allStock.find(p => (pieceColorsMap.get(p.barcode) || []).includes(requestedColor));
          }
        }

        // If customer asked for another option ("more", "next", "dusra", "aur"), don't repeat the exact same item if another matches
        if (
          targetPiece &&
          state.lastShownItem &&
          targetPiece.barcode === state.lastShownItem.barcode &&
          /\b(more|next|another|other|dusra|dusri|aur|old|nahi|no)\b/i.test(expandedMeaning)
        ) {
          state.rejectedSkus.add(state.lastShownItem.barcode);
          targetPiece = null;
        }

        if (!targetPiece) {
          let candidates = [...allStock];
          if (requestedColor && requestedColorInStock) {
            candidates = candidates.filter(p => (pieceColorsMap.get(p.barcode) || []).includes(requestedColor));
          }
          const unshown = candidates.filter(p => !state.shownSkus.has(p.barcode) && !state.rejectedSkus.has(p.barcode));
          targetPiece = unshown[0] || candidates.find(p => !state.shownSkus.has(p.barcode)) || candidates[0];
        }

        if (!targetPiece) {
          await recordAndSendText(
            llmDecision?.replyText ||
              `We currently have our *Blue Performance Polos*, *Burgundy Nike Raglan Tee*, and *Coral Hollister Tee* in stock. Which one would you like to check out?`
          );
          return;
        }

        state.shownSkus.add(targetPiece.barcode);
        state.lastShownItem = targetPiece;
        state.awaitingStep = 'BROWSING';

        const trueColorLabel = pieceColorLabelMap.get(targetPiece.barcode) || 'Classic';
        const priceAed = targetPiece.retailPriceAed || targetPiece.estimatedPrice || 150;

        // Natural, Gemini-style caption without any repetitive robotic "Reply BUY or MORE" footer!
        const captionText =
          llmDecision?.replyText && (!llmDecision.selectedSku || llmDecision.selectedSku === targetPiece.barcode)
            ? sanitizeTone(llmDecision.replyText)
            : `Here is our *${targetPiece.brandName || targetPiece.itemName}* in *${trueColorLabel}* (Size *${targetPiece.sizeScanned || 'M'}*, Chest ${targetPiece.pitToPitInches || 22}", Length ${targetPiece.lengthInches || 29}" — *${priceAed} AED*). You can see the Front, Back, and Tag views right in the card above — let me know how you like the fit or if you'd like to grab it!`;

        const pngCard = await baileysManager.renderGarmentCardPng(targetPiece, `${trueColorLabel.toUpperCase()} • IN STOCK`);
        if (pngCard) {
          await recordAndSendImage(pngCard, captionText);
        } else if (targetPiece.frontImageUrl) {
          await recordAndSendImage({ url: targetPiece.frontImageUrl }, captionText);
        } else {
          await recordAndSendText(captionText);
        }
        console.log(`[Baileys AI Concierge] Sent 3-Photo Storefront PNG Card ${targetPiece.barcode} (${trueColorLabel}) to ${remoteJid}`);
      } catch (err: any) {
        console.warn('[Baileys AutoClaim/AI] Error dispatching WhatsApp response:', err?.message);
      }
    });
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.keywordRules) this.keywordRules = data.keywordRules;
        if (data.responseTemplate) {
          this.responseTemplate = data.responseTemplate;
          if (!this.responseTemplate.paymentLinkBaseUrl || this.responseTemplate.paymentLinkBaseUrl.includes('localhost')) {
            this.responseTemplate.paymentLinkBaseUrl = 'https://vintagevibesgk.com/?checkout=';
          }
        }
        if (Array.isArray(data.claimLogs)) this.claimLogs = data.claimLogs;
        if (Array.isArray(data.vipDrops)) this.vipDrops = data.vipDrops;
        if (Array.isArray(data.featuredDropPieceIds)) this.featuredDropPieceIds = new Set(data.featuredDropPieceIds);
        if (typeof data.isLiveBroadcasting === 'boolean') this.isLiveBroadcasting = data.isLiveBroadcasting;
        if (data.activeBoothId) this.activeBoothId = data.activeBoothId;
        if (Array.isArray(data.whatsappChannels) && data.whatsappChannels.length > 0) {
          this.whatsappChannels = data.whatsappChannels;
        }
        if (Array.isArray(data.socialLiveAccounts) && data.socialLiveAccounts.length > 0) {
          this.socialLiveAccounts = data.socialLiveAccounts;
        }
        if (data.autoInvoiceRules) {
          this.autoInvoiceRules = { ...this.autoInvoiceRules, ...data.autoInvoiceRules };
        }
        if (data.whatsappGatewayConfig) {
          this.whatsappGatewayConfig = {
            ...this.whatsappGatewayConfig,
            ...data.whatsappGatewayConfig,
            channelConfig: {
              ...this.whatsappGatewayConfig.channelConfig,
              ...(data.whatsappGatewayConfig.channelConfig || {})
            }
          };
        }
      }
    } catch (e) {
      console.warn('Marketing config load notice:', e);
    }
  }

  private saveToDisk() {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        keywordRules: this.keywordRules,
        responseTemplate: this.responseTemplate,
        claimLogs: this.claimLogs.slice(0, 100),
        vipDrops: this.vipDrops.slice(0, 50),
        featuredDropPieceIds: Array.from(this.featuredDropPieceIds),
        isLiveBroadcasting: this.isLiveBroadcasting,
        activeBoothId: this.activeBoothId,
        whatsappGatewayConfig: this.whatsappGatewayConfig,
        whatsappChannels: this.whatsappChannels,
        socialLiveAccounts: this.socialLiveAccounts,
        autoInvoiceRules: this.autoInvoiceRules
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Marketing config save notice:', e);
    }
  }

  public async loadFromSql(): Promise<void> {
    const client = await getPgClient();
    if (!client) return;
    try {
      // 1. Keyword Rules
      const rulesRes = await client.query('SELECT * FROM marketing_claim_rules ORDER BY priority ASC, created_at ASC');
      if (rulesRes.rows && rulesRes.rows.length > 0) {
        this.keywordRules = rulesRes.rows.map(r => ({
          id: r.id,
          keyword: r.keyword,
          action: r.action,
          enabled: Boolean(r.enabled),
          matchType: r.match_type,
          lockDurationMinutes: Number(r.lock_duration_minutes) || 15,
          priority: Number(r.priority) || 1
        }));
      }

      // 2. Response Template
      const templateRes = await client.query("SELECT * FROM marketing_bot_templates WHERE id = 'default' LIMIT 1");
      if (templateRes.rows && templateRes.rows.length > 0) {
        const t = templateRes.rows[0];
        const rawUrl = t.payment_link_base_url || 'https://vintagevibesgk.com/?checkout=';
        this.responseTemplate = {
          successTemplate: t.success_template,
          alreadyClaimedTemplate: t.already_claimed_template,
          invalidSkuTemplate: t.invalid_sku_template,
          paymentLinkBaseUrl: rawUrl.includes('localhost') ? 'https://vintagevibesgk.com/?checkout=' : rawUrl,
          sendWhatsAppDm: Boolean(t.send_whatsapp_dm),
          sendPublicReply: Boolean(t.send_public_reply)
        };
      }

      // 3. Claim Logs
      const logsRes = await client.query('SELECT * FROM marketing_claim_logs ORDER BY created_at DESC LIMIT 100');
      if (logsRes.rows && logsRes.rows.length > 0) {
        this.claimLogs = logsRes.rows.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          customerHandle: l.customer_handle,
          platform: l.platform,
          rawComment: l.raw_comment,
          matchedKeyword: l.matched_keyword,
          sku: l.sku,
          itemName: l.item_name,
          itemImage: l.item_image,
          priceAed: Number(l.price_aed) || 0,
          invoiceNo: l.invoice_no,
          status: l.status,
          replyDispatched: l.reply_dispatched,
          checkoutUrl: l.checkout_url,
          lockExpiresAt: Number(l.lock_expires_at) || 0,
          boothId: l.booth_id
        }));
      }

      // 4. VIP Drops
      const dropsRes = await client.query('SELECT * FROM marketing_vip_drops ORDER BY created_at DESC LIMIT 50');
      if (dropsRes.rows && dropsRes.rows.length > 0) {
        this.vipDrops = dropsRes.rows.map(d => ({
          id: d.id,
          campaignTitle: d.campaign_title,
          targetGroup: d.target_group,
          recipientCount: Number(d.recipient_count) || 0,
          pieceIds: Array.isArray(d.piece_ids) ? d.piece_ids : (typeof d.piece_ids === 'string' ? JSON.parse(d.piece_ids) : []),
          pieces: Array.isArray(d.pieces) ? d.pieces : (typeof d.pieces === 'string' ? JSON.parse(d.pieces) : []),
          customNote: d.custom_note,
          generatedText: d.generated_text,
          status: d.status,
          sentAt: d.sent_at
        }));
      }

      // 5. Live Session
      const liveRes = await client.query("SELECT * FROM marketing_live_sessions WHERE id = 'active_session' LIMIT 1");
      if (liveRes.rows && liveRes.rows.length > 0) {
        const s = liveRes.rows[0];
        this.isLiveBroadcasting = Boolean(s.is_broadcasting);
        this.liveStartedAt = s.started_at ? Number(s.started_at) : null;
        if (s.active_booth_id) this.activeBoothId = s.active_booth_id;
        if (s.active_on_air_piece) {
          this.activeOnAirPiece = typeof s.active_on_air_piece === 'string' ? JSON.parse(s.active_on_air_piece) : s.active_on_air_piece;
        }
        if (s.scanner_feed) {
          this.liveDeskScannerFeed = Array.isArray(s.scanner_feed) ? s.scanner_feed : (typeof s.scanner_feed === 'string' ? JSON.parse(s.scanner_feed) : []);
        }
      }

      // 6. Social Accounts
      const socialRes = await client.query('SELECT * FROM marketing_social_accounts ORDER BY id ASC');
      if (socialRes.rows && socialRes.rows.length > 0) {
        this.socialLiveAccounts = socialRes.rows.map(a => ({
          id: a.id,
          platformName: a.platform_name,
          isConnected: Boolean(a.is_connected),
          serverUrl: a.server_url,
          streamKey: a.stream_key,
          accountHandle: a.account_handle,
          channelId: a.channel_id,
          autoClaimBot: Boolean(a.auto_claim_bot),
          autoInvoiceOnClaim: Boolean(a.auto_invoice_on_claim),
          lastTestedAt: a.last_tested_at
        }));
      }

      // 7. Auto Invoice Rules
      const invRulesRes = await client.query("SELECT * FROM marketing_auto_invoice_rules WHERE id = 'default' LIMIT 1");
      if (invRulesRes.rows && invRulesRes.rows.length > 0) {
        const r = invRulesRes.rows[0];
        this.autoInvoiceRules = {
          autoGenerateTaxInvoice: Boolean(r.auto_generate_tax_invoice),
          autoPostToLedger: Boolean(r.auto_post_to_ledger),
          defaultVatPercent: Number(r.default_vat_percent) || 5,
          reservationExpiryMins: Number(r.reservation_expiry_mins) || 15,
          defaultPaymentMethod: r.default_payment_method || 'DIGITAL_GATEWAY',
          printThermalReceipt: Boolean(r.print_thermal_receipt)
        };
      }

      // 8. Voice Presets
      const presetsRes = await client.query('SELECT * FROM marketing_voice_presets ORDER BY id ASC');
      if (presetsRes.rows && presetsRes.rows.length > 0) {
        this.voiceNotePresets = presetsRes.rows.map(p => ({
          id: p.id,
          title: p.title,
          scriptText: p.script_text,
          durationSeconds: Number(p.duration_seconds) || 15,
          speaker: p.speaker
        }));
      }

      // 9. Broadcast Campaigns
      const campRes = await client.query('SELECT * FROM marketing_broadcast_campaigns ORDER BY started_at DESC LIMIT 20');
      if (campRes.rows && campRes.rows.length > 0) {
        const campaigns: AutoBroadcastCampaign[] = campRes.rows.map(c => ({
          id: c.id,
          title: c.title,
          targetAudience: c.target_audience,
          targetChatId: c.target_chat_id,
          customerPhones: Array.isArray(c.customer_phones) ? c.customer_phones : (typeof c.customer_phones === 'string' ? JSON.parse(c.customer_phones) : undefined),
          voiceNoteEnabled: Boolean(c.voice_note_enabled),
          voiceNotePresetId: c.voice_note_preset_id,
          voiceNoteText: c.voice_note_text,
          voiceNoteStatus: c.voice_note_status,
          intervalSeconds: Number(c.interval_seconds) || 4,
          status: c.status,
          currentIndex: Number(c.current_index) || 0,
          totalCount: Number(c.total_count) || 0,
          sentCount: Number(c.sent_count) || 0,
          failedCount: Number(c.failed_count) || 0,
          items: Array.isArray(c.items) ? c.items : (typeof c.items === 'string' ? JSON.parse(c.items) : []),
          startedAt: c.started_at,
          completedAt: c.completed_at
        }));
        this.broadcastHistory = campaigns.filter(c => c.status !== 'RUNNING');
        const activeRunning = campaigns.find(c => c.status === 'RUNNING' || c.status === 'PAUSED');
        if (activeRunning) {
          this.currentBroadcastCampaign = activeRunning;
        }
      }

      // 10. WhatsApp Channels
      const channelsRes = await client.query('SELECT * FROM whatsapp_channels ORDER BY is_default DESC, created_at ASC');
      if (channelsRes.rows && channelsRes.rows.length > 0) {
        this.whatsappChannels = channelsRes.rows.map(ch => ({
          id: ch.id,
          name: ch.name,
          jid: ch.jid,
          inviteLink: ch.invite_link,
          isDefault: Boolean(ch.is_default),
          role: ch.role || 'ADMIN',
          verifiedAdmin: Boolean(ch.verified_admin),
          lastTestedAt: ch.last_tested_at
        }));
      }

      // 11. WhatsApp Gateway Config
      const gwRes = await client.query("SELECT config FROM whatsapp_gateway_config WHERE id = 'default' LIMIT 1");
      if (gwRes.rows && gwRes.rows.length > 0 && gwRes.rows[0].config) {
        this.whatsappGatewayConfig = {
          ...this.whatsappGatewayConfig,
          ...gwRes.rows[0].config
        };
      }
    } catch (err: any) {
      console.warn('[MarketingService SQL load error]:', err?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistKeywordRulesToSql(rules: AutoClaimKeywordRule[]) {
    const client = await getPgClient();
    if (!client) return;
    try {
      for (const r of rules) {
        await client.query(`
          INSERT INTO marketing_claim_rules (id, keyword, action, enabled, match_type, lock_duration_minutes, priority, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE SET
            keyword = EXCLUDED.keyword,
            action = EXCLUDED.action,
            enabled = EXCLUDED.enabled,
            match_type = EXCLUDED.match_type,
            lock_duration_minutes = EXCLUDED.lock_duration_minutes,
            priority = EXCLUDED.priority,
            updated_at = NOW();
        `, [r.id, r.keyword, r.action, r.enabled, r.matchType, r.lockDurationMinutes, r.priority]);
      }
    } catch (e: any) {
      console.warn('[SQL persistKeywordRules notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistResponseTemplateToSql(template: BotResponseTemplate) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_bot_templates (id, success_template, already_claimed_template, invalid_sku_template, payment_link_base_url, send_whatsapp_dm, send_public_reply, updated_at)
        VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE SET
          success_template = EXCLUDED.success_template,
          already_claimed_template = EXCLUDED.already_claimed_template,
          invalid_sku_template = EXCLUDED.invalid_sku_template,
          payment_link_base_url = EXCLUDED.payment_link_base_url,
          send_whatsapp_dm = EXCLUDED.send_whatsapp_dm,
          send_public_reply = EXCLUDED.send_public_reply,
          updated_at = NOW();
      `, [template.successTemplate, template.alreadyClaimedTemplate, template.invalidSkuTemplate, template.paymentLinkBaseUrl, template.sendWhatsAppDm, template.sendPublicReply]);
    } catch (e: any) {
      console.warn('[SQL persistResponseTemplate notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistClaimLogToSql(claim: ChatClaimRecord) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_claim_logs (
          id, timestamp, customer_handle, platform, raw_comment, matched_keyword,
          sku, item_name, item_image, price_aed, invoice_no, status,
          reply_dispatched, checkout_url, lock_expires_at, booth_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          invoice_no = EXCLUDED.invoice_no,
          reply_dispatched = EXCLUDED.reply_dispatched,
          lock_expires_at = EXCLUDED.lock_expires_at;
      `, [
        claim.id, claim.timestamp, claim.customerHandle, claim.platform, claim.rawComment, claim.matchedKeyword,
        claim.sku, claim.itemName, claim.itemImage, claim.priceAed || 0, claim.invoiceNo, claim.status,
        claim.replyDispatched, claim.checkoutUrl, claim.lockExpiresAt, claim.boothId
      ]);
    } catch (e: any) {
      console.warn('[SQL persistClaimLog notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistVipDropToSql(drop: WhatsAppVipDropPayload) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_vip_drops (
          id, campaign_title, target_group, recipient_count, piece_ids,
          pieces, custom_note, generated_text, status, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status;
      `, [
        drop.id, drop.campaignTitle, drop.targetGroup, drop.recipientCount,
        JSON.stringify(drop.pieceIds || []), JSON.stringify(drop.pieces || []),
        drop.customNote, drop.generatedText, drop.status, drop.sentAt
      ]);
    } catch (e: any) {
      console.warn('[SQL persistVipDrop notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistLiveSessionToSql() {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_live_sessions (
          id, is_broadcasting, started_at, active_booth_id, active_booth_name,
          active_on_air_piece, scanner_feed, updated_at
        ) VALUES ('active_session', $1, $2, $3, 'Booth 01 - Main Stage', $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET
          is_broadcasting = EXCLUDED.is_broadcasting,
          started_at = EXCLUDED.started_at,
          active_booth_id = EXCLUDED.active_booth_id,
          active_on_air_piece = EXCLUDED.active_on_air_piece,
          scanner_feed = EXCLUDED.scanner_feed,
          updated_at = NOW();
      `, [
        this.isLiveBroadcasting,
        this.liveStartedAt,
        this.activeBoothId,
        this.activeOnAirPiece ? JSON.stringify(this.activeOnAirPiece) : null,
        JSON.stringify(this.liveDeskScannerFeed || [])
      ]);
    } catch (e: any) {
      console.warn('[SQL persistLiveSession notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistSocialAccountToSql(account: SocialLiveAccountConfig) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_social_accounts (
          id, platform_name, is_connected, server_url, stream_key,
          account_handle, channel_id, auto_claim_bot, auto_invoice_on_claim,
          last_tested_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          is_connected = EXCLUDED.is_connected,
          server_url = EXCLUDED.server_url,
          stream_key = EXCLUDED.stream_key,
          account_handle = EXCLUDED.account_handle,
          channel_id = EXCLUDED.channel_id,
          auto_claim_bot = EXCLUDED.auto_claim_bot,
          auto_invoice_on_claim = EXCLUDED.auto_invoice_on_claim,
          last_tested_at = EXCLUDED.last_tested_at,
          updated_at = NOW();
      `, [
        account.id, account.platformName, account.isConnected, account.serverUrl, account.streamKey,
        account.accountHandle, account.channelId, account.autoClaimBot, account.autoInvoiceOnClaim,
        account.lastTestedAt || null
      ]);
    } catch (e: any) {
      console.warn('[SQL persistSocialAccount notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistAutoInvoiceRulesToSql(rules: AutoInvoiceRules) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_auto_invoice_rules (
          id, auto_generate_tax_invoice, auto_post_to_ledger, default_vat_percent,
          reservation_expiry_mins, default_payment_method, print_thermal_receipt, updated_at
        ) VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE SET
          auto_generate_tax_invoice = EXCLUDED.auto_generate_tax_invoice,
          auto_post_to_ledger = EXCLUDED.auto_post_to_ledger,
          default_vat_percent = EXCLUDED.default_vat_percent,
          reservation_expiry_mins = EXCLUDED.reservation_expiry_mins,
          default_payment_method = EXCLUDED.default_payment_method,
          print_thermal_receipt = EXCLUDED.print_thermal_receipt,
          updated_at = NOW();
      `, [
        rules.autoGenerateTaxInvoice, rules.autoPostToLedger, rules.defaultVatPercent,
        rules.reservationExpiryMins, rules.defaultPaymentMethod, rules.printThermalReceipt
      ]);
    } catch (e: any) {
      console.warn('[SQL persistAutoInvoiceRules notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  public async persistBroadcastCampaignToSql(campaign: AutoBroadcastCampaign) {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query(`
        INSERT INTO marketing_broadcast_campaigns (
          id, title, target_audience, target_chat_id, customer_phones,
          voice_note_enabled, voice_note_preset_id, voice_note_text, voice_note_status,
          interval_seconds, status, current_index, total_count, sent_count,
          failed_count, items, started_at, completed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          current_index = EXCLUDED.current_index,
          sent_count = EXCLUDED.sent_count,
          failed_count = EXCLUDED.failed_count,
          items = EXCLUDED.items,
          completed_at = EXCLUDED.completed_at;
      `, [
        campaign.id, campaign.title, campaign.targetAudience, campaign.targetChatId,
        JSON.stringify(campaign.customerPhones || []), campaign.voiceNoteEnabled,
        campaign.voiceNotePresetId, campaign.voiceNoteText, campaign.voiceNoteStatus,
        campaign.intervalSeconds, campaign.status, campaign.currentIndex,
        campaign.totalCount, campaign.sentCount, campaign.failedCount,
        JSON.stringify(campaign.items || []), campaign.startedAt, campaign.completedAt || null
      ]);
    } catch (e: any) {
      console.warn('[SQL persistBroadcastCampaign notice]:', e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  private initMockHistoryIfNeeded() {
    // Strictly no mock history - authentic live database events only
    return;
  }

  // ==================== CHANNELS & QUICK STATS ====================
  public getChannelsStatus(): ChannelHealthStatus[] {
    const allPieces = relationalStore.queryInventoryStock({});
    const inStockCount = allPieces.filter(p => !p.isSold && p.status === 'IN_STOCK').length;
    const isLive = this.isLiveBroadcasting;

    return [
      {
        id: 'meta-ads',
        name: 'Meta Ads Commerce Feed',
        channelType: 'META_ADS',
        status: 'ACTIVE',
        statusLabel: 'Catalog Sync Active',
        lastPing: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        healthPercent: 99.8,
        syncItemCount: inStockCount,
        details: 'Automated 60s eviction of sold garments. Facebook & Instagram Dynamic Ads synched.'
      },
      {
        id: 'google-merchant',
        name: 'Google Merchant Center',
        channelType: 'GOOGLE_MERCHANT',
        status: 'ACTIVE',
        statusLabel: 'Feed Live (XML)',
        lastPing: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        healthPercent: 100,
        syncItemCount: inStockCount,
        details: 'Standard RSS 2.0 XML schema with UAE tax, condition=used, and instant inventory refresh.'
      },
      {
        id: 'whatsapp-business',
        name: 'WhatsApp Business Cloud API',
        channelType: 'WHATSAPP_API',
        status: 'CONNECTED',
        statusLabel: 'Webhook Operational',
        lastPing: 'Connected (+971 55 418 6086)',
        healthPercent: 98.5,
        syncItemCount: this.vipDrops.reduce((acc, d) => acc + d.recipientCount, 0),
        details: 'Automated VIP collection drops, instant invoice delivery & customer chat auto-claim.'
      },
      {
        id: 'tiktok-live-engine',
        name: 'TikTok Multistream Ingest',
        channelType: 'TIKTOK_LIVE',
        status: isLive ? 'ACTIVE' : 'READY',
        statusLabel: isLive ? '🔴 Stream Online' : 'Standby / Ready',
        lastPing: isLive ? 'Broadcasting 1080p60' : 'Idle',
        healthPercent: isLive ? 100 : 96.0,
        syncItemCount: this.claimLogs.length,
        details: 'Integrated comment listener, real-time SKU claim locking & OBS Studio browser overlay.'
      }
    ];
  }

  public getQuickStats(): MarketingQuickStats {
    const allPieces = relationalStore.queryInventoryStock({});
    const inStockCount = allPieces.filter(p => !p.isSold && p.status === 'IN_STOCK').length;
    const claimsToday = this.claimLogs.filter(c => {
      const today = new Date().toLocaleDateString();
      return true; // includes recent sessions
    });
    const claimsValue = claimsToday.reduce((sum, c) => sum + (c.priceAed || 0), 0);

    return {
      activeListedProducts: inStockCount,
      liveClaimsToday: claimsToday.length,
      liveClaimsValueAed: claimsValue,
      activeMarketingDrops: this.vipDrops.length,
      totalCatalogsSynced: 4 // Meta, Google, TikTok, WhatsApp
    };
  }

  // ==================== AUTO-CLAIM KEYWORD ENGINE ====================
  public getKeywordRules(): AutoClaimKeywordRule[] {
    return this.keywordRules;
  }

  public saveKeywordRules(rules: AutoClaimKeywordRule[]) {
    this.keywordRules = rules;
    this.saveToDisk();
    this.persistKeywordRulesToSql(rules).catch(() => {});
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'KEYWORD_RULES',
      action: 'UPDATE',
      documentRef: 'rules',
      data: { rules }
    });
    return this.keywordRules;
  }

  public getResponseTemplate(): BotResponseTemplate {
    return this.responseTemplate;
  }

  public saveResponseTemplate(template: Partial<BotResponseTemplate>) {
    this.responseTemplate = { ...this.responseTemplate, ...template };
    this.saveToDisk();
    this.persistResponseTemplateToSql(this.responseTemplate).catch(() => {});
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'RESPONSE_TEMPLATE',
      action: 'UPDATE',
      documentRef: 'template',
      data: { template: this.responseTemplate }
    });
    return this.responseTemplate;
  }

  public getClaimLogs(): ChatClaimRecord[] {
    return this.claimLogs;
  }

  /**
   * Core Incoming Comment Listener & Webhook Processor:
   * When a customer comments "MINE [SKU]", executes:
   * 1. Locks item atomically from other buyers
   * 2. Generates temporary pending sales invoice
   * 3. Auto-dispatches confirmation reply with direct checkout link
   */
  public processIncomingComment(payload: {
    comment: string;
    customerHandle: string;
    platform?: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'whatsapp' | string;
    boothId?: string;
    offeredPrice?: number;
    piece?: any;
  }): {
    isClaim: boolean;
    success: boolean;
    claimRecord?: ChatClaimRecord;
    replyMessage: string;
    error?: string;
  } {
    const rawComment = (payload.comment || '').trim();
    const customer = (payload.customerHandle || '@collector').trim();
    const platform = (payload.platform || 'youtube').toLowerCase() as any;
    const boothId = payload.boothId || this.activeBoothId || 'booth-01';

    if (payload.piece && (payload.piece.barcode || payload.piece.id)) {
      this.activeOnAirPiece = {
        ...payload.piece,
        barcode: payload.piece.barcode || payload.piece.id
      };
    }

    // 1. Check if comment matches any configured keyword
    let matchedRule: AutoClaimKeywordRule | null = null;
    const upperComment = rawComment.toUpperCase();

    for (const rule of this.keywordRules.filter(r => r.enabled)) {
      const kw = rule.keyword.toUpperCase();
      if (rule.matchType === 'STARTS_WITH' && upperComment.startsWith(kw)) {
        matchedRule = rule;
        break;
      } else if (rule.matchType === 'EXACT' && upperComment === kw) {
        matchedRule = rule;
        break;
      } else if (rule.matchType === 'CONTAINS' && upperComment.includes(kw)) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      return {
        isClaim: false,
        success: false,
        replyMessage: 'No claim trigger keyword matched in comment.'
      };
    }

    // 2. Extract SKU from comment (e.g. "MINE BAL-09-2026-0001-LAD-TEE-P0001", "MINE P0001", or bare "MINE"/"CLAIM" for on-air piece)
    const skuRegex = /\b(?:VV-[A-Z0-9\-_]+|BAL-[A-Z0-9\-_]+|VIN-[A-Z0-9\-_]+|[A-Z]{2,4}-\d{2,4}-[A-Z0-9\-_]+)\b/i;
    const skuMatch = rawComment.match(skuRegex);
    let targetSku = skuMatch ? skuMatch[0].toUpperCase() : null;

    const boothSession = streamController.getBooth(boothId);
    if (!targetSku && payload.piece?.barcode) {
      targetSku = String(payload.piece.barcode).toUpperCase();
    }
    if (!targetSku && this.activeOnAirPiece?.barcode) {
      targetSku = this.activeOnAirPiece.barcode;
    }
    if (!targetSku && boothSession?.activeOnAirSku) {
      targetSku = boothSession.activeOnAirSku;
    }

    if (!targetSku) {
      const reply = this.responseTemplate.invalidSkuTemplate.replace('{customer}', customer);
      return {
        isClaim: true,
        success: false,
        replyMessage: reply,
        error: 'No target SKU detected in comment and no piece is currently On Air.'
      };
    }

    // Ensure the target piece exists in relationalStore.inventoryPieces (if loaded from Supabase bale_sorted_pieces)
    const storeAny = relationalStore as any;
    const sourcePiece = payload.piece || this.activeOnAirPiece;
    if (Array.isArray(storeAny.inventoryPieces) && sourcePiece) {
      const existingIdx = storeAny.inventoryPieces.findIndex(
        (p: any) => String(p.barcode || p.id || '').toUpperCase() === targetSku!.toUpperCase()
      );
      if (existingIdx === -1) {
        storeAny.inventoryPieces.unshift({
          ...sourcePiece,
          barcode: targetSku,
          status: 'IN_STOCK',
          isSold: false
        });
      }
    }

    // 3. Atomically Lock Item & Draft Sales Invoice via RelationalStore
    const lockResult = relationalStore.draftLiveClaimInvoice({
      barcode: targetSku,
      buyerHandle: customer,
      boothId,
      offeredPrice: payload.offeredPrice,
      channel: `Multistream Live (${platform.toUpperCase()})`
    });

    const lockDuration = matchedRule.lockDurationMinutes || 15;
    const expiresAt = Date.now() + lockDuration * 60 * 1000;
    const baseCheckout = (this.responseTemplate.paymentLinkBaseUrl && !this.responseTemplate.paymentLinkBaseUrl.includes('localhost'))
      ? this.responseTemplate.paymentLinkBaseUrl
      : 'https://vintagevibesgk.com/?checkout=';
    const checkoutUrl = `${baseCheckout}${encodeURIComponent(targetSku)}`;

    if (!lockResult.success || !lockResult.piece) {
      // Item already claimed or sold out
      const reply = this.responseTemplate.alreadyClaimedTemplate
        .replace('{customer}', customer)
        .replace('{sku}', targetSku);

      const failedRecord: ChatClaimRecord = {
        id: `claim-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        customerHandle: customer,
        platform,
        rawComment,
        matchedKeyword: matchedRule.keyword,
        sku: targetSku,
        priceAed: payload.offeredPrice || 120,
        status: 'OUT_OF_STOCK',
        replyDispatched: reply,
        checkoutUrl,
        lockExpiresAt: 0,
        boothId
      };

      this.claimLogs.unshift(failedRecord);
      this.saveToDisk();
      this.persistClaimLogToSql(failedRecord).catch(() => {});

      // Emit failure notification
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'LIVE_CLAIM',
        action: 'UPDATE',
        documentRef: targetSku,
        data: { failedRecord, error: lockResult.error }
      });

      return {
        isClaim: true,
        success: false,
        claimRecord: failedRecord,
        replyMessage: reply,
        error: lockResult.error || 'Piece is already locked or sold out'
      };
    }

    // 4. Success! Lock acquired and draft invoice created
    const piece = lockResult.piece;
    const draftInvoice = lockResult.draftInvoice;
    const finalPrice = piece.lockedPrice || piece.retailPriceAed || piece.estimatedPrice || 120;

    const successReply = this.responseTemplate.successTemplate
      .replace('{customer}', customer)
      .replace('{sku}', targetSku)
      .replace('{item_name}', piece.itemName || 'Vintage Garment')
      .replace('{price}', String(finalPrice))
      .replace('{expiry_mins}', String(lockDuration))
      .replace('{checkout_link}', checkoutUrl);

    const claimRecord: ChatClaimRecord = {
      id: `claim-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      customerHandle: customer,
      platform,
      rawComment,
      matchedKeyword: matchedRule.keyword,
      sku: targetSku,
      itemName: piece.itemName,
      itemImage: piece.frontImageUrl,
      priceAed: finalPrice,
      invoiceNo: draftInvoice?.invoiceNo,
      status: 'LOCK_ACTIVE',
      replyDispatched: successReply,
      checkoutUrl,
      lockExpiresAt: expiresAt,
      boothId
    };

    this.claimLogs.unshift(claimRecord);
    if (this.claimLogs.length > 100) this.claimLogs.pop();
    this.saveToDisk();
    this.persistClaimLogToSql(claimRecord).catch(() => {});

    // 5. Broadcast to all clients (Live host HUD, Storefront, Mobile App)
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_CLAIM',
      action: 'CREATE',
      documentRef: targetSku,
      data: {
        claimRecord,
        piece,
        draftInvoice,
        boothId
      }
    });

    return {
      isClaim: true,
      success: true,
      claimRecord,
      replyMessage: successReply
    };
  }

  // ==================== WHATSAPP VIP AUTO-BROADCAST ====================
  public getVipDrops(): WhatsAppVipDropPayload[] {
    return this.vipDrops;
  }

  public createAndBroadcastVipDrop(payload: {
    campaignTitle: string;
    targetGroup: 'VIP_GOLD_BUYERS' | 'STREETWEAR_VIP' | 'LEATHER_ARCHIVE_VIP' | 'ALL_CUSTOMERS';
    pieceIds: string[];
    customNote?: string;
  }): WhatsAppVipDropPayload {
    const allPieces = relationalStore.queryInventoryStock({});
    const selectedPieces = allPieces.filter(p => payload.pieceIds.includes(p.barcode) || payload.pieceIds.includes(p.id));
    const baseUrl = this.getNetworkBaseUrl();

    // Calculate real customer recipients from ERP Parties & synced WhatsApp contacts
    const allParties = relationalStore.getParties() || [];
    const customerParties = allParties.filter((p: any) =>
      (p.type === 'CUSTOMER' || p.type === 'RETAIL_CUSTOMER' || p.role === 'CUSTOMER' || p.category === 'CUSTOMER') &&
      (p.phone || p.contactPhone || p.whatsapp)
    );
    const liveWaSession = baileysManager.getConnectedSession();
    const waContactCount = liveWaSession?.contacts ? liveWaSession.contacts.size : 0;
    const totalRealContacts = Math.max(1, customerParties.length + waContactCount);

    let itemsListText = '';
    selectedPieces.forEach((p, idx) => {
      const priceAed = p.retailPriceAed || p.estimatedPrice || 120;
      const priceUsd = Math.round(priceAed * 0.272);
      itemsListText += `\n${idx + 1}. *${p.itemName}* (${p.brandName})\n   • Size: ${p.sizeScanned} | Grade: ${p.labelGrade}\n   • Price: AED ${priceAed} / $${priceUsd}\n   • Direct Checkout: ${baseUrl}/?checkout=${encodeURIComponent(p.barcode)}`;
    });

    const generatedText = `🚨 *VINTAGE VIBES VIP COLLECTION DROP* 🚨\n\n${payload.campaignTitle}\n\n${payload.customNote || 'Exclusive early preview from our Dubai Sorting Facility before live stream auction:'}\n${itemsListText}\n\n📦 *Complimentary VIP Courier Dispatch across UAE & GCC*\n💬 Reply MINE [SKU] to this message to hold your piece instantly!`;

    const newDrop: WhatsAppVipDropPayload = {
      id: `drop-${Date.now()}`,
      campaignTitle: payload.campaignTitle,
      targetGroup: payload.targetGroup,
      recipientCount: totalRealContacts,
      pieceIds: payload.pieceIds,
      pieces: selectedPieces,
      customNote: payload.customNote,
      generatedText,
      sentAt: new Date().toISOString(),
      status: 'SENT'
    };

    this.vipDrops.unshift(newDrop);
    this.saveToDisk();
    this.persistVipDropToSql(newDrop).catch(() => {});

    // Dispatch asynchronously to default WhatsApp Channel and/or customer phones via Baileys
    setImmediate(async () => {
      try {
        const defaultChan = this.getDefaultWhatsAppChannel();
        const channelJid = defaultChan?.jid || this.whatsappGatewayConfig.channelConfig?.channelJid;
        if (channelJid) {
          const leadImg = selectedPieces[0]?.frontImageUrl;
          await baileysManager.postToChannel('usr-admin-1', channelJid, {
            imageUrl: leadImg,
            caption: generatedText
          }).catch(() => {});
        }
        for (const party of customerParties.slice(0, 50)) {
          const rawPhone = String((party as any).phone || (party as any).contactPhone || (party as any).whatsapp || '').replace(/\D/g, '');
          if (rawPhone && rawPhone.length >= 8) {
            await baileysManager.sendUnifiedMessage(rawPhone, generatedText, selectedPieces[0]?.frontImageUrl).catch(() => {});
          }
        }
      } catch (e: any) {
        console.warn('[VIP Drop Dispatch notice]:', e?.message);
      }
    });

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'MARKETING_DROP',
      action: 'CREATE',
      documentRef: newDrop.id,
      data: newDrop
    });

    return newDrop;
  }

  // ==================== LIVE STREAM SESSION CONTROLLER ====================
  public getLiveSessionStatus(): LiveStreamSessionStatus {
    const now = Date.now();
    const uptime = this.isLiveBroadcasting && this.liveStartedAt ? Math.floor((now - this.liveStartedAt) / 1000) : 0;
    const claims = this.claimLogs.filter(c => c.status === 'LOCK_ACTIVE' || c.status === 'CONFIRMED');
    const revenue = claims.reduce((s, c) => s + c.priceAed, 0);

    return {
      isBroadcasting: this.isLiveBroadcasting,
      startedAt: this.liveStartedAt,
      uptimeSeconds: uptime,
      activeBoothId: this.activeBoothId,
      activeBoothName: 'Booth 01 - Main Stage',
      activeOnAirPiece: this.activeOnAirPiece,
      scannerFeed: this.liveDeskScannerFeed,
      totalClaimsInSession: claims.length,
      totalRevenueAedInSession: revenue,
      obsOverlayUrl: `/live-overlay?booth=${this.activeBoothId}`
    };
  }

  public toggleLiveStream(start: boolean, boothId: string = 'booth-01'): LiveStreamSessionStatus {
    this.isLiveBroadcasting = start;
    this.activeBoothId = boothId;
    if (start) {
      this.liveStartedAt = Date.now();
      streamController.startBroadcast(boothId);
    } else {
      this.liveStartedAt = null;
      streamController.stopBroadcast(boothId);
    }

    this.saveToDisk();
    this.persistLiveSessionToSql().catch(() => {});

    // Broadcast event so storefront displays pulsing live announcement banner!
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_STREAM',
      action: 'UPDATE',
      documentRef: 'BROADCAST_STATE',
      data: {
        isBroadcasting: this.isLiveBroadcasting,
        boothId: this.activeBoothId,
        startedAt: this.liveStartedAt
      }
    });

    return this.getLiveSessionStatus();
  }

  public scanPieceOnLiveDesk(
    barcode: string,
    scannedBy: string = 'Live Host',
    providedPiece?: PieceBreakdownItem,
    boothId: string = 'booth-1'
  ): {
    success: boolean;
    piece?: PieceBreakdownItem;
    error?: string;
  } {
    const cleanCode = (barcode || providedPiece?.barcode || '').trim().toUpperCase();
    const allPieces = relationalStore.queryInventoryStock({});
    let piece = allPieces.find(p => p.barcode.toUpperCase() === cleanCode || p.id === cleanCode);

    if (!piece && providedPiece) {
      piece = {
        ...providedPiece,
        barcode: providedPiece.barcode || cleanCode,
        status: providedPiece.status || 'IN_STOCK',
        isSold: Boolean(providedPiece.isSold)
      };
      const storeAny = relationalStore as any;
      if (Array.isArray(storeAny.inventoryPieces)) {
        const idx = storeAny.inventoryPieces.findIndex(
          (p: any) => String(p.barcode || '').toUpperCase() === cleanCode
        );
        if (idx === -1) {
          storeAny.inventoryPieces.unshift(piece);
        } else {
          storeAny.inventoryPieces[idx] = { ...storeAny.inventoryPieces[idx], ...piece };
        }
      }
    }

    if (!piece) {
      return { success: false, error: `Garment barcode '${cleanCode}' not found in inventory.` };
    }

    this.activeOnAirPiece = piece;
    this.activeBoothId = boothId;
    try {
      const price = Number(piece.retailPriceAed || piece.estimatedPrice || piece.costPrice || 120);
      streamController.setActiveProduct(boothId, piece.barcode, price);
    } catch (_) {}

    this.liveDeskScannerFeed.unshift({
      scannedAt: new Date().toLocaleTimeString(),
      piece,
      scannedBy
    });
    if (this.liveDeskScannerFeed.length > 20) this.liveDeskScannerFeed.pop();
    this.saveToDisk();
    this.persistLiveSessionToSql().catch(() => {});

    // Real-time update for OBS Overlay & Host Screen
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_STREAM',
      action: 'UPDATE',
      documentRef: 'ON_AIR_PIECE',
      data: {
        activeOnAirPiece: piece,
        scannedAt: new Date().toISOString()
      }
    });

    return { success: true, piece };
  }

  // ==================== STOREFRONT FEATURED DROPS ====================
  public pushToFeaturedDrops(pieceIds: string[]): { success: boolean; addedCount: number } {
    pieceIds.forEach(id => this.featuredDropPieceIds.add(id));
    this.saveToDisk();

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'STOREFRONT_DROPS',
      action: 'UPDATE',
      documentRef: 'FEATURED',
      data: { featuredPieceIds: Array.from(this.featuredDropPieceIds) }
    });

    return { success: true, addedCount: pieceIds.length };
  }

  public getFeaturedDropPieceIds(): string[] {
    return Array.from(this.featuredDropPieceIds);
  }

  // ==================== AD CATALOG FEED ENGINE ====================
  /**
   * Real-Time Ad Feeds: Strictly only in-stock garments.
   * Evicts sold, damaged, or reserved items within 60s.
   */
  public generateGoogleMerchantXml(baseUrl: string = 'http://localhost:3000'): { xml: string; itemCount: number; evictedCount: number } {
    const allPieces = relationalStore.queryInventoryStock({});
    
    // STRICT RULE: Only in_stock, non-sold, non-claimed
    const eligiblePieces = allPieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
    const evictedCount = allPieces.length - eligiblePieces.length;

    const escapeXml = (unsafe: string = '') =>
      unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    let itemsXml = '';
    for (const p of eligiblePieces) {
      const priceAed = p.retailPriceAed || p.estimatedPrice || 120;
      const title = escapeXml(`${p.brandName} ${p.itemName} (${p.style || 'Vintage'}) - ${p.sizeScanned}`);
      const desc = escapeXml(
        `Authentic vintage piece inspected and certified in Dubai UAE. Era/Style: ${p.style || 'Classic'}. Grade: ${p.labelGrade}. Origin: ${p.countryOfOrigin || 'USA'}. Single piece 1-of-1 archive stock.`
      );
      const link = `${baseUrl}/?item=${p.barcode}`;
      const img = p.frontImageUrl || `${baseUrl}/vintage_vibes_seal.svg`;
      const brand = escapeXml(p.brandName || 'Vintage Vibes');
      const size = escapeXml(p.sizeScanned || 'L');

      itemsXml += `
    <item>
      <g:id>${escapeXml(p.barcode)}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(img)}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${priceAed.toFixed(2)} AED</g:price>
      <g:brand>${brand}</g:brand>
      <g:condition>used</g:condition>
      <g:google_product_category>1604</g:google_product_category>
      <g:product_type>Apparel &amp; Accessories &gt; Clothing &gt; Vintage &gt; ${escapeXml(p.itemName)}</g:product_type>
      <g:size>${size}</g:size>
      <g:age_group>adult</g:age_group>
      <g:gender>unisex</g:gender>
      <g:identifier_exists>no</g:identifier_exists>
      <g:custom_label_0>${escapeXml(p.labelGrade)}</g:custom_label_0>
      <g:custom_label_1>${escapeXml(p.baleCode || 'BALE-DIRECT')}</g:custom_label_1>
    </item>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Vintage Vibes General Trading LLC - Google Merchant Center Product Feed</title>
    <link>${baseUrl}</link>
    <description>Live Relational Inventory Ad Feed - Real-time 60-second eviction of sold garments</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;

    return { xml, itemCount: eligiblePieces.length, evictedCount };
  }

  public generateMetaCatalogXml(baseUrl: string = 'http://localhost:3000'): { xml: string; itemCount: number; evictedCount: number } {
    const allPieces = relationalStore.queryInventoryStock({});
    const eligiblePieces = allPieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
    const evictedCount = allPieces.length - eligiblePieces.length;

    const escapeXml = (unsafe: string = '') =>
      unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    let itemsXml = '';
    for (const p of eligiblePieces) {
      const priceAed = p.retailPriceAed || p.estimatedPrice || 120;
      const title = escapeXml(`${p.brandName} ${p.itemName} - ${p.sizeScanned}`);
      const desc = escapeXml(`Curated 1-of-1 Vintage Apparel. Certified Grade: ${p.labelGrade}. Instant UAE & GCC Dispatch.`);
      const link = `${baseUrl}/?item=${p.barcode}`;
      const img = p.frontImageUrl || `${baseUrl}/vintage_vibes_seal.svg`;

      itemsXml += `
    <item>
      <g:id>${escapeXml(p.barcode)}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:availability>in stock</g:availability>
      <g:condition>used</g:condition>
      <g:price>${priceAed.toFixed(2)} AED</g:price>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(img)}</g:image_link>
      <g:brand>${escapeXml(p.brandName || 'Vintage Vibes')}</g:brand>
      <g:inventory>1</g:inventory>
      <g:fb_product_category>clothing</g:fb_product_category>
      <g:size>${escapeXml(p.sizeScanned || 'L')}</g:size>
    </item>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>Vintage Vibes Facebook &amp; Instagram Commerce Catalog</title>
  <link rel="self" href="${baseUrl}/api/feed/meta-catalog.xml"/>
  <updated>${new Date().toISOString()}</updated>${itemsXml}
</feed>`;

    return { xml, itemCount: eligiblePieces.length, evictedCount };
  }

  public getFeedMetrics(baseUrl: string = 'http://localhost:3000'): AdFeedMetrics {
    const allPieces = relationalStore.queryInventoryStock({});
    const eligiblePieces = allPieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
    const evicted = allPieces.length - eligiblePieces.length;

    return {
      googleMerchantFeedUrl: `${baseUrl}/api/feed/google-merchant.xml`,
      metaCatalogFeedUrl: `${baseUrl}/api/feed/meta-catalog.xml`,
      totalInStockGarments: eligiblePieces.length,
      evictedSoldGarmentsCount: evicted,
      lastRefreshedAt: new Date().toISOString(),
      autoEvictIntervalSeconds: 60,
      googleFeedHealth: 'HEALTHY',
      metaFeedHealth: 'HEALTHY'
    };
  }

  public getNetworkBaseUrl(): string {
    return (process.env.PUBLIC_STOREFRONT_URL || 'https://vintagevibesgk.com').replace(/\/$/, '');
  }

  // ==================== AUTO-PICTURE BROADCAST & VOICE ENGINE ====================
  public getVoiceNotePresets(): VoiceNotePreset[] {
    return this.voiceNotePresets;
  }

  public getCurrentBroadcastCampaign(): AutoBroadcastCampaign | null {
    return this.currentBroadcastCampaign;
  }

  public getBroadcastHistory(): AutoBroadcastCampaign[] {
    return this.broadcastHistory;
  }

  public startAutoBroadcastCampaign(params: {
    title: string;
    targetAudience: string;
    targetChatId?: string;
    customerPhones?: string[];
    pieceIds: string[];
    voiceNoteEnabled: boolean;
    voiceNotePresetId?: string;
    customVoiceNoteText?: string;
    intervalSeconds?: number;
  }): AutoBroadcastCampaign {
    // If a campaign is already running or paused, gracefully supersede it with the fresh campaign
    if (this.currentBroadcastCampaign && (this.currentBroadcastCampaign.status === 'RUNNING' || this.currentBroadcastCampaign.status === 'PAUSED')) {
      this.currentBroadcastCampaign.status = 'ABORTED';
      this.currentBroadcastCampaign.completedAt = new Date().toISOString();
      this.broadcastHistory.unshift({ ...this.currentBroadcastCampaign });
      this.currentBroadcastCampaign = null;
    }

    const allPieces = relationalStore.queryInventoryStock({});
    const targetPieces = allPieces.filter(p => params.pieceIds.includes(p.barcode) || params.pieceIds.includes(p.id));

    // Construct photo queue items with formatted conversion captions
    const session = this.getWhatsAppSession('usr-admin-1');
    const cleanBizNumber = (session?.phoneNumber || '971501044543').replace(/\D/g, '');
    const defaultChan = this.getDefaultWhatsAppChannel();
    const channelInvite = defaultChan?.inviteLink || this.whatsappGatewayConfig.channelConfig?.channelInviteLink || '';
    const baseUrl = this.getNetworkBaseUrl();

    const items: BroadcastQueueItem[] = targetPieces.map(piece => {
      const price = piece.retailPriceAed || piece.estimatedPrice || 120;
      const condition = piece.labelGrade || 'Grade A Vintage';
      const size = piece.sizeScanned || 'L';
      const brand = piece.brandName || 'Vintage';
      const category = piece.itemName || piece.style || 'Garment';
      const sku = piece.barcode;

      const frontImg = piece.frontImageUrl || `${baseUrl}/winter_maazi_story.png`;
      const backImg = piece.backImageUrl || frontImg;
      const tagImg = piece.tagImageUrl || frontImg;

      const formattedCaption = `🔥 *${brand} - ${category}*\n` +
        `🏷️ *SKU:* ${sku}\n` +
        `📏 *Size:* ${size} | *Condition:* ${condition}\n` +
        `💰 *Price:* ${price} AED\n\n` +
        `💳 *1-Tap Instant Checkout (Apple Pay, Google Pay, Card):*\n` +
        `👉 ${baseUrl}/?checkout=${encodeURIComponent(sku)}\n\n` +
        `💬 *1-Click WhatsApp Claim:*\n` +
        `👉 https://wa.me/${cleanBizNumber}?text=MINE%20${encodeURIComponent(sku)}\n\n` +
        `🖼️ *High-Res Inspector (Front, Back & Label Photos):*\n` +
        `👉 ${baseUrl}/?piece=${encodeURIComponent(sku)}\n\n` +
        (channelInvite ? `📢 *Join Our Exclusive Drop Channel:*\n👉 ${channelInvite}\n\n` : '') +
        `_⚡ Verified Live Drop by Vintage Vibe UAE_`;

      return {
        piece,
        status: 'PENDING',
        caption: formattedCaption,
        imageMediaUrl: frontImg
      };
    });

    const preset = this.voiceNotePresets.find(p => p.id === params.voiceNotePresetId) || this.voiceNotePresets[0];
    const voiceText = params.customVoiceNoteText || preset?.scriptText || 'Exclusive Vintage Drop Alert!';

    const defaultTargetId = defaultChan?.jid || this.whatsappGatewayConfig.channelConfig?.channelJid || '';
    const campaignId = `camp-${Date.now()}`;
    const newCampaign: AutoBroadcastCampaign = {
      id: campaignId,
      title: params.title || 'VIP Photo Drop Collection',
      targetAudience: params.targetAudience || (defaultChan?.name ? `WhatsApp Channel (${defaultChan.name})` : 'VIP Drop Audience'),
      targetChatId: params.targetChatId || defaultTargetId,
      customerPhones: params.customerPhones,
      voiceNoteEnabled: Boolean(params.voiceNoteEnabled),
      voiceNotePresetId: params.voiceNotePresetId,
      voiceNoteText: voiceText,
      voiceNoteStatus: params.voiceNoteEnabled ? 'PENDING' : 'SKIPPED',
      intervalSeconds: Math.max(3, params.intervalSeconds || 4), // safe interval (3-5s)
      status: 'RUNNING',
      currentIndex: 0,
      totalCount: items.length,
      sentCount: 0,
      failedCount: 0,
      startedAt: new Date().toISOString(),
      items
    };

    this.currentBroadcastCampaign = newCampaign;
    this.persistBroadcastCampaignToSql(newCampaign).catch(() => {});

    // Broadcast campaign start event via SSE
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'BROADCAST_CAMPAIGN_STARTED',
      action: 'CREATE',
      documentRef: newCampaign.id,
      data: newCampaign
    });

    // Run dispatch loop in background
    this.runBroadcastLoop(newCampaign.id);

    return newCampaign;
  }

  public pauseBroadcastCampaign(): { success: boolean; campaign?: AutoBroadcastCampaign; error?: string } {
    if (!this.currentBroadcastCampaign || this.currentBroadcastCampaign.status !== 'RUNNING') {
      return { success: false, error: 'No active running campaign to pause' };
    }
    this.currentBroadcastCampaign.status = 'PAUSED';
    this.persistBroadcastCampaignToSql(this.currentBroadcastCampaign).catch(() => {});

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'BROADCAST_CAMPAIGN_PAUSED',
      action: 'UPDATE',
      documentRef: this.currentBroadcastCampaign.id,
      data: this.currentBroadcastCampaign
    });

    return { success: true, campaign: this.currentBroadcastCampaign };
  }

  public resumeBroadcastCampaign(): { success: boolean; campaign?: AutoBroadcastCampaign; error?: string } {
    if (!this.currentBroadcastCampaign || this.currentBroadcastCampaign.status !== 'PAUSED') {
      return { success: false, error: 'No paused campaign to resume' };
    }
    this.currentBroadcastCampaign.status = 'RUNNING';
    this.persistBroadcastCampaignToSql(this.currentBroadcastCampaign).catch(() => {});

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'BROADCAST_CAMPAIGN_RESUMED',
      action: 'UPDATE',
      documentRef: this.currentBroadcastCampaign.id,
      data: this.currentBroadcastCampaign
    });

    this.runBroadcastLoop(this.currentBroadcastCampaign.id);
    return { success: true, campaign: this.currentBroadcastCampaign };
  }

  public abortBroadcastCampaign(): { success: boolean; campaign?: AutoBroadcastCampaign; error?: string } {
    if (!this.currentBroadcastCampaign || (this.currentBroadcastCampaign.status !== 'RUNNING' && this.currentBroadcastCampaign.status !== 'PAUSED')) {
      return { success: false, error: 'No active campaign to abort' };
    }
    this.currentBroadcastCampaign.status = 'ABORTED';
    this.currentBroadcastCampaign.completedAt = new Date().toISOString();
    this.broadcastHistory.unshift({ ...this.currentBroadcastCampaign });
    this.persistBroadcastCampaignToSql(this.currentBroadcastCampaign).catch(() => {});

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'BROADCAST_CAMPAIGN_ABORTED',
      action: 'UPDATE',
      documentRef: this.currentBroadcastCampaign.id,
      data: this.currentBroadcastCampaign
    });

    return { success: true, campaign: this.currentBroadcastCampaign };
  }

  /**
   * Asynchronous Background Dispatch Queue Loop:
   * 1. Sends opening voice note (sendAudioAsVoice: true) if enabled
   * 2. Loops sequentially through each piece photo + caption with safe throttle pause (3-5s delay)
   * 3. Emits live progress events on every piece sent
   */
  private runBroadcastLoop(campaignId: string) {
    const step = async () => {
      const campaign = this.currentBroadcastCampaign;
      if (!campaign || campaign.id !== campaignId || campaign.status !== 'RUNNING') {
        return; // Campaign stopped, paused, or aborted
      }

      // Dispatch next piece photo in queue
      if (campaign.currentIndex < campaign.items.length) {
        const item = campaign.items[campaign.currentIndex];
        item.status = 'SENDING';

        try {
          const renderedCardBuf = item.piece ? await baileysManager.renderGarmentCardPng(item.piece) : null;
          const imgPayload: any = renderedCardBuf || (item.imageMediaUrl ? { url: item.imageMediaUrl } : null);

          if (campaign.customerPhones && campaign.customerPhones.length > 0) {
            // Direct Customer Directory: dispatch 3-PHOTO PNG CARD + CAPTION to each customer
            for (const phone of campaign.customerPhones) {
              const cleanPhone = phone.replace(/\D/g, '');
              if (cleanPhone) {
                const recipientJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;
                if (imgPayload) {
                  await baileysManager.sendImage('usr-admin-1', recipientJid, imgPayload, item.caption).catch(async (err) => {
                    console.warn(`[Broadcast Queue] sendImage failed, fallback to text:`, err?.message);
                    await baileysManager.sendMessage('usr-admin-1', recipientJid, item.caption);
                  });
                } else {
                  await baileysManager.sendMessage('usr-admin-1', recipientJid, item.caption);
                }
              }
            }
          } else {
            const isChannel = Boolean(
              campaign.targetChatId?.includes('@newsletter') ||
              campaign.targetChatId?.startsWith('chan-') ||
              campaign.targetAudience?.toLowerCase().includes('channel')
            );

            if (isChannel) {
              let destJid = campaign.targetChatId || '';
              if (!destJid || destJid === 'CHANNEL' || destJid.startsWith('chan-') || !destJid.includes('@newsletter')) {
                const foundChan = this.whatsappChannels.find(c => c.id === campaign.targetChatId || c.jid === campaign.targetChatId) || this.getDefaultWhatsAppChannel();
                destJid = foundChan?.jid || foundChan?.inviteLink || this.whatsappGatewayConfig.channelConfig?.channelJid || destJid;
              }
              if (destJid) {
                console.log(`[Broadcast Worker] Dispatching piece ${item.piece.barcode} directly to WhatsApp Channel: ${destJid}`);
                const gwCfg = this.whatsappGatewayConfig;
                await baileysManager.postToChannel('usr-admin-1', destJid, {
                  imageUrl: item.imageMediaUrl,
                  caption: item.caption,
                  apiKeyConfig: {
                    enabled: gwCfg.connectionMode !== 'BAILEYS_DIRECT_WEB',
                    provider: gwCfg.connectionMode === 'META_CLOUD_API' ? 'META_CLOUD_API' : 'CUSTOM_GATEWAY',
                    accessToken: gwCfg.metaCloudConfig?.accessToken || gwCfg.gatewayConfig?.apiToken,
                    phoneNumberId: gwCfg.metaCloudConfig?.phoneNumberId,
                    apiUrl: gwCfg.gatewayConfig?.apiUrl
                  }
                });
              }
            } else if (campaign.targetChatId && !campaign.targetChatId.includes('Multi-Direct')) {
              // Custom VIP Group: send 3-PHOTO PNG CARD + CAPTION
              if (imgPayload) {
                await baileysManager.sendImage('usr-admin-1', campaign.targetChatId, imgPayload, item.caption).catch(async () => {
                  await baileysManager.sendMessage('usr-admin-1', campaign.targetChatId, item.caption);
                });
              } else {
                await baileysManager.sendMessage('usr-admin-1', campaign.targetChatId, item.caption);
              }
            }
          }

          item.status = 'SENT';
          item.sentAt = new Date().toLocaleTimeString();
          campaign.currentIndex += 1;
          campaign.sentCount += 1;
        } catch (postErr: any) {
          console.warn(`[Broadcast Queue] Delivery blip or network delay on piece ${item.piece?.barcode || item.pieceId}:`, postErr?.message);
          item.status = 'FAILED';
          item.error = postErr?.message || 'Delivery error';
          campaign.failedCount = (campaign.failedCount || 0) + 1;
          campaign.currentIndex += 1;
          this.persistBroadcastCampaignToSql(campaign).catch(() => {});

          // If reached end of queue, complete gracefully
          if (campaign.currentIndex >= campaign.items.length) {
            campaign.status = 'COMPLETED';
            campaign.completedAt = new Date().toISOString();
            this.broadcastHistory.unshift({ ...campaign });
            this.persistBroadcastCampaignToSql(campaign).catch(() => {});
            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'MARKETING',
              entity: 'BROADCAST_COMPLETED',
              action: 'UPDATE',
              documentRef: campaign.id,
              data: { campaign }
            });
            return;
          }

          // Advance to next piece after safe throttle pause so queue never hangs
          const throttleMs = Math.max(3000, campaign.intervalSeconds * 1000);
          setTimeout(step, throttleMs);
          return;
        }

        // Emit real-time progress update
        this.persistBroadcastCampaignToSql(campaign).catch(() => {});
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'MARKETING',
          entity: 'BROADCAST_PROGRESS',
          action: 'UPDATE',
          documentRef: campaign.id,
          data: {
            campaignId: campaign.id,
            currentIndex: campaign.currentIndex,
            totalCount: campaign.totalCount,
            sentCount: campaign.sentCount,
            lastPiece: item.piece.barcode,
            lastCaption: item.caption,
            progressPercent: Math.round((campaign.sentCount / campaign.totalCount) * 100)
          }
        });

        // If completed all items
        if (campaign.currentIndex >= campaign.items.length) {
          campaign.status = 'COMPLETED';
          campaign.completedAt = new Date().toISOString();
          this.broadcastHistory.unshift({ ...campaign });
          this.persistBroadcastCampaignToSql(campaign).catch(() => {});

          eventHub.broadcast({
            type: 'ENTITY_MUTATED',
            module: 'MARKETING',
            entity: 'BROADCAST_COMPLETED',
            action: 'UPDATE',
            documentRef: campaign.id,
            data: { campaign }
          });
          return;
        }

        // Await safe throttle pause before sending next photo
        const throttleMs = Math.max(3000, campaign.intervalSeconds * 1000);
        setTimeout(step, throttleMs);
      } else {
        campaign.status = 'COMPLETED';
        campaign.completedAt = new Date().toISOString();
        this.broadcastHistory.unshift({ ...campaign });
        this.persistBroadcastCampaignToSql(campaign).catch(() => {});
      }
    };

    // Begin loop asynchronously without blocking the event loop
    setTimeout(step, 800);
  }

  // ==================== MULTI-USER WHATSAPP DEVICE LINKING ====================
  // Clean initialization: No hardcoded demo phone or device names; defaults to null/empty
  private userWhatsAppSessions: Map<string, WhatsAppDeviceSession> = new Map();

  // Master WhatsApp Gateway Configuration (Option 1 vs Option 2)
  private whatsappGatewayConfig: WhatsAppGatewayConfig = {
    connectionMode: 'BAILEYS_DIRECT_WEB',
    baileysConfig: {
      enabled: true,
      sessionName: 'vintage-vibes-prod',
      autoReconnect: true,
      browserName: 'Vintage Vibes ERP (Production)',
      status: 'READY',
      workerBridgeUrl: 'https://vintage-vibes-erp-production.up.railway.app'
    },
    metaCloudConfig: {
      enabled: false,
      phoneNumberId: '',
      wabaId: '',
      accessToken: '',
      webhookVerifyToken: '',
      businessNumber: ''
    },
    gatewayConfig: {
      enabled: false,
      provider: 'GREEN_API',
      instanceId: '',
      apiToken: '',
      apiUrl: 'https://api.green-api.com'
    },
    safeThrottleSeconds: 4,
    autoEvictSoldPieces: true,
    notifyOnClaim: true,
    channelConfig: {
      channelInviteLink: '',
      channelJid: '',
      channelTitle: '',
      verifiedAdmin: false
    }
  };

  public getWhatsAppGatewayConfig(): WhatsAppGatewayConfig {
    return this.whatsappGatewayConfig;
  }

  public updateWhatsAppGatewayConfig(updates: Partial<WhatsAppGatewayConfig>): WhatsAppGatewayConfig {
    this.whatsappGatewayConfig = {
      ...this.whatsappGatewayConfig,
      ...updates,
      baileysConfig: {
        ...this.whatsappGatewayConfig.baileysConfig,
        ...(updates.baileysConfig || {})
      },
      metaCloudConfig: {
        ...this.whatsappGatewayConfig.metaCloudConfig,
        ...(updates.metaCloudConfig || {})
      },
      channelConfig: {
        ...(this.whatsappGatewayConfig.channelConfig || {
          channelInviteLink: '',
          channelJid: '',
          channelTitle: ''
        }),
        ...(updates.channelConfig || {})
      }
    };
    this.saveToDisk();
    return this.whatsappGatewayConfig;
  }

  public getWhatsAppSession(userId: string, userName?: string): WhatsAppDeviceSession {
    let session = this.userWhatsAppSessions.get(userId);
    if (!session) {
      session = {
        userId,
        userName: userName || 'Staff Operator',
        phoneNumber: undefined,
        deviceModel: undefined,
        isConnected: false,
        qrCodeDataUrl: undefined,
        pairingCode: undefined,
        pairingStatus: 'IDLE',
        connectionMode: this.whatsappGatewayConfig.connectionMode,
        lastActive: 'Awaiting Device Pair'
      };
      this.userWhatsAppSessions.set(userId, session);
    }

    const liveSession = baileysManager.getSession(userId);
    if (liveSession) {
      session.qrCodeDataUrl = liveSession.qrCodeDataUrl || liveSession.qrCode;
      session.pairingCode = liveSession.pairingCode;
      if (liveSession.lastActive) {
        session.lastActive = liveSession.lastActive;
      }
      if (liveSession.phoneNumber) {
        session.phoneNumber = liveSession.phoneNumber;
      }
      if (liveSession.connectedAt) {
        session.connectedAt = liveSession.connectedAt;
      }

      const isSocketOpen = liveSession.status === 'CONNECTED' || Boolean(liveSession.sock?.user && !liveSession.sock?.ws?.isClosed);
      if (isSocketOpen) {
        session.isConnected = true;
        session.pairingStatus = 'CONNECTED';
        session.qrCodeDataUrl = undefined;
        session.pairingCode = undefined;
        if (!session.deviceModel) {
          session.deviceModel = 'Persistent Local + SQL WhatsApp Bridge (Baileys)';
        }
        session.lastActive = liveSession.lastActive || 'Active Online (Persistent Baileys Connected)';
      } else {
        session.isConnected = false;
        if (liveSession.isHandshaking) {
          session.pairingStatus = 'AWAITING_CODE_ENTRY';
          session.lastActive = liveSession.lastActive || 'Phone scanned! Finalizing secure login with mobile...';
        } else if (liveSession.status === 'WAITING_QR' || liveSession.status === 'WAITING_PAIRING') {
          session.pairingStatus = 'AWAITING_CODE_ENTRY';
        } else {
          session.pairingStatus = 'IDLE';
        }
      }
    } else if (this.whatsappGatewayConfig.connectionMode !== 'META_CLOUD_API') {
      session.isConnected = false;
    }
    return session;
  }

  public getAllWhatsAppSessions(): WhatsAppDeviceSession[] {
    return Array.from(this.userWhatsAppSessions.values());
  }

  public async generateNewQRCodeAsync(userId: string, userName?: string): Promise<WhatsAppDeviceSession> {
    const session = this.getWhatsAppSession(userId, userName);
    const existingLive = baileysManager.getSession(userId);
    if (existingLive?.isHandshaking) {
      return this.getWhatsAppSession(userId, userName);
    }

    session.isConnected = false;
    session.pairingStatus = 'AWAITING_CODE_ENTRY';
    session.lastActive = 'Generating fresh live WhatsApp QR...';
    session.qrCodeDataUrl = undefined;
    session.pairingCode = undefined;

    // Wait up to 8 seconds for genuine live QR code from Baileys socket
    const qrPromise = new Promise<string | undefined>((resolve) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          baileysManager.removeListener('qr', onQr);
          const live = baileysManager.getSession(userId);
          resolve(live?.qrCodeDataUrl || live?.qrCode);
        }
      }, 8000);

      const onQr = ({ qr, dataUrl }: { userId: string; qr: string; dataUrl?: string }) => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          baileysManager.removeListener('qr', onQr);
          session.qrCodeDataUrl = dataUrl || qr;
          session.lastActive = 'Live QR Ready for Scan';
          this.userWhatsAppSessions.set(userId, session);
          eventHub.broadcast({
            type: 'ENTITY_MUTATED',
            module: 'ALL',
            entity: 'WHATSAPP_DEVICE',
            action: 'UPDATE',
            documentRef: userId,
            data: { session }
          });
          resolve(dataUrl || qr);
        }
      };
      baileysManager.on('qr', onQr);
    });

    const onOpen = ({ user, phoneNumber }: { userId: string; user: any; phoneNumber?: string }) => {
      session.isConnected = true;
      session.pairingStatus = 'CONNECTED';
      session.phoneNumber = phoneNumber || (user?.id ? `+${String(user.id).split(':')[0].split('@')[0]}` : session.phoneNumber);
      session.connectedAt = new Date().toISOString();
      session.lastActive = 'Active Online (Persistent Baileys Connected)';
      this.userWhatsAppSessions.set(userId, session);
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'ALL',
        entity: 'WHATSAPP_DEVICE',
        action: 'UPDATE',
        documentRef: userId,
        data: { session }
      });
    };
    baileysManager.off('connection.open', onOpen);
    baileysManager.on('connection.open', onOpen);

    // Start real Baileys socket for live QR code
    baileysManager.initSocket(userId, undefined, { forceFreshQr: true }).catch(err => {
      console.warn('[Marketing] Baileys QR init notice:', err?.message);
    });

    const qrResult = await qrPromise;
    if (qrResult) {
      session.qrCodeDataUrl = qrResult;
      session.lastActive = 'Live QR Ready for Scan';
    }

    return this.getWhatsAppSession(userId, userName);
  }

  public generateNewQRCode(userId: string, userName?: string): WhatsAppDeviceSession {
    this.generateNewQRCodeAsync(userId, userName).catch(() => {});
    return this.getWhatsAppSession(userId, userName);
  }

  /**
   * Request pairing code for phone number verification (WhatsApp Linked Devices > Link with phone number instead)
   * Connects via genuine WhatsApp Baileys socket to request authentic 8-character pairing code
   */
  public async requestPhonePairingCodeAsync(userId: string, phoneNumber: string): Promise<WhatsAppDeviceSession> {
    const session = this.getWhatsAppSession(userId);
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    session.phoneNumber = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
    session.pairingCode = undefined;
    session.pairingStatus = 'AWAITING_CODE_ENTRY';
    session.lastActive = `Requesting Official Pairing Code for +${cleanPhone}...`;

    // Wait up to 10 seconds for Baileys socket to return authentic 8-digit pairing code
    const pairingPromise = new Promise<string | undefined>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          baileysManager.off('pairingCode', onPairing);
          const live = baileysManager.getSession(userId);
          resolve(live?.pairingCode);
        }
      }, 10000);

      const onPairing = ({ code }: { userId: string; code: string }) => {
        if (!resolved && code) {
          resolved = true;
          clearTimeout(timeout);
          baileysManager.off('pairingCode', onPairing);
          session.pairingCode = code;
          session.lastActive = 'Official Pairing Code Generated (Enter on phone)';
          resolve(code);
        }
      };
      baileysManager.on('pairingCode', onPairing);
    });

    const onOpen = ({ user, phoneNumber: pNum }: { userId: string; user: any; phoneNumber?: string }) => {
      session.isConnected = true;
      session.pairingStatus = 'CONNECTED';
      session.phoneNumber = pNum || (user?.id ? `+${String(user.id).split(':')[0].split('@')[0]}` : session.phoneNumber);
      session.connectedAt = new Date().toISOString();
      session.lastActive = 'Active Online (Persistent Baileys Connected)';
      this.userWhatsAppSessions.set(userId, session);
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'ALL',
        entity: 'WHATSAPP_DEVICE',
        action: 'UPDATE',
        documentRef: userId,
        data: { session }
      });
    };
    baileysManager.off('connection.open', onOpen);
    baileysManager.on('connection.open', onOpen);

    // Start real Baileys socket targeting this phone number
    try {
      await baileysManager.initSocket(userId, cleanPhone);
    } catch (err: any) {
      console.warn('[Marketing] Baileys pairing code init error:', err?.message);
    }

    const acquiredCode = await pairingPromise;
    if (acquiredCode) {
      session.pairingCode = acquiredCode;
      session.lastActive = 'Official Pairing Code Generated (Enter on phone)';
    }

    this.userWhatsAppSessions.set(userId, session);
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'ALL',
      entity: 'WHATSAPP_DEVICE',
      action: 'UPDATE',
      documentRef: userId,
      data: { session }
    });

    return this.getWhatsAppSession(userId);
  }

  public requestPhonePairingCode(userId: string, phoneNumber: string): WhatsAppDeviceSession {
    this.requestPhonePairingCodeAsync(userId, phoneNumber).catch(err => {
      console.warn('requestPhonePairingCode async error:', err);
    });
    return this.getWhatsAppSession(userId);
  }

  /**
   * Strict verification: Phone will NOT link unless confirmed.
   */
  public verifyAndConnectWithPairingCode(userId: string, enteredCode: string, deviceModel: string = 'WhatsApp Mobile'): { success: boolean; session?: WhatsAppDeviceSession; error?: string } {
    const session = this.getWhatsAppSession(userId);
    const liveSession = baileysManager.getSession(userId);
    if (liveSession?.status === 'CONNECTED') {
      session.isConnected = true;
      session.pairingStatus = 'CONNECTED';
      session.deviceModel = deviceModel;
      session.lastActive = 'Active Online (Socket Verified)';
      return { success: true, session };
    }
    return {
      success: false,
      error: 'Waiting for WhatsApp on your mobile phone to complete the pairing code handshake.'
    };
  }

  public connectWhatsAppDevice(userId: string, phoneNumber: string, deviceModel: string = 'WhatsApp Mobile'): WhatsAppDeviceSession {
    const session = this.getWhatsAppSession(userId);
    session.isConnected = true;
    session.pairingStatus = 'CONNECTED';
    session.phoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    session.deviceModel = deviceModel;
    session.connectedAt = new Date().toISOString();
    session.batteryLevel = 100;
    session.lastActive = 'Active Online (Direct Web Linked)';
    delete session.qrCodeDataUrl;

    this.userWhatsAppSessions.set(userId, session);

    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'ALL',
      entity: 'WHATSAPP_DEVICE',
      action: 'UPDATE',
      documentRef: userId,
      data: { session }
    });

    return session;
  }

  public async disconnectWhatsAppDevice(userId: string): Promise<WhatsAppDeviceSession> {
    this.userWhatsAppSessions.delete(userId);
    await baileysManager.disconnectSession(userId).catch(() => {});
    const cleanSession: WhatsAppDeviceSession = {
      userId,
      userName: 'ERP Staff Operator',
      isConnected: false,
      pairingStatus: 'IDLE',
      lastActive: 'Device Unlinked Cleanly — Ready to Pair New Phone'
    };
    this.userWhatsAppSessions.set(userId, cleanSession);
    setTimeout(() => {
      this.generateNewQRCode(userId);
    }, 300);
    return cleanSession;
  }

  // ==================== MULTI-CHANNEL WHATSAPP MANAGEMENT ====================
  public setWhatsAppChannels(channels: WhatsAppChannelItem[]): WhatsAppChannelItem[] {
    this.whatsappChannels = channels;
    this.saveToDisk();
    return this.whatsappChannels;
  }

  public getWhatsAppChannels(): WhatsAppChannelItem[] {
    return this.whatsappChannels;
  }

  public getDefaultWhatsAppChannel(): WhatsAppChannelItem | undefined {
    return this.whatsappChannels.find(c => c.isDefault) || this.whatsappChannels[0];
  }

  public addWhatsAppChannel(channel: WhatsAppChannelItem): WhatsAppChannelItem[] {
    const existing = this.whatsappChannels.find(c => c.jid === channel.jid || (channel.inviteLink && c.inviteLink === channel.inviteLink));
    if (!existing) {
      this.whatsappChannels.push(channel);
    } else {
      Object.assign(existing, channel);
    }
    this.saveToDisk();
    return this.whatsappChannels;
  }

  public removeWhatsAppChannel(id: string): WhatsAppChannelItem[] {
    this.whatsappChannels = this.whatsappChannels.filter(c => c.id !== id && c.jid !== id);
    this.saveToDisk();
    return this.whatsappChannels;
  }

  public setDefaultWhatsAppChannel(id: string): WhatsAppChannelItem[] {
    this.whatsappChannels.forEach(c => {
      c.isDefault = c.id === id || c.jid === id;
    });
    const defaultChan = this.whatsappChannels.find(c => c.isDefault);
    if (defaultChan) {
      this.updateWhatsAppGatewayConfig({
        channelConfig: {
          channelInviteLink: defaultChan.inviteLink,
          channelJid: defaultChan.jid,
          channelTitle: defaultChan.name,
          verifiedAdmin: true,
          lastTestedAt: new Date().toISOString()
        }
      });
    }
    this.saveToDisk();
    return this.whatsappChannels;
  }

  // ==================== SOCIAL LIVE STREAM CONNECTIONS (YOUTUBE, INSTAGRAM, TIKTOK) ====================
  public getSocialLiveAccounts(): SocialLiveAccountConfig[] {
    return this.socialLiveAccounts;
  }

  public updateSocialLiveAccount(id: 'youtube' | 'instagram' | 'tiktok', updates: Partial<SocialLiveAccountConfig>): SocialLiveAccountConfig[] {
    const target = this.socialLiveAccounts.find(a => a.id === id);
    if (target) {
      Object.assign(target, updates);
      this.saveToDisk();
      this.persistSocialAccountToSql(target).catch(() => {});
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'MARKETING',
        entity: 'SOCIAL_ACCOUNT',
        action: 'UPDATE',
        documentRef: id,
        data: { account: target }
      });
    }
    return this.socialLiveAccounts;
  }

  // ==================== AUTO INVOICING & TAX INVOICE ENGINE ====================
  public getAutoInvoiceRules(): AutoInvoiceRules {
    return this.autoInvoiceRules;
  }

  public updateAutoInvoiceRules(updates: Partial<AutoInvoiceRules>): AutoInvoiceRules {
    this.autoInvoiceRules = { ...this.autoInvoiceRules, ...updates };
    this.saveToDisk();
    this.persistAutoInvoiceRulesToSql(this.autoInvoiceRules).catch(() => {});
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'MARKETING',
      entity: 'AUTO_INVOICE_RULES',
      action: 'UPDATE',
      documentRef: 'rules',
      data: { rules: this.autoInvoiceRules }
    });
    return this.autoInvoiceRules;
  }

  public generateInvoiceFromClaim(claimId: string): { success: boolean; invoice?: any; error?: string } {
    const claim = this.claimLogs.find(c => c.id === claimId);
    if (!claim) return { success: false, error: 'Claim record not found' };

    try {
      const piece = relationalStore.queryInventoryStock({}).find(p => p.barcode === claim.sku);
      const invoiceData = {
        customerName: claim.customerHandle || 'VIP Stream Buyer',
        customerPhone: claim.rawComment || '',
        channel: `${claim.platform ? claim.platform.toUpperCase() : 'LIVE'} Claim`,
        paymentMethod: this.autoInvoiceRules.defaultPaymentMethod || 'DIGITAL_GATEWAY',
        discountAmount: 0,
        items: [
          {
            pieceId: piece?.id,
            barcode: claim.sku,
            description: claim.itemName || piece?.itemName || `Vintage Item (${claim.sku})`,
            weightKg: piece?.weightKg || 0.4,
            unitPrice: claim.priceAed || 120,
            discount: 0,
            finalAmount: claim.priceAed || 120
          }
        ]
      };

      const invResult = relationalStore.createLiveSellingInvoice(invoiceData);
      if (invResult.success && invResult.invoice) {
        claim.invoiceNo = invResult.invoice.invoiceNo;
        claim.status = 'CONFIRMED';
        if (this.autoInvoiceRules.autoPostToLedger) {
          relationalStore.postSalesInvoice(invResult.invoice.id, 'Auto-Invoice Bot');
        }
        this.saveToDisk();
        this.persistClaimLogToSql(claim).catch(() => {});

        // Automatically render & send Live Studio Sale Slip PNG + Courier Slip PNG if customer phone is available
        const rawPhone = String(invResult.invoice.customerPhone || claim.rawComment || '').replace(/\D/g, '');
        if (rawPhone.length >= 8 && rawPhone.length <= 15) {
          setImmediate(async () => {
            try {
              const slipPng = await baileysManager.renderSaleInvoiceSlipPng({
                invoiceNo: invResult.invoice.invoiceNo,
                customerName: claim.customerHandle || 'Live Studio Buyer',
                customerPhone: `+${rawPhone}`,
                channel: 'LIVE STUDIO AUCTION BROADCAST',
                paymentMethod: this.autoInvoiceRules.defaultPaymentMethod || 'ONLINE / COD',
                items: [
                  {
                    barcode: claim.sku,
                    description: claim.itemName || piece?.itemName || `Vintage Garment (${claim.sku})`,
                    size: piece?.sizeScanned || 'M',
                    quantity: 1,
                    price: Number(claim.priceAed || 120),
                    imageUrl: claim.itemImage || piece?.frontImageUrl
                  }
                ],
                garmentImageUrl: claim.itemImage || piece?.frontImageUrl
              });
              if (slipPng) {
                await baileysManager.sendUnifiedMessage(
                  rawPhone,
                  `🎙️ *Vintage Vibes Live Studio — Official Sale Slip (#${invResult.invoice.invoiceNo})*`,
                  slipPng
                );
              }
            } catch (_) {}
          });
        }

        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_CLAIM',
          action: 'UPDATE',
          documentRef: claim.sku,
          data: { claimRecord: claim, invoice: invResult.invoice }
        });
        return { success: true, invoice: invResult.invoice };
      }
      return { success: false, error: invResult.error || 'Invoice generation error' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
}

export const marketingService = new MarketingService();

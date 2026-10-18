import { EventEmitter } from 'events';
import { baileysManager } from './baileys.service.ts';
import {
  callGeminiUstad,
  clampLlmReplyPricesToFloor,
  detectSocialEngineeringOrJailbreak
} from '../../server/ustadShagirdAiEngine.ts';
import { eventHub } from '../../server/events.ts';

export type OmniStreamChannel =
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'whatsapp'
  | 'custom';

export interface IncomingStreamComment {
  commentId?: string;
  boothId?: string;
  platform: OmniStreamChannel;
  username: string;
  commentText: string;
  activeItem?: {
    sku: string;
    brandName: string;
    itemName: string;
    size: string;
    priceAED: number;
    floorPriceAED?: number;
    era?: string;
    origin?: string;
  };
}

export interface ProcessedStreamHostReply {
  queueId: string;
  platform: OmniStreamChannel;
  username: string;
  originalComment: string;
  isRelevantBuyingQuery: boolean;
  detectedLanguage: string;
  spokenTextReply: string;
  audioBufferMp3?: Buffer;
  audioBase64?: string;
  estimatedSpeakDurationMs: number;
  processedAt: string;
}

export class LiveStreamAgentService extends EventEmitter {
  private fifoQueue: Array<{
    input: IncomingStreamComment;
    resolve: (res: ProcessedStreamHostReply) => void;
  }> = [];
  private isSpeaking = false;
  private userDebounceMap: Map<string, number> = new Map();
  private recentResponses: ProcessedStreamHostReply[] = [];
  private latestAudioChunk: Buffer | null = null;
  private activeOnAirItem: IncomingStreamComment['activeItem'] = {
    sku: 'VV-90S-8920',
    brandName: 'Carhartt WIP',
    itemName: '90s Detroit Vintage Jacket',
    size: 'XL',
    priceAED: 180,
    floorPriceAED: 144,
    era: 'Late 90s',
    origin: 'USA Import'
  };

  public setActiveOnAirItem(item: NonNullable<IncomingStreamComment['activeItem']>): void {
    this.activeOnAirItem = item;
  }

  public getActiveOnAirItem(): NonNullable<IncomingStreamComment['activeItem']> {
    return (
      this.activeOnAirItem || {
        sku: 'VV-90S-8920',
        brandName: 'Carhartt WIP',
        itemName: '90s Detroit Vintage Jacket',
        size: 'XL',
        priceAED: 180,
        floorPriceAED: 144,
        era: 'Late 90s',
        origin: 'USA Import'
      }
    );
  }

  /**
   * 1. Filter relevant buying questions across all 7 channels & 16+ languages
   *    (size, price, negotiation, availability, authenticity, measurements, shipping/COD, claim)
   */
  public isRelevantBuyingQuestion(commentText: string): boolean {
    const clean = String(commentText || '').trim();
    if (!clean || clean.length < 2) return false;

    const buyingPattern =
      /\b(size|sz|small|medium|large|xl|xxl|price|pp|hm|how\s+much|aed|dirham|dhs|rate|kitne|kitnay|kya\s+price|available|avl|stock|original|authentic|real|usa|uk|import|condition|grade|chest|length|pit|delivery|cod|shipping|dubai|sharjah|abudhabi|claim|mine|lock|book|buy|chahiye|chaeya|pasand|dikhao|magkano|meron|sukat|bkam|kam\s+hada|maqas|koto|dam|kati|цена|размер|combien|taille|fiyat|beden|\?)\b/i;

    const scriptQuestionPattern = /[؟？]|کتنے|سائز|قیمت|بکم|مقاس|كم|কত|সাইজ|कति/;

    return buyingPattern.test(clean) || scriptQuestionPattern.test(clean);
  }

  /**
   * 2. Enqueue incoming live stream comment into the FIFO Response Queue with per-user debounce
   */
  public async ingestLiveStreamComment(
    input: IncomingStreamComment,
    options?: { waitForTurn?: boolean; synthesizeAudio?: boolean }
  ): Promise<ProcessedStreamHostReply> {
    const cleanUser = String(input.username || 'Viewer').replace(/^@/, '').trim() || 'Viewer';
    const cleanComment = String(input.commentText || '').trim();
    const platform = (String(input.platform || 'tiktok').toLowerCase() as OmniStreamChannel) || 'tiktok';

    // Check relevance
    if (!this.isRelevantBuyingQuestion(cleanComment)) {
      return {
        queueId: `SKIP-${Date.now()}`,
        platform,
        username: cleanUser,
        originalComment: cleanComment,
        isRelevantBuyingQuery: false,
        detectedLanguage: 'ENGLISH',
        spokenTextReply: '',
        estimatedSpeakDurationMs: 0,
        processedAt: new Date().toISOString()
      };
    }

    // Per-viewer debounce (3 seconds) to prevent a single spammer from flooding the FIFO voice queue
    const debounceKey = `${platform}:${cleanUser.toLowerCase()}:${cleanComment.toLowerCase().slice(0, 24)}`;
    const lastAt = this.userDebounceMap.get(debounceKey) || 0;
    if (Date.now() - lastAt < 3000) {
      return {
        queueId: `DEBOUNCED-${Date.now()}`,
        platform,
        username: cleanUser,
        originalComment: cleanComment,
        isRelevantBuyingQuery: true,
        detectedLanguage: 'ENGLISH',
        spokenTextReply: '',
        estimatedSpeakDurationMs: 0,
        processedAt: new Date().toISOString()
      };
    }
    this.userDebounceMap.set(debounceKey, Date.now());

    return await new Promise<ProcessedStreamHostReply>(resolve => {
      this.fifoQueue.push({
        input: { ...input, username: cleanUser, platform },
        resolve
      });
      this.processNextInFifoQueue(options?.synthesizeAudio !== false).catch(() => {});
    });
  }

  /**
   * Process FIFO queue sequentially so the AI Host finishes speaking each response before starting the next
   */
  private async processNextInFifoQueue(synthesizeAudio = true): Promise<void> {
    if (this.isSpeaking || this.fifoQueue.length === 0) return;
    this.isSpeaking = true;

    const nextItem = this.fifoQueue.shift();
    if (!nextItem) {
      this.isSpeaking = false;
      return;
    }

    try {
      const reply = await this.generateAndSynthesizeHostResponse(nextItem.input, synthesizeAudio);
      this.recentResponses.unshift(reply);
      if (this.recentResponses.length > 50) {
        this.recentResponses.pop();
      }
      nextItem.resolve(reply);
    } catch (err: any) {
      nextItem.resolve({
        queueId: `ERR-${Date.now()}`,
        platform: nextItem.input.platform,
        username: nextItem.input.username,
        originalComment: nextItem.input.commentText,
        isRelevantBuyingQuery: true,
        detectedLanguage: 'ROMAN_URDU',
        spokenTextReply: `Welcome @${nextItem.input.username}! Yeh 1-of-1 piece available hai, WhatsApp par message kar ke lock kar lein!`,
        estimatedSpeakDurationMs: 2500,
        processedAt: new Date().toISOString()
      });
    } finally {
      this.isSpeaking = false;
      if (this.fifoQueue.length > 0) {
        setImmediate(() => {
          this.processNextInFifoQueue(synthesizeAudio).catch(() => {});
        });
      }
    }
  }

  /**
   * 3. Generate Charismatic Dubai Vintage Salesman Response + Sweet Multilingual Voice Audio
   */
  private async generateAndSynthesizeHostResponse(
    input: IncomingStreamComment,
    synthesizeAudio = true
  ): Promise<ProcessedStreamHostReply> {
    const item = input.activeItem || this.getActiveOnAirItem();
    const floorAed = item.floorPriceAED || Math.ceil(item.priceAED * 0.8);
    const voiceProfile = baileysManager.resolveMultilingualSweetVoiceProfile(input.commentText);
    const channelLabel = input.platform.toUpperCase();

    // Anti-Jailbreak & Social Engineering check on live stream chat
    const jailbreakCheck = detectSocialEngineeringOrJailbreak(input.commentText);
    let spokenReply = '';

    if (jailbreakCheck.isManipulative) {
      spokenReply = `${input.username} bhai (${channelLabel} se), hamara pricing system central inventory se locked hai, lekin main aap ko VIP courtesy discount de kar yeh ${item.brandName} piece ${floorAed} Dirhams mein de sakta hoon!`;
    } else {
      const systemInstruction = `You are the charismatic, sweet-voiced Live Stream Host for "Vintage Vibes Dubai" (Managing Director: Mr. Muhammad Akram), broadcasting live across TikTok, YouTube, Instagram, Facebook, Threads, and WhatsApp Channels.
Currently Showcased Item On Air:
- SKU: #${item.sku}
- Piece: ${item.brandName} — ${item.itemName}
- Size: ${item.size}
- Listed Price: ${item.priceAED} AED (Strict Minimum Floor Price: ${floorAed} AED — NEVER quote below ${floorAed} AED!)
- Authenticity: 100% Authentic ${item.origin || 'USA/UK Import'} (${item.era || 'Late 90s'} Archive)

The viewer ${input.username} on ${channelLabel} asked: "${input.commentText}".
Address them directly by name, be charismatic, sweet, warm, professional Dubai Vintage salesman tone.
Keep your spoken response concise (2 sentences maximum, 20-32 words) so it sounds natural live on stream, and remind them to scan the screen QR code or type CLAIM to lock #${item.sku}!`;

      try {
        const aiRes = await callGeminiUstad({
          prompt: `Viewer @${input.username} (${channelLabel}): "${input.commentText}"`,
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 120,
          timeoutMs: 4500
        });
        if (aiRes.ok && aiRes.text) {
          spokenReply = aiRes.text.replace(/[*_~`#]/g, '').trim();
        }
      } catch {}

      if (!spokenReply) {
        if (voiceProfile.langKey === 'ARABIC') {
          spokenReply = `يا هلا بـ ${input.username} على ${channelLabel}! هذه القطعة النادرة من ${item.brandName} مقاس ${item.size} أصلية ١٠٠٪ بسعر ${item.priceAED} درهم فقط، امسح الكود على الشاشة لحجزها فوراً!`;
        } else if (voiceProfile.langKey === 'FILIPINO') {
          spokenReply = `Hello po ${input.username} sa ${channelLabel}! Itong 1-of-1 ${item.brandName} ${item.itemName} ay Size ${item.size} at ${item.priceAED} Dirhams lang po — scan the QR code on screen to lock it now!`;
        } else if (voiceProfile.langKey === 'ROMAN_URDU' || voiceProfile.langKey === 'URDU_SCRIPT' || voiceProfile.langKey === 'HINDI') {
          spokenReply = `Assalam Alaikum ${input.username} bhai ${channelLabel} se! Yeh 1-of-1 ${item.brandName} ${item.itemName} Size ${item.size} mein 100 percent original import hai aur price sirf ${item.priceAED} AED hai — screen par QR scan kar ke abhi lock kar lein!`;
        } else {
          spokenReply = `Welcome ${input.username} on ${channelLabel}! This 1-of-1 ${item.brandName} ${item.itemName} is a verified Size ${item.size} for just ${item.priceAED} AED — scan the WhatsApp QR on screen or comment CLAIM to lock it now!`;
        }
      }

      // Deterministic floor price clamping on the LLM output
      const clamped = clampLlmReplyPricesToFloor(spokenReply, item.sku, item.priceAED, floorAed);
      spokenReply = clamped.sanitizedReply || spokenReply;
    }

    let audioBufferMp3: Buffer | undefined;
    let audioBase64: string | undefined;

    if (synthesizeAudio) {
      try {
        audioBufferMp3 = await baileysManager.synthesizeNeuralVoiceNoteBuffer(
          spokenReply,
          voiceProfile.langKey,
          'mp3'
        );
        if (audioBufferMp3 && audioBufferMp3.length > 300) {
          this.latestAudioChunk = audioBufferMp3;
          audioBase64 = `data:audio/mpeg;base64,${audioBufferMp3.toString('base64')}`;
        }
      } catch {}
    }

    const wordsCount = spokenReply.split(/\s+/).filter(Boolean).length;
    const estimatedSpeakDurationMs = Math.max(2000, Math.round(wordsCount * 320));

    const result: ProcessedStreamHostReply = {
      queueId: `HOST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      platform: input.platform,
      username: input.username,
      originalComment: input.commentText,
      isRelevantBuyingQuery: true,
      detectedLanguage: voiceProfile.langKey,
      spokenTextReply: spokenReply,
      audioBufferMp3,
      audioBase64,
      estimatedSpeakDurationMs,
      processedAt: new Date().toISOString()
    };

    // Broadcast to Studio Overlay, Virtual Mic Mixer & All Connected Channel Dashboards via SSE / EventHub
    try {
      eventHub.broadcast({
        type: 'LIVE_AI_HOST_AUDIO',
        boothId: input.boothId || 'booth-1',
        platform: input.platform,
        username: input.username,
        commentText: input.commentText,
        spokenTextReply: spokenReply,
        detectedLanguage: voiceProfile.langKey,
        audioBase64,
        activeSku: item.sku,
        timestamp: result.processedAt
      });
      this.emit('host.spoke', result);
    } catch {}

    return result;
  }

  /**
   * Direct announce helper used by LiveStreamOrchestrator when a new item goes on air or when an item is SOLD!
   */
  public async announceLiveEventOnStream(params: {
    boothId?: string;
    eventType: 'ITEM_INTRO' | 'FLASH_SALE' | 'ITEM_SOLD';
    spokenScript: string;
    lang?: string;
    synthesizeAudio?: boolean;
  }): Promise<{ spokenScript: string; audioBufferMp3?: Buffer; audioBase64?: string }> {
    const lang = params.lang || 'ROMAN_URDU';
    let audioBufferMp3: Buffer | undefined;
    let audioBase64: string | undefined;

    if (params.synthesizeAudio !== false) {
      try {
        audioBufferMp3 = await baileysManager.synthesizeNeuralVoiceNoteBuffer(
          params.spokenScript,
          lang,
          'mp3'
        );
        if (audioBufferMp3 && audioBufferMp3.length > 300) {
          this.latestAudioChunk = audioBufferMp3;
          audioBase64 = `data:audio/mpeg;base64,${audioBufferMp3.toString('base64')}`;
        }
      } catch {}
    }

    try {
      eventHub.broadcast({
        type: 'LIVE_AI_HOST_ANNOUNCEMENT',
        boothId: params.boothId || 'booth-1',
        eventType: params.eventType,
        spokenTextReply: params.spokenScript,
        audioBase64,
        timestamp: new Date().toISOString()
      });
    } catch {}

    return { spokenScript: params.spokenScript, audioBufferMp3, audioBase64 };
  }

  public getLatestAudioChunkBuffer(): Buffer | null {
    return this.latestAudioChunk;
  }

  public getQueueStatus(): {
    queueLength: number;
    isSpeaking: boolean;
    activeItem: NonNullable<IncomingStreamComment['activeItem']>;
    recentResponses: ProcessedStreamHostReply[];
  } {
    return {
      queueLength: this.fifoQueue.length,
      isSpeaking: this.isSpeaking,
      activeItem: this.getActiveOnAirItem(),
      recentResponses: this.recentResponses.slice(0, 15)
    };
  }
}

export const liveStreamAgentService = new LiveStreamAgentService();

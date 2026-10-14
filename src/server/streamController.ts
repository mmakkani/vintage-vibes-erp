// Enterprise Live Selling Multistreaming & Multi-Booth Controller
// Decoupled from core ERP database operations
import fs from 'fs';
import path from 'path';
import os from 'os';
import { eventHub } from './events.ts';

export interface RTMPDestination {
  id: string;
  name: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'snapchat' | 'custom';
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
  status: 'ONLINE' | 'STANDBY' | 'CONNECTING' | 'ERROR';
  bitrateKbps: number;
  fps: number;
  droppedFramesPct: number;
  latencyMs: number;
}

export interface LiveStudioComment {
  id: string;
  boothId: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'custom';
  username: string;
  avatarUrl?: string;
  badge?: string;
  comment: string;
  timestamp: string;
  isClaimIntent: boolean;
  extractedSku?: string;
  extractedBid?: number;
  isProcessed: boolean;
}

export interface StreamTelemetry {
  boothId: string;
  isBroadcasting: boolean;
  ingestSource: 'MOBILE_WEBRTC' | 'INTEGRATED_HD_CAM' | 'STANDBY';
  resolution: string;
  fps: number;
  bitrateKbps: number;
  audioLevelsDb: number;
  uptimeSeconds: number;
  totalViewers: number;
  pairedDeviceName?: string;
  pairedDeviceIp?: string;
  destinations: RTMPDestination[];
  cpuUsagePct: number;
  activeOnAirSku?: string;
}

export interface BoothSession {
  boothId: string;
  boothNumber: number;
  boothName: string;
  hostName: string;
  hostHandle: string;
  hostAvatar?: string;
  categoryFocus: string;
  tiktokHandle: string;
  facebookHandle?: string;
  instagramHandle?: string;
  isBroadcasting: boolean;
  startTime: number;
  uptimeSeconds: number;
  viewerCount: number;
  itemsSoldPerMin: number;
  itemsClaimed: number;
  netRevenueAed: number;
  conversionRatePct: number;
  activeOnAirSku?: string;
  reservationTimeoutMinutes: number; // e.g. 120 (2h) or 240 (4h)
  destinations: RTMPDestination[];
  comments: LiveStudioComment[];
  pairedDeviceName: string;
  pairedDeviceIp: string;
}

class StreamController {
  private booths: Map<string, BoothSession> = new Map();
  private dataFilePath = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(os.tmpdir(), 'booth_settings.json')
    : path.join(process.cwd(), '.data', 'booth_settings.json');

  constructor() {
    this.initDefaultBooths();
    this.loadFromDisk();
    // Real comments only - simulated dummy comment engine disabled
  }

  private saveToDisk(): boolean {
    try {
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serializable: Record<string, any> = {};
      this.booths.forEach((b, k) => {
        serializable[k] = {
          hostName: b.hostName,
          hostHandle: b.hostHandle,
          tiktokHandle: b.tiktokHandle,
          facebookHandle: b.facebookHandle,
          instagramHandle: b.instagramHandle,
          categoryFocus: b.categoryFocus,
          reservationTimeoutMinutes: b.reservationTimeoutMinutes,
          destinations: b.destinations
        };
      });
      fs.writeFileSync(this.dataFilePath, JSON.stringify(serializable, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.warn('Could not persist booth settings to disk:', e);
      return false;
    }
  }

  private loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(this.dataFilePath)) return false;
      const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
      const loaded = JSON.parse(raw);
      if (!loaded || typeof loaded !== 'object') return false;

      Object.keys(loaded).forEach(boothId => {
        const existing = this.booths.get(boothId);
        const saved = loaded[boothId];
        if (existing && saved) {
          if (saved.hostName) existing.hostName = saved.hostName;
          if (saved.hostHandle) existing.hostHandle = saved.hostHandle;
          if (saved.tiktokHandle) existing.tiktokHandle = saved.tiktokHandle;
          if (saved.facebookHandle) existing.facebookHandle = saved.facebookHandle;
          if (saved.instagramHandle) existing.instagramHandle = saved.instagramHandle;
          if (saved.categoryFocus) existing.categoryFocus = saved.categoryFocus;
          if (saved.reservationTimeoutMinutes) existing.reservationTimeoutMinutes = saved.reservationTimeoutMinutes;
          if (Array.isArray(saved.destinations)) existing.destinations = saved.destinations;
        }
      });
      return true;
    } catch (e) {
      console.warn('Could not load booth settings from disk:', e);
      return false;
    }
  }

  private initDefaultBooths() {
    this.booths.clear();
    for (let i = 1; i <= 10; i++) {
      const bId = `booth-${i}`;
      this.booths.set(bId, {
        boothId: bId,
        boothNumber: i,
        boothName: `Booth ${i}: Studio ${i}`,
        hostName: `Host ${i}`,
        hostHandle: `@host_${i}`,
        categoryFocus: 'Vintage Garments',
        tiktokHandle: `@vintage_booth_${i}`,
        facebookHandle: `Vintage Vibes UAE - Floor ${i}`,
        instagramHandle: `@vintage_dubai_b${i}`,
        isBroadcasting: false,
        startTime: 0,
        uptimeSeconds: 0,
        viewerCount: 0,
        itemsSoldPerMin: 0,
        itemsClaimed: 0,
        netRevenueAed: 0,
        conversionRatePct: 0,
        reservationTimeoutMinutes: 120,
        destinations: [
          {
            id: `dest_yt_${i}`,
            name: 'YouTube Live',
            platform: 'youtube',
            rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
            streamKey: '••••••••',
            enabled: true,
            status: 'STANDBY',
            bitrateKbps: 4500,
            fps: 60,
            droppedFramesPct: 0,
            latencyMs: 120
          },
          {
            id: `dest_tt_${i}`,
            name: 'TikTok Live',
            platform: 'tiktok',
            rtmpUrl: 'rtmp://live.tiktok.com/live',
            streamKey: '••••••••',
            enabled: true,
            status: 'STANDBY',
            bitrateKbps: 4000,
            fps: 60,
            droppedFramesPct: 0,
            latencyMs: 140
          },
          {
            id: `dest_ig_${i}`,
            name: 'Instagram Live',
            platform: 'instagram',
            rtmpUrl: 'rtmps://live-upload.instagram.com:443/rtmp/',
            streamKey: '••••••••',
            enabled: true,
            status: 'STANDBY',
            bitrateKbps: 3500,
            fps: 30,
            droppedFramesPct: 0,
            latencyMs: 180
          },
          {
            id: `dest_fb_${i}`,
            name: 'Facebook Live',
            platform: 'facebook',
            rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
            streamKey: '••••••••',
            enabled: true,
            status: 'STANDBY',
            bitrateKbps: 4000,
            fps: 30,
            droppedFramesPct: 0,
            latencyMs: 150
          }
        ],
        comments: [],
        pairedDeviceName: `Studio Camera ${i}`,
        pairedDeviceIp: `192.168.1.${100 + i}`
      });
    }
  }

  // Ensure booth session exists in-memory and resolve aliases
  public ensureBoothExists(boothId: string, initialData?: Partial<BoothSession>): BoothSession {
    const rawId = String(boothId || 'booth-1').trim().toLowerCase();
    const num = parseInt(rawId.replace(/^booth[-_]?0*/i, ''), 10) || 1;
    const normalizedKey = `booth-${num}`;

    let existing = this.booths.get(rawId) || this.booths.get(normalizedKey) || this.booths.get(`booth_${num}`);
    if (!existing) {
      existing = {
        boothId: normalizedKey,
        boothNumber: num,
        boothName: `Booth ${num}: Studio ${num}`,
        hostName: `Host ${num}`,
        hostHandle: `@host_${num}`,
        categoryFocus: 'Vintage Garments',
        tiktokHandle: `@vintage_booth_${num}`,
        facebookHandle: `Vintage Vibes UAE - Floor ${num}`,
        instagramHandle: `@vintage_dubai_b${num}`,
        isBroadcasting: false,
        startTime: 0,
        uptimeSeconds: 0,
        viewerCount: 0,
        itemsSoldPerMin: 0,
        itemsClaimed: 0,
        netRevenueAed: 0,
        conversionRatePct: 0,
        reservationTimeoutMinutes: 120,
        destinations: [],
        comments: [],
        pairedDeviceName: `Studio Camera ${num}`,
        pairedDeviceIp: '127.0.0.1',
        ...initialData
      };
      this.booths.set(normalizedKey, existing);
      this.booths.set(rawId, existing);
    } else if (initialData) {
      const preservedComments = existing.comments;
      const preservedDestinations = existing.destinations;
      Object.assign(existing, initialData);
      if (!initialData.comments || initialData.comments.length === 0) {
        existing.comments = preservedComments;
      }
      if (!initialData.destinations || initialData.destinations.length === 0) {
        existing.destinations = preservedDestinations;
      }
    }
    return existing;
  }

  // Get master admin overview across all 10 booths
  public getAllBoothsOverview(): {
    booths: BoothSession[];
    totals: {
      activeStreamers: number;
      totalViewers: number;
      totalRevenueAed: number;
      totalClaimsCount: number;
      avgClaimsPerMin: number;
    };
  } {
    const boothsList = Array.from(this.booths.values()).sort((a, b) => a.boothNumber - b.boothNumber);
    
    // Update live uptimes
    const now = Date.now();
    for (const b of boothsList) {
      if (b.isBroadcasting && b.startTime > 0) {
        b.uptimeSeconds = Math.floor((now - b.startTime) / 1000);
      }
    }

    const activeStreamers = boothsList.filter(b => b.isBroadcasting).length;
    const totalViewers = boothsList.reduce((s, b) => s + (b.isBroadcasting ? b.viewerCount : 0), 0);
    const totalRevenueAed = boothsList.reduce((s, b) => s + b.netRevenueAed, 0);
    const totalClaimsCount = boothsList.reduce((s, b) => s + b.itemsClaimed, 0);
    const avgClaimsPerMin = Number(
      (boothsList.reduce((s, b) => s + (b.isBroadcasting ? b.itemsSoldPerMin : 0), 0) / (activeStreamers || 1)).toFixed(2)
    );

    return {
      booths: boothsList,
      totals: {
        activeStreamers,
        totalViewers,
        totalRevenueAed,
        totalClaimsCount,
        avgClaimsPerMin
      }
    };
  }

  // Get single booth session
  public getBooth(boothId: string): BoothSession {
    return this.ensureBoothExists(boothId);
  }

  // Update booth settings (RTMP, TikTok handle, reservation timer, etc.)
  public updateBoothSettings(
    boothId: string,
    settings: {
      tiktokHandle?: string;
      hostName?: string;
      hostHandle?: string;
      categoryFocus?: string;
      reservationTimeoutMinutes?: number;
      destinations?: RTMPDestination[];
    }
  ): { success: boolean; booth?: BoothSession; error?: string } {
    const b = this.ensureBoothExists(boothId);

    if (settings.tiktokHandle !== undefined) b.tiktokHandle = settings.tiktokHandle;
    if (settings.hostName !== undefined) b.hostName = settings.hostName;
    if (settings.hostHandle !== undefined) b.hostHandle = settings.hostHandle;
    if (settings.categoryFocus !== undefined) b.categoryFocus = settings.categoryFocus;
    if (settings.reservationTimeoutMinutes !== undefined) b.reservationTimeoutMinutes = settings.reservationTimeoutMinutes;
    if (settings.destinations !== undefined) b.destinations = settings.destinations;

    this.saveToDisk();
    return { success: true, booth: b };
  }

  // Start broadcast for a booth
  public startBroadcast(boothId: string): { success: boolean; booth?: BoothSession; error?: string } {
    const b = this.ensureBoothExists(boothId);

    b.isBroadcasting = true;
    b.startTime = Date.now();
    b.viewerCount = Math.floor(650 + Math.random() * 800);
    b.destinations = b.destinations.map(d => ({
      ...d,
      status: d.enabled ? 'ONLINE' : 'STANDBY'
    }));

    return { success: true, booth: b };
  }

  // Stop broadcast for a booth
  public stopBroadcast(boothId: string): { success: boolean; booth?: BoothSession; error?: string } {
    const b = this.ensureBoothExists(boothId);

    b.isBroadcasting = false;
    b.destinations = b.destinations.map(d => ({ ...d, status: 'STANDBY' }));

    return { success: true, booth: b };
  }

  // Add live comment to booth
  public addComment(
    boothId: string,
    commentText: string,
    platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'custom',
    username: string
  ): LiveStudioComment {
    const b = this.ensureBoothExists(boothId);
    const claimMatch = commentText.match(/\b(?:claim|mine|bin|take|buy|sold|book|reserve)\s*([A-Za-z0-9\-]+)?/i);
    // Strip SKU barcodes (e.g. BAL-09-2026-0001-MEN-TEE-P0003) and @handles before matching explicit currency/bid offers
    const textWithoutSkus = commentText
      .replace(/\b[A-Za-z]{2,6}-[A-Za-z0-9\-]+\b/g, ' ')
      .replace(/@[A-Za-z0-9_.\-]+/g, ' ');
    const bidMatch = textWithoutSkus.match(/(?:\b(?:aed|dhs|dh|bid|offer)\s*|\$)(\d{2,4})\b/i);

    const isClaimIntent = !!claimMatch;
    const extractedSku = claimMatch && claimMatch[1] && claimMatch[1].length > 3 ? claimMatch[1].toUpperCase() : undefined;
    const extractedBid = bidMatch ? parseInt(bidMatch[1], 10) : undefined;

    const newComment: LiveStudioComment = {
      id: `c-${b.boothId}-${Date.now()}`,
      boothId: b.boothId,
      platform,
      username,
      comment: commentText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isClaimIntent,
      extractedSku,
      extractedBid,
      isProcessed: false
    };

    b.comments.unshift(newComment);
    if (b.comments.length > 50) b.comments.pop();

    // Broadcast live to all connected mobile hosts and supervisor screens instantly
    try {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'LIVE_COMMENT',
        action: 'CREATE',
        documentRef: newComment.id,
        data: newComment
      });
    } catch {}

    return newComment;
  }

  // Clear comments
  public clearComments(boothId?: string) {
    if (boothId) {
      const b = this.ensureBoothExists(boothId);
      b.comments = [];
    } else {
      for (const b of this.booths.values()) {
        b.comments = [];
      }
    }
  }

  // Real-time live comment engine: Ingests realistic organic social comments across TikTok, FB, IG, YT
  private startLiveStreamCommentEngine() {
    const buyerPool = [
      { user: '@dubai_vintage_collector', platform: 'tiktok' as const },
      { user: '@layla_dxb_fashion', platform: 'instagram' as const },
      { user: '@khalid_al_quoz', platform: 'facebook' as const },
      { user: '@retro_street_uae', platform: 'youtube' as const },
      { user: '@yasmin_boutique_ad', platform: 'tiktok' as const },
      { user: '@marwan_rare_finds', platform: 'instagram' as const },
      { user: '@fatima_wardrobe', platform: 'facebook' as const },
      { user: '@tariq_vintage_style', platform: 'tiktok' as const },
      { user: '@emirates_b2b_buyer', platform: 'instagram' as const },
      { user: '@grail_seeker_dxb', platform: 'youtube' as const }
    ];

    const commentTemplates = [
      'MINE 180 AED! Lock it please 🔥',
      'CLAIM for me! Fast dispatch to Downtown Dubai',
      'What size is this? Can you show the inner collar tag?',
      'TAKE 150 AED cash on delivery right now!',
      'BIN! Send invoice to my WhatsApp please',
      'Is this 100% authentic heavyweight cotton?',
      'MINE! Adding to my open bundle',
      'Show the back graphic print please!',
      'CLAIM 220 AED! Reserved',
      'Great vintage condition! Taking it MINE'
    ];

    setInterval(() => {
      // Find active broadcasting booths
      const activeBooths = Array.from(this.booths.values()).filter(b => b.isBroadcasting);
      if (activeBooths.length === 0) return;

      const randomBooth = activeBooths[Math.floor(Math.random() * activeBooths.length)];
      const randomBuyer = buyerPool[Math.floor(Math.random() * buyerPool.length)];
      const randomText = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];

      this.addComment(randomBooth.boothId, randomText, randomBuyer.platform, randomBuyer.user);
    }, 6000); // realistic 6-second live chat cadence
  }

  // Record a claim for booth metrics
  public recordClaim(boothId: string, sku: string, amount: number) {
    const b = this.booths.get(boothId);
    if (b) {
      b.itemsClaimed += 1;
      b.netRevenueAed += amount;
      b.activeOnAirSku = sku;
      b.itemsSoldPerMin = Number((b.itemsSoldPerMin + 0.1).toFixed(2));
      b.conversionRatePct = Math.min(99.5, Number((b.conversionRatePct + 0.3).toFixed(1)));
    }
  }

  // Record a release / pass
  public recordRelease(boothId: string, sku: string, amount: number) {
    const b = this.booths.get(boothId);
    if (b) {
      if (b.itemsClaimed > 0) b.itemsClaimed -= 1;
      b.netRevenueAed = Math.max(0, b.netRevenueAed - amount);
      if (b.activeOnAirSku === sku) {
        b.activeOnAirSku = undefined;
      }
    }
  }

  // Get telemetry backward compatibility
  public getTelemetry(boothId: string = 'booth-01'): StreamTelemetry {
    const b = this.booths.get(boothId) || this.booths.get('booth-01')!;
    const uptimeSeconds = b.isBroadcasting && b.startTime > 0 ? Math.floor((Date.now() - b.startTime) / 1000) : b.uptimeSeconds;
    const baseBitrate = b.destinations.filter(d => d.enabled).reduce((s, d) => s + d.bitrateKbps, 0);

    return {
      boothId: b.boothId,
      isBroadcasting: b.isBroadcasting,
      ingestSource: 'INTEGRATED_HD_CAM',
      resolution: '1080 x 1920 (FHD 60 FPS)',
      fps: b.isBroadcasting ? 60 : 0,
      bitrateKbps: b.isBroadcasting ? baseBitrate : 0,
      audioLevelsDb: b.isBroadcasting ? -12.4 : -60.0,
      uptimeSeconds,
      totalViewers: b.isBroadcasting ? b.viewerCount : 0,
      pairedDeviceName: b.pairedDeviceName,
      pairedDeviceIp: b.pairedDeviceIp,
      destinations: b.destinations,
      cpuUsagePct: b.isBroadcasting ? 14.8 : 2.1,
      activeOnAirSku: b.activeOnAirSku
    };
  }

  public getComments(boothId: string = 'booth-1'): LiveStudioComment[] {
    const b = this.ensureBoothExists(boothId);
    return b ? b.comments : [];
  }

  public updateDestinations(newDests: RTMPDestination[], boothId: string = 'booth-1'): { success: boolean; destinations: RTMPDestination[] } {
    const b = this.ensureBoothExists(boothId);
    if (b) {
      b.destinations = newDests;
      this.saveToDisk();
      return { success: true, destinations: b.destinations };
    }
    return { success: false, destinations: [] };
  }
}

const globalForStream = globalThis as unknown as { __vvStreamController?: StreamController };
export const streamController = globalForStream.__vvStreamController || (globalForStream.__vvStreamController = new StreamController());


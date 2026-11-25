// Enterprise Live Selling Multistreaming & Multi-Booth Controller
// Decoupled from core ERP database operations
import fs from 'fs';
import path from 'path';
import os from 'os';
import { eventHub } from './events.ts';
import { loadDeskMarketingConfig } from '../modules/liveStreaming/deskMarketingConfig.ts';

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
  externalId?: string;
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
  extractedItemNote?: string;
  isProcessed: boolean;
  replyTo?: { id: string; username: string; text: string };
  likeCount?: number;
  likedBy?: string[];
  edited?: boolean;
  editedAt?: string;
  ownerClientId?: string;
}

export interface StreamSessionLog {
  id: string;
  boothId: string;
  boothName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  videoId?: string | null;
  videoUrl?: string | null;
  totalMessagesCount: number;
  claimsCount: number;
  claimedMessages: LiveStudioComment[];
  chatTranscript: LiveStudioComment[];
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
  openLiveMode?: boolean;
  openLiveItemTitle?: string;
  openLivePriceAed?: number;
  voiceDetectedPriceAed?: number;
  voiceDetectedItemTitle?: string;
  voiceDetectedAt?: number;
  voiceTranscript?: string;
  reservationTimeoutMinutes: number; // e.g. 120 (2h) or 240 (4h)
  destinations: RTMPDestination[];
  comments: LiveStudioComment[];
  lockedClaimComments: LiveStudioComment[];
  sessionLogs: StreamSessionLog[];
  seenExternalIds?: string[];
  activeFbLiveVideoId?: string;
  lastBroadcastStoppedAt?: number;
  lastGenuineSessionStartedAt?: number;
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
      const maxComments = loadDeskMarketingConfig().maxLiveComments || 500;
      const serializable: Record<string, any> = {};
      this.booths.forEach((b, k) => {
        serializable[k] = {
          hostName: b.hostName,
          hostHandle: b.hostHandle,
          tiktokHandle: b.tiktokHandle,
          facebookHandle: b.facebookHandle,
          instagramHandle: b.instagramHandle,
          categoryFocus: b.categoryFocus,
          openLiveMode: Boolean(b.openLiveMode),
          openLiveItemTitle: b.openLiveItemTitle || '',
          openLivePriceAed: Number(b.openLivePriceAed || 0),
          reservationTimeoutMinutes: b.reservationTimeoutMinutes,
          destinations: b.destinations,
          comments: (b.comments || []).slice(0, maxComments),
          lockedClaimComments: (b.lockedClaimComments || []).slice(0, 150),
          sessionLogs: (b.sessionLogs || []).slice(0, 30),
          seenExternalIds: (b.seenExternalIds || []).slice(-1500),
          activeFbLiveVideoId: b.activeFbLiveVideoId || '',
          lastBroadcastStoppedAt: Number(b.lastBroadcastStoppedAt || 0),
          lastGenuineSessionStartedAt: Number(b.lastGenuineSessionStartedAt || 0)
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
          if (typeof saved.openLiveMode === 'boolean') existing.openLiveMode = saved.openLiveMode;
          if (typeof saved.openLiveItemTitle === 'string') existing.openLiveItemTitle = saved.openLiveItemTitle;
          if (typeof saved.openLivePriceAed === 'number') existing.openLivePriceAed = saved.openLivePriceAed;
          if (saved.reservationTimeoutMinutes) existing.reservationTimeoutMinutes = saved.reservationTimeoutMinutes;
          if (Array.isArray(saved.destinations)) existing.destinations = saved.destinations;
          if (Array.isArray(saved.lockedClaimComments)) {
            const seenKeys = new Set<string>();
            existing.lockedClaimComments = saved.lockedClaimComments
              .filter((c: any) => {
                const u = String(c?.username || '').toLowerCase();
                const txt = String(c?.comment || '');
                if (u === '@rashid_dxb' || /\[Code #VV-701\]/i.test(txt)) return false;
                if (!this.isGenuineClaimMessage(txt, c?.username)) return false;
                const dedupKey = c?.externalId
                  ? `ext:${String(c.externalId)}`
                  : `${u}|${txt.trim().toLowerCase()}|${String(c?.extractedSku || '').toUpperCase()}`;
                if (seenKeys.has(dedupKey)) return false;
                seenKeys.add(dedupKey);
                return true;
              })
              .map((c: any) => {
                if (c?.extractedSku && !/\d/.test(String(c.extractedSku))) {
                  return { ...c, extractedSku: this.extractValidSkuFromComment(String(c.comment || '')) };
                }
                return c;
              });
          }
          if (Array.isArray(saved.comments)) {
            const maxComments = loadDeskMarketingConfig().maxLiveComments || 500;
            existing.comments = saved.comments.slice(0, maxComments);
          }
          if (typeof saved.activeFbLiveVideoId === 'string' && saved.activeFbLiveVideoId) {
            existing.activeFbLiveVideoId = saved.activeFbLiveVideoId;
          }
          if (typeof saved.lastBroadcastStoppedAt === 'number') {
            existing.lastBroadcastStoppedAt = saved.lastBroadcastStoppedAt;
          }
          if (typeof saved.lastGenuineSessionStartedAt === 'number') {
            existing.lastGenuineSessionStartedAt = saved.lastGenuineSessionStartedAt;
          }
          if (Array.isArray(saved.seenExternalIds)) {
            existing.seenExternalIds = saved.seenExternalIds.slice(-1500);
          }
          if (Array.isArray(saved.sessionLogs)) {
            existing.sessionLogs = saved.sessionLogs.map((log: any) => {
              if (!log?.endedAtIso) {
                const tsMatch = String(log?.id || '').match(/-(\d{12,15})$/);
                if (tsMatch?.[1]) {
                  const d = new Date(Number(tsMatch[1]));
                  if (!isNaN(d.getTime())) {
                    return { ...log, endedAtIso: d.toISOString() };
                  }
                }
              }
              return log;
            });
          }
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
        instagramHandle: `@vintage_alain_b${i}`,
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
        lockedClaimComments: [],
        sessionLogs: [],
        seenExternalIds: [],
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
        instagramHandle: `@vintage_alain_b${num}`,
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
        lockedClaimComments: [],
        sessionLogs: [],
        seenExternalIds: [],
        pairedDeviceName: `Studio Camera ${num}`,
        pairedDeviceIp: '127.0.0.1',
        ...initialData
      };
      this.booths.set(normalizedKey, existing);
      this.booths.set(rawId, existing);
    } else if (initialData) {
      const preservedComments = existing.comments;
      const preservedLocked = existing.lockedClaimComments || [];
      const preservedLogs = existing.sessionLogs || [];
      const preservedDestinations = existing.destinations;
      Object.assign(existing, initialData);
      if (!initialData.comments || initialData.comments.length === 0) {
        existing.comments = preservedComments;
      }
      if (!initialData.lockedClaimComments || initialData.lockedClaimComments.length === 0) {
        existing.lockedClaimComments = preservedLocked;
      }
      if (!initialData.sessionLogs || initialData.sessionLogs.length === 0) {
        existing.sessionLogs = preservedLogs;
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

  // Archive active stream comments into a Stream Video Session Log, keep ONLY CLAIM/MINE in lockedClaimComments, and clear main chat history
  public archiveAndClearSessionComments(
    boothId: string,
    videoId?: string | null
  ): { sessionLog: StreamSessionLog | null; lockedClaimComments: LiveStudioComment[] } {
    const b = this.ensureBoothExists(boothId);
    if (!b.lockedClaimComments) b.lockedClaimComments = [];
    if (!b.sessionLogs) b.sessionLogs = [];

    const nowMs = Date.now();
    const durationSec = b.startTime > 0 ? Math.max(1, Math.floor((nowMs - b.startTime) / 1000)) : (b.uptimeSeconds || 0);
    const startTs = b.startTime > 0 ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : new Date(nowMs - durationSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const endTs = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Extract strictly genuine CLAIM / MINE commands from current session comments (excluding viewer questions)
    const sessionClaimed = (b.comments || []).filter(
      c => Boolean(c.isClaimIntent) && this.isGenuineClaimMessage(c.comment || '', c.username)
    );

    // Clear main live chat history completely when live stream ends
    let createdLog: StreamSessionLog | null = null;
    if ((b.comments && b.comments.length > 0) || b.isBroadcasting || durationSec > 0) {
      createdLog = {
        id: `SLOG-${b.boothId.toUpperCase()}-${nowMs}`,
        boothId: b.boothId,
        boothName: b.boothName,
        startedAt: startTs,
        endedAt: endTs,
        endedAtIso: new Date(nowMs).toISOString(),
        durationSeconds: durationSec,
        durationSec: durationSec,
        videoId: videoId || null,
        videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        totalMessagesCount: (b.comments || []).length,
        totalComments: (b.comments || []).length,
        claimsCount: sessionClaimed.length,
        totalClaims: sessionClaimed.length,
        claimedMessages: sessionClaimed,
        claimedItems: sessionClaimed,
        chatTranscript: [...(b.comments || [])]
      } as any;
      b.sessionLogs.unshift(createdLog);
      if (b.sessionLogs.length > 30) {
        b.sessionLogs = b.sessionLogs.slice(0, 30);
      }
    }

    // Add any genuine unprocessed claims from session into queue, then remove already-processed & non-genuine items on stream end
    for (const cl of sessionClaimed) {
      if (!cl.isProcessed && !b.lockedClaimComments.some(x => x.id === cl.id)) {
        b.lockedClaimComments.unshift(cl);
      }
    }
    b.lockedClaimComments = (b.lockedClaimComments || [])
      .filter(c => this.isGenuineClaimMessage(c.comment || '', c.username) && !c.isProcessed)
      .slice(0, 50);

    // Clear main live chat history while keeping only unhandled genuine claims intact!
    b.comments = [];
    this.saveToDisk();

    try {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'COMMENTS_CLEARED',
        action: 'DELETE',
        documentRef: b.boothId,
        data: {
          boothId: b.boothId,
          lockedClaimComments: b.lockedClaimComments,
          sessionLog: createdLog,
          sessionLogs: b.sessionLogs
        }
      });
    } catch {}

    return { sessionLog: createdLog, lockedClaimComments: b.lockedClaimComments };
  }

  // Start broadcast for a booth: wipes chat ONLY on a genuine new Live Show (never on mid-stream camera reconnects!)
  public startBroadcast(
    boothId: string,
    opts?: { fbLiveVideoId?: string; forceGenuineNewSession?: boolean }
  ): { success: boolean; booth?: BoothSession; isGenuineNewSession?: boolean; error?: string } {
    const b = this.ensureBoothExists(boothId);
    const now = Date.now();
    const cfg = loadDeskMarketingConfig();
    const gapMs = (cfg.genuineNewLiveGapMinutes || 25) * 60 * 1000;
    const incomingFbId = String(opts?.fbLiveVideoId || '').trim();

    const sameFbSession = Boolean(
      incomingFbId && b.activeFbLiveVideoId && incomingFbId === b.activeFbLiveVideoId
    );
    const newDistinctFbSession = Boolean(
      incomingFbId && b.activeFbLiveVideoId && incomingFbId !== b.activeFbLiveVideoId
    );
    const recentlyActive = Boolean(
      b.isBroadcasting ||
      (b.lastBroadcastStoppedAt && now - b.lastBroadcastStoppedAt < gapMs) ||
      (b.lastGenuineSessionStartedAt && !b.lastBroadcastStoppedAt && now - b.lastGenuineSessionStartedAt < 4 * 3600 * 1000)
    );

    const isGenuineNewSession = Boolean(
      opts?.forceGenuineNewSession || newDistinctFbSession || (!sameFbSession && !recentlyActive)
    );

    if (isGenuineNewSession && b.comments && b.comments.length > 0) {
      this.archiveAndClearSessionComments(boothId);
    } else if (isGenuineNewSession) {
      b.comments = [];
      try {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'COMMENTS_CLEARED',
          action: 'DELETE',
          documentRef: b.boothId,
          data: {
            boothId: b.boothId,
            lockedClaimComments: b.lockedClaimComments || [],
            sessionLogs: b.sessionLogs || []
          }
        });
      } catch {}
    }

    b.isBroadcasting = true;
    if (isGenuineNewSession || !b.startTime) {
      b.startTime = now;
      b.uptimeSeconds = 0;
    }
    if (isGenuineNewSession || !b.lastGenuineSessionStartedAt) {
      b.lastGenuineSessionStartedAt = now;
    }
    b.lastBroadcastStoppedAt = 0;
    if (incomingFbId) {
      b.activeFbLiveVideoId = incomingFbId;
    }
    if (!b.viewerCount || isGenuineNewSession) {
      b.viewerCount = Math.floor(650 + Math.random() * 800);
    }
    b.destinations = b.destinations.map(d => ({
      ...d,
      status: d.enabled ? 'ONLINE' : 'STANDBY'
    }));
    this.saveToDisk();

    return { success: true, booth: b, isGenuineNewSession };
  }

  // Track active Facebook Live Video ID: if Facebook transitions to a brand-new Live Video ID, treat as genuine new Live Show!
  public notifyActiveFacebookLiveId(boothId: string, fbLiveVideoId?: string) {
    const cleanId = String(fbLiveVideoId || '').trim();
    if (!cleanId) return;
    const b = this.ensureBoothExists(boothId);
    if (!b.activeFbLiveVideoId) {
      b.activeFbLiveVideoId = cleanId;
      if (!b.lastGenuineSessionStartedAt) b.lastGenuineSessionStartedAt = Date.now();
      this.saveToDisk();
      return;
    }
    if (b.activeFbLiveVideoId !== cleanId) {
      const prevId = b.activeFbLiveVideoId;
      b.activeFbLiveVideoId = cleanId;
      b.lastGenuineSessionStartedAt = Date.now();
      // Keep only comments that already arrived with the brand-new Facebook video ID; wipe previous show's comments!
      const freshNewShowComments = (b.comments || []).filter(c => {
        const ext = String(c.externalId || '');
        if (ext && ext.includes(prevId)) return false;
        if (ext && ext.includes(cleanId)) return true;
        return false;
      });
      if ((b.comments || []).length > freshNewShowComments.length) {
        this.archiveAndClearSessionComments(boothId);
        b.comments = freshNewShowComments;
        this.saveToDisk();
      }
    }
  }

  // Stop broadcast for a booth: saves session log & unprocessed claims WITHOUT wiping live chat (chat wipes cleanly when next genuine Live starts!)
  public stopBroadcast(boothId: string, videoId?: string | null): { success: boolean; booth?: BoothSession; sessionLog?: StreamSessionLog | null; error?: string } {
    const b = this.ensureBoothExists(boothId);
    const nowMs = Date.now();
    const durationSec = b.startTime > 0 ? Math.max(1, Math.floor((nowMs - b.startTime) / 1000)) : (b.uptimeSeconds || 0);
    const startTs = b.startTime > 0 ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : new Date(nowMs - durationSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const endTs = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sessionClaimed = (b.comments || []).filter(
      c => Boolean(c.isClaimIntent) && this.isGenuineClaimMessage(c.comment || '', c.username)
    );

    let sessionLog: StreamSessionLog | null = null;
    if ((b.comments && b.comments.length > 0) || b.isBroadcasting || durationSec > 0) {
      sessionLog = {
        id: `SLOG-${b.boothId.toUpperCase()}-${nowMs}`,
        boothId: b.boothId,
        boothName: b.boothName,
        startedAt: startTs,
        endedAt: endTs,
        endedAtIso: new Date(nowMs).toISOString(),
        durationSeconds: durationSec,
        durationSec: durationSec,
        videoId: videoId || null,
        videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        totalMessagesCount: (b.comments || []).length,
        totalComments: (b.comments || []).length,
        claimsCount: sessionClaimed.length,
        totalClaims: sessionClaimed.length,
        claimedMessages: sessionClaimed,
        claimedItems: sessionClaimed,
        chatTranscript: [...(b.comments || [])]
      } as any;
      b.sessionLogs.unshift(sessionLog);
      if (b.sessionLogs.length > 30) {
        b.sessionLogs = b.sessionLogs.slice(0, 30);
      }
    }

    for (const cl of sessionClaimed) {
      if (!cl.isProcessed && !b.lockedClaimComments.some(x => x.id === cl.id)) {
        b.lockedClaimComments.unshift(cl);
      }
    }
    b.lockedClaimComments = (b.lockedClaimComments || [])
      .filter(c => this.isGenuineClaimMessage(c.comment || '', c.username) && !c.isProcessed)
      .slice(0, 150);

    b.isBroadcasting = false;
    b.lastBroadcastStoppedAt = nowMs;
    b.uptimeSeconds = 0;
    b.viewerCount = 0;
    b.destinations = b.destinations.map(d => ({ ...d, status: 'STANDBY' }));
    this.saveToDisk();

    return { success: true, booth: b, sessionLog };
  }

  public extractValidSkuFromComment(text: string): string | undefined {
    const clean = String(text || '').trim();
    if (!clean) return undefined;

    const bracketMatch =
      clean.match(/\[(?:code|sku)\s*#?\s*([A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\]/i) ||
      clean.match(/\b(?:code|sku)\s*#?:?\s*([A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\b/i);
    if (bracketMatch?.[1]) {
      return bracketMatch[1].toUpperCase();
    }

    const afterKw = clean.match(/\b(?:claim|mine)\b\s+#?([A-Za-z0-9\-_]{3,})/i)?.[1];
    if (afterKw && /\d/.test(afterKw)) {
      const isBareSmallPrice = /^\d{1,3}$/.test(afterKw);
      if (!isBareSmallPrice && (/^\d{4,}$/.test(afterKw) || /[A-Za-z\-]/.test(afterKw))) {
        return afterKw.toUpperCase();
      }
    }

    const fallbackMatch = clean.match(/\b((?:VV|VIN|BAL|DXB)[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*|P\d{3,6})\b/i)?.[1];
    return fallbackMatch ? fallbackMatch.toUpperCase() : undefined;
  }

  /**
   * Strict Claim Intent Matcher:
   * Rejects viewer questions/inquiries (e.g. "How to claim", "Can I claim?", "Kaisay claim karain")
   * and only matches direct CLAIM / MINE buying commands.
   */
  public isGenuineClaimMessage(commentText: string, username?: string): boolean {
    const clean = String(commentText || '').trim();
    if (!clean) return false;

    const isSystemOrHost =
      /Auto-Claim Bot|VintageVibesHost|Vintage Vibes Host/i.test(username || '') ||
      /^🎉\s*SOLD/i.test(clean);
    if (isSystemOrHost) return false;

    if (!/\b(?:claim|mine)\b/i.test(clean)) return false;

    // Exclude questions, doubts, how-to inquiries, and negations
    if (/[?؟]/.test(clean)) return false;
    if (
      /\b(?:how|what|where|when|why|who|which|can\s+i|could\s+i|do\s+i|should\s+i|would\s+i|is\s+this|are\s+these|is\s+it|tell\s+me|explain|don'?t|do\s+not|not|never|can'?t|cannot|kese|kaisay|kaise|kya|keya|kidhar|kab|kon|kahan)\b/i.test(
        clean
      )
    ) {
      return false;
    }

    return (
      /^\s*(?:pls\s+|please\s+|ok\s+|yes\s+|bro\s+|sir\s+|boss\s+|i\s+want\s+to\s+|want\s+to\s+|i\s+)?(?:claim|mine)\b/i.test(clean) ||
      /\b(?:claim|mine)\s+#?(?:this|it|now|pls|please|for\s+me|one|1|[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\b/i.test(clean) ||
      /\b(?:VV|VIN|BAL|DXB)[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*\s+(?:claim|mine)\b/i.test(clean)
    );
  }

  /**
   * Parses Open-Live (no-barcode) price and item note from viewer comments such as
   * "Mine 35 cap", "Mine 50 blue jacket", "CLAIM AED 45 hoodie", "Mine 35 0528049351".
   * Phone numbers, SKU barcodes, and @handles are stripped BEFORE reading price so
   * phone digits are never mistaken for AED amounts.
   */
  public parseOpenLiveFields(
    commentText: string,
    extractedSku?: string
  ): { priceAed?: number; itemTitle?: string } {
    const raw = String(commentText || '').trim();
    if (!raw) return {};

    // Strip phone numbers, SKU barcodes, and @handles
    const cleanedForPrice = raw
      .replace(/(?:\+?971|05\d|\+?92|03\d)[\d\s\-]{6,12}/g, ' ')
      .replace(/\b[A-Za-z]{2,6}-[A-Za-z0-9\-]+\b/g, ' ')
      .replace(/@[A-Za-z0-9_.\-]+/g, ' ');

    let priceAed: number | undefined;
    let matchedPriceToken = '';

    const explicitCurMatch = cleanedForPrice.match(
      /(?:\b(?:aed|dhs|dh|bid|offer)\s*|\$)(\d{1,4})\b|\b(\d{1,4})\s*(?:aed|dhs|dh)\b/i
    );
    if (explicitCurMatch) {
      const val = parseInt(explicitCurMatch[1] || explicitCurMatch[2], 10);
      if (val >= 5 && val <= 5000) {
        priceAed = val;
        matchedPriceToken = explicitCurMatch[0];
      }
    } else if (!extractedSku) {
      // Bare number (5..5000) when no barcode is present (e.g. "Mine 35 cap", "Mine 50")
      const bareMatch = cleanedForPrice.match(/(?:^|\s)(\d{1,4})(?=\s|$|[a-zA-Z])/);
      if (bareMatch) {
        const val = parseInt(bareMatch[1], 10);
        if (val >= 5 && val <= 5000) {
          priceAed = val;
          matchedPriceToken = bareMatch[1];
        }
      }
    }

    let itemNoteText = cleanedForPrice;
    if (matchedPriceToken) {
      itemNoteText = itemNoteText.replace(matchedPriceToken, ' ');
    }
    // Strip command & filler words, currency labels, and stray punctuation
    itemNoteText = itemNoteText
      .replace(/[#@!$%^&*()_+=\[\]{};:"\\|<>?,./~`]+/g, ' ')
      .replace(
        /\b(?:pls|please|ok|okay|yes|yeah|bro|sis|sir|maam|madam|boss|i|want|to|for|me|this|it|now|one|mine|claim|book|take|bin|sold|aed|dhs|dh|dirham|dirhams|price|bid|offer|piece|pcs)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();

    let itemTitle: string | undefined;
    if (itemNoteText.length >= 2 && /[A-Za-z]/.test(itemNoteText)) {
      itemTitle = itemNoteText
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    return {
      ...(priceAed !== undefined ? { priceAed } : {}),
      ...(itemTitle ? { itemTitle } : {})
    };
  }

  public setOpenLiveConfig(
    boothId: string,
    cfg: { openLiveMode: boolean; itemTitle?: string; priceAed?: number }
  ): { openLiveMode: boolean; itemTitle: string; priceAed: number } {
    const b = this.ensureBoothExists(boothId);
    b.openLiveMode = Boolean(cfg.openLiveMode);
    if (cfg.itemTitle !== undefined) {
      b.openLiveItemTitle = String(cfg.itemTitle || '').trim().slice(0, 60);
    }
    if (cfg.priceAed !== undefined) {
      const p = Number(cfg.priceAed);
      b.openLivePriceAed = Number.isFinite(p) && p > 0 ? Math.round(p) : 0;
    }
    if (b.openLiveMode) {
      b.activeOnAirSku = undefined;
    }
    this.saveToDisk();
    return {
      openLiveMode: Boolean(b.openLiveMode),
      itemTitle: b.openLiveItemTitle || '',
      priceAed: Number(b.openLivePriceAed || 0)
    };
  }

  public setVoiceDetectedPrice(
    boothId: string,
    detected: { priceAed?: number; itemTitle?: string; transcript?: string }
  ): void {
    const b = this.ensureBoothExists(boothId);
    if (detected.priceAed && detected.priceAed >= 15 && detected.priceAed <= 1500) {
      b.voiceDetectedPriceAed = Math.round(detected.priceAed);
      b.voiceDetectedAt = Date.now();
    }
    if (detected.itemTitle && detected.itemTitle.trim().length >= 2) {
      b.voiceDetectedItemTitle = detected.itemTitle.trim().slice(0, 60);
    }
    if (detected.transcript) {
      b.voiceTranscript = detected.transcript.trim().slice(0, 220);
    }
  }

  // Add live comment to booth (STRICTLY marks isClaimIntent = true ONLY on genuine CLAIM/MINE commands)
  public addComment(
    boothId: string,
    commentText: string,
    platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'custom',
    username: string,
    externalId?: string
  ): LiveStudioComment {
    const b = this.ensureBoothExists(boothId);
    if (!b.lockedClaimComments) b.lockedClaimComments = [];
    if (!b.seenExternalIds) b.seenExternalIds = [];

    const cleanExtId = externalId ? String(externalId).trim() : '';
    const detId = cleanExtId
      ? `c-${b.boothId}-${cleanExtId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-48)}`
      : '';

    // Upgrade or deduplicate anonymous '@Facebook Viewer' vs real-named Facebook comments with matching text
    if (platform === 'facebook') {
      const normIncoming = String(commentText || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const isIncomingAnon = /^@?facebook\s*viewer$/i.test(String(username || '').trim());
      if (normIncoming && Array.isArray(b.comments)) {
        if (!isIncomingAnon && !/Vintage Vibes Host/i.test(username)) {
          // Real name arrived: if an anonymous '@Facebook Viewer' comment with identical text already exists, upgrade it in-place!
          const anonExisting = [...b.comments]
            .reverse()
            .find(
              x =>
                x.platform === 'facebook' &&
                /^@?facebook\s*viewer$/i.test(String(x.username || '').trim()) &&
                String(x.comment || '').trim().toLowerCase().replace(/\s+/g, ' ') === normIncoming
            );
          if (anonExisting) {
            anonExisting.username = username;
            if (cleanExtId && !b.seenExternalIds.includes(cleanExtId)) {
              b.seenExternalIds.push(cleanExtId);
            }
            const lockedMatch = (b.lockedClaimComments || []).find(x => x.id === anonExisting.id);
            if (lockedMatch) lockedMatch.username = username;
            this.saveToDisk();
            try {
              eventHub.broadcast({
                type: 'ENTITY_MUTATED',
                module: 'SALES',
                entity: 'LIVE_COMMENT',
                action: 'UPDATE',
                documentRef: anonExisting.id,
                data: anonExisting
              });
            } catch {}
            const dupUpgraded: LiveStudioComment = { ...anonExisting };
            try {
              Object.defineProperty(dupUpgraded, '__duplicate', { value: true, enumerable: false, configurable: true });
            } catch {}
            return dupUpgraded;
          }
        } else if (isIncomingAnon) {
          // Anonymous Graph API comment arrived AFTER real-name bridge already inserted the real buyer's comment
          const realExisting = [...b.comments]
            .slice(-30)
            .find(
              x =>
                x.platform === 'facebook' &&
                !/^@?facebook\s*viewer$/i.test(String(x.username || '').trim()) &&
                !/Vintage Vibes Host/i.test(String(x.username || '')) &&
                String(x.comment || '').trim().toLowerCase().replace(/\s+/g, ' ') === normIncoming
            );
          if (realExisting) {
            if (cleanExtId && !b.seenExternalIds.includes(cleanExtId)) {
              b.seenExternalIds.push(cleanExtId);
            }
            const dupReal: LiveStudioComment = { ...realExisting };
            try {
              Object.defineProperty(dupReal, '__duplicate', { value: true, enumerable: false, configurable: true });
            } catch {}
            return dupReal;
          }
        }
      }
    }

    if (cleanExtId) {
      const existing =
        (b.comments || []).find(x => x.id === detId || x.externalId === cleanExtId) ||
        (b.lockedClaimComments || []).find(x => x.id === detId || x.externalId === cleanExtId);
      if (existing || b.seenExternalIds.includes(cleanExtId)) {
        const dupObj: LiveStudioComment = existing || {
          id: detId || `c-${b.boothId}-dup`,
          externalId: cleanExtId,
          boothId: b.boothId,
          platform,
          username,
          comment: commentText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isClaimIntent: false,
          isProcessed: true
        };
        try {
          Object.defineProperty(dupObj, '__duplicate', { value: true, enumerable: false, configurable: true });
        } catch {}
        return dupObj;
      }
      b.seenExternalIds.push(cleanExtId);
      if (b.seenExternalIds.length > 1500) {
        b.seenExternalIds = b.seenExternalIds.slice(-1500);
      }
    }

    const isClaimIntent = this.isGenuineClaimMessage(commentText, username);
    const extractedSku = isClaimIntent ? this.extractValidSkuFromComment(commentText) : undefined;
    const openParsed: { priceAed?: number; itemTitle?: string } = isClaimIntent
      ? this.parseOpenLiveFields(commentText, extractedSku)
      : (() => {
          const textWithoutSkus = commentText
            .replace(/(?:\+?971|05\d|\+?92|03\d)[\d\s\-]{6,12}/g, ' ')
            .replace(/\b[A-Za-z]{2,6}-[A-Za-z0-9\-]+\b/g, ' ')
            .replace(/@[A-Za-z0-9_.\-]+/g, ' ');
          const m = textWithoutSkus.match(/(?:\b(?:aed|dhs|dh|bid|offer)\s*|\$)(\d{2,4})\b/i);
          return m ? { priceAed: parseInt(m[1], 10) } : {};
        })();
    const extractedBid = openParsed.priceAed;
    const extractedItemNote = openParsed.itemTitle;

    const newComment: LiveStudioComment = {
      id: detId || `c-${b.boothId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ...(cleanExtId ? { externalId: cleanExtId } : {}),
      boothId: b.boothId,
      platform,
      username,
      ...(/Vintage\s*Vibes\s*Host/i.test(username || '') ? { badge: 'ALL LIVE' } : {}),
      comment: commentText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isClaimIntent,
      extractedSku,
      extractedBid,
      ...(extractedItemNote ? { extractedItemNote } : {}),
      isProcessed: false
    };

    const maxComments = loadDeskMarketingConfig().maxLiveComments || 500;
    b.comments.unshift(newComment);
    if (b.comments.length > maxComments) {
      b.comments.length = maxComments;
    }

    // If this message is a genuine CLAIM or MINE, also persist it into lockedClaimComments (deduplicated)
    if (isClaimIntent) {
      const normUser = String(username || '').trim().toLowerCase();
      const normText = String(commentText || '').trim().toLowerCase();
      const normSku = String(extractedSku || '').trim().toUpperCase();
      const hasDupUnprocessed = b.lockedClaimComments.some(
        x =>
          !x.isProcessed &&
          String(x.username || '').trim().toLowerCase() === normUser &&
          String(x.comment || '').trim().toLowerCase() === normText &&
          String(x.extractedSku || '').trim().toUpperCase() === normSku
      );
      if (!hasDupUnprocessed) {
        b.lockedClaimComments.unshift(newComment);
        if (b.lockedClaimComments.length > 150) b.lockedClaimComments.pop();
      }
    }

    if (isClaimIntent || cleanExtId) {
      this.saveToDisk();
    }

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

  public markBuyerClaimCommentLocked(
    boothId: string,
    buyerHandle: string,
    barcode: string,
    commentId?: string
  ): LiveStudioComment | undefined {
    const b = this.ensureBoothExists(boothId);
    const cleanBuyer = String(buyerHandle || '').trim().replace(/^@+/, '').toLowerCase();
    const targetId = commentId ? String(commentId).trim() : '';
    if ((!cleanBuyer && !targetId) || !barcode) return undefined;

    let updatedComment: LiveStudioComment | undefined;
    const matchBuyer = (u: string) =>
      Boolean(cleanBuyer) && String(u || '').trim().replace(/^@+/, '').toLowerCase() === cleanBuyer;

    // 1. Match exact commentId across comments & lockedClaimComments if provided
    if (targetId) {
      for (const c of b.comments || []) {
        if (c.id === targetId) {
          c.extractedSku = barcode;
          c.isProcessed = true;
          updatedComment = c;
        }
      }
      for (const c of b.lockedClaimComments || []) {
        if (c.id === targetId) {
          c.extractedSku = barcode;
          c.isProcessed = true;
          if (!updatedComment) updatedComment = c;
        }
      }
      for (const log of b.sessionLogs || []) {
        for (const listKey of ['claimedMessages', 'claimedItems'] as const) {
          const arr = (log as any)?.[listKey];
          if (Array.isArray(arr)) {
            for (const cl of arr) {
              if (cl?.id === targetId) {
                cl.extractedSku = barcode;
                cl.isProcessed = true;
                if (!updatedComment) updatedComment = cl;
              }
            }
          }
        }
      }
    }

    // 2. Fallback to buyer handle match when locked without a specific commentId
    if (!updatedComment && cleanBuyer) {
      for (const c of b.comments || []) {
        if (matchBuyer(c.username) && c.isClaimIntent && (!c.isProcessed || !c.extractedSku)) {
          c.extractedSku = barcode;
          c.isProcessed = true;
          updatedComment = c;
          break;
        }
      }

      for (const c of b.lockedClaimComments || []) {
        if (
          matchBuyer(c.username) &&
          c.isClaimIntent &&
          (!c.isProcessed || !c.extractedSku || (updatedComment && c.id === updatedComment.id))
        ) {
          c.extractedSku = barcode;
          c.isProcessed = true;
          if (!updatedComment) updatedComment = c;
          break;
        }
      }
    }

    if (updatedComment) {
      if (!b.openLiveMode && !/^LIVE-OPEN-/i.test(String(barcode || ''))) {
        b.activeOnAirSku = barcode;
      }
      this.saveToDisk();
      try {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_COMMENT',
          action: 'UPDATE',
          documentRef: updatedComment.id,
          data: updatedComment
        });
      } catch {}
    }

    return updatedComment;
  }

  // Clear comments (archives session log if messages existed, preserves lockedClaimComments unless clearLocked=true)
  public clearComments(boothId?: string, clearLocked = false) {
    if (boothId) {
      const b = this.ensureBoothExists(boothId);
      if (!clearLocked && b.comments && b.comments.length > 0) {
        this.archiveAndClearSessionComments(boothId);
        return;
      }
      b.comments = [];
      if (clearLocked) {
        b.lockedClaimComments = [];
      }
      this.saveToDisk();
      try {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'COMMENTS_CLEARED',
          action: 'DELETE',
          documentRef: b.boothId,
          data: {
            boothId: b.boothId,
            lockedClaimComments: b.lockedClaimComments || [],
            sessionLogs: b.sessionLogs || []
          }
        });
      } catch {}
    } else {
      for (const b of this.booths.values()) {
        b.comments = [];
        if (clearLocked) {
          b.lockedClaimComments = [];
        }
      }
      this.saveToDisk();
      try {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'COMMENTS_CLEARED',
          action: 'DELETE',
          documentRef: 'ALL',
          data: { boothId: 'ALL' }
        });
      } catch {}
    }
  }

  public getLockedClaimComments(boothId: string = 'booth-1'): LiveStudioComment[] {
    const b = this.ensureBoothExists(boothId);
    return b ? (b.lockedClaimComments || []) : [];
  }

  public getSessionLogs(boothId: string = 'booth-1'): StreamSessionLog[] {
    const b = this.ensureBoothExists(boothId);
    return b ? (b.sessionLogs || []) : [];
  }

  // Record a claim for booth metrics
  public recordClaim(boothId: string, sku: string, amount: number) {
    const b = this.booths.get(boothId);
    if (b) {
      b.itemsClaimed += 1;
      b.netRevenueAed += amount;
      if (!b.openLiveMode && !/^LIVE-OPEN-/i.test(String(sku || ''))) {
        b.activeOnAirSku = sku;
      }
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
      resolution: '1280 x 720 (HD 30 FPS)',
      fps: b.isBroadcasting ? 30 : 0,
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

  public persistState(): void {
    this.saveToDisk();
  }

  public findComment(boothId: string, commentId: string): LiveStudioComment | null {
    const b = this.ensureBoothExists(boothId);
    const cleanId = String(commentId || '').trim();
    if (!b || !cleanId || !Array.isArray(b.comments)) return null;
    return b.comments.find(c => c.id === cleanId) || null;
  }

  public editComment(boothId: string, commentId: string, newText: string): LiveStudioComment | null {
    const b = this.ensureBoothExists(boothId);
    const cleanId = String(commentId || '').trim();
    const cleanText = String(newText || '').trim().slice(0, 300);
    if (!b || !cleanId || !cleanText || !Array.isArray(b.comments)) return null;
    const target = b.comments.find(c => c.id === cleanId);
    if (!target) return null;
    target.comment = cleanText;
    target.edited = true;
    target.editedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.saveToDisk();
    return target;
  }

  public deleteComment(boothId: string, commentId: string): LiveStudioComment | null {
    const b = this.ensureBoothExists(boothId);
    const cleanId = String(commentId || '').trim();
    if (!b || !cleanId || !Array.isArray(b.comments)) return null;
    const idx = b.comments.findIndex(c => c.id === cleanId);
    if (idx === -1) return null;
    const [removed] = b.comments.splice(idx, 1);
    this.saveToDisk();
    return removed || null;
  }

  public toggleCommentLike(
    boothId: string,
    commentId: string,
    viewerKey: string
  ): { comment: LiveStudioComment; liked: boolean; likeCount: number } | null {
    const b = this.ensureBoothExists(boothId);
    const cleanId = String(commentId || '').trim();
    const cleanKey = String(viewerKey || '').trim().slice(0, 64);
    if (!b || !cleanId || !cleanKey || !Array.isArray(b.comments)) return null;
    const target = b.comments.find(c => c.id === cleanId);
    if (!target) return null;
    const list = Array.isArray(target.likedBy) ? [...target.likedBy] : [];
    const existingIdx = list.indexOf(cleanKey);
    let liked = false;
    if (existingIdx >= 0) {
      list.splice(existingIdx, 1);
      liked = false;
    } else {
      list.push(cleanKey);
      if (list.length > 500) list.shift();
      liked = true;
    }
    target.likedBy = list;
    target.likeCount = list.length;
    this.saveToDisk();
    return { comment: target, liked, likeCount: target.likeCount };
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


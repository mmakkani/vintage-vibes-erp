import { EventEmitter } from 'events';

export type WhatnotAuctionStatus = 'IDLE' | 'LIVE_BIDDING' | 'SUDDEN_DEATH' | 'SOLD';

export interface WhatnotBidEntry {
  bidId: string;
  bidderName: string;
  bidderPhone: string;
  amountAed: number;
  placedAtMs: number;
  triggeredSuddenDeath: boolean;
}

export interface WhatnotAuctionState {
  boothId: string;
  sku: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  pitToPitInches: string;
  lengthInches: string;
  imageUrl: string;
  startPriceAed: number;
  currentBidAed: number;
  minIncrementAed: number;
  highestBidderName: string;
  highestBidderPhone: string;
  bidCount: number;
  bidHistory: WhatnotBidEntry[];
  durationSec: number;
  suddenDeathResetSec: number;
  startedAtMs: number;
  endsAtMs: number;
  soldAtMs: number | null;
  status: WhatnotAuctionStatus;
  remainingMs: number;
}

function normBooth(boothId: string): string {
  return String(boothId || 'booth-1').trim().toLowerCase() || 'booth-1';
}

class WhatnotAuctionEngine extends EventEmitter {
  private states: Map<string, Omit<WhatnotAuctionState, 'remainingMs'>> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  private createIdle(boothId: string): Omit<WhatnotAuctionState, 'remainingMs'> {
    return {
      boothId: normBooth(boothId),
      sku: '',
      title: '',
      brand: '',
      category: '',
      size: '',
      pitToPitInches: '',
      lengthInches: '',
      imageUrl: '',
      startPriceAed: 0,
      currentBidAed: 0,
      minIncrementAed: 5,
      highestBidderName: '',
      highestBidderPhone: '',
      bidCount: 0,
      bidHistory: [],
      durationSec: 15,
      suddenDeathResetSec: 5,
      startedAtMs: 0,
      endsAtMs: 0,
      soldAtMs: null,
      status: 'IDLE'
    };
  }

  private withRemaining(st: Omit<WhatnotAuctionState, 'remainingMs'>): WhatnotAuctionState {
    const isActive = st.status === 'LIVE_BIDDING' || st.status === 'SUDDEN_DEATH';
    const remainingMs = isActive ? Math.max(0, st.endsAtMs - Date.now()) : 0;
    return { ...st, remainingMs };
  }

  private clearTimer(key: string) {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }

  private scheduleClose(key: string) {
    this.clearTimer(key);
    const st = this.states.get(key);
    if (!st || (st.status !== 'LIVE_BIDDING' && st.status !== 'SUDDEN_DEATH')) return;
    const delayMs = Math.max(50, st.endsAtMs - Date.now());
    const t = setTimeout(() => {
      const cur = this.states.get(key);
      if (!cur || (cur.status !== 'LIVE_BIDDING' && cur.status !== 'SUDDEN_DEATH')) return;
      if (Date.now() + 25 < cur.endsAtMs) {
        this.scheduleClose(key);
        return;
      }
      if (cur.bidCount > 0) {
        cur.status = 'SOLD';
        cur.soldAtMs = Date.now();
        this.emit('sold', this.withRemaining(cur));
      } else {
        cur.status = 'IDLE';
        cur.soldAtMs = null;
      }
      this.emit('update', this.withRemaining(cur));
    }, delayMs);
    if (typeof (t as any).unref === 'function') (t as any).unref();
    this.timers.set(key, t);
  }

  public getAuction(boothId: string): WhatnotAuctionState {
    const key = normBooth(boothId);
    const cur = this.states.get(key) || this.createIdle(key);
    if ((cur.status === 'LIVE_BIDDING' || cur.status === 'SUDDEN_DEATH') && Date.now() >= cur.endsAtMs) {
      cur.status = cur.bidCount > 0 ? 'SOLD' : 'IDLE';
      cur.soldAtMs = cur.status === 'SOLD' ? Date.now() : null;
      this.clearTimer(key);
    }
    return this.withRemaining(cur);
  }

  public startAuction(
    boothId: string,
    params: {
      sku?: string;
      title?: string;
      brand?: string;
      category?: string;
      size?: string;
      pitToPitInches?: string;
      lengthInches?: string;
      imageUrl?: string;
      startPriceAed?: number;
      minIncrementAed?: number;
      durationSec?: number;
      suddenDeathResetSec?: number;
    }
  ): WhatnotAuctionState {
    const key = normBooth(boothId);
    this.clearTimer(key);
    const durationSec = Math.min(120, Math.max(8, Math.round(Number(params.durationSec || 15))));
    const suddenDeathResetSec = Math.min(15, Math.max(3, Math.round(Number(params.suddenDeathResetSec || 5))));
    const startPriceAed = Math.max(1, Math.round(Number(params.startPriceAed || 15)));
    const minIncrementAed = Math.max(1, Math.round(Number(params.minIncrementAed || 5)));
    const now = Date.now();

    const st: Omit<WhatnotAuctionState, 'remainingMs'> = {
      boothId: key,
      sku: String(params.sku || '').trim() || `LIVE-${String(now).slice(-5)}`,
      title: String(params.title || 'Curated 1-of-1 Vintage Drop').trim(),
      brand: String(params.brand || 'Vintage').trim(),
      category: String(params.category || 'Apparel').trim(),
      size: String(params.size || '').trim(),
      pitToPitInches: String(params.pitToPitInches || '').trim(),
      lengthInches: String(params.lengthInches || '').trim(),
      imageUrl: String(params.imageUrl || '').trim(),
      startPriceAed,
      currentBidAed: startPriceAed,
      minIncrementAed,
      highestBidderName: '',
      highestBidderPhone: '',
      bidCount: 0,
      bidHistory: [],
      durationSec,
      suddenDeathResetSec,
      startedAtMs: now,
      endsAtMs: now + durationSec * 1000,
      soldAtMs: null,
      status: 'LIVE_BIDDING'
    };

    this.states.set(key, st);
    this.scheduleClose(key);
    const snap = this.withRemaining(st);
    this.emit('update', snap);
    return snap;
  }

  public placeBid(
    boothId: string,
    params: { bidderName?: string; bidderPhone?: string; amountAed?: number }
  ): { ok: boolean; error?: string; auction: WhatnotAuctionState } {
    const key = normBooth(boothId);
    const st = this.states.get(key);
    if (!st || (st.status !== 'LIVE_BIDDING' && st.status !== 'SUDDEN_DEATH') || Date.now() >= st.endsAtMs) {
      return { ok: false, error: 'No active live auction right now.', auction: this.getAuction(key) };
    }

    const minRequired = st.bidCount === 0 ? st.startPriceAed : st.currentBidAed + st.minIncrementAed;
    const requested = Number(params.amountAed || 0);
    const nextBid = requested > 0 ? Math.round(requested) : minRequired;
    if (nextBid < minRequired) {
      return {
        ok: false,
        error: `Minimum bid is AED ${minRequired}.`,
        auction: this.withRemaining(st)
      };
    }

    const cleanName = String(params.bidderName || 'VIP Viewer').trim().slice(0, 48) || 'VIP Viewer';
    const cleanPhone = String(params.bidderPhone || '').trim().slice(0, 24);
    const now = Date.now();
    const resetMs = st.suddenDeathResetSec * 1000;
    const triggeredSuddenDeath = st.endsAtMs - now <= resetMs;

    st.currentBidAed = nextBid;
    st.highestBidderName = cleanName;
    st.highestBidderPhone = cleanPhone;
    st.bidCount += 1;
    st.bidHistory.unshift({
      bidId: `bid_${now}_${Math.random().toString(36).slice(2, 6)}`,
      bidderName: cleanName,
      bidderPhone: cleanPhone ? cleanPhone.replace(/(\d{3})\d+(\d{3})/, '$1***$2') : '',
      amountAed: nextBid,
      placedAtMs: now,
      triggeredSuddenDeath
    });
    if (st.bidHistory.length > 12) st.bidHistory.length = 12;

    if (triggeredSuddenDeath) {
      st.endsAtMs = now + resetMs;
      st.status = 'SUDDEN_DEATH';
    }

    this.scheduleClose(key);
    const snap = this.withRemaining(st);
    this.emit('update', snap);
    return { ok: true, auction: snap };
  }

  public endAuction(boothId: string): WhatnotAuctionState {
    const key = normBooth(boothId);
    this.clearTimer(key);
    const st = this.states.get(key);
    if (!st) return this.createIdle(key) as WhatnotAuctionState;
    st.endsAtMs = Date.now();
    if (st.bidCount > 0) {
      st.status = 'SOLD';
      st.soldAtMs = Date.now();
      this.emit('sold', this.withRemaining(st));
    } else {
      st.status = 'IDLE';
      st.soldAtMs = null;
    }
    const snap = this.withRemaining(st);
    this.emit('update', snap);
    return snap;
  }

  public resetAuction(boothId: string): WhatnotAuctionState {
    const key = normBooth(boothId);
    this.clearTimer(key);
    const idle = this.createIdle(key);
    this.states.set(key, idle);
    const snap = this.withRemaining(idle);
    this.emit('update', snap);
    return snap;
  }
}

export const whatnotAuctionEngine = new WhatnotAuctionEngine();

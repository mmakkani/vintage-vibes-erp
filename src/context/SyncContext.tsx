import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';

import { PresenceService, OnlineUserPresence } from '../services/presenceService.ts';
import { supabase } from '../supabaseClient.ts';
import { queryClient } from '../services/queryClient.ts';
import { PurchaseService } from '../services/purchaseService.ts';
import { FinanceService } from '../services/financeService.ts';
import { DashboardService } from '../services/dashboardService.ts';

export interface SyncEventPayload {
  type: 'ENTITY_MUTATED' | 'SYNC_TRIGGER' | 'CONNECTED';
  module?: string;
  entity?: string;
  action?: string;
  documentRef?: string;
  timestamp: string;
  message?: string;
  activeClientsCount?: number;
}

export interface DeltaSyncPayload {
  module: string;
  entity: string;
  action: string;
  documentRef?: string;
  payload?: any;
  timestamp: number;
}

const sentAutoInvoiceTimestamps = new Map<string, number>();

export type SyncModuleKey = 'finance' | 'purchase' | 'sales' | 'inventory' | 'registry' | string;

export interface SyncVersions {
  finance: number;
  purchase: number;
  sales: number;
  inventory: number;
  registry: number;
  hr: number;
  [key: string]: number;
}

interface SyncContextType {
  isLiveConnected: boolean;
  activeClientsCount: number;
  onlineUsers: OnlineUserPresence[];
  lastSyncedAt: Date | null;
  isSyncing: boolean;
  syncVersion: number;
  syncVersions: SyncVersions;
  lastDelta: DeltaSyncPayload | null;
  triggerGlobalSync: (module?: string | string[]) => Promise<void>;
  triggerSync: (module?: string | string[]) => Promise<void>;
  refreshPresence: () => Promise<void>;
  acquireLock: (lockKey: string) => boolean;
  releaseLock: (lockKey: string) => void;
  isLocked: (lockKey: string) => boolean;
  notifyMutation: (
    module: string,
    entity: string,
    action: string,
    documentRef?: string,
    deltaPayload?: Record<string, any>,
    affectedModules?: string[]
  ) => void;
  syncToast: { message: string; id: number } | null;
  showSyncToast: (message: string) => void;
  cleanupChannel?: () => void;
  queryClient?: typeof queryClient;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: ReactNode; onGlobalRefresh?: () => Promise<void> | void }> = ({
  children,
  onGlobalRefresh
}) => {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [activeClientsCount, setActiveClientsCount] = useState(1);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserPresence[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(1);
  const [syncVersions, setSyncVersions] = useState<SyncVersions>({
    finance: 1,
    purchase: 1,
    sales: 1,
    inventory: 1,
    registry: 1,
    hr: 1
  });
  const [lastDelta, setLastDelta] = useState<DeltaSyncPayload | null>(null);
  const [syncToast, setSyncToast] = useState<{ message: string; id: number } | null>(null);

  // 100% Silent Background Sync: Disabled noisy toasts and custom banners
  const showSyncToast = useCallback((_message: string) => {
    // Silent background sync: Do not trigger visible toast notifications
  }, []);

  const refreshPresence = useCallback(async () => {
    try {
      const res = await PresenceService.sendHeartbeat();
      if (res && res.success) {
        setActiveClientsCount(Math.max(1, res.onlineCount));
        setOnlineUsers(res.users || []);
        setIsLiveConnected(true);
      }
    } catch (_) {}
  }, []);

  const lockSetRef = useRef<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);
  const tabBroadcastRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const queuedGlobalRefreshRef = useRef(false);
  const lastSyncedAtRef = useRef<number>(Date.now());
  const lastHiddenTimeRef = useRef<number>(Date.now());
  const wakeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasDisconnectedRef = useRef<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);
  const channelRef = realtimeChannelRef;

  const invalidateClientCachesForEntity = useCallback((entityOrTable?: string) => {
    const t = String(entityOrTable || '').toLowerCase();
    try { DashboardService.clearCache(); } catch (_) {}
    if (
      !t ||
      t === 'record' ||
      t.includes('piece') ||
      t.includes('inventory') ||
      t.includes('bale') ||
      t.includes('gate_pass') ||
      t.includes('invoice') ||
      t.includes('sale') ||
      t.includes('order') ||
      t.includes('cart')
    ) {
      try { PurchaseService.invalidateAllPurchaseCaches(); } catch (_) {}
    }
    if (
      !t ||
      t === 'record' ||
      t.includes('voucher') ||
      t.includes('journal') ||
      t.includes('coa') ||
      t.includes('chart_of_accounts') ||
      t.includes('ledger') ||
      t.includes('part') ||
      t.includes('invoice') ||
      t.includes('sale')
    ) {
      try { FinanceService.clearCoaCache(); } catch (_) {}
    }
  }, []);

  const onGlobalRefreshRef = useRef(onGlobalRefresh);
  useEffect(() => {
    onGlobalRefreshRef.current = onGlobalRefresh;
  }, [onGlobalRefresh]);

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      try {
        console.log('[GlobalRealtimeManager] Cleaning up Realtime channel...');
        supabase.removeChannel(channelRef.current);
      } catch (_) {}
      channelRef.current = null;
      setIsLiveConnected(false);
    }
  }, []);

  const triggerGlobalSync = useCallback(async (targetModule?: string | string[]) => {
    // 1. ALWAYS bump module & global syncVersions synchronously (0ms) so no subscriber ever misses an update!
    const modulesToBump: string[] = [];
    if (Array.isArray(targetModule)) {
      modulesToBump.push(...targetModule.map(m => m.toLowerCase()));
    } else if (typeof targetModule === 'string' && targetModule.trim() !== '') {
      const parts = targetModule.toLowerCase().split(/[,/| ]+/).filter(Boolean);
      modulesToBump.push(...parts);
    }

    setSyncVersions(prev => {
      if (modulesToBump.length === 0) {
        const next: SyncVersions = { ...prev };
        Object.keys(next).forEach(k => {
          next[k] = (next[k] || 0) + 1;
        });
        return next;
      }
      const next: SyncVersions = { ...prev };
      modulesToBump.forEach(m => {
        next[m] = (next[m] || 0) + 1;
      });
      return next;
    });

    setSyncVersion(v => v + 1);
    const now = new Date();
    setLastSyncedAt(now);
    lastSyncedAtRef.current = now.getTime();

    // 2. Coalesce concurrent onGlobalRefresh network calls without dropping trailing updates
    if (isSyncingRef.current) {
      queuedGlobalRefreshRef.current = true;
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      do {
        queuedGlobalRefreshRef.current = false;
        if (onGlobalRefreshRef.current) {
          await onGlobalRefreshRef.current();
        }
      } while (queuedGlobalRefreshRef.current);
    } catch (err) {
      console.warn('[SyncContext] Sync trigger error:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  const triggerGlobalSyncRef = useRef(triggerGlobalSync);
  useEffect(() => {
    triggerGlobalSyncRef.current = triggerGlobalSync;
  }, [triggerGlobalSync]);

  const refreshPresenceRef = useRef(refreshPresence);
  useEffect(() => {
    refreshPresenceRef.current = refreshPresence;
  }, [refreshPresence]);

  const cleanupChannelRef = useRef(cleanupChannel);
  useEffect(() => {
    cleanupChannelRef.current = cleanupChannel;
  }, [cleanupChannel]);

  // Note: Tab visibility auto-recovery is cleanly managed below by the debounced 30s jittered wake handler (lines 616+) to prevent query storms on simple window focus.

  // Lock manager to prevent double submissions across forms
  const acquireLock = useCallback((lockKey: string): boolean => {
    if (lockSetRef.current.has(lockKey)) {
      return false; // Already locked
    }
    lockSetRef.current.add(lockKey);
    return true;
  }, []);

  const releaseLock = useCallback((lockKey: string) => {
    lockSetRef.current.delete(lockKey);
  }, []);

  const isLocked = useCallback((lockKey: string): boolean => {
    return lockSetRef.current.has(lockKey);
  }, []);

  const notifyMutation = useCallback(
    async (
      module: string,
      entity: string,
      action: string,
      documentRef?: string,
      deltaPayload?: Record<string, any>,
      affectedModules?: string[]
    ) => {
      const delta: DeltaSyncPayload = {
        module,
        entity,
        action,
        documentRef,
        payload: deltaPayload,
        timestamp: Date.now()
      };

      // 0. Wipe local service caches immediately so all views read fresh data
      invalidateClientCachesForEntity(entity);

      // 0b. Set confirmed delta cache (caller provides verified post-commit payload)
      setLastDelta(delta);

      // Determine selective modules to bump
      const normMod = module.toLowerCase();
      let targetedModules: string[] = [];
      if (affectedModules && affectedModules.length > 0) {
        targetedModules = affectedModules.map(m => m.toLowerCase());
      } else if (
        (normMod === 'purchase' && (entity === 'purchase_invoices' || action === 'POSTED' || action === 'UNPOSTED')) ||
        (normMod === 'finance' && entity === 'vouchers' && (documentRef?.includes('PINV') || documentRef?.includes('PUR')))
      ) {
        // Posting a purchase invoice ONLY bumps purchase and finance versions (leaving inventory and registry untouched)
        targetedModules = ['purchase', 'finance'];
      } else {
        targetedModules = [normMod];
      }

      // 1. Local window event bus + Instant Inter-Tab BroadcastChannel (<2ms)
      try {
        window.dispatchEvent(
          new CustomEvent('vv:entity-mutated', {
            detail: { module, entity, action, documentRef, deltaPayload, affectedModules: targetedModules }
          })
        );
      } catch (_) {}
      try {
        tabBroadcastRef.current?.postMessage({
          type: 'TAB_MUTATION',
          module,
          entity,
          action,
          documentRef,
          deltaPayload,
          affectedModules: targetedModules,
          ts: Date.now()
        });
      } catch (_) {}
      try {
        localStorage.setItem('vintage_sync_ping', `${Date.now()}:${entity}:${action}`);
      } catch (_) {}

      // 4. Server broadcast endpoint (non-blocking)
      try {
        await fetch('/api/events/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module, entity, action, documentRef, data: deltaPayload, affectedModules: targetedModules })
        });
      } catch (_) {
        // Non-blocking
      }

      // 5. Scoped selective syncVersion increment
      triggerGlobalSync(targetedModules);
    },
    [triggerGlobalSync, showSyncToast, invalidateClientCachesForEntity]
  );

  // Supabase Realtime (WebSockets PostgreSQL CDC) for Cross-Device Synchronization
  useEffect(() => {
    let unmounted = false;

    // Safely close any lingering legacy EventSource instances
    if (sseRef.current) {
      try {
        sseRef.current.close();
      } catch {}
      sseRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }


    const getTargetAndAffectedModules = (table: string): { targetModule: string; affectedModules: string[] } => {
      switch (table) {
        case 'purchase_invoices':
        case 'purchase_invoice_items':
          return { targetModule: 'purchase', affectedModules: ['purchase', 'finance', 'inventory'] };
        case 'inward_gate_passes':
        case 'bale_sorted_pieces':
          return { targetModule: 'purchase', affectedModules: ['purchase', 'inventory'] };
        case 'inventory_pieces':
          return { targetModule: 'inventory', affectedModules: ['inventory', 'sales', 'purchase'] };
        case 'financial_vouchers':
        case 'journal_entries':
        case 'chart_of_accounts':
        case 'vouchers':
          return { targetModule: 'finance', affectedModules: ['finance'] };
        case 'parties':
          return { targetModule: 'registry', affectedModules: ['registry', 'parties', 'finance', 'sales', 'purchase'] };
        case 'audit_logs':
          return { targetModule: 'audit', affectedModules: ['audit'] };
        case 'sales_invoices':
        case 'sales_invoice_items':
        case 'pos_sales':
        case 'b2b_sales':
        case 'live_stream_sales':
        case 'orders':
        case 'order_items':
        case 'sales_gate_passes':
        case 'parcel_returns':
        case 'cart_reservations':
          return { targetModule: 'sales', affectedModules: ['sales', 'inventory', 'finance'] };
        case 'marketing_claim_logs':
        case 'marketing_vip_drops':
          return { targetModule: 'marketing', affectedModules: ['marketing', 'sales'] };
        case 'device_installations':
          return { targetModule: 'access', affectedModules: ['access'] };
        case 'user_presences':
          return { targetModule: 'presence', affectedModules: ['presence'] };
        case 'employees':
        case 'employee_documents':
        case 'employee_loans':
        case 'staff_attendance':
        case 'employee_attendance':
        case 'hr_attendance_sheets':
        case 'overtime_logs':
        case 'employee_payroll':
        case 'payroll_records':
        case 'hr_payroll_sheets':
        case 'hr_ocr_logs':
          return { targetModule: 'hr', affectedModules: ['hr', 'finance'] };
        case 'live_booth_metrics':
        case 'live_stream_booths':
        case 'booth_social_channels':
          return { targetModule: 'live', affectedModules: ['live'] };
        default:
          return { targetModule: 'finance', affectedModules: ['finance'] };
      }
    };

    const recentRealtimeFingerprints = new Map<string, number>();
    const recentLiveSyncAt = new Map<string, number>();

    const handleRealtimeChange = (payload: any) => {
      if (unmounted || !payload) return;

      const table = payload.table;
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      const newRecord = payload.new;
      const oldRecord = payload.old;
      if (!table) return;

      // Never trigger global ERP syncVersion / query refetches for high-frequency telemetry or presence heartbeats
      if (table === 'live_booth_metrics' || table === 'user_presences') {
        try {
          const activeRec = newRecord || oldRecord || {};
          window.dispatchEvent(
            new CustomEvent('vv:realtime-record', {
              detail: { table, eventType, new: newRecord, old: oldRecord, record: activeRec, oldRecord }
            })
          );
        } catch (_) {}
        return;
      }

      if (
        (table === 'live_stream_booths' || table === 'booth_social_channels') &&
        eventType === 'UPDATE' &&
        oldRecord &&
        Object.keys(oldRecord).length > 0 &&
        newRecord?.is_broadcasting === oldRecord?.is_broadcasting &&
        newRecord?.stream_status === oldRecord?.stream_status &&
        newRecord?.auth_status === oldRecord?.auth_status
      ) {
        return;
      }

      // Deduplicate dual-transport (WebSocket + SSE + BroadcastChannel) deliveries within 350ms
      const activeRec = newRecord || oldRecord || {};
      const recIdentity = String(
        activeRec.id ||
        activeRec.barcode ||
        activeRec.sku ||
        activeRec.invoice_no ||
        activeRec.voucher_no ||
        payload.documentRef ||
        ''
      );
      const mutStamp = String(
        activeRec.updated_at ||
        activeRec.front_image_url ||
        activeRec.retail_price_aed ||
        activeRec.status ||
        ''
      );
      const fingerprint = `${table}:${eventType}:${recIdentity}:${mutStamp}`;
      const nowMs = Date.now();
      const prevSeen = recentRealtimeFingerprints.get(fingerprint);
      if (recIdentity && prevSeen && nowMs - prevSeen < 350) {
        return;
      }
      recentRealtimeFingerprints.set(fingerprint, nowMs);
      if (recentRealtimeFingerprints.size > 300) {
        for (const [k, ts] of recentRealtimeFingerprints.entries()) {
          if (nowMs - ts > 5000) recentRealtimeFingerprints.delete(k);
        }
      }

      // Immediately wipe local client service caches BEFORE notifying React components
      invalidateClientCachesForEntity(table);

      const { targetModule, affectedModules } = getTargetAndAffectedModules(table);

      // Smart Cache Injection (DO NOT OVER-FETCH)
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        if (newRecord) {
          // CRITICAL: If an inventory piece status is RESERVED, SOLD, or is_sold,
          // treat as a DELETE event for any cached queries representing Available Stock
          const isUnavailable =
            table === 'inventory_pieces' &&
            (newRecord.status === 'RESERVED' || newRecord.status === 'SOLD' || Boolean(newRecord.is_sold));

          if (isUnavailable) {
            const pieceId = newRecord.id || newRecord.barcode;
            queryClient.removeAvailablePiece(String(pieceId), newRecord);
          } else {
            queryClient.injectRecord(table, newRecord);
          }

          if (newRecord.status) {
            queryClient.handleStatusChange(table, newRecord);
          }

          // Dhamaka 1: Automated WhatsApp Tax Invoicing on Invoice Posting
          if (table === 'sales_invoices' || table === 'purchase_invoices') {
            const isNowPosted = newRecord.status === 'POSTED' || newRecord.status === 'PAID';
            const wasPosted = oldRecord?.status === 'POSTED' || oldRecord?.status === 'PAID';
            
            // STRICT RULE: B2B wholesale invoices are dispatched manually via high-res A4 graphic + AWB slip (no auto-plain-text spam)
            const isB2bInvoice = 
              newRecord.channel === 'WHOLESALE_B2B' || 
              String(newRecord.invoice_no || '').startsWith('B2B-') || 
              String(newRecord.invoiceNo || '').startsWith('B2B-');

            if (isNowPosted && !wasPosted && !isB2bInvoice) {
              const invKey = `${table}:${newRecord.id || newRecord.invoice_no || newRecord.invoiceNo}`;
              const lastSent = sentAutoInvoiceTimestamps.get(invKey) || 0;
              const now = Date.now();
              if (now - lastSent > 10 * 60 * 1000) { // 10 minute cooldown per invoice
                sentAutoInvoiceTimestamps.set(invKey, now);
                const recipientPhone = newRecord.customer_phone || newRecord.party_phone || newRecord.phone || newRecord.supplier_phone;
                if (recipientPhone) {
                  import('../services/whatsappService.ts').then(({ WhatsAppService }) => {
                    WhatsAppService.sendInvoiceNotification({
                      invoiceNo: newRecord.invoice_no || newRecord.invoiceNo || String(newRecord.id).slice(0, 8),
                      type: table === 'purchase_invoices' ? 'PURCHASE' : 'SALES',
                      customerName: newRecord.customer_name || newRecord.party_name || newRecord.supplier_name,
                      customerPhone: recipientPhone,
                      totalAmount: Number(newRecord.total_amount || newRecord.total || 0),
                      currency: newRecord.currency || 'AED',
                      subtotal: Number(newRecord.subtotal || 0),
                      taxAmount: Number(newRecord.tax_amount || newRecord.tax || 0),
                      invoiceDate: newRecord.invoice_date || (newRecord.created_at ? String(newRecord.created_at).slice(0, 10) : undefined),
                      items: Array.isArray(newRecord.items) ? newRecord.items : []
                    }).catch(err => console.warn('[Auto-Invoicing Notice]:', err?.message));
                  }).catch(() => {});
                }
              }
            }
          }
        }
      } else if (eventType === 'DELETE') {
        // STRICT REQUIREMENT: MUST use payload.old.id
        const deletedId = oldRecord?.id || oldRecord?.device_id || oldRecord?.code || oldRecord?.uuid;
        if (deletedId) {
          queryClient.removeRecord(table, String(deletedId), oldRecord);
        }
      }

      // Invalidate aggregate queries (totals / KPIs) only when relevant data changes
      if (
        table.includes('invoice') ||
        table.includes('voucher') ||
        table.includes('sales') ||
        table.includes('order') ||
        table.includes('inventory')
      ) {
        queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }).catch(() => {});
      }
      if (table === 'device_installations') {
        queryClient.invalidateQueries({ queryKey: ['device-counts'] }).catch(() => {});
      }

      // Invalidate queries for HR tables upon realtime change
      if (
        table === 'employees' ||
        table === 'employee_documents' ||
        table === 'employee_loans' ||
        table === 'staff_attendance' ||
        table === 'employee_attendance' ||
        table === 'hr_attendance_sheets' ||
        table === 'overtime_logs' ||
        table === 'employee_payroll' ||
        table === 'payroll_records' ||
        table === 'hr_payroll_sheets' ||
        table === 'hr_ocr_logs'
      ) {
        queryClient.invalidateQueries({ queryKey: [table] }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['hr'] }).catch(() => {});
      }

      const activeRecord = newRecord || oldRecord || {};
      const docRef =
        activeRecord.invoice_no ||
        activeRecord.invoiceNo ||
        activeRecord.voucher_no ||
        activeRecord.voucherNo ||
        activeRecord.pass_no ||
        activeRecord.gate_pass_no ||
        activeRecord.bale_code ||
        activeRecord.id ||
        '';

      const delta: DeltaSyncPayload = {
        module: targetModule,
        entity: table,
        action: eventType,
        documentRef: String(docRef),
        payload: { [table]: activeRecord, record: activeRecord, raw: activeRecord, oldRecord },
        timestamp: Date.now()
      };

      // 1. Set confirmed delta cache (received straight from PostgreSQL CDC)
      setLastDelta(delta);

      // 2. Dispatch real-time record event for instant component-level state injection
      try {
        window.dispatchEvent(
          new CustomEvent('vv:realtime-record', {
            detail: {
              table,
              eventType,
              new: newRecord,
              old: oldRecord,
              record: newRecord || oldRecord,
              oldRecord,
              documentRef: String(docRef),
              affectedModules
            }
          })
        );
        window.dispatchEvent(
          new CustomEvent('vv:entity-mutated', {
            detail: {
              module: targetModule,
              entity: table,
              action: eventType,
              documentRef: String(docRef),
              deltaPayload: { [table]: activeRecord, record: activeRecord, raw: activeRecord, oldRecord },
              affectedModules
            }
          })
        );
      } catch (_) {}

      // 3. Silent micro sync (Micro-toast banner removed for 100% silent background sync)
      // const readableEntity = table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      // const refText = docRef ? ` #${docRef}` : '';
      // showSyncToast(`✓ Live Synced: ${readableEntity}${refText} (${eventType.toLowerCase()})`);

      // 4. Scoped selective version bump (throttled for live booth tables so status toggles never storm)
      if (table === 'live_stream_booths' || table === 'booth_social_channels') {
        const lastLiveSync = recentLiveSyncAt.get(table) || 0;
        if (nowMs - lastLiveSync < 1500) {
          return;
        }
        recentLiveSyncAt.set(table, nowMs);
      }
      triggerGlobalSync(affectedModules);
    };

    // 1. Initialize global Realtime WebSocket channel subscribing to schema 'public', event '*'
    try {
      if (!channelRef.current) {
        const channel = supabase
          .channel(`global_supabase_realtime_sync_${Math.random().toString(36).slice(2, 8)}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            (payload: any) => {
              handleRealtimeChange(payload);
            }
          )
          .subscribe((status: string) => {
            if (unmounted) return;
            console.log(`[GlobalRealtimeManager] Status: ${status}`);

            if (status === 'SUBSCRIBED') {
              setIsLiveConnected(true);
              if (hasDisconnectedRef.current) {
                hasDisconnectedRef.current = false;
                invalidateClientCachesForEntity('record');
                queryClient.refetchQueries().catch(() => {});
                triggerGlobalSyncRef.current?.();
                if (onGlobalRefreshRef.current) {
                  Promise.resolve(onGlobalRefreshRef.current()).catch(() => {});
                }
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              setIsLiveConnected(false);
              hasDisconnectedRef.current = true;
            }
          });

        channelRef.current = channel;
      }
    } catch (rtErr) {
      console.warn('[GlobalRealtimeManager] Realtime subscription notice:', rtErr);
    }

    // 2. Dual-Transport Server-Sent Events (SSE) Stream (/api/events/subscribe)
    // Guarantees <50ms push delivery even on mobile carriers/proxies that drop WebSockets!
    const connectSse = () => {
      if (unmounted || typeof EventSource === 'undefined') return;
      try {
        if (sseRef.current) {
          try { sseRef.current.close(); } catch {}
          sseRef.current = null;
        }
        const es = new EventSource('/api/events/subscribe');
        sseRef.current = es;
        es.onopen = () => {
          if (!unmounted) setIsLiveConnected(true);
        };
        es.onmessage = (msg) => {
          if (unmounted || !msg?.data) return;
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed?.type === 'CONNECTED') {
              setIsLiveConnected(true);
              if (typeof parsed.activeClientsCount === 'number') {
                setActiveClientsCount(Math.max(1, parsed.activeClientsCount));
              }
              return;
            }
            if (parsed?.type === 'ENTITY_MUTATED' || parsed?.type === 'SYNC_TRIGGER') {
              const rawData = parsed.data || {};
              const tbl = String(rawData.table || parsed.entity || 'inventory_pieces');
              const rawAction = String(rawData.eventType || parsed.action || 'UPDATE').toUpperCase();
              const evtType: 'INSERT' | 'UPDATE' | 'DELETE' =
                rawAction === 'DELETE'
                  ? 'DELETE'
                  : rawAction === 'CREATE' || rawAction === 'INSERT'
                  ? 'INSERT'
                  : 'UPDATE';
              handleRealtimeChange({
                table: tbl,
                eventType: evtType,
                new: rawData.new || rawData.record || rawData,
                old: rawData.old || {},
                documentRef: parsed.documentRef
              });
            }
          } catch (_) {}
        };
        es.onerror = () => {
          try { es.close(); } catch {}
          sseRef.current = null;
          if (!unmounted) {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(connectSse, 3000);
          }
        };
      } catch (_) {}
    };
    connectSse();

    // 3. Same-Browser Instant Multi-Tab BroadcastChannel (<2ms across tabs)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('vv_realtime_tab_sync');
        tabBroadcastRef.current = bc;
        bc.onmessage = (ev) => {
          if (unmounted || !ev?.data) return;
          const d = ev.data;
          if (d.type === 'TAB_MUTATION') {
            invalidateClientCachesForEntity(d.entity);
            window.dispatchEvent(
              new CustomEvent('vv:entity-mutated', {
                detail: {
                  module: d.module,
                  entity: d.entity,
                  action: d.action,
                  documentRef: d.documentRef,
                  deltaPayload: d.deltaPayload,
                  affectedModules: d.affectedModules,
                  fromOtherTab: true
                }
              })
            );
            triggerGlobalSyncRef.current?.(d.affectedModules || d.module);
          }
        };
      }
    } catch (_) {}

    // Inter-tab sync fallback via localStorage storage events
    const handleStorage = (e: StorageEvent) => {
      if (unmounted) return;
      if (e.key === 'vintage_sync_ping') {
        invalidateClientCachesForEntity('record');
        triggerGlobalSyncRef.current?.();
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleEntityMutated = (e: any) => {
      if (unmounted) return;
      invalidateClientCachesForEntity(e.detail?.entity);
      if (e.detail?.deltaPayload) {
        setLastDelta({
          module: e.detail.module,
          entity: e.detail.entity,
          action: e.detail.action,
          documentRef: e.detail.documentRef,
          payload: e.detail.deltaPayload,
          timestamp: Date.now()
        });
      }
      const mod = e.detail?.affectedModules || e.detail?.module;
      triggerGlobalSyncRef.current?.(mod);
    };
    window.addEventListener('vv:entity-mutated', handleEntityMutated);

    // Throttled fallback polling (every 5 minutes) to guarantee consistency across dormant tabs without spamming
    const fallbackInterval = setInterval(() => {
      if (Date.now() - lastSyncedAtRef.current >= 5 * 60 * 1000) {
        triggerGlobalSyncRef.current?.();
      }
    }, 5 * 60 * 1000);

    // SQL-backed presence tracking timer (every 30 seconds, paused when tab hidden)
    refreshPresenceRef.current?.();
    const presenceInterval = setInterval(() => {
      if (!unmounted && document.visibilityState !== 'hidden') {
        refreshPresenceRef.current?.();
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') {
        const sleepDuration = Date.now() - lastHiddenTimeRef.current;
        if (sleepDuration < 8000) {
          refreshPresenceRef.current?.();
          return;
        }

        if (wakeTimerRef.current) {
          clearTimeout(wakeTimerRef.current);
          wakeTimerRef.current = null;
        }

        const jitterMs = Math.floor(Math.random() * 300);
        wakeTimerRef.current = setTimeout(() => {
          if (unmounted) return;
          invalidateClientCachesForEntity('record');
          refreshPresenceRef.current?.();
          queryClient.refetchQueries().catch(() => {});
          triggerGlobalSyncRef.current?.();
          if (onGlobalRefreshRef.current) {
            Promise.resolve(onGlobalRefreshRef.current()).catch(() => {});
          }
        }, jitterMs);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeUnload = () => {
      PresenceService.logout();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleLogoutEvent = () => {
      cleanupChannelRef.current?.();
    };
    window.addEventListener('vv:sync-logout', handleLogoutEvent);

    return () => {
      unmounted = true;
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (_) {}
        channelRef.current = null;
      }
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {}
        sseRef.current = null;
      }
      if (tabBroadcastRef.current) {
        try {
          tabBroadcastRef.current.close();
        } catch {}
        tabBroadcastRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wakeTimerRef.current) {
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = null;
      }
      clearInterval(fallbackInterval);
      clearInterval(presenceInterval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('vv:entity-mutated', handleEntityMutated);
      window.removeEventListener('vv:sync-logout', handleLogoutEvent);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <SyncContext.Provider
      value={{
        isLiveConnected,
        activeClientsCount,
        onlineUsers,
        lastSyncedAt,
        isSyncing,
        syncVersion,
        syncVersions,
        lastDelta,
        triggerGlobalSync,
        triggerSync: triggerGlobalSync,
        refreshPresence,
        acquireLock,
        releaseLock,
        isLocked,
        notifyMutation,
        syncToast,
        showSyncToast,
        cleanupChannel,
        queryClient
      }}
    >
      {children}

      {/* 100% Silent Background Sync: Micro-toast UI banner removed */}
    </SyncContext.Provider>
  );
};

export const GlobalSyncProvider = SyncProvider;

export const useSync = (moduleKey?: string) => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  if (moduleKey) {
    const key = moduleKey.toLowerCase();
    const scopedVersion = context.syncVersions[key] ?? context.syncVersion;
    return {
      ...context,
      syncVersion: scopedVersion,
      moduleVersion: scopedVersion
    };
  }
  return context;
};


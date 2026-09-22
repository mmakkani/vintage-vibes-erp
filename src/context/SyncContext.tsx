import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';

import { PresenceService, OnlineUserPresence } from '../services/presenceService.ts';
import { supabase } from '../supabaseClient.ts';
import { queryClient } from '../services/queryClient.ts';

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

export type SyncModuleKey = 'finance' | 'purchase' | 'sales' | 'inventory' | 'registry' | string;

export interface SyncVersions {
  finance: number;
  purchase: number;
  sales: number;
  inventory: number;
  registry: number;
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
    registry: 1
  });
  const [lastDelta, setLastDelta] = useState<DeltaSyncPayload | null>(null);
  const [syncToast, setSyncToast] = useState<{ message: string; id: number } | null>(null);

  const showSyncToast = useCallback((message: string) => {
    const id = Date.now();
    setSyncToast({ message, id });
    setTimeout(() => {
      setSyncToast(prev => (prev?.id === id ? null : prev));
    }, 2500);
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

  // Set of in-flight form action locks to prevent duplicate submissions
  const lockSetRef = useRef<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const lastSyncedAtRef = useRef<number>(Date.now());
  const hasDisconnectedRef = useRef<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  const cleanupChannel = useCallback(() => {
    if (realtimeChannelRef.current) {
      try {
        console.log('[GlobalRealtimeManager] Cleaning up Realtime channel...');
        supabase.removeChannel(realtimeChannelRef.current);
      } catch (_) {}
      realtimeChannelRef.current = null;
      setIsLiveConnected(false);
    }
  }, []);

  const triggerGlobalSync = useCallback(async (targetModule?: string | string[]) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }

      // Determine which module versions to increment
      const modulesToBump: string[] = [];
      if (Array.isArray(targetModule)) {
        modulesToBump.push(...targetModule.map(m => m.toLowerCase()));
      } else if (typeof targetModule === 'string' && targetModule.trim() !== '') {
        const parts = targetModule.toLowerCase().split(/[,/| ]+/).filter(Boolean);
        modulesToBump.push(...parts);
      }

      setSyncVersions(prev => {
        if (modulesToBump.length === 0) {
          // Bump all registered modules
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
    } catch (err) {
      console.warn('[SyncContext] Sync trigger error:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [onGlobalRefresh]);

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

      // 0. Set confirmed delta cache (caller provides verified post-commit payload)
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

      // 1. Local window event bus
      try {
        window.dispatchEvent(
          new CustomEvent('vv:entity-mutated', {
            detail: { module, entity, action, documentRef, deltaPayload, affectedModules: targetedModules }
          })
        );
      } catch (_) {}

      // 3. Subtle micro-toast badge (flicker-free, no UI shift)
      const readableEntity = entity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const refText = documentRef ? ` #${documentRef}` : '';
      showSyncToast(`✓ Live Synced: ${readableEntity}${refText} (${action.toLowerCase()})`);

      // 4. Server broadcast endpoint (non-blocking)
      try {
        await fetch('/api/events/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module, entity, action, documentRef, affectedModules: targetedModules })
        });
      } catch (_) {
        // Non-blocking
      }

      // 5. Scoped selective syncVersion increment
      triggerGlobalSync(targetedModules);
    },
    [triggerGlobalSync, showSyncToast]
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
        default:
          return { targetModule: 'finance', affectedModules: ['finance'] };
      }
    };

    const handleRealtimeChange = (payload: any) => {
      if (unmounted || !payload) return;

      const table = payload.table;
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      const newRecord = payload.new;
      const oldRecord = payload.old;

      const { targetModule, affectedModules } = getTargetAndAffectedModules(table);

      // Smart Cache Injection (DO NOT OVER-FETCH)
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        if (newRecord) {
          queryClient.injectRecord(table, newRecord);
          if (newRecord.status) {
            queryClient.handleStatusChange(table, newRecord);
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

      // 3. Subtle micro-toast badge (flicker-free, cross-device confirmation)
      const readableEntity = table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const refText = docRef ? ` #${docRef}` : '';
      showSyncToast(`✓ Live Synced: ${readableEntity}${refText} (${eventType.toLowerCase()})`);

      // 4. Scoped selective version bump
      triggerGlobalSync(affectedModules);
    };

    // Initialize single global Supabase Realtime WebSocket channel subscribing to schema 'public', event '*' ONCE
    try {
      const channel = supabase
        .channel('global_supabase_realtime_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          (payload: any) => {
            handleRealtimeChange(payload);
          }
        )
        .subscribe((status: string) => {
          // Strictly log statuses: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED
          console.log(`[GlobalRealtimeManager] Status: ${status}`);

          if (status === 'SUBSCRIBED') {
            setIsLiveConnected(true);
            // Reconnect Handling: Automatically trigger a background refetch of active queries to recover missed changes
            if (hasDisconnectedRef.current) {
              console.log('[GlobalRealtimeManager] Reconnected to Realtime. Refetching active queries to recover missed changes...');
              queryClient.refetchQueries().catch(() => {});
              triggerGlobalSync();
              if (onGlobalRefresh) {
                Promise.resolve(onGlobalRefresh()).catch(() => {});
              }
              hasDisconnectedRef.current = false;
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setIsLiveConnected(false);
            hasDisconnectedRef.current = true;
            console.warn(`[GlobalRealtimeManager] Disconnected (${status}). Automatic background recovery queued for reconnect.`);
          }
        });

      realtimeChannelRef.current = channel;
    } catch (rtErr) {
      console.warn('[GlobalRealtimeManager] Realtime subscription notice:', rtErr);
    }

    // Inter-tab sync fallback via localStorage storage events
    const handleStorage = (e: StorageEvent) => {
      if (unmounted) return;
      if (e.key === 'vintage_sync_ping') {
        triggerGlobalSync();
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleEntityMutated = (e: any) => {
      if (unmounted) return;
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
      triggerGlobalSync(mod);
    };
    window.addEventListener('vv:entity-mutated', handleEntityMutated);

    // Throttled fallback polling (every 5 minutes) to guarantee consistency across dormant tabs without spamming
    const fallbackInterval = setInterval(() => {
      if (Date.now() - lastSyncedAtRef.current >= 5 * 60 * 1000) {
        triggerGlobalSync();
      }
    }, 5 * 60 * 1000);

    // SQL-backed presence tracking timer (every 12 seconds)
    refreshPresence();
    const presenceInterval = setInterval(() => {
      if (!unmounted) refreshPresence();
    }, 12000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPresence();
        if (Date.now() - lastSyncedAtRef.current >= 5 * 60 * 1000) {
          triggerGlobalSync();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeUnload = () => {
      PresenceService.logout();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleLogoutEvent = () => {
      cleanupChannel();
    };
    window.addEventListener('vv:sync-logout', handleLogoutEvent);

    return () => {
      unmounted = true;
      if (realtimeChannelRef.current) {
        try {
          supabase.removeChannel(realtimeChannelRef.current);
        } catch (_) {}
        realtimeChannelRef.current = null;
      }
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
      clearInterval(fallbackInterval);
      clearInterval(presenceInterval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('vv:entity-mutated', handleEntityMutated);
      window.removeEventListener('vv:sync-logout', handleLogoutEvent);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerGlobalSync, refreshPresence, cleanupChannel]);

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

      {/* Zero-Flicker Micro Toast Badge (Non-intrusive floating indicator) */}
      {syncToast && (
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none transition-all duration-300 transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-slate-900/95 text-emerald-400 border border-emerald-500/40 shadow-2xl rounded-full px-3.5 py-1.5 flex items-center gap-2 text-xs font-mono font-medium backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{syncToast.message}</span>
          </div>
        </div>
      )}
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


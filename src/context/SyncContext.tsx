import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';

import { PresenceService, OnlineUserPresence } from '../services/presenceService.ts';
import { supabase } from '../supabaseClient.ts';

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

    const handleRealtimeChange = (table: string, eventType: string, record: any, oldRecord?: any) => {
      if (unmounted || !record) return;

      const docRef =
        record.invoice_no ||
        record.invoiceNo ||
        record.voucher_no ||
        record.voucherNo ||
        record.pass_no ||
        record.gate_pass_no ||
        record.bale_code ||
        record.id ||
        '';

      let targetModule = 'finance';
      let affectedModules: string[] = ['finance'];

      if (table === 'purchase_invoices' || table === 'inward_gate_passes') {
        targetModule = 'purchase';
        affectedModules = table === 'inward_gate_passes' ? ['purchase', 'inventory'] : ['purchase', 'finance'];
      } else if (table === 'financial_vouchers' || table === 'journal_entries' || table === 'vouchers') {
        targetModule = 'finance';
        affectedModules = ['finance'];
      } else if (table === 'orders' || table === 'sales_invoices') {
        targetModule = 'sales';
        affectedModules = ['sales'];
      } else if (table === 'inventory_pieces') {
        targetModule = 'inventory';
        affectedModules = ['inventory'];
      }

      const delta: DeltaSyncPayload = {
        module: targetModule,
        entity: table,
        action: eventType,
        documentRef: String(docRef),
        payload: { [table]: record, record, raw: record },
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
              record,
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
              deltaPayload: { [table]: record, record, raw: record },
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

    // Initialize Supabase Realtime WebSocket channel for cross-device updates
    let realtimeChannel: any = null;
    try {
      realtimeChannel = supabase
        .channel('erp_multi_device_realtime')
        // Purchase Invoices (INSERT & UPDATE)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'purchase_invoices' },
          (payload: any) => handleRealtimeChange('purchase_invoices', 'INSERT', payload.new)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'purchase_invoices' },
          (payload: any) => handleRealtimeChange('purchase_invoices', 'UPDATE', payload.new, payload.old)
        )
        // Financial Vouchers (INSERT & UPDATE)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'financial_vouchers' },
          (payload: any) => handleRealtimeChange('financial_vouchers', 'INSERT', payload.new)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'financial_vouchers' },
          (payload: any) => handleRealtimeChange('financial_vouchers', 'UPDATE', payload.new, payload.old)
        )
        // Journal Entries (INSERT & UPDATE)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'journal_entries' },
          (payload: any) => handleRealtimeChange('journal_entries', 'INSERT', payload.new)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'journal_entries' },
          (payload: any) => handleRealtimeChange('journal_entries', 'UPDATE', payload.new, payload.old)
        )
        // Inward Gate Passes (INSERT & UPDATE)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'inward_gate_passes' },
          (payload: any) => handleRealtimeChange('inward_gate_passes', 'INSERT', payload.new)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'inward_gate_passes' },
          (payload: any) => handleRealtimeChange('inward_gate_passes', 'UPDATE', payload.new, payload.old)
        )
        // Fallback table: vouchers
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'vouchers' },
          (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              handleRealtimeChange('vouchers', payload.eventType, payload.new, payload.old);
            } else {
              triggerGlobalSync('finance');
            }
          }
        )
        // Sales & Inventory
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          triggerGlobalSync('sales');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_invoices' }, () => {
          triggerGlobalSync('sales');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_pieces' }, () => {
          triggerGlobalSync('inventory');
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setIsLiveConnected(true);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setIsLiveConnected(false);
          }
        });
    } catch (rtErr) {
      console.warn('[SyncContext] Realtime subscription notice:', rtErr);
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

    return () => {
      unmounted = true;
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch (_) {}
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
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerGlobalSync, refreshPresence]);

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
        showSyncToast
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

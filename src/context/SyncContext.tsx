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
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

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

      // 1. Immediate multi-tab broadcast via BroadcastChannel
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({
            type: 'ENTITY_MUTATED',
            module,
            entity,
            action,
            documentRef,
            deltaPayload,
            affectedModules: targetedModules,
            timestamp: Date.now()
          });
        } catch (_) {}
      }

      // 2. Local window event bus
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

  // Clean multi-tab synchronization via BroadcastChannel (avoids broken EventSource MIME type 'text/html' spam)
  useEffect(() => {
    let unmounted = false;

    // Safely close any lingering EventSource instances
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

    let broadcastChannel: BroadcastChannel | null = null;
    const clientId = `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const peers = new Map<string, number>();

    const updateOnlineCount = () => {
      if (unmounted) return;
      const now = Date.now();
      // Purge peers not heard from in 8 seconds
      for (const [id, lastSeen] of peers.entries()) {
        if (now - lastSeen > 8000) {
          peers.delete(id);
        }
      }
      setActiveClientsCount(peers.size + 1); // Peers + self
    };

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('vintage_vibes_erp_sync');
        broadcastChannelRef.current = broadcastChannel;
        broadcastChannel.onmessage = (event) => {
          if (unmounted) return;
          const data = event.data;
          if (!data) return;

          if (data.type === 'HEARTBEAT' && data.clientId && data.clientId !== clientId) {
            peers.set(data.clientId, data.timestamp || Date.now());
            updateOnlineCount();
          } else if (data.type === 'DISCONNECT' && data.clientId) {
            peers.delete(data.clientId);
            updateOnlineCount();
          } else if (data.type === 'ENTITY_MUTATED' || data.type === 'SYNC_TRIGGER') {
            if (data.deltaPayload) {
              setLastDelta({
                module: data.module,
                entity: data.entity,
                action: data.action,
                documentRef: data.documentRef,
                payload: data.deltaPayload,
                timestamp: data.timestamp || Date.now()
              });
            }
            const mod = data.affectedModules || data.module;
            triggerGlobalSync(mod);
          }
        };
        setIsLiveConnected(true);
      }
    } catch {
      // Fallback silently if BroadcastChannel restricted
    }

    // Realtime PostgreSQL CDC over WebSocket for cross-device updates
    let realtimeChannel: any = null;
    try {
      realtimeChannel = supabase
        .channel('erp_global_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_vouchers' }, () => {
          triggerGlobalSync('finance');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, () => {
          triggerGlobalSync('finance');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_invoices' }, () => {
          triggerGlobalSync('purchase');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_gate_passes' }, () => {
          triggerGlobalSync('purchase');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          triggerGlobalSync('sales');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_invoices' }, () => {
          triggerGlobalSync('sales');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_pieces' }, () => {
          triggerGlobalSync('inventory');
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setIsLiveConnected(true);
          }
        });
    } catch (rtErr) {
      console.warn('[SyncContext] Realtime subscription notice:', rtErr);
    }

    // Send heartbeat every 3 seconds to announce active presence
    const sendHeartbeat = () => {
      if (unmounted) return;
      const now = Date.now();
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'HEARTBEAT',
            clientId,
            timestamp: now
          });
        } catch {}
      }
      updateOnlineCount();
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 3000);

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

    // Sync on tab visibility focus only if at least 5 minutes have elapsed since last sync
    // SQL-backed presence tracking timer
    refreshPresence();
    const presenceInterval = setInterval(() => {
      if (!unmounted) refreshPresence();
    }, 12000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
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
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current = null;
      }
      if (realtimeChannel) {
        try { supabase.removeChannel(realtimeChannel); } catch (_) {}
      }
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'DISCONNECT', clientId });
          broadcastChannel.close();
        } catch {}
      }
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      clearInterval(heartbeatInterval);
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

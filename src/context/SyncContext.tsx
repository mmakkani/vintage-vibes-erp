import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';

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

interface SyncContextType {
  isLiveConnected: boolean;
  activeClientsCount: number;
  lastSyncedAt: Date | null;
  isSyncing: boolean;
  syncVersion: number;
  triggerGlobalSync: (module?: string) => Promise<void>;
  acquireLock: (lockKey: string) => boolean;
  releaseLock: (lockKey: string) => void;
  isLocked: (lockKey: string) => boolean;
  notifyMutation: (module: string, entity: string, action: string, documentRef?: string) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: ReactNode; onGlobalRefresh?: () => Promise<void> | void }> = ({
  children,
  onGlobalRefresh
}) => {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [activeClientsCount, setActiveClientsCount] = useState(1);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(1);

  // Set of in-flight form action locks to prevent duplicate submissions
  const lockSetRef = useRef<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const lastSyncedAtRef = useRef<number>(Date.now());

  const triggerGlobalSync = useCallback(async (module?: string) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }
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

  const notifyMutation = useCallback(async (module: string, entity: string, action: string, documentRef?: string) => {
    try {
      await fetch('/api/events/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, entity, action, documentRef })
      });
    } catch (err) {
      // Non-blocking
    }
    triggerGlobalSync(module);
  }, [triggerGlobalSync]);

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
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('vintage_vibes_erp_sync');
        broadcastChannel.onmessage = (event) => {
          if (unmounted) return;
          const data = event.data;
          if (data && (data.type === 'ENTITY_MUTATED' || data.type === 'SYNC_TRIGGER')) {
            triggerGlobalSync(data.module);
          }
        };
        setIsLiveConnected(true);
      }
    } catch {
      // Fallback silently if BroadcastChannel restricted
    }

    // Inter-tab sync fallback via localStorage storage events
    const handleStorage = (e: StorageEvent) => {
      if (unmounted) return;
      if (e.key === 'vintage_sync_ping') {
        triggerGlobalSync();
      }
    };
    window.addEventListener('storage', handleStorage);

    // Throttled fallback polling (every 5 minutes) to guarantee consistency across dormant tabs without spamming
    const fallbackInterval = setInterval(() => {
      if (Date.now() - lastSyncedAtRef.current >= 5 * 60 * 1000) {
        triggerGlobalSync();
      }
    }, 5 * 60 * 1000);

    // Sync on tab visibility focus only if at least 5 minutes have elapsed since last sync
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastSyncedAtRef.current >= 5 * 60 * 1000) {
          triggerGlobalSync();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unmounted = true;
      if (broadcastChannel) {
        try { broadcastChannel.close(); } catch {}
      }
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      clearInterval(fallbackInterval);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerGlobalSync]);

  return (
    <SyncContext.Provider
      value={{
        isLiveConnected,
        activeClientsCount,
        lastSyncedAt,
        isSyncing,
        syncVersion,
        triggerGlobalSync,
        acquireLock,
        releaseLock,
        isLocked,
        notifyMutation
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

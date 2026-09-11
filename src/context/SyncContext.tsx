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

  const triggerGlobalSync = useCallback(async (module?: string) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }
      setSyncVersion(v => v + 1);
      setLastSyncedAt(new Date());
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

  // Setup Server-Sent Events (SSE) stream for instant multi-user synchronization
  useEffect(() => {
    let unmounted = false;

    const connectSSE = () => {
      if (unmounted) return;

      try {
        if (sseRef.current) {
          sseRef.current.close();
        }

        const source = new EventSource('/api/events/subscribe');
        sseRef.current = source;

        source.onopen = () => {
          if (unmounted) return;
          setIsLiveConnected(true);
        };

        source.onmessage = (event) => {
          if (unmounted) return;
          try {
            const data: SyncEventPayload = JSON.parse(event.data);
            if (data.type === 'CONNECTED') {
              setIsLiveConnected(true);
              if (data.activeClientsCount !== undefined) {
                setActiveClientsCount(data.activeClientsCount);
              }
            } else if (data.type === 'ENTITY_MUTATED' || data.type === 'SYNC_TRIGGER') {
              // Immediately trigger local state synchronization across all modules
              triggerGlobalSync(data.module);
            }
          } catch (e) {
            // Ignore heartbeat pings or unformatted comments
          }
        };

        source.onerror = () => {
          if (unmounted) return;
          setIsLiveConnected(false);
          source.close();
          // Auto-reconnect with 4s backoff
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(connectSSE, 4000);
        };
      } catch (err) {
        setIsLiveConnected(false);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    // Fallback polling every 20 seconds to guarantee consistency across dormant tabs
    const fallbackInterval = setInterval(() => {
      triggerGlobalSync();
    }, 20000);

    // Sync on tab visibility focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerGlobalSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unmounted = true;
      if (sseRef.current) sseRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(fallbackInterval);
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

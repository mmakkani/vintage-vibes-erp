type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';
type RealtimeBroadcasterFn = (
  table: string,
  eventType: RealtimeEventType,
  record?: any,
  oldRecord?: any
) => void;

interface RealtimeNotifierRegistry {
  invalidators: Set<() => void>;
  broadcaster: RealtimeBroadcasterFn | null;
  recentBroadcastAt: Map<string, number>;
}

const g = globalThis as unknown as { __vvRealtimeNotifier?: RealtimeNotifierRegistry };
const registry: RealtimeNotifierRegistry =
  g.__vvRealtimeNotifier ||
  (g.__vvRealtimeNotifier = {
    invalidators: new Set<() => void>(),
    broadcaster: null,
    recentBroadcastAt: new Map<string, number>()
  });

export function registerServerCacheInvalidator(fn: () => void): void {
  registry.invalidators.add(fn);
}

export function registerServerRealtimeBroadcaster(fn: RealtimeBroadcasterFn): void {
  registry.broadcaster = fn;
}

export function invalidateAllServerCaches(): void {
  for (const fn of registry.invalidators) {
    try {
      fn();
    } catch (_) {}
  }
}

export function markTableBroadcasted(table: string): void {
  registry.recentBroadcastAt.set(table, Date.now());
  if (registry.recentBroadcastAt.size > 200) {
    const cutoff = Date.now() - 5000;
    for (const [k, ts] of registry.recentBroadcastAt.entries()) {
      if (ts < cutoff) registry.recentBroadcastAt.delete(k);
    }
  }
}

export function wasTableRecentlyBroadcasted(table: string, withinMs = 120): boolean {
  const ts = registry.recentBroadcastAt.get(table);
  return Boolean(ts && Date.now() - ts <= withinMs);
}

export function notifyRealtimeTableMutation(
  table: string,
  eventType: RealtimeEventType = 'UPDATE',
  record: any = {},
  oldRecord: any = {}
): void {
  // Always wipe backend RAM caches BEFORE pushing realtime notifications to clients
  invalidateAllServerCaches();
  markTableBroadcasted(table);
  if (registry.broadcaster) {
    try {
      registry.broadcaster(table, eventType, record, oldRecord);
    } catch (_) {}
  }
}

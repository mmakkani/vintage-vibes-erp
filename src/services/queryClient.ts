/**
 * Zero-Latency In-Memory Query Client & Cache Manager
 * React Query compatible interface with smart cache injection,
 * automatic pagination recalculation, and 0ms RAM response time.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

export type QueryKey = string | readonly unknown[];

export interface QueryCacheEntry<T = any> {
  data: T;
  updatedAt: number;
  isStale?: boolean;
}

export interface InvalidateQueryOptions {
  queryKey?: QueryKey;
  exact?: boolean;
}

export interface RefetchQueryOptions {
  queryKey?: QueryKey;
}

export interface PaginatedCacheStructure<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function normalizeKey(key: QueryKey): string {
  if (typeof key === 'string') return key;
  return JSON.stringify(key);
}

function keyMatches(targetKeyStr: string, filterKey: QueryKey, exact = false): boolean {
  const filterKeyStr = normalizeKey(filterKey);
  if (exact) return targetKeyStr === filterKeyStr;

  // Prefix matching for arrays or string keys
  if (targetKeyStr === filterKeyStr) return true;
  if (typeof filterKey === 'string' && targetKeyStr.startsWith(`["${filterKey}"`)) return true;
  if (Array.isArray(filterKey)) {
    const filterArrayPrefix = JSON.stringify(filterKey).slice(0, -1);
    return targetKeyStr.startsWith(filterArrayPrefix);
  }
  return targetKeyStr.includes(filterKeyStr.replace(/[\[\]]/g, ''));
}

// Eviction registry: Tracks recently RESERVED or SOLD pieces to prevent in-flight REST queries from re-injecting them (5-minute TTL)
const evictedPiecesRegistry = new Map<string, number>();

export function recordEvictedPiece(identifier?: string | null): void {
  if (!identifier) return;
  const key = String(identifier).trim().toLowerCase();
  if (key) {
    evictedPiecesRegistry.set(key, Date.now());
  }
}

export function isPieceEvicted(identifier?: string | null): boolean {
  if (!identifier) return false;
  const key = String(identifier).trim().toLowerCase();
  const timestamp = evictedPiecesRegistry.get(key);
  if (!timestamp) return false;
  // 5-minute TTL
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    evictedPiecesRegistry.delete(key);
    return false;
  }
  return true;
}

export class QueryClient {
  private cache = new Map<string, QueryCacheEntry>();
  private listeners = new Map<string, Set<(data: any) => void>>();
  private refetchHandlers = new Map<string, () => Promise<any>>();
  private globalSubscribers = new Set<(event: { type: string; key: string; data?: any }) => void>();

  public recordEvictedPiece(identifier?: string | null): void {
    recordEvictedPiece(identifier);
  }

  public isPieceEvicted(identifier?: string | null): boolean {
    return isPieceEvicted(identifier);
  }

  /**
   * Directly get cached data from RAM with 0ms latency.
   */
  public getQueryData<T = any>(queryKey: QueryKey): T | undefined {
    const key = normalizeKey(queryKey);
    const entry = this.cache.get(key);
    return entry ? (entry.data as T) : undefined;
  }

  /**
   * Inject or update data directly in RAM cache without network overhead.
   */
  public setQueryData<T = any>(queryKey: QueryKey, updater: T | ((old: T | undefined) => T)): T {
    const key = normalizeKey(queryKey);
    const existing = this.cache.get(key);
    const prevData = existing ? (existing.data as T) : undefined;

    let nextData = typeof updater === 'function' ? (updater as (old: T | undefined) => T)(prevData) : updater;

    // Idempotency Protection: If this query represents available stock, sanitize out any evicted (RESERVED/SOLD) pieces
    const isAvailableStockCache =
      keyMatches(key, 'inventory_pieces') ||
      keyMatches(key, 'inventory') ||
      keyMatches(key, 'products') ||
      keyMatches(key, 'ecommerce') ||
      keyMatches(key, 'storefront') ||
      keyMatches(key, 'pieces') ||
      keyMatches(key, 'stock');

    if (isAvailableStockCache && nextData) {
      if (Array.isArray(nextData)) {
        nextData = (nextData as any[]).filter(item => {
          if (!item) return false;
          const itemId = String(item.id || item.code || item.uuid || '').trim().toLowerCase();
          const itemBarcode = String(item.barcode || '').trim().toLowerCase();
          return !isPieceEvicted(itemId) && !isPieceEvicted(itemBarcode);
        }) as any;
      } else if (
        typeof nextData === 'object' &&
        Array.isArray((nextData as any).data) &&
        typeof (nextData as any).total === 'number'
      ) {
        const paginated = nextData as any;
        const initialCount = paginated.data.length;
        const filtered = paginated.data.filter((item: any) => {
          if (!item) return false;
          const itemId = String(item.id || item.code || item.uuid || '').trim().toLowerCase();
          const itemBarcode = String(item.barcode || '').trim().toLowerCase();
          return !isPieceEvicted(itemId) && !isPieceEvicted(itemBarcode);
        });
        if (filtered.length !== initialCount) {
          const newTotal = Math.max(0, paginated.total - (initialCount - filtered.length));
          const pageSize = paginated.pageSize || 10;
          const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));
          nextData = {
            ...paginated,
            data: filtered,
            total: newTotal,
            totalPages: newTotalPages
          } as any;
        }
      }
    }

    this.cache.set(key, {
      data: nextData,
      updatedAt: Date.now(),
      isStale: false
    });

    // Notify key-specific listeners
    const subs = this.listeners.get(key);
    if (subs) {
      subs.forEach(cb => {
        try {
          cb(nextData);
        } catch (e) {
          console.error('[QueryClient] Listener error:', e);
        }
      });
    }

    // Notify global subscribers
    this.globalSubscribers.forEach(cb => {
      try {
        cb({ type: 'SET', key, data: nextData });
      } catch (_) {}
    });

    return nextData;
  }

  /**
   * Register an asynchronous query fetcher for background revalidation.
   */
  public registerQueryFetcher(queryKey: QueryKey, fetcher: () => Promise<any>): () => void {
    const key = normalizeKey(queryKey);
    this.refetchHandlers.set(key, fetcher);
    return () => {
      if (this.refetchHandlers.get(key) === fetcher) {
        this.refetchHandlers.delete(key);
      }
    };
  }

  /**
   * Subscribe to cache updates for a specific query key.
   */
  public subscribe<T = any>(queryKey: QueryKey, callback: (data: T) => void): () => void {
    const key = normalizeKey(queryKey);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const set = this.listeners.get(key)!;
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all cache mutations globally.
   */
  public subscribeGlobal(callback: (event: { type: string; key: string; data?: any }) => void): () => void {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  /**
   * Invalidate cached queries. Marks entries as stale and triggers background refetch if handlers exist.
   */
  public async invalidateQueries(options?: InvalidateQueryOptions): Promise<void> {
    const exact = options?.exact ?? false;
    const promises: Promise<any>[] = [];

    for (const [keyStr, entry] of this.cache.entries()) {
      if (!options?.queryKey || keyMatches(keyStr, options.queryKey, exact)) {
        entry.isStale = true;
        const fetcher = this.refetchHandlers.get(keyStr);
        if (fetcher) {
          promises.push(
            fetcher()
              .then(fresh => this.setQueryData(JSON.parse(keyStr), fresh))
              .catch(err => console.warn(`[QueryClient] Background refetch failed for ${keyStr}:`, err))
          );
        }
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Trigger refetch across active queries matching the queryKey.
   */
  public async refetchQueries(options?: RefetchQueryOptions): Promise<void> {
    return this.invalidateQueries({ queryKey: options?.queryKey, exact: false });
  }

  /**
   * Clear or remove specific queries from RAM cache.
   */
  public removeQueries(options?: InvalidateQueryOptions): void {
    const exact = options?.exact ?? false;
    for (const keyStr of Array.from(this.cache.keys())) {
      if (!options?.queryKey || keyMatches(keyStr, options.queryKey, exact)) {
        this.cache.delete(keyStr);
        this.listeners.delete(keyStr);
        this.refetchHandlers.delete(keyStr);
      }
    }
  }

  // =========================================================================
  // SMART REALTIME CACHE INJECTION (Zero Network Round-Trip)
  // =========================================================================

  /**
   * Injects or updates an incoming row directly into all matching list and paginated caches.
   */
  public injectRecord(table: string, record: any): void {
    if (!record || typeof record !== 'object') return;
    const recordId = record.id || record.device_id || record.code || record.uuid || record.barcode;

    // CRITICAL: Treat RESERVED or SOLD inventory pieces as DELETE for Available Stock caches
    if (
      table === 'inventory_pieces' &&
      (record.status === 'RESERVED' || record.status === 'SOLD' || Boolean(record.is_sold))
    ) {
      this.removeAvailablePiece(String(recordId), record);
      return;
    }

    // If piece was recently marked RESERVED or SOLD, prevent in-flight REST queries from re-injecting it
    if (table === 'inventory_pieces') {
      const pId = String(record?.id || recordId || '').trim().toLowerCase();
      const pBarcode = String(record?.barcode || '').trim().toLowerCase();
      if (isPieceEvicted(pId) || isPieceEvicted(pBarcode)) {
        return;
      }
    }

    for (const [keyStr, entry] of this.cache.entries()) {
      if (!entry || !entry.data) continue;
      if (!keyMatches(keyStr, table)) continue;

      // Case 1: Plain Array Cache (e.g., [table])
      if (Array.isArray(entry.data)) {
        const arr = entry.data as any[];
        const idx = arr.findIndex((item: any) => {
          if (!item) return false;
          const itemId = item.id || item.device_id || item.code || item.uuid;
          return itemId && recordId && String(itemId) === String(recordId);
        });

        if (idx !== -1) {
          // UPDATE in place (preserve extra client properties)
          const updatedArr = [...arr];
          updatedArr[idx] = { ...updatedArr[idx], ...record };
          this.setQueryData(JSON.parse(keyStr), updatedArr);
        } else {
          // INSERT at top
          this.setQueryData(JSON.parse(keyStr), [record, ...arr]);
        }
        continue;
      }

      // Case 2: Paginated Structure ({ data, total, page, pageSize, totalPages })
      if (
        entry.data &&
        Array.isArray(entry.data.data) &&
        typeof entry.data.total === 'number' &&
        typeof entry.data.page === 'number'
      ) {
        const paginated = entry.data as PaginatedCacheStructure;
        const idx = paginated.data.findIndex((item: any) => {
          if (!item) return false;
          const itemId = item.id || item.device_id || item.code || item.uuid;
          return itemId && recordId && String(itemId) === String(recordId);
        });

        if (idx !== -1) {
          // UPDATE: Replace row in current page
          const updatedRows = [...paginated.data];
          updatedRows[idx] = { ...updatedRows[idx], ...record };
          this.setQueryData(JSON.parse(keyStr), {
            ...paginated,
            data: updatedRows
          });
        } else {
          // INSERT: If on page 1, prepend and respect pageSize
          const newTotal = paginated.total + 1;
          const newTotalPages = Math.max(1, Math.ceil(newTotal / (paginated.pageSize || 10)));

          if (paginated.page === 1) {
            const updatedRows = [record, ...paginated.data].slice(0, paginated.pageSize || 10);
            this.setQueryData(JSON.parse(keyStr), {
              ...paginated,
              data: updatedRows,
              total: newTotal,
              totalPages: newTotalPages
            });
          } else {
            // Update total counts without disrupting current non-first page view
            this.setQueryData(JSON.parse(keyStr), {
              ...paginated,
              total: newTotal,
              totalPages: newTotalPages
            });
          }
        }
      }
    }

    // Direct entity cache (e.g., [table, recordId])
    if (recordId) {
      const singleKey = [table, String(recordId)];
      if (this.getQueryData(singleKey) !== undefined) {
        this.setQueryData(singleKey, (prev: any) => ({ ...prev, ...record }));
      }
    }
  }

  /**
   * Strictly uses payload.old to remove the deleted row from all local state,
   * recalculates total items/pages, and adjusts page state if view is emptied.
   */
  public removeRecord(table: string, oldId: string, oldRecord?: any): void {
    if (!oldId) return;
    const cleanId = String(oldId).trim();

    for (const [keyStr, entry] of this.cache.entries()) {
      if (!entry || !entry.data) continue;
      if (!keyMatches(keyStr, table)) continue;

      // Case 1: Plain Array Cache
      if (Array.isArray(entry.data)) {
        const arr = entry.data as any[];
        const filtered = arr.filter((item: any) => {
          if (!item) return false;
          const itemId = item.id || item.device_id || item.code || item.uuid;
          return String(itemId) !== cleanId;
        });

        if (filtered.length !== arr.length) {
          this.setQueryData(JSON.parse(keyStr), filtered);
        }
        continue;
      }

      // Case 2: Paginated Structure
      if (
        entry.data &&
        Array.isArray(entry.data.data) &&
        typeof entry.data.total === 'number' &&
        typeof entry.data.page === 'number'
      ) {
        const paginated = entry.data as PaginatedCacheStructure;
        const initialCount = paginated.data.length;
        const filteredRows = paginated.data.filter((item: any) => {
          if (!item) return false;
          const itemId = item.id || item.device_id || item.code || item.uuid;
          return String(itemId) !== cleanId;
        });

        if (filteredRows.length !== initialCount) {
          const newTotal = Math.max(0, paginated.total - 1);
          const pageSize = paginated.pageSize || 10;
          const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));

          // Cascading pagination update:
          // If current paginated view is emptied and page > 1, auto-adjust to page - 1
          let targetPage = paginated.page;
          if (filteredRows.length === 0 && paginated.page > 1) {
            targetPage = paginated.page - 1;
            // Dispatch page adjustment notification
            try {
              window.dispatchEvent(
                new CustomEvent('vv:page-adjusted', {
                  detail: { table, oldPage: paginated.page, newPage: targetPage }
                })
              );
            } catch (_) {}
          }

          this.setQueryData(JSON.parse(keyStr), {
            ...paginated,
            data: filteredRows,
            total: newTotal,
            page: targetPage,
            totalPages: newTotalPages
          });
        }
      }
    }

    // Remove single entity cache
    const singleKey = [table, cleanId];
    this.removeQueries({ queryKey: singleKey, exact: true });
  }

  /**
   * Treats an inventory piece as a DELETE event for any cached queries that represent "Available Stock"
   * (e.g., E-Commerce storefront product list, Inventory "In Stock Only" view).
   * Filters the item OUT of cached arrays and updates queryClient.setQueryData instantly.
   */
  public removeAvailablePiece(identifier: string, record?: any): void {
    if (!identifier) return;
    const cleanId = String(identifier).trim().toLowerCase();
    const barcode = String(record?.barcode || '').trim().toLowerCase();
    const id = String(record?.id || '').trim().toLowerCase();

    // Idempotency: Register in Eviction Registry with 5-minute TTL to defend against slow in-flight REST queries
    if (cleanId) recordEvictedPiece(cleanId);
    if (barcode) recordEvictedPiece(barcode);
    if (id) recordEvictedPiece(id);

    for (const [keyStr, entry] of this.cache.entries()) {
      if (!entry || !entry.data) continue;

      // Filter all caches representing available stock (e-commerce products, storefront, inventory pieces)
      const isAvailableStockCache =
        keyMatches(keyStr, 'inventory_pieces') ||
        keyMatches(keyStr, 'inventory') ||
        keyMatches(keyStr, 'products') ||
        keyMatches(keyStr, 'ecommerce') ||
        keyMatches(keyStr, 'storefront') ||
        keyMatches(keyStr, 'pieces') ||
        keyMatches(keyStr, 'stock');

      if (!isAvailableStockCache) continue;

      let parsedKey: any = keyStr;
      try {
        parsedKey = JSON.parse(keyStr);
      } catch (_) {}

      // Case 1: Plain Array Cache
      if (Array.isArray(entry.data)) {
        const arr = entry.data as any[];
        const filtered = arr.filter((item: any) => {
          if (!item) return false;
          const itemId = String(item.id || item.code || item.uuid || '').trim().toLowerCase();
          const itemBarcode = String(item.barcode || '').trim().toLowerCase();
          if (cleanId && (itemId === cleanId || itemBarcode === cleanId)) return false;
          if (barcode && itemBarcode === barcode) return false;
          if (id && itemId === id) return false;
          return true;
        });

        if (filtered.length !== arr.length) {
          this.setQueryData(parsedKey, filtered);
        }
        continue;
      }

      // Case 2: Paginated Structure
      if (
        entry.data &&
        Array.isArray(entry.data.data) &&
        typeof entry.data.total === 'number'
      ) {
        const paginated = entry.data as PaginatedCacheStructure;
        const initialCount = paginated.data.length;
        const filteredRows = paginated.data.filter((item: any) => {
          if (!item) return false;
          const itemId = String(item.id || item.code || item.uuid || '').trim().toLowerCase();
          const itemBarcode = String(item.barcode || '').trim().toLowerCase();
          if (cleanId && (itemId === cleanId || itemBarcode === cleanId)) return false;
          if (barcode && itemBarcode === barcode) return false;
          if (id && itemId === id) return false;
          return true;
        });

        if (filteredRows.length !== initialCount) {
          const newTotal = Math.max(0, paginated.total - (initialCount - filteredRows.length));
          const pageSize = paginated.pageSize || 10;
          const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));

          this.setQueryData(parsedKey, {
            ...paginated,
            data: filteredRows,
            total: newTotal,
            totalPages: newTotalPages
          });
        }
      }
    }
  }

  /**
   * Instant propagation of document status changes (POST, UNPOST, DRAFT) across badges & ledgers.
   */
  public handleStatusChange(table: string, record: any): void {
    if (!record || !record.status) return;
    this.injectRecord(table, record);

    try {
      window.dispatchEvent(
        new CustomEvent('vv:status-changed', {
          detail: {
            table,
            id: record.id || record.voucher_no || record.invoice_no,
            status: record.status,
            record
          }
        })
      );
    } catch (_) {}
  }
}

// Global query client singleton
export const queryClient = new QueryClient();

// Expose on window for runtime access and debugging
if (typeof window !== 'undefined') {
  (window as any).queryClient = queryClient;
}

/**
 * React hook to access the global QueryClient instance.
 */
export function useQueryClient(): QueryClient {
  return queryClient;
}

/**
 * Lightweight, zero-latency useQuery hook backed by the global RAM cache.
 */
export function useQuery<T = any>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number }
) {
  const enabled = options?.enabled ?? true;
  const keyStr = normalizeKey(queryKey);

  // Synchronously subscribe to RAM cache changes
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {};
      return queryClient.subscribe(queryKey, onStoreChange);
    },
    [keyStr, enabled]
  );

  const getSnapshot = useCallback(() => {
    return queryClient.getQueryData<T>(queryKey);
  }, [keyStr]);

  const cachedData = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [isLoading, setIsLoading] = useState<boolean>(cachedData === undefined && enabled);
  const [error, setError] = useState<Error | null>(null);

  const executeFetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(cachedData === undefined);
    setError(null);
    try {
      const result = await queryFn();
      queryClient.setQueryData(queryKey, result);
      return result;
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [keyStr, enabled, queryFn, cachedData]);

  // Register fetcher with queryClient for background refetching
  useEffect(() => {
    if (!enabled) return;
    return queryClient.registerQueryFetcher(queryKey, executeFetch);
  }, [keyStr, enabled, executeFetch]);

  // Initial fetch if cache is cold
  useEffect(() => {
    if (enabled && cachedData === undefined) {
      executeFetch().catch(() => {});
    }
  }, [keyStr, enabled, cachedData, executeFetch]);

  return {
    data: cachedData,
    isLoading,
    isError: error !== null,
    error,
    refetch: executeFetch
  };
}

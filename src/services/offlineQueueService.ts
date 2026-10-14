import { FinanceService } from './financeService.ts';
import { SalesService } from './salesService.ts';

/**
 * Offline Queue Service for POS Register and Barcode Scanners
 * Buffers offline transactions in both IndexedDB and localStorage when network drops,
 * and automatically drains & posts them (COA Voucher + Sales Invoice + POS Sale) to PostgreSQL when online.
 */

export interface QueuedOfflineSale {
  id: string;
  timestamp: number;
  payload: any;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  error?: string;
}

const STORAGE_KEY = 'vv_pos_offline_sales_queue';
const IDB_NAME = 'vv_pos_offline_db';
const IDB_STORE = 'offline_sales';

class OfflineQueueService {
  private listeners: Set<() => void> = new Set();
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.hydrateFromIndexedDB().catch(() => {});

      window.addEventListener('online', () => {
        console.log('[OfflineQueue] Network restored, attempting immediate auto-sync...');
        this.notify();
        this.syncPendingSales();
      });

      window.addEventListener('offline', () => {
        console.warn('[OfflineQueue] Network lost, offline buffering activated.');
        this.notify();
      });

      // Fast periodic auto-sync check every 15 seconds
      setInterval(() => {
        if (navigator.onLine && this.getPendingCount() > 0) {
          this.syncPendingSales();
        }
      }, 15000);
    }
  }

  private openIdb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async persistToIndexedDB(queue: QueuedOfflineSale[]): Promise<void> {
    const db = await this.openIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const item of queue) {
        store.put(item);
      }
    } catch (_) {}
  }

  private async hydrateFromIndexedDB(): Promise<void> {
    const localQueue = this.getQueue();
    if (localQueue.length > 0) return;
    const db = await this.openIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        if (Array.isArray(req.result) && req.result.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(req.result));
          this.notify();
          if (navigator.onLine) {
            this.syncPendingSales();
          }
        }
      };
    } catch (_) {}
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.error('[OfflineQueue] Listener error:', err);
      }
    });
  }

  public getQueue(): QueuedOfflineSale[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: QueuedOfflineSale[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      this.persistToIndexedDB(queue).catch(() => {});
      this.notify();
    } catch (err) {
      console.error('[OfflineQueue] Failed to persist queue:', err);
    }
  }

  public enqueueSale(payload: any): QueuedOfflineSale {
    const queue = this.getQueue();
    const item: QueuedOfflineSale = {
      id: `offline-sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      payload,
      status: 'PENDING',
      retryCount: 0,
    };
    queue.push(item);
    this.saveQueue(queue);
    console.log('[OfflineQueue] Enqueued offline sale transaction (IndexedDB + LocalStorage):', item.id);
    return item;
  }

  public getPendingCount(): number {
    return this.getQueue().filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public async syncPendingSales(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing || !this.isOnline()) {
      return { synced: 0, failed: 0 };
    }

    const queue = this.getQueue();
    const pending = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');
    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      item.status = 'SYNCING';
      this.saveQueue(queue);

      try {
        const p = item.payload || {};
        if (p.voucherPayload) {
          await FinanceService.addVoucher(p.voucherPayload);
        }
        if (p.invoicePayload) {
          await SalesService.createSalesInvoice(p.invoicePayload);
        } else {
          await SalesService.createSalesInvoice(p);
        }
        if (p.posPayload) {
          await SalesService.createPosSale(p.posPayload);
        }

        synced++;
        const idx = queue.findIndex(q => q.id === item.id);
        if (idx !== -1) queue.splice(idx, 1);
        this.saveQueue(queue);
        console.log(`[OfflineQueue] ✅ Auto-synced offline POS sale ${p.invoiceNo || item.id} to PostgreSQL & COA`);
      } catch (err: any) {
        failed++;
        item.status = 'FAILED';
        item.retryCount = (item.retryCount || 0) + 1;
        item.error = err?.message || 'Network error';
        this.saveQueue(queue);
      }
    }

    this.isSyncing = false;
    this.notify();
    return { synced, failed };
  }
}

export const offlineQueue = new OfflineQueueService();


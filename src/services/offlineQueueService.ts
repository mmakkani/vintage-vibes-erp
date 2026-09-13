/**
 * Offline Queue Service for POS Register and Barcode Scanners
 * Buffers offline transactions in localStorage when network drops,
 * and automatically drains & posts them to PostgreSQL when online.
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

class OfflineQueueService {
  private listeners: Set<() => void> = new Set();
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[OfflineQueue] Network restored, attempting auto-sync...');
        this.notify();
        this.syncPendingSales();
      });

      window.addEventListener('offline', () => {
        console.warn('[OfflineQueue] Network lost, offline buffering activated.');
        this.notify();
      });

      // Periodic check every 45 seconds
      setInterval(() => {
        if (navigator.onLine && this.getPendingCount() > 0) {
          this.syncPendingSales();
        }
      }, 45000);
    }
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
    console.log('[OfflineQueue] Enqueued offline sale transaction:', item.id);
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
        const res = await fetch('/api/sales/create-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          synced++;
          // Remove successfully synced sale from queue
          const idx = queue.findIndex(q => q.id === item.id);
          if (idx !== -1) queue.splice(idx, 1);
          this.saveQueue(queue);
        } else {
          failed++;
          item.status = 'FAILED';
          item.retryCount = (item.retryCount || 0) + 1;
          item.error = `HTTP ${res.status}`;
          this.saveQueue(queue);
        }
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

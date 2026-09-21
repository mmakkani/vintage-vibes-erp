import { SetupService } from './setupService.ts';
import {
  CurrencyItem,
  CategoryMaster,
  SizeMaster,
  LabelGrade,
  BrandMaster,
  ShopMaster,
  ItemMaster
} from '../modules/setup/setup.types.ts';

export interface MasterDataSnapshot {
  currencies: CurrencyItem[];
  categories: CategoryMaster[];
  sizes: SizeMaster[];
  labels: LabelGrade[];
  brands: BrandMaster[];
  shops: ShopMaster[];
  items: ItemMaster[];
  timestamp: number;
}

const CACHE_STORAGE_KEY = 'vv_master_data_cache_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes fresh window

// In-Memory RAM Singleton for 0ms access
let memorySnapshot: MasterDataSnapshot | null = null;
let activeFetchPromise: Promise<MasterDataSnapshot> | null = null;
const listeners = new Set<(snapshot: MasterDataSnapshot) => void>();

export class MasterDataCache {
  /**
   * Synchronously returns cached master data from RAM or LocalStorage.
   * If cache is missing, returns empty structures while background fetch executes.
   */
  public static getCached(): MasterDataSnapshot {
    if (memorySnapshot) {
      return memorySnapshot;
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(CACHE_STORAGE_KEY);
        if (stored) {
          const parsed: MasterDataSnapshot = JSON.parse(stored);
          if (parsed && typeof parsed.timestamp === 'number') {
            memorySnapshot = parsed;
            // If stale (>15 mins), trigger silent background revalidation
            if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
              MasterDataCache.revalidate().catch(() => {});
            }
            return parsed;
          }
        }
      } catch (_) {}
    }

    // Trigger background loading if cold
    MasterDataCache.revalidate().catch(() => {});

    return {
      currencies: [],
      categories: [],
      sizes: [],
      labels: [],
      brands: [],
      shops: [],
      items: [],
      timestamp: 0
    };
  }

  /**
   * Asynchronously loads or refreshes master data from SetupService.
   * Deduplicates concurrent calls via activeFetchPromise.
   */
  public static async revalidate(force = false): Promise<MasterDataSnapshot> {
    if (activeFetchPromise && !force) {
      return activeFetchPromise;
    }

    activeFetchPromise = (async () => {
      try {
        const [currencies, categories, sizes, labels, brands, shops, items] = await Promise.all([
          SetupService.getCurrencies().catch(() => memorySnapshot?.currencies || []),
          SetupService.getCategories().catch(() => memorySnapshot?.categories || []),
          SetupService.getSizes().catch(() => memorySnapshot?.sizes || []),
          SetupService.getLabelGrades().catch(() => memorySnapshot?.labels || []),
          SetupService.getBrands().catch(() => memorySnapshot?.brands || []),
          SetupService.getShops().catch(() => memorySnapshot?.shops || []),
          SetupService.getItems().catch(() => memorySnapshot?.items || [])
        ]);

        const freshSnapshot: MasterDataSnapshot = {
          currencies: Array.isArray(currencies) ? currencies : [],
          categories: Array.isArray(categories) ? categories : [],
          sizes: Array.isArray(sizes) ? sizes : [],
          labels: Array.isArray(labels) ? labels : [],
          brands: Array.isArray(brands) ? brands : [],
          shops: Array.isArray(shops) ? shops : [],
          items: Array.isArray(items) ? items : [],
          timestamp: Date.now()
        };

        memorySnapshot = freshSnapshot;

        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(freshSnapshot));
          } catch (_) {}
        }

        // Notify all subscribers
        listeners.forEach(callback => {
          try {
            callback(freshSnapshot);
          } catch (_) {}
        });

        return freshSnapshot;
      } catch (err) {
        console.warn('[MasterDataCache] Revalidation warning:', err);
        return memorySnapshot || {
          currencies: [],
          categories: [],
          sizes: [],
          labels: [],
          brands: [],
          shops: [],
          items: [],
          timestamp: 0
        };
      } finally {
        activeFetchPromise = null;
      }
    })();

    return activeFetchPromise;
  }

  /**
   * Subscribe to cache updates across components.
   */
  public static subscribe(callback: (snapshot: MasterDataSnapshot) => void): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  /**
   * Invalidate cache on mutations (e.g. when an item or shop is saved).
   */
  public static invalidate(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(CACHE_STORAGE_KEY);
      } catch (_) {}
    }
    MasterDataCache.revalidate(true).catch(() => {});
  }
}

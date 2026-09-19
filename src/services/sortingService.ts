import { supabase } from '../supabaseClient.ts';
import { SortingBatch, SortingBatchItem, StartSortingResult, CompleteSortingResult } from '../modules/sorting/sorting.types.ts';

export class SortingService {
  /**
   * Fetch all sorting batches
   */
  public static async getBatches(): Promise<SortingBatch[]> {
    // 1. Try internal backend API first
    try {
      const res = await fetch('/api/sorting/batches');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (_) {}

    // 2. Fallback to Supabase client
    try {
      const { data, error } = await supabase
        .from('sorting_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SortingService] Supabase fallback warning:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        batchNumber: row.batch_number,
        inwardPassId: row.inward_pass_id,
        rawBalesCount: Number(row.raw_bales_count) || 0,
        rawWeightKg: Number(row.raw_weight_kg) || 0,
        rawCostValue: Number(row.raw_cost_value) || 0,
        finishedWeightKg: Number(row.finished_weight_kg) || 0,
        wastageWeightKg: Number(row.wastage_weight_kg) || 0,
        status: row.status,
        wipVoucherId: row.wip_voucher_id,
        fgVoucherId: row.fg_voucher_id,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.error('[SortingService] Error loading batches:', err);
      return [];
    }
  }

  /**
   * Fetch single sorting batch with its output items
   */
  public static async getBatchById(id: string): Promise<SortingBatch | null> {
    try {
      const res = await fetch(`/api/sorting/batches/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    try {
      const { data: batch, error } = await supabase
        .from('sorting_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !batch) return null;

      const { data: items } = await supabase
        .from('sorting_batch_items')
        .select('*')
        .eq('batch_id', id)
        .order('created_at', { ascending: true });

      return {
        id: batch.id,
        batchNumber: batch.batch_number,
        inwardPassId: batch.inward_pass_id,
        rawBalesCount: Number(batch.raw_bales_count) || 0,
        rawWeightKg: Number(batch.raw_weight_kg) || 0,
        rawCostValue: Number(batch.raw_cost_value) || 0,
        finishedWeightKg: Number(batch.finished_weight_kg) || 0,
        wastageWeightKg: Number(batch.wastage_weight_kg) || 0,
        status: batch.status,
        wipVoucherId: batch.wip_voucher_id,
        fgVoucherId: batch.fg_voucher_id,
        notes: batch.notes,
        createdAt: batch.created_at,
        updatedAt: batch.updated_at,
        items: (items || []).map((i: any) => ({
          id: i.id,
          batchId: i.batch_id,
          itemSku: i.item_sku,
          itemName: i.item_name,
          category: i.category,
          grade: i.grade,
          quantity: Number(i.quantity) || 1,
          weightKg: Number(i.weight_kg) || 0,
          costPrice: Number(i.cost_price) || 0,
          sellingPrice: Number(i.selling_price) || 0,
          barcode: i.barcode,
          createdAt: i.created_at
        }))
      };
    } catch (err) {
      console.error('[SortingService] Error loading batch by id:', err);
      return null;
    }
  }

  /**
   * Create a new sorting batch
   */
  public static async createBatch(batch: {
    batchNumber?: string;
    inwardPassId?: string | null;
    rawBalesCount?: number;
    rawWeightKg?: number;
    rawCostValue?: number;
    notes?: string | null;
  }): Promise<SortingBatch> {
    const res = await fetch('/api/sorting/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create sorting batch' }));
      throw new Error(err.error || 'Failed to create sorting batch');
    }

    return await res.json();
  }

  /**
   * Start sorting batch and issue Raw Material to WIP (posts JV)
   */
  public static async startSorting(batchId: string): Promise<StartSortingResult> {
    const res = await fetch('/api/sorting/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to start sorting batch and post WIP voucher');
    }

    return data;
  }

  /**
   * Complete sorting batch, capitalize Finished Goods & recognize Scrap (posts JV)
   */
  public static async completeSorting(
    batchId: string,
    finishedItems: SortingBatchItem[]
  ): Promise<CompleteSortingResult> {
    const res = await fetch('/api/sorting/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, finishedItems })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to complete sorting batch and post Finished Goods voucher');
    }

    return data;
  }
}

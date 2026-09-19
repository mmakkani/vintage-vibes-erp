import { Client } from 'pg';
import { SortingBatch, SortingBatchItem, StartSortingResult, CompleteSortingResult } from './sorting.types.ts';

export class SortingController {
  private static async getDbClient(): Promise<Client> {
    const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
    let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL;
    try {
      const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
      if (match) {
        let [_, user, rawPwd, host, port, rest] = match;
        if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
        dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
      }
    } catch (_) {}

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  }

  public static async getBatches(): Promise<SortingBatch[]> {
    const client = await this.getDbClient();
    try {
      const query = `
        SELECT 
          id,
          batch_number AS "batchNumber",
          inward_pass_id AS "inwardPassId",
          raw_bales_count AS "rawBalesCount",
          raw_weight_kg::numeric AS "rawWeightKg",
          raw_cost_value::numeric AS "rawCostValue",
          finished_weight_kg::numeric AS "finishedWeightKg",
          wastage_weight_kg::numeric AS "wastageWeightKg",
          status,
          wip_voucher_id AS "wipVoucherId",
          fg_voucher_id AS "fgVoucherId",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM public.sorting_batches
        ORDER BY created_at DESC;
      `;
      const res = await client.query(query);
      return res.rows;
    } finally {
      await client.end();
    }
  }

  public static async getBatchById(id: string): Promise<SortingBatch | null> {
    const client = await this.getDbClient();
    try {
      const batchQuery = `
        SELECT 
          id,
          batch_number AS "batchNumber",
          inward_pass_id AS "inwardPassId",
          raw_bales_count AS "rawBalesCount",
          raw_weight_kg::numeric AS "rawWeightKg",
          raw_cost_value::numeric AS "rawCostValue",
          finished_weight_kg::numeric AS "finishedWeightKg",
          wastage_weight_kg::numeric AS "wastageWeightKg",
          status,
          wip_voucher_id AS "wipVoucherId",
          fg_voucher_id AS "fgVoucherId",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM public.sorting_batches
        WHERE id = $1;
      `;
      const batchRes = await client.query(batchQuery, [id]);
      if (batchRes.rows.length === 0) return null;

      const batch = batchRes.rows[0];

      const itemsQuery = `
        SELECT 
          id,
          batch_id AS "batchId",
          item_sku AS "itemSku",
          item_name AS "itemName",
          category,
          grade,
          quantity,
          weight_kg::numeric AS "weightKg",
          cost_price::numeric AS "costPrice",
          selling_price::numeric AS "sellingPrice",
          barcode,
          created_at AS "createdAt"
        FROM public.sorting_batch_items
        WHERE batch_id = $1
        ORDER BY created_at ASC;
      `;
      const itemsRes = await client.query(itemsQuery, [id]);
      batch.items = itemsRes.rows;

      return batch;
    } finally {
      await client.end();
    }
  }

  public static async createBatch(data: {
    batchNumber?: string;
    inwardPassId?: string | null;
    rawBalesCount?: number;
    rawWeightKg?: number;
    rawCostValue?: number;
    notes?: string | null;
  }): Promise<SortingBatch> {
    const client = await this.getDbClient();
    try {
      let batchNo = (data.batchNumber || '').trim();
      if (!batchNo) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rnd = Math.floor(1000 + Math.random() * 9000);
        batchNo = `SRT-${dateStr}-${rnd}`;
      }

      const query = `
        INSERT INTO public.sorting_batches (
          batch_number, inward_pass_id, raw_bales_count, raw_weight_kg, raw_cost_value, notes, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'DRAFT'
        ) RETURNING 
          id,
          batch_number AS "batchNumber",
          inward_pass_id AS "inwardPassId",
          raw_bales_count AS "rawBalesCount",
          raw_weight_kg::numeric AS "rawWeightKg",
          raw_cost_value::numeric AS "rawCostValue",
          finished_weight_kg::numeric AS "finishedWeightKg",
          wastage_weight_kg::numeric AS "wastageWeightKg",
          status,
          wip_voucher_id AS "wipVoucherId",
          fg_voucher_id AS "fgVoucherId",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt";
      `;
      const params = [
        batchNo,
        data.inwardPassId || null,
        Number(data.rawBalesCount) || 1,
        Number(data.rawWeightKg) || 0,
        Number(data.rawCostValue) || 0,
        data.notes || null
      ];
      const res = await client.query(query, params);
      return res.rows[0];
    } finally {
      await client.end();
    }
  }

  public static async startSorting(batchId: string): Promise<StartSortingResult> {
    const client = await this.getDbClient();
    try {
      const res = await client.query(
        'SELECT public.start_sorting_batch_and_post_wip($1::uuid) as result;',
        [batchId]
      );
      return res.rows[0]?.result;
    } finally {
      await client.end();
    }
  }

  public static async completeSorting(
    batchId: string,
    finishedItems: SortingBatchItem[]
  ): Promise<CompleteSortingResult> {
    const client = await this.getDbClient();
    try {
      const res = await client.query(
        'SELECT public.complete_sorting_batch_and_post_fg($1::uuid, $2::jsonb) as result;',
        [batchId, JSON.stringify(finishedItems)]
      );
      return res.rows[0]?.result;
    } finally {
      await client.end();
    }
  }
}

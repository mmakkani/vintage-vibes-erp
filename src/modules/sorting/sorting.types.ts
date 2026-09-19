export interface SortingBatch {
  id: string;
  batchNumber: string;
  inwardPassId?: string | null;
  rawBalesCount: number;
  rawWeightKg: number;
  rawCostValue: number;
  finishedWeightKg: number;
  wastageWeightKg: number;
  status: 'DRAFT' | 'IN_PROCESS' | 'COMPLETED';
  wipVoucherId?: string | null;
  fgVoucherId?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items?: SortingBatchItem[];
}

export interface SortingBatchItem {
  id?: string;
  batchId?: string;
  itemSku?: string;
  itemName: string;
  category?: string;
  grade?: string;
  quantity: number;
  weightKg: number;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  createdAt?: string;
}

export interface StartSortingResult {
  success: boolean;
  batch_id: string;
  batch_number: string;
  status: 'IN_PROCESS';
  wip_voucher_id: string;
  wip_voucher_no: string;
  raw_cost_value: number;
  error?: string;
}

export interface CompleteSortingResult {
  success: boolean;
  batch_id: string;
  batch_number: string;
  status: 'COMPLETED';
  fg_voucher_id: string;
  fg_voucher_no: string;
  total_fg_cost: number;
  scrap_cost: number;
  finished_weight_kg: number;
  wastage_weight_kg: number;
  items_count: number;
  error?: string;
}

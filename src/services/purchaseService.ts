import { supabase } from '../supabaseClient.ts';
import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem } from '../modules/purchase/purchase.types.ts';

export class PurchaseService {
  // --- Purchase Invoices ---
  public static async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error on purchase_invoices:', error);
      throw new Error(error.message || 'Database error occurred reading purchase invoices');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      invoiceNo: row.invoice_no || row.invoiceNo,
      supplierId: row.supplier_id || row.supplierId,
      invoiceDate: row.invoice_date || row.invoiceDate,
      currency: row.currency || 'AED',
      exchangeRate: Number(row.exchange_rate ?? row.exchangeRate ?? 1),
      subtotal: Number(row.subtotal || 0),
      taxAmount: Number(row.tax_amount ?? row.taxAmount ?? 0),
      totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
      totalWeightKg: Number(row.total_weight_kg ?? row.totalWeightKg ?? 0),
      status: row.status || 'RECEIVED',
      notes: row.notes || '',
      createdAt: row.created_at
    }));
  }

  public static async addPurchaseInvoice(inv: Partial<PurchaseInvoice>): Promise<PurchaseInvoice> {
    const id = inv.id || `pi-${Date.now()}`;
    const payload = {
      id,
      invoice_no: inv.invoiceNo || `PINV-${Date.now().toString().slice(-6)}`,
      supplier_id: inv.supplierId,
      invoice_date: inv.invoiceDate || new Date().toISOString().slice(0, 10),
      currency: inv.currency || 'AED',
      exchange_rate: Number(inv.exchangeRate || 1),
      subtotal: Number(inv.subtotal || 0),
      tax_amount: Number(inv.taxAmount || 0),
      total_amount: Number(inv.totalAmount || 0),
      total_weight_kg: Number(inv.totalWeightKg || 0),
      status: inv.status || 'RECEIVED',
      notes: inv.notes || ''
    };

    const { data, error } = await supabase
      .from('purchase_invoices')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on purchase_invoices:', error);
      throw new Error(error.message || 'Failed to create purchase invoice');
    }

    return {
      id: data.id,
      invoiceNo: data.invoice_no,
      supplierId: data.supplier_id,
      invoiceDate: data.invoice_date,
      currency: data.currency,
      exchangeRate: Number(data.exchange_rate),
      subtotal: Number(data.subtotal),
      taxAmount: Number(data.tax_amount),
      totalAmount: Number(data.total_amount),
      totalWeightKg: Number(data.total_weight_kg),
      status: data.status,
      notes: data.notes
    };
  }

  // --- Inward Gate Passes (Bales / Consignments) ---
  public static async getInwardGatePasses(): Promise<InwardGatePass[]> {
    const { data, error } = await supabase
      .from('inward_gate_passes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error on inward_gate_passes:', error);
      throw new Error(error.message || 'Database error occurred reading inward gate passes');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      passNo: row.pass_no || row.passNo,
      purchaseInvoiceId: row.purchase_invoice_id || row.purchaseInvoiceId,
      supplierName: row.supplier_name || row.supplierName || '',
      baleTagNo: row.bale_tag_no || row.baleTagNo || '',
      weightKg: Number(row.weight_kg ?? row.weightKg ?? 0),
      status: row.status || 'CLEARED',
      piecesCount: Number(row.pieces_count || 0),
      createdAt: row.created_at
    }));
  }

  public static async getGatePasses(): Promise<InwardGatePass[]> {
    return this.getInwardGatePasses();
  }

  public static async addInwardGatePass(igp: Partial<InwardGatePass>): Promise<InwardGatePass> {
    const id = igp.id || `igp-${Date.now()}`;
    const payload = {
      id,
      pass_no: igp.passNo || `IGP-${Date.now().toString().slice(-6)}`,
      purchase_invoice_id: igp.purchaseInvoiceId,
      supplier_name: igp.supplierName || '',
      bale_tag_no: igp.baleTagNo || '',
      weight_kg: Number(igp.weightKg || 0),
      status: igp.status || 'CLEARED'
    };

    const { data, error } = await supabase
      .from('inward_gate_passes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on inward_gate_passes:', error);
      throw new Error(error.message || 'Failed to create inward gate pass');
    }

    return {
      id: data.id,
      passNo: data.pass_no,
      purchaseInvoiceId: data.purchase_invoice_id,
      supplierName: data.supplier_name,
      baleTagNo: data.bale_tag_no,
      weightKg: Number(data.weight_kg),
      status: data.status,
      createdAt: data.created_at
    };
  }

  public static async updateInwardGatePass(id: string, updates: Partial<InwardGatePass>): Promise<void> {
    const payload: any = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.weightKg !== undefined) payload.weight_kg = Number(updates.weightKg);
    if (updates.baleTagNo !== undefined) payload.bale_tag_no = updates.baleTagNo;
    if (updates.supplierName !== undefined) payload.supplier_name = updates.supplierName;

    const { error } = await supabase.from('inward_gate_passes').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on inward_gate_passes:', error);
      throw new Error(error.message || 'Failed to update inward gate pass');
    }
  }

  // --- Individual Garment Pieces ---
  public static async getInventoryPieces(limit = 500): Promise<PieceBreakdownItem[]> {
    const { data, error } = await supabase
      .from('inventory_pieces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Database error occurred reading inventory pieces');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      gatePassId: row.gate_pass_id || row.gatePassId,
      barcode: row.barcode,
      itemName: row.item_name || row.itemName,
      brandName: row.brand_name || row.brandName || '',
      brandTier: row.brand_tier || row.brandTier || 'Grail',
      labelGrade: row.label_grade || row.labelGrade || 'CREAM',
      shopLocation: row.shop_location || row.shopLocation || 'Central Warehouse (Al Quoz)',
      weightKg: Number(row.weight_kg ?? row.weightKg ?? 0),
      weightGrams: Number(row.weight_grams ?? row.weightGrams ?? 0),
      costPrice: Number(row.cost_price ?? row.costPrice ?? 0),
      estimatedPrice: Number(row.estimated_price ?? row.estimatedPrice ?? 0),
      retailPriceAed: Number(row.retail_price_aed ?? row.retailPriceAed ?? row.estimated_price ?? 0),
      sizeScanned: row.size_scanned || row.sizeScanned || 'L',
      countryOfOrigin: row.country_of_origin || row.countryOfOrigin || '',
      style: row.style || '',
      frontImageUrl: row.front_image_url || row.frontImageUrl || '',
      backImageUrl: row.back_image_url || row.backImageUrl || '',
      tagImageUrl: row.tag_image_url || row.tagImageUrl || '',
      isSold: Boolean(row.is_sold ?? row.isSold),
      status: row.status || (row.is_sold ? 'SOLD' : 'AVAILABLE'),
      lockedByBuyer: row.locked_by_buyer || row.lockedByBuyer || '',
      lockedByBooth: row.locked_by_booth || row.lockedByBooth || '',
      lockExpiresAt: row.lock_expires_at || row.lockExpiresAt,
      reservedUntil: row.reserved_until || row.reservedUntil,
      createdAt: row.created_at
    }));
  }

  public static async addInventoryPiece(piece: Partial<PieceBreakdownItem>): Promise<PieceBreakdownItem> {
    const id = piece.id || `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const barcode = piece.barcode || `VV-${Date.now().toString().slice(-6)}`;
    const payload = {
      id,
      barcode,
      gate_pass_id: piece.gatePassId,
      item_name: piece.itemName || 'Garment Piece',
      brand_name: piece.brandName || '',
      brand_tier: piece.brandTier || 'Grail',
      label_grade: piece.labelGrade || 'CREAM',
      shop_location: piece.shopLocation || 'Central Warehouse (Al Quoz)',
      weight_kg: Number(piece.weightKg || 0),
      weight_grams: Number(piece.weightGrams || (Number(piece.weightKg || 0) * 1000)),
      cost_price: Number(piece.costPrice || 0),
      estimated_price: Number(piece.estimatedPrice || piece.retailPriceAed || 0),
      retail_price_aed: Number(piece.retailPriceAed || piece.estimatedPrice || 0),
      size_scanned: piece.sizeScanned || 'L',
      country_of_origin: piece.countryOfOrigin || '',
      style: piece.style || '',
      front_image_url: piece.frontImageUrl || '',
      back_image_url: piece.backImageUrl || '',
      tag_image_url: piece.tagImageUrl || '',
      is_sold: Boolean(piece.isSold),
      status: piece.status || 'AVAILABLE'
    };

    const { data, error } = await supabase
      .from('inventory_pieces')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to save inventory piece');
    }

    return {
      id: data.id,
      barcode: data.barcode,
      itemName: data.item_name,
      brandName: data.brand_name,
      brandTier: data.brand_tier,
      labelGrade: data.label_grade,
      shopLocation: data.shop_location,
      weightKg: Number(data.weight_kg),
      weightGrams: Number(data.weight_grams),
      costPrice: Number(data.cost_price),
      estimatedPrice: Number(data.estimated_price),
      retailPriceAed: Number(data.retail_price_aed),
      sizeScanned: data.size_scanned,
      countryOfOrigin: data.country_of_origin,
      style: data.style,
      frontImageUrl: data.front_image_url,
      backImageUrl: data.back_image_url,
      tagImageUrl: data.tag_image_url,
      isSold: data.is_sold,
      status: data.status,
      createdAt: data.created_at
    };
  }

  public static async updateInventoryPiece(id: string, updates: Partial<PieceBreakdownItem>): Promise<void> {
    const payload: any = {};
    if (updates.itemName !== undefined) payload.item_name = updates.itemName;
    if (updates.brandName !== undefined) payload.brand_name = updates.brandName;
    if (updates.brandTier !== undefined) payload.brand_tier = updates.brandTier;
    if (updates.labelGrade !== undefined) payload.label_grade = updates.labelGrade;
    if (updates.shopLocation !== undefined) payload.shop_location = updates.shopLocation;
    if (updates.retailPriceAed !== undefined) payload.retail_price_aed = Number(updates.retailPriceAed);
    if (updates.sizeScanned !== undefined) payload.size_scanned = updates.sizeScanned;
    if (updates.frontImageUrl !== undefined) payload.front_image_url = updates.frontImageUrl;
    if (updates.backImageUrl !== undefined) payload.back_image_url = updates.backImageUrl;
    if (updates.tagImageUrl !== undefined) payload.tag_image_url = updates.tagImageUrl;
    if (updates.isSold !== undefined) payload.is_sold = updates.isSold;
    if (updates.status !== undefined) payload.status = updates.status;

    const { error } = await supabase
      .from('inventory_pieces')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to update inventory piece');
    }
  }

  public static async deleteInventoryPiece(id: string): Promise<void> {
    const { error } = await supabase.from('inventory_pieces').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to delete inventory piece');
    }
  }

  // --- Bale Presets Catalog ---
  public static async getBalePresets(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('bale_presets')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.warn('Supabase error reading bale_presets:', error);
        try {
          const cached = localStorage.getItem('vintage_bale_presets_cache');
          if (cached) return JSON.parse(cached);
        } catch {}
        return [];
      }

      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        code: r.item_code || r.code || `BALE-${r.id}`,
        name: r.name,
        category: r.category || 'Apparel',
        uom: r.uom || 'BALES',
        targetUom: r.uom || 'BALES',
        stdWeight: Number(r.std_weight ?? 45),
        weightKg: Number(r.std_weight ?? 45),
        basePrice: Number(r.base_rate ?? 0),
        baseRate: Number(r.base_rate ?? 0),
        status: 'POSTED',
        isActive: true
      }));

      try {
        localStorage.setItem('vintage_bale_presets_cache', JSON.stringify(mapped));
      } catch {}

      return mapped;
    } catch (e) {
      console.warn('Failed to fetch bale presets:', e);
      try {
        const cached = localStorage.getItem('vintage_bale_presets_cache');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
  }
}

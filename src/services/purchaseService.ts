import { supabase } from '../supabaseClient.ts';
import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem } from '../modules/purchase/purchase.types.ts';

export class PurchaseService {
  // --- Purchase Invoices ---
  public static async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    const [invResult, itemsResult] = await Promise.all([
      supabase
        .from('purchase_invoices')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_invoice_items')
        .select('*')
    ]);

    if (invResult.error) {
      console.error('Supabase error on purchase_invoices:', invResult.error);
      throw new Error(invResult.error.message || 'Database error occurred reading purchase invoices');
    }

    const itemsByInvoiceId = new Map<string, any[]>();
    (itemsResult.data || []).forEach((itemRow: any) => {
      const invId = String(itemRow.invoice_id);
      if (!itemsByInvoiceId.has(invId)) {
        itemsByInvoiceId.set(invId, []);
      }
      itemsByInvoiceId.get(invId)!.push({
        id: String(itemRow.id),
        itemId: itemRow.item_code || itemRow.id,
        itemCode: itemRow.item_code || 'VINT-01',
        itemName: itemRow.item_name || itemRow.description || 'Vintage Mix Bales',
        packagingUom: itemRow.packaging_uom || itemRow.packaging || 'BALES',
        packageCount: Number(itemRow.package_count ?? itemRow.quantity ?? 1),
        weightUom: 'KG',
        totalWeight: Number(itemRow.total_weight ?? itemRow.total_kg ?? 0),
        ratePerWeight: Number(itemRow.rate_per_weight ?? itemRow.rate ?? 0),
        lineTotal: Number(itemRow.line_total ?? 0)
      });
    });

    return (invResult.data || []).map((row: any) => {
      const rawDate = row.issue_date || row.invoice_date || row.created_at;
      let cleanDate = '';
      if (rawDate) {
        try {
          const d = new Date(rawDate);
          cleanDate = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
        } catch {
          cleanDate = String(rawDate).slice(0, 10);
        }
      }

      const totalWeightKg = Number(row.total_weight_kg ?? row.totalWeightKg ?? 0);
      const totalAmount = Number(row.total_amount ?? row.total_payable ?? row.totalAmount ?? 0);
      const loadedItems = itemsByInvoiceId.get(String(row.id)) || [];

      // If no items in database, provide a default breakdown item from invoice header
      const items = loadedItems.length > 0 ? loadedItems : [
        {
          id: `item-${row.id}-1`,
          itemId: 'VINT-BAL-01',
          itemCode: 'VINT-BAL-01',
          itemName: 'Vintage Mix Bales',
          packagingUom: 'BALES',
          packageCount: 1,
          weightUom: 'KG',
          totalWeight: totalWeightKg || 45,
          ratePerWeight: totalWeightKg > 0 ? Number((totalAmount / totalWeightKg).toFixed(2)) : 0,
          lineTotal: totalAmount
        }
      ];

      return {
        id: row.id,
        invoiceNo: row.invoice_no || row.invoiceNo,
        supplierId: row.supplier_id || row.supplierId,
        supplier_id: row.supplier_id || row.supplierId,
        supplierName: row.supplier_name || row.party_name || row.supplier || row.supplierName || '',
        supplier_name: row.supplier_name || row.party_name || row.supplier || row.supplierName || '',
        supplierTrn: row.supplier_trn || row.trn || '',
        date: cleanDate,
        invoiceDate: row.invoice_date || row.invoiceDate || cleanDate,
        issue_date: row.issue_date || row.invoice_date,
        currency: row.currency || 'AED',
        exchangeRate: Number(row.exchange_rate ?? row.exchangeRate ?? 1),
        subtotal: Number(row.subtotal || 0),
        subTotal: Number(row.subtotal || 0),
        taxAmount: Number(row.tax_amount ?? row.vat_amount ?? row.taxAmount ?? 0),
        vatAmount: Number(row.vat_amount ?? row.tax_amount ?? row.vatAmount ?? 0),
        totalAmount,
        totalWeightKg,
        status: row.status || 'RECEIVED',
        notes: row.notes || '',
        containerNo: row.container_no || row.containerNo || '',
        blAirwayBillNo: row.bl_no || row.bl_airway_bill_no || row.blAirwayBillNo || '',
        convertedToInward: Boolean(row.converted_to_inward || row.convertedToInward),
        items,
        totalBalesCount: items.reduce((acc: number, it: any) => acc + (Number(it.packageCount) || 1), 0),
        createdAt: row.created_at,
        created_at: row.created_at
      } as PurchaseInvoice;
    });
  }

  public static async unpostPurchaseInvoice(invoiceId: string): Promise<void> {
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ status: 'DRAFT' })
      .eq('id', String(invoiceId));
    if (error) {
      console.error('Supabase error unposting purchase invoice:', error);
      throw new Error(error.message || 'Failed to unpost purchase invoice');
    }
  }

  public static async addPurchaseInvoice(inv: Partial<PurchaseInvoice>): Promise<PurchaseInvoice> {
    const id = inv.id || `pi-${Date.now()}`;
    const payload = {
      id,
      invoice_no: inv.invoiceNo || `PINV-${Date.now().toString().slice(-6)}`,
      supplier_id: inv.supplierId || (inv as any).supplier_id,
      supplier_name: inv.supplierName || (inv as any).supplier_name || '',
      party_name: inv.supplierName || (inv as any).supplier_name || '',
      invoice_date: inv.invoiceDate || inv.date || new Date().toISOString().slice(0, 10),
      currency: inv.currency || 'AED',
      exchange_rate: Number(inv.exchangeRate || 1),
      subtotal: Number(inv.subtotal || (inv as any).subTotal || 0),
      tax_amount: Number(inv.taxAmount || inv.vatAmount || 0),
      total_amount: Number(inv.totalAmount || 0),
      total_weight_kg: Number(inv.totalWeightKg || (inv as any).totalGrossWeightKg || 0),
      container_no: inv.containerNo || '',
      bl_no: inv.blAirwayBillNo || '',
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
      supplierName: data.supplier_name || inv.supplierName || '',
      date: data.invoice_date,
      invoiceDate: data.invoice_date,
      currency: data.currency,
      exchangeRate: Number(data.exchange_rate),
      subtotal: Number(data.subtotal),
      subTotal: Number(data.subtotal),
      taxAmount: Number(data.tax_amount),
      vatAmount: Number(data.tax_amount),
      totalAmount: Number(data.total_amount),
      totalWeightKg: Number(data.total_weight_kg),
      status: data.status,
      notes: data.notes,
      convertedToInward: false
    } as PurchaseInvoice;
  }

  public static async deletePurchaseInvoice(invoiceId: string): Promise<void> {
    // 1. Delete associated manifest line items first
    const { error: itemsError } = await supabase
      .from('purchase_invoice_items')
      .delete()
      .eq('invoice_id', String(invoiceId));
    if (itemsError) console.warn("Items delete warning:", itemsError);

    // 2. Delete associated unopened inward gate pass bales
    await supabase
      .from('inward_gate_passes')
      .delete()
      .eq('purchase_invoice_id', String(invoiceId));

    // 3. Delete the invoice record
    const { error: invoiceError } = await supabase
      .from('purchase_invoices')
      .delete()
      .eq('id', String(invoiceId));
    if (invoiceError) {
      console.error("Failed to delete invoice:", invoiceError);
      throw new Error(invoiceError.message || 'Failed to delete invoice');
    }
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
  public static async getInventoryPieces(limit = 1000): Promise<PieceBreakdownItem[]> {
    const [invRes, sortedRes] = await Promise.all([
      supabase
        .from('inventory_pieces')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('bale_sorted_pieces')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
    ]);

    const mappedPieces: PieceBreakdownItem[] = [];
    const seenBarcodes = new Set<string>();

    (invRes.data || []).forEach((row: any) => {
      const barcode = row.barcode || row.piece_code || row.id;
      seenBarcodes.add(barcode);
      mappedPieces.push({
        id: row.id,
        gatePassId: row.gate_pass_id || row.gatePassId,
        barcode,
        itemName: row.item_name || row.itemName || 'Garment Piece',
        brandName: row.brand_name || row.brandName || '',
        brandTier: row.brand_tier || row.brandTier || 'Grail',
        labelGrade: row.label_grade || row.labelGrade || 'CREAM',
        shopLocation: row.shop_location || row.shopLocation || 'Central Warehouse (Al Quoz)',
        weightKg: Number(row.weight_kg ?? (Number(row.weight_grams || 0) / 1000)),
        weightGrams: Number(row.weight_grams ?? (Number(row.weight_kg || 0) * 1000)),
        costPrice: Number(row.cost_price ?? row.costPrice ?? 0),
        calculatedCostPrice: Number(row.cost_price ?? row.costPrice ?? 0),
        costPerGram: Number(row.cost_per_gram ?? (Number(row.weight_grams || 0) > 0 ? (Number(row.cost_price || 0) / Number(row.weight_grams)) : 0)),
        estimatedPrice: Number(row.estimated_price ?? row.retailPriceAed ?? 0),
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
      });
    });

    (sortedRes.data || []).forEach((row: any) => {
      const barcode = row.piece_code || row.barcode || row.id;
      if (!seenBarcodes.has(barcode)) {
        seenBarcodes.add(barcode);
        const wGrams = Number(row.weight_grams || 0);
        const cPrice = Number(row.cost_price || 0);
        const sPrice = Number(row.selling_price || 0);
        mappedPieces.push({
          id: row.id,
          gatePassId: row.bale_id || '',
          barcode,
          itemName: row.category || 'Garment Piece',
          brandName: row.brand_title || '',
          brandTier: 'Vintage Curated',
          labelGrade: row.quality_grade || 'Grade A+',
          shopLocation: 'Central Warehouse (Al Quoz)',
          weightKg: wGrams > 0 ? Number((wGrams / 1000).toFixed(3)) : 0,
          weightGrams: wGrams,
          costPrice: cPrice,
          calculatedCostPrice: cPrice,
          costPerGram: wGrams > 0 ? Number((cPrice / wGrams).toFixed(6)) : 0,
          estimatedPrice: sPrice,
          retailPriceAed: sPrice,
          sizeScanned: row.size || 'L',
          countryOfOrigin: 'USA',
          style: row.brand_title || '',
          frontImageUrl: row.front_image || '',
          backImageUrl: row.back_image || '',
          tagImageUrl: row.tag_image || '',
          isSold: false,
          status: 'AVAILABLE',
          createdAt: row.created_at
        });
      }
    });

    return mappedPieces;
  }

  public static async finalizeBaleSession(baleId: string): Promise<void> {
    // 1. Update bale_sessions
    await supabase
      .from('bale_sessions')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('bale_id', baleId);

    // 2. Update inward_gate_passes
    await supabase
      .from('inward_gate_passes')
      .update({ status: 'COMPLETED' })
      .eq('id', baleId);

    // 3. Move/sync all pieces from bale_sorted_pieces into inventory_pieces
    const { data: sortedPieces } = await supabase
      .from('bale_sorted_pieces')
      .select('*')
      .eq('bale_id', baleId);

    if (sortedPieces && sortedPieces.length > 0) {
      const inventoryRows = sortedPieces.map((p: any) => ({
        id: p.id,
        gate_pass_id: baleId,
        barcode: p.piece_code || p.id,
        item_name: p.category || 'Vintage Garment',
        brand_name: p.brand_title || '',
        brand_tier: 'Grail',
        label_grade: p.quality_grade || 'CREAM',
        shop_location: 'Central Warehouse (Al Quoz)',
        weight_kg: Number(p.weight_grams ? (Number(p.weight_grams) / 1000) : 0),
        weight_grams: Number(p.weight_grams || 0),
        cost_price: Number(p.cost_price || 0),
        estimated_price: Number(p.selling_price || 0),
        retail_price_aed: Number(p.selling_price || 0),
        size_scanned: p.size || 'L',
        front_image_url: p.front_image || '',
        back_image_url: p.back_image || '',
        tag_image_url: p.tag_image || '',
        is_sold: false,
        status: 'AVAILABLE'
      }));

      await supabase
        .from('inventory_pieces')
        .upsert(inventoryRows, { onConflict: 'id' });
    }
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

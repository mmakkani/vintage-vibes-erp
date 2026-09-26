import { supabase } from '../supabaseClient.ts';
import { SalesInvoice } from '../modules/sales/sales.types.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';
import { FinanceService, generateLedgerUuid } from './financeService.ts';
import { SequenceService } from './sequenceService.ts';

export class SalesService {
  public static readonly SALES_INVOICE_GRID_COLUMNS = 'id, invoice_no, client_id, customer_name, customer_phone, subtotal, tax_amount, total_amount, status, payment_method, invoice_date, created_at, items';

  /**
   * CRITICAL GLOBAL INVENTORY RESERVATION (Prevent Double-Selling)
   * The moment an item is added to a cart/draft across any channel:
   * UPDATE inventory_pieces SET status = 'RESERVED' WHERE id = [piece_id] AND status = 'IN_STOCK'
   * If the update returns 0 rows, it throws: "Item already reserved by another user."
   */
  public static async reservePiece(identifier: string | { id?: string; barcode?: string }): Promise<any> {
    const isObj = typeof identifier === 'object' && identifier !== null;
    const pieceId = isObj ? identifier.id : identifier;
    const barcode = isObj ? identifier.barcode : identifier;

    const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim()));

    let data: any[] | null = null;
    let error: any = null;

    if (pieceId && isUuid(pieceId)) {
      const res = await supabase
        .from('inventory_pieces')
        .update({ status: 'RESERVED', updated_at: new Date().toISOString() })
        .eq('id', pieceId.trim())
        .eq('status', 'IN_STOCK')
        .select();
      data = res.data;
      error = res.error;
    }

    if ((!data || data.length === 0) && barcode) {
      const res = await supabase
        .from('inventory_pieces')
        .update({ status: 'RESERVED', updated_at: new Date().toISOString() })
        .eq('barcode', barcode.trim())
        .eq('status', 'IN_STOCK')
        .select();
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error('[SalesService] reservePiece DB error:', error);
      throw new Error('Item already reserved by another user.');
    }

    if (!data || data.length === 0) {
      throw new Error('Item already reserved by another user.');
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('vv:realtime-record', {
          detail: { table: 'inventory_pieces', eventType: 'UPDATE', new: data[0] }
        }));
        window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
          detail: { module: 'inventory', entity: 'inventory_pieces', action: 'UPDATE', documentRef: data[0].barcode || barcode }
        }));
      } catch (_) {}
    }

    return data[0];
  }

  /**
   * Release reservation on "Remove" or "Timer Expiry"
   * UPDATE inventory_pieces SET status = 'IN_STOCK' WHERE id = [piece_id]
   */
  public static async releasePiece(identifier: string | { id?: string; barcode?: string }): Promise<any> {
    const isObj = typeof identifier === 'object' && identifier !== null;
    const pieceId = isObj ? identifier.id : identifier;
    const barcode = isObj ? identifier.barcode : identifier;

    const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim()));

    let data: any[] | null = null;

    if (pieceId && isUuid(pieceId)) {
      const res = await supabase
        .from('inventory_pieces')
        .update({ status: 'IN_STOCK', updated_at: new Date().toISOString() })
        .eq('id', pieceId.trim())
        .select();
      data = res.data;
    }

    if ((!data || data.length === 0) && barcode) {
      const res = await supabase
        .from('inventory_pieces')
        .update({ status: 'IN_STOCK', updated_at: new Date().toISOString() })
        .eq('barcode', barcode.trim())
        .select();
      data = res.data;
    }

    if (typeof window !== 'undefined' && data && data.length > 0) {
      try {
        window.dispatchEvent(new CustomEvent('vv:realtime-record', {
          detail: { table: 'inventory_pieces', eventType: 'UPDATE', new: data[0] }
        }));
        window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
          detail: { module: 'inventory', entity: 'inventory_pieces', action: 'UPDATE', documentRef: data[0].barcode || barcode }
        }));
      } catch (_) {}
    }

    return data && data.length > 0 ? data[0] : null;
  }

  public static async getSalesInvoicesPaginated(options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    paymentMethod?: string;
    channel?: string;
  }): Promise<PaginatedResponse<SalesInvoice>> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, options?.pageSize || 10);
    const search = options?.search?.trim() || '';
    const status = options?.status?.trim() || '';
    const paymentMethod = options?.paymentMethod?.trim() || '';
    const channel = options?.channel?.trim() || '';

    let query = supabase
      .from('sales_invoices')
      .select(SalesService.SALES_INVOICE_GRID_COLUMNS, { count: 'exact' });

    if (search) {
      query = query.or(`invoice_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    }
    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }
    if (paymentMethod && paymentMethod !== 'ALL') {
      query = query.eq('payment_method', paymentMethod);
    }
    if (channel && channel !== 'ALL') {
      if (channel === 'POS') {
        query = query.in('channel', ['POS', 'POS_COUNTER']);
      } else if (channel === 'LIVE') {
        query = query.in('channel', ['LIVE', 'LIVE_STREAM', 'TIKTOK_LIVE', 'INSTAGRAM_LIVE']);
      } else {
        query = query.eq('channel', channel);
      }
    }

    query = applyPagination(query, page, pageSize, {
      orderBy: 'created_at',
      ascending: false,
      secondaryOrderBy: 'id',
      secondaryAscending: false
    });

    const { data, count, error } = await query;
    if (error) {
      console.warn('[SalesService] Paginated sales invoices query notice:', error.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }

    const mapped = (data || []).map((row: any) => {
      let parsedItems: any[] = [];
      if (Array.isArray(row.items)) {
        parsedItems = row.items;
      } else if (typeof row.items === 'string') {
        try {
          const parsed = JSON.parse(row.items);
          if (Array.isArray(parsed)) parsedItems = parsed;
        } catch {}
      }
      const rawDate = row.invoice_date || row.invoiceDate || (row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));
      const subVal = Number(row.subtotal ?? row.sub_total ?? row.total_amount ?? 0);
      const vatVal = Number(row.tax_amount ?? row.vat_amount ?? row.taxAmount ?? row.vatAmount ?? 0);
      const totalVal = Number(row.total_amount ?? row.totalAmount ?? (subVal + vatVal));

      return {
        id: row.id,
        invoiceNo: row.invoice_no || row.invoiceNo || `SINV-${row.id || Date.now()}`,
        clientId: row.client_id || row.clientId,
        customerId: row.client_id || row.clientId || row.customer_id || '',
        customerName: row.customer_name || row.customerName || 'Walk-in Guest',
        customerPhone: row.customer_phone || row.customerPhone || '',
        invoiceDate: rawDate,
        date: rawDate,
        time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:30',
        channel: row.channel || 'POS_COUNTER',
        paymentMethod: row.payment_method || row.paymentMethod || 'CASH',
        paymentStatus: row.payment_status || row.paymentStatus || (row.status === 'PAID' ? 'PAID' : 'UNPAID_PENDING_COD'),
        paymentReference: row.payment_reference || row.paymentReference || '',
        shippingAddress: row.shipping_address || row.shippingAddress || '',
        city: row.city || '',
        courierPartyId: row.courier_party_id || row.courierPartyId || row.courier_partner_id,
        trackingNumber: row.tracking_number || row.trackingNumber,
        buyerHandle: row.buyer_handle || row.buyerHandle,
        boothId: row.booth_id || row.boothId,
        expiresAt: row.expires_at || row.expiresAt,
        orderId: row.order_id || row.orderId,
        subtotal: subVal,
        subTotal: subVal,
        discountAmount: Number(row.discount_amount ?? row.discountAmount ?? 0),
        taxAmount: vatVal,
        vatAmount: vatVal,
        totalAmount: totalVal,
        grandTotalAED: totalVal,
        status: row.status || 'PAID',
        items: parsedItems,
        createdAt: row.created_at
      } as SalesInvoice;
    });

    return buildPaginatedResponse(mapped, count || 0, page, pageSize);
  }

  public static async getSalesInvoices(options?: { limit?: number; offset?: number; page?: number }): Promise<SalesInvoice[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset ?? (options?.page ? (options.page - 1) * limit : 0);

    // 1. Primary route: Query server endpoint connected directly to PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/sales/invoices?limit=${limit}&offset=${offset}&_t=${Date.now()}`);
        if (apiRes && apiRes.ok) {
          const list = await apiRes.json();
          if (Array.isArray(list) && list.length > 0) {
            return list;
          }
        }
      } catch (_) {}
    }

    // 2. Universal fallback: Direct Supabase client query
    let rows: any[] = [];
    try {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select(SalesService.SALES_INVOICE_GRID_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && Array.isArray(data)) {
        rows = data;
      } else if (error) {
        console.warn('Supabase query notice on sales_invoices:', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase fetch exception on sales_invoices:', err?.message);
    }

    return rows.map((row: any) => {
      let parsedItems: any[] = [];
      if (Array.isArray(row.items)) {
        parsedItems = row.items;
      } else if (typeof row.items === 'string') {
        try {
          const parsed = JSON.parse(row.items);
          if (Array.isArray(parsed)) parsedItems = parsed;
        } catch {}
      }
      const rawDate = row.invoice_date || row.invoiceDate || (row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));
      const subVal = Number(row.subtotal ?? row.sub_total ?? row.total_amount ?? 0);
      const vatVal = Number(row.tax_amount ?? row.vat_amount ?? row.taxAmount ?? row.vatAmount ?? 0);
      const totalVal = Number(row.total_amount ?? row.totalAmount ?? (subVal + vatVal));

      return {
        id: row.id,
        invoiceNo: row.invoice_no || row.invoiceNo || `SINV-${row.id || Date.now()}`,
        clientId: row.client_id || row.clientId,
        customerId: row.client_id || row.clientId || row.customer_id || '',
        customerName: row.customer_name || row.customerName || 'Walk-in Guest',
        customerPhone: row.customer_phone || row.customerPhone || '',
        invoiceDate: rawDate,
        date: rawDate,
        time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:30',
        channel: row.channel || 'POS_COUNTER',
        paymentMethod: row.payment_method || row.paymentMethod || 'CASH',
        paymentStatus: row.payment_status || row.paymentStatus || (row.status === 'PAID' ? 'PAID' : 'UNPAID_PENDING_COD'),
        paymentReference: row.payment_reference || row.paymentReference || '',
        shippingAddress: row.shipping_address || row.shippingAddress || '',
        city: row.city || '',
        courierPartyId: row.courier_party_id || row.courierPartyId || row.courier_partner_id,
        trackingNumber: row.tracking_number || row.trackingNumber,
        buyerHandle: row.buyer_handle || row.buyerHandle,
        boothId: row.booth_id || row.boothId,
        expiresAt: row.expires_at || row.expiresAt,
        orderId: row.order_id || row.orderId,
        subtotal: subVal,
        subTotal: subVal,
        discountAmount: Number(row.discount_amount ?? row.discountAmount ?? 0),
        taxAmount: vatVal,
        vatAmount: vatVal,
        totalAmount: totalVal,
        grandTotalAED: totalVal,
        status: row.status || 'PAID',
        items: parsedItems,
        createdAt: row.created_at
      };
    });
  }

  public static async createSalesInvoice(inv: Partial<SalesInvoice>): Promise<SalesInvoice> {
    const id = String(inv.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `inv-${Date.now()}`));
    const invoiceDate = inv.invoiceDate || (inv as any).date || new Date().toISOString().slice(0, 10);
    let invoiceNo = String(inv.invoiceNo || (inv as any).invoice_no || '').trim();
    if (!invoiceNo || invoiceNo.startsWith('SINV-')) {
      invoiceNo = await SequenceService.getNextNumber('SAL', invoiceDate);
    }
    const rawClientId = inv.clientId ? String(inv.clientId).trim() : '';
    const cleanClientId = (rawClientId && !rawClientId.toLowerCase().includes('walk') && rawClientId !== 'none' && rawClientId !== 'undefined' && rawClientId !== 'null') ? rawClientId : null;
    const payload = {
      id,
      invoice_no: invoiceNo,
      client_id: cleanClientId,
      customer_name: inv.customerName || 'Walk-in Buyer',
      customer_phone: inv.customerPhone || '',
      invoice_date: invoiceDate,
      channel: inv.channel || 'POS_COUNTER',
      payment_method: inv.paymentMethod || 'CASH',
      subtotal: Number(inv.subtotal || 0),
      discount_amount: Number(inv.discountAmount || 0),
      tax_amount: Number(inv.taxAmount || 0),
      total_amount: Number(inv.totalAmount || 0),
      status: inv.status || 'PAID',
      items: inv.items || []
    };

    const { data, error } = await supabase
      .from('sales_invoices')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on sales_invoices:', error);
      throw new Error(error.message || 'Failed to record sales invoice');
    }

    // 3-State Lifecycle: If DRAFT, reserve pieces. If POSTED/PAID, mark SOLD.
    if (Array.isArray(inv.items) && inv.items.length > 0) {
      const pieceIds = inv.items.map((item: any) => item.pieceId || item.id || item.barcode).filter(Boolean);
      if (pieceIds.length > 0) {
        const isDraft = (inv.status || 'PAID') === 'DRAFT';
        const targetStatus = isDraft ? 'RESERVED' : 'SOLD';
        const isSoldFlag = !isDraft;
        await Promise.all([
          supabase.from('inventory_pieces').update({ is_sold: isSoldFlag, status: targetStatus }).in('id', pieceIds),
          supabase.from('inventory_pieces').update({ is_sold: isSoldFlag, status: targetStatus }).in('barcode', pieceIds)
        ]).catch(err => console.warn('[SalesService] Batch update piece status notice:', err));
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
          detail: { module: 'sales', entity: 'sales_invoices', action: 'CREATED', documentRef: invoiceNo }
        }));
      } catch (_) {}
    }

    return {
      id: data.id,
      invoiceNo: data.invoice_no,
      clientId: data.client_id,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      invoiceDate: data.invoice_date,
      channel: data.channel,
      paymentMethod: data.payment_method,
      subtotal: Number(data.subtotal),
      discountAmount: Number(data.discount_amount),
      taxAmount: Number(data.tax_amount),
      totalAmount: Number(data.total_amount),
      status: data.status,
      items: data.items,
      createdAt: data.created_at
    };
  }

  public static async updateSalesInvoice(id: string, updates: Partial<SalesInvoice>): Promise<void> {
    const payload: any = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.totalAmount !== undefined) payload.total_amount = Number(updates.totalAmount);
    if (updates.items !== undefined) payload.items = updates.items;

    const { error } = await supabase.from('sales_invoices').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on sales_invoices:', error);
      throw new Error(error.message || 'Failed to update sales invoice');
    }

    // 3-State Lifecycle transitions on invoice update
    if (updates.status === 'POSTED' || updates.status === 'PAID') {
      let itemsToMark: any = updates.items;
      if (!itemsToMark) {
        const { data: currentInv } = await supabase.from('sales_invoices').select('items').eq('id', id).maybeSingle();
        itemsToMark = currentInv?.items;
      }
      if (Array.isArray(itemsToMark) && itemsToMark.length > 0) {
        const pieceIds = itemsToMark.map((it: any) => it.pieceId || it.id || it.barcode).filter(Boolean);
        if (pieceIds.length > 0) {
          await Promise.all([
            supabase.from('inventory_pieces').update({ is_sold: true, status: 'SOLD' }).in('id', pieceIds),
            supabase.from('inventory_pieces').update({ is_sold: true, status: 'SOLD' }).in('barcode', pieceIds)
          ]).catch(err => console.warn('[SalesService] Error marking items SOLD on invoice update:', err));
        }
      }
    }
  }

  public static async unpostSalesInvoice(id: string): Promise<void> {
    const cleanId = String(id).trim();

    // 0. Fetch sales invoice row to retrieve metadata
    const { data: invRow, error: invFetchErr } = await supabase
      .from('sales_invoices')
      .select('id, invoice_no, client_id, customer_name, status, items')
      .eq('id', cleanId)
      .maybeSingle();

    if (invFetchErr || !invRow) {
      throw new Error(`Sales invoice ${cleanId} not found`);
    }

    const invoiceNo = invRow.invoice_no || cleanId;
    let customerId = invRow.client_id;
    if (!customerId && invRow.customer_name) {
      try {
        const { data: pty } = await supabase
          .from('parties')
          .select('id')
          .ilike('name', invRow.customer_name.trim())
          .maybeSingle();
        if (pty?.id) customerId = pty.id;
      } catch (_) {}
    }

    // 1. Restore piece inventory (unmark is_sold)
    let parsedItems: any[] = [];
    if (Array.isArray(invRow.items)) {
      parsedItems = invRow.items;
    } else if (typeof invRow.items === 'string') {
      try {
        parsedItems = JSON.parse(invRow.items);
      } catch (_) {}
    }

    if (Array.isArray(parsedItems) && parsedItems.length > 0) {
      const pieceIds = parsedItems.map((item: any) => item.pieceId || item.id || item.barcode).filter(Boolean);
      if (pieceIds.length > 0) {
        await Promise.all([
          supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('id', pieceIds),
          supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('barcode', pieceIds)
        ]).catch(err => console.warn('[SalesService] Batch restore unsold pieces notice:', err));
      }
    }

    // 2. Cascade delete all financial vouchers, journal entries, and ledger rows (Strict Hard Delete - No Reversals)
    try {
      await FinanceService.cascadeDeleteVouchersForDocument(cleanId, {
        invoiceId: cleanId,
        partyId: customerId,
        docType: 'SALES'
      });
      if (invoiceNo && invoiceNo !== cleanId) {
        await FinanceService.cascadeDeleteVouchersForDocument(invoiceNo, {
          invoiceId: cleanId,
          partyId: customerId,
          docType: 'SALES'
        });
      }
    } catch (vchErr) {
      console.warn('[SalesService] Notice cascading vouchers on sales invoice unpost:', vchErr);
    }

    // 3. Cascade delete party khata logs for this invoice (Strict Hard Delete - No Reversals)
    try {
      const delTokens = [cleanId];
      if (invoiceNo) delTokens.push(invoiceNo);

      for (const tok of delTokens) {
        await supabase
          .from('party_khata_logs')
          .delete()
          .or(`reference.eq.${tok},reference.ilike.%${tok}%,notes.ilike.%${tok}%`);
      }
    } catch (khataErr) {
      console.warn('[SalesService] Notice deleting khata logs on sales invoice unpost:', khataErr);
    }

    // 4. Recalculate customer balance to accurate zero state
    if (customerId) {
      try {
        await FinanceService.recalculatePartyBalance(customerId);
      } catch (_) {}
    }

    // 5. Update invoice status back to 'DRAFT'
    const { error: updateErr } = await supabase
      .from('sales_invoices')
      .update({ status: 'DRAFT' })
      .eq('id', cleanId);

    if (updateErr) {
      throw new Error(`Failed to update sales invoice status to DRAFT: ${updateErr.message}`);
    }

    // 6. Refresh COA cache and balances
    try {
      FinanceService.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

    // 7. Dispatch entity mutation event
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
          detail: {
            module: 'sales',
            entity: 'sales_invoices',
            action: 'UNPOSTED',
            documentRef: invoiceNo,
            affectedModules: ['sales', 'finance']
          }
        }));
      } catch (_) {}
    }
  }

  public static async deleteSalesInvoice(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    try {
      // STEP 1: Fetch the invoice to get the items BEFORE deleting it
      let invoice: any = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanId);
      const { data: invData, error: fetchErr } = await (
        isUuid
          ? supabase.from('sales_invoices').select('id, items, invoice_no, client_id').eq('id', cleanId).maybeSingle()
          : supabase.from('sales_invoices').select('id, items, invoice_no, client_id').or(`id.eq.${cleanId},invoice_no.eq.${cleanId}`).maybeSingle()
      );

      if (fetchErr || !invData) {
        throw new Error('Invoice not found for deletion');
      }
      invoice = invData;

      // STEP 2: Extract barcodes safely
      let items = invoice.items || [];
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch {}
      }
      if (!Array.isArray(items)) items = [];
      const barcodesToRevert = items.map((item: any) => item.barcode).filter(Boolean);
      const pieceIdsToRevert = items.map((item: any) => item.pieceId || item.piece_id || item.id).filter(Boolean);

      // STEP 3: Revert Inventory Pieces FIRST (Fix PGRST204)
      if (barcodesToRevert.length > 0) {
        const { error: invErr } = await supabase
          .from('inventory_pieces')
          .update({ 
            is_sold: false, 
            status: 'IN_STOCK' 
            // CRITICAL: DO NOT include sold_invoice_id (Column does not exist)
          })
          .in('barcode', barcodesToRevert);
          
        if (invErr) console.error('Failed to revert inventory:', invErr);
      }
      if (pieceIdsToRevert.length > 0) {
        try {
          await supabase
            .from('inventory_pieces')
            .update({ 
              is_sold: false, 
              status: 'IN_STOCK' 
            })
            .in('id', pieceIdsToRevert);
        } catch (_) {}
      }

      // STEP 4: Delete Accounting Vouchers safely (Fix 42703)
      // CRITICAL: journal_entries does not have a 'reference' column. Find voucher ID first.
      const invoiceNo = invoice.invoice_no || cleanId;
      const { data: voucher } = await supabase
        .from('financial_vouchers')
        .select('id')
        .or(`reference.eq.${invoiceNo},reference_no.eq.${invoiceNo},reference.eq.${cleanId}`)
        .maybeSingle();

      if (voucher?.id) {
        await supabase.from('voucher_entries').delete().eq('voucher_id', voucher.id);
        await supabase.from('journal_entries').delete().eq('voucher_id', voucher.id);
        await supabase.from('financial_vouchers').delete().eq('id', voucher.id);
        await supabase.from('vouchers').delete().eq('id', voucher.id);
      }

      try {
        await supabase.from('pos_sales').delete().or(`invoice_number.eq.${invoiceNo},invoice_number.eq.${cleanId}`);
      } catch (_) {}

      // STEP 5: Delete the Invoice itself (Fix PGRST205)
      // CRITICAL: Completely REMOVE any reference to deleting from 'sales_items' (Table does not exist)
      const { error: delErr } = await supabase
        .from('sales_invoices')
        .delete()
        .or(`id.eq.${cleanId},invoice_no.eq.${cleanId}`);

      if (delErr) {
        console.error('Failed to delete sales invoice:', delErr);
        throw new Error(delErr.message || 'Failed to delete sales invoice');
      }

      // STEP 6: COA Sync (Fix 22P02)
      // If calling sync_coa_current_balances or updating COA, ensure you use .eq('account_code', code) / .eq('code', code) NOT .eq('id', code)
      if (invoice.client_id) {
        try {
          await FinanceService.recalculatePartyBalance(invoice.client_id);
        } catch (_) {}

        try {
          const isClientUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoice.client_id);
          if (!isClientUuid) {
            await supabase.from('chart_of_accounts').update({ current_balance: 0 }).eq('code', invoice.client_id);
            await supabase.from('coa_accounts').update({ current_balance: 0 }).eq('code', invoice.client_id);
          }
        } catch (_) {}
      }

      try {
        FinanceService.clearCoaCache();
        await supabase.rpc('sync_coa_current_balances');
      } catch (_) {}

      // STEP 7: Dispatch entity mutation event
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
            detail: {
              module: 'sales',
              entity: 'sales_invoices',
              action: 'DELETED',
              documentRef: invoiceNo,
              affectedModules: ['sales', 'finance', 'inventory']
            }
          }));
        } catch (_) {}
      }
    } catch (error) {
      console.error("Deletion failed:", error);
      throw error;
    }
  }

  // ==========================================
  // 1. POS SALES (public.pos_sales) & Stock Decrement
  // ==========================================
  public static async getPosSales(): Promise<any[]> {
    const { data, error } = await supabase
      .from('pos_sales')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pos_sales:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Save a new retail customer directly from POS into public.crm_retail_customers
   * Strictly isolated from core finance and parties table.
   */
  public static async saveRetailCustomer(customer: {
    name: string;
    phone?: string;
    email?: string;
    company?: string;
    address?: string;
  }): Promise<any> {
    const { CrmService } = await import('./crmService.ts');
    return CrmService.saveCrmCustomer(customer);
  }

  /**
   * AI Business / Visiting Card Parser for POS Terminal
   * Extracts { name, phone, email, company } using Gemini AI vision.
   * Strict AI prompt: "Extract the following from this business card as JSON: { name, phone, email, company }. Return ONLY valid JSON."
   */
  public static async parseVisitingCardWithGemini(imageBase64: string): Promise<{
    name: string;
    phone: string;
    email: string;
    company: string;
  }> {
    if (!imageBase64 || imageBase64.length < 50) {
      throw new Error('Please provide a valid business card image.');
    }

    const cleanB64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const envKey =
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
      (typeof window !== 'undefined' && (window as any).__ENV__?.VITE_GEMINI_API_KEY) ||
      (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '').trim() : '');

    const apiKey = (envKey || '').trim();
    const promptText = 'Extract the following from this business card as JSON: { name, phone, email, company }. Return ONLY valid JSON.';

    const models = [
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    if (apiKey) {
      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: promptText },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: cleanB64
                      }
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.1,
                response_mime_type: 'application/json'
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              return {
                name: String(parsed.name || parsed.contactPerson || parsed.contact_person || '').trim(),
                phone: String(parsed.phone || parsed.contact_no || parsed.mobile || '').trim(),
                email: String(parsed.email || '').trim(),
                company: String(parsed.company || parsed.companyName || parsed.company_name || '').trim()
              };
            }
          }
        } catch (e) {
          console.warn(`[SalesService] Gemini ${model} visiting card parse notice:`, e);
        }
      }
    }

    return {
      name: '',
      phone: '',
      email: '',
      company: ''
    };
  }

  /**
   * Fetch customer lifetime purchase insights efficiently for POS quick badge
   */
  public static async getCustomerInsights(clientId: string): Promise<{ totalSpent: number; totalInvoices: number }> {
    if (!clientId) return { totalSpent: 0, totalInvoices: 0 };
    try {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('total_amount')
        .eq('client_id', clientId);
      if (error || !data) return { totalSpent: 0, totalInvoices: 0 };
      const totalSpent = data.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
      return { totalSpent: Number(totalSpent.toFixed(2)), totalInvoices: data.length };
    } catch {
      return { totalSpent: 0, totalInvoices: 0 };
    }
  }

  public static async createPosSale(sale: {
    invoice_number?: string;
    cashier_id?: string;
    customer_name?: string;
    customer_phone?: string;
    items: any[];
    subtotal: number;
    tax_amount?: number;
    discount_amount?: number;
    grand_total: number;
    payment_type?: string;
    payment_status?: string;
  }): Promise<any> {
    const id = String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('pos-' + Date.now()));
    const invoiceNumber = sale.invoice_number || `POS-${Date.now().toString().slice(-6)}`;
    const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val).trim()));
    const validCashierUuid = isUuid(sale.cashier_id) ? String(sale.cashier_id).trim() : null;

    const payload = {
      id,
      invoice_number: invoiceNumber,
      cashier_id: validCashierUuid,
      customer_name: sale.customer_name || 'Walk-in Customer',
      customer_phone: sale.customer_phone || '',
      items: sale.items || [],
      subtotal: sale.subtotal || 0,
      tax_amount: sale.tax_amount || 0,
      discount_amount: sale.discount_amount || 0,
      grand_total: sale.grand_total,
      payment_type: sale.payment_type || 'CASH',
      payment_status: sale.payment_status || 'PAID',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('pos_sales')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating pos_sale:', error);
      throw new Error(error.message);
    }

    // Decrement stock in inventory_items and mark inventory_pieces sold
    if (Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const qty = Number(item.quantity || 1);
        // If inventory item id exists
        if (item.inventory_item_id || item.itemId) {
          const targetId = item.inventory_item_id || item.itemId;
          try {
            const { data: itemData } = await supabase
              .from('inventory_items')
              .select('stock_quantity')
              .eq('id', targetId)
              .maybeSingle();

            if (itemData) {
              const newQty = Math.max(0, (itemData.stock_quantity || 0) - qty);
              await supabase
                .from('inventory_items')
                .update({ stock_quantity: newQty })
                .eq('id', targetId);
            }
          } catch (e) {
            console.warn('Could not decrement inventory_items stock:', e);
          }
        }

        // If piece barcode/id exists
        const pieceId = item.pieceId || item.barcode;
        if (pieceId) {
          try {
            await supabase
              .from('inventory_pieces')
              .update({ is_sold: true, status: 'SOLD' })
              .or(`id.eq.${pieceId},barcode.eq.${pieceId}`);
          } catch (e) {
            console.warn('Could not mark piece sold:', e);
          }
        }
      }
    }

    return data;
  }

  // ==========================================
  // 2. B2B SALES (public.b2b_sales) & Ledgers
  // ==========================================
  public static async getB2bSales(): Promise<any[]> {
    const { data, error } = await supabase
      .from('b2b_sales')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching b2b_sales:', error);
      return [];
    }
    return data || [];
  }

  public static async createB2bSale(b2b: {
    b2b_invoice_number?: string;
    company_name: string;
    trn_number?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    items: any[];
    total_amount: number;
    paid_amount?: number;
    balance_due?: number;
    payment_terms?: string;
    credit_status?: string;
    shipping_address?: string;
  }): Promise<any> {
    const id = String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('b2b-' + Date.now()));
    const invoiceNum = b2b.b2b_invoice_number || `B2B-${Date.now().toString().slice(-6)}`;
    const total = Number(b2b.total_amount || 0);
    const paid = Number(b2b.paid_amount || 0);
    const balance = b2b.balance_due !== undefined ? Number(b2b.balance_due) : (total - paid);

    const payload = {
      id,
      b2b_invoice_number: invoiceNum,
      company_name: b2b.company_name,
      trn_number: b2b.trn_number || '',
      contact_person: b2b.contact_person || '',
      phone: b2b.phone || '',
      email: b2b.email || '',
      items: b2b.items || [],
      total_amount: total,
      paid_amount: paid,
      balance_due: balance,
      payment_terms: b2b.payment_terms || 'Net 30',
      credit_status: b2b.credit_status || (balance <= 0 ? 'PAID' : 'PENDING'),
      shipping_address: b2b.shipping_address || '',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('b2b_sales')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating b2b_sale:', error);
      throw new Error(error.message);
    }

    // Auto-record in ledgers if accounts receivable exists
    try {
      const ledgerId = generateLedgerUuid();
      await supabase.from('ledgers').insert({
        id: ledgerId,
        voucher_id: 'VCH-' + invoiceNum,
        date: new Date().toISOString().slice(0, 10),
        account_code: '1200-00',
        account_name: `Accounts Receivable - ${b2b.company_name}`,
        debit: total,
        credit: 0,
        balance: total,
        narration: `B2B Invoice ${invoiceNum} generated for ${b2b.company_name}`
      });
    } catch (e) {
      console.warn('Auto-ledger entry note for B2B:', e);
    }

    return data;
  }

  // ==========================================
  // 3. E-COMMERCE ORDERS (public.orders)
  // ==========================================
  public static async getOrders(): Promise<any[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
    return data || [];
  }

  public static async createOnlineOrder(order: {
    order_number?: string;
    customer_name: string;
    customer_phone: string;
    customer_address?: string;
    city?: string;
    items: any[];
    total_amount: number;
    delivery_fee?: number;
    payment_method?: string;
    payment_status?: string;
    order_status?: string;
    source?: string;
  }): Promise<any> {
    const id = String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('ord-' + Date.now()));
    const orderNum = order.order_number || `ORD-${Date.now().toString().slice(-6)}`;
    const payload = {
      id,
      order_number: orderNum,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address || '',
      city: order.city || 'Dubai',
      items: order.items || [],
      total_amount: Number(order.total_amount || 0),
      delivery_fee: Number(order.delivery_fee || 0),
      payment_method: order.payment_method || 'COD',
      payment_status: order.payment_status || 'PENDING',
      order_status: order.order_status || 'CONFIRMED',
      source: order.source || 'ONLINE_STORE',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('orders')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating order:', error);
      throw new Error(error.message);
    }
    return data;
  }

  // ==========================================
  // 4. LIVE STREAM SALES (public.live_stream_sales)
  // ==========================================
  public static async getLiveStreamSales(): Promise<any[]> {
    const { data, error } = await supabase
      .from('live_stream_sales')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching live_stream_sales:', error);
      return [];
    }
    return data || [];
  }

  public static async createLiveStreamSale(sale: {
    session_id?: string;
    platform?: string;
    customer_handle: string;
    customer_phone?: string;
    item_code: string;
    item_description?: string;
    claimed_price: number;
    claim_status?: string;
    converted_to_order_id?: string;
  }): Promise<any> {
    const id = String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('lss-' + Date.now()));
    const payload = {
      id,
      session_id: sale.session_id ? String(sale.session_id) : 'LIVE-STREAM',
      platform: sale.platform || 'TIKTOK',
      customer_handle: sale.customer_handle,
      customer_phone: sale.customer_phone || '',
      item_code: sale.item_code,
      item_description: sale.item_description || '',
      claimed_price: Number(sale.claimed_price || 0),
      claim_status: sale.claim_status || 'CLAIMED',
      converted_to_order_id: sale.converted_to_order_id ? String(sale.converted_to_order_id) : null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('live_stream_sales')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating live_stream_sale:', error);
      throw new Error(error.message);
    }
    return data;
  }

  // ==========================================
  // OMNICHANNEL SALES SETTINGS & DISPATCH
  // ==========================================

  public static async getSalesChannelSettings(): Promise<any[]> {
    try {
      const res = await fetch('/api/sales/settings?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.settings)) return json.settings;
      }
    } catch (_) {}

    // Fallback to Supabase
    const { data } = await supabase
      .from('sales_channel_settings')
      .select('*')
      .order('setting_key');
    return data || [];
  }

  public static async updateSalesChannelSetting(settingKey: string, accountCode: string): Promise<any> {
    const res = await fetch('/api/sales/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settingKey, accountCode })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to update sales setting');
    }
    return json.setting;
  }

  public static async resetSalesChannelSettings(): Promise<void> {
    const res = await fetch('/api/sales/settings/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to reset sales settings');
    }
  }

  public static async getTransactionalAccounts(): Promise<any[]> {
    try {
      const res = await fetch('/api/sales/accounts?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.accounts)) return json.accounts;
      }
    } catch (_) {}

    // Fallback to chart_of_accounts via Supabase
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, account_type')
      .order('code');
    return data || [];
  }

  public static async dispatchSalesOrder(payload: {
    orderId: string;
    channel: string;
    clientId?: string;
    courierPartyId?: string;
    shippingFee?: number;
    shippingBearer?: string;
  }): Promise<any> {
    const res = await fetch('/api/sales/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw new Error(json.error || 'Sales dispatch failed');
    }
    return json;
  }

  public static async settleCourierCod(payload: {
    courierPartyId: string;
    bankAccountId: string;
    grossCodCleared: number;
    courierFeeDeducted: number;
    netBankReceived: number;
    referenceNo?: string;
  }): Promise<any> {
    const res = await fetch('/api/sales/courier-settlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw new Error(json.error || 'Courier COD settlement failed');
    }
    return json;
  }

  // ==========================================
  // LIVE STREAM PESSIMISTIC LOCKING & WEBHOOK SIMULATION
  // ==========================================

  public static async claimPieceWithPessimisticLock(params: {
    stationId: string;
    itemIdentifier: string; // barcode, sku, or id
    buyerHandle: string;
    buyerPhone?: string;
    channel?: string;
    boothId?: string;
    offeredPrice?: number;
    lockDurationSeconds?: number;
    reservationTimeoutMinutes?: number;
  }): Promise<{
    success: boolean;
    piece?: any;
    error?: string;
    statusCode?: number;
    lockedByStation?: string;
    lockedByBuyer?: string;
  }> {
    try {
      const res = await fetch('/api/live-stream/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: params.itemIdentifier,
          buyerHandle: params.buyerHandle,
          buyerPhone: params.buyerPhone,
          channel: params.channel,
          boothId: params.boothId,
          stationId: params.stationId,
          offeredPrice: params.offeredPrice,
          lockDurationSeconds: params.lockDurationSeconds || 180,
          reservationTimeoutMinutes: params.reservationTimeoutMinutes || 120
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Already Claimed',
          statusCode: res.status,
          lockedByStation: data.lockedByStation,
          lockedByBuyer: data.lockedByBuyer
        };
      }
      return { success: true, piece: data.piece, statusCode: 200 };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error executing pessimistic claim', statusCode: 500 };
    }
  }

  public static async releasePieceLock(params: {
    barcode: string;
    stationId?: string;
    boothId?: string;
  }): Promise<{ success: boolean; piece?: any; error?: string }> {
    try {
      const res = await fetch('/api/live-stream/release-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error releasing piece lock' };
    }
  }

  public static async simulateSocialWebhookComment(params: {
    customerName: string;
    customerPhone?: string;
    platform: string;
    commentText: string;
    stationId: string;
    boothId?: string;
  }): Promise<any> {
    const res = await fetch('/api/live-stream/webhook/simulate-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      const err = new Error(data.error || 'Webhook simulation failed');
      (err as any).response = data;
      (err as any).status = res.status;
      throw err;
    }
    return data;
  }
}



import { supabase } from '../supabaseClient.ts';
import { SalesInvoice } from '../modules/sales/sales.types.ts';

export class SalesService {
  public static async getSalesInvoices(): Promise<SalesInvoice[]> {
    const { data, error } = await supabase
      .from('sales_invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error on sales_invoices:', error);
      throw new Error(error.message || 'Database error occurred reading sales invoices');
    }

    return (data || []).map((row: any) => {
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
    const invoiceNo = inv.invoiceNo || `SINV-${Date.now().toString().slice(-6)}`;
    const rawClientId = inv.clientId ? String(inv.clientId).trim() : '';
    const cleanClientId = (rawClientId && !rawClientId.toLowerCase().includes('walk') && rawClientId !== 'none' && rawClientId !== 'undefined' && rawClientId !== 'null') ? rawClientId : null;
    const payload = {
      id,
      invoice_no: invoiceNo,
      client_id: cleanClientId,
      customer_name: inv.customerName || 'Walk-in Buyer',
      customer_phone: inv.customerPhone || '',
      invoice_date: inv.invoiceDate || new Date().toISOString().slice(0, 10),
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

    // Auto mark pieces as sold
    if (Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const pieceId = item.pieceId || item.id || item.barcode;
        if (pieceId) {
          await supabase
            .from('inventory_pieces')
            .update({ is_sold: true, status: 'SOLD' })
            .or(`id.eq.${pieceId},barcode.eq.${pieceId}`);
        }
      }
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
  }

  public static async deleteSalesInvoice(id: string): Promise<void> {
    const { error } = await supabase.from('sales_invoices').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on sales_invoices:', error);
      throw new Error(error.message || 'Failed to delete sales invoice');
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
    const payload = {
      id,
      invoice_number: invoiceNumber,
      cashier_id: sale.cashier_id ? String(sale.cashier_id) : null,
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
      const ledgerId = String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('led-' + Date.now()));
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
      const res = await fetch('/api/sales/settings');
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
      const res = await fetch('/api/sales/accounts');
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
}


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

    return (data || []).map((row: any) => ({
      id: row.id,
      invoiceNo: row.invoice_no || row.invoiceNo,
      clientId: row.client_id || row.clientId,
      customerName: row.customer_name || row.customerName || 'Walk-in Guest',
      customerPhone: row.customer_phone || row.customerPhone || '',
      invoiceDate: row.invoice_date || row.invoiceDate,
      channel: row.channel || 'POS_COUNTER',
      paymentMethod: row.payment_method || row.paymentMethod || 'CASH',
      subtotal: Number(row.subtotal || 0),
      discountAmount: Number(row.discount_amount ?? row.discountAmount ?? 0),
      taxAmount: Number(row.tax_amount ?? row.taxAmount ?? 0),
      totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
      status: row.status || 'PAID',
      items: Array.isArray(row.items) ? row.items : [],
      createdAt: row.created_at
    }));
  }

  public static async createSalesInvoice(inv: Partial<SalesInvoice>): Promise<SalesInvoice> {
    const id = inv.id || `inv-${Date.now()}`;
    const invoiceNo = inv.invoiceNo || `SINV-${Date.now().toString().slice(-6)}`;
    const payload = {
      id,
      invoice_no: invoiceNo,
      client_id: inv.clientId,
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
}

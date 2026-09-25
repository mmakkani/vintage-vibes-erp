import { supabase } from '../supabaseClient.ts';

export interface CrmRetailCustomer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  company_name?: string;
  address?: string;
  total_spent?: number;
  totalSpent?: number;
  total_orders?: number;
  totalOrders?: number;
  lastOrderDate?: string | null;
  created_at?: string;
  createdAt?: string;
  // Compatibility fields for UI rendering
  code?: string;
  type?: string;
  party_type?: string;
  coa_account_id?: string;
  account_map?: any;
  current_balance?: number;
  credit_limit?: number;
  is_active?: boolean;
}

export class CrmService {
  /**
   * Official Walk-In Control Khata Party ID (parties table CLI-0010)
   * All POS Retail sales must post their financial vouchers strictly to this Control Party.
   */
  public static readonly CONTROL_WALK_IN_PARTY_ID = '5eb820da-3bb1-4e54-8fd8-59b3db72aebf';
  public static readonly CONTROL_WALK_IN_ACCOUNT_CODE = '1130-05';
  public static readonly CONTROL_WALK_IN_ACCOUNT_NAME = 'Walk In Customer (Customer)';

  /**
   * Fetches all retail CRM customers strictly from public.crm_retail_customers
   * Core finance (parties / chart_of_accounts) is completely insulated.
   */
  public static async getCrmCustomers(): Promise<CrmRetailCustomer[]> {
    // 1. Try serverless edge / server route first
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const res = await rawFetch('/api/crm/customers');
        if (res && res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            return list.map(this.formatCustomer);
          }
        }
      } catch (_) {}
    }

    // 2. Direct Supabase query to public.crm_retail_customers
    try {
      const { data, error } = await supabase
        .from('crm_retail_customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[CrmService] Query warning on crm_retail_customers:', error.message);
        return [];
      }

      return (data || []).map(this.formatCustomer);
    } catch (err: any) {
      console.error('[CrmService] Failed to fetch retail customers:', err?.message);
      return [];
    }
  }

  /**
   * Inserts AI-scanned or manually created customer data STRICTLY into public.crm_retail_customers.
   * Absolutely NO rows are created in the parties table or chart of accounts.
   */
  public static async saveCrmCustomer(customer: {
    name: string;
    phone?: string;
    email?: string;
    company?: string;
    address?: string;
  }): Promise<CrmRetailCustomer> {
    const cleanName = String(customer.name || '').trim();
    if (!cleanName) {
      throw new Error('Customer name is required');
    }

    const cleanPhone = String(customer.phone || '').trim();
    const cleanEmail = String(customer.email || '').trim();
    const cleanCompany = String(customer.company || cleanName).trim();
    const cleanAddress = String(customer.address || '').trim();

    // Check if customer already exists in crm_retail_customers by phone
    if (cleanPhone) {
      try {
        const { data: existing } = await supabase
          .from('crm_retail_customers')
          .select('*')
          .eq('phone', cleanPhone)
          .maybeSingle();

        if (existing) {
          return this.formatCustomer(existing);
        }
      } catch (_) {}
    }

    const insertPayload = {
      name: cleanName,
      phone: cleanPhone || null,
      email: cleanEmail || null,
      company: cleanCompany || null,
      address: cleanAddress || null,
      total_spent: 0,
      total_orders: 0,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('crm_retail_customers')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error('[CrmService] Error inserting into crm_retail_customers:', error);
      throw new Error(`Failed to save retail customer: ${error.message}`);
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('vv:entity-mutated', {
          detail: { module: 'crm', entity: 'crm_retail_customers', action: 'CREATED', documentRef: data.id }
        }));
      } catch (_) {}
    }

    return this.formatCustomer(data);
  }

  /**
   * Increments retail customer's CRM purchase metrics (total_spent and total_orders)
   * Called upon POS finalization without touching accounting ledgers.
   */
  public static async incrementCustomerSales(customerId: string, saleAmount: number): Promise<void> {
    if (!customerId || customerId === this.CONTROL_WALK_IN_PARTY_ID) return;
    try {
      const { data: current } = await supabase
        .from('crm_retail_customers')
        .select('total_spent, total_orders')
        .eq('id', customerId)
        .maybeSingle();

      if (current) {
        const newSpent = Number((Number(current.total_spent || 0) + Number(saleAmount || 0)).toFixed(2));
        const newOrders = Number(current.total_orders || 0) + 1;
        await supabase
          .from('crm_retail_customers')
          .update({
            total_spent: newSpent,
            total_orders: newOrders
          })
          .eq('id', customerId);
      }
    } catch (err: any) {
      console.warn('[CrmService] Failed to update customer sales metrics:', err?.message);
    }
  }

  /**
   * Fetches sales invoices for this retail customer matching customer_phone or customer_name
   */
  public static async getCustomerInvoices(customerId?: string, phone?: string, name?: string): Promise<any[]> {
    // 1. Try server route
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const res = await rawFetch(`/api/sales/customer-history?partyId=${encodeURIComponent(customerId || '')}&phone=${encodeURIComponent(phone || '')}&name=${encodeURIComponent(name || '')}`);
        if (res && res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            return list.map(this.formatInvoice);
          }
        }
      } catch (_) {}
    }

    // 2. Direct Supabase query
    try {
      let query = supabase.from('sales_invoices').select('*').order('created_at', { ascending: false });
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const orConditions: string[] = [];
      if (cleanPhone && cleanPhone.length >= 7) {
        orConditions.push(`customer_phone.ilike.%${cleanPhone.slice(-7)}%`);
      }
      if (name && name.trim()) {
        orConditions.push(`customer_name.ilike.%${name.trim()}%`);
      }
      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      }
      const { data, error } = await query.limit(50);
      if (error || !data) return [];
      return data.map(this.formatInvoice);
    } catch (_) {
      return [];
    }
  }

  /**
   * Normalizes customer object for frontend display & compatibility
   */
  private static formatCustomer(row: any): CrmRetailCustomer {
    const totalSpent = Number(row.total_spent || row.totalSpent || 0);
    const totalOrders = Number(row.total_orders || row.totalOrders || 0);
    return {
      id: String(row.id),
      code: `CRM-${String(row.id).slice(0, 6).toUpperCase()}`,
      name: row.name || 'Walk-In Customer',
      company: row.company || row.company_name || row.name || '',
      company_name: row.company || row.company_name || row.name || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      total_spent: totalSpent,
      totalSpent: totalSpent,
      total_orders: totalOrders,
      totalOrders: totalOrders,
      lastOrderDate: row.last_order_date || row.created_at || null,
      created_at: row.created_at || new Date().toISOString(),
      createdAt: row.created_at || new Date().toISOString(),
      // Read-only compatibility helpers
      type: 'CUSTOMER',
      party_type: 'RETAIL',
      coa_account_id: CrmService.CONTROL_WALK_IN_ACCOUNT_CODE,
      account_map: { receivableAccountId: CrmService.CONTROL_WALK_IN_ACCOUNT_CODE, isControlKhataOnly: true },
      current_balance: 0,
      credit_limit: 0,
      is_active: true
    };
  }

  private static formatInvoice(r: any) {
    return {
      id: r.id,
      invoiceNo: r.invoice_no || r.invoiceNo,
      date: r.invoice_date || r.created_at || r.date,
      customerName: r.customer_name || r.customerName || 'Walk-In Customer',
      customerPhone: r.customer_phone || r.customerPhone || '',
      channel: r.channel || 'POS_COUNTER',
      paymentMethod: r.payment_method || r.paymentMethod || 'CASH',
      subtotal: Number(r.subtotal ?? r.total_amount ?? 0),
      discountAmount: Number(r.discount_amount ?? r.discountAmount ?? 0),
      taxAmount: Number(r.tax_amount ?? r.taxAmount ?? 0),
      totalAmount: Number(r.total_amount ?? r.totalAmount ?? 0),
      status: r.status || 'PAID',
      items: Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? JSON.parse(r.items || '[]') : [])
    };
  }
}

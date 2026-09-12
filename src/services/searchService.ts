import { supabase } from '../supabaseClient.ts';

export interface SearchResultItem {
  category: 'INVOICES' | 'PARTIES' | 'INVENTORY';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  badge?: string;
  amount?: string;
  tab: 'purchase' | 'sales' | 'parties' | 'setup';
  data?: any;
}

export class SearchService {
  public static async globalSearch(query: string): Promise<{ results: SearchResultItem[] }> {
    const q = (query || '').trim();
    if (!q || q.length < 2) {
      return { results: [] };
    }

    const results: SearchResultItem[] = [];

    try {
      // 1. Search Parties (Clients & Suppliers)
      const { data: parties } = await supabase
        .from('parties')
        .select('id, name, phone, type, trn, current_balance')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,trn.ilike.%${q}%`)
        .limit(8);

      if (Array.isArray(parties)) {
        for (const p of parties) {
          results.push({
            category: 'PARTIES',
            id: String(p.id),
            title: p.name || 'Unnamed Party',
            subtitle: `${p.type || 'PARTY'} • ${p.phone || 'No Phone'}${p.trn ? ` • TRN: ${p.trn}` : ''}`,
            badge: p.type,
            amount: p.current_balance ? `AED ${Number(p.current_balance).toLocaleString()}` : undefined,
            tab: 'parties',
            data: p
          });
        }
      }

      // 2. Search Purchase Invoices
      const { data: purchaseInvoices } = await supabase
        .from('purchase_invoices')
        .select('id, invoice_number, supplier_name, total_amount_aed, status')
        .or(`invoice_number.ilike.%${q}%,supplier_name.ilike.%${q}%`)
        .limit(8);

      if (Array.isArray(purchaseInvoices)) {
        for (const pi of purchaseInvoices) {
          results.push({
            category: 'INVOICES',
            id: String(pi.id),
            title: pi.invoice_number || 'Purchase Invoice',
            subtitle: `Purchase • ${pi.supplier_name || 'Unknown Supplier'}`,
            status: pi.status || 'POSTED',
            badge: 'PURCHASE',
            amount: `AED ${Number(pi.total_amount_aed || 0).toLocaleString()}`,
            tab: 'purchase',
            data: pi
          });
        }
      }

      // 3. Search Sales Invoices
      const { data: salesInvoices } = await supabase
        .from('sales_invoices')
        .select('id, invoice_no, customer_name, total_amount, status')
        .or(`invoice_no.ilike.%${q}%,customer_name.ilike.%${q}%`)
        .limit(8);

      if (Array.isArray(salesInvoices)) {
        for (const si of salesInvoices) {
          results.push({
            category: 'INVOICES',
            id: String(si.id),
            title: si.invoice_no || 'Sales Invoice',
            subtitle: `Sales • ${si.customer_name || 'Customer'}`,
            status: si.status || 'PAID',
            badge: 'SALES',
            amount: `AED ${Number(si.total_amount || 0).toLocaleString()}`,
            tab: 'sales',
            data: si
          });
        }
      }

      // 4. Search Inventory & Bale Pieces
      const { data: pieces } = await supabase
        .from('inventory_pieces')
        .select('id, barcode, item_name, brand_name, selling_price_aed, status')
        .or(`barcode.ilike.%${q}%,item_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
        .limit(8);

      if (Array.isArray(pieces)) {
        for (const p of pieces) {
          results.push({
            category: 'INVENTORY',
            id: String(p.id),
            title: p.barcode || p.item_name || 'Inventory Piece',
            subtitle: `${p.item_name || 'Piece'} • ${p.brand_name || 'Vintage'}`,
            status: p.status || 'IN_STOCK',
            badge: 'PIECE',
            amount: `AED ${Number(p.selling_price_aed || 0).toLocaleString()}`,
            tab: 'sales',
            data: p
          });
        }
      }
    } catch (err) {
      console.warn('Supabase globalSearch error:', err);
    }

    return { results };
  }
}

import { supabase } from '../supabaseClient.ts';

export interface DashboardMetrics {
  totalInventoryValueAED: number;
  totalBalesInStock: number;
  totalSortedPcs: number;
  monthRevenueAED: number;
  receivablesKhataAED: number;
  payablesKhataAED: number;
  netWorkingCapitalAED: number;
  unpostedVouchersCount: number;
  awaitingGatePassesCount: number;
  activeStaffCount: number;
}

export const DEFAULT_FX_RATES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.2723, aedEquivalent: 3.6725 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.2513, aedEquivalent: 3.98 },
  { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.2128, aedEquivalent: 4.70 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rate: 0.3704, aedEquivalent: 2.70 }
];

export const getSafeFxRates = (rates?: any[]): Array<{ code: string; symbol: string; rate: number; aedEquivalent: number }> => {
  if (!Array.isArray(rates) || rates.length === 0) {
    return DEFAULT_FX_RATES;
  }
  const filtered = rates.filter((c: any) => !c.isBase && c.code !== 'AED');
  if (filtered.length === 0) return DEFAULT_FX_RATES;

  return filtered.map((c: any) => {
    const code = String(c.code || 'USD').toUpperCase();
    const rawRate = Number(c.rate ?? c.exchangeRate ?? c.exchange_rate);
    let rate = rawRate > 0 ? rawRate : (code === 'USD' ? 0.2723 : code === 'EUR' ? 0.2513 : code === 'GBP' ? 0.2128 : 1.0);

    let aedEq = 0;
    if (rate < 1 && rate > 0) {
      aedEq = 1 / rate;
    } else if (rate >= 1) {
      aedEq = rate;
    }
    if (!aedEq || !isFinite(aedEq) || isNaN(aedEq)) {
      aedEq = code === 'USD' ? 3.6725 : code === 'EUR' ? 3.98 : code === 'GBP' ? 4.70 : 1.0;
    }

    return {
      code,
      symbol: c.symbol || (code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : '$'),
      rate: Number(rate.toFixed(4)),
      aedEquivalent: Number(aedEq.toFixed(2))
    };
  });
};

export class DashboardService {
  private static _cachedMetrics: DashboardMetrics | null = null;
  private static _lastFetchTime = 0;
  private static readonly TTL_MS = 20 * 1000; // 20 seconds cache

  public static async getLiveKPIs(force = false): Promise<DashboardMetrics> {
    if (!force && this._cachedMetrics && Date.now() - this._lastFetchTime < this.TTL_MS) {
      return this._cachedMetrics;
    }

    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      // Execute read-only Supabase queries in parallel
      const [
        payablesRes,
        receivablesRes,
        balesRes,
        piecesRes,
        salesRes,
        revenueRes,
        pendingVouchersRes,
        pendingGatePassesRes
      ] = await Promise.all([
        // 1. Payables Khata: Sum current_balance from chart_of_accounts where parent_code is 2110-00 or 2120-00
        supabase
          .from('chart_of_accounts')
          .select('current_balance, code, parent_code')
          .or('parent_code.eq.2110-00,parent_code.eq.2120-00,code.like.2110-%,code.like.2120-%'),

        // 2. Receivables Khata: Sum current_balance from chart_of_accounts where parent_code is 1130-00
        supabase
          .from('chart_of_accounts')
          .select('current_balance, code, parent_code')
          .or('parent_code.eq.1130-00,code.like.1130-%'),

        // 3. Inventory: Landed costs from inward_gate_passes (unopened, non-deleted)
        supabase
          .from('inward_gate_passes')
          .select('id, total_bale_cost, cost_price, status, total_bale_weight, broken_down_weight')
          .neq('status', 'CANCELLED')
          .neq('status', 'DELETED'),

        // 4. Inventory: Landed costs from inventory_pieces (sorted, unsold, non-deleted)
        supabase
          .from('inventory_pieces')
          .select('id, cost_price, estimated_price, retail_price_aed, is_sold, status')
          .neq('is_sold', true)
          .neq('status', 'DELETED')
          .neq('status', 'ARCHIVED')
          .neq('status', 'SOLD'),

        // 5. Month Revenue: Primary source of truth is POSTED sales_invoices
        supabase
          .from('sales_invoices')
          .select('total_amount, invoice_date, status')
          .eq('status', 'POSTED')
          .gte('invoice_date', firstDayOfMonth)
          .lte('invoice_date', lastDayOfMonth),

        // 6. Secondary revenue journal entries strictly on Pillar 4 (Revenue accounts)
        supabase
          .from('journal_entries')
          .select('credit, created_at, account_code')
          .like('account_code', '4%')
          .gte('created_at', `${firstDayOfMonth}T00:00:00.000Z`)
          .lte('created_at', `${lastDayOfMonth}T23:59:59.999Z`),

        // 7. Pending action: Unposted vouchers
        supabase
          .from('financial_vouchers')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'DRAFT'),

        // 8. Pending action: Inward gate passes awaiting sorting
        supabase
          .from('inward_gate_passes')
          .select('id', { count: 'exact', head: true })
          .or('status.eq.DRAFT,status.eq.UNOPENED')
      ]);

      // Calculate Payables Khata
      let payablesKhataAED = 0;
      if (Array.isArray(payablesRes.data)) {
        payablesKhataAED = payablesRes.data.reduce(
          (sum, acc: any) => sum + Math.abs(Number(acc.current_balance || 0)),
          0
        );
      }

      // Calculate Receivables Khata
      let receivablesKhataAED = 0;
      if (Array.isArray(receivablesRes.data)) {
        receivablesKhataAED = receivablesRes.data.reduce(
          (sum, acc: any) => sum + Math.abs(Number(acc.current_balance || 0)),
          0
        );
      }

      // Calculate Inventory Value: Unopened Bales + Sorted Pieces
      let unopenedBalesValue = 0;
      let totalBalesInStock = 0;
      if (Array.isArray(balesRes.data)) {
        for (const b of balesRes.data) {
          if (b.status !== 'FULLY_SORTED') {
            totalBalesInStock++;
            const cost = Number(b.total_bale_cost ?? b.cost_price ?? 0);
            if (b.status === 'IN_PROGRESS' && Number(b.total_bale_weight) > 0) {
              const remainingWeight = Math.max(0, Number(b.total_bale_weight) - Number(b.broken_down_weight || 0));
              const remainingRatio = remainingWeight / Number(b.total_bale_weight);
              unopenedBalesValue += cost * remainingRatio;
            } else {
              unopenedBalesValue += cost;
            }
          }
        }
      }

      let sortedPiecesValue = 0;
      let totalSortedPcs = 0;
      if (Array.isArray(piecesRes.data)) {
        totalSortedPcs = piecesRes.data.length;
        sortedPiecesValue = piecesRes.data.reduce(
          (sum, p: any) => {
            const val = Number(p.cost_price ?? p.estimated_price ?? p.retail_price_aed ?? 0);
            return sum + (!isNaN(val) && isFinite(val) ? val : 0);
          },
          0
        );
      }

      const totalInventoryValueAED = unopenedBalesValue + sortedPiecesValue;

      // Calculate Month Revenue: Strictly from POSTED sales invoices first
      let monthRevenueAED = 0;
      if (Array.isArray(salesRes.data) && salesRes.data.length > 0) {
        monthRevenueAED = salesRes.data.reduce(
          (sum, inv: any) => {
            const val = Number(inv.total_amount ?? 0);
            return sum + (!isNaN(val) && isFinite(val) ? val : 0);
          },
          0
        );
      } else if (Array.isArray(revenueRes.data) && revenueRes.data.length > 0) {
        for (const entry of revenueRes.data) {
          const credit = Number(entry.credit ?? 0);
          if (!isNaN(credit) && isFinite(credit)) {
            monthRevenueAED += credit;
          }
        }
      }

      const netWorkingCapitalAED = totalInventoryValueAED + receivablesKhataAED - payablesKhataAED;
      const unpostedVouchersCount = pendingVouchersRes.count || 0;
      const awaitingGatePassesCount = pendingGatePassesRes.count || 0;

      const metrics: DashboardMetrics = {
        totalInventoryValueAED,
        totalBalesInStock,
        totalSortedPcs,
        monthRevenueAED,
        receivablesKhataAED,
        payablesKhataAED,
        netWorkingCapitalAED,
        unpostedVouchersCount,
        awaitingGatePassesCount,
        activeStaffCount: 1
      };

      this._cachedMetrics = metrics;
      this._lastFetchTime = Date.now();
      return metrics;
    } catch (err) {
      console.warn('[DashboardService] getLiveKPIs exception:', err);
      return {
        totalInventoryValueAED: 0,
        totalBalesInStock: 0,
        totalSortedPcs: 0,
        monthRevenueAED: 0,
        receivablesKhataAED: 0,
        payablesKhataAED: 0,
        netWorkingCapitalAED: 0,
        unpostedVouchersCount: 0,
        awaitingGatePassesCount: 0,
        activeStaffCount: 1
      };
    }
  }
}

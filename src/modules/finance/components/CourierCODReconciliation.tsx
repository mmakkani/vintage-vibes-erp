import React, { useState, useEffect, useMemo } from 'react';
import { SalesInvoice } from '../../sales/sales.types.ts';
import { safeFetchJson } from '../../../utils/fetchUtils.ts';
import {
  Truck,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  Landmark,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Receipt
} from 'lucide-react';

import { COAAccount } from '../finance.types.ts';
import { FinanceService } from '../../../services/financeService.ts';

interface CourierCODReconciliationProps {
  onRefreshAll?: () => void;
  accounts?: COAAccount[];
}

export const CourierCODReconciliation: React.FC<CourierCODReconciliationProps> = ({
  onRefreshAll,
  accounts = []
}) => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourier, setSelectedCourier] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  // Find Bank and Cash accounts from COA
  const bankAccounts = useMemo(() => {
    const list = accounts.filter(a => a.code?.startsWith('111') || a.code?.startsWith('112') || a.sub_type?.includes('Bank') || a.sub_type?.includes('Cash'));
    if (list.length > 0) return list;
    return [
      { id: 'acc-1120', code: '1120-00', name: 'Primary Bank Account (Current Account)' },
      { id: 'acc-1110', code: '1110-00', name: 'Cash in Hand (Counter 1 POS Drawer)' }
    ];
  }, [accounts]);

  // Find Courier COD Clearing account from COA (1128-00)
  const codClearingAccount = useMemo(() => {
    const acc = accounts.find(a => a.code === '1128-00' || a.name?.toLowerCase().includes('cod clearing'));
    if (acc) return acc;
    return { id: 'acc-1128', code: '1128-00', name: 'Courier COD Clearing (Pending Remittance - Aramex / iMile / TCS)' };
  }, [accounts]);

  const [settlementBankId, setSettlementBankId] = useState<string>(() => bankAccounts[0]?.id || 'acc-1120');
  const [remittanceRef, setRemittanceRef] = useState<string>(`REMIT-DHL-${new Date().toISOString().slice(0, 10)}`);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load invoices
  const loadCODInvoices = async () => {
    try {
      setLoading(true);
      const data = await safeFetchJson<SalesInvoice[]>('/api/sales/invoices', undefined, 3, 300);
      if (Array.isArray(data)) {
        // Filter for COD orders
        const codOrders = data.filter(inv => inv.paymentMethod === 'COD' || inv.paymentStatus === 'UNPAID_PENDING_COD');
        setInvoices(codOrders);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCODInvoices();
  }, []);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchCourier = selectedCourier === 'ALL' || (inv.courierPartner || 'DHL Express') === selectedCourier;
      const matchSearch =
        searchTerm === '' ||
        inv.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.trackingNumber && inv.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchCourier && matchSearch;
    });
  }, [invoices, selectedCourier, searchTerm]);

  // KPIs
  const metrics = useMemo(() => {
    let pendingAmount = 0;
    let pendingCount = 0;
    let settledAmount = 0;
    let settledCount = 0;

    for (const inv of filteredInvoices) {
      const total = inv.grandTotalAED || inv.totalAmount || 0;
      if (inv.paymentStatus === 'PREPAID_VERIFIED' || (inv as any).codSettled) {
        settledAmount += total;
        settledCount++;
      } else {
        pendingAmount += total;
        pendingCount++;
      }
    }

    return {
      pendingAmount,
      pendingCount,
      settledAmount,
      settledCount,
      totalParcels: filteredInvoices.length
    };
  }, [filteredInvoices]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPending = () => {
    const pendingIds = filteredInvoices
      .filter(inv => inv.paymentStatus !== 'PREPAID_VERIFIED' && !(inv as any).codSettled)
      .map(inv => inv.id);
    setSelectedInvoiceIds(new Set(pendingIds));
  };

  const clearSelection = () => {
    setSelectedInvoiceIds(new Set());
  };

  // Calculate selected total
  const selectedTotal = useMemo(() => {
    return filteredInvoices
      .filter(inv => selectedInvoiceIds.has(inv.id))
      .reduce((sum, inv) => sum + (inv.grandTotalAED || inv.totalAmount || 0), 0);
  }, [filteredInvoices, selectedInvoiceIds]);

  // Execute Reconcile Settlement
  const handleReconcileSettlement = async () => {
    if (selectedInvoiceIds.size === 0) {
      setStatusMessage({ text: 'Please select at least one unsettled COD invoice to reconcile.', type: 'error' });
      return;
    }

    try {
      setProcessing(true);

      const chosenBank = bankAccounts.find(b => b.id === settlementBankId) || bankAccounts[0];

      // Create a double-entry Voucher:
      // DEBIT: Bank Checking (1120-00) -> Cash inflow
      // CREDIT: Courier COD Clearing In-Transit (1128-00)
      const voucherPayload = {
        voucherNo: `VCH-COD-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().slice(0, 10),
        type: 'CRV',
        currency: 'AED' as const,
        exchangeRate: 1.0,
        totalDebit: Number(selectedTotal.toFixed(2)),
        totalCredit: Number(selectedTotal.toFixed(2)),
        narration: `Courier COD remittance settlement (${remittanceRef}) for ${selectedInvoiceIds.size} parcels via ${selectedCourier === 'ALL' ? 'Courier' : selectedCourier}`,
        status: 'POSTED' as const,
        lines: [
          {
            id: 'vl-cod-01',
            accountId: chosenBank.id,
            accountCode: chosenBank.code,
            accountName: chosenBank.name,
            debitAmount: Number(selectedTotal.toFixed(2)),
            creditAmount: 0,
            memo: `COD Payout deposited: ${remittanceRef}`
          },
          {
            id: 'vl-cod-02',
            accountId: codClearingAccount.id,
            accountCode: codClearingAccount.code,
            accountName: codClearingAccount.name,
            debitAmount: 0,
            creditAmount: Number(selectedTotal.toFixed(2)),
            memo: `Settlement cleared for ${selectedInvoiceIds.size} waybills`
          }
        ]
      };

      // Post voucher directly into PostgreSQL Database via FinanceService
      await FinanceService.addVoucher(voucherPayload);

      // Update local invoice states
      setInvoices(prev =>
        prev.map(inv => {
          if (selectedInvoiceIds.has(inv.id)) {
            return {
              ...inv,
              paymentStatus: 'PREPAID_VERIFIED',
              codSettled: true,
              remittanceBatchRef: remittanceRef
            } as any;
          }
          return inv;
        })
      );

      setStatusMessage({
        text: `Successfully reconciled AED ${selectedTotal.toFixed(2)} across ${selectedInvoiceIds.size} parcels into Emirates NBD Bank. Dual-entry voucher posted!`,
        type: 'success'
      });

      setSelectedInvoiceIds(new Set());
      if (onRefreshAll) onRefreshAll();
    } catch {
      setStatusMessage({ text: 'Failed to post settlement voucher.', type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-indigo-900/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-400 text-slate-950 rounded-xl shadow-sm">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight flex items-center gap-2">
              <span>Courier COD Clearing & Remittance Reconciler</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                GL: 1128-00
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              Track Cash-on-Delivery collected by DHL, Aramex & Emirates Post and reconcile weekly bank payouts with double-entry precision.
            </p>
          </div>
        </div>

        <button
          onClick={loadCODInvoices}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Parcels</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unsettled COD in-Transit</span>
            <span className="p-1 rounded bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-mono font-black text-amber-700">
            AED {metrics.pendingAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.pendingCount} parcels awaiting courier remittance
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reconciled to Bank</span>
            <span className="p-1 rounded bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-mono font-black text-emerald-700">
            AED {metrics.settledAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.settledCount} parcels settled into GL Bank Checking
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selected for Remittance</span>
            <span className="p-1 rounded bg-indigo-50 text-indigo-600">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-mono font-black text-indigo-700">
            AED {selectedTotal.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {selectedInvoiceIds.size} parcels ready to post
          </div>
        </div>
      </div>

      {/* Action Banner for Reconciling */}
      {selectedInvoiceIds.size > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div>
            <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <span>Ready to Reconcile Batch:</span>
              <span className="font-mono text-indigo-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                {selectedInvoiceIds.size} Orders (AED {selectedTotal.toFixed(2)})
              </span>
            </h4>
            <p className="text-xs text-amber-800">
              Select destination bank account and post the dual-entry clearing voucher.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-0.5">
                Deposit Destination
              </label>
              <select
                value={settlementBankId}
                onChange={e => setSettlementBankId(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden"
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-0.5">
                Remittance Batch Ref #
              </label>
              <input
                type="text"
                value={remittanceRef}
                onChange={e => setRemittanceRef(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-800 focus:outline-hidden"
              />
            </div>

            <button
              onClick={handleReconcileSettlement}
              disabled={processing}
              className="mt-3.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors cursor-pointer"
            >
              <FileCheck className="w-4 h-4" />
              <span>{processing ? 'Posting...' : 'Post Remittance & Bank Settlement'}</span>
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
      )}

      {/* Filter and Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search waybill, invoice, or buyer..."
                className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs w-60 focus:outline-hidden"
              />
            </div>

            <select
              value={selectedCourier}
              onChange={e => setSelectedCourier(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-hidden"
            >
              <option value="ALL">All Couriers (DHL, Aramex, etc.)</option>
              <option value="DHL Express">DHL Express UAE</option>
              <option value="Emirates Post">Emirates Post</option>
              <option value="Aramex">Aramex</option>
              <option value="Fetchr">Fetchr</option>
              <option value="Local Rider">Local Rider</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={selectAllPending}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
            >
              Select All Unsettled
            </button>
            {selectedInvoiceIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-medium"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        {/* Parcels Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">Select</th>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Customer / Handle</th>
                <th className="px-4 py-3">Courier</th>
                <th className="px-4 py-3">Waybill / Tracking</th>
                <th className="px-4 py-3">Pieces</th>
                <th className="px-4 py-3 text-right">COD Amount</th>
                <th className="px-4 py-3 text-center">Settlement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No Cash-on-Delivery orders found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const isSettled = inv.paymentStatus === 'PREPAID_VERIFIED' || (inv as any).codSettled;
                  const isSelected = selectedInvoiceIds.has(inv.id);
                  const total = inv.grandTotalAED || inv.totalAmount || 0;

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => !isSettled && toggleSelect(inv.id)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50/80 font-medium'
                          : isSettled
                          ? 'bg-slate-50/50 opacity-60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isSettled}
                          onChange={() => toggleSelect(inv.id)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{inv.invoiceNo}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{inv.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.customerPhone || 'No phone'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {inv.courierPartner || 'DHL Express'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {inv.trackingNumber || 'Pending'}
                      </td>
                      <td className="px-4 py-3">{inv.items.length} items</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                        AED {total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSettled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> In-Transit
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

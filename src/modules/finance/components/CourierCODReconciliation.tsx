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
import { SalesService } from '../../../services/salesService.ts';

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

  const [courierOptions, setCourierOptions] = useState<string[]>([
    'Banana Express',
    'DHL Express UAE',
    'Aramex Logistics UAE',
    'SMSA Express GCC',
    'Emirates Post Premium',
    'iMile Delivery UAE'
  ]);

  // Find Bank and Cash accounts from COA
  const bankAccounts = useMemo(() => {
    return accounts.filter(a => a.code?.startsWith('111') || a.code?.startsWith('112') || a.sub_type?.includes('Bank') || a.sub_type?.includes('Cash') || a.name?.toLowerCase().includes('bank') || a.name?.toLowerCase().includes('cash'));
  }, [accounts]);

  // Find Courier COD Clearing account from COA (1128-01 Transaction Account)
  const codClearingAccount = useMemo(() => {
    return accounts.find(a => a.code === '1128-01')
      || accounts.find(a => a.code?.startsWith('1128') && a.code !== '1128-00')
      || null;
  }, [accounts]);

  const rakBank = useMemo(() => {
    return bankAccounts.find(a => a.code === '1120-02') || bankAccounts.find(a => a.name?.toLowerCase().includes('rakbank'));
  }, [bankAccounts]);

  const [settlementBankId, setSettlementBankId] = useState<string>(() => rakBank?.id || bankAccounts[0]?.id || '');

  useEffect(() => {
    if ((!settlementBankId || (bankAccounts[0] && settlementBankId === bankAccounts[0].id && rakBank)) && rakBank) {
      setSettlementBankId(rakBank.id);
    }
  }, [rakBank, settlementBankId, bankAccounts]);
  const [remittanceRef, setRemittanceRef] = useState<string>(`REMIT-COD-${new Date().toISOString().slice(0, 10)}`);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch registered couriers from Registry / Parties
  useEffect(() => {
    async function fetchCourierParties() {
      try {
        const res = await fetch('/api/parties');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const list = data
            .filter((p: any) => {
              const type = (p.type || p.party_type || '').toUpperCase();
              const name = (p.name || p.company_name || '').toUpperCase();
              return (
                p.is_active !== false &&
                (type === 'COURIER' ||
                  type === 'LOGISTICS_AGENT' ||
                  type === 'AGENT' ||
                  name.includes('BANANA') ||
                  name.includes('DHL') ||
                  name.includes('ARAMEX') ||
                  name.includes('SMSA') ||
                  name.includes('POST') ||
                  name.includes('COURIER') ||
                  name.includes('EXPRESS'))
              );
            })
            .map((p: any) => p.name || p.company_name)
            .filter(Boolean);

          if (list.length > 0) {
            setCourierOptions(prev => Array.from(new Set([...prev, ...list])));
          }
        }
      } catch (err) {
        console.warn('Could not load couriers from /api/parties:', err);
      }
    }
    fetchCourierParties();
  }, []);

  // Load invoices (Strictly POSTED Live Sales Dispatch / Sale Log COD parcels only)
  const loadCODInvoices = async () => {
    try {
      setLoading(true);
      const data = await safeFetchJson<any[]>('/api/sales/invoices', undefined, 3, 300).catch(() => []);

      const allRaw: any[] = [];
      if (Array.isArray(data)) allRaw.push(...data);

      if (allRaw.length === 0) {
        try {
          const direct = await fetch('/api/sales/invoices');
          if (direct.ok) {
            const list = await direct.json();
            if (Array.isArray(list)) allRaw.push(...list);
          }
        } catch (_) {}
      }

      if (allRaw.length === 0) {
        try {
          const direct = await SalesService.getSalesInvoices({ limit: 100 });
          if (Array.isArray(direct)) allRaw.push(...direct);
        } catch (_) {}
      }

      const dedupeMap = new Map<string, SalesInvoice>();
      for (const raw of allRaw) {
        if (!raw) continue;
        const invNo = raw.invoiceNo || raw.invoice_no || String(raw.id || '');
        if (!invNo) continue;

        // STRICT RULE 1: Only invoices that are POSTED in Live Sales Dispatch / Sale Log may appear here
        const statusUpper = String(raw.status || '').toUpperCase();
        if (statusUpper !== 'POSTED') {
          continue;
        }

        // STRICT RULE 2: Must strictly belong to Live Sales Dispatch / Sale Log (exclude POS, B2B, etc.)
        const invNoUpper = String(invNo).toUpperCase();
        const channelUpper = String(raw.channel || '').toUpperCase();
        if (
          invNoUpper.startsWith('POS-') ||
          invNoUpper.startsWith('INV-POS-') ||
          invNoUpper.startsWith('SLS-POS-') ||
          invNoUpper.startsWith('B2B-') ||
          invNoUpper.startsWith('SLS-B2B-') ||
          channelUpper === 'POS' ||
          channelUpper === 'POS_COUNTER' ||
          channelUpper === 'WHOLESALE_B2B' ||
          channelUpper === 'WHOLESALE' ||
          raw.isB2BCustomSale ||
          raw.paymentMethod === 'CARD_POS' ||
          raw.boothId === 'COUNTER_POS'
        ) {
          continue;
        }

        const isLiveSaleLog =
          invNoUpper.startsWith('LIVE-') ||
          invNoUpper.startsWith('SLS-LIVE-') ||
          invNoUpper.startsWith('SLS-DRAFT-LIVE-') ||
          channelUpper === 'LIVE' ||
          channelUpper === 'LIVE_STREAM' ||
          channelUpper === 'TIKTOK_LIVE' ||
          channelUpper === 'INSTAGRAM_LIVE' ||
          channelUpper === 'FACEBOOK_LIVE' ||
          channelUpper === 'YOUTUBE_LIVE';

        if (!isLiveSaleLog) {
          continue;
        }

        const courierPartner = raw.courierPartner || raw.courier_partner || raw.courier_partner_name || (raw.courier_partner_id === 'b42f8f14-cdda-4b12-9539-ed8fc3f66152' || raw.courier_partner_id === 75 ? 'Banana Express' : (raw.courier_partner_id ? `Courier #${raw.courier_partner_id}` : ''));
        const trackingNumber = raw.trackingNumber || raw.tracking_number || raw.waybillNo || raw.waybill_no || '';
        const paymentMethod = raw.paymentMethod || raw.payment_method || '';
        const paymentStatus = raw.paymentStatus || raw.payment_status || '';
        const customerName = raw.customerName || raw.customer_name || 'Customer';
        const total = Number(raw.grandTotalAED ?? raw.totalAmount ?? raw.total_amount ?? 0);
        const advPaid = Number(raw.advanceAmountPaid ?? raw.paidAmount ?? raw.paid_amount ?? 0);
        const balDue = raw.balanceDue !== undefined ? Number(raw.balanceDue) : (raw.balance_due !== undefined ? Number(raw.balance_due) : (raw.creditAmountDue !== undefined ? Number(raw.creditAmountDue) : undefined));
        const shipFee = Number(raw.shippingFee ?? raw.shipping_fee ?? raw.shippingFeeAed ?? raw.shippingCharge ?? 0);

        const pm = (paymentMethod || '').toUpperCase();
        const ps = (paymentStatus || '').toUpperCase();
        const isCod = (pm === 'COD' || pm.includes('COD') || pm === 'CASH_ON_DELIVERY' || ps.includes('COD') || ps === 'UNPAID_PENDING_COD') && (Boolean(courierPartner) || Boolean(trackingNumber) || pm.includes('COD') || pm === 'CASH_ON_DELIVERY');

        if (isCod) {
          const normalized: SalesInvoice = {
            ...raw,
            id: String(raw.id || invNo),
            invoiceNo: invNo,
            customerName,
            courierPartner: courierPartner || (trackingNumber ? 'Banana Express' : ''),
            trackingNumber,
            paymentMethod,
            paymentStatus,
            shippingFee: shipFee,
            shippingFeeAed: shipFee,
            advanceAmountPaid: advPaid,
            balanceDue: balDue !== undefined ? balDue : (total > advPaid && advPaid > 0 ? total - advPaid : total),
            grandTotalAED: total,
            items: Array.isArray(raw.items) ? raw.items : (typeof raw.items === 'string' ? JSON.parse(raw.items || '[]') : [])
          } as any;
          dedupeMap.set(invNo, normalized);
        }
      }
      setInvoices(Array.from(dedupeMap.values()));
    } catch (err) {
      console.error('[CourierCODReconciliation] loadCODInvoices error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCODInvoices();
  }, []);

  const allCourierList = useMemo(() => {
    const fromInvoices = invoices.map(i => i.courierPartner).filter(Boolean) as string[];
    return Array.from(new Set([...courierOptions, ...fromInvoices]));
  }, [courierOptions, invoices]);

  const handleCourierChange = (courier: string) => {
    setSelectedCourier(courier);
    const pfx = courier === 'ALL' ? 'COD' : courier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    setRemittanceRef(`REMIT-${pfx}-${new Date().toISOString().slice(0, 10)}`);
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const invCourier = (inv.courierPartner || '').toLowerCase().trim();
      const targetCourier = selectedCourier.toLowerCase().trim();
      const matchCourier =
        selectedCourier === 'ALL' ||
        invCourier === targetCourier ||
        (targetCourier !== '' && invCourier.includes(targetCourier)) ||
        (invCourier !== '' && targetCourier.includes(invCourier));

      const matchSearch =
        searchTerm === '' ||
        (inv.invoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.buyerHandle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      const advPaid = Number((inv as any).advanceAmountPaid ?? (inv as any).paidAmount ?? (inv as any).paid_amount ?? 0);
      const total = advPaid > 0 && ((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue) !== undefined
        ? Number((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue)
        : (inv.grandTotalAED || inv.totalAmount || 0);
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

  // Calculate selected gross, courier delivery fee deductions, and net remittance
  const { selectedGrossTotal, selectedCourierFees, selectedNetRemittance } = useMemo(() => {
    const list = Array.isArray(filteredInvoices) ? filteredInvoices : [];
    let gross = 0;
    let fees = 0;
    for (const inv of list) {
      if (inv && selectedInvoiceIds.has(inv.id)) {
        const advPaid = Number((inv as any).advanceAmountPaid ?? (inv as any).paidAmount ?? (inv as any).paid_amount ?? 0);
        const amt = advPaid > 0 && ((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue) !== undefined
          ? Number((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue)
          : (Number(inv.grandTotalAED) || Number(inv.totalAmount) || 0);
        const fee = Number(inv.shippingFee ?? (inv as any).shipping_fee ?? 0);
        gross += amt;
        fees += fee;
      }
    }
    const net = Math.max(0, gross - fees);
    return {
      selectedGrossTotal: gross,
      selectedCourierFees: fees,
      selectedNetRemittance: net
    };
  }, [filteredInvoices, selectedInvoiceIds]);

  const selectedTotal = selectedNetRemittance;

  // Execute Reconcile Settlement
  const handleReconcileSettlement = async () => {
    if (selectedInvoiceIds.size === 0) {
      setStatusMessage({ text: 'Please select at least one unsettled COD invoice to reconcile.', type: 'error' });
      return;
    }

    try {
      setProcessing(true);

      const chosenBank = bankAccounts.find(b => b.id === settlementBankId) || bankAccounts[0];
      if (!chosenBank || !codClearingAccount) {
        setStatusMessage({ text: 'Settlement Bank Account or Courier COD Clearing Account not found in Chart of Accounts. Please create them first.', type: 'error' });
        setProcessing(false);
        return;
      }

      // Find Courier Payable Account (2120-06 Banana Express UAE or 2120-00)
      const courierPayableAccount = accounts.find(a => a.code === '2120-06') 
        || accounts.find(a => a.code?.startsWith('2120') && a.code !== '2120-00')
        || accounts.find(a => a.code === '2120-00')
        || { id: '6ad49e71-aa5d-4c92-8766-4107774fbe18', code: '2120-06', name: 'Banana Express UAE (Courier Payable)' };

      // Dual-entry Voucher:
      // Supports both Direct Transporter Len-Den Settlement and Clearing Account (1128-01) Settlement
      const isClearingAccountActive = codClearingAccount && Number(codClearingAccount.current_balance || 0) > 0;
      const lines: any[] = [];
      let totalVoucherAmount = selectedNetRemittance;

      if (isClearingAccountActive && codClearingAccount) {
        totalVoucherAmount = selectedGrossTotal;
        lines.push({
          id: 'vl-cod-01',
          accountId: chosenBank.id,
          accountCode: chosenBank.code,
          accountName: chosenBank.name,
          debitAmount: Number(selectedNetRemittance.toFixed(2)),
          creditAmount: 0,
          memo: `COD Net Payout deposited to ${chosenBank.name}: ${remittanceRef}`
        });

        if (selectedCourierFees > 0) {
          lines.push({
            id: 'vl-cod-02',
            accountId: courierPayableAccount.id,
            accountCode: courierPayableAccount.code,
            accountName: courierPayableAccount.name,
            debitAmount: Number(selectedCourierFees.toFixed(2)),
            creditAmount: 0,
            memo: `Courier delivery fees deducted by ${selectedCourier === 'ALL' ? 'Banana Express' : selectedCourier} for ${selectedInvoiceIds.size} parcels`
          });
        }

        lines.push({
          id: 'vl-cod-03',
          accountId: codClearingAccount.id,
          accountCode: codClearingAccount.code,
          accountName: codClearingAccount.name,
          debitAmount: 0,
          creditAmount: Number(selectedGrossTotal.toFixed(2)),
          memo: `Gross COD cleared for ${selectedInvoiceIds.size} waybills via ${selectedCourier === 'ALL' ? 'Courier' : selectedCourier}`
        });
      } else {
        // Direct Courier Len-Den Khata Settlement:
        // 1. DEBIT: Bank Account (1120-02 RAKBANK) -> selectedNetRemittance
        // 2. CREDIT: Courier Account (2120-06 Banana Express) -> selectedNetRemittance
        totalVoucherAmount = selectedNetRemittance;
        lines.push({
          id: 'vl-cod-01',
          accountId: chosenBank.id,
          accountCode: chosenBank.code,
          accountName: chosenBank.name,
          debitAmount: Number(selectedNetRemittance.toFixed(2)),
          creditAmount: 0,
          memo: `COD Net Remittance deposited into ${chosenBank.name}: ${remittanceRef}`
        });

        lines.push({
          id: 'vl-cod-02',
          accountId: courierPayableAccount.id,
          accountCode: courierPayableAccount.code,
          accountName: courierPayableAccount.name,
          debitAmount: 0,
          creditAmount: Number(selectedNetRemittance.toFixed(2)),
          memo: `Courier COD cash remittance settled by ${selectedCourier === 'ALL' ? 'Banana Express' : selectedCourier} (${selectedInvoiceIds.size} parcels)`
        });
      }

      const voucherPayload = {
        voucherNo: `VCH-COD-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().slice(0, 10),
        type: 'CRV',
        currency: 'AED' as const,
        exchangeRate: 1.0,
        totalDebit: Number(totalVoucherAmount.toFixed(2)),
        totalCredit: Number(totalVoucherAmount.toFixed(2)),
        narration: `Courier COD remittance settlement (${remittanceRef}) for ${selectedInvoiceIds.size} parcels via ${selectedCourier === 'ALL' ? 'Courier' : selectedCourier} (Gross: AED ${selectedGrossTotal.toFixed(2)}, Courier Fee: AED ${selectedCourierFees.toFixed(2)}, Net Bank: AED ${selectedNetRemittance.toFixed(2)})`,
        status: 'POSTED' as const,
        lines
      };

      // Post voucher directly into PostgreSQL Database via FinanceService
      const createdVoucher = await FinanceService.addVoucher(voucherPayload);

      // Log settlement to Courier Khata
      try {
        const { PartiesService } = await import('../../../services/partiesService.ts');
        await PartiesService.addKhataLog({
          partyId: 'b42f8f14-cdda-4b12-9539-ed8fc3f66152',
          date: new Date().toISOString().slice(0, 10),
          reference: remittanceRef,
          description: `COD Net Remittance deposited in ${chosenBank.name} (${selectedInvoiceIds.size} parcels)`,
          debit: 0,
          credit: selectedNetRemittance,
          notes: `COD Settlement: ${selectedInvoiceIds.size} parcels via ${remittanceRef}`
        });
      } catch (khErr) {
        console.warn('[CourierCODReconciliation] Notice updating courier khata log:', khErr);
      }

      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent('vv:entity-mutated', {
              detail: {
                module: 'finance',
                entity: 'vouchers',
                action: 'POSTED',
                documentRef: voucherPayload.voucherNo,
                deltaPayload: { voucher: createdVoucher }
              }
            })
          );
        } catch (_) {}
      }

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
        text: `Successfully reconciled AED ${selectedNetRemittance.toFixed(2)} net payout into ${chosenBank.name} (Gross COD: AED ${selectedGrossTotal.toFixed(2)}, Courier Fee: AED ${selectedCourierFees.toFixed(2)} to ${selectedCourier === 'ALL' ? 'Banana Express' : selectedCourier}) across ${selectedInvoiceIds.size} parcels. Dual-entry voucher posted!`,
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
                GL: 1128-01
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
            <h4 className="text-sm font-bold text-amber-950 flex flex-wrap items-center gap-2">
              <span>Ready to Reconcile Batch:</span>
              <span className="font-mono text-indigo-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                {selectedInvoiceIds.size} Orders
              </span>
              <span className="text-xs font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-300">
                Gross: AED {selectedGrossTotal.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 font-bold">
                Courier Fee: -AED {selectedCourierFees.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-black">
                Net Deposit: AED {selectedNetRemittance.toFixed(2)}
              </span>
            </h4>
            <p className="text-xs text-amber-800 mt-1">
              Select destination bank account to deposit net <strong>AED {selectedNetRemittance.toFixed(2)}</strong> while clearing <strong>AED {selectedCourierFees.toFixed(2)}</strong> courier delivery charges.
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
              onChange={e => handleCourierChange(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden"
            >
              <option value="ALL">All Couriers (Banana, DHL, Aramex, etc.)</option>
              {allCourierList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
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
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">Select</th>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Customer / Handle</th>
                <th className="px-4 py-3">Courier</th>
                <th className="px-4 py-3">Waybill / Tracking</th>
                <th className="px-4 py-3">Pieces</th>
                <th className="px-4 py-3 text-right">Gross COD</th>
                <th className="px-4 py-3 text-right">Courier Fee</th>
                <th className="px-4 py-3 text-right">Net Payout</th>
                <th className="px-4 py-3 text-center">Settlement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No Cash-on-Delivery orders found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const isSettled = inv.paymentStatus === 'PREPAID_VERIFIED' || (inv as any).codSettled;
                  const isSelected = selectedInvoiceIds.has(inv.id);
                  const advPaid = Number((inv as any).advanceAmountPaid ?? (inv as any).paidAmount ?? (inv as any).paid_amount ?? 0);
                  const total = advPaid > 0 && ((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue) !== undefined
                    ? Number((inv as any).balanceDue ?? (inv as any).balance_due ?? (inv as any).creditAmountDue)
                    : (inv.grandTotalAED || inv.totalAmount || 0);
                  const fee = Number(inv.shippingFee ?? (inv as any).shipping_fee ?? 0);
                  const net = Math.max(0, total - fee);

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
                          {inv.courierPartner || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {inv.trackingNumber || 'Pending'}
                      </td>
                      <td className="px-4 py-3">{inv.items.length} items</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                        AED {total.toFixed(2)}
                        {advPaid > 0 && (
                          <div className="text-[10px] text-emerald-600 font-normal">
                            (Adv: AED {advPaid.toFixed(2)})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">
                        AED {fee.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                        AED {net.toFixed(2)}
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

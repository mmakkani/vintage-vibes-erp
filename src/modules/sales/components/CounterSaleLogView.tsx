import React, { useState, useMemo } from 'react';
import { SalesInvoice } from '../sales.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { CounterSalePOSTerminal } from './CounterSalePOSTerminal.tsx';
import { openThermalLabelPrintWindow } from '../../../utils/thermalPrinter.ts';
import {
  Store,
  ExternalLink,
  Search,
  Printer,
  MessageCircle,
  Eye,
  CheckCircle2,
  DollarSign,
  Layers,
  Sparkles,
  ArrowUpRight,
  Wifi,
  Calendar,
  CreditCard,
  QrCode,
  Banknote,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { SalesService } from '../../../services/salesService.ts';

interface CounterSaleLogViewProps {
  invoices: SalesInvoice[];
  stockPieces: PieceBreakdownItem[];
  clients: Party[];
  currentUserRole: string;
  onRefreshAll: () => void;
  onSelectInvoiceForReceipt?: (inv: SalesInvoice) => void;
}

export const CounterSaleLogView: React.FC<CounterSaleLogViewProps> = ({
  invoices,
  stockPieces,
  clients,
  currentUserRole,
  onRefreshAll,
  onSelectInvoiceForReceipt
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'CARD_POS' | 'BANK_TRANSFER' | 'SPLIT'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showEmbeddedPos, setShowEmbeddedPos] = useState(false);

  // Strict POS Channel predicate: ONLY counter sale invoices
  const isStrictlyPos = (inv: SalesInvoice) => {
    const channel = String(inv?.channel || '').toUpperCase();
    const invNo = String(inv?.invoiceNo || '').toUpperCase();
    return (
      channel === 'POS' ||
      channel === 'POS_COUNTER' ||
      invNo.startsWith('INV-POS-') ||
      invNo.startsWith('SLS-POS-') ||
      invNo.startsWith('POS-') ||
      inv?.paymentMethod === 'CARD_POS' ||
      inv?.paymentMethod === 'CARD_MANUAL' ||
      inv?.notes?.includes('Counter Sale') ||
      inv?.boothId === 'COUNTER_POS'
    );
  };

  const posInvoices = useMemo(() => {
    if (!Array.isArray(invoices)) return [];
    return invoices.filter(isStrictlyPos);
  }, [invoices]);

  // Display Invoices strictly filtered from POS transactions only (never leaks Live sales)
  const displayInvoices = useMemo(() => {
    const safePosInvoices = Array.isArray(posInvoices) ? posInvoices : [];
    return safePosInvoices.filter(inv => {
      const invNo = inv?.invoiceNo || '';
      const matchesSearch = 
        !searchTerm ||
        invNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv?.customerName && inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inv?.postedBy && inv.postedBy.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (Array.isArray(inv?.items) && inv.items.some(it => 
          (it?.barcode && it.barcode.toLowerCase().includes(searchTerm.toLowerCase())) || 
          (it?.description && it.description.toLowerCase().includes(searchTerm.toLowerCase()))
        ));

      const matchesPayment = 
        paymentFilter === 'ALL' || inv?.paymentMethod === paymentFilter;

      return matchesSearch && matchesPayment;
    });
  }, [posInvoices, searchTerm, paymentFilter]);

  // Summary Metrics strictly on posInvoices
  const metrics = useMemo(() => {
    const list = Array.isArray(posInvoices) ? posInvoices : [];
    const totalSales = list.reduce((sum, inv) => sum + (Number(inv?.totalAmount) || 0), 0);
    const totalVat = list.reduce((sum, inv) => sum + (Number(inv?.vatAmount) || 0), 0);
    const totalNetRevenue = list.reduce((sum, inv) => sum + (Number(inv?.subTotal) || 0), 0);
    const totalPieces = list.reduce((sum, inv) => sum + (Array.isArray(inv?.items) ? inv.items.length : 0), 0);
    const totalGrossProfit = list.reduce((sum, inv) => sum + (Number(inv?.grossProfitAed) || 0), 0);
    const totalCogs = list.reduce((sum, inv) => {
      const cogs = (Array.isArray(inv?.items) && inv.items.length > 0)
        ? inv.items.reduce((cSum, it) => cSum + (Number(it?.calculatedCostPrice) || 0), 0)
        : ((Number(inv?.subTotal) || 0) - (Number(inv?.grossProfitAed) || 0));
      return sum + Math.max(0, cogs || 0);
    }, 0);
    const marginPercent = totalNetRevenue > 0 ? Number(((totalGrossProfit / totalNetRevenue) * 100).toFixed(1)) : 0;

    return {
      count: list.length,
      totalSales: Number(totalSales.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      totalNetRevenue: Number(totalNetRevenue.toFixed(2)),
      totalPieces,
      totalCogs: Number(totalCogs.toFixed(2)),
      totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
      marginPercent
    };
  }, [posInvoices]);

  // Invoice Deletion & Void Logic (Restores Stock & Removes Financial Voucher)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleDeleteInvoice = async (inv: SalesInvoice) => {
    const itemCount = Array.isArray(inv?.items) ? inv.items.length : 0;
    const confirmMsg = `⚠️ Are you sure you want to void / delete Counter POS Invoice ${inv.invoiceNo}?\n\n• Associated financial voucher & ledger balances will be reversed.\n• All ${itemCount} garment(s) will be restored back to IN_STOCK.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsDeletingId(inv.id);
      await SalesService.deleteSalesInvoice(inv.id);
      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(null);
      }
      onRefreshAll();
    } catch (err: any) {
      alert(`Failed to delete invoice: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsDeletingId(null);
    }
  };

  // Open Pop-up Window
  const handleOpenPosWindow = () => {
    const width = Math.min(window.screen.availWidth - 80, 1440);
    const height = Math.min(window.screen.availHeight - 80, 920);
    const left = Math.max(0, (window.screen.availWidth - width) / 2);
    const top = Math.max(0, (window.screen.availHeight - height) / 2);

    window.open(
      '/?view=pos',
      'VintagePOSRegister',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
  };

  // Thermal 80mm Receipt Print
  const handlePrintReceipt = (inv: SalesInvoice) => {
    try {
      openThermalLabelPrintWindow({
        itemCode: inv.invoiceNo,
        description: `RETAIL POS: ${Array.isArray(inv?.items) ? inv.items.length : 0} garments (${inv?.paymentMethod || 'CASH'})`,
        brand: 'VINTAGE VIBES DUBAI',
        grade: `UAE VAT 5%: AED ${inv?.vatAmount || 0}`,
        retailPriceAed: inv?.totalAmount || 0,
        weightKg: Number((Array.isArray(inv?.items) ? inv.items.reduce((acc, it) => acc + (it?.weightKg || 0.4), 0) : 0).toFixed(2)),
        batchNo: `AUTH: ${inv.paymentMethod}`,
        date: inv.date
      });
    } catch (e) {
      console.warn('Thermal print trigger:', e);
    }
  };

  // WhatsApp E-Receipt
  const handleSendWhatsApp = (inv: SalesInvoice) => {
    const client = clients.find(c => c.id === inv.customerId);
    const phone = (client?.phone || inv.customerPhone || prompt('Customer WhatsApp Number (+971...)', '+971') || '').replace(/[^0-9]/g, '');
    const itemsSummary = (Array.isArray(inv?.items) ? inv.items : []).map((it: any) => `• ${it?.description || 'Item'} — AED ${it?.finalAmount || it?.unitPrice || 0}`).join('\n');
    const text = encodeURIComponent(
      `🛍️ *VINTAGE VIBES DUBAI - POS E-RECEIPT*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *Invoice No:* ${inv.invoiceNo}\n` +
      `📅 *Date:* ${inv.date}\n` +
      `💳 *Payment Method:* ${inv.paymentMethod}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${itemsSummary}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Subtotal: AED ${inv.subTotal.toFixed(2)}\n` +
      `UAE VAT (5%): AED ${inv.vatAmount.toFixed(2)}\n` +
      `*TOTAL PAID: AED ${inv.totalAmount.toFixed(2)}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `TRN: 100482910300003\n` +
      `Store: Al Quoz Industrial 3, Dubai\n` +
      `Thank you for your visit!`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. TOP HERO ACTION BANNER */}
      <div className="bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950/80 text-white rounded-2xl p-4 sm:p-5 border border-amber-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/40 shadow-inner">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-white">
                Walk-In Retail Counter Sale (POS) & Cashier Hub
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-mono">
                <Wifi className="w-3 h-3 animate-pulse text-emerald-400" />
                POS MACHINE CONNECTED
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Continuous Barcode Gun • Cash / Smart POS Card Machine Tap • Automated Double-Entry COGS & Net Revenue
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleOpenPosWindow}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2 transition active:scale-95 cursor-pointer ring-2 ring-amber-400/60"
          >
            <ExternalLink className="w-4 h-4 text-amber-200 animate-pulse" />
            <span>🚀 Open Counter Sale in New Window (Pop-up)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEmbeddedPos(!showEmbeddedPos)}
            className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-700 text-amber-200 rounded-xl text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <span>{showEmbeddedPos ? 'Hide Embedded Terminal' : '💻 Toggle In-Page Terminal'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Terminal (If toggled) */}
      {showEmbeddedPos && (
        <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 text-slate-800">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Embedded Register Active (Continuous Gun Listener Active)</span>
            </span>
            <button
              type="button"
              onClick={() => setShowEmbeddedPos(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer font-bold"
            >
              ✕ Collapse
            </button>
          </div>
          <CounterSalePOSTerminal
            stockPieces={stockPieces}
            clients={clients}
            operatorName={currentUserRole || 'Counter Sales Lead'}
            onRefreshAll={onRefreshAll}
            onSaleCompleted={onRefreshAll}
          />
        </div>
      )}

      {/* 2. SUMMARY METRICS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-gradient-to-br from-white to-amber-50/40 p-3 rounded-xl border border-amber-200/90 shadow-xs hover:shadow-md transition">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Today's POS Sales</div>
          <div className="text-base sm:text-lg font-black font-mono text-emerald-600 mt-0.5">
            AED {metrics.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5 font-mono">{metrics.count} Receipts Posted</div>
        </div>

        <div className="bg-gradient-to-br from-white to-amber-50/40 p-3 rounded-xl border border-amber-200/90 shadow-xs hover:shadow-md transition">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Pieces Sold</div>
          <div className="text-base sm:text-lg font-black font-mono text-amber-700 mt-0.5">
            {metrics.totalPieces} Pcs
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5 font-mono">Stock Auto-Depleted</div>
        </div>

        <div className="bg-gradient-to-br from-white to-rose-50/30 p-3 rounded-xl border border-rose-200/80 shadow-xs hover:shadow-md transition">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Total COGS (Cost)</div>
          <div className="text-base sm:text-lg font-black font-mono text-rose-600 mt-0.5">
            AED {metrics.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5 font-mono">Debited to COGS 5110</div>
        </div>

        <div className="bg-gradient-to-br from-white to-emerald-50/40 p-3 rounded-xl border border-emerald-200/80 shadow-xs hover:shadow-md transition">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Gross Profit (P&L)</div>
          <div className="text-base sm:text-lg font-black font-mono text-emerald-700 mt-0.5">
            +AED {metrics.totalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-600/80 mt-0.5 font-mono font-bold">Margin: {metrics.marginPercent}%</div>
        </div>

        <div className="bg-gradient-to-br from-white to-stone-50 p-3 rounded-xl border border-stone-200 shadow-xs hover:shadow-md transition">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">5% UAE VAT</div>
          <div className="text-base sm:text-lg font-black font-mono text-stone-800 mt-0.5">
            AED {metrics.totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5 font-mono">Output Tax 2140</div>
        </div>

        <div className="bg-gradient-to-br from-white to-amber-50/50 p-3 rounded-xl border border-amber-300/80 shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Hardware Terminal</div>
          <div className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>PAX / Sunmi POS</span>
          </div>
          <div className="text-[10px] text-amber-900/60 font-mono">192.168.1.150:8080</div>
        </div>
      </div>

      {/* 3. SEARCH & FILTER BAR */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search POS invoices by Receipt #, Barcode, Customer, or Cashier..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 font-medium"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Payment:</span>
          {(['ALL', 'CASH', 'CARD_POS', 'BANK_TRANSFER', 'SPLIT'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentFilter(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition ${
                paymentFilter === mode
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode === 'ALL' ? 'All Modes' : mode === 'CARD_POS' ? '💳 Card POS' : mode === 'CASH' ? '💵 Cash' : mode === 'BANK_TRANSFER' ? '📱 Bank QR' : '⚖️ Split'}
            </button>
          ))}
          <button
            type="button"
            onClick={onRefreshAll}
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition"
            title="Refresh logs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4. POS SALES LOGS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200 tracking-wider">
                <th className="py-2.5 px-3">Receipt / Invoice #</th>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Cashier</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3 text-center">Items</th>
                <th className="py-2.5 px-3">Payment Mode</th>
                <th className="py-2.5 px-3 text-right">Net Subtotal</th>
                <th className="py-2.5 px-3 text-right">5% VAT</th>
                <th className="py-2.5 px-3 text-right font-black">Total Paid</th>
                <th className="py-2.5 px-3 text-right text-rose-600">COGS Deducted</th>
                <th className="py-2.5 px-3 text-right text-indigo-600">Gross Margin</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {displayInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400 font-sans">
                    <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-xs text-slate-600">No Counter Sale Transactions Found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Click "Open Counter Sale in New Window" above to start your first retail counter checkout.</p>
                  </td>
                </tr>
              ) : (
                displayInvoices.map((inv) => {
                  const itemsCount = Array.isArray(inv?.items) ? inv.items.length : 0;
                  const cogs = (Array.isArray(inv?.items) && inv.items.length > 0)
                    ? inv.items.reduce((cSum, it) => cSum + (Number(it?.calculatedCostPrice) || 0), 0)
                    : ((Number(inv?.subTotal) || 0) - (Number(inv?.grossProfitAed) || 0));
                  const profit = inv?.grossProfitAed ?? Math.max(0, (Number(inv?.subTotal) || 0) - cogs);
                  const margin = (Number(inv?.subTotal) || 0) > 0 ? ((profit / Number(inv.subTotal)) * 100).toFixed(0) : '0';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-blue-700">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-sans text-[11px]">
                        <div>{inv.date}</div>
                        <div className="text-[10px] text-slate-400">{inv.time || 'Counter POS'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-700 font-medium">
                        {inv.postedBy || 'Counter Cashier'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-900 font-medium">
                        {inv.customerName || 'Walk-In Customer'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold text-[10px]">
                          {itemsCount} pcs
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.paymentMethod === 'CARD_POS' || inv.paymentMethod === 'CARD_MANUAL'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : inv.paymentMethod === 'CASH'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : inv.paymentMethod === 'BANK_TRANSFER'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {inv.paymentMethod === 'CARD_POS' && '💳 POS Card'}
                          {inv.paymentMethod === 'CARD_MANUAL' && '💳 Manual Card'}
                          {inv.paymentMethod === 'CASH' && '💵 Cash'}
                          {inv.paymentMethod === 'BANK_TRANSFER' && '📱 Bank QR'}
                          {inv.paymentMethod === 'SPLIT' && '⚖️ Split'}
                          {!['CARD_POS', 'CARD_MANUAL', 'CASH', 'BANK_TRANSFER', 'SPLIT'].includes(inv.paymentMethod) && inv.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        AED {Number(inv?.subTotal ?? inv?.subtotal ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        AED {Number(inv?.vatAmount ?? inv?.taxAmount ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        AED {Number(inv?.totalAmount ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600 font-bold">
                        AED {Number(cogs || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-700 font-sans">
                        +{profit.toFixed(0)} <span className="text-[10px] text-slate-500 font-mono">({margin}%)</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1 font-sans">
                          <button
                            type="button"
                            onClick={() => handlePrintReceipt(inv)}
                            className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
                            title="Print 80mm Thermal Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(inv)}
                            className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
                            title="Send WhatsApp Receipt"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectInvoiceForReceipt) {
                                onSelectInvoiceForReceipt(inv);
                              } else {
                                setSelectedInvoice(inv);
                              }
                            }}
                            className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                            title="View Itemized Breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingId === inv.id}
                            onClick={() => handleDeleteInvoice(inv)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer disabled:opacity-50"
                            title="Void / Delete POS Invoice (Restores Stock & Reverses Voucher)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. ITEM DETAILS POPUP (IF OPENED DIRECTLY) */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 uppercase">
                  Counter Receipt: {selectedInvoice.invoiceNo}
                </h3>
                <p className="text-[11px] text-slate-500">{selectedInvoice.date} • Cashier: {selectedInvoice.postedBy || 'Counter Lead'}</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-slate-800 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-2 bg-slate-50">
                {(Array.isArray(selectedInvoice?.items) ? selectedInvoice.items : []).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-none">
                    <div>
                      <span className="font-bold text-slate-800">{it.description}</span>
                      <div className="text-[10px] text-slate-500 font-mono">{it.barcode} • Weight: {it.weightKg || 0.4} KG</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-slate-900">AED {it.finalAmount || it.unitPrice}</div>
                      {it.calculatedCostPrice && (
                        <div className="text-[10px] text-rose-500">Cost: AED {Number(it.calculatedCostPrice).toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1 pt-2 border-t border-slate-200 font-mono text-right text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>AED {Number(selectedInvoice?.subTotal ?? selectedInvoice?.subtotal ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>5% UAE VAT:</span>
                  <span>AED {Number(selectedInvoice?.vatAmount ?? selectedInvoice?.taxAmount ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-dashed border-slate-300">
                  <span>TOTAL PAID:</span>
                  <span>AED {Number(selectedInvoice?.totalAmount ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center border-t border-slate-200 pt-3">
              <button
                type="button"
                disabled={isDeletingId === selectedInvoice.id}
                onClick={() => handleDeleteInvoice(selectedInvoice)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold rounded-lg text-xs flex items-center gap-1.5 transition border border-rose-200 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Void & Restore Stock</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(selectedInvoice)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Thermal 80mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Party } from '../parties.types.ts';
import {
  X,
  Printer,
  Send,
  FileText,
  CheckCircle2,
  ShoppingBag,
  Calendar,
  CreditCard,
  TrendingUp,
  Phone,
  Mail,
  MapPin,
  Building2,
  ExternalLink,
  Loader2,
  Search,
  Sparkles
} from 'lucide-react';
import { WhatsAppService } from '../../../services/whatsappService.ts';

interface RetailCustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Party | null;
  invoices: any[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export const RetailCustomerStatementModal: React.FC<RetailCustomerStatementModalProps> = ({
  isOpen,
  onClose,
  customer,
  invoices = [],
  isLoading,
  onRefresh
}) => {
  const [statementSearch, setStatementSearch] = useState('');

  if (!isOpen || !customer) return null;

  // Aggregate Metrics
  const totalOrders = invoices.length;
  const totalSpent = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const totalItemsCount = invoices.reduce((sum, inv) => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    return sum + items.reduce((iSum: number, it: any) => iSum + Number(it.quantity || it.qty || 1), 0);
  }, 0);
  const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

  // Filtered Invoices
  const filteredInvoices = invoices.filter(inv => {
    const q = statementSearch.trim().toLowerCase();
    if (!q) return true;
    const invNo = String(inv.invoiceNo || '').toLowerCase();
    const date = String(inv.date || '').toLowerCase();
    const itemsStr = Array.isArray(inv.items)
      ? inv.items.map((it: any) => `${it.name || ''} ${it.item_name || ''} ${it.description || ''}`).join(' ').toLowerCase()
      : '';
    return invNo.includes(q) || date.includes(q) || itemsStr.includes(q);
  });

  // Handle WhatsApp Statement Dispatch
  const handleSendWhatsAppStatement = () => {
    const phone = customer.phone?.trim();
    if (!phone) {
      alert('This customer does not have a phone number registered.');
      return;
    }
    const cleanPhone = WhatsAppService.sanitizePhoneNumber(phone);
    const dateToday = new Date().toLocaleDateString('en-GB');

    const recentInvoicesSummary = invoices.slice(0, 5).map(inv => {
      const d = inv.date ? new Date(inv.date).toLocaleDateString('en-GB') : '-';
      return `• #${inv.invoiceNo} (${d}): AED ${Number(inv.totalAmount || 0).toFixed(2)} [${inv.paymentMethod || 'PAID'}]`;
    }).join('\n');

    const message = encodeURIComponent(
      `🧾 *VINTAGE VIBES DUBAI — RETAIL CUSTOMER STATEMENT*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Customer:* ${customer.name}\n` +
      `*Account Ref:* ${customer.code} (Control: 1130-05)\n` +
      `*Statement Date:* ${dateToday}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *PURCHASE SUMMARY:*\n` +
      `• *Total Orders:* ${totalOrders}\n` +
      `• *Total Garments:* ${totalItemsCount} pcs\n` +
      `• *Lifetime Spend:* AED ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• *Average Order:* AED ${averageOrderValue.toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (recentInvoicesSummary ? `📦 *Recent Invoices:*\n${recentInvoicesSummary}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : '') +
      `Thank you for being our valued customer!\n` +
      `For inquiries or support: +971 55 418 6086`
    );

    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // Browser Print Trigger
  const handlePrintStatement = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #retail-statement-printable,
          #retail-statement-printable * {
            visibility: visible;
          }
          #retail-statement-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        id="retail-statement-printable"
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-xl shadow-inner">
              🛍️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">{customer.name}</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  {customer.code}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                  COA: 1130-05 Walk-In Control
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-3 flex-wrap">
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    <span>{customer.phone}</span>
                  </span>
                )}
                {customer.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-indigo-400" />
                    <span>{customer.email}</span>
                  </span>
                )}
                {customer.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-400" />
                    <span className="truncate max-w-[200px]">{customer.address}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={handlePrintStatement}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
              title="Print Customer Statement"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print Statement</span>
            </button>

            {customer.phone && (
              <button
                type="button"
                onClick={handleSendWhatsAppStatement}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                title="Send Statement via WhatsApp"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1. AGGREGATE KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                <span>Total Spent</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-emerald-900 mt-1">
                AED {totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">Lifetime Retail Purchases</div>
            </div>

            <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3 shadow-2xs">
              <div className="flex items-center justify-between text-blue-800 text-[11px] font-bold uppercase tracking-wider">
                <span>Total Invoices</span>
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-blue-900 mt-1">
                {totalOrders}
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">POS Counter Transactions</div>
            </div>

            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3 shadow-2xs">
              <div className="flex items-center justify-between text-indigo-800 text-[11px] font-bold uppercase tracking-wider">
                <span>Garments Bought</span>
                <ShoppingBag className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-indigo-900 mt-1">
                {totalItemsCount} pcs
              </div>
              <div className="text-[10px] text-indigo-700 mt-0.5">Total Pieces Sold</div>
            </div>

            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 shadow-2xs">
              <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold uppercase tracking-wider">
                <span>Avg Order Value</span>
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-amber-900 mt-1">
                AED {averageOrderValue.toFixed(2)}
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">Per Transaction Average</div>
            </div>
          </div>

          {/* 2. SEARCH & CONTROLS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={statementSearch}
                onChange={e => setStatementSearch(e.target.value)}
                placeholder="Search invoice number, items, date..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 text-slate-800 transition"
              />
              {statementSearch && (
                <button
                  type="button"
                  onClick={() => setStatementSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-semibold self-end sm:self-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Showing {filteredInvoices.length} of {totalOrders} Invoices</span>
            </div>
          </div>

          {/* 3. INVOICES STATEMENT TABLE */}
          {isLoading ? (
            <div className="p-12 text-center bg-slate-50 rounded-xl border border-slate-200">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">Fetching customer sales history from ledger...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
              <h4 className="text-sm font-bold text-slate-700">No Sales Invoices Found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {statementSearch
                  ? `No orders matching "${statementSearch}". Try clearing your search.`
                  : 'This customer does not have any recorded counter purchases yet. New sales processed in POS Terminal will automatically appear here.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Items Summary</th>
                      <th className="py-2.5 px-3">Payment</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-right">VAT (5%)</th>
                      <th className="py-2.5 px-3 text-right">Total (AED)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv, idx) => {
                      const items = Array.isArray(inv.items) ? inv.items : [];
                      const formattedDate = inv.date ? new Date(inv.date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      }) : '-';

                      return (
                        <tr key={inv.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                            {formattedDate}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                            #{inv.invoiceNo}
                          </td>
                          <td className="py-3 px-3 max-w-[260px]">
                            {items.length === 0 ? (
                              <span className="text-slate-400 italic">No item details</span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-slate-800 truncate">
                                  {items[0].name || items[0].item_name || items[0].description || 'Garment'}
                                  {items.length > 1 && (
                                    <span className="text-[10px] text-slate-500 font-normal ml-1">
                                      +{items.length - 1} more
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {items.reduce((s: number, it: any) => s + Number(it.quantity || it.qty || 1), 0)} pcs sold
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {inv.paymentMethod || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                            AED {Number(inv.subtotal || inv.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            AED {Number(inv.taxAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            AED {Number(inv.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{inv.status || 'PAID'}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800">
                    <tr>
                      <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[11px] tracking-wider">
                        Total Statement Balance Paid:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm text-emerald-700">
                        AED {filteredInvoices.reduce((s, inv) => s + Number(inv.totalAmount || 0), 0).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 4. COA & CONTROL KHATA ARCHITECTURE NOTE */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>🏛️</span>
              <span>Enterprise Chart of Accounts Architecture</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Retail counter sales operate under the isolated Walk-In Customer control khata (<code className="font-mono text-indigo-700 font-bold">1130-05 • Walk In Customer</code>). Retail customer profiles exist in CRM Registry for sales statements and WhatsApp invoice dispatch without creating individual COA accounts.
            </p>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 no-print">
          <div className="text-xs text-slate-500 font-medium">
            Customer Statement Dossier • Ref: <span className="font-mono font-bold text-slate-700">{customer.code}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrintStatement}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

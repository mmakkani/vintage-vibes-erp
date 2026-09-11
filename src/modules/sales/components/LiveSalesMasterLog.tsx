import React, { useState, useMemo } from 'react';
import { SalesInvoice } from '../sales.types.ts';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  Calendar,
  Layers,
  DollarSign,
  TrendingUp,
  Package,
  Truck,
  ExternalLink,
  Printer,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  Edit,
  MessageSquare
} from 'lucide-react';
import { EditParcelLogisticsModal } from './EditParcelLogisticsModal.tsx';
import { ThermalShippingLabelModal } from './ThermalShippingLabelModal.tsx';
import { WhatsAppOrderModal } from './WhatsAppOrderModal.tsx';

interface LiveSalesMasterLogProps {
  invoices: SalesInvoice[];
  onSelectInvoiceForReceipt: (inv: SalesInvoice) => void;
  onRefresh?: () => void;
}

export const LiveSalesMasterLog: React.FC<LiveSalesMasterLogProps> = ({
  invoices,
  onSelectInvoiceForReceipt,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED' | 'DRAFT'>('ALL');
  const [boothFilter, setBoothFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [courierFilter, setCourierFilter] = useState('ALL');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Modals for editing parcel details and thermal shipping labels
  const [editingParcelInvoice, setEditingParcelInvoice] = useState<SalesInvoice | null>(null);
  const [thermalSlipInvoice, setThermalSlipInvoice] = useState<SalesInvoice | null>(null);
  const [whatsAppInvoice, setWhatsAppInvoice] = useState<SalesInvoice | null>(null);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalGrossSales = 0;
    let totalCogs = 0;
    let totalShippingCollected = 0;
    let totalPiecesCount = 0;
    let postedCount = 0;
    let draftCount = 0;

    invoices.forEach(inv => {
      if (inv.status === 'POSTED') postedCount++;
      if (inv.status === 'DRAFT') draftCount++;

      const saleAmount = inv.totalAmount || inv.subTotal || 0;
      totalGrossSales += saleAmount;

      const cogs = inv.items.reduce((s, it) => s + (it.calculatedCostPrice || 25), 0);
      totalCogs += cogs;

      if (inv.shippingBearer === 'CUSTOMER') {
        totalShippingCollected += (inv.shippingFeeAed || inv.shippingCharge || 0);
      }
      totalPiecesCount += inv.items.length;
    });

    const grossProfit = totalGrossSales - totalCogs;
    const profitMarginPercent = totalGrossSales > 0 ? Math.round((grossProfit / totalGrossSales) * 100) : 0;

    return {
      totalGrossSales,
      totalCogs,
      grossProfit,
      profitMarginPercent,
      totalShippingCollected,
      totalPiecesCount,
      postedCount,
      draftCount
    };
  }, [invoices]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // Search
      const matchesSearch =
        (inv.invoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.buyerHandle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.items || []).some(it => it.barcode.toLowerCase().includes(searchTerm.toLowerCase()) || it.description.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Status
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;

      // Booth
      if (boothFilter !== 'ALL' && inv.boothId !== boothFilter) return false;

      // Channel
      if (channelFilter !== 'ALL' && inv.socialPlatform !== channelFilter) return false;

      // Courier
      if (courierFilter !== 'ALL' && inv.courierPartner !== courierFilter) return false;

      return true;
    });
  }, [invoices, searchTerm, statusFilter, boothFilter, channelFilter, courierFilter]);

  // CSV Export
  const exportToCsv = () => {
    const headers = [
      'Invoice No',
      'Date',
      'Time',
      'Booth',
      'Host',
      'Channel',
      'Buyer Handle',
      'Customer Phone',
      'Pieces Count',
      'Barcodes',
      'Subtotal (AED)',
      'Total COGS (AED)',
      'Gross Profit (AED)',
      'Margin %',
      'Shipping Fee (AED)',
      'Shipping Bearer',
      'Courier Partner',
      'Tracking Number',
      'Payment Status',
      'Invoice Status',
      'Grand Total (AED)'
    ];

    const rows = filteredInvoices.map(inv => {
      const cogs = inv.items.reduce((s, it) => s + (it.calculatedCostPrice || 25), 0);
      const grossProfit = (inv.subTotal || inv.totalAmount) - cogs;
      const margin = (inv.subTotal || inv.totalAmount) > 0 ? Math.round((grossProfit / (inv.subTotal || inv.totalAmount)) * 100) : 0;
      const barcodes = inv.items.map(it => it.barcode).join('; ');

      return [
        inv.invoiceNo,
        inv.date,
        inv.time || '14:30',
        inv.boothId || 'booth-01',
        inv.hostName || 'Host',
        inv.socialPlatform || 'TIKTOK',
        inv.buyerHandle || inv.customerName,
        inv.customerPhone || '',
        inv.items.length,
        `"${barcodes}"`,
        inv.subTotal.toFixed(2),
        cogs.toFixed(2),
        grossProfit.toFixed(2),
        `${margin}%`,
        (inv.shippingFeeAed || 25).toFixed(2),
        inv.shippingBearer || 'CUSTOMER',
        inv.courierPartner || 'DHL',
        inv.trackingNumber || '',
        inv.paymentStatus || 'UNPAID_PENDING_COD',
        inv.status,
        inv.totalAmount.toFixed(2)
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Live_Sales_Master_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Live Sales Master Log & Audit Registry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enterprise master registry tracking every live stream sale with piece gram cost, gross margin, courier tracking, and payment verification
          </p>
        </div>

        <button
          onClick={exportToCsv}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-colors self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          Export Master Log (CSV)
        </button>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Gross Sales Revenue</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            AED {summary.totalGrossSales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {summary.postedCount} Finalized &bull; {summary.draftCount} Draft Holds
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total COGS (Gram Cost)</div>
          <div className="text-2xl font-bold font-mono text-slate-700 mt-1">
            AED {summary.totalCogs.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Derived directly from raw bale weight
          </div>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Gross Profit Margin</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            AED {summary.grossProfit.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">
            {summary.profitMarginPercent}% Weighted Average Margin
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pieces Dispatched</div>
          <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
            {summary.totalPiecesCount} <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Unique vintage barcodes
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Courier Shipping Collected</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            AED {summary.totalShippingCollected.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            DHL &bull; Aramex &bull; Emirates Post
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Invoice, Buyer, Tracking #, Barcode..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Status tabs */}
            {(['ALL', 'POSTED', 'DRAFT'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL' ? 'All Invoices' : tab === 'POSTED' ? 'Finalized (POSTED)' : 'Draft Holds'}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Booth Filter</label>
            <select
              value={boothFilter}
              onChange={e => setBoothFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
            >
              <option value="ALL">All Live Booths (1-10)</option>
              {Array.from({ length: 10 }).map((_, i) => (
                <option key={i} value={`booth-${String(i + 1).padStart(2, '0')}`}>
                  Booth {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Social Channel</label>
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
            >
              <option value="ALL">All Social Platforms</option>
              <option value="TIKTOK">TikTok Live</option>
              <option value="INSTAGRAM">Instagram Live</option>
              <option value="FACEBOOK">Facebook Live</option>
              <option value="YOUTUBE">YouTube Live</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Courier Partner</label>
            <select
              value={courierFilter}
              onChange={e => setCourierFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
            >
              <option value="ALL">All Couriers</option>
              <option value="DHL">DHL Express</option>
              <option value="ARAMEX">Aramex</option>
              <option value="EMIRATES_POST">Emirates Post</option>
              <option value="MARA_EXPRESS">Mara Express</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setBoothFilter('ALL');
                setChannelFilter('ALL');
                setCourierFilter('ALL');
              }}
              className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Master Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Date / Time</th>
                <th className="px-4 py-3">Booth / Host</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Buyer Handle</th>
                <th className="px-4 py-3">Pieces / SKUs</th>
                <th className="px-4 py-3">Gram Cost (COGS)</th>
                <th className="px-4 py-3">Gross Sale</th>
                <th className="px-4 py-3">Shipping Fee</th>
                <th className="px-4 py-3">Courier & Tracking</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Gross Margin</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-400">
                    No sales records found matching the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const cogs = inv.items.reduce((s, it) => s + (it.calculatedCostPrice || 25), 0);
                  const saleAmount = inv.subTotal || inv.totalAmount || 0;
                  const profit = saleAmount - cogs;
                  const marginPct = saleAmount > 0 ? Math.round((profit / saleAmount) * 100) : 0;
                  const isExpanded = expandedInvoiceId === inv.id;

                  return (
                    <React.Fragment key={inv.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap">
                          {inv.invoiceNo}
                          <span
                            className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              inv.status === 'POSTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700">
                          <div>{inv.date}</div>
                          <div className="text-[10px] text-slate-400">{inv.time || '15:20'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {inv.boothId ? `Booth ${inv.boothId.replace(/[^0-9]/g, '')}` : 'Booth 01'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {inv.hostName || 'Live Host'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {inv.socialPlatform || 'TIKTOK'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {inv.buyerHandle || inv.customerName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 font-normal">
                            {inv.customerPhone || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                            className="font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <strong>{inv.items.length} pcs</strong>
                            <span className="text-[10px] text-slate-400">({isExpanded ? 'Hide' : 'Show'})</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                          AED {cogs.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          AED {inv.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono text-slate-700">
                            AED {(inv.shippingFeeAed || 25).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {inv.shippingBearer === 'CUSTOMER' ? 'Customer Borne' : 'Company Absorbed'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono">
                          <div className="font-semibold text-slate-800">
                            {inv.courierPartner || 'DHL'}
                          </div>
                          <div className="text-[10px] text-indigo-600 font-normal">
                            {inv.trackingNumber || 'DHL-AE-982104'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.paymentStatus === 'PREPAID_VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : inv.paymentStatus === 'PARTIAL_ADVANCE'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {inv.paymentStatus === 'PREPAID_VERIFIED'
                              ? 'Prepaid Verified'
                              : inv.paymentStatus === 'PARTIAL_ADVANCE'
                              ? 'Partial Advance'
                              : 'Pending COD'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono">
                          <div className="font-bold text-emerald-600">+AED {profit.toFixed(2)}</div>
                          <div className="text-[10px] text-emerald-700 font-semibold">{marginPct}%</div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setWhatsAppInvoice(inv)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              title="Send WhatsApp Order Confirmation, Payment Link & Slip"
                            >
                              <MessageSquare className="w-3 h-3 text-white" />
                              <span>📱 WhatsApp</span>
                            </button>
                            <button
                              onClick={() => setEditingParcelInvoice(inv)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              title="Edit DHL / Courier Tracking, Shipping Bearer, and Payment Status"
                            >
                              <Edit className="w-3 h-3 text-slate-950" />
                              <span>✏️ Edit Parcel & Pay</span>
                            </button>
                            <button
                              onClick={() => setThermalSlipInvoice(inv)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              title="Print 4x6 Thermal Shipping Waybill and Dispatch Advice Slip"
                            >
                              <Printer className="w-3 h-3 text-amber-300" />
                              <span>📄 Print Label / Slip</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable SKUs Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={13} className="px-6 py-3 border-b border-slate-200">
                            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                              Scanned SKUs in {inv.invoiceNo}:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {inv.items.map(item => (
                                <div
                                  key={item.barcode}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                                >
                                  <div>
                                    <span className="font-mono font-bold text-indigo-600">{item.barcode}</span>
                                    <div className="text-slate-800 font-medium truncate max-w-[200px]">
                                      {item.description}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Weight: {item.weightGrams || Math.round((item.weightKg || 0.45) * 1000)} g
                                    </div>
                                  </div>
                                  <div className="text-right font-mono">
                                    <div className="text-slate-900 font-bold">AED {item.finalAmount || item.unitPrice}</div>
                                    <div className="text-[10px] text-slate-500">
                                      Cost: AED {(item.calculatedCostPrice || 25).toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Edit Parcel & Logistics & Payment */}
      {editingParcelInvoice && (
        <EditParcelLogisticsModal
          invoice={editingParcelInvoice}
          onClose={() => setEditingParcelInvoice(null)}
          onSaved={() => {
            setEditingParcelInvoice(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Modal: 4x6 Thermal Shipping Label Slip */}
      {thermalSlipInvoice && (
        <ThermalShippingLabelModal
          invoice={thermalSlipInvoice}
          onClose={() => setThermalSlipInvoice(null)}
        />
      )}

      {/* Modal: WhatsApp Order Slip */}
      {whatsAppInvoice && (
        <WhatsAppOrderModal
          invoice={whatsAppInvoice}
          onClose={() => setWhatsAppInvoice(null)}
        />
      )}
    </div>
  );
};

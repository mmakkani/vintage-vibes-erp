import React, { useState, useMemo } from 'react';
import { PurchaseInvoice, InwardGatePass } from '../purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster } from '../../setup/setup.types.ts';
import { ProfessionalPurchaseInvoiceModal } from './ProfessionalPurchaseInvoiceModal.tsx';
import { CommercialInvoiceModal } from './CommercialInvoiceModal.tsx';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Lock,
  Printer,
  Eye,
  Ship,
  Truck,
  ArrowRight,
  Sparkles,
  Tag,
  Edit,
  Trash2,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import { supabase } from '../../../supabaseClient.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';

interface CommercialInvoicesTabProps {
  invoices: PurchaseInvoice[];
  parties: Party[];
  items?: ItemMaster[];
  balePresets?: any[];
  bales?: InwardGatePass[];
  onRefresh: () => void;
  onInvoiceCreated: (inv: PurchaseInvoice) => void;
  onDeleteInvoice?: (id: string) => void;
}

export const CommercialInvoicesTab: React.FC<CommercialInvoicesTabProps> = ({
  invoices,
  parties,
  items,
  balePresets,
  bales = [],
  onRefresh,
  onInvoiceCreated,
  onDeleteInvoice
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [invoicesList, setInvoicesList] = useState<PurchaseInvoice[]>(invoices);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lockedModalInfo, setLockedModalInfo] = useState<{
    invoiceNo: string;
    actionType: 'EDIT' | 'DELETE';
    sortedPiecesCount: number;
    sortedWeightKg: number;
    balesCount: number;
  } | null>(null);

  React.useEffect(() => {
    setInvoicesList(invoices);
  }, [invoices]);

  React.useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 1. FIX SUPPLIER & FACTORY DISPLAY
  const getSupplierDisplayName = (inv: any): string => {
    // 1. If row.supplier_name exists, use it.
    const directName = inv.supplier_name || inv.supplierName || inv.party_name || inv.supplier;
    if (directName && typeof directName === 'string' && directName.trim() !== '') {
      return directName;
    }

    // 2. If only row.supplier_id exists, match it against the loaded suppliers/parties list
    const supplierId = inv.supplier_id || inv.supplierId;
    if (supplierId) {
      const supplier = (parties || []).find(
        s => String(s.id) === String(supplierId) || String(s.code) === String(supplierId)
      );
      if (supplier && supplier.name) {
        return supplier.name;
      }
      return supplierId;
    }

    return 'N/A';
  };

  const getSupplierTrn = (inv: any): string | null => {
    if (inv.supplierTrn || inv.supplier_trn) return inv.supplierTrn || inv.supplier_trn;
    const supplierId = inv.supplier_id || inv.supplierId;
    if (supplierId) {
      const supplier = (parties || []).find(
        s => String(s.id) === String(supplierId) || String(s.code) === String(supplierId)
      );
      if (supplier && (supplier.trnNo || (supplier as any).trn_no)) {
        return supplier.trnNo || (supplier as any).trn_no;
      }
    }
    return null;
  };

  // 2. FIX DATE DISPLAY (DD/MM/YYYY)
  const formatInvoiceDate = (inv: any): string => {
    const rawDate = inv.issue_date || inv.invoice_date || inv.invoiceDate || inv.date || inv.created_at || inv.createdAt;
    if (!rawDate) return 'N/A';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return String(rawDate).slice(0, 10);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return String(rawDate).slice(0, 10);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoicesList.filter(inv => {
      const sName = getSupplierDisplayName(inv);
      const dStr = formatInvoiceDate(inv);
      const q = searchTerm.toLowerCase();
      const match =
        (inv.invoiceNo || '').toLowerCase().includes(q) ||
        sName.toLowerCase().includes(q) ||
        dStr.toLowerCase().includes(q) ||
        (inv.containerNo || '').toLowerCase().includes(q) ||
        (inv.blAirwayBillNo || '').toLowerCase().includes(q);
      return match;
    });
  }, [invoicesList, parties, searchTerm]);

  const getInvoiceAmountInAed = (inv: PurchaseInvoice): number => {
    const rawTotal = Number(inv.totalAmount || 0);
    const curr = (inv.currency || 'AED').toUpperCase();
    if (curr === 'AED') return rawTotal;
    const rate = Number(inv.exchangeRate) || (curr === 'USD' ? 3.6725 : curr === 'EUR' ? 4.015 : curr === 'GBP' ? 4.72 : 1);
    return Number((rawTotal * rate).toFixed(2));
  };

  const totalProcurementAed = useMemo(() => {
    return invoicesList.reduce((sum, i) => sum + getInvoiceAmountInAed(i), 0);
  }, [invoicesList]);

  const handlePrintBatchTags = async (inv: PurchaseInvoice) => {
    let invItems = inv.items || [];
    if (invItems.length === 0) {
      try {
        const { data: dbItems } = await supabase
          .from('purchase_invoice_items')
          .select('*')
          .eq('invoice_id', String(inv.id));
        if (dbItems && dbItems.length > 0) {
          invItems = dbItems.map((itemRow: any) => ({
            id: String(itemRow.id),
            itemId: itemRow.item_code || itemRow.id,
            itemCode: itemRow.item_code || 'VINT-01',
            itemName: itemRow.item_name || itemRow.description || 'Vintage Mix Bales',
            packagingUom: itemRow.packaging_uom || itemRow.packaging || 'BALES',
            packageCount: Number(itemRow.package_count ?? itemRow.quantity ?? 1),
            weightUom: 'KG',
            totalWeight: Number(itemRow.total_weight ?? itemRow.total_kg ?? 0),
            ratePerWeight: Number(itemRow.rate_per_weight ?? itemRow.rate ?? 0),
            lineTotal: Number(itemRow.line_total ?? 0)
          }));
        }
      } catch (e) {
        console.warn('Error fetching items for thermal tags:', e);
      }
    }

    const totalBalesCount = inv.totalBalesCount || invItems.reduce((acc, it) => acc + (Number(it.packageCount) || 1), 0) || 1;
    const balesToPrint: any[] = [];
    let globalBaleIndex = 1;
    const curr = (inv.currency || 'AED').toUpperCase();
    const fxRate = curr === 'AED' ? 1 : (Number(inv.exchangeRate) || 3.6725);
    const sName = getSupplierDisplayName(inv);

    if (invItems.length > 0) {
      invItems.forEach(line => {
        const count = Number(line.packageCount) || 1;
        const weightPerBale = (Number(line.totalWeight) || 0) / count;
        const rawLineTotal = Number(line.lineTotal) || 0;
        const lineTotalAed = rawLineTotal * fxRate;
        const costPerBale = lineTotalAed / count;
        const costPerGram = weightPerBale > 0 ? (costPerBale / (weightPerBale * 1000)) : 0;

        for (let i = 1; i <= count; i++) {
          const paddedIdx = String(globalBaleIndex).padStart(3, '0');
          balesToPrint.push({
            baleCode: `BAL-${inv.invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${paddedIdx}`,
            category: line.itemName || 'Vintage Mix Bales',
            grossWeightKg: Number(weightPerBale.toFixed(2)),
            totalCostAed: Number(costPerBale.toFixed(2)),
            costPerGram,
            purchaseInvoiceNo: inv.invoiceNo,
            supplierName: sName,
            status: 'Unopened / Ready for Sorting',
            index: globalBaleIndex,
            totalCount: totalBalesCount
          });
          globalBaleIndex++;
        }
      });
    } else {
      const wt = Number(inv.totalWeightKg || inv.totalGrossWeightKg || 45);
      const cost = getInvoiceAmountInAed(inv);
      balesToPrint.push({
        baleCode: `BAL-${inv.invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-001`,
        category: 'Vintage Mix Bales',
        grossWeightKg: wt,
        totalCostAed: cost,
        costPerGram: wt > 0 ? (cost / (wt * 1000)) : 0,
        purchaseInvoiceNo: inv.invoiceNo,
        supplierName: sName,
        status: 'Unopened / Ready for Sorting',
        index: 1,
        totalCount: 1
      });
    }

    openBatchBaleThermalTagsPrintWindow(balesToPrint);
  };

  const handlePostInvoice = async (invId: string) => {
    try {
      await PurchaseService.postPurchaseInvoice(invId);
      setToastMessage("Purchase invoice posted to General Ledger & Supplier Khata!");
      onRefresh();
    } catch (e: any) {
      console.warn('Error posting invoice:', e);
      alert("Failed to post invoice: " + (e?.message || 'Error'));
    }
  };

  const handleUnpostInvoice = async (invId: string) => {
    if (!window.confirm("Are you sure you want to unpost this invoice back to DRAFT?")) return;
    try {
      await PurchaseService.unpostPurchaseInvoice(invId);
      setToastMessage("Purchase invoice unposted to DRAFT");
      onRefresh();
    } catch (e: any) {
      alert("Failed to unpost invoice: " + (e?.message || 'Error'));
    }
  };

  const handleConvertToInward = async (invId: string) => {
    try {
      const createdBales = await PurchaseService.convertToInwardGatePass(invId);
      alert(`✅ Inward Gate Pass Created!\n\n${createdBales.length} bale(s) generated and ready for sorting in Terminal.\nConsignment value successfully booked to COA & Supplier Khata.`);
      onRefresh();
    } catch (e: any) {
      console.warn('Error converting to inward:', e);
      alert(`Failed to create inward gate pass: ${e.message || 'Unknown error'}`);
    }
  };

  const handleEditInvoiceClick = (inv: PurchaseInvoice) => {
    const related = (bales || []).filter(
      b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
    );
    const sortedCount = related.reduce((acc, b) => acc + (b.pieces?.length || b.pieceCount || 0), 0);
    const sortedKg = related.reduce((acc, b) => acc + (b.brokenDownWeight || 0), 0);

    if (sortedCount > 0 || sortedKg > 0) {
      setLockedModalInfo({
        invoiceNo: inv.invoiceNo,
        actionType: 'EDIT',
        sortedPiecesCount: sortedCount,
        sortedWeightKg: sortedKg,
        balesCount: related.length
      });
      return;
    }

    setEditingInvoice(inv);
    setShowCreateModal(true);
  };

  // 3. FIX DELETE BUTTON (Cascading Delete Handler)
  const handleDeleteInvoice = async (invoiceId: string, invoiceNo?: string) => {
    // a) Confirmation prompt:
    if (!window.confirm("Are you sure you want to permanently delete this purchase invoice?")) return;

    try {
      // b) Delete associated manifest line items first:
      const { error: itemsError } = await supabase
        .from('purchase_invoice_items')
        .delete()
        .eq('invoice_id', String(invoiceId));
      if (itemsError) console.warn("Items delete warning:", itemsError);

      // Also clean up any unopened inward gate pass bales associated with this invoice:
      try {
        await supabase
          .from('inward_gate_passes')
          .delete()
          .or(`purchase_invoice_id.eq.${invoiceId}${invoiceNo ? `,purchase_invoice_no.eq.${invoiceNo}` : ''}`);
      } catch (gateErr) {
        console.warn("Gate passes delete warning:", gateErr);
      }

      // c) Delete the invoice record:
      const { error: invoiceError } = await supabase
        .from('purchase_invoices')
        .delete()
        .eq('id', String(invoiceId));

      if (invoiceError) {
        console.error("Failed to delete invoice:", invoiceError);
        alert("Delete failed: " + invoiceError.message);
        return;
      }

      // d) Immediately remove the deleted invoice from React state:
      setInvoicesList(prev => prev.filter(inv => String(inv.id) !== String(invoiceId)));
      if (onDeleteInvoice) {
        onDeleteInvoice(String(invoiceId));
      }

      setToastMessage("Purchase invoice deleted successfully");
      try {
        if (typeof (window as any).toast !== 'undefined') {
          (window as any).toast.success("Purchase invoice deleted successfully");
        }
      } catch {}

      onRefresh();
    } catch (e: any) {
      console.error("Error deleting invoice:", e);
      alert(e.message || "Failed to delete purchase invoice");
    }
  };

  const handleDeleteInvoiceClick = async (inv: PurchaseInvoice) => {
    const related = (bales || []).filter(
      b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
    );
    const sortedCount = related.reduce((acc, b) => acc + (b.pieces?.length || b.pieceCount || 0), 0);
    const sortedKg = related.reduce((acc, b) => acc + (b.brokenDownWeight || 0), 0);

    if (sortedCount > 0 || sortedKg > 0) {
      setLockedModalInfo({
        invoiceNo: inv.invoiceNo,
        actionType: 'DELETE',
        sortedPiecesCount: sortedCount,
        sortedWeightKg: sortedKg,
        balesCount: related.length
      });
      return;
    }

    await handleDeleteInvoice(inv.id, inv.invoiceNo);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Factory Commercial Invoices & Port Clearing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage international supplier commercial bills, bills of lading (B/L), containers, and landed customs clearance
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingInvoice(null);
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Commercial Invoice</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Invoice No, Container, Supplier, B/L..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Total Procurement Value: <strong className="text-indigo-700 text-sm">AED {totalProcurementAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Invoice No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier & Factory</th>
                <th className="px-4 py-3">Shipping Container</th>
                <th className="px-4 py-3">B/L Reference</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Sorting Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No commercial invoices registered. Click "New Commercial Invoice" to record one!
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const relatedBales = (bales || []).filter(
                    b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
                  );
                  const sortedPiecesCount = relatedBales.reduce(
                    (acc, b) => acc + (b.pieces?.length || b.pieceCount || 0),
                    0
                  );
                  const sortedWeightKg = relatedBales.reduce(
                    (acc, b) => acc + (b.brokenDownWeight || 0),
                    0
                  );
                  const isSortingStarted = sortedPiecesCount > 0 || sortedWeightKg > 0;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                        {inv.invoiceNo}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {formatInvoiceDate(inv)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{getSupplierDisplayName(inv)}</div>
                        {getSupplierTrn(inv) && (
                          <div className="text-[10px] text-slate-400 font-mono">TRN: {getSupplierTrn(inv)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {inv.containerNo || 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {inv.blAirwayBillNo || 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        <div>
                          {(inv.currency || 'AED') === 'USD' ? '$' : (inv.currency || 'AED')} {Number(inv.totalAmount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                        </div>
                        {(inv.currency || 'AED').toUpperCase() !== 'AED' && (
                          <div className="text-[10px] text-indigo-700 font-bold tracking-tight">
                            ≈ AED {getInvoiceAmountInAed(inv).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                            <span className="text-[9px] text-slate-400 font-normal ml-1">(@ {Number(inv.exchangeRate || 3.6725)})</span>
                          </div>
                        )}
                        {inv.applyVat !== false && inv.vatAmount > 0 && (
                          <span className="block text-[9px] text-emerald-600 font-medium">Incl. 5% VAT</span>
                        )}
                        {inv.applyVat === false && (
                          <span className="block text-[9px] text-slate-400 font-medium">Without VAT</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSortingStarted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                            <span>Sorted: {sortedPiecesCount} pcs ({sortedWeightKg.toFixed(1)}kg)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Unsorted (Editable)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleEditInvoiceClick(inv)}
                            className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors border ${
                              isSortingStarted
                                ? 'bg-slate-100 text-slate-400 border-slate-200'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                            }`}
                            title={
                              isSortingStarted
                                ? `Locked: Sorting has started (${sortedPiecesCount} pcs). Delete all pieces in Sorting Terminal first to edit.`
                                : 'Edit Commercial Invoice'
                            }
                          >
                            {isSortingStarted ? <Lock className="w-3 h-3 text-slate-400" /> : <Edit className="w-3 h-3 text-blue-600" />}
                            <span>{isSortingStarted ? 'Locked' : 'Edit'}</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoiceClick(inv)}
                            className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors border ${
                              isSortingStarted
                                ? 'bg-slate-100 text-slate-400 border-slate-200'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                            }`}
                            title={
                              isSortingStarted
                                ? `Locked: Sorting has started (${sortedPiecesCount} pcs). Delete all pieces in Sorting Terminal first to delete.`
                                : 'Delete Commercial Invoice'
                            }
                          >
                            {isSortingStarted ? <Lock className="w-3 h-3 text-slate-400" /> : <Trash2 className="w-3 h-3 text-rose-600" />}
                            <span>Delete</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePrintBatchTags(inv)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors border border-amber-300"
                            title="Print 4x2 Thermal Barcode Labels for every bale/bag in this invoice"
                          >
                            <Tag className="w-3.5 h-3.5 text-amber-600" />
                            <span>Print Bales</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setViewInvoice({
                              ...inv,
                              supplierName: getSupplierDisplayName(inv),
                              date: formatInvoiceDate(inv)
                            })}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors"
                            title="View & Print Formal Commercial Invoice"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>View Doc</span>
                          </button>

                          {inv.status === 'POSTED' && !isSortingStarted && !inv.convertedToInward && (
                            <button
                              type="button"
                              onClick={() => handleUnpostInvoice(inv.id)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors border border-amber-300"
                              title="Unpost this invoice back to DRAFT to allow changes or deletion"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                              <span>Unpost</span>
                            </button>
                          )}

                          {inv.status !== 'POSTED' && (
                            <button
                              type="button"
                              onClick={() => handlePostInvoice(inv.id)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Post</span>
                            </button>
                          )}

                          {!inv.convertedToInward && (
                            <button
                              type="button"
                              onClick={() => handleConvertToInward(inv.id)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors"
                              title="Generate Inward Gate Pass & Bales"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              <span>Inward Pass</span>
                            </button>
                          )}
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

      {/* Locked Sorting Protection Modal */}
      {lockedModalInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cannot {lockedModalInfo.actionType === 'EDIT' ? 'Edit' : 'Delete'} Invoice {lockedModalInfo.invoiceNo}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Sorting has already started for bales created from this invoice:
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span>Pieces Sorted:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.sortedPiecesCount} pieces</strong>
              </div>
              <div className="flex justify-between">
                <span>Weight Broken Down:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.sortedWeightKg.toFixed(2)} KG</strong>
              </div>
              <div className="flex justify-between">
                <span>Associated Bales:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.balesCount} Bales</strong>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
              <strong className="text-slate-800 block mb-1">To unlock Edit & Delete:</strong>
              Please navigate to the <strong>Bale Sorting Operations Hub</strong> and delete all <strong>{lockedModalInfo.sortedPiecesCount}</strong> sorted pieces from these bales. Once all pieces are deleted (0 pieces remaining sorted), editing and deleting this invoice will automatically unlock!
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLockedModalInfo(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Understood (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Commercial Invoice Modal */}
      {showCreateModal && (
        <ProfessionalPurchaseInvoiceModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingInvoice(null);
          }}
          parties={parties}
          items={items}
          balePresets={balePresets}
          editingInvoice={editingInvoice}
          onSuccess={newInv => {
            setShowCreateModal(false);
            setEditingInvoice(null);
            onInvoiceCreated(newInv);
            onRefresh();
          }}
        />
      )}

      {/* View Printable Commercial Invoice */}
      {viewInvoice && (
        <CommercialInvoiceModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 border border-emerald-500/60 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

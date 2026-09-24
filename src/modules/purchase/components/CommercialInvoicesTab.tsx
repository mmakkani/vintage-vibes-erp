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
  RotateCcw,
  Loader2,
  X
} from 'lucide-react';
import { openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import { openCommercialInvoiceA4PrintWindow, numberToWords } from '../../../utils/printInvoiceA4.ts';
import { supabase } from '../../../supabaseClient.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { useSync } from '../../../context/SyncContext.tsx';
import { Pagination } from '../../../components/Pagination.tsx';

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
  const { notifyMutation, lastDelta } = useSync('purchase');
  // State-Based Row Glow Animation (UX Enhancement across all devices)
  const [glowingRowIds, setGlowingRowIds] = useState<string[]>([]);

  const triggerRowGlow = React.useCallback((id?: string) => {
    if (!id) return;
    const cleanId = String(id).trim();
    if (!cleanId) return;
    setGlowingRowIds(prev => (prev.includes(cleanId) ? prev : [...prev, cleanId]));
    setTimeout(() => {
      setGlowingRowIds(prev => prev.filter(item => item !== cleanId));
    }, 3000);
  }, []);

  React.useEffect(() => {
    if (!lastDelta) return;
    // Strictly handle purchase_invoices mutations; explicitly ignore other entities like inward_gate_passes
    if (lastDelta.entity && lastDelta.entity !== 'purchase_invoices') return;

    if (
      lastDelta.entity === 'purchase_invoices' ||
      lastDelta.payload?.invoice ||
      lastDelta.payload?.purchase_invoices
    ) {
      const raw =
        lastDelta.payload?.invoice ||
        lastDelta.payload?.purchase_invoices ||
        lastDelta.payload?.record;

      if (!raw || (!raw.invoice_no && !raw.invoiceNo)) {
        return;
      }

      const invId = String(lastDelta.documentRef || raw?.id || raw?.invoice_id || '');
      const invNo = String(raw?.invoice_no || raw?.invoiceNo || invId);

      if (raw && (raw.id || raw.invoice_no || raw.invoiceNo)) {
        const rawDate = raw.issue_date || raw.invoice_date || raw.date || raw.created_at;
        let cleanDate = '';
        if (rawDate) {
          try {
            const d = new Date(rawDate);
            cleanDate = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
          } catch {
            cleanDate = String(rawDate).slice(0, 10);
          }
        }

        const mappedInv: PurchaseInvoice = {
          id: invId || raw.id,
          invoiceNo: invNo || raw.id,
          supplierId: raw.supplier_id || raw.supplierId || '',
          supplierName: raw.supplier_name || raw.supplierName || '',
          supplierTrn: raw.supplier_trn || raw.supplierTrn,
          date: cleanDate || new Date().toISOString().slice(0, 10),
          dueDate: raw.due_date || raw.dueDate,
          status: raw.status || 'DRAFT',
          currency: (raw.currency || 'AED').toUpperCase() as any,
          exchangeRate: Number(raw.exchange_rate || 1.0),
          subTotal: Number(raw.sub_total ?? raw.subTotal ?? raw.total_amount ?? 0),
          applyVat: Boolean(raw.apply_vat ?? raw.applyVat),
          vatRatePercent: Number(raw.vat_rate_percent ?? raw.vatRatePercent ?? 0),
          vatAmount: Number(raw.vat_amount ?? raw.vatAmount ?? 0),
          totalAmount: Number(raw.total_amount ?? raw.total_payable ?? raw.totalAmount ?? 0),
          netAmount: Number(raw.net_amount ?? raw.netAmount ?? raw.total_amount ?? 0),
          notes: raw.notes || '',
          convertedToInward: Boolean(raw.converted_to_inward ?? raw.convertedToInward),
          inwardGatePassId: raw.inward_gate_pass_id || raw.inwardGatePassId,
          items: raw.items || [],
          containerNo: raw.container_no || raw.containerNo,
          blAirwayBillNo: raw.bl_airway_bill_no || raw.blAirwayBillNo,
          portOfEntry: raw.port_of_entry || raw.portOfEntry,
          totalBalesCount: Number(raw.total_bales_count ?? raw.totalBalesCount ?? 0),
          totalGrossWeightKg: Number(raw.total_gross_weight_kg ?? raw.totalGrossWeightKg ?? 0)
        };

        setInvoicesList(prev => {
          const exists = prev.some(i => String(i.id) === invId || (invNo && i.invoiceNo === invNo));
          if (exists) {
            return prev.map(i => (String(i.id) === invId || (invNo && i.invoiceNo === invNo) ? { ...i, ...mappedInv } : i));
          }
          return [mappedInv, ...prev];
        });
      }

      if (invId) triggerRowGlow(invId);
      if (invNo) triggerRowGlow(invNo);
    }
  }, [lastDelta, triggerRowGlow]);

  // Real-Time Cross-Device WebSocket Listener for Instant Cache Injection
  React.useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      const { table, record } = detail;

      if (table === 'purchase_invoices') {
        const invId = String(record.id || '');
        const invNo = String(record.invoice_no || record.invoiceNo || invId);
        const rawDate = record.issue_date || record.invoice_date || record.date || record.created_at;
        let cleanDate = '';
        if (rawDate) {
          try {
            const d = new Date(rawDate);
            cleanDate = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
          } catch {
            cleanDate = String(rawDate).slice(0, 10);
          }
        }

        const mappedInv: PurchaseInvoice = {
          id: invId,
          invoiceNo: invNo,
          supplierId: record.supplier_id || record.supplierId || '',
          supplierName: record.supplier_name || record.supplierName || '',
          supplierTrn: record.supplier_trn || record.supplierTrn,
          date: cleanDate || new Date().toISOString().slice(0, 10),
          dueDate: record.due_date || record.dueDate,
          status: record.status || 'DRAFT',
          currency: (record.currency || 'AED').toUpperCase() as any,
          exchangeRate: Number(record.exchange_rate || 1.0),
          subTotal: Number(record.sub_total ?? record.subTotal ?? record.total_amount ?? 0),
          applyVat: Boolean(record.apply_vat ?? record.applyVat),
          vatRatePercent: Number(record.vat_rate_percent ?? record.vatRatePercent ?? 0),
          vatAmount: Number(record.vat_amount ?? record.vatAmount ?? 0),
          totalAmount: Number(record.total_amount ?? record.total_payable ?? record.totalAmount ?? 0),
          netAmount: Number(record.net_amount ?? record.netAmount ?? record.total_amount ?? 0),
          notes: record.notes || '',
          convertedToInward: Boolean(record.converted_to_inward ?? record.convertedToInward),
          inwardGatePassId: record.inward_gate_pass_id || record.inwardGatePassId,
          items: record.items || [],
          containerNo: record.container_no || record.containerNo,
          blAirwayBillNo: record.bl_airway_bill_no || record.blAirwayBillNo,
          portOfEntry: record.port_of_entry || record.portOfEntry,
          totalBalesCount: Number(record.total_bales_count ?? record.totalBalesCount ?? 0),
          totalGrossWeightKg: Number(record.total_gross_weight_kg ?? record.totalGrossWeightKg ?? 0)
        };

        setInvoicesList(prev => {
          const exists = prev.some(i => String(i.id) === invId || (invNo && i.invoiceNo === invNo));
          if (exists) {
            return prev.map(i => (String(i.id) === invId || (invNo && i.invoiceNo === invNo) ? { ...i, ...mappedInv } : i));
          }
          return [mappedInv, ...prev];
        });

        if (invId) triggerRowGlow(invId);
        if (invNo) triggerRowGlow(invNo);
      }
    };

    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => {
      window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
    };
  }, [triggerRowGlow]);

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [invoicesList, setInvoicesList] = useState<PurchaseInvoice[]>(invoices);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isConvertingId, setIsConvertingId] = useState<string | null>(null);
  const isConvertingRef = React.useRef<Set<string>>(new Set());
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [unpostingInvoiceId, setUnpostingInvoiceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = React.useRef<boolean>(false);
  const [postingInvoiceId, setPostingInvoiceId] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalInvoices, setTotalInvoices] = useState<number>(invoices?.length || 0);
  const [totalPages, setTotalPages] = useState<number>(Math.max(1, Math.ceil((invoices?.length || 0) / 10)));
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [lockedModalInfo, setLockedModalInfo] = useState<{
    invoiceNo: string;
    actionType: 'EDIT' | 'DELETE';
    sortedPiecesCount: number;
    sortedWeightKg: number;
    balesCount: number;
  } | null>(null);

  const fetchPaginatedInvoices = React.useCallback(async (targetPage = page, targetPageSize = pageSize, targetSearch = searchTerm) => {
    setIsLoadingPage(true);
    try {
      const res = await PurchaseService.getPurchaseInvoicesPaginated({
        page: targetPage,
        pageSize: targetPageSize,
        search: targetSearch
      });
      setInvoicesList(res.data);
      setTotalInvoices(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.warn('[CommercialInvoicesTab] Pagination fetch notice:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, [page, pageSize, searchTerm]);

  React.useEffect(() => {
    fetchPaginatedInvoices(page, pageSize, searchTerm);
  }, [page, pageSize, searchTerm, fetchPaginatedInvoices]);

  // Realtime refetch current page on Supabase CDC update
  React.useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'purchase_invoices') {
        fetchPaginatedInvoices(page, pageSize, searchTerm);
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
  }, [fetchPaginatedInvoices, page, pageSize, searchTerm]);

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
    const cleanId = String(invId || '').trim();
    if (!cleanId) return;
    if (isSubmitting || isSubmittingRef.current || postingInvoiceId) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setPostingInvoiceId(cleanId);

    try {
      // 1. Strict Pessimistic: Await PostgreSQL / Supabase commit first
      const createdVoucher = await PurchaseService.postPurchaseInvoice(cleanId);

      // 2. ONLY AFTER DB confirmation, inject confirmed state into local cache
      setInvoicesList(prev => prev.map(inv => String(inv.id) === cleanId ? { ...inv, status: 'POSTED' } : inv));
      triggerRowGlow(cleanId);
      setToastMessage("Purchase invoice posted to General Ledger & Supplier Khata!");

      // 3. Broadcast confirmed delta payload
      notifyMutation('finance', 'vouchers', 'POSTED', cleanId, { voucher: createdVoucher });
      notifyMutation('purchase', 'purchase_invoices', 'POSTED', cleanId);
      onRefresh();
    } catch (e: any) {
      console.warn('Error posting invoice:', e);
      alert("Failed to post invoice: " + (e?.message || 'Error'));
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setPostingInvoiceId(null);
    }
  };

  const handleUnpostInvoice = async (invId: string) => {
    if (unpostingInvoiceId) return;
    const invoice = invoicesList.find(i => String(i.id) === String(invId));
    const invoiceNo = invoice?.invoiceNo || invId;

    // Rule B (Unpost/Delete Dependency): An invoice CANNOT be unposted if related bales exist
    const related = (bales || []).filter(
      b => b.purchaseInvoiceId === invId || (invoice && b.purchaseInvoiceNo === invoice.invoiceNo)
    );
    if (related.length > 0 || invoice?.convertedToInward) {
      alert(`Cannot unpost invoice ${invoiceNo} because ${related.length || 1} Inward Pass(es) / Sorting Bale(s) have already been generated for it.\n\nYou must delete the Sorting Bales in the Sorting / Inward Terminal first.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to unpost invoice "${invoiceNo}" back to DRAFT? Auto-generated financial vouchers and ledger entries will be reversed.`)) return;

    setUnpostingInvoiceId(String(invId));
    try {
      // 1. Single atomic backend call
      await PurchaseService.unpostPurchaseInvoice(invId);

      // 2. ONLY AFTER DB confirmation, update local state (Delta Cache Injection)
      setInvoicesList(prev => prev.map(inv => String(inv.id) === String(invId) ? { ...inv, status: 'DRAFT', convertedToInward: false } : inv));
      triggerRowGlow(invId);
      setToastMessage("Purchase invoice unposted to DRAFT and financial vouchers reversed");

      // 3. Broadcast confirmed unpost delta
      notifyMutation('finance', 'vouchers', 'UNPOSTED', invId, { invoiceNo, invoiceId: invId });
      notifyMutation('purchase', 'purchase_invoices', 'UNPOSTED', invId);
      onRefresh();
    } catch (e: any) {
      alert("Failed to unpost invoice: " + (e?.message || 'Error'));
    } finally {
      setUnpostingInvoiceId(null);
    }
  };

  const handleConvertToInward = async (invId: string) => {
    if (isConvertingRef.current.has(invId) || isConvertingId) return;
    isConvertingRef.current.add(invId);
    setIsConvertingId(invId);
    try {
      const createdBales = await PurchaseService.convertToInwardGatePass(invId);
      // Immediately reflect convertedToInward in local state so UI updates without waiting
      setInvoicesList(prev => prev.map(item => String(item.id) === String(invId) ? { ...item, convertedToInward: true, status: 'POSTED' } : item));
      triggerRowGlow(invId);
      notifyMutation('finance', 'vouchers', 'INWARD_POSTED', invId);
      notifyMutation('purchase', 'inward_gate_passes', 'CREATED', invId, { bales: createdBales, invoiceId: invId });
      setToastMessage(`✓ Inward Gate Pass Created: ${createdBales.length} bale(s) generated & ready for sorting in Terminal!`);
      onRefresh();
    } catch (e: any) {
      console.warn('Error converting to inward:', e);
      alert(`Failed to create inward gate pass: ${e.message || 'Unknown error'}`);
    } finally {
      isConvertingRef.current.delete(invId);
      setIsConvertingId(null);
    }
  };

  const handleDirectA4Print = async (inv: PurchaseInvoice) => {
    let invItems = inv.items || [];
    if (invItems.length === 0) {
      try {
        const { data: dbItems } = await supabase
          .from('purchase_invoice_items')
          .select('*')
          .eq('invoice_id', String(inv.id));
        if (dbItems && dbItems.length > 0) {
          invItems = dbItems.map((itemRow: any, idx: number) => ({
            id: String(itemRow.id || `pi-${idx}`),
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
        console.warn('Error fetching items for A4 print:', e);
      }
    }

    const currency = (inv.currency || 'AED').toUpperCase();
    const exchangeRate = Number(inv.exchangeRate) || (currency === 'USD' ? 3.6725 : currency === 'EUR' ? 4.015 : 1);

    const mappedItems = (invItems.length > 0 ? invItems : [
      {
        id: `pi-${inv.id || '1'}`,
        itemName: 'Vintage Mix Bales',
        packagingUom: 'BALES',
        packageCount: Number(inv.totalBalesCount || (inv as any).total_bales_count || 1),
        totalWeight: Number(inv.totalWeightKg || (inv as any).total_weight_kg || 25),
        ratePerWeight: 0,
        lineTotal: Number(inv.totalAmount || 0)
      }
    ]).map((i: any) => {
      const count = Number(i.packageCount) || 1;
      const grossKg = Number(i.totalWeight) || 0;
      const netKg = Number((grossKg * 0.96).toFixed(1));
      const rawRate = Number(i.ratePerWeight) || 0;
      const rawLineTotal = Number(i.lineTotal) || (grossKg * rawRate);

      let unitPriceUsd = 0;
      let totalUsd = 0;
      let unitPriceAed = 0;
      let totalAed = 0;

      if (currency === 'USD') {
        unitPriceUsd = rawRate;
        totalUsd = rawLineTotal;
        unitPriceAed = Number((rawRate * exchangeRate).toFixed(2));
        totalAed = Number((rawLineTotal * exchangeRate).toFixed(2));
      } else {
        unitPriceAed = rawRate;
        totalAed = rawLineTotal;
        unitPriceUsd = Number((rawRate / exchangeRate).toFixed(2));
        totalUsd = Number((rawLineTotal / exchangeRate).toFixed(2));
      }

      return {
        description: `${i.itemName || 'Vintage Mix Bales'} (${i.packagingUom || 'BALES'} packing)`,
        hsCode: '6309.00.10',
        quantityBales: count,
        netWeightKg: netKg,
        grossWeightKg: grossKg,
        unitPriceUsd,
        totalUsd,
        unitPriceAed,
        totalAed
      };
    });

    const totalBales = mappedItems.reduce((acc, i) => acc + i.quantityBales, 0);
    const totalNetKg = mappedItems.reduce((acc, i) => acc + i.netWeightKg, 0);
    const totalGrossKg = mappedItems.reduce((acc, i) => acc + i.grossWeightKg, 0);
    const totalUsd = mappedItems.reduce((acc, i) => acc + i.totalUsd, 0);
    const totalAed = mappedItems.reduce((acc, i) => acc + i.totalAed, 0);

    const freightAmount = Number(inv.freightAmount || (inv as any).freight_amount || 0);
    const customsDutyAmount = Number(inv.customsDutyAmount || (inv as any).customs_duty_amount || (inv as any).customsDuty || 0);
    const terminalHandlingAmount = Number(inv.terminalHandlingAmount || (inv as any).terminal_handling_amount || (inv as any).terminalHandling || 0);
    const deductionAmount = Number(inv.deductionAmount || (inv as any).deduction_amount || (inv as any).discountAmount || (inv as any).discount_amount || 0);
    const vatAmount = Number(inv.vatAmount || (inv as any).tax_amount || (inv as any).taxAmount || 0);
    const itemsSubTotal = currency === 'USD' ? totalUsd : totalAed;
    const grandTotal = Number(inv.totalAmount || (inv as any).total_amount || inv.netAmount || (itemsSubTotal + freightAmount + customsDutyAmount + terminalHandlingAmount - deductionAmount + vatAmount));
    const grandTotalAed = currency === 'AED' ? grandTotal : Number((grandTotal * exchangeRate).toFixed(2));

    openCommercialInvoiceA4PrintWindow({
      docNo: inv.invoiceNo,
      date: formatInvoiceDate(inv),
      supplierName: getSupplierDisplayName(inv),
      supplierTrn: getSupplierTrn(inv) || undefined,
      consigneeName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      consigneeAddress: 'House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, UAE',
      consigneeTrn: '100482910300003',
      vesselName: (inv as any).vesselName || (inv as any).vessel_name || '-',
      billOfLading: inv.blAirwayBillNo || (inv as any).bl_no || '-',
      containerNo: inv.containerNo || (inv as any).container_no || '-',
      portOfDischarge: inv.portOfEntry || (inv as any).port_of_arrival || 'Jebel Ali Port (AEJEA), Dubai, UAE',
      items: mappedItems,
      totalBales,
      totalNetKg,
      totalGrossKg,
      totalUsd,
      totalAed,
      amountInWords: numberToWords(grandTotalAed),
      currency,
      exchangeRate,
      itemsSubTotal,
      freightAmount,
      customsDutyAmount,
      terminalHandlingAmount,
      deductionAmount,
      vatAmount,
      grandTotal,
      grandTotalAed
    });
  };

  const handleEditInvoiceClick = (inv: PurchaseInvoice) => {
    const related = (bales || []).filter(
      b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
    );
    const hasInward = related.length > 0 || Boolean(inv.convertedToInward) || Boolean((inv as any).converted_to_inward);
    const sortedCount = related.reduce((acc, b) => acc + (b.pieces?.length || b.pieceCount || 0), 0);
    const sortedKg = related.reduce((acc, b) => acc + (b.brokenDownWeight || 0), 0);

    if (hasInward || sortedCount > 0 || sortedKg > 0) {
      setLockedModalInfo({
        invoiceNo: inv.invoiceNo,
        actionType: 'EDIT',
        sortedPiecesCount: sortedCount,
        sortedWeightKg: sortedKg,
        balesCount: related.length || 1
      });
      return;
    }

    if (inv.status === 'POSTED') {
      alert(`Cannot edit invoice "${inv.invoiceNo}" because it is in POSTED status.\n\nPlease click "Unpost" first to reverse financial vouchers back to DRAFT before editing.`);
      return;
    }

    setEditingInvoice(inv);
    setShowCreateModal(true);
  };

  // 3. FIX DELETE BUTTON (Strict ERP Constraints)
  const handleDeleteInvoice = async (invoiceId: string, invoiceNo?: string) => {
    setDeletingInvoiceId(String(invoiceId));
    try {
      await PurchaseService.deletePurchaseInvoice(String(invoiceId), invoiceNo);

      // Immediately filter out the deleted ID from local state upon success:
      setInvoicesList(prev => {
        const next = prev.filter(inv => String(inv.id) !== String(invoiceId));
        // Smart Deletion: If user deletes the LAST row on the current page (and currentPage > 1), navigate to currentPage - 1
        if (next.length === 0 && page > 1) {
          setPage(p => Math.max(1, p - 1));
        }
        return next;
      });
      setTotalInvoices(prev => Math.max(0, prev - 1));

      if (onDeleteInvoice) {
        onDeleteInvoice(String(invoiceId));
      }

      setToastMessage("Purchase invoice deleted successfully");
      try {
        if (typeof (window as any).toast !== 'undefined') {
          (window as any).toast.success("Purchase invoice deleted successfully");
        }
      } catch {}

      fetchPaginatedInvoices(page, pageSize, searchTerm);
      onRefresh();
    } catch (e: any) {
      console.error("Error deleting invoice:", e);
      alert(e.message || "Failed to delete purchase invoice");
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  const handleDeleteInvoiceClick = async (inv: PurchaseInvoice) => {
    // Rule A (Inward / Sorting Dependency): CANNOT delete if Inward Pass or Sorting Bale exists
    const related = (bales || []).filter(
      b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
    );
    const hasInward = related.length > 0 || Boolean(inv.convertedToInward) || Boolean((inv as any).converted_to_inward);
    const sortedCount = related.reduce((acc, b) => acc + (b.pieces?.length || b.pieceCount || 0), 0);
    const sortedKg = related.reduce((acc, b) => acc + (b.brokenDownWeight || 0), 0);

    if (hasInward || sortedCount > 0 || sortedKg > 0) {
      setLockedModalInfo({
        invoiceNo: inv.invoiceNo,
        actionType: 'DELETE',
        sortedPiecesCount: sortedCount,
        sortedWeightKg: sortedKg,
        balesCount: related.length || 1
      });
      return;
    }

    // Rule B (Delete Confirmation): Warn if POSTED that all linked vouchers and ledger entries will be cascade deleted
    if (inv.status === 'POSTED') {
      if (!window.confirm(`Commercial Invoice "${inv.invoiceNo}" is currently POSTED.\n\nDeleting it will cascade delete all linked financial vouchers, journal entries, reversal logs, and recalculate party and COA balances.\n\nAre you sure you want to permanently delete it?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to permanently delete purchase invoice "${inv.invoiceNo}"?`)) return;
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
            onChange={e => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Total Procurement Value: <strong className="text-indigo-700 text-sm">AED {totalProcurementAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Invoice No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier & Factory</th>
                <th className="px-4 py-3">Container / B/L</th>
                <th className="px-4 py-3 text-right">Gross Total</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3">Sorting Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No commercial invoices registered. Click "New Commercial Invoice" to record one!
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const relatedBales = (bales || []).filter(
                    b => b.purchaseInvoiceId === inv.id || b.purchaseInvoiceNo === inv.invoiceNo
                  );
                  const hasInwardPass = relatedBales.length > 0 || Boolean(inv.convertedToInward) || Boolean((inv as any).converted_to_inward);
                  const sortedPiecesCount = relatedBales.reduce(
                    (acc, b) => acc + (b.pieces?.length || b.pieceCount || 0),
                    0
                  );
                  const sortedWeightKg = relatedBales.reduce(
                    (acc, b) => acc + (b.brokenDownWeight || 0),
                    0
                  );
                  const isSortingStarted = sortedPiecesCount > 0 || sortedWeightKg > 0;
                  const isLocked = hasInwardPass || isSortingStarted;
                  const isEditLocked = isLocked || inv.status === 'POSTED';
                  const isDeleteLocked = isLocked || inv.status === 'POSTED';

                  const invGross = Number(inv.grossAmount || inv.subTotal || inv.totalAmount || 0);
                  const invDeduction = Number(inv.deductionAmount || inv.discountAmount || 0);
                  const invNet = Number(inv.netAmount || inv.totalAmount || 0);
                  const currSymbol = (inv.currency || 'AED') === 'USD' ? '$' : (inv.currency || 'AED');

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        glowingRowIds.includes(String(inv.id)) || (inv.invoiceNo && glowingRowIds.includes(String(inv.invoiceNo)))
                          ? 'animate-row-glow'
                          : ''
                      }`}
                    >
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
                        <div className="font-semibold">{inv.containerNo || 'No Container'}</div>
                        {inv.blAirwayBillNo && (
                          <div className="text-[10px] text-slate-400">B/L: {inv.blAirwayBillNo}</div>
                        )}
                      </td>
                      {/* Gross Total */}
                      <td className="px-4 py-3 font-mono text-slate-800 text-right font-semibold">
                        <div>
                          {currSymbol} {invGross.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      {/* Deductions */}
                      <td className="px-4 py-3 font-mono text-right">
                        {invDeduction > 0 ? (
                          <span className="text-rose-600 font-bold">
                            -{currSymbol} {invDeduction.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">0.00</span>
                        )}
                      </td>
                      {/* Net Total Payable */}
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 text-right">
                        <div className="text-indigo-900 font-black">
                          {currSymbol} {invNet.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
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
                        ) : hasInwardPass ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1" title="Inward Gate Pass and Bales generated. Invoice is locked against Edit/Delete until bales are deleted.">
                            <Lock className="w-3 h-3 text-amber-600" />
                            <span>Inward Pass Active (Locked)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Unsorted (Editable)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button (Immediately disabled if Inward Pass exists or is POSTED) */}
                          <button
                            type="button"
                            disabled={isEditLocked}
                            onClick={() => handleEditInvoiceClick(inv)}
                            className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 transition-colors border ${
                              isEditLocked
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 cursor-pointer'
                            }`}
                            title={
                              isLocked
                                ? `Locked: Inward Gate Pass / Sorting Bales exist. Delete all sorting bales in the Sorting Terminal first to edit.`
                                : inv.status === 'POSTED'
                                ? `Locked: Invoice is in POSTED status. You must Unpost it back to DRAFT first to edit.`
                                : 'Edit Commercial Invoice'
                            }
                          >
                            {isEditLocked ? <Lock className="w-3 h-3 text-slate-400" /> : <Edit className="w-3 h-3 text-blue-600" />}
                            <span>{isEditLocked ? 'Locked' : 'Edit'}</span>
                          </button>

                          {/* Delete Button (Immediately disabled if Inward Pass exists, is POSTED, or is deleting) */}
                          <button
                            type="button"
                            disabled={isDeleteLocked || deletingInvoiceId === String(inv.id)}
                            onClick={() => handleDeleteInvoiceClick(inv)}
                            className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 transition-colors border ${
                              isDeleteLocked || deletingInvoiceId === String(inv.id)
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 cursor-pointer'
                            }`}
                            title={
                              isLocked
                                ? `Locked: Inward Gate Pass / Sorting Bales exist. Delete all sorting bales in the Sorting Terminal first to delete.`
                                : inv.status === 'POSTED'
                                ? `Locked: Invoice is in POSTED status. You must Unpost it back to DRAFT first to delete.`
                                : 'Delete Commercial Invoice'
                            }
                          >
                            {deletingInvoiceId === String(inv.id) ? (
                              <Loader2 className="w-3 h-3 text-rose-600 animate-spin" />
                            ) : isDeleteLocked ? (
                              <Lock className="w-3 h-3 text-slate-400" />
                            ) : (
                              <Trash2 className="w-3 h-3 text-rose-600" />
                            )}
                            <span>{deletingInvoiceId === String(inv.id) ? 'Deleting...' : isDeleteLocked ? 'Locked' : 'Delete'}</span>
                          </button>

                          {/* Direct Print A4 with Monogram and Expenses */}
                          <button
                            type="button"
                            onClick={() => handleDirectA4Print(inv)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors border border-indigo-200"
                            title="Print Official A4 Commercial Customs Invoice Voucher with Monogram & Expenses"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Print A4</span>
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
                            title="View & Inspect Commercial Invoice"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>View Doc</span>
                          </button>

                          {/* Unpost Button - Hard Locked if Inward Gate Pass or Sorting Bales exist, with loading spinner */}
                          {inv.status === 'POSTED' && (
                            <button
                              type="button"
                              disabled={isLocked || unpostingInvoiceId === String(inv.id)}
                              onClick={() => !isLocked && unpostingInvoiceId !== String(inv.id) && handleUnpostInvoice(inv.id)}
                              className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 transition-colors border ${
                                isLocked || unpostingInvoiceId === String(inv.id)
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 cursor-pointer'
                              }`}
                              title={
                                isLocked
                                  ? 'Locked: Cannot unpost while Inward Gate Pass or Sorting Bales exist. Delete bales in Sorting Terminal first.'
                                  : unpostingInvoiceId === String(inv.id)
                                  ? 'Unposting invoice and purging financial vouchers...'
                                  : 'Unpost this invoice back to DRAFT to allow changes or deletion'
                              }
                            >
                              {unpostingInvoiceId === String(inv.id) ? (
                                <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                              ) : isLocked ? (
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                              )}
                              <span>{unpostingInvoiceId === String(inv.id) ? 'Unposting...' : isLocked ? 'Unpost (Locked)' : 'Unpost'}</span>
                            </button>
                          )}

                          {inv.status !== 'POSTED' && (
                            <button
                              type="button"
                              disabled={isLocked || isSubmitting || Boolean(postingInvoiceId)}
                              onClick={() => !isLocked && !isSubmitting && !postingInvoiceId && handlePostInvoice(inv.id)}
                              className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 transition-colors border ${
                                isLocked || isSubmitting || Boolean(postingInvoiceId)
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer'
                              }`}
                              title={
                                isLocked
                                  ? 'Locked: Inward Gate Pass exists'
                                  : postingInvoiceId === String(inv.id)
                                  ? 'Posting invoice to GL & Supplier Khata...'
                                  : 'Post invoice to GL & Supplier Khata'
                              }
                            >
                              {postingInvoiceId === String(inv.id) ? (
                                <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                              <span>{postingInvoiceId === String(inv.id) ? 'Posting...' : 'Post'}</span>
                            </button>
                          )}

                          {/* Inward Pass Button - Hard Locked & Replaced if Inward Pass already generated */}
                          {hasInwardPass ? (
                            <button
                              type="button"
                              disabled
                              className="px-2 py-1 bg-slate-100 text-slate-400 font-semibold text-[11px] rounded border border-slate-200 inline-flex items-center gap-1 cursor-not-allowed opacity-75"
                              title="Inward Gate Pass & Bales already generated for this invoice. Duplicate generation is locked."
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              <span>Inward Generated</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isConvertingId === inv.id}
                              onClick={() => handleConvertToInward(inv.id)}
                              className={`px-2 py-1 font-semibold text-[11px] rounded flex items-center gap-1 transition-colors border ${
                                isConvertingId === inv.id
                                  ? 'bg-emerald-100 text-emerald-600 border-emerald-200 cursor-wait'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 cursor-pointer'
                              }`}
                              title="Generate Inward Gate Pass & Bales"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              <span>{isConvertingId === inv.id ? 'Generating...' : 'Inward Pass'}</span>
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

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalInvoices}
          pageSize={pageSize}
          onPageChange={newPage => setPage(newPage)}
          onPageSizeChange={newSize => {
            setPageSize(newSize);
            setPage(1);
          }}
          isLoading={isLoadingPage}
          itemLabel="invoices"
        />
      </div>

      {/* Locked Sorting Protection Modal */}
      {lockedModalInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4 animate-in fade-in zoom-in-95 relative">
            <button
              type="button"
              onClick={() => setLockedModalInfo(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-start gap-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cannot {lockedModalInfo.actionType === 'EDIT' ? 'Edit' : 'Delete'} Invoice {lockedModalInfo.invoiceNo}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {lockedModalInfo.sortedPiecesCount > 0
                    ? 'Sorting has already started for bales created from this invoice:'
                    : 'An Inward Gate Pass has already been generated and registered for this invoice:'}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span>Associated Bales:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.balesCount} Bales</strong>
              </div>
              <div className="flex justify-between">
                <span>Pieces Sorted:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.sortedPiecesCount} pieces</strong>
              </div>
              <div className="flex justify-between">
                <span>Weight Broken Down:</span>
                <strong className="font-bold text-amber-950 font-mono">{lockedModalInfo.sortedWeightKg.toFixed(2)} KG</strong>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
              <strong className="text-slate-800 block mb-1">To unlock Edit & Delete:</strong>
              {lockedModalInfo.sortedPiecesCount > 0 ? (
                <>Please navigate to the <strong>Bale Sorting Operations Hub</strong> and delete all <strong>{lockedModalInfo.sortedPiecesCount}</strong> sorted pieces from these bales. Once all pieces are deleted (0 pieces remaining sorted), editing and deleting this invoice will automatically unlock!</>
              ) : (
                <>Please navigate to the <strong>Inward Gate Passes / Sorting Hub</strong> and delete the associated <strong>{lockedModalInfo.balesCount} Bale(s)</strong>. Once deleted, this invoice will automatically unlock for editing and deletion!</>
              )}
            </div>

            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const targetInv = invoicesList.find(i => i.invoiceNo === lockedModalInfo.invoiceNo);
                  setLockedModalInfo(null);
                  if (targetInv) {
                    handleDeleteInvoice(targetInv.id, targetInv.invoiceNo);
                  }
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Cascade Delete All (Invoice + Bales + Pieces)</span>
              </button>
              <button
                type="button"
                onClick={() => setLockedModalInfo(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Cancel
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

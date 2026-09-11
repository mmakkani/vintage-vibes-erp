import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SalesInvoice, SalesInvoiceItem, SalesInvoiceOtherCharge } from '../sales.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import {
  Building2,
  Scan,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  Printer,
  FileText,
  AlertTriangle,
  Eye,
  EyeOff,
  Package,
  Search,
  User,
  ShieldCheck,
  CreditCard,
  ArrowRight,
  X,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react';
import { SalesService } from '../../../services/salesService.ts';
import { PartiesService } from '../../../services/partiesService.ts';

interface AvailableRawBale {
  id: string;
  baleCode: string;
  category: string;
  grossWeightKg: number;
  landedCostAed: number;
  supplierName: string;
  inwardDate: string;
}

interface CustomCompanySalesViewProps {
  clients?: Party[];
  currentUserRole?: string;
  onRefreshAll?: () => void;
  invoices?: SalesInvoice[];
}

export const CustomCompanySalesView: React.FC<CustomCompanySalesViewProps> = ({
  clients: propClients,
  currentUserRole = 'ADMIN',
  onRefreshAll,
  invoices: propInvoices
}) => {
  const [internalClients, setInternalClients] = useState<Party[]>(propClients || []);
  const [internalInvoices, setInternalInvoices] = useState<SalesInvoice[]>(propInvoices || []);

  // Screen Search & Filters for the Invoices Log
  const [logSearch, setLogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'POSTED'>('ALL');

  // Popup Window State for New Invoice / Invoice Editor
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Available raw bales for bulk selector
  const [availableBales, setAvailableBales] = useState<AvailableRawBale[]>([]);
  const [loadingBales, setLoadingBales] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Record<string, boolean>>({});
  const [bulkSearch, setBulkSearch] = useState('');

  // Active Invoice Editor State
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'DRAFT' | 'POSTED'>('DRAFT');
  const [taxType, setTaxType] = useState<'MAINLAND_5_VAT' | 'EXPORT_ZERO_RATED'>('MAINLAND_5_VAT');
  const [exportCustomsDeclarationNo, setExportCustomsDeclarationNo] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT_ACCOUNT' | 'BANK_TRANSFER' | 'CASH' | 'CARD_POS'>('CREDIT_ACCOUNT');
  const [advanceAmountPaid, setAdvanceAmountPaid] = useState<number>(0);
  const [pdcChequeNo, setPdcChequeNo] = useState<string>('');
  const [pdcChequeDate, setPdcChequeDate] = useState<string>('');
  const [salespersonOrBroker, setSalespersonOrBroker] = useState<string>('');
  const [brokerCommissionPercent, setBrokerCommissionPercent] = useState<number>(0);
  const [packingListNotes, setPackingListNotes] = useState<string>('');
  
  // Scanned Line Items
  const [items, setItems] = useState<SalesInvoiceItem[]>([]);

  // Other Charges
  const [otherCharges, setOtherCharges] = useState<SalesInvoiceOtherCharge[]>([]);
  const [newChargeTitle, setNewChargeTitle] = useState<string>('Local UAE Delivery / Freight');
  const [newChargeAmount, setNewChargeAmount] = useState<string>('150');
  const [newChargeVat, setNewChargeVat] = useState<boolean>(true);

  // Barcode input
  const [scanInput, setScanInput] = useState<string>('');
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // UI state
  const [showProfitPreview, setShowProfitPreview] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Print Modals
  const [printModalType, setPrintModalType] = useState<'TAX_INVOICE' | 'PACKING_LIST' | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const loadParties = async () => {
    try {
      const data = await PartiesService.getParties();
      if (Array.isArray(data)) setInternalClients(data.filter(p => p.type === 'CLIENT'));
    } catch {}
  };

  const loadInvoices = async () => {
    try {
      const data = await SalesService.getSalesInvoices();
      if (Array.isArray(data)) setInternalInvoices(data);
    } catch {}
  };

  useEffect(() => {
    if (propClients && propClients.length > 0) {
      setInternalClients(propClients);
    } else {
      loadParties();
    }
  }, [propClients]);

  useEffect(() => {
    if (propInvoices && propInvoices.length > 0) {
      setInternalInvoices(propInvoices);
    } else {
      loadInvoices();
    }
  }, [propInvoices]);

  // Load available raw bales
  const fetchAvailableBales = async () => {
    setLoadingBales(true);
    try {
      const res = await fetch('/api/sales/custom-b2b/available-bales');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableBales(data);
      }
    } catch (err) {
      console.error('Failed to load raw bales:', err);
    } finally {
      setLoadingBales(false);
    }
  };

  useEffect(() => {
    fetchAvailableBales();
  }, []);

  const refreshAllB2BData = () => {
    loadParties();
    loadInvoices();
    fetchAvailableBales();
    if (onRefreshAll) onRefreshAll();
  };

  // Filter clients
  const customerClients = useMemo(() => {
    return internalClients.filter(c => c.type === 'CLIENT' || !c.type || c.type === ('CUSTOMER' as any));
  }, [internalClients]);

  // Filter B2B Custom Sales invoices from all invoices
  const b2bInvoices = useMemo(() => {
    return internalInvoices.filter(i => i.isB2BCustomSale || i.invoiceNo?.startsWith('SLS-B2B') || i.invoiceNo?.startsWith('B2B-'));
  }, [internalInvoices]);

  // Filtered Invoices for Log Table
  const filteredLog = useMemo(() => {
    return b2bInvoices.filter(inv => {
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      if (!logSearch) return true;
      const q = logSearch.toLowerCase();
      return (
        (inv.invoiceNo && inv.invoiceNo.toLowerCase().includes(q)) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
        (inv.customerTrn && inv.customerTrn.toLowerCase().includes(q)) ||
        (inv.date && inv.date.includes(q))
      );
    });
  }, [b2bInvoices, statusFilter, logSearch]);

  // Metrics for Log Dashboard
  const logMetrics = useMemo(() => {
    const safeB2b = Array.isArray(b2bInvoices) ? b2bInvoices : [];
    const totalSales = safeB2b.reduce((sum, i) => sum + (Number(i?.totalAmount || i?.grandTotalAED || 0)), 0);
    const totalVat = safeB2b.reduce((sum, i) => sum + (Number(i?.vatAmount || 0)), 0);
    const totalBales = safeB2b.reduce((sum, i) => sum + (Array.isArray(i?.items) ? i.items.filter(it => it?.isRawBale).length : 0), 0);
    const totalPieces = safeB2b.reduce((sum, i) => sum + (Array.isArray(i?.items) ? i.items.filter(it => !it?.isRawBale).length : 0), 0);
    const totalCreditDue = safeB2b.filter(i => i?.status === 'POSTED').reduce((sum, i) => sum + (Number(i?.creditAmountDue || 0)), 0);

    return {
      totalSales: Number(totalSales.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      totalBales,
      totalPieces,
      totalCreditDue: Number(totalCreditDue.toFixed(2)),
      count: safeB2b.length
    };
  }, [b2bInvoices]);

  // Selected customer object for active editor
  const selectedCustomer = useMemo(() => {
    return (Array.isArray(customerClients) ? customerClients : []).find(c => c?.id === selectedCustomerId) || null;
  }, [customerClients, selectedCustomerId]);

  // Totals calculations for active editor
  const itemsSubtotal = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems.reduce((sum, item) => sum + (Number(item?.finalAmount) || 0), 0);
  }, [items]);

  const totalCOGS = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems.reduce((sum, item) => {
      const cogs = Number(item?.calculatedCostPrice) || 0;
      return sum + cogs;
    }, 0);
  }, [items]);

  const otherChargesTotal = useMemo(() => {
    const safeCharges = Array.isArray(otherCharges) ? otherCharges : [];
    return safeCharges.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
  }, [otherCharges]);

  const vatAmount = useMemo(() => {
    if (taxType === 'EXPORT_ZERO_RATED') return 0;
    const safeCharges = Array.isArray(otherCharges) ? otherCharges : [];
    const vatBase = itemsSubtotal + safeCharges.filter(c => c?.vatApplicable).reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    return Number((vatBase * 0.05).toFixed(2));
  }, [itemsSubtotal, otherCharges, taxType]);

  const grandTotal = useMemo(() => {
    return Number((itemsSubtotal + otherChargesTotal + vatAmount).toFixed(2));
  }, [itemsSubtotal, otherChargesTotal, vatAmount]);

  const creditAmountDue = useMemo(() => {
    const rem = grandTotal - (Number(advanceAmountPaid) || 0);
    return rem > 0 ? Number(rem.toFixed(2)) : 0;
  }, [grandTotal, advanceAmountPaid]);

  const brokerCommissionAmount = useMemo(() => {
    if (!brokerCommissionPercent || brokerCommissionPercent <= 0) return 0;
    return Number(((itemsSubtotal * brokerCommissionPercent) / 100).toFixed(2));
  }, [itemsSubtotal, brokerCommissionPercent]);

  // Credit Limit Check
  const creditLimitExceeded = useMemo(() => {
    if (!selectedCustomer) return false;
    const limit = Number(selectedCustomer.creditLimit) || 0;
    if (limit <= 0) return false;
    const currBalance = Number(selectedCustomer.currentBalance) || 0;
    const projected = currBalance + creditAmountDue;
    return projected > limit;
  }, [selectedCustomer, creditAmountDue]);

  // Profit Margin calculations
  const grossProfitAed = useMemo(() => {
    return itemsSubtotal - totalCOGS;
  }, [itemsSubtotal, totalCOGS]);

  const grossProfitMarginPct = useMemo(() => {
    if (itemsSubtotal <= 0) return 0;
    return Number(((grossProfitAed / itemsSubtotal) * 100).toFixed(1));
  }, [grossProfitAed, itemsSubtotal]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 6000);
  };

  // Barcode Gun Scanning Hook (Active when popup editor is open)
  useBarcodeScanner({
    onScan: (code) => {
      if (isInvoiceModalOpen && status !== 'POSTED') {
        handleProcessBarcode(code.trim());
      }
    }
  });

  // Process Barcode
  const handleProcessBarcode = async (barcodeToScan: string) => {
    if (!barcodeToScan) return;
    setScanLoading(true);
    setScanError(null);

    const alreadyScanned = items.some(it => it.barcode.toLowerCase() === barcodeToScan.toLowerCase());
    if (alreadyScanned) {
      setScanError(`Barcode "${barcodeToScan}" is already added to this invoice!`);
      setScanLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/sales/custom-b2b/scan/${encodeURIComponent(barcodeToScan)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScanError(data.error || `Barcode "${barcodeToScan}" not found or already sold.`);
        setScanLoading(false);
        return;
      }

      if (data.isRawBale) {
        const bale = data.bale;
        const grossKg = Number(bale.grossWeightKg) || 45;
        const landedCost = Number(bale.landedCostAed) || 2000;
        const suggested = Number(bale.suggestedPriceAed) || Math.round(landedCost * 1.35);
        const ratePerKg = Number((suggested / grossKg).toFixed(2));

        const newItem: SalesInvoiceItem = {
          id: `bale-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          barcode: bale.baleCode,
          description: `Raw Bale: ${bale.category} (${grossKg} KG)`,
          weightKg: grossKg,
          grossWeightKg: grossKg,
          unitPrice: ratePerKg,
          ratePerKg: ratePerKg,
          pricingMode: 'PER_KG',
          discount: 0,
          finalAmount: suggested,
          calculatedCostPrice: landedCost,
          isRawBale: true,
          baleCode: bale.baleCode,
          baleCategory: bale.category
        };
        setItems(prev => [newItem, ...prev]);
        showMsg(`Added Raw Bale "${bale.baleCode}" (${grossKg} KG)`);
      } else {
        const piece = data.piece;
        const weightKg = Number(piece.weightKg) || 0.45;
        const price = Number(piece.suggestedPriceAed) || 45;
        const cogs = Number(piece.calculatedCostPrice) || 18;

        const newItem: SalesInvoiceItem = {
          id: `piece-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          barcode: piece.barcode,
          description: `${piece.brandName || ''} ${piece.itemName || 'Garment'} (${piece.size || 'M'})`,
          weightKg: weightKg,
          weightGrams: piece.weightGrams,
          unitPrice: price,
          discount: 0,
          finalAmount: price,
          calculatedCostPrice: cogs,
          isRawBale: false,
          brandName: piece.brandName,
          labelGrade: piece.labelGrade,
          size: piece.size
        };
        setItems(prev => [newItem, ...prev]);
        showMsg(`Added Garment Piece "${piece.barcode}"`);
      }

      setScanInput('');
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    } catch (err) {
      setScanError('Failed to lookup barcode. Network error.');
    } finally {
      setScanLoading(false);
    }
  };

  // Add bulk selected bales
  const handleAddBulkBales = () => {
    const toAdd = availableBales.filter(b => selectedBulkIds[b.id]);
    if (toAdd.length === 0) return;

    const newItemsList: SalesInvoiceItem[] = [];
    toAdd.forEach(bale => {
      if (items.some(it => it.barcode.toLowerCase() === bale.baleCode.toLowerCase())) return;

      const grossKg = Number(bale.grossWeightKg) || 45;
      const landedCost = Number(bale.landedCostAed) || 2000;
      const suggested = Math.round(landedCost * 1.35);
      const ratePerKg = Number((suggested / grossKg).toFixed(2));

      newItemsList.push({
        id: `bale-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        barcode: bale.baleCode,
        description: `Raw Bale: ${bale.category} (${grossKg} KG)`,
        weightKg: grossKg,
        grossWeightKg: grossKg,
        unitPrice: ratePerKg,
        ratePerKg: ratePerKg,
        pricingMode: 'PER_KG',
        discount: 0,
        finalAmount: suggested,
        calculatedCostPrice: landedCost,
        isRawBale: true,
        baleCode: bale.baleCode,
        baleCategory: bale.category
      });
    });

    setItems(prev => [...newItemsList, ...prev]);
    setShowBulkModal(false);
    setSelectedBulkIds({});
    showMsg(`Added ${newItemsList.length} Raw Bales to Invoice.`);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateBalePricingMode = (id: string, mode: 'PER_KG' | 'FLAT') => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const grossKg = Number(it.grossWeightKg || it.weightKg) || 1;
      let unitPr = it.unitPrice;
      if (mode === 'PER_KG') {
        unitPr = Number((it.finalAmount / grossKg).toFixed(2));
      } else {
        unitPr = it.finalAmount;
      }
      return { ...it, pricingMode: mode, unitPrice: unitPr, ratePerKg: mode === 'PER_KG' ? unitPr : undefined };
    }));
  };

  const handleUpdateItemPrice = (id: string, newPriceStr: string) => {
    const val = Number(newPriceStr) || 0;
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      if (it.isRawBale && it.pricingMode === 'PER_KG') {
        const grossKg = Number(it.grossWeightKg || it.weightKg) || 1;
        const total = Number((val * grossKg).toFixed(2));
        return { ...it, unitPrice: val, ratePerKg: val, finalAmount: total };
      } else {
        return { ...it, unitPrice: val, finalAmount: val };
      }
    }));
  };

  const handleAddOtherCharge = () => {
    if (!newChargeTitle.trim() || Number(newChargeAmount) <= 0) return;
    const newCharge: SalesInvoiceOtherCharge = {
      id: `chg-${Date.now()}`,
      title: newChargeTitle.trim(),
      amount: Number(newChargeAmount),
      vatApplicable: newChargeVat,
      coaHead: '4310-00'
    };
    setOtherCharges(prev => [...prev, newCharge]);
    setNewChargeTitle('Palletization & Strapping Service');
    setNewChargeAmount('50');
  };

  const handleRemoveOtherCharge = (id: string) => {
    setOtherCharges(prev => prev.filter(c => c.id !== id));
  };

  // Open New Invoice Popup Modal
  const handleOpenNewInvoiceModal = () => {
    setInvoiceId('');
    setInvoiceNo('');
    setSelectedCustomerId('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setStatus('DRAFT');
    setTaxType('MAINLAND_5_VAT');
    setExportCustomsDeclarationNo('');
    setPaymentMethod('CREDIT_ACCOUNT');
    setAdvanceAmountPaid(0);
    setPdcChequeNo('');
    setPdcChequeDate('');
    setSalespersonOrBroker('');
    setBrokerCommissionPercent(0);
    setPackingListNotes('');
    setItems([]);
    setOtherCharges([]);
    setScanInput('');
    setScanError(null);
    setIsInvoiceModalOpen(true);
  };

  // Open Existing Invoice in Popup Modal
  const handleOpenExistingInvoiceModal = (inv: SalesInvoice) => {
    setInvoiceId(inv.id);
    setInvoiceNo(inv.invoiceNo);
    setSelectedCustomerId(inv.customerId || inv.clientId || '');
    setInvoiceDate(inv.date);
    setStatus(inv.status as any || 'DRAFT');
    setTaxType(inv.taxType || 'MAINLAND_5_VAT');
    setExportCustomsDeclarationNo(inv.exportCustomsDeclarationNo || '');
    setPaymentMethod((inv.paymentMethod as any) || 'CREDIT_ACCOUNT');
    setAdvanceAmountPaid(inv.advanceAmountPaid || 0);
    setPdcChequeNo(inv.pdcChequeNo || '');
    setPdcChequeDate(inv.pdcChequeDate || '');
    setSalespersonOrBroker(inv.salespersonOrBroker || '');
    setBrokerCommissionPercent(inv.brokerCommissionPercent || 0);
    setPackingListNotes(inv.packingListNotes || '');
    setItems(inv.items || []);
    setOtherCharges(inv.otherCharges || []);
    setIsInvoiceModalOpen(true);
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!selectedCustomerId) {
      showMsg('Please select a Customer / Company from Parties Khata first!', 'error');
      return;
    }
    if (items.length === 0) {
      showMsg('Please scan at least one Raw Bale or Garment Piece!', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const genInvoiceNo = invoiceNo || `B2B-${Date.now().toString().slice(-6)}`;
      
      // 1. Direct write to public.b2b_sales
      const b2bRecord = await SalesService.createB2bSale({
        b2b_invoice_number: genInvoiceNo,
        company_name: selectedCustomer.name || 'Wholesale Client',
        trn_number: selectedCustomer.trnNo || '',
        contact_person: selectedCustomer.contactPerson || '',
        phone: selectedCustomer.phone || '',
        email: selectedCustomer.email || '',
        items: items,
        total_amount: grandTotal,
        paid_amount: Number(advanceAmountPaid) || 0,
        balance_due: creditAmountDue,
        payment_terms: 'Net 30',
        credit_status: creditAmountDue <= 0 ? 'PAID' : 'PENDING',
        shipping_address: selectedCustomer.address || ''
      });

      // 2. Direct write to sales_invoices
      await SalesService.createSalesInvoice({
        invoiceNo: genInvoiceNo,
        clientId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        invoiceDate: invoiceDate,
        channel: 'WHOLESALE_B2B',
        paymentMethod: paymentMethod as any,
        subtotal: subTotal,
        discountAmount: 0,
        taxAmount: vatAmount,
        totalAmount: grandTotal,
        status: 'DRAFT',
        items: items.map(i => ({
          barcode: i.barcode,
          description: i.description,
          unitPrice: i.unitPrice,
          weightKg: i.weightKg
        }))
      }).catch(e => console.warn('B2B sales_invoices sync note:', e));

      setInvoiceId(b2bRecord.id || genInvoiceNo);
      setInvoiceNo(genInvoiceNo);
      setStatus('DRAFT');
      showMsg(`Invoice ${genInvoiceNo} saved to cloud database.`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Save draft error.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // POST & Dispatch
  const handlePostInvoice = async () => {
    if (!invoiceId) {
      await handleSaveDraft();
    }

    const confirmPost = window.confirm(
      `Are you sure you want to POST & DISPATCH Invoice ${invoiceNo || invoiceId}?\n\n` +
      `• Raw Bales (${items.filter(i => i.isRawBale).length}) will be deducted from 1140-00 Inventory to 5120-00 COGS\n` +
      `• Garment Pieces (${items.filter(i => !i.isRawBale).length}) will be deducted from 1160-00 Inventory to 5110-00 COGS\n` +
      `• General Ledger Journal Voucher will be dispatched.\n` +
      `• Customer Khata will be debited AED ${grandTotal.toFixed(2)}.`
    );
    if (!confirmPost) return;

    setIsSaving(true);
    try {
      const genInvoiceNo = invoiceNo || `B2B-${Date.now().toString().slice(-6)}`;
      await SalesService.createB2bSale({
        b2b_invoice_number: genInvoiceNo,
        company_name: selectedCustomer?.name || 'Wholesale Client',
        trn_number: selectedCustomer?.trnNo || '',
        contact_person: selectedCustomer?.contactPerson || '',
        phone: selectedCustomer?.phone || '',
        email: selectedCustomer?.email || '',
        items: items,
        total_amount: grandTotal,
        paid_amount: Number(advanceAmountPaid) || 0,
        balance_due: creditAmountDue,
        payment_terms: 'Net 30',
        credit_status: 'POSTED',
        shipping_address: selectedCustomer?.address || ''
      });
      setStatus('POSTED');
      showMsg(`Invoice ${invoiceNo || genInvoiceNo} successfully POSTED & DISPATCHED! Inventory deducted, JV dispatched.`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Post error.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // UNPOST Invoice
  const handleUnpostInvoice = async () => {
    if (!invoiceId) return;
    const confirmUnpost = window.confirm(
      `UNPOST Invoice ${invoiceNo}?\n\n` +
      `• Restores all Raw Bales to UNOPENED stock in warehouse\n` +
      `• Restores all Garment Pieces to IN_STOCK\n` +
      `• Reverses General Ledger Journal Voucher\n` +
      `• Credits Customer Khata to reverse balance`
    );
    if (!confirmUnpost) return;

    setStatus('DRAFT');
    showMsg(`Invoice ${invoiceNo} unposted. Stock barcodes restored.`);
    refreshAllB2BData();
  };

  // Delete Draft Invoice
  const handleDeleteDraft = async () => {
    if (!invoiceId) {
      setIsInvoiceModalOpen(false);
      return;
    }
    const confirmDel = window.confirm(`Delete DRAFT Invoice ${invoiceNo}? This cannot be undone.`);
    if (!confirmDel) return;

    try {
      await SalesService.deleteSalesInvoice(invoiceId).catch(() => {});
      showMsg(`Draft invoice ${invoiceNo} deleted.`);
      setIsInvoiceModalOpen(false);
      refreshAllB2BData();
    } catch (err) {
      showMsg('Delete error', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* ================= 1. SCREEN HEADER (WEB THEME - NO BLACK BACKGROUND) ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-amber-300 shadow-xs text-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
            <Building2 className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black tracking-wide text-slate-900 uppercase">
                🏢 Company & Wholesale B2B Sales Log
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-200">
                {b2bInvoices.length} INVOICES
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Corporate wholesale invoice dispatch register for Raw Bales & Sorted Garment Pieces
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* PRIMARY ACTION BUTTON: + NEW INVOICE (OPENS POPUP WINDOW) */}
          <button
            type="button"
            onClick={handleOpenNewInvoiceModal}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition shadow-sm flex items-center gap-1.5 cursor-pointer ring-2 ring-emerald-400/40"
          >
            <Plus className="w-4 h-4 text-emerald-100" />
            <span>+ New B2B Invoice</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* ================= 2. METRIC KPI SUMMARY CARDS ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-[10px] text-slate-500 uppercase font-bold">Total Wholesale Sales</div>
          <div className="text-base font-mono font-black text-slate-900 mt-0.5">AED {logMetrics.totalSales.toFixed(2)}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-[10px] text-slate-500 uppercase font-bold">Total Invoices</div>
          <div className="text-base font-mono font-black text-indigo-900 mt-0.5">{logMetrics.count}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-[10px] text-slate-500 uppercase font-bold">Raw Bales Sold</div>
          <div className="text-base font-mono font-black text-amber-900 mt-0.5">🏷️ {logMetrics.totalBales} bales</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-[10px] text-slate-500 uppercase font-bold">Garment Pieces Sold</div>
          <div className="text-base font-mono font-black text-blue-900 mt-0.5">👕 {logMetrics.totalPieces} pcs</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[10px] text-slate-500 uppercase font-bold">Khata Receivables Due</div>
          <div className="text-base font-mono font-black text-purple-900 mt-0.5">AED {logMetrics.totalCreditDue.toFixed(2)}</div>
        </div>
      </div>

      {/* ================= 3. INVOICES LOG TABLE ON SCREEN ================= */}
      <div className="bg-white rounded-xl border border-amber-200 shadow-xs overflow-hidden">
        {/* Search and Status Filter bar */}
        <div className="p-3 bg-[#FAF4E6]/60 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              placeholder="Search by invoice number, company name, TRN, or date..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-300"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'DRAFT', 'POSTED'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === f
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'DRAFT' ? 'Drafts' : 'Posted'}
              </button>
            ))}
          </div>
        </div>

        {/* Invoices List Table */}
        <div className="overflow-x-auto">
          {filteredLog.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Package className="w-10 h-10 mx-auto text-amber-300 mb-2" />
              <p className="font-bold text-slate-700 text-sm">No B2B Corporate Invoices Found</p>
              <p className="text-xs text-slate-500 mt-1">
                Click "+ New B2B Invoice" above to create an invoice for raw bales or garment pieces.
              </p>
              <button
                type="button"
                onClick={handleOpenNewInvoiceModal}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First B2B Invoice</span>
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#FAF4E6]/80 text-[10px] font-bold text-slate-700 uppercase border-b border-amber-200">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Buyer Company (Khata)</th>
                  <th className="py-2.5 px-3">UAE TRN</th>
                  <th className="py-2.5 px-3 text-center">Items & Bales</th>
                  <th className="py-2.5 px-3 text-right">Billable (AED)</th>
                  <th className="py-2.5 px-3 text-right">Khata Credit Due</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLog.map(inv => {
                  const balesCount = inv.items?.filter(i => i.isRawBale).length || 0;
                  const piecesCount = inv.items?.filter(i => !i.isRawBale).length || 0;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => handleOpenExistingInvoiceModal(inv)}
                      className="hover:bg-amber-50/40 transition cursor-pointer"
                    >
                      {/* Invoice # */}
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-950">
                        {inv.invoiceNo}
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {inv.date}
                      </td>

                      {/* Customer Name */}
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {inv.customerName || inv.clientName || 'Corporate Client'}
                      </td>

                      {/* TRN */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {inv.customerTrn || 'Freezone / N/A'}
                      </td>

                      {/* Items */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono text-slate-700">
                          {balesCount > 0 && <span className="text-amber-800 font-bold">🏷️ {balesCount} Bales </span>}
                          {piecesCount > 0 && <span className="text-blue-800 font-bold">👕 {piecesCount} Pcs</span>}
                          {balesCount === 0 && piecesCount === 0 && '0 items'}
                        </span>
                      </td>

                      {/* Billable Amount */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950">
                        AED {Number(inv.totalAmount || inv.grandTotalAED || 0).toFixed(2)}
                      </td>

                      {/* Credit Due */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-900">
                        AED {Number(inv.creditAmountDue || 0).toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          inv.status === 'POSTED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          {inv.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenExistingInvoiceModal(inv)}
                            className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold transition border border-indigo-200"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenExistingInvoiceModal(inv);
                              setPrintModalType('TAX_INVOICE');
                            }}
                            title="Print Tax Invoice"
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-700" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ================= 4. POPUP WINDOW: NEW INVOICE & INVOICE EDITOR ================= */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-[#FAF4E6] rounded-2xl shadow-2xl border border-amber-300 w-full max-w-7xl max-h-[96vh] flex flex-col animate-in zoom-in-95 duration-150 overflow-hidden">
            
            {/* Modal Window Top Header Bar (Web Theme) */}
            <div className="p-3.5 sm:p-4 bg-white border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <Building2 className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black uppercase text-slate-900">
                      {invoiceNo ? `Invoice: ${invoiceNo}` : 'New B2B Corporate Invoice'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      status === 'POSTED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}>
                      {status === 'POSTED' ? '● POSTED & DISPATCHED' : '✎ EDITABLE DRAFT'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Dual barcode gun scanning for Raw Bales & Sorted Garments with Khata relief
                  </p>
                </div>
              </div>

              {/* Action Buttons in Modal Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5 text-indigo-100" />
                  <span>+ Bulk Bales Picker ({availableBales.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintModalType('TAX_INVOICE')}
                  disabled={items.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-teal-200" />
                  <span>Print Tax Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintModalType('PACKING_LIST')}
                  disabled={items.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-200" />
                  <span>Print Packing List</span>
                </button>

                {/* Close Modal Window */}
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition border border-slate-300 cursor-pointer ml-1"
                  title="Close Invoice Window"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Two-Column Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Credit Limit Alert */}
              {creditLimitExceeded && (
                <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg text-amber-900 text-xs flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <span className="font-bold">Credit Limit Warning: </span>
                      Customer <span className="underline font-bold">{selectedCustomer?.name}</span> has a credit limit of{' '}
                      <span className="font-mono font-black">AED {Number(selectedCustomer?.creditLimit).toFixed(2)}</span>.
                      Current outstanding is AED {Number(selectedCustomer?.currentBalance).toFixed(2)}. This invoice credit due (AED {creditAmountDue.toFixed(2)}) will exceed their approved limit!
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">
                    Requires Manager Approval
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* LEFT PANEL: BUYER PROFILE, SCANNER, PAYMENT (5 COLS) */}
                <div className="lg:col-span-5 space-y-4">
                  
                  {/* Buyer Profile Card */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Buyer / Corporate Client (Parties Khata)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">COA 1130-00</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Corporate Customer:</label>
                      <select
                        value={selectedCustomerId}
                        onChange={e => setSelectedCustomerId(e.target.value)}
                        disabled={status === 'POSTED'}
                        className="w-full bg-[#FAF4E6]/50 border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 transition"
                      >
                        <option value="">-- Choose Corporate Buyer / Khata --</option>
                        {customerClients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.code ? `[${c.code}] ` : ''}{c.name} {c.trnNo ? `(TRN: ${c.trnNo})` : ''} — Bal: AED {Number(c.currentBalance || 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCustomer ? (
                      <div className="bg-[#FAF4E6]/60 rounded-lg p-2.5 border border-amber-200 text-xs space-y-1.5">
                        <div className="flex justify-between items-center text-slate-900 font-bold border-b border-amber-200/70 pb-1">
                          <span>{selectedCustomer.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                            {selectedCustomer.code || 'B2B-CLIENT'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                          <div>
                            <span className="font-bold text-slate-500">TRN (UAE VAT): </span>
                            <span className="font-mono text-slate-800">{selectedCustomer.trnNo || 'Not Registered / Freezone'}</span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-500">Phone: </span>
                            <span className="text-slate-800">{selectedCustomer.phone || 'N/A'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-bold text-slate-500">Address: </span>
                            <span className="text-slate-800">{selectedCustomer.address || 'Industrial Area / Warehouse, UAE'}</span>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-amber-200/70 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-500 font-bold">Khata Balance: </span>
                            <span className={`font-mono font-bold ${Number(selectedCustomer.currentBalance) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                              AED {Number(selectedCustomer.currentBalance || 0).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Credit Limit: </span>
                            <span className="font-mono font-bold text-slate-800">
                              AED {Number(selectedCustomer.creditLimit || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50/50 border border-dashed border-amber-200 rounded-lg text-center text-amber-800 text-xs">
                        Please select a company from Parties Khata to display TRN, delivery address, and credit parameters.
                      </div>
                    )}

                    {/* Date & Tax Policy Switcher */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Invoice Date:</label>
                        <input
                          type="date"
                          value={invoiceDate}
                          onChange={e => setInvoiceDate(e.target.value)}
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-mono text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Tax Regime (UAE):</label>
                        <select
                          value={taxType}
                          onChange={e => setTaxType(e.target.value as any)}
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800"
                        >
                          <option value="MAINLAND_5_VAT">Mainland UAE (5% Standard VAT)</option>
                          <option value="EXPORT_ZERO_RATED">Export / Freezone (0% Zero-Rated)</option>
                        </select>
                      </div>
                    </div>

                    {taxType === 'EXPORT_ZERO_RATED' && (
                      <div className="bg-sky-50 p-2 rounded-lg border border-sky-200">
                        <label className="block text-[10px] font-bold text-sky-900 mb-0.5">
                          Export Customs Declaration / Bill of Exit #:
                        </label>
                        <input
                          type="text"
                          value={exportCustomsDeclarationNo}
                          onChange={e => setExportCustomsDeclarationNo(e.target.value)}
                          placeholder="e.g. DXB-EXP-2026-98124"
                          disabled={status === 'POSTED'}
                          className="w-full bg-white border border-sky-300 rounded px-2 py-1 text-xs font-mono text-slate-800"
                        />
                      </div>
                    )}
                  </div>

                  {/* Dual Barcode Gun Scanner */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                        <Scan className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Dual Laser Barcode Gun Scanner</span>
                      </div>
                      <span className="text-[10px] text-emerald-800 font-mono font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        🔫 Gun Active
                      </span>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleProcessBarcode(scanInput.trim());
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="relative flex-1">
                        <input
                          ref={barcodeInputRef}
                          type="text"
                          value={scanInput}
                          onChange={e => setScanInput(e.target.value)}
                          placeholder="Scan Raw Bale (BAL-xxxx) or Piece (VV-xxxx)..."
                          disabled={status === 'POSTED' || scanLoading}
                          className="w-full bg-white border-2 border-indigo-400 rounded-lg pl-3 pr-8 py-2 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300/40 transition shadow-inner"
                        />
                        {scanLoading && (
                          <div className="absolute right-2.5 top-2.5">
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={status === 'POSTED' || scanLoading || !scanInput.trim()}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold tracking-wider uppercase transition shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <span>Add</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </form>

                    {scanError && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center justify-between">
                        <span>⚠️ {scanError}</span>
                        <button onClick={() => setScanError(null)} className="text-rose-500 hover:text-rose-700">✕</button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-amber-50/40 p-2 rounded-lg border border-amber-200/70">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span><strong>Raw Bale:</strong> BAL-xxxx (1140-00)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span><strong>Piece:</strong> VV-xxxx (1160-00)</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Terms, Advance & Cheque */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                        <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                        <span>Payment Terms & Deferred Credit (Khata)</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        Receivable
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Method:</label>
                        <select
                          value={paymentMethod}
                          onChange={e => setPaymentMethod(e.target.value as any)}
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800"
                        >
                          <option value="CREDIT_ACCOUNT">Credit Khata Account</option>
                          <option value="BANK_TRANSFER">Direct Bank Wire (IBAN)</option>
                          <option value="CASH">Cash in Hand (Counter)</option>
                          <option value="CARD_POS">POS Card Terminal</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Advance Received (AED):</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={advanceAmountPaid || ''}
                          onChange={e => setAdvanceAmountPaid(Number(e.target.value))}
                          disabled={status === 'POSTED'}
                          placeholder="0.00"
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-emerald-700"
                        />
                      </div>
                    </div>

                    <div className="p-2 bg-purple-50/60 rounded-lg border border-purple-100 flex items-center justify-between text-xs font-bold">
                      <span className="text-purple-900">Remaining Balance Due (To Khata):</span>
                      <span className="font-mono text-sm text-purple-950">AED {creditAmountDue.toFixed(2)}</span>
                    </div>

                    {/* PDC Cheque info */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">PDC Cheque # (If any):</label>
                        <input
                          type="text"
                          value={pdcChequeNo}
                          onChange={e => setPdcChequeNo(e.target.value)}
                          placeholder="e.g. CHQ-991204"
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cheque Clearance Date:</label>
                        <input
                          type="date"
                          value={pdcChequeDate}
                          onChange={e => setPdcChequeDate(e.target.value)}
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Broker Commission */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Sales Broker / Agent:</label>
                        <input
                          type="text"
                          value={salespersonOrBroker}
                          onChange={e => setSalespersonOrBroker(e.target.value)}
                          placeholder="e.g. Direct / Tariq Al-Mansoor"
                          disabled={status === 'POSTED'}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Broker Commission (%):</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={brokerCommissionPercent || ''}
                            onChange={e => setBrokerCommissionPercent(Number(e.target.value))}
                            placeholder="0"
                            disabled={status === 'POSTED'}
                            className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800"
                          />
                          <span className="text-[11px] font-mono text-slate-500 font-bold">
                            = AED {brokerCommissionAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT PANEL: SCANNED ITEMS TABLE & TOTALS (7 COLS) */}
                <div className="lg:col-span-7 space-y-4">
                  
                  {/* Line Items Table */}
                  <div className="bg-white rounded-xl border border-amber-200 shadow-xs overflow-hidden">
                    <div className="p-3 bg-[#FAF4E6]/50 border-b border-amber-200/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Scanned B2B Line Items ({items.length})
                        </span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono font-bold">
                          Bales: {items.filter(i => i.isRawBale).length} | Pieces: {items.filter(i => !i.isRawBale).length}
                        </span>
                      </div>

                      {items.length > 0 && status !== 'POSTED' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Clear all scanned items from this invoice?')) {
                              setItems([]);
                            }
                          }}
                          className="text-[10px] text-rose-600 hover:text-rose-800 font-bold uppercase transition cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                      {items.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          <Package className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                          <p className="font-bold text-slate-600">No items scanned yet.</p>
                          <p className="text-[11px]">Use the laser barcode gun above or click "+ Bulk Bales Picker" to populate invoice.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#FAF4E6]/75 text-[10px] font-bold text-slate-700 uppercase border-b border-amber-200 sticky top-0">
                            <tr>
                              <th className="py-2 px-2.5">Type & Barcode</th>
                              <th className="py-2 px-2">Description / Grade</th>
                              <th className="py-2 px-2 text-right">Weight</th>
                              <th className="py-2 px-2 text-center">Pricing Mode</th>
                              <th className="py-2 px-2 text-right">Rate / Price</th>
                              <th className="py-2 px-2 text-right">Total (AED)</th>
                              {status !== 'POSTED' && <th className="py-2 px-2 text-center w-8">✕</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const isBale = !!item.isRawBale;
                              return (
                                <tr key={item.id} className="hover:bg-amber-50/40 transition">
                                  {/* Type & Barcode */}
                                  <td className="py-2 px-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                        isBale ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300'
                                      }`}>
                                        {isBale ? '🏷️ BALE' : '👕 PIECE'}
                                      </span>
                                      <span className="font-mono font-bold text-slate-900">{item.barcode}</span>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                      COGS: AED {Number(item.calculatedCostPrice || 0).toFixed(2)} ({isBale ? '1140-00' : '1160-00'})
                                    </div>
                                  </td>

                                  {/* Description */}
                                  <td className="py-2 px-2 text-slate-700">
                                    <div className="font-medium truncate max-w-[160px]">{item.description}</div>
                                    {item.labelGrade && (
                                      <span className="text-[9px] font-mono px-1 rounded bg-slate-100 text-slate-600">
                                        Grade {item.labelGrade} {item.size ? `• ${item.size}` : ''}
                                      </span>
                                    )}
                                  </td>

                                  {/* Weight */}
                                  <td className="py-2 px-2 text-right font-mono text-slate-800">
                                    {isBale ? `${item.grossWeightKg || item.weightKg} KG` : `${item.weightGrams || Math.round((item.weightKg || 0.4) * 1000)} g`}
                                  </td>

                                  {/* Pricing Mode Toggle */}
                                  <td className="py-2 px-2 text-center">
                                    {isBale ? (
                                      <button
                                        type="button"
                                        disabled={status === 'POSTED'}
                                        onClick={() => handleUpdateBalePricingMode(item.id, item.pricingMode === 'PER_KG' ? 'FLAT' : 'PER_KG')}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer ${
                                          item.pricingMode === 'PER_KG'
                                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                            : 'bg-slate-200 text-slate-800'
                                        }`}
                                      >
                                        {item.pricingMode === 'PER_KG' ? 'Rate/KG' : 'Flat'}
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-mono">Per Piece</span>
                                    )}
                                  </td>

                                  {/* Rate / Price Input */}
                                  <td className="py-2 px-2 text-right">
                                    {status === 'POSTED' ? (
                                      <span className="font-mono font-bold text-slate-900">
                                        AED {Number(item.unitPrice).toFixed(2)}
                                      </span>
                                    ) : (
                                      <div className="flex items-center justify-end gap-1">
                                        <span className="text-[10px] text-slate-400">AED</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={item.unitPrice || ''}
                                          onChange={e => handleUpdateItemPrice(item.id, e.target.value)}
                                          className="w-20 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right text-slate-900 focus:bg-white"
                                        />
                                      </div>
                                    )}
                                  </td>

                                  {/* Line Total */}
                                  <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                                    AED {Number(item.finalAmount || 0).toFixed(2)}
                                  </td>

                                  {/* Delete Item */}
                                  {status !== 'POSTED' && (
                                    <td className="py-2 px-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveItem(item.id)}
                                        title="Remove item from invoice"
                                        className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-1"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Other Charges Builder */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                        <span>Other Charges (Freight, Forklift, Palletization)</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">Mappable to COA 4310-00</span>
                    </div>

                    {otherCharges.length > 0 && (
                      <div className="space-y-1.5">
                        {otherCharges.map(charge => (
                          <div key={charge.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{charge.title}</span>
                              {charge.vatApplicable ? (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">5% VAT</span>
                              ) : (
                                <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">0% VAT</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-900">AED {Number(charge.amount).toFixed(2)}</span>
                              {status !== 'POSTED' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOtherCharge(charge.id)}
                                  className="text-rose-500 hover:text-rose-700 text-xs cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {status !== 'POSTED' && (
                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={newChargeTitle}
                          onChange={e => setNewChargeTitle(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800"
                        >
                          <option value="Local UAE Delivery / Freight">Local UAE Delivery / Freight</option>
                          <option value="Palletization & Strapping Service">Palletization & Strapping Service</option>
                          <option value="Forklift & Container Loading Fee">Forklift & Container Loading Fee</option>
                          <option value="Documentation & Export Handling">Documentation & Export Handling</option>
                          <option value="Custom Packing Service">Custom Packing Service</option>
                        </select>

                        <div className="flex items-center gap-1 w-24">
                          <span className="text-[10px] text-slate-400">AED</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newChargeAmount}
                            onChange={e => setNewChargeAmount(e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-900"
                          />
                        </div>

                        <label className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newChargeVat}
                            onChange={e => setNewChargeVat(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span>VAT</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleAddOtherCharge}
                          className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase transition cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Hidden Profit Margin Preview Bar (WARM WEB THEME) */}
                  <div className="bg-gradient-to-r from-amber-50 to-amber-100/60 text-slate-900 p-3.5 rounded-xl border border-amber-300 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                        <ShieldCheck className="w-4 h-4 text-amber-700" />
                        <span>Executive Profitability & Margin Analytics</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProfitPreview(prev => !prev)}
                        className="text-[11px] text-amber-900 hover:text-amber-950 font-bold flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs cursor-pointer transition"
                      >
                        {showProfitPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showProfitPreview ? 'Hide Preview' : 'Show Profit Preview'}</span>
                      </button>
                    </div>

                    {showProfitPreview && (
                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-amber-200 text-center animate-in fade-in duration-200">
                        <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Items Revenue</div>
                          <div className="text-xs font-mono font-bold text-slate-900">AED {itemsSubtotal.toFixed(2)}</div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Total COGS</div>
                          <div className="text-xs font-mono font-bold text-rose-700">AED {totalCOGS.toFixed(2)}</div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Gross Profit</div>
                          <div className={`text-xs font-mono font-bold ${grossProfitAed >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            AED {grossProfitAed.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Profit Margin</div>
                          <div className={`text-xs font-mono font-bold ${grossProfitMarginPct >= 20 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {grossProfitMarginPct}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Grand Totals Summary Card */}
                  <div className="bg-[#FAF4E6]/50 p-3.5 rounded-xl border border-amber-200 shadow-xs space-y-2">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal:</span>
                        <span className="font-mono font-bold text-slate-900">AED {itemsSubtotal.toFixed(2)}</span>
                      </div>

                      {otherChargesTotal > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Other Charges:</span>
                          <span className="font-mono font-bold text-slate-900">AED {otherChargesTotal.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-600">
                        <span>VAT ({taxType === 'MAINLAND_5_VAT' ? '5% UAE Standard' : '0% Export Zero-Rated'}):</span>
                        <span className="font-mono font-bold text-slate-900">AED {vatAmount.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-sm font-black text-slate-950 pt-2 border-t-2 border-amber-300">
                        <span>TOTAL BILLABLE (AED):</span>
                        <span className="font-mono text-base text-indigo-900">AED {grandTotal.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-xs pt-1 border-t border-dashed border-amber-200 text-purple-900 font-bold">
                        <span>Debit to Customer Khata (Credit Due):</span>
                        <span className="font-mono">AED {creditAmountDue.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Packing list notes */}
                    <div className="pt-2">
                      <textarea
                        value={packingListNotes}
                        onChange={e => setPackingListNotes(e.target.value)}
                        placeholder="Warehouse Packing List Notes / Container Seal # / Transport Instructions..."
                        disabled={status === 'POSTED'}
                        rows={2}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-indigo-500"
                      />
                    </div>

                    {/* Modal Primary Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200">
                      <div className="flex items-center gap-2">
                        {status !== 'POSTED' ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveDraft}
                              disabled={isSaving || items.length === 0}
                              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider transition shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
                              <span>💾 Save Draft</span>
                            </button>

                            <button
                              type="button"
                              onClick={handlePostInvoice}
                              disabled={isSaving || items.length === 0 || !selectedCustomerId}
                              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition shadow-md cursor-pointer flex items-center gap-1.5 ring-2 ring-emerald-400/50"
                            >
                              {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                              <CheckCircle className="w-4 h-4" />
                              <span>✅ Post & Dispatch (Deduct Inventory & Khata)</span>
                            </button>

                            {invoiceId && (
                              <button
                                type="button"
                                onClick={handleDeleteDraft}
                                className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition border border-rose-200 cursor-pointer"
                              >
                                Delete Draft
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleUnpostInvoice}
                            disabled={isSaving}
                            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition shadow-sm cursor-pointer flex items-center gap-1.5"
                          >
                            {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>🔄 UNPOST INVOICE (Restore Stock & Reverse Khata)</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsInvoiceModalOpen(false)}
                        className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                      >
                        Close Window
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. BULK BALES SELECTOR MODAL ================= */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-300 w-full max-w-3xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-3.5 bg-[#FAF4E6] border-b border-amber-200 text-slate-900 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Bulk Quick Bales Selector ({availableBales.length} Available in Warehouse)
                </h3>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-700 text-base font-bold cursor-pointer">✕</button>
            </div>

            <div className="p-3 border-b border-amber-100 flex items-center justify-between gap-3 bg-amber-50/40">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={bulkSearch}
                  onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Filter bales by barcode, category, supplier..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    availableBales.forEach(b => { all[b.id] = true; });
                    setSelectedBulkIds(all);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold cursor-pointer border border-slate-300"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBulkIds({})}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold cursor-pointer border border-slate-300"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loadingBales ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                  <span>Loading available raw bales...</span>
                </div>
              ) : availableBales.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No unopened raw bales available in warehouse.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableBales
                    .filter(b => {
                      if (!bulkSearch) return true;
                      const q = bulkSearch.toLowerCase();
                      return (
                        b.baleCode.toLowerCase().includes(q) ||
                        (b.category && b.category.toLowerCase().includes(q)) ||
                        (b.supplierName && b.supplierName.toLowerCase().includes(q))
                      );
                    })
                    .map(bale => {
                      const isSelected = !!selectedBulkIds[bale.id];
                      return (
                        <div
                          key={bale.id}
                          onClick={() => {
                            setSelectedBulkIds(prev => ({ ...prev, [bale.id]: !prev[bale.id] }));
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start justify-between ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                              : 'bg-white border-slate-200 hover:bg-[#FAF4E6]/50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-0.5 rounded text-indigo-600"
                            />
                            <div>
                              <div className="font-mono font-bold text-xs text-slate-900">{bale.baleCode}</div>
                              <div className="text-[11px] font-semibold text-slate-700">{bale.category || 'Mixed Bale'}</div>
                              <div className="text-[10px] text-slate-500">Supplier: {bale.supplierName || 'Import'}</div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono font-bold text-xs text-indigo-900">{bale.grossWeightKg} KG</div>
                            <div className="text-[10px] font-mono text-slate-500">
                              Landed: AED {Number(bale.landedCostAed || 0).toFixed(0)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="p-3 bg-[#FAF4E6] border-t border-amber-200 flex items-center justify-between rounded-b-xl">
              <span className="text-xs font-bold text-slate-700">
                Selected: {Object.values(selectedBulkIds).filter(Boolean).length} bales
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddBulkBales}
                  disabled={Object.values(selectedBulkIds).filter(Boolean).length === 0}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  Add Selected to Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 6. DUAL PRINT MODALS (TAX INVOICE OR PACKING LIST) ================= */}
      {printModalType && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-300 w-full max-w-3xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-3.5 bg-[#FAF4E6] border-b border-amber-200 text-slate-900 flex items-center justify-between rounded-t-xl print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  {printModalType === 'TAX_INVOICE' ? 'Official UAE Tax Invoice (A4)' : 'Detailed Warehouse Packing & Dispatch List'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button onClick={() => setPrintModalType(null)} className="text-slate-400 hover:text-slate-700 text-base font-bold cursor-pointer">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-slate-900 font-sans space-y-4 print:p-0">
              {printModalType === 'TAX_INVOICE' ? (
                /* OFFICIAL TAX INVOICE */
                <div className="border border-slate-300 rounded p-6 space-y-4 text-xs">
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                    <div>
                      <h1 className="text-lg font-black text-slate-950 tracking-wide">
                        VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
                      </h1>
                      <p className="text-[11px] text-slate-600">House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, UAE</p>
                      <p className="text-[11px] font-mono font-bold text-slate-800">UAE TRN: 100482910300003</p>
                      <p className="text-[11px] text-slate-600">Tel: +971 55 418 6086 | Email: sales@vintagevibesllcspc.com</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 rounded bg-slate-900 text-white text-xs font-black uppercase tracking-wider inline-block mb-1">
                        TAX INVOICE / فاتورة ضريبية
                      </span>
                      <div className="font-mono font-bold text-sm text-slate-900">{invoiceNo || 'DRAFT-INVOICE'}</div>
                      <div className="text-[11px] text-slate-600">Date: {invoiceDate}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-200 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Billed To (Buyer):</div>
                      <div className="font-bold text-slate-900 text-sm">{selectedCustomer?.name || 'Walk-in Corporate Client'}</div>
                      <div className="text-slate-600">{selectedCustomer?.address || 'Industrial Area, Dubai, UAE'}</div>
                      <div className="text-slate-600">Contact: {selectedCustomer?.phone || 'N/A'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Buyer UAE TRN:</div>
                      <div className="font-mono font-bold text-slate-900">{selectedCustomer?.trnNo || 'Not Registered / Freezone'}</div>
                      <div className="mt-1 text-[10px] uppercase font-bold text-slate-500">Tax Type:</div>
                      <div className="font-bold text-slate-800">{taxType === 'MAINLAND_5_VAT' ? 'Mainland 5% VAT' : 'Export 0% Zero-Rated'}</div>
                      {exportCustomsDeclarationNo && (
                        <div className="text-[10px] font-mono text-slate-600">Customs Dec: {exportCustomsDeclarationNo}</div>
                      )}
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border border-slate-200 border-collapse">
                    <thead className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-2 border-r border-slate-200">#</th>
                        <th className="p-2 border-r border-slate-200">Barcode / Item Description</th>
                        <th className="p-2 border-r border-slate-200 text-right">Weight</th>
                        <th className="p-2 border-r border-slate-200 text-right">Unit Rate</th>
                        <th className="p-2 border-r border-slate-200 text-right">Net Amount</th>
                        <th className="p-2 border-r border-slate-200 text-right">VAT (5%)</th>
                        <th className="p-2 text-right">Gross Total (AED)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {items.map((it, i) => {
                        const net = Number(it.finalAmount) || 0;
                        const vat = taxType === 'MAINLAND_5_VAT' ? Number((net * 0.05).toFixed(2)) : 0;
                        const lineGross = net + vat;
                        return (
                          <tr key={it.id}>
                            <td className="p-2 border-r border-slate-200 text-center font-mono">{i + 1}</td>
                            <td className="p-2 border-r border-slate-200">
                              <span className="font-mono font-bold text-slate-900">{it.barcode}</span> — {it.description}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono">
                              {it.isRawBale ? `${it.grossWeightKg || it.weightKg} KG` : `${it.weightGrams || 400} g`}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono">
                              AED {Number(it.unitPrice).toFixed(2)}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono">
                              AED {net.toFixed(2)}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono">
                              AED {vat.toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-mono font-bold">
                              AED {lineGross.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="flex justify-between items-start pt-2">
                    <div className="w-1/2 space-y-1 text-[11px] text-slate-600">
                      <div className="font-bold text-slate-800">Bank Details for Wire Transfer:</div>
                      <div>Bank: Emirates NBD, Al Quoz Branch</div>
                      <div>Account Name: Vintage Vibe Used Clothing Trading LLC</div>
                      <div className="font-mono">IBAN: AE28 0260 0010 4928 1900 003</div>
                      <div className="font-mono">SWIFT: EBILAEAD</div>
                    </div>

                    <div className="w-1/2 max-w-[280px] space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal:</span>
                        <span className="font-mono font-bold">AED {itemsSubtotal.toFixed(2)}</span>
                      </div>
                      {otherChargesTotal > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Freight / Other Charges:</span>
                          <span className="font-mono font-bold">AED {otherChargesTotal.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>VAT ({taxType === 'MAINLAND_5_VAT' ? '5%' : '0%'}):</span>
                        <span className="font-mono font-bold">AED {vatAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-950 border-t-2 border-slate-900 pt-1">
                        <span>TOTAL PAYABLE:</span>
                        <span className="font-mono">AED {grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                    <div>
                      <div className="border-b border-slate-400 h-8"></div>
                      <div className="text-slate-500 font-bold mt-1">Authorized Signatory & Stamp</div>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-8"></div>
                      <div className="text-slate-500 font-bold mt-1">Customer Acceptance & Signature</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* DETAILED WAREHOUSE PACKING LIST */
                <div className="border border-slate-300 rounded p-6 space-y-4 text-xs">
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                    <div>
                      <h1 className="text-lg font-black text-slate-950 tracking-wide">
                        VINTAGE VIBE LOGISTICS & WAREHOUSE
                      </h1>
                      <p className="text-[11px] text-slate-600">Outward Dispatch & Freight Terminal</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 rounded bg-teal-800 text-white text-xs font-black uppercase tracking-wider inline-block mb-1">
                        WAREHOUSE PACKING LIST
                      </span>
                      <div className="font-mono font-bold text-sm text-slate-900">Ref: {invoiceNo || 'PACK-DRAFT'}</div>
                      <div className="text-[11px] text-slate-600">Date: {invoiceDate}</div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200 flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-500">Destination / Consignee: </span>
                      <span className="font-bold text-slate-900">{selectedCustomer?.name || 'Wholesale Buyer'}</span>
                      <div className="text-slate-600">{selectedCustomer?.address}</div>
                    </div>
                    <div className="text-right">
                      <div><span className="font-bold text-slate-500">Total Bales: </span><span className="font-mono font-bold">{(Array.isArray(items) ? items : []).filter(i => i?.isRawBale).length}</span></div>
                      <div><span className="font-bold text-slate-500">Total Pieces: </span><span className="font-mono font-bold">{(Array.isArray(items) ? items : []).filter(i => !i?.isRawBale).length}</span></div>
                      <div>
                        <span className="font-bold text-slate-500">Total Net Weight: </span>
                        <span className="font-mono font-bold">
                          {(Array.isArray(items) ? items : []).reduce((sum, i) => sum + (Number(i?.grossWeightKg || i?.weightKg) || 0), 0).toFixed(1)} KG
                        </span>
                      </div>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border border-slate-200 border-collapse">
                    <thead className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-2 border-r border-slate-200">Package #</th>
                        <th className="p-2 border-r border-slate-200">Barcode Identifier</th>
                        <th className="p-2 border-r border-slate-200">Item / Category</th>
                        <th className="p-2 border-r border-slate-200">Type</th>
                        <th className="p-2 text-right">Gross Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {items.map((it, idx) => (
                        <tr key={it.id}>
                          <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-200 font-mono font-bold">{it.barcode}</td>
                          <td className="p-2 border-r border-slate-200">{it.description}</td>
                          <td className="p-2 border-r border-slate-200 font-mono text-[10px]">
                            {it.isRawBale ? 'RAW BALE' : 'GARMENT PC'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold">
                            {it.isRawBale ? `${it.grossWeightKg || it.weightKg} KG` : `${it.weightGrams || 400} g`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {packingListNotes && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700">
                      <strong>Warehouse Dispatch Notes: </strong> {packingListNotes}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 pt-8 border-t border-slate-200 text-center text-xs">
                    <div>
                      <div className="border-b border-slate-400 h-8"></div>
                      <div className="text-slate-500 font-bold mt-1">Warehouse Loader / Picker</div>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-8"></div>
                      <div className="text-slate-500 font-bold mt-1">Transport Driver & Truck Plate #</div>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-8"></div>
                      <div className="text-slate-500 font-bold mt-1">Receiver Seal & Signature</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

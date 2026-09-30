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
  ExternalLink,
  Truck
} from 'lucide-react';
import { SalesService } from '../../../services/salesService.ts';
import { PartiesService } from '../../../services/partiesService.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { CompanyProfileService } from '../../../services/companyProfileService.ts';
import { CompanyProfile } from '../../setup/setup.types.ts';
import { COAAccount } from '../../finance/finance.types.ts';
import { supabase } from '../../../supabaseClient.ts';
import {
  VINTAGE_VIBES_MONOGRAM_SVG,
  openB2BTaxInvoiceA4PrintWindow,
  openB2BPackingListA4PrintWindow,
  B2BTaxInvoiceA4Data
} from '../../../utils/printInvoiceA4.ts';

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

/**
 * Safely awaits a Supabase PostgREST query builder without invoking unhandled `.catch is not a function`
 * (Supabase PostgrestBuilder implements PromiseLike with .then, not native Promise .catch).
 */
const safeSupabaseCall = async (queryBuilder: any): Promise<void> => {
  try {
    await queryBuilder;
  } catch (err) {
    console.warn('Supabase query note:', err);
  }
};

export const CustomCompanySalesView: React.FC<CustomCompanySalesViewProps> = ({
  clients: propClients,
  currentUserRole = 'ADMIN',
  onRefreshAll,
  invoices: propInvoices
}) => {
  const [internalClients, setInternalClients] = useState<Party[]>(propClients || []);
  const [internalInvoices, setInternalInvoices] = useState<SalesInvoice[]>(propInvoices || []);
  const [coaAccounts, setCoaAccounts] = useState<COAAccount[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    CompanyProfileService.getCompanyProfile().then(p => {
      if (p) setCompanyProfile(p);
    }).catch(() => {});
  }, []);

  const primaryBank = useMemo(() => {
    const accounts = companyProfile?.bankAccounts || [];
    return accounts.find(b => b.isPrimary) || accounts[0] || null;
  }, [companyProfile]);

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
  const [courierParties, setCourierParties] = useState<Party[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [waybillNo, setWaybillNo] = useState<string>('');
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
      const [partiesData, coaData] = await Promise.all([
        PartiesService.getParties().catch(() => []),
        FinanceService.getCoaAccounts().catch(() => [])
      ]);
      if (Array.isArray(partiesData)) {
        setInternalClients(partiesData.filter(p => {
          const t = String(p.type || (p as any).party_type || '').toUpperCase();
          return t === 'CLIENT' || t === 'CUSTOMER' || !t;
        }));
        setCourierParties(partiesData.filter(p => {
          const t = String(p.type || (p as any).party_type || '').toUpperCase();
          return t === 'COURIER' || t === 'TRANSPORTER' || t === 'LOGISTICS' || t === 'FREIGHT';
        }));
      }
      if (Array.isArray(coaData)) {
        setCoaAccounts(coaData);
      }
    } catch {}
  };

  useEffect(() => {
    if (propClients && propClients.length > 0) {
      setInternalClients(propClients.filter(p => {
        const t = String(p.type || (p as any).party_type || '').toUpperCase();
        return t === 'CLIENT' || t === 'CUSTOMER' || !t;
      }));
    }
    loadParties();
  }, [propClients]);

  const loadInvoices = async () => {
    try {
      // 1. Try dedicated B2B endpoint
      const res = await fetch('/api/sales/custom-b2b/invoices');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setInternalInvoices(data);
          return;
        }
      }
    } catch (_) {}

    // 2. Fallback to Supabase b2b_sales & sales_invoices
    try {
      const [b2bRes, sinvRes] = await Promise.all([
        supabase.from('b2b_sales').select('*').order('created_at', { ascending: false }),
        supabase.from('sales_invoices').select('*').or('channel.eq.WHOLESALE_B2B,invoice_no.ilike.B2B-%,invoice_no.ilike.SLS-B2B%').order('created_at', { ascending: false })
      ]);
      const mappedMap = new Map<string, any>();
      for (const row of (sinvRes.data || [])) {
        const invNo = row.invoice_no || `B2B-${row.id}`;
        mappedMap.set(invNo, {
          ...row,
          invoiceNo: invNo,
          isB2BCustomSale: true,
          status: String(row.status || 'DRAFT').toUpperCase()
        });
      }
      for (const b of (b2bRes.data || [])) {
        const invNo = b.b2b_invoice_number || `B2B-${b.id}`;
        if (!mappedMap.has(invNo)) {
          mappedMap.set(invNo, {
            id: b.id,
            invoiceNo: invNo,
            customerName: b.company_name || 'Wholesale Client',
            customerPhone: b.phone || '',
            customerTrn: b.trn_number || '',
            channel: 'WHOLESALE_B2B',
            isB2BCustomSale: true,
            totalAmount: Number(b.total_amount || 0),
            creditAmountDue: Number(b.balance_due || b.total_amount || 0),
            status: String(b.credit_status || 'DRAFT').toUpperCase(),
            items: Array.isArray(b.items) ? b.items : [],
            createdAt: b.created_at
          });
        }
      }
      if (mappedMap.size > 0) {
        setInternalInvoices(Array.from(mappedMap.values()));
        return;
      }
    } catch (_) {}

    // 3. Fallback: general SalesService
    try {
      const data = await SalesService.getSalesInvoices();
      if (Array.isArray(data)) setInternalInvoices(data);
    } catch {}
  };

  useEffect(() => {
    loadInvoices();
  }, [propInvoices]);

  // Load available raw bales
  const fetchAvailableBales = async () => {
    setLoadingBales(true);
    try {
      let data: any = null;
      try {
        const res = await fetch('/api/sales/custom-b2b/available-bales');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) data = json;
        }
      } catch (_) {}

      // Supabase direct fallback
      if (!data) {
        const { data: supaBales } = await supabase
          .from('inward_gate_passes')
          .select('*')
          .not('status', 'in', '("SOLD_AS_BALE","CONSUMED_IN_SORTING")')
          .order('created_at', { ascending: false });
        if (Array.isArray(supaBales)) {
          data = supaBales.map((b: any) => ({
            id: b.id,
            baleCode: b.bale_code || b.gate_pass_no,
            category: b.bale_category || 'Raw Garment Bale',
            grossWeightKg: Number(b.weight_kg || b.total_bale_weight || 45),
            landedCostAed: Number(b.total_bale_cost || 2000),
            supplierName: b.supplier_name || 'Direct Import',
            inwardDate: b.created_at ? new Date(b.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
          }));
        }
      }

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

    const handleCartForceCleared = (e: any) => {
      fetchAvailableBales();
      setItems(prevItems => {
        if (prevItems.length === 0) return prevItems;
        const releasedPieces = e?.detail?.pieces;
        if (!releasedPieces || releasedPieces.length === 0) {
          showMsg('Sales basket synchronized: All reservations released by Admin.');
          return [];
        }
        const releasedBarcodes = new Set(
          releasedPieces.map((p: any) => String(p.barcode || '').trim().toLowerCase())
        );
        const remaining = prevItems.filter(item => !releasedBarcodes.has(String(item.barcode || '').trim().toLowerCase()));
        if (remaining.length !== prevItems.length) {
          showMsg(`${prevItems.length - remaining.length} item(s) released by Inventory sync.`);
        }
        return remaining;
      });
    };

    window.addEventListener('vv:cart-force-cleared', handleCartForceCleared);

    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('vv_pos_sync');
        bc.onmessage = (msg) => {
          if (msg.data?.type === 'CART_FORCE_CLEARED') {
            handleCartForceCleared({ detail: { pieces: msg.data.pieces, count: msg.data.count } });
          } else if (msg.data?.type === 'PIECE_RELEASED') {
            handleCartForceCleared({ detail: { pieces: [msg.data.piece], count: 1 } });
          }
        };
      } catch (_) {}
    }

    return () => {
      window.removeEventListener('vv:cart-force-cleared', handleCartForceCleared);
      if (bc) bc.close();
    };
  }, []);

  // Auto-Release Guard on Window / Tab Close for B2B Sales Terminal
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (items.length > 0) {
        for (const item of items) {
          if (item?.barcode && !item.isRawBale) {
            SalesService.releasePiece(item.barcode).catch(() => {});
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [items]);

  const refreshAllB2BData = () => {
    loadParties();
    loadInvoices();
    fetchAvailableBales();
    if (onRefreshAll) onRefreshAll();
  };

  // Filter clients
  const customerClients = useMemo(() => {
    return (internalClients || []).filter(c => {
      const t = String(c.type || (c as any).party_type || '').toUpperCase();
      return t === 'CLIENT' || t === 'CUSTOMER' || !t;
    });
  }, [internalClients]);

  // Filter B2B Custom Sales invoices from all invoices
  const b2bInvoices = useMemo(() => {
    return internalInvoices.filter(i => 
      i.isB2BCustomSale || 
      i.invoiceNo?.startsWith('SLS-B2B') || 
      i.invoiceNo?.startsWith('B2B-') || 
      (i as any).channel === 'WHOLESALE_B2B'
    );
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

  // Linked Chart of Accounts (COA) Account & Code for the selected customer
  const selectedCustomerCoaAccount = useMemo(() => {
    if (!selectedCustomer) return null;
    const targetCodeOrId = selectedCustomer.coaAccountId || (selectedCustomer as any).coa_account_id || selectedCustomer.accountMap?.receivableAccountId || (selectedCustomer as any).linked_account_id;
    if (!targetCodeOrId) return null;
    return (coaAccounts || []).find(a => a.id === targetCodeOrId || a.code === targetCodeOrId || (a as any).account_code === targetCodeOrId) || null;
  }, [selectedCustomer, coaAccounts]);

  const selectedCustomerCoaCode = useMemo(() => {
    if (selectedCustomerCoaAccount) return selectedCustomerCoaAccount.code || (selectedCustomerCoaAccount as any).account_code;
    return selectedCustomer?.coaAccountId || (selectedCustomer as any)?.coa_account_id || (selectedCustomer?.code ? `1130-${(selectedCustomer.code).replace(/[^A-Za-z0-9]/g, '')}` : '1130-00');
  }, [selectedCustomer, selectedCustomerCoaAccount]);

  // Selected courier object for active editor
  const selectedCourier = useMemo(() => {
    return (Array.isArray(courierParties) ? courierParties : []).find(c => c?.id === selectedCourierId) || null;
  }, [courierParties, selectedCourierId]);

  // Linked Chart of Accounts (COA) Account & Code for the selected courier
  const selectedCourierCoaAccount = useMemo(() => {
    if (!selectedCourier) return null;
    const targetCodeOrId = selectedCourier.coaAccountId || (selectedCourier as any).coa_account_id || selectedCourier.accountMap?.courierPayableAccountId || selectedCourier.accountMap?.payableAccountId || (selectedCourier as any).linked_account_id;
    if (!targetCodeOrId) return null;
    return (coaAccounts || []).find(a => a.id === targetCodeOrId || a.code === targetCodeOrId || (a as any).account_code === targetCodeOrId) || null;
  }, [selectedCourier, coaAccounts]);

  const selectedCourierCoaCode = useMemo(() => {
    if (selectedCourierCoaAccount) return selectedCourierCoaAccount.code || (selectedCourierCoaAccount as any).account_code;
    return selectedCourier?.coaAccountId || (selectedCourier as any)?.coa_account_id || (selectedCourier?.code ? `2120-${(selectedCourier.code).replace(/[^A-Za-z0-9]/g, '')}` : '2120-00');
  }, [selectedCourier, selectedCourierCoaAccount]);

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

  const handlePrintDocument = () => {
    const printPayload: B2BTaxInvoiceA4Data = {
      invoiceNo: invoiceNo || 'DRAFT-INVOICE',
      invoiceDate: invoiceDate || new Date().toISOString().slice(0, 10),
      paymentMethod,
      taxType,
      exportCustomsDeclarationNo,
      pdcChequeNo,
      pdcChequeDate,
      salespersonOrBroker,
      customerName: selectedCustomer?.name || 'Walk-in Corporate Client',
      customerAddress: selectedCustomer?.address || 'Industrial Area, Dubai, UAE',
      customerPhone: selectedCustomer?.phone || 'N/A',
      customerEmail: selectedCustomer?.email,
      customerTrn: selectedCustomer?.trnNo || 'Not Registered / Freezone',
      customerCoaCode: selectedCustomerCoaCode,
      courierName: selectedCourier?.name,
      waybillNo: waybillNo,
      courierCoaCode: selectedCourierCoaCode,
      items: items || [],
      itemsSubtotal,
      otherCharges: otherCharges || [],
      otherChargesTotal,
      vatAmount,
      grandTotal,
      advanceAmountPaid,
      packingListNotes
    };

    if (printModalType === 'TAX_INVOICE') {
      openB2BTaxInvoiceA4PrintWindow(printPayload);
    } else if (printModalType === 'PACKING_LIST') {
      openB2BPackingListA4PrintWindow(printPayload);
    }
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
    const rawBarcode = (barcodeToScan || '').trim();
    if (!rawBarcode) return;
    setScanLoading(true);
    setScanError(null);

    const alreadyScanned = items.some(it => it.barcode.toLowerCase() === rawBarcode.toLowerCase());
    if (alreadyScanned) {
      setScanError(`Barcode "${rawBarcode}" is already added to this invoice!`);
      setScanLoading(false);
      return;
    }

    try {
      let lookupData: any = null;

      // 1. Try server endpoint
      try {
        const res = await fetch(`/api/sales/custom-b2b/scan/${encodeURIComponent(rawBarcode)}`);
        if (res.ok) {
          const json = await res.json();
          if (json && (json.isRawBale || json.piece)) {
            lookupData = json;
          } else if (json && json.success === false && json.error) {
            setScanError(json.error);
            setScanLoading(false);
            return;
          }
        }
      } catch (_) {}

      // 2. Direct Supabase Fallback (if serverless gateway or local cache missed)
      if (!lookupData || (!lookupData.isRawBale && !lookupData.piece)) {
        // A. Check inward_gate_passes (Raw Bale)
        const { data: baleRow } = await supabase
          .from('inward_gate_passes')
          .select('*')
          .or(`bale_code.ilike.%${rawBarcode}%,gate_pass_no.ilike.%${rawBarcode}%`)
          .maybeSingle();

        if (baleRow) {
          if (baleRow.status === 'SOLD_AS_BALE') {
            setScanError(`Raw Bale "${baleRow.bale_code || baleRow.gate_pass_no}" is already marked as SOLD!`);
            setScanLoading(false);
            return;
          }
          lookupData = {
            success: true,
            isRawBale: true,
            bale: {
              id: baleRow.id,
              baleCode: baleRow.bale_code || baleRow.gate_pass_no,
              category: baleRow.bale_category || 'Raw Garment Bale',
              supplierName: baleRow.supplier_name || 'Direct Import',
              grossWeightKg: Number(baleRow.weight_kg || baleRow.total_bale_weight || 45),
              costPerGram: Number(baleRow.cost_per_gram || 0),
              landedCostAed: Number(baleRow.total_bale_cost || 2000),
              suggestedPriceAed: Math.round(Number(baleRow.total_bale_cost || 2000) * 1.35)
            }
          };
        } else {
          // B. Check inventory_pieces (Garment Piece)
          const { data: pieceRow } = await supabase
            .from('inventory_pieces')
            .select('*')
            .ilike('barcode', rawBarcode)
            .maybeSingle();

          if (pieceRow) {
            if (pieceRow.is_sold || pieceRow.status === 'SOLD') {
              setScanError(`Garment Piece "${pieceRow.barcode}" (${pieceRow.brand_name || ''} ${pieceRow.item_name || ''}) has already been SOLD!`);
              setScanLoading(false);
              return;
            }
            const grams = pieceRow.weight_grams || Math.round((Number(pieceRow.weight_kg) || 0.45) * 1000);
            const cogs = Number(pieceRow.cost_price || (pieceRow.cost_per_gram ? Number((grams * Number(pieceRow.cost_per_gram)).toFixed(2)) : 18.5));
            lookupData = {
              success: true,
              isRawBale: false,
              piece: {
                id: pieceRow.id,
                barcode: pieceRow.barcode,
                brandName: pieceRow.brand_name || '',
                itemName: pieceRow.item_name || 'Garment Piece',
                size: pieceRow.size_scanned || pieceRow.size || 'M',
                labelGrade: pieceRow.label_grade || 'A',
                weightGrams: grams,
                weightKg: Number(pieceRow.weight_kg || grams / 1000),
                calculatedCostPrice: cogs,
                suggestedPriceAed: Number(pieceRow.retail_price_aed || pieceRow.estimated_price || pieceRow.ai_suggested_price || Math.round(cogs * 2.5))
              }
            };
          }
        }
      }

      if (!lookupData || (!lookupData.isRawBale && !lookupData.piece)) {
        setScanError(`Barcode "${rawBarcode}" not found in inventory or raw bales.`);
        setScanLoading(false);
        return;
      }

      if (lookupData.isRawBale && lookupData.bale) {
        const bale = lookupData.bale;
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
      } else if (lookupData.piece) {
        const piece = lookupData.piece;
        const weightKg = Number(piece.weightKg) || 0.45;
        const price = Number(piece.suggestedPriceAed) || 45;
        const cogs = Number(piece.calculatedCostPrice) || 18;

        // Global Pessimistic Reservation in Supabase
        try {
          await SalesService.reservePiece({ id: piece.id, barcode: piece.barcode });
        } catch (reserveErr: any) {
          console.warn('Piece reservation note:', reserveErr?.message);
        }

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
      setScanError(null);
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    } catch (err: any) {
      console.error('Barcode process error:', err);
      setScanError(err?.message || 'Failed to lookup barcode.');
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

  const handleRemoveItem = async (id: string) => {
    const itemToRemove = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (itemToRemove && !itemToRemove.isRawBale && itemToRemove.barcode) {
      await SalesService.releasePiece(itemToRemove.barcode).catch(() => {});
    }
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
    setSelectedCourierId('');
    setWaybillNo('');
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
    const targetCustId = inv.customerId || inv.clientId || '';
    const matched = customerClients.find(c => c.id === targetCustId || (inv.customerName && c.name?.trim().toLowerCase() === inv.customerName.trim().toLowerCase()));
    setSelectedCustomerId(matched ? matched.id : targetCustId);
    setSelectedCourierId((inv as any).courierId || (inv as any).courier_id || '');
    setWaybillNo((inv as any).waybillNo || (inv as any).waybill_no || (inv as any).trackingNo || '');
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

  // Save Draft (No Ledgers, No Financial Vouchers, Reserve Stock)
  const handleSaveDraft = async (forcedInvoiceNo?: string): Promise<{ id: string; invoiceNo: string } | null> => {
    if (!selectedCustomerId) {
      showMsg('Please select a Customer / Company from Parties Khata first!', 'error');
      return null;
    }
    if (items.length === 0) {
      showMsg('Please scan at least one Raw Bale or Garment Piece!', 'error');
      return null;
    }

    setIsSaving(true);
    try {
      const genInvoiceNo = forcedInvoiceNo || invoiceNo || `B2B-${Date.now().toString().slice(-6)}`;
      let finalId = invoiceId;

      if (invoiceId) {
        // 1. Update existing b2b_sales record
        await safeSupabaseCall(
          supabase
            .from('b2b_sales')
            .update({
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
              credit_status: 'DRAFT',
              shipping_address: selectedCustomer.address || ''
            })
            .or(`id.eq.${invoiceId},b2b_invoice_number.eq.${genInvoiceNo}`)
        );

        // 2. Update existing sales_invoices record
        await SalesService.updateSalesInvoice(invoiceId, {
          invoiceNo: genInvoiceNo,
          clientId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone || '',
          invoiceDate: invoiceDate,
          channel: 'WHOLESALE_B2B',
          paymentMethod: paymentMethod as any,
          subtotal: itemsSubtotal,
          discountAmount: 0,
          taxAmount: vatAmount,
          totalAmount: grandTotal,
          status: 'DRAFT',
          items: items
        }).catch(e => console.warn('B2B sales_invoices update note:', e));
      } else {
        // 1. Direct write to public.b2b_sales with credit_status: 'DRAFT'
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
          credit_status: 'DRAFT',
          shipping_address: selectedCustomer.address || ''
        });

        finalId = b2bRecord?.id || genInvoiceNo;

        // 2. Direct write to sales_invoices with status: 'DRAFT'
        const createdSInv = await SalesService.createSalesInvoice({
          id: finalId,
          invoiceNo: genInvoiceNo,
          clientId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone || '',
          invoiceDate: invoiceDate,
          channel: 'WHOLESALE_B2B',
          paymentMethod: paymentMethod as any,
          subtotal: itemsSubtotal,
          discountAmount: 0,
          taxAmount: vatAmount,
          totalAmount: grandTotal,
          status: 'DRAFT',
          items: items
        }).catch(e => console.warn('B2B sales_invoices sync note:', e));

        if (createdSInv?.id) {
          finalId = createdSInv.id;
        }
      }

      // 3. Mark piece barcodes as RESERVED (not SOLD, no ledger entries)
      const pieceBarcodes = (items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await safeSupabaseCall(supabase.from('inventory_pieces').update({ is_sold: false, status: 'RESERVED' }).in('barcode', pieceBarcodes));
      }

      setInvoiceId(finalId);
      setInvoiceNo(genInvoiceNo);
      setStatus('DRAFT');
      showMsg(`Invoice ${genInvoiceNo} saved as DRAFT in cloud database.`);
      refreshAllB2BData();
      return { id: finalId, invoiceNo: genInvoiceNo };
    } catch (err: any) {
      showMsg(err?.message || 'Save draft error.', 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // POST & Dispatch (Deduct Inventory, Create Double-Entry Journal Voucher)
  const handlePostInvoice = async () => {
    if (status === 'POSTED') {
      showMsg(`Invoice ${invoiceNo} is already POSTED and locked.`, 'error');
      return;
    }

    let activeInvoiceId = invoiceId;
    let activeInvoiceNo = invoiceNo;

    // Ensure invoice is saved as draft first and grab exact IDs synchronously
    if (!activeInvoiceId || !activeInvoiceNo) {
      const saved = await handleSaveDraft();
      if (!saved) return;
      activeInvoiceId = saved.id;
      activeInvoiceNo = saved.invoiceNo;
    }

    const confirmPost = window.confirm(
      `Are you sure you want to POST & DISPATCH Invoice ${activeInvoiceNo}?\n\n` +
      `• Raw Bales (${items.filter(i => i.isRawBale).length}) will be deducted from 1140-01 to 5100-01 COGS\n` +
      `• Garment Pieces (${items.filter(i => !i.isRawBale).length}) will be deducted from 1160-01 to 5100-02 COGS\n` +
      `• Double-Entry General Ledger Journal Voucher will be dispatched.\n` +
      `• Customer Khata (${selectedCustomerCoaCode}) will be debited AED ${grandTotal.toFixed(2)}.`
    );
    if (!confirmPost) return;

    setIsSaving(true);
    try {
      const genInvoiceNo = activeInvoiceNo;

      // 1. Mark inventory pieces as SOLD
      const pieceBarcodes = (items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await supabase.from('inventory_pieces').update({ is_sold: true, status: 'SOLD' }).in('barcode', pieceBarcodes);
      }
      const baleCodes = (items || []).filter(i => i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (baleCodes.length > 0) {
        await safeSupabaseCall(supabase.from('raw_bales').update({ status: 'PROCESSED' }).in('bale_code', baleCodes));
      }

      // 2. Build GAAP/IFRS Double-Entry Journal Voucher Lines
      const voucherLines: any[] = [];

      // Line 1: Debit Customer Khata (Accounts Receivable)
      voucherLines.push({
        accountId: selectedCustomerCoaAccount?.id || selectedCustomerCoaCode,
        accountCode: selectedCustomerCoaCode,
        accountName: selectedCustomerCoaAccount?.name || `Accounts Receivable - ${selectedCustomer?.name || 'Client'}`,
        partyId: selectedCustomer?.id,
        partyName: selectedCustomer?.name,
        debit: grandTotal,
        credit: 0,
        memo: `B2B Wholesale Invoice ${genInvoiceNo} - ${selectedCustomer?.name}`
      });

      // Line 2: Credit B2B Sales Revenue (Tier 3 Transaction Account 4110-05)
      const b2bRevAccount = (coaAccounts || []).find(a => a.code === '4110-05');
      voucherLines.push({
        accountId: b2bRevAccount?.id || '4110-05',
        accountCode: '4110-05',
        accountName: b2bRevAccount?.name || 'B2B REVENUE',
        debit: 0,
        credit: itemsSubtotal,
        memo: `Wholesale B2B Sales Revenue (${items.length} items): Invoice ${genInvoiceNo}`
      });

      // Line 3: Credit Other Charges (Freight/Delivery) -> Assigned Courier Khata (2120-xx) or Shipping Revenue (4110-04)
      if (otherChargesTotal > 0) {
        if (selectedCourier) {
          voucherLines.push({
            accountId: selectedCourierCoaAccount?.id || selectedCourierCoaCode,
            accountCode: selectedCourierCoaCode,
            accountName: selectedCourierCoaAccount?.name || `Accounts Payable - ${selectedCourier.name} (Courier)`,
            partyId: selectedCourier.id,
            partyName: selectedCourier.name,
            debit: 0,
            credit: otherChargesTotal,
            memo: `Delivery & Freight Payable to Courier: ${selectedCourier.name} (Waybill: ${waybillNo || 'N/A'}) - Invoice ${genInvoiceNo}`
          });
        } else {
          const delivRevAccount = (coaAccounts || []).find(a => a.code === '4110-04');
          voucherLines.push({
            accountId: delivRevAccount?.id || '4110-04',
            accountCode: '4110-04',
            accountName: delivRevAccount?.name || 'Delivery & Shipping Charges Collected',
            debit: 0,
            credit: otherChargesTotal,
            memo: `Delivery & Freight Revenue: Invoice ${genInvoiceNo}`
          });
        }
      }

      // Line 4: Credit UAE VAT Output Tax 5% (Tier 3 Transaction Account 2140-01) if applicable
      if (vatAmount > 0) {
        const vatAccount = (coaAccounts || []).find(a => a.code === '2140-01');
        voucherLines.push({
          accountId: vatAccount?.id || '2140-01',
          accountCode: '2140-01',
          accountName: vatAccount?.name || 'UAE VAT Output Tax (5%)',
          debit: 0,
          credit: vatAmount,
          memo: `UAE VAT 5% Output Tax (TRN: ${selectedCustomer?.trnNo || 'B2B'}): Invoice ${genInvoiceNo}`
        });
      }

      // Line 5 & 6: COGS vs Inventory Relief for Garment Pieces (Tier 3 Transaction Account 5100-02)
      const pieceCogsTotal = Number(
        (items || []).filter(i => !i.isRawBale).reduce((sum, i) => sum + (Number(i.calculatedCostPrice) || 0), 0).toFixed(2)
      );
      if (pieceCogsTotal > 0) {
        const fgCogsAccount = (coaAccounts || []).find(a => a.code === '5100-02') ||
                              (coaAccounts || []).find(a => a.tier === 3 && a.name?.toLowerCase().includes('finished goods') && a.category === 'EXPENSE');
        const fgCogsCode = fgCogsAccount?.code || '5100-02';
        const fgCogsId = fgCogsAccount?.id || fgCogsCode;
        const fgCogsName = fgCogsAccount?.name || 'Cost of Goods Sold - Finished Goods';

        voucherLines.push({
          accountId: fgCogsId,
          accountCode: fgCogsCode,
          accountName: fgCogsName,
          debit: pieceCogsTotal,
          credit: 0,
          memo: `COGS for Sorted Garment Pieces Sold: Invoice ${genInvoiceNo}`
        });
        voucherLines.push({
          accountId: '1160-01',
          accountCode: '1160-01',
          accountName: 'Inventory - Sorted & Tagged Garments',
          debit: 0,
          credit: pieceCogsTotal,
          memo: `Inventory Relief for Finished Garments: Invoice ${genInvoiceNo}`
        });
      }

      // Line 7 & 8: COGS vs Inventory Relief for Raw Bales (Tier 3 Transaction Account 5100-01)
      const baleCogsTotal = Number(
        (items || []).filter(i => i.isRawBale).reduce((sum, i) => sum + (Number(i.calculatedCostPrice || (i as any).landedCostAed) || 0), 0).toFixed(2)
      );
      if (baleCogsTotal > 0) {
        const rawBaleCogsAccount = (coaAccounts || []).find(a => a.code === '5100-01') ||
                                   (coaAccounts || []).find(a => a.tier === 3 && a.name?.toLowerCase().includes('raw bales') && a.category === 'EXPENSE');
        const baleCogsCode = rawBaleCogsAccount?.code || '5100-01';
        const baleCogsId = rawBaleCogsAccount?.id || baleCogsCode;
        const baleCogsName = rawBaleCogsAccount?.name || 'Cost of Raw Bales Consumed';

        voucherLines.push({
          accountId: baleCogsId,
          accountCode: baleCogsCode,
          accountName: baleCogsName,
          debit: baleCogsTotal,
          credit: 0,
          memo: `COGS for Bulk Bales Sold: Invoice ${genInvoiceNo}`
        });
        voucherLines.push({
          accountId: '1140-01',
          accountCode: '1140-01',
          accountName: 'Inventory - Raw Bulk Bales',
          debit: 0,
          credit: baleCogsTotal,
          memo: `Inventory Relief for Raw Bales: Invoice ${genInvoiceNo}`
        });
      }

      // Line 9 & 10: Advance Payment Settlement (if advance paid)
      const advPaid = Number(advanceAmountPaid) || 0;
      if (advPaid > 0) {
        const receiptAccCode = paymentMethod === 'BANK_TRANSFER' ? (primaryBank?.coaAccountCode || companyProfile?.bankAccountCode || '1120-02') : '1110-01';
        const receiptAccName = paymentMethod === 'BANK_TRANSFER' ? `${primaryBank?.bankName || companyProfile?.bankName || 'Corporate Bank'} Account` : 'Main Cash in Hand';
        voucherLines.push({
          accountId: receiptAccCode,
          accountCode: receiptAccCode,
          accountName: receiptAccName,
          partyId: selectedCustomer?.id,
          partyName: selectedCustomer?.name,
          debit: advPaid,
          credit: 0,
          memo: `Advance Payment Received on Invoice ${genInvoiceNo}`
        });
        voucherLines.push({
          accountId: selectedCustomerCoaAccount?.id || selectedCustomerCoaCode,
          accountCode: selectedCustomerCoaCode,
          accountName: selectedCustomerCoaAccount?.name || `Accounts Receivable - ${selectedCustomer?.name || 'Client'}`,
          partyId: selectedCustomer?.id,
          partyName: selectedCustomer?.name,
          debit: 0,
          credit: advPaid,
          memo: `Advance Payment Applied to Invoice ${genInvoiceNo}`
        });
      }

      // 3. Dispatch Journal Voucher to Finance Module (Ensure zero duplicate vouchers)
      const vDebitSum = Number(voucherLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0).toFixed(2));
      const vCreditSum = Number(voucherLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0).toFixed(2));

      // Idempotency: Purge any pre-existing voucher for this document to prevent duplicate entries
      await FinanceService.cascadeDeleteVouchersForDocument(genInvoiceNo).catch(() => {});

      await FinanceService.addVoucher({
        date: invoiceDate,
        type: 'JOURNAL',
        reference: genInvoiceNo,
        narration: `B2B Sales Invoice ${genInvoiceNo} - ${selectedCustomer?.name || 'Wholesale Client'}`,
        createdBy: 'Sales Terminal',
        isAuto: true,
        is_auto: true,
        totalDebit: vDebitSum,
        totalCredit: vCreditSum,
        lines: voucherLines
      }).catch(e => console.warn('B2B Finance voucher dispatch note:', e));

      // 4. Trigger backend SQL sync first
      const postTargetKey = activeInvoiceId || genInvoiceNo;
      try {
        const postRes = await fetch(`/api/sales/custom-b2b/${encodeURIComponent(postTargetKey)}/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postedBy: 'Sales Lead' })
        });
        const postData = await postRes.json().catch(() => ({}));
        if (!postRes.ok && postData?.error && !postData.error.toLowerCase().includes('already posted')) {
          console.warn('B2B backend post sync note:', postData.error);
        }
      } catch (e) {
        console.warn('B2B backend post sync note:', e);
      }

      // 5. Update b2b_sales & sales_invoices status to POSTED
      await safeSupabaseCall(supabase.from('b2b_sales').update({ credit_status: 'POSTED' }).or(`b2b_invoice_number.eq.${genInvoiceNo},id.eq.${activeInvoiceId}`));
      await safeSupabaseCall(supabase.from('sales_invoices').update({ status: 'POSTED' }).or(`invoice_no.eq.${genInvoiceNo},id.eq.${activeInvoiceId}`));

      setStatus('POSTED');
      setInvoiceNo(genInvoiceNo);
      setInvoiceId(activeInvoiceId);
      showMsg(`Invoice ${genInvoiceNo} successfully POSTED & DISPATCHED! Inventory deducted, General Ledger JV posted.`);
      
      // Update in-memory invoice state immediately so UI and outer table reflect POSTED status
      setInternalInvoices(prev => {
        const found = prev.some(p => p.id === activeInvoiceId || p.invoiceNo === genInvoiceNo);
        if (found) {
          return prev.map(p => (p.id === activeInvoiceId || p.invoiceNo === genInvoiceNo) ? { ...p, status: 'POSTED' } : p);
        }
        return [{
          id: activeInvoiceId,
          invoiceNo: genInvoiceNo,
          customerName: selectedCustomer?.name || 'Wholesale Client',
          customerPhone: selectedCustomer?.phone || '',
          customerTrn: selectedCustomer?.trnNo || '',
          invoiceDate: invoiceDate,
          date: invoiceDate,
          channel: 'WHOLESALE_B2B',
          isB2BCustomSale: true,
          totalAmount: grandTotal,
          grandTotalAED: grandTotal,
          creditAmountDue: creditAmountDue,
          status: 'POSTED',
          items: items
        } as SalesInvoice, ...prev];
      });
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Post error.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // UNPOST Invoice (Reverses JV, Restores Inventory, Unlocks Invoice)
  const handleUnpostInvoice = async () => {
    if (!invoiceId && !invoiceNo) return;
    const targetNo = invoiceNo || invoiceId;
    const confirmUnpost = window.confirm(
      `UNPOST Invoice ${targetNo}?\n\n` +
      `• Restores all Raw Bales & Garment Pieces to stock\n` +
      `• Reverses General Ledger Journal Voucher & Ledgers\n` +
      `• Credits Customer Khata to reverse balance\n` +
      `• Unlocks invoice for editing or deletion`
    );
    if (!confirmUnpost) return;

    setIsSaving(true);
    try {
      // 1. Call backend unpost API (handles Postgres SQL transactions, balances, and cascades)
      const targetKey = invoiceId || invoiceNo;
      await fetch(`/api/sales/custom-b2b/${encodeURIComponent(targetKey)}/unpost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(e => console.warn('Backend unpost notice:', e));

      // 2. Cascade delete vouchers for this invoice via FinanceService as well
      await FinanceService.cascadeDeleteVouchersForDocument(invoiceNo).catch(e => console.warn('Voucher reversal note:', e));

      // 3. Restore inventory pieces to IN_STOCK
      const pieceBarcodes = (items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('barcode', pieceBarcodes);
      }
      const baleCodes = (items || []).filter(i => i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (baleCodes.length > 0) {
        await safeSupabaseCall(supabase.from('raw_bales').update({ status: 'UNOPENED' }).in('bale_code', baleCodes));
        await safeSupabaseCall(supabase.from('inward_gate_passes').update({ status: 'AVAILABLE', sorting_status: 'UNOPENED' }).in('bale_code', baleCodes));
      }

      // 4. Update status to DRAFT
      await safeSupabaseCall(supabase.from('b2b_sales').update({ credit_status: 'DRAFT' }).or(`b2b_invoice_number.eq.${invoiceNo},id.eq.${invoiceId}`));
      await safeSupabaseCall(supabase.from('sales_invoices').update({ status: 'DRAFT' }).or(`invoice_no.eq.${invoiceNo},id.eq.${invoiceId}`));

      setStatus('DRAFT');
      showMsg(`Invoice ${targetNo} unposted and unlocked. Status is now DRAFT (editing & deletion enabled).`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Unpost error.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Draft Invoice (Locked if POSTED)
  const handleDeleteDraft = async () => {
    if (!invoiceId && !invoiceNo) {
      setIsInvoiceModalOpen(false);
      return;
    }
    if (status === 'POSTED') {
      window.alert(`Invoice ${invoiceNo || invoiceId} is POSTED and locked.\n\nPlease click "🔄 UNPOST INVOICE" first to unlock and reverse accounting entries before deleting.`);
      return;
    }
    const targetNo = invoiceNo || invoiceId;
    const confirmDel = window.confirm(`Delete DRAFT Invoice ${targetNo}? This cannot be undone.`);
    if (!confirmDel) return;

    try {
      const targetKey = invoiceId || invoiceNo;
      // 1. Backend deletion with complete SQL voucher cascade
      await fetch(`/api/sales/custom-b2b/${encodeURIComponent(targetKey)}`, {
        method: 'DELETE'
      }).catch(e => console.warn('Backend delete notice:', e));

      // 2. Cascade delete vouchers for this invoice via FinanceService
      await FinanceService.cascadeDeleteVouchersForDocument(invoiceNo).catch(e => console.warn('Voucher cleanup note:', e));

      // 3. Direct table cleanup
      await safeSupabaseCall(supabase.from('b2b_sales').delete().or(`id.eq.${invoiceId},b2b_invoice_number.eq.${invoiceNo}`));
      await safeSupabaseCall(supabase.from('sales_invoices').delete().or(`id.eq.${invoiceId},invoice_no.eq.${invoiceNo}`));

      // Restore piece barcodes back to IN_STOCK (not RESERVED)
      const pieceBarcodes = (items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await safeSupabaseCall(supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('barcode', pieceBarcodes));
      }

      // Update in-memory state immediately removing deleted invoice
      setInternalInvoices(prev => prev.filter(item => item.id !== invoiceId && item.invoiceNo !== targetNo));

      showMsg(`Draft invoice ${targetNo} deleted and inventory items restored to stock.`);
      setIsInvoiceModalOpen(false);
      refreshAllB2BData();
    } catch (err) {
      showMsg('Delete error', 'error');
    }
  };

  // Outer Table Level Actions (Post, Unpost, Delete)
  const handlePostFromTable = async (inv: SalesInvoice) => {
    const invNo = inv.invoiceNo;
    const invId = inv.id;
    const clientName = inv.customerName || 'Wholesale Client';
    const totalVal = Number(inv.totalAmount || inv.grandTotalAED || 0);

    if (inv.status === 'POSTED') {
      showMsg(`Invoice ${invNo} is already POSTED and locked.`, 'error');
      return;
    }

    const confirmPost = window.confirm(
      `POST & DISPATCH Invoice ${invNo} directly from table?\n\n` +
      `• Customer: ${clientName}\n` +
      `• Billable Total: AED ${totalVal.toFixed(2)}\n` +
      `• Deducts inventory & marks pieces SOLD\n` +
      `• Dispatches double-entry Journal Voucher to General Ledger\n` +
      `• Locks invoice against editing & deletion`
    );
    if (!confirmPost) return;

    try {
      const targetKey = invId || invNo;

      // Idempotency: Purge any pre-existing voucher for this document to prevent duplicate entries
      await FinanceService.cascadeDeleteVouchersForDocument(invNo).catch(() => {});

      // 1. Call backend post API
      const res = await fetch(`/api/sales/custom-b2b/${encodeURIComponent(targetKey)}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedBy: 'Sales Table Direct' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        if (!data?.error?.toLowerCase().includes('already posted')) {
          throw new Error(data.error || 'Failed to post invoice');
        }
      }

      // 2. Mark pieces as sold in Supabase
      const pieceBarcodes = (inv.items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await safeSupabaseCall(supabase.from('inventory_pieces').update({ is_sold: true, status: 'SOLD' }).in('barcode', pieceBarcodes));
      }
      const baleCodes = (inv.items || []).filter(i => i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (baleCodes.length > 0) {
        await safeSupabaseCall(supabase.from('raw_bales').update({ status: 'PROCESSED' }).in('bale_code', baleCodes));
        await safeSupabaseCall(supabase.from('inward_gate_passes').update({ status: 'SOLD_AS_BALE', sorting_status: 'FULLY_SORTED' }).in('bale_code', baleCodes));
      }

      // 3. Mark b2b_sales & sales_invoices POSTED
      await safeSupabaseCall(supabase.from('b2b_sales').update({ credit_status: 'POSTED' }).or(`b2b_invoice_number.eq.${invNo},id.eq.${invId}`));
      await safeSupabaseCall(supabase.from('sales_invoices').update({ status: 'POSTED' }).or(`invoice_no.eq.${invNo},id.eq.${invId}`));

      // 4. Update UI in-memory state immediately so row button flips to [🔓 Unpost]
      setInternalInvoices(prev => prev.map(item => {
        if (item.id === invId || item.invoiceNo === invNo) {
          return { ...item, status: 'POSTED' };
        }
        return item;
      }));

      showMsg(`Invoice ${invNo} successfully POSTED & DISPATCHED directly! Status is now locked.`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Post error.', 'error');
    }
  };

  const handleUnpostFromTable = async (inv: SalesInvoice) => {
    const invNo = inv.invoiceNo;
    const invId = inv.id;
    const confirmUnpost = window.confirm(
      `UNPOST Invoice ${invNo}?\n\n` +
      `• Restores all Raw Bales & Garment Pieces to stock\n` +
      `• Reverses General Ledger Journal Voucher & Ledgers\n` +
      `• Removes Customer Khata balance\n` +
      `• Unlocks invoice for editing or deletion`
    );
    if (!confirmUnpost) return;

    try {
      const targetKey = invId || invNo;
      await fetch(`/api/sales/custom-b2b/${encodeURIComponent(targetKey)}/unpost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(e => console.warn('Backend unpost notice:', e));

      await FinanceService.cascadeDeleteVouchersForDocument(invNo).catch(e => console.warn('Voucher reversal note:', e));

      const pieceBarcodes = (inv.items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await safeSupabaseCall(supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('barcode', pieceBarcodes));
      }
      const baleCodes = (inv.items || []).filter(i => i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (baleCodes.length > 0) {
        await safeSupabaseCall(supabase.from('raw_bales').update({ status: 'UNOPENED' }).in('bale_code', baleCodes));
        await safeSupabaseCall(supabase.from('inward_gate_passes').update({ status: 'AVAILABLE', sorting_status: 'UNOPENED' }).in('bale_code', baleCodes));
      }

      await safeSupabaseCall(supabase.from('b2b_sales').update({ credit_status: 'DRAFT' }).or(`b2b_invoice_number.eq.${invNo},id.eq.${invId}`));
      await safeSupabaseCall(supabase.from('sales_invoices').update({ status: 'DRAFT' }).or(`invoice_no.eq.${invNo},id.eq.${invId}`));

      // Update UI in-memory state immediately so row button flips to [Post] and [Delete] enabled
      setInternalInvoices(prev => prev.map(item => {
        if (item.id === invId || item.invoiceNo === invNo) {
          return { ...item, status: 'DRAFT' };
        }
        return item;
      }));

      showMsg(`Invoice ${invNo} successfully unposted and unlocked. Status is now DRAFT.`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Unpost error.', 'error');
    }
  };

  const handleDeleteFromTable = async (inv: SalesInvoice) => {
    const invNo = inv.invoiceNo;
    const invId = inv.id;

    if (inv.status === 'POSTED') {
      window.alert(`Invoice ${invNo} is POSTED and locked.\n\nPlease click "🔓 Unpost" first to unlock and reverse accounting entries before deleting.`);
      return;
    }

    const confirmDel = window.confirm(`Delete DRAFT Invoice ${invNo}? This cannot be undone.`);
    if (!confirmDel) return;

    try {
      const targetKey = invId || invNo;
      const res = await fetch(`/api/sales/custom-b2b/${encodeURIComponent(targetKey)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete invoice');
      }

      await FinanceService.cascadeDeleteVouchersForDocument(invNo).catch(e => console.warn('Voucher cleanup note:', e));

      await safeSupabaseCall(supabase.from('b2b_sales').delete().or(`id.eq.${invId},b2b_invoice_number.eq.${invNo}`));
      await safeSupabaseCall(supabase.from('sales_invoices').delete().or(`id.eq.${invId},invoice_no.eq.${invNo}`));

      const pieceBarcodes = (inv.items || []).filter(i => !i.isRawBale).map(i => i.barcode).filter(Boolean);
      if (pieceBarcodes.length > 0) {
        await safeSupabaseCall(supabase.from('inventory_pieces').update({ is_sold: false, status: 'IN_STOCK' }).in('barcode', pieceBarcodes));
      }

      // Update in-memory state immediately removing deleted invoice
      setInternalInvoices(prev => prev.filter(item => item.id !== invId && item.invoiceNo !== invNo));

      showMsg(`Draft invoice ${invNo} deleted and inventory items restored to stock.`);
      refreshAllB2BData();
    } catch (err: any) {
      showMsg(err?.message || 'Delete error.', 'error');
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
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">
                          {inv.customerName || inv.clientName || 'Corporate Client'}
                        </div>
                        {(() => {
                          const matchedClient = customerClients.find(c => c.id === (inv.customerId || inv.clientId) || c.name?.toLowerCase() === (inv.customerName || '').toLowerCase());
                          const coaCode = matchedClient?.coaAccountId || (matchedClient as any)?.coa_account_id;
                          return coaCode ? (
                            <div className="text-[10px] font-mono text-indigo-700 font-semibold flex items-center gap-1 mt-0.5">
                              <span>COA:</span> <span className="bg-indigo-50 px-1 rounded border border-indigo-200">{coaCode}</span>
                            </div>
                          ) : null;
                        })()}
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
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {inv.status === 'POSTED' ? (
                            <>
                              {/* 🔓 UNPOST BUTTON */}
                              <button
                                type="button"
                                onClick={() => handleUnpostFromTable(inv)}
                                className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-300 text-[11px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                                title="Unpost & Unlock Invoice (Reverses JV and restores items to stock)"
                              >
                                <span>🔓 Unpost</span>
                              </button>

                              {/* 👁️ VIEW BUTTON */}
                              <button
                                type="button"
                                onClick={() => handleOpenExistingInvoiceModal(inv)}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold transition border border-slate-300 cursor-pointer flex items-center gap-1"
                                title="View Invoice Details"
                              >
                                👁️ View
                              </button>

                              {/* 🖨️ PRINT BUTTON */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenExistingInvoiceModal(inv);
                                  setPrintModalType('TAX_INVOICE');
                                }}
                                title="Print Tax Invoice"
                                className="p-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5 text-teal-700" />
                              </button>

                              {/* DISABLED EDIT BUTTON (LOCKED) */}
                              <button
                                type="button"
                                disabled
                                className="px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200 text-[11px] font-semibold cursor-not-allowed opacity-50"
                                title="Locked: Invoice is POSTED. Unpost first to edit."
                              >
                                ✎ Edit
                              </button>

                              {/* DISABLED DELETE BUTTON (LOCKED) */}
                              <button
                                type="button"
                                disabled
                                className="p-1 rounded bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                                title="Locked: Invoice is POSTED. Unpost first to delete."
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* 🚀 POST BUTTON (DIRECT 1-CLICK FROM TABLE) */}
                              <button
                                type="button"
                                onClick={() => handlePostFromTable(inv)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition flex items-center gap-1 shadow-2xs cursor-pointer ring-1 ring-emerald-400/50"
                                title="Post & Lock Invoice Directly to General Ledger (Without Opening Modal)"
                              >
                                <span>🚀 Post</span>
                              </button>

                              {/* ✎ EDIT BUTTON */}
                              <button
                                type="button"
                                onClick={() => handleOpenExistingInvoiceModal(inv)}
                                className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold transition border border-indigo-200 cursor-pointer flex items-center gap-1"
                                title="Edit Draft Invoice"
                              >
                                ✎ Edit
                              </button>

                              {/* 🖨️ PRINT BUTTON */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenExistingInvoiceModal(inv);
                                  setPrintModalType('TAX_INVOICE');
                                }}
                                title="Print Proforma / Draft Invoice"
                                className="p-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5 text-teal-700" />
                              </button>

                              {/* 🗑️ DELETE BUTTON (ENABLED) */}
                              <button
                                type="button"
                                onClick={() => handleDeleteFromTable(inv)}
                                className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 border border-rose-200 transition cursor-pointer"
                                title="Delete Draft Invoice & Clear All Ledger Traces"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
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
              
              {/* POST LOCK ACTIVE WARNING & UNPOST TRIGGER */}
              {status === 'POSTED' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-amber-900 text-xs shadow-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <span className="font-black text-amber-950 uppercase tracking-wide">🔒 POST LOCK ACTIVE: </span>
                      This invoice is posted to the General Ledger and its inventory is dispatched. All editing and deletion are locked. To modify or delete this invoice, click <span className="font-bold underline">"Unpost & Unlock"</span>.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnpostInvoice}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                  >
                    {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>🔓 Unpost & Unlock</span>
                  </button>
                </div>
              )}

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
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        COA: {selectedCustomerCoaCode || '1130-00'}
                      </span>
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
                        {(customerClients || []).map(c => {
                          const coaCode = c.coaAccountId || (c as any).coa_account_id;
                          return (
                            <option key={c.id} value={c.id}>
                              {c.code ? `[${c.code}] ` : ''}{c.name} {coaCode ? `(COA: ${coaCode})` : ''} {c.trnNo ? `(TRN: ${c.trnNo})` : ''} — Bal: AED {Number(c.currentBalance || 0).toFixed(2)}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {selectedCustomer ? (
                      <div className="bg-[#FAF4E6]/60 rounded-lg p-3 border border-amber-200 text-xs space-y-2.5">
                        <div className="flex justify-between items-center text-slate-900 font-bold border-b border-amber-200/70 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-950">{selectedCustomer.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                              {selectedCustomer.code || 'B2B-CLIENT'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ACTIVE KHATA
                          </span>
                        </div>

                        {/* COA Link Sub-ledger Account Box */}
                        <div className="bg-white/90 rounded-lg p-2.5 border border-indigo-200 shadow-2xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                              General Ledger Sub-Account (COA):
                            </span>
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[11px]">
                              {selectedCustomerCoaCode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span className="text-slate-500 font-medium">Sub-Ledger Title:</span>
                            <span className="font-bold text-slate-800">
                              {selectedCustomerCoaAccount?.name || `${selectedCustomer.name} (Customer)`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-1">
                            <span>Parent Control Account:</span>
                            <span className="font-mono text-slate-600">1130-00 (Accounts Receivable - Trade Debtors)</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white/60 p-2 rounded border border-amber-200/50">
                          <div>
                            <span className="font-bold text-slate-500">TRN (UAE VAT): </span>
                            <span className="font-mono font-bold text-slate-800">{selectedCustomer.trnNo || 'Not Registered / Freezone'}</span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-500">Phone: </span>
                            <span className="font-mono text-slate-800">{selectedCustomer.phone || 'N/A'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-bold text-slate-500">Delivery Address: </span>
                            <span className="text-slate-800">{selectedCustomer.address || 'Industrial Area / Warehouse, UAE'}</span>
                          </div>
                          {selectedCustomer.contactPerson && (
                            <div className="col-span-2">
                              <span className="font-bold text-slate-500">Contact Person: </span>
                              <span className="text-slate-800">{selectedCustomer.contactPerson}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-500 font-bold">Live Khata Balance: </span>
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
                        Please select a company from Parties Khata to display TRN, COA ledger link, delivery address, and credit parameters.
                      </div>
                    )}

                    {/* Assigned Courier & Logistics Partner (کوریئر کمپنی / لاجسٹکس کھاتہ) */}
                    <div className="bg-[#FAF4E6]/40 rounded-xl p-3 border border-amber-300/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-950">
                          <Truck className="w-3.5 h-3.5 text-amber-700" />
                          <span>Assigned Courier / Logistics Partner (لاجسٹکس کھاتہ)</span>
                        </div>
                        {selectedCourierCoaCode && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            COA: {selectedCourierCoaCode}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Courier Company:</label>
                          <select
                            value={selectedCourierId}
                            onChange={e => setSelectedCourierId(e.target.value)}
                            disabled={status === 'POSTED'}
                            className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-amber-600 transition"
                          >
                            <option value="">-- No Courier (Direct Customer Pickup) --</option>
                            {(courierParties || []).map(cp => {
                              const coaCode = cp.coaAccountId || (cp as any).coa_account_id;
                              return (
                                <option key={cp.id} value={cp.id}>
                                  {cp.code ? `[${cp.code}] ` : ''}{cp.name} {coaCode ? `(COA: ${coaCode})` : ''} {cp.phone ? `— ${cp.phone}` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Waybill / Tracking / Consignment #:</label>
                          <input
                            type="text"
                            placeholder="e.g. AWB-982348102"
                            value={waybillNo}
                            onChange={e => setWaybillNo(e.target.value)}
                            disabled={status === 'POSTED'}
                            className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                          />
                        </div>
                      </div>

                      {selectedCourier ? (
                        <div className="bg-white/95 rounded-lg p-2.5 border border-amber-300/80 shadow-2xs space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-amber-700" />
                              Courier Payable Ledger (COA):
                            </span>
                            <span className="font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                              {selectedCourierCoaCode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span className="text-slate-500 font-medium">Transporter Khata:</span>
                            <span className="font-bold text-slate-900">{selectedCourier.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-1">
                            <span>Parent Control Account:</span>
                            <span className="font-mono text-slate-600">2120-00 (Accounts Payable - Courier & Freight)</span>
                          </div>
                          {otherChargesTotal > 0 && (
                            <div className="flex items-center justify-between text-[11px] font-bold bg-amber-50/80 p-1.5 rounded border border-amber-200 text-amber-950">
                              <span>Freight Credited to Courier Khata:</span>
                              <span className="font-mono text-emerald-700">AED {otherChargesTotal.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 italic bg-amber-50/40 p-1.5 rounded border border-dashed border-amber-200">
                          ℹ️ Agar koi courier select nahi hoga to delivery charges general account <strong>4110-04 (Delivery & Shipping Charges Collected)</strong> par credit honge.
                        </div>
                      )}
                    </div>

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
                            {(items || []).map((item) => {
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
                        {(otherCharges || []).map(charge => (
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-300 w-full max-w-3xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-3.5 bg-[#FAF4E6] border-b border-amber-200 text-slate-900 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Bulk Quick Bales Selector ({availableBales.length} Available in Warehouse)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-2 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print-container print:bg-white print:p-0">
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
                  onClick={handlePrintDocument}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalType(null)}
                  className="p-2 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                  title="Close Document"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-slate-900 font-sans space-y-4 print:p-0">
              {printModalType === 'TAX_INVOICE' ? (
                /* OFFICIAL TAX INVOICE */
                <div className="border border-slate-300 rounded p-6 space-y-4 text-xs">
                  <div className="flex justify-between items-start border-b-2 border-amber-600 pb-3 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0" dangerouslySetInnerHTML={{ __html: VINTAGE_VIBES_MONOGRAM_SVG }} />
                      <div>
                        <h1 className="text-base font-black text-amber-950 tracking-wide font-serif">
                          VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
                        </h1>
                        <p className="text-[10px] text-slate-600">Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE</p>
                        <p className="text-[10px] font-mono font-bold text-slate-800">
                          Dubai Economy & Tourism Lic: 1049281 &bull; Customs: AE-9281048
                        </p>
                        <p className="text-[10px] text-slate-600">
                          UAE TRN: <span className="font-mono font-bold text-slate-900">100482910300003</span> &bull; Tel: +971 55 418 6086
                        </p>
                      </div>
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
                      {selectedCustomerCoaCode && (
                        <div className="text-[10px] font-mono text-indigo-800 font-semibold mt-0.5">COA Khata Sub-Ledger: {selectedCustomerCoaCode}</div>
                      )}
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
                      {(items || []).map((it, i) => {
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
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Bank Details for Wire Transfer:</span>
                      </div>
                      <div>Bank: <strong>{primaryBank?.bankName || companyProfile?.bankName || 'RAKBANK'}</strong> {primaryBank?.branchName ? `(${primaryBank.branchName} Branch)` : ''}</div>
                      <div>Account Name: {primaryBank?.accountTitle || companyProfile?.bankAccountTitle || companyProfile?.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C-S.P.C'}</div>
                      <div className="font-mono font-bold text-slate-900">IBAN: {primaryBank?.iban || companyProfile?.bankIban || 'AE76 0400 0001 4365 6279 001'}</div>
                      {primaryBank?.swiftBic && <div className="font-mono">SWIFT: {primaryBank.swiftBic}</div>}
                      {primaryBank?.accountNumber && <div className="font-mono text-[10px]">Account No: {primaryBank.accountNumber}</div>}
                      <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>COA Asset Link: {primaryBank?.coaAccountCode || companyProfile?.bankAccountCode || '1120-02'}</span>
                      </div>
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
                  <div className="flex justify-between items-start border-b-2 border-teal-700 pb-3 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0" dangerouslySetInnerHTML={{ __html: VINTAGE_VIBES_MONOGRAM_SVG }} />
                      <div>
                        <h1 className="text-base font-black text-slate-950 tracking-wide font-serif">
                          VINTAGE VIBES LOGISTICS & WAREHOUSE
                        </h1>
                        <p className="text-[10px] text-slate-600">Outward Cargo Dispatch & Freight Terminal</p>
                        <p className="text-[10px] text-slate-600">Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE</p>
                      </div>
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
                      {(items || []).map((it, idx) => (
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

            {/* Modal Bottom Bar (Screen only) */}
            <div className="p-3.5 bg-[#FAF4E6] border-t border-amber-200 flex items-center justify-between rounded-b-xl print:hidden flex-wrap gap-2">
              <span className="text-xs text-slate-600 font-mono">
                {invoiceNo || 'DRAFT-INVOICE'} • {printModalType === 'TAX_INVOICE' ? 'Tax Invoice' : 'Packing List'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalType(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer transition-colors"
                >
                  Close Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

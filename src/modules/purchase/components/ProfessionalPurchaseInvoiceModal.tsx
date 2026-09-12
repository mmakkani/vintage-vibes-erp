import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient.ts';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster } from '../../setup/setup.types.ts';
import { PurchaseInvoice, PurchaseInvoiceItem } from '../purchase.types.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { CameraInvoiceScannerOverlay } from './CameraInvoiceScannerOverlay.tsx';
import { useFormAutoSave } from '../../../hooks/useFormAutoSave.ts';
import { AutoSaveDraftBanner, AutoSaveIndicator } from '../../../components/AutoSaveNotice.tsx';
import {
  X,
  Plus,
  Trash2,
  Truck,
  Ship,
  FileText,
  Calculator,
  CheckCircle2,
  Layers,
  Scale,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Camera
} from 'lucide-react';
import { SearchableSelect } from '../../../components/SearchableSelect.tsx';

import { PackagingUOM } from '../../../types/common.types.ts';

interface ProfessionalPurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items?: ItemMaster[];
  balePresets?: any[];
  initialScannedData?: any;
  editingInvoice?: PurchaseInvoice | null;
  onSuccess: (invoice: PurchaseInvoice, autoConvertToInward?: boolean) => void;
}

export interface InvoiceLineDraft {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  packagingUom: PackagingUOM;
  packageCount: number;
  totalWeight: number;
  rateType: 'PER_KG' | 'PER_UNIT';
  ratePerWeight: number;
  lineTotal: number;
}

export const ProfessionalPurchaseInvoiceModal: React.FC<ProfessionalPurchaseInvoiceModalProps> = ({
  isOpen,
  onClose,
  parties,
  items = [],
  balePresets: balePresetsProp,
  initialScannedData,
  editingInvoice,
  onSuccess
}) => {
  const suppliers = parties.filter(p => p.type === 'SUPPLIER');

  // Dynamic Bale Presets fetched from public.bale_presets (Purchase Factory Settings Master Catalog)
  const [balePresets, setBalePresets] = useState<any[]>(() => {
    if (Array.isArray(balePresetsProp) && balePresetsProp.length > 0) return balePresetsProp;
    try {
      const cached = localStorage.getItem('vintage_bale_presets_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    if (Array.isArray(balePresetsProp) && balePresetsProp.length > 0) {
      setBalePresets(balePresetsProp);
    }
  }, [balePresetsProp]);

  useEffect(() => {
    const loadBalePresets = async () => {
      try {
        const data = await PurchaseService.getBalePresets();
        if (Array.isArray(data) && data.length > 0) {
          setBalePresets(data);
        }
      } catch (err) {
        console.error('Error loading bale presets in ProfessionalPurchaseInvoiceModal:', err);
      }
    };
    if (isOpen) {
      loadBalePresets();
    }
  }, [isOpen]);

  // Master catalog for Commercial Invoices: strictly sourced from Purchase Settings (`bale_presets`)
  const allAvailableItems = useMemo(() => {
    const list: Array<{
      id: string;
      code: string;
      name: string;
      category?: string;
      uom?: PackagingUOM;
      stdWeight?: number;
      baseRate?: number;
    }> = [];

    // 1. Primary & Authoritative Source: Presets registered in Purchase Settings (`bale_presets`)
    if (Array.isArray(balePresets) && balePresets.length > 0) {
      balePresets.forEach(p => {
        list.push({
          id: p.id || p.item_code,
          code: p.item_code || p.code || 'BALE-PRESET',
          name: p.name,
          category: p.category,
          uom: (p.uom as PackagingUOM) || 'BALES',
          stdWeight: Number(p.std_weight ?? p.stdWeight ?? p.weightKg) || 45,
          baseRate: Number(p.base_rate ?? p.baseRate ?? p.basePrice) || 0
        });
      });
      return list;
    }

    // 2. Fallback only if no bale_presets have been added in settings yet
    if (Array.isArray(items) && items.length > 0) {
      items.forEach(it => {
        list.push({
          id: it.id,
          code: it.code || 'ITM',
          name: it.name,
          category: it.category,
          uom: (it.uom as PackagingUOM) || 'BALES',
          stdWeight: Number(it.weightKg) || 45,
          baseRate: Number(it.basePrice) || 0
        });
      });
    }

    return list;
  }, [balePresets, items]);

  // Scanner modal state
  const [showScannerModal, setShowScannerModal] = useState(false);

  // Document Info
  const [invoiceNo, setInvoiceNo] = useState(`PUR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [currency, setCurrency] = useState<'AED' | 'USD' | 'EUR' | 'GBP'>('AED');
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [paymentTerms, setPaymentTerms] = useState('30_DAYS_CREDIT');
  const [applyVat, setApplyVat] = useState<boolean>(true);

  // Logistics & Customs
  const [containerNo, setContainerNo] = useState('');
  const [blAirwayBillNo, setBlAirwayBillNo] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [portOfEntry, setPortOfEntry] = useState('Jebel Ali Port (AEJEA), Dubai');

  // Landed Cost & Taxes
  const [freightAmount, setFreightAmount] = useState<number>(0);
  const [customsDutyAmount, setCustomsDutyAmount] = useState<number>(0);
  const [terminalHandlingAmount, setTerminalHandlingAmount] = useState<number>(0);
  const [vatRatePercent, setVatRatePercent] = useState<number>(5);
  const [notes, setNotes] = useState('');

  const handleApplyScannedData = (data: any) => {
    if (data.invoiceNo) setInvoiceNo(data.invoiceNo);
    if (data.date) setInvoiceDate(data.date);
    if (data.containerNo) setContainerNo(data.containerNo);
    if (data.blAirwayBillNo) setBlAirwayBillNo(data.blAirwayBillNo);
    if (data.currency) setCurrency(data.currency as any);
    if (data.freightAmount) setFreightAmount(data.freightAmount);
    if (data.customsDutyAmount) setCustomsDutyAmount(data.customsDutyAmount);
    if (data.terminalHandlingAmount) setTerminalHandlingAmount(data.terminalHandlingAmount);
    if (data.notes) setNotes(data.notes);

    if (data.supplierName) {
      const match = suppliers.find(s =>
        s.name.toLowerCase().includes(data.supplierName.toLowerCase()) ||
        data.supplierName.toLowerCase().includes(s.name.toLowerCase())
      );
      if (match) {
        setSupplierId(match.id);
      }
    }

    if (data.items && data.items.length > 0) {
      const mapped: InvoiceLineDraft[] = data.items.map((it: any, idx: number) => {
        const matchedItem = items[idx % (items.length || 1)] || {
          id: `itm-${idx}`,
          code: `ITM-00${idx + 1}`,
          name: it.itemDescription || it.itemName
        };
        const count = Number(it.baleCount || it.packageCount) || 1;
        const weight = Number(it.weightKg || it.totalWeight) || (count * 45);
        const rate = Number(it.ratePerKg || it.ratePerWeight) || 0;
        return {
          id: `line-scan-${idx}-${Date.now()}`,
          itemId: matchedItem.id,
          itemCode: matchedItem.code,
          itemName: it.itemDescription || it.itemName || matchedItem.name,
          packagingUom: ((it.packagingUom === 'BALE' ? 'BALES' : it.packagingUom) || 'BALES') as PackagingUOM,
          packageCount: count,
          totalWeight: weight,
          rateType: 'PER_KG' as const,
          ratePerWeight: rate,
          lineTotal: Number((it.amount || it.lineTotal || (weight * rate)).toFixed(2))
        };
      });
      setLines(mapped);
    }
  };

  useEffect(() => {
    if (initialScannedData) {
      handleApplyScannedData(initialScannedData);
    }
  }, [initialScannedData]);

  // Prefill when in EDIT mode
  useEffect(() => {
    if (editingInvoice) {
      setInvoiceNo(editingInvoice.invoiceNo);
      setSupplierId(editingInvoice.supplierId || '');
      setInvoiceDate(editingInvoice.date || new Date().toISOString().slice(0, 10));
      if (editingInvoice.dueDate) setDueDate(editingInvoice.dueDate);
      if (editingInvoice.currency) setCurrency(editingInvoice.currency as any);
      if (editingInvoice.exchangeRate) setExchangeRate(editingInvoice.exchangeRate);
      setApplyVat(editingInvoice.applyVat !== false);
      if (editingInvoice.vatRatePercent !== undefined) setVatRatePercent(editingInvoice.vatRatePercent);
      setFreightAmount(editingInvoice.freightAmount || 0);
      setCustomsDutyAmount(editingInvoice.customsDutyAmount || 0);
      setTerminalHandlingAmount(editingInvoice.terminalHandlingAmount || 0);
      setContainerNo(editingInvoice.containerNo || '');
      setBlAirwayBillNo(editingInvoice.blAirwayBillNo || '');
      setPortOfEntry(editingInvoice.portOfEntry || 'Jebel Ali Port (AEJEA), Dubai');
      setNotes(editingInvoice.notes || '');

      if (editingInvoice.items && editingInvoice.items.length > 0) {
        setLines(
          editingInvoice.items.map((it, idx) => ({
            id: it.id || `line-${idx}`,
            itemId: it.itemId || '',
            itemCode: it.itemCode || '',
            itemName: it.itemName || '',
            packagingUom: it.packagingUom || 'BALES',
            packageCount: Number(it.packageCount) || 1,
            totalWeight: Number(it.totalWeight) || 0,
            rateType: 'PER_KG',
            ratePerWeight: Number(it.ratePerWeight) || 0,
            lineTotal: Number(it.lineTotal) || 0
          }))
        );
      }
    }
  }, [editingInvoice]);

  // Clean initial line item ready for user input
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => {
    const firstItem = allAvailableItems[0] || (Array.isArray(items) ? items[0] : null);
    const stdW = (firstItem as any)?.stdWeight || (firstItem as any)?.weightKg || 45;
    const rate = (firstItem as any)?.baseRate || (firstItem as any)?.basePrice || 0;
    return [
      {
        id: 'line-1',
        itemId: firstItem?.id || '',
        itemCode: firstItem?.code || '',
        itemName: firstItem?.name || '',
        packagingUom: (firstItem as any)?.uom || 'BALES',
        packageCount: 1,
        totalWeight: stdW,
        rateType: 'PER_KG',
        ratePerWeight: rate,
        lineTotal: Number((stdW * rate).toFixed(2))
      }
    ];
  });

  // Automatically populate initial line when presets load or if line has invalid/empty item
  useEffect(() => {
    if (allAvailableItems.length > 0 && lines.length > 0) {
      setLines(prev => {
        let hasChanges = false;
        const updated = prev.map(l => {
          const isValidMatch = allAvailableItems.some(it => it.id === l.itemId);
          if (!l.itemId || !isValidMatch) {
            hasChanges = true;
            // Match by code or name if restored from old draft, or default to first preset
            const match = allAvailableItems.find(
              it => (l.itemCode && it.code.toLowerCase() === l.itemCode.toLowerCase()) ||
                    (l.itemName && it.name.toLowerCase() === l.itemName.toLowerCase())
            ) || allAvailableItems[0];

            const count = Number(l.packageCount) || 1;
            const stdW = match.stdWeight || 45;
            const weight = (l.totalWeight && l.totalWeight > 0) ? l.totalWeight : (count * stdW);
            const rate = (l.ratePerWeight !== undefined && l.ratePerWeight > 0) ? l.ratePerWeight : (match.baseRate || 0);

            return {
              ...l,
              itemId: match.id,
              itemCode: match.code,
              itemName: match.name,
              packagingUom: match.uom || l.packagingUom || 'BALES',
              packageCount: count,
              totalWeight: weight,
              ratePerWeight: rate,
              lineTotal: Number((weight * rate).toFixed(2))
            };
          }
          return l;
        });
        return hasChanges ? updated : prev;
      });
    }
  }, [allAvailableItems]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-save form payload structure
  const currentFormData = {
    invoiceNo,
    supplierId,
    invoiceDate,
    dueDate,
    currency,
    exchangeRate,
    paymentTerms,
    applyVat,
    containerNo,
    blAirwayBillNo,
    vesselName,
    portOfEntry,
    freightAmount,
    customsDutyAmount,
    terminalHandlingAmount,
    vatRatePercent,
    notes,
    lines
  };

  const {
    hasSavedDraft,
    lastSavedTime,
    isAutoSaved,
    restoreDraft,
    discardDraft,
    clearDraft
  } = useFormAutoSave({
    key: 'vibe_autosave_purchase_invoice',
    formData: currentFormData,
    onRestore: (saved: any) => {
      if (saved.invoiceNo) setInvoiceNo(saved.invoiceNo);
      if (saved.supplierId) setSupplierId(saved.supplierId);
      if (saved.invoiceDate) setInvoiceDate(saved.invoiceDate);
      if (saved.dueDate) setDueDate(saved.dueDate);
      if (saved.currency) setCurrency(saved.currency);
      if (saved.exchangeRate !== undefined) setExchangeRate(saved.exchangeRate);
      if (saved.paymentTerms) setPaymentTerms(saved.paymentTerms);
      if (saved.applyVat !== undefined) setApplyVat(Boolean(saved.applyVat));
      if (saved.containerNo) setContainerNo(saved.containerNo);
      if (saved.blAirwayBillNo) setBlAirwayBillNo(saved.blAirwayBillNo);
      if (saved.vesselName) setVesselName(saved.vesselName);
      if (saved.portOfEntry) setPortOfEntry(saved.portOfEntry);
      if (saved.freightAmount !== undefined) setFreightAmount(saved.freightAmount);
      if (saved.customsDutyAmount !== undefined) setCustomsDutyAmount(saved.customsDutyAmount);
      if (saved.terminalHandlingAmount !== undefined) setTerminalHandlingAmount(saved.terminalHandlingAmount);
      if (saved.vatRatePercent !== undefined) setVatRatePercent(saved.vatRatePercent);
      if (saved.notes) setNotes(saved.notes);
      if (saved.lines && saved.lines.length > 0) {
        const reconciled = saved.lines.map((l: any) => {
          const match = allAvailableItems.find(it => it.id === l.itemId) ||
            allAvailableItems.find(it => (l.itemCode && it.code.toLowerCase() === l.itemCode.toLowerCase()) || (l.itemName && it.name.toLowerCase() === l.itemName.toLowerCase())) ||
            allAvailableItems[0];
          if (match) {
            const count = Number(l.packageCount) || 1;
            const stdW = match.stdWeight || 45;
            const weight = Number(l.totalWeight) || (count * stdW);
            const rate = (l.ratePerWeight !== undefined && l.ratePerWeight > 0) ? Number(l.ratePerWeight) : (match.baseRate || 0);
            return {
              ...l,
              itemId: match.id,
              itemCode: match.code,
              itemName: match.name,
              packagingUom: match.uom || l.packagingUom || 'BALES',
              packageCount: count,
              totalWeight: weight,
              ratePerWeight: rate,
              lineTotal: Number(l.lineTotal) || Number((weight * rate).toFixed(2))
            };
          }
          return l;
        });
        setLines(reconciled);
      }
    }
  });

  // Sync supplier default
  useEffect(() => {
    if (suppliers.length > 0 && !supplierId) {
      setSupplierId(suppliers[0].id);
    }
  }, [suppliers, supplierId]);

  // Adjust exchange rate when currency changes
  useEffect(() => {
    if (currency === 'AED') setExchangeRate(1.0);
    else if (currency === 'USD') setExchangeRate(3.6725);
    else if (currency === 'EUR') setExchangeRate(4.015);
    else if (currency === 'GBP') setExchangeRate(4.72);
  }, [currency]);

  // Selected supplier details
  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  // Calculations
  const totalBalesCount = lines.reduce((sum, l) => sum + (Number(l.packageCount) || 0), 0);
  const totalGrossWeightKg = lines.reduce((sum, l) => sum + (Number(l.totalWeight) || 0), 0);
  const itemsSubTotal = lines.reduce((sum, l) => sum + (Number(l.lineTotal) || 0), 0);

  // Taxable Base = items subtotal + freight + terminal handling
  const taxableBase = itemsSubTotal + freightAmount + terminalHandlingAmount;
  // Apply VAT: if checked, calculate 5% (or vatRatePercent); if unchecked, 0.00 without calculate
  const vatAmount = applyVat ? Number(((taxableBase * vatRatePercent) / 100).toFixed(2)) : 0;
  const grandTotal = Number((itemsSubTotal + freightAmount + customsDutyAmount + terminalHandlingAmount + vatAmount).toFixed(2));
  const grandTotalAed = currency === 'AED' ? grandTotal : Number((grandTotal * exchangeRate).toFixed(2));

  // Line item handlers
  const handleLineChange = (index: number, field: keyof InvoiceLineDraft, value: any) => {
    setLines(prev => {
      const updated = [...prev];
      const line = { ...updated[index], [field]: value };

      if (field === 'itemId') {
        const matchedItem = allAvailableItems.find(i => i.id === value || i.code === value);
        if (matchedItem) {
          line.itemId = matchedItem.id;
          line.itemCode = matchedItem.code;
          line.itemName = matchedItem.name;
          if (matchedItem.uom) line.packagingUom = matchedItem.uom;
          const stdW = matchedItem.stdWeight || 45;
          const count = Number(line.packageCount) || 1;
          line.totalWeight = count * stdW;
          if (matchedItem.baseRate !== undefined) {
            line.ratePerWeight = matchedItem.baseRate;
          }
        }
      }

      // Recompute total Weight or Line total
      const count = Number(line.packageCount) || 0;
      const weight = Number(line.totalWeight) || 0;
      const rate = Number(line.ratePerWeight) || 0;

      if (line.rateType === 'PER_KG') {
        line.lineTotal = Number((weight * rate).toFixed(2));
      } else {
        line.lineTotal = Number((count * rate).toFixed(2));
      }

      updated[index] = line;
      return updated;
    });
  };

  const handleAddLine = () => {
    const defaultItem = allAvailableItems[lines.length % (allAvailableItems.length || 1)] || {
      id: `itm-${Date.now()}`,
      code: 'BALE-CUSTOM',
      name: 'Sorted Vintage Apparel Bales',
      uom: 'BALES' as PackagingUOM,
      stdWeight: 45,
      baseRate: 0
    };
    const count = 1;
    const stdW = defaultItem.stdWeight || 45;
    const rate = defaultItem.baseRate || 0;
    const newLine: InvoiceLineDraft = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      itemId: defaultItem.id,
      itemCode: defaultItem.code,
      itemName: defaultItem.name,
      packagingUom: defaultItem.uom || 'BALES',
      packageCount: count,
      totalWeight: count * stdW,
      rateType: 'PER_KG',
      ratePerWeight: rate,
      lineTotal: Number((count * stdW * rate).toFixed(2))
    };
    setLines(prev => [...prev, newLine]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  // Load Preset
  // Auto calculate 5% Customs Duty based on CIF (Items + Freight)
  const handleAutoCalcCustoms = () => {
    const cifValue = itemsSubTotal + freightAmount;
    const duty = Number(((cifValue * 5) / 100).toFixed(2));
    setCustomsDutyAmount(duty);
  };

  // Submission handler
  const handleSubmit = async (submitStatus: 'DRAFT' | 'POSTED', autoConvertToInward: boolean = false) => {
    if (!supplierId) {
      setErrorMsg('Please select a supplier');
      return;
    }
    if (lines.length === 0) {
      setErrorMsg('Please enter at least one bale line item');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      invoiceNo,
      supplierId,
      supplierName: selectedSupplier?.name || '',
      supplierTrn: selectedSupplier?.trnNo || '',
      date: invoiceDate,
      dueDate,
      status: editingInvoice ? (editingInvoice.status || submitStatus) : submitStatus,
      currency,
      exchangeRate,
      subTotal: itemsSubTotal,
      applyVat,
      freightAmount,
      customsDutyAmount,
      terminalHandlingAmount,
      vatRatePercent: applyVat ? vatRatePercent : 0,
      vatAmount,
      totalAmount: grandTotal,
      grandTotalAed,
      notes: notes ? `${notes} | Terms: ${paymentTerms.replace(/_/g, ' ')}` : `Terms: ${paymentTerms.replace(/_/g, ' ')}`,
      containerNo,
      blAirwayBillNo,
      portOfEntry,
      vesselName,
      totalBalesCount,
      totalGrossWeightKg,
      items: lines.map(l => ({
        id: l.id,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        packagingUom: l.packagingUom,
        packageCount: Number(l.packageCount),
        weightUom: 'KG',
        totalWeight: Number(l.totalWeight),
        ratePerWeight: Number(l.ratePerWeight),
        lineTotal: Number(l.lineTotal)
      })) as PurchaseInvoiceItem[]
    };

    try {
      const targetInvoiceId = String(editingInvoice?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (`pi-${Date.now()}`)));
      const cleanSupplierId = String(supplierId || '');

      let invoicePayload: any = {
        id: targetInvoiceId,
        invoice_no: invoiceNo,
        invoiceNo,
        supplier_id: cleanSupplierId,
        supplierId: cleanSupplierId,
        supplier_name: selectedSupplier?.name || '',
        supplierName: selectedSupplier?.name || '',
        party_name: selectedSupplier?.name || '',
        invoice_date: invoiceDate,
        date: invoiceDate,
        status: editingInvoice ? (editingInvoice.status || submitStatus) : submitStatus,
        currency,
        exchange_rate: exchangeRate,
        exchangeRate,
        subtotal: itemsSubTotal,
        subTotal: itemsSubTotal,
        tax_amount: vatAmount,
        vatAmount,
        total_amount: grandTotal,
        totalAmount: grandTotal,
        total_weight_kg: totalGrossWeightKg,
        totalWeightKg: totalGrossWeightKg,
        container_no: containerNo || '',
        bl_no: blAirwayBillNo || '',
        vessel_name: vesselName || null,
        port_of_arrival: portOfEntry || null,
        notes: notes ? `${notes} | Terms: ${paymentTerms.replace(/_/g, ' ')}` : `Terms: ${paymentTerms.replace(/_/g, ' ')}`
      };

      let { data, error } = await (editingInvoice
        ? supabase.from('purchase_invoices').update(invoicePayload).eq('id', targetInvoiceId).select()
        : supabase.from('purchase_invoices').insert([invoicePayload]).select()
      );

      // If schema uses snake_case column names instead of camelCase, auto-retry with snake_case
      if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
        const snakePayload: any = {
          id: targetInvoiceId,
          invoice_no: invoiceNo,
          supplier_id: cleanSupplierId,
          supplier_name: selectedSupplier?.name || '',
          party_name: selectedSupplier?.name || '',
          container_no: containerNo || '',
          bl_no: blAirwayBillNo || '',
          invoice_date: invoiceDate,
          status: editingInvoice ? (editingInvoice.status || submitStatus) : submitStatus,
          currency,
          exchange_rate: exchangeRate,
          subtotal: itemsSubTotal,
          tax_amount: vatAmount,
          total_amount: grandTotal,
          total_weight_kg: totalGrossWeightKg,
          notes: notes ? `${notes} | Terms: ${paymentTerms.replace(/_/g, ' ')}` : `Terms: ${paymentTerms.replace(/_/g, ' ')}`
        };
        const retryResult = await (editingInvoice
          ? supabase.from('purchase_invoices').update(snakePayload).eq('id', targetInvoiceId).select()
          : supabase.from('purchase_invoices').insert([snakePayload]).select()
        );
        if (!retryResult.error) {
          data = retryResult.data;
          error = null;
        } else {
          error = retryResult.error;
        }
      }

      if (error) {
        console.error("SUPABASE ERROR:", error);
        alert("DATABASE REJECTION:\nCode: " + error.code + "\nMessage: " + error.message + "\nDetails: " + (error.details || error.hint || 'None'));
        setErrorMsg(`Database Rejection: ${error.message} (${error.code})`);
        setIsSubmitting(false);
        return;
      }

      // Safe cascading insert for purchase_invoice_items
      if (lines && lines.length > 0) {
        const itemsRows = lines.map((l) => ({
          invoice_id: targetInvoiceId,
          item_code: l.itemCode ? String(l.itemCode) : null,
          description: String(l.itemName || 'Vintage Mix Bales'),
          item_name: String(l.itemName || 'Vintage Mix Bales'),
          packaging: String(l.packagingUom || 'BALES'),
          packaging_uom: String(l.packagingUom || 'BALES'),
          quantity: Number(l.packageCount || 1),
          package_count: Number(l.packageCount || 1),
          total_kg: Number(l.totalWeight || 0),
          total_weight: Number(l.totalWeight || 0),
          rate_basis: l.rateType || 'PER_KG',
          rate: Number(l.ratePerWeight || 0),
          rate_per_weight: Number(l.ratePerWeight || 0),
          line_total: Number(l.lineTotal || 0)
        }));
        try {
          if (editingInvoice) {
            await supabase.from('purchase_invoice_items').delete().eq('invoice_id', targetInvoiceId);
          }
          const { error: insertItemsErr } = await supabase.from('purchase_invoice_items').insert(itemsRows);
          if (insertItemsErr) {
            console.error('Error inserting purchase_invoice_items:', insertItemsErr);
          }
        } catch (itemsEx) {
          console.warn('Notice on purchase_invoice_items insert:', itemsEx);
        }
      }

      if (autoConvertToInward) {
        try {
          await PurchaseService.convertToInwardGatePass(targetInvoiceId);
        } catch (convErr) {
          console.warn('Notice on auto convert to inward:', convErr);
        }
      } else if (submitStatus === 'POSTED') {
        try {
          await PurchaseService.postPurchaseInvoice(targetInvoiceId);
        } catch (postErr) {
          console.warn('Notice on auto post invoice:', postErr);
        }
      }

      const savedRow = data?.[0];
      const savedInvoice: PurchaseInvoice = {
        id: savedRow?.id || targetInvoiceId,
        invoiceNo: savedRow?.invoiceNo || savedRow?.invoice_no || invoiceNo,
        supplierId: savedRow?.supplierId || savedRow?.supplier_id || supplierId,
        supplierName: selectedSupplier?.name || '',
        supplierTrn: selectedSupplier?.trnNo || '',
        date: invoiceDate,
        dueDate,
        status: editingInvoice ? (editingInvoice.status || submitStatus) : submitStatus,
        currency,
        exchangeRate,
        subTotal: itemsSubTotal,
        applyVat,
        freightAmount,
        customsDutyAmount,
        terminalHandlingAmount,
        vatRatePercent: applyVat ? vatRatePercent : 0,
        vatAmount,
        totalAmount: grandTotal,
        grandTotalAed,
        notes: notes ? `${notes} | Terms: ${paymentTerms.replace(/_/g, ' ')}` : `Terms: ${paymentTerms.replace(/_/g, ' ')}`,
        containerNo,
        blAirwayBillNo,
        portOfEntry,
        vesselName,
        totalBalesCount,
        totalGrossWeightKg,
        items: lines.map(l => ({
          id: l.id,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          packagingUom: l.packagingUom,
          packageCount: Number(l.packageCount),
          weightUom: 'KG',
          totalWeight: Number(l.totalWeight),
          ratePerWeight: Number(l.ratePerWeight),
          lineTotal: Number(l.lineTotal)
        })) as PurchaseInvoiceItem[]
      };

      // Non-blocking sync to server API route if available
      try {
        fetch(editingInvoice ? `/api/purchase/invoices/${editingInvoice.id}` : '/api/purchase/invoices', {
          method: editingInvoice ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savedInvoice)
        }).catch(() => {});
      } catch (_) {}

      clearDraft();
      onSuccess(savedInvoice, autoConvertToInward);
      onClose();
    } catch (err: any) {
      console.error("Purchase invoice save unexpected error:", err);
      alert("UNEXPECTED ERROR:\n" + (err?.message || err));
      setErrorMsg(err.message || 'Error saving purchase invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-6xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-amber-500/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm uppercase tracking-wider text-white">
                  {editingInvoice ? `Edit Commercial Invoice: ${editingInvoice.invoiceNo}` : 'Commercial Purchase Invoice Entry Voucher'}
                </h3>
                <span className="font-arabic text-amber-300 text-xs">(فاتورة مشتريات بضاعة)</span>
                {editingInvoice && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-300 text-[10px] font-mono font-bold uppercase border border-amber-400/40">
                    Editing Mode
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold uppercase border border-emerald-400/40">
                  UAE FTA VAT Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Official high-density procurement entry with container manifests, landed freight, customs duty & bale itemization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowScannerModal(true)}
              className="btn-3d btn-3d-amber text-[10px] py-1.5 px-3 cursor-pointer flex items-center gap-1.5 font-bold mr-1"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
              <span>Camera AI OCR Scan</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ERROR ALERT */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* AUTO-SAVE RESTORATION BANNER */}
          {hasSavedDraft && (
            <AutoSaveDraftBanner
              lastSavedTime={lastSavedTime}
              onRestore={restoreDraft}
              onDiscard={discardDraft}
              title="Unsubmitted Purchase Invoice Draft Recovered"
              description="We restored your temporarily entered container logistics, line items, and landed costs from localStorage to prevent accidental navigation loss."
            />
          )}

          {/* SECTION 1: HEADER & SUPPLIER KHATA */}
          <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2.5 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-blue-700" />
              <span>1. Supplier Khata & Commercial Billing Reference</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Supplier / Shipper: <span className="text-red-600">*</span>
                </label>
                <SearchableSelect
                  value={supplierId}
                  onChange={val => setSupplierId(val)}
                  options={suppliers.map(s => ({
                    value: s.id,
                    label: `${s.name} (${s.code})`,
                    badge: 'SUPPLIER',
                    sublabel: s.trnNo ? `TRN: ${s.trnNo}` : undefined
                  }))}
                  placeholder="Select Supplier / Shipper..."
                  searchPlaceholder="Search supplier name or code..."
                  className="w-full bg-white text-xs font-medium"
                />
                {selectedSupplier && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Balance: <strong className={selectedSupplier.currentBalance < 0 ? 'text-red-700' : 'text-emerald-700'}>AED {selectedSupplier.currentBalance.toLocaleString()}</strong></span>
                    <span>TRN: <strong className="font-mono">{selectedSupplier.trnNo || 'N/A'}</strong></span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Invoice / Voucher Ref No: <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-blue-900 focus:border-blue-500"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Supplier external bill or system ID</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Invoice Date & Due Date:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                    required
                  />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>Issue</span>
                  <span>Payment Due</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Invoice Currency & FX Rate:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as any)}
                    className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="AED">AED (Dirham)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (Pound)</option>
                  </select>
                  <input
                    type="number"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={e => setExchangeRate(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-mono font-bold text-slate-800"
                    title="Exchange rate to AED"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">1 {currency} = {exchangeRate} AED</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: CONTAINER, PORT OF ENTRY & LOGISTICS */}
          <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Ship className="w-3.5 h-3.5 text-amber-700" />
                <span>2. Freight, Ocean Shipping & Customs Port Clearance</span>
              </div>
              <span className="text-[10px] text-amber-800 font-mono">CIF Jebel Ali Delivery</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Port of Inward Arrival:
                </label>
                <select
                  value={portOfEntry}
                  onChange={e => setPortOfEntry(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="Jebel Ali Port (AEJEA), Dubai">Jebel Ali Port (AEJEA), Dubai</option>
                  <option value="Dubai Cargo Village (Air Freight)">Dubai Cargo Village (Air Freight)</option>
                  <option value="Al Quoz Central Logistics Depot">Al Quoz Central Logistics Depot</option>
                  <option value="Sharjah Hamriyah Freezone Port">Sharjah Hamriyah Freezone Port</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Container No. (40ft/20ft HC):
                </label>
                <input
                  type="text"
                  value={containerNo}
                  onChange={e => setContainerNo(e.target.value)}
                  placeholder="e.g. MSKU-982145-0"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono uppercase text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Bill of Lading (B/L) / AWB No:
                </label>
                <input
                  type="text"
                  value={blAirwayBillNo}
                  onChange={e => setBlAirwayBillNo(e.target.value)}
                  placeholder="e.g. MEDUR92810482"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono uppercase text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Vessel / Carrier Name:
                </label>
                <input
                  type="text"
                  value={vesselName}
                  onChange={e => setVesselName(e.target.value)}
                  placeholder="e.g. MSC EMMA / V.402E"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: ITEMIZED BALE / SACK LINE ITEMS TABLE */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-700" />
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Bale & Sack Itemized Manifest Grid ({lines.length} items)
                </h4>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-2">
                  <span>Total Bales: <strong className="font-mono text-blue-900">{totalBalesCount}</strong></span>
                  <span>•</span>
                  <span>Gross Weight: <strong className="font-mono text-blue-900">{totalGrossWeightKg.toLocaleString()} KG</strong></span>
                </div>

                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-[11px] font-bold uppercase shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Line Item</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2 min-w-[220px]">Item Master Description</th>
                    <th className="px-3 py-2 w-24">Packaging</th>
                    <th className="px-3 py-2 w-20 text-center">Bales / Qty</th>
                    <th className="px-3 py-2 w-24 text-right">Total KG</th>
                    <th className="px-3 py-2 w-28 text-center">Rate Basis</th>
                    <th className="px-3 py-2 w-24 text-right">Rate ({currency})</th>
                    <th className="px-3 py-2 w-28 text-right">Line Total ({currency})</th>
                    <th className="px-3 py-2 w-10 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.map((line, idx) => {
                    const avgKgPerBale = line.packageCount > 0 ? (line.totalWeight / line.packageCount).toFixed(1) : '0';

                    return (
                      <tr key={line.id} className="hover:bg-blue-50/30">
                        <td className="px-3 py-2 font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <SearchableSelect
                            value={line.itemId || (allAvailableItems[0]?.id ?? '')}
                            onChange={val => handleLineChange(idx, 'itemId', val)}
                            options={allAvailableItems.map(it => ({
                              value: it.id,
                              label: `${it.name} (${it.code})`,
                              badge: it.category || 'ITEM',
                              sublabel: `${it.stdWeight || 45}KG @ AED ${it.baseRate || 0}`
                            }))}
                            placeholder="Select Bale / Item..."
                            searchPlaceholder="Search bale name, category, or code..."
                            className="w-full bg-white text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.packagingUom}
                            onChange={e => handleLineChange(idx, 'packagingUom', e.target.value as PackagingUOM)}
                            className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-800 font-medium"
                          >
                            <option value="BALES">Bales (بيل)</option>
                            <option value="SACKS">Sacks (شوال)</option>
                            <option value="BAGS">Bags (أكياس)</option>
                            <option value="CARTON">Carton (كرتون)</option>
                            <option value="PIECE">Piece (قطعة)</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={line.packageCount}
                            onChange={e => handleLineChange(idx, 'packageCount', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-center text-slate-900"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            step="0.1"
                            value={line.totalWeight}
                            onChange={e => handleLineChange(idx, 'totalWeight', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-right text-slate-900"
                          />
                          <div className="text-[9px] text-slate-700 text-right mt-0.5">
                            ~{avgKgPerBale} kg/bale
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex rounded border border-slate-300 overflow-hidden text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleLineChange(idx, 'rateType', 'PER_KG')}
                              className={`px-2 py-0.5 font-bold ${line.rateType === 'PER_KG' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                            >
                              / KG
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLineChange(idx, 'rateType', 'PER_UNIT')}
                              className={`px-2 py-0.5 font-bold ${line.rateType === 'PER_UNIT' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                            >
                              / Bale
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.ratePerWeight}
                            onChange={e => handleLineChange(idx, 'ratePerWeight', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-right text-slate-900"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-blue-900">
                          {line.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length <= 1}
                            className={`p-1 rounded text-slate-400 hover:text-red-600 transition-colors ${lines.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: LANDED COSTS & UAE VAT 5% SUMMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Notes & Payment Terms */}
            <div className="lg:col-span-7 space-y-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Settlement Terms & Internal Notes
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Payment Terms:
                    </label>
                    <select
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value="CASH_ON_DELIVERY">Cash On Delivery (COD)</option>
                      <option value="30_DAYS_CREDIT">30 Days Credit (Supplier Khata)</option>
                      <option value="60_DAYS_CREDIT">60 Days Credit</option>
                      <option value="LETTER_OF_CREDIT">Letter of Credit (LC / Bank Guarantee)</option>
                      <option value="ADVANCE_TELEGRAPHIC">100% Advance Wire Transfer</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">
                      VAT Treatment (UAE FTA):
                    </label>
                    <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-300">
                      <input
                        type="checkbox"
                        id="modalApplyVatToggle"
                        checked={applyVat}
                        onChange={e => setApplyVat(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                      />
                      <label htmlFor="modalApplyVatToggle" className="text-xs font-bold text-slate-800 cursor-pointer select-none flex-1">
                        VAT De Diya / Apply VAT
                      </label>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${applyVat ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600 border border-slate-300'}`}>
                        {applyVat ? '✓ Tick: Auto-Calculate (5%)' : '✗ Non-Tick: Without VAT'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Procurement Notes / Quality Inspection Memo:
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Enter sorting notes, container seal number, packaging condition..."
                    className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Right: Comprehensive Financial Calculation */}
            <div className="lg:col-span-5 bg-gradient-to-br from-slate-50 to-amber-50/40 p-4 rounded-xl border border-amber-200/90 shadow-2xs space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-amber-700" />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                    Landed Cost & VAT Calculation
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoCalcCustoms}
                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                >
                  Auto 5% Duty
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Goods Subtotal (FOB):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {currency} {itemsSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1">
                    <span>Ocean / Air Freight:</span>
                  </span>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-[10px] font-mono text-slate-700">{currency}</span>
                    <input
                      type="number"
                      value={freightAmount}
                      onChange={e => setFreightAmount(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Customs Duty (5% CIF):</span>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-[10px] font-mono text-slate-700">{currency}</span>
                    <input
                      type="number"
                      value={customsDutyAmount}
                      onChange={e => setCustomsDutyAmount(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Port Handling & Clearance:</span>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-[10px] font-mono text-slate-700">{currency}</span>
                    <input
                      type="number"
                      value={terminalHandlingAmount}
                      onChange={e => setTerminalHandlingAmount(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-slate-600 pt-1.5 border-t border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      id="modalApplyVatSummaryCheck"
                      checked={applyVat}
                      onChange={e => setApplyVat(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="modalApplyVatSummaryCheck" className="text-xs font-semibold cursor-pointer select-none">
                      UAE VAT ({applyVat ? `${vatRatePercent}%` : '0% - Excluded'}):
                    </label>
                  </div>
                  <span className={`font-mono font-bold ${applyVat ? 'text-amber-900' : 'text-slate-400'}`}>
                    {applyVat
                      ? `${currency} ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '0.00 (Without VAT)'}
                  </span>
                </div>

                <div className="pt-2 border-t-2 border-slate-800 flex justify-between items-baseline">
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">Total Payable:</span>
                    {currency !== 'AED' && (
                      <span className="text-[10px] text-slate-500 block font-mono">
                        Base: AED {grandTotalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-base text-[#004085]">
                      {currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL STICKY FOOTER */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Supplier Khata & General Ledger automatically updated upon posting</span>
            </div>
            <AutoSaveIndicator isAutoSaved={isAutoSaved} lastSavedTime={lastSavedTime} />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-3d btn-3d-slate text-xs py-1.5 px-3.5 cursor-pointer font-bold uppercase tracking-wider"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('DRAFT')}
              className="btn-3d btn-3d-slate text-xs py-1.5 px-3.5 cursor-pointer font-bold uppercase tracking-wider disabled:opacity-50"
            >
              <span>Save as Draft</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('POSTED')}
              className="btn-3d btn-3d-amber text-xs py-1.5 px-4 cursor-pointer font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Save & Post to Ledger</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('POSTED', true)}
              className="btn-3d btn-3d-emerald text-xs py-1.5 px-4 cursor-pointer font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
            >
              <ArrowRight className="w-3.5 h-3.5 text-white" />
              <span>Save & Open Inward Gate Pass</span>
            </button>
          </div>
        </div>
      </div>

      {/* Camera Document Scanner Overlay */}
      <CameraInvoiceScannerOverlay
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        parties={parties}
        items={items}
        onApplyExtractedData={handleApplyScannedData}
      />
    </div>
  );
};

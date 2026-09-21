import React, { useState, useEffect, useMemo } from 'react';
import { PurchaseInvoice, InwardGatePass } from '../purchase.types.ts';
import { Printer, X, ShieldCheck, Download, Globe, Award, FileText, Tag } from 'lucide-react';
import { openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import { openCommercialInvoiceA4PrintWindow } from '../../../utils/printInvoiceA4.ts';
import { RoyalWaxSeal } from '../../../components/RoyalWaxSeal.tsx';
import { supabase } from '../../../supabaseClient.ts';

function numberToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const num = Math.floor(amount);
  const fils = Math.round((amount - num) * 100);

  function convertGroup(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    } else if (n > 0) {
      str += ones[n] + ' ';
    }
    return str;
  }

  if (num === 0) return 'Zero UAE Dirhams Only';
  let result = '';
  const millions = Math.floor(num / 1000000);
  const thousands = Math.floor((num % 1000000) / 1000);
  const remainder = num % 1000;

  if (millions) result += convertGroup(millions) + 'Million ';
  if (thousands) result += convertGroup(thousands) + 'Thousand ';
  if (remainder) result += convertGroup(remainder);

  result = result.trim() + ' UAE Dirhams';
  if (fils > 0) {
    result += ' and ' + fils + '/100 Fils';
  }
  result += ' Only';
  return result;
}

interface CommercialInvoiceModalProps {
  invoice?: PurchaseInvoice | null;
  gatePass?: InwardGatePass | null;
  onClose: () => void;
}

export const CommercialInvoiceModal: React.FC<CommercialInvoiceModalProps> = ({
  invoice,
  gatePass,
  onClose
}) => {
  const docNo = invoice ? invoice.invoiceNo : gatePass ? gatePass.gatePassNo : '';
  const supplierName = invoice?.supplierName || (invoice as any)?.supplier_name || gatePass?.supplierName || 'Supplier';
  const date = invoice?.date || invoice?.invoiceDate || (invoice as any)?.invoice_date || gatePass?.date || new Date().toISOString().slice(0, 10);
  const status = invoice?.status || gatePass?.status || 'DRAFT';
  const containerNo = invoice?.containerNo || (invoice as any)?.container_no || gatePass?.containerNo || '-';
  const billOfLading = invoice?.blAirwayBillNo || (invoice as any)?.bl_no || gatePass?.billOfLading || '-';
  const vesselName = gatePass?.vesselName || (invoice as any)?.vesselName || (invoice as any)?.vessel_name || '-';
  const portOfLoading = gatePass?.portOfLoading || (invoice as any)?.portOfLoading || (invoice as any)?.port_of_loading || '-';
  const portOfDischarge = invoice?.portOfEntry || (invoice as any)?.port_of_arrival || 'Jebel Ali Port (AEJEA), Dubai, UAE';

  const [invoiceItems, setInvoiceItems] = useState<any[]>(invoice?.items || []);

  useEffect(() => {
    if ((!invoice?.items || invoice.items.length === 0) && invoice?.id) {
      supabase
        .from('purchase_invoice_items')
        .select('*')
        .eq('invoice_id', String(invoice.id))
        .then(({ data }) => {
          if (data && data.length > 0) {
            setInvoiceItems(data.map((r: any) => ({
              id: r.id,
              itemId: r.item_code || r.id,
              itemCode: r.item_code || 'VINT-01',
              itemName: r.item_name || r.description || 'Vintage Mix Bales',
              packagingUom: r.packaging_uom || r.packaging || 'BALES',
              packageCount: Number(r.package_count ?? r.quantity ?? 1),
              totalWeight: Number(r.total_weight ?? r.total_kg ?? 0),
              ratePerWeight: Number(r.rate_per_weight ?? r.rate ?? 0),
              lineTotal: Number(r.line_total ?? 0)
            })));
          }
        });
    } else if (invoice?.items && invoice.items.length > 0) {
      setInvoiceItems(invoice.items);
    }
  }, [invoice?.id, invoice?.items]);

  const currency = (invoice?.currency || 'AED').toUpperCase();
  const exchangeRate = Number(invoice?.exchangeRate) || (currency === 'USD' ? 3.6725 : 1);

  const rawItems = useMemo(() => {
    if (invoiceItems && invoiceItems.length > 0) {
      return invoiceItems.map((it, idx) => ({
        id: it.id || `pi-${idx}`,
        itemName: it.itemName || it.item_name || it.description || 'Vintage Mix Bales',
        packagingUom: it.packagingUom || it.packaging_uom || it.packaging || 'BALES',
        packageCount: Number(it.packageCount ?? it.package_count ?? it.quantity ?? 1),
        totalWeight: Number(it.totalWeight ?? it.total_weight ?? it.total_kg ?? (Number(invoice?.totalWeightKg || (invoice as any)?.total_weight_kg) || 25)),
        ratePerWeight: Number(it.ratePerWeight ?? it.rate_per_weight ?? it.rate ?? 0),
        lineTotal: Number(it.lineTotal ?? it.line_total ?? 0)
      }));
    }
    const fallbackWt = Number(invoice?.totalWeightKg || (invoice as any)?.total_weight_kg || (invoice as any)?.totalGrossWeightKg || 25);
    const fallbackTot = Number(invoice?.totalAmount || (invoice as any)?.total_amount || 0);
    const fallbackRate = fallbackWt > 0 ? Number((fallbackTot / fallbackWt).toFixed(2)) : 0;
    return [
      {
        id: `pi-${invoice?.id || '1'}`,
        itemName: 'Vintage Mix Bales',
        packagingUom: 'BALES',
        packageCount: Number(invoice?.totalBalesCount || (invoice as any)?.total_bales_count || 1),
        totalWeight: fallbackWt,
        ratePerWeight: fallbackRate,
        lineTotal: fallbackTot
      }
    ];
  }, [invoiceItems, invoice]);

  const items = useMemo(() => {
    return rawItems.map((i, idx) => {
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
        unitPriceUsd = Number((rawRate / (exchangeRate || 3.6725)).toFixed(2));
        totalUsd = Number((rawLineTotal / (exchangeRate || 3.6725)).toFixed(2));
      }

      return {
        id: i.id || `pi-${idx}`,
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
  }, [rawItems, currency, exchangeRate]);

  const totalUsd = useMemo(() => items.reduce((acc, i) => acc + (i.totalUsd || 0), 0), [items]);
  const totalAed = useMemo(() => items.reduce((acc, i) => acc + (i.totalAed || 0), 0), [items]);
  const totalNetKg = useMemo(() => items.reduce((acc, i) => acc + (i.netWeightKg || 0), 0), [items]);
  const totalGrossKg = useMemo(() => items.reduce((acc, i) => acc + (i.grossWeightKg || 0), 0), [items]);
  const totalBales = useMemo(() => items.reduce((acc, i) => acc + (i.quantityBales || 0), 0), [items]);

  const freightAmount = Number(invoice?.freightAmount || (invoice as any)?.freight_amount || 0);
  const customsDutyAmount = Number(invoice?.customsDutyAmount || (invoice as any)?.customs_duty_amount || (invoice as any)?.customsDuty || 0);
  const terminalHandlingAmount = Number(invoice?.terminalHandlingAmount || (invoice as any)?.terminal_handling_amount || (invoice as any)?.terminalHandling || 0);
  const deductionAmount = Number(invoice?.deductionAmount || (invoice as any)?.deduction_amount || (invoice as any)?.discountAmount || (invoice as any)?.discount_amount || 0);
  const vatAmount = Number(invoice?.vatAmount || (invoice as any)?.tax_amount || (invoice as any)?.taxAmount || 0);
  const itemsSubTotal = currency === 'USD' ? totalUsd : totalAed;
  const grandTotal = Number(invoice?.totalAmount || (invoice as any)?.total_amount || invoice?.netAmount || (itemsSubTotal + freightAmount + customsDutyAmount + terminalHandlingAmount - deductionAmount + vatAmount));
  const grandTotalAed = currency === 'AED' ? grandTotal : Number((grandTotal * exchangeRate).toFixed(2));

  const docGross = Number(invoice?.grossAmount || (currency === 'USD' ? totalUsd : totalAed));
  const docDeduction = deductionAmount;
  const docNet = grandTotal;

  const handlePrint = () => {
    openCommercialInvoiceA4PrintWindow({
      docNo,
      date,
      supplierName,
      supplierTrn: invoice?.supplierTrn || (invoice as any)?.supplier_trn,
      consigneeName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      consigneeAddress: 'House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, UAE',
      consigneeTrn: '100482910300003',
      vesselName,
      billOfLading,
      containerNo,
      portOfDischarge,
      items,
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

  const balesList = useMemo(() => {
    const list: any[] = [];
    let idx = 1;
    items.forEach(line => {
      const count = line.quantityBales || 1;
      const weightPerBale = line.grossWeightKg / count;
      const costPerBale = line.totalAed / count;
      const costPerGram = weightPerBale > 0 ? (costPerBale / (weightPerBale * 1000)) : 0;

      for (let i = 1; i <= count; i++) {
        const paddedIdx = String(idx).padStart(3, '0');
        const baleCode = `BAL-${docNo.replace(/[^a-zA-Z0-9]/g, '')}-${paddedIdx}`;
        list.push({
          index: idx,
          baleCode,
          category: line.description.split(' (')[0],
          grossWeightKg: Number(weightPerBale.toFixed(2)),
          totalGrams: Math.round(weightPerBale * 1000),
          totalCostAed: Number(costPerBale.toFixed(2)),
          costPerGram: Number(costPerGram.toFixed(4)),
          purchaseInvoiceNo: docNo,
          supplierName,
          status: 'Unopened / Ready for Sorting'
        });
        idx++;
      }
    });
    return list;
  }, [items, docNo, supplierName]);

  const handlePrintSingleThermalTag = (bale: any) => {
    openBatchBaleThermalTagsPrintWindow([{
      ...bale,
      totalCount: balesList.length
    }]);
  };

  const handlePrintBatchThermalTags = () => {
    if (!invoice && !gatePass) return;
    const invoiceRef = docNo;
    const sName = supplierName;
    const totalBalesCount = totalBales;

    const balesToPrint: any[] = [];
    let globalBaleIndex = 1;

    items.forEach(line => {
      const count = line.quantityBales || 1;
      const weightPerBale = line.grossWeightKg / count;
      const costPerBale = line.totalAed / count;
      const costPerGram = weightPerBale > 0 ? (costPerBale / (weightPerBale * 1000)) : 0;

      for (let i = 1; i <= count; i++) {
        const paddedIdx = String(globalBaleIndex).padStart(3, '0');
        balesToPrint.push({
          baleCode: `BAL-${invoiceRef.replace(/[^a-zA-Z0-9]/g, '')}-${paddedIdx}`,
          category: line.description.split(' (')[0],
          grossWeightKg: Number(weightPerBale.toFixed(2)),
          totalCostAed: Number(costPerBale.toFixed(2)),
          costPerGram,
          purchaseInvoiceNo: invoiceRef,
          supplierName: sName,
          status: 'Unopened / Ready for Sorting',
          index: globalBaleIndex,
          totalCount: totalBalesCount
        });
        globalBaleIndex++;
      }
    });

    openBatchBaleThermalTagsPrintWindow(balesToPrint);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-amber-300 max-w-4xl w-full shadow-2xl p-6 sm:p-8 relative print:m-0 print:p-0 print:border-none print:shadow-none print:w-full">
        {/* Actions Bar (Screen only) */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-amber-200 print:hidden flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-amber-700 text-white font-mono font-bold text-xs uppercase">
              {docNo}
            </span>
            <span className="text-xs font-bold text-slate-700">
              International Commercial Customs Invoice & Inward Gate Pass
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintBatchThermalTags}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              title="Print high-density 4x2 thermal barcode labels for all bales"
            >
              <Tag className="w-3.5 h-3.5 text-amber-300" />
              <span>Print All Bale Thermal Tags ({totalBales} Bales)</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Export PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Commercial Invoice Document */}
        <div className="bg-[#fcfaf4] p-6 sm:p-8 rounded-xl border border-amber-200/90 font-sans print:border-none print:bg-white print:p-0">
          {/* Header Banner */}
          <div className="border-b-2 border-amber-900/40 pb-5 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-amber-800 text-amber-200 flex items-center justify-center font-serif font-black text-lg border border-amber-600">
                    VV
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-serif font-black text-amber-950 uppercase tracking-wider">
                      VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
                    </h2>
                    <p className="text-[10px] text-slate-700 font-mono">
                      Dubai Economy & Tourism License No: 1049281 &bull; Customs Code: AE-9281048
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 pt-1">
                  House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, United Arab Emirates<br />
                  Tel: +971 55 418 6086 &bull; Email: sales@vintagevibesllcspc.com &bull; Tax TRN: <strong>100482910300003</strong>
                </p>
              </div>

              <div className="text-right border-l-2 border-amber-200 pl-4">
                <div className="inline-block px-3 py-1 rounded bg-amber-900 text-amber-100 font-serif font-bold text-xs uppercase tracking-widest mb-1">
                  COMMERCIAL INVOICE
                </div>
                <div className="font-mono text-sm font-black text-slate-900">
                  REF: {docNo}
                </div>
                <div className="text-[10px] text-slate-600 font-mono">
                  DATE: <strong>{date}</strong>
                </div>
                <div className="text-[10px] text-slate-600 font-mono">
                  INCOTERMS: <strong>CIF DUBAI (INCOTERMS 2020)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Consignee & Shipper 2-Column Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-xs">
            {/* Shipper */}
            <div className="p-3.5 rounded-lg bg-white border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-amber-900 tracking-wider block mb-1">
                SHIPPER / EXPORTER:
              </span>
              <div className="font-bold text-slate-900 text-sm">{supplierName}</div>
              <p className="text-slate-600 text-[11px] mt-0.5">
                {invoice?.supplierTrn ? `TRN / TAX ID: ${invoice.supplierTrn}` : 'Direct Consignor / Factory Dispatch'}<br />
                {invoice?.portOfEntry ? `Destination Port: ${invoice.portOfEntry}` : 'Jebel Ali Port (AEJEA), Dubai, UAE'}
              </p>
            </div>

            {/* Consignee */}
            <div className="p-3.5 rounded-lg bg-white border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-amber-900 tracking-wider block mb-1">
                CONSIGNEE & BUYER:
              </span>
              <div className="font-bold text-slate-900 text-sm">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </div>
              <p className="text-slate-600 text-[11px] mt-0.5">
                Al Quoz Industrial 3, Dubai, UAE &bull; TRN: 100492819200003<br />
                Notify Party: Same as Consignee / JAFZA Freight Clearing Agent
              </p>
            </div>
          </div>

          {/* Transport & Customs Clearance Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-amber-50/70 border border-amber-200 mb-5 text-[11px] font-mono">
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Vessel / Voyage:</span>
              <span className="font-bold text-slate-900">{vesselName}</span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Bill of Lading:</span>
              <span className="font-bold text-slate-900">{billOfLading}</span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Container No:</span>
              <span className="font-bold text-slate-900">{containerNo}</span>
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Discharge Port:</span>
              <span className="font-bold text-amber-950">{portOfDischarge}</span>
            </div>
          </div>

          {/* Itemized Commercial Goods Table */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-100/80 border-y border-amber-300 text-amber-950 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3 text-left">Item Description</th>
                  <th className="py-2.5 px-2 text-center">HS Code</th>
                  <th className="py-2.5 px-2 text-center">Bales</th>
                  <th className="py-2.5 px-2 text-right">Net Wt (KG)</th>
                  <th className="py-2.5 px-2 text-right">Unit CIF (USD)</th>
                  <th className="py-2.5 px-3 text-right">Total (USD)</th>
                  <th className="py-2.5 px-3 text-right">Total (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/70 font-mono">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/40">
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                      {item.description}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600 font-bold">
                      {item.hsCode || '6309.00.00'}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                      {item.quantityBales}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-800">
                      {item.netWeightKg.toLocaleString()} KG
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-800">
                      ${item.unitPriceUsd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      ${item.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-950">
                      AED {item.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-800/60 bg-amber-100/90 font-mono font-black text-xs text-amber-950">
                  <td colSpan={2} className="py-2.5 px-3 uppercase text-right font-sans">
                    Cargo Totals (CIF Dubai):
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {totalBales} Bales
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {totalNetKg.toLocaleString()} KG
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    -
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm">
                    ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm">
                    AED {totalAed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Financial Breakdown: Goods, Expenses (Karachya), Deductions, Net */}
          <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-3 mb-4 text-xs space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-2 border-b border-amber-200/60 font-mono">
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-500 block">Base Subtotal</span>
                <span className="font-bold text-slate-800 text-xs">
                  {currency === 'USD' ? '$' : 'AED'} {itemsSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-500 block">Freight Charges</span>
                <span className="font-bold text-slate-800 text-xs">
                  {freightAmount > 0 ? `+${currency === 'USD' ? '$' : 'AED'} ${freightAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '0.00'}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-500 block">Customs & Terminal</span>
                <span className="font-bold text-slate-800 text-xs">
                  {(customsDutyAmount + terminalHandlingAmount) > 0 ? `+${currency === 'USD' ? '$' : 'AED'} ${(customsDutyAmount + terminalHandlingAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '0.00'}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-emerald-700 block">VAT (5%)</span>
                <span className="font-bold text-emerald-800 text-xs">
                  {vatAmount > 0 ? `+${currency === 'USD' ? '$' : 'AED'} ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '0.00'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-500">Gross Goods & Charges</span>
                <span className="font-mono font-bold text-slate-800 text-sm">
                  {currency === 'USD' ? '$' : 'AED'} {docGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-rose-600">Deductions / Discounts</span>
                <span className="font-mono font-bold text-rose-700 text-sm">
                  {docDeduction > 0 ? `-${currency === 'USD' ? '$' : 'AED'} ${docDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '0.00'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-indigo-900">Net Landed Commercial Total</span>
                <span className="font-mono font-black text-indigo-900 text-sm">
                  {currency === 'USD' ? '$' : 'AED'} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {currency !== 'AED' && (
                    <span className="text-[10px] text-indigo-700 font-bold ml-1.5">(≈ AED {grandTotalAed.toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Amount In Words & Declaration */}
          <div className="p-3 rounded-lg bg-white border border-amber-200 mb-6 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-700">Total Invoice Amount in Words:</span>
              <span className="font-serif italic font-bold text-amber-900">
                {numberToWords(grandTotalAed)} (AED {grandTotalAed.toLocaleString(undefined, { minimumFractionDigits: 2 })})
              </span>
            </div>
            <p className="text-[10px] text-slate-600 border-t border-slate-100 pt-1.5">
              <strong>Customs Declaration:</strong> We certify that this invoice shows the actual price of the authentic pre-owned vintage garments described, that no other invoice has been or will be issued, and that all particulars are true and correct according to UAE Federal Customs Authority regulations.
            </p>
          </div>

          {/* Signatures & Customs Inspection Stamps */}
          <div className="grid grid-cols-3 gap-6 pt-4 border-t border-dashed border-amber-300 text-center text-[10px] text-slate-600 uppercase font-bold relative">
            <div>
              <div className="h-12 border-b border-slate-400 mb-1"></div>
              <span>Shipper / Exporter Signature</span>
            </div>
            <div>
              <div className="h-12 border-b border-slate-400 mb-1"></div>
              <span>Dubai Customs Gate Inspector</span>
            </div>
            <div className="relative">
              <div className="h-12 border-b border-slate-400 mb-1 flex items-center justify-center">
                <div className="absolute -top-7 right-4 pointer-events-none">
                  <RoyalWaxSeal
                    sealText="CUSTOMS CLEARED"
                    subText="JEBEL ALI PORT AEJEA"
                    size="sm"
                    date={date}
                    approver="PORT OFFICER"
                  />
                </div>
              </div>
              <span>Vintage Vibes Managing Director</span>
            </div>
          </div>

          {/* BALE BARCODE TAG MANIFEST TABLE */}
          <div className="mt-8 pt-6 border-t-2 border-dashed border-amber-300 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-800" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-amber-950 font-serif">
                  Bale Barcode Tag Manifest & Cost Breakdown ({balesList.length} Bales)
                </h3>
              </div>
              <button
                type="button"
                onClick={handlePrintBatchThermalTags}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Tag className="w-3.5 h-3.5 text-amber-300" />
                <span>Print All Thermal Tags ({balesList.length})</span>
              </button>
            </div>

            <div className="bg-amber-50/60 rounded-xl border border-amber-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-100/80 text-amber-950 font-bold uppercase text-[10px] tracking-wider border-b border-amber-200">
                    <tr>
                      <th className="py-2.5 px-3">Bale Code / Tag #</th>
                      <th className="py-2.5 px-3">Garment Category</th>
                      <th className="py-2.5 px-3 text-right">Gross Wt (KG)</th>
                      <th className="py-2.5 px-3 text-right">Total Grams</th>
                      <th className="py-2.5 px-3 text-right">Cost / Gram</th>
                      <th className="py-2.5 px-3 text-right">Bale Cost (AED)</th>
                      <th className="py-2.5 px-3 text-center">Thermal Sticker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/60 font-mono text-[11px]">
                    {balesList.map(bale => (
                      <tr key={bale.baleCode} className="hover:bg-amber-100/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-indigo-700 whitespace-nowrap">{bale.baleCode}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-900">{bale.category}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{bale.grossWeightKg.toFixed(2)} KG</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">{bale.totalGrams.toLocaleString()} g</td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-600">AED {bale.costPerGram.toFixed(4)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">AED {bale.totalCostAed.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handlePrintSingleThermalTag(bale)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-indigo-700 border border-slate-300 rounded font-sans text-[10px] font-bold cursor-pointer transition shadow-2xs inline-flex items-center gap-1"
                            title="Print 4x2 Thermal Barcode Sticker for this bale"
                          >
                            <Printer className="w-3 h-3 text-slate-500" />
                            <span>Print Tag</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Print Styles for A4 Paper Export */}
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body {
              background: #fff !important;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
            .fixed {
              position: static !important;
              inset: auto !important;
              background: none !important;
              padding: 0 !important;
              backdrop-filter: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

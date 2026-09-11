import React from 'react';
import { PurchaseInvoice, InwardGatePass } from '../purchase.types.ts';
import { Printer, X, ShieldCheck, Download, Globe, Award, FileText, Tag } from 'lucide-react';
import { openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import { RoyalWaxSeal } from '../../../components/RoyalWaxSeal.tsx';

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
  const handlePrint = () => {
    window.print();
  };

  const docNo = invoice ? invoice.invoiceNo : gatePass ? gatePass.gatePassNo : '';
  const supplierName = invoice?.supplierName || gatePass?.supplierName || 'Supplier';
  const date = invoice?.date || gatePass?.date || new Date().toISOString().slice(0, 10);
  const status = invoice?.status || gatePass?.status || 'DRAFT';
  const containerNo = invoice?.containerNo || gatePass?.containerNo || '-';
  const billOfLading = invoice?.blAirwayBillNo || gatePass?.billOfLading || '-';
  const vesselName = gatePass?.vesselName || (invoice as any)?.vesselName || '-';
  const portOfLoading = gatePass?.portOfLoading || (invoice as any)?.portOfLoading || '-';
  const portOfDischarge = invoice?.portOfEntry || 'Jebel Ali Port (AEJEA), Dubai, UAE';

  // Invoice line calculations from real items
  const items = (invoice?.items && invoice.items.length > 0)
    ? invoice.items.map((i, idx) => {
        const rateInAed = i.ratePerWeight || 0;
        const lineTotalAed = i.lineTotal || (i.totalWeight * rateInAed);
        return {
          id: i.id || `pi-${idx}`,
          description: `${i.itemName} (${i.packagingUom} packing)`,
          hsCode: '6309.00.10',
          quantityBales: i.packageCount || 1,
          netWeightKg: Number(((i.totalWeight || 0) * 0.96).toFixed(1)),
          grossWeightKg: i.totalWeight || 0,
          unitPriceUsd: Number((rateInAed / 3.6725).toFixed(2)),
          totalUsd: Number((lineTotalAed / 3.6725).toFixed(2)),
          exchangeRate: 0.272,
          totalAed: lineTotalAed
        };
      })
    : [];

  const totalUsd = (invoice as any)?.totalUsd || items.reduce((acc, i) => acc + (i.totalUsd || 0), 0);
  const totalAed = (invoice as any)?.grandTotalAed || (invoice ? invoice.totalAmount : items.reduce((acc, i) => acc + (i.totalAed || 0), 0));
  const totalNetKg = items.reduce((acc, i) => acc + (i.netWeightKg || 0), 0);
  const totalGrossKg = items.reduce((acc, i) => acc + (i.grossWeightKg || 0), 0);
  const totalBales = items.reduce((acc, i) => acc + (i.quantityBales || 0), 0) || (invoice?.totalBalesCount || 1);

  const handlePrintBatchThermalTags = () => {
    if (!invoice && !gatePass) return;
    const invoiceRef = docNo;
    const sName = supplierName;
    const invItems = invoice?.items || [];

    const balesToPrint: any[] = [];
    let globalBaleIndex = 1;
    const totalBalesCount = totalBales;

    if (invItems.length > 0) {
      invItems.forEach(line => {
        const count = Number(line.packageCount) || 1;
        const weightPerBale = (Number(line.totalWeight) || 0) / count;
        const lineTotal = Number(line.lineTotal) || 0;
        const costPerBale = lineTotal / count;
        const costPerGram = weightPerBale > 0 ? (costPerBale / (weightPerBale * 1000)) : 0;

        for (let i = 1; i <= count; i++) {
          const paddedIdx = String(globalBaleIndex).padStart(3, '0');
          balesToPrint.push({
            baleCode: `BAL-${invoiceRef.replace(/[^a-zA-Z0-9]/g, '')}-${paddedIdx}`,
            category: line.itemName,
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
    } else {
      const wt = Number(invoice?.totalGrossWeightKg || gatePass?.totalBaleWeight || 45);
      const cost = Number(invoice?.totalAmount || gatePass?.totalBaleCost || 0);
      balesToPrint.push({
        baleCode: `BAL-${invoiceRef.replace(/[^a-zA-Z0-9]/g, '')}-001`,
        category: gatePass?.baleCategory || 'Vintage Mix Bales',
        grossWeightKg: wt,
        totalCostAed: cost,
        costPerGram: wt > 0 ? (cost / (wt * 1000)) : 0,
        purchaseInvoiceNo: invoiceRef,
        supplierName: sName,
        status: 'Unopened / Ready for Sorting',
        index: 1,
        totalCount: 1
      });
    }

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
                  P.O. Box 92810, Warehouse 14, Al Quoz Industrial Area 3, Dubai, United Arab Emirates<br />
                  Tel: +971 4 338 9201 &bull; Email: trade@vintagevibe.ae &bull; Tax TRN: <strong>100492819200003</strong>
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

          {/* Amount In Words & Declaration */}
          <div className="p-3 rounded-lg bg-white border border-amber-200 mb-6 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-700">Total Invoice Amount in Words:</span>
              <span className="font-serif italic font-bold text-amber-900">
                Seventy-Four Thousand Six Hundred Forty UAE Dirhams Only (AED 74,640.00)
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
        </div>
      </div>
    </div>
  );
};

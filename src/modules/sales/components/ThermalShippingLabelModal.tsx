import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { SalesInvoice } from '../sales.types.ts';
import { Printer, X, Truck, Package, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { openThermalShippingWaybillPrintWindow } from '../../../utils/thermalPrinter.ts';

interface ThermalShippingLabelModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
}

export const ThermalShippingLabelModal: React.FC<ThermalShippingLabelModalProps> = ({ invoice, onClose }) => {
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  const waybillNo = invoice.trackingNumber || `DHL-${invoice.invoiceNo.replace(/[^0-9]/g, '').slice(-8) || '98765432'}`;
  const courier = invoice.courierPartner || 'DHL Express';
  const isCOD = invoice.paymentMethod === 'COD' || invoice.paymentStatus === 'UNPAID_PENDING_COD';
  const totalAmount = invoice.totalAmount || invoice.subTotal || 0;
  const shippingFee = invoice.shippingFeeAed !== undefined ? invoice.shippingFeeAed : (invoice.shippingCharge || 0);

  useEffect(() => {
    if (barcodeSvgRef.current && waybillNo) {
      try {
        JsBarcode(barcodeSvgRef.current, waybillNo, {
          format: 'CODE128',
          width: 2.2,
          height: 55,
          displayValue: true,
          font: 'monospace',
          fontSize: 14,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (err) {
        console.error('Barcode render error:', err);
      }
    }
  }, [waybillNo]);

  const handlePrint = () => {
    const svgHtml = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    const win = openThermalShippingWaybillPrintWindow({
      waybillNo,
      courier,
      isCOD,
      totalAmount,
      shippingFee,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customerName,
      buyerHandle: invoice.buyerHandle,
      customerPhone: invoice.customerPhone,
      shippingAddress: invoice.shippingAddress,
      shippingBearer: invoice.shippingBearer,
      paymentStatus: invoice.paymentStatus,
      items: invoice.items,
      svgHtml
    });
    if (!win) {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden print:shadow-none print:border-none print:w-auto">
        {/* Modal Top Bar - Hidden when printing */}
        <div className="print:hidden bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-300">
              4x6 Standard Thermal Shipping Waybill
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Thermal Slip</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* The 4x6 Thermal Label Container (100mm x 150mm) */}
        <div className="p-6 bg-white print:p-2 text-slate-900 font-sans select-none">
          <div className="border-2 border-black p-4 space-y-3 font-mono text-xs">
            {/* Courier Banner */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-black uppercase bg-black text-white px-2 py-0.5">
                  {courier}
                </span>
                <span className="text-[10px] font-bold text-slate-600">DOMESTIC / AIRWAY</span>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500">ORIGIN: DXB-UAE</div>
                <div className="text-xs font-black">STD-PRIORITY</div>
              </div>
            </div>

            {/* Barcode Section */}
            <div className="flex flex-col items-center justify-center py-2 bg-slate-50/50 border-b-2 border-black">
              <svg ref={barcodeSvgRef} className="max-w-full" />
              <div className="text-[10px] text-slate-600 tracking-wider font-bold mt-0.5">
                WAYBILL / TRACKING #{waybillNo}
              </div>
            </div>

            {/* Shipper & Consignee Grid */}
            <div className="grid grid-cols-2 gap-3 border-b-2 border-black pb-3 text-[11px] leading-tight">
              {/* Shipper */}
              <div className="border-r border-black pr-2">
                <div className="text-[9px] font-black uppercase text-slate-500 mb-0.5">FROM (SHIPPER):</div>
                <div className="font-bold text-slate-900">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</div>
                <div className="text-slate-700">House 14 Street 4 - Al Jimi - Al Nudood</div>
                <div className="text-slate-700">Al Ain, Abu Dhabi, UAE</div>
                <div className="text-[10px] text-slate-600 font-bold mt-1">TRN: 100482910300003</div>
                <div className="text-[10px] text-slate-600">Tel: +971 55 418 6086</div>
              </div>

              {/* Consignee */}
              <div className="pl-1">
                <div className="text-[9px] font-black uppercase text-slate-500 mb-0.5">TO (CONSIGNEE):</div>
                <div className="font-bold text-slate-900 text-xs">{invoice.customerName || invoice.buyerHandle}</div>
                <div className="text-indigo-700 font-bold">{invoice.buyerHandle}</div>
                <div className="text-slate-800 font-semibold mt-0.5">{invoice.customerPhone || '+971 50 123 4567'}</div>
                <div className="text-slate-700 mt-0.5 text-[10px]">{invoice.shippingAddress || 'Dubai / Northern Emirates, UAE'}</div>
              </div>
            </div>

            {/* Garment Details & Weight */}
            <div className="border-b-2 border-black pb-2 text-[10px]">
              <div className="flex justify-between font-bold text-slate-800 mb-1">
                <span>INVOICE: {invoice.invoiceNo}</span>
                <span>PIECES: {(invoice?.items || []).length} PCS</span>
              </div>
              <div className="space-y-0.5">
                {(invoice?.items || []).slice(0, 3).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700">
                    <span className="truncate max-w-[240px]">• {it.description} ({it.barcode})</span>
                    <span>AED {it.finalAmount || it.unitPrice}</span>
                  </div>
                ))}
                {(invoice?.items || []).length > 3 && (
                  <div className="text-slate-500 italic">+ {(invoice?.items || []).length - 3} more garments bundled</div>
                )}
              </div>
            </div>

            {/* COD vs PREPAID Box */}
            <div className="border-2 border-black p-2.5 bg-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">COLLECTION MODE:</div>
                  <div className="text-sm font-black text-black">
                    {isCOD ? '💵 CASH ON DELIVERY (COD)' : '✅ PREPAID (DO NOT COLLECT)'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">TOTAL TO COLLECT:</div>
                  <div className="text-base font-black text-black">
                    {isCOD ? `AED ${totalAmount.toFixed(2)}` : 'AED 0.00'}
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1 pt-1 border-t border-slate-300">
                <span>
                  Shipping: {invoice.shippingBearer === 'COMPANY' ? 'Absorbed by Company (FREE to Buyer)' : `AED ${shippingFee.toFixed(2)} (Buyer Paid)`}
                </span>
                <span>Status: {invoice.paymentStatus === 'PREPAID_VERIFIED' ? 'Verified' : 'Pending'}</span>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-[8px] text-slate-500 text-center uppercase tracking-wider pt-1">
              Vintage Vibes Live Stream Logistics • Retain Waybill for Customer Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X, Tag, Sparkles } from 'lucide-react';
import { openThermalLabelPrintWindow } from '../utils/thermalPrinter.ts';

export interface StickerData {
  itemCode: string;
  description: string;
  category?: string;
  size?: string;
  brand?: string;
  grade?: string;
  retailPriceAed: number;
  batchNo?: string;
  date?: string;
  companyName?: string;
  trn?: string;
  origin?: string;
  weightKg?: number;
  estimatedPrice?: number;
  shopLocation?: string;
}

interface ThermalBarcodeStickerProps {
  sticker: StickerData;
  onClose: () => void;
}

export const ThermalBarcodeSticker: React.FC<ThermalBarcodeStickerProps> = ({ sticker, onClose }) => {
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  // Load thermal settings from setup
  const [thermalSettings, setThermalSettings] = React.useState(() => {
    try {
      const saved = localStorage.getItem('vibe_thermal_settings');
      return saved ? JSON.parse(saved) : {
        printSize: '50x25mm',
        companyName: 'VINTAGE VIBES TRADING L.L.C',
        trnNumber: 'TRN: 100482910300003',
        showCompanyName: true,
        showPrice: true,
        showQtyWeight: true,
        showDescription: true,
        showLogo: true,
        showBarcode: true
      };
    } catch {
      return {
        printSize: '50x25mm',
        companyName: 'VINTAGE VIBES TRADING L.L.C',
        trnNumber: 'TRN: 100482910300003',
        showCompanyName: true,
        showPrice: true,
        showQtyWeight: true,
        showDescription: true,
        showLogo: true,
        showBarcode: true
      };
    }
  });

  useEffect(() => {
    if (barcodeSvgRef.current && sticker.itemCode && thermalSettings.showBarcode) {
      try {
        JsBarcode(barcodeSvgRef.current, sticker.itemCode, {
          format: 'CODE128',
          width: thermalSettings.printSize === '40x30mm' ? 1.4 : 1.8,
          height: thermalSettings.printSize === '40x30mm' ? 32 : 48,
          displayValue: true,
          font: 'monospace',
          fontSize: thermalSettings.printSize === '40x30mm' ? 11 : 14,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (err) {
        console.error('Failed to generate barcode:', err);
      }
    }
  }, [sticker.itemCode, thermalSettings]);

  const handlePrint = () => {
    const svgHtml = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    const win = openThermalLabelPrintWindow({
      itemCode: sticker.itemCode,
      description: sticker.description,
      category: sticker.category,
      size: sticker.size,
      brand: sticker.brand,
      grade: sticker.grade,
      retailPriceAed: sticker.retailPriceAed,
      batchNo: sticker.batchNo,
      date: sticker.date,
      companyName: thermalSettings.companyName || sticker.companyName,
      trn: thermalSettings.trnNumber || sticker.trn,
      weightKg: sticker.weightKg,
      printSize: thermalSettings.printSize,
      svgHtml,
      settings: thermalSettings
    });
    if (!win) {
      window.print();
    }
  };

  // Determine container sizing based on printSize setting
  const containerSizeClass = 
    thermalSettings.printSize === '40x30mm' ? 'w-[220px] text-[10px]' :
    thermalSettings.printSize === '80x50mm' ? 'w-[360px] text-xs' :
    thermalSettings.printSize === '100x150mm' || thermalSettings.printSize === '4x6_shipping' ? 'w-[380px] text-xs' :
    'w-[300px] text-xs'; // 50x25mm default

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden print:shadow-none print:border-none print:w-auto">
        {/* Modal Header - Hidden on Print */}
        <div className="print:hidden bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-5 py-4 flex items-center justify-between text-stone-900 shadow-sm">
          <div className="flex items-center space-x-2">
            <Tag className="w-5 h-5 text-stone-900" />
            <h3 className="font-bold text-base tracking-wide">Warehouse Thermal Sticker</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-900 hover:bg-black/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sticker Label Preview Box */}
        <div className="p-6 bg-stone-100 flex flex-col items-center justify-center print:p-0 print:bg-white">
          <div
            id="thermal-printable-area"
            className={`${containerSizeClass} bg-white border-2 border-dashed border-stone-400 p-4 rounded shadow-sm text-stone-900 font-sans print:border-none print:shadow-none print:m-0`}
          >
            {/* Header: Logo & Company Name */}
            {thermalSettings.showCompanyName && (
              <div className="text-center border-b border-stone-300 pb-1 mb-2">
                {thermalSettings.showLogo && (
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <span className="text-xs">🏷️</span>
                    <span className="font-black text-[10px] tracking-widest text-amber-900 uppercase">VINTAGE VIBES ERP</span>
                  </div>
                )}
                <div className="font-extrabold text-xs tracking-wider uppercase">
                  {thermalSettings.companyName || sticker.companyName || 'VINTAGE VIBES TRADING L.L.C'}
                </div>
                <div className="text-[9px] text-stone-500 font-mono">
                  {thermalSettings.trnNumber || sticker.trn || 'TRN: 100482910300003'} | {thermalSettings.printSize}
                </div>
              </div>
            )}

            {/* Garment Title & Description */}
            {thermalSettings.showDescription && (
              <div className="mb-2">
                <h4 className="font-bold text-sm leading-snug line-clamp-2 uppercase">
                  {sticker.description}
                </h4>
                <div className="flex items-center justify-between mt-1 text-[11px] font-semibold text-stone-600 gap-1 flex-wrap">
                  <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                    {sticker.category || 'Apparel'}
                  </span>
                  {sticker.size && (
                    <span className="bg-stone-900 text-white font-black px-2 py-0.5 rounded text-[11px] tracking-wider">
                      SIZE: {sticker.size}
                    </span>
                  )}
                  {sticker.grade && (
                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300 font-bold">
                      ★ {sticker.grade}
                    </span>
                  )}
                  {sticker.brand && (
                    <span className="text-stone-700 uppercase">
                      {sticker.brand}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Qty & Weight if enabled */}
            {thermalSettings.showQtyWeight && (
              <div className="flex items-center justify-between text-[10px] font-mono bg-stone-50 px-2 py-1 rounded border border-stone-200 mb-2">
                <span>QTY: 1 PCS</span>
                <span>WEIGHT: {sticker.weightKg ? `${sticker.weightKg} kg` : '340g'}</span>
              </div>
            )}

            {/* Barcode Graphic */}
            {thermalSettings.showBarcode && (
              <div className="flex justify-center my-1 bg-white py-1">
                <svg ref={barcodeSvgRef} className="max-w-full h-auto"></svg>
              </div>
            )}

            {/* Price & Meta Footer */}
            {thermalSettings.showPrice && (
              <div className="border-t border-stone-300 pt-2 mt-1 flex items-end justify-between">
                <div>
                  <div className="text-[9px] text-stone-500 font-mono uppercase">
                    Batch: {sticker.batchNo || 'BALE-2026'}
                  </div>
                  <div className="text-[9px] text-stone-500 font-mono">
                    {sticker.date || new Date().toISOString().split('T')[0]}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-stone-500 mr-1">AED</span>
                  <span className="text-2xl font-black tracking-tight text-stone-950">
                    {sticker.retailPriceAed.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Controls - Hidden on Print */}
        <div className="print:hidden px-6 py-4 bg-white border-t border-stone-200 flex items-center justify-between">
          <span className="text-xs text-stone-500 font-mono">
            Optimized for Zebra / TSC 4"x2" Thermal Label Rolls
          </span>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-stone-950 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 rounded-lg shadow-md hover:shadow-lg transition-all transform active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sticker</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThermalBarcodeStickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  data: StickerData;
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;
  return <ThermalBarcodeSticker sticker={data} onClose={onClose} />;
};

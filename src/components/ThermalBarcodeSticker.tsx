import React, { useEffect, useMemo, useState } from 'react';
import { Printer, X, Tag, Sparkles, ExternalLink, SlidersHorizontal, Check, Maximize2, ShieldCheck } from 'lucide-react';
import {
  ThermalEngineConfig,
  DEFAULT_THERMAL_ENGINE_CONFIG,
  THERMAL_DESIGN_STYLES,
  ThermalStyleId,
  THERMAL_PRESETS,
  ThermalPresetId
} from '../modules/setup/thermal/thermalTypes.ts';
import {
  openThermalPrintPopup,
  generateBarcodeSvgString,
  generateQrCodeSvgString
} from '../modules/setup/thermal/thermalPopupManager.ts';
import { renderLabelHtml } from '../modules/setup/thermal/thermalTemplates.ts';

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
  // Load thermal engine config from Global Setup (localStorage / defaults)
  const [engineConfig, setEngineConfig] = useState<ThermalEngineConfig>(() => {
    try {
      const saved = localStorage.getItem('vintage_thermal_engine_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_THERMAL_ENGINE_CONFIG, ...parsed };
      }
    } catch (_) {}
    return DEFAULT_THERMAL_ENGINE_CONFIG;
  });

  // Active style ID initialized from Global Setup
  const [selectedStyleId, setSelectedStyleId] = useState<ThermalStyleId>(() => {
    return engineConfig.styleId || 'modern_minimalist';
  });

  // Active label size preset ID initialized from Global Setup
  const [selectedPresetId, setSelectedPresetId] = useState<ThermalPresetId>(() => {
    return engineConfig.presetId || '2.25x1.25';
  });

  const allPresets = useMemo(() => {
    return [...THERMAL_PRESETS, ...(engineConfig.customPresets || [])];
  }, [engineConfig.customPresets]);

  // Re-sync if Global Setup saved changes in background, and fetch from SQL DB for cross-device parity
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vintage_thermal_engine_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setEngineConfig(prev => ({ ...prev, ...parsed }));
        if (parsed.styleId) setSelectedStyleId(parsed.styleId);
        if (parsed.presetId) setSelectedPresetId(parsed.presetId);
      }
    } catch (_) {}

    // Real DB cross-device sync (e.g. mobile loading desktop presets)
    fetch(`/api/setup/thermal-config?_t=${Date.now()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (res && res.success && res.data) {
          const cfg = res.data;
          setEngineConfig(prev => ({ ...prev, ...cfg }));
          if (cfg.styleId) setSelectedStyleId(cfg.styleId);
          if (cfg.presetId) setSelectedPresetId(cfg.presetId);
          try {
            localStorage.setItem('vintage_thermal_engine_config', JSON.stringify(cfg));
          } catch (_) {}
        }
      })
      .catch(() => {});
  }, []);

  // Preset Selection Handler (Updates width/height & persists preference)
  const handleSelectPreset = (presetId: ThermalPresetId) => {
    setSelectedPresetId(presetId);
    const preset = allPresets.find(p => p.id === presetId);
    if (preset) {
      setEngineConfig(prev => {
        const updated = {
          ...prev,
          presetId: preset.id,
          widthIn: preset.widthIn,
          heightIn: preset.heightIn,
          widthMm: preset.widthMm,
          heightMm: preset.heightMm
        };
        try {
          localStorage.setItem('vintage_thermal_engine_config', JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });
    }
  };

  // Style Selection Handler (Persists preference)
  const handleSelectStyle = (styleId: ThermalStyleId) => {
    setSelectedStyleId(styleId);
    setEngineConfig(prev => {
      const updated = { ...prev, styleId };
      try {
        localStorage.setItem('vintage_thermal_engine_config', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  // Merge: Section 1 (Company Details from Global Setup) + Section 2 (Live Item Attributes from Sorting)
  const activeConfig = useMemo<ThermalEngineConfig>(() => {
    const rawWeightKg = Number(sticker.weightKg || 0);
    const weightGrams = rawWeightKg > 0 ? Math.round(rawWeightKg * 1000) : 340;
    const cleanItemCode = String(sticker.itemCode || '').trim();

    return {
      ...engineConfig,
      // 1. Company Branding: Preserved from Global Setup
      companyName: engineConfig.companyName || sticker.companyName || DEFAULT_THERMAL_ENGINE_CONFIG.companyName,
      trn: engineConfig.trn || sticker.trn || DEFAULT_THERMAL_ENGINE_CONFIG.trn,
      phone: engineConfig.phone || DEFAULT_THERMAL_ENGINE_CONFIG.phone,
      logoUrl: engineConfig.logoUrl || DEFAULT_THERMAL_ENGINE_CONFIG.logoUrl,

      // 2. Dynamic Item & Transaction Metadata: Injected directly from sorted item
      skuBarcode: cleanItemCode || engineConfig.skuBarcode,
      itemName: sticker.description || cleanItemCode || engineConfig.itemName,
      brandName: sticker.brand || engineConfig.brandName || '',
      category: sticker.category || engineConfig.category || 'Apparel',
      size: sticker.size || 'Free Size', // Size included prominently!
      priceAed: Number(sticker.retailPriceAed ?? 0),
      weightValue: weightGrams,
      weightUnit: 'g',
      batchNo: sticker.batchNo || engineConfig.batchNo || '',
      invoiceNo: sticker.batchNo || engineConfig.invoiceNo || '',
      serialNumber: cleanItemCode,
      styleId: selectedStyleId
    };
  }, [engineConfig, sticker, selectedStyleId]);

  // Generate crisp vector barcode SVG for live item (with auto-fit styling)
  const barcodeSvgString = useMemo(() => {
    const rawBarcodeSvg = generateBarcodeSvgString(activeConfig.skuBarcode);
    return rawBarcodeSvg.replace('<svg ', '<svg style="max-width:100%;max-height:100%;width:auto;height:auto;display:block;" ');
  }, [activeConfig.skuBarcode]);

  // Generate crisp QR code SVG for live item (auto-constrained so it never bleeds or cuts off)
  const qrSvgString = useMemo(() => {
    const qrPayload = JSON.stringify({
      sku: activeConfig.skuBarcode,
      item: activeConfig.itemName,
      price: activeConfig.priceAed,
      size: activeConfig.size,
      brand: activeConfig.brandName,
      company: activeConfig.companyName
    });
    const rawQrSvg = generateQrCodeSvgString(qrPayload, 80);
    // Inject responsive scaling so the QR code strictly honors its parent container
    return rawQrSvg.replace('<svg ', '<svg style="width:100%;height:100%;max-width:100%;max-height:100%;display:block;" ');
  }, [activeConfig]);

  // Render the selected label design style
  const livePreviewHtml = useMemo(() => {
    return renderLabelHtml(activeConfig.styleId, {
      config: activeConfig,
      barcodeSvg: barcodeSvgString,
      qrSvg: qrSvgString
    });
  }, [activeConfig, barcodeSvgString, qrSvgString]);

  // Handle direct print launch
  const handlePrint = () => {
    const win = openThermalPrintPopup(activeConfig, activeConfig.styleId);
    if (!win) {
      window.print();
    }
  };

  // Label Dimension & Aspect Ratio Calculations for container preview
  const widthMm = activeConfig.widthMm || 57;
  const heightMm = activeConfig.heightMm || 32;
  const aspectRatio = widthMm / Math.max(1, heightMm);

  // Scaled dimensions with generous boundaries preventing clipping
  const maxCardWidthPx = 430;
  const maxCardHeightPx = 250;

  let previewWidthPx = maxCardWidthPx;
  let previewHeightPx = Math.round(previewWidthPx / aspectRatio);
  if (previewHeightPx > maxCardHeightPx) {
    previewHeightPx = maxCardHeightPx;
    previewWidthPx = Math.round(previewHeightPx * aspectRatio);
  }

  const currentStyleDef = THERMAL_DESIGN_STYLES.find(s => s.id === activeConfig.styleId) || THERMAL_DESIGN_STYLES[0];
  const currentPresetDef = allPresets.find(p => p.id === activeConfig.presetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-2xl overflow-hidden print:shadow-none print:border-none print:w-auto flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="print:hidden bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-5 py-3 flex items-center justify-between text-slate-950 shadow-md">
          <div className="flex items-center space-x-2.5">
            <Tag className="w-5 h-5 text-slate-950" />
            <div>
              <h3 className="font-black text-sm tracking-wide uppercase">Warehouse Thermal Sticker</h3>
              <p className="text-[10px] font-bold text-slate-900/85">Synced with Global Setup Thermal Config</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-950 hover:bg-black/15 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style & Label Size Selector Controls Bar */}
        <div className="print:hidden px-4 sm:px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          {/* Design Style Selector */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-bold text-slate-300">Design Style:</span>
            <select
              value={selectedStyleId}
              onChange={e => handleSelectStyle(e.target.value as ThermalStyleId)}
              className="bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
            >
              {THERMAL_DESIGN_STYLES.map(style => (
                <option key={style.id} value={style.id} className="bg-slate-900 text-slate-200">
                  Style #{style.styleNumber}: {style.title}
                </option>
              ))}
            </select>
          </div>

          {/* Label Size Preset Selector */}
          <div className="flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-slate-300">Label Size:</span>
            <select
              value={selectedPresetId}
              onChange={e => handleSelectPreset(e.target.value as ThermalPresetId)}
              className="bg-slate-800 border border-slate-700 text-blue-300 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              {allPresets.map(preset => (
                <option key={preset.id} value={preset.id} className="bg-slate-900 text-slate-200">
                  {preset.name} ({preset.widthMm}&times;{preset.heightMm} mm) {preset.badge ? `- ${preset.badge}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Active Preset & Auto-Fit Dimension Pill */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono ml-auto">
            <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
              <ShieldCheck className="w-3 h-3" />
              <span>Auto-Fit (No Cut)</span>
            </span>
            <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
              {widthMm}&times;{heightMm} mm
            </span>
          </div>
        </div>

        {/* Live Sticker Preview Chamber */}
        <div className="p-4 sm:p-6 bg-slate-950 flex flex-col items-center justify-center overflow-y-auto">
          {/* Inject Scoped Style to guarantee 100% non-clipping responsive fit */}
          <style>{`
            #thermal-printable-area .label-box {
              width: 100% !important;
              height: 100% !important;
              max-height: 100% !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              padding: 2mm !important;
              overflow: hidden !important;
            }
            #thermal-printable-area svg {
              max-width: 100% !important;
              max-height: 100% !important;
            }
          `}</style>

          {/* Proportional Thermal Paper Sticker Card */}
          <div
            id="thermal-printable-area"
            className="bg-white text-black shadow-2xl rounded border-2 border-dashed border-slate-500 overflow-hidden select-none flex flex-col print:border-none print:shadow-none print:m-0 transition-all duration-200"
            style={{
              width: `${previewWidthPx}px`,
              height: `${previewHeightPx}px`,
              maxWidth: '100%'
            }}
            dangerouslySetInnerHTML={{ __html: livePreviewHtml }}
          />

          {/* Piece Metadata Summary Bar */}
          <div className="w-full mt-4 bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">SKU Barcode</span>
                <span className="font-mono font-bold text-amber-400 truncate block">{activeConfig.skuBarcode}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Garment Size</span>
                <span className="font-black text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 inline-block tracking-wider">
                  {activeConfig.size}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Brand / Category</span>
                <span className="text-slate-300 truncate block">{activeConfig.brandName || activeConfig.category}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Retail Price</span>
                <span className="font-black text-emerald-400">AED {activeConfig.priceAed.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Controls / Footer */}
        <div className="print:hidden px-5 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            <span>Preset: <strong className="text-blue-300">{currentPresetDef?.name || `${widthMm}x${heightMm}mm`}</strong></span>
            <span className="mx-2">&bull;</span>
            <span>Style: <strong className="text-amber-300">{currentStyleDef.title}</strong></span>
          </div>

          <div className="flex items-center space-x-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-2 px-5 py-2 text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 rounded-lg shadow-lg hover:shadow-amber-500/20 transition-all transform active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sticker</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
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

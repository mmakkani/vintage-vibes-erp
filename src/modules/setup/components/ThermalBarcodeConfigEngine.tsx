import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer,
  ExternalLink,
  Settings,
  Sparkles,
  Layers,
  Tag,
  Barcode,
  QrCode,
  Building2,
  Phone,
  FileText,
  Scale,
  DollarSign,
  Maximize2,
  CheckCircle2,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  Package,
  Radio,
  ShieldCheck,
  Leaf,
  Eye,
  Zap
} from 'lucide-react';
import {
  ThermalEngineConfig,
  DEFAULT_THERMAL_ENGINE_CONFIG,
  THERMAL_PRESETS,
  ThermalPresetId,
  THERMAL_DESIGN_STYLES,
  ThermalStyleId
} from '../thermal/thermalTypes.ts';
import {
  openThermalPrintPopup,
  generateBarcodeSvgString,
  generateQrCodeSvgString
} from '../thermal/thermalPopupManager.ts';
import { renderLabelHtml } from '../thermal/thermalTemplates.ts';

interface ThermalBarcodeConfigEngineProps {
  defaultCompanyProfile?: {
    companyName?: string;
    trnTaxNo?: string;
    phone?: string;
    logoUrl?: string;
  } | null;
}

export const ThermalBarcodeConfigEngine: React.FC<ThermalBarcodeConfigEngineProps> = ({
  defaultCompanyProfile
}) => {
  // Load initial config from localStorage or defaults
  const [config, setConfig] = useState<ThermalEngineConfig>(() => {
    try {
      const saved = localStorage.getItem('vintage_thermal_engine_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_THERMAL_ENGINE_CONFIG, ...parsed };
      }
    } catch (e) {
      console.error('Failed to parse saved thermal config:', e);
    }
    return {
      ...DEFAULT_THERMAL_ENGINE_CONFIG,
      companyName: defaultCompanyProfile?.companyName || DEFAULT_THERMAL_ENGINE_CONFIG.companyName,
      trn: defaultCompanyProfile?.trnTaxNo || DEFAULT_THERMAL_ENGINE_CONFIG.trn,
      phone: defaultCompanyProfile?.phone || DEFAULT_THERMAL_ENGINE_CONFIG.phone,
      logoUrl: defaultCompanyProfile?.logoUrl || DEFAULT_THERMAL_ENGINE_CONFIG.logoUrl
    };
  });

  // Sync if defaultCompanyProfile changes and local state hasn't customized company name
  useEffect(() => {
    if (defaultCompanyProfile?.companyName && !localStorage.getItem('vintage_thermal_engine_config')) {
      setConfig(prev => ({
        ...prev,
        companyName: defaultCompanyProfile.companyName || prev.companyName,
        trn: defaultCompanyProfile.trnTaxNo || prev.trn,
        phone: defaultCompanyProfile.phone || prev.phone,
        logoUrl: defaultCompanyProfile.logoUrl || prev.logoUrl
      }));
    }
  }, [defaultCompanyProfile]);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('vintage_thermal_engine_config', JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save thermal config:', e);
    }
  }, [config]);

  // UI States
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('All');
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState<'fit' | '100%'>('fit');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Preset Selection Handler
  const handleSelectPreset = (presetId: ThermalPresetId) => {
    const preset = THERMAL_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setConfig(prev => ({
        ...prev,
        presetId: preset.id,
        widthIn: preset.widthIn,
        heightIn: preset.heightIn,
        widthMm: preset.widthMm,
        heightMm: preset.heightMm
      }));
    }
  };

  // Custom Dimensions Handler (Inches <-> MM auto-conversion)
  const handleWidthInChange = (val: number) => {
    const safeVal = Math.max(0.5, Math.min(12, val || 0.5));
    const convertedMm = Math.round(safeVal * 25.4);
    setConfig(prev => ({
      ...prev,
      presetId: 'custom',
      widthIn: safeVal,
      widthMm: convertedMm
    }));
  };

  const handleHeightInChange = (val: number) => {
    const safeVal = Math.max(0.5, Math.min(12, val || 0.5));
    const convertedMm = Math.round(safeVal * 25.4);
    setConfig(prev => ({
      ...prev,
      presetId: 'custom',
      heightIn: safeVal,
      heightMm: convertedMm
    }));
  };

  const handleWidthMmChange = (val: number) => {
    const safeMm = Math.max(12, Math.min(300, val || 12));
    const convertedIn = parseFloat((safeMm / 25.4).toFixed(2));
    setConfig(prev => ({
      ...prev,
      presetId: 'custom',
      widthMm: safeMm,
      widthIn: convertedIn
    }));
  };

  const handleHeightMmChange = (val: number) => {
    const safeMm = Math.max(12, Math.min(300, val || 12));
    const convertedIn = parseFloat((safeMm / 25.4).toFixed(2));
    setConfig(prev => ({
      ...prev,
      presetId: 'custom',
      heightMm: safeMm,
      heightIn: convertedIn
    }));
  };

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
          notify('Company logo uploaded successfully!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Quick Preset Samples
  const handleApplyScenarioPreset = (scenario: 'denim' | 'luxury' | 'bale' | 'live') => {
    if (scenario === 'denim') {
      setConfig(prev => ({
        ...prev,
        brandName: "Levi's Strauss & Co.",
        itemName: "Vintage 1994 501 Selvedge Trucker Jacket",
        category: "Apparel / Raw Denim",
        priceAed: 245.0,
        skuBarcode: "VV-DENIM-501-94",
        weightValue: 480,
        weightUnit: 'g',
        size: "L (Chest 42\")",
        styleId: 'modern_minimalist',
        presetId: '4x2',
        widthIn: 4.0,
        heightIn: 2.0,
        widthMm: 100,
        heightMm: 50
      }));
      notify('Loaded Denim Hangtag Scenario');
    } else if (scenario === 'luxury') {
      setConfig(prev => ({
        ...prev,
        brandName: "Burberry London",
        itemName: "Heritage Trench Coat Vintage Archive",
        category: "Outerwear / Collector Grade",
        priceAed: 1850.0,
        skuBarcode: "VV-LUX-BUR-778",
        weightValue: 1.15,
        weightUnit: 'kg',
        size: "M / 40 UK",
        styleId: 'boutique_luxury',
        presetId: '3x2',
        widthIn: 3.0,
        heightIn: 2.0,
        widthMm: 76,
        heightMm: 50
      }));
      notify('Loaded Luxury Boutique Scenario');
    } else if (scenario === 'bale') {
      setConfig(prev => ({
        ...prev,
        itemName: "Bale S-Grade Sweatshirts & Hoodies 90s",
        category: "Wholesale Bulk Bale",
        brandName: "Vintage Mix (USA)",
        priceAed: 4200.0,
        skuBarcode: "BALE-2026-DXB-991",
        weightValue: 45.5,
        weightUnit: 'kg',
        batchNo: "BALE-LOT-049",
        styleId: 'master_bale_bulk',
        presetId: '4x4',
        widthIn: 4.0,
        heightIn: 4.0,
        widthMm: 100,
        heightMm: 100
      }));
      notify('Loaded Wholesale Bulk Bale Scenario');
    } else if (scenario === 'live') {
      setConfig(prev => ({
        ...prev,
        brandName: "Carhartt Workwear",
        itemName: "Detroit Jacket J97 Moss Green",
        category: "Apparel / Live Drop",
        priceAed: 690.0,
        skuBarcode: "LIVE-DROP-CAR-04",
        weightValue: 750,
        weightUnit: 'g',
        boothId: "STUDIO BOOTH #01",
        buyerHandle: "@dxb_streetwear_collector",
        consigneeName: "Rashid Al Falasi",
        customerPhone: "+971 52 901 8844",
        styleId: 'big_price_live_drop',
        presetId: '4x2',
        widthIn: 4.0,
        heightIn: 2.0,
        widthMm: 100,
        heightMm: 50
      }));
      notify('Loaded Live Stream Drop Scenario');
    }
  };

  // Launch Dedicated Print Window
  const handleLaunchPrintPopup = (styleIdToPrint?: ThermalStyleId) => {
    const targetStyleId = styleIdToPrint || config.styleId;
    openThermalPrintPopup(config, targetStyleId);
  };

  // Reset to Defaults
  const handleResetToDefaults = () => {
    if (confirm('Reset Thermal Barcode & Label Engine to default factory settings?')) {
      setConfig(DEFAULT_THERMAL_ENGINE_CONFIG);
      localStorage.removeItem('vintage_thermal_engine_config');
      notify('Reset to default configurations');
    }
  };

  // Filter styles by category
  const categories = ['All', 'Retail', 'Luxury', 'Industrial', 'Logistics', 'Live Selling', 'Eco & Security'];
  const filteredStyles = activeCategoryFilter === 'All'
    ? THERMAL_DESIGN_STYLES
    : THERMAL_DESIGN_STYLES.filter(s => s.category === activeCategoryFilter);

  const selectedStyleDef = THERMAL_DESIGN_STYLES.find(s => s.id === config.styleId) || THERMAL_DESIGN_STYLES[0];

  // REAL-TIME LIVE INLINE PREVIEW GENERATION
  const barcodeSvg = useMemo(() => generateBarcodeSvgString(config.skuBarcode), [config.skuBarcode]);
  const qrSvg = useMemo(() => {
    const qrPayload = JSON.stringify({
      sku: config.skuBarcode,
      item: config.itemName,
      price: config.priceAed,
      inv: config.invoiceNo,
      brand: config.brandName,
      company: config.companyName
    });
    return generateQrCodeSvgString(qrPayload, 80);
  }, [config.skuBarcode, config.itemName, config.priceAed, config.invoiceNo, config.brandName, config.companyName]);

  const livePreviewHtml = useMemo(() => {
    return renderLabelHtml(config.styleId, { config, barcodeSvg, qrSvg });
  }, [config, barcodeSvg, qrSvg]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Fast Action Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-4 sm:p-5 rounded-xl border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Printer className="w-5 h-5" />
              </span>
              <div>
                <h2 className="font-serif font-black text-lg sm:text-xl tracking-wide flex items-center gap-2">
                  <span>Thermal Barcode & Label Engine</span>
                  <span className="text-[10px] font-mono font-bold bg-blue-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                    Live Preview & Direct Print
                  </span>
                </h2>
                <p className="text-xs text-slate-300">
                  Instant live preview for all 15 layouts. Click any style or button to launch the dedicated popup window.
                </p>
              </div>
            </div>
          </div>

          {/* Primary CTA: Dedicated Popup Window */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-open-print-popup"
              type="button"
              onClick={() => handleLaunchPrintPopup()}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-2 cursor-pointer transform active:scale-95"
            >
              <Printer className="w-4 h-4 text-blue-200" />
              <span>Open Print Window</span>
              <ExternalLink className="w-3.5 h-3.5 text-blue-300" />
            </button>

            <button
              type="button"
              onClick={handleResetToDefaults}
              title="Reset to factory settings"
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Summary Pill Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 text-[11px]">Selected:</span>
            <span className="font-bold text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded border border-blue-700/50 font-mono">
              {config.widthIn}" &times; {config.heightIn}" ({config.widthMm} &times; {config.heightMm} mm)
            </span>
            <span className="font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
              Style #{selectedStyleDef.styleNumber}: {selectedStyleDef.title}
            </span>
            {config.autoPrint ? (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/50 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Auto-Print on Window Open
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">
                Manual Print on Open
              </span>
            )}
          </div>

          {/* Quick Scenario Fill Buttons */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 mr-1">Presets:</span>
            <button
              onClick={() => handleApplyScenarioPreset('denim')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold cursor-pointer"
            >
              👖 Denim
            </button>
            <button
              onClick={() => handleApplyScenarioPreset('luxury')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold cursor-pointer"
            >
              ✨ Luxury
            </button>
            <button
              onClick={() => handleApplyScenarioPreset('bale')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold cursor-pointer"
            >
              📦 Bulk Bale
            </button>
            <button
              onClick={() => handleApplyScenarioPreset('live')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold cursor-pointer"
            >
              🔴 Live Drop
            </button>
          </div>
        </div>
      </div>

      {copiedNotification && (
        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* PROMINENT LIVE INTERACTIVE THERMAL PREVIEW POD */}
      {/* ========================================================= */}
      {(() => {
        // Calculate exact proportional dimensions for screen preview
        const aspectRatio = (config.widthMm || 100) / (config.heightMm || 50);
        let previewWidthPx: number;
        let previewHeightPx: number;

        if (previewScale === '100%') {
          // 1:1 Physical Screen Millimeter Approximation (3.78px per mm ~ 96 DPI)
          previewWidthPx = Math.round(config.widthMm * 3.78);
          previewHeightPx = Math.round(config.heightMm * 3.78);
        } else {
          // Proportional Auto-Fit preserving strict physical aspect ratio
          const MAX_WIDTH = 460;
          const MAX_HEIGHT = 380;

          if (aspectRatio >= 1) {
            // Horizontal or Square (2x1, 3x2, 4x2, 4x4)
            previewWidthPx = Math.min(MAX_WIDTH, Math.max(260, Math.round(config.widthMm * 3.8)));
            previewHeightPx = Math.round(previewWidthPx / aspectRatio);

            if (previewHeightPx > MAX_HEIGHT) {
              previewHeightPx = MAX_HEIGHT;
              previewWidthPx = Math.round(previewHeightPx * aspectRatio);
            }
          } else {
            // Tall Vertical (4x6 waybill, ratio ~0.67)
            previewHeightPx = MAX_HEIGHT;
            previewWidthPx = Math.round(previewHeightPx * aspectRatio);
          }
        }

        const orientationLabel = aspectRatio > 1.05
          ? 'Landscape (Horizontal)'
          : aspectRatio < 0.95
          ? 'Portrait (Vertical Waybill)'
          : 'Square (1:1)';

        return (
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-xl border border-slate-800 p-4 sm:p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm tracking-wide text-white flex items-center gap-2 flex-wrap">
                    <span>Live Instant Thermal Preview</span>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                      Style #{selectedStyleDef.styleNumber}: {selectedStyleDef.title}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                      {config.widthIn}" &times; {config.heightIn}" ({config.widthMm}&times;{config.heightMm} mm)
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Preview dimensions morph in real-time as you switch sizes. Orientation: <strong className="text-slate-300">{orientationLabel}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Scale View Mode Toggle */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewScale('fit')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      previewScale === 'fit' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Proportional Fit with fixed bounds"
                  >
                    Proportional Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewScale('100%')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      previewScale === '100%' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                    title="1:1 Physical Millimeter Screen Scale"
                  >
                    1:1 Real Size (mm)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleLaunchPrintPopup()}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md hover:shadow-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer transform active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Window Now</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Scaled Thermal Label Canvas Preview with Visual Rulers */}
            <div className="py-6 flex flex-col items-center justify-center bg-slate-900/70 rounded-lg border border-slate-800/90 my-3 overflow-x-auto">
              {/* Top Width Ruler */}
              <div
                className="flex items-center justify-between text-[10px] font-mono font-bold text-amber-400 mb-1.5 px-1 transition-all duration-300"
                style={{ width: `${previewWidthPx}px` }}
              >
                <span>&larr;</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-200">
                  Width: {config.widthIn}" ({config.widthMm} mm)
                </span>
                <span>&rarr;</span>
              </div>

              {/* Main Card with Left Height Ruler */}
              <div className="flex items-center gap-2">
                {/* Left Height Indicator */}
                <div
                  className="flex flex-col items-center justify-between text-[10px] font-mono font-bold text-amber-400 h-full py-1 transition-all duration-300"
                  style={{ height: `${previewHeightPx}px` }}
                >
                  <span>&uarr;</span>
                  <span
                    className="bg-slate-800 px-1 py-0.5 rounded border border-slate-700 text-slate-200 text-[9px] [writing-mode:vertical-lr] rotate-180"
                  >
                    Height: {config.heightIn}" ({config.heightMm} mm)
                  </span>
                  <span>&darr;</span>
                </div>

                {/* The Proportional Thermal Paper Sticker Card */}
                <div
                  className="bg-white text-black shadow-2xl rounded border-2 border-dashed border-slate-400 overflow-hidden transition-all duration-300 relative select-none flex flex-col"
                  style={{
                    width: `${previewWidthPx}px`,
                    height: `${previewHeightPx}px`
                  }}
                  dangerouslySetInnerHTML={{ __html: livePreviewHtml }}
                />
              </div>

              {/* Bottom Quick Info */}
              <div className="text-[10px] text-slate-400 mt-3 font-mono flex items-center gap-3 flex-wrap justify-center">
                <span>Preset: <strong className="text-slate-200">{config.presetId.toUpperCase()}</strong></span>
                <span>&bull;</span>
                <span>Aspect Ratio: <strong className="text-amber-300">{aspectRatio.toFixed(2)}:1</strong></span>
                <span>&bull;</span>
                <span>Canvas: <strong className="text-slate-200">{previewWidthPx}px &times; {previewHeightPx}px</strong></span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main Grid: Left Control Panel (Config Fields) & Right Style Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ========================================================= */}
        {/* LEFT COLUMN: CONTROL PANEL & CONFIGURATION FIELDS (5 COLS) */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* SECTION 1: COMPANY BRANDING */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                1. Company Branding
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                  Company Display Name *
                </label>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={e => setConfig({ ...config, companyName: e.target.value })}
                  placeholder="e.g. VINTAGE VIBES DUBAI FZ-LLC"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Contact / Phone No.
                  </label>
                  <input
                    type="text"
                    value={config.phone}
                    onChange={e => setConfig({ ...config, phone: e.target.value })}
                    placeholder="+971 4 883 9120"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    TRN Tax Registration No.
                  </label>
                  <input
                    type="text"
                    value={config.trn}
                    onChange={e => setConfig({ ...config, trn: e.target.value })}
                    placeholder="100482910300003"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Logo Upload & URL */}
              <div>
                <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                  Company Logo (Upload File or URL)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={config.logoUrl}
                    onChange={e => setConfig({ ...config, logoUrl: e.target.value })}
                    placeholder="https://... or upload local logo"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1 font-bold text-[11px] cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                  </button>
                  {config.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, logoUrl: '' })}
                      className="px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-[11px] font-bold cursor-pointer"
                      title="Remove Logo"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {config.logoUrl && (
                  <div className="mt-2 p-1.5 bg-slate-50 border border-slate-200 rounded flex items-center gap-2">
                    <img
                      src={config.logoUrl}
                      alt="Logo preview"
                      className="h-6 w-auto max-w-[100px] object-contain"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">Logo attached</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: TRANSACTION & ITEM METADATA */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  2. Item & Transaction Metadata
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Live Barcode Link</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    SKU / Barcode *
                  </label>
                  <input
                    type="text"
                    value={config.skuBarcode}
                    onChange={e => setConfig({ ...config, skuBarcode: e.target.value })}
                    placeholder="e.g. VV-DENIM-501-88"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Sales Invoice No.
                  </label>
                  <input
                    type="text"
                    value={config.invoiceNo}
                    onChange={e => setConfig({ ...config, invoiceNo: e.target.value })}
                    placeholder="INV-2026-8891"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                  Item Name / Title *
                </label>
                <input
                  type="text"
                  value={config.itemName}
                  onChange={e => setConfig({ ...config, itemName: e.target.value })}
                  placeholder="e.g. Vintage 1994 Levi's 501 Trucker Jacket"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={config.brandName}
                    onChange={e => setConfig({ ...config, brandName: e.target.value })}
                    placeholder="e.g. Levi's Strauss & Co."
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Category / Department
                  </label>
                  <input
                    type="text"
                    value={config.category}
                    onChange={e => setConfig({ ...config, category: e.target.value })}
                    placeholder="e.g. Apparel / Heavy Denim"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Weight */}
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Piece Weight
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      value={config.weightValue}
                      onChange={e => setConfig({ ...config, weightValue: parseFloat(e.target.value) || 0 })}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <select
                      value={config.weightUnit}
                      onChange={e => setConfig({ ...config, weightUnit: e.target.value as 'g' | 'kg' })}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 bg-slate-50 font-bold text-slate-700 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="g">Grams (g)</option>
                      <option value="kg">Kilograms (KG)</option>
                    </select>
                  </div>
                </div>

                {/* Price AED */}
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1 uppercase">
                    Price (AED) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1.5 text-slate-500 font-bold text-xs">AED</span>
                    <input
                      type="number"
                      step="0.01"
                      value={config.priceAed}
                      onChange={e => setConfig({ ...config, priceAed: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-12 pr-3 py-1.5 rounded-lg border border-slate-300 font-mono font-black text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Collapsible Advanced Contextual Fields */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdvancedMetadata(!showAdvancedMetadata)}
                  className="flex items-center justify-between w-full text-slate-600 hover:text-slate-900 font-bold text-[11px] uppercase tracking-wider py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Specialized Contextual Fields (Size, Live Stream, Buyer, Fabric)</span>
                  </span>
                  {showAdvancedMetadata ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvancedMetadata && (
                  <div className="mt-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Size Badge</label>
                        <input
                          type="text"
                          value={config.size}
                          onChange={e => setConfig({ ...config, size: e.target.value })}
                          placeholder="L / 42"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Booth ID (Live)</label>
                        <input
                          type="text"
                          value={config.boothId}
                          onChange={e => setConfig({ ...config, boothId: e.target.value })}
                          placeholder="STUDIO BOOTH #03"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Buyer Handle</label>
                        <input
                          type="text"
                          value={config.buyerHandle}
                          onChange={e => setConfig({ ...config, buyerHandle: e.target.value })}
                          placeholder="@buyer_instagram"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Consignee Name</label>
                        <input
                          type="text"
                          value={config.consigneeName}
                          onChange={e => setConfig({ ...config, consigneeName: e.target.value })}
                          placeholder="Fatima Al Mansoori"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Batch / Bale ID</label>
                        <input
                          type="text"
                          value={config.batchNo}
                          onChange={e => setConfig({ ...config, batchNo: e.target.value })}
                          placeholder="BALE-2026-DXB"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Archive Serial No.</label>
                        <input
                          type="text"
                          value={config.serialNumber}
                          onChange={e => setConfig({ ...config, serialNumber: e.target.value })}
                          placeholder="VV-ARC-1994-081"
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-600 text-[10px] uppercase mb-0.5">Fabric Composition (Eco Tag)</label>
                      <input
                        type="text"
                        value={config.fabricComposition}
                        onChange={e => setConfig({ ...config, fabricComposition: e.target.value })}
                        placeholder="100% Selvedge Indigo Cotton Denim"
                        className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: PAPER DIMENSIONS (INCHES & MM) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Paper Dimensions (Inches & MM)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {config.widthIn}" &times; {config.heightIn}" ({config.widthMm}&times;{config.heightMm}mm)
              </span>
            </div>

            {/* Default Presets (6 Buttons/Cards) */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                Default Dimension Presets:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THERMAL_PRESETS.map(preset => {
                  const isSelected = config.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-200 shadow-xs'
                          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 font-mono">{preset.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {preset.widthMm}&times;{preset.heightMm} mm
                      </div>
                      <div className="text-[9px] font-semibold text-purple-800 uppercase tracking-tight mt-1 truncate">
                        {preset.badge}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Size Option with Real-Time Two-Way Auto-Conversion */}
            <div className="mt-3.5 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-slate-700 text-[11px] uppercase">
                  Custom Sizing Option
                </label>
                {config.presetId === 'custom' && (
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                    Active Custom Size
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {/* Width Inputs */}
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Width:
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.5"
                        max="12"
                        value={config.widthIn}
                        onChange={e => handleWidthInChange(parseFloat(e.target.value))}
                        className="w-full px-2 py-1 pr-5 rounded border border-slate-300 font-mono text-xs font-bold bg-white text-slate-900"
                      />
                      <span className="absolute right-1.5 top-1 text-[10px] font-bold text-slate-400">in</span>
                    </div>
                    <span className="text-slate-400 font-bold">&harr;</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="12"
                        max="300"
                        value={config.widthMm}
                        onChange={e => handleWidthMmChange(parseInt(e.target.value, 10))}
                        className="w-full px-2 py-1 pr-6 rounded border border-slate-300 font-mono text-xs font-bold bg-white text-slate-900"
                      />
                      <span className="absolute right-1 top-1 text-[9px] font-bold text-slate-400">mm</span>
                    </div>
                  </div>
                </div>

                {/* Height Inputs */}
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Height:
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.5"
                        max="12"
                        value={config.heightIn}
                        onChange={e => handleHeightInChange(parseFloat(e.target.value))}
                        className="w-full px-2 py-1 pr-5 rounded border border-slate-300 font-mono text-xs font-bold bg-white text-slate-900"
                      />
                      <span className="absolute right-1.5 top-1 text-[10px] font-bold text-slate-400">in</span>
                    </div>
                    <span className="text-slate-400 font-bold">&harr;</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="12"
                        max="300"
                        value={config.heightMm}
                        onChange={e => handleHeightMmChange(parseInt(e.target.value, 10))}
                        className="w-full px-2 py-1 pr-6 rounded border border-slate-300 font-mono text-xs font-bold bg-white text-slate-900"
                      />
                      <span className="absolute right-1 top-1 text-[9px] font-bold text-slate-400">mm</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: AUTOMATION & BEHAVIOR */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100">
              <Settings className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                4. Automation Toggle & Behavior
              </h3>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/60 border border-amber-200 cursor-pointer hover:bg-amber-50 transition-colors">
              <input
                id="checkbox-auto-print"
                type="checkbox"
                checked={config.autoPrint}
                onChange={e => setConfig({ ...config, autoPrint: e.target.checked })}
                className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  'Auto-Print on Open' Checkbox
                </span>
                <span className="text-[11px] text-slate-600 leading-normal">
                  When enabled, opening the print window immediately triggers the native browser print dialog (Ctrl+P) without requiring manual interaction.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: 15 PROFESSIONAL LABEL DESIGN STYLES (7 COLS) */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            {/* Header & Category Filters */}
            <div className="pb-3 mb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-serif font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>15 Professional Label Design Styles</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Click any style card to instantly switch the live preview above, or click "Open Window" to print!
                </p>
              </div>

              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-full self-start">
                15 Styles Ready
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight whitespace-nowrap transition-colors cursor-pointer ${
                    activeCategoryFilter === cat
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 15 Styles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
              {filteredStyles.map(style => {
                const isSelected = config.styleId === style.id;
                return (
                  <div
                    key={style.id}
                    onClick={() => {
                      setConfig(prev => ({ ...prev, styleId: style.id }));
                      notify(`Selected Style #${style.styleNumber}: ${style.title}`);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-300 shadow-md transform scale-[1.01]'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/80 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      {/* Top Bar: Number, Category & Selection Check */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-5 h-5 rounded-full font-mono font-bold text-[10px] flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'
                          }`}>
                            {style.styleNumber}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-tight">
                            {style.category}
                          </span>
                        </div>

                        {isSelected ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" /> Selected Live
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 group-hover:text-slate-600 font-semibold">
                            Click to preview
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                        <span>{style.title}</span>
                        {isSelected && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      </h4>

                      {/* Tagline */}
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                        {style.tagline}
                      </p>

                      {/* Feature Badges */}
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {style.highlights.map((badge, bIdx) => (
                          <span
                            key={bIdx}
                            className="text-[9px] font-medium font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Action Footer for Card */}
                    <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">
                        {config.widthIn}" &times; {config.heightIn}"
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfig(prev => ({ ...prev, styleId: style.id }));
                          handleLaunchPrintPopup(style.id);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Open Window</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Execution Bar */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-3 rounded-lg">
              <div>
                <span className="text-xs text-slate-600 block">
                  Active Style: <strong className="text-slate-900">Style #{selectedStyleDef.styleNumber}: {selectedStyleDef.title}</strong>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Opens dedicated popup window (width=520,height=700) with auto-print capability.
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleLaunchPrintPopup()}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer self-stretch sm:self-auto"
              >
                <Printer className="w-4 h-4" />
                <span>Launch Print Window</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

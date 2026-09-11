import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JsBarcode from 'jsbarcode';
import {
  DEFAULT_HARDWARE_GADGETS,
  DEFAULT_WORKSTATIONS
} from '../hardwareCatalog.ts';
import {
  HardwareGadget,
  WorkstationProfile,
  ModuleAffinity,
  GadgetCategory,
  BarcodeScanTestEvent
} from '../hardware.types.ts';
import { hardwareAudio } from '../../../utils/hardwareAudio.ts';
import { ThermalBarcodeSticker } from '../../../components/ThermalBarcodeSticker.tsx';
import { openThermalLabelPrintWindow, openThermalShippingWaybillPrintWindow } from '../../../utils/thermalPrinter.ts';
import {
  Cpu,
  Scale,
  Printer,
  Barcode,
  Tablet,
  Mic,
  Wrench,
  Wifi,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Sliders,
  ExternalLink,
  Zap,
  Info,
  Layers,
  Sparkles,
  Smartphone,
  Radio,
  FileText,
  Copy,
  Check
} from 'lucide-react';

interface HardwareGadgetsHubProps {
  onNotify?: (text: string, type: 'success' | 'error' | 'info') => void;
}

export const HardwareGadgetsHub: React.FC<HardwareGadgetsHubProps> = ({ onNotify }) => {
  // Navigation tabs within hardware hub
  const [activeTab, setActiveTab] = useState<'catalog' | 'workstations' | 'diagnostics' | 'thermal_customization'>('catalog');
  const [selectedModule, setSelectedModule] = useState<ModuleAffinity | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<GadgetCategory | 'all'>('all');

  // Workstation state
  const [workstations, setWorkstations] = useState<WorkstationProfile[]>(() => {
    try {
      const saved = localStorage.getItem('vibe_workstations_list');
      return saved ? JSON.parse(saved) : DEFAULT_WORKSTATIONS;
    } catch {
      return DEFAULT_WORKSTATIONS;
    }
  });

  const [activeWorkstationId, setActiveWorkstationId] = useState<string>(() => {
    try {
      return localStorage.getItem('vibe_active_workstation_id') || 'ws-sorting-01';
    } catch {
      return 'ws-sorting-01';
    }
  });

  // Gadgets master list
  const [gadgets, setGadgets] = useState<HardwareGadget[]>(() => {
    try {
      const saved = localStorage.getItem('vibe_hardware_gadgets');
      return saved ? JSON.parse(saved) : DEFAULT_HARDWARE_GADGETS;
    } catch {
      return DEFAULT_HARDWARE_GADGETS;
    }
  });

  const [selectedGadgetForModal, setSelectedGadgetForModal] = useState<HardwareGadget | null>(null);

  // Diagnostics: Digital Scale Test Bench state
  const [simulatedWeight, setSimulatedWeight] = useState<number>(340); // grams
  const [tareOffset, setTareOffset] = useState<number>(0);
  const [weightUnit, setWeightUnit] = useState<'G' | 'KG' | 'LB'>('G');
  const [isScaleStreaming, setIsScaleStreaming] = useState<boolean>(true);
  const [isScaleStable, setIsScaleStable] = useState<boolean>(true);
  const [webSerialSupported, setWebSerialSupported] = useState<boolean>(false);
  const [serialPortStatus, setSerialPortStatus] = useState<string>('Disconnected (Simulated Stream Active)');

  // Diagnostics: Barcode Scanner Test Bench state
  const [scanInput, setScanInput] = useState<string>('');
  const [scanLogs, setScanLogs] = useState<BarcodeScanTestEvent[]>([
    {
      id: 'scan-init-01',
      timestamp: new Date().toLocaleTimeString(),
      rawBarcode: 'VV-IGP20260001-0001',
      detectedFormat: 'CODE128 (Piece ID)',
      latencyMs: 32,
      success: true,
      prefixMatched: true
    }
  ]);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const keyStrokeTimerRef = useRef<{ firstCharTime: number; keyCount: number } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Diagnostics: Thermal Print Test Bench state
  const [testPrintType, setTestPrintType] = useState<'50x25mm_TAG' | '4x6_WAYBILL' | '80mm_RECEIPT'>('50x25mm_TAG');
  const testBarcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Thermal Customization Settings state
  const [thermalSettings, setThermalSettings] = useState(() => {
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
        showBarcode: true,
        printerModel: 'Zebra ZD421 Direct Thermal (USB/BT)'
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
        showBarcode: true,
        printerModel: 'Zebra ZD421 Direct Thermal (USB/BT)'
      };
    }
  });

  const [selectedSampleForSticker, setSelectedSampleForSticker] = useState<any | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('vibe_thermal_settings', JSON.stringify(thermalSettings));
    } catch {}
  }, [thermalSettings]);

  // 15 Sample Barcodes for Thermal Printing Gallery
  const thermalSampleItems = [
    { id: 'SMP-01', code: 'VV-IGP-501-001', name: "LEVI'S 501 VINTAGE DENIM TRUCKER", category: 'Denim Jacket', size: 'L', price: 380, grade: 'A+' },
    { id: 'SMP-02', code: 'VV-IGP-CRT-002', name: 'CARHARTT DETROIT DUCK CANVAS JACKET', category: 'Workwear', size: 'XL', price: 450, grade: 'A+' },
    { id: 'SMP-03', code: 'VV-IGP-NK9-003', name: 'NIKE 90S CENTER SWOOSH GRAPHIC TEE', category: 'Apparel', size: 'M', price: 160, grade: 'A' },
    { id: 'SMP-04', code: 'VV-IGP-RLB-004', name: 'RALPH LAUREN POLO BEAR CABLE KNIT', category: 'Knitwear', size: 'L', price: 290, grade: 'Grail' },
    { id: 'SMP-05', code: 'VV-IGP-PTL-005', name: 'PATAGONIA 1994 SILK HAWAIIN SHIRT', category: 'Shirts', size: 'XL', price: 220, grade: 'Grail' },
    { id: 'SMP-06', code: 'VV-IGP-HD8-006', name: 'HARLEY DAVIDSON 1989 EAGLE BIKER TEE', category: 'Apparel', size: 'L', price: 190, grade: 'Vintage' },
    { id: 'SMP-07', code: 'VV-IGP-BRB-007', name: 'BURBERRY CHECKERED WOOL TRENCH COAT', category: 'Outerwear', size: '42', price: 850, grade: 'Archive' },
    { id: 'SMP-08', code: 'VV-IGP-CHP-008', name: 'CHAMPION REVERSE WEAVE 90S HOODIE', category: 'Sweatshirt', size: 'XL', price: 240, grade: 'A' },
    { id: 'SMP-09', code: 'VV-IGP-ADS-009', name: 'ADIDAS TREFOIL VINTAGE WINDBREAKER', category: 'Sportswear', size: 'M', price: 180, grade: 'A' },
    { id: 'SMP-10', code: 'VV-IGP-ARC-010', name: "ARC'TERYX VINTAGE GORE-TEX FLEECE", category: 'Outdoor', size: 'L', price: 410, grade: 'Grail' },
    { id: 'SMP-11', code: 'VV-IGP-STS-011', name: 'STUSSY 90S TRIBE GRAPHIC SWEATSHIRT', category: 'Streetwear', size: 'L', price: 260, grade: 'Street' },
    { id: 'SMP-12', code: 'VV-IGP-TNF-012', name: 'THE NORTH FACE 90S NUPTSE 700 PUFFER', category: 'Outerwear', size: 'XL', price: 590, grade: 'Winter' },
    { id: 'SMP-13', code: 'VV-IGP-DRM-013', name: 'DR. MARTENS 1460 VINTAGE LEATHER BOOTS', category: 'Footwear', size: '43', price: 480, grade: 'Footwear' },
    { id: 'SMP-14', code: 'VV-IGP-TMY-014', name: 'TOMMY HILFIGER 90S SAILING GEAR JACKET', category: 'Retro Sport', size: 'L', price: 340, grade: 'Sport' },
    { id: 'SMP-15', code: 'VV-IGP-SUP-015', name: 'SUPREME 1999 BOX LOGO HEAVYWEIGHT HOODIE', category: 'Supreme Grail', size: 'L', price: 950, grade: 'Museum' }
  ];

  // Check Web Serial support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      setWebSerialSupported(true);
    }
  }, []);

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem('vibe_workstations_list', JSON.stringify(workstations));
    } catch {}
  }, [workstations]);

  useEffect(() => {
    try {
      localStorage.setItem('vibe_active_workstation_id', activeWorkstationId);
    } catch {}
  }, [activeWorkstationId]);

  useEffect(() => {
    try {
      localStorage.setItem('vibe_hardware_gadgets', JSON.stringify(gadgets));
    } catch {}
  }, [gadgets]);

  // Render barcode in test printer
  useEffect(() => {
    if (testBarcodeSvgRef.current) {
      try {
        const sampleCode = testPrintType === '50x25mm_TAG' 
          ? 'VV-IGP20260001-0003' 
          : testPrintType === '4x6_WAYBILL' 
          ? 'EXP-DXB-98410294' 
          : 'RCP-2026-0907';

        JsBarcode(testBarcodeSvgRef.current, sampleCode, {
          format: 'CODE128',
          width: testPrintType === '4x6_WAYBILL' ? 2.2 : 1.6,
          height: testPrintType === '4x6_WAYBILL' ? 56 : 38,
          displayValue: true,
          font: 'monospace',
          fontSize: 12,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (err) {
        console.error('Barcode render error in hardware test:', err);
      }
    }
  }, [testPrintType]);

  // Handle Barcode Scanner Keystrokes & Latency
  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();

    if (!keyStrokeTimerRef.current) {
      keyStrokeTimerRef.current = { firstCharTime: now, keyCount: 1 };
    } else {
      keyStrokeTimerRef.current.keyCount += 1;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const code = scanInput.trim();
      if (!code) return;

      const duration = Math.round(now - keyStrokeTimerRef.current.firstCharTime);
      keyStrokeTimerRef.current = null;

      // Audio feedback
      if (soundEnabled) {
        hardwareAudio.playScannerBeep(2400, 0.08);
      }

      const isHardwareScanner = duration < 120 && code.length > 3;

      let format = 'CODE128 (Standard Barcode)';
      let prefixMatched = false;
      if (code.startsWith('VV-IGP') || code.startsWith('pie-')) {
        format = 'Piece Barcode Tag (Finished Stock)';
        prefixMatched = true;
      } else if (code.startsWith('BALE-') || code.startsWith('BL-')) {
        format = 'Bale Gross Identifier (Inward Freight)';
        prefixMatched = true;
      } else if (code.startsWith('SGP-') || code.startsWith('EXP-') || code.startsWith('AWB-')) {
        format = 'Dispatch Waybill / Gate Pass';
        prefixMatched = true;
      }

      const newLog: BarcodeScanTestEvent = {
        id: `scan-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        rawBarcode: code,
        detectedFormat: format,
        latencyMs: duration,
        success: true,
        prefixMatched
      };

      setScanLogs(prev => [newLog, ...prev.slice(0, 19)]);
      setScanInput('');
    }
  };

  // Scale Tare Handler
  const handleTare = () => {
    if (soundEnabled) {
      hardwareAudio.playTareClick();
    }
    setTareOffset(simulatedWeight);
    setIsScaleStable(false);
    setTimeout(() => setIsScaleStable(true), 300);
  };

  const handleZero = () => {
    if (soundEnabled) {
      hardwareAudio.playTareClick();
    }
    setTareOffset(0);
    setIsScaleStable(false);
    setTimeout(() => setIsScaleStable(true), 300);
  };

  // Calculate Net Weight
  const netWeightGrams = Math.max(0, simulatedWeight - tareOffset);
  const displayWeight = weightUnit === 'G' 
    ? netWeightGrams.toFixed(1)
    : weightUnit === 'KG'
    ? (netWeightGrams / 1000).toFixed(3)
    : (netWeightGrams * 0.00220462).toFixed(3);

  // Trigger test print
  const handleTriggerPrint = () => {
    if (soundEnabled) {
      hardwareAudio.playSuccessChime();
    }
    const svgHtml = testBarcodeSvgRef.current ? testBarcodeSvgRef.current.outerHTML : '';
    if (testPrintType === '4x6_WAYBILL') {
      const win = openThermalShippingWaybillPrintWindow({
        waybillNo: 'EXP-DXB-98410294',
        courier: 'Aramex / Emirates Post',
        isCOD: true,
        totalAmount: 415.00,
        shippingFee: 25.00,
        invoiceNo: 'INV-2026-0891',
        customerName: 'Sara Al-Maktoum',
        customerPhone: '+971 50 284 9182',
        shippingAddress: 'Villa 42, Al Wasl Road, Jumeirah 2, Dubai',
        shippingBearer: 'BUYER',
        paymentStatus: 'UNPAID_PENDING_COD',
        items: [
          { description: 'Vintage Fleece Lined Denim Jacket (M)', barcode: 'VV-IGP20260001-0003', finalAmount: 380, unitPrice: 380 },
          { description: 'Courier Priority Shipping', unitPrice: 25, finalAmount: 25 }
        ],
        svgHtml
      });
      if (!win) window.print();
    } else {
      const win = openThermalLabelPrintWindow({
        itemCode: 'VV-IGP20260001-0003',
        description: 'Vintage Fleece Lined Denim Jacket (M)',
        category: 'Denim Jacket',
        brand: "Levi's",
        grade: 'A+',
        retailPriceAed: 380.00,
        batchNo: 'BALE-2026-DXB',
        companyName: thermalSettings.companyName,
        trn: thermalSettings.trnNumber,
        printSize: testPrintType === '80mm_RECEIPT' ? '80x50mm' : '50x25mm',
        svgHtml,
        settings: thermalSettings
      });
      if (!win) window.print();
    }
  };

  // Connect Web Serial API if supported
  const handleConnectSerial = async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API is only supported on Chromium-based browsers (Chrome, Edge, Opera) over HTTPS/localhost.');
      return;
    }
    try {
      setSerialPortStatus('Requesting RS-232 / USB Serial Port...');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      setSerialPortStatus('Port Connected (9600 Baud, 8-N-1)');
      if (onNotify) onNotify('Digital bench scale connected via Web Serial', 'success');
    } catch (err: any) {
      setSerialPortStatus('Connection cancelled or permission denied');
    }
  };

  // Filtered gadgets
  const filteredGadgets = gadgets.filter(g => {
    const matchModule = selectedModule === 'all' || g.module === selectedModule;
    const matchCategory = selectedCategory === 'all' || g.category === selectedCategory;
    return matchModule && matchCategory;
  });

  const activeWorkstation = workstations.find(w => w.id === activeWorkstationId) || workstations[0];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div id="hardware-gadgets-hub" className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-stone-900 to-amber-950 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-amber-500/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Cpu className="w-5 h-5 text-amber-300" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Hardware Gadgets & Workstations Hub
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Operational Hardware Hub
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-300 max-w-3xl leading-relaxed">
              Tailored industrial peripherals for every vintage ERP module: digital crane scales, continuous gram bench scales, 2"x1" and 4"x6" thermal direct printers, wearable ring scanners, and live studio equipment.
            </p>
          </div>

          {/* Quick Workstation Selector Badge */}
          <div className="bg-stone-800/80 backdrop-blur-xs p-3 rounded-xl border border-stone-700/80 shrink-0 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-400 text-stone-950">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-stone-400">Current Workstation</div>
              <select
                id="active-workstation-select"
                value={activeWorkstationId}
                onChange={e => setActiveWorkstationId(e.target.value)}
                className="bg-transparent text-xs font-bold text-amber-300 focus:outline-none cursor-pointer pr-4"
              >
                {workstations.map(w => (
                  <option key={w.id} value={w.id} className="bg-stone-900 text-white">
                    {w.stationName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sub Navigation Bar */}
        <div className="mt-5 pt-4 border-t border-stone-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="subtab-hardware-catalog"
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'catalog'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Module Gadgets & Tools Catalog ({gadgets.length})</span>
            </button>

            <button
              type="button"
              id="subtab-hardware-diagnostics"
              onClick={() => setActiveTab('diagnostics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'diagnostics'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Interactive Hardware Test Bench</span>
            </button>

            <button
              type="button"
              id="subtab-hardware-workstations"
              onClick={() => setActiveTab('workstations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'workstations'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Station Profiles & Peripherals ({workstations.length})</span>
            </button>

            <button
              type="button"
              id="subtab-thermal-customization"
              onClick={() => setActiveTab('thermal_customization')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'thermal_customization'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Thermal Customization & 15 Sample Barcodes</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="px-2.5 py-1 rounded-lg text-xs bg-stone-800/80 hover:bg-stone-700 text-stone-300 flex items-center gap-1.5 cursor-pointer border border-stone-700"
              title="Toggle hardware scanner & scale sound effects"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-300" /> : <VolumeX className="w-3.5 h-3.5 text-stone-500" />}
              <span>{soundEnabled ? 'Audio Feedback: ON' : 'Muted'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: CATALOG OF GADGETS & TOOLS BY MODULE */}
      {activeTab === 'catalog' && (
        <div className="space-y-5">
          {/* Module Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">Filter Module:</span>
              <button
                type="button"
                onClick={() => setSelectedModule('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'all'
                    ? 'bg-stone-900 text-amber-300 shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                All Modules ({gadgets.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedModule('purchase')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'purchase'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Inward Port & Bales
              </button>
              <button
                type="button"
                onClick={() => setSelectedModule('sorting')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'sorting'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Bale Sorting Terminal
              </button>
              <button
                type="button"
                onClick={() => setSelectedModule('live')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'live'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Live Selling Studio
              </button>
              <button
                type="button"
                onClick={() => setSelectedModule('dispatch')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'dispatch'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Logistics & Dispatch
              </button>
              <button
                type="button"
                onClick={() => setSelectedModule('pos_warehouse')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedModule === 'pos_warehouse'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Storefront POS & Racks
              </button>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Device Type:</span>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value as any)}
                className="text-xs bg-stone-50 border border-stone-300 rounded-lg px-2.5 py-1 font-medium focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                <option value="all">All Devices & Tools</option>
                <option value="scale">Scales (Crane & Bench)</option>
                <option value="printer">Thermal Label Printers</option>
                <option value="scanner">Barcode Scanners & Rings</option>
                <option value="tablet_pda">Tablets & Android PDAs</option>
                <option value="audio_video">Studio Audio & Lighting</option>
                <option value="tool">Specialized Warehouse Tools</option>
              </select>
            </div>
          </div>

          {/* Gadgets Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredGadgets.map(gadget => {
              const categoryIcon = 
                gadget.category === 'scale' ? <Scale className="w-4 h-4 text-emerald-600" /> :
                gadget.category === 'printer' ? <Printer className="w-4 h-4 text-blue-600" /> :
                gadget.category === 'scanner' ? <Barcode className="w-4 h-4 text-purple-600" /> :
                gadget.category === 'tablet_pda' ? <Tablet className="w-4 h-4 text-amber-600" /> :
                gadget.category === 'audio_video' ? <Mic className="w-4 h-4 text-rose-600" /> :
                <Wrench className="w-4 h-4 text-stone-600" />;

              const moduleBadgeColor = 
                gadget.module === 'purchase' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                gadget.module === 'sorting' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                gadget.module === 'live' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                gadget.module === 'dispatch' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                'bg-purple-50 text-purple-800 border-purple-200';

              const moduleLabel = 
                gadget.module === 'purchase' ? 'Inward Port Freight' :
                gadget.module === 'sorting' ? 'Bale Sorting Bench' :
                gadget.module === 'live' ? 'Live Commerce Studio' :
                gadget.module === 'dispatch' ? 'Logistics & Dispatch' :
                'Storefront POS & Racks';

              return (
                <motion.div
                  key={gadget.id}
                  id={`gadget-card-${gadget.id}`}
                  whileHover={{ y: -2 }}
                  className="bg-white rounded-xl border border-stone-200 shadow-2xs hover:shadow-md transition-all p-4 flex flex-col justify-between"
                >
                  <div>
                    {/* Header line */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-stone-100 border border-stone-200">
                          {categoryIcon}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-stone-900 leading-snug">{gadget.name}</h3>
                          <div className="text-[11px] text-stone-500 font-medium">{gadget.brand}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${moduleBadgeColor} shrink-0`}>
                        {moduleLabel}
                      </span>
                    </div>

                    {/* Recommended Model Pill */}
                    <div className="mt-2.5 p-2 rounded-lg bg-stone-50 border border-stone-200/80">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                        Recommended Hardware Model:
                      </div>
                      <div className="text-xs font-semibold text-stone-900">
                        {gadget.recommendedModel}
                      </div>
                    </div>

                    {/* Purpose Statement */}
                    <p className="mt-2.5 text-xs text-stone-600 leading-relaxed">
                      {gadget.purpose}
                    </p>

                    {/* Specifications List */}
                    <div className="mt-3 space-y-1">
                      {gadget.specifications.slice(0, 3).map((spec, i) => (
                        <div key={i} className="text-[11px] text-stone-600 flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{spec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer Action Bar */}
                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-[11px] text-stone-500">
                      <Wifi className="w-3 h-3 text-stone-400" />
                      <span className="font-medium">{gadget.connectivity.replace('_', ' ')}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedGadgetForModal(gadget)}
                      className="px-2.5 py-1 text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      <span>Full Spec & Guide</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: INTERACTIVE HARDWARE TEST BENCH (SCALE, SCANNER & PRINTER) */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Zero-Dependency Real-Time Hardware Testing Bench:</span>
              <p className="mt-0.5 text-amber-800">
                Test your physical USB/Bluetooth handheld barcode scanners, digital bench scales, and thermal printers directly inside the browser. Web Audio provides authentic audible scan chirps, and Web Serial API connects to physical RS-232 COM ports.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* BENCH 1: DIGITAL BENCH SCALE EMULATOR & SERIAL FEED */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                    <Scale className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-stone-900 text-sm">Digital Bench Scale Terminal</h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isScaleStable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800 animate-pulse'
                }`}>
                  {isScaleStable ? 'STABLE' : 'WEIGHING...'}
                </span>
              </div>

              {/* Digital 7-segment LED Display */}
              <div className="bg-stone-950 p-4 rounded-xl text-center border-2 border-stone-800 relative shadow-inner">
                <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 mb-1">
                  <span>RS-232 STREAM: 9600 BAUD</span>
                  <span className={isScaleStable ? 'text-emerald-400' : 'text-amber-400'}>
                    ● {isScaleStable ? 'NET STABLE' : 'MOTION'}
                  </span>
                </div>

                <div className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-emerald-400 py-1 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                  {displayWeight}
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-emerald-500/80 mt-1">
                  <span>TARE: {tareOffset.toFixed(1)}g</span>
                  <span className="font-bold uppercase">{weightUnit}</span>
                </div>
              </div>

              {/* Controls: Zero, Tare, Units */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  id="scale-tare-button"
                  onClick={handleTare}
                  className="px-3 py-2 bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95"
                >
                  TARE (0.0)
                </button>
                <button
                  type="button"
                  id="scale-zero-button"
                  onClick={handleZero}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  RESET ZERO
                </button>
                <div className="flex rounded-lg overflow-hidden border border-stone-300">
                  <button
                    type="button"
                    onClick={() => setWeightUnit('G')}
                    className={`flex-1 text-[11px] font-bold ${weightUnit === 'G' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700'}`}
                  >
                    G
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('KG')}
                    className={`flex-1 text-[11px] font-bold ${weightUnit === 'KG' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700'}`}
                  >
                    KG
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('LB')}
                    className={`flex-1 text-[11px] font-bold ${weightUnit === 'LB' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700'}`}
                  >
                    LB
                  </button>
                </div>
              </div>

              {/* Presets Slider */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Simulate Garment Weight:</span>
                  <span className="font-bold font-mono">{simulatedWeight} grams</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="3500"
                  step="5"
                  value={simulatedWeight}
                  onChange={e => {
                    setSimulatedWeight(Number(e.target.value));
                    setIsScaleStable(false);
                    setTimeout(() => setIsScaleStable(true), 250);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => { setSimulatedWeight(195); setIsScaleStable(false); setTimeout(() => setIsScaleStable(true), 200); }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-stone-100 hover:bg-stone-200 rounded text-stone-700"
                  >
                    Vintage Tee (195g)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSimulatedWeight(540); setIsScaleStable(false); setTimeout(() => setIsScaleStable(true), 200); }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-stone-100 hover:bg-stone-200 rounded text-stone-700"
                  >
                    Fleece Sweatshirt (540g)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSimulatedWeight(1180); setIsScaleStable(false); setTimeout(() => setIsScaleStable(true), 200); }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-stone-100 hover:bg-stone-200 rounded text-stone-700"
                  >
                    Sherpa Denim (1180g)
                  </button>
                </div>
              </div>

              {/* Web Serial COM Port Button */}
              <div className="pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleConnectSerial}
                  className="w-full px-3 py-2 bg-stone-50 hover:bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Wifi className="w-3.5 h-3.5 text-stone-600" />
                  <span>Connect RS-232 / USB COM Port</span>
                </button>
                <div className="text-[10px] text-stone-500 text-center mt-1 truncate">
                  Status: {serialPortStatus}
                </div>
              </div>
            </div>

            {/* BENCH 2: BARCODE SCANNER TEST BENCH */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                    <Barcode className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-stone-900 text-sm">Handheld Scanner Test Bench</h3>
                </div>
                <span className="text-[10px] font-mono text-stone-500">USB HID / BT Wedge</span>
              </div>

              {/* Scan Capture Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  Scan Any Garment or Waybill Barcode:
                </label>
                <div className="relative">
                  <input
                    ref={scanInputRef}
                    type="text"
                    id="scanner-test-input"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={handleScanKeyDown}
                    placeholder="Aim physical barcode scanner here..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-stone-50 border-2 border-dashed border-purple-300 rounded-xl focus:border-purple-600 focus:bg-white focus:outline-none"
                  />
                  <Barcode className="w-4 h-4 text-purple-500 absolute left-3 top-2.5" />
                </div>
                <div className="text-[10px] text-stone-500 flex items-center justify-between">
                  <span>Press ENTER or pull scanner trigger</span>
                  <span className="text-emerald-700 font-semibold">Audio Beep Active</span>
                </div>
              </div>

              {/* Quick Sample Trigger Buttons */}
              <div className="space-y-1 pt-1">
                <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Test Sample Barcodes:</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setScanInput('VV-IGP20260001-0003');
                      if (soundEnabled) hardwareAudio.playScannerBeep();
                      setScanLogs(prev => [{
                        id: `test-${Date.now()}`,
                        timestamp: new Date().toLocaleTimeString(),
                        rawBarcode: 'VV-IGP20260001-0003',
                        detectedFormat: 'Piece Barcode Tag (Finished Stock)',
                        latencyMs: 24,
                        success: true,
                        prefixMatched: true
                      }, ...prev]);
                      setScanInput('');
                    }}
                    className="px-2 py-0.5 text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200 rounded hover:bg-purple-100 cursor-pointer"
                  >
                    VV-IGP20260001-0003
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScanInput('EXP-DXB-98410294');
                      if (soundEnabled) hardwareAudio.playScannerBeep();
                      setScanLogs(prev => [{
                        id: `test-${Date.now()}`,
                        timestamp: new Date().toLocaleTimeString(),
                        rawBarcode: 'EXP-DXB-98410294',
                        detectedFormat: 'Dispatch Waybill / Gate Pass',
                        latencyMs: 18,
                        success: true,
                        prefixMatched: true
                      }, ...prev]);
                      setScanInput('');
                    }}
                    className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                  >
                    EXP-DXB-98410294
                  </button>
                </div>
              </div>

              {/* Scan Logs History */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-bold">Recent Scanned Telemetry:</span>
                  <button
                    type="button"
                    onClick={() => setScanLogs([])}
                    className="text-[10px] text-stone-400 hover:text-stone-600"
                  >
                    Clear History
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
                  {scanLogs.length === 0 ? (
                    <div className="text-stone-400 text-center py-4 italic text-xs">
                      No scans recorded yet. Trigger your scanner above.
                    </div>
                  ) : (
                    scanLogs.map(log => (
                      <div
                        key={log.id}
                        className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <div className="font-bold text-stone-900 truncate">{log.rawBarcode}</div>
                          <div className="text-[10px] text-stone-500 truncate">{log.detectedFormat}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                            {log.latencyMs} ms
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* BENCH 3: THERMAL PRINTER PREVIEW & TEST RENDER */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-100 text-blue-800">
                    <Printer className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-stone-900 text-sm">Thermal Label Print Previewer</h3>
                </div>
                <select
                  value={testPrintType}
                  onChange={e => setTestPrintType(e.target.value as any)}
                  className="text-xs bg-stone-100 border border-stone-300 rounded px-2 py-0.5 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="50x25mm_TAG">2" x 1" Garment Tag</option>
                  <option value="4x6_WAYBILL">4" x 6" Shipping Waybill</option>
                  <option value="80mm_RECEIPT">80mm POS Receipt</option>
                </select>
              </div>

              {/* Rendered Label Box (WYSIWYG) */}
              <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 flex items-center justify-center min-h-[220px]">
                {testPrintType === '50x25mm_TAG' && (
                  <div className="bg-white p-2.5 rounded shadow-sm border border-stone-300 w-56 text-center text-stone-900 font-sans">
                    <div className="text-[11px] font-black uppercase tracking-wider">VINTAGE VIBE AL QUOZ</div>
                    <div className="text-[9px] text-stone-600">Vintage Fleece Lined Denim Jacket (M)</div>
                    <div className="my-1 flex justify-center">
                      <svg ref={testBarcodeSvgRef} className="max-w-full"></svg>
                    </div>
                    <div className="flex items-center justify-between text-[9px] px-1 font-bold pt-1 border-t border-stone-200">
                      <span>GRADE A+ (VINTAGE GRAIL)</span>
                      <span className="text-xs font-black">AED 380.00</span>
                    </div>
                  </div>
                )}

                {testPrintType === '4x6_WAYBILL' && (
                  <div className="bg-white p-3 rounded shadow-sm border border-stone-300 w-64 text-stone-900 text-[10px]">
                    <div className="flex items-center justify-between pb-1 border-b border-stone-300 font-bold">
                      <span className="font-black text-xs">ARAMEX / EMIRATES POST</span>
                      <span className="bg-stone-900 text-white px-1.5 py-0.2 rounded text-[9px]">COD DISPATCH</span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="text-[9px] text-stone-500 font-bold">CONSIGNEE:</div>
                      <div className="font-bold">Sara Al-Maktoum (+971 50 284 9182)</div>
                      <div className="text-[9px] text-stone-600">Villa 42, Al Wasl Road, Jumeirah 2, Dubai</div>
                    </div>
                    <div className="my-2 flex justify-center">
                      <svg ref={testBarcodeSvgRef} className="max-w-full"></svg>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-stone-300 font-bold">
                      <span>TOTAL COD COLLECT:</span>
                      <span className="text-xs font-black text-emerald-800">AED 415.00</span>
                    </div>
                  </div>
                )}

                {testPrintType === '80mm_RECEIPT' && (
                  <div className="bg-white p-3 rounded shadow-sm border border-stone-300 w-60 text-stone-900 text-[10px] font-mono">
                    <div className="text-center font-bold pb-1 border-b border-stone-300">
                      <div>VINTAGE VIBE LLC</div>
                      <div className="text-[9px] font-normal">TRN: 100482910400003</div>
                    </div>
                    <div className="py-2 space-y-1 border-b border-dashed border-stone-300 text-[9px]">
                      <div className="flex justify-between">
                        <span>1x Wrangler Denim M</span>
                        <span>AED 380.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span>5% UAE VAT</span>
                        <span>AED 19.00</span>
                      </div>
                    </div>
                    <div className="flex justify-between font-bold pt-1.5 text-xs">
                      <span>TOTAL PAID:</span>
                      <span>AED 399.00</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  id="thermal-print-test-trigger"
                  onClick={handleTriggerPrint}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Send Test Print to Thermal Device</span>
                </button>
                <div className="text-[10px] text-stone-500 text-center">
                  Uses native browser direct thermal formatting (no drivers needed)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: WORKSTATION PROFILES & PERIPHERAL ASSIGNMENTS */}
      {activeTab === 'workstations' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Configured Workstation Profiles</h3>
              <p className="text-xs text-stone-500">
                Define the physical peripherals, automatic printing rules, and tare offsets for each physical desk in the warehouse and showroom.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workstations.map(ws => {
              const isCurrent = ws.id === activeWorkstationId;
              return (
                <div
                  key={ws.id}
                  id={`workstation-card-${ws.id}`}
                  className={`p-5 rounded-2xl border transition-all ${
                    isCurrent
                      ? 'bg-amber-50/70 border-amber-400 shadow-sm ring-2 ring-amber-400/20'
                      : 'bg-white border-stone-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-stone-900 text-sm">{ws.stationName}</h4>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                            Active Machine
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">{ws.location} &bull; Operator: {ws.operatorName}</div>
                    </div>

                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveWorkstationId(ws.id);
                          if (onNotify) onNotify(`Switched active terminal to ${ws.stationName}`, 'info');
                        }}
                        className="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg cursor-pointer"
                      >
                        Set as Active
                      </button>
                    )}
                  </div>

                  {/* Assigned Gadgets */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-stone-200/80 text-xs">
                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                      <div className="text-[10px] font-bold uppercase text-stone-400 flex items-center gap-1">
                        <Scale className="w-3 h-3 text-emerald-600" />
                        <span>Scale</span>
                      </div>
                      <div className="font-semibold text-stone-800 text-[11px] truncate mt-1">
                        {ws.activeScaleId ? 'OHAUS / CAS Crane' : 'Not Needed'}
                      </div>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                      <div className="text-[10px] font-bold uppercase text-stone-400 flex items-center gap-1">
                        <Printer className="w-3 h-3 text-blue-600" />
                        <span>Printer</span>
                      </div>
                      <div className="font-semibold text-stone-800 text-[11px] truncate mt-1">
                        {ws.activePrinterId ? 'Zebra Direct Thermal' : 'None'}
                      </div>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-stone-200/60">
                      <div className="text-[10px] font-bold uppercase text-stone-400 flex items-center gap-1">
                        <Barcode className="w-3 h-3 text-purple-600" />
                        <span>Scanner</span>
                      </div>
                      <div className="font-semibold text-stone-800 text-[11px] truncate mt-1">
                        {ws.activeScannerId ? 'Wearable Ring / Gun' : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* Station Settings */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Tare Offset:</span>
                      <span className="font-mono font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-800">
                        {ws.scaleTareOffset}g
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ws.autoPrintOnExtract}
                          onChange={e => {
                            const updated = workstations.map(item =>
                              item.id === ws.id ? { ...item, autoPrintOnExtract: e.target.checked } : item
                            );
                            setWorkstations(updated);
                          }}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-[11px]">Auto-Print Tags</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ws.soundAlerts}
                          onChange={e => {
                            const updated = workstations.map(item =>
                              item.id === ws.id ? { ...item, soundAlerts: e.target.checked } : item
                            );
                            setWorkstations(updated);
                          }}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-[11px]">Sound FX</span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: THERMAL CUSTOMIZATION SETTINGS & 15 SAMPLE BARCODES GALLERY */}
      {activeTab === 'thermal_customization' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-100 text-blue-800">
                  <Printer className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-black text-stone-900 text-base">Thermal Printer Customization & Fields Configuration</h3>
                  <p className="text-xs text-stone-500">Configure label dimensions, header company details, printed fields, and test print across 15 standard barcode samples.</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                Connected to All Modules
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Print Size & Field Toggles */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 uppercase tracking-wider">
                    Thermal Print Size / Roll Format *
                  </label>
                  <select
                    value={thermalSettings.printSize}
                    onChange={e => setThermalSettings({ ...thermalSettings, printSize: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="40x30mm">40 x 30 mm (Mini Jewelry / Sleeve Tag)</option>
                    <option value="50x25mm">50 x 25 mm (Standard Apparel Barcode Tag)</option>
                    <option value="80x50mm">80 x 50 mm (Box / Bales Barcode Label)</option>
                    <option value="100x150mm">100 x 150 mm (Courier AWB / Shipping Waybill)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Company Name on Label</label>
                    <input
                      type="text"
                      value={thermalSettings.companyName}
                      onChange={e => setThermalSettings({ ...thermalSettings, companyName: e.target.value })}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">UAE TRN / Tax Reg Number</label>
                    <input
                      type="text"
                      value={thermalSettings.trnNumber}
                      onChange={e => setThermalSettings({ ...thermalSettings, trnNumber: e.target.value })}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <div className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-1">What to Print on Label (Field Toggles):</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showCompanyName}
                        onChange={e => setThermalSettings({ ...thermalSettings, showCompanyName: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Company Header</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showPrice}
                        onChange={e => setThermalSettings({ ...thermalSettings, showPrice: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Retail Price (AED)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showQtyWeight}
                        onChange={e => setThermalSettings({ ...thermalSettings, showQtyWeight: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Qty & Weight (g/kg)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showDescription}
                        onChange={e => setThermalSettings({ ...thermalSettings, showDescription: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Description & Grade</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showLogo}
                        onChange={e => setThermalSettings({ ...thermalSettings, showLogo: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Company Logo / Icon</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thermalSettings.showBarcode}
                        onChange={e => setThermalSettings({ ...thermalSettings, showBarcode: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-800">Code-128 Barcode</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Preview Card */}
              <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200 flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Live Custom Thermal Label Preview</div>
                <div className="bg-white p-4 rounded-xl shadow-md border-2 border-dashed border-stone-400 w-64 text-stone-900 font-sans">
                  {thermalSettings.showCompanyName && (
                    <div className="text-center border-b border-stone-200 pb-1 mb-2">
                      {thermalSettings.showLogo && <div className="text-[10px] text-amber-800 font-bold">🏷️ VINTAGE VIBES ERP</div>}
                      <div className="font-black text-xs uppercase">{thermalSettings.companyName}</div>
                      <div className="text-[8px] text-stone-500 font-mono">{thermalSettings.trnNumber} | {thermalSettings.printSize}</div>
                    </div>
                  )}

                  {thermalSettings.showDescription && (
                    <div className="mb-2">
                      <div className="font-bold text-xs uppercase leading-tight">LEVI'S 501 VINTAGE DENIM TRUCKER</div>
                      <div className="flex justify-between items-center text-[10px] text-stone-600 mt-1 font-semibold">
                        <span>Denim Jacket (L)</span>
                        <span className="bg-amber-100 text-amber-900 px-1 rounded">★ A+</span>
                      </div>
                    </div>
                  )}

                  {thermalSettings.showQtyWeight && (
                    <div className="text-[9px] font-mono bg-stone-100 px-2 py-0.5 rounded flex justify-between mb-2">
                      <span>QTY: 1 PCS</span>
                      <span>380g</span>
                    </div>
                  )}

                  {thermalSettings.showBarcode && (
                    <div className="bg-stone-50 p-1 rounded text-center my-1 font-mono text-[10px] tracking-wider border border-stone-200">
                      ||| | |||| ||||| |||
                      <div className="text-[9px]">VV-IGP-501-001</div>
                    </div>
                  )}

                  {thermalSettings.showPrice && (
                    <div className="border-t border-stone-200 pt-1 mt-1 flex justify-between items-end">
                      <span className="text-[9px] font-mono text-stone-500">BATCH: BALE-2026</span>
                      <span className="font-black text-sm">AED 380.00</span>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-stone-500 mt-3 text-center">
                  Settings are automatically persisted and applied across all POS, Sorting, & Shipping Thermal Printers.
                </div>
              </div>
            </div>
          </div>

          {/* 15 Print Sample Barcodes Gallery */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-900 text-base">At Least 15 Print Sample Barcodes & Sizes Gallery</h3>
                <p className="text-xs text-stone-500">Click "Print Sample Sticker" on any sample item to launch the thermal printer dialog with customized sizing.</p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-900 self-start">
                15 Diverse Samples Loaded
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {thermalSampleItems.map((sample, idx) => (
                <div key={sample.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200 hover:border-amber-400 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-800">
                        Sample #{idx + 1} ({sample.code})
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                        {sample.grade}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-stone-900 uppercase leading-snug">{sample.name}</h4>
                    <div className="flex items-center justify-between text-[11px] text-stone-600 mt-1">
                      <span>{sample.category} • Size: {sample.size}</span>
                      <span className="font-black text-stone-900">AED {sample.price.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-stone-200/80 flex items-center justify-between">
                    <span className="text-[10px] text-stone-500 font-mono">Size: {thermalSettings.printSize}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSampleForSticker({
                        itemCode: sample.code,
                        description: sample.name,
                        category: sample.category,
                        grade: sample.grade,
                        retailPriceAed: sample.price,
                        companyName: thermalSettings.companyName,
                        trn: thermalSettings.trnNumber
                      })}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print Sample Sticker</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Thermal Sticker Modal for Sample Printing */}
      {selectedSampleForSticker && (
        <ThermalBarcodeSticker
          sticker={selectedSampleForSticker}
          onClose={() => setSelectedSampleForSticker(null)}
        />
      )}

      {/* DETAIL MODAL FOR GADGET SPECIFICATIONS & BEST PRACTICES */}
      <AnimatePresence>
        {selectedGadgetForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-stone-900 text-white p-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Hardware Specification Guide
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">
                    {selectedGadgetForModal.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGadgetForModal(null)}
                  className="text-stone-400 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4 text-xs text-stone-700">
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Recommended Model / Part Number:
                  </div>
                  <div className="text-sm font-bold text-amber-950 mt-0.5">
                    {selectedGadgetForModal.recommendedModel}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-stone-900 mb-1">Operational Purpose:</h4>
                  <p className="text-stone-600 leading-relaxed">{selectedGadgetForModal.purpose}</p>
                </div>

                <div>
                  <h4 className="font-bold text-stone-900 mb-1">Hardware & Interface Specifications:</h4>
                  <div className="space-y-1.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    {selectedGadgetForModal.specifications.map((spec, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{spec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedGadgetForModal.maintenanceTip && (
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-start gap-2 text-blue-900">
                    <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Maintenance & Calibration Protocol:</span>
                      <p className="mt-0.5 text-blue-800">{selectedGadgetForModal.maintenanceTip}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
                <div className="text-[11px] text-stone-500">
                  Connection: <span className="font-bold text-stone-800">{selectedGadgetForModal.connectivity}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGadgetForModal(null)}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close Specification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InwardGatePass, PieceBreakdownItem, PurchaseInvoice } from '../purchase.types.ts';
import { ItemMaster, BrandMaster, LabelGrade, ShopMaster, CategoryMaster, SizeMaster } from '../../setup/setup.types.ts';
import { PurchaseEngine } from '../purchase.engine.ts';
import { StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import { openThermalLabelPrintWindow } from '../../../utils/thermalPrinter.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { CameraTagScannerModal, ExtractedTagData } from './CameraTagScannerModal.tsx';
import { StudioPhotoCaptureModal } from './StudioPhotoCaptureModal.tsx';
import {
  Scale,
  Sparkles,
  Barcode,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  DollarSign,
  Package,
  Layers,
  Save,
  Tag,
  ShieldCheck,
  Check,
  Camera,
  Lock,
  Search,
  ExternalLink,
  Zap,
  ArrowRight,
  Plus,
  Edit2,
  Smartphone,
  UploadCloud,
  Eye,
  RotateCw,
  Maximize2
} from 'lucide-react';

interface BaleSortingTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  bale?: InwardGatePass | null;
  allBales: InwardGatePass[];
  invoices: PurchaseInvoice[];
  items: ItemMaster[];
  brands: BrandMaster[];
  labels: LabelGrade[];
  shops: ShopMaster[];
  categories?: CategoryMaster[];
  sizes?: SizeMaster[];
  onPieceAdded: (piece: PieceBreakdownItem, updatedBale: InwardGatePass) => void;
  onPieceDeleted: (pieceId: string, updatedBale: InwardGatePass) => void;
  onSavePartial: (baleId: string) => void;
  onPostBale?: (baleId: string) => void;
  onSelectBale: (baleId: string) => void;
  onBaleCreated?: (bale: InwardGatePass) => void;
  onPrintSticker: (sticker: StickerData) => void;
}

const DEFAULT_CATEGORIES = [
  'Vintage Denim & Jeans',
  'Vintage Jackets & Outerwear',
  'Graphic T-Shirts & Band Tees',
  'Knitwear & Sweaters',
  'Hoodies & Sweatshirts',
  'Workwear & Cargo Pants',
  'Silk Blouses & Rayon Shirts',
  'Leather & Suede Jackets',
  'Vintage Sportswear & Track Tops',
  'Caps, Hats & Accessories',
  'Miscellaneous Curated'
];

export const BaleSortingTerminal: React.FC<BaleSortingTerminalProps> = ({
  isOpen,
  onClose,
  bale: initialBale,
  allBales,
  invoices,
  items,
  brands,
  labels,
  shops,
  categories = [],
  sizes = [],
  onPieceAdded,
  onPieceDeleted,
  onSavePartial,
  onPostBale,
  onSelectBale,
  onBaleCreated,
  onPrintSticker
}) => {
  // Dynamic categories, sizes, and quality grades fetched from Setup
  const [categoriesList, setCategoriesList] = useState<CategoryMaster[]>(categories);
  const [sizesList, setSizesList] = useState<SizeMaster[]>(sizes);
  const [labelsList, setLabelsList] = useState<LabelGrade[]>(labels);

  useEffect(() => {
    if (categories && categories.length > 0) {
      setCategoriesList(categories);
    } else {
      fetch('/api/setup/categories')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setCategoriesList(data);
        })
        .catch(() => {});
    }

    if (sizes && sizes.length > 0) {
      setSizesList(sizes);
    } else {
      fetch('/api/setup/sizes')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setSizesList(data);
        })
        .catch(() => {});
    }

    if (labels && labels.length > 0) {
      setLabelsList(labels);
    } else {
      fetch('/api/setup/labels')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setLabelsList(data);
        })
        .catch(() => {});
    }
  }, [categories, sizes, labels]);

  const availableCategories = useMemo(() => {
    if (Array.isArray(categoriesList) && categoriesList.length > 0) {
      const active = categoriesList
        .filter(c => typeof c === 'object' && c !== null ? c.status !== 'UNPOSTED' : true)
        .map(c => typeof c === 'object' && c !== null ? (c.name || c.code || '') : String(c || ''))
        .filter(Boolean);
      if (active.length > 0) return active;
    }
    return DEFAULT_CATEGORIES;
  }, [categoriesList]);

  const availableSizes = useMemo(() => {
    if (sizesList && sizesList.length > 0) {
      const active = sizesList.filter(s => s.status !== 'UNPOSTED');
      if (active.length > 0) return active;
    }
    return [
      { id: 'sz-1', code: 'XS', name: 'Extra Small' },
      { id: 'sz-2', code: 'S', name: 'Small' },
      { id: 'sz-3', code: 'M', name: 'Medium' },
      { id: 'sz-4', code: 'L', name: 'Large' },
      { id: 'sz-5', code: 'XL', name: 'Extra Large' },
      { id: 'sz-6', code: '2XL', name: 'Double XL' },
      { id: 'sz-7', code: '3XL', name: 'Triple XL' },
      { id: 'sz-8', code: 'Free Size', name: 'Free Size / OS' }
    ];
  }, [sizesList]);

  const availableQualityGrades = useMemo(() => {
    if (labelsList && labelsList.length > 0) {
      const active = labelsList.filter(l => l.status !== 'UNPOSTED');
      if (active.length > 0) return active;
    }
    return [
      { id: 'lbl-1', code: 'CREAM', name: 'Super Cream (Mint / Luxury Vintage)', qualityTier: 'CREAM' },
      { id: 'lbl-2', code: 'GRADE-A-BRD', name: 'Grade A (Branded Vintage)', qualityTier: 'GRADE_A' },
      { id: 'lbl-3', code: 'GRADE-A-NB', name: 'Grade A (Non-Brand / High Street)', qualityTier: 'NON_BRAND' },
      { id: 'lbl-4', code: 'GRADE-B', name: 'Grade B (Minor Flaws / Outlet Thrift)', qualityTier: 'GRADE_B' },
      { id: 'lbl-5', code: 'REWORK', name: 'Grade C / Rework (Cutting & Rag)', qualityTier: 'REWORK' }
    ];
  }, [labelsList]);

  // Active selected bale (either passed in or selected from dropdown/scanner)
  const [selectedBaleId, setSelectedBaleId] = useState<string>(initialBale?.id || allBales[0]?.id || '');
  const [baleBarcodeScanInput, setBaleBarcodeScanInput] = useState('');

  // Update selected bale if initialBale changes
  useEffect(() => {
    if (initialBale?.id) {
      setSelectedBaleId(initialBale.id);
    } else if (!selectedBaleId && allBales.length > 0) {
      setSelectedBaleId(allBales[0].id);
    }
  }, [initialBale, allBales]);

  const activeBale = useMemo(() => {
    return allBales.find(b => b.id === selectedBaleId) || initialBale || allBales[0] || null;
  }, [allBales, selectedBaleId, initialBale]);

  // Studio 3-Angle Photos (Front Look, Back Look, Tag OCR)
  const [showTagScanner, setShowTagScanner] = useState(false);
  const [showStudioCamera, setShowStudioCamera] = useState(false);
  const [studioCameraSlot, setStudioCameraSlot] = useState<'front' | 'back' | 'tag'>('front');
  const [previewLightboxImage, setPreviewLightboxImage] = useState<string | null>(null);
  const [tagImageUrl, setTagImageUrl] = useState<string | undefined>(undefined);
  const [frontImageUrl, setFrontImageUrl] = useState<string | undefined>(undefined);
  const [backImageUrl, setBackImageUrl] = useState<string | undefined>(undefined);

  // Auto print toggle
  const [autoPrintThermalOnAdd, setAutoPrintThermalOnAdd] = useState(true);

  // New Piece High-Speed Input Row Fields
  const [gramWeight, setGramWeight] = useState<string>('380');
  const [sellingPriceOverride, setSellingPriceOverride] = useState<string>('');
  const [brandTitle, setBrandTitle] = useState<string>("Levi's 501 Redline Wash");
  const [selectedCategory, setSelectedCategory] = useState<string>(() => availableCategories[0] || DEFAULT_CATEGORIES[0]);
  const [sizeScanned, setSizeScanned] = useState<string>('L');
  const [selectedGrade, setSelectedGrade] = useState<string>(labels[0]?.name || 'Grade A+ (Pristine Cream)');
  const [shopLocation, setShopLocation] = useState<string>(shops[0]?.name || 'Central Warehouse (Al Quoz)');
  const [countryOfOrigin, setCountryOfOrigin] = useState<string>('Made in USA');
  const [styleNotes, setStyleNotes] = useState<string>('Single stitch vintage wash');

  // Update selected category if availableCategories loads
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(availableCategories[0]);
    }
  }, [availableCategories]);

  // New Bale Quick-Register Modal inside terminal
  const [showQuickRegisterBale, setShowQuickRegisterBale] = useState(false);
  const [regInvoiceNo, setRegInvoiceNo] = useState('');
  const [regSupplier, setRegSupplier] = useState('');
  const [regCategory, setRegCategory] = useState('90s Vintage Denim & American Knitwear');
  const [regWeightKg, setRegWeightKg] = useState('50.0');
  const [regCostAed, setRegCostAed] = useState('3000');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Ref to automatically focus the gram weight input
  const gramInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeScanInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && gramInputRef.current) {
      gramInputRef.current.focus();
      gramInputRef.current.select();
    }
  }, [isOpen, selectedBaleId]);

  // Auto-calculated Cost per Gram
  const costPerGram = useMemo(() => {
    if (!activeBale) return 0.06;
    if (activeBale.costPerGram && activeBale.costPerGram > 0) return activeBale.costPerGram;
    return PurchaseEngine.calculateCostPerGram(activeBale.totalBaleCost || 0, activeBale.totalBaleWeight || 1);
  }, [activeBale]);

  // Auto-calculated piece cost based on current gram weight
  const numericGramWeight = Number(gramWeight) || 0;
  const autoPieceCostAed = useMemo(() => {
    return Number((numericGramWeight * costPerGram).toFixed(2));
  }, [numericGramWeight, costPerGram]);

  // Suggested retail price (3.5x - 4x cost)
  const suggestedSellingPrice = useMemo(() => {
    const cost = autoPieceCostAed;
    if (cost <= 0) return 120;
    return Math.max(75, Math.round((cost * 3.8) / 5) * 5);
  }, [autoPieceCostAed]);

  const effectiveSellingPrice = useMemo(() => {
    if (sellingPriceOverride && Number(sellingPriceOverride) > 0) {
      return Number(sellingPriceOverride);
    }
    return suggestedSellingPrice;
  }, [sellingPriceOverride, suggestedSellingPrice]);

  // Real-Time HUD Statistics
  const hudStats = useMemo(() => {
    if (!activeBale) {
      return {
        totalGrams: 50000,
        sortedGrams: 0,
        remainingGrams: 50000,
        piecesCount: 0,
        progressPercent: 0,
        isCompleted: false
      };
    }

    const totalKg = Number(activeBale.totalBaleWeight) || 0;
    const totalGrams = Math.round(totalKg * 1000);
    const sortedKg = Number(activeBale.brokenDownWeight) || 0;
    const sortedGrams = Math.round(sortedKg * 1000);
    const remainingGrams = Math.max(0, totalGrams - sortedGrams);
    const piecesCount = activeBale.pieces?.length || activeBale.pieceCount || 0;
    const progressPercent = totalGrams > 0 ? Math.min(100, Math.round((sortedGrams / totalGrams) * 100)) : 0;
    const isCompleted = progressPercent === 100 || activeBale.sortingStatus === 'FULLY_SORTED';

    return {
      totalGrams,
      sortedGrams,
      remainingGrams,
      piecesCount,
      progressPercent,
      isCompleted
    };
  }, [activeBale]);

  // Separate active/open bales from completed/locked bales
  const { activeBalesList, completedBalesList } = useMemo(() => {
    const active: InwardGatePass[] = [];
    const completed: InwardGatePass[] = [];
    (allBales || []).forEach(b => {
      const isDone = b.status === 'COMPLETED' ||
                     b.sortingStatus === 'FULLY_SORTED' ||
                     (b.brokenDownWeight > 0 && (b.remainingWeight !== undefined && b.remainingWeight <= 0));
      if (isDone) completed.push(b);
      else active.push(b);
    });
    return { activeBalesList: active, completedBalesList: completed };
  }, [allBales]);

  // Auto-generated Next Piece Barcode Preview
  const nextPieceBarcode = useMemo(() => {
    if (!activeBale) return 'BAL-01-P001';
    const nextIdx = (activeBale.pieces?.length || 0) + 1;
    const code = activeBale.baleCode || activeBale.gatePassNo;
    return PurchaseEngine.generatePieceBarcode(code, nextIdx);
  }, [activeBale]);

  // Apply OCR extracted tag data
  const handleApplyExtractedTag = (tagData: ExtractedTagData) => {
    if (tagData.brand) setBrandTitle(`${tagData.brand} ${tagData.style || ''}`.trim());
    if (tagData.size) setSizeScanned(tagData.size);
    if (tagData.countryOfOrigin) setCountryOfOrigin(tagData.countryOfOrigin);
    if (tagData.style) setStyleNotes(tagData.style);
    if (tagData.tagImageUrl) setTagImageUrl(tagData.tagImageUrl);

    luxuryAudio.playMechanicalClick();
    setFeedbackToast({
      text: `AI OCR parsed: ${tagData.brand} (Size: ${tagData.size}, ${tagData.countryOfOrigin})`,
      type: 'info'
    });

    if (gramInputRef.current) {
      gramInputRef.current.focus();
      gramInputRef.current.select();
    }
  };

  // Barcode scanner trigger for selecting/loading bale
  const handleBaleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = baleBarcodeScanInput.trim().toLowerCase();
    if (!clean) return;

    const matched = allBales.find(b =>
      (b.baleCode && b.baleCode.toLowerCase() === clean) ||
      b.gatePassNo.toLowerCase() === clean ||
      (b.purchaseInvoiceNo && b.purchaseInvoiceNo.toLowerCase() === clean)
    );

    if (matched) {
      // Check if bale is already completed and finalized
      const isCompleted = matched.status === 'COMPLETED' || 
                          matched.sortingStatus === 'FULLY_SORTED' ||
                          (matched.brokenDownWeight > 0 && (matched.remainingWeight !== undefined && matched.remainingWeight <= 0));

      if (isCompleted) {
        luxuryAudio.playCancelBeep();
        setBaleBarcodeScanInput('');
        setFeedbackToast({
          text: `❌ ERROR: Bale [${matched.baleCode || matched.gatePassNo}] is 100% COMPLETED and locked! Cannot scan or sort completed bales.`,
          type: 'error'
        });
        return;
      }

      luxuryAudio.playMechanicalClick();
      setSelectedBaleId(matched.id);
      onSelectBale(matched.id);
      setBaleBarcodeScanInput('');
      setFeedbackToast({ text: `Loaded Bale ${matched.baleCode || matched.gatePassNo}`, type: 'success' });
      setTimeout(() => {
        if (gramInputRef.current) {
          gramInputRef.current.focus();
          gramInputRef.current.select();
        }
      }, 100);
    } else {
      setFeedbackToast({ text: `No bale found matching "${baleBarcodeScanInput}"`, type: 'error' });
    }
  };

  // STEP 2: HIGH-SPEED ADD PIECE & NEXT (FAST-KEY ENGINE)
  const handleAddPieceAndNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeBale) {
      setFeedbackToast({ text: 'Please select a bale first', type: 'error' });
      return;
    }

    // Check if bale is already completed/finalized
    if (hudStats.isCompleted || activeBale.status === 'COMPLETED' || activeBale.sortingStatus === 'FULLY_SORTED') {
      luxuryAudio.playCancelBeep();
      setFeedbackToast({
        text: `🔒 Cannot add pieces: Bale ${activeBale.baleCode || activeBale.gatePassNo} is 100% COMPLETED and locked into inventory!`,
        type: 'error'
      });
      return;
    }

    if (numericGramWeight <= 0) {
      setFeedbackToast({ text: 'Please enter a valid gram weight (> 0g)', type: 'error' });
      if (gramInputRef.current) gramInputRef.current.focus();
      return;
    }

    setIsSubmitting(true);
    luxuryAudio.playMechanicalClick();

    const nextIdx = (activeBale.pieces?.length || 0) + 1;
    const barcode = nextPieceBarcode;
    const weightKg = Number((numericGramWeight / 1000).toFixed(3));

    const newPiecePayload: PieceBreakdownItem = {
      id: `pc-${Date.now()}-${nextIdx}`,
      gatePassId: activeBale.id,
      baleCode: activeBale.baleCode || activeBale.gatePassNo,
      barcode,
      itemName: selectedCategory,
      brandName: brandTitle.split(' ')[0] || "Levi's",
      brandTier: 'Vintage Curated',
      labelGrade: selectedGrade,
      shopLocation,
      weightGrams: numericGramWeight,
      weightKg,
      costPerGram,
      calculatedCostPrice: autoPieceCostAed,
      costPrice: autoPieceCostAed,
      estimatedPrice: effectiveSellingPrice,
      retailPriceAed: effectiveSellingPrice,
      sizeScanned,
      countryOfOrigin,
      style: styleNotes || brandTitle,
      frontImageUrl,
      backImageUrl,
      tagImageUrl,
      isSold: false,
      isTagged: true,
      createdAt: new Date().toISOString()
    };

    // Calculate local updated gate pass
    const currentPieces = [...(activeBale.pieces || []), newPiecePayload];
    const depletion = PurchaseEngine.calculateBaleDepletion(activeBale.totalBaleWeight, currentPieces);
    const updatedGatePass: InwardGatePass = {
      ...activeBale,
      brokenDownWeight: depletion.brokenDownWeightKg,
      remainingWeight: depletion.remainingWeightKg,
      pieceCount: depletion.pieceCount,
      pieces: currentPieces,
      sortingStatus: depletion.sortingStatus
    };

    // Attempt server sync in background, but immediately update UI
    try {
      fetch(`/api/purchase/gate-passes/${activeBale.id}/pieces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPiecePayload)
      }).catch(err => console.warn('Background sync saved to local offline state:', err));
    } catch {}

    // Invoke callback to persist in state and cache
    onPieceAdded(newPiecePayload, updatedGatePass);

    // Auto-prepare thermal barcode sticker
    const stickerPayload: StickerData = {
      itemCode: newPiecePayload.barcode,
      description: `${newPiecePayload.itemName} (${newPiecePayload.sizeScanned})`,
      category: newPiecePayload.itemName,
      size: newPiecePayload.sizeScanned,
      brand: newPiecePayload.brandName,
      grade: newPiecePayload.labelGrade,
      retailPriceAed: Number(newPiecePayload.estimatedPrice || effectiveSellingPrice) || 0,
      weightKg: newPiecePayload.weightKg,
      batchNo: activeBale.baleCode || activeBale.gatePassNo,
      date: new Date().toISOString().slice(0, 10),
      origin: newPiecePayload.countryOfOrigin,
      shopLocation: newPiecePayload.shopLocation
    };

    if (autoPrintThermalOnAdd) {
      try {
        openThermalLabelPrintWindow({
          itemCode: stickerPayload.itemCode,
          description: stickerPayload.description,
          category: stickerPayload.category,
          size: stickerPayload.size,
          brand: stickerPayload.brand,
          grade: stickerPayload.grade,
          retailPriceAed: stickerPayload.retailPriceAed,
          weightKg: stickerPayload.weightKg,
          batchNo: stickerPayload.batchNo,
          date: stickerPayload.date
        });
      } catch {}
    } else {
      onPrintSticker(stickerPayload);
    }

    setFeedbackToast({
      text: `✓ Added ${newPiecePayload.barcode} (${numericGramWeight}g) • AED ${autoPieceCostAed} cost`,
      type: 'success'
    });

    // Reset fields with smart defaults and refocus weight immediately
    setSellingPriceOverride('');
    setFrontImageUrl(undefined);
    setBackImageUrl(undefined);
    setTagImageUrl(undefined);
    setIsSubmitting(false);

    setTimeout(() => {
      if (gramInputRef.current) {
        gramInputRef.current.focus();
        gramInputRef.current.select();
      }
    }, 50);
  };

  // Delete piece handler
  const handleDeletePiece = (pieceId: string) => {
    if (!activeBale) return;
    luxuryAudio.playMechanicalClick();
    if (!confirm('Are you sure you want to remove this piece from the session?')) return;

    const remaining = (activeBale.pieces || []).filter(p => p.id !== pieceId);
    const depletion = PurchaseEngine.calculateBaleDepletion(activeBale.totalBaleWeight, remaining);
    const updatedGatePass: InwardGatePass = {
      ...activeBale,
      brokenDownWeight: depletion.brokenDownWeightKg,
      remainingWeight: depletion.remainingWeightKg,
      pieceCount: depletion.pieceCount,
      pieces: remaining,
      sortingStatus: depletion.sortingStatus
    };

    try {
      fetch(`/api/purchase/gate-passes/${activeBale.id}/pieces/${pieceId}`, {
        method: 'DELETE'
      }).catch(() => {});
    } catch {}

    onPieceDeleted(pieceId, updatedGatePass);
    setFeedbackToast({ text: 'Piece deleted; weights updated.', type: 'info' });
  };

  // Save as in-progress
  const handleSaveInProgress = () => {
    if (!activeBale) return;
    luxuryAudio.playMechanicalClick();
    onSavePartial(activeBale.id);
    setFeedbackToast({ text: `Bale ${activeBale.baleCode || activeBale.gatePassNo} saved as In-Progress.`, type: 'success' });
    setTimeout(onClose, 400);
  };

  // Finalize & Post Bale
  const handleFinalizeAndPost = () => {
    if (!activeBale) return;
    luxuryAudio.playMechanicalClick();
    if (!confirm(`Finalize and lock Bale ${activeBale.baleCode || activeBale.gatePassNo}? All ${hudStats.piecesCount} pieces will join active Finished Goods inventory.`)) {
      return;
    }
    if (onPostBale) {
      onPostBale(activeBale.id);
    }
    setTimeout(onClose, 400);
  };

  // Register a new raw bale right from the terminal
  const handleQuickRegisterBale = async (e: React.FormEvent) => {
    e.preventDefault();
    const wtNum = Number(regWeightKg) || 50;
    const costNum = Number(regCostAed) || 3000;
    const invNo = regInvoiceNo.trim() || `COMM-INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const supp = regSupplier.trim() || 'Direct Import Consignment';

    const localId = `igp-${Date.now()}`;
    const gatePassNo = `IGP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const baleCode = `BAL-${invNo.replace(/[^a-zA-Z0-9]/g, '')}-001`;
    const cpg = wtNum > 0 ? Number((costNum / (wtNum * 1000)).toFixed(6)) : 0.06;

    const newBale: InwardGatePass = {
      id: localId,
      gatePassNo,
      baleCode,
      baleCategory: regCategory,
      purchaseInvoiceId: 'inv-quick',
      purchaseInvoiceNo: invNo,
      supplierName: supp,
      date: new Date().toISOString().slice(0, 10),
      status: 'UNOPENED',
      sortingStatus: 'UNOPENED',
      totalBaleCost: costNum,
      totalBaleWeight: wtNum,
      costPerGram: cpg,
      brokenDownWeight: 0,
      remainingWeight: wtNum,
      pieceCount: 0,
      pieces: []
    };

    try {
      fetch('/api/purchase/gate-passes/bale-inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseInvoiceNo: invNo,
          supplierName: supp,
          totalBaleCostAed: costNum,
          totalBaleWeightKg: wtNum,
          baleCategory: regCategory
        })
      }).catch(() => {});
    } catch {}

    if (onBaleCreated) {
      onBaleCreated(newBale);
    }
    setSelectedBaleId(newBale.id);
    onSelectBale(newBale.id);
    setShowQuickRegisterBale(false);
    luxuryAudio.playMechanicalClick();
    setFeedbackToast({ text: `Registered & Loaded Bale ${newBale.baleCode}!`, type: 'success' });

    setTimeout(() => {
      if (gramInputRef.current) {
        gramInputRef.current.focus();
        gramInputRef.current.select();
      }
    }, 100);
  };

  // Open in Dedicated Popout Window
  const handleOpenDedicatedPopout = () => {
    luxuryAudio.playMechanicalClick();
    const popup = window.open(
      window.location.href,
      'VintageSortingTerminalWindow',
      'width=1180,height=880,resizable=yes,scrollbars=yes,status=yes,location=no'
    );
    if (popup) {
      popup.focus();
    } else {
      alert('Popup blocked. Please allow browser popups for this site.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-indigo-500/40 rounded-2xl shadow-2xl max-w-7xl w-full max-h-[96vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* MODAL TOP CONTROL BAR */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                  <span>High-Speed Bale Sorting Terminal</span>
                  <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 text-[10px] px-2 py-0.5 rounded-full font-mono">
                    Piece Stream Engine
                  </span>
                </h2>
              </div>
              <p className="text-[11px] text-slate-400">
                Continuous keyboard data entry, instant gram depletion & 4"x2" thermal tagging
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenDedicatedPopout}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Open terminal in a separate dedicated window for dual-screen setups"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Popout Window</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
              title="Close Terminal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* FEEDBACK TOAST BANNER */}
        {feedbackToast && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all ${
              feedbackToast.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800'
                : feedbackToast.type === 'error'
                ? 'bg-rose-950/80 text-rose-300 border-b border-rose-800'
                : 'bg-indigo-950/80 text-indigo-300 border-b border-indigo-800'
            }`}
          >
            <span>{feedbackToast.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackToast(null)}
              className="text-slate-400 hover:text-white ml-3"
            >
              &times;
            </button>
          </div>
        )}

        {/* STEP 1: BALE IDENTIFICATION & REAL-TIME HUD BAR */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-5 py-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Scan Barcode Gun or Select Dropdown */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <form onSubmit={handleBaleBarcodeScan} className="flex items-center gap-1.5 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={barcodeScanInputRef}
                  type="text"
                  placeholder="Scan Bale Barcode Gun or Type (e.g. BAL-001)..."
                  value={baleBarcodeScanInput}
                  onChange={e => setBaleBarcodeScanInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Scan
              </button>
            </form>

            <div className="flex items-center gap-1.5">
              <select
                value={selectedBaleId}
                onChange={e => {
                  setSelectedBaleId(e.target.value);
                  onSelectBale(e.target.value);
                  luxuryAudio.playMechanicalClick();
                  setTimeout(() => {
                    if (gramInputRef.current) {
                      gramInputRef.current.focus();
                      gramInputRef.current.select();
                    }
                  }, 50);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-hidden focus:border-indigo-400 cursor-pointer font-medium max-w-[220px]"
              >
                <optgroup label="⚡ Active / In-Progress Bales">
                  {activeBalesList.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.baleCode || b.gatePassNo} - {b.baleCategory || 'Mix'} ({b.totalBaleWeight}kg)
                    </option>
                  ))}
                </optgroup>
                {completedBalesList.length > 0 && (
                  <optgroup label="🔒 Completed Bales (Closed)">
                    {completedBalesList.map(b => (
                      <option key={b.id} value={b.id} disabled>
                        🔒 {b.baleCode || b.gatePassNo} - COMPLETED ({b.pieces?.length || b.pieceCount || 0} pcs)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <button
                type="button"
                onClick={() => setShowQuickRegisterBale(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Quick Register a raw bale"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>New Bale</span>
              </button>
            </div>
          </div>

          {/* REAL-TIME HUD DASHBOARD */}
          <div className="flex items-center gap-2 sm:gap-3 bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 font-mono shrink-0">
            <div className="text-center px-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total</span>
              <span className="text-xs font-black text-slate-200">{hudStats.totalGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />

            <div className="text-center px-1">
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">Sorted</span>
              <span className="text-xs font-black text-emerald-400">{hudStats.sortedGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />

            <div className="text-center px-1">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider block">Remaining</span>
              <span className="text-xs font-black text-amber-400">{hudStats.remainingGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />

            <div className="text-center px-1">
              <span className="text-[10px] text-indigo-400 uppercase tracking-wider block">Pieces</span>
              <span className="text-xs font-black text-indigo-300">{hudStats.piecesCount} pcs</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />

            <div className="text-center px-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Progress</span>
              <span className={`text-xs font-black ${hudStats.isCompleted ? 'text-emerald-400' : 'text-indigo-400'}`}>
                {hudStats.progressPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* BALE CONTEXT METADATA PILL */}
        {activeBale && (
          <div className="px-5 py-2 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center gap-3">
              <span>Bale: <strong className="font-mono text-white">{activeBale.baleCode || activeBale.gatePassNo}</strong></span>
              <span>&bull;</span>
              <span>Category: <strong className="text-slate-300">{activeBale.baleCategory || 'Vintage Mix'}</strong></span>
              <span>&bull;</span>
              <span>Invoice: <strong className="font-mono text-slate-300">{activeBale.purchaseInvoiceNo}</strong> ({activeBale.supplierName})</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Cost/Gram: <strong className="text-amber-400">AED {costPerGram.toFixed(4)}/g</strong></span>
              <span>&bull;</span>
              <span>Bale Landed: <strong className="text-slate-200">AED {Number(activeBale.totalBaleCost || 0).toFixed(2)}</strong></span>
            </div>
          </div>
        )}

        {/* STEP 2: HIGH-SPEED REPETITIVE PIECE ENTRY ROW */}
        <div className="p-5 bg-slate-900 border-b border-slate-800">
          {hudStats.isCompleted ? (
            <div className="bg-emerald-950/90 border-2 border-emerald-500/60 p-4 rounded-xl flex items-center justify-between gap-3 text-emerald-200 shadow-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-extrabold text-sm text-white block">
                    Bale {activeBale?.baleCode || activeBale?.gatePassNo} is 100% Completed & Locked
                  </span>
                  <span className="text-xs text-emerald-300/90">
                    All {hudStats.piecesCount} garments have been sorted, tagged, and posted into Finished Goods. New barcode scanning and piece entries for this bale are closed.
                  </span>
                </div>
              </div>
              <span className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-lg text-xs font-mono font-bold text-emerald-300 uppercase">
                Bale Closed
              </span>
            </div>
          ) : (
            <div className="bg-slate-950/70 p-4 rounded-xl border border-indigo-500/30 shadow-inner space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                    Rapid Garment Stream Input (Auto-Refocus on Enter ↵)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoPrintThermalOnAdd}
                      onChange={e => setAutoPrintThermalOnAdd(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Auto-Print 4"x2" Thermal Label on Add</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTagScanner(true)}
                    className="px-2.5 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📷 AI Tag OCR</span>
                  </button>
                </div>
              </div>

              {/* STUDIO 3-ANGLE LIVE PHOTO CAPTURE STRIP */}
              <div className="bg-slate-900/95 border border-indigo-900/60 rounded-xl p-2.5 space-y-2 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Garment 3-Angle Studio:</span>
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      Phone Camera or Upload syncs directly to public E-Commerce Storefront
                    </span>
                  </div>

                  {/* Top Live Studio Viewfinder Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setStudioCameraSlot('front');
                      setShowStudioCamera(true);
                    }}
                    className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-[11px] px-3 py-1 rounded-lg flex items-center gap-1.5 shadow shadow-indigo-600/30 active:scale-95 transition"
                  >
                    <Camera className="w-3.5 h-3.5 animate-pulse" />
                    <span>🎥 Live Studio Viewfinder</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Slot 1: Front Look */}
                  <div className={`p-2 rounded-lg border flex flex-col justify-between gap-2 transition ${
                    frontImageUrl
                      ? 'bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/20'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                        <span>📸 Front Look:</span>
                      </span>
                      {frontImageUrl ? (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Attached
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">None</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {frontImageUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={frontImageUrl}
                            alt="Front"
                            onClick={() => setPreviewLightboxImage(frontImageUrl)}
                            className="w-10 h-10 object-cover rounded-lg border border-emerald-500 cursor-pointer hover:opacity-80 transition"
                            title="Click to view full photo"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewLightboxImage(frontImageUrl)}
                              className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3 text-indigo-400" /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => setFrontImageUrl(undefined)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 w-full">
                          {/* Snap with native Phone Camera */}
                          <label className="flex-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>📷 Camera</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = () => setFrontImageUrl(r.result as string);
                                  r.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Pick from Gallery / PC */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = () => setFrontImageUrl(r.result as string);
                                  r.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slot 2: Back Look */}
                  <div className={`p-2 rounded-lg border flex flex-col justify-between gap-2 transition ${
                    backImageUrl
                      ? 'bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/20'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                        <span>📸 Back Look:</span>
                      </span>
                      {backImageUrl ? (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Attached
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">None</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {backImageUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={backImageUrl}
                            alt="Back"
                            onClick={() => setPreviewLightboxImage(backImageUrl)}
                            className="w-10 h-10 object-cover rounded-lg border border-emerald-500 cursor-pointer hover:opacity-80 transition"
                            title="Click to view full photo"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewLightboxImage(backImageUrl)}
                              className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3 text-indigo-400" /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => setBackImageUrl(undefined)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 w-full">
                          {/* Snap with native Phone Camera */}
                          <label className="flex-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>📷 Camera</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = () => setBackImageUrl(r.result as string);
                                  r.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Pick from Gallery / PC */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = () => setBackImageUrl(r.result as string);
                                  r.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slot 3: Tag / OCR */}
                  <div className={`p-2 rounded-lg border flex flex-col justify-between gap-2 transition ${
                    tagImageUrl
                      ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/20'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                        <span>🏷️ Tag / Label:</span>
                      </span>
                      {tagImageUrl ? (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Scanned
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Unscanned</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {tagImageUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={tagImageUrl}
                            alt="Tag"
                            onClick={() => setPreviewLightboxImage(tagImageUrl)}
                            className="w-10 h-10 object-cover rounded-lg border border-amber-500 cursor-pointer hover:opacity-80 transition"
                            title="Click to view full photo"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewLightboxImage(tagImageUrl)}
                              className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3 text-indigo-400" /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => setTagImageUrl(undefined)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 w-full">
                          {/* AI OCR Scanner modal button */}
                          <button
                            type="button"
                            onClick={() => setShowTagScanner(true)}
                            className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>AI OCR</span>
                          </button>

                          {/* Quick Tag Snap with native phone camera */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition" title="Snap Tag Photo">
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                            <span>Snap</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = () => setTagImageUrl(r.result as string);
                                  r.readAsDataURL(file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RAPID INPUT CONTROLS ROW */}
              <form onSubmit={handleAddPieceAndNext} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-2.5 items-end">
                {/* 1. Weight in Grams (Auto-focused) */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                    Weight (Grams) *
                  </label>
                  <div className="relative">
                    <input
                      ref={gramInputRef}
                      type="number"
                      step="1"
                      min="1"
                      placeholder="e.g. 380"
                      value={gramWeight}
                      onChange={e => setGramWeight(e.target.value)}
                      disabled={hudStats.isCompleted}
                      className="w-full bg-slate-900 border-2 border-amber-500/70 focus:border-amber-400 rounded-lg px-3 py-2 text-sm font-black font-mono text-amber-300 focus:outline-hidden text-right pr-8 shadow-inner disabled:opacity-50"
                      required
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                      g
                    </span>
                  </div>
                </div>

                {/* 2. Auto Calculated Cost (AED) */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Piece Cost (AED)
                  </label>
                  <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-300">
                    AED {autoPieceCostAed.toFixed(2)}
                  </div>
                </div>

                {/* 3. Estimated Selling Price */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Selling Price (AED)
                  </label>
                  <input
                    type="number"
                    step="5"
                    placeholder={String(suggestedSellingPrice)}
                    value={sellingPriceOverride}
                    onChange={e => setSellingPriceOverride(e.target.value)}
                    disabled={hudStats.isCompleted}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-hidden disabled:opacity-50"
                  />
                </div>

                {/* 4. Brand / Title */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Brand / Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Levi's 501"
                    value={brandTitle}
                    onChange={e => setBrandTitle(e.target.value)}
                    disabled={hudStats.isCompleted}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden disabled:opacity-50"
                  />
                </div>

                {/* 5. Category Dropdown */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                    <span>Category</span>
                    <span className="text-[9px] text-slate-400">Setup Sync</span>
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    disabled={hudStats.isCompleted}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-hidden cursor-pointer disabled:opacity-50 font-medium"
                  >
                    {availableCategories.map(cat => {
                      const catStr = typeof cat === 'object' && cat !== null ? ((cat as any).name || (cat as any).code || '') : String(cat || '');
                      return (
                        <option key={catStr} value={catStr}>{catStr}</option>
                      );
                    })}
                  </select>
                </div>

                {/* 6. Size Selector Dropdown */}
                <div className="lg:col-span-1 space-y-1">
                  <label className="block text-[11px] font-bold text-indigo-300 uppercase tracking-wide flex items-center justify-between">
                    <span>Size</span>
                    <span className="font-mono text-[9px] text-amber-400 font-bold bg-slate-800 px-1 py-0.2 rounded">
                      {sizeScanned || 'L'}
                    </span>
                  </label>
                  <select
                    value={sizeScanned}
                    onChange={e => setSizeScanned(e.target.value)}
                    disabled={hudStats.isCompleted}
                    className="w-full bg-slate-900 border-2 border-indigo-500/70 focus:border-indigo-400 rounded-lg px-2 py-2 text-xs text-indigo-200 font-black focus:outline-hidden cursor-pointer disabled:opacity-50"
                  >
                    {availableSizes.map(s => (
                      <option key={s.id || s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7. Quality Grade Dropdown */}
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Quality Grade</span>
                    </span>
                  </label>
                  <select
                    value={selectedGrade}
                    onChange={e => setSelectedGrade(e.target.value)}
                    disabled={hudStats.isCompleted}
                    className="w-full bg-slate-900 border-2 border-amber-500/70 focus:border-amber-400 rounded-lg px-2 py-2 text-xs text-amber-200 font-bold focus:outline-hidden cursor-pointer disabled:opacity-50"
                  >
                    {availableQualityGrades.map(q => (
                      <option key={q.id || q.code} value={q.name}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 8. Quick Pills (Quality & Sizing) & Submit Button */}
                <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 mt-1">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 overflow-x-auto py-1">
                    {/* Quick Quality Grade Pills */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mr-1">
                        Quality:
                      </span>
                      {availableQualityGrades.map(q => {
                        const isSelected = selectedGrade === q.name || selectedGrade === q.code;
                        const isCream = q.qualityTier === 'CREAM' || q.code?.includes('CREAM') || q.name?.toLowerCase().includes('cream');
                        const isNonBrand = q.qualityTier === 'NON_BRAND' || q.code?.includes('NB') || q.name?.toLowerCase().includes('non-brand');
                        const isBrd = q.qualityTier === 'GRADE_A' || q.code?.includes('BRD') || q.name?.toLowerCase().includes('branded');

                        return (
                          <button
                            key={q.id || q.code}
                            type="button"
                            onClick={() => setSelectedGrade(q.name)}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 shadow shadow-amber-400/30 scale-105 border border-amber-300'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                            title={`Select quality ${q.name}`}
                          >
                            {isCream ? '🌟 ' : isNonBrand ? '🏷️ ' : isBrd ? '⭐ ' : '⚠️ '}
                            {q.code || q.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="h-4 w-px bg-slate-700 hidden sm:block mx-1" />

                    {/* Quick Size Pills */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider mr-1">
                        Size:
                      </span>
                      {availableSizes.slice(0, 8).map(s => {
                        const isSelected = sizeScanned === s.code;
                        return (
                          <button
                            key={s.id || s.code}
                            type="button"
                            onClick={() => setSizeScanned(s.code)}
                            className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-500 text-white shadow shadow-indigo-500/30 scale-105 border border-indigo-400'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                            title={`Select size ${s.code}`}
                          >
                            {s.code}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !activeBale || hudStats.isCompleted}
                    className="py-2 px-5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black text-xs rounded-lg shadow-md shadow-emerald-500/20 border border-emerald-400/40 flex items-center justify-center gap-1.5 transition-all transform active:scale-95 cursor-pointer disabled:opacity-40 ml-auto"
                  >
                    <Plus className="w-4 h-4 text-slate-950" />
                    <span>+ Add Piece & Next (↵)</span>
                  </button>
                </div>
              </form>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="font-mono">
                  Next Piece Code: <strong className="text-indigo-400">{nextPieceBarcode}</strong>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Keyboard Shortcut: Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-bold">Enter</kbd> to add and auto-focus next
                </span>
              </div>
            </div>
          )}
        </div>

        {/* STEP 3: INTERACTIVE SESSION TABLE */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>Current Session Pieces Log</span>
              <span className="bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-full font-mono">
                {activeBale?.pieces?.length || 0} items sorted
              </span>
            </h3>

            <span className="text-xs text-slate-400">
              Total Breakdown: <strong className="text-white font-mono">{activeBale?.brokenDownWeight || 0} KG</strong> of <strong className="text-white font-mono">{activeBale?.totalBaleWeight || 0} KG</strong>
            </span>
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800 z-10">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-center">Size</th>
                    <th className="py-2.5 px-3">Brand & Title</th>
                    <th className="py-2.5 px-3 text-center">Studio Photos</th>
                    <th className="py-2.5 px-3 text-right">Weight (g)</th>
                    <th className="py-2.5 px-3 text-right">Cost (AED)</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3 text-center">Print</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {(!activeBale?.pieces || activeBale.pieces.length === 0) ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-500">
                        <Tag className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="font-semibold text-slate-400">No pieces sorted in this bale yet</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Enter garment weight in grams above and press Enter to stream pieces into this bale.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    activeBale.pieces.slice().reverse().map((piece, idx) => {
                      const pieceNum = (activeBale.pieces?.length || 0) - idx;
                      const g = piece.weightGrams || Math.round((piece.weightKg || 0) * 1000);
                      const cost = piece.calculatedCostPrice || piece.costPrice || 0;
                      const price = piece.estimatedPrice || piece.retailPriceAed || 0;

                      return (
                        <tr key={piece.id || idx} className="hover:bg-slate-900/80 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{pieceNum}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-400 text-[11px]">{piece.barcode}</td>
                          <td className="py-2.5 px-3 text-slate-300">{piece.itemName}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold border border-slate-700 text-[11px] shadow-xs">
                              {piece.sizeScanned || 'L'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-white">{piece.brandName} {piece.style ? `• ${piece.style}` : ''}</td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {piece.frontImageUrl && (
                                <img src={piece.frontImageUrl} alt="Front" title="Front Look" className="w-6 h-6 object-cover rounded border border-slate-700" />
                              )}
                              {piece.backImageUrl && (
                                <img src={piece.backImageUrl} alt="Back" title="Back Look" className="w-6 h-6 object-cover rounded border border-slate-700" />
                              )}
                              {piece.tagImageUrl && (
                                <img src={piece.tagImageUrl} alt="Tag" title="Tag OCR" className="w-6 h-6 object-cover rounded border border-amber-600" />
                              )}
                              {!piece.frontImageUrl && !piece.backImageUrl && !piece.tagImageUrl && (
                                <span className="text-[10px] text-slate-600 font-mono">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">{g} g</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">AED {Number(cost).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">AED {Number(price).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                luxuryAudio.playMechanicalClick();
                                onPrintSticker({
                                  itemCode: piece.barcode,
                                  description: `${piece.itemName} (${piece.sizeScanned || 'L'})`,
                                  category: piece.itemName,
                                  size: piece.sizeScanned || 'L',
                                  brand: piece.brandName,
                                  grade: piece.labelGrade,
                                  retailPriceAed: price,
                                  weightKg: piece.weightKg,
                                  batchNo: activeBale.baleCode || activeBale.gatePassNo,
                                  date: new Date().toISOString().slice(0, 10),
                                  origin: piece.countryOfOrigin,
                                  shopLocation: piece.shopLocation
                                });
                              }}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded transition-colors cursor-pointer"
                              title="Print 4x2 Thermal Barcode Sticker"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeletePiece(piece.id)}
                              className="p-1.5 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                              title="Delete piece from session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* STEP 4: SESSION ACTIONS BAR */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Bale Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              hudStats.isCompleted
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : hudStats.piecesCount > 0
                ? 'bg-amber-950 text-amber-400 border-amber-800'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {hudStats.isCompleted ? 'Completed (100%)' : hudStats.piecesCount > 0 ? `In Progress (${hudStats.progressPercent}%)` : 'Unopened'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSaveInProgress}
              className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4 text-indigo-400" />
              <span>Save as In-Progress</span>
            </button>

            <button
              type="button"
              onClick={handleFinalizeAndPost}
              className="flex-1 sm:flex-none px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-600/25 border border-emerald-400/40 flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-slate-950" />
              <span>Finalize & Post Bale</span>
            </button>
          </div>
        </div>

        {/* QUICK REGISTER BALE SUB-MODAL */}
        {showQuickRegisterBale && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-400" />
                  <span>Register Raw Imported Bale Inward</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowQuickRegisterBale(false)}
                  className="text-slate-400 hover:text-white"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleQuickRegisterBale} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Commercial Invoice / Ref *</label>
                  <input
                    type="text"
                    placeholder="e.g. COMM-INV-2026-001"
                    value={regInvoiceNo}
                    onChange={e => setRegInvoiceNo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-indigo-400"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Supplier Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Vintage Wholesalers Europe"
                    value={regSupplier}
                    onChange={e => setRegSupplier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Bale Category</label>
                  <select
                    value={regCategory}
                    onChange={e => setRegCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-indigo-400"
                  >
                    {DEFAULT_CATEGORIES.map(c => {
                      const cStr = typeof c === 'object' && c !== null ? ((c as any).name || (c as any).code || '') : String(c || '');
                      return (
                        <option key={cStr} value={cStr}>{cStr}</option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Total Weight (KG) *</label>
                    <input
                      type="number"
                      step="0.1"
                      value={regWeightKg}
                      onChange={e => setRegWeightKg(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-indigo-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Total Cost (AED) *</label>
                    <input
                      type="number"
                      step="1"
                      value={regCostAed}
                      onChange={e => setRegCostAed(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-indigo-400"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickRegisterBale(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg"
                  >
                    Register & Start Sorting
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AI TAG CAMERA OCR MODAL */}
        {showTagScanner && (
          <CameraTagScannerModal
            isOpen={showTagScanner}
            onClose={() => setShowTagScanner(false)}
            onApplyExtractedTag={handleApplyExtractedTag}
          />
        )}

        {/* STUDIO 3-ANGLE LIVE CAMERA MODAL */}
        {showStudioCamera && (
          <StudioPhotoCaptureModal
            isOpen={showStudioCamera}
            onClose={() => setShowStudioCamera(false)}
            activeSlot={studioCameraSlot}
            frontImageUrl={frontImageUrl}
            backImageUrl={backImageUrl}
            tagImageUrl={tagImageUrl}
            onSavePhotos={({ front, back, tag }) => {
              if (front !== undefined) setFrontImageUrl(front);
              if (back !== undefined) setBackImageUrl(back);
              if (tag !== undefined) setTagImageUrl(tag);
            }}
          />
        )}

        {/* LIGHTBOX PREVIEW MODAL */}
        {previewLightboxImage && (
          <div
            className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
            onClick={() => setPreviewLightboxImage(null)}
          >
            <div className="relative max-w-lg max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl p-2">
              <img src={previewLightboxImage} alt="Preview" className="w-full h-full object-contain rounded-xl" />
              <button
                type="button"
                onClick={() => setPreviewLightboxImage(null)}
                className="absolute top-3 right-3 bg-black/70 hover:bg-rose-600 text-white rounded-full p-1.5 transition shadow"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

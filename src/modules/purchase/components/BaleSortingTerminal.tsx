import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../../../supabaseClient.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { InwardGatePass, PieceBreakdownItem, PurchaseInvoice } from '../purchase.types.ts';
import { ItemMaster, BrandMaster, LabelGrade, ShopMaster, CategoryMaster, SizeMaster, ProductCategory, CollectionMaster } from '../../setup/setup.types.ts';
import { PurchaseEngine } from '../purchase.engine.ts';
import { SearchableSelect, SearchableOption } from '../../../components/SearchableSelect.tsx';
import { StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import { openThermalLabelPrintWindow } from '../../../utils/thermalPrinter.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { CameraTagScannerModal, ExtractedTagData } from './CameraTagScannerModal.tsx';
import { StudioPhotoCaptureModal } from './StudioPhotoCaptureModal.tsx';
import { BaleProfitHorizonGauge } from './BaleProfitHorizonGauge.tsx';
import { compressImage } from '../../../utils/imageCompressor.ts';
import { getDefaultSellingPrice } from '../../../utils/geminiVintageValuation.ts';
import { sanitizeString, sanitizeNullableString } from '../../../utils/sanitizeString.ts';
import {
  Scale,
  Sparkles,
  Barcode,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
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
  RotateCcw,
  Unlock,
  Maximize2,
  Crown,
  Flame,
  Globe,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SetupService } from '../../../services/setupService.ts';

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
  onDeleteBale?: (baleId: string) => void;
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
  onDeleteBale,
  onPostBale,
  onSelectBale,
  onBaleCreated,
  onPrintSticker
}) => {
  // Dynamic categories, sizes, quality grades, and collections fetched from Setup
  const [categoriesList, setCategoriesList] = useState<CategoryMaster[]>(categories);
  const [productCategoriesList, setProductCategoriesList] = useState<ProductCategory[]>([]);
  const [collectionsList, setCollectionsList] = useState<CollectionMaster[]>([]);
  const [sizesList, setSizesList] = useState<SizeMaster[]>(sizes);
  const [labelsList, setLabelsList] = useState<LabelGrade[]>(labels);

  useEffect(() => {
    const loadDynamicTaxonomy = async () => {
      try {
        const [prodCatRes, colRes] = await Promise.all([
          fetch('/api/setup/product-categories').then(r => r.ok ? r.json() : []).catch(() => []),
          fetch('/api/setup/collections').then(r => r.ok ? r.json() : []).catch(() => [])
        ]);
        if (Array.isArray(prodCatRes) && prodCatRes.length > 0) {
          setProductCategoriesList(prodCatRes);
          setCategoriesList(prodCatRes as any);
        }
        if (Array.isArray(colRes) && colRes.length > 0) {
          setCollectionsList(colRes);
        }
      } catch (_) {}
    };

    loadDynamicTaxonomy();

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

    // Realtime category sync on database update
    const handleCategoryRealtime = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'product_categories' || detail.table === 'categories') {
        loadDynamicCategories();
      }
    };
    window.addEventListener('vv:realtime-record', handleCategoryRealtime);
    return () => window.removeEventListener('vv:realtime-record', handleCategoryRealtime);
  }, [categories, sizes, labels]);

  const availableCategories = useMemo(() => {
    if (Array.isArray(categoriesList) && categoriesList.length > 0) {
      const active = categoriesList
        .filter(c => typeof c === 'object' && c !== null ? (c.is_active !== false && (c as any).isActive !== false && c.status !== 'UNPOSTED') : true)
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

  // Real database bales list state (with auto-fetch from database API if allBales is empty)
  const [internalBales, setInternalBales] = useState<InwardGatePass[]>(allBales || []);
  const effectiveBales = useMemo(() => {
    return (allBales && allBales.length > 0) ? allBales : internalBales;
  }, [allBales, internalBales]);

  // If effectiveBales is empty, auto-fetch from database API
  useEffect(() => {
    if (allBales && allBales.length > 0) {
      setInternalBales(allBales);
    } else {
      fetch('/api/purchase/gate-passes')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setInternalBales(data);
            setSelectedBaleId(prev => prev || data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [allBales]);

  // Active selected bale (either passed in or selected from dropdown/scanner)
  const [selectedBaleId, setSelectedBaleId] = useState<string>(initialBale?.id || allBales[0]?.id || '');
  const [baleBarcodeScanInput, setBaleBarcodeScanInput] = useState('');

  // Update selected bale if initialBale changes or effectiveBales loads
  useEffect(() => {
    if (initialBale?.id) {
      setSelectedBaleId(initialBale.id);
    } else if (!selectedBaleId && effectiveBales.length > 0) {
      setSelectedBaleId(effectiveBales[0].id);
    }
  }, [initialBale, effectiveBales, selectedBaleId]);

  const activeBale = useMemo(() => {
    return effectiveBales.find(b => b.id === selectedBaleId) || initialBale || (effectiveBales.length > 0 ? effectiveBales[0] : null);
  }, [effectiveBales, selectedBaleId, initialBale]);

  // Session pieces state synced with Supabase public.bale_sorted_pieces
  const [pieces, setPieces] = useState<any[]>(() => (activeBale?.pieces as any[]) || []);
  const [isTerminalFinalized, setIsTerminalFinalized] = useState<boolean>(false);

  // Load pieces from Supabase public.bale_sorted_pieces whenever activeBale changes
  useEffect(() => {
    if (!activeBale?.id) return;

    let isMounted = true;
    const fetchSessionData = async () => {
      try {
        const { data, error } = await supabase
          .from('bale_sorted_pieces')
          .select('*')
          .eq('bale_id', activeBale.id)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0 && isMounted) {
          const mapped = data.map((d: any) => ({
            ...d,
            barcode: d.piece_code || d.barcode,
            piece_code: d.piece_code || d.barcode,
            itemName: d.category || d.item_name || 'Vintage Garment',
            category: d.category || d.item_name || 'Vintage Garment',
            sizeScanned: d.size || d.size_scanned || 'L',
            size: d.size || d.size_scanned || 'L',
            brandName: d.brand_title || d.brand_name || 'Vintage',
            brand_title: d.brand_title || d.brand_name || 'Vintage',
            weightGrams: Number(d.weight_grams) || Number(d.weightGrams) || 0,
            weight_grams: Number(d.weight_grams) || Number(d.weightGrams) || 0,
            weightKg: (Number(d.weight_grams) || 0) / 1000,
            costPrice: Number(d.cost_price) || 0,
            cost_price: Number(d.cost_price) || 0,
            calculatedCostPrice: Number(d.cost_price) || 0,
            retailPriceAed: Number(d.selling_price) || 0,
            selling_price: Number(d.selling_price) || 0,
            estimatedPrice: Number(d.selling_price) || 0,
            labelGrade: d.quality_grade || d.label_grade || 'Grade A',
            quality_grade: d.quality_grade || d.label_grade || 'Grade A',
            frontImageUrl: d.front_image || d.front_image_url,
            front_image: d.front_image || d.front_image_url,
            backImageUrl: d.back_image || d.back_image_url,
            back_image: d.back_image || d.back_image_url,
            tagImageUrl: d.tag_image || d.tag_image_url,
            tag_image: d.tag_image || d.tag_image_url,
            era: d.era || '1990s Vintage',
            marketSegment: d.market_segment || 'Regular Thrift',
            market_segment: d.market_segment || 'Regular Thrift',
            isGrail: Boolean(d.is_grail),
            is_grail: Boolean(d.is_grail),
            aiSuggestedPrice: Number(d.ai_suggested_price) || 0,
            ai_suggested_price: Number(d.ai_suggested_price) || 0,
            isPriceOverridden: Boolean(d.is_price_overridden),
            is_price_overridden: Boolean(d.is_price_overridden),
            globalInsights: d.global_insights,
            global_insights: d.global_insights
          }));
          setPieces(mapped);
        } else if (activeBale.pieces && activeBale.pieces.length > 0 && isMounted) {
          setPieces(activeBale.pieces);
        } else if (isMounted) {
          setPieces([]);
        }
      } catch {
        if (isMounted && activeBale.pieces) setPieces(activeBale.pieces);
      }

      // Check session status from public.bale_sessions
      try {
        const { data: sessionData } = await supabase
          .from('bale_sessions')
          .select('*')
          .eq('bale_id', activeBale.id)
          .maybeSingle();

        if (isMounted && sessionData) {
          setIsTerminalFinalized(sessionData.status === 'COMPLETED');
        } else if (isMounted) {
          setIsTerminalFinalized(activeBale.status === 'COMPLETED' || activeBale.sortingStatus === 'FULLY_SORTED');
        }
      } catch {
        if (isMounted) {
          setIsTerminalFinalized(activeBale.status === 'COMPLETED' || activeBale.sortingStatus === 'FULLY_SORTED');
        }
      }
    };

    fetchSessionData();

    return () => {
      isMounted = false;
    };
  }, [activeBale?.id]);

  // Studio 4-Angle Photos (Front Look, Back Look, Tag OCR, Measurement Tape)
  const [showTagScanner, setShowTagScanner] = useState(false);
  const [showStudioCamera, setShowStudioCamera] = useState(false);
  const [studioCameraSlot, setStudioCameraSlot] = useState<'front' | 'back' | 'tag' | 'measurement'>('front');
  const [previewLightboxImage, setPreviewLightboxImage] = useState<string | null>(null);
  const [tagImageUrl, setTagImageUrl] = useState<string | undefined>(undefined);
  const [frontImageUrl, setFrontImageUrl] = useState<string | undefined>(undefined);
  const [backImageUrl, setBackImageUrl] = useState<string | undefined>(undefined);
  const [measurementImageUrl, setMeasurementImageUrl] = useState<string | undefined>(undefined);
  const [pitToPit, setPitToPit] = useState<string>('');
  const [lengthInches, setLengthInches] = useState<string>('');
  const [activeGrailAlert, setActiveGrailAlert] = useState<ExtractedTagData | null>(null);

  // Auto print toggle
  const [autoPrintThermalOnAdd, setAutoPrintThermalOnAdd] = useState(true);

  // New Piece High-Speed Input Row Fields (Clean Defaults - No Dummy Values)
  const [bundleQuantity, setBundleQuantity] = useState<number>(1);
  const [gramWeight, setGramWeight] = useState<string>('');
  const [sellingPriceOverride, setSellingPriceOverride] = useState<string | null>(null);
  const [brandTitle, setBrandTitle] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => availableCategories[0] || DEFAULT_CATEGORIES[0]);
  const [sizeScanned, setSizeScanned] = useState<string>('L');
  const [selectedGrade, setSelectedGrade] = useState<string>(labels[0]?.name || 'Grade A+ (Pristine Cream)');
  const [shopLocation, setShopLocation] = useState<string>(shops[0]?.name || 'Central Warehouse (Al Quoz)');
  const [countryOfOrigin, setCountryOfOrigin] = useState<string>('Made in USA');
  const [styleNotes, setStyleNotes] = useState<string>('');
  const [era, setEra] = useState<string>('1990s Vintage');
  const [marketSegment, setMarketSegment] = useState<'Antique' | 'Vintage' | 'Brand' | 'Non-Brand'>('Vintage');
  const [isGrail, setIsGrail] = useState<boolean>(false);
  const [aiSuggestedPrice, setAiSuggestedPrice] = useState<number>(0);
  const [globalInsights, setGlobalInsights] = useState<{
    usa_market_usd?: number;
    europe_market_eur?: number;
    australia_market_aud?: number;
    uae_retail_aed?: number;
    arbitrage_analysis?: string;
    collector_notes?: string;
  } | null>(null);
  const [showGlobalInsightsPanel, setShowGlobalInsightsPanel] = useState<boolean>(false);

  // --- 4-TIER CASCADING TAXONOMY & AUTO-SKU STATES ---
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedMainCategoryId, setSelectedMainCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');

  // 2. Creatable Item Master Selection
  const [internalItemMasters, setInternalItemMasters] = useState<ItemMaster[]>(items || []);
  const [isItemMasterDropdownOpen, setIsItemMasterDropdownOpen] = useState<boolean>(false);
  // 3. AI SEO & Archival Description
  const [ecommerceDescription, setEcommerceDescription] = useState<string>('');
  const [seoTags, setSeoTags] = useState<string[]>([]);
  const [showSeoDrawer, setShowSeoDrawer] = useState<boolean>(false);
  // 4. Auto-Generated SKU State
  const [generatedSku, setGeneratedSku] = useState<string>('VIN-MEN-0001');

  useEffect(() => {
    if (items && items.length > 0) {
      setInternalItemMasters(items);
    } else {
      SetupService.getItems().then(res => {
        if (Array.isArray(res) && res.length > 0) setInternalItemMasters(res);
      }).catch(() => {});
    }
  }, [items]);

  const itemMasterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (itemMasterDropdownRef.current && !itemMasterDropdownRef.current.contains(e.target as Node)) {
        setIsItemMasterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredItemMasters = useMemo(() => {
    if (!brandTitle.trim()) return internalItemMasters.slice(0, 8);
    const q = brandTitle.toLowerCase();
    return internalItemMasters.filter(im =>
      im.name.toLowerCase().includes(q) || (im.code && im.code.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [internalItemMasters, brandTitle]);

  // Auto-initialize 4-Tier selections once productCategoriesList loads
  useEffect(() => {
    if (productCategoriesList.length > 0) {
      const depts = productCategoriesList.filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1));
      if (depts.length > 0 && (!selectedDeptId || !depts.some(d => d.id === selectedDeptId))) {
        const firstDept = depts[0];
        setSelectedDeptId(firstDept.id);

        const mainCats = productCategoriesList.filter(c => (c.taxonomy_level === 'CATEGORY' || Number(c.level) === 2) && (c.parent_id === firstDept.id || (c as any).parent_slug === firstDept.slug));
        if (mainCats.length > 0) {
          const firstCat = mainCats[0];
          setSelectedMainCategoryId(firstCat.id);
          setSelectedCategory(firstCat.name);

          const subCats = productCategoriesList.filter(c => (c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3) && c.parent_id === firstCat.id);
          if (subCats.length > 0) {
            setSelectedSubCategoryId(subCats[0].id);
          }
        }
      }
    }
  }, [productCategoriesList]);

  // Auto-initialize Collection once collectionsList loads
  useEffect(() => {
    if (collectionsList.length > 0 && (!selectedCollectionId || !collectionsList.some(col => col.id === selectedCollectionId))) {
      setSelectedCollectionId(collectionsList[0].id);
    }
  }, [collectionsList]);

  const selectedDeptObj = useMemo(() => {
    return productCategoriesList.find(c => c.id === selectedDeptId) || null;
  }, [productCategoriesList, selectedDeptId]);

  const selectedMainCatObj = useMemo(() => {
    return productCategoriesList.find(c => c.id === selectedMainCategoryId) || null;
  }, [productCategoriesList, selectedMainCategoryId]);

  const selectedSubCatObj = useMemo(() => {
    return productCategoriesList.find(c => c.id === selectedSubCategoryId) || null;
  }, [productCategoriesList, selectedSubCategoryId]);

  const selectedCollectionObj = useMemo(() => {
    return collectionsList.find(c => c.id === selectedCollectionId) || null;
  }, [collectionsList, selectedCollectionId]);

  const activeDeptCode = useMemo(() => {
    if (selectedDeptObj && (selectedDeptObj as any).department_code) return (selectedDeptObj as any).department_code;
    if (selectedDeptObj && selectedDeptObj.slug) {
      const mapping: Record<string, string> = { men: 'MEN', ladies: 'LAD', children: 'KID', accessories: 'ACC' };
      return mapping[selectedDeptObj.slug.toLowerCase()] || selectedDeptObj.slug.toUpperCase().slice(0, 3);
    }
    return 'MEN';
  }, [selectedDeptObj]);

  useEffect(() => {
    SetupService.generateSku(activeDeptCode)
      .then(sku => setGeneratedSku(sku))
      .catch(() => setGeneratedSku(`VIN-${activeDeptCode}-0001`));
  }, [activeDeptCode]);

  // Searchable Options for Cascading Comboboxes
  const deptOptions: SearchableOption[] = useMemo(() => {
    const depts = productCategoriesList.filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1));
    if (depts.length === 0) {
      return [
        { value: 'men', label: '👔 Men', badge: 'MEN' },
        { value: 'ladies', label: '👗 Ladies', badge: 'LAD' },
        { value: 'children', label: '🧸 Children', badge: 'KID' },
        { value: 'accessories', label: '🕶️ Accessories', badge: 'ACC' }
      ];
    }
    return depts.map(d => ({
      value: d.id,
      label: d.name.toLowerCase().includes('men')
        ? `👔 ${d.name}`
        : d.name.toLowerCase().includes('lad')
        ? `👗 ${d.name}`
        : d.name.toLowerCase().includes('kid') || d.name.toLowerCase().includes('child')
        ? `🧸 ${d.name}`
        : `🏷️ ${d.name}`,
      badge: (d as any).department_code || d.slug.toUpperCase().slice(0, 5),
      sublabel: `Tier 1 Department (${d.slug})`
    }));
  }, [productCategoriesList]);

  const mainCatOptions: SearchableOption[] = useMemo(() => {
    const cats = productCategoriesList.filter(c => {
      if (c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1)) return false;
      if (c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3) return false;
      if (!selectedDeptId) return true;
      return c.parent_id === selectedDeptId || (c as any).parent_slug === selectedDeptId;
    });
    return cats.map(c => ({
      value: c.id,
      label: c.name,
      badge: c.slug.toUpperCase(),
      sublabel: 'Tier 2 Main Category'
    }));
  }, [productCategoriesList, selectedDeptId]);

  const subCatOptions: SearchableOption[] = useMemo(() => {
    const subs = productCategoriesList.filter(c => {
      if (c.taxonomy_level !== 'SUBCATEGORY' && Number(c.level) !== 3) return false;
      if (!selectedMainCategoryId) return true;
      return c.parent_id === selectedMainCategoryId || (c as any).parent_slug === selectedMainCategoryId;
    });
    return subs.map(s => ({
      value: s.id,
      label: s.name,
      badge: s.slug.toUpperCase(),
      sublabel: 'Tier 3 Sub-Category'
    }));
  }, [productCategoriesList, selectedMainCategoryId]);

  const collectionOptions: SearchableOption[] = useMemo(() => {
    if (collectionsList.length === 0) {
      return [
        { value: 'summer-26', label: '⚡ Summer Edition 2026', badge: 'SUMMER-26', sublabel: 'Summer 2026' },
        { value: 'winter-26', label: '❄️ Winter Maazi Drop 2026', badge: 'WINTER-26', sublabel: 'Winter 2026' },
        { value: 'core-vault', label: '🏛️ Core Archive Vault', badge: 'CORE-VAULT', sublabel: 'All Season' }
      ];
    }
    return collectionsList.map(col => ({
      value: col.id,
      label: col.name,
      badge: col.code,
      sublabel: `${col.season || 'Season'} • ${col.year || 2026}`
    }));
  }, [collectionsList]);

  const marketSegmentOptions: SearchableOption[] = [
    { value: 'Antique', label: '🏛️ Antique', badge: 'ARCHIVE', sublabel: 'Heritage Archival Pre-1970s' },
    { value: 'Vintage', label: '🕰️ Vintage', badge: 'VINTAGE', sublabel: 'Collector, Retro & 90s Classics' },
    { value: 'Brand', label: '⭐ Brand', badge: 'BRAND', sublabel: 'Designer & Premium Labels' },
    { value: 'Non-Brand', label: '🏷️ Non-Brand', badge: 'BASICS', sublabel: 'Everyday Basics & Streetwear' }
  ];

  // Cascading Selection Handlers
  const handleDepartmentChange = (deptId: string) => {
    setSelectedDeptId(deptId);
    const mainCats = productCategoriesList.filter(c => (c.taxonomy_level === 'CATEGORY' || Number(c.level) === 2) && (c.parent_id === deptId || (c as any).parent_slug === deptId));
    if (mainCats.length > 0) {
      const firstCat = mainCats[0];
      setSelectedMainCategoryId(firstCat.id);
      setSelectedCategory(firstCat.name);
      const subCats = productCategoriesList.filter(c => (c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3) && c.parent_id === firstCat.id);
      setSelectedSubCategoryId(subCats.length > 0 ? subCats[0].id : '');
    } else {
      setSelectedMainCategoryId('');
      setSelectedSubCategoryId('');
    }
  };

  const handleMainCategoryChange = (catId: string) => {
    setSelectedMainCategoryId(catId);
    const catObj = productCategoriesList.find(c => c.id === catId);
    if (catObj) {
      setSelectedCategory(catObj.name);
      const autoPrice = getDefaultSellingPrice(catObj.name, era, brandTitle);
      setSellingPriceOverride(String(autoPrice));
    }
    const subCats = productCategoriesList.filter(c => (c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3) && c.parent_id === catId);
    setSelectedSubCategoryId(subCats.length > 0 ? subCats[0].id : '');
  };

  const handleSubCategoryChange = (subId: string) => {
    setSelectedSubCategoryId(subId);
  };

  const handleCollectionChange = (colId: string) => {
    setSelectedCollectionId(colId);
  };

  const handleMarketSegmentChange = (seg: string) => {
    const validSeg = (['Antique', 'Vintage', 'Brand', 'Non-Brand'].includes(seg) ? seg : 'Vintage') as 'Antique' | 'Vintage' | 'Brand' | 'Non-Brand';
    setMarketSegment(validSeg);
    setIsGrail(validSeg === 'Antique');
    let newEra = era;
    if (validSeg === 'Antique') newEra = 'Antique Heritage (1920s-1960s)';
    else if (validSeg === 'Vintage') newEra = '1990s Vintage';
    else if (validSeg === 'Brand') newEra = 'Modern Branded';
    else if (validSeg === 'Non-Brand') newEra = 'Modern Non-Brand';
    setEra(newEra);
    const autoPrice = getDefaultSellingPrice(selectedCategory, newEra, brandTitle);
    setSellingPriceOverride(String(autoPrice));
  };

  // New Bale Quick-Register Modal inside terminal
  const [showQuickRegisterBale, setShowQuickRegisterBale] = useState(false);
  const [regInvoiceNo, setRegInvoiceNo] = useState('');
  const [regSupplier, setRegSupplier] = useState('');
  const [regCategory, setRegCategory] = useState('');
  const [regWeightKg, setRegWeightKg] = useState('');
  const [regCostAed, setRegCostAed] = useState('');

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

  // Suggested retail price (Intelligent market model: Antique / 90s Grail / Y2K / Non-Brand)
  const suggestedSellingPrice = useMemo(() => {
    const defaultMarketPrice = getDefaultSellingPrice(selectedCategory, era, brandTitle);
    if (autoPieceCostAed > 0) {
      // Ensure suggested price covers piece cost with healthy markup
      return Math.max(defaultMarketPrice, Math.round((autoPieceCostAed * 2.5) / 5) * 5);
    }
    return defaultMarketPrice;
  }, [selectedCategory, era, brandTitle, autoPieceCostAed]);

  const effectiveSellingPrice = useMemo(() => {
    if (sellingPriceOverride !== null && sellingPriceOverride.trim() !== '' && Number(sellingPriceOverride) > 0) {
      return Number(sellingPriceOverride);
    }
    return suggestedSellingPrice;
  }, [sellingPriceOverride, suggestedSellingPrice]);

  // Real-Time HUD Statistics (Live Gram Depletion & Session Metrics)
  const hudStats = useMemo(() => {
    if (!activeBale) {
      return {
        totalGrams: 0,
        sortedGrams: 0,
        remainingGrams: 0,
        piecesCount: 0,
        progressPercent: 0,
        isCompleted: false,
        sortedKg: 0,
        totalKg: 0
      };
    }
    const totalKg = Number(activeBale.totalBaleWeight ?? (activeBale as any).weight_kg ?? (activeBale as any).total_weight ?? 0) || 0;
    const totalGrams = Math.round(totalKg * 1000);
    const sortedGrams = pieces.reduce((sum, p) => {
      const g = Number(p.weight_grams ?? p.weightGrams ?? 0);
      if (g > 0) return sum + g;
      const kg = Number(p.weightKg ?? p.weight_kg ?? 0);
      if (kg > 0) return sum + Math.round(kg * 1000);
      return sum;
    }, 0);
    const remainingGrams = Math.max(0, totalGrams - sortedGrams);
    const piecesCount = pieces.length > 0 ? pieces.length : Number(activeBale.pieceCount ?? (activeBale as any).total_pieces ?? 0);
    const progressPercent = totalGrams > 0 ? Math.min(100, Math.max(0, Math.round((sortedGrams / totalGrams) * 100))) : 0;
    const isCompleted = isTerminalFinalized || activeBale.status === 'COMPLETED' || activeBale.status === 'POSTED' || activeBale.sortingStatus === 'FULLY_SORTED';
    const sortedKg = Number((sortedGrams / 1000).toFixed(3));

    return {
      totalGrams,
      sortedGrams,
      remainingGrams,
      piecesCount,
      progressPercent,
      isCompleted,
      sortedKg,
      totalKg
    };
  }, [activeBale, pieces, isTerminalFinalized]);

  // Separate active/open bales from completed/locked bales
  const { activeBalesList, completedBalesList } = useMemo(() => {
    const active: InwardGatePass[] = [];
    const completed: InwardGatePass[] = [];
    (effectiveBales || []).forEach(b => {
      const isDone = b.status === 'COMPLETED' || b.status === 'POSTED';
      if (isDone) completed.push(b);
      else active.push(b);
    });
    return { activeBalesList: active, completedBalesList: completed };
  }, [effectiveBales]);

  // Auto-generated Next Piece Barcode Preview (${activeBaleId || 'BAL-01'}-P0001)
  const nextPieceBarcode = useMemo(() => {
    const baseCode = activeBale?.baleCode || activeBale?.gatePassNo || activeBale?.id || 'BAL-01';
    const maxSeq = pieces.reduce((max, p) => {
      const match = (p.piece_code || p.barcode)?.match(/-P(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const nextIdx = Math.max(pieces.length, maxSeq) + 1;
    return `${baseCode}-P${String(nextIdx).padStart(4, '0')}`;
  }, [activeBale, pieces]);

  // Apply OCR extracted tag data (AI Grail & Vintage Value Hunter)
  const handleApplyExtractedTag = (tagData: ExtractedTagData) => {
    // 1. Title & Brand (Auto-fill Brand & Style)
    const titleToUse = tagData.garmentTitle || (tagData.brand ? `${tagData.brand} ${tagData.style || ''}`.trim() : '');
    if (titleToUse) {
      setBrandTitle(titleToUse);
    } else if (tagData.brand) {
      setBrandTitle(tagData.brand.trim());
    }

    // 2. Size & Country of Origin (Auto-fill Size)
    if (tagData.size) setSizeScanned(tagData.size.trim());
    if (tagData.countryOfOrigin) setCountryOfOrigin(tagData.countryOfOrigin.trim());

    // 2b. Measurements Auto-Fill (Pit-to-Pit & Length)
    if (tagData.pitToPitInches !== undefined && tagData.pitToPitInches !== '') {
      setPitToPit(String(tagData.pitToPitInches));
    } else if (tagData.measurements?.pitToPit !== undefined && tagData.measurements?.pitToPit !== '') {
      setPitToPit(String(tagData.measurements.pitToPit));
    } else if ((tagData as any).global_insights?.measurements?.pitToPit) {
      setPitToPit(String((tagData as any).global_insights.measurements.pitToPit));
    }

    if (tagData.lengthInches !== undefined && tagData.lengthInches !== '') {
      setLengthInches(String(tagData.lengthInches));
    } else if (tagData.measurements?.length !== undefined && tagData.measurements?.length !== '') {
      setLengthInches(String(tagData.measurements.length));
    } else if ((tagData as any).global_insights?.measurements?.length) {
      setLengthInches(String((tagData as any).global_insights.measurements.length));
    }

    // 3. Era & Vintage lineage & Market Segment
    if (tagData.era) setEra(tagData.era);
    if ((tagData as any).marketSegment) {
      const rawSeg = String((tagData as any).marketSegment);
      if (rawSeg === 'Antique' || rawSeg === 'Grails' || rawSeg === 'Boutique') {
        setMarketSegment('Antique');
        setIsGrail(true);
      } else if (rawSeg === 'Brand') {
        setMarketSegment('Brand');
        setIsGrail(false);
      } else if (rawSeg === 'Regular Thrift' || rawSeg === 'Non-Brand') {
        setMarketSegment('Non-Brand');
        setIsGrail(false);
      } else {
        setMarketSegment('Vintage');
        setIsGrail(false);
      }
    } else if (tagData.era?.toLowerCase().includes('antique')) {
      setMarketSegment('Antique');
      setIsGrail(true);
    }

    if (tagData.isGrail !== undefined) {
      setIsGrail(Boolean(tagData.isGrail));
    }

    // 4. Photos if provided
    if (tagData.frontImageUrl) setFrontImageUrl(tagData.frontImageUrl);
    if (tagData.backImageUrl) setBackImageUrl(tagData.backImageUrl);
    if (tagData.tagImageUrl) setTagImageUrl(tagData.tagImageUrl);

    // 5. Category matching
    if (tagData.category) {
      const matchCat = availableCategories.find(c =>
        c.toLowerCase().includes(tagData.category!.toLowerCase()) ||
        tagData.category!.toLowerCase().includes(c.toLowerCase())
      );
      if (matchCat) {
        setSelectedCategory(matchCat);
      } else {
        setSelectedCategory(tagData.category);
      }
    }

    // 6. Quality Grade
    if (tagData.suggestedQualityGrade) {
      const matchGrade = (labelsList || []).find(l =>
        l.name.toLowerCase().includes(tagData.suggestedQualityGrade!.toLowerCase()) ||
        tagData.suggestedQualityGrade!.toLowerCase().includes(l.name.toLowerCase())
      );
      if (matchGrade) setSelectedGrade(matchGrade.name);
      else setSelectedGrade(tagData.suggestedQualityGrade);
    }

    // 7. CRITICAL PROFIT PROTECTION: Auto-populate Selling Price Override & Record AI Suggested Price
    const autoPrice = (tagData.recommendedRetailPriceAed && tagData.recommendedRetailPriceAed > 0)
      ? tagData.recommendedRetailPriceAed
      : getDefaultSellingPrice(tagData.category || selectedCategory, tagData.era || era, tagData.brand || brandTitle);

    setAiSuggestedPrice(autoPrice);
    setSellingPriceOverride(String(autoPrice));

    // 7b. AI E-Commerce Copy & SEO Keywords
    if (tagData.ecommerce_description) {
      setEcommerceDescription(tagData.ecommerce_description);
    }
    if (Array.isArray(tagData.seo_tags) && tagData.seo_tags.length > 0) {
      setSeoTags(tagData.seo_tags);
    }

    // Global Geo-Arbitrage Insights
    if ((tagData as any).global_insights) {
      setGlobalInsights((tagData as any).global_insights);
      setShowGlobalInsightsPanel(true);
    }

    // 8. Style Notes & Tag Image
    const notesArr = [tagData.stitchType, tagData.era, tagData.grailNotes].filter(Boolean);
    if (notesArr.length > 0) setStyleNotes(notesArr.join(' • '));

    // 9. Active Grail Alert Banner
    const isHighValue = tagData.isGrail || tagData.rarityTier === 'ANTIQUE' || (tagData.estimatedMarketValueAed && tagData.estimatedMarketValueAed >= 350);
    if (isHighValue) {
      setActiveGrailAlert(tagData);
      luxuryAudio.playCashRegisterSound();
    } else {
      setActiveGrailAlert(null);
      luxuryAudio.playMechanicalClick();
    }

    const toastMsg = tagData.rarityTier === 'ANTIQUE'
      ? `🏛️ ANTIQUE HERITAGE DETECTED: ${titleToUse} — Showroom Price: AED ${tagData.recommendedRetailPriceAed || 850}`
      : tagData.isGrail
      ? `🔥 GRAIL DETECTED: ${titleToUse} — Protected at AED ${tagData.recommendedRetailPriceAed || 750} (Market: AED ${tagData.estimatedMarketValueAed || 850})`
      : `✓ AI Appraised: ${titleToUse} (${tagData.era || 'Modern'}) — Suggested AED ${tagData.recommendedRetailPriceAed || 35}`;

    setFeedbackToast({
      text: toastMsg,
      type: 'success'
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
      const isCompleted = matched.status === 'COMPLETED' || matched.status === 'POSTED';

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

  // STEP 2: HIGH-SPEED ADD PIECE & NEXT (FAST-KEY ATOMIC ENGINE)
  const handleAddPieceAndNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Check internet connection
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFeedbackToast({
        text: 'Network disconnected. Please check your connection before saving.',
        type: 'error'
      });
      setIsSubmitting(false);
      return;
    }

    if (!activeBale) {
      setFeedbackToast({ text: 'Please select a bale first', type: 'error' });
      return;
    }

    // Check if bale is already completed/finalized
    if (hudStats.isCompleted || activeBale.status === 'COMPLETED' || activeBale.status === 'POSTED') {
      luxuryAudio.playCancelBeep();
      setFeedbackToast({
        text: `🔒 Cannot add pieces: Bale ${activeBale.baleCode || activeBale.gatePassNo} is 100% COMPLETED and locked into inventory!`,
        type: 'error'
      });
      return;
    }

    if (numericGramWeight <= 0) {
      setFeedbackToast({ text: 'Please enter a valid gram weight (> 0g)', type: 'error' });
      const el = document.getElementById('weight-input-field') as HTMLInputElement | null;
      if (el) el.focus();
      else if (gramInputRef.current) gramInputRef.current.focus();
      return;
    }

    setIsSubmitting(true);
    luxuryAudio.playMechanicalClick();

    const qty = Math.max(1, Math.floor(Number(bundleQuantity) || 1));
    const activeBaleId = activeBale.baleCode || activeBale.gatePassNo || activeBale.id || 'BAL-01';
    const effectiveSellingPrice = (sellingPriceOverride !== null && sellingPriceOverride.trim() !== '')
      ? Number(sellingPriceOverride)
      : suggestedSellingPrice;
    const isOverridden = aiSuggestedPrice > 0 && effectiveSellingPrice < aiSuggestedPrice;
    const finalGrailStatus = Boolean(isGrail || ['Antique', 'Boutique', 'Grails'].includes(marketSegment) || era.toLowerCase().includes('antique'));

    // Smart Quality Routing Engine: Super Cream & Grade A go live to Storefront; Grade B & Rework held in Laundry WIP
    const gradeLower = String(selectedGrade || '').toLowerCase().trim();
    const isPristine = (
      gradeLower.includes('super cream') ||
      gradeLower.includes('cream') ||
      gradeLower.includes('grade a') ||
      gradeLower.includes('grade-a') ||
      gradeLower.includes('grade_a')
    ) && !gradeLower.includes('rework') && !gradeLower.includes('grade b') && !gradeLower.includes('grade c');
    const readyForEcommerce = isPristine;
    const pieceStatus = isPristine ? 'IN_STOCK' : 'WIP_LAUNDRY';

    // Auto-populate Item Master in background if new
    if (brandTitle.trim()) {
      const existsInMasters = internalItemMasters.some(im => im.name.toLowerCase() === brandTitle.trim().toLowerCase());
      if (!existsInMasters) {
        SetupService.addItem({
          code: `ITM-${Date.now().toString().slice(-4)}`,
          name: sanitizeString(brandTitle.trim(), 128),
          category: sanitizeString(selectedCategory, 128),
          basePrice: effectiveSellingPrice || 50,
          targetUom: 'PCS',
          weightKg: Number((numericGramWeight / 1000 / qty).toFixed(3)),
          minStockThreshold: 1
        }).then(newMaster => {
          setInternalItemMasters(prev => [...prev, newMaster]);
        }).catch(() => {});
      }
    }

    const subCategoryName = selectedSubCatObj?.name || '';
    const collectionId = selectedCollectionObj?.id || null;
    const collectionName = selectedCollectionObj?.name || null;
    const parentDeptName = selectedDeptObj?.name || activeDeptObj?.name || 'Vintage';

    // Distribute weights across bundle items
    const baseGramsPerPiece = Math.floor(numericGramWeight / qty);
    let remainingGramsToDistribute = numericGramWeight;

    const inventoryPiecesToUpsert: any[] = [];
    const baleSortedPiecesToInsert: any[] = [];
    const newPieceBreakdownItems: PieceBreakdownItem[] = [];
    const stickerPayloads: StickerData[] = [];
    const nowIso = new Date().toISOString();

    // Extract highest sequence number from existing pieces (Smart Sequencing)
    const maxSeq = pieces.reduce((max, p) => {
      const match = (p.piece_code || p.barcode)?.match(/-P(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const startSeq = Math.max(pieces.length, maxSeq);

    const pieceGlobalInsights = {
      ...(globalInsights || {}),
      ...(pitToPit || lengthInches ? {
        measurements: {
          pitToPit: pitToPit || (globalInsights as any)?.measurements?.pitToPit || '',
          length: lengthInches || (globalInsights as any)?.measurements?.length || ''
        }
      } : {}),
      ...(measurementImageUrl ? { measurement_image_url: measurementImageUrl } : {})
    };
    const effectiveGlobalInsights = Object.keys(pieceGlobalInsights).length > 0 ? pieceGlobalInsights : null;

    for (let i = 0; i < qty; i++) {
      const pieceIdx = startSeq + 1 + i;
      const barcode = `${activeBaleId}-P${String(pieceIdx).padStart(4, '0')}`;
      const pieceSku = qty === 1 ? generatedSku : `${generatedSku}-${String(i + 1).padStart(2, '0')}`;
      const pieceWeightGrams = (i === qty - 1) ? remainingGramsToDistribute : baseGramsPerPiece;
      remainingGramsToDistribute -= pieceWeightGrams;
      const weightKg = Number((pieceWeightGrams / 1000).toFixed(3));
      const calculatedPieceCost = Number((pieceWeightGrams * costPerGram).toFixed(2));

      const pieceId = String(
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            })
      );

      // Payload for public.bale_sorted_pieces (sanitized: strict column bounds)
      const sortedPieceDb = {
        id: pieceId,
        bale_id: String(activeBale.id),
        piece_code: sanitizeString(barcode, 64),
        sku: sanitizeString(pieceSku, 50),
        parent_category_name: sanitizeNullableString(parentDeptName, 64),
        category: sanitizeString(selectedCategory, 64),
        sub_category: sanitizeNullableString(subCategoryName, 64),
        collection_id: collectionId,
        collection_name: sanitizeNullableString(collectionName, 64),
        ready_for_ecommerce: readyForEcommerce,
        ecommerce_description: ecommerceDescription || styleNotes || `Authentic ${era} ${selectedCategory} curated by Vintage Vibes.`,
        seo_tags: seoTags.length > 0 ? seoTags : [`${era} vintage`, selectedCategory.toLowerCase(), brandTitle.toLowerCase()],
        size: sanitizeString(sizeScanned, 32),
        brand_title: sanitizeString(brandTitle, 64),
        weight_grams: pieceWeightGrams,
        cost_price: calculatedPieceCost,
        selling_price: effectiveSellingPrice,
        quality_grade: sanitizeString(selectedGrade, 32),
        front_image: frontImageUrl || null,
        back_image: backImageUrl || null,
        tag_image: tagImageUrl || null,
        era: sanitizeString(era || '1990s Vintage', 32),
        market_segment: sanitizeString(marketSegment || 'Vintage', 64),
        is_grail: finalGrailStatus,
        ai_suggested_price: aiSuggestedPrice || effectiveSellingPrice,
        is_price_overridden: isOverridden,
        global_insights: effectiveGlobalInsights
      };

      // Payload for public.inventory_pieces (sanitized: strict column bounds)
      const inventoryPieceDb = {
        id: pieceId,
        gate_pass_id: String(activeBale.id),
        barcode: sanitizeString(barcode, 64),
        sku: sanitizeString(pieceSku, 50),
        item_name: sanitizeString(selectedCategory, 128),
        brand_name: sanitizeString(brandTitle.split(' ')[0] || "Vintage", 64),
        brand_tier: sanitizeString(finalGrailStatus ? 'Grail' : 'Vintage Curated', 32),
        label_grade: sanitizeString(selectedGrade, 32),
        shop_location: sanitizeString(shopLocation, 64),
        weight_kg: weightKg,
        weight_grams: pieceWeightGrams,
        cost_price: calculatedPieceCost,
        estimated_price: effectiveSellingPrice,
        retail_price_aed: effectiveSellingPrice,
        size_scanned: sanitizeString(sizeScanned, 32),
        country_of_origin: sanitizeNullableString(countryOfOrigin, 64),
        style: sanitizeNullableString(styleNotes || brandTitle, 64),
        front_image_url: frontImageUrl || '',
        back_image_url: backImageUrl || '',
        tag_image_url: tagImageUrl || '',
        is_sold: false,
        status: sanitizeString(pieceStatus, 32),
        market_segment: sanitizeString(marketSegment || 'Vintage', 64),
        is_grail: finalGrailStatus,
        ai_suggested_price: aiSuggestedPrice || effectiveSellingPrice,
        is_price_overridden: isOverridden,
        global_insights: effectiveGlobalInsights,
        ready_for_ecommerce: readyForEcommerce,
        ecommerce_description: ecommerceDescription || styleNotes || `Authentic ${era} ${selectedCategory} curated by Vintage Vibes.`,
        seo_tags: seoTags.length > 0 ? seoTags : [`${era} vintage`, selectedCategory.toLowerCase(), brandTitle.toLowerCase()],
        parent_category_name: sanitizeNullableString(parentDeptName, 64),
        sub_category: sanitizeNullableString(subCategoryName, 64),
        collection_id: collectionId,
        collection_name: sanitizeNullableString(collectionName, 64)
      };

      const breakdownItem: PieceBreakdownItem = {
        id: pieceId,
        gatePassId: String(activeBale.id),
        baleCode: activeBale.baleCode || activeBale.gatePassNo,
        barcode,
        itemName: selectedCategory,
        brandName: brandTitle.split(' ')[0] || "Levi's",
        brandTier: finalGrailStatus ? 'Grail' : 'Vintage Curated',
        labelGrade: selectedGrade,
        shopLocation,
        weightGrams: pieceWeightGrams,
        weightKg,
        costPerGram,
        calculatedCostPrice: calculatedPieceCost,
        costPrice: calculatedPieceCost,
        estimatedPrice: effectiveSellingPrice,
        retailPriceAed: effectiveSellingPrice,
        sizeScanned,
        countryOfOrigin,
        style: styleNotes || brandTitle,
        frontImageUrl,
        backImageUrl,
        tagImageUrl,
        era: era || '1990s Vintage',
        marketSegment: marketSegment || 'Vintage',
        isGrail: finalGrailStatus,
        aiSuggestedPrice: aiSuggestedPrice || effectiveSellingPrice,
        isPriceOverridden: isOverridden,
        globalInsights: effectiveGlobalInsights || undefined,
        pitToPitInches: pitToPit ? Number(pitToPit) || undefined : undefined,
        lengthInches: lengthInches ? Number(lengthInches) || undefined : undefined,
        isSold: false,
        isTagged: true,
        ready_for_ecommerce: readyForEcommerce,
        ecommerce_description: ecommerceDescription || styleNotes,
        seo_tags: seoTags,
        status: pieceStatus,
        parent_category_name: parentDeptName,
        sub_category: subCategoryName,
        collection_id: collectionId,
        collection_name: collectionName,
        createdAt: nowIso
      } as any;

      inventoryPiecesToUpsert.push(inventoryPieceDb);
      baleSortedPiecesToInsert.push(sortedPieceDb);
      newPieceBreakdownItems.push({ ...breakdownItem, ...sortedPieceDb });

      stickerPayloads.push({
        itemCode: barcode,
        description: `${pieceSku} • ${selectedCategory} (${sizeScanned})`,
        category: selectedCategory,
        size: sizeScanned,
        brand: brandTitle || selectedCategory,
        grade: selectedGrade,
        retailPriceAed: effectiveSellingPrice,
        weightKg,
        batchNo: activeBale.baleCode || activeBale.gatePassNo,
        date: nowIso.slice(0, 10),
        origin: countryOfOrigin,
        shopLocation
      });
    }

    // 1. Optimistically prepend pieces to table (live real-time progress update)
    const currentPieces = [...newPieceBreakdownItems, ...pieces];
    setPieces(currentPieces);

    // 2. Atomic Batch Processing: single bulk upsert & single bulk insert
    try {
      const { error: invErr } = await supabase
        .from('inventory_pieces')
        .upsert(inventoryPiecesToUpsert, { onConflict: 'id' });

      if (invErr) {
        console.warn('Instant inventory batch sync warning:', invErr);
      }

      const totalSortedGrams = currentPieces.reduce((sum, p) => sum + (Number(p.weight_grams ?? p.weightGrams) || 0), 0);
      const remainingGramsCount = Math.max(0, Math.round(Number(activeBale.totalBaleWeight || 0) * 1000) - totalSortedGrams);
      const sessionStats = {
        total_grams: Math.round(Number(activeBale.totalBaleWeight || 0) * 1000),
        sorted_grams: totalSortedGrams,
        remaining_grams: remainingGramsCount,
        total_pieces: currentPieces.length,
        piece_count: currentPieces.length,
        broken_down_weight: Number((totalSortedGrams / 1000).toFixed(2))
      };

      const { error: insertErr } = await PurchaseService.saveSortedPiecesBatch(
        String(activeBale.id),
        baleSortedPiecesToInsert,
        sessionStats
      );

      if (insertErr) {
        console.error('Failed to insert sorted pieces batch:', insertErr);
        const insertedIds = new Set(newPieceBreakdownItems.map(p => p.id));
        setPieces(prev => prev.filter(p => !insertedIds.has(p.id)));
        setFeedbackToast({
          text: `Failed to save pieces into database: ${insertErr.message || JSON.stringify(insertErr)}`,
          type: 'error'
        });
        setIsSubmitting(false);
        return;
      }
    } catch (err: any) {
      console.error('Exception inserting pieces batch:', err);
      const insertedIds = new Set(newPieceBreakdownItems.map(p => p.id));
      setPieces(prev => prev.filter(p => !insertedIds.has(p.id)));
      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        String(err?.message || '').toLowerCase().includes('disconnected') ||
        String(err?.message || '').toLowerCase().includes('network') ||
        String(err?.message || '').toLowerCase().includes('failed to fetch');

      setFeedbackToast({
        text: isOffline
          ? "Network disconnected. Please check your connection before saving."
          : `Error saving piece: ${err?.message || 'Database error'}`,
        type: 'error'
      });
      setIsSubmitting(false);
      return;
    }

    // Calculate local updated gate pass for parent state
    const depletion = PurchaseEngine.calculateBaleDepletion(activeBale.totalBaleWeight, currentPieces);
    const updatedGatePass: InwardGatePass = {
      ...activeBale,
      brokenDownWeight: depletion.brokenDownWeightKg,
      remainingWeight: depletion.remainingWeightKg,
      pieceCount: depletion.pieceCount,
      pieces: currentPieces,
      sortingStatus: depletion.sortingStatus
    };

    // Invoke callback to persist in state and cache
    newPieceBreakdownItems.forEach(item => {
      onPieceAdded(item, updatedGatePass);
    });

    // Auto-prepare thermal barcode sticker
    if (autoPrintThermalOnAdd) {
      stickerPayloads.forEach(stickerPayload => {
        try {
          openThermalLabelPrintWindow({
            itemCode: `${stickerPayload.itemCode} [${stickerPayload.description.split(' • ')[0]}]`,
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
      });
    } else {
      stickerPayloads.forEach(sticker => onPrintSticker(sticker));
    }

    setFeedbackToast({
      text: qty > 1
        ? `✓ Added Bundle of ${qty} pieces (${numericGramWeight}g)!`
        : readyForEcommerce
        ? `✓ Added ${generatedSku} (${numericGramWeight}g) • 🌐 Routed to Storefront!`
        : `✓ Added ${generatedSku} (${numericGramWeight}g) • 🧺 Routed to WIP Laundry`,
      type: 'success'
    });

    // Advance sequence for next piece
    SetupService.generateSku(activeDeptCode).then(s => setGeneratedSku(s)).catch(() => {});

    // Reset fields with smart defaults and refocus weight immediately
    setBundleQuantity(1);
    setActiveGrailAlert(null);
    setGramWeight('');
    setSellingPriceOverride(null);
    setBrandTitle('');
    setStyleNotes('');
    setEcommerceDescription('');
    setSeoTags([]);
    setFrontImageUrl(undefined);
    setBackImageUrl(undefined);
    setTagImageUrl(undefined);
    setMeasurementImageUrl(undefined);
    setPitToPit('');
    setLengthInches('');
    setEra('1990s Vintage');
    setMarketSegment('Vintage');
    setIsGrail(false);
    setAiSuggestedPrice(0);
    setGlobalInsights(null);
    setShowGlobalInsightsPanel(false);
    setIsSubmitting(false);

    setTimeout(() => {
      const el = document.getElementById('weight-input-field') as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      } else if (gramInputRef.current) {
        gramInputRef.current.focus();
        gramInputRef.current.select();
      }
    }, 10);
  };

  // Delete piece handler (sync with public.bale_sorted_pieces, inward_gate_passes & bale_sessions)
  const handleDeletePiece = async (pieceId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activeBale) return;

    if (hudStats.isCompleted || isTerminalFinalized || activeBale?.status === 'COMPLETED' || activeBale?.status === 'POSTED') {
      setFeedbackToast({
        text: '🔒 Bale is finalized and locked. Please click "Re-open / Unlock Bale" first to delete pieces.',
        type: 'error'
      });
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFeedbackToast({
        text: 'Network disconnected. Please check your connection before saving.',
        type: 'error'
      });
      return;
    }

    luxuryAudio.playMechanicalClick();
    if (!confirm('Are you sure you want to remove this piece from the session?')) return;

    const removedItem = pieces.find(p => p.id === pieceId);
    // 1. Calculate new totals after deletion
    const remainingPieces = pieces.filter(p => p.id !== pieceId);
    const newPiecesCount = remainingPieces.length;
    const newSortedGrams = remainingPieces.reduce((sum, p) => sum + Number(p.weight_grams ?? p.weightGrams ?? (Number(p.weightKg ?? p.weight_kg ?? 0) * 1000)), 0);
    const newSortedKg = Number((newSortedGrams / 1000).toFixed(3));
    const newRemainingGrams = Math.max(0, hudStats.totalGrams - newSortedGrams);
    const newRemainingKg = Number((newRemainingGrams / 1000).toFixed(3));

    const updatedGatePass: InwardGatePass = {
      ...activeBale,
      brokenDownWeight: newSortedKg,
      broken_down_weight: newSortedKg,
      remainingWeight: newRemainingKg,
      remaining_weight: newRemainingKg,
      pieceCount: newPiecesCount,
      piece_count: newPiecesCount,
      pieces_count: newPiecesCount,
      total_pieces: newPiecesCount,
      pieces: remainingPieces,
      sortingStatus: (newPiecesCount === 0 && newSortedGrams === 0) ? 'UNOPENED' : 'PARTIALLY_SORTED'
    } as any;

    // Optimistic removal (Instant 0ms latency)
    setPieces(remainingPieces);
    setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? updatedGatePass : b));

    try {
      // 1. Delete child records from Supabase
      await supabase.from('inventory_pieces').delete().eq('id', pieceId);
      const { error: supaErr } = await supabase.from('bale_sorted_pieces').delete().eq('id', pieceId);
      if (supaErr) {
        console.error('Failed to delete piece from Supabase:', supaErr);
        throw supaErr;
      }

      // 2. Update inward_gate_passes
      await supabase
        .from('inward_gate_passes')
        .update({
          piece_count: newPiecesCount,
          broken_down_weight: newSortedKg
        })
        .eq('id', activeBale.id);

      // 3. Update bale_sessions
      await supabase
        .from('bale_sessions')
        .update({
          total_pieces: newPiecesCount,
          sorted_grams: newSortedGrams,
          remaining_grams: newRemainingGrams
        })
        .eq('bale_id', activeBale.id);

      // 4. Force Cache Invalidation & Realtime Sync
      PurchaseService.invalidateAllPurchaseCaches();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vv:realtime-record', {
            detail: {
              table: 'inward_gate_passes',
              record: {
                id: activeBale.id,
                gate_pass_no: activeBale.gatePassNo,
                piece_count: newPiecesCount,
                broken_down_weight: newSortedKg
              }
            }
          })
        );
      }
    } catch (err: any) {
      console.error('Failed to sync piece deletion to Supabase:', err);
      // Rollback optimistic state if backend operation fails
      if (removedItem) {
        setPieces(prev => [...prev, removedItem]);
        setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? activeBale : b));
      }
      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        String(err?.message || '').toLowerCase().includes('disconnected') ||
        String(err?.message || '').toLowerCase().includes('network') ||
        String(err?.message || '').toLowerCase().includes('failed to fetch');

      setFeedbackToast({
        text: isOffline
          ? 'Network disconnected. Please check your connection before saving.'
          : `Failed to delete piece: ${err?.message || 'Error'}`,
        type: 'error'
      });
      return;
    }

    onPieceDeleted(pieceId, updatedGatePass);
    setFeedbackToast({ text: 'Piece deleted; weights updated.', type: 'info' });
  };

  // Re-open / Unlock Bale for Sorting
  const handleReopenBale = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activeBale) return;
    luxuryAudio.playMechanicalClick();
    if (!confirm(`Are you sure you want to re-open and unlock Bale ${activeBale.baleCode || activeBale.gatePassNo}? This will unlock the terminal and allow you to scan and add remaining garments.`)) {
      return;
    }

    // =========================================================================
    // OPTIMISTIC UI INSTANT STATE MUTATION (0ms Latency)
    // Instantly unlock UI, enable piece additions/deletions, restore terminal
    // =========================================================================
    setIsTerminalFinalized(false);
    activeBale.status = 'IN_PROGRESS' as any;
    activeBale.sortingStatus = 'PARTIALLY_SORTED' as any;
    setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? {
      ...b,
      status: 'IN_PROGRESS' as any,
      sortingStatus: 'PARTIALLY_SORTED' as any
    } : b));

    if (onSavePartial) {
      onSavePartial(activeBale.id);
    }

    setFeedbackToast({
      text: `✓ Bale ${activeBale.baleCode || activeBale.gatePassNo} unlocked & re-opened for sorting! (WIP balance restored)`,
      type: 'success'
    });

    setIsSubmitting(true);

    try {
      // 1. Invoke PurchaseService.unlockBaleSession to revert status and delete JV-FIN auto-voucher (reversing balance to WIP 1150-01)
      await PurchaseService.unlockBaleSession(activeBale.id, activeBale.baleCode || activeBale.gatePassNo);

      PurchaseService.invalidateAllPurchaseCaches();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vv:realtime-record', {
            detail: {
              table: 'inward_gate_passes',
              record: {
                id: activeBale.id,
                gate_pass_no: activeBale.gatePassNo,
                bale_code: activeBale.baleCode,
                status: 'IN_PROGRESS'
              }
            }
          })
        );
      }
    } catch (err: any) {
      console.error('Error reopening bale:', err);
      // Rollback optimistic state if backend operation fails
      setIsTerminalFinalized(true);
      activeBale.status = 'COMPLETED' as any;
      activeBale.sortingStatus = 'FULLY_SORTED' as any;
      setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? {
        ...b,
        status: 'COMPLETED' as any,
        sortingStatus: 'FULLY_SORTED' as any
      } : b));
      alert(`Failed to unlock bale: ${err?.message || 'Database error'}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        const el = document.getElementById('weight-input-field') as HTMLInputElement | null;
        if (el) {
          el.focus();
          el.select();
        }
      }, 150);
    }
  };

  // Save as in-progress (strictly updates existing session & gate pass, never generates duplicates)
  const handleSaveInProgress = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activeBale) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFeedbackToast({
        text: 'Network disconnected. Please check your connection before saving.',
        type: 'error'
      });
      return;
    }

    luxuryAudio.playMechanicalClick();
    setIsSubmitting(true);

    const newStatus = hudStats.piecesCount > 0 ? 'PARTIAL' : 'UNOPENED';
    try {
      await PurchaseService.savePartialSession(activeBale.id, {
        total_grams: hudStats.totalGrams,
        sorted_grams: hudStats.sortedGrams,
        remaining_grams: hudStats.remainingGrams,
        total_pieces: hudStats.piecesCount,
        piece_count: hudStats.piecesCount,
        broken_down_weight: hudStats.sortedKg,
        status: newStatus
      });

      // Explicitly unlock local terminal state
      setIsTerminalFinalized(false);
      activeBale.status = newStatus as any;
      activeBale.sortingStatus = (newStatus === 'PARTIAL' ? 'PARTIALLY_SORTED' : 'UNOPENED') as any;

      if (onSavePartial) {
        onSavePartial(activeBale.id);
      }
      setIsSubmitting(false);
      setFeedbackToast({ text: `Bale ${activeBale.baleCode || activeBale.gatePassNo} saved as In-Progress.`, type: 'success' });
      setTimeout(onClose, 400);
    } catch (err: any) {
      console.warn('Session save error:', err);
      setIsSubmitting(false);
      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        String(err?.message || '').toLowerCase().includes('disconnected') ||
        String(err?.message || '').toLowerCase().includes('network') ||
        String(err?.message || '').toLowerCase().includes('failed to fetch');

      setFeedbackToast({
        text: isOffline
          ? 'Network disconnected. Please check your connection before saving.'
          : `Session save notice: ${err?.message || 'Error'}`,
        type: 'error'
      });
    }
  };

  // Finalize & Post Bale (upsert COMPLETED into public.bale_sessions, inward_gate_passes and inventory_pieces)
  const handleFinalizeAndPost = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTerminalFinalized || activeBale.status === 'COMPLETED' || activeBale.status === 'POSTED') {
      alert("This bale is already finalized and posted!");
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFeedbackToast({
        text: 'Network disconnected. Please check your connection before saving.',
        type: 'error'
      });
      return;
    }

    // Strict check 1: Empty bale cannot be finalized
    if (hudStats.piecesCount === 0) {
      alert("⚠️ Cannot finalize an empty bale! There are 0 garments sorted. Please sort at least one piece before finalizing, or use 'Save as In-Progress' to keep it open.");
      return;
    }

    // Strict check 2: Strong warning if incomplete weight remains
    if (hudStats.remainingGrams > 500 && hudStats.progressPercent < 90) {
      const proceed = confirm(
        `⚠️ INCOMPLETE BALE WARNING:\n\n` +
        `• Total Weight: ${hudStats.totalGrams.toLocaleString()}g\n` +
        `• Sorted So Far: ${hudStats.sortedGrams.toLocaleString()}g (${hudStats.piecesCount} garments)\n` +
        `• REMAINING UNSORTED: ${hudStats.remainingGrams.toLocaleString()}g (${100 - hudStats.progressPercent}%)\n\n` +
        `This bale is only ${hudStats.progressPercent}% sorted!\n` +
        `Are you sure you want to prematurely close and lock this bale?\n\n` +
        `Click 'Cancel' to continue sorting, or 'OK' if the bale is physically finished.`
      );
      if (!proceed) return;
    } else {
      if (!confirm(`Finalize and lock Bale ${activeBale.baleCode || activeBale.gatePassNo}? All ${hudStats.piecesCount} pieces will join active Finished Goods inventory.`)) {
        return;
      }
    }

    luxuryAudio.playMechanicalClick();

    // =========================================================================
    // OPTIMISTIC UI INSTANT STATE MUTATION (0ms Latency)
    // Instantly reflect finalized status in UI before heavy database/ledger transactions
    // =========================================================================
    setIsTerminalFinalized(true);
    activeBale.status = 'COMPLETED' as any;
    activeBale.sortingStatus = 'FULLY_SORTED' as any;
    activeBale.pieceCount = hudStats.piecesCount;
    activeBale.brokenDownWeight = Number((hudStats.sortedGrams / 1000).toFixed(3));
    activeBale.remainingWeight = 0;
    setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? {
      ...b,
      status: 'COMPLETED' as any,
      sortingStatus: 'FULLY_SORTED' as any,
      pieceCount: hudStats.piecesCount,
      brokenDownWeight: Number((hudStats.sortedGrams / 1000).toFixed(3))
    } : b));
    setFeedbackToast({ text: `Bale ${activeBale.baleCode || activeBale.gatePassNo} finalized & locked!`, type: 'success' });

    setIsSubmitting(true);

    try {
      const sessionPayload = {
        bale_id: activeBale.id,
        total_grams: hudStats.totalGrams,
        sorted_grams: hudStats.sortedGrams,
        remaining_grams: hudStats.remainingGrams,
        total_pieces: hudStats.piecesCount,
        status: 'COMPLETED',
        updated_at: new Date().toISOString()
      };

      const { data: existingSession } = await supabase
        .from('bale_sessions')
        .select('bale_id')
        .eq('bale_id', activeBale.id)
        .maybeSingle();

      if (existingSession?.bale_id) {
        await supabase
          .from('bale_sessions')
          .update({
            total_grams: sessionPayload.total_grams,
            sorted_grams: sessionPayload.sorted_grams,
            remaining_grams: sessionPayload.remaining_grams,
            total_pieces: sessionPayload.total_pieces,
            status: 'COMPLETED',
            updated_at: sessionPayload.updated_at
          })
          .eq('bale_id', activeBale.id);
      } else {
        await supabase
          .from('bale_sessions')
          .insert([sessionPayload]);
      }

      // Auto-Rescue duplicate barcodes in local state if present
      const barcodeCounts = new Map<string, number>();
      pieces.forEach(p => {
        const bc = p.piece_code || p.barcode;
        if (bc) barcodeCounts.set(bc, (barcodeCounts.get(bc) || 0) + 1);
      });
      const hasDuplicateBarcodes = Array.from(barcodeCounts.values()).some(count => count > 1);
      if (hasDuplicateBarcodes) {
        const baseCode = activeBale.baleCode || activeBale.gatePassNo || activeBale.id;
        const rescuedPieces = pieces.map((p, idx) => {
          const rescuedBarcode = `${baseCode}-P${String(idx + 1).padStart(4, '0')}`;
          return {
            ...p,
            piece_code: rescuedBarcode,
            barcode: rescuedBarcode
          };
        });
        setPieces(rescuedPieces);
      }

      // Call service to update inward_gate_passes & copy pieces into inventory_pieces
      await PurchaseService.finalizeBaleSession(activeBale.id);

      // Force reactive cache invalidation & broadcast realtime event to update BaleMasterRegistry immediately
      PurchaseService.invalidateAllPurchaseCaches();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vv:realtime-record', {
            detail: {
              table: 'inward_gate_passes',
              record: {
                id: activeBale.id,
                gate_pass_no: activeBale.gatePassNo,
                bale_code: activeBale.baleCode,
                status: 'COMPLETED',
                piece_count: hudStats.piecesCount,
                broken_down_weight: Number((hudStats.sortedGrams / 1000).toFixed(3))
              }
            }
          })
        );
      }

      setIsSubmitting(false);
      if (onPostBale) {
        onPostBale(activeBale.id);
      }
      setTimeout(onClose, 400);
    } catch (err: any) {
      console.warn('Finalize session error:', err);
      setIsSubmitting(false);
      // Rollback optimistic state if backend operation fails
      setIsTerminalFinalized(false);
      activeBale.status = 'IN_PROGRESS' as any;
      activeBale.sortingStatus = 'PARTIALLY_SORTED' as any;
      setInternalBales(prev => prev.map(b => (b.id === activeBale.id || b.gatePassNo === activeBale.gatePassNo) ? {
        ...b,
        status: 'IN_PROGRESS' as any,
        sortingStatus: 'PARTIALLY_SORTED' as any
      } : b));

      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        String(err?.message || '').toLowerCase().includes('disconnected') ||
        String(err?.message || '').toLowerCase().includes('network') ||
        String(err?.message || '').toLowerCase().includes('failed to fetch');

      setFeedbackToast({
        text: isOffline
          ? 'Network disconnected. Please check your connection before saving.'
          : `Finalize session notice: ${err?.message || 'Error'}`,
        type: 'error'
      });
    }
  };

  // Register a new raw bale right from the terminal
  const handleQuickRegisterBale = async (e: React.FormEvent) => {
    e.preventDefault();
    const wtNum = Number(regWeightKg) || 0;
    const costNum = Number(regCostAed) || 0;
    if (wtNum <= 0) {
      setFeedbackToast({ text: 'Please enter a valid bale weight (kg).', type: 'error' });
      return;
    }
    const invNo = regInvoiceNo.trim() || `COMM-INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const supp = regSupplier.trim() || 'Direct Import Consignment';

    const localId = `igp-${Date.now()}`;
    const gatePassNo = `IGP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const baleCode = `BAL-${invNo.replace(/[^a-zA-Z0-9]/g, '')}-001`;
    const cpg = wtNum > 0 ? Number((costNum / (wtNum * 1000)).toFixed(6)) : 0;

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
  // Delete active bale if unbroken and unsorted (strictly based on actual sorted pieces count, not total gross weight)
  const activeSortedCount = Number(
    (pieces && pieces.length > 0 ? pieces.length : 0) ||
    activeBale?.pieceCount ||
    (activeBale as any)?.piece_count ||
    (activeBale as any)?.pieces_count ||
    0
  );
  const isActiveDeletable = Boolean(activeBale) && activeSortedCount === 0;

  const handleDeleteActiveBale = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activeBale) return;
    if (!isActiveDeletable) {
      alert(`⚠️ Cannot delete bale: This bale contains ${activeSortedCount} sorted pieces. Unsafe bale deletion is locked. Delete all pieces first.`);
      return;
    }
    const baleTitle = activeBale.baleCode || activeBale.gatePassNo || activeBale.id;
    if (!window.confirm(`Are you sure you want to delete Bale "${baleTitle}"?\n\nThis will remove the Inward Pass and unlock the associated Commercial Invoice for unposting.`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      luxuryAudio.playMechanicalClick();
      const deletedId = activeBale.id;
      await PurchaseService.deleteInwardGatePass(deletedId);
      setFeedbackToast({ text: `Bale "${baleTitle}" deleted successfully.`, type: 'success' });
      setInternalBales(prev => prev.filter(b => b.id !== deletedId));
      setSelectedBaleId('');
      if (onDeleteBale) {
        onDeleteBale(deletedId);
      }
      setTimeout(onClose, 500);
    } catch (err: any) {
      alert(`Failed to delete bale: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-slate-900 border-0 sm:border-2 border-indigo-500/50 rounded-none sm:rounded-2xl shadow-2xl w-full max-w-7xl h-[100dvh] sm:h-auto sm:max-h-[96vh] flex flex-col overflow-hidden">
        {/* TOP STATUS BAR */}
        <div className="bg-slate-950 px-4 sm:px-5 py-2.5 sm:py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1.5 sm:gap-2">
                <span>Bale Sorting Terminal</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-500/30 font-semibold whitespace-nowrap">
                  LIVE SPEED-SORT
                </span>
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-none">
                Weight depletion scale, dual barcodes & studio cataloger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeBale && (
              isActiveDeletable ? (
                <button
                  type="button"
                  onClick={(e) => handleDeleteActiveBale(e)}
                  disabled={isSubmitting}
                  title="Delete Inward Pass / Bale"
                  className="px-2.5 py-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-500/40 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete Bale</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Cannot delete: Pieces have already been sorted. Delete individual pieces first."
                  className="px-2.5 py-1.5 bg-slate-800 text-slate-500 border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-not-allowed opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete Bale</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={(e) => {
                if (e) {
                  e.preventDefault();
                  e.stopPropagation();
                }
                onClose();
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* FEEDBACK TOAST BANNER */}
        {feedbackToast && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all shrink-0 ${
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

        {/* MAIN SCROLLABLE BODY (Scrolls all steps on mobile and desktop) */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-800 overscroll-contain">
          {/* STEP 1: BALE IDENTIFICATION & REAL-TIME HUD BAR */}
          <div className="bg-slate-900/90 p-3.5 sm:px-5 sm:py-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
            {/* Scan Barcode Gun or Select Dropdown */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 flex-1 w-full">
              <form onSubmit={handleBaleBarcodeScan} className="flex items-center gap-1.5 flex-1 min-w-[240px] sm:min-w-[280px]">
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
                className="bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-hidden focus:border-indigo-400 cursor-pointer font-medium min-w-[240px] max-w-[340px]"
              >
                {effectiveBales.length === 0 ? (
                  <option value="">[ ] -- No Bales (Create via Purchase Invoice or + New Bale) --</option>
                ) : (
                  <>
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
                          <option key={b.id} value={b.id}>
                            🔒 {b.baleCode || b.gatePassNo} - COMPLETED ({b.pieces?.length || b.pieceCount || 0} pcs)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
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
          <div className="grid grid-cols-5 sm:flex items-center gap-1 sm:gap-3 bg-slate-950/80 px-2 sm:px-4 py-2 rounded-xl border border-slate-800 font-mono shrink-0 w-full sm:w-auto text-center">
            <div className="px-0.5 sm:px-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider block truncate">Total</span>
              <span className="text-[11px] sm:text-xs font-black text-slate-200">{hudStats.totalGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="px-0.5 sm:px-1">
              <span className="text-[9px] sm:text-[10px] text-emerald-400 uppercase tracking-wider block truncate">Sorted</span>
              <span className="text-[11px] sm:text-xs font-black text-emerald-400">{hudStats.sortedGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="px-0.5 sm:px-1">
              <span className="text-[9px] sm:text-[10px] text-amber-400 uppercase tracking-wider block truncate">Remain</span>
              <span className="text-[11px] sm:text-xs font-black text-amber-400">{hudStats.remainingGrams.toLocaleString()}g</span>
            </div>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="px-0.5 sm:px-1">
              <span className="text-[9px] sm:text-[10px] text-indigo-400 uppercase tracking-wider block truncate">Pieces</span>
              <span className="text-[11px] sm:text-xs font-black text-indigo-300">{hudStats.piecesCount} pcs</span>
            </div>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="px-0.5 sm:px-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider block truncate">Prog</span>
              <span className={`text-[11px] sm:text-xs font-black ${hudStats.isCompleted ? 'text-emerald-400' : 'text-indigo-400'}`}>
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

        {/* REAL-TIME LIVE PROGRESS BAR & WEIGHT MAPPING */}
        {activeBale && (
          <div className="px-3.5 sm:px-5 py-2.5 bg-slate-900/95 border-b border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">Bale Depletion:</span>
                <span className="text-emerald-400 font-bold text-xs sm:text-sm">
                  {hudStats.sortedGrams.toLocaleString()}g
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-300 font-medium text-xs sm:text-sm">
                  {hudStats.totalGrams.toLocaleString()}g
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400">
                  ({hudStats.sortedKg.toFixed(2)}kg / {hudStats.totalKg.toFixed(2)}kg)
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-slate-400 text-[10px] sm:text-[11px]">
                  Remaining: <strong className="text-amber-400 font-mono">{hudStats.remainingGrams.toLocaleString()}g</strong>
                </span>
                <span className="text-slate-400 text-[10px] sm:text-[11px]">
                  Pieces: <strong className="text-indigo-400 font-mono">{hudStats.piecesCount} pcs</strong>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold ${
                  hudStats.progressPercent >= 100 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}>
                  {hudStats.progressPercent}% Sorted
                </span>
              </div>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  hudStats.progressPercent >= 100 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : hudStats.progressPercent >= 75 
                    ? 'bg-gradient-to-r from-indigo-500 via-emerald-500 to-teal-400' 
                    : 'bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, hudStats.progressPercent))}%` }}
              />
            </div>
          </div>
        )}

        {/* 3D BALE BREAK-EVEN PROFIT HORIZON GAUGE */}
        {activeBale && (
          <div className="px-3.5 sm:px-5 py-3 bg-slate-950/70 border-b border-slate-800">
            <BaleProfitHorizonGauge
              baleCost={Number(activeBale.totalBaleCost) || (Number(activeBale.totalBaleWeight || 20) * 120)}
              pieces={pieces}
              baleCode={activeBale.baleCode || activeBale.gatePassNo || 'BALE-001'}
            />
          </div>
        )}

        {/* STEP 2: HIGH-SPEED REPETITIVE PIECE ENTRY ROW */}
        <div className="p-3 sm:p-5 bg-slate-900 border-b border-slate-800">
          {hudStats.isCompleted ? (
            <div className="bg-emerald-950/90 border-2 border-emerald-500/60 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-200 shadow-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-extrabold text-sm text-white block">
                    Bale {activeBale?.baleCode || activeBale?.gatePassNo} is {hudStats.piecesCount > 0 ? '100% Completed & Locked' : 'Marked Closed'}
                  </span>
                  <span className="text-xs text-emerald-300/90">
                    {hudStats.piecesCount > 0
                      ? `All ${hudStats.piecesCount} garments have been sorted, tagged, and posted into Finished Goods. New barcode scanning and piece entries for this bale are closed.`
                      : 'This bale was marked closed with 0 pieces sorted.'}{' '}
                    Need to add more garments or edit this bale? Click Re-open below to unlock the sorting stream.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  id="btn-reopen-bale"
                  onClick={(e) => handleReopenBale(e)}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer transform active:scale-95 whitespace-nowrap"
                  title="Unlock and reopen this bale for sorting"
                >
                  <Unlock className="w-4 h-4 text-slate-950" />
                  <span>🔓 Re-open / Unlock Bale</span>
                </button>
                <span className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-lg text-xs font-mono font-bold text-emerald-300 uppercase whitespace-nowrap">
                  Bale Closed
                </span>
              </div>
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
                </div>
              </div>

              {/* STUDIO 3-ANGLE LIVE PHOTO CAPTURE STRIP */}
              <div className="bg-slate-900/95 border border-indigo-900/60 rounded-xl p-2.5 space-y-2 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Garment 3-Angle Studio & AI Valuation:</span>
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      Unified Studio Camera auto-appraises Era (Antique/Vintage/Y2K/Non-Brand) & attaches 3 angles
                    </span>
                  </div>

                  {/* Unified Live Studio & AI Appraiser Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setStudioCameraSlot('front');
                      setShowStudioCamera(true);
                    }}
                    className="bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 hover:from-indigo-500 hover:to-amber-400 text-white font-black text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 active:scale-95 transition cursor-pointer"
                    title="Unified 4-Angle Studio & AI Vintage Appraisal Hub"
                  >
                    <Camera className="w-3.5 h-3.5 animate-pulse text-indigo-200" />
                    <span>🎥 Live Studio & AI Appraiser</span>
                    <Sparkles className="w-3 h-3 text-amber-300 animate-bounce" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <img
                              src={frontImageUrl}
                              alt="Front"
                              onClick={() => setPreviewLightboxImage(frontImageUrl)}
                              className="w-10 h-10 object-cover rounded-lg border border-emerald-500 cursor-pointer hover:opacity-80 transition"
                              title="Click to view full photo"
                            />
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => setPreviewLightboxImage(frontImageUrl)}
                                className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3 text-indigo-400" /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudioCameraSlot('front');
                                  setShowStudioCamera(true);
                                }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" /> Retake
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFrontImageUrl(undefined)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition"
                            title="Remove Front Photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 w-full">
                          {/* Live studio camera */}
                          <button
                            type="button"
                            onClick={() => {
                              setStudioCameraSlot('front');
                              setShowStudioCamera(true);
                            }}
                            className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
                            title="Open live camera"
                          >
                            <Camera className="w-3 h-3 text-indigo-400" />
                            <span>Live</span>
                          </button>

                          {/* Snap with native Phone Camera */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition" title="Snap with phone camera">
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                            <span>Snap</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setFrontImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setFrontImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Pick from Gallery / PC */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition" title="Upload from file">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setFrontImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setFrontImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
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
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <img
                              src={backImageUrl}
                              alt="Back"
                              onClick={() => setPreviewLightboxImage(backImageUrl)}
                              className="w-10 h-10 object-cover rounded-lg border border-emerald-500 cursor-pointer hover:opacity-80 transition"
                              title="Click to view full photo"
                            />
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => setPreviewLightboxImage(backImageUrl)}
                                className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3 text-indigo-400" /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudioCameraSlot('back');
                                  setShowStudioCamera(true);
                                }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" /> Retake
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBackImageUrl(undefined)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition"
                            title="Remove Back Photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 w-full">
                          {/* Live studio camera */}
                          <button
                            type="button"
                            onClick={() => {
                              setStudioCameraSlot('back');
                              setShowStudioCamera(true);
                            }}
                            className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
                            title="Open live camera"
                          >
                            <Camera className="w-3 h-3 text-indigo-400" />
                            <span>Live</span>
                          </button>

                          {/* Snap with native Phone Camera */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition" title="Snap with phone camera">
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                            <span>Snap</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setBackImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setBackImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Pick from Gallery / PC */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition" title="Upload from file">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setBackImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setBackImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
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
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <img
                              src={tagImageUrl}
                              alt="Tag"
                              onClick={() => setPreviewLightboxImage(tagImageUrl)}
                              className="w-10 h-10 object-cover rounded-lg border border-amber-500 cursor-pointer hover:opacity-80 transition"
                              title="Click to view full photo"
                            />
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => setPreviewLightboxImage(tagImageUrl)}
                                className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3 text-indigo-400" /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudioCameraSlot('tag');
                                  setShowStudioCamera(true);
                                }}
                                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" /> Retake
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTagImageUrl(undefined)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition"
                            title="Remove Tag Photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full">
                          {/* Unified Studio Live Camera & AI Scanner for Tag */}
                          <button
                            type="button"
                            onClick={() => {
                              setStudioCameraSlot('tag');
                              setShowStudioCamera(true);
                            }}
                            className="bg-gradient-to-r from-amber-600/40 to-yellow-600/40 hover:from-amber-600/60 hover:to-yellow-600/60 text-amber-200 border border-amber-400/60 py-1.5 px-2 rounded-lg text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition shadow-xs col-span-2"
                            title="Open Unified Studio Camera & Auto-Appraise Tag"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                            <span>Live Camera & AI Scan</span>
                          </button>

                          {/* Snap Tag Photo with Phone */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition" title="Snap Tag with phone camera">
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                            <span>Snap</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setTagImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setTagImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Upload Tag Photo */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition" title="Upload Tag File">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setTagImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setTagImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slot 4: Measurement Tape (Internal) */}
                  <div className={`p-2 rounded-lg border flex flex-col justify-between gap-2 transition ${
                    measurementImageUrl
                      ? 'bg-purple-950/30 border-purple-500/50 ring-1 ring-purple-500/20'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                        <span>📏 Measurement Tape:</span>
                      </span>
                      {measurementImageUrl ? (
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.5 rounded border border-purple-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Attached
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Optional</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {measurementImageUrl ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <img
                              src={measurementImageUrl}
                              alt="Measurement Tape"
                              onClick={() => setPreviewLightboxImage(measurementImageUrl)}
                              className="w-10 h-10 object-cover rounded-lg border border-purple-500 cursor-pointer hover:opacity-80 transition"
                              title="Click to view full photo"
                            />
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => setPreviewLightboxImage(measurementImageUrl)}
                                className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3 text-purple-400" /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudioCameraSlot('measurement');
                                  setShowStudioCamera(true);
                                }}
                                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" /> Retake
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMeasurementImageUrl(undefined)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition"
                            title="Remove Measurement Photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 w-full">
                          {/* Live studio camera for measurement */}
                          <button
                            type="button"
                            onClick={() => {
                              setStudioCameraSlot('measurement');
                              setShowStudioCamera(true);
                            }}
                            className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
                            title="Open live camera for tape measurement"
                          >
                            <Camera className="w-3 h-3 text-purple-400" />
                            <span>Live</span>
                          </button>

                          {/* Snap Measurement Photo with Phone */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition" title="Snap Tape with phone camera">
                            <Smartphone className="w-3 h-3 text-purple-400" />
                            <span>Snap</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setMeasurementImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setMeasurementImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Upload Measurement Photo */}
                          <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-1.5 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition" title="Upload Tape File">
                            <UploadCloud className="w-3 h-3 text-slate-400" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file, 1280, 0.85);
                                    setMeasurementImageUrl(compressed);
                                  } catch {
                                    const r = new FileReader();
                                    r.onload = () => setMeasurementImageUrl(r.result as string);
                                    r.readAsDataURL(file);
                                  }
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

              {/* ACTIVE GRAIL APPRAISAL ALERT BANNER */}
              {activeGrailAlert && (
                <div className="bg-gradient-to-r from-amber-950/95 via-yellow-950/90 to-amber-900/95 border-2 border-amber-400 rounded-xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/30 border border-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                      <Crown className="w-6 h-6 text-amber-300 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-amber-300 tracking-wide flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          <span>VINTAGE GRAIL PIECE PROTECTED:</span>
                          <span className="text-white underline">{activeGrailAlert.garmentTitle || activeGrailAlert.brand}</span>
                        </span>
                        <span className="text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/50 px-2 py-0.5 rounded-full font-mono font-bold">
                          {activeGrailAlert.era} • {activeGrailAlert.stitchType}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-100/90 mt-1">
                        Global Resale Market: <strong className="text-white">AED {activeGrailAlert.estimatedMarketValueAed}</strong> (~${activeGrailAlert.estimatedMarketValueUsd} USD) • Protected Showroom Retail Tag: <strong className="text-emerald-300 text-xs">AED {activeGrailAlert.recommendedRetailPriceAed}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-950/80 border border-emerald-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>AED 50 UNDERPRICING BLOCKED</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveGrailAlert(null)}
                      className="text-xs text-amber-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition cursor-pointer"
                      title="Dismiss alert banner"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* 🌍 GLOBAL GEO-ARBITRAGE MARKET INSIGHTS PANEL */}
              {globalInsights && (
                <div className="mb-3 rounded-xl border border-indigo-500/40 bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 p-3 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-indigo-800/40">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-400/50 flex items-center justify-center text-indigo-300 text-xs font-bold">
                        🌍
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <span>Global Market Insights & Geo-Arbitrage</span>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {marketSegment.toUpperCase()}
                          </span>
                          {(isGrail || ['Antique', 'Boutique', 'Grails'].includes(marketSegment) || era.toLowerCase().includes('antique')) && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> GRAIL LOCK ACTIVE
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          International collector resale benchmarks vs. UAE local wholesale cost
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGlobalInsights(null)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">🇺🇸 USA (eBay / Grailed)</div>
                      <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                        ${globalInsights.usa_market_usd || 0}
                      </div>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">🇪🇺 Europe (Vinted / Vestiaire)</div>
                      <div className="text-sm font-black font-mono text-cyan-400 mt-0.5">
                        €{globalInsights.europe_market_eur || 0}
                      </div>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">🇦🇺 Australia (Depop)</div>
                      <div className="text-sm font-black font-mono text-amber-400 mt-0.5">
                        A${globalInsights.australia_market_aud || 0}
                      </div>
                    </div>
                    <div className="bg-slate-900/80 border border-indigo-700/60 bg-indigo-950/30 rounded-lg p-2 text-center">
                      <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wide">🇦🇪 UAE Recommended</div>
                      <div className="text-sm font-black font-mono text-indigo-200 mt-0.5">
                        AED {globalInsights.uae_retail_aed || 0}
                      </div>
                    </div>
                  </div>

                  {globalInsights.arbitrage_analysis && (
                    <div className="mt-2 text-[11px] text-slate-300 bg-slate-900/60 rounded-lg p-2 border border-slate-800 flex items-start gap-1.5">
                      <span className="text-indigo-400 font-bold shrink-0">Arbitrage Margin:</span>
                      <span>{globalInsights.arbitrage_analysis}</span>
                    </div>
                  )}
                </div>
              )}

              {/* RAPID INPUT CONTROLS ROW */}
              {(() => {
                const isGrailLocked = Boolean(isGrail || ['Antique', 'Boutique', 'Grails'].includes(marketSegment) || era.toLowerCase().includes('antique') || activeGrailAlert?.isGrail);
                const currentSellingPrice = (sellingPriceOverride !== null && sellingPriceOverride.trim() !== '')
                  ? Number(sellingPriceOverride)
                  : Number(suggestedSellingPrice || 0);
                const isBelowCost = autoPieceCostAed > 0 && currentSellingPrice > 0 && currentSellingPrice < autoPieceCostAed;
                const isPristine = ['Super Cream', 'Grade A+', 'Grade A', 'CREAM', 'GRADE_A'].some(g =>
                  selectedGrade.toLowerCase().includes(g.toLowerCase())
                ) && !selectedGrade.toLowerCase().includes('rework') && !selectedGrade.toLowerCase().includes('grade b');

                return (
                  <div className="space-y-2.5">
                    {/* 4-TIER CASCADING TAXONOMY & CLASSIFICATION BAR */}
                    <div className="p-3 bg-slate-900/90 border border-indigo-900/50 rounded-xl space-y-2.5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] uppercase tracking-wider font-extrabold text-indigo-400 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            4-Tier Cascading Taxonomy & Classification
                          </span>
                          {selectedDeptObj && (
                            <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full">
                              {selectedDeptObj.name} ➔ {selectedMainCatObj?.name || 'Category'} {selectedSubCatObj ? `➔ ${selectedSubCatObj.name}` : ''}
                            </span>
                          )}
                        </div>

                        {/* Status Badges: SKU + Smart Routing + AI Copy Drawer */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Dynamic SKU Badge */}
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-indigo-500/50 text-indigo-300 font-mono text-xs font-black shadow-inner" title="Upcoming atomic SKU for this piece">
                            <Barcode className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{generatedSku}</span>
                          </div>

                          {/* Smart Quality Routing Gate */}
                          {isPristine ? (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold shadow-xs" title="Super Cream & Grade A pieces route directly to the Live E-Commerce Storefront">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>🟢 Storefront Live</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-300 text-[10px] font-bold shadow-xs" title="Grade B and Rework pieces are held in Laundry WIP and hidden from Storefront">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              <span>🧺 Laundry WIP</span>
                            </div>
                          )}

                          {/* AI Copy & SEO Drawer Toggle */}
                          <button
                            type="button"
                            onClick={() => setShowSeoDrawer(prev => !prev)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              showSeoDrawer || ecommerceDescription
                                ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                            title="Toggle AI Archival Description & SEO tags drawer"
                          >
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>AI Copy</span>
                            {ecommerceDescription && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                            {showSeoDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {/* 5 Searchable Cascading Comboboxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        {/* 1. Department (Tier 1) */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                            <span>1. Department</span>
                            <span className="text-[9px] text-indigo-400 font-mono">Tier 1</span>
                          </label>
                          <SearchableSelect
                            theme="dark"
                            showBadgeInTrigger={false}
                            showSublabelInTrigger={false}
                            options={deptOptions}
                            value={selectedDeptId}
                            onChange={handleDepartmentChange}
                            placeholder="Select Department..."
                            searchPlaceholder="Search departments (Men, Ladies, etc.)..."
                            disabled={hudStats.isCompleted}
                            className="w-full text-xs"
                          />
                        </div>

                        {/* 2. Main Category (Tier 2) */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                            <span>2. Main Category</span>
                            <span className="text-[9px] text-indigo-400 font-mono">Tier 2</span>
                          </label>
                          <SearchableSelect
                            theme="dark"
                            showBadgeInTrigger={false}
                            showSublabelInTrigger={false}
                            options={mainCatOptions}
                            value={selectedMainCategoryId}
                            onChange={handleMainCategoryChange}
                            placeholder="Select Category..."
                            searchPlaceholder="Search category..."
                            disabled={hudStats.isCompleted}
                            className="w-full text-xs"
                          />
                        </div>

                        {/* 3. Sub-Category (Tier 3) */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                            <span>3. Sub-Category</span>
                            <span className="text-[9px] text-indigo-400 font-mono">Tier 3</span>
                          </label>
                          <SearchableSelect
                            theme="dark"
                            showBadgeInTrigger={false}
                            showSublabelInTrigger={false}
                            options={subCatOptions}
                            value={selectedSubCategoryId}
                            onChange={handleSubCategoryChange}
                            placeholder="Select Sub-Category..."
                            searchPlaceholder="Search sub-category..."
                            disabled={hudStats.isCompleted}
                            className="w-full text-xs"
                          />
                        </div>

                        {/* 4. Collection / Season (Tier 4) */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                            <span>4. Collection / Season</span>
                            <span className="text-[9px] text-amber-400 font-mono">Tier 4</span>
                          </label>
                          <SearchableSelect
                            theme="dark"
                            showBadgeInTrigger={false}
                            showSublabelInTrigger={false}
                            options={collectionOptions}
                            value={selectedCollectionId}
                            onChange={handleCollectionChange}
                            placeholder="Select Collection..."
                            searchPlaceholder="Search collections or drops..."
                            disabled={hudStats.isCompleted}
                            className="w-full text-xs"
                          />
                        </div>

                        {/* 5. Market Segment Classification */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                            <span>Market Segment</span>
                            <span className="text-[9px] text-amber-400 font-mono">Archive Tier</span>
                          </label>
                          <SearchableSelect
                            theme="dark"
                            showBadgeInTrigger={false}
                            showSublabelInTrigger={false}
                            options={marketSegmentOptions}
                            value={marketSegment}
                            onChange={handleMarketSegmentChange}
                            placeholder="Select Segment..."
                            searchPlaceholder="Antique, Vintage, Brand, Non-Brand..."
                            disabled={hudStats.isCompleted}
                            className="w-full text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* FORM INPUTS */}
                    <form onSubmit={handleAddPieceAndNext} className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-2 sm:gap-2.5 items-end">
                      {/* 1. Weight in Grams (Auto-focused) */}
                      <div className="col-span-1 lg:col-span-2 space-y-1">
                        <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                          Weight (Grams) *
                        </label>
                        <div className="relative">
                          <input
                            id="weight-input-field"
                            ref={gramInputRef}
                            type="number"
                            step="1"
                            min="1"
                            placeholder="[]"
                            value={gramWeight}
                            onChange={e => setGramWeight(e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPieceAndNext();
                              }
                            }}
                            disabled={hudStats.isCompleted}
                            className="w-full bg-slate-900 border-2 border-amber-500/70 focus:border-amber-400 rounded-lg px-3 py-2 text-sm font-black font-mono text-amber-300 focus:outline-hidden text-right pr-8 shadow-inner disabled:opacity-50"
                            required
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                            g
                          </span>
                        </div>
                      </div>

                      {/* 1b. Bundle / Sack Quantity (Batch Input) */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
                        <label className="block text-[11px] font-bold text-indigo-300 uppercase tracking-wide truncate" title="Bundle / Sack Piece Count">
                          Bundle Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          value={bundleQuantity}
                          onChange={e => setBundleQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          disabled={hudStats.isCompleted}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-2 py-2 text-sm font-black font-mono text-indigo-300 text-center disabled:opacity-50"
                          title="Piece count for bundle/sack bulk sorting"
                        />
                      </div>

                      {/* 2. Auto Calculated Cost (AED) */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          Cost (AED)
                        </label>
                        <div className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm font-mono font-bold text-slate-300">
                          AED {autoPieceCostAed.toFixed(2)}
                        </div>
                      </div>

                      {/* 3. Estimated Selling Price with Anti-Theft Grail Lock & Below-Cost Warning */}
                      <div className="col-span-1 lg:col-span-2 space-y-1">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                          <span>Selling (AED)</span>
                          {isGrailLocked ? (
                            <span className="text-[9px] text-amber-400 font-bold flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> LOCKED
                            </span>
                          ) : isBelowCost ? (
                            <span className="text-[9px] text-rose-400 font-bold flex items-center gap-0.5 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" /> LOSS
                            </span>
                          ) : null}
                        </label>
                        <input
                          type="number"
                          step="5"
                          placeholder={String(suggestedSellingPrice)}
                          value={sellingPriceOverride !== null ? sellingPriceOverride : String(suggestedSellingPrice)}
                          onChange={e => setSellingPriceOverride(e.target.value)}
                          onFocus={e => e.target.select()}
                          disabled={hudStats.isCompleted || isGrailLocked}
                          title={isGrailLocked ? "Anti-Theft Grail Lock: Selling price is locked by AI appraisal to prevent unauthorized markdown." : isBelowCost ? `⚠️ Warning: Price AED ${currentSellingPrice} is LOWER than piece cost AED ${autoPieceCostAed.toFixed(2)}!` : "Estimated retail selling price"}
                          className={`w-full bg-slate-900 border rounded-lg px-2 py-2 text-sm font-mono font-bold focus:outline-hidden disabled:opacity-80 transition-all ${
                            isGrailLocked
                              ? 'border-amber-500/70 text-amber-300 bg-amber-950/30 cursor-not-allowed'
                              : isBelowCost
                              ? 'border-rose-500 text-rose-300 bg-rose-950/40 ring-2 ring-rose-500/50'
                              : 'border-slate-700 text-emerald-400 focus:border-indigo-400'
                          }`}
                        />
                        {isBelowCost && !isGrailLocked && (
                          <div className="text-[8px] text-rose-400 font-bold flex items-center gap-0.5 mt-0.5 animate-pulse">
                            <span>⚠️ BELOW COST (AED {autoPieceCostAed.toFixed(2)})</span>
                          </div>
                        )}
                      </div>

                      {/* 4. Brand / Title (Creatable Auto-Complete Combobox) */}
                      <div className="col-span-1 lg:col-span-2 space-y-1 relative" ref={itemMasterDropdownRef}>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                          <span>Brand / Title</span>
                          <span className="text-[9px] text-indigo-400 font-mono">Auto-Master</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="[ENTER BRAND / TITLE]"
                            value={brandTitle}
                            onChange={e => {
                              setBrandTitle(e.target.value);
                              setIsItemMasterDropdownOpen(true);
                            }}
                            onFocus={() => setIsItemMasterDropdownOpen(true)}
                            disabled={hudStats.isCompleted}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden disabled:opacity-50"
                          />
                          {brandTitle && (
                            <button
                              type="button"
                              onClick={() => {
                                setBrandTitle('');
                                setIsItemMasterDropdownOpen(false);
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Creatable Item Master Dropdown */}
                        {isItemMasterDropdownOpen && (filteredItemMasters.length > 0 || brandTitle.trim().length > 0) && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-2xl divide-y divide-slate-800">
                            {filteredItemMasters.map(im => (
                              <div
                                key={im.id || im.code}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setBrandTitle(im.name);
                                  if (im.category && availableCategories.includes(im.category)) {
                                    setSelectedCategory(im.category);
                                  }
                                  setIsItemMasterDropdownOpen(false);
                                }}
                                className="px-3 py-1.5 hover:bg-indigo-600/30 text-xs text-slate-200 cursor-pointer flex items-center justify-between transition-colors"
                              >
                                <span className="font-semibold text-white truncate mr-2">{im.name}</span>
                                <span className="text-[10px] text-slate-400 shrink-0 font-mono">{im.category || im.code}</span>
                              </div>
                            ))}
                            {brandTitle.trim() && !internalItemMasters.some(im => im.name.toLowerCase() === brandTitle.trim().toLowerCase()) && (
                              <div
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setIsItemMasterDropdownOpen(false);
                                }}
                                className="px-3 py-1.5 bg-indigo-950/70 hover:bg-indigo-900 text-xs text-indigo-300 font-bold cursor-pointer flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="truncate">Auto-Save "{brandTitle.trim()}" to Item Master</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 5. Size Selector Dropdown */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
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

                      {/* 5b. Pit-to-Pit (in) */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
                        <label className="block text-[11px] font-bold text-sky-400 uppercase tracking-wide flex items-center justify-between" title="Pit-to-Pit measurement in inches">
                          <span>Pit-to-Pit (in)</span>
                          {pitToPit && <span className="font-mono text-[9px] bg-sky-950 text-sky-300 border border-sky-500/40 px-1 py-0.2 rounded font-bold">📏 AI</span>}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Chest"
                          value={pitToPit}
                          onChange={e => setPitToPit(e.target.value)}
                          disabled={hudStats.isCompleted}
                          className="w-full bg-slate-900 border-2 border-sky-500/60 focus:border-sky-400 rounded-lg px-2 py-2 text-sm font-black font-mono text-sky-200 placeholder:text-slate-600 focus:outline-hidden disabled:opacity-50 text-center shadow-inner"
                          title="Pit-to-pit chest measurement in inches (from measuring tape)"
                        />
                      </div>

                      {/* 5c. Length (in) */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
                        <label className="block text-[11px] font-bold text-sky-400 uppercase tracking-wide flex items-center justify-between" title="Garment vertical length in inches">
                          <span>Length (in)</span>
                          {lengthInches && <span className="font-mono text-[9px] bg-sky-950 text-sky-300 border border-sky-500/40 px-1 py-0.2 rounded font-bold">📏 AI</span>}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Len"
                          value={lengthInches}
                          onChange={e => setLengthInches(e.target.value)}
                          disabled={hudStats.isCompleted}
                          className="w-full bg-slate-900 border-2 border-sky-500/60 focus:border-sky-400 rounded-lg px-2 py-2 text-sm font-black font-mono text-sky-200 placeholder:text-slate-600 focus:outline-hidden disabled:opacity-50 text-center shadow-inner"
                          title="Garment vertical length in inches (from measuring tape)"
                        />
                      </div>

                      {/* 6. Quality Grade Dropdown */}
                      <div className="col-span-1 lg:col-span-1 space-y-1">
                        <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>Grade</span>
                          </span>
                        </label>
                        <select
                          value={selectedGrade}
                          onChange={e => setSelectedGrade(e.target.value)}
                          disabled={hudStats.isCompleted}
                          className="w-full bg-slate-900 border-2 border-amber-500/70 focus:border-amber-400 rounded-lg px-1.5 py-2 text-[11px] font-black text-amber-200 focus:outline-hidden cursor-pointer disabled:opacity-50 tracking-tight"
                        >
                          {availableQualityGrades.map(q => (
                            <option key={q.id || q.code} value={q.name} className="bg-slate-900 text-amber-200">
                              {q.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 8b. Expandable AI Archival Copywriting & SEO Drawer */}
                      {showSeoDrawer && (
                        <div className="col-span-2 sm:col-span-2 md:col-span-3 lg:col-span-12 mt-1 p-3 bg-slate-900/95 border border-amber-500/40 rounded-xl space-y-2 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span>E-Commerce AI Curated Copywriting & SEO Tags</span>
                            </span>
                            <span className="text-[10px] text-slate-400">Syncs directly to live Storefront piece record</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Product Description (Luxury Storefront Copy)</label>
                              <textarea
                                rows={2}
                                value={ecommerceDescription}
                                onChange={e => setEcommerceDescription(e.target.value)}
                                placeholder={`Authentic ${era} ${selectedCategory} curated by Vintage Vibes.`}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400 resize-none font-sans"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">SEO Search Tags (Comma separated)</label>
                              <input
                                type="text"
                                value={seoTags.join(', ')}
                                onChange={e => setSeoTags(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                placeholder="vintage, single stitch, made in usa, 90s tee"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400 font-mono"
                              />
                              <div className="flex flex-wrap gap-1 mt-1">
                                {seoTags.map((t, i) => (
                                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                {/* 8. Quick Pills (Quality & Sizing) & Submit Button */}
                <div className="col-span-2 sm:col-span-2 md:col-span-3 lg:col-span-12 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80 mt-1">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 overflow-x-auto py-1 max-w-full">
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
                    className="w-full sm:w-auto py-2.5 sm:py-2 px-5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black text-xs rounded-lg shadow-md shadow-emerald-500/20 border border-emerald-400/40 flex items-center justify-center gap-1.5 transition-all transform active:scale-95 cursor-pointer disabled:opacity-40 sm:ml-auto"
                  >
                    <Plus className="w-4 h-4 text-slate-950" />
                    <span>{bundleQuantity > 1 ? `+ Add Bundle (${bundleQuantity} Pcs) (↵)` : '+ Add Piece & Next (↵)'}</span>
                  </button>
                </div>
              </form>
            </div>
          );
        })()}

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 gap-2">
              <span className="font-mono flex items-center gap-2">
                <span>Next Barcode: <strong className="text-indigo-400">{nextPieceBarcode}</strong></span>
                <span className="text-slate-600">•</span>
                <span>Next SKU: <strong className="text-amber-400 font-bold">{generatedSku}</strong></span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Keyboard Shortcut: Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-bold">Enter</kbd> to add and auto-focus next
              </span>
            </div>
            </div>
          )}
        </div>

        {/* STEP 3: INTERACTIVE SESSION TABLE */}
        <div className="p-3 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>Current Session Pieces Log</span>
              <span className="bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-full font-mono">
                {pieces.length} items sorted
              </span>
            </h3>

            <span className="text-xs text-slate-400 font-mono">
              Progress: <strong className="text-emerald-400">{hudStats.sortedGrams.toLocaleString()}g</strong> / <strong className="text-slate-200">{hudStats.totalGrams.toLocaleString()}g</strong> ({hudStats.progressPercent}%) • Remaining: <strong className="text-amber-400">{hudStats.remainingGrams.toLocaleString()}g</strong>
            </span>
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800 z-10">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3 text-center">Date / Time</th>
                    <th className="py-2.5 px-3">Era / Vintage</th>
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
                  {(!pieces || pieces.length === 0) ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-500">
                        <Tag className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="font-semibold text-slate-400">No pieces sorted in this bale yet</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Enter garment weight in grams above and press Enter to stream pieces into this bale.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pieces.map((piece, idx) => {
                      const pieceNum = pieces.length - idx;
                      const barcode = piece.piece_code || piece.barcode;
                      const category = piece.category || piece.itemName || 'Vintage Garment';
                      const size = piece.size || piece.sizeScanned || 'L';
                      const brandTitle = piece.brand_title || piece.brandName || '';
                      const g = piece.weight_grams ?? piece.weightGrams ?? Math.round((piece.weightKg || 0) * 1000);
                      const cost = piece.cost_price ?? piece.calculatedCostPrice ?? 0;
                      const price = piece.selling_price ?? piece.retailPriceAed ?? piece.estimatedPrice ?? 0;
                      const frontImg = piece.front_image || piece.frontImageUrl;
                      const backImg = piece.back_image || piece.backImageUrl;
                      const tagImg = piece.tag_image || piece.tagImageUrl;
                      const qualityGrade = piece.quality_grade || piece.labelGrade;
                      const isOverridden = Boolean(piece.is_price_overridden ?? piece.isPriceOverridden);
                      const isGrailItem = Boolean(piece.is_grail ?? piece.isGrail ?? (piece.marketSegment === 'Antique' || piece.market_segment === 'Antique' || piece.marketSegment === 'Grails' || piece.market_segment === 'Grails' || piece.marketSegment === 'Boutique' || piece.market_segment === 'Boutique'));
                      const aiPrice = piece.ai_suggested_price ?? piece.aiSuggestedPrice;
                      const isCompleted = Boolean(hudStats.isCompleted || isTerminalFinalized);

                      return (
                        <tr key={piece.id || idx} className="hover:bg-slate-900/80 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{pieceNum}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-400 text-[11px]">{barcode}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px] whitespace-nowrap">
                            {piece.created_at || (piece as any).createdAt
                              ? new Date(piece.created_at || (piece as any).createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="space-y-0.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${
                                (piece.marketSegment === 'Antique' || piece.market_segment === 'Antique' || (piece.era || '').toLowerCase().includes('antique'))
                                  ? 'bg-purple-950/80 text-purple-300 border-purple-500/50'
                                  : (piece.marketSegment === 'Grails' || piece.market_segment === 'Grails' || (piece.era || '').toLowerCase().includes('grail'))
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                                  : (piece.marketSegment === 'Boutique' || piece.market_segment === 'Boutique')
                                  ? 'bg-pink-950/80 text-pink-300 border-pink-500/50'
                                  : (piece.marketSegment === 'Old Vintage' || piece.market_segment === 'Old Vintage' || (piece.era || '').toLowerCase().includes('vintage'))
                                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}>
                                {piece.marketSegment || piece.market_segment || piece.era || '1990s Vintage'}
                              </span>
                              {piece.era && (piece.marketSegment || piece.market_segment) && piece.era !== (piece.marketSegment || piece.market_segment) && (
                                <div className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{piece.era}</div>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{category}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold border border-slate-700 text-[11px] shadow-xs">
                              {size}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-white">{brandTitle} {piece.style ? `• ${piece.style}` : ''}</td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {frontImg && (
                                <img
                                  src={frontImg}
                                  alt="Front"
                                  title="Front Photo - Click to Enlarge"
                                  onClick={() => setPreviewLightboxImage(frontImg)}
                                  className="w-7 h-7 object-cover rounded border border-slate-700 hover:border-emerald-400 cursor-pointer hover:scale-125 transition shadow-xs"
                                />
                              )}
                              {backImg && (
                                <img
                                  src={backImg}
                                  alt="Back"
                                  title="Back Photo - Click to Enlarge"
                                  onClick={() => setPreviewLightboxImage(backImg)}
                                  className="w-7 h-7 object-cover rounded border border-slate-700 hover:border-indigo-400 cursor-pointer hover:scale-125 transition shadow-xs"
                                />
                              )}
                              {tagImg && (
                                <img
                                  src={tagImg}
                                  alt="Tag"
                                  title="Tag OCR Photo - Click to Enlarge"
                                  onClick={() => setPreviewLightboxImage(tagImg)}
                                  className="w-7 h-7 object-cover rounded border border-amber-600 hover:border-amber-400 cursor-pointer hover:scale-125 transition shadow-xs"
                                />
                              )}
                              {!frontImg && !backImg && !tagImg && (
                                <span className="text-[10px] text-slate-600 font-mono">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">{g} g</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">AED {Number(cost).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            <div className="flex items-center justify-end gap-1.5">
                              {isGrailItem && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/40 font-sans" title="Anti-Theft Grail Price Lock Active">
                                  🔒 Grail
                                </span>
                              )}
                              {isOverridden && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-600/40 font-sans" title={`AI Price Overridden (AI Suggested: AED ${Number(aiPrice || 0).toFixed(2)})`}>
                                  ⚡ Override
                                </span>
                              )}
                              <span className={cost && price < cost ? "text-rose-400 font-black" : "text-emerald-400"}>
                                AED {Number(price).toFixed(2)}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                luxuryAudio.playMechanicalClick();
                                onPrintSticker({
                                  itemCode: barcode,
                                  description: `${category} (${size})`,
                                  category,
                                  size,
                                  brand: brandTitle,
                                  grade: qualityGrade,
                                  retailPriceAed: price,
                                  weightKg: Number(g / 1000),
                                  batchNo: activeBale?.baleCode || activeBale?.gatePassNo || 'BAL-01',
                                  date: new Date().toISOString().slice(0, 10),
                                  origin: piece.countryOfOrigin || piece.country_of_origin,
                                  shopLocation: piece.shopLocation || piece.shop_location
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
                              onClick={(e) => handleDeletePiece(piece.id, e)}
                              disabled={isCompleted}
                              className={`p-1.5 rounded transition-colors ${
                                isCompleted
                                  ? 'opacity-50 cursor-not-allowed text-slate-600'
                                  : 'hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 cursor-pointer'
                              }`}
                              title={isCompleted ? "Locked: Re-open / Unlock bale to delete pieces" : "Delete piece from session"}
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
        </div>

        {/* STEP 4: SESSION ACTIONS BAR */}
        <div className="bg-slate-950 px-3 sm:px-5 py-2.5 sm:py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 shrink-0 z-10 shadow-2xl">
          <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2 text-xs text-slate-400">
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

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {(isTerminalFinalized || hudStats.isCompleted || activeBale?.status === 'COMPLETED' || activeBale?.status === 'POSTED') && (
              <button
                type="button"
                id="btn-bottom-reopen-bale"
                onClick={(e) => handleReopenBale(e)}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer transform active:scale-95 whitespace-nowrap"
                title="Unlock and reopen this bale for continuous garment sorting"
              >
                <Unlock className="w-4 h-4 text-slate-950" />
                <span>🔓 Re-open</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => handleSaveInProgress(e)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4 text-indigo-400" />
              <span>Save Partial</span>
            </button>

            <button
              type="button"
              onClick={(e) => handleFinalizeAndPost(e)}
              disabled={isTerminalFinalized || activeBale?.status === 'COMPLETED' || activeBale?.status === 'POSTED'}
              className="flex-1 sm:flex-none px-3 sm:px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-600/25 border border-emerald-400/40 flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title={isTerminalFinalized || activeBale?.status === 'COMPLETED' || activeBale?.status === 'POSTED' ? "Bale is already finalized and posted" : "Finalize and lock this bale"}
            >
              <ShieldCheck className="w-4 h-4 text-slate-950" />
              <span>{isTerminalFinalized || activeBale?.status === 'COMPLETED' || activeBale?.status === 'POSTED' ? '✓ Finalized' : 'Finalize & Post'}</span>
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
                      onFocus={e => e.target.select()}
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
                      onFocus={e => e.target.select()}
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

        {/* UNIFIED STUDIO 4-ANGLE & AI LIVE APPRAISAL CAMERA MODAL */}
        {showStudioCamera && (
          <StudioPhotoCaptureModal
            isOpen={showStudioCamera}
            onClose={() => setShowStudioCamera(false)}
            activeSlot={studioCameraSlot}
            frontImageUrl={frontImageUrl}
            backImageUrl={backImageUrl}
            tagImageUrl={tagImageUrl}
            measurementImageUrl={measurementImageUrl}
            onSavePhotos={({ front, back, tag, measurement }, appraisalData) => {
              setFrontImageUrl(front);
              setBackImageUrl(back);
              setTagImageUrl(tag);
              setMeasurementImageUrl(measurement);
              if (appraisalData) {
                handleApplyExtractedTag(appraisalData);
              }
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  X,
  Search,
  Sparkles,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  Tag,
  Layers,
  ChevronLeft,
  Flame,
  Shirt,
  Scissors
} from 'lucide-react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { ProductCard } from './ProductCard.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';
import { pixelTracking } from '../../utils/pixelTracking.ts';
import { supabase } from '../../supabaseClient.ts';

export interface DynamicCategory {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
}

export interface ShopCatalogViewProps {
  categories: DynamicCategory[];
  initialCategory?: string;
  initialSearch?: string;
  initialSegment?: string;
  cart: PieceBreakdownItem[];
  vanishingBarcodes?: string[];
  onAddToCart: (piece: PieceBreakdownItem) => void;
  onInstantBuy: (piece: PieceBreakdownItem) => void;
  onInspectTag: (piece: PieceBreakdownItem) => void;
  onInspectGarment: (piece: PieceBreakdownItem) => void;
  onOpenFitGuide: (silhouetteId?: string) => void;
  onBackToHome?: () => void;
}

const SIZE_OPTIONS = ['ALL', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

const PRICE_PRESETS = [
  { id: 'ALL', label: 'All Prices', min: null, max: null },
  { id: 'under150', label: 'Under 150 AED', min: 0, max: 150 },
  { id: '150-300', label: '150 - 300 AED', min: 150, max: 300 },
  { id: '300-500', label: '300 - 500 AED', min: 300, max: 500 },
  { id: '500plus', label: '500+ AED (Rare)', min: 500, max: null },
  { id: 'custom', label: 'Custom Range', min: null, max: null }
];

const SEGMENT_OPTIONS = [
  { id: 'ALL', label: 'All Segments', icon: '🌐', desc: 'Full unfiltered vault catalog' },
  { id: 'Antique', label: 'Antique', icon: '🏛️', desc: 'Pre-1970s rare heritage archives' },
  { id: 'Vintage', label: 'Vintage', icon: '🕰️', desc: 'Collector, retro & 90s classics' },
  { id: 'Brand', label: 'Brand', icon: '⭐', desc: 'Designer & premium labels' },
  { id: 'Non-Brand', label: 'Non-Brand', icon: '🏷️', desc: 'Everyday basics & streetwear' }
];

const SORT_OPTIONS = [
  { id: 'newest', label: '⚡ Newest Drops First' },
  { id: 'price_asc', label: '💰 Price: Low to High' },
  { id: 'price_desc', label: '💎 Price: High to Low' },
  { id: 'grails', label: '👑 Grails & Rarities First' }
];

export const ShopCatalogView: React.FC<ShopCatalogViewProps> = ({
  categories,
  initialCategory = 'ALL',
  initialSearch = '',
  initialSegment = 'ALL',
  cart,
  vanishingBarcodes = [],
  onAddToCart,
  onInstantBuy,
  onInspectTag,
  onInspectGarment,
  onOpenFitGuide,
  onBackToHome
}) => {
  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedSize, setSelectedSize] = useState<string>('ALL');
  const [selectedPricePreset, setSelectedPricePreset] = useState<string>('ALL');
  const [customMinPrice, setCustomMinPrice] = useState<string>('');
  const [customMaxPrice, setCustomMaxPrice] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>(initialSegment);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('ALL');
  const [collectionsList, setCollectionsList] = useState<{ id: string; name: string; code?: string; season?: string; year?: number }[]>([]);
  const [sortBy, setSortBy] = useState<string>('newest');

  // Fetch seasonal collections on mount
  useEffect(() => {
    fetch('/api/ecommerce/collections')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCollectionsList(data);
        } else {
          supabase
            .from('collections')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .then(({ data: supaCols }) => {
              if (supaCols && supaCols.length > 0) setCollectionsList(supaCols);
            });
        }
      })
      .catch(() => {
        supabase
          .from('collections')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .then(({ data: supaCols }) => {
            if (supaCols && supaCols.length > 0) setCollectionsList(supaCols);
          })
          .catch(() => {});
      });
  }, []);

  // Pagination States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(24);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);

  // Data & Loading States
  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState<boolean>(false);

  // Catalog container ref for smooth scrolling to top on page change
  const catalogTopRef = useRef<HTMLDivElement>(null);

  // Determine effective min/max price
  const { effectiveMinPrice, effectiveMaxPrice } = useMemo(() => {
    if (selectedPricePreset === 'custom') {
      const min = customMinPrice !== '' ? Number(customMinPrice) : null;
      const max = customMaxPrice !== '' ? Number(customMaxPrice) : null;
      return { effectiveMinPrice: min, effectiveMaxPrice: max };
    }
    const preset = PRICE_PRESETS.find(p => p.id === selectedPricePreset);
    return {
      effectiveMinPrice: preset?.min ?? null,
      effectiveMaxPrice: preset?.max ?? null
    };
  }, [selectedPricePreset, customMinPrice, customMaxPrice]);

  // Sync props if initialCategory changes
  useEffect(() => {
    if (initialCategory && initialCategory !== selectedCategory) {
      setSelectedCategory(initialCategory);
      setCurrentPage(1);
    }
  }, [initialCategory]);

  // Sync props if initialSearch changes
  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== searchQuery) {
      setSearchQuery(initialSearch);
      setCurrentPage(1);
    }
  }, [initialSearch]);

  // Fetch paginated inventory
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(pageSize));
      params.set('sort', sortBy);

      if (selectedCategory && selectedCategory !== 'ALL') {
        params.set('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      if (selectedSize && selectedSize !== 'ALL') {
        params.set('size', selectedSize);
      }
      if (effectiveMinPrice !== null && !isNaN(effectiveMinPrice)) {
        params.set('minPrice', String(effectiveMinPrice));
      }
      if (effectiveMaxPrice !== null && !isNaN(effectiveMaxPrice)) {
        params.set('maxPrice', String(effectiveMaxPrice));
      }
      if (selectedSegment && selectedSegment !== 'ALL') {
        params.set('segment', selectedSegment);
      }
      if (selectedCollectionId && selectedCollectionId !== 'ALL') {
        params.set('collectionId', selectedCollectionId);
      }

      const res = await fetch(`/api/ecommerce/products?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json();
        // Check if response is paginated object
        if (payload && Array.isArray(payload.data)) {
          setPieces(payload.data);
          setTotalItems(payload.total || payload.data.length);
          setTotalPages(payload.totalPages || Math.ceil((payload.total || payload.data.length) / pageSize) || 1);
          return;
        } else if (Array.isArray(payload)) {
          // Fallback array handling
          const filtered = payload.filter(p => !p.isSold && p.status === 'IN_STOCK' && (p.readyForEcommerce === undefined || p.readyForEcommerce === null || p.readyForEcommerce === true));
          setTotalItems(filtered.length);
          const computedTotalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          setTotalPages(computedTotalPages);
          const offset = (currentPage - 1) * pageSize;
          setPieces(filtered.slice(offset, offset + pageSize));
          return;
        }
      }

      // Secondary fallback: Supabase Direct (strictly IN_STOCK)
      let supaQuery = supabase
        .from('inventory_pieces')
        .select('*', { count: 'exact' })
        .eq('is_sold', false)
        .eq('status', 'IN_STOCK')
        .or('ready_for_ecommerce.is.null,ready_for_ecommerce.eq.true');

      if (selectedCollectionId && selectedCollectionId !== 'ALL') {
        supaQuery = supaQuery.eq('collection_id', selectedCollectionId);
      }
      if (selectedSegment && selectedSegment !== 'ALL') {
        if (selectedSegment === 'Antique') supaQuery = supaQuery.eq('market_segment', 'Antique');
        else if (selectedSegment === 'Vintage') supaQuery = supaQuery.or('market_segment.eq.Vintage,market_segment.eq.Grails,market_segment.eq.Boutique');
        else if (selectedSegment === 'Brand') supaQuery = supaQuery.eq('market_segment', 'Brand');
        else if (selectedSegment === 'Non-Brand') supaQuery = supaQuery.or('market_segment.eq.Non-Brand,market_segment.eq.Regular Thrift,market_segment.is.null');
      }
      if (selectedSize && selectedSize !== 'ALL') {
        supaQuery = supaQuery.eq('size_scanned', selectedSize);
      }
      if (searchQuery.trim()) {
        supaQuery = supaQuery.ilike('item_name', `%${searchQuery.trim()}%`);
      }

      const offset = (currentPage - 1) * pageSize;
      supaQuery = supaQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      const { data: supaData, count: supaCount } = await supaQuery;

      if (Array.isArray(supaData)) {
        const mapped = supaData.map(r => ({
          ...r,
          id: r.id || r.barcode,
          barcode: r.barcode,
          sku: r.sku || r.barcode,
          itemName: r.item_name || 'Vintage Garment',
          parentCategoryName: r.parent_category_name || null,
          brandName: r.brand_name || 'Vintage Archive',
          sizeScanned: r.size_scanned || 'L',
          countryOfOrigin: r.country_of_origin || 'USA',
          style: r.style || 'Original Vintage Wash',
          ecommerceDescription: r.ecommerce_description || r.style || '',
          seoTags: Array.isArray(r.seo_tags) ? r.seo_tags : [],
          frontImageUrl: r.front_image_url || r.tag_image_url || '/studio_left_rack.png',
          backImageUrl: r.back_image_url || r.front_image_url || '/studio_backdrop_noboy.png',
          tagImageUrl: r.tag_image_url || '/studio_left_rack.png',
          labelGrade: r.label_grade || 'Grade A+ (Pristine)',
          brandTier: r.brand_tier || 'Grail',
          shopLocation: r.shop_name || r.shop_location || 'Al Ain Vintage Hub',
          pitToPitInches: r.pit_to_pit_inches ? Number(r.pit_to_pit_inches) : 22,
          lengthInches: r.length_inches ? Number(r.length_inches) : 29,
          weightKg: Number(r.weight_kg || 0.4),
          estimatedPrice: Number(r.estimated_price || r.retail_price_aed || 295),
          retailPriceAed: Number(r.retail_price_aed || r.estimated_price || 295),
          isSold: Boolean(r.is_sold),
          status: r.status || 'IN_STOCK',
          marketSegment: r.market_segment || 'Vintage',
          isGrail: Boolean(r.is_grail),
          globalInsights: r.global_insights || null,
          aiSuggestedPrice: r.ai_suggested_price !== undefined ? Number(r.ai_suggested_price) : null,
          isPriceOverridden: Boolean(r.is_price_overridden),
          isCartLocked: false,
          createdAt: r.created_at
        }));
        setPieces(mapped as PieceBreakdownItem[]);
        const countVal = supaCount || mapped.length;
        setTotalItems(countVal);
        setTotalPages(Math.max(1, Math.ceil(countVal / pageSize)));
      } else {
        setPieces([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.warn('ShopCatalogView fetch error:', err);
      setPieces([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch when filters, sort, or pagination change
  useEffect(() => {
    fetchProducts();
  }, [
    currentPage,
    pageSize,
    selectedCategory,
    searchQuery,
    selectedSize,
    selectedPricePreset,
    customMinPrice,
    customMaxPrice,
    selectedSegment,
    selectedCollectionId,
    sortBy
  ]);

  // Realtime CDC listener for inventory_pieces
  useEffect(() => {
    const handleRealtime = (e: any) => {
      if (e.detail?.table === 'inventory_pieces') {
        const record = e.detail?.new;
        if (record) {
          const barcode = String(record.barcode || '').toLowerCase();
          const id = String(record.id || '').toLowerCase();
          const status = record.status;
          const isSold = Boolean(record.is_sold);

          if (status !== 'IN_STOCK' || isSold) {
            setPieces(prev => prev.filter(p =>
              p.barcode.toLowerCase() !== barcode &&
              String(p.id).toLowerCase() !== id
            ));
            setTotalItems(prev => Math.max(0, prev - 1));
          } else if (status === 'IN_STOCK' && !isSold) {
            fetchProducts();
          }
        }
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtime);
    return () => window.removeEventListener('vv:realtime-record', handleRealtime);
  }, []);

  // Reset page to 1 whenever filters change
  const handleFilterChange = (setter: () => void) => {
    luxuryAudio.playMechanicalClick();
    setter();
    setCurrentPage(1);
  };

  // Clear all filters
  const handleResetFilters = () => {
    luxuryAudio.playMechanicalClick();
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedSize('ALL');
    setSelectedPricePreset('ALL');
    setCustomMinPrice('');
    setCustomMaxPrice('');
    setSelectedSegment('ALL');
    setSelectedCollectionId('ALL');
    setSortBy('newest');
    setCurrentPage(1);
  };

  // Check if any filter is actively applied
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      selectedCategory !== 'ALL' ||
      selectedSize !== 'ALL' ||
      selectedPricePreset !== 'ALL' ||
      selectedSegment !== 'ALL' ||
      selectedCollectionId !== 'ALL' ||
      sortBy !== 'newest'
    );
  }, [searchQuery, selectedCategory, selectedSize, selectedPricePreset, selectedSegment, selectedCollectionId, sortBy]);

  // Handle page change with smooth scroll to catalog top
  const handlePageChange = (newPage: number) => {
    luxuryAudio.playMechanicalClick();
    setCurrentPage(newPage);
    if (catalogTopRef.current) {
      catalogTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Category name resolver
  const activeCategoryObject = useMemo(() => {
    if (selectedCategory === 'ALL') return null;
    return categories.find(
      c => c.slug?.toLowerCase() === selectedCategory.toLowerCase() ||
           c.name?.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [categories, selectedCategory]);

  return (
    <div ref={catalogTopRef} className="min-h-screen bg-[#FDF9EE]/60 text-slate-900 pb-20">
      {/* 1. TOP BREADCRUMB & BANNER */}
      <div className="bg-gradient-to-r from-[#F5ECCE] via-[#FAF4E6] to-[#FDF9EE] border-b border-amber-300/80 px-4 sm:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-1.5">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    onBackToHome();
                  }}
                  className="text-amber-900 hover:text-amber-700 font-bold underline cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Home
                </button>
              )}
              {onBackToHome && <span>/</span>}
              <span className="text-slate-800 font-bold">Shop Full Vault Catalog</span>
              {activeCategoryObject && (
                <>
                  <span>/</span>
                  <span className="text-amber-900 font-black">{activeCategoryObject.name}</span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-4xl font-black font-serif text-slate-950 flex items-center gap-2.5">
              <span>Verified 1-of-1 Vault Archive</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-amber-200 text-amber-950 border border-amber-400">
                {totalItems} Available
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl font-medium">
              Every single piece is a verified 1-of-1 original vintage artifact. Once claimed, it is archived from the vault forever.
            </p>
          </div>

          {/* Quick Filter Reset and Count badge */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}

            {/* Mobile Filter Button */}
            <button
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setMobileFilterOpen(true);
              }}
              className="lg:hidden px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-rose-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN CATALOG BODY (SIDEBAR + PRODUCT GRID) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col lg:flex-row gap-8 items-start">
        {/* ============================================================ */}
        {/* LEFT SIDEBAR: DESKTOP FILTERS */}
        {/* ============================================================ */}
        <aside className="hidden lg:block w-72 shrink-0 space-y-6 sticky top-24 bg-white/90 backdrop-blur-md rounded-2xl border-2 border-amber-300/80 p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-900" />
              <h2 className="font-serif font-black text-slate-950 text-sm tracking-wide">
                Refine Vault Search
              </h2>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-amber-900 hover:text-amber-700 underline cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {/* A. CATEGORIES (DYNAMIC) */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-700" />
              <span>Category</span>
            </label>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1 no-scrollbar">
              <button
                type="button"
                onClick={() => handleFilterChange(() => setSelectedCategory('ALL'))}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                    : 'text-slate-700 hover:bg-amber-100/70'
                }`}
              >
                <span>All Categories</span>
                {selectedCategory === 'ALL' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>

              {categories.map(cat => {
                const isSelected =
                  selectedCategory.toLowerCase() === (cat.slug || '').toLowerCase() ||
                  selectedCategory.toLowerCase() === cat.name.toLowerCase();
                return (
                  <button
                    key={cat.id || cat.slug}
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedCategory(cat.slug || cat.name))}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                        : 'text-slate-700 hover:bg-amber-100/70'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* B. COLLECTIONS & SEASONS */}
          {collectionsList.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-amber-200">
              <label className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Collections & Drops</span>
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => handleFilterChange(() => setSelectedCollectionId('ALL'))}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    selectedCollectionId === 'ALL'
                      ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-700 hover:bg-amber-100/70'
                  }`}
                >
                  <span>All Drops & Seasons</span>
                  {selectedCollectionId === 'ALL' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </button>
                {collectionsList.map(col => {
                  const isSelected = selectedCollectionId === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedCollectionId(col.id))}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                          : 'text-slate-700 hover:bg-amber-100/70'
                      }`}
                    >
                      <span className="truncate">{col.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* C. MARKET SEGMENT / ERA */}
          <div className="space-y-2.5 pt-3 border-t border-amber-200">
            <label className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-700" />
              <span>Archive Segment</span>
            </label>
            <div className="space-y-1.5">
              {SEGMENT_OPTIONS.map(seg => {
                const isSelected = selectedSegment === seg.id;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedSegment(seg.id))}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-amber-200/90 border-amber-400 text-slate-950 font-black shadow-2xs'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-amber-50 text-slate-700'
                    }`}
                  >
                    <span className="text-base">{seg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate leading-tight">{seg.label}</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{seg.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* C. SIZE FILTER */}
          <div className="space-y-2.5 pt-3 border-t border-amber-200">
            <label className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Shirt className="w-3.5 h-3.5 text-amber-700" />
              <span>Garment Size</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SIZE_OPTIONS.map(size => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedSize(size))}
                    className={`py-1.5 text-center text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 border-amber-500 text-slate-950 font-black shadow-xs'
                        : 'border-slate-300 bg-white hover:bg-amber-50 text-slate-700'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* D. PRICE RANGE */}
          <div className="space-y-2.5 pt-3 border-t border-amber-200">
            <label className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>AED</span>
              <span>Price Range</span>
            </label>
            <div className="space-y-1.5">
              {PRICE_PRESETS.map(preset => {
                const isSelected = selectedPricePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedPricePreset(preset.id))}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-300 text-slate-950 font-bold'
                        : 'text-slate-700 hover:bg-amber-100/60'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Min / Max inputs if selected */}
            {selectedPricePreset === 'custom' && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={customMinPrice}
                  onChange={e => {
                    setCustomMinPrice(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-1/2 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:border-amber-500 focus:outline-hidden"
                />
                <span className="text-xs text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={customMaxPrice}
                  onChange={e => {
                    setCustomMaxPrice(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-1/2 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            )}
          </div>
        </aside>

        {/* ============================================================ */}
        {/* RIGHT MAIN SECTION: HEADER + ACTIVE FILTERS + GRID + PAGINATION */}
        {/* ============================================================ */}
        <section className="flex-1 w-full space-y-6">
          {/* TOP TOOLBAR: SEARCH + SORT + SUMMARY */}
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border-2 border-amber-300/80 p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-amber-900/60 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tees, Nike, Carhartt, Levi's..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 border border-amber-300 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort & Pagination Info */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <span className="text-xs font-mono text-slate-600 hidden sm:inline">
                Sort By:
              </span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => {
                    luxuryAudio.playMechanicalClick();
                    setSortBy(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none bg-amber-100 hover:bg-amber-200/80 border border-amber-400 rounded-xl pl-3.5 pr-8 py-2 text-xs font-bold text-amber-950 focus:outline-hidden cursor-pointer shadow-xs"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-900 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* ACTIVE FILTER CHIPS */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-mono uppercase font-bold text-slate-500 mr-1">
                Active Filters:
              </span>

              {selectedCategory !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>Category: {activeCategoryObject?.name || selectedCategory}</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedCategory('ALL'))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedSegment !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>Archive: {selectedSegment}</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedSegment('ALL'))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedCollectionId !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>Collection: {collectionsList.find(c => c.id === selectedCollectionId)?.name || selectedCollectionId}</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedCollectionId('ALL'))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedSize !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>Size: {selectedSize}</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedSize('ALL'))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedPricePreset !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>Price: {PRICE_PRESETS.find(p => p.id === selectedPricePreset)?.label}</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedPricePreset('ALL'))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {searchQuery.trim() !== '' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                  <span>&quot;{searchQuery}&quot;</span>
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSearchQuery(''))}
                    className="hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-bold text-rose-700 hover:text-rose-800 underline ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* PRODUCT GRID / LOADING / EMPTY STATE */}
          {isLoading ? (
            <div className="py-28 flex flex-col items-center justify-center text-slate-600 bg-white/60 rounded-2xl border-2 border-dashed border-amber-300">
              <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mb-3" />
              <p className="font-extrabold text-slate-900 text-sm">Loading 1-of-1 Vault Archive...</p>
              <p className="text-xs text-slate-500 mt-1">Filtering authentic vintage stock from Al Ain & Dubai</p>
            </div>
          ) : pieces.length === 0 ? (
            <div className="py-24 text-center text-slate-600 bg-white/90 rounded-2xl border-2 border-amber-300 p-8 shadow-md">
              <ShoppingBag className="w-14 h-14 text-amber-800/40 mx-auto mb-3" />
              <h3 className="font-extrabold text-xl text-slate-950 font-serif">
                No Vault Pieces Match These Filters
              </h3>
              <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                We couldn&apos;t find any in-stock items matching your criteria. Try widening your price bracket or selecting &quot;All Categories&quot;.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-5 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black shadow-md transition-all cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {pieces.map(piece => (
                <ProductCard
                  key={piece.id || piece.barcode}
                  piece={piece}
                  isVanishing={vanishingBarcodes.includes(piece.barcode)}
                  isInCart={cart.some(c => c.barcode === piece.barcode)}
                  onAddToCart={onAddToCart}
                  onInstantBuy={onInstantBuy}
                  onInspectTag={onInspectTag}
                  onInspectGarment={onInspectGarment}
                  onOpenFitGuide={onOpenFitGuide}
                />
              ))}
            </div>
          )}

          {/* PAGINATION COMPONENT */}
          {!isLoading && totalItems > 0 && (
            <div className="pt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={newSize => {
                  luxuryAudio.playMechanicalClick();
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[12, 24, 48]}
                itemLabel="vault items"
                className="border-2 border-amber-300/80 shadow-md"
              />
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* MOBILE FILTER SLIDE-OVER DRAWER */}
      {/* ============================================================ */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFilterOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative ml-auto w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            <div className="p-4 border-b border-amber-300 flex items-center justify-between bg-[#FDF9EE]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-900" />
                <h3 className="font-serif font-black text-slate-950 text-sm">Filter Catalog</h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6 flex-1">
              {/* Categories */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono font-black uppercase text-slate-700">Category</label>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => handleFilterChange(() => setSelectedCategory('ALL'))}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex justify-between ${
                      selectedCategory === 'ALL' ? 'bg-amber-400 text-slate-950' : 'text-slate-700'
                    }`}
                  >
                    <span>All Categories</span>
                    {selectedCategory === 'ALL' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id || cat.slug}
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedCategory(cat.slug || cat.name))}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex justify-between ${
                        selectedCategory === (cat.slug || cat.name) ? 'bg-amber-400 text-slate-950' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      {selectedCategory === (cat.slug || cat.name) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collections & Drops (Mobile) */}
              {collectionsList.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <label className="text-[11px] font-mono font-black uppercase text-slate-700">Collections & Drops</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedCollectionId('ALL'))}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex justify-between ${
                        selectedCollectionId === 'ALL' ? 'bg-amber-400 text-slate-950' : 'text-slate-700'
                      }`}
                    >
                      <span>All Drops & Seasons</span>
                      {selectedCollectionId === 'ALL' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                    {collectionsList.map(col => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => handleFilterChange(() => setSelectedCollectionId(col.id))}
                        className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex justify-between ${
                          selectedCollectionId === col.id ? 'bg-amber-400 text-slate-950' : 'text-slate-700'
                        }`}
                      >
                        <span className="truncate">{col.name}</span>
                        {selectedCollectionId === col.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Segment */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <label className="text-[11px] font-mono font-black uppercase text-slate-700">Archive Segment</label>
                <div className="space-y-1.5">
                  {SEGMENT_OPTIONS.map(seg => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedSegment(seg.id))}
                      className={`w-full text-left p-2 rounded-xl text-xs flex items-center gap-2 ${
                        selectedSegment === seg.id ? 'bg-amber-300 font-black' : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{seg.icon}</span>
                      <span className="truncate">{seg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <label className="text-[11px] font-mono font-black uppercase text-slate-700">Garment Size</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {SIZE_OPTIONS.map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedSize(size))}
                      className={`py-1.5 text-center text-xs font-mono font-bold rounded-lg border ${
                        selectedSize === size ? 'bg-amber-400 font-black' : 'bg-white text-slate-700'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <label className="text-[11px] font-mono font-black uppercase text-slate-700">Price</label>
                <div className="space-y-1.5">
                  {PRICE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleFilterChange(() => setSelectedPricePreset(preset.id))}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex justify-between ${
                        selectedPricePreset === preset.id ? 'bg-amber-300 font-black' : 'text-slate-700'
                      }`}
                    >
                      <span>{preset.label}</span>
                      {selectedPricePreset === preset.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-[#FDF9EE] flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex-1 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2 rounded-xl bg-amber-400 text-xs font-black text-slate-950 shadow-xs"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

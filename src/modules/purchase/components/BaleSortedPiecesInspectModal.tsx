import React, { useState, useEffect, useMemo } from 'react';
import { InwardGatePass, PieceBreakdownItem } from '../purchase.types.ts';
import { supabase } from '../../../supabaseClient.ts';
import { openThermalLabelPrintWindow } from '../../../utils/thermalPrinter.ts';
import { Pagination } from '../../../components/Pagination.tsx';
import {
  X,
  Search,
  Tag,
  Scale,
  ShieldCheck,
  Lock,
  Zap,
  AlertTriangle,
  Printer,
  ChevronRight,
  TrendingUp,
  Image as ImageIcon,
  ArrowUpRight,
  Sliders,
  DollarSign,
  Package,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface BaleSortedPiecesInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  bale: InwardGatePass | null;
  onOpenTerminal?: (baleId: string) => void;
}

export const BaleSortedPiecesInspectModal: React.FC<BaleSortedPiecesInspectModalProps> = ({
  isOpen,
  onClose,
  bale,
  onOpenTerminal
}) => {
  const [pieces, setPieces] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'GRAILS' | 'OVERRIDDEN' | 'BELOW_COST'>('ALL');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedFilter, bale?.id]);

  useEffect(() => {
    if (!isOpen || !bale?.id) return;

    let isMounted = true;
    setIsLoading(true);

    const loadPieces = async () => {
      try {
        const { data, error } = await supabase
          .from('bale_sorted_pieces')
          .select('*')
          .eq('bale_id', bale.id)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0 && isMounted) {
          const mapped = data.map((d: any) => ({
            ...d,
            barcode: d.piece_code || d.barcode || d.id,
            piece_code: d.piece_code || d.barcode || d.id,
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
            labelGrade: d.quality_grade || d.label_grade || 'Grade A',
            quality_grade: d.quality_grade || d.label_grade || 'Grade A',
            frontImageUrl: d.front_image || d.front_image_url,
            backImageUrl: d.back_image || d.back_image_url,
            tagImageUrl: d.tag_image || d.tag_image_url,
            era: d.era || '1990s Vintage',
            marketSegment: d.market_segment || 'Regular Thrift',
            isGrail: Boolean(d.is_grail),
            aiSuggestedPrice: Number(d.ai_suggested_price) || 0,
            isPriceOverridden: Boolean(d.is_price_overridden),
            globalInsights: d.global_insights
          }));
          setPieces(mapped);
        } else if (isMounted) {
          // Fallback to in-memory pieces on bale object
          setPieces(bale.pieces || []);
        }
      } catch (err) {
        console.warn('Error loading bale_sorted_pieces, fallback to bale.pieces:', err);
        if (isMounted) setPieces(bale.pieces || []);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPieces();

    return () => {
      isMounted = false;
    };
  }, [isOpen, bale?.id, bale?.pieces]);

  // Yield & Financial Analytics
  const analytics = useMemo(() => {
    if (!bale) return null;
    const grossKg = Number(bale.totalBaleWeight || 0);
    const grossGrams = Math.round(grossKg * 1000);

    const totalSortedGrams = pieces.reduce((sum, p) => sum + (Number(p.weight_grams || p.weightGrams || (p.weightKg ? p.weightKg * 1000 : 0)) || 0), 0);
    const totalSortedKg = Number((totalSortedGrams / 1000).toFixed(2));
    const remainingGrams = Math.max(0, grossGrams - totalSortedGrams);
    const progressPercent = grossGrams > 0 ? Math.min(100, Math.round((totalSortedGrams / grossGrams) * 100)) : 0;

    const totalBaleCostAed = Number(bale.totalBaleCost || 0);
    const totalRetailValuationAed = pieces.reduce((sum, p) => sum + (Number(p.selling_price || p.retailPriceAed || p.estimatedPrice || 0)), 0);
    const totalPiecesCostAed = pieces.reduce((sum, p) => sum + (Number(p.cost_price || p.costPrice || p.calculatedCostPrice || 0)), 0);

    const profitMarginAed = totalRetailValuationAed - totalBaleCostAed;
    const roiMultiplier = totalBaleCostAed > 0 ? Number((totalRetailValuationAed / totalBaleCostAed).toFixed(2)) : 0;
    const avgPieceWeightG = pieces.length > 0 ? Math.round(totalSortedGrams / pieces.length) : 0;
    const avgPiecePriceAed = pieces.length > 0 ? Number((totalRetailValuationAed / pieces.length).toFixed(2)) : 0;

    const grailsCount = pieces.filter(p => Boolean(p.is_grail || p.isGrail)).length;
    const overrideCount = pieces.filter(p => Boolean(p.is_price_overridden || p.isPriceOverridden)).length;
    const belowCostCount = pieces.filter(p => {
      const cost = Number(p.cost_price || p.costPrice || p.calculatedCostPrice || 0);
      const retail = Number(p.selling_price || p.retailPriceAed || p.estimatedPrice || 0);
      return cost > 0 && retail > 0 && retail < cost;
    }).length;

    return {
      grossKg,
      grossGrams,
      totalSortedGrams,
      totalSortedKg,
      remainingGrams,
      progressPercent,
      totalBaleCostAed,
      totalRetailValuationAed,
      totalPiecesCostAed,
      profitMarginAed,
      roiMultiplier,
      avgPieceWeightG,
      avgPiecePriceAed,
      grailsCount,
      overrideCount,
      belowCostCount
    };
  }, [bale, pieces]);

  // Search & Filter
  const filteredPieces = useMemo(() => {
    return pieces.filter(p => {
      const q = searchQuery.toLowerCase().trim();
      const code = (p.barcode || p.piece_code || '').toLowerCase();
      const brand = (p.brand_title || p.brandName || p.brand || '').toLowerCase();
      const cat = (p.category || p.itemName || '').toLowerCase();
      const era = (p.era || '').toLowerCase();
      const grade = (p.quality_grade || p.labelGrade || '').toLowerCase();

      const matchesQuery = !q || code.includes(q) || brand.includes(q) || cat.includes(q) || era.includes(q) || grade.includes(q);
      if (!matchesQuery) return false;

      if (selectedFilter === 'GRAILS') return Boolean(p.is_grail || p.isGrail);
      if (selectedFilter === 'OVERRIDDEN') return Boolean(p.is_price_overridden || p.isPriceOverridden);
      if (selectedFilter === 'BELOW_COST') {
        const cost = Number(p.cost_price || p.costPrice || p.calculatedCostPrice || 0);
        const retail = Number(p.selling_price || p.retailPriceAed || p.estimatedPrice || 0);
        return cost > 0 && retail > 0 && retail < cost;
      }

      return true;
    });
  }, [pieces, searchQuery, selectedFilter]);

  const totalItems = filteredPieces.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedPieces = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPieces.slice(start, start + pageSize);
  }, [filteredPieces, currentPage, pageSize]);

  const handlePrintSinglePieceThermal = (p: any) => {
    openThermalLabelPrintWindow({
      itemCode: p.barcode || p.piece_code || 'VINT-001',
      description: `${p.brand_title || p.brandName || 'Vintage'} ${p.category || p.itemName || 'Garment'}`,
      category: p.category || p.itemName,
      size: p.size || p.sizeScanned || 'L',
      brand: p.brand_title || p.brandName || 'Vintage',
      grade: p.quality_grade || p.labelGrade || 'Grade A',
      retailPriceAed: Number(p.selling_price || p.retailPriceAed || 0),
      batchNo: bale?.baleCode || bale?.gatePassNo || 'BALE',
      date: new Date().toLocaleDateString('en-GB'),
      weightKg: (Number(p.weight_grams || p.weightGrams || 0) / 1000)
    });
  };

  if (!isOpen || !bale) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* MODAL HEADER: BALE IDENTITY */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Bale Itemization Manifest: <span className="font-mono text-amber-400">{bale.baleCode || bale.gatePassNo}</span>
                </h2>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold uppercase border border-indigo-400/30">
                  {bale.baleCategory || 'Vintage Mix'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">
                  Ref Inv: {bale.purchaseInvoiceNo || 'N/A'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Kon konsi cheez dali hai &bull; Supplier: <strong className="text-slate-200">{bale.supplierName || 'Global Direct'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenTerminal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTerminal(bale.id);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Resume sorting scale and camera terminal"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Resume Sorting</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* YIELD & MARGIN ANALYTICS HUD */}
        {analytics && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {/* Gross Weight vs Sorted */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Depletion Grams</span>
                <div className="flex items-baseline gap-1 font-mono font-black text-slate-900 text-sm">
                  <span>{analytics.totalSortedGrams.toLocaleString()}g</span>
                  <span className="text-[10px] text-slate-400 font-normal">/ {analytics.grossGrams.toLocaleString()}g</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${analytics.progressPercent}%` }} />
                </div>
              </div>

              {/* Total Pieces */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Sorted Pieces</span>
                <div className="font-mono font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <span>{pieces.length} Pieces</span>
                  {pieces.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-normal">({analytics.avgPieceWeightG}g avg)</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">Remaining: {(analytics.remainingGrams / 1000).toFixed(2)} KG</span>
              </div>

              {/* Bale Landed Cost */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Bale Landed Cost</span>
                <div className="font-mono font-bold text-slate-800 text-sm">
                  AED {analytics.totalBaleCostAed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                  Base: {bale.costPerGram ? `${bale.costPerGram.toFixed(4)} AED/g` : '-'}
                </span>
              </div>

              {/* Retail Sales Valuation */}
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Retail Yield Value</span>
                <div className="font-mono font-black text-emerald-900 text-sm">
                  AED {analytics.totalRetailValuationAed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-emerald-700 block mt-1">
                  Avg: AED {analytics.avgPiecePriceAed.toFixed(2)} / pc
                </span>
              </div>

              {/* Potential Profit & ROI */}
              <div className="bg-white p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-indigo-700 block">Projected Margin</span>
                <div className="font-mono font-black text-indigo-900 text-sm flex items-center gap-1">
                  <span>AED {analytics.profitMarginAed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  {analytics.roiMultiplier > 0 && (
                    <span className="text-[10px] px-1 py-0.2 bg-indigo-200 text-indigo-900 rounded font-bold">
                      {analytics.roiMultiplier}x
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-indigo-700 block mt-1 font-medium">Bale Yield Multiplier</span>
              </div>

              {/* Security & Audit Flags */}
              <div className="bg-white p-2.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-800 block">Security Guardrails</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold inline-flex items-center gap-0.5" title="Grail Vault Items">
                    <Lock className="w-2.5 h-2.5" />
                    <span>{analytics.grailsCount}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold inline-flex items-center gap-0.5" title="AI Price Overrides">
                    <Zap className="w-2.5 h-2.5" />
                    <span>{analytics.overrideCount}</span>
                  </span>
                  {analytics.belowCostCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold inline-flex items-center gap-0.5" title="Retail Lower Than Landed Cost">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>{analytics.belowCostCount}</span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">Anti-Theft Audited</span>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH & FILTER CONTROLS */}
        <div className="px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search sorted items by barcode, brand, category, size..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto text-xs">
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer ${
                selectedFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Pieces ({pieces.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter('GRAILS')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                selectedFilter === 'GRAILS'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Grails ({analytics?.grailsCount || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter('OVERRIDDEN')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                selectedFilter === 'OVERRIDDEN'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Overrides ({analytics?.overrideCount || 0})</span>
            </button>

            {analytics && analytics.belowCostCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFilter('BELOW_COST')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'BELOW_COST'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Below Cost ({analytics.belowCostCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* PIECES LIST / GRID (SCROLLABLE) */}
        <div className="overflow-y-auto flex-1 p-6 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs">Loading sorted garments from database...</p>
            </div>
          ) : filteredPieces.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Package className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No sorted garments match the criteria</p>
              <p className="text-xs text-slate-400">
                {pieces.length === 0
                  ? 'No pieces have been sorted into this bale yet. Click "Resume Sorting" to break down garments.'
                  : 'Try adjusting your search term or filter chips above.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {paginatedPieces.map((p, idx) => {
                const weightG = Number(p.weight_grams || p.weightGrams || (p.weightKg ? p.weightKg * 1000 : 0));
                const costAed = Number(p.cost_price || p.costPrice || p.calculatedCostPrice || 0);
                const retailAed = Number(p.selling_price || p.retailPriceAed || p.estimatedPrice || 0);
                const aiPrice = Number(p.ai_suggested_price || p.aiSuggestedPrice || 0);
                const isOverridden = Boolean(p.is_price_overridden || p.isPriceOverridden);
                const isGrail = Boolean(p.is_grail || p.isGrail);
                const isBelowCost = costAed > 0 && retailAed > 0 && retailAed < costAed;

                const frontImg = p.front_image || p.front_image_url || p.frontImageUrl;
                const backImg = p.back_image || p.back_image_url || p.backImageUrl;
                const tagImg = p.tag_image || p.tag_image_url || p.tagImageUrl;

                return (
                  <div
                    key={p.id || p.barcode || idx}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:shadow-sm transition-all flex gap-3.5"
                  >
                    {/* Photos Thumbnail with Click to Preview */}
                    <div className="w-20 shrink-0 flex flex-col gap-1.5">
                      {frontImg ? (
                        <div
                          onClick={() => setPreviewImage({ url: frontImg, title: `${p.brand_title || p.brandName || 'Garment'} Front` })}
                          className="w-20 h-24 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 relative cursor-pointer group"
                        >
                          <img src={frontImg} alt="Front" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-20 h-24 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-300 gap-1 text-[9px]">
                          <ImageIcon className="w-5 h-5" />
                          <span>No Photo</span>
                        </div>
                      )}

                      {/* Small Additional thumbnails: Back / Tag */}
                      <div className="flex gap-1">
                        {backImg && (
                          <div
                            onClick={() => setPreviewImage({ url: backImg, title: `${p.brand_title || p.brandName || 'Garment'} Back` })}
                            className="w-9 h-9 rounded bg-slate-100 overflow-hidden border border-slate-200 cursor-pointer"
                            title="View Back Photo"
                          >
                            <img src={backImg} alt="Back" className="w-full h-full object-cover" />
                          </div>
                        )}
                        {tagImg && (
                          <div
                            onClick={() => setPreviewImage({ url: tagImg, title: `${p.brand_title || p.brandName || 'Garment'} Tag OCR` })}
                            className="w-9 h-9 rounded bg-slate-100 overflow-hidden border border-slate-200 cursor-pointer"
                            title="View Tag OCR Photo"
                          >
                            <img src={tagImg} alt="Tag" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Garment Details & Financials */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
                      <div>
                        {/* Badges Bar */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                            {p.barcode || p.piece_code || `PC-${idx + 1}`}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                            {p.size || p.sizeScanned || 'Free Size'}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
                            {p.quality_grade || p.labelGrade || 'Grade A'}
                          </span>
                          {isGrail && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded border border-purple-300 inline-flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5 text-purple-700" />
                              <span>Grail Lock</span>
                            </span>
                          )}
                        </div>

                        {/* Title & Brand */}
                        <h3 className="font-bold text-xs text-slate-900 truncate">
                          {p.brand_title || p.brandName || 'Vintage'}{' '}
                          <span className="font-normal text-slate-600">&bull; {p.category || p.itemName || 'Garment'}</span>
                        </h3>

                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                          <span>Era: <strong className="text-slate-600 font-semibold">{p.era || 'Vintage'}</strong></span>
                          <span>&bull;</span>
                          <span>Weight: <strong className="text-slate-800 font-semibold">{weightG} g</strong></span>
                        </div>
                      </div>

                      {/* Financial Card: Landed Cost vs Selling Price & Audit Alerts */}
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Landed Cost</span>
                            <span className="font-mono font-bold text-slate-700 text-[11px]">
                              AED {costAed.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Retail Price</span>
                            <span className="font-mono font-black text-slate-900 text-sm">
                              AED {retailAed.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Below-Cost Warning */}
                        {isBelowCost && (
                          <div className="bg-rose-100/80 border border-rose-300 rounded px-1.5 py-0.5 text-[9.5px] text-rose-800 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>Warning: Retail price is lower than piece landed cost!</span>
                          </div>
                        )}

                        {/* AI Price Override Indicator */}
                        {isOverridden && aiPrice > 0 && (
                          <div className="bg-amber-100/70 border border-amber-300 rounded px-1.5 py-0.5 text-[9.5px] text-amber-900 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <Zap className="w-2.5 h-2.5 text-amber-700" />
                              <span>AI Recommended:</span>
                            </span>
                            <span className="font-mono font-bold line-through text-amber-800">
                              AED {aiPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9px] text-slate-400 font-mono">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : 'Ready'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handlePrintSinglePieceThermal(p)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[10px] rounded border border-slate-300 shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                          title="Print 50x25mm thermal barcode sticker for this garment"
                        >
                          <Printer className="w-3 h-3 text-indigo-600" />
                          <span>Print Sticker</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* REUSABLE PAGINATION */}
        {filteredPieces.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            itemLabel="sorted garments"
            className="border-t border-slate-200"
          />
        )}

        {/* MODAL FOOTER */}
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-mono">
            Showing <strong>{filteredPieces.length}</strong> of <strong>{pieces.length}</strong> sorted garments
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>

      {/* FULL-SIZE IMAGE LIGHTBOX PREVIEW */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-slate-900 rounded-xl overflow-hidden border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="p-3 bg-slate-950 flex items-center justify-between text-white border-b border-slate-800 text-xs font-bold">
              <span>{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img src={previewImage.url} alt={previewImage.title} className="max-h-[75vh] w-auto mx-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};

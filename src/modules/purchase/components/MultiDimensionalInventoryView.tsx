import React, { useState, useMemo } from 'react';
import { PieceBreakdownItem, InwardGatePass } from '../purchase.types.ts';
import { StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { ImageOptimizer } from '../../../utils/imageOptimizer.ts';
import {
  Layers,
  Search,
  Tag,
  Package,
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Scale,
  Building,
  CheckCircle2,
  Clock,
  Barcode,
  Sparkles,
  ExternalLink,
  Trash2,
  X
} from 'lucide-react';

interface MultiDimensionalInventoryViewProps {
  pieces: PieceBreakdownItem[];
  bales: InwardGatePass[];
  onPrintSticker: (sticker: StickerData) => void;
  onSelectBale?: (baleId: string) => void;
  onRefresh?: () => void;
  onPieceDeleted?: (pieceId: string) => void;
}

type ViewDimension = 'ITEM' | 'BRAND' | 'CATEGORY' | 'BALE_AUDIT';

export const MultiDimensionalInventoryView: React.FC<MultiDimensionalInventoryViewProps> = ({
  pieces,
  bales,
  onPrintSticker,
  onSelectBale,
  onRefresh,
  onPieceDeleted
}) => {
  const [activeDimension, setActiveDimension] = useState<ViewDimension>('ITEM');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'SOLD'>('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [previewLightboxImage, setPreviewLightboxImage] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  const handlePurgeOrphaned = async () => {
    if (!confirm('Are you sure you want to scan and purge all orphaned inventory pieces that have no active commercial invoice or inward bale? This will clean up the database.')) return;
    setIsPurging(true);
    try {
      const result = await PurchaseService.purgeOrphanedInventory();
      alert(`Purge completed: ${result.deletedCount} orphaned items purged from database.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  // Map of bale ID / gatepass ID to bale info for reverse trace
  const baleMap = useMemo(() => {
    const map = new Map<string, InwardGatePass>();
    bales.forEach(b => {
      map.set(b.id, b);
      if (b.gatePassNo) map.set(b.gatePassNo, b);
      if (b.baleCode) map.set(b.baleCode, b);
    });
    return map;
  }, [bales]);

  // Distinct Brands
  const distinctBrands = useMemo(() => {
    const set = new Set<string>();
    pieces.forEach(p => {
      if (p.brandName) set.add(p.brandName);
    });
    return Array.from(set).sort();
  }, [pieces]);

  // Filtered pieces
  const filteredPieces = useMemo(() => {
    return pieces.filter(piece => {
      const matchesSearch =
        (piece.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (piece.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (piece.brandName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (piece.sizeScanned || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (piece.countryOfOrigin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (piece.style || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (brandFilter !== 'ALL' && piece.brandName !== brandFilter) return false;

      if (statusFilter === 'IN_STOCK' && piece.isSold) return false;
      if (statusFilter === 'SOLD' && !piece.isSold) return false;

      return true;
    });
  }, [pieces, searchTerm, statusFilter, brandFilter]);

  // Inventory KPIs
  const kpis = useMemo(() => {
    const totalCount = pieces.length;
    const inStockCount = pieces.filter(p => !p.isSold).length;
    const soldCount = pieces.filter(p => p.isSold).length;
    const totalGrams = pieces.reduce((sum, p) => sum + (p.weightGrams || Math.round((p.weightKg || 0) * 1000)), 0);
    const totalWeightKg = totalGrams / 1000;
    const totalCostAed = pieces.reduce((sum, p) => sum + (p.calculatedCostPrice || p.costPrice || 0), 0);
    const totalValuationAed = pieces.reduce((sum, p) => sum + (p.estimatedPrice || p.retailPriceAed || 0), 0);
    const avgCostPerGram = totalGrams > 0 ? totalCostAed / totalGrams : 0;
    const projectedProfitAed = totalValuationAed - totalCostAed;

    return {
      totalCount,
      inStockCount,
      soldCount,
      totalWeightKg,
      totalGrams,
      totalCostAed,
      totalValuationAed,
      avgCostPerGram,
      projectedProfitAed
    };
  }, [pieces]);

  // Grouped by Brand
  const brandGroups = useMemo(() => {
    const map = new Map<string, { brand: string; count: number; weightGrams: number; costAed: number; retailAed: number; pieces: PieceBreakdownItem[] }>();
    filteredPieces.forEach(p => {
      const b = p.brandName || 'Unbranded / Other';
      const existing = map.get(b) || { brand: b, count: 0, weightGrams: 0, costAed: 0, retailAed: 0, pieces: [] };
      const g = p.weightGrams || Math.round((p.weightKg || 0) * 1000);
      existing.count += 1;
      existing.weightGrams += g;
      existing.costAed += p.calculatedCostPrice || 0;
      existing.retailAed += p.estimatedPrice || 0;
      existing.pieces.push(p);
      map.set(b, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredPieces]);

  // Grouped by Category / Garment Type
  const categoryGroups = useMemo(() => {
    const map = new Map<string, { category: string; count: number; weightGrams: number; costAed: number; retailAed: number; pieces: PieceBreakdownItem[] }>();
    filteredPieces.forEach(p => {
      const cat = p.itemName || 'Vintage Mixed Garment';
      const existing = map.get(cat) || { category: cat, count: 0, weightGrams: 0, costAed: 0, retailAed: 0, pieces: [] };
      const g = p.weightGrams || Math.round((p.weightKg || 0) * 1000);
      existing.count += 1;
      existing.weightGrams += g;
      existing.costAed += p.calculatedCostPrice || 0;
      existing.retailAed += p.estimatedPrice || 0;
      existing.pieces.push(p);
      map.set(cat, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredPieces]);

  // Grouped by Bale (Bale-Wise Audit)
  const baleAuditGroups = useMemo(() => {
    const map = new Map<string, { baleId: string; baleCode: string; supplierName: string; invoiceNo: string; category: string; costPerGram: number; count: number; weightGrams: number; costAed: number; retailAed: number; pieces: PieceBreakdownItem[] }>();
    filteredPieces.forEach(p => {
      const bKey = p.gatePassId || 'UNKNOWN_BALE';
      const baleObj = baleMap.get(bKey);
      const code = baleObj?.baleCode || baleObj?.gatePassNo || bKey;
      const supp = baleObj?.supplierName || 'Import Supplier';
      const inv = baleObj?.purchaseInvoiceNo || 'N/A';
      const cat = baleObj?.baleCategory || 'Vintage Mix';
      const cpg = baleObj?.costPerGram || p.costPerGram || 0;

      const existing = map.get(bKey) || {
        baleId: bKey,
        baleCode: code,
        supplierName: supp,
        invoiceNo: inv,
        category: cat,
        costPerGram: cpg,
        count: 0,
        weightGrams: 0,
        costAed: 0,
        retailAed: 0,
        pieces: []
      };

      const g = p.weightGrams || Math.round((p.weightKg || 0) * 1000);
      existing.count += 1;
      existing.weightGrams += g;
      existing.costAed += p.calculatedCostPrice || 0;
      existing.retailAed += p.estimatedPrice || 0;
      existing.pieces.push(p);
      map.set(bKey, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredPieces, baleMap]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['SKU_Barcode', 'Description', 'Brand', 'Grade', 'Size', 'Origin', 'Weight_Grams', 'Weight_KG', 'Cost_per_Gram_AED', 'Unit_Cost_AED', 'Target_Retail_AED', 'Margin_Pct', 'Status', 'Bale_Ref'];
    const rows = filteredPieces.map(p => {
      const g = p.weightGrams || Math.round((p.weightKg || 0) * 1000);
      const kg = (g / 1000).toFixed(3);
      const cost = (p.calculatedCostPrice || 0).toFixed(2);
      const price = (p.estimatedPrice || 0).toFixed(2);
      const margin = p.estimatedPrice && p.estimatedPrice > 0 ? Math.round(((p.estimatedPrice - (p.calculatedCostPrice || 0)) / p.estimatedPrice) * 100) : 0;
      return [
        `"${p.barcode}"`,
        `"${p.itemName.replace(/"/g, '""')}"`,
        `"${p.brandName || ''}"`,
        `"${p.labelGrade || ''}"`,
        `"${p.sizeScanned || ''}"`,
        `"${p.countryOfOrigin || ''}"`,
        g,
        kg,
        (p.costPerGram || 0).toFixed(4),
        cost,
        price,
        `${margin}%`,
        p.isSold ? 'SOLD' : 'IN_STOCK',
        `"${p.gatePassId || ''}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VintageVibe_Inventory_Valuation_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Valuation Report
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Multi-Dimensional Finished Goods Inventory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time individual garment valuation, gram cost allocation, brand grouping and commercial reverse-audit trace
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export CSV
          </button>
          <button
            onClick={handlePrintReport}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            Print Valuation Report
          </button>
          <button
            onClick={handlePurgeOrphaned}
            disabled={isPurging}
            className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Scan and purge orphaned finished goods pieces that have no active commercial invoice or inward bale"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>{isPurging ? 'Purging...' : 'Purge Orphaned Stock'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total SKUs in Room</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {kpis.totalCount} <span className="text-xs font-normal text-slate-400">pieces</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            <strong className="text-emerald-700">{kpis.inStockCount}</strong> In Stock &bull; {kpis.soldCount} Sold
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Stock Weight</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {kpis.totalWeightKg.toFixed(2)} <span className="text-xs font-normal text-slate-400">KG</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {kpis.totalGrams.toLocaleString()} Total Grams
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Allocated Cost</div>
          <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">
            AED {kpis.totalCostAed.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-indigo-500 mt-1 font-semibold">
            AED {kpis.avgCostPerGram.toFixed(4)}/g weighted avg
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Retail Valuation</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            AED {kpis.totalValuationAed.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            +AED {kpis.projectedProfitAed.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} unrealized gross margin
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Margin Spread</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {kpis.totalValuationAed > 0 ? Math.round((kpis.projectedProfitAed / kpis.totalValuationAed) * 100) : 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Markup: {kpis.totalCostAed > 0 ? (kpis.totalValuationAed / kpis.totalCostAed).toFixed(2) : 1}x on procurement
          </div>
        </div>
      </div>

      {/* Multi-Dimensional View Switcher & Search Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dimension View:</span>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveDimension('ITEM')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeDimension === 'ITEM'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Item-Wise (SKUs)
              </button>
              <button
                type="button"
                onClick={() => setActiveDimension('BRAND')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeDimension === 'BRAND'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Brand-Wise ({brandGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDimension('CATEGORY')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeDimension === 'CATEGORY'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3. Category-Wise ({categoryGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDimension('BALE_AUDIT')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeDimension === 'BALE_AUDIT'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4. Bale-Wise Audit Trace
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['ALL', 'IN_STOCK', 'SOLD'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'ALL' ? 'All Pieces' : st === 'IN_STOCK' ? 'In Stock Only' : 'Sold History'}
              </button>
            ))}
          </div>
        </div>

        {/* Filter inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Barcode Gun Search (e.g. BAL-001-P001), Brand, Style, Size, Origin..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold text-slate-700"
            >
              <option value="ALL">All Brands ({distinctBrands.length})</option>
              {distinctBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DIMENSION 1: ITEM-WISE TABLE */}
      {activeDimension === 'ITEM' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Barcode / SKU</th>
                  <th className="px-4 py-3 text-center">Photos</th>
                  <th className="px-4 py-3">Garment Item & Style</th>
                  <th className="px-4 py-3">Brand & Grade</th>
                  <th className="px-4 py-3">Size & Origin</th>
                  <th className="px-4 py-3">Weight</th>
                  <th className="px-4 py-3">Cost / g</th>
                  <th className="px-4 py-3">Piece Cost</th>
                  <th className="px-4 py-3">Target Retail</th>
                  <th className="px-4 py-3">Margin</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPieces.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                      No garment pieces matching search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPieces.map(piece => {
                    const grams = piece.weightGrams || Math.round((piece.weightKg || 0) * 1000);
                    const cost = piece.calculatedCostPrice || piece.costPrice || 0;
                    const price = piece.estimatedPrice || piece.retailPriceAed || 0;
                    const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
                    const cpg = piece.costPerGram || (grams > 0 ? cost / grams : 0);
                    const frontImg = piece.frontImageUrl || (piece as any).front_image || (piece as any).front_image_url;
                    const backImg = piece.backImageUrl || (piece as any).back_image || (piece as any).back_image_url;
                    const tagImg = piece.tagImageUrl || (piece as any).tag_image || (piece as any).tag_image_url;

                    return (
                      <tr key={piece.id || piece.barcode} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap">
                          {piece.barcode}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {frontImg && (
                              <img
                                src={ImageOptimizer.getThumbnailUrl(frontImg, 80, 70)}
                                alt="Front"
                                loading="lazy"
                                decoding="async"
                                title="Front Photo - Click to Enlarge"
                                onClick={() => setPreviewLightboxImage(frontImg)}
                                className="w-8 h-8 object-cover rounded border border-slate-300 hover:border-emerald-500 cursor-pointer hover:scale-125 transition shadow-xs"
                              />
                            )}
                            {backImg && (
                              <img
                                src={ImageOptimizer.getThumbnailUrl(backImg, 80, 70)}
                                alt="Back"
                                loading="lazy"
                                decoding="async"
                                title="Back Photo - Click to Enlarge"
                                onClick={() => setPreviewLightboxImage(backImg)}
                                className="w-8 h-8 object-cover rounded border border-slate-300 hover:border-indigo-500 cursor-pointer hover:scale-125 transition shadow-xs"
                              />
                            )}
                            {tagImg && (
                              <img
                                src={ImageOptimizer.getThumbnailUrl(tagImg, 80, 70)}
                                alt="Tag"
                                loading="lazy"
                                decoding="async"
                                title="Tag OCR Photo - Click to Enlarge"
                                onClick={() => setPreviewLightboxImage(tagImg)}
                                className="w-8 h-8 object-cover rounded border border-amber-400 hover:border-amber-600 cursor-pointer hover:scale-125 transition shadow-xs"
                              />
                            )}
                            {!frontImg && !backImg && !tagImg && (
                              <span className="text-[10px] text-slate-300 font-mono">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900 font-semibold">{piece.itemName}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            {piece.style || 'Standard vintage'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800">{piece.brandName}</span>
                          <div className="text-[11px] text-slate-500">{piece.labelGrade}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-slate-800">{piece.sizeScanned || 'L'}</span>
                          <div className="text-[11px] text-slate-400">{piece.countryOfOrigin || 'Imported'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {grams} g
                          <span className="text-[10px] text-slate-400 block font-normal">
                            {(grams / 1000).toFixed(3)} KG
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-indigo-600">
                          AED {cpg.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          AED {cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                          AED {price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              margin >= 60
                                ? 'bg-emerald-50 text-emerald-700'
                                : margin >= 40
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {margin}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              piece.isSold
                                ? 'bg-rose-50 text-rose-700'
                                : piece.status === 'CLAIMED_PENDING'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {piece.isSold ? 'SOLD' : piece.status === 'CLAIMED_PENDING' ? 'LIVE HOLD' : 'IN STOCK'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onPrintSticker({
                                  itemCode: piece.barcode,
                                  description: `${piece.itemName} (${piece.sizeScanned || 'L'})`,
                                  brand: piece.brandName,
                                  grade: piece.labelGrade,
                                  retailPriceAed: price,
                                  weightKg: piece.weightKg || (grams / 1000),
                                  batchNo: piece.gatePassId || 'BALE',
                                  date: piece.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                                  origin: piece.countryOfOrigin,
                                  shopLocation: piece.shopLocation
                                })
                              }
                              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded cursor-pointer transition-colors"
                              title="Print Thermal Barcode Label"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Delete piece ${piece.barcode} (${piece.itemName}) from inventory?`)) return;
                                try {
                                  await PurchaseService.deleteInventoryPiece(piece.id);
                                  if (onPieceDeleted) onPieceDeleted(piece.id, null as any);
                                  if (onRefresh) onRefresh();
                                } catch (e: any) {
                                  alert(`Failed to delete piece: ${e.message}`);
                                }
                              }}
                              className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded cursor-pointer transition-colors"
                              title="Delete Piece from Inventory"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DIMENSION 2: BRAND-WISE CARDS */}
      {activeDimension === 'BRAND' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brandGroups.map(bg => {
            const avgCostPerPiece = bg.count > 0 ? bg.costAed / bg.count : 0;
            const avgRetailPerPiece = bg.count > 0 ? bg.retailAed / bg.count : 0;
            const marginPct = bg.retailAed > 0 ? Math.round(((bg.retailAed - bg.costAed) / bg.retailAed) * 100) : 0;

            return (
              <div key={bg.brand} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 tracking-tight flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-indigo-600" />
                    <span>{bg.brand}</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {bg.count} pcs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Weight</span>
                    <span className="font-mono font-bold text-slate-800">
                      {(bg.weightGrams / 1000).toFixed(2)} KG
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono">{bg.weightGrams.toLocaleString()} g</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Margin</span>
                    <span className="font-mono font-bold text-emerald-700">{marginPct}%</span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      +AED {(bg.retailAed - bg.costAed).toFixed(0)}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Landed Cost</span>
                    <span className="font-mono font-bold text-indigo-700">AED {bg.costAed.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">Avg AED {avgCostPerPiece.toFixed(2)}/pc</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Retail Valuation</span>
                    <span className="font-mono font-bold text-emerald-600">AED {bg.retailAed.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">Avg AED {avgRetailPerPiece.toFixed(2)}/pc</span>
                  </div>
                </div>

                {/* Sample items preview */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Sample Stock SKUs:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {bg.pieces.slice(0, 4).map(p => (
                      <span key={p.id} className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {p.barcode} ({p.sizeScanned || 'L'})
                      </span>
                    ))}
                    {bg.pieces.length > 4 && (
                      <span className="text-[10px] font-mono text-slate-400 self-center">
                        +{bg.pieces.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DIMENSION 3: CATEGORY-WISE VIEW */}
      {activeDimension === 'CATEGORY' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Garment Category</th>
                  <th className="px-4 py-3 text-center">Piece Count</th>
                  <th className="px-4 py-3">Total Weight</th>
                  <th className="px-4 py-3">Avg Gram Weight</th>
                  <th className="px-4 py-3">Allocated Cost</th>
                  <th className="px-4 py-3">Retail Valuation</th>
                  <th className="px-4 py-3">Unrealized Gross Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categoryGroups.map(cg => {
                  const avgGrams = cg.count > 0 ? Math.round(cg.weightGrams / cg.count) : 0;
                  const profit = cg.retailAed - cg.costAed;
                  const marginPct = cg.retailAed > 0 ? Math.round((profit / cg.retailAed) * 100) : 0;

                  return (
                    <tr key={typeof cg.category === 'object' && cg.category !== null ? (cg.category as any).name : String(cg.category || '')} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {typeof cg.category === 'object' && cg.category !== null ? (cg.category as any).name : String(cg.category || '')}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-indigo-600">
                        {cg.count} pcs
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {(cg.weightGrams / 1000).toFixed(3)} KG
                        <span className="text-[10px] text-slate-400 block">{cg.weightGrams.toLocaleString()} g</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {avgGrams} g/pc
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        AED {cg.costAed.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                        AED {cg.retailAed.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className="font-bold text-emerald-700">AED {profit.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500 block font-normal">({marginPct}% margin)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DIMENSION 4: BALE-WISE AUDIT TRACE */}
      {activeDimension === 'BALE_AUDIT' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Reverse Supply Chain Audit:</strong> Every individual piece barcode is traceably tied back to its container, commercial invoice, supplier TRN, and exact gram cost allocation.
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {baleAuditGroups.map(bg => {
              return (
                <div key={bg.baleId} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono text-indigo-700">{bg.baleCode}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {typeof bg.category === 'object' && bg.category !== null ? (bg.category as any).name : String(bg.category || '')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supplier: <strong className="text-slate-800">{bg.supplierName}</strong> &bull; Commercial Invoice: <span className="font-mono text-slate-700">{bg.invoiceNo}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Base Cost / g</span>
                        <span className="font-bold text-indigo-600">AED {bg.costPerGram.toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Pieces Sorted</span>
                        <span className="font-bold text-slate-900">{bg.count} pcs</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Total Batch Cost</span>
                        <span className="font-bold text-slate-900">AED {bg.costAed.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Target Value</span>
                        <span className="font-bold text-emerald-600">AED {bg.retailAed.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Piece breakdown list */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-2">Piece Barcode</th>
                          <th className="px-3 py-2 text-center">Photos</th>
                          <th className="px-3 py-2">Garment</th>
                          <th className="px-3 py-2">Brand & Size</th>
                          <th className="px-3 py-2">Weight</th>
                          <th className="px-3 py-2">Cost (Weight &times; Cost/g)</th>
                          <th className="px-3 py-2">Retail Price</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Print</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {bg.pieces.map(p => {
                          const g = p.weightGrams || Math.round((p.weightKg || 0) * 1000);
                          const cost = p.calculatedCostPrice || 0;
                          const price = p.estimatedPrice || 0;
                          const frontImg = p.frontImageUrl || (p as any).front_image || (p as any).front_image_url;
                          const backImg = p.backImageUrl || (p as any).back_image || (p as any).back_image_url;
                          const tagImg = p.tagImageUrl || (p as any).tag_image || (p as any).tag_image_url;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-bold text-indigo-600">{p.barcode}</td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {frontImg && (
                                    <img
                                      src={frontImg}
                                      alt="Front"
                                      title="Front Photo - Click to Enlarge"
                                      onClick={() => setPreviewLightboxImage(frontImg)}
                                      className="w-6 h-6 object-cover rounded border border-slate-300 hover:border-emerald-500 cursor-pointer hover:scale-125 transition shadow-xs"
                                    />
                                  )}
                                  {backImg && (
                                    <img
                                      src={backImg}
                                      alt="Back"
                                      title="Back Photo - Click to Enlarge"
                                      onClick={() => setPreviewLightboxImage(backImg)}
                                      className="w-6 h-6 object-cover rounded border border-slate-300 hover:border-indigo-500 cursor-pointer hover:scale-125 transition shadow-xs"
                                    />
                                  )}
                                  {tagImg && (
                                    <img
                                      src={tagImg}
                                      alt="Tag"
                                      title="Tag OCR Photo - Click to Enlarge"
                                      onClick={() => setPreviewLightboxImage(tagImg)}
                                      className="w-6 h-6 object-cover rounded border border-amber-400 hover:border-amber-600 cursor-pointer hover:scale-125 transition shadow-xs"
                                    />
                                  )}
                                  {!frontImg && !backImg && !tagImg && (
                                    <span className="text-[10px] text-slate-300 font-mono">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-sans font-medium text-slate-900">{p.itemName}</td>
                              <td className="px-3 py-2 font-sans text-slate-700">{p.brandName} ({p.sizeScanned || 'L'})</td>
                              <td className="px-3 py-2">{g} g</td>
                              <td className="px-3 py-2 font-bold text-slate-900">AED {cost.toFixed(2)}</td>
                              <td className="px-3 py-2 font-bold text-emerald-600">AED {price.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.isSold ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                  {p.isSold ? 'SOLD' : 'IN STOCK'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPrintSticker({
                                      itemCode: p.barcode,
                                      description: `${p.itemName} (${p.sizeScanned || 'L'})`,
                                      brand: p.brandName,
                                      grade: p.labelGrade,
                                      retailPriceAed: price,
                                      weightKg: p.weightKg || (g / 1000),
                                      batchNo: bg.baleCode,
                                      date: p.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                                      origin: p.countryOfOrigin,
                                      shopLocation: p.shopLocation
                                    })
                                  }
                                  className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LIGHTBOX PREVIEW MODAL */}
      {previewLightboxImage && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
          onClick={() => setPreviewLightboxImage(null)}
        >
          <div
            className="relative max-w-lg max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl p-2"
            onClick={e => e.stopPropagation()}
          >
            <img src={previewLightboxImage} alt="Preview" className="w-full h-full object-contain rounded-xl" />
            <button
              type="button"
              onClick={() => setPreviewLightboxImage(null)}
              className="absolute top-4 right-4 bg-black/70 hover:bg-rose-600 text-white rounded-full p-1.5 transition shadow cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

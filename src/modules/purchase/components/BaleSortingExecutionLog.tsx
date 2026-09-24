import React, { useState, useMemo } from 'react';
import { InwardGatePass, PieceBreakdownItem, PurchaseInvoice } from '../purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster, BrandMaster, LabelGrade, ShopMaster } from '../../setup/setup.types.ts';
import { PurchaseEngine } from '../purchase.engine.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import { BaleSortedPiecesInspectModal } from './BaleSortedPiecesInspectModal.tsx';
import {
  Scale,
  Package,
  Layers,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Barcode,
  ArrowRight,
  Eye,
  RefreshCw,
  Sliders,
  FileText,
  Trash2,
  Lock
} from 'lucide-react';

interface BaleSortingExecutionLogProps {
  bales: InwardGatePass[];
  invoices: PurchaseInvoice[];
  parties: Party[];
  items: ItemMaster[];
  brands: BrandMaster[];
  labels: LabelGrade[];
  shops: ShopMaster[];
  onOpenSortingTerminal: (baleId?: string) => void;
  onRefresh: () => void;
  onDeleteBale?: (deletedBaleId: string) => void;
}

export const BaleSortingExecutionLog: React.FC<BaleSortingExecutionLogProps> = ({
  bales,
  invoices,
  parties,
  items,
  brands,
  labels,
  shops,
  onOpenSortingTerminal,
  onRefresh,
  onDeleteBale
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'UNOPENED'>('ALL');
  const [isDeletingBaleId, setIsDeletingBaleId] = useState<string | null>(null);
  const [inspectingBale, setInspectingBale] = useState<InwardGatePass | null>(null);

  const handleDeleteBale = async (bale: InwardGatePass, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const baleTitle = bale.baleCode || bale.gatePassNo || bale.id;
    if (!window.confirm(`Are you sure you want to delete Bale "${baleTitle}"?\n\nThis will remove the Inward Pass and unlock the associated Commercial Invoice for unposting.`)) {
      return;
    }
    try {
      setIsDeletingBaleId(bale.id);
      luxuryAudio.playMechanicalClick();
      await PurchaseService.deleteInwardGatePass(bale.id);
      if (onDeleteBale) {
        onDeleteBale(bale.id);
      }
      alert(`Bale "${baleTitle}" deleted successfully. Associated Commercial Invoice is now unlocked.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Failed to delete bale: ${err?.message || 'Error'}`);
    } finally {
      setIsDeletingBaleId(null);
    }
  };

  // Factory-wide Sorting KPIs
  const kpis = useMemo(() => {
    const totalBales = bales.length;
    const totalGrossKg = bales.reduce((sum, b) => sum + (Number(b.totalBaleWeight) || 0), 0);
    const totalGrossGrams = Math.round(totalGrossKg * 1000);

    const totalSortedKg = bales.reduce((sum, b) => sum + (Number(b.brokenDownWeight) || 0), 0);
    const totalSortedGrams = Math.round(totalSortedKg * 1000);

    const totalRemainingGrams = Math.max(0, totalGrossGrams - totalSortedGrams);
    const totalPieces = bales.reduce((sum, b) => sum + (b.pieces?.length || b.pieceCount || 0), 0);

    const overallProgressPercent = totalGrossGrams > 0
      ? Math.min(100, Math.round((totalSortedGrams / totalGrossGrams) * 100))
      : 0;

    const completedBales = bales.filter(b => {
      const dep = PurchaseEngine.calculateBaleDepletion(b.totalBaleWeight, b.pieces || []);
      return dep.sortingStatus === 'FULLY_SORTED';
    }).length;

    const inProgressBales = bales.filter(b => {
      const dep = PurchaseEngine.calculateBaleDepletion(b.totalBaleWeight, b.pieces || []);
      return dep.sortingStatus === 'PARTIALLY_SORTED';
    }).length;

    return {
      totalBales,
      totalGrossKg,
      totalGrossGrams,
      totalSortedGrams,
      totalRemainingGrams,
      totalPieces,
      overallProgressPercent,
      completedBales,
      inProgressBales
    };
  }, [bales]);

  // Master Filtered Rows
  const filteredBales = useMemo(() => {
    return bales.filter(bale => {
      const term = searchTerm.toLowerCase().trim();
      const codeMatch = (bale.baleCode || '').toLowerCase().includes(term) ||
                        (bale.gatePassNo || '').toLowerCase().includes(term);
      const invMatch = (bale.purchaseInvoiceNo || '').toLowerCase().includes(term);
      const supMatch = (bale.supplierName || '').toLowerCase().includes(term);
      const catMatch = (bale.baleCategory || '').toLowerCase().includes(term);

      if (term && !codeMatch && !invMatch && !supMatch && !catMatch) {
        return false;
      }

      const dep = PurchaseEngine.calculateBaleDepletion(bale.totalBaleWeight, bale.pieces || []);
      const status = dep.sortingStatus;

      if (statusFilter === 'COMPLETED') return status === 'FULLY_SORTED';
      if (statusFilter === 'IN_PROGRESS') return status === 'PARTIALLY_SORTED';
      if (statusFilter === 'UNOPENED') return status === 'UNOPENED';

      return true;
    });
  }, [bales, searchTerm, statusFilter]);

  // Batch Print All Filtered Bales Thermal Labels
  const handlePrintBatchLabels = () => {
    if (filteredBales.length === 0) return;
    luxuryAudio.playMechanicalClick();
    const tags = filteredBales.map((b, idx) => ({
      baleCode: b.baleCode || b.gatePassNo,
      gatePassNo: b.gatePassNo,
      category: b.baleCategory || 'Vintage Mix',
      grossWeightKg: b.totalBaleWeight || 0,
      totalCostAed: b.totalBaleCost || 0,
      costPerGram: b.costPerGram || 0,
      purchaseInvoiceNo: b.purchaseInvoiceNo,
      supplierName: b.supplierName,
      status: b.sortingStatus || 'Ready for Sorting',
      timestamp: new Date().toLocaleString(),
      index: idx + 1,
      totalCount: filteredBales.length
    }));
    openBatchBaleThermalTagsPrintWindow(tags);
  };

  const handleStartSorting = (baleId?: string) => {
    luxuryAudio.playMechanicalClick();
    onOpenSortingTerminal(baleId);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* OPERATIONS HUB HEADER & PRIMARY CTA */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Bale Sorting Terminal & Operations Hub</span>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] px-2.5 py-0.5 rounded-full font-mono font-semibold">
                  Factory Engine
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                High-precision gram depletion, AI garment OCR tagging, and live piece stream breakdown
              </p>
            </div>
          </div>
        </div>

        {/* Big Prominent Action: [ ⚖️ + Register / Start Sorting Bale ] */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={handlePrintBatchLabels}
            disabled={filteredBales.length === 0}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            title="Print 4x2 Thermal Barcode Stickers for filtered bales"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Print Thermal Tags ({filteredBales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleStartSorting()}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/30 flex items-center gap-2.5 transition-all transform active:scale-95 cursor-pointer"
          >
            <Scale className="w-4 h-4 text-white animate-pulse" />
            <span>⚖️ + Register / Start Sorting Bale</span>
          </button>
        </div>
      </div>

      {/* FACTORY HUD KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Master Bales Inward
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-mono text-slate-900">{kpis.totalBales}</span>
            <span className="text-xs text-slate-500 font-medium">bales</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-semibold mt-1 block">
            {kpis.completedBales} completed &bull; {kpis.inProgressBales} active
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Raw Weight
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black font-mono text-slate-900">{kpis.totalGrossKg.toFixed(1)}</span>
            <span className="text-xs text-slate-500 font-medium">KG</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            {kpis.totalGrossGrams.toLocaleString()} Grams
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/20 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
            Total Grams Sorted
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black font-mono text-emerald-800">
              {kpis.totalSortedGrams.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 font-medium">g</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
            {(kpis.totalSortedGrams / 1000).toFixed(2)} KG broken down
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200/80 bg-amber-50/20 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            Remaining Unsorted
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black font-mono text-amber-800">
              {kpis.totalRemainingGrams.toLocaleString()}
            </span>
            <span className="text-xs text-amber-600 font-medium">g</span>
          </div>
          <span className="text-[11px] text-amber-600 font-semibold mt-1 block">
            {(kpis.totalRemainingGrams / 1000).toFixed(2)} KG to sort
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/20 shadow-2xs">
          <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
            Finished Garments
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black font-mono text-indigo-800">{kpis.totalPieces}</span>
            <span className="text-xs text-indigo-600 font-medium">pieces</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-semibold mt-1 block">
            {kpis.overallProgressPercent}% factory progress
          </span>
        </div>
      </div>

      {/* CONTROLS: SEARCH & STATUS FILTER RIBBON */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-80">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Bale Code, Invoice, Category..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {(['ALL', 'IN_PROGRESS', 'COMPLETED', 'UNOPENED'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setStatusFilter(tab);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab === 'ALL' && `All Bales (${bales.length})`}
              {tab === 'IN_PROGRESS' && `In Progress (${kpis.inProgressBales})`}
              {tab === 'COMPLETED' && `Completed (${kpis.completedBales})`}
              {tab === 'UNOPENED' && `Unopened (${bales.length - kpis.completedBales - kpis.inProgressBales})`}
            </button>
          ))}
          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-2 cursor-pointer"
            title="Refresh Execution Log"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MASTER BALE SORTING EXECUTION LOG TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Bale Code</th>
                <th className="py-3 px-4 font-semibold">Commercial Invoice Ref</th>
                <th className="py-3 px-4 font-semibold">Bale Category</th>
                <th className="py-3 px-4 font-semibold text-right">Gross Wt (KG)</th>
                <th className="py-3 px-4 font-semibold text-right">Grams Sorted</th>
                <th className="py-3 px-4 font-semibold text-right">Pieces</th>
                <th className="py-3 px-4 font-semibold text-right">Remaining (g)</th>
                <th className="py-3 px-4 font-semibold text-center w-36">Progress (%)</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredBales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-700">No Bales Found in Execution Log</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Register an inward commercial bale or click [ + Register / Start Sorting Bale ] above.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleStartSorting()}
                      className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Start First Bale Sorting Session</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredBales.map(bale => {
                  const grossKg = Number(bale.totalBaleWeight) || 0;
                  const grossGrams = Math.round(grossKg * 1000);
                  const sortedKg = Number(bale.brokenDownWeight ?? (bale as any).broken_down_weight ?? ((bale as any).grams_sorted ? (bale as any).grams_sorted / 1000 : 0));
                  const sortedGrams = Math.round(Number((bale as any).sorted_grams ?? (bale as any).grams_sorted ?? (sortedKg * 1000)));
                  const remainingGrams = Math.max(0, grossGrams - sortedGrams);
                  const piecesCount = Number(bale.pieceCount ?? (bale as any).piece_count ?? (bale as any).pieces_count ?? bale.pieces?.length ?? 0);
                  const percent = grossGrams > 0 ? Math.min(100, Math.round((sortedGrams / grossGrams) * 100)) : 0;

                  const isComplete = percent === 100 || bale.sortingStatus === 'FULLY_SORTED' || bale.status === 'COMPLETED' || bale.status === 'POSTED';
                  const isInProgress = !isComplete && (piecesCount > 0 || sortedGrams > 0);
                  const isDeletable = piecesCount === 0;

                  return (
                    <tr
                      key={bale.id}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                      onClick={() => handleStartSorting(bale.id)}
                    >
                      {/* Bale Code */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center font-mono font-bold text-indigo-700 text-[11px] shrink-0">
                            BAL
                          </div>
                          <div>
                            <span className="font-bold font-mono text-slate-900 group-hover:text-indigo-600 transition-colors block">
                              {bale.baleCode || bale.gatePassNo}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {bale.gatePassNo}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Commercial Invoice Ref */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-mono font-semibold text-slate-800 text-[11px] block">
                            {bale.purchaseInvoiceNo}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[180px] block">
                            {bale.supplierName || 'International Factory Shipper'}
                          </span>
                        </div>
                      </td>

                      {/* Bale Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <Layers className="w-3 h-3 text-slate-500" />
                          <span>{bale.baleCategory || 'Vintage Mix'}</span>
                        </span>
                      </td>

                      {/* Total Gross Weight (KG) */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {grossKg.toFixed(2)} KG
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 block">
                          ({grossGrams.toLocaleString()}g)
                        </span>
                      </td>

                      {/* Total Grams Sorted */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          {sortedGrams.toLocaleString()} g
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 block">
                          {(sortedKg).toFixed(2)} KG
                        </span>
                      </td>

                      {/* Total Pieces Produced */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-black text-indigo-700 text-xs inline-flex items-center gap-1">
                          <Barcode className="w-3 h-3 text-indigo-500" />
                          <span>{piecesCount}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 block">pcs</span>
                      </td>

                      {/* Remaining Unsorted Grams */}
                      <td className="py-3.5 px-4 text-right">
                        <span className={`font-mono font-bold text-xs ${remainingGrams === 0 ? 'text-slate-400' : 'text-amber-700'}`}>
                          {remainingGrams.toLocaleString()} g
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 block">
                          {(remainingGrams / 1000).toFixed(2)} KG
                        </span>
                      </td>

                      {/* Progress (%) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="w-full space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-600">
                            <span>{percent}%</span>
                            <span>{sortedGrams}/{grossGrams}g</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                            <div
                              className={`h-full transition-all duration-500 rounded-full ${
                                isComplete
                                  ? 'bg-emerald-500'
                                  : percent > 50
                                  ? 'bg-indigo-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isComplete ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Completed</span>
                          </span>
                        ) : isInProgress ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                            <span>In Progress</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>Unopened</span>
                          </span>
                        )}
                      </td>

                      {/* Action: [ 📦 Sorted Items (X) ] & [ 👁️ Resume Sorting ] & Conditional [ 🗑️ Delete Bale ] */}
                      <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-center gap-1.5">
                          {/* Dedicated "Kon Konsi Cheeza Dali Hain" / View Sorted Items Button */}
                          <button
                            type="button"
                            onClick={() => setInspectingBale(bale)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="View all sorted items in this bale / Kon konsi cheeza dali hain"
                          >
                            <Package className="w-3.5 h-3.5 text-amber-700" />
                            <span>Sorted Items ({piecesCount})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartSorting(bale.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                              isComplete
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isComplete ? 'Terminal' : 'Resume Sorting'}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>

                          {isDeletable ? (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteBale(bale, e)}
                              disabled={isDeletingBaleId === bale.id}
                              title="Delete Inward Pass / Bale"
                              className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title={`Deletion Locked: Bale contains ${piecesCount} sorted pieces (${sortedGrams}g). Delete all sorted pieces first.`}
                              className="p-1.5 text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed opacity-60 shadow-2xs"
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                          )}
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

      {/* Dedicated Bale Inspection Modal ("Kon Konsi Cheeza Dali Hain") */}
      {inspectingBale && (
        <BaleSortedPiecesInspectModal
          isOpen={Boolean(inspectingBale)}
          bale={inspectingBale}
          onClose={() => setInspectingBale(null)}
          onOpenTerminal={handleStartSorting}
        />
      )}
    </div>
  );
};

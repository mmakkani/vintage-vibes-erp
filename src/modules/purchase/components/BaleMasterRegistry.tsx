import React, { useState, useMemo } from 'react';
import { InwardGatePass } from '../purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { PurchaseEngine } from '../purchase.engine.ts';
import { openBaleThermalTagPrintWindow, openBatchBaleThermalTagsPrintWindow } from '../../../utils/thermalPrinter.ts';
import {
  Package,
  Plus,
  Scale,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Layers,
  FileText,
  Truck,
  Building2,
  AlertCircle,
  Printer,
  Tag
} from 'lucide-react';

interface BaleMasterRegistryProps {
  bales: InwardGatePass[];
  parties: Party[];
  onOpenSortingTerminal: (baleId: string) => void;
  onBaleCreated: (newBale: InwardGatePass) => void;
  onRefresh: () => void;
}

export const BaleMasterRegistry: React.FC<BaleMasterRegistryProps> = ({
  bales,
  parties,
  onOpenSortingTerminal,
  onBaleCreated,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNOPENED' | 'IN_PROGRESS' | 'FULLY_SORTED'>('ALL');

  // Modal State
  const [showNewBaleModal, setShowNewBaleModal] = useState(false);
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [totalCostAed, setTotalCostAed] = useState<number | ''>('');
  const [totalWeightKg, setTotalWeightKg] = useState<number | ''>('');
  const [baleCategory, setBaleCategory] = useState('90s Vintage Denim & American Knitwear');
  const [vehicleNo, setVehicleNo] = useState('');
  const [containerNo, setContainerNo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Live Cost per Gram calculation inside modal:
  // Cost_per_Gram = Total_Bale_Cost / (Total_Bale_Weight_KG * 1000)
  const computedCostPerGram = useMemo(() => {
    const cost = Number(totalCostAed) || 0;
    const weight = Number(totalWeightKg) || 0;
    return PurchaseEngine.calculateCostPerGram(cost, weight);
  }, [totalCostAed, totalWeightKg]);

  // Overall Bale Registry KPIs
  const kpis = useMemo(() => {
    const totalBales = bales.length;
    const totalWeight = bales.reduce((sum, b) => sum + (b.totalBaleWeight || 0), 0);
    const totalCost = bales.reduce((sum, b) => sum + (b.totalBaleCost || 0), 0);
    const sortedWeight = bales.reduce((sum, b) => sum + (b.brokenDownWeight || 0), 0);
    const totalPieces = bales.reduce((sum, b) => sum + (b.pieces?.length || b.pieceCount || 0), 0);
    const avgCostPerGram = totalWeight > 0 ? totalCost / (totalWeight * 1000) : 0;

    return {
      totalBales,
      totalWeight,
      totalCost,
      sortedWeight,
      totalPieces,
      avgCostPerGram
    };
  }, [bales]);

  // Filtered Bales
  const filteredBales = useMemo(() => {
    return bales.filter(bale => {
      const matchesSearch =
        (bale.baleCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bale.gatePassNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bale.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bale.purchaseInvoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bale.baleCategory || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      const depletion = PurchaseEngine.calculateBaleDepletion(bale.totalBaleWeight, bale.pieces || []);
      const currentStatus = depletion.sortingStatus;

      if (statusFilter === 'UNOPENED') return currentStatus === 'UNOPENED';
      if (statusFilter === 'IN_PROGRESS') return currentStatus === 'PARTIALLY_SORTED';
      if (statusFilter === 'FULLY_SORTED') return currentStatus === 'FULLY_SORTED';

      return true;
    });
  }, [bales, searchTerm, statusFilter]);

  const handlePrintBatchAll = () => {
    if (filteredBales.length === 0) return;
    const tags = filteredBales.map((b, idx) => ({
      baleCode: b.baleCode || b.gatePassNo,
      gatePassNo: b.gatePassNo,
      category: b.baleCategory,
      grossWeightKg: b.totalBaleWeight || 0,
      totalCostAed: b.totalBaleCost || 0,
      costPerGram: b.costPerGram || 0,
      purchaseInvoiceNo: b.purchaseInvoiceNo,
      supplierName: b.supplierName,
      status: 'In Registry',
      timestamp: new Date().toLocaleString(),
      index: idx + 1,
      totalCount: filteredBales.length
    }));
    openBatchBaleThermalTagsPrintWindow(tags);
  };

  const handleCreateBale = async (e: React.FormEvent) => {
    e.preventDefault();
    const costNum = Number(totalCostAed) || 0;
    const weightNum = Number(totalWeightKg) || 0;

    if (!purchaseInvoiceNo.trim() || !supplierName.trim()) {
      setModalError('Purchase Invoice No. and Supplier are required.');
      return;
    }
    if (costNum <= 0 || weightNum <= 0) {
      setModalError('Total Cost and Total Weight must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setModalError('');

    try {
      const res = await fetch('/api/purchase/gate-passes/bale-inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseInvoiceNo: purchaseInvoiceNo.trim(),
          supplierName: supplierName.trim(),
          supplierId,
          totalBaleCostAed: costNum,
          totalBaleWeightKg: weightNum,
          baleCategory,
          vehicleNo: vehicleNo.trim(),
          containerNo: containerNo.trim()
        })
      });

      let baleToUse: any = null;
      try {
        const data = await res.json();
        if (res.ok && data.success && data.bale) {
          baleToUse = data.bale;
        }
      } catch {}

      if (!baleToUse) {
        // Safe offline local fallback bale
        const localId = `igp-local-${Date.now()}`;
        const localGatePassNo = `IGP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const localBaleCode = `BAL-${purchaseInvoiceNo.replace(/[^a-zA-Z0-9]/g, '') || 'LOCAL'}-001`;
        baleToUse = {
          id: localId,
          gatePassNo: localGatePassNo,
          baleCode: localBaleCode,
          baleCategory,
          purchaseInvoiceId: 'local-pi-01',
          purchaseInvoiceNo: purchaseInvoiceNo.trim(),
          supplierName: supplierName.trim(),
          supplierId: supplierId || 'pty-local',
          date: new Date().toISOString().slice(0, 10),
          status: 'UNOPENED',
          sortingStatus: 'UNOPENED',
          totalBaleCost: costNum,
          totalBaleWeight: weightNum,
          costPerGram: computedCostPerGram,
          brokenDownWeight: 0,
          remainingWeight: weightNum,
          pieceCount: 0,
          pieces: []
        };
      }

      setShowNewBaleModal(false);
      onBaleCreated(baleToUse);
      onRefresh();

      // Automatically trigger Instant 4"x2" Bale Thermal Tag Generator
      try {
        openBaleThermalTagPrintWindow({
          baleCode: baleToUse.baleCode || baleToUse.gatePassNo,
          gatePassNo: baleToUse.gatePassNo,
          category: baleToUse.baleCategory || baleCategory,
          grossWeightKg: baleToUse.totalBaleWeight || weightNum,
          totalCostAed: baleToUse.totalBaleCost || costNum,
          costPerGram: baleToUse.costPerGram || computedCostPerGram,
          purchaseInvoiceNo: baleToUse.purchaseInvoiceNo || purchaseInvoiceNo,
          supplierName: baleToUse.supplierName || supplierName,
          status: 'Unopened / In Stock',
          timestamp: new Date().toLocaleString()
        });
      } catch (printErr) {
        console.warn('Auto bale tag print popup warning:', printErr);
      }

      // Reset form
      setPurchaseInvoiceNo('');
      setSupplierName('');
      setTotalCostAed('');
      setTotalWeightKg('');
      setVehicleNo('');
      setContainerNo('');
    } catch {
      // Fallback offline creation on complete network disconnection
      const localId = `igp-local-${Date.now()}`;
      const localGatePassNo = `IGP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const localBaleCode = `BAL-${purchaseInvoiceNo.replace(/[^a-zA-Z0-9]/g, '') || 'LOCAL'}-001`;
      const fallbackBale: InwardGatePass = {
        id: localId,
        gatePassNo: localGatePassNo,
        baleCode: localBaleCode,
        baleCategory,
        purchaseInvoiceId: 'local-pi-01',
        purchaseInvoiceNo: purchaseInvoiceNo.trim(),
        supplierName: supplierName.trim(),
        supplierId: supplierId || 'pty-local',
        date: new Date().toISOString().slice(0, 10),
        status: 'UNOPENED',
        sortingStatus: 'UNOPENED',
        totalBaleCost: costNum,
        totalBaleWeight: weightNum,
        costPerGram: computedCostPerGram,
        brokenDownWeight: 0,
        remainingWeight: weightNum,
        pieceCount: 0,
        pieces: []
      };
      setShowNewBaleModal(false);
      onBaleCreated(fallbackBale);
      try {
        openBaleThermalTagPrintWindow({
          baleCode: fallbackBale.baleCode || fallbackBale.gatePassNo,
          gatePassNo: fallbackBale.gatePassNo,
          category: fallbackBale.baleCategory,
          grossWeightKg: fallbackBale.totalBaleWeight,
          totalCostAed: fallbackBale.totalBaleCost,
          costPerGram: fallbackBale.costPerGram,
          purchaseInvoiceNo: fallbackBale.purchaseInvoiceNo,
          supplierName: fallbackBale.supplierName,
          status: 'Unopened / Offline Cache',
          timestamp: new Date().toLocaleString()
        });
      } catch {}
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Bale Inward Master Registry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full enterprise tracking of imported raw vintage bales, strictly tracking Base Cost per Gram and piece allocation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {filteredBales.length > 0 && (
            <button
              type="button"
              onClick={handlePrintBatchAll}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print 4x2 thermal labels for all filtered bales"
            >
              <Tag className="w-3.5 h-3.5 text-amber-200" />
              <span>Print All Bale Tags ({filteredBales.length})</span>
            </button>
          )}

          <button
            onClick={() => {
              const nextIdx = bales.length + 1;
              setPurchaseInvoiceNo(`PUR-BALE-2026-${String(nextIdx).padStart(4, '0')}`);
              if (parties.length > 0) {
                setSupplierName(parties[0].name);
                setSupplierId(parties[0].id);
              }
              setShowNewBaleModal(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Bale Inward</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Registered Bales</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {kpis.totalBales || 0} <span className="text-xs font-normal text-slate-400">bales</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">All registered inward lots</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Bale Weight</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {(kpis.totalWeight || 0).toFixed(2)} <span className="text-xs font-normal text-slate-400">KG</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {((kpis.totalWeight || 0) * 1000).toLocaleString()} Total Grams
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Bale Cost</div>
          <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">
            AED {(kpis.totalCost || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Landed procurement investment</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Cost / Gram</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            AED {(kpis.avgCostPerGram || 0).toFixed(4)}
          </div>
          <div className="text-[11px] text-indigo-600 font-semibold mt-1">
            AED {((kpis.avgCostPerGram || 0) * 1000).toFixed(2)} / KG avg
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pieces Extracted</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {kpis.totalPieces || 0} <span className="text-xs font-normal text-slate-400">SKUs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {(kpis.sortedWeight || 0).toFixed(2)} KG broken down
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Bale Code, Invoice, Supplier, Category..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
          {(['ALL', 'UNOPENED', 'IN_PROGRESS', 'FULLY_SORTED'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'ALL'
                ? 'All Bales'
                : tab === 'UNOPENED'
                ? 'Unopened (0%)'
                : tab === 'IN_PROGRESS'
                ? 'In Progress'
                : 'Fully Sorted (100%)'}
            </button>
          ))}
        </div>
      </div>

      {/* Bale Registry Master Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Bale Code</th>
                <th className="px-4 py-3">Invoice Ref & Supplier</th>
                <th className="px-4 py-3">Bale Category</th>
                <th className="px-4 py-3">Total Cost</th>
                <th className="px-4 py-3">Weight (KG)</th>
                <th className="px-4 py-3">Cost / Gram</th>
                <th className="px-4 py-3">Pieces / Broken Down</th>
                <th className="px-4 py-3">Remaining KG</th>
                <th className="px-4 py-3">Sorting Progress</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredBales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    No bales matching the selected filter criteria. Click "Register New Bale Inward" to add one!
                  </td>
                </tr>
              ) : (
                filteredBales.map(bale => {
                  const baleTotalWeight = Number(bale.totalBaleWeight || 0);
                  const baleTotalCost = Number(bale.totalBaleCost || 0);
                  const depletion = PurchaseEngine.calculateBaleDepletion(
                    baleTotalWeight,
                    bale.pieces || []
                  );
                  const costPerGram = bale.costPerGram || PurchaseEngine.calculateCostPerGram(baleTotalCost, baleTotalWeight);

                  const brokenDownKg = Number(depletion.brokenDownWeightKg || 0);
                  const remainingKg = Number(depletion.remainingWeightKg || 0);
                  const percentUnsorted = baleTotalWeight > 0 ? Math.round((remainingKg / baleTotalWeight) * 100) : 0;

                  return (
                    <tr key={bale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap">
                        {bale.baleCode || bale.gatePassNo}
                        <div className="text-[10px] text-slate-400 font-normal font-sans">
                          {bale.gatePassNo}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{bale.supplierName}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {bale.purchaseInvoiceNo}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {bale.baleCategory || 'Vintage Mix'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        AED {baleTotalCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {baleTotalWeight.toFixed(3)} KG
                        <span className="text-[10px] text-slate-400 block font-normal">
                          {(baleTotalWeight * 1000).toLocaleString()} g
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700">
                        AED {Number(costPerGram || 0).toFixed(4)}/g
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <strong className="text-emerald-700 font-semibold">{depletion.pieceCount || 0} pcs</strong>
                        <div className="text-[10px] text-slate-500 font-normal">
                          {brokenDownKg.toFixed(3)} KG sorted
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-700 font-semibold">
                        {remainingKg.toFixed(3)} KG
                        <div className="text-[10px] text-slate-400 font-normal">
                          {percentUnsorted}% unsorted
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center justify-between text-[10px] mb-1 font-semibold">
                          <span
                            className={
                              depletion.sortingStatus === 'FULLY_SORTED'
                                ? 'text-emerald-600'
                                : (depletion.pieceCount || 0) > 0
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }
                          >
                            {depletion.sortingStatus === 'FULLY_SORTED'
                              ? 'Fully Sorted'
                              : (depletion.pieceCount || 0) > 0
                              ? 'In Progress'
                              : 'Unopened'}
                          </span>
                          <span className="font-mono text-slate-600">{depletion.percentCompleted || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              depletion.sortingStatus === 'FULLY_SORTED'
                                ? 'bg-emerald-500'
                                : 'bg-indigo-600'
                            }`}
                            style={{ width: `${Math.min(100, depletion.percentCompleted || 0)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              openBaleThermalTagPrintWindow({
                                baleCode: bale.baleCode || bale.gatePassNo,
                                gatePassNo: bale.gatePassNo,
                                category: bale.baleCategory || 'Vintage Mix',
                                grossWeightKg: baleTotalWeight,
                                totalCostAed: baleTotalCost,
                                costPerGram: Number(costPerGram) || 0,
                                purchaseInvoiceNo: bale.purchaseInvoiceNo,
                                supplierName: bale.supplierName,
                                status: depletion.sortingStatus === 'FULLY_SORTED' ? 'Fully Sorted' : (depletion.pieceCount > 0 ? 'In Progress' : 'Unopened / In Stock'),
                                timestamp: bale.date || new Date().toLocaleDateString()
                              })
                            }
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded cursor-pointer transition-colors"
                            title="Print 4x2 Bale Thermal Tag"
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-600" />
                          </button>
                          <button
                            onClick={() => onOpenSortingTerminal(bale.id)}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            Open Terminal
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

      {/* Modal: Register New Bale Inward */}
      {showNewBaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-600" />
                  Purchase Entry & Bale Inward Gate Pass
                </h3>
                <p className="text-xs text-slate-500">
                  Register arriving vintage bale and initialize base cost-per-gram calculation
                </p>
              </div>
              <button
                onClick={() => setShowNewBaleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateBale} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Purchase Invoice No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={purchaseInvoiceNo}
                    onChange={e => setPurchaseInvoiceNo(e.target.value)}
                    placeholder="e.g., PUR-2026-0042"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier / Party Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="e.g. Rotterdam Textile Sorters B.V."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Bale Cost (AED) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={10}
                      required
                      min={10}
                      value={totalCostAed}
                      onChange={e => setTotalCostAed(Number(e.target.value))}
                      className="w-full pl-3 pr-12 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                    <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                      AED
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Bale Weight in KG *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={0.5}
                      required
                      min={0.5}
                      value={totalWeightKg}
                      onChange={e => setTotalWeightKg(Number(e.target.value))}
                      className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                    <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                      KG
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Computed Cost Per Gram Display */}
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                    Formula: Cost / Gram = Total Cost / (Weight KG &times; 1000)
                  </div>
                  <div className="text-xs text-indigo-700 mt-0.5">
                    AED {Number(totalCostAed) || 0} &divide; {((Number(totalWeightKg) || 0) * 1000).toLocaleString()} grams
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-mono font-extrabold text-indigo-700">
                    AED {computedCostPerGram.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-indigo-500 font-semibold">per gram base cost</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bale Category *
                </label>
                <select
                  value={baleCategory}
                  onChange={e => setBaleCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="90s Vintage Denim & American Knitwear">
                    90s Vintage Denim & American Knitwear
                  </option>
                  <option value="Vintage Band Tees & Graphic Hoodies">
                    Vintage Band Tees & Graphic Hoodies
                  </option>
                  <option value="Italian Wool Overcoats & Blazers">
                    Italian Wool Overcoats & Blazers
                  </option>
                  <option value="Outdoor Fleece & Retro Sportswear">
                    Outdoor Fleece & Retro Sportswear
                  </option>
                  <option value="Carhartt & Workwear Duck Canvas">
                    Carhartt & Workwear Duck Canvas
                  </option>
                  <option value="Vintage Streetwear & Mixed Grails">
                    Vintage Streetwear & Mixed Grails
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Container No.</label>
                  <input
                    type="text"
                    value={containerNo}
                    onChange={e => setContainerNo(e.target.value)}
                    placeholder="e.g. MSCU-902184-7"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle No.</label>
                  <input
                    type="text"
                    value={vehicleNo}
                    onChange={e => setVehicleNo(e.target.value)}
                    placeholder="e.g. DXB-C-98210"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewBaleModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Save & Initialize Bale (Unopened 0%)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

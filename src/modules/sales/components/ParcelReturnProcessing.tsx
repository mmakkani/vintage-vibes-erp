import React, { useState, useEffect } from 'react';
import { ParcelReturnRecord, SalesInvoice } from '../sales.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import { StatusBadge } from '../../../components/StatusBadge.tsx';
import {
  RotateCcw,
  Search,
  PackageX,
  Truck,
  CheckCircle,
  AlertCircle,
  Barcode,
  Layers,
  FileText,
  DollarSign,
  Scale,
  Building,
  RefreshCw,
  Clock,
  Printer,
  Receipt,
  User,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface ParcelReturnProcessingProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const ParcelReturnProcessing: React.FC<ParcelReturnProcessingProps> = ({ onRefreshAll }) => {
  // Search & Lookup State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    invoice?: SalesInvoice;
    matchedPiece?: PieceBreakdownItem;
    pieces?: PieceBreakdownItem[];
    error?: string;
  } | null>(null);

  // Return Form State
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState<string>('CUSTOMER_REJECTED');
  const [customReasonNote, setCustomReasonNote] = useState('');
  const [restockCondition, setRestockCondition] = useState<'RESELLABLE' | 'DAMAGED' | 'SCRAP'>('RESELLABLE');
  const [courierFeeAed, setCourierFeeAed] = useState<number>(25);
  const [courierFeeBearer, setCourierFeeBearer] = useState<'STORE' | 'CUSTOMER'>('STORE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Results & History
  const [recentReturns, setRecentReturns] = useState<ParcelReturnRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: {
      returnNo: string;
      voucherNo: string;
      piecesRestored: number;
      cogsReversed: number;
      revenueRefunded: number;
    };
  } | null>(null);

  // Selected Voucher Modal Preview
  const [selectedReturnDetails, setSelectedReturnDetails] = useState<ParcelReturnRecord | null>(null);

  // Universal Barcode Scanner Gun Listener
  useBarcodeScanner({
    onScan: (code) => {
      const cleanCode = code.trim();
      setSearchQuery(cleanCode);
      executeLookup(cleanCode);
    }
  });

  // Load Return History
  const loadReturnHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/sales/returns');
      if (res.ok) {
        const data = await res.json();
        setRecentReturns(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load parcel returns history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadReturnHistory();
  }, []);

  // Execute Search Lookup
  const executeLookup = async (queryToSearch?: string) => {
    const query = (queryToSearch !== undefined ? queryToSearch : searchQuery).trim();
    if (!query) return;

    setIsSearching(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/sales/returns/lookup?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok || !data.found) {
        setLookupResult({
          found: false,
          error: data.error || `No dispatched parcel found matching "${query}". Check tracking # or barcode.`
        });
      } else {
        setLookupResult(data);
        // Preselect all items in the invoice for return by default
        if (data.pieces && data.pieces.length > 0) {
          setSelectedPieceIds(data.pieces.map((p: PieceBreakdownItem) => p.id));
        } else if (data.matchedPiece) {
          setSelectedPieceIds([data.matchedPiece.id]);
        }
      }
    } catch (err) {
      setLookupResult({
        found: false,
        error: 'Network connection error while searching parcel register.'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle item selection for return
  const togglePieceSelection = (pieceId: string) => {
    setSelectedPieceIds(prev =>
      prev.includes(pieceId) ? prev.filter(id => id !== pieceId) : [...prev, pieceId]
    );
  };

  // Calculate live financial impact
  const returnFinancials = React.useMemo(() => {
    if (!lookupResult || !lookupResult.invoice || !lookupResult.pieces) {
      return {
        selectedItemsCount: 0,
        totalSaleReversed: 0,
        totalVatReversed: 0,
        totalCOGSReversed: 0,
        courierCharge: courierFeeAed,
        netKhataRefund: 0
      };
    }

    const selectedPieces = lookupResult.pieces.filter(p => selectedPieceIds.includes(p.id));
    const itemsCount = selectedPieces.length;

    let totalSale = 0;
    let totalCOGS = 0;

    selectedPieces.forEach(p => {
      // Find invoice item price or fallback to piece retail/estimated price
      const invItem = lookupResult.invoice?.items?.find(it => it.barcode === p.barcode);
      const saleVal = invItem ? invItem.unitPrice : (p.soldPriceAed || p.retailPriceAed || p.estimatedPrice || 100);
      const costVal = p.calculatedCostPrice || p.costPrice || (p.weightGrams ? p.weightGrams * 0.05 : 20);

      totalSale += saleVal;
      totalCOGS += costVal;
    });

    const totalVat = Number((totalSale * 0.05).toFixed(2));
    const grossTotal = Number((totalSale + totalVat).toFixed(2));
    const netKhataRefund = courierFeeBearer === 'CUSTOMER' ? Math.max(0, grossTotal - courierFeeAed) : grossTotal;

    return {
      selectedItemsCount: itemsCount,
      totalSaleReversed: Number(totalSale.toFixed(2)),
      totalVatReversed: totalVat,
      totalCOGSReversed: Number(totalCOGS.toFixed(2)),
      courierCharge: courierFeeAed,
      netKhataRefund: Number(netKhataRefund.toFixed(2))
    };
  }, [lookupResult, selectedPieceIds, courierFeeAed, courierFeeBearer]);

  // Handle Process Return Submit
  const handleProcessReturn = async () => {
    if (!lookupResult || !lookupResult.invoice) return;
    if (selectedPieceIds.length === 0) {
      setActionFeedback({
        type: 'error',
        message: 'Please select at least one garment piece to process for return.'
      });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);

    const payload = {
      trackingNumber: lookupResult.invoice.trackingNumber || searchQuery,
      invoiceId: lookupResult.invoice.id,
      returnedPieceIds: selectedPieceIds,
      returnReason,
      notes: customReasonNote || `Parcel Return processed on ${new Date().toLocaleDateString()}`,
      restockCondition,
      courierFeeAed: Number(courierFeeAed) || 0,
      courierFeeBearer,
      processedBy: 'Returns Supervisor'
    };

    try {
      const res = await fetch('/api/sales/returns/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionFeedback({
          type: 'error',
          message: data.error || 'Failed to process parcel return and COA reversal.'
        });
      } else {
        const ret = data.returnRecord;
        setActionFeedback({
          type: 'success',
          message: `Parcel Return #${ret.returnNo} completed successfully! Stock restored and COA dual-entry voucher posted.`,
          details: {
            returnNo: ret.returnNo,
            voucherNo: ret.reversalVoucherNo || ret.rtoVoucherId || 'JV-RTO',
            piecesRestored: ret.returnedItems.length,
            cogsReversed: ret.totalCOGSReversed,
            revenueRefunded: ret.totalSaleRefunded
          }
        });

        // Reset search form
        setLookupResult(null);
        setSearchQuery('');
        setSelectedPieceIds([]);
        setCustomReasonNote('');

        // Refresh global state and local history
        loadReturnHistory();
        onRefreshAll();
      }
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: 'Network error during parcel return submission.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // KPI Summary calculations
  const safeRecentReturns = Array.isArray(recentReturns) ? recentReturns : [];
  const totalReturnsCount = safeRecentReturns.length;
  const totalPiecesRestored = safeRecentReturns.reduce((acc, r) => acc + (Array.isArray(r?.returnedItems) ? r.returnedItems.length : 0), 0);
  const totalCOGSReclaimed = safeRecentReturns.reduce((acc, r) => acc + (Number(r?.totalCOGSReversed) || 0), 0);
  const totalCourierExp = safeRecentReturns.reduce((acc, r) => acc + (Number(r?.courierReturnCharge) || 0), 0);

  return (
    <div id="parcel-returns-container" className="space-y-4">
      {/* Top Banner & KPI Header */}
      <div className="bg-gradient-to-r from-amber-50 via-white to-orange-50 p-3.5 rounded-lg border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-amber-600 text-white shadow-xs">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              Parcel Return & RTO Reversal Engine
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-300">
                COA Reversible
              </span>
            </h2>
            <p className="text-[11px] text-slate-600">
              Scan courier airway bills, reverse COGS back to finished goods, and reconcile customer Khata balances with automated dual-entry vouchers
            </p>
          </div>
        </div>

        {/* Action Button to refresh */}
        <button
          onClick={loadReturnHistory}
          disabled={isLoadingHistory}
          className="btn-3d btn-3d-light inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-amber-600' : ''}`} />
          <span>Refresh Register</span>
        </button>
      </div>

      {/* KPI Micro Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Returns Processed</div>
          <div className="text-lg font-mono font-bold text-slate-900 mt-0.5">{totalReturnsCount} Parcels</div>
          <div className="text-[10px] text-slate-500">Live RTO & customer returns</div>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Garments Restored</div>
          <div className="text-lg font-mono font-bold text-emerald-700 mt-0.5">{totalPiecesRestored} Pieces</div>
          <div className="text-[10px] text-slate-500">Added back to active inventory</div>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Inventory Asset Reclaimed</div>
          <div className="text-lg font-mono font-bold text-blue-800 mt-0.5">AED {totalCOGSReclaimed.toFixed(2)}</div>
          <div className="text-[10px] text-slate-500">Debited Acc 1200 (Asset)</div>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Courier RTO Expenses</div>
          <div className="text-lg font-mono font-bold text-red-700 mt-0.5">AED {totalCourierExp.toFixed(2)}</div>
          <div className="text-[10px] text-slate-500">Booked to Acc 5420 / 2120</div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-md border flex items-start justify-between gap-3 text-xs ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-start gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold">{actionFeedback.message}</div>
              {actionFeedback.details && (
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-mono text-emerald-800">
                  <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                    Return Ref: {actionFeedback.details.returnNo}
                  </span>
                  <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                    COA Voucher: {actionFeedback.details.voucherNo}
                  </span>
                  <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                    Pieces Restocked: {actionFeedback.details.piecesRestored}
                  </span>
                  <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                    COGS Reclaimed: AED {actionFeedback.details.cogsReversed.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-700 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* SCAN / LOOKUP SEARCH CONSOLE */}
      <div className="bg-white p-3.5 rounded border border-slate-200 shadow-xs">
        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Scan Parcel Airway Bill / Laser Gun Ingest / Invoice Lookup
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Barcode className="w-4 h-4" />
            </div>
            <input
              id="input-parcel-return-search"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') executeLookup();
              }}
              placeholder="Scan Barcode Gun (e.g. TRK-DXB-..., VV-BAL-001-..., or SINV-2026-...)"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <button
            id="btn-search-parcel-return"
            onClick={() => executeLookup()}
            disabled={isSearching}
            className="btn-3d btn-3d-amber inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{isSearching ? 'Searching...' : 'Lookup Parcel'}</span>
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1">
          <span>⚡ Laser Scanner Gun Active:</span> Point and scan any shipping label barcode or garment tag to immediately load the dispatch record.
        </p>
      </div>

      {/* LOOKUP ERROR */}
      {lookupResult && !lookupResult.found && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{lookupResult.error}</span>
        </div>
      )}

      {/* PARCEL RETURN WORKFLOW CARD (WHEN PARCEL FOUND) */}
      {lookupResult && lookupResult.found && lookupResult.invoice && (
        <div className="bg-white rounded border border-amber-300/80 shadow-sm overflow-hidden animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PackageX className="w-4 h-4" />
              <span className="font-bold text-xs uppercase tracking-wider">
                Parcel Return & Inward Sorting: {lookupResult.invoice.invoiceNo}
              </span>
              <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white">
                TRK: {lookupResult.invoice.trackingNumber || 'UNASSIGNED'}
              </span>
            </div>
            <div className="text-[11px] font-mono font-medium">
              Invoice Date: {lookupResult.invoice.date}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Customer & Courier Details Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Customer</span>
                <div className="font-bold text-slate-900">{lookupResult.invoice.customerName}</div>
                <div className="text-slate-500 font-mono text-[11px]">{lookupResult.invoice.customerPhone || 'No phone'}</div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Courier Dispatch</span>
                <div className="font-semibold text-slate-800">{lookupResult.invoice.courierPartner || 'Direct Courier Delivery'}</div>
                <div className="text-slate-500 text-[10px]">
                  Shipping: AED {(lookupResult.invoice.shippingCharge || 0).toFixed(2)} ({lookupResult.invoice.shippingBearer || 'CUSTOMER'})
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Original Invoice Total</span>
                <div className="font-mono font-bold text-blue-900">AED {lookupResult.invoice.totalAmount.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500">VAT: AED {(lookupResult.invoice.vatAmount || 0).toFixed(2)}</div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Current Parcel Status</span>
                <div className="mt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    lookupResult.invoice.isReturned || lookupResult.invoice.returnStatus === 'FULL_RTO'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {lookupResult.invoice.returnStatus || (lookupResult.invoice.isReturned ? 'RETURNED' : 'DISPATCHED')}
                  </span>
                </div>
              </div>
            </div>

            {/* GARMENT SELECTION LIST */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-700" />
                  Select Garments Included in This Return Parcel
                </h4>
                <div className="text-[11px] text-slate-500 font-mono">
                  {selectedPieceIds.length} of {lookupResult.pieces?.length || 0} items checked
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={
                            lookupResult.pieces &&
                            lookupResult.pieces.length > 0 &&
                            selectedPieceIds.length === lookupResult.pieces.length
                          }
                          onChange={e => {
                            if (e.target.checked && lookupResult.pieces) {
                              setSelectedPieceIds(lookupResult.pieces.map(p => p.id));
                            } else {
                              setSelectedPieceIds([]);
                            }
                          }}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                      </th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">Garment Item</th>
                      <th className="px-3 py-2">Brand & Grade</th>
                      <th className="px-3 py-2">Gram Weight</th>
                      <th className="px-3 py-2 font-mono text-right">Base Cost Price</th>
                      <th className="px-3 py-2 font-mono text-right">Sold Price</th>
                      <th className="px-3 py-2 text-center">Return Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lookupResult.pieces?.map(piece => {
                      const isSelected = selectedPieceIds.includes(piece.id);
                      const invItem = lookupResult.invoice?.items?.find(it => it.barcode === piece.barcode);
                      const soldPrice = invItem ? invItem.unitPrice : (piece.soldPriceAed || piece.retailPriceAed || 120);
                      const costPrice = piece.calculatedCostPrice || piece.costPrice || (piece.weightGrams ? piece.weightGrams * 0.05 : 20);

                      return (
                        <tr
                          key={piece.id}
                          onClick={() => togglePieceSelection(piece.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePieceSelection(piece.id)}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-amber-900">
                            {piece.barcode}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{piece.itemName}</div>
                            <div className="text-[10px] text-slate-500">{piece.style || 'Vintage Standard'}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-slate-800">{piece.brandName}</div>
                            <div className="text-[10px] text-slate-500">{piece.labelGrade}</div>
                          </td>
                          <td className="px-3 py-2 font-mono">
                            <span className="font-semibold text-slate-800">{piece.weightGrams || Math.round(piece.weightKg * 1000)} g</span>
                            <span className="text-[10px] text-slate-400 block">({piece.weightKg.toFixed(2)} KG)</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-right text-emerald-800 font-bold">
                            AED {costPrice.toFixed(2)}
                            {piece.costPerGram && (
                              <span className="text-[9px] text-emerald-600 block font-normal">
                                @ AED {piece.costPerGram.toFixed(3)}/g
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-right text-slate-900 font-bold">
                            AED {soldPrice.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isSelected ? (
                              <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                                Restoring
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Keep Sold</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RETURN PARAMETERS & REASON SELECTION */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Return Reason / Rejection Category
                </label>
                <select
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium"
                >
                  <option value="CUSTOMER_REJECTED">Customer Refused Delivery / RTO (No-Show)</option>
                  <option value="WRONG_ITEM">Wrong Item / Size Mismatch</option>
                  <option value="DAMAGED_TRANSIT">Damaged in Transit / Quality Defect</option>
                  <option value="CANCELLED">Buyer Changed Mind / Cancelled at Door</option>
                  <option value="UNREACHABLE">Unreachable Address / Failed 3 Attempts</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Physical Garment Restock Target
                </label>
                <select
                  value={restockCondition}
                  onChange={e => setRestockCondition(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium"
                >
                  <option value="RESELLABLE">Resellable — Return to Finished Goods (Stock)</option>
                  <option value="DAMAGED">Minor Flaw — Move to Clearance / Grade B</option>
                  <option value="SCRAP">Damaged Beyond Repair — Write-off to Scrap</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Return Courier Delivery Fee (AED)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={courierFeeAed}
                    onChange={e => setCourierFeeAed(Math.max(0, Number(e.target.value)))}
                    className="w-24 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                  <select
                    value={courierFeeBearer}
                    onChange={e => setCourierFeeBearer(e.target.value as any)}
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800"
                  >
                    <option value="STORE">Store Absorbs (Acc 5420 Expense)</option>
                    <option value="CUSTOMER">Deduct from Customer Refund</option>
                  </select>
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Operational Inspection Notes & Warehouse Remarks
                </label>
                <input
                  type="text"
                  value={customReasonNote}
                  onChange={e => setCustomReasonNote(e.target.value)}
                  placeholder="e.g. Courier driver returned package with seal intact. Inspected by Lead Sorter."
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>
            </div>

            {/* DUAL-ENTRY COA VOUCHER IMPACT PREVIEW */}
            <div className="bg-amber-50/70 border border-amber-300/80 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-800" />
                  <span className="font-black text-xs text-amber-900 uppercase tracking-wider">
                    Automated Dual-Entry COA Reversal Journal Voucher (Preview)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  Strict Debits = Credits
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                {/* Debit entries */}
                <div className="bg-white p-2.5 rounded border border-amber-200">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                    Debit Entries (Asset & Revenue Reversal)
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-slate-700">
                      <span>• Acc 1200 (Inventory - Finished Goods):</span>
                      <span className="font-bold text-emerald-700">+AED {returnFinancials.totalCOGSReversed.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>• Acc 4130 (Sales Returns & Allowances):</span>
                      <span className="font-bold text-emerald-700">+AED {returnFinancials.totalSaleReversed.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>• Acc 2210 (Output VAT 5% Reversal):</span>
                      <span className="font-bold text-emerald-700">+AED {returnFinancials.totalVatReversed.toFixed(2)}</span>
                    </div>
                    {returnFinancials.courierCharge > 0 && courierFeeBearer === 'STORE' && (
                      <div className="flex justify-between text-slate-700">
                        <span>• Acc 5420 (Courier RTO Delivery Expense):</span>
                        <span className="font-bold text-red-700">+AED {returnFinancials.courierCharge.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Credit entries */}
                <div className="bg-white p-2.5 rounded border border-amber-200">
                  <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1.5">
                    Credit Entries (COGS & Customer Khata Reversal)
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-slate-700">
                      <span>• Acc 5110 (Cost of Goods Sold - Reversal):</span>
                      <span className="font-bold text-blue-700">-AED {returnFinancials.totalCOGSReversed.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>• Acc 1130 (Accounts Receivable - {lookupResult.invoice.customerName}):</span>
                      <span className="font-bold text-blue-700">-AED {returnFinancials.netKhataRefund.toFixed(2)}</span>
                    </div>
                    {returnFinancials.courierCharge > 0 && (
                      <div className="flex justify-between text-slate-700">
                        <span>• Acc 2120 (Courier Payable - Emirates Post/Direct):</span>
                        <span className="font-bold text-blue-700">+AED {returnFinancials.courierCharge.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setLookupResult(null)}
                  className="btn-3d btn-3d-light px-3 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  id="btn-confirm-parcel-return"
                  type="button"
                  onClick={handleProcessReturn}
                  disabled={isSubmitting || selectedPieceIds.length === 0}
                  className="btn-3d btn-3d-emerald inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Processing COA & Stock...'
                      : `Confirm Parcel Return (${selectedPieceIds.length} Items)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSED PARCEL RETURNS REGISTER TABLE */}
      <div className="bg-white rounded border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Completed Parcel Returns & RTO Audit Register ({recentReturns.length} entries)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Live Dual-Entry Journal Sync</span>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">Return No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Tracking & Invoice</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-center">Items Restocked</th>
                <th className="px-3 py-2 font-mono text-right">COGS Reclaimed</th>
                <th className="px-3 py-2 font-mono text-right">Courier Fee</th>
                <th className="px-3 py-2">COA Voucher</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentReturns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    No parcel returns processed yet. Scan a tracking number or barcode above to initiate an RTO return.
                  </td>
                </tr>
              ) : (
                recentReturns.map(ret => (
                  <tr key={ret.id} className="hover:bg-amber-50/40 font-mono transition-colors">
                    <td className="px-3 py-2 font-bold text-amber-900 whitespace-nowrap">
                      {ret.returnNo}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {ret.returnDate}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{ret.trackingNumber}</div>
                      <div className="text-[10px] text-slate-400">{ret.invoiceNo}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-sans">
                      <div className="font-medium text-slate-900">{ret.customerName}</div>
                    </td>
                    <td className="px-3 py-2 font-sans">
                      <span className="inline-block text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {ret.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-emerald-800">
                      {ret.returnedItems?.length || 0} pcs
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-800">
                      AED {(ret.totalCOGSReversed || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-red-700">
                      AED {(ret.courierReturnCharge || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {ret.voucherNo || ret.voucherId || 'JV-RTO'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-sans">
                      <button
                        onClick={() => setSelectedReturnDetails(ret)}
                        className="btn-3d btn-3d-light inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-amber-700" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RETURN DETAILS AUDIT MODAL */}
      {selectedReturnDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full border border-slate-300 overflow-hidden">
            <div className="bg-slate-900 text-white p-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-xs uppercase tracking-wider">
                  Parcel Return Audit Record: {selectedReturnDetails.returnNo}
                </h4>
              </div>
              <button
                onClick={() => setSelectedReturnDetails(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 font-mono bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-sans">Tracking Number</span>
                  <div className="font-bold text-slate-800">{selectedReturnDetails.trackingNumber}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-sans">Original Invoice</span>
                  <div className="font-bold text-slate-800">{selectedReturnDetails.invoiceNo}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-sans">Customer</span>
                  <div className="font-bold text-slate-800 font-sans">{selectedReturnDetails.customerName}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-sans">Processed Date</span>
                  <div className="font-bold text-slate-800">{selectedReturnDetails.returnDate}</div>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                  Restored Garment Items ({selectedReturnDetails.returnedItems.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedReturnDetails.returnedItems.map(item => (
                    <div
                      key={item.barcode}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]"
                    >
                      <div>
                        <span className="font-bold text-amber-900 mr-2">{item.barcode}</span>
                        <span className="text-slate-700 font-sans">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-bold">{item.weightGrams || Math.round(item.weightKg * 1000)} g</span>
                        <span className="text-emerald-800 font-bold">
                          Cost: AED {(item.calculatedCostPrice || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 font-mono text-[11px] flex justify-between items-center">
                <span>Linked COA Reversal Voucher:</span>
                <span className="font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {selectedReturnDetails.voucherNo || selectedReturnDetails.voucherId || 'JV-RTO'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedReturnDetails(null)}
                className="btn-3d btn-3d-light px-4 py-1.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

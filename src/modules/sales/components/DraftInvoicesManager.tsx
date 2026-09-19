import React, { useState, useMemo, useEffect } from 'react';
import { SalesInvoice, SalesInvoiceItem } from '../sales.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Truck,
  DollarSign,
  ShieldCheck,
  Search,
  Layers,
  ArrowRight,
  Package,
  Printer,
  Sparkles,
  AlertCircle,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Barcode,
  Zap,
  Edit,
  MessageSquare,
  Building2
} from 'lucide-react';
import { EditParcelLogisticsModal } from './EditParcelLogisticsModal.tsx';
import { ThermalShippingLabelModal } from './ThermalShippingLabelModal.tsx';
import { WhatsAppOrderModal } from './WhatsAppOrderModal.tsx';
import { LiveClaimModal } from './LiveClaimModal.tsx';
import { RealTimeCourierSettlementModal } from './RealTimeCourierSettlementModal.tsx';

interface CourierOption {
  partyId?: number;
  id: string;
  name: string;
  accountCode: string;
}

const DEFAULT_COURIERS: CourierOption[] = [
  { partyId: 23, id: '813f3f28-d541-4e4d-ad3e-ca6ca2824b21', name: 'DHL Express UAE', accountCode: '2120-01' },
  { partyId: 24, id: '9b1e1713-39d2-4309-8488-81203f5ad602', name: 'Aramex Logistics UAE', accountCode: '2120-02' },
  { partyId: 25, id: 'a8291f04-89f1-46bb-ba22-81203f5ad603', name: 'SMSA Express GCC', accountCode: '2120-03' },
  { partyId: 26, id: 'c5713e89-11ba-47ee-99aa-81203f5ad604', name: 'Emirates Post Premium', accountCode: '2120-04' }
];

interface DraftInvoicesManagerProps {
  invoices: SalesInvoice[];
  stockPieces: PieceBreakdownItem[];
  clients: Party[];
  onRefresh: () => void;
  onPostSuccess: () => void;
}

export const DraftInvoicesManager: React.FC<DraftInvoicesManagerProps> = ({
  invoices,
  stockPieces,
  clients,
  onRefresh,
  onPostSuccess
}) => {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [boothFilter, setBoothFilter] = useState('ALL');

  // Modals for editing parcel details and thermal shipping slips
  const [editingParcelInvoice, setEditingParcelInvoice] = useState<SalesInvoice | null>(null);
  const [thermalSlipInvoice, setThermalSlipInvoice] = useState<SalesInvoice | null>(null);
  const [whatsAppInvoice, setWhatsAppInvoice] = useState<SalesInvoice | null>(null);

  // Quick claim / new draft modal
  const [showNewDraftModal, setShowNewDraftModal] = useState(false);
  const [courierList, setCourierList] = useState<CourierOption[]>(DEFAULT_COURIERS);

  // Fetch active couriers dynamically from Registry
  useEffect(() => {
    let isMounted = true;
    async function fetchCouriers() {
      try {
        const res = await fetch('/api/parties');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const filtered = data
            .filter((p: any) => {
              const type = (p.type || p.party_type || '').toUpperCase();
              const name = (p.name || p.company_name || '').toUpperCase();
              return (
                p.is_active !== false &&
                (type === 'COURIER' ||
                  type === 'LOGISTICS_AGENT' ||
                  type === 'AGENT' ||
                  name.includes('DHL') ||
                  name.includes('ARAMEX') ||
                  name.includes('SMSA') ||
                  name.includes('POST') ||
                  name.includes('COURIER') ||
                  name.includes('EXPRESS'))
              );
            })
            .map((p: any): CourierOption => {
              const accountCode =
                p.account_map?.payableAccountId ||
                p.account_map?.payable_account_id ||
                p.coa_account_id ||
                '2120-00';
              return {
                partyId: p.party_id,
                id: p.id,
                name: p.name || p.company_name,
                accountCode
              };
            });
          if (isMounted && filtered.length > 0) {
            setCourierList(filtered);
          }
        }
      } catch (err) {
        console.warn('Could not fetch couriers from /api/parties:', err);
      }
    }
    fetchCouriers();
    return () => {
      isMounted = false;
    };
  }, []);

  // Bundling SKU input for selected invoice
  const [bundleBarcodeInput, setBundleBarcodeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'LIVE' | 'ECOMMERCE'>('ALL');
  const [showSettlementModal, setShowSettlementModal] = useState<boolean>(false);

  // Filter only DRAFT invoices
  const draftInvoices = useMemo(() => {
    return invoices.filter(inv => inv.status === 'DRAFT');
  }, [invoices]);

  // Selected invoice
  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId && draftInvoices.length > 0) {
      return draftInvoices[0];
    }
    return draftInvoices.find(i => i.id === selectedInvoiceId) || draftInvoices[0] || null;
  }, [selectedInvoiceId, draftInvoices]);

  // Filtered drafts list
  const filteredDrafts = useMemo(() => {
    return draftInvoices.filter(inv => {
      const matchesSearch =
        (inv.invoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.buyerHandle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.paymentReference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.items || []).some(it => it.barcode.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;
      if (boothFilter !== 'ALL' && inv.boothId !== boothFilter) return false;
      const isEcom = (inv as any).channel === 'ECOMMERCE' || (inv as any).channel === 'STOREFRONT';
      if (channelFilter === 'LIVE' && isEcom) return false;
      if (channelFilter === 'ECOMMERCE' && !isEcom) return false;
      return true;
    });
  }, [draftInvoices, searchTerm, boothFilter, channelFilter]);

  // Available pieces for bundling / new claims (not sold, not claimed)
  const availableStock = useMemo(() => {
    return stockPieces.filter(p => !p.isSold && p.status !== 'CLAIMED_PENDING');
  }, [stockPieces]);

  // Expiry detection
  const isDraftExpired = (inv: SalesInvoice) => {
    if (!inv.expiresAt) return false;
    return new Date(inv.expiresAt).getTime() < Date.now();
  };

  const expiredDraftsCount = useMemo(() => {
    return draftInvoices.filter(isDraftExpired).length;
  }, [draftInvoices]);

  const handleReleaseAllExpiredDrafts = async () => {
    const expired = draftInvoices.filter(isDraftExpired);
    if (expired.length === 0) {
      setFeedback({ text: 'No expired live claims found to release.', type: 'success' });
      return;
    }
    if (!confirm(`Release ${expired.length} expired live claims and restore their garments to active inventory?`)) return;

    setIsProcessing(true);
    setFeedback(null);
    try {
      for (const d of expired) {
        await fetch(`/api/sales/invoices/${d.id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cancelledBy: 'Live Claim Expiry Auto-Release' })
        });
      }
      setFeedback({
        text: `⚡ Successfully released ${expired.length} expired claim carts! Inventory unlocked and restocked.`,
        type: 'success'
      });
      onRefresh();
    } catch {
      setFeedback({ text: 'Network error releasing expired claims', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Bundling an Additional SKU into the Selected Draft
  const handleBundlePiece = async (barcodeToAdd?: string) => {
    const code = barcodeToAdd || bundleBarcodeInput.trim();
    if (!code || !selectedInvoice) return;

    setIsProcessing(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalBarcode: code })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ text: data.error || `Could not bundle SKU ${code}`, type: 'error' });
      } else {
        setFeedback({
          text: `📦 Bundled SKU ${code} into ${selectedInvoice.invoiceNo}! Shipping unified for ${selectedInvoice.buyerHandle}.`,
          type: 'success'
        });
        setBundleBarcodeInput('');
        onRefresh();
      }
    } catch {
      setFeedback({ text: 'Network error bundling piece', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Removing a Piece from the Draft (Restores Piece to Active Stock)
  const handleRemovePiece = async (barcodeToRemove: string) => {
    if (!selectedInvoice) return;
    if (selectedInvoice.items.length <= 1) {
      if (!confirm('Removing the only item will cancel the draft invoice. Proceed?')) return;
      handleCancelDraft(selectedInvoice.id);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeBarcode: barcodeToRemove })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ text: `Removed ${barcodeToRemove}; returned to active stock.`, type: 'success' });
        onRefresh();
      } else {
        setFeedback({ text: data.error || 'Failed to remove piece', type: 'error' });
      }
    } catch {
      setFeedback({ text: 'Network error updating draft', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Updating Logistics / Courier / Payment Details
  const handleUpdateLogistics = async (fieldOrUpdates: string | Record<string, any>, value?: any) => {
    if (!selectedInvoice) return;
    try {
      const payload = typeof fieldOrUpdates === 'string' ? { [fieldOrUpdates]: value } : fieldOrUpdates;
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      console.error('Error updating draft invoice logistics:', err);
    }
  };

  // Handle Finalizing & Posting the Invoice
  const handleFinalizeAndPost = async () => {
    if (!selectedInvoice) return;
    if (!confirm(`Finalize and post invoice ${selectedInvoice.invoiceNo} for ${selectedInvoice.customerName}? This will deduct inventory and dispatch General Ledger postings.`)) {
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/sales/invoices/${selectedInvoice.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedBy: 'Live Sales Operator' })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ text: data.error || 'Failed to finalize invoice', type: 'error' });
      } else {
        setFeedback({
          text: `🎉 INVOICE POSTED: ${selectedInvoice.invoiceNo} successfully finalized! Stock deducted & dual-entry COA vouchers generated.`,
          type: 'success'
        });
        setSelectedInvoiceId('');
        onPostSuccess();
        onRefresh();
      }
    } catch {
      setFeedback({ text: 'Network error posting invoice', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Cancelling Draft Invoice
  const handleCancelDraft = async (invoiceId: string) => {
    if (!confirm('Cancel this draft invoice and release all held pieces back to active stock?')) return;

    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sales/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelledBy: 'Live Operator' })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ text: 'Draft invoice cancelled and pieces restored to active stock.', type: 'success' });
        setSelectedInvoiceId('');
        onRefresh();
      } else {
        setFeedback({ text: data.error || 'Failed to cancel invoice', type: 'error' });
      }
    } catch {
      setFeedback({ text: 'Network error cancelling draft', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950/80 text-white rounded-2xl p-4 sm:p-5 border border-amber-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/40 shadow-inner">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-white">
                Live Sale Drafts & Dispatch Hub
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                <Truck className="w-3 h-3 text-amber-400" />
                COD & COURIER DISPATCH READY
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Live Stream Claims • Smart Multi-SKU Bundling • 4x6 Thermal Waybill • Auto COD & COGS Ledger Entry
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {expiredDraftsCount > 0 && (
            <button
              onClick={handleReleaseAllExpiredDrafts}
              disabled={isProcessing}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
              title="Release expired live claims and unlock garments back to stock"
            >
              <Zap className="w-4 h-4" />
              <span>Release {expiredDraftsCount} Expired</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettlementModal(true)}
            className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-400/40"
            title="Real-Time Bank PIN Courier COD Remittance Settlement"
          >
            <Building2 className="w-4 h-4 text-indigo-300" />
            <span>🏦 Settle Courier COD</span>
          </button>
          <button
            onClick={() => setShowNewDraftModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer ring-2 ring-amber-400/50"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Live Claim (Draft)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Layout: Left List of Drafts / Right Active Draft Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Drafts Queue */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                Active Draft Orders ({draftInvoices.length})
              </span>
              <span className="text-[11px] text-slate-500">Atomic Stock Reserved</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter drafts by buyer, SKU, invoice..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <select
                value={channelFilter}
                onChange={e => setChannelFilter(e.target.value as any)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Channels</option>
                <option value="LIVE">🔴 Live Claims</option>
                <option value="ECOMMERCE">🌐 E-Commerce</option>
              </select>

              <select
                value={boothFilter}
                onChange={e => setBoothFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
              >
                <option value="ALL">All Booths</option>
                {Array.from({ length: 10 }).map((_, i) => (
                  <option key={i} value={`booth-${String(i + 1).padStart(2, '0')}`}>
                    Booth {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {filteredDrafts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
                No active draft orders right now. When pieces are claimed during live streaming, they automatically appear here!
              </div>
            ) : (
              filteredDrafts.map(inv => {
                const isSelected = selectedInvoice?.id === inv.id;
                const totalGrams = Array.isArray(inv?.items) ? inv.items.reduce(
                  (s, it) => s + (it?.weightGrams || Math.round((it?.weightKg || 0.45) * 1000)),
                  0
                ) : 0;

                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/50 border-indigo-400 shadow-md ring-1 ring-indigo-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {inv.invoiceNo}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            DRAFT HOLD
                          </span>
                          {(inv as any).channel === 'ECOMMERCE' || (inv as any).channel === 'STOREFRONT' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              🌐 STOREFRONT
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                              {inv.socialPlatform || 'TIKTOK'}
                            </span>
                          )}
                          {inv.paymentStatus === 'PAID' || inv.paymentStatus === 'PREPAID_VERIFIED' || (inv.paymentMethod && inv.paymentMethod !== 'COD' && inv.paymentMethod !== 'CASH_ON_DELIVERY') ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white font-mono">
                              🟢 PAID ONLINE
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-stone-950 font-mono">
                              🟠 COD
                            </span>
                          )}
                          {inv.expiresAt && (() => {
                            const diffMs = new Date(inv.expiresAt).getTime() - Date.now();
                            const isExp = diffMs <= 0;
                            return isExp ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-0.5 animate-pulse">
                                ⚠️ Expired
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                                ⏳ {Math.floor(diffMs / 3600000)}h {Math.floor((diffMs % 3600000) / 60000)}m
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-sm font-bold text-slate-900 mt-1">
                          {inv.buyerHandle || inv.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {inv.boothId ? `Booth ${inv.boothId.replace(/[^0-9]/g, '')}` : 'Web Customer'} &bull;{' '}
                          {inv.customerPhone || 'No phone recorded'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-indigo-700">
                          AED {inv.totalAmount.toFixed(2)}
                        </div>
                        {inv.paymentReference && inv.paymentReference !== 'COD-PAY-ON-DELIVERY' && (
                          <div className="text-[10px] font-mono text-emerald-700 font-bold truncate max-w-[120px]" title={inv.paymentReference}>
                            Ref: {inv.paymentReference}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 font-medium">
                          {inv.paymentStatus === 'PAID' || inv.paymentStatus === 'PREPAID_VERIFIED' ? 'COD: AED 0.00' : `Collect: AED ${inv.totalAmount.toFixed(2)}`}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <span className="flex items-center gap-1 font-medium">
                        <Package className="w-3.5 h-3.5 text-indigo-600" />
                        <strong>{inv.items.length}</strong> items bundled ({(totalGrams / 1000).toFixed(2)} KG)
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {inv.courierPartner || 'DHL Express'} &bull; {inv.paymentStatus || 'Pending COD'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Draft Editor & Finalization Engine */}
        <div className="lg:col-span-7">
          {!selectedInvoice ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs shadow-sm">
              Select an active draft from the left queue or click "Instant Live Claim" to begin bundling and logistics assignment.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden space-y-6 p-6">
              {/* Draft Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold font-mono text-slate-900">
                      {selectedInvoice.invoiceNo}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      DRAFT SALE &bull; CONCURRENT HOLD
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>
                      Buyer: <strong className="text-slate-800">{selectedInvoice.customerName || selectedInvoice.buyerHandle}</strong>
                    </span>
                    &bull;
                    <span>Channel: <strong>{(selectedInvoice as any).channel === 'ECOMMERCE' ? '🌐 E-Commerce Storefront' : (selectedInvoice.socialPlatform || '🔴 Live Stream')}</strong></span>
                    &bull;
                    <span>Destination: <strong>{selectedInvoice.shippingAddress || selectedInvoice.city || 'Dubai, UAE'}</strong></span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setWhatsAppInvoice(selectedInvoice)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>📱 WhatsApp Buyer</span>
                  </button>
                  <button
                    onClick={() => setEditingParcelInvoice(selectedInvoice)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5 text-slate-950" />
                    <span>✏️ Edit Parcel & Pay</span>
                  </button>
                  <button
                    onClick={() => setThermalSlipInvoice(selectedInvoice)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-300" />
                    <span>📄 Print Label / Slip</span>
                  </button>
                  <button
                    onClick={() => handleCancelDraft(selectedInvoice.id)}
                    className="px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Cancel Hold
                  </button>
                </div>
              </div>

              {/* Payment Classification Status Banner */}
              <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                selectedInvoice.paymentStatus === 'PAID' || selectedInvoice.paymentStatus === 'PREPAID_VERIFIED' || (selectedInvoice.paymentMethod && selectedInvoice.paymentMethod !== 'COD' && selectedInvoice.paymentMethod !== 'CASH_ON_DELIVERY')
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide font-mono ${
                    selectedInvoice.paymentStatus === 'PAID' || selectedInvoice.paymentStatus === 'PREPAID_VERIFIED' || (selectedInvoice.paymentMethod && selectedInvoice.paymentMethod !== 'COD' && selectedInvoice.paymentMethod !== 'CASH_ON_DELIVERY')
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-amber-500 text-stone-950 shadow-xs'
                  }`}>
                    {selectedInvoice.paymentStatus === 'PAID' || selectedInvoice.paymentStatus === 'PREPAID_VERIFIED' || (selectedInvoice.paymentMethod && selectedInvoice.paymentMethod !== 'COD' && selectedInvoice.paymentMethod !== 'CASH_ON_DELIVERY')
                      ? '🟢 PREPAID ONLINE — DO NOT COLLECT ANY CASH'
                      : '🔴 CASH ON DELIVERY — MUST COLLECT EXACT CASH'}
                  </span>
                  {selectedInvoice.paymentReference && selectedInvoice.paymentReference !== 'COD-PAY-ON-DELIVERY' && (
                    <span className="font-mono font-bold text-emerald-900 bg-white/90 px-2 py-0.5 rounded border border-emerald-300 text-[11px]">
                      Ref: {selectedInvoice.paymentReference}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Order:</span>
                    <strong className="font-mono text-slate-900">AED {selectedInvoice.totalAmount.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-black block text-slate-600">COD Due at Handover:</span>
                    <strong className={`font-mono font-black text-sm ${
                      selectedInvoice.paymentStatus === 'PAID' || selectedInvoice.paymentStatus === 'PREPAID_VERIFIED' || (selectedInvoice.paymentMethod && selectedInvoice.paymentMethod !== 'COD' && selectedInvoice.paymentMethod !== 'CASH_ON_DELIVERY')
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}>
                      {selectedInvoice.paymentStatus === 'PAID' || selectedInvoice.paymentStatus === 'PREPAID_VERIFIED' || (selectedInvoice.paymentMethod && selectedInvoice.paymentMethod !== 'COD' && selectedInvoice.paymentMethod !== 'CASH_ON_DELIVERY')
                        ? 'AED 0.00'
                        : `AED ${selectedInvoice.totalAmount.toFixed(2)}`}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Bundled Items in Draft */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Bundled Vintage Pieces ({selectedInvoice.items.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Exact Gram Costing & Live Margin Relief
                  </span>
                </div>

                {/* Barcode input for bundling another piece */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Scan or enter additional Barcode/SKU to bundle into this order..."
                    value={bundleBarcodeInput}
                    onChange={e => setBundleBarcodeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBundlePiece();
                      }
                    }}
                    className="flex-1 bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                  <button
                    onClick={() => handleBundlePiece()}
                    disabled={isProcessing || !bundleBarcodeInput.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    Bundle Piece
                  </button>
                </div>

                {/* Items Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">SKU / Barcode</th>
                        <th className="px-3 py-2.5">Description</th>
                        <th className="px-3 py-2.5">Gram Cost (COGS)</th>
                        <th className="px-3 py-2.5">Selling Price</th>
                        <th className="px-3 py-2.5">Profit</th>
                        <th className="px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(selectedInvoice?.items || []).map((item, idx) => {
                        const cost = item.calculatedCostPrice || 25;
                        const price = item.finalAmount || item.unitPrice || 0;
                        const profit = price - cost;

                        return (
                          <tr key={item.id || idx} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2.5 font-mono font-bold text-indigo-600">
                              {item.barcode}
                            </td>
                            <td className="px-3 py-2.5 text-slate-900">
                              {item.description}
                              {item.weightGrams && (
                                <span className="text-[10px] text-slate-400 block">
                                  {item.weightGrams} g (AED {item.costPerGram ? item.costPerGram.toFixed(4) : '0.08'}/g)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-700">
                              AED {cost.toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-emerald-600">
                              AED {price.toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">
                              +AED {profit.toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                onClick={() => handleRemovePiece(item.barcode)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                title="Remove piece from draft"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Logistics & Courier Assignment Engine */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-indigo-600" />
                  Logistics & Courier Assignment
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Courier Partner</span>
                      <span className="text-[10px] text-indigo-600 font-bold">Registry Linked</span>
                    </label>
                    <select
                      value={selectedInvoice.courierPartner || (courierList[0]?.name ?? 'DHL Express UAE')}
                      onChange={e => {
                        const sel = courierList.find(c => c.name === e.target.value);
                        if (sel) {
                          handleUpdateLogistics({
                            courierPartner: sel.name,
                            courierPartnerId: sel.partyId,
                            courierPartyId: sel.id
                          });
                        } else {
                          handleUpdateLogistics('courierPartner', e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none font-bold text-slate-800"
                    >
                      {courierList.map(c => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name} {c.accountCode ? `(${c.accountCode})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Courier Tracking Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={selectedInvoice.trackingNumber || ''}
                        onChange={e => handleUpdateLogistics('trackingNumber', e.target.value)}
                        placeholder="e.g. ARX-AE-982104"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shipping Fee (AED)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={selectedInvoice.shippingFeeAed || 25}
                      onChange={e => handleUpdateLogistics('shippingFeeAed', Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* Shipping Charge Bearer Allocation (Company vs Customer) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shipping Charge Allocation
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      onClick={() => handleUpdateLogistics('shippingBearer', 'CUSTOMER')}
                      className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                        selectedInvoice.shippingBearer === 'CUSTOMER'
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">Borne by Customer</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          Added to invoice grand total payable by buyer
                        </div>
                      </div>
                      <input
                        type="radio"
                        checked={selectedInvoice.shippingBearer === 'CUSTOMER'}
                        readOnly
                        className="text-amber-600"
                      />
                    </label>

                    <label
                      onClick={() => handleUpdateLogistics('shippingBearer', 'COMPANY')}
                      className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                        selectedInvoice.shippingBearer === 'COMPANY'
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">Borne by Company (Free Shipping)</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          Debits Courier Operating Expense & Credits Courier Payable
                        </div>
                      </div>
                      <input
                        type="radio"
                        checked={selectedInvoice.shippingBearer === 'COMPANY'}
                        readOnly
                        className="text-amber-600"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Payment Verification Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-amber-600" />
                  Payment Verification & Customer Contact
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={selectedInvoice.paymentStatus || 'UNPAID_PENDING_COD'}
                      onChange={e => handleUpdateLogistics('paymentStatus', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value="UNPAID_PENDING_COD">Unpaid / Pending COD</option>
                      <option value="PREPAID_VERIFIED">Prepaid Verified (Bank / Card)</option>
                      <option value="PARTIAL_ADVANCE">Partial Advance Deposit</option>
                      <option value="RETURNED">Returned / Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={selectedInvoice.paymentMethod || 'COD'}
                      onChange={e => handleUpdateLogistics('paymentMethod', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-800 focus:outline-none"
                    >
                      <option value="COD">💵 Cash on Delivery (COD)</option>
                      <option value="BANK_TRANSFER">📱 Prepaid Bank Transfer / QR</option>
                      <option value="CARD_POS">💳 Online Card / POS</option>
                      <option value="CREDIT_ACCOUNT">🏢 B2B Khata Account</option>
                      <option value="CASH">💵 Cash in Advance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Buyer Contact Phone
                    </label>
                    <input
                      type="text"
                      value={selectedInvoice.customerPhone || ''}
                      onChange={e => handleUpdateLogistics('customerPhone', e.target.value)}
                      placeholder="+971 50 ..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Calculation & Posting Summary */}
              <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4 shadow-lg border border-amber-500/30">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800 text-xs">
                  <span className="text-slate-400">Subtotal ({selectedInvoice.items.length} SKUs):</span>
                  <span className="font-mono font-bold text-slate-200">
                    AED {selectedInvoice.subTotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Total Calculated COGS (Stock Cost):</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    AED{' '}
                    {(Array.isArray(selectedInvoice?.items)
                      ? selectedInvoice.items.reduce((s, it) => s + (Number(it?.calculatedCostPrice) || 25), 0)
                      : 0
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-400 font-semibold">Gross Profit Margin:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    AED {(selectedInvoice.grossProfitAed || (selectedInvoice.subTotal * 0.65)).toFixed(2)} (
                    {selectedInvoice.grossProfitPercent || 65}%)
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">
                    Shipping ({selectedInvoice.courierPartner || 'ARAMEX'} &bull;{' '}
                    {selectedInvoice.shippingBearer === 'CUSTOMER' ? 'Customer Borne' : 'Company Borne'}):
                  </span>
                  <span className="font-mono text-slate-300">
                    AED {(selectedInvoice.shippingFeeAed || 25).toFixed(2)}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-xs text-amber-300 uppercase tracking-wider font-black">
                      {selectedInvoice.paymentMethod === 'COD' ? 'Total COD Collectible at Doorstep:' : 'Grand Total Paid / Payable:'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {selectedInvoice.paymentMethod === 'COD' 
                        ? '⚡ Dispatches Account 1128 (Courier COD Receivable) & Relieves Stock COGS'
                        : '⚡ Dispatches Bank/Cash & Relieves Stock COGS'}
                    </div>
                  </div>
                  <div className="text-2xl font-mono font-black text-emerald-400">
                    AED {selectedInvoice.totalAmount.toFixed(2)}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={handleFinalizeAndPost}
                    disabled={isProcessing}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>🚀 Finalize & Dispatch Parcel (Auto-COGS & COD Entry)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Modal: Instant Live Claim & Draft Generation with Dynamic Courier Registry */}
      <LiveClaimModal
        isOpen={showNewDraftModal}
        onClose={() => setShowNewDraftModal(false)}
        availableStock={availableStock}
        onDraftCreated={(createdInv) => {
          if (createdInv?.id) {
            setSelectedInvoiceId(createdInv.id);
          }
          setFeedback({
            text: `⚡ Draft Invoice ${createdInv?.invoiceNo || ''} created! Locked to claim cart with dynamic courier assignment.`,
            type: 'success'
          });
          setShowNewDraftModal(false);
          onRefresh();
        }}
      />

      {/* Modal: Edit Parcel & Logistics & Payment */}
      {editingParcelInvoice && (
        <EditParcelLogisticsModal
          invoice={editingParcelInvoice}
          onClose={() => setEditingParcelInvoice(null)}
          onSaved={() => {
            setEditingParcelInvoice(null);
            onRefresh();
          }}
        />
      )}

      {/* Modal: 4x6 Thermal Shipping Label Slip */}
      {thermalSlipInvoice && (
        <ThermalShippingLabelModal
          invoice={thermalSlipInvoice}
          onClose={() => setThermalSlipInvoice(null)}
        />
      )}

      {/* Modal: WhatsApp Order Slip & Confirmation */}
      {whatsAppInvoice && (
        <WhatsAppOrderModal
          invoice={whatsAppInvoice}
          onClose={() => setWhatsAppInvoice(null)}
        />
      )}

      {/* Modal: Real-Time Courier COD Remittance Settlement with Bank PIN */}
      <RealTimeCourierSettlementModal
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        onSettlementSuccess={onRefresh}
      />
    </div>
  );
};

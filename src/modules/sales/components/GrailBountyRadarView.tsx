import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  Layers,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Tag
} from 'lucide-react';

interface GrailBountyItem {
  id: string;
  customer_name: string;
  customer_phone: string;
  whatsapp_phone?: string;
  desired_brand: string;
  desired_category?: string;
  desired_size?: string;
  preferred_size?: string;
  max_budget_aed?: number;
  notes?: string;
  era_notes?: string;
  status: 'OPEN' | 'MATCHED' | 'CONTACTED' | 'FULFILLED' | 'CANCELLED';
  matched_barcode?: string;
  created_at: string;
}

interface InventoryMatchPiece {
  barcode: string;
  brand_name: string;
  item_name: string;
  style: string;
  size_scanned: string;
  estimated_price: number;
  retail_price_aed: number;
  status: string;
}

export const GrailBountyRadarView: React.FC = () => {
  const [bounties, setBounties] = useState<GrailBountyItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedBounty, setSelectedBounty] = useState<GrailBountyItem | null>(null);

  // Auto-Match state
  const [matchingPieces, setMatchingPieces] = useState<InventoryMatchPiece[]>([]);
  const [isMatchingLoading, setIsMatchingLoading] = useState<boolean>(false);
  const [matchBarcodeToLink, setMatchBarcodeToLink] = useState<string>('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadBounties = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sales/grail-bounties');
      const data = await res.json();
      if (data.success && Array.isArray(data.bounties)) {
        setBounties(data.bounties);
      }
    } catch (err) {
      console.warn('Failed to load bounties:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBounties();
  }, []);

  // Filtered list
  const filteredBounties = useMemo(() => {
    return bounties.filter(b => {
      const matchesSearch =
        (b.desired_brand || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.customer_phone || '').includes(searchTerm) ||
        (b.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.era_notes || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      return true;
    });
  }, [bounties, searchTerm, statusFilter]);

  // Handle Auto-Match search for selected bounty
  const handleAutoMatch = async (bounty: GrailBountyItem) => {
    setSelectedBounty(bounty);
    setIsMatchingLoading(true);
    setMatchingPieces([]);
    setActionFeedback(null);
    try {
      const res = await fetch(
        `/api/sales/grail-bounties/auto-match?brand=${encodeURIComponent(bounty.desired_brand)}&category=${encodeURIComponent(bounty.desired_category || '')}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        setMatchingPieces(data.matches);
      }
    } catch (err) {
      console.warn('Auto match error:', err);
    } finally {
      setIsMatchingLoading(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (bountyId: string, newStatus: string, matchedCode?: string) => {
    try {
      const res = await fetch(`/api/sales/grail-bounties/${bountyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          matchedBarcode: matchedCode || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Bounty updated to ${newStatus}!`);
        loadBounties();
        if (selectedBounty && selectedBounty.id === bountyId) {
          setSelectedBounty(prev => (prev ? { ...prev, status: newStatus as any, matched_barcode: matchedCode || prev.matched_barcode } : null));
        }
      }
    } catch (err) {
      setActionFeedback('Failed to update bounty');
    }
  };

  // Format 1-Click WhatsApp URL
  const getWhatsAppUrl = (bounty: GrailBountyItem) => {
    const rawPhone = bounty.whatsapp_phone || bounty.customer_phone || '';
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `Hello ${bounty.customer_name}, your requested grail (${bounty.desired_brand} - ${bounty.preferred_size || bounty.desired_size || 'Size L'}) just arrived and was scanned from our incoming US bales at Vintage Vibes Dubai! Would you like to see photos and reserve it?`
    );
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950 text-white rounded-2xl p-5 border border-amber-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/40 shadow-inner">
            <Sparkles className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-white font-cinzel">
                Grail Bounty Radar & Sourcing Pipeline
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                LIVE DEMAND RADAR
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Collector Wishlists • Incoming Bale Auto-Match • 1-Click WhatsApp Concierge • Zero Stock Guesswork
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBounties}
            className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-bold border border-amber-500/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Demands</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Total Sourcing Demands</div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{bounties.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
          <div className="text-[11px] font-bold text-amber-800 uppercase">Open / Sourcing Now</div>
          <div className="text-2xl font-black text-amber-900 font-mono mt-1">
            {bounties.filter(b => b.status === 'OPEN').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 shadow-xs">
          <div className="text-[11px] font-bold text-indigo-800 uppercase">Matched Pieces</div>
          <div className="text-2xl font-black text-indigo-900 font-mono mt-1">
            {bounties.filter(b => b.status === 'MATCHED').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-800 uppercase">Fulfilled Orders</div>
          <div className="text-2xl font-black text-emerald-900 font-mono mt-1">
            {bounties.filter(b => b.status === 'FULFILLED').length}
          </div>
        </div>
      </div>

      {/* Main Grid: Bounties List & Detail/Match Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Bounties Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by brand, customer, phone, notes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">🟡 Open (Searching)</option>
                <option value="MATCHED">🔵 Matched in Bale</option>
                <option value="CONTACTED">🟣 Contacted Client</option>
                <option value="FULFILLED">🟢 Fulfilled / Sold</option>
                <option value="CANCELLED">⚪ Cancelled</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
            {filteredBounties.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No customer wishlist demands recorded. As collectors request grails on vintagevibesgk.com, they will stream here!
              </div>
            ) : (
              filteredBounties.map(bounty => {
                const isSelected = selectedBounty?.id === bounty.id;
                return (
                  <div
                    key={bounty.id}
                    onClick={() => handleAutoMatch(bounty)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/60 border-amber-400 shadow-md ring-1 ring-amber-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 font-cinzel">
                            {bounty.desired_brand}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              bounty.status === 'OPEN'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : bounty.status === 'MATCHED'
                                ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                : bounty.status === 'CONTACTED'
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : bounty.status === 'FULFILLED'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {bounty.status}
                          </span>
                          {bounty.preferred_size || bounty.desired_size ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              Size: {bounty.preferred_size || bounty.desired_size}
                            </span>
                          ) : null}
                        </div>

                        <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                          <strong className="text-slate-800">{bounty.customer_name}</strong>
                          <span>&bull;</span>
                          <span className="font-mono text-slate-500">
                            {bounty.whatsapp_phone || bounty.customer_phone}
                          </span>
                        </div>

                        {(bounty.notes || bounty.era_notes) && (
                          <p className="text-[11px] text-slate-500 italic mt-1.5 line-clamp-2">
                            "{bounty.era_notes || bounty.notes}"
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-slate-500 uppercase">Max Budget</div>
                        <div className="text-sm font-black font-mono text-emerald-700">
                          AED {Number(bounty.max_budget_aed || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(bounty.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <a
                          href={getWhatsAppUrl(bounty)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>1-Click WhatsApp</span>
                        </a>
                        {bounty.matched_barcode && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 font-mono text-[10px] font-bold">
                            SKU: {bounty.matched_barcode}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-amber-700 font-bold flex items-center gap-0.5">
                        <span>Check Stock Matches</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Auto-Match Inspector & Warehouse Cross-Check */}
        <div className="lg:col-span-5">
          {!selectedBounty ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs shadow-sm">
              Select any grail bounty on the left to cross-check active warehouse inventory pieces and connect with the customer.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              {/* Selected Bounty Summary */}
              <div className="pb-4 border-b border-slate-100 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider font-mono">
                      ACTIVE SOURCING TARGET
                    </span>
                    <h3 className="text-base font-black text-slate-900 font-cinzel">
                      {selectedBounty.desired_brand}
                    </h3>
                  </div>
                  <a
                    href={getWhatsAppUrl(selectedBounty)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Concierge</span>
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-slate-400 text-[10px] block">Collector</span>
                    <strong className="text-slate-800">{selectedBounty.customer_name}</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-slate-400 text-[10px] block">Max Budget</span>
                    <strong className="text-emerald-700 font-mono font-bold">
                      AED {Number(selectedBounty.max_budget_aed || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>

                {selectedBounty.notes && (
                  <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200 text-xs text-amber-950">
                    <span className="font-bold text-[10px] uppercase text-amber-800 block">Collector Notes:</span>
                    <p className="mt-0.5 italic">"{selectedBounty.notes}"</p>
                  </div>
                )}

                {/* Status Toggle Buttons */}
                <div className="pt-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Lifecycle Status:
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['OPEN', 'MATCHED', 'CONTACTED', 'FULFILLED'] as const).map(st => (
                      <button
                        key={st}
                        onClick={() => handleUpdateStatus(selectedBounty.id, st)}
                        className={`py-1.5 text-[10px] font-bold rounded-lg border transition ${
                          selectedBounty.status === st
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Warehouse Inventory Match Engine */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                    <Package className="w-4 h-4 text-amber-600" />
                    <span>In-Stock Warehouse Matches</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {matchingPieces.length} candidate pieces
                  </span>
                </div>

                {isMatchingLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
                    Searching active bales for matching {selectedBounty.desired_brand}...
                  </div>
                ) : matchingPieces.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200 space-y-2">
                    <p>No immediate stock match found in currently graded inventory.</p>
                    <p className="text-[11px] text-slate-400">
                      When the next bale is graded and tagged in Purchase module, matching items will pop up here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {matchingPieces.map(piece => (
                      <div
                        key={piece.barcode}
                        className="p-3 bg-slate-50 hover:bg-amber-50/50 rounded-xl border border-slate-200 hover:border-amber-300 transition flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{piece.brand_name} {piece.item_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            SKU: {piece.barcode} &bull; Size: {piece.size_scanned || 'L'}
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-mono font-bold text-emerald-700">
                              AED {piece.retail_price_aed || piece.estimated_price}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUpdateStatus(selectedBounty.id, 'MATCHED', piece.barcode)}
                            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold shadow-xs transition"
                          >
                            Link SKU
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

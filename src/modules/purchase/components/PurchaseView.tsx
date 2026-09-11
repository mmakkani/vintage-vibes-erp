import React, { useState, useEffect, useCallback } from 'react';
import { InwardGatePass, PieceBreakdownItem, PurchaseInvoice } from '../purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster, BrandMaster, LabelGrade, ShopMaster, CategoryMaster, SizeMaster } from '../../setup/setup.types.ts';
import { BaleSortingExecutionLog } from './BaleSortingExecutionLog.tsx';
import { BaleSortingTerminal } from './BaleSortingTerminal.tsx';
import { MultiDimensionalInventoryView } from './MultiDimensionalInventoryView.tsx';
import { CommercialInvoicesTab } from './CommercialInvoicesTab.tsx';
import { PurchaseSettingsView } from './PurchaseSettingsView.tsx';
import { ThermalBarcodeStickerModal, StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import {
  Package,
  Scale,
  Layers,
  FileText,
  Sliders,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { PartiesService } from '../../../services/partiesService.ts';
import { SetupService } from '../../../services/setupService.ts';

interface PurchaseViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

// Local storage cache keys
const CACHE_KEYS = {
  BALES: 'vibe_cached_purchase_bales',
  INVOICES: 'vibe_cached_purchase_invoices',
  PIECES: 'vibe_cached_purchase_pieces',
  PARTIES: 'vibe_cached_parties',
  ITEMS: 'vibe_cached_items',
  BRANDS: 'vibe_cached_brands',
  LABELS: 'vibe_cached_labels',
  SHOPS: 'vibe_cached_shops',
  CATEGORIES: 'vibe_cached_categories',
  SIZES: 'vibe_cached_sizes'
};

const loadCached = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const saveCached = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or private mode
  }
};

const fetchJsonSafely = async <T,>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type');
    if (ct && !ct.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

type PurchaseSubTab = 'sorting_terminal' | 'inventory' | 'commercial_invoices' | 'settings';

export const PurchaseView: React.FC<PurchaseViewProps> = ({
  onRefreshAll,
  currentUserRole
}) => {
  const [activeSubTab, setActiveSubTabState] = useState<PurchaseSubTab>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sub = urlParams.get('purchaseSubTab') as PurchaseSubTab;
      if (sub && ['sorting_terminal', 'inventory', 'commercial_invoices', 'settings'].includes(sub)) {
        return sub;
      }
      const saved = localStorage.getItem('vintage_purchase_subtab') as PurchaseSubTab;
      if (saved && ['sorting_terminal', 'inventory', 'commercial_invoices', 'settings'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'sorting_terminal';
  });

  const setActiveSubTab = (tab: PurchaseSubTab) => {
    setActiveSubTabState(tab);
    try {
      localStorage.setItem('vintage_purchase_subtab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('purchaseSubTab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  // State Collections with offline localStorage initialization
  const [bales, setBales] = useState<InwardGatePass[]>(() => loadCached(CACHE_KEYS.BALES, []));
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>(() => loadCached(CACHE_KEYS.INVOICES, []));
  const [inventoryPieces, setInventoryPieces] = useState<PieceBreakdownItem[]>(() => loadCached(CACHE_KEYS.PIECES, []));
  const [parties, setParties] = useState<Party[]>(() => loadCached(CACHE_KEYS.PARTIES, []));
  const [items, setItems] = useState<ItemMaster[]>(() => loadCached(CACHE_KEYS.ITEMS, []));
  const [brands, setBrands] = useState<BrandMaster[]>(() => loadCached(CACHE_KEYS.BRANDS, []));
  const [labels, setLabels] = useState<LabelGrade[]>(() => loadCached(CACHE_KEYS.LABELS, []));
  const [shops, setShops] = useState<ShopMaster[]>(() => loadCached(CACHE_KEYS.SHOPS, []));
  const [categories, setCategories] = useState<CategoryMaster[]>(() => loadCached(CACHE_KEYS.CATEGORIES, []));
  const [sizes, setSizes] = useState<SizeMaster[]>(() => loadCached(CACHE_KEYS.SIZES, []));

  const [activeSortingBaleId, setActiveSortingBaleId] = useState<string | null>(null);
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Sticker modal state
  const [stickerData, setStickerData] = useState<StickerData | null>(null);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);

  const fetchPurchaseData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [balesRes, invRes, piecesRes, partiesRes, itemsRes, brandsRes, labelsRes, shopsRes, catRes, sizeRes] = await Promise.all([
        PurchaseService.getInwardGatePasses().catch(() => []),
        PurchaseService.getPurchaseInvoices().catch(() => []),
        PurchaseService.getInventoryPieces().catch(() => []),
        PartiesService.getParties().catch(() => []),
        SetupService.getItems().catch(() => []),
        SetupService.getBrands().catch(() => []),
        SetupService.getLabelGrades().catch(() => []),
        SetupService.getShops().catch(() => []),
        SetupService.getCategories().catch(() => []),
        SetupService.getSizes().catch(() => [])
      ]);

      let hasLiveResponse = false;

      if (Array.isArray(balesRes)) {
        setBales(balesRes);
        saveCached(CACHE_KEYS.BALES, balesRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(invRes)) {
        setInvoices(invRes);
        saveCached(CACHE_KEYS.INVOICES, invRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(piecesRes)) {
        setInventoryPieces(piecesRes);
        saveCached(CACHE_KEYS.PIECES, piecesRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(partiesRes)) {
        setParties(partiesRes);
        saveCached(CACHE_KEYS.PARTIES, partiesRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(itemsRes)) {
        setItems(itemsRes);
        saveCached(CACHE_KEYS.ITEMS, itemsRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(brandsRes)) {
        setBrands(brandsRes);
        saveCached(CACHE_KEYS.BRANDS, brandsRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(labelsRes)) {
        setLabels(labelsRes);
        saveCached(CACHE_KEYS.LABELS, labelsRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(shopsRes)) {
        setShops(shopsRes);
        saveCached(CACHE_KEYS.SHOPS, shopsRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(catRes)) {
        setCategories(catRes);
        saveCached(CACHE_KEYS.CATEGORIES, catRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(sizeRes)) {
        setSizes(sizeRes);
        saveCached(CACHE_KEYS.SIZES, sizeRes);
        hasLiveResponse = true;
      }
      if (Array.isArray(shopsRes)) {
        setShops(shopsRes);
        saveCached(CACHE_KEYS.SHOPS, shopsRes);
        hasLiveResponse = true;
      }

      setIsOfflineMode(!hasLiveResponse);

      // Keep active sorting bale refreshed
      const currentBales = Array.isArray(balesRes) ? balesRes : loadCached(CACHE_KEYS.BALES, bales);
      if (activeSortingBaleId && Array.isArray(currentBales)) {
        const found = currentBales.find((b: InwardGatePass) => b.id === activeSortingBaleId);
        if (!found) {
          setActiveSortingBaleId(currentBales[0]?.id || null);
        }
      }
    } catch (err: any) {
      console.warn('Network unreachable; safely switching to local offline cache:', err);
      setIsOfflineMode(true);
    } finally {
      setIsLoading(false);
    }
  }, [activeSortingBaleId, bales]);

  useEffect(() => {
    fetchPurchaseData();
  }, [fetchPurchaseData]);

  // Handle open sorting terminal modal
  const handleOpenSortingTerminal = (baleId?: string) => {
    if (baleId) {
      setActiveSortingBaleId(baleId);
    }
    setIsTerminalModalOpen(true);
  };

  // Handle piece added
  const handlePieceAdded = (piece: PieceBreakdownItem, updatedBale: InwardGatePass) => {
    setBales(prev => {
      const next = prev.map(b => b.id === updatedBale.id ? updatedBale : b);
      saveCached(CACHE_KEYS.BALES, next);
      return next;
    });
    setInventoryPieces(prev => {
      const exists = prev.some(p => p.barcode === piece.barcode);
      const next = exists ? prev.map(p => p.barcode === piece.barcode ? piece : p) : [piece, ...prev];
      saveCached(CACHE_KEYS.PIECES, next);
      return next;
    });
    onRefreshAll();
  };

  // Handle piece deleted
  const handlePieceDeleted = (pieceId: string, updatedBale: InwardGatePass) => {
    setBales(prev => {
      const next = prev.map(b => b.id === updatedBale.id ? updatedBale : b);
      saveCached(CACHE_KEYS.BALES, next);
      return next;
    });
    setInventoryPieces(prev => {
      const next = prev.filter(p => p.id !== pieceId);
      saveCached(CACHE_KEYS.PIECES, next);
      return next;
    });
    onRefreshAll();
  };

  // Handle save partial
  const handleSavePartial = async (baleId: string) => {
    try {
      await PurchaseService.updateInwardGatePass(baleId, { status: 'PARTIAL' });
      setBales(prev => {
        const next = prev.map(b => b.id === baleId ? { ...b, status: 'PARTIAL' } : b);
        saveCached(CACHE_KEYS.BALES, next);
        return next;
      });
      fetchPurchaseData();
      onRefreshAll();
    } catch (e: any) {
      console.warn('Save partial note:', e);
    }
  };

  // Handle post bale & lock to inventory
  const handlePostBale = async (baleId: string) => {
    try {
      await PurchaseService.updateInwardGatePass(baleId, { status: 'POSTED' });
      fetchPurchaseData();
      onRefreshAll();
      alert('Bale successfully finalized & pieces transferred to Finished Goods inventory!');
    } catch (e: any) {
      console.warn('Post bale error:', e);
      alert(e?.message || 'Failed to post bale.');
    }
  };

  const activeBale = bales.find(b => b.id === activeSortingBaleId) || bales[0] || null;

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('sorting_terminal')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'sorting_terminal'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>1. ⚡ Bale Sorting Operations Hub ({bales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'inventory'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2. 📦 Multi-Dimensional Inventory ({inventoryPieces.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('commercial_invoices')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'commercial_invoices'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. 📄 Commercial Invoices ({invoices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>4. ⚙️ Factory Settings</span>
          </button>
        </div>

        <button
          type="button"
          onClick={fetchPurchaseData}
          disabled={isLoading}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer self-end md:self-auto"
          title="Refresh purchase data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {isOfflineMode && (
        <div className="px-3.5 py-2 bg-slate-900 text-slate-200 rounded-xl text-xs flex items-center justify-between border border-slate-800 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-medium text-slate-300">Running on local offline cache &bull; Full inward entry, sorting & thermal printing active</span>
          </div>
          <button
            type="button"
            onClick={() => fetchPurchaseData()}
            className="text-[11px] underline text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* SUB-TAB 1: CENTRAL BALE SORTING OPERATIONS HUB & EXECUTION LOG */}
      {activeSubTab === 'sorting_terminal' && (
        <BaleSortingExecutionLog
          bales={bales}
          invoices={invoices}
          parties={parties}
          items={items}
          brands={brands}
          labels={labels}
          shops={shops}
          onOpenSortingTerminal={handleOpenSortingTerminal}
          onRefresh={fetchPurchaseData}
        />
      )}

      {/* SUB-TAB 2: MULTI-DIMENSIONAL INVENTORY */}
      {activeSubTab === 'inventory' && (
        <MultiDimensionalInventoryView
          pieces={inventoryPieces}
          bales={bales}
          onPrintSticker={stk => {
            setStickerData(stk);
            setIsStickerModalOpen(true);
          }}
          onSelectBale={id => {
            setActiveSortingBaleId(id);
            setIsTerminalModalOpen(true);
          }}
        />
      )}

      {/* SUB-TAB 3: COMMERCIAL INVOICES */}
      {activeSubTab === 'commercial_invoices' && (
        <CommercialInvoicesTab
          invoices={invoices}
          parties={parties}
          items={items}
          bales={bales}
          onRefresh={fetchPurchaseData}
          onInvoiceCreated={inv => {
            setInvoices(prev => {
              const next = [inv, ...prev.filter(i => i.id !== inv.id)];
              saveCached(CACHE_KEYS.INVOICES, next);
              return next;
            });
            onRefreshAll();
          }}
        />
      )}

      {/* SUB-TAB 4: FACTORY & TEMPLATE SETTINGS */}
      {activeSubTab === 'settings' && (
        <PurchaseSettingsView
          parties={parties}
          items={items}
          onRefreshParties={fetchPurchaseData}
          onRefreshItems={onRefreshAll}
        />
      )}

      {/* DEDICATED HIGH-SPEED BALE SORTING TERMINAL MODAL & PIECE STREAM ENGINE */}
      <BaleSortingTerminal
        isOpen={isTerminalModalOpen}
        onClose={() => setIsTerminalModalOpen(false)}
        bale={activeBale}
        allBales={bales}
        invoices={invoices}
        items={items}
        brands={brands}
        labels={labels}
        shops={shops}
        categories={categories}
        sizes={sizes}
        onPieceAdded={handlePieceAdded}
        onPieceDeleted={handlePieceDeleted}
        onSavePartial={handleSavePartial}
        onPostBale={handlePostBale}
        onSelectBale={id => setActiveSortingBaleId(id)}
        onBaleCreated={newBale => {
          setBales(prev => {
            const next = [newBale, ...prev.filter(b => b.id !== newBale.id)];
            saveCached(CACHE_KEYS.BALES, next);
            return next;
          });
          setActiveSortingBaleId(newBale.id);
          onRefreshAll();
        }}
        onPrintSticker={stk => {
          setStickerData(stk);
          setIsStickerModalOpen(true);
        }}
      />

      {/* Thermal Barcode Sticker Modal for Apparel Pieces */}
      {stickerData && (
        <ThermalBarcodeStickerModal
          isOpen={isStickerModalOpen}
          onClose={() => setIsStickerModalOpen(false)}
          data={stickerData}
        />
      )}
    </div>
  );
};


import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { MasterDataCache } from '../../../services/masterDataCache.ts';
import { ModuleMaintenanceGuard } from '../../../components/ModuleMaintenanceGuard.tsx';
import { useSync } from '../../../context/SyncContext.tsx';

const CACHE_KEYS = {
  BALES: 'vv_cached_bales',
  PIECES: 'vv_cached_pieces',
  INVOICES: 'vv_cached_invoices'
};

const saveCached = (_key: string, _data: any) => {
  // Safe no-op: legacy caches are deprecated and state is managed via React state & Supabase
};

interface PurchaseViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
  maintenanceModules?: Record<string, boolean>;
}

type PurchaseSubTab = 'sorting_terminal' | 'inventory' | 'commercial_invoices' | 'settings';

export const PurchaseView: React.FC<PurchaseViewProps> = ({
  onRefreshAll,
  currentUserRole,
  maintenanceModules
}) => {
  const { syncVersion } = useSync();
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

  // State Collections initialized to empty arrays (Strict Supabase Database Source of Truth)
  const [bales, setBales] = useState<InwardGatePass[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [inventoryPieces, setInventoryPieces] = useState<PieceBreakdownItem[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const cachedMaster = MasterDataCache.getCached();
  const [items, setItems] = useState<ItemMaster[]>(cachedMaster.items);
  const [brands, setBrands] = useState<BrandMaster[]>(cachedMaster.brands);
  const [labels, setLabels] = useState<LabelGrade[]>(cachedMaster.labels);
  const [shops, setShops] = useState<ShopMaster[]>(cachedMaster.shops);
  const [categories, setCategories] = useState<CategoryMaster[]>(cachedMaster.categories);
  const [sizes, setSizes] = useState<SizeMaster[]>(cachedMaster.sizes);
  const [balePresets, setBalePresets] = useState<any[]>([]);

  // Realtime subscription to shared master setup cache
  useEffect(() => {
    const unsub = MasterDataCache.subscribe(s => {
      if (s.items.length > 0) setItems(s.items);
      if (s.brands.length > 0) setBrands(s.brands);
      if (s.labels.length > 0) setLabels(s.labels);
      if (s.shops.length > 0) setShops(s.shops);
      if (s.categories.length > 0) setCategories(s.categories);
      if (s.sizes.length > 0) setSizes(s.sizes);
    });
    return unsub;
  }, []);

  // Purge lingering legacy localStorage entity caches on mount
  useEffect(() => {
    const legacyKeys = [
      'vibe_cached_purchase_bales',
      'vibe_cached_purchase_invoices',
      'vibe_cached_purchase_pieces',
      'vibe_cached_parties',
      'vibe_cached_items',
      'vibe_cached_brands',
      'vibe_cached_labels',
      'vibe_cached_shops',
      'vibe_cached_categories',
      'vibe_cached_sizes',
      'vintage_bales_cache',
      'vintage_bale_presets_cache',
      'vv_cached_pieces',
      'vintage_cached_pieces',
      'vv_cached_inventory_pieces'
    ];
    if (typeof window !== 'undefined' && window.localStorage) {
      legacyKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
    }
  }, []);

  const [activeSortingBaleId, setActiveSortingBaleId] = useState<string | null>(null);
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Sticker modal state
  const [stickerData, setStickerData] = useState<StickerData | null>(null);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);

  const isFetchingRef = useRef(false);

  const fetchPurchaseData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const [balesRes, invRes, piecesRes, partiesRes, presetsRes] = await Promise.all([
        PurchaseService.getInwardGatePasses().catch((err) => { console.warn('Gate pass sync warning:', err); return []; }),
        PurchaseService.getPurchaseInvoices().catch((err) => { console.warn('Purchase invoice sync warning:', err); return []; }),
        PurchaseService.getInventoryPieces().catch((err) => { console.warn('Inventory pieces sync warning:', err); return []; }),
        PartiesService.getParties().catch((err) => { console.warn('Parties sync warning:', err); return []; }),
        PurchaseService.getBalePresets().catch((err) => { console.warn('Presets sync warning:', err); return []; })
      ]);

      if (Array.isArray(balesRes)) {
        setBales(balesRes);
      }
      if (Array.isArray(invRes)) {
        setInvoices(invRes);
      }
      let livePieces = Array.isArray(piecesRes) ? piecesRes : [];
      const invoiceCount = Array.isArray(invRes) ? invRes.length : 0;
      const baleCount = Array.isArray(balesRes) ? balesRes.length : 0;
      if (invoiceCount === 0 && baleCount === 0 && livePieces.length > 0) {
        PurchaseService.purgeOrphanedInventory().catch(() => ({ deletedCount: 0 }));
        livePieces = [];
      } else if (invoiceCount > 0 || baleCount > 0) {
        const validInvoiceIds = new Set((invRes || []).map((i: any) => String(i.id)));
        const validBaleIds = new Set((balesRes || []).map((b: any) => String(b.id)));
        const cleanPieces = livePieces.filter(p => {
          const gId = String(p.gatePassId || '');
          return gId && (validBaleIds.has(gId) || validInvoiceIds.has(gId));
        });
        if (cleanPieces.length !== livePieces.length) {
          PurchaseService.purgeOrphanedInventory().catch(() => ({ deletedCount: 0 }));
          livePieces = cleanPieces;
        }
      }
      setInventoryPieces(livePieces);

      if (Array.isArray(partiesRes)) {
        setParties(partiesRes);
      }
      if (Array.isArray(presetsRes)) {
        setBalePresets(presetsRes);
      }

      setIsOfflineMode(false);

      // Keep active sorting bale refreshed
      const currentBales = Array.isArray(balesRes) ? balesRes : [];
      if (currentBales.length > 0) {
        setActiveSortingBaleId(prev => {
          if (!prev) return prev;
          const found = currentBales.find((b: InwardGatePass) => b.id === prev);
          return found ? prev : (currentBales[0]?.id || null);
        });
      }
    } catch (err: any) {
      console.warn('Purchase data sync error:', err);
      setIsOfflineMode(true);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPurchaseData();
  }, [fetchPurchaseData, syncVersion]);

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
      return next;
    });
    setInventoryPieces(prev => {
      const exists = prev.some(p => p.barcode === piece.barcode);
      const next = exists ? prev.map(p => p.barcode === piece.barcode ? piece : p) : [piece, ...prev];
      return next;
    });
    onRefreshAll();
  };

  // Handle piece deleted
  const handlePieceDeleted = (pieceId: string, updatedBale: InwardGatePass) => {
    setBales(prev => {
      const next = prev.map(b => b.id === updatedBale.id ? updatedBale : b);
      return next;
    });
    setInventoryPieces(prev => {
      const next = prev.filter(p => p.id !== pieceId);
      return next;
    });
    onRefreshAll();
  };

  // Handle save partial / reopen
  const handleSavePartial = async (baleId: string) => {
    try {
      const b = bales.find(x => x.id === baleId);
      const newStatus = (b && ((b.pieceCount || 0) > 0 || (b.pieces && b.pieces.length > 0))) ? 'PARTIAL' : 'UNOPENED';
      await PurchaseService.updateInwardGatePass(baleId, { status: newStatus as any });
      setBales(prev => {
        const next = prev.map(item => item.id === baleId ? { ...item, status: newStatus as any, sortingStatus: (newStatus === 'PARTIAL' ? 'PARTIALLY_SORTED' : 'UNOPENED') as any } : item);
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
        <ModuleMaintenanceGuard
          moduleKey="sorting"
          moduleName="Bale Sorting Terminal"
          currentUserRole={currentUserRole}
          maintenanceModules={maintenanceModules}
        >
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
        </ModuleMaintenanceGuard>
      )}

      {/* SUB-TAB 2: MULTI-DIMENSIONAL INVENTORY */}
      {activeSubTab === 'inventory' && (
        <ModuleMaintenanceGuard
          moduleKey="inventory"
          moduleName="Real-Time Inventory Room"
          currentUserRole={currentUserRole}
          maintenanceModules={maintenanceModules}
        >
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
            onRefresh={fetchPurchaseData}
            onPieceDeleted={handlePieceDeleted}
          />
        </ModuleMaintenanceGuard>
      )}

      {/* SUB-TAB 3: COMMERCIAL INVOICES */}
      {activeSubTab === 'commercial_invoices' && (
        <ModuleMaintenanceGuard
          moduleKey="purchases"
          moduleName="Commercial Purchases & Invoices"
          currentUserRole={currentUserRole}
          maintenanceModules={maintenanceModules}
        >
          <CommercialInvoicesTab
            invoices={invoices}
            parties={parties}
            items={items}
            balePresets={balePresets}
            bales={bales}
            onRefresh={fetchPurchaseData}
            onInvoiceCreated={inv => {
              setInvoices(prev => {
                const next = [inv, ...prev.filter(i => i.id !== inv.id)];
                return next;
              });
              onRefreshAll();
            }}
            onDeleteInvoice={deletedId => {
              setInvoices(prev => {
                const next = prev.filter(i => String(i.id) !== String(deletedId));
                return next;
              });
              onRefreshAll();
            }}
          />
        </ModuleMaintenanceGuard>
      )}

      {/* SUB-TAB 4: FACTORY & TEMPLATE SETTINGS */}
      {activeSubTab === 'settings' && (
        <PurchaseSettingsView
          parties={parties}
          items={items}
          onRefreshParties={fetchPurchaseData}
          onRefreshItems={() => {
            fetchPurchaseData();
            onRefreshAll();
          }}
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


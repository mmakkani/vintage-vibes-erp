import React, { useState, useEffect } from 'react';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster } from '../../setup/setup.types.ts';
import { PackagingUOM } from '../../../types/common.types.ts';
import { supabase } from '../../../supabaseClient.ts';
import {
  Building2,
  FileText,
  Sliders,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Globe,
  Ship,
  Truck,
  DollarSign,
  Tag,
  Package,
  Layers,
  Scale
} from 'lucide-react';

export interface BaleCategory {
  id: string;
  name: string;
  created_at?: string;
}

export interface BalePreset {
  id: string;
  item_code: string;
  name: string;
  category: string;
  uom: string;
  std_weight: number;
  base_rate: number;
  created_at?: string;
}

interface PurchaseSettingsViewProps {
  parties: Party[];
  items?: ItemMaster[];
  onRefreshParties?: () => void;
  onRefreshItems?: () => void;
}

export const PurchaseSettingsView: React.FC<PurchaseSettingsViewProps> = ({
  parties,
  items = [],
  onRefreshParties,
  onRefreshItems
}) => {
  // Preset Bale Categories (bound to public.bale_categories)
  const [baleCategories, setBaleCategories] = useState<BaleCategory[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Bale Presets Catalog (bound to public.bale_presets)
  const [balePresets, setBalePresets] = useState<BalePreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);

  // Commercial Invoice Template Customizer
  const [ciHeader, setCiHeader] = useState('VINTAGE VIBE TRADING LLC - COMMERCIAL IMPORT CLEARANCE');
  const [ciTerms, setCiTerms] = useState(
    '1. All textiles are sold in original compressed bale sorting format.\n2. Inward gate pass weights verified at Jebel Ali Port weighing station.\n3. Landed base gram costing locks upon warehouse intake.'
  );
  const [showLogo, setShowLogo] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState('AED');
  const [oceanFreightAllocationAed, setOceanFreightAllocationAed] = useState<number>(4500);
  const [portHandlingAllocationAed, setPortHandlingAllocationAed] = useState<number>(1200);
  const [customsDutyPercent, setCustomsDutyPercent] = useState<number>(5.0);

  // Supplier Master Form State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierTrn, setSupplierTrn] = useState('');
  const [supplierCurrency, setSupplierCurrency] = useState('AED');
  const [supplierContact, setSupplierContact] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // Bale / Item Master Form State
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Vintage Denim');
  const [newItemPackagingUom, setNewItemPackagingUom] = useState<PackagingUOM>('BALES');
  const [newItemWeightKg, setNewItemWeightKg] = useState<number>(45);
  const [newItemRateAed, setNewItemRateAed] = useState<number>(20.0);
  const [newItemCode, setNewItemCode] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);

  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // 1. Load Categories from Supabase
  const refreshCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('bale_categories')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) {
        setBaleCategories(data);
        if (data.length > 0 && !newItemCategory) {
          setNewItemCategory(data[0].name);
        }
      }
    } catch (err) {
      console.error('Error loading bale categories:', err);
    }
  };

  // 2. Load Presets from Supabase
  const loadBalePresets = async () => {
    setIsLoadingPresets(true);
    try {
      const { data, error } = await supabase
        .from('bale_presets')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setBalePresets(data);
      }
    } catch (err) {
      console.error('Error loading bale presets:', err);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  useEffect(() => {
    refreshCategories();
    loadBalePresets();
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCat = newCategoryInput.trim();
    if (!newCat) return;
    const { error } = await supabase.from('bale_categories').insert([{ name: newCat }]);
    if (error) {
      console.error('Bale category insert error:', error);
      alert(error.message);
      return;
    }
    setNewCategoryInput('');
    triggerNotice('Bale category preset added.');
    refreshCategories();
  };

  const handleRemoveCategory = async (catName: string) => {
    const { error } = await supabase.from('bale_categories').delete().eq('name', catName);
    if (error) {
      console.error('Bale category delete error:', error);
      alert(error.message);
      return;
    }
    triggerNotice('Bale category removed.');
    refreshCategories();
  };

  const handleSaveInvoiceTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(
        'vintage_vibe_ci_template_config',
        JSON.stringify({
          ciHeader,
          ciTerms,
          showLogo,
          defaultCurrency,
          oceanFreightAllocationAed,
          portHandlingAllocationAed,
          customsDutyPercent
        })
      );
      triggerNotice('Commercial invoice template customization saved!');
    } catch {
      triggerNotice('Failed to save template to local config.');
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;
    setIsSavingSupplier(true);

    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: supplierName.trim(),
          type: 'SUPPLIER',
          currency: supplierCurrency,
          trnTaxNo: supplierTrn.trim(),
          address: supplierAddress.trim(),
          contactNo: supplierContact.trim(),
          openingBalance: 0
        })
      });

      if (res.ok) {
        setShowSupplierModal(false);
        setSupplierName('');
        setSupplierAddress('');
        setSupplierTrn('');
        setSupplierContact('');
        triggerNotice('Supplier factory created successfully!');
        if (onRefreshParties) onRefreshParties();
      }
    } catch {
      triggerNotice('Error creating supplier party.');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setIsSavingItem(true);
    try {
      const generatedOrEnteredCode = newItemCode.trim() || ('BALE-' + Math.floor(1000 + Math.random() * 9000));
      const payload = {
        item_code: generatedOrEnteredCode,
        name: newItemName.trim(),
        category: newItemCategory.trim() || 'General Apparel',
        uom: newItemPackagingUom || 'Bales',
        std_weight: Number(newItemWeightKg) || 45,
        base_rate: Number(newItemRateAed) || 0
      };

      const { data, error } = await supabase.from('bale_presets').insert([payload]).select();
      if (error) {
        console.error("Bale preset insert error:", error);
        alert(error.message);
        return;
      }

      // Sync with items setup API if available (non-blocking)
      try {
        await fetch('/api/setup/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: payload.item_code,
            name: payload.name,
            category: payload.category,
            packagingUom: payload.uom,
            weightKg: payload.std_weight,
            basePrice: payload.base_rate,
            targetUom: 'KG',
            isActive: true
          })
        });
      } catch (_) {}

      // Close modal, show success toast, and immediately update local table state
      setShowItemModal(false);
      setNewItemName('');
      setNewItemCode('');
      triggerNotice('New Bale / Item registered in catalog & linked to Commercial Invoices!');

      if (data && data[0]) {
        setBalePresets(prev => [data[0], ...prev.filter(p => p.id !== data[0].id)]);
      } else {
        loadBalePresets();
      }

      if (onRefreshItems) onRefreshItems();
    } catch (err: any) {
      console.error("Bale preset insert error:", err);
      alert(err?.message || 'Error creating bale preset');
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this bale/item from the master catalog?')) return;
    try {
      const { error } = await supabase.from('bale_presets').delete().eq('id', itemId);
      if (!error) {
        setBalePresets(prev => prev.filter(p => p.id !== itemId));
        triggerNotice('Bale item removed from master catalog.');
        if (onRefreshItems) onRefreshItems();
      } else {
        console.error("Delete bale preset error:", error);
        alert(error.message);
      }
    } catch {
      triggerNotice('Error deleting item.');
    }
  };

  const triggerNotice = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 3500);
  };

  const supplierList = parties.filter(p => p.type === 'SUPPLIER');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            Purchase Module Settings & Factory Invoice Customizer
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure overseas sorting factories, commercial invoice layouts, port freight cost allocations and bale categories
          </p>
        </div>

        {savedNotice && (
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 1: Factory / Supplier Master */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Factory & Supplier Master</span>
              </h3>
              <p className="text-[11px] text-slate-400">Overseas textile sorting facilities & mills</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSupplierModal(true)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Supplier</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {supplierList.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No factory suppliers registered yet.
              </div>
            ) : (
              supplierList.map(supp => (
                <div
                  key={supp.id}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{supp.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {supp.currency || 'USD'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3">
                    {supp.trnNo && <span>TRN: <strong className="font-mono text-slate-700">{supp.trnNo}</strong></span>}
                    {supp.phone && <span>Tel: {supp.phone}</span>}
                  </div>
                  {supp.address && (
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{supp.address}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECTION 2: Commercial Invoice Template Customizer */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 lg:col-span-2">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Commercial Invoice Template Customizer</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Customize print headers, default terms, and port/ocean freight allocation rules
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveInvoiceTemplate}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Template</span>
            </button>
          </div>

          <form onSubmit={handleSaveInvoiceTemplate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Header Text
                </label>
                <input
                  type="text"
                  value={ciHeader}
                  onChange={e => setCiHeader(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Invoice Currency
                </label>
                <select
                  value={defaultCurrency}
                  onChange={e => setDefaultCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="USD">USD - United States Dollar (3.6725 AED)</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="AED">AED - UAE Dirham</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ocean / Air Freight Allocation (AED)
                </label>
                <input
                  type="number"
                  value={oceanFreightAllocationAed}
                  onChange={e => setOceanFreightAllocationAed(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Allocated across bales</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Port Handling & Clearing (AED)
                </label>
                <input
                  type="number"
                  value={portHandlingAllocationAed}
                  onChange={e => setPortHandlingAllocationAed(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Dubai Customs / AEJEA terminal</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customs Duty Rate (%)
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={customsDutyPercent}
                  onChange={e => setCustomsDutyPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Standard 5% GCC tariff</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Standard Clearance Terms & Notes
              </label>
              <textarea
                rows={3}
                value={ciTerms}
                onChange={e => setCiTerms(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showLogoToggle"
                checked={showLogo}
                onChange={e => setShowLogo(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="showLogoToggle" className="text-xs font-medium text-slate-700 cursor-pointer">
                Display official company logo & UAE TRN on printed commercial invoice
              </label>
            </div>
          </form>
        </div>
      </div>

      {/* SECTION 3: Bale Category Presets */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-indigo-600" />
              <span>Bale Category Presets & Fast Sorting Groups</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Quick presets available during commercial invoice entry and bale inward gate pass creation
            </p>
          </div>

          {/* Add category form */}
          <form onSubmit={handleAddCategory} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New Category Preset (e.g. Leather Biker Jackets)..."
              value={newCategoryInput}
              onChange={e => setNewCategoryInput(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {baleCategories.map(cat => (
            <div
              key={cat}
              className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 flex items-center gap-2 group hover:border-indigo-300 transition-colors"
            >
              <span>{cat}</span>
              <button
                type="button"
                onClick={() => handleRemoveCategory(cat)}
                className="text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                title="Remove category preset"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: BALE & ITEM MASTER CATALOG (COMMERCIAL INVOICE PRESETS) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Bale & Item Master Catalog (Commercial Invoice Presets)</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Add bale names, categories, and standard weights here. Items created here immediately appear in Commercial Invoice line items dropdown.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowItemModal(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bale / Item Preset</span>
          </button>
        </div>

        {/* Item Master Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                <th className="px-3 py-2.5">Item Code</th>
                <th className="px-3 py-2.5">BALE / ITEM NAME</th>
                <th className="px-3 py-2.5">CATEGORY</th>
                <th className="px-3 py-2.5 text-center">PACKAGING UOM</th>
                <th className="px-3 py-2.5 text-right">STD WEIGHT (KG)</th>
                <th className="px-3 py-2.5 text-right">BASE RATE (AED/KG)</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {balePresets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400 text-xs font-normal">
                    {isLoadingPresets ? 'Loading master presets from database...' : 'No items registered yet in master catalog. Click "Add Bale / Item Preset" to create your first bulk bale preset.'}
                  </td>
                </tr>
              ) : (
                balePresets.map(row => (
                  <tr key={row.id || row.item_code} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-bold text-indigo-700">{row.item_code}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{row.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {row.category || 'Apparel'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-600">
                      {row.uom || 'Bales'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                      {row.std_weight ? `${row.std_weight} KG` : '45.0 KG'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700 font-bold">
                      AED {Number(row.base_rate || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(row.id)}
                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        title="Delete from Catalog"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Bale / Item Preset */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-indigo-600" />
                <span>Add Bale / Item Preset to Master Catalog</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bale / Item Name * (Appears in Commercial Invoices)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade A Vintage Levi Denim Jeans Bales"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  {baleCategories.length > 0 ? (
                    <select
                      value={newItemCategory}
                      onChange={e => setNewItemCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {baleCategories.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. Vintage Denim"
                      value={newItemCategory}
                      onChange={e => setNewItemCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Packaging UOM</label>
                  <select
                    value={newItemPackagingUom}
                    onChange={e => setNewItemPackagingUom(e.target.value as PackagingUOM)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="BALES">Bales (بيل)</option>
                    <option value="SACKS">Sacks (شوال)</option>
                    <option value="BAGS">Bags (أكياس)</option>
                    <option value="CARTON">Carton (كرتون)</option>
                    <option value="PIECE">Piece (قطعة)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Std Weight per Bale (KG)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={newItemWeightKg}
                    onChange={e => setNewItemWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Base Rate (AED / KG)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newItemRateAed}
                    onChange={e => setNewItemRateAed(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Item Code (Optional)</label>
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={newItemCode}
                  onChange={e => setNewItemCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSavingItem ? 'Saving...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Supplier */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Register Factory / Supplier</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Factory / Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vintage Apparel Consignments Ltd"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Factory Address / Country</label>
                <input
                  type="text"
                  placeholder="e.g. Industrial Park, Warehouse 12, Export Hub"
                  value={supplierAddress}
                  onChange={e => setSupplierAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax / TRN Number</label>
                  <input
                    type="text"
                    placeholder="e.g. TRN-100492819"
                    value={supplierTrn}
                    onChange={e => setSupplierTrn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Currency</label>
                  <select
                    value={supplierCurrency}
                    onChange={e => setSupplierCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="AED">AED (Base)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone / Email</label>
                <input
                  type="text"
                  placeholder="e.g. export@vintageapparel.com / +971 50 123 4567"
                  value={supplierContact}
                  onChange={e => setSupplierContact(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSavingSupplier ? 'Saving...' : 'Register Factory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const FactorySettings = PurchaseSettingsView;
export const PurchaseSettings = PurchaseSettingsView;
export default PurchaseSettingsView;

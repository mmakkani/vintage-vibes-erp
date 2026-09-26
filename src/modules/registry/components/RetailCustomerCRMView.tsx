import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  Wallet,
  Building2,
  ShoppingBag,
  ArrowRightLeft,
  Crown,
  Globe,
  Store,
  LayoutGrid,
  List,
  Filter
} from 'lucide-react';
import { CrmService, CrmRetailCustomer } from '../../../services/crmService.ts';
import { NewRetailCustomerModal } from '../../parties/components/NewRetailCustomerModal.tsx';
import { RetailCustomerStatementModal } from '../../parties/components/RetailCustomerStatementModal.tsx';
import { AdjustWalletModal } from './AdjustWalletModal.tsx';

export const RetailCustomerCRMView: React.FC = () => {
  const [customers, setCustomers] = useState<CrmRetailCustomer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'ONLINE' | 'POS'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RETAIL' | 'B2B'>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [showStatementModal, setShowStatementModal] = useState<boolean>(false);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CrmRetailCustomer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);
  const [updatingTypeId, setUpdatingTypeId] = useState<string | null>(null);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await CrmService.getCrmCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error('[RetailCustomerCRMView] Error loading crm_retail_customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const openStatement = async (cust: CrmRetailCustomer) => {
    setSelectedCustomer(cust);
    setShowStatementModal(true);
    setIsLoadingStatement(true);
    try {
      const invs = await CrmService.getCustomerInvoices(cust.id, cust.phone, cust.name);
      setCustomerInvoices(invs || []);
    } catch (err) {
      console.warn('Failed to load customer statement:', err);
      setCustomerInvoices([]);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  const handleToggleCustomerType = async (cust: CrmRetailCustomer) => {
    const isCurrentB2B = cust.customer_type === 'B2B_RESELLER';
    const newType = isCurrentB2B ? 'RETAIL' : 'B2B_RESELLER';
    setUpdatingTypeId(cust.id);
    try {
      await CrmService.updateCustomerType(cust.id, newType);
      setCustomers(prev =>
        prev.map(c =>
          c.id === cust.id
            ? {
                ...c,
                customer_type: newType,
                party_type: newType,
                coa_account_id: newType === 'B2B_RESELLER' ? '1130-01' : '1130-05'
              }
            : c
        )
      );
    } catch (err) {
      console.error('Failed to update customer type:', err);
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const openWalletModal = (cust: CrmRetailCustomer) => {
    setSelectedCustomer(cust);
    setShowWalletModal(true);
  };

  const filtered = customers.filter(c => {
    const isOnline = Boolean(c.auth_id);
    if (sourceFilter === 'ONLINE' && !isOnline) return false;
    if (sourceFilter === 'POS' && isOnline) return false;
    if (typeFilter === 'B2B' && c.customer_type !== 'B2B_RESELLER') return false;
    if (typeFilter === 'RETAIL' && c.customer_type === 'B2B_RESELLER') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.customer_type && c.customer_type.toLowerCase().includes(q))
    );
  });

  const totalOrders = customers.reduce((s, c) => s + (Number(c.totalOrders || c.total_orders) || 0), 0);
  const totalSpent = customers.reduce((s, c) => s + (Number(c.totalSpent || c.total_spent) || 0), 0);
  const totalB2B = customers.filter(c => c.customer_type === 'B2B_RESELLER').length;
  const totalOnline = customers.filter(c => Boolean(c.auth_id)).length;
  const totalPOS = customers.filter(c => !c.auth_id).length;
  const totalWalletLiability = customers.reduce((s, c) => s + (Number(c.wallet_balance || c.walletBalance) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Banner & Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">🛍️</span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Retail Customer CRM & Omnichannel 2.0 Command Center
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                COA: 1130-05 Walk-In • 1130-01 Wholesale
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 rounded-full border border-amber-200">
                COA: 2150-01 Store Credit Wallets
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Omnichannel bridge connects Online signups (<code className="font-mono text-blue-700 bg-blue-50 px-1 rounded">auth.users</code>) and POS visitors strictly in <code className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded">crm_retail_customers</code>. Core accounting & parties table remain completely insulated.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition cursor-pointer self-start md:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Retail Customer</span>
          </button>
        </div>

        {/* Search, Filters & View Mode Toolbar */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, phone, email, or code..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-emerald-600 text-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Source Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <span className="text-[10px] text-slate-400 font-bold uppercase px-1.5 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Source:</span>
              </span>
              <button
                type="button"
                onClick={() => setSourceFilter('ALL')}
                className={`px-2 py-0.5 rounded text-xs transition cursor-pointer ${
                  sourceFilter === 'ALL' ? 'bg-white text-slate-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('ONLINE')}
                className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                  sourceFilter === 'ONLINE' ? 'bg-blue-600 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-blue-700'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>Online ({totalOnline})</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('POS')}
                className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                  sourceFilter === 'POS' ? 'bg-slate-700 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Store className="w-3 h-3" />
                <span>POS ({totalPOS})</span>
              </button>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <span className="text-[10px] text-slate-400 font-bold uppercase px-1.5">Type:</span>
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-0.5 rounded text-xs transition cursor-pointer ${
                  typeFilter === 'ALL' ? 'bg-white text-slate-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('RETAIL')}
                className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                  typeFilter === 'RETAIL' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <ShoppingBag className="w-3 h-3" />
                <span>Retail</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('B2B')}
                className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                  typeFilter === 'B2B' ? 'bg-purple-600 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                <Building2 className="w-3 h-3" />
                <span>B2B ({totalB2B})</span>
              </button>
            </div>
          </div>

          {/* View Mode Toggle & Metrics */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Table View (Columns: Source, Type, Wallet, Actions)"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Card Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Aggregate Metrics */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs font-semibold text-slate-500 flex-wrap">
          <span>Total Customers: <strong className="text-slate-800">{customers.length}</strong></span>
          <span>•</span>
          <span>Online Users: <strong className="text-blue-700">{totalOnline}</strong></span>
          <span>•</span>
          <span>POS Walk-Ins: <strong className="text-slate-700">{totalPOS}</strong></span>
          <span>•</span>
          <span>B2B Resellers: <strong className="text-purple-700">{totalB2B}</strong></span>
          <span>•</span>
          <span>Total Orders: <strong className="text-indigo-700">{totalOrders}</strong></span>
          <span>•</span>
          <span>Total Sales: <strong className="text-emerald-700">AED {totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span>•</span>
          <span>Wallet Liabilities (2150-01): <strong className="text-amber-700 font-mono">AED {totalWalletLiability.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
        </div>
      </div>

      {/* Loading & Empty States */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading retail CRM customers...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Customers Found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || sourceFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'No retail customers match your active search and filter criteria.'
              : 'Register your first retail customer or scan a visiting card in POS Terminal.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (Requirement 3: Columns for Source, Type, Wallet Balance, Promote to B2B, Adjust Wallet) */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Customer & Contact</th>
                  <th className="py-3 px-3">Source</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3 text-right">Orders / Sales</th>
                  <th className="py-3 px-3 text-right">Wallet Balance</th>
                  <th className="py-3 px-4 text-center">Omnichannel Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map(cust => {
                  const ordersCount = Number(cust.totalOrders || cust.total_orders || 0);
                  const spentAmt = Number(cust.totalSpent || cust.total_spent || 0);
                  const walletBal = Number(cust.wallet_balance ?? cust.walletBalance ?? 0);
                  const isB2B = cust.customer_type === 'B2B_RESELLER';
                  const isOnline = Boolean(cust.auth_id);
                  const isUpdatingType = updatingTypeId === cust.id;

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Customer & Contact */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs shrink-0 border ${
                            isB2B
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}>
                            {cust.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{cust.name}</span>
                              <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-100">
                                {cust.code}
                              </span>
                              {cust.vip_tier && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-1 rounded border border-amber-200 flex items-center gap-0.5">
                                  <Crown className="w-2.5 h-2.5 text-amber-600" />
                                  <span>{cust.vip_tier}</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                              {cust.email && <span className="text-slate-600">{cust.email}</span>}
                              {cust.phone && (
                                <a
                                  href={`https://wa.me/${cust.phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:underline flex items-center gap-0.5 font-medium"
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{cust.phone}</span>
                                </a>
                              )}
                              {cust.address && (
                                <span className="text-slate-400 truncate max-w-[150px]">• {cust.address}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Source Column: Online vs POS */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Globe className="w-3 h-3 text-blue-600" />
                            <span>Online</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <Store className="w-3 h-3 text-slate-500" />
                            <span>POS Counter</span>
                          </span>
                        )}
                      </td>

                      {/* Type Column: Retail vs B2B Reseller */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isB2B ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                            <Building2 className="w-3 h-3 text-purple-700" />
                            <span>B2B Reseller</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShoppingBag className="w-3 h-3 text-emerald-600" />
                            <span>Retail</span>
                          </span>
                        )}
                      </td>

                      {/* Orders & Sales */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 font-mono">
                          AED {spentAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold">
                          {ordersCount} {ordersCount === 1 ? 'sale' : 'sales'}
                        </div>
                      </td>

                      {/* Wallet Balance Column */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="font-mono font-black text-amber-900 text-sm">
                          AED {walletBal.toFixed(2)}
                        </div>
                        <div className="text-[9px] font-mono text-amber-700/80">
                          COA 2150-01
                        </div>
                      </td>

                      {/* Omnichannel Actions: Promote to B2B & Adjust Wallet Balance */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {/* Promote to B2B Reseller / Demote to Retail Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleCustomerType(cust)}
                            disabled={isUpdatingType}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                              isB2B
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
                            }`}
                            title={isB2B ? 'Click to revert to Retail Customer' : 'Click to promote to B2B Reseller'}
                          >
                            {isUpdatingType ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isB2B ? (
                              <>
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>Demote to Retail</span>
                              </>
                            ) : (
                              <>
                                <Building2 className="w-3 h-3" />
                                <span>Promote to B2B Reseller</span>
                              </>
                            )}
                          </button>

                          {/* Adjust Wallet Balance Button */}
                          <button
                            type="button"
                            onClick={() => openWalletModal(cust)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-300 transition shadow-2xs cursor-pointer"
                            title="Add or deduct store credit wallet balance (COA 2150-01)"
                          >
                            <Wallet className="w-3 h-3" />
                            <span>Adjust Wallet Balance</span>
                          </button>

                          {/* Customer Statement / Khata History */}
                          <button
                            type="button"
                            onClick={() => openStatement(cust)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 transition cursor-pointer"
                            title="View Customer Khata Statement"
                          >
                            <FileText className="w-3 h-3" />
                            <span className="hidden sm:inline">Statement</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARD GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(cust => {
            const ordersCount = Number(cust.totalOrders || cust.total_orders || 0);
            const spentAmt = Number(cust.totalSpent || cust.total_spent || 0);
            const walletBal = Number(cust.wallet_balance ?? cust.walletBalance ?? 0);
            const isB2B = cust.customer_type === 'B2B_RESELLER';
            const isOnline = Boolean(cust.auth_id);
            const isUpdatingType = updatingTypeId === cust.id;

            return (
              <div
                key={cust.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-lg font-bold flex items-center justify-center text-xs border ${
                        isB2B
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {cust.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{cust.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                            {cust.code}
                          </span>
                          {/* Source badge */}
                          {isOnline ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Globe className="w-2.5 h-2.5" />
                              <span>Online</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <Store className="w-2.5 h-2.5" />
                              <span>POS</span>
                            </span>
                          )}
                          {/* Type badge */}
                          {isB2B ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                              <Building2 className="w-2.5 h-2.5" />
                              <span>B2B</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <ShoppingBag className="w-2.5 h-2.5" />
                              <span>Retail</span>
                            </span>
                          )}
                          {cust.vip_tier && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5 text-amber-600" />
                              <span>{cust.vip_tier}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100">
                    {cust.email && (
                      <div className="text-[11px] text-slate-600 truncate">{cust.email}</div>
                    )}
                    {cust.phone ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{cust.phone}</span>
                        </span>
                        <a
                          href={`https://wa.me/${cust.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-0.5"
                        >
                          <span>WhatsApp</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">No phone registered</div>
                    )}

                    {cust.address && (
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px] truncate">
                        <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="truncate">{cust.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Spend & Order Stats */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 bg-slate-50/60 p-2 rounded-lg">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Orders</div>
                      <div className="text-xs font-bold text-indigo-700 font-mono flex items-center gap-1">
                        <Receipt className="w-3 h-3" />
                        <span>{ordersCount} {ordersCount === 1 ? 'Sale' : 'Sales'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Spent</div>
                      <div className="text-xs font-bold text-emerald-700 font-mono">
                        AED {spentAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Store Credit Wallet (COA: 2150-01) */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50/70 border border-amber-200/60">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-700" />
                      <div>
                        <div className="text-[10px] font-bold text-amber-900 leading-tight">Store Credit Wallet</div>
                        <span className="text-[9px] font-mono text-amber-700/80">COA 2150-01</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-black text-amber-900">
                      AED {walletBal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Card Omnichannel Action Buttons */}
                <div className="space-y-2 mt-3 pt-2.5 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Promote to B2B Reseller Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerType(cust)}
                      disabled={isUpdatingType}
                      className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                        isB2B
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {isUpdatingType ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isB2B ? (
                        <>
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Demote to Retail</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-3 h-3" />
                          <span>Promote to B2B</span>
                        </>
                      )}
                    </button>

                    {/* Adjust Wallet Balance Button */}
                    <button
                      type="button"
                      onClick={() => openWalletModal(cust)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-300 transition shadow-2xs cursor-pointer"
                    >
                      <Wallet className="w-3 h-3" />
                      <span>Adjust Wallet</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openStatement(cust)}
                    className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-700 border border-indigo-200 hover:border-indigo-700 rounded-lg transition shadow-2xs cursor-pointer"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Customer Statement / Khata</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <NewRetailCustomerModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={saved => {
          setCustomers(prev => [saved, ...prev]);
          loadCustomers();
        }}
      />

      <RetailCustomerStatementModal
        isOpen={showStatementModal}
        onClose={() => {
          setShowStatementModal(false);
          setSelectedCustomer(null);
        }}
        customer={selectedCustomer as any}
        invoices={customerInvoices}
        isLoading={isLoadingStatement}
      />

      <AdjustWalletModal
        isOpen={showWalletModal}
        onClose={() => {
          setShowWalletModal(false);
          setSelectedCustomer(null);
        }}
        customer={selectedCustomer}
        onSuccess={newBal => {
          if (selectedCustomer) {
            setCustomers(prev =>
              prev.map(c =>
                c.id === selectedCustomer.id
                  ? { ...c, wallet_balance: newBal, walletBalance: newBal }
                  : c
              )
            );
          }
          loadCustomers();
        }}
      />
    </div>
  );
};

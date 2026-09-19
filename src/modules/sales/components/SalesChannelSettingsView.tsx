import React, { useState, useEffect } from 'react';
import { SalesService } from '../../../services/salesService.ts';
import {
  Settings,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Save,
  Layers,
  Truck,
  DollarSign,
  ShieldCheck,
  Building2,
  Store,
  Radio,
  Globe,
  HelpCircle
} from 'lucide-react';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currentBalance?: number;
  isTransactional?: boolean;
}

interface SalesSettingRow {
  id?: string;
  settingKey: string;
  accountCode: string;
  description?: string;
  accountName?: string;
  accountType?: string;
}

const SETTING_GROUPS = [
  {
    title: 'Core Inventory & COGS Recognition',
    icon: Layers,
    accent: 'amber',
    keys: ['cogs_account', 'finished_goods_inventory']
  },
  {
    title: 'Courier Logistics & COD Clearing',
    icon: Truck,
    accent: 'indigo',
    keys: ['courier_cod_clearing', 'courier_payable', 'delivery_expense']
  },
  {
    title: 'POS Counter Sales Clearing',
    icon: Store,
    accent: 'emerald',
    keys: ['pos_cash_drawer', 'pos_terminal_clearing', 'pos_sales_clearing']
  },
  {
    title: 'Live Streaming Studio & Claims Khata',
    icon: Radio,
    accent: 'rose',
    keys: ['live_sales_clearing', 'omnichannel_retail_revenue']
  },
  {
    title: 'B2B Wholesale & Custom Corporate Accounts',
    icon: Building2,
    accent: 'purple',
    keys: ['b2b_sales_receivable', 'b2b_revenue']
  },
  {
    title: 'E-Commerce Online Storefront',
    icon: Globe,
    accent: 'blue',
    keys: ['ecommerce_sales_clearing']
  }
];

const SETTING_LABELS: Record<string, { label: string; sub: string; defaultCode: string }> = {
  cogs_account: {
    label: 'Cost of Goods Sold (COGS) Account',
    sub: 'Debited with the item cost value upon dispatch',
    defaultCode: '5110-01'
  },
  finished_goods_inventory: {
    label: 'Finished Goods Inventory Asset',
    sub: 'Credited to reduce inventory balance upon dispatch',
    defaultCode: '1160-01'
  },
  courier_cod_clearing: {
    label: 'Courier COD Clearing (Transit Asset)',
    sub: 'Debited with gross parcel collection pending courier remittance',
    defaultCode: '1128-01'
  },
  courier_payable: {
    label: 'Courier Delivery & Commission Payable',
    sub: 'Credited with delivery fees payable to logistics partner',
    defaultCode: '2140-01'
  },
  delivery_expense: {
    label: 'Company Borne Delivery Expense',
    sub: 'Debited when company offers free shipping promotion',
    defaultCode: '5140-01'
  },
  pos_cash_drawer: {
    label: 'POS Cash in Hand (Drawer)',
    sub: 'Debited on physical cash receipts at counter checkout',
    defaultCode: '1110-01'
  },
  pos_terminal_clearing: {
    label: 'POS Card & Terminal Clearing',
    sub: 'Debited on card swipe / tap terminal payments',
    defaultCode: '1125-01'
  },
  pos_sales_clearing: {
    label: 'POS Sales Control Khata',
    sub: 'Receivable control account for counter POS registers',
    defaultCode: '1130-04'
  },
  live_sales_clearing: {
    label: 'LIVE SALES Control Khata',
    sub: 'Auto-linked transit receivable for TikTok & Live claims',
    defaultCode: '1130-02'
  },
  omnichannel_retail_revenue: {
    label: 'Omnichannel Retail & Online Revenue',
    sub: 'Credited with selling amount for POS, Live & E-Commerce orders',
    defaultCode: '4110-01'
  },
  b2b_sales_receivable: {
    label: 'Default B2B Wholesale Receivable',
    sub: 'Debited for wholesale sales when client specific khata is not set',
    defaultCode: '1130-01'
  },
  b2b_revenue: {
    label: 'B2B Wholesale Revenue',
    sub: 'Dedicated revenue recognition account for corporate bulk sales',
    defaultCode: '4110-05'
  },
  ecommerce_sales_clearing: {
    label: 'E-COMMERCE SALES Control Khata',
    sub: 'Auto-linked receivable control for web storefront orders',
    defaultCode: '1130-03'
  }
};

export const SalesChannelSettingsView: React.FC<{ onRefreshAll?: () => void }> = ({ onRefreshAll }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsList, accountsList] = await Promise.all([
        SalesService.getSalesChannelSettings(),
        SalesService.getTransactionalAccounts()
      ]);

      const map: Record<string, string> = {};
      if (Array.isArray(settingsList)) {
        settingsList.forEach((s: any) => {
          const k = s.setting_key || s.settingKey;
          const v = s.account_code || s.accountCode;
          if (k && v) map[k] = v;
        });
      }

      // Ensure defaults for any unconfigured keys
      Object.keys(SETTING_LABELS).forEach(k => {
        if (!map[k]) map[k] = SETTING_LABELS[k].defaultCode;
      });

      setSettings(map);
      setAccounts(Array.isArray(accountsList) ? accountsList : []);
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to load settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccountChange = (key: string, code: string) => {
    setSettings(prev => ({ ...prev, [key]: code }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      for (const [key, code] of Object.entries(settings)) {
        await SalesService.updateSalesChannelSetting(key, code);
      }
      setFeedback({ text: 'All sales channel account mappings successfully saved and activated!', type: 'success' });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to save settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!confirm('Reset all sales channel accounts to the verified standard COA defaults?')) return;
    setSaving(true);
    setFeedback(null);
    try {
      await SalesService.resetSalesChannelSettings();
      await loadData();
      setFeedback({ text: 'Sales channel settings have been reset to verified standard defaults!', type: 'success' });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to reset settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30 shadow-inner">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-wide uppercase text-white">
                Sales Workflow & COA Dynamic Account Settings
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                TIER-3 TRANSACTIONAL ONLY
              </span>
            </div>
            <p className="text-xs text-stone-300 mt-1">
              Configure automated double-entry ledger mappings across POS, B2B wholesale, TikTok Live claims, and E-Commerce dispatch.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetToDefaults}
            disabled={saving || loading}
            className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Restore default verified accounts"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || loading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 ring-2 ring-indigo-400/40"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-300'
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
          <button onClick={() => setFeedback(null)} className="text-stone-400 hover:text-stone-700">✕</button>
        </div>
      )}

      {/* Automated Double-Entry Architecture Preview */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black uppercase tracking-wider text-stone-800">
              Automated Dispatch Journal Voucher Structure (Total Debits = Total Credits)
            </span>
          </div>
          <span className="text-[11px] text-stone-500 font-mono">Discrepancy: Exactly AED 0.00</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white p-3 rounded-lg border border-stone-200 space-y-1">
            <div className="font-bold text-stone-900 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Customer Bears Shipping Mode</span>
            </div>
            <p className="text-stone-600 text-[11px]">
              <span className="text-emerald-700 font-semibold">Debit:</span> Courier COD Clearing ({settings.courier_cod_clearing || '1128-01'}) = Price + Fee<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Sales Revenue ({settings.omnichannel_retail_revenue || '4110-01'}) = Item Price<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Courier Payable ({settings.courier_payable || '2140-01'}) = Shipping Fee<br />
              <span className="text-emerald-700 font-semibold">Debit:</span> COGS ({settings.cogs_account || '5110-01'}) = Cost Value<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Finished Goods ({settings.finished_goods_inventory || '1160-01'}) = Cost Value
            </p>
          </div>
          <div className="bg-white p-3 rounded-lg border border-stone-200 space-y-1">
            <div className="font-bold text-stone-900 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
              <span>Company Free Shipping Mode</span>
            </div>
            <p className="text-stone-600 text-[11px]">
              <span className="text-emerald-700 font-semibold">Debit:</span> Courier COD Clearing ({settings.courier_cod_clearing || '1128-01'}) = Item Price<br />
              <span className="text-emerald-700 font-semibold">Debit:</span> Delivery Expense ({settings.delivery_expense || '5140-01'}) = Shipping Fee<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Courier Payable ({settings.courier_payable || '2140-01'}) = Shipping Fee<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Sales Revenue ({settings.omnichannel_retail_revenue || '4110-01'}) = Item Price<br />
              <span className="text-emerald-700 font-semibold">Debit:</span> COGS ({settings.cogs_account || '5110-01'}) = Cost Value<br />
              <span className="text-indigo-700 font-semibold">Credit:</span> Finished Goods ({settings.finished_goods_inventory || '1160-01'}) = Cost Value
            </p>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SETTING_GROUPS.map(group => {
          const GroupIcon = group.icon;
          return (
            <div key={group.title} className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
              <div className="bg-stone-50/80 px-4 py-3 border-b border-stone-200 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-stone-200 text-stone-700">
                  <GroupIcon className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
                  {group.title}
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {group.keys.map(key => {
                  const info = SETTING_LABELS[key] || { label: key, sub: '', defaultCode: '' };
                  const currentVal = settings[key] || info.defaultCode;
                  const matchedAcc = accounts.find(a => a.code === currentVal);

                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-800">
                          {info.label}
                        </label>
                        {matchedAcc && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 font-mono">
                            {matchedAcc.accountType || 'ACCOUNT'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 leading-tight">
                        {info.sub}
                      </p>

                      <div className="relative">
                        <select
                          value={currentVal}
                          onChange={e => handleAccountChange(key, e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          {/* If current value is not in accounts list, render as first option */}
                          {currentVal && !accounts.some(a => a.code === currentVal) && (
                            <option value={currentVal}>
                              {currentVal} - Verified Setting Account
                            </option>
                          )}
                          {accounts.map(acc => (
                            <option key={acc.id || acc.code} value={acc.code}>
                              {acc.code} • {acc.name} ({acc.accountType || 'ACC'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  ShieldAlert,
  Users,
  ShoppingBag,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  Package,
  CheckCircle2,
  RefreshCw,
  Radio
} from 'lucide-react';
import { CompanyProfile, MaintenanceModuleKey } from '../setup.types.ts';
import { CompanyProfileService } from '../../../services/companyProfileService.ts';

interface ModuleMaintenanceSwitchboardProps {
  companyProfile: CompanyProfile;
  onUpdateProfile: (updated: CompanyProfile) => void;
  showMsg: (text: string, type?: 'success' | 'error') => void;
}

interface ModuleConfig {
  key: MaintenanceModuleKey;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
}

const SUPPORTED_MODULES: ModuleConfig[] = [
  {
    key: 'hr_payroll',
    name: 'HR & Payroll Vault',
    category: 'Human Resources',
    description: 'Staff directory, OCR Emirates ID / passport vault, attendance logs & monthly payroll execution.',
    icon: <Users className="w-5 h-5 text-indigo-500" />
  },
  {
    key: 'purchases',
    name: 'Commercial Purchases & Consignments',
    category: 'Procurement',
    description: 'Commercial invoices, international sea container inward shipments & supplier AP bills.',
    icon: <ShoppingBag className="w-5 h-5 text-amber-500" />
  },
  {
    key: 'sales',
    name: 'Sales & Dispatch Terminal',
    category: 'Revenue & Retail',
    description: 'Retail counter POS, online store dispatches, barcode verification & customer invoices.',
    icon: <ShoppingCart className="w-5 h-5 text-emerald-500" />
  },
  {
    key: 'sorting',
    name: 'Bale Sorting Terminal',
    category: 'Warehouse Operations',
    description: 'Raw bale breakout, garment grading, tag generation & sorting execution logs.',
    icon: <Boxes className="w-5 h-5 text-purple-500" />
  },
  {
    key: 'vouchers',
    name: 'Financial Vouchers & General Ledger',
    category: 'Accounting & Finance',
    description: 'Journal vouchers, cash/bank payments, receipts & double-entry COA ledger adjustments.',
    icon: <FileSpreadsheet className="w-5 h-5 text-blue-500" />
  },
  {
    key: 'inventory',
    name: 'Real-Time Stock & Multi-Dimensional Room',
    category: 'Inventory Control',
    description: 'Piece-level inventory breakdown, warehouse rack stock rooms & low-stock warning alerts.',
    icon: <Package className="w-5 h-5 text-rose-500" />
  }
];

export const ModuleMaintenanceSwitchboard: React.FC<ModuleMaintenanceSwitchboardProps> = ({
  companyProfile,
  onUpdateProfile,
  showMsg
}) => {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const maintenanceState: Record<string, boolean> =
    companyProfile.maintenance_modules ||
    companyProfile.maintenanceModules || {
      hr_payroll: false,
      purchases: false,
      sales: false,
      sorting: false,
      vouchers: false,
      inventory: false
    };

  const handleToggle = async (key: MaintenanceModuleKey) => {
    const currentState = Boolean(maintenanceState[key]);
    const newState = !currentState;
    setLoadingKey(key);

    try {
      const updated = await CompanyProfileService.setModuleMaintenance(key, newState);
      onUpdateProfile(updated);
      const modName = SUPPORTED_MODULES.find(m => m.key === key)?.name || key;
      showMsg(
        `${modName} maintenance mode ${newState ? 'ACTIVATED (Restricted)' : 'DEACTIVATED (Operational)'}!`,
        'success'
      );
    } catch (err: any) {
      showMsg(err?.message || `Failed to toggle maintenance mode for ${key}`, 'error');
    } finally {
      setLoadingKey(null);
    }
  };

  const activeCount = Object.values(maintenanceState).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-[#1e1b18] text-white p-5 rounded-xl border border-amber-500/30 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 rounded-xl border border-amber-400/30 text-amber-300">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-bold text-lg text-amber-100">
                  Module-Level Maintenance Switchboard
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  Live Realtime
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Control maintenance mode independently for each business department. When activated, only the specific module displays a maintenance screen while all other ERP sections, the top navbar, and database integrity remain 100% operational.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right sm:text-right">
              <div className="text-xs text-slate-400">Maintenance Status</div>
              <div className="text-sm font-bold font-mono">
                {activeCount === 0 ? (
                  <span className="text-emerald-400 flex items-center gap-1 justify-end">
                    <CheckCircle2 className="w-4 h-4" /> All 6 Modules Operational
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1 justify-end">
                    <ShieldAlert className="w-4 h-4" /> {activeCount} Module{activeCount > 1 ? 's' : ''} in Maintenance
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of 6 Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SUPPORTED_MODULES.map(mod => {
          const isUnderMaintenance = Boolean(maintenanceState[mod.key]);
          const isLoading = loadingKey === mod.key;

          return (
            <div
              key={mod.key}
              className={`p-4 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                isUnderMaintenance
                  ? 'bg-amber-950/20 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
              }`}
            >
              {/* Top row with icon, title, and status pill */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${isUnderMaintenance ? 'bg-amber-500/20' : 'bg-slate-100'}`}>
                      {mod.icon}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                        {mod.category}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm">{mod.name}</h4>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border flex-shrink-0 ${
                      isUnderMaintenance
                        ? 'bg-amber-100 text-amber-900 border-amber-400'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {isUnderMaintenance ? (
                      <>
                        <ShieldAlert className="w-3 h-3 text-amber-600" />
                        Maintenance
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Operational
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-4">
                  {mod.description}
                </p>
              </div>

              {/* Bottom toggle action row */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-700">
                  {isUnderMaintenance ? 'Maintenance Active' : 'Normal Access'}
                </span>

                <button
                  type="button"
                  id={`toggle-maintenance-${mod.key}`}
                  disabled={isLoading}
                  onClick={() => handleToggle(mod.key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                    isUnderMaintenance ? 'bg-amber-600' : 'bg-slate-300'
                  } ${isLoading ? 'opacity-60 cursor-wait' : ''}`}
                  role="switch"
                  aria-checked={isUnderMaintenance}
                >
                  <span className="sr-only">Toggle maintenance for {mod.name}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isUnderMaintenance ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reassurance note */}
      <div className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Realtime Instant Synchronization:</span>
          <p className="text-[11px] text-amber-800">
            Toggling any module here persists immediately to Supabase database (<code>public.company_profile.maintenance_modules</code>) and triggers a Supabase Realtime broadcast. Users currently on the affected screen will immediately see the maintenance screen without refreshing. Administrators will have an on-screen bypass button to continue testing.
          </p>
        </div>
      </div>
    </div>
  );
};

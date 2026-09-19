import React from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  Settings,
  Landmark,
  Users,
  Briefcase,
  PackageCheck,
  ShoppingCart,
  Megaphone,
  History,
  KeyRound
} from 'lucide-react';
import { User } from '../modules/auth/auth.types.ts';
import { isTabAccessible } from '../modules/auth/utils/permissionUtils.ts';

export type ActiveTab =
  | 'dashboard'
  | 'setup'
  | 'finance'
  | 'ledger'
  | 'parties'
  | 'hr'
  | 'purchase'
  | 'sales'
  | 'marketing'
  | 'audit'
  | 'access';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser?: User | null;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, currentUser }) => {
  const allTabs: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'dashboard', label: 'Main Dashboard', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'purchase', label: 'Purchase & OCR', icon: <PackageCheck className="w-3.5 h-3.5" /> },
    { id: 'sales', label: 'Sales Workflow', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { id: 'marketing', label: 'Marketing & Automation', icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: 'finance', label: 'Finance & COA', icon: <Landmark className="w-3.5 h-3.5" /> },
    { id: 'parties', label: 'Registry', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'hr', label: 'HR & Payroll', icon: <Briefcase className="w-3.5 h-3.5" /> },
    { id: 'setup', label: 'Global Setup', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'Audit Trail', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'access', label: 'Access Control', icon: <KeyRound className="w-3.5 h-3.5" /> }
  ];

  // Strictly filter tabs according to user's permissions and role.
  // Unauthorized tabs are completely omitted from the UI.
  const visibleTabs = allTabs.filter(tab => (currentUser ? isTabAccessible(tab.id, currentUser) : true));

  return (
    <nav id="modular-erp-navbar" className="w-full bg-[#FCF8EE] border-b border-amber-300/80 sticky top-0 z-40 shadow-xs">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1.5 scrollbar-none">
          <div className="hidden lg:flex items-center px-2.5 py-1 text-[10px] font-black text-amber-900 uppercase tracking-widest bg-amber-100/80 border border-amber-300/80 rounded mr-1">
            Modules
          </div>
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => onSelectTab(tab.id)}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98, y: 1 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-amber-950 border-amber-300 border-b-[3px] border-b-amber-800 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 border-b-[2px] border-b-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-amber-950 ring-2 ring-amber-200' : 'bg-slate-300'
                  }`}
                ></span>
                <span className={isActive ? 'text-amber-950 font-black' : 'text-slate-500'}>{tab.icon}</span>
                <span>{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

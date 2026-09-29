import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  KeyRound,
  ChevronDown,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Eye,
  EyeOff
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

export interface NavigationSubItem {
  id: string;
  label: string;
  description: string;
  icon?: string;
  badge?: string;
  badgeColor?: string;
}

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab, subTab?: string) => void;
  onPrefetchTab?: (tab: ActiveTab, subTab?: string) => void;
  hideInternalSubtabs?: boolean;
  onToggleHideSubtabs?: () => void;
  currentUser?: User | null;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  onPrefetchTab,
  hideInternalSubtabs,
  onToggleHideSubtabs,
  currentUser
}) => {
  const [openDropdown, setOpenDropdown] = useState<{ id: ActiveTab; rect: DOMRect } | null>(null);
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Complete Exhaustive Sub-Item Sitemap across all Modules
  const subItemsMap: Record<ActiveTab, NavigationSubItem[]> = {
    dashboard: [
      { id: 'overview', label: 'Executive KPI Pulse', description: 'Real-time revenue, piece volume, margin & AOV', icon: '📈', badge: 'LIVE', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'liquidity', label: 'Cash Flow & Liquidity Radar', description: 'Bank balances (Emirates NBD) & daily drawer cash', icon: '💵', badge: 'BANK', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'velocity', label: 'Sales Channel Velocity', description: 'Target pacing for POS, Live Selling & Storefront', icon: '🎯', badge: 'PACING', badgeColor: 'bg-blue-900/80 text-blue-300 border-blue-500/40' }
    ],
    purchase: [
      { id: 'bale_inward', label: 'Inward Gate Passes & Bales', description: 'Container receiving, port manifests & gross weight checks', icon: '🚢', badge: 'CARGO', badgeColor: 'bg-indigo-900/80 text-indigo-300 border-indigo-500/40' },
      { id: 'sorting_terminal', label: 'Bale Sorting Terminal', description: 'Live piece stream, AI 5-photo appraisal & dual tape OCR', icon: '⚡', badge: 'LIVE OCR', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'inventory', label: 'Piece Inventory Breakdown', description: 'Multi-dimensional sorted pieces table & sticker re-print', icon: '📋' },
      { id: 'commercial_invoices', label: 'Commercial Purchase Invoices', description: 'Supplier bill of lading, customs clearing & landed costs', icon: '📑', badge: 'VAT 5%', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'settings', label: 'Factory Settings & Bale Presets', description: 'Weight thresholds, expected yield rules & tare defaults', icon: '⚙️' }
    ],
    sales: [
      { id: 'counterSale', label: 'Counter Sale POS Terminal', description: 'Fast barcode scan, multi-currency cash/card checkout', icon: '💻', badge: 'FAST SCAN', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'customSale', label: 'Custom B2B Commercial Sales', description: 'Wholesale corporate credit, bulk bundles & TRN tax invoices', icon: '🏢', badge: 'B2B', badgeColor: 'bg-indigo-900/80 text-indigo-300 border-indigo-500/40' },
      { id: 'liveSelling', label: 'Live Selling Studio (TikTok/IG)', description: 'DROP DROP basket claims, auction timer & live reservation', icon: '🎥', badge: 'DROP DROP', badgeColor: 'bg-rose-900/80 text-rose-300 border-rose-500/40' },
      { id: 'drafts', label: 'Draft Invoices & Saved Carts', description: 'Pending counter baskets, saved quotes & claim recovery', icon: '📑' },
      { id: 'bounties', label: 'Grail Bounty Radar & Valuation', description: 'High-ticket rare vintage valuation & collector bounty finder', icon: '🎯', badge: 'AI RADAR', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'masterLog', label: 'Sales Gate Passes & Dispatch', description: 'Completed sales register & outward security gate passes', icon: '🚪' },
      { id: 'returns', label: 'Customer Parcel Return Processing', description: 'Restocking returned items, condition checks & credit notes', icon: '📦' },
      { id: 'salesSettings', label: 'Sales Channel Pricing Rules', description: 'Markup benchmarks, VIP buyer discounts & commission tiers', icon: '⚙️' }
    ],
    marketing: [
      { id: 'campaigns', label: 'WhatsApp & SMS Broadcasts', description: 'Bulk customer notification blasts & cart recovery triggers', icon: '💬', badge: 'WHATSAPP', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'automations', label: 'Post-Order Automations', description: 'Automated post-order invoice dispatch, shipping & alerts', icon: '⚡', badge: 'TRIGGERS', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'coupons', label: 'Smart Coupons & Loyalty Discounts', description: 'Promotional promo codes, VIP percentage discounts & caps', icon: '🎟️' },
      { id: 'audiences', label: 'Audience Segmentation & VIP Lists', description: 'High-roller collectors & dormant customer re-engagement', icon: '👥' },
      { id: 'chat-claim', label: 'Live Chat Claim Automation', description: 'NLP parser for chat streams (MINE #102) & auto-DM links', icon: '🤖', badge: 'NLP', badgeColor: 'bg-pink-900/80 text-pink-300 border-pink-500/40' },
      { id: 'auto-broadcast', label: 'AI Social Asset Studio & Reels', description: 'Auto-generation of Instagram/TikTok product cards & reels', icon: '🎨', badge: 'AI VISION', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'live-desk', label: 'Unified Live Broadcast Desk', description: 'Multi-booth controller, streamer allocation & OBS camera feeds', icon: '📡' },
      { id: 'ad-catalog-pixels', label: 'Ad Catalog Feeds & Pixels', description: 'Meta CAPI, TikTok Pixel & Google Merchant sync', icon: '📊' },
      { id: 'storefront-analytics', label: 'Storefront Analytics & Funnels', description: 'Visitor session replays, add-to-cart rate & drop-off analysis', icon: '📈' }
    ],
    finance: [
      { id: 'coa', label: 'Chart of Accounts (COA 5-Tier)', description: 'Assets, Liabilities, Equity, Revenue, Expense master tree', icon: '🌲', badge: 'GAAP/IFRS', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'vouchers', label: 'Double-Entry Journal Vouchers', description: 'JV, BP, BR, CP, CR double-entry vouchers with auto-balancing', icon: '✍️', badge: 'BALANCED', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'ledger', label: 'General Ledger Account Balances', description: 'Complete double-entry general ledger, filters & audit trail', icon: '📖' },
      { id: 'trial-balance', label: 'Trial Balance Sheet', description: 'Unadjusted and adjusted trial balance, zero-sum check', icon: '⚖️' },
      { id: 'income-statement', label: 'Profit & Loss Statement (P&L)', description: 'Gross profit, operating expenses, Net Profit after Tax', icon: '📈' },
      { id: 'balance-sheet', label: 'Balance Sheet Statement', description: 'Formulaic Assets = Liabilities + Equity balance reconciliation', icon: '📑' },
      { id: 'cod-reconciliation', label: 'Courier COD Reconciliation', description: 'Cash-on-delivery courier remittances & airway bill matching', icon: '🚚', badge: 'AIRWAY', badgeColor: 'bg-cyan-900/80 text-cyan-300 border-cyan-500/40' },
      { id: 'recurring-vouchers', label: 'Recurring Vouchers & Amortization', description: 'Monthly rent, software licenses & depreciation schedules', icon: '🔄' },
      { id: 'budgeting', label: 'Departmental Budgeting & Allocations', description: 'Operating budgets vs. actual spending, variance analysis', icon: '🎯' },
      { id: 'tax-compliance', label: 'UAE FTA VAT 201 Tax Compliance', description: 'Output VAT, Input VAT & net VAT liability calculation', icon: '🏛️', badge: 'FTA TAX', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'custom-reports', label: 'Custom Financial Report Builder', description: 'Multi-column financial reporting & statement generator', icon: '📊' }
    ],
    ledger: [
      { id: 'ledger', label: 'General Ledger Account Balances', description: 'Complete double-entry general ledger, filters & audit trail', icon: '📖' }
    ],
    parties: [
      { id: 'all_parties', label: 'Registered Parties Directory (All)', description: 'Complete directory of suppliers, clients, agents & couriers', icon: '🏢', badge: 'ALL', badgeColor: 'bg-blue-900/80 text-blue-300 border-blue-500/40' },
      { id: 'CUSTOMER', label: 'Wholesale Corporate B2B Clients', description: 'Multi-branch retail buyers, credit limits & aging khata ledger', icon: '🏬', badge: 'B2B', badgeColor: 'bg-indigo-900/80 text-indigo-300 border-indigo-500/40' },
      { id: 'SUPPLIER', label: 'Commercial Bale Suppliers', description: 'International container exporters, textile mills & freight agents', icon: '🏭', badge: 'SUPPLIER', badgeColor: 'bg-cyan-900/80 text-cyan-300 border-cyan-500/40' },
      { id: 'AGENT', label: 'Freight & Clearing Agents', description: 'Customs clearance, shipping brokers & port clearance agents', icon: '🚢', badge: 'AGENTS', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'COURIER', label: 'COD Courier Delivery Partners', description: 'Cash-on-delivery couriers & airway bill tracking partners', icon: '🚚', badge: 'COURIER', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'VISITING_CARDS', label: 'Visiting Card Directory / CRM Leads', description: 'AI OCR digitized business cards & customer lead directory', icon: '📇', badge: 'GEMINI AI', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'RETAIL_CRM', label: 'Retail VIP Customers & Loyalty', description: 'Walk-in buyers, loyalty points balance & statement dossiers', icon: '🛍️', badge: 'VIP CRM', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'NEW_PARTY', label: '➕ Register New Party & Provision COA', description: 'Direct shortcut to register corporate entity with auto GL account', icon: '✨', badge: 'ACTION', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'SCAN_CARD', label: '📷 Scan Visiting Card with AI Vision', description: 'Open live camera OCR scanner to digitize card text directly into CRM', icon: '📸', badge: 'ACTION', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'NEW_RETAIL', label: '🛍️ Register Walk-in Retail Customer', description: 'Quick POS retail customer registration linked to 1130-05 account', icon: '👤', badge: 'ACTION', badgeColor: 'bg-blue-900/80 text-blue-300 border-blue-500/40' }
    ],
    hr: [
      { id: 'employees', label: 'Staff Directory & Bio Profiles', description: 'Employee records, emergency contacts, job titles & visa copies', icon: '👥' },
      { id: 'attendance', label: 'Daily Biometric Attendance Sheet', description: 'Daily clock-in/out records, shift schedules & A4 printable sheet', icon: '⏱️', badge: 'A4 PRINT', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'payroll', label: 'Monthly Payroll & UAE WPS Export', description: 'Basic salary, allowances, deductions & SIF electronic export', icon: '💵', badge: 'WPS SIF', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'loans', label: 'Staff Loans, Advances & Schedules', description: 'Salary advances, monthly installment deductions & balance tracking', icon: '🤝' },
      { id: 'vault', label: 'Encrypted Document Vault', description: 'Secure encrypted repository for passports, Emirates IDs & contracts', icon: '🔒', badge: 'AES-256', badgeColor: 'bg-rose-900/80 text-rose-300 border-rose-500/40' },
      { id: 'ocr-logs', label: 'Document Expiry Alert Radar', description: 'Automated 60/30/15-day expiry warnings for visas and passports', icon: '🚨', badge: 'RADAR', badgeColor: 'bg-rose-900/80 text-rose-300 border-rose-500/40' }
    ],
    setup: [
      { id: 'profile', label: 'Company Profile & UAE TRN Config', description: 'Legal trade name, TRN tax number, address & official logo', icon: '🏢', badge: 'TRN', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'pos_terminal', label: 'Thermal Barcode Printer & Hardware', description: '57x37mm & 50x25mm label designer, PAX POS & scales setup', icon: '🖨️', badge: 'THERMAL', badgeColor: 'bg-indigo-900/80 text-indigo-300 border-indigo-500/40' },
      { id: 'categories', label: 'Garment Taxonomy & Categories', description: 'Men/Women/Kids departments, item categories & garment seasons', icon: '🏷️' },
      { id: 'sizes', label: 'Size Masters & Measurements', description: 'Standardized sizes (XS to 3XL) & chest/waist metric guidelines', icon: '📏' },
      { id: 'items', label: 'Item Master Catalog', description: 'Vintage brand registry, condition grades & master garment codes', icon: '👕' },
      { id: 'brands', label: 'Brand Tiers & Designer Registry', description: 'Vintage designer brands, premium labels & origin definitions', icon: '🏷️' },
      { id: 'labels', label: 'Quality & Grading Standards', description: 'Pristine, Grade A, Grade B, Distressed garment standards', icon: '✨' },
      { id: 'shops', label: 'Shop Branches & Warehouses Hub', description: 'Physical store locations, stock transfer routing & Al Ain showroom', icon: '🏪' },
      { id: 'ai_vision', label: 'AI Studio & Gemini Vision Calibration', description: 'Gemini API keys, vision temperature & OCR prompt fine-tuning', icon: '🧠', badge: 'GEMINI', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'payment_gateways', label: 'Payment Gateways & UAE Bank QR', description: 'Stripe, Telr, Emirates NBD IBAN bank QR code generator & COD', icon: '💳' },
      { id: 'live_multicast_sockets', label: 'Social Multicast Live Sockets', description: 'RTMP server endpoints for TikTok, Instagram Live & YouTube', icon: '📡' },
      { id: 'whatsapp', label: 'WhatsApp Cloud API Config', description: 'Official Meta Cloud API webhook & auto-notification engine', icon: '💬', badge: 'META', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'bale_qr', label: 'Factory Bale QR Templates', description: 'Industrial container label designer and gross tare parameters', icon: '📦' },
      { id: 'currency', label: 'Multi-Currency & FX Exchange Rates', description: 'AED base currency, USD, EUR, GBP conversion rates and update', icon: '💱' },
      { id: 'maintenance', label: 'Module Maintenance Switchboard', description: 'Safe emergency lock / maintenance toggle for individual ERP subsystems', icon: '🛡️', badge: 'GUARD', badgeColor: 'bg-rose-900/80 text-rose-300 border-rose-500/40' },
      { id: 'security', label: 'Security Master PIN Protocol (0099)', description: 'Master PIN status, enterprise lockdown parameters & overrides', icon: '🔒', badge: 'PIN 0099', badgeColor: 'bg-red-900/80 text-red-300 border-red-500/40' }
    ],
    audit: [
      { id: 'ALL', label: 'Real-Time System Audit Logs', description: 'Real-time CDC record tracking, mutation trail & operator attribution', icon: '🛡️', badge: 'IMMUTABLE', badgeColor: 'bg-purple-900/80 text-purple-300 border-purple-500/40' },
      { id: 'PURCHASE', label: 'Purchase & Inward Gate Pass Audit', description: 'Container receiving, port manifests & gross weight mutation log', icon: '🚢' },
      { id: 'INVENTORY', label: 'Inventory & Bale Piece Sorting Audit', description: 'Sorted garment piece additions, adjustments & deletion audit', icon: '📦' },
      { id: 'SALES', label: 'Sales & POS Invoicing Audit Trail', description: 'Counter POS checkout, B2B posting, unpost & return audit', icon: '💻' },
      { id: 'FINANCE', label: 'Financial Vouchers & COA Mutation Log', description: 'Double-entry voucher posting, balance modifications & COA audit', icon: '⚖️' },
      { id: 'HR', label: 'HR Biometric & Payroll Audit', description: 'Attendance logs, employee profile edits & WPS payroll audit', icon: '👥' },
      { id: 'PARTIES', label: 'Registry, Parties & Khata Log Audit', description: 'Party creation, credit limits & visiting card conversion audit', icon: '🏢' },
      { id: 'SETUP', label: 'System Setup & Configuration Audit', description: 'Hardware printers, company profiles & tax setting changes', icon: '⚙️' }
    ],
    access: [
      { id: 'operators', label: 'Operator User Accounts & Credentials', description: 'Staff usernames, encrypted passwords, branch allocation & toggles', icon: '👤', badge: 'AUTH', badgeColor: 'bg-blue-900/80 text-blue-300 border-blue-500/40' },
      { id: 'devices', label: 'Authorized Devices & POS Whitelist', description: 'Hardware machine ID registration & mobile staff APK activation', icon: '📱', badge: 'HARDWARE', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' },
      { id: 'matrix', label: 'Roles & Authority Matrix (RBAC)', description: 'Super Admin, Store Manager, Cashier, Sorter privilege matrix', icon: '🔑', badge: 'RBAC', badgeColor: 'bg-amber-900/80 text-amber-300 border-amber-500/40' },
      { id: 'new_operator', label: '➕ New Operator & Role Assignment', description: 'Direct shortcut to provision a new staff login credential', icon: '✨', badge: 'ACTION', badgeColor: 'bg-emerald-900/80 text-emerald-300 border-emerald-500/40' }
    ]
  };

  const allTabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
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

  // Strictly filter tabs according to user's permissions and role
  const visibleTabs = allTabs.filter(tab => (currentUser ? isTabAccessible(tab.id, currentUser) : true));

  // Trigger SWR Pre-Fetch on Hover (100ms Debounce to prevent mouse sweep query storms)
  const handleItemHover = useCallback((tabId: ActiveTab, subTabId?: string) => {
    if (hoverDebounceRef.current) {
      clearTimeout(hoverDebounceRef.current);
    }
    hoverDebounceRef.current = setTimeout(() => {
      onPrefetchTab?.(tabId, subTabId);
    }, 100);
  }, [onPrefetchTab]);

  const handleOpenDropdown = (tabId: ActiveTab, e: React.MouseEvent<HTMLElement>) => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenDropdown(prev => (prev?.id === tabId ? null : { id: tabId, rect }));
    handleItemHover(tabId);
  };

  const handleMouseEnterDropdownTrigger = (tabId: ActiveTab, e: React.MouseEvent<HTMLElement>) => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenDropdown({ id: tabId, rect });
    handleItemHover(tabId);
  };

  const handleMouseLeaveDropdown = () => {
    menuCloseTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 250);
  };

  const handleDropdownContentEnter = () => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
    }
  };

  // Close when user clicks anywhere outside or presses Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#modular-erp-navbar') && !target.closest('#modular-nav-popover')) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };

    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <nav
      id="modular-erp-navbar"
      ref={containerRef}
      className="w-full bg-[#FCF8EE] border-b border-amber-300/80 sticky top-0 z-40 shadow-xs"
    >
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-1.5 overflow-x-auto whitespace-nowrap hide-scrollbar py-1.5 scrollbar-none">
          <div className="hidden lg:flex items-center px-2.5 py-1 text-[10px] font-black text-amber-900 uppercase tracking-widest bg-amber-100/80 border border-amber-300/80 rounded mr-1 shrink-0">
            Modules
          </div>

          {onToggleHideSubtabs && (
            <button
              type="button"
              onClick={onToggleHideSubtabs}
              title={
                hideInternalSubtabs
                  ? 'Internal module sub-tabs are currently hidden for testing. Click to unhide.'
                  : 'Internal module sub-tabs are visible. Click to hide.'
              }
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-bold rounded shrink-0 border transition-all cursor-pointer mr-1.5 ${
                hideInternalSubtabs
                  ? 'bg-rose-100/90 hover:bg-rose-200 text-rose-900 border-rose-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              {hideInternalSubtabs ? (
                <>
                  <EyeOff className="w-2.5 h-2.5 text-rose-600" />
                  <span>Sub-Tabs: Hidden</span>
                </>
              ) : (
                <>
                  <Eye className="w-2.5 h-2.5 text-slate-500" />
                  <span>Sub-Tabs: Visible</span>
                </>
              )}
            </button>
          )}

          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id;
            const hasSubItems = Boolean(subItemsMap[tab.id]?.length);
            const isMenuOpen = openDropdown?.id === tab.id;

            return (
              <div
                key={tab.id}
                className="relative inline-flex items-center"
                onMouseEnter={e => handleMouseEnterDropdownTrigger(tab.id, e)}
                onMouseLeave={handleMouseLeaveDropdown}
              >
                <div
                  className={`inline-flex items-center rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all border ${
                    isActive
                      ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-amber-950 border-amber-300 border-b-[3px] border-b-amber-800 shadow-sm'
                      : isMenuOpen
                      ? 'bg-amber-100/80 text-amber-950 border-amber-400 border-b-[2px] border-b-amber-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 border-b-[2px] border-b-slate-300'
                  }`}
                >
                  {/* Primary Tab Select Button */}
                  <button
                    type="button"
                    id={`nav-tab-${tab.id}`}
                    onClick={() => {
                      setOpenDropdown(null);
                      onSelectTab(tab.id);
                    }}
                    className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 cursor-pointer outline-none"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isActive ? 'bg-amber-950 ring-2 ring-amber-200' : 'bg-slate-300'
                      }`}
                    />
                    <span className={isActive ? 'text-amber-950 font-black' : 'text-slate-500'}>
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                  </button>

                  {/* Dropdown Toggle Chevron */}
                  {hasSubItems && (
                    <button
                      type="button"
                      aria-label={`Open ${tab.label} sub-menu`}
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenDropdown(tab.id, e);
                      }}
                      className={`px-1.5 py-1.5 rounded-r-lg transition-colors border-l cursor-pointer ${
                        isActive
                          ? 'border-amber-600/40 hover:bg-amber-600/30 text-amber-950'
                          : 'border-slate-200 hover:bg-amber-100/80 text-slate-500 hover:text-amber-950'
                      }`}
                    >
                      <ChevronDown
                        className={`w-3 h-3 transition-transform duration-200 ${
                          isMenuOpen ? 'rotate-180 text-amber-950' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Popover Portal: Renders via Fixed Position so it NEVER gets clipped by overflow-x */}
      <AnimatePresence>
        {openDropdown && (
          <div
            id="modular-nav-popover"
            onMouseEnter={handleDropdownContentEnter}
            onMouseLeave={handleMouseLeaveDropdown}
            style={{
              position: 'fixed',
              top: openDropdown.rect.bottom + 6,
              left: Math.max(12, Math.min(openDropdown.rect.left, window.innerWidth - 360)),
              zIndex: 9999
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-80 sm:w-92 bg-slate-900/98 backdrop-blur-md border border-amber-500/40 rounded-xl shadow-2xl p-2.5 text-slate-100 ring-1 ring-black/40"
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between px-2 py-1.5 mb-1.5 border-b border-slate-800 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {allTabs.find(t => t.id === openDropdown.id)?.label}
                </span>
                <span className="text-slate-400">
                  {subItemsMap[openDropdown.id]?.length || 0} Direct Screens
                </span>
              </div>

              {/* Sub-Items List */}
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                {subItemsMap[openDropdown.id]?.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => handleItemHover(openDropdown.id, item.id)}
                    onClick={() => {
                      setOpenDropdown(null);
                      onSelectTab(openDropdown.id, item.id);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/90 border border-transparent hover:border-amber-500/30 transition flex items-start gap-2.5 group cursor-pointer"
                  >
                    <span className="text-base mt-0.5 shrink-0 group-hover:scale-110 transition-transform">
                      {item.icon || '⚡'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-amber-300 transition-colors truncate">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                              item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-400 leading-tight mt-0.5 line-clamp-1 group-hover:text-slate-300">
                        {item.description}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>

              {/* SWR Silent Speed Guarantee Footer */}
              <div className="mt-2 pt-2 border-t border-slate-800/90 flex items-center justify-between text-[10px] text-slate-400 px-2 font-mono">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Zap className="w-2.5 h-2.5" /> SWR Warm Cache Active
                </span>
                <span className="text-slate-500">&lt;30ms Render</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </nav>
  );
};

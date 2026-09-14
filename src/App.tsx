/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Header } from './components/Header.tsx';
import { DubaiLiveSoukTicker } from './components/DubaiLiveSoukTicker.tsx';
import { Navigation, ActiveTab } from './components/Navigation.tsx';
import { DashboardKPIs } from './components/DashboardKPIs.tsx';
import { WhatsAppModal } from './components/WhatsAppModal.tsx';
import { exportCurrentViewToPdf } from './utils/pdfExport.ts';
import { MainDashboardView } from './modules/dashboard/components/MainDashboardView.tsx';
import { LoginScreen } from './modules/auth/components/LoginScreen.tsx';
import { CompanyProfile, CurrencyItem } from './modules/setup/setup.types.ts';
import { User } from './modules/auth/auth.types.ts';
import { SyncProvider } from './context/SyncContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AccessDeniedNotice } from './components/AccessDeniedNotice.tsx';
import { GoldenCursorDust } from './components/GoldenCursorDust.tsx';
import { useIdleTimer } from './hooks/useIdleTimer.ts';
import { isTabAccessible, getAccessibleTabs } from './modules/auth/utils/permissionUtils.ts';
import { CompanyProfileService, SetupService, AuthService, DeviceService } from './services/index.ts';
import { IOSInstallBanner } from './components/IOSInstallBanner.tsx';
import { ModuleMaintenanceGuard } from './components/ModuleMaintenanceGuard.tsx';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt.tsx';
import { lazyWithRetry } from './utils/lazyWithRetry.ts';

// Code-Split Dynamic Views for 10x Load Speed with Deployment Chunk Auto-Retry
const PurchaseView = lazyWithRetry(() => import('./modules/purchase/components/PurchaseView.tsx').then(m => ({ default: m.PurchaseView })));
const SalesView = lazyWithRetry(() => import('./modules/sales/components/SalesView.tsx').then(m => ({ default: m.SalesView })));
const FinanceView = lazyWithRetry(() => import('./modules/finance/components/FinanceView.tsx').then(m => ({ default: m.FinanceView })));
const PartiesView = lazyWithRetry(() => import('./modules/parties/components/PartiesView.tsx').then(m => ({ default: m.PartiesView })));
const HRView = lazyWithRetry(() => import('./modules/hr/components/HRView.tsx').then(m => ({ default: m.HRView })));
const SetupView = lazyWithRetry(() => import('./modules/setup/components/SetupView.tsx').then(m => ({ default: m.SetupView })));
const AuditView = lazyWithRetry(() => import('./modules/audit/components/AuditView.tsx').then(m => ({ default: m.AuditView })));
const AccessControlView = lazyWithRetry(() => import('./modules/auth/components/AccessControlView.tsx').then(m => ({ default: m.AccessControlView })));
const StorefrontView = lazyWithRetry(() => import('./modules/ecommerce/StorefrontView.tsx').then(m => ({ default: m.StorefrontView })));
const MobileLiveHostView = lazyWithRetry(() => import('./modules/sales/components/MobileLiveHostView.tsx').then(m => ({ default: m.MobileLiveHostView })));
const StaffMobileAppView = lazyWithRetry(() => import('./modules/staff/StaffMobileAppView.tsx').then(m => ({ default: m.StaffMobileAppView })));
const CounterSalePOSTerminal = lazyWithRetry(() => import('./modules/sales/components/CounterSalePOSTerminal.tsx').then(m => ({ default: m.CounterSalePOSTerminal })));
const MarketingAutomationView = lazyWithRetry(() => import('./modules/marketing/components/MarketingAutomationView.tsx').then(m => ({ default: m.MarketingAutomationView })));
const LiveOBSOverlayView = lazyWithRetry(() => import('./modules/marketing/components/LiveOBSOverlayView.tsx').then(m => ({ default: m.LiveOBSOverlayView })));

const ModuleLoadingFallback: React.FC<{ name?: string }> = ({ name }) => (
  <div className="flex flex-col items-center justify-center py-24 px-4 min-h-[380px]">
    <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3.5" />
    <div className="text-xs font-bold uppercase tracking-widest text-amber-900 font-mono">
      Loading {name || 'Workspace'}...
    </div>
    <div className="text-[11px] text-slate-400 mt-1 font-mono">Connecting to relational data streams</div>
  </div>
);

const VALID_TABS: ActiveTab[] = [
  'dashboard',
  'setup',
  'finance',
  'ledger',
  'parties',
  'hr',
  'purchase',
  'sales',
  'marketing',
  'audit',
  'access'
];

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    try {
      // 1. Check URL query param ?tab=
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab') as ActiveTab;
      if (tabParam && VALID_TABS.includes(tabParam)) {
        if (tabParam === 'ledger') return 'finance';
        return tabParam;
      }
      // 2. Check localStorage for page refresh persistence
      const savedTab = localStorage.getItem('vintage_erp_active_tab') as ActiveTab;
      if (savedTab && VALID_TABS.includes(savedTab)) {
        if (savedTab === 'ledger') return 'finance';
        return savedTab;
      }
    } catch {}
    return 'dashboard';
  });

  const setActiveTab = (tab: ActiveTab) => {
    const targetTab = tab === 'ledger' ? 'finance' : tab;
    if (tab === 'ledger') {
      try {
        localStorage.setItem('vintage_finance_subtab', 'ledger');
      } catch {}
    }
    setActiveTabState(targetTab);
    try {
      localStorage.setItem('vintage_erp_active_tab', targetTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', targetTab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [liveHostState, setLiveHostState] = useState<{ isHostMode: boolean; boothId: string }>(() => {
    try {
      const path = window.location.pathname;
      const search = window.location.search;
      const match = path.match(/^\/live-host(?:\/([^\/]+))?/);
      if (match) {
        return { isHostMode: true, boothId: match[1] || 'booth-01' };
      }
      const params = new URLSearchParams(search);
      if (params.get('mode') === 'live-host' || params.get('mode') === 'mobile-host') {
        return { isHostMode: true, boothId: params.get('booth') || 'booth-01' };
      }
    } catch {}
    return { isHostMode: false, boothId: 'booth-01' };
  });

  // Listen for browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const search = window.location.search;
      const match = path.match(/^\/live-host(?:\/([^\/]+))?/);
      if (match) {
        setLiveHostState({ isHostMode: true, boothId: match[1] || 'booth-01' });
      } else {
        const params = new URLSearchParams(search);
        if (params.get('mode') === 'live-host' || params.get('mode') === 'mobile-host') {
          setLiveHostState({ isHostMode: true, boothId: params.get('booth') || 'booth-01' });
        } else {
          setLiveHostState({ isHostMode: false, boothId: 'booth-01' });
        }
        const tabParam = params.get('tab') as ActiveTab;
        if (tabParam && VALID_TABS.includes(tabParam)) {
          setActiveTabState(tabParam);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Primary Application View: 'storefront' vs 'login' vs 'erp' vs 'staff-mobile' (APK) vs 'pos-standalone' vs 'live-overlay'
  const [currentView, setCurrentView] = useState<'storefront' | 'login' | 'erp' | 'staff-mobile' | 'pos-standalone' | 'live-overlay'>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('piece') || urlParams.has('checkout') || urlParams.has('sku')) return 'storefront';
      const viewParam = urlParams.get('view');
      if (viewParam === 'live-overlay' || window.location.pathname === '/live-overlay') return 'live-overlay';
      if (viewParam === 'pos' || viewParam === 'counter-sale' || window.location.pathname === '/pos') return 'pos-standalone';
      if (viewParam === 'staff-mobile' || viewParam === 'staff' || viewParam === 'apk') return 'staff-mobile';
      if (viewParam === 'erp') return 'erp';
      if (viewParam === 'login') return 'login';
      if (viewParam === 'storefront') return 'storefront';

      // If user specifically has tab param and an active authenticated session, open ERP
      const hasActiveSession = !!localStorage.getItem('vintage_erp_logged_user');
      if (urlParams.has('tab') && hasActiveSession) return 'erp';
      const lastSessionMode = localStorage.getItem('vintage_app_view_mode');
      if (lastSessionMode === 'pos-standalone') return 'pos-standalone';
      if (lastSessionMode === 'staff-mobile') return 'staff-mobile';
      if (lastSessionMode === 'erp' && hasActiveSession) {
        return 'erp';
      }
    } catch {}
    return 'storefront'; // First Page is ALWAYS E-Commerce Luxury Storefront
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if operator was previously logged in
    try {
      const saved = localStorage.getItem('vintage_erp_logged_user');
      return !!saved;
    } catch {
      return false;
    }
  });

  const [sessionTimeoutMsg, setSessionTimeoutMsg] = useState<string | null>(null);

  // Handle logout
  const handleLogout = (timeoutReason?: any) => {
    try {
      localStorage.removeItem('vintage_erp_logged_user');
      localStorage.removeItem('vintage_erp_active_tab');
      localStorage.setItem('vintage_app_view_mode', 'storefront');
      // Clean address bar so ?tab=dashboard is removed and user doesn't bounce back
      const url = new URL(window.location.href);
      url.searchParams.delete('tab');
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    } catch {}
    if (typeof timeoutReason === 'string') {
      setSessionTimeoutMsg(timeoutReason);
    } else {
      setSessionTimeoutMsg(null);
    }
    setIsAuthenticated(false);
    setCurrentView('storefront');
  };

  // 15-Minute Inactivity / Idle Auto-Logout Hook
  // CRITICAL REQUIREMENT: Live Streaming mode is exempt from auto-logout
  // - Isolated Mobile Host mode (/live-host)
  // - Live Selling Studio sub-tab inside Sales View
  const [isLiveStudioActive, setIsLiveStudioActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vintage_sales_subtab') === 'liveSelling';
    } catch {
      return false;
    }
  });

  const isExemptFromAutoLogout = liveHostState.isHostMode || (activeTab === 'sales' && isLiveStudioActive);

  useIdleTimer({
    timeoutMs: 15 * 60 * 1000, // 15 minutes of inactivity
    onIdle: () => {
      console.warn('[Security] Session timed out after 15 minutes of inactivity. Logging out...');
      handleLogout('Session locked: You were inactive for 15 minutes. Please sign in again to continue.');
    },
    isEnabled: isAuthenticated && !isExemptFromAutoLogout
  });

  // Automatically register device telemetry & update client IP in PostgreSQL
  useEffect(() => {
    DeviceService.registerDevice().catch(() => {});
  }, [isAuthenticated, currentView]);

  // Global state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() => {
    try {
      const cached = localStorage.getItem('vintage_cached_company_profile');
      if (cached) return JSON.parse(cached);
    } catch {}
    return {
      companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      company_display_name: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      addressLine1: 'House 14 Street 4 - Al Jimi - Al Nudood',
      address_line_1: 'House 14 Street 4 - Al Jimi - Al Nudood',
      addressLine2: 'Al Ain, Abu Dhabi, United Arab Emirates',
      address_line_2: 'Al Ain, Abu Dhabi, United Arab Emirates',
      city: 'Al Ain, Abu Dhabi',
      country: 'United Arab Emirates',
      trnTaxNo: 'TRN-100482910300003',
      trn_number: 'TRN-100482910300003',
      phone: '+971 55 418 6086',
      corporate_phone: '+971 55 418 6086',
      email: 'sales@vintagevibesllcspc.com',
      corporate_email: 'sales@vintagevibesllcspc.com',
      whatsappOrderNumber: '+971554186086',
      whatsapp_orders_number: '+971554186086',
      defaultCurrency: 'AED',
      vatRatePercent: 5.0,
      logoUrl: '/vintage_logo.svg',
      social_links: {
        facebook: 'https://www.facebook.com/vintagevibes.ae/',
        instagram: 'https://www.instagram.com/vintagevibes.llc/',
        youtube: 'https://www.youtube.com/@VintageVibesLLCSPC',
        tiktok: 'https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn'
      }
    };
  });

  const [currencies, setCurrencies] = useState<CurrencyItem[]>([
    { id: 'curr-1', code: 'AED', name: 'UAE Dirham', symbol: 'AED', exchangeRate: 1.0, isBase: true },
    { id: 'curr-2', code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 3.6725, isBase: false },
    { id: 'curr-3', code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', exchangeRate: 0.0132, isBase: false }
  ]);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const saved = localStorage.getItem('vintage_erp_logged_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // fallback
    }
    return {
      id: 'usr-admin-01',
      username: 'admin',
      email: 'admin@vintagevibe.ae',
      name: 'Muhammad',
      role: 'ADMIN',
      assignedShopId: 'Al Ain Main Branch',
      isActive: true
    };
  });

  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Global refresh handler to re-sync profile, currencies, and users directly from Supabase
  const refreshGlobalData = useCallback(async () => {
    try {
      const [profile, currs, users] = await Promise.all([
        CompanyProfileService.getCompanyProfile().catch(e => {
          console.warn('[GlobalSync] Profile fallback:', e?.message);
          return null;
        }),
        SetupService.getCurrencies().catch(e => {
          console.warn('[GlobalSync] Currencies fallback:', e?.message);
          return [];
        }),
        AuthService.getUsers().catch(e => {
          console.warn('[GlobalSync] Users fallback:', e?.message);
          return [];
        })
      ]);

      if (profile && (profile.companyName || profile.company_display_name)) {
        setCompanyProfile(profile);
        try {
          localStorage.setItem('vintage_cached_company_profile', JSON.stringify(profile));
        } catch {}
      }
      if (Array.isArray(currs) && currs.length > 0) setCurrencies(currs);
      if (Array.isArray(users) && users.length > 0) {
        setAllUsers(users);
        const found = users.find(u => u.id === currentUser.id || u.username?.toLowerCase() === currentUser.username?.toLowerCase());
        if (found) {
          setCurrentUser(found);
          try {
            localStorage.setItem('vintage_erp_logged_user', JSON.stringify(found));
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn('Global data sync notice (using resilient client state):', err?.message);
    }
  }, [currentUser.id, currentUser.username]);

  useEffect(() => {
    refreshGlobalData();

    const unsubscribe = CompanyProfileService.subscribeToMaintenanceChanges((newModules) => {
      setCompanyProfile(prev => ({
        ...prev,
        maintenance_modules: newModules,
        maintenanceModules: newModules
      }));
    });

    return () => {
      unsubscribe();
    };
  }, [refreshGlobalData]);

  // Auto-route to the first accessible tab if the current activeTab is restricted for this user
  useEffect(() => {
    if (currentUser && !isTabAccessible(activeTab, currentUser)) {
      const allowed = getAccessibleTabs(currentUser);
      if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    }
  }, [currentUser, activeTab]);

  const handleDownloadPdf = () => {
    const tabNames: Record<ActiveTab, string> = {
      dashboard: 'Executive KPI Summary & High-Density Dashboard',
      purchase: 'Purchase & Bale Inward Gate Pass Report',
      sales: 'Sales, Invoicing & Gate Pass Report',
      finance: 'Financial Statements, Trial Balance & Ledgers',
      ledger: 'General Ledger & Account Book Statement',
      parties: 'Parties & Customer Khata Statement',
      hr: 'HR, Staff Payroll & Attendance Register',
      setup: 'System Setup & Item Master Catalogue',
      audit: 'Enterprise Audit Trail & Immutable Log',
      access: 'Role-Based Access Control Register'
    };

    exportCurrentViewToPdf({
      title: tabNames[activeTab] || 'Enterprise Extract Report',
      companyName: companyProfile.companyName,
      trnTaxNo: companyProfile.trnTaxNo,
      address: `${companyProfile.addressLine1}, ${companyProfile.addressLine2}`,
      operatorName: `${currentUser.name} (${currentUser.role})`
    });
  };

  const renderViewContent = () => {
    // 1. If in dedicated streamer mobile host mode (/live-host/:boothId), render isolated mobile app    // 1. MOBILE LIVE SELLING STREAMER BROADCASTER VIEW
    if (liveHostState.isHostMode) {
      return (
        <SyncProvider onGlobalRefresh={refreshGlobalData}>
          <Suspense fallback={<ModuleLoadingFallback name="Live Host Terminal" />}>
            <MobileLiveHostView
              initialBoothId={liveHostState.boothId}
              onExitToERP={() => {
                window.history.pushState({}, '', '/');
                setLiveHostState({ isHostMode: false, boothId: 'booth-01' });
              }}
            />
          </Suspense>
        </SyncProvider>
      );
    }

    // 2. STAFF DEDICATED MOBILE APP VIEW (APK SHELL)
    if (currentView === 'staff-mobile') {
      return (
        <ErrorBoundary sectionName="Vintage Vibes Staff Mobile OS">
          <Suspense fallback={<ModuleLoadingFallback name="Staff Mobile App" />}>
            <StaffMobileAppView
              companyProfile={companyProfile}
              onExitToStore={() => {
                localStorage.setItem('vintage_app_view_mode', 'storefront');
                setCurrentView('storefront');
              }}
              onExitToDesktopERP={() => {
                localStorage.setItem('vintage_app_view_mode', 'erp');
                setCurrentView('erp');
              }}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    // Standalone Full-Screen Pop-up POS Register Window
    if (currentView === 'pos-standalone') {
      return (
        <SyncProvider onGlobalRefresh={refreshGlobalData}>
          <ErrorBoundary sectionName="Counter Sale Standalone POS Register">
            <div className="min-h-screen bg-slate-950 text-white flex flex-col p-2 sm:p-4">
              {/* Minimal Top Cashier Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 mb-2.5 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-xs sm:text-sm font-black tracking-widest text-amber-400 uppercase">
                    VINTAGE VIBES • FULLSCREEN CASH REGISTER TERMINAL
                  </span>
                  <span className="hidden sm:inline-block text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                    ● POS HARDWARE CONNECTED
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono">
                    Cashier: <strong className="text-white">{currentUser?.name || 'Counter Lead'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => window.close()}
                    className="px-3 py-1 bg-red-600/90 hover:bg-red-600 text-white rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    ✕ Close Window
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <Suspense fallback={<ModuleLoadingFallback name="POS Terminal" />}>
                  <CounterSalePOSTerminal
                    companyProfile={companyProfile}
                    operatorName={currentUser?.name || 'Cashier Lead'}
                    onRefreshAll={refreshGlobalData}
                    onSaleCompleted={refreshGlobalData}
                  />
                </Suspense>
              </div>
            </div>
          </ErrorBoundary>
        </SyncProvider>
      );
    }

    // Standalone OBS Studio Browser Source Live Stream Overlay (Transparent Canvas)
    if (currentView === 'live-overlay' || window.location.pathname === '/live-overlay') {
      return (
        <ErrorBoundary sectionName="OBS Studio Broadcast Live Overlay">
          <Suspense fallback={<ModuleLoadingFallback name="OBS Live Stream Overlay" />}>
            <LiveOBSOverlayView />
          </Suspense>
        </ErrorBoundary>
      );
    }

    // 3. FIRST PAGE (DEFAULT HOME): Luxury E-Commerce Public Boutique Storefront
    if (currentView === 'storefront') {
      return (
        <ErrorBoundary sectionName="Vintage Vibes Luxury Storefront">
          <Suspense fallback={<ModuleLoadingFallback name="Luxury Storefront" />}>
            <StorefrontView
              companyProfile={companyProfile}
              onOpenERPLogin={() => {
                if (isAuthenticated) {
                  localStorage.setItem('vintage_app_view_mode', 'erp');
                  setCurrentView('erp');
                } else {
                  setCurrentView('login');
                }
              }}
              onOpenStaffMobileApp={() => {
                localStorage.setItem('vintage_app_view_mode', 'staff-mobile');
                setCurrentView('staff-mobile');
              }}
              onInventoryMutated={refreshGlobalData}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    // 3. ERP Staff Login Screen
    if (currentView === 'login' || !isAuthenticated) {
      return (
        <ErrorBoundary sectionName="Vintage Vibes Operator Sign-In">
          <LoginScreen
            onLoginSuccess={user => {
              setCurrentUser(user);
              setIsAuthenticated(true);
              setSessionTimeoutMsg(null);
              localStorage.setItem('vintage_app_view_mode', 'erp');
              setCurrentView('erp');
              if (!isTabAccessible(activeTab, user)) {
                const allowed = getAccessibleTabs(user);
                if (allowed.length > 0) {
                  setActiveTab(allowed[0]);
                }
              }
            }}
            allUsers={allUsers}
            initialMessage={typeof sessionTimeoutMsg === 'string' ? sessionTimeoutMsg : null}
            onBackToStorefront={() => setCurrentView('storefront')}
          />
        </ErrorBoundary>
      );
    }

    return (
      <SyncProvider onGlobalRefresh={refreshGlobalData}>
      <div className="min-h-screen flex flex-col bg-[#FAF4E6] text-slate-800 font-sans antialiased selection:bg-amber-200 selection:text-amber-950">
        
        {/* 3D Brand Header with Animated Logo & Live Multi-User Sync Status */}
        <Header
          companyProfile={companyProfile}
          currencies={currencies}
          currentUser={currentUser}
          allUsers={allUsers.length > 0 ? allUsers : [currentUser]}
          onSwitchUser={user => {
            setCurrentUser(user);
            try {
              localStorage.setItem('vintage_erp_logged_user', JSON.stringify(user));
            } catch {}
            if (!isTabAccessible(activeTab, user)) {
              const allowed = getAccessibleTabs(user);
              if (allowed.length > 0) {
                setActiveTab(allowed[0]);
              }
            }
          }}
          onOpenWhatsAppModal={() => setIsWhatsAppModalOpen(true)}
          onNavigateTab={tab => setActiveTab(tab)}
          onLogout={handleLogout}
          onOpenStorefront={() => {
            localStorage.setItem('vintage_app_view_mode', 'storefront');
            setCurrentView('storefront');
          }}
          onOpenStaffMobile={() => {
            localStorage.setItem('vintage_app_view_mode', 'staff-mobile');
            setCurrentView('staff-mobile');
          }}
        />

        {/* Dubai Live Gold Souk, Forex Exchange & Inbound Cargo Marquee Ticker */}
        <DubaiLiveSoukTicker />

        {/* Main Tab Navigation */}
        <Navigation activeTab={activeTab} onSelectTab={setActiveTab} currentUser={currentUser} />

        {/* Full-Width Main Content Area - Unconstrained Edge-to-Edge Data Density */}
        <main id="main-content" className="flex-1 w-full max-w-none px-3 sm:px-6 lg:px-8 py-3.5 sm:py-4 text-left">
          {/* Top-Level KPI Summary Dashboard - Only visible on the main Executive Dashboard */}
          {activeTab === 'dashboard' && isTabAccessible('dashboard', currentUser) && (
            <ErrorBoundary sectionName="KPI Dashboard Bar">
              <DashboardKPIs
                activeTab={activeTab}
                onRefreshTrigger={refreshGlobalData}
                onTriggerDownloadPdf={handleDownloadPdf}
                onNavigateTab={tab => setActiveTab(tab)}
              />
            </ErrorBoundary>
          )}

          <Suspense fallback={<ModuleLoadingFallback name={activeTab.toUpperCase()} />}>
            {activeTab === 'dashboard' && isTabAccessible('dashboard', currentUser) && (
              <ErrorBoundary sectionName="Executive Dashboard">
                <MainDashboardView
                  onNavigateTab={tab => setActiveTab(tab as ActiveTab)}
                  currentUser={currentUser}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'purchase' && (
              <ErrorBoundary sectionName="Purchase & Container Inward Module">
                <PurchaseView
                  onRefreshAll={refreshGlobalData}
                  currentUserRole={currentUser.role}
                  maintenanceModules={companyProfile.maintenance_modules}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'sales' && (
              <ErrorBoundary sectionName="Sales, Barcode & Dispatch Module">
                <ModuleMaintenanceGuard
                  moduleKey="sales"
                  moduleName="Sales & Dispatch Terminal"
                  currentUserRole={currentUser.role}
                  maintenanceModules={companyProfile.maintenance_modules}
                >
                  <SalesView
                    onRefreshAll={refreshGlobalData}
                    currentUserRole={currentUser.role}
                    onSubTabChange={(tab) => setIsLiveStudioActive(tab === 'liveSelling')}
                  />
                </ModuleMaintenanceGuard>
              </ErrorBoundary>
            )}
            {activeTab === 'marketing' && (
              <ErrorBoundary sectionName="Marketing & AI Automation Module">
                <MarketingAutomationView
                  onRefreshAll={refreshGlobalData}
                  currentUserRole={currentUser.role}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'finance' && (
              <ErrorBoundary sectionName="Financial Accounts & COA Module">
                <FinanceView
                  onRefreshAll={refreshGlobalData}
                  currentUserRole={currentUser.role}
                  initialSubTab={currentUser.role === 'ADMIN' ? 'coa' : 'vouchers'}
                  maintenanceModules={companyProfile.maintenance_modules}
                  companyProfile={companyProfile}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'ledger' && (
              <ErrorBoundary sectionName="General Ledger & Vouchers Module">
                <FinanceView
                  onRefreshAll={refreshGlobalData}
                  currentUserRole={currentUser.role}
                  initialSubTab="ledger"
                  maintenanceModules={companyProfile.maintenance_modules}
                  companyProfile={companyProfile}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'parties' && (
              <ErrorBoundary sectionName="Parties & Khata Ledger Module">
                <PartiesView onRefreshAll={refreshGlobalData} currentUserRole={currentUser.role} />
              </ErrorBoundary>
            )}
            {activeTab === 'hr' && (
              <ErrorBoundary sectionName="HR, Vault & Payroll Module">
                <ModuleMaintenanceGuard
                  moduleKey="hr_payroll"
                  moduleName="HR & Payroll Vault"
                  currentUserRole={currentUser.role}
                  maintenanceModules={companyProfile.maintenance_modules}
                >
                  <HRView onRefreshAll={refreshGlobalData} currentUserRole={currentUser.role} />
                </ModuleMaintenanceGuard>
              </ErrorBoundary>
            )}
            {activeTab === 'setup' && (
              !isTabAccessible('setup', currentUser) ? (
                <AccessDeniedNotice
                  moduleName="Global Master Setup & Configuration"
                  currentRole={currentUser.role}
                  onGoDashboard={() => {
                    const allowed = getAccessibleTabs(currentUser);
                    setActiveTab(allowed[0] || 'sales');
                  }}
                />
              ) : (
                <ErrorBoundary sectionName="Master Setup & Configuration Module">
                  <SetupView onRefreshAll={refreshGlobalData} currentUserRole={currentUser.role} />
                </ErrorBoundary>
              )
            )}
            {activeTab === 'audit' && (
              <ErrorBoundary sectionName="System Audit Trail & Compliance Module">
                <AuditView onRefreshAll={refreshGlobalData} currentUserRole={currentUser.role} />
              </ErrorBoundary>
            )}
            {activeTab === 'access' && (
              !isTabAccessible('access', currentUser) ? (
                <AccessDeniedNotice
                  moduleName="Access Control & Authority Matrix (RBAC)"
                  currentRole={currentUser.role}
                  onGoDashboard={() => {
                    const allowed = getAccessibleTabs(currentUser);
                    setActiveTab(allowed[0] || 'sales');
                  }}
                />
              ) : (
                <ErrorBoundary sectionName="RBAC Access Control Module">
                  <AccessControlView onRefreshAll={refreshGlobalData} currentUserRole={currentUser.role} />
                </ErrorBoundary>
              )
            )}
          </Suspense>
        </main>

        {/* Full-Width Enterprise Footer */}
        <footer className="bg-[#FAF4E6] border-t border-amber-300/70 p-2.5 px-3 sm:px-6 lg:px-8 text-xs text-slate-600 font-mono w-full">
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">Vintage Vibe ERP</span>
              <span className="text-amber-400">•</span>
              <span className="text-amber-900/80 font-medium">Relational SQL Core Engine</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-600">
                TRN: {companyProfile.trnTaxNo} | Workflows: Draft / Posted / Unposted Audit Trail
              </span>
              <button
                onClick={() => handleLogout()}
                className="text-[10px] text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Lock / Sign Out
              </button>
            </div>
          </div>
        </footer>

        {/* WhatsApp Daily Summary Modal */}
        <WhatsAppModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
        />

        {/* Subtle Luxury Golden Starlight Cursor Dust Particle Trail */}
        <GoldenCursorDust />
      </div>
    </SyncProvider>
    );
  };

  return (
    <>
      {renderViewContent()}
      {currentView !== 'live-overlay' && <IOSInstallBanner />}
      <PWAUpdatePrompt />
    </>
  );
}

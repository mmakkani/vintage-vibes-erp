import React, { useState } from 'react';
import { CompanyProfile, CurrencyItem } from '../modules/setup/setup.types.ts';
import { User } from '../modules/auth/auth.types.ts';
import { MessageSquare, Shield, RefreshCw, Sparkles, Building2, MapPin, ReceiptText, LogOut } from 'lucide-react';
import { GlobalSearchBar } from './GlobalSearchBar.tsx';
import { Vintage3DLogo } from './Vintage3DLogo.tsx';
import { CompanyName3D } from './CompanyName3D.tsx';
import { LuxuryCarClock3D } from './LuxuryCarClock3D.tsx';
import { DubaiWeatherPod } from './DubaiWeatherPod.tsx';
import { VipThemeToggle } from './VipThemeToggle.tsx';
import { GoldCoinFlipper3D } from './GoldCoinFlipper3D.tsx';
import { ActiveTab } from './Navigation.tsx';
import { useSync } from '../context/SyncContext.tsx';

interface HeaderProps {
  companyProfile: CompanyProfile;
  currencies: CurrencyItem[];
  currentUser: User;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  onOpenWhatsAppModal: () => void;
  onNavigateTab?: (tab: ActiveTab, entityId?: string) => void;
  onLogout?: () => void;
  onOpenStorefront?: () => void;
  onOpenStaffMobile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  companyProfile,
  currencies,
  currentUser,
  allUsers,
  onSwitchUser,
  onOpenWhatsAppModal,
  onNavigateTab,
  onLogout,
  onOpenStorefront,
  onOpenStaffMobile
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const { isLiveConnected, activeClientsCount, lastSyncedAt, isSyncing, triggerGlobalSync } = useSync();

  return (
    <header id="main-enterprise-header" className="w-full bg-gradient-to-r from-[#FDF9EE]/95 via-[#F5ECCE]/95 to-[#FAF4E6]/95 backdrop-blur-md text-slate-900 px-3 sm:px-5 lg:px-6 py-2.5 sm:py-3 border-b-2 border-amber-400/80 shadow-md flex flex-col md:flex-row justify-between items-center z-20 gap-3">
      {/* Left: 3D Logo + Luxury Dash Clock + 3D Brand Title + Address & TRN */}
      <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Left Visual Identity: 3D Logo + 3D Rolls-Royce Dash Clock */}
          <div className="flex items-center gap-2 shrink-0">
            <Vintage3DLogo
              size="lg"
              interactive={true}
              className="w-12 h-12 sm:w-14 sm:h-14 lg:w-15 lg:h-15 drop-shadow-sm"
            />
            {/* Rolls-Royce 3D Luxury Analog Dash Clock (Placed securely on Left, fits header perfectly) */}
            <div className="hidden sm:flex items-center">
              <LuxuryCarClock3D size="sm" />
            </div>
          </div>

          {/* Luxury Brand Title + Sub-Title & Credentials */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col justify-center">
              <CompanyName3D
                name={companyProfile.company_display_name || companyProfile.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'}
                size="md"
              />
              <div
                id="address-sub-header"
                className="text-[10.5px] sm:text-xs text-slate-700 font-semibold flex items-center gap-1.5 sm:gap-2 flex-wrap mt-0.5"
              >
                <span className="inline-block px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                  {(companyProfile.city || 'AL AIN, ABU DHABI').toUpperCase()} • {(companyProfile.country || 'UAE').toUpperCase()}
                </span>
                <span className="text-amber-950 font-bold hidden lg:inline">
                  {companyProfile.address_line_1 || companyProfile.addressLine1 || 'AL AIN, ABU DHABI'}
                </span>
                <span className="text-amber-600 font-bold hidden lg:inline">•</span>
                <span className="font-mono bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 rounded text-amber-950 font-bold tracking-tight shadow-2xs text-[10px]">
                  TRN: {companyProfile.trn_number || companyProfile.trnTaxNo}
                </span>
              </div>
            </div>

            {/* Dubai Live Meteorological & Executive Greeting Pod */}
            <div className="hidden 2xl:flex items-center pl-3 border-l border-amber-300/80">
              <DubaiWeatherPod userName={currentUser.name} />
            </div>
          </div>
        </div>
      </div>

      {/* Center: Global Persistent Search Bar across Invoices, Parties, Inventory */}
      <div className="w-full md:w-64 lg:w-80 xl:w-96 order-3 md:order-2 flex justify-center">
        <GlobalSearchBar onNavigate={(tab, id) => onNavigateTab?.(tab, id)} />
      </div>

      {/* Right: Professionally Arranged Action & Status Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 w-full md:w-auto justify-end order-2 md:order-3 shrink-0 flex-wrap sm:flex-nowrap">
        {/* 24K UAE Royal Gold Coin Flipper Widget */}
        <div className="hidden 2xl:flex items-center">
          <GoldCoinFlipper3D />
        </div>

        {/* Section 1: Live Sync & Currencies Status */}
        <div className="flex items-center gap-1.5">
          {/* Base Currency AED + Live Rates */}
          <div className="hidden xl:flex flex-col items-end mr-1 text-[10px]">
            <span className="text-amber-900 uppercase font-black text-[8.5px] tracking-wider">Base: AED</span>
            <div className="font-mono flex items-center gap-1 mt-0.5">
              {currencies.slice(0, 2).map(c => (
                <span key={c.code} className="inline-flex items-center gap-0.5 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 text-amber-950 font-bold text-[10px] shadow-2xs">
                  <span className="text-amber-800">{c.code}:</span>
                  <span>{c.exchangeRate}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Multi-User Real-time Sync Status Pill */}
          <button
            id="btn-multiuser-sync-status"
            type="button"
            onClick={() => triggerGlobalSync()}
            title={`Multi-User Live SSE Stream: ${isLiveConnected ? 'Connected' : 'Reconnecting'}. Click to force instant database sync.`}
            className={`h-8.5 px-2.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              isLiveConnected
                ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/70 hover:bg-emerald-900'
                : 'bg-amber-950/85 text-amber-300 border-amber-500/70 hover:bg-amber-900'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isLiveConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isLiveConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="hidden sm:inline text-[11px] font-bold">
              {isLiveConnected ? 'Live' : 'Offline'}
            </span>
            <span className="text-[10px] opacity-90 px-1 py-0.2 rounded bg-black/30 font-sans">
              {activeClientsCount} {activeClientsCount === 1 ? 'user' : 'users'}
            </span>
            <RefreshCw
              className={`w-3 h-3 text-emerald-300 ${isSyncing ? 'animate-spin' : 'hover:rotate-180 transition-transform'}`}
            />
          </button>
        </div>

        <div className="hidden sm:block h-6 w-[1px] bg-amber-300/80"></div>

        {/* Section 2: Quick Business Actions (WhatsApp & Boutique Storefront) */}
        <div className="flex items-center gap-1.5">
          {/* WhatsApp Daily Summary Action */}
          <button
            id="btn-whatsapp-daily-summary"
            onClick={onOpenWhatsAppModal}
            className="btn-3d btn-3d-slate h-8.5 px-2.5 sm:px-3 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-emerald-100 hidden sm:inline">WhatsApp</span>
          </button>

          {/* Boutique Storefront (Public View) */}
          {onOpenStorefront && (
            <button
              type="button"
              id="btn-header-view-storefront"
              onClick={() => onOpenStorefront()}
              title="View Public Customer Boutique Storefront"
              className="btn-3d btn-3d-amber h-8.5 px-2.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-950 shrink-0" />
              <span className="hidden md:inline">Storefront</span>
            </button>
          )}
        </div>

        <div className="hidden sm:block h-6 w-[1px] bg-amber-300/80"></div>

        {/* Section 3: Profile, VIP Theme & Security */}
        <div className="flex items-center gap-1.5">
          {/* VIP Obsidian Theme & Audio Sound Toggle */}
          <VipThemeToggle />

          {/* Role / User Switcher */}
          <div className="relative">
            <button
              id="btn-user-role-menu"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="btn-3d btn-3d-amber h-8.5 px-2.5 sm:px-3 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5 text-amber-950 shrink-0" />
              <div className="text-left leading-tight">
                <div className="font-black text-amber-950 text-[11px] sm:text-xs">
                  {(currentUser.name || currentUser.username || 'ADMIN').toUpperCase()}
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/15 text-amber-950 font-mono font-black border border-amber-500/40">
                {(currentUser.role || 'ADMIN').toUpperCase()}
              </span>
            </button>

            {/* User Dropdown */}
            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-[#FAF4E6] text-slate-900 rounded-xl shadow-2xl border border-amber-400 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 border-b border-amber-200 text-[10px] font-bold text-amber-900 uppercase tracking-widest flex items-center justify-between bg-amber-100/50">
                  <span>Switch Operator Account</span>
                  <span className="text-[9px] text-amber-700">RBAC Supabase</span>
                </div>
                {allUsers.map(user => (
                  <button
                    key={user.id}
                    id={`switch-user-${user.id}`}
                    onClick={() => {
                      onSwitchUser(user);
                      setShowUserDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-amber-100 transition-colors cursor-pointer ${
                      currentUser.id === user.id ? 'bg-amber-200/80 font-bold text-amber-950 border-l-2 border-amber-600' : 'text-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{user.name || user.username}</div>
                      <div className="text-[10px] text-slate-600">@{user.username || user.email}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white text-amber-900 font-mono font-bold uppercase border border-amber-300">
                      {user.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sign Out / Lock System */}
          {onLogout && (
            <button
              id="btn-header-logout"
              onClick={() => onLogout()}
              title="Sign Out / Lock System"
              className="btn-3d btn-3d-red h-8.5 px-2.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

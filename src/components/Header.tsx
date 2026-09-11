import React, { useState } from 'react';
import { CompanyProfile, CurrencyItem } from '../modules/setup/setup.types.ts';
import { User } from '../modules/auth/auth.types.ts';
import { MessageSquare, Shield, RefreshCw, Sparkles, Building2, MapPin, ReceiptText, LogOut, Smartphone } from 'lucide-react';
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
    <header id="main-enterprise-header" className="w-full bg-gradient-to-r from-[#FDF9EE]/92 via-[#F5ECCE]/92 to-[#FAF4E6]/92 backdrop-blur-md text-slate-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 border-b-2 border-amber-400/80 shadow-xl flex flex-col md:flex-row justify-between items-center z-20 gap-3">
      {/* Left: 3D Logo + 3D Title + Address Sub-Header */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-5">
          {/* Animated 3D Gold Medal Emblem */}
          <div className="relative flex items-center justify-center shrink-0 py-1">
            <Vintage3DLogo
              size="2xl"
              interactive={true}
              className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32 drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]"
            />
          </div>

          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <CompanyName3D name={companyProfile.companyName} size="lg" />
                <span className="inline-block px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                  DUBAI UAE • FREE ZONE
                </span>
              </div>
              <p
                id="address-sub-header"
                className="text-[11px] sm:text-xs text-slate-700 tracking-wider font-semibold flex items-center gap-1.5 flex-wrap mt-0.5"
              >
                <span className="text-amber-950 font-bold">{companyProfile.addressLine1}</span>
                <span className="text-amber-600 font-bold">•</span>
                <span className="font-mono bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded text-amber-950 font-bold tracking-tight shadow-2xs">
                  TRN: {companyProfile.trnTaxNo}
                </span>
              </p>
            </div>

            {/* Bentley / Rolls-Royce 3D Luxury Analog Dash Clock (Draggable anywhere) */}
            <div className="hidden sm:flex items-center pl-2 border-l border-amber-300/80">
              <LuxuryCarClock3D size="lg" />
            </div>

            {/* Dubai Live Meteorological & Executive Greeting Pod */}
            <div className="hidden xl:flex items-center pl-2">
              <DubaiWeatherPod userName={currentUser.name} />
            </div>
          </div>
        </div>
      </div>

      {/* Center: Global Persistent Search Bar across Invoices, Parties, Inventory */}
      <div className="w-full md:w-72 lg:w-96 order-3 md:order-2 flex justify-center">
        <GlobalSearchBar onNavigate={(tab, id) => onNavigateTab?.(tab, id)} />
      </div>

      {/* Right: Currency summary, WhatsApp digest, User Role switch */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-[11px] w-full md:w-auto justify-end order-2 md:order-3">
        {/* 24K UAE Royal Gold Coin Flipper Widget */}
        <div className="hidden 2xl:flex items-center">
          <GoldCoinFlipper3D />
        </div>

        {/* VIP Obsidian Theme & Audio Sound Toggle */}
        <VipThemeToggle />

        {/* Currencies breakdown */}
        <div className="hidden lg:flex flex-col items-end mr-1">
          <span className="text-amber-900 uppercase font-bold text-[9px] tracking-wider">Base Currency: AED</span>
          <div className="font-mono text-xs flex items-center gap-1.5 mt-0.5">
            {currencies.map(c => (
              <span key={c.code} className="inline-flex items-center gap-1 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 text-amber-950 font-semibold shadow-2xs">
                <span className="text-amber-800 font-bold">{c.code}:</span>
                <span className="font-mono">{c.exchangeRate}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="hidden lg:block h-7 w-[1px] bg-amber-300/80"></div>

        {/* WhatsApp Daily Summary Action (3D Button) */}
        <button
          id="btn-whatsapp-daily-summary"
          onClick={onOpenWhatsAppModal}
          className="btn-3d btn-3d-slate px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-300" />
          <span className="text-emerald-100">WhatsApp Digest</span>
        </button>

        {/* Multi-User Real-time Sync Status Pill */}
        <button
          id="btn-multiuser-sync-status"
          type="button"
          onClick={() => triggerGlobalSync()}
          title={`Multi-User Live SSE Stream: ${isLiveConnected ? 'Connected' : 'Reconnecting'}. Click to force instant database sync.`}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
            isLiveConnected
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/70 hover:bg-emerald-900'
              : 'bg-amber-950/80 text-amber-300 border-amber-500/70 hover:bg-amber-900'
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
            {isLiveConnected ? 'Live Sync' : 'Reconnecting'}
          </span>
          <span className="text-[10px] opacity-85 px-1 py-0.2 rounded bg-black/30">
            {activeClientsCount} {activeClientsCount === 1 ? 'user' : 'users'}
          </span>
          <RefreshCw
            className={`w-3 h-3 ml-0.5 text-emerald-300 ${isSyncing ? 'animate-spin' : 'hover:rotate-180 transition-transform'}`}
          />
        </button>

        {/* Role / User Switcher (3D Button) */}
        <div className="relative">
          <button
            id="btn-user-role-menu"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="btn-3d btn-3d-amber px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2"
          >
            <Shield className="w-3.5 h-3.5 text-white" />
            <div className="text-left leading-tight">
              <div className="font-black text-white">{currentUser.name.split(' ')[0]}</div>
              <div className="text-[9px] text-amber-100 font-mono tracking-tight font-bold">{currentUser.role}</div>
            </div>
            <RefreshCw className="w-3 h-3 text-amber-200 ml-0.5" />
          </button>

          {/* User Dropdown */}
          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-64 bg-[#FAF4E6] text-slate-900 rounded-xl shadow-2xl border border-amber-400 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-1.5 border-b border-amber-200 text-[10px] font-bold text-amber-900 uppercase tracking-widest flex items-center justify-between bg-amber-100/50">
                <span>Switch Operator Role</span>
                <span className="text-[9px] text-amber-700">RBAC Secure</span>
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
                    <div className="font-bold text-slate-900">{user.name}</div>
                    <div className="text-[10px] text-slate-600">{user.email}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white text-amber-900 font-mono font-bold uppercase border border-amber-300">
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Switch to Staff Mobile App (APK View) */}
        {onOpenStaffMobile && (
          <button
            type="button"
            id="btn-header-view-staff-mobile"
            onClick={() => onOpenStaffMobile()}
            title="Open Dedicated Staff Mobile App (Camera, 5-Booth Live & Orders)"
            className="btn-3d btn-3d-slate px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 text-amber-300"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">📱 Staff App</span>
          </button>
        )}

        {/* View Public Boutique Storefront */}
        {onOpenStorefront && (
          <button
            type="button"
            id="btn-header-view-storefront"
            onClick={() => onOpenStorefront()}
            title="View Public Customer Boutique Storefront"
            className="btn-3d btn-3d-amber px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-950" />
            <span className="hidden sm:inline">🛍️ Storefront</span>
          </button>
        )}

        {/* Sign Out / Exit to Login Screen (3D Button) */}
        {onLogout && (
          <button
            id="btn-header-logout"
            onClick={() => onLogout()}
            title="Sign Out / Lock System"
            className="btn-3d btn-3d-red px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Sign Out</span>
          </button>
        )}
      </div>
    </header>
  );
};

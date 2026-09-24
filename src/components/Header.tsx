import React, { useState } from 'react';
import { CompanyProfile, CurrencyItem } from '../modules/setup/setup.types.ts';
import { User } from '../modules/auth/auth.types.ts';
import { MessageSquare, Shield, RefreshCw, Sparkles, Building2, MapPin, ReceiptText, LogOut, Users, Smartphone, Laptop, Tv } from 'lucide-react';
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
  allUsers?: User[];
  onSwitchUser?: (user: User) => void;
  onOpenWhatsAppModal: () => void;
  onNavigateTab?: (tab: ActiveTab, entityId?: string) => void;
  onLogout?: () => void;
  onOpenStorefront?: () => void;
  onOpenStaffMobile?: () => void;
  onOpenExecutiveTerminal?: () => void;
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
  onOpenStaffMobile,
  onOpenExecutiveTerminal
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);
  const { isLiveConnected, activeClientsCount, onlineUsers, refreshPresence, lastSyncedAt, isSyncing, triggerGlobalSync } = useSync();

  return (
    <header id="main-enterprise-header" className="relative z-50 w-full bg-gradient-to-r from-[#FDF9EE]/95 via-[#F5ECCE]/95 to-[#FAF4E6]/95 backdrop-blur-md text-slate-900 px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 border-b-2 border-amber-400/80 shadow-md flex flex-col xl:flex-row justify-between items-center gap-3">
      {/* Left: Grand 3D Logo (Enlarged & Majestic) + 3D Corporate Brand Title & TRN */}
      <div className="flex items-center gap-3.5 sm:gap-4 w-full xl:w-auto justify-between xl:justify-start shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Animated 3D Gold Medal Emblem (Bigger & Majestic) */}
          <div className="relative flex items-center justify-center shrink-0">
            <Vintage3DLogo
              size="2xl"
              interactive={true}
              className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 drop-shadow-[0_8px_16px_rgba(0,0,0,0.22)] transition-transform hover:scale-105"
            />
          </div>

          {/* Luxury Brand Title + Sub-Title & Credentials */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col justify-center">
              <CompanyName3D
                name={companyProfile.company_display_name || companyProfile.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'}
                size="lg"
              />
              <div
                id="address-sub-header"
                className="text-[10.5px] sm:text-xs text-slate-700 font-semibold flex items-center gap-1.5 sm:gap-2 flex-wrap mt-1"
              >
                <span className="hidden sm:inline-block px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                  {(companyProfile.city || 'AL AIN, ABU DHABI').toUpperCase()} • {(companyProfile.country || 'UNITED ARAB EMIRATES').toUpperCase()}
                </span>
                <span className="text-amber-950 font-bold hidden md:inline">
                  {companyProfile.address_line_1 || companyProfile.addressLine1 || 'AL AIN, ABU DHABI'}
                </span>
                <span className="text-amber-600 font-bold hidden md:inline">•</span>
                <span className="hidden md:inline-flex font-mono bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded text-amber-950 font-bold tracking-tight shadow-2xs text-[10px]">
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
      <div className="w-full md:w-64 lg:w-72 xl:w-80 order-3 xl:order-2 flex justify-center">
        <GlobalSearchBar onNavigate={(tab, id) => onNavigateTab?.(tab, id)} />
      </div>

      {/* Right: 3D Analog Clock + 2-Row Stacked Executive Controls (Upar Neechay to save horizontal space) */}
      <div className="flex items-center gap-2 sm:gap-3.5 w-full xl:w-auto justify-between sm:justify-end order-2 xl:order-3 shrink-0 flex-wrap sm:flex-nowrap">
        
        {/* Two-Row Button Stack (Row 1: Online Status & Rates; Row 2: Actions & User) */}
        <div className="flex flex-col gap-1.5 items-end justify-center w-full sm:w-auto">
          {/* Top Row: Real-time Online Users + Base Currency Rates + Theme */}
          <div className="flex items-center gap-1.5 sm:gap-2 justify-end w-full sm:w-auto">
            {/* Multi-User Real-time Sync & Live Online Users Beacon */}
            <div className="relative">
              <button
                id="btn-multiuser-sync-status"
                type="button"
                onClick={() => {
                  setShowOnlineDropdown(prev => !prev);
                  refreshPresence?.();
                }}
                title={`Live Multi-User Cloud Sync: ${activeClientsCount} active user(s) online. Click to see all logged-in operators.`}
                className={`h-7 px-2 sm:px-2.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer shadow-2xs ${
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
                <span className="font-sans font-black tracking-wide text-emerald-200 text-[10px] sm:text-[11px]">
                  {activeClientsCount} <span className="hidden sm:inline">Online</span>
                </span>
                <RefreshCw
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerGlobalSync();
                    refreshPresence?.();
                  }}
                  title="Force Instant Database Sync"
                  className={`w-2.5 h-2.5 text-emerald-300 hover:text-white transition-transform ${isSyncing ? 'animate-spin' : 'hover:rotate-180'}`}
                />
              </button>

              {/* Online Users List Dropdown (PostgreSQL Verified) */}
              {showOnlineDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowOnlineDropdown(false)}
                  />
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 sm:w-80 bg-[#FAF4E6] text-slate-900 rounded-xl shadow-2xl border border-emerald-500/70 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 font-sans">
                    <div className="px-3 py-2 border-b border-amber-200 flex items-center justify-between bg-emerald-950 text-emerald-300 rounded-t-lg -mt-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Live Operators ({onlineUsers && onlineUsers.length > 0 ? onlineUsers.length : activeClientsCount})</span>
                      </div>
                      <span className="text-[9px] font-mono uppercase bg-emerald-900/80 px-1.5 py-0.5 rounded text-emerald-200 border border-emerald-600/40">
                        PostgreSQL Live
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto px-2 space-y-1.5 divide-y divide-amber-100">
                      {(onlineUsers && onlineUsers.length > 0 ? onlineUsers : [
                        {
                          session_id: 'current',
                          username: currentUser.username || currentUser.name,
                          display_name: currentUser.name || currentUser.username,
                          role: currentUser.role,
                          device_type: typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile Device' : 'Desktop / PC',
                          ip_address: 'Connected (PostgreSQL)',
                          last_heartbeat: new Date().toISOString()
                        }
                      ]).map((u, idx) => {
                        const isMobile = /mobile|phone|ios|android/i.test(u.device_type || '');
                        const isCurrent = u.username === currentUser.username || (!u.username && idx === 0);
                        return (
                          <div key={u.session_id || idx} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-amber-100/70 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="relative shrink-0">
                                <div className="w-7 h-7 rounded-full bg-emerald-200 text-emerald-900 font-black text-xs flex items-center justify-center uppercase border border-emerald-400">
                                  {(u.display_name || u.username || 'U')[0]}
                                </div>
                                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                                  <span>{u.display_name || u.username}</span>
                                  {isCurrent && (
                                    <span className="text-[9px] text-emerald-700 font-semibold">(You)</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                                  {isMobile ? <Smartphone className="w-2.5 h-2.5 text-blue-600" /> : <Laptop className="w-2.5 h-2.5 text-purple-600" />}
                                  <span className="truncate">{u.device_type || 'Terminal'}</span>
                                  {(u.city || u.country) && (
                                    <>
                                      <span>•</span>
                                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-amber-900 bg-amber-100/80 px-1 py-0.2 rounded border border-amber-300">
                                        <MapPin className="w-2 h-2 text-amber-700" />
                                        <span>{u.city ? `${u.city}${u.country ? `, ${u.country}` : ''}` : (u.country || 'Dubai, AE')}</span>
                                      </span>
                                    </>
                                  )}
                                  {u.ip_address && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono text-[9px] text-slate-600 truncate">{u.ip_address}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase font-mono bg-amber-100 text-amber-900 border border-amber-300">
                              {u.role || 'USER'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 pt-2 px-3 border-t border-amber-200 flex items-center justify-between text-[10px] text-slate-500 bg-amber-50/50 -mb-2 rounded-b-lg">
                      <span className="font-mono text-[9px]">
                        Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          triggerGlobalSync();
                          refreshPresence?.();
                        }}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>Refresh Now</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Base Currency AED + Live Rates */}
            <div className="hidden sm:flex items-center gap-1 text-[9.5px] font-mono bg-amber-100/90 border border-amber-300/90 rounded-lg px-2 py-0.5 shadow-2xs">
              <span className="text-amber-900 font-bold uppercase text-[8.5px]">Base: AED</span>
              {currencies.slice(0, 2).map(c => (
                <span key={c.code} className="inline-flex items-center gap-0.5 text-amber-950 font-bold">
                  <span className="text-amber-800 text-[8.5px]">{c.code}:</span>
                  <span>{c.exchangeRate}</span>
                </span>
              ))}
            </div>

            {/* VIP Theme Toggle */}
            <VipThemeToggle />

            {/* 24K UAE Royal Gold Coin Flipper Widget */}
            <div className="hidden 2xl:flex items-center">
              <GoldCoinFlipper3D />
            </div>
          </div>

          {/* Bottom Row: WhatsApp Digest + Storefront + User Profile + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 justify-end w-full sm:w-auto">
            {/* WhatsApp Daily Summary Action */}
            <button
              id="btn-whatsapp-daily-summary"
              onClick={onOpenWhatsAppModal}
              title="Daily Executive WhatsApp Summary"
              className="btn-3d btn-3d-slate h-7 px-2 sm:px-2.5 text-[10.5px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200"
            >
              <MessageSquare className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-emerald-100 hidden sm:inline">WhatsApp</span>
            </button>

            {/* Boutique Storefront (Public View) */}
            {onOpenStorefront && (
              <button
                type="button"
                id="btn-header-view-storefront"
                onClick={() => onOpenStorefront()}
                title="View Public Customer Boutique Storefront"
                className="btn-3d btn-3d-amber h-7 px-2 sm:px-2.5 text-[10.5px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-amber-950 shrink-0" />
                <span className="hidden sm:inline">Storefront</span>
              </button>
            )}

            {/* Executive Wall-Street TV Command Center */}
            {onOpenExecutiveTerminal && (
              <button
                type="button"
                id="btn-header-executive-terminal"
                onClick={onOpenExecutiveTerminal}
                title="Launch Fullscreen Executive Wall-Street TV Command Center (Shortcut: Shift + E)"
                className="hidden lg:flex btn-3d btn-3d-slate h-7 px-2.5 text-[10.5px] font-black uppercase tracking-wider rounded-lg items-center gap-1.5 text-amber-300 hover:text-amber-200 border border-amber-500/50 shadow-xs"
              >
                <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                <span className="font-mono">TV Desk</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono hidden md:inline">⇧E</span>
              </button>
            )}

            {/* Role / User Switcher */}
            <div className="relative">
              <button
                id="btn-user-role-menu"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="btn-3d btn-3d-amber h-7 px-2 sm:px-2.5 text-[10.5px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 sm:gap-1.5 max-w-[120px] sm:max-w-none"
              >
                <Shield className="w-3 h-3 text-amber-950 shrink-0" />
                <span className="font-black text-amber-950 truncate max-w-[65px] sm:max-w-none text-[10px] sm:text-[10.5px]">
                  {(currentUser.name || currentUser.username || 'ADMIN').toUpperCase()}
                </span>
                <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-950/15 text-amber-950 font-mono font-black border border-amber-500/40 hidden sm:inline">
                  {(currentUser.role || 'ADMIN').toUpperCase()}
                </span>
              </button>

              {/* User Dropdown */}
              {showUserDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 bg-[#FAF4E6] text-slate-900 rounded-xl shadow-2xl border border-amber-400 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-1.5 border-b border-amber-200 text-[10px] font-bold text-amber-900 uppercase tracking-widest flex items-center justify-between bg-amber-100/50">
                      <span>CURRENT OPERATOR PROFILE</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold border border-emerald-300">ACTIVE</span>
                    </div>

                    {/* Single Current User Profile Card */}
                    <div className="p-3 text-xs bg-amber-50/80">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-slate-900 text-sm truncate">
                            {currentUser.name || currentUser.username || 'Operator'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 mt-0.5 truncate">
                            @{currentUser.username || currentUser.email || 'operator'}
                          </div>
                          {currentUser.email && currentUser.email !== currentUser.username && (
                            <div className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                              {currentUser.email}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white text-amber-950 font-mono font-black uppercase border border-amber-300 shadow-xs shrink-0">
                          {currentUser.role || 'OPERATOR'}
                        </span>
                      </div>

                      {currentUser.assignedShopId && (
                        <div className="text-[11px] text-amber-900 mt-2.5 pt-2 border-t border-amber-200/60 flex items-center gap-1.5 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span className="truncate">{currentUser.assignedShopId}</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-amber-200 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserDropdown(false);
                          window.dispatchEvent(new CustomEvent('open_ios_install_guide'));
                        }}
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-amber-100 text-amber-950 font-bold transition-colors cursor-pointer"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Install App / iOS Guide</span>
                      </button>
                    </div>
                  </div>
              </>
            )}
            </div>

            {/* Sign Out / Lock System */}
            {onLogout && (
              <button
                id="btn-header-logout"
                onClick={() => onLogout()}
                title="Sign Out / Lock System"
                className="btn-3d btn-3d-red h-7 px-2 text-[10.5px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1"
              >
                <LogOut className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Rolls-Royce 3D Luxury Analog Dash Clock (Moved to Right Side, Draggable anywhere) */}
        <div className="hidden sm:flex items-center pl-2.5 border-l border-amber-300/80">
          <LuxuryCarClock3D size="md" />
        </div>
      </div>
    </header>
  );
};

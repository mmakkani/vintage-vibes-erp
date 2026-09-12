import React, { useState, useEffect } from 'react';
import { Settings, Wrench, ShieldAlert, KeyRound, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { MaintenanceModuleKey } from '../modules/setup/setup.types.ts';

interface ModuleMaintenanceGuardProps {
  moduleKey: MaintenanceModuleKey;
  moduleName: string;
  currentUserRole?: string;
  maintenanceModules?: Record<string, boolean>;
  children: React.ReactNode;
}

export const ModuleMaintenanceGuard: React.FC<ModuleMaintenanceGuardProps> = ({
  moduleKey,
  moduleName,
  currentUserRole,
  maintenanceModules,
  children
}) => {
  const isMaintenanceActive = Boolean(maintenanceModules?.[moduleKey]);
  const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN';

  const [isBypassed, setIsBypassed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(`vintage_maint_bypass_${moduleKey}`) === 'true';
    } catch {
      return false;
    }
  });

  // If maintenance is turned OFF, clear any previous bypass flag
  useEffect(() => {
    if (!isMaintenanceActive) {
      try {
        sessionStorage.removeItem(`vintage_maint_bypass_${moduleKey}`);
      } catch {}
      setIsBypassed(false);
    }
  }, [isMaintenanceActive, moduleKey]);

  const handleBypassToggle = (bypass: boolean) => {
    try {
      if (bypass) {
        sessionStorage.setItem(`vintage_maint_bypass_${moduleKey}`, 'true');
      } else {
        sessionStorage.removeItem(`vintage_maint_bypass_${moduleKey}`);
      }
    } catch {}
    setIsBypassed(bypass);
  };

  // 1. Normal state: module is operational
  if (!isMaintenanceActive) {
    return <>{children}</>;
  }

  // 2. Admin Bypassed state: render module with warning banner at the top
  if (isAdmin && isBypassed) {
    return (
      <div className="relative w-full">
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-amber-50 px-4 py-2.5 shadow-lg border-b border-amber-400 flex flex-wrap items-center justify-between gap-3 text-xs font-medium z-30 sticky top-0">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-amber-200 animate-pulse flex-shrink-0" />
            <span>
              <strong className="font-bold tracking-wide uppercase text-white">Admin Maintenance Bypass Active:</strong>{' '}
              {moduleName} is currently under maintenance for regular users. You have active override access for testing & audits.
            </span>
          </div>
          <button
            onClick={() => handleBypassToggle(false)}
            className="flex items-center gap-1.5 px-3 py-1 bg-black/30 hover:bg-black/50 text-amber-100 border border-amber-300/40 rounded shadow-sm text-xs font-semibold cursor-pointer transition-all"
          >
            <Lock className="w-3.5 h-3.5" />
            Re-enable Maintenance Lock
          </button>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  // 3. Maintenance overlay state: beautiful card with spinning gears and admin bypass
  return (
    <div className="min-h-[550px] w-full flex items-center justify-center p-4 sm:p-8 bg-gradient-to-b from-[#121110] via-[#1a1714] to-[#0d0c0b] text-slate-100 rounded-xl border border-amber-500/20 shadow-2xl relative overflow-hidden my-4">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-xl w-full bg-[#181614]/90 backdrop-blur-md border border-amber-400/40 rounded-2xl p-6 sm:p-10 shadow-2xl text-center flex flex-col items-center">
        {/* Animated Interlocking Gears */}
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          {/* Background pulsating ring */}
          <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping opacity-30" />
          
          {/* Main big gear - spinning clockwise */}
          <div className="animate-spin text-amber-400" style={{ animationDuration: '8s' }}>
            <Settings className="w-16 h-16 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
          </div>

          {/* Secondary smaller gear - spinning counter-clockwise */}
          <div
            className="absolute -top-1 -right-1 text-amber-300 animate-spin"
            style={{ animationDuration: '5s', animationDirection: 'reverse' }}
          >
            <Settings className="w-8 h-8 drop-shadow-[0_0_8px_rgba(252,211,77,0.6)]" />
          </div>

          {/* Center wrench badge */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-amber-950/80 border border-amber-400/60 flex items-center justify-center shadow-inner">
              <Wrench className="w-4 h-4 text-amber-300" />
            </div>
          </div>
        </div>

        {/* Maintenance Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-wider mb-4">
          <ShieldAlert className="w-3.5 h-3.5" />
          Scheduled Maintenance
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-amber-100 mb-3 tracking-wide">
          {moduleName} Under Scheduled Maintenance
        </h2>

        {/* Description as explicitly requested */}
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-normal">
          Real-time updates and schema optimizations are in progress for this module. Other ERP sections remain fully operational.
        </p>

        {/* Operational Highlights */}
        <div className="w-full bg-black/40 border border-amber-500/20 rounded-xl p-3.5 mb-6 text-left space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Top navigation bar and other business modules are active</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Database transactions & audit ledger are fully secured</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Changes will reflect instantly upon completion via Realtime sync</span>
          </div>
        </div>

        {/* Admin Override Section */}
        {isAdmin ? (
          <div className="w-full pt-4 border-t border-amber-500/30 flex flex-col items-center">
            <p className="text-xs text-amber-200/80 mb-3">
              Administrator detected: You have authorization to bypass this guard for testing and data entry.
            </p>
            <button
              onClick={() => handleBypassToggle(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <KeyRound className="w-4 h-4 text-black" />
              Bypass & Access Module (Admin Override)
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">
            Please check back shortly or navigate to another module from the top navigation bar.
          </div>
        )}
      </div>
    </div>
  );
};

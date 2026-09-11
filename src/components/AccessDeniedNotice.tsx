import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';

interface AccessDeniedNoticeProps {
  moduleName: string;
  onGoDashboard?: () => void;
  requiredRole?: string;
  currentRole?: string;
}

export const AccessDeniedNotice: React.FC<AccessDeniedNoticeProps> = ({
  moduleName,
  onGoDashboard,
  requiredRole = 'ADMIN',
  currentRole
}) => {
  return (
    <div className="min-h-[420px] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border-2 border-rose-200 shadow-xl max-w-md w-full p-8 text-center relative overflow-hidden">
        {/* Top Crimson Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />

        <div className="w-16 h-16 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
          <ShieldAlert className="w-8 h-8 text-rose-600" />
        </div>

        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
          Access Denied - Requires Admin Privileges
        </h3>

        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          You do not have administrative credentials to access or modify <strong className="text-slate-900">{moduleName}</strong>.
        </p>

        {currentRole && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>Current Role: <strong className="uppercase">{currentRole}</strong> (Required: {requiredRole})</span>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-slate-100">
          <button
            type="button"
            onClick={onGoDashboard || (() => window.location.href = '/')}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-amber-200 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Main Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { AttendanceRecord, Employee } from '../hr.types.ts';
import { StatusBadge } from '../../../components/StatusBadge.tsx';
import { Calendar, Lock, UserPlus, CheckCircle, XCircle } from 'lucide-react';

export interface AttendanceModalProps {
  isOpen: boolean;
  month: string;
  onClose: () => void;
  employees: Employee[];
  attendance: AttendanceRecord[];
  onUpdateAttendance: (attId: string, daysWorked: number, overtimeHours: number) => Promise<void>;
  onSetAllDays: (days: number) => Promise<void>;
  onPostSheet: () => Promise<void>;
  onUnpostSheet: () => Promise<void>;
  onSyncMissing: () => Promise<void>;
  onSaveDraft?: () => void;
  isPosted?: boolean;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  isOpen,
  month,
  onClose,
  employees,
  attendance,
  onUpdateAttendance,
  onSetAllDays,
  onPostSheet,
  onUnpostSheet,
  onSyncMissing,
  onSaveDraft,
  isPosted = false
}) => {
  if (!isOpen) return null;

  const isWindowSheetPosted = isPosted || (attendance.length > 0 && attendance.every(a => a.status === 'POSTED'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Window Header */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base tracking-wide">
                  Monthly Attendance Sheet — {month}
                </h2>
                {isWindowSheetPosted ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <Lock className="w-3 h-3" />
                    <span>POSTED & LOCKED</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <span>DRAFT (Editable)</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isWindowSheetPosted
                  ? '🔒 Sheet is POSTED and locked. Draft payroll has been initialized in the Payroll tab.'
                  : '✏️ Enter present days (0-30) and overtime hours below, then click POST directly from this window to lock and prepare Payroll.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isWindowSheetPosted && (
              <button
                type="button"
                onClick={onSyncMissing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Sync missing active employees into this sheet"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sync Missing Employees</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              title="Close Window"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Window KPI Strip */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500">Active Staff in Sheet</span>
            <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
              {attendance.length} Employees
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500">Total Present Days</span>
            <div className="text-sm font-bold font-mono text-blue-900 mt-0.5">
              {attendance.reduce((sum, a) => sum + (Number(a.daysWorked) || 0), 0)} Days
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500">Total Overtime Hours</span>
            <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
              {attendance.reduce((sum, a) => sum + (Number(a.overtimeHours) || 0), 0)} Hours
            </div>
          </div>
          <div className="flex items-center justify-end sm:justify-start gap-1">
            {!isWindowSheetPosted && (
              <button
                type="button"
                onClick={() => onSetAllDays(30)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 hover:border-blue-300 text-[10px] font-bold uppercase tracking-wider transition-colors shadow-2xs cursor-pointer"
              >
                <CheckCircle className="w-3 h-3 text-blue-600" />
                <span>Set 30 Days All</span>
              </button>
            )}
          </div>
        </div>

        {/* Window Employee Attendance Table */}
        <div className="overflow-y-auto p-4 flex-1">
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p className="text-xs">No attendance entries found for this month.</p>
              {!isWindowSheetPosted && (
                <button
                  type="button"
                  onClick={onSyncMissing}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-bold"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sync Active Employees Now</span>
                </button>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Code</th>
                    <th className="px-3.5 py-2.5">Employee Name</th>
                    <th className="px-3.5 py-2.5">Days Worked (0-30)</th>
                    <th className="px-3.5 py-2.5">Overtime Hours</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Lock State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {attendance.map(att => (
                    <tr key={att.id} className="hover:bg-blue-50/40 transition-colors font-sans">
                      <td className="px-3.5 py-2 font-mono font-bold text-blue-900">{att.empCode}</td>
                      <td className="px-3.5 py-2 font-semibold text-slate-800">
                        <div>{att.employeeName}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{att.monthYear}</div>
                      </td>
                      <td className="px-3.5 py-2">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          disabled={isWindowSheetPosted}
                          value={att.daysWorked}
                          onChange={e => onUpdateAttendance(att.id, Number(e.target.value), att.overtimeHours)}
                          className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                            isWindowSheetPosted
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : 'bg-white text-slate-900 border-slate-300 focus:ring-2 focus:ring-blue-500'
                          }`}
                        />
                      </td>
                      <td className="px-3.5 py-2">
                        <input
                          type="number"
                          min="0"
                          disabled={isWindowSheetPosted}
                          value={att.overtimeHours}
                          onChange={e => onUpdateAttendance(att.id, att.daysWorked, Number(e.target.value))}
                          className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                            isWindowSheetPosted
                              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300 focus:ring-2 focus:ring-emerald-500'
                          }`}
                        />
                      </td>
                      <td className="px-3.5 py-2 font-sans">
                        <StatusBadge status={att.status} size="sm" />
                      </td>
                      <td className="px-3.5 py-2 text-right font-sans">
                        {isWindowSheetPosted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <Lock className="w-3 h-3" />
                            <span>Locked</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-700 font-medium">Editable (Draft)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Window Footer Action Bar */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            {isWindowSheetPosted ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Attendance is POSTED. Switch to Payroll tab to review or disburse salaries.</span>
              </span>
            ) : (
              <span className="text-amber-800 font-medium">
                ⚠️ Sheet is in DRAFT. Click POST below to lock days and generate DRAFT payroll.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold uppercase tracking-wider text-xs transition-colors cursor-pointer"
            >
              Close Window
            </button>

            {!isWindowSheetPosted ? (
              <>
                {onSaveDraft && (
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    className="px-3.5 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold uppercase tracking-wider text-xs transition-colors shadow-2xs cursor-pointer"
                  >
                    Save Draft
                  </button>
                )}
                <button
                  type="button"
                  id="btn-post-attendance-sheet-from-window"
                  onClick={onPostSheet}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>POST Attendance Sheet</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onUnpostSheet}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold uppercase tracking-wider text-xs transition-colors border border-amber-300 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Unpost (Unlock for Editing)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

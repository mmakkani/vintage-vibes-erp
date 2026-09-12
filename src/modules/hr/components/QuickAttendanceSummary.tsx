import React from 'react';
import { AttendanceRecord, Employee, PayrollRecord } from '../hr.types.ts';
import { Users, Clock, Calendar, CheckCircle, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface QuickAttendanceSummaryProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  payrollSlips: PayrollRecord[];
  selectedMonth: string;
  onNavigateTab: (tab: 'payroll' | 'attendance' | 'employees' | 'vault') => void;
}

export const QuickAttendanceSummary: React.FC<QuickAttendanceSummaryProps> = ({
  employees,
  attendance,
  payrollSlips,
  selectedMonth,
  onNavigateTab
}) => {
  const activeCount = (employees || []).filter(e => e.isActive).length;
  const totalDaysWorked = (attendance || []).reduce((acc, curr) => acc + (Number(curr?.daysWorked) || 0), 0);
  const totalOvertime = (attendance || []).reduce((acc, curr) => acc + (Number(curr?.overtimeHours) || 0), 0);
  const avgAttendanceRate = activeCount > 0 ? Math.round((totalDaysWorked / (activeCount * 30)) * 100) : 0;
  
  const pendingPayrollCount = (payrollSlips || []).filter(p => p.status !== 'POSTED').length;
  const totalPendingNet = (payrollSlips || [])
    .filter(p => p.status !== 'POSTED')
    .reduce((sum, p) => sum + (Number(p?.netPay) || 0), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
      {/* Card 1: Active Staff & Today */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/60 border border-blue-100">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Active Workforce</div>
          <div className="text-lg font-mono font-bold text-slate-900">{activeCount} Staff Members</div>
          <div className="text-[10px] text-blue-700 mt-0.5">100% Biometric Sync Active</div>
        </div>
      </div>

      {/* Card 2: MTD Attendance Stats */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">MTD Attendance ({selectedMonth})</div>
          <div className="text-lg font-mono font-bold text-slate-900">{avgAttendanceRate}% Rate</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">{totalOvertime} Overtime Hours Logged</div>
        </div>
      </div>

      {/* Card 3: Pending Payroll Validation */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50/60 border border-amber-100 md:col-span-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Pending Payroll Validation</div>
            <div className="text-base font-mono font-bold text-slate-900">
              {pendingPayrollCount} Slips • AED {(Number(totalPendingNet) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">Requires HR Director approval & GL sync</div>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('payroll')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors shrink-0"
        >
          <span>Validate</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

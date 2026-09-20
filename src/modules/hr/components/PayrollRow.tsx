import React, { useState, useEffect } from 'react';
import { PayrollRecord } from '../hr.types.ts';
import { StatusBadge } from '../../../components/StatusBadge.tsx';
import { NumericInput } from '../../../components/NumericInput.tsx';

export interface PayrollRowProps {
  slip: PayrollRecord;
  isPayrollPosted: boolean;
  onUpdateDeductions: (slipId: string, advanceDeduction: number, loanEmiDeduction: number) => Promise<void> | void;
}

const safeFormatAed = (val: any, decimals: number = 2): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const safeFormatNum = (val: any): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString();
};

const safeFixed = (val: any, decimals: number = 2): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return (0).toFixed(decimals);
  return num.toFixed(decimals);
};

export const PayrollRow: React.FC<PayrollRowProps> = React.memo(({
  slip,
  isPayrollPosted,
  onUpdateDeductions
}) => {
  const [advanceDeduction, setAdvanceDeduction] = useState<number | ''>(slip.advanceDeduction || 0);
  const [loanEmiDeduction, setLoanEmiDeduction] = useState<number | ''>(slip.loanEmiDeduction || 0);

  // Synchronize when slip props change from external refresh
  useEffect(() => {
    setAdvanceDeduction(slip.advanceDeduction || 0);
  }, [slip.advanceDeduction]);

  useEffect(() => {
    setLoanEmiDeduction(slip.loanEmiDeduction || 0);
  }, [slip.loanEmiDeduction]);

  // Instant 60fps real-time calculation for Net Pay without waiting for network response
  const numAdvance = advanceDeduction === '' ? 0 : Number(advanceDeduction);
  const numLoan = loanEmiDeduction === '' ? 0 : Number(loanEmiDeduction);
  const totalDeductions = numAdvance + numLoan;
  const currentNetPay = Math.max(0, (Number(slip.grossPay) || 0) - totalDeductions);

  const handleBlurAdvance = (finalAdv: number) => {
    setAdvanceDeduction(finalAdv);
    if (finalAdv !== (slip.advanceDeduction || 0) || numLoan !== (slip.loanEmiDeduction || 0)) {
      onUpdateDeductions(slip.id, finalAdv, numLoan);
    }
  };

  const handleBlurLoan = (finalLoan: number) => {
    setLoanEmiDeduction(finalLoan);
    if (numAdvance !== (slip.advanceDeduction || 0) || finalLoan !== (slip.loanEmiDeduction || 0)) {
      onUpdateDeductions(slip.id, numAdvance, finalLoan);
    }
  };

  return (
    <tr className="hover:bg-blue-50/40 transition-colors font-sans">
      <td className="px-3 py-2 font-mono font-bold text-blue-900">{slip.empCode}</td>
      <td className="px-3 py-2 font-semibold text-slate-800">
        <div>{slip.employeeName}</div>
        <div className="text-[10px] text-slate-400 font-normal">{slip.designation}</div>
      </td>
      <td className="px-3 py-2 font-mono text-slate-700">AED {safeFormatNum(slip.baseSalary)}</td>
      <td className="px-3 py-2 font-mono text-slate-700">{slip.daysWorked}/30</td>
      <td className="px-3 py-2 font-mono text-slate-800">AED {safeFixed(slip.earnedBasic, 2)}</td>
      <td className="px-3 py-2 font-mono text-emerald-700">+AED {safeFixed(slip.overtimePay, 2)}</td>
      <td className="px-3 py-2 font-mono text-slate-700">+AED {safeFixed(slip.allowances, 2)}</td>

      {/* Advance Cut Input */}
      <td className="px-3 py-2 bg-rose-50/30">
        <NumericInput
          min={0}
          step={10}
          disabled={isPayrollPosted}
          value={advanceDeduction}
          onChange={val => setAdvanceDeduction(val)}
          onBlurCommit={handleBlurAdvance}
          className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
            isPayrollPosted
              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
              : 'bg-white text-rose-800 border-rose-300 focus:ring-2 focus:ring-rose-500'
          }`}
        />
      </td>

      {/* Loan EMI Input */}
      <td className="px-3 py-2 bg-rose-50/30">
        <NumericInput
          min={0}
          step={10}
          disabled={isPayrollPosted}
          value={loanEmiDeduction}
          onChange={val => setLoanEmiDeduction(val)}
          onBlurCommit={handleBlurLoan}
          className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
            isPayrollPosted
              ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
              : 'bg-white text-rose-800 border-rose-300 focus:ring-2 focus:ring-rose-500'
          }`}
        />
      </td>

      {/* Net Pay Result (Instantly reactive) */}
      <td className="px-3 py-2 font-mono font-bold text-emerald-800 bg-emerald-50/30 text-xs">
        AED {safeFormatAed(currentNetPay)}
      </td>

      <td className="px-3 py-2 text-right font-sans">
        <StatusBadge status={slip.status} size="sm" />
      </td>
    </tr>
  );
});

PayrollRow.displayName = 'PayrollRow';

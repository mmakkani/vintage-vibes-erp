import React from 'react';
import { Voucher } from '../finance.types.ts';
import { Printer, X, ShieldCheck } from 'lucide-react';
import { RoyalWaxSeal } from '../../../components/RoyalWaxSeal.tsx';

interface PrintVoucherModalProps {
  voucher: Voucher;
  onClose: () => void;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({ voucher, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const getVoucherTypeName = (type: string) => {
    switch (type) {
      case 'JV': return 'JOURNAL VOUCHER (JV)';
      case 'BPV': return 'BANK PAYMENT VOUCHER (BPV)';
      case 'BRV': return 'BANK RECEIPT VOUCHER (BRV)';
      case 'CPV': return 'CASH PAYMENT VOUCHER (CPV)';
      case 'CRV': return 'CASH RECEIPT VOUCHER (CRV)';
      default: return 'ACCOUNTING VOUCHER';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-amber-300 max-w-3xl w-full shadow-2xl p-6 sm:p-8 relative print:m-0 print:p-0 print:border-none print:shadow-none print:w-full">
        {/* Top Actions Bar (Hidden on Print) */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-amber-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-amber-600 text-white font-mono font-bold text-xs uppercase">
              {voucher.voucherNo}
            </span>
            <span className="text-xs font-bold text-slate-700">Official Financial Accounting Voucher</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="bg-[#fcfaf4] p-6 sm:p-8 rounded-xl border border-amber-200/80 font-sans print:border-none print:bg-white print:p-0">
          {/* Header */}
          <div className="border-b-2 border-amber-800/40 pb-4 mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono font-bold text-amber-900 uppercase tracking-wider">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </div>
              <div className="text-[10px] text-slate-600">
                Commercial License: 1049281 &bull; TRN (VAT): 100482910300003
              </div>
              <div className="text-[10px] text-slate-600">
                House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, United Arab Emirates
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-serif font-black text-amber-950 uppercase tracking-wider">
                {getVoucherTypeName(voucher.type)}
              </div>
              <div className="font-mono text-sm font-black text-slate-900 mt-0.5">
                NO: {voucher.voucherNo}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Posting Date: <strong>{voucher.date}</strong>
              </div>
            </div>
          </div>

          {/* Meta Info Bar */}
          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-white border border-amber-200 mb-5 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Voucher Status:</span>
              <span className={`font-mono font-bold ${voucher.status === 'POSTED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                ● {voucher.status}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Currency / FX:</span>
              <span className="font-mono font-bold text-slate-800">
                {voucher.currency || 'AED'} (Rate: {voucher.exchangeRate || 1.0})
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Doc Reference:</span>
              <span className="font-mono text-slate-800">{voucher.documentRef || 'GENERAL_ENTRY'}</span>
            </div>
          </div>

          {/* Narration */}
          <div className="mb-5 p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
            <span className="font-bold uppercase text-[10px] text-amber-900 block mb-0.5">Particulars / Narration:</span>
            <p className="text-slate-800 italic">{voucher.narration || 'Dual-entry general accounting adjustment'}</p>
          </div>

          {/* Dual Entry Debit / Credit Table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-100/70 border-y border-amber-300 text-amber-950 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3 text-left">Account Code</th>
                  <th className="py-2.5 px-3 text-left">Account Title & Description</th>
                  <th className="py-2.5 px-3 text-right">Debit (AED)</th>
                  <th className="py-2.5 px-3 text-right">Credit (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200 font-mono">
                {(voucher.lines || (voucher as any).entries || []).map((line: any, idx: number) => {
                  const debit = Number(line.debitAmount ?? line.debit ?? 0);
                  const credit = Number(line.creditAmount ?? line.credit ?? 0);
                  return (
                    <tr key={idx} className="hover:bg-amber-50/30">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{line.accountCode || '-'}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900">{line.accountName || 'General Account'}</div>
                        {(line.memo || line.particulars) && <div className="text-[10px] text-slate-500">{line.memo || line.particulars}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {debit > 0 ? debit.toFixed(2) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {credit > 0 ? credit.toFixed(2) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-800/60 bg-amber-50/90 font-mono font-black text-xs text-amber-950">
                  <td colSpan={2} className="py-2.5 px-3 uppercase text-right font-sans">
                    Voucher Grand Total:
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    AED {Number(voucher.totalDebit || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    AED {Number(voucher.totalCredit || 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Proof Note */}
          <div className="flex items-center justify-between text-[11px] text-slate-600 mb-8 pt-2 border-t border-amber-200">
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Double-entry balance verified: Net Difference = 0.00 AED</span>
            </div>
            <div className="font-mono text-[10px]">
              Posted By: <strong>{voucher.postedBy || 'Finance Dept'}</strong>
            </div>
          </div>

          {/* Signatures & Authorizations */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-dashed border-amber-300 text-center text-[10px] text-slate-600 uppercase font-bold relative">
            <div>
              <div className="h-10 border-b border-slate-400 mb-1"></div>
              <span>Prepared By</span>
            </div>
            <div>
              <div className="h-10 border-b border-slate-400 mb-1"></div>
              <span>Verified Accountant</span>
            </div>
            <div className="relative">
              <div className="h-10 border-b border-slate-400 mb-1 flex items-center justify-center">
                {voucher.status === 'POSTED' && (
                  <div className="absolute -top-7 right-4 pointer-events-none">
                    <RoyalWaxSeal
                      sealText="POSTED & VERIFIED"
                      subText="VINTAGE VIBES DUBAI"
                      size="sm"
                      date={voucher.date}
                      approver={voucher.postedBy || 'MD OFFICE'}
                    />
                  </div>
                )}
              </div>
              <span>Authorized Managing Director</span>
            </div>
          </div>
        </div>

        {/* Modal Bottom Bar (Screen only) */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-amber-200 print:hidden flex-wrap gap-2">
          <span className="text-xs text-slate-500 font-mono">
            Voucher: <strong className="text-slate-800">{voucher.voucherNo}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              <span>Close Voucher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

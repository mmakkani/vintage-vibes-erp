import React, { useState } from 'react';
import { X, Wallet, ArrowUpRight, ArrowDownRight, Loader2, AlertCircle } from 'lucide-react';
import { CrmService, CrmRetailCustomer } from '../../../services/crmService.ts';

interface AdjustWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CrmRetailCustomer | null;
  onSuccess: (newBalance: number) => void;
}

export const AdjustWalletModal: React.FC<AdjustWalletModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess
}) => {
  if (!isOpen || !customer) return null;

  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentBal = Number(customer.wallet_balance ?? customer.walletBalance ?? 0);
  const numAmount = parseFloat(amount) || 0;
  const projectedBal = type === 'CREDIT' ? currentBal + numAmount : Math.max(0, currentBal - numAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (numAmount <= 0) {
      setError('Please enter a valid amount greater than 0 AED.');
      return;
    }

    if (!reason.trim()) {
      setError('Mandatory audit reason is required for any store credit adjustment.');
      return;
    }

    if (type === 'DEBIT' && numAmount > currentBal) {
      setError(`Cannot deduct more than the current wallet balance (AED ${currentBal.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await CrmService.adjustWalletBalance({
        customerId: customer.id,
        amount: numAmount,
        type,
        description: reason.trim()
      });

      if (res.success) {
        onSuccess(res.newBalance);
        onClose();
      } else {
        setError('Failed to adjust wallet balance. Please check server logs.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error executing wallet transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-xs">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Adjust Store Credit Wallet</h3>
              <p className="text-[11px] text-amber-100 font-mono">COA: 2150-01 Customer Wallet Balances</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Context */}
        <div className="px-5 py-3 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 text-[11px]">Customer: </span>
            <strong className="text-slate-800">{customer.name}</strong>
            <span className="ml-1 text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
              {customer.code}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">Current Wallet</span>
            <span className="font-mono font-bold text-amber-800 text-xs">
              AED {currentBal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs animate-in shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Type: Credit or Debit */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Adjustment Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('CREDIT')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  type === 'CREDIT'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>+ Add Credit</span>
              </button>

              <button
                type="button"
                onClick={() => setType('DEBIT')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  type === 'DEBIT'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
                <span>- Deduct Credit</span>
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Amount (AED) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 font-mono">AED</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 text-slate-800"
              />
            </div>
          </div>

          {/* Reason / Audit Trail */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Mandatory Reason / Notes *
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Goodwill credit for delayed delivery, Reseller return refund, Promo deposit..."
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 text-slate-800"
            />
          </div>

          {/* Balance Preview */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">Projected New Balance:</span>
            <span className="font-mono font-extrabold text-slate-900 text-sm">
              AED {projectedBal.toFixed(2)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <span>Confirm {type === 'CREDIT' ? 'Credit' : 'Debit'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Building2, Truck, DollarSign, Lock } from 'lucide-react';
import { Party } from '../../parties/parties.types.ts';
import { PartiesService } from '../../../services/partiesService.ts';

interface RealTimeCourierSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettlementSuccess: () => void;
}

interface CourierOption {
  partyId?: number;
  id: string;
  name: string;
  accountCode: string;
}

const DEFAULT_COURIERS: CourierOption[] = [
  { partyId: 24, id: '9b1e1713-39d2-4309-8488-81203f5ad602', name: 'Aramex Logistics UAE', accountCode: '2120-02' },
  { partyId: 23, id: '813f3f28-d541-4e4d-ad3e-ca6ca2824b21', name: 'DHL Express UAE', accountCode: '2120-01' },
  { partyId: 25, id: 'a8291f04-89f1-46bb-ba22-81203f5ad603', name: 'SMSA Express GCC', accountCode: '2120-03' },
  { partyId: 26, id: 'c5713e89-11ba-47ee-99aa-81203f5ad604', name: 'Emirates Post Premium', accountCode: '2120-04' }
];

export const RealTimeCourierSettlementModal: React.FC<RealTimeCourierSettlementModalProps> = ({
  isOpen,
  onClose,
  onSettlementSuccess
}) => {
  const [couriers, setCouriers] = useState<CourierOption[]>(DEFAULT_COURIERS);
  const [selectedCourierId, setSelectedCourierId] = useState<string>(DEFAULT_COURIERS[0].id);
  const [grossCod, setGrossCod] = useState<string>('1250.00');
  const [courierFee, setCourierFee] = useState<string>('75.00');
  const [bankRemittanceCode, setBankRemittanceCode] = useState<string>('');
  const [bankPin, setBankPin] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      PartiesService.getParties()
        .then(pts => {
          const logistics = pts.filter(p => p.type === 'VENDOR' || (p as any).category === 'COURIER');
          if (logistics.length > 0) {
            const mapped: CourierOption[] = logistics.map((l, idx) => ({
              partyId: (l as any).party_id || (l as any).partyId || (idx + 23),
              id: l.id,
              name: l.name,
              accountCode: (l as any).coa_account_id || (l as any).account_code || `2120-0${(idx % 4) + 1}`
            }));
            setCouriers(mapped);
            if (!mapped.some(c => c.id === selectedCourierId)) {
              setSelectedCourierId(mapped[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const grossNum = parseFloat(grossCod) || 0;
  const feeNum = parseFloat(courierFee) || 0;
  const netBankReceived = Math.max(0, grossNum - feeNum);
  const selectedCourier = couriers.find(c => c.id === selectedCourierId) || couriers[0];

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!bankRemittanceCode.trim()) {
      setFeedback({ type: 'error', text: 'Real-time Bank Remittance / Transaction Reference Code is required!' });
      return;
    }
    if (!bankPin.trim()) {
      setFeedback({ type: 'error', text: 'Accountant Authorization PIN is required to proceed bank voucher!' });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/sales/courier-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierPartyId: selectedCourier?.partyId ? String(selectedCourier.partyId) : selectedCourier?.id,
          bankAccountId: '1120-01',
          grossCodCleared: grossNum,
          courierFeeDeducted: feeNum,
          netBankReceived: Number(netBankReceived.toFixed(2)),
          bankRemittanceCode: bankRemittanceCode.trim(),
          referenceNo: bankRemittanceCode.trim(),
          accountantPinVerified: true,
          pinCode: bankPin.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        setFeedback({ type: 'error', text: data.error || 'Failed to proceed courier COD settlement' });
      } else {
        setFeedback({
          type: 'success',
          text: `🎉 Auto Bank Voucher ${data.voucher_no || 'BRV-COD'} proceed! Net AED ${netBankReceived.toFixed(2)} deposited into Bank 1120-01, clearing Courier Khata 1128-01.`
        });
        setTimeout(() => {
          onSettlementSuccess();
          onClose();
        }, 1800);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Network error executing settlement' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide uppercase text-white flex items-center gap-2">
                Real-Time Courier COD Bank Settlement
              </h3>
              <p className="text-[11px] text-indigo-200/80">
                1128-01 Transit Clearing ➔ 1120-01 Bank Account Auto Voucher
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSettle} className="p-6 space-y-4 text-xs font-sans">
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="font-semibold text-xs leading-relaxed">{feedback.text}</span>
            </div>
          )}

          {/* Courier Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Select Courier Partner (Carrier Khata)
            </label>
            <select
              value={selectedCourierId}
              onChange={e => setSelectedCourierId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-bold text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {couriers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.accountCode})
                </option>
              ))}
            </select>
          </div>

          {/* Financial Breakdown Grid */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Gross COD Balance Cleared
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 font-bold text-slate-400">AED</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={grossCod}
                  onChange={e => setGrossCod(e.target.value)}
                  className="w-full pl-12 pr-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                Courier Retained Fee (5140-01)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 font-bold text-slate-400">AED</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={courierFee}
                  onChange={e => setCourierFee(e.target.value)}
                  className="w-full pl-12 pr-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs"
                />
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Net Deposited into Bank (1120-01):</span>
              <span className="font-mono font-black text-sm text-emerald-700">
                AED {netBankReceived.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Bank PIN & Remittance Code Section */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-300/80 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
              <Lock className="w-4 h-4 text-amber-700" />
              <span>Real-Time Bank Verification Security Gate</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-snug">
              Agar payment bank me agayi hai to Remittance Reference aur PIN dalein. System auto-voucher proceed karega, 
              <strong> werna balance courier ke account (1128-01) me hi rahega.</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Bank Remittance Ref # *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ENBD-REMIT-94812"
                  value={bankRemittanceCode}
                  onChange={e => setBankRemittanceCode(e.target.value)}
                  className="w-full p-2 rounded-lg border border-amber-300 bg-white font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Accountant PIN Code *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter 4-digit PIN"
                  value={bankPin}
                  onChange={e => setBankPin(e.target.value)}
                  className="w-full p-2 rounded-lg border border-amber-300 bg-white font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-200" />
              <span>{isProcessing ? 'Verifying & Posting Voucher...' : 'Verify PIN & Proceed Bank Voucher'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

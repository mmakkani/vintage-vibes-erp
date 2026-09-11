import React, { useState } from 'react';
import { CompanyProfile } from '../setup/setup.types.ts';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { X, QrCode, Copy, Check, ShieldCheck, Building2, Smartphone } from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface BankQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  piece?: PieceBreakdownItem | null;
  items?: PieceBreakdownItem[];
  totalAmount?: number;
  companyProfile: CompanyProfile;
  onConfirmPayment: (paymentReference: string) => void;
  isProcessing: boolean;
}

export const BankQrModal: React.FC<BankQrModalProps> = ({
  isOpen,
  onClose,
  piece,
  items,
  totalAmount: customTotal,
  companyProfile,
  onConfirmPayment,
  isProcessing
}) => {
  const [copiedIban, setCopiedIban] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');

  if (!isOpen) return null;

  const activeItems = items && items.length > 0 ? items : piece ? [piece] : [];
  if (activeItems.length === 0 && !customTotal) return null;

  const computedSubtotal = activeItems.reduce(
    (acc, it) => acc + (it.estimatedPrice || it.retailPriceAed || 295),
    0
  );
  const amount = customTotal || (computedSubtotal > 0 ? computedSubtotal : 295);

  const iban = companyProfile.bankIban || 'AE24 0331 2345 6789 0123 456';
  const bankName = companyProfile.bankName || 'Emirates NBD - Dubai Business Bay';
  const accountTitle = companyProfile.bankAccountTitle || companyProfile.companyName || 'Vintage Vibes LLC SPC';

  const barcodesRef = activeItems.map(i => i.barcode).filter(Boolean).join(',');

  // Bank QR fallback generator
  const qrImage =
    companyProfile.bankQrCodeUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=iban%3A${encodeURIComponent(
      iban
    )}%26amount%3D${amount}%26desc%3DVINTAGE-PIECE-${encodeURIComponent(barcodesRef || 'ORDER')}`;

  const handleCopyIban = () => {
    luxuryAudio.playMechanicalClick();
    navigator.clipboard.writeText(iban.replace(/\s+/g, ''));
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    luxuryAudio.playMechanicalClick();
    onConfirmPayment(transactionRef || `TRX-QR-${Date.now().toString().slice(-6)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#FFFDF8] via-[#FAF4E6] to-[#F5EADB] border-2 border-amber-400/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-700">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900 font-serif">
                Bank QR Code & Mobile Wallet
              </h3>
              <p className="text-[10px] text-amber-900/70 font-medium">Scan via UAE Mobile Banking / Digital Wallet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-amber-100/80 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-amber-300/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* QR Code Container */}
          <div className="flex flex-col items-center">
            <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-amber-400 flex items-center justify-center">
              <img
                src={qrImage}
                alt="Bank QR Code"
                className="w-52 h-52 object-contain"
              />
            </div>
            <span className="mt-2 text-xs font-mono text-amber-900 font-black flex items-center gap-1.5 bg-amber-100/70 px-3 py-1 rounded-full border border-amber-300/60">
              <Smartphone className="w-3.5 h-3.5 text-amber-700" />
              <span>Instant Bank Transfer: AED {Number(amount).toLocaleString()}</span>
            </span>
          </div>

          {/* Bank & IBAN Box */}
          <div className="bg-white/90 p-3.5 rounded-xl border border-amber-200/80 space-y-2 text-xs shadow-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Beneficiary Bank:</span>
              </span>
              <strong className="text-slate-900">{bankName}</strong>
            </div>

            <div className="flex items-center justify-between text-slate-600">
              <span>Account Title:</span>
              <strong className="text-slate-900">{accountTitle}</strong>
            </div>

            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">IBAN Number</span>
                <span className="font-mono font-black text-amber-800 text-[11px]">{iban}</span>
              </div>

              <button
                type="button"
                onClick={handleCopyIban}
                className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-slate-800 border border-amber-300/80 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedIban ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIban ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Reference Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-800 uppercase tracking-wide">
              Transfer Reference / Transaction ID (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. TRX-90481 or your sender name"
              value={transactionRef}
              onChange={e => setTransactionRef(e.target.value)}
              className="w-full bg-white border border-amber-300/80 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>

          {/* Confirmation CTA */}
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-3 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 font-black"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isProcessing ? 'Verifying & Securing Piece...' : 'I Have Paid • Confirm & Reserve Piece'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
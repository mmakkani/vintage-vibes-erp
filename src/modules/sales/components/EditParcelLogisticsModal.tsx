import React, { useState } from 'react';
import { SalesInvoice } from '../sales.types.ts';
import { useFormAutoSave } from '../../../hooks/useFormAutoSave.ts';
import { AutoSaveDraftBanner, AutoSaveIndicator } from '../../../components/AutoSaveNotice.tsx';
import {
  Truck,
  Barcode,
  DollarSign,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  X,
  Phone,
  MapPin,
  Sparkles,
  Printer,
  Zap,
  ArrowRight
} from 'lucide-react';

interface EditParcelLogisticsModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
  onSaved: (updatedInvoice?: SalesInvoice) => void;
  onPrintThermalSlip?: (inv: SalesInvoice) => void;
  onFinalizeAndPost?: (invoiceId: string) => Promise<void>;
}

export const EditParcelLogisticsModal: React.FC<EditParcelLogisticsModalProps> = ({
  invoice,
  onClose,
  onSaved,
  onPrintThermalSlip,
  onFinalizeAndPost
}) => {
  const [courierPartner, setCourierPartner] = useState<string>(
    invoice.courierPartner || 'DHL Express'
  );
  const [trackingNumber, setTrackingNumber] = useState<string>(
    invoice.trackingNumber || `DHL-${Math.floor(100000000 + Math.random() * 900000000)}`
  );
  const [shippingFeeAed, setShippingFeeAed] = useState<number>(
    invoice.shippingFeeAed !== undefined ? invoice.shippingFeeAed : (invoice.shippingCharge !== undefined ? invoice.shippingCharge : 25)
  );
  const [shippingBearer, setShippingBearer] = useState<'CUSTOMER' | 'COMPANY'>(
    invoice.shippingBearer || 'CUSTOMER'
  );
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'BANK_TRANSFER' | 'CARD_POS' | 'CASH'>(
    (invoice.paymentMethod as any) || 'COD'
  );
  const [paymentStatus, setPaymentStatus] = useState<'UNPAID_PENDING_COD' | 'PREPAID_VERIFIED' | 'PARTIAL_ADVANCE' | 'RETURNED'>(
    invoice.paymentStatus || (invoice.paymentMethod === 'COD' ? 'UNPAID_PENDING_COD' : 'PREPAID_VERIFIED')
  );
  const [customerPhone, setCustomerPhone] = useState<string>(
    invoice.customerPhone || ''
  );
  const [shippingAddress, setShippingAddress] = useState<string>(
    invoice.shippingAddress || 'Dubai / Northern Emirates, UAE'
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-save form payload for parcel logistics
  const logisticsDraftData = {
    courierPartner,
    trackingNumber,
    shippingFeeAed,
    shippingBearer,
    paymentMethod,
    paymentStatus,
    customerPhone,
    shippingAddress
  };

  const {
    hasSavedDraft,
    lastSavedTime,
    isAutoSaved,
    restoreDraft,
    discardDraft,
    clearDraft
  } = useFormAutoSave({
    key: `vibe_autosave_logistics_${invoice.id}`,
    formData: logisticsDraftData,
    onRestore: (saved: any) => {
      if (saved.courierPartner) setCourierPartner(saved.courierPartner);
      if (saved.trackingNumber !== undefined) setTrackingNumber(saved.trackingNumber);
      if (saved.shippingFeeAed !== undefined) setShippingFeeAed(saved.shippingFeeAed);
      if (saved.shippingBearer) setShippingBearer(saved.shippingBearer);
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
      if (saved.paymentStatus) setPaymentStatus(saved.paymentStatus);
      if (saved.customerPhone !== undefined) setCustomerPhone(saved.customerPhone);
      if (saved.shippingAddress !== undefined) setShippingAddress(saved.shippingAddress);
    }
  });

  // Dynamic Financial Calculations
  const garmentSubTotal = invoice.subTotal || invoice.items.reduce((s, it) => s + (it.finalAmount || it.unitPrice || 0), 0);
  const effectiveShipping = shippingBearer === 'CUSTOMER' ? Number(shippingFeeAed || 0) : 0;
  const vatAmount = Number((garmentSubTotal * 0.05).toFixed(2));
  const calculatedGrandTotal = Number((garmentSubTotal + vatAmount + effectiveShipping).toFixed(2));

  // Fast Barcode Generator / Scanner simulation
  const handleGenerateTracking = () => {
    let prefix = 'DHL-';
    if (courierPartner.includes('Emirates')) prefix = 'EP-';
    else if (courierPartner.includes('Aramex')) prefix = 'ARX-';
    else if (courierPartner.includes('Fetchr')) prefix = 'FCH-';
    else if (courierPartner.includes('Rider') || courierPartner.includes('Local')) prefix = 'LOC-';

    const randomNum = Math.floor(100000000 + Math.random() * 900000000);
    setTrackingNumber(`${prefix}${randomNum}`);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const payload = {
        courierPartner,
        trackingNumber: trackingNumber.trim(),
        shippingFeeAed: Number(shippingFeeAed) || 0,
        shippingCharge: Number(shippingFeeAed) || 0,
        shippingBearer,
        paymentMethod,
        paymentStatus,
        customerPhone: customerPhone.trim(),
        shippingAddress: shippingAddress.trim()
      };

      const res = await fetch(`/api/sales/invoices/${invoice.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to update parcel details' });
      } else {
        setStatusMessage({ type: 'success', text: '✅ Parcel & payment details successfully saved!' });
        clearDraft();
        setTimeout(() => {
          onSaved(data.invoice);
          onClose();
        }, 600);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network connection error while saving' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostDirectly = async () => {
    if (!onFinalizeAndPost) return;
    if (!confirm(`Finalize and post ${invoice.invoiceNo} immediately to General Ledger? This locks financial entries and deducts stock.`)) return;

    setIsPosting(true);
    try {
      // Save changes first
      await fetch(`/api/sales/invoices/${invoice.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierPartner,
          trackingNumber: trackingNumber.trim(),
          shippingFeeAed: Number(shippingFeeAed) || 0,
          shippingBearer,
          paymentMethod,
          paymentStatus,
          customerPhone: customerPhone.trim(),
          shippingAddress: shippingAddress.trim()
        })
      });

      await onFinalizeAndPost(invoice.id);
      clearDraft();
      onClose();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to post invoice' });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Edit Parcel, DHL & Payment Logistics
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                  {invoice.invoiceNo}
                </span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                    invoice.status === 'POSTED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {invoice.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Buyer: <strong className="text-indigo-600">{invoice.buyerHandle || invoice.customerName}</strong> ({invoice.items.length} garments bundled)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5 text-xs">
          {/* AUTO-SAVE RESTORATION BANNER */}
          {hasSavedDraft && (
            <AutoSaveDraftBanner
              lastSavedTime={lastSavedTime}
              onRestore={restoreDraft}
              onDiscard={discardDraft}
              title="Unsaved Logistics & Payment Adjustments Recovered"
              description="We recovered your courier tracking, shipping fees, address and payment inputs from local storage."
            />
          )}

          {/* SECTION 1: Courier & Logistics Details */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-wider text-[11px]">
              <Truck className="w-4 h-4 text-amber-600" />
              <span>Courier & Logistics Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Courier Partner */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Courier Partner *
                </label>
                <select
                  value={courierPartner}
                  onChange={e => setCourierPartner(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="DHL Express">DHL Express (Default Priority)</option>
                  <option value="Emirates Post">Emirates Post</option>
                  <option value="Aramex">Aramex</option>
                  <option value="Fetchr">Fetchr</option>
                  <option value="Local Rider">Local Rider (Same-Day Direct)</option>
                </select>
              </div>

              {/* Tracking / Parcel Waybill # with Scanner Icon */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Tracking / Parcel Waybill # *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateTracking}
                    className="text-[10px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="e.g. DHL-984810294"
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <Barcode className="w-4 h-4 text-amber-600 absolute left-3 top-2.5" />
                  <span className="absolute right-2.5 top-2 text-[10px] text-slate-400 font-bold uppercase">
                    BARCODE
                  </span>
                </div>
              </div>
            </div>

            {/* Shipping Fee (AED) and Pay By Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Shipping Fee (AED)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={shippingFeeAed}
                    onChange={e => setShippingFeeAed(Number(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Shipping Borne By (Pay By Toggle) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Shipping Borne By (Pay By Toggle)
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setShippingBearer('CUSTOMER')}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] sm:text-[11px] transition-all cursor-pointer ${
                      shippingBearer === 'CUSTOMER'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    Customer Bears (+AED {shippingFeeAed})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShippingBearer('COMPANY')}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] sm:text-[11px] transition-all cursor-pointer ${
                      shippingBearer === 'COMPANY'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    Company Absorbs (Free)
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {shippingBearer === 'CUSTOMER'
                    ? '⚡ Added on top of invoice: Customer pays Item + Shipping'
                    : '🏢 Garment price only; Shipping booked as operational expense'}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Payment Tracking */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-wider text-[11px]">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Payment Tracking & Verification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment Mode */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => {
                    const mode = e.target.value as any;
                    setPaymentMethod(mode);
                    if (mode === 'COD') setPaymentStatus('UNPAID_PENDING_COD');
                    else setPaymentStatus('PREPAID_VERIFIED');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="COD">Cash on Delivery (COD)</option>
                  <option value="BANK_TRANSFER">Prepaid Bank Transfer</option>
                  <option value="CARD_POS">Card Link / POS</option>
                  <option value="CASH">Direct Cash Payment</option>
                </select>
              </div>

              {/* Payment Verification Status Toggle */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Payment Verification Status
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('UNPAID_PENDING_COD')}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] sm:text-[11px] transition-all cursor-pointer ${
                      paymentStatus === 'UNPAID_PENDING_COD'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    Unpaid / Pending COD
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('PREPAID_VERIFIED')}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] sm:text-[11px] transition-all cursor-pointer ${
                      paymentStatus === 'PREPAID_VERIFIED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    Paid & Verified
                  </button>
                </div>
              </div>
            </div>

            {/* Recipient Phone & Delivery Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Customer Phone (WhatsApp)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="+971 50 123 4567"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Delivery City / Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={shippingAddress}
                    onChange={e => setShippingAddress(e.target.value)}
                    placeholder="e.g. Al Barsha 2, Villa 12, Dubai"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* FINANCIAL SUMMARY RECAP BOX */}
          <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-300/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Calculated Final Bill
              </span>
              <div className="font-mono text-slate-700 text-xs">
                Items: <strong>AED {garmentSubTotal.toFixed(2)}</strong> + VAT: <strong>AED {vatAmount.toFixed(2)}</strong> + Shipping: <strong>{shippingBearer === 'CUSTOMER' ? `AED ${shippingFeeAed.toFixed(2)}` : 'FREE (Company)'}</strong>
              </div>
            </div>
            <div className="text-center sm:text-right">
              <span className="text-[10px] font-bold uppercase text-slate-600 block">
                {paymentMethod === 'COD' ? 'Total to Collect (COD)' : 'Total Verified Amount'}
              </span>
              <span className="font-mono text-lg font-black text-slate-950">
                AED {calculatedGrandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {onPrintThermalSlip && (
                <button
                  type="button"
                  onClick={() => onPrintThermalSlip({
                    ...invoice,
                    courierPartner,
                    trackingNumber,
                    shippingFeeAed,
                    shippingBearer,
                    paymentMethod: paymentMethod as any,
                    paymentStatus: paymentStatus as any,
                    customerPhone,
                    shippingAddress,
                    totalAmount: calculatedGrandTotal
                  })}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-amber-300" />
                  <span>Print 4x6 Thermal Slip</span>
                </button>
              )}
              <AutoSaveIndicator isAutoSaved={isAutoSaved} lastSavedTime={lastSavedTime} />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Parcel & Payment'}
              </button>

              {invoice.status === 'DRAFT' && onFinalizeAndPost && (
                <button
                  type="button"
                  disabled={isPosting}
                  onClick={handlePostDirectly}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Finalize invoice and post to General Ledger"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>{isPosting ? 'Posting...' : 'Post to Ledger'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

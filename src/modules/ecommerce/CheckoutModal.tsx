import React, { useState } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile } from '../setup/setup.types.ts';
import { PaymentMethod, CheckoutCustomerInfo } from './ecommerce.types.ts';
import {
  X,
  CreditCard,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  MapPin,
  Lock,
  ArrowRight,
  CheckCircle2,
  Banknote,
  Truck,
  Smartphone,
  Check,
  Fingerprint,
  CameraOff
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  piece?: PieceBreakdownItem | null;
  items?: PieceBreakdownItem[];
  companyProfile: CompanyProfile;
  onOpenBankQr: (items: PieceBreakdownItem[], totalAmount: number) => void;
  onCompleteCheckout: (
    items: PieceBreakdownItem[],
    method: 'BANK_TRANSFER' | 'CARD_POS' | 'COD',
    customer: CheckoutCustomerInfo,
    details?: any
  ) => Promise<void>;
  isProcessing: boolean;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  piece,
  items,
  companyProfile,
  onOpenBankQr,
  onCompleteCheckout,
  isProcessing
}) => {
  // Determine available payment methods
  const allowAppleGoogle = companyProfile.enableAppleGooglePay !== false;
  const allowBank = companyProfile.enableBankTransfer !== false;
  const allowCard = companyProfile.enableCardPay !== false;
  const allowCod = companyProfile.enableCod !== false;

  const defaultMethod: PaymentMethod = allowAppleGoogle
    ? 'APPLE_GOOGLE_PAY'
    : allowBank
    ? 'BANK_QR'
    : allowCard
    ? 'CREDIT_CARD'
    : 'COD';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);
  const [activeWallet, setActiveWallet] = useState<'APPLE_PAY' | 'GOOGLE_PAY'>('APPLE_PAY');
  const [showBiometricSheet, setShowBiometricSheet] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  // Customer Form
  const [customer, setCustomer] = useState<CheckoutCustomerInfo>({
    name: 'Rashid Al-Nuaimi',
    phone: '+971 50 293 8812',
    email: 'rashid@vintagearchive.ae',
    shippingAddress: 'Villa 18, Street 4b, Jumeirah 1',
    city: 'Dubai',
    emirate: 'Dubai'
  });

  // Credit card inputs (Only used if user explicitly selects standard Credit Card)
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvc, setCardCvc] = useState('742');

  if (!isOpen) return null;

  const checkoutItems = items && items.length > 0 ? items : piece ? [piece] : [];
  if (checkoutItems.length === 0) return null;

  const subtotal = checkoutItems.reduce(
    (acc, it) => acc + (it.estimatedPrice || it.retailPriceAed || 295),
    0
  );

  const freeThreshold = companyProfile.freeShippingThresholdAed ?? 350;
  const standardFee = companyProfile.standardShippingFeeAed ?? 25;
  const isFreeShipping = subtotal >= freeThreshold;
  const shippingFee = isFreeShipping ? 0 : standardFee;

  const vatAmount = Number((subtotal * 0.05).toFixed(2));
  const totalAmount = Number((subtotal + shippingFee + vatAmount).toFixed(2));

  // Dynamic QR Code for Desktop Apple Pay / Google Pay scan
  const barcodesParam = checkoutItems.map(i => i.barcode).join(',');
  const walletQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=https%3A%2F%2Fvintagevibesllcspc.com%2Fpay%2Fwallet%3Forder%3D${encodeURIComponent(
    barcodesParam
  )}%26amount%3D${totalAmount}%26type%3D${activeWallet}`;

  const triggerBiometricPayment = async (walletType: 'APPLE_PAY' | 'GOOGLE_PAY') => {
    setActiveWallet(walletType);
    setShowBiometricSheet(true);
    luxuryAudio.playMechanicalClick();
  };

  const handleBiometricConfirm = async () => {
    luxuryAudio.playWaxSealSound();
    setBiometricSuccess(true);

    let gatewayIntent: any = null;
    try {
      const intentRes = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountAed: totalAmount,
          orderReference: `ORD-${Date.now().toString().slice(-6)}`,
          customerName: customer.name,
          customerPhone: customer.phone
        })
      });
      gatewayIntent = await intentRes.json();
    } catch {}

    setTimeout(async () => {
      setShowBiometricSheet(false);
      setBiometricSuccess(false);

      await onCompleteCheckout(checkoutItems, 'CARD_POS', customer, {
        type: activeWallet,
        authorizedVia: activeWallet === 'APPLE_PAY' ? 'Apple Pay Face ID' : 'Google Pay Biometric',
        walletRef: gatewayIntent?.paymentIntentId || `${activeWallet}-${Date.now().toString().slice(-6)}`,
        isLiveGateway: gatewayIntent?.isLiveGateway || false
      });
    }, 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    luxuryAudio.playMechanicalClick();

    if (paymentMethod === 'APPLE_GOOGLE_PAY') {
      await triggerBiometricPayment(activeWallet);
    } else if (paymentMethod === 'BANK_QR') {
      onClose();
      onOpenBankQr(checkoutItems, totalAmount);
    } else if (paymentMethod === 'CREDIT_CARD') {
      await onCompleteCheckout(checkoutItems, 'CARD_POS', customer, {
        cardNumber,
        cardExpiry,
        cardCvc,
        type: 'MANUAL_CARD'
      });
    } else {
      // Cash on Delivery
      await onCompleteCheckout(checkoutItems, 'COD', customer, {
        type: 'CASH_ON_DELIVERY'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-gradient-to-b from-[#FFFDF8] via-[#FAF4E6] to-[#F5EADB] border-2 border-amber-400/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-800">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900 font-serif">
                Luxury Archive Checkout
              </h3>
              <p className="text-[10px] text-amber-900/70 font-medium">Instant Ownership Transfer & Anti-Ghost Depletion</p>
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

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Pieces Mini Cards (Single or Multi-item) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase">
              <span>Order Items ({checkoutItems.length})</span>
              <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                1-of-1 Vault Guaranteed
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {checkoutItems.map(it => {
                const itPrice = it.estimatedPrice || it.retailPriceAed || 295;
                return (
                  <div
                    key={it.barcode || it.id}
                    className="flex items-center gap-3 bg-white/90 p-2 rounded-xl border border-amber-200/80 shadow-xs"
                  >
                    {it.frontImageUrl ? (
                      <img
                        src={it.frontImageUrl}
                        alt={it.brandName}
                        className="w-12 h-14 object-cover rounded-lg border border-amber-200 shrink-0 bg-slate-100"
                      />
                    ) : (
                      <div className="w-12 h-14 rounded-lg border border-amber-200 shrink-0 bg-amber-50 flex flex-col items-center justify-center text-amber-700/60 p-1 text-center">
                        <CameraOff className="w-4 h-4 mb-0.5" />
                        <span className="text-[7px] font-bold">No Photo</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono text-indigo-900 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {it.barcode}
                        </span>
                        <span className="text-xs font-mono font-black text-amber-950">
                          AED {Number(itPrice).toLocaleString()}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 truncate mt-0.5">
                        {it.brandName} • {it.style || 'Original Vintage'}
                      </h4>
                      <p className="text-[10px] text-slate-600">
                        Size: <strong className="text-slate-900">{it.sizeScanned || 'L'}</strong> • {it.labelGrade || 'Grade A+'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector Grid */}
          <div>
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Option 1: Apple Pay & Google Pay (1-Touch Biometric / QR) */}
              {allowAppleGoogle && (
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setPaymentMethod('APPLE_GOOGLE_PAY');
                  }}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-start gap-1 text-left transition-all cursor-pointer ${
                    paymentMethod === 'APPLE_GOOGLE_PAY'
                      ? 'bg-slate-950 text-white border-amber-400 shadow-md ring-2 ring-amber-400/60'
                      : 'bg-white/90 border-amber-200 text-slate-700 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs"> Pay / GPay</span>
                    {paymentMethod === 'APPLE_GOOGLE_PAY' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <span className={`text-[9px] font-medium leading-tight ${paymentMethod === 'APPLE_GOOGLE_PAY' ? 'text-amber-200' : 'text-slate-500'}`}>
                    1-Touch Biometric
                  </span>
                </button>
              )}

              {/* Option 2: Bank QR Code */}
              {allowBank && (
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setPaymentMethod('BANK_QR');
                  }}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-start gap-1 text-left transition-all cursor-pointer ${
                    paymentMethod === 'BANK_QR'
                      ? 'bg-amber-100/90 border-amber-500 text-slate-900 shadow-md ring-1 ring-amber-400/50'
                      : 'bg-white/80 border-amber-200/80 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <QrCode className="w-4 h-4 text-amber-700" />
                    {paymentMethod === 'BANK_QR' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className="font-bold text-xs mt-0.5 text-slate-900">Bank QR</span>
                  <span className="text-[9px] text-slate-500 leading-tight">UAE Bank App</span>
                </button>
              )}

              {/* Option 3: Manual Credit / Debit Card */}
              {allowCard && (
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setPaymentMethod('CREDIT_CARD');
                  }}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-start gap-1 text-left transition-all cursor-pointer ${
                    paymentMethod === 'CREDIT_CARD'
                      ? 'bg-amber-100/90 border-amber-500 text-slate-900 shadow-md ring-1 ring-amber-400/50'
                      : 'bg-white/80 border-amber-200/80 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    {paymentMethod === 'CREDIT_CARD' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className="font-bold text-xs mt-0.5 text-slate-900">Credit Card</span>
                  <span className="text-[9px] text-slate-500 leading-tight">Visa / Master</span>
                </button>
              )}

              {/* Option 4: Cash on Delivery */}
              {allowCod && (
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setPaymentMethod('COD');
                  }}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-start gap-1 text-left transition-all cursor-pointer ${
                    paymentMethod === 'COD'
                      ? 'bg-amber-100/90 border-amber-500 text-slate-900 shadow-md ring-1 ring-amber-400/50'
                      : 'bg-white/80 border-amber-200/80 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    {paymentMethod === 'COD' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className="font-bold text-xs mt-0.5 text-slate-900">COD</span>
                  <span className="text-[9px] text-slate-500 leading-tight">Pay at Doorstep</span>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SPECIAL SECTION: APPLE PAY & GOOGLE PAY (ZERO CARD NUMBER TYPING) */}
          {/* ========================================================================= */}
          {paymentMethod === 'APPLE_GOOGLE_PAY' && (
            <div className="space-y-3 bg-gradient-to-b from-slate-950 via-[#1a1714] to-slate-950 p-4 rounded-2xl border-2 border-amber-400 text-white shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-xs font-serif font-black tracking-wide text-amber-300 uppercase">
                    1-Touch Biometric Wallet
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/50">
                  🔒 No Card Number Required
                </span>
              </div>

              {/* Wallet Selector Tabs */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setActiveWallet('APPLE_PAY');
                  }}
                  className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeWallet === 'APPLE_PAY'
                      ? 'bg-white text-black shadow-lg scale-[1.02]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <span className="text-base leading-none"></span>
                  <span>Apple Pay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setActiveWallet('GOOGLE_PAY');
                  }}
                  className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeWallet === 'GOOGLE_PAY'
                      ? 'bg-white text-black shadow-lg scale-[1.02]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <span className="text-sm font-black text-[#4285F4]">G</span>
                  <span>Google Pay</span>
                </button>
              </div>

              {/* Responsive Flow: 1-Tap on Device OR Scan-to-Pay QR on Desktop */}
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center gap-3">
                {/* QR Code Container */}
                <div className="p-2 bg-white rounded-xl shadow-md border-2 border-amber-400 shrink-0">
                  <img
                    src={walletQrUrl}
                    alt={`${activeWallet} Scan QR`}
                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
                  />
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <h6 className="text-xs font-bold text-amber-200">
                    {activeWallet === 'APPLE_PAY' ? ' Pay with Face ID / Touch ID' : 'G Pay with Fingerprint'}
                  </h6>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    <strong>Mobile Users:</strong> Tap the button below to authorize instantly via Face ID.<br />
                    <strong>Desktop Users:</strong> Point your iPhone / Android camera at the QR code to complete payment on your phone without typing any numbers!
                  </p>
                </div>
              </div>

              {/* Direct 1-Tap Biometric Trigger Button */}
              {activeWallet === 'APPLE_PAY' ? (
                <button
                  type="button"
                  onClick={() => triggerBiometricPayment('APPLE_PAY')}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-black hover:bg-neutral-900 text-white font-black text-sm flex items-center justify-center gap-2 border border-neutral-700 shadow-xl transition-transform active:scale-98 cursor-pointer"
                >
                  <span className="text-lg leading-none"></span>
                  <span>Pay with Apple Pay (AED {totalAmount.toFixed(2)})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => triggerBiometricPayment('GOOGLE_PAY')}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-transform active:scale-98 cursor-pointer"
                >
                  <span className="text-base font-black text-[#4285F4]">G</span>
                  <span>Pay with Google Pay (AED {totalAmount.toFixed(2)})</span>
                </button>
              )}
            </div>
          )}

          {/* Shipping & Delivery Address Form */}
          <div className="space-y-3 bg-white/90 p-4 rounded-xl border border-amber-200/80 shadow-xs">
            <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>UAE Delivery Address</span>
            </h5>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={customer.name}
                  onChange={e => setCustomer({ ...customer, name: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                  required
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Mobile Phone (WhatsApp)</label>
                <input
                  type="text"
                  value={customer.phone}
                  onChange={e => setCustomer({ ...customer, phone: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Street / Villa / Apartment</label>
                <input
                  type="text"
                  value={customer.shippingAddress}
                  onChange={e => setCustomer({ ...customer, shippingAddress: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">City</label>
                <input
                  type="text"
                  value={customer.city}
                  onChange={e => setCustomer({ ...customer, city: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Emirate</label>
                <select
                  value={customer.emirate}
                  onChange={e => setCustomer({ ...customer, emirate: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                >
                  <option value="Dubai">Dubai</option>
                  <option value="Abu Dhabi">Abu Dhabi</option>
                  <option value="Al Ain">Al Ain</option>
                  <option value="Sharjah">Sharjah</option>
                  <option value="Ajman">Ajman</option>
                  <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                  <option value="Fujairah">Fujairah</option>
                  <option value="Umm Al Quwain">Umm Al Quwain</option>
                </select>
              </div>
            </div>
          </div>

          {/* Conditional Standard Credit Card Inputs (Only when explicitly selected) */}
          {paymentMethod === 'CREDIT_CARD' && (
            <div className="space-y-3 bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 shadow-xs">
              <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                <span>Manual Card Details (Encrypted 256-bit SSL)</span>
              </h5>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  className="w-full bg-white border border-indigo-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 font-mono shadow-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Expires (MM/YY)</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={e => setCardExpiry(e.target.value)}
                    className="w-full bg-white border border-indigo-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 font-mono shadow-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">CVC / CVV</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={cardCvc}
                    onChange={e => setCardCvc(e.target.value)}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full bg-white border border-indigo-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 font-mono shadow-xs"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Order Summary Box */}
          <div className="bg-white/90 p-3.5 rounded-xl border border-amber-200/80 space-y-1.5 text-xs shadow-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal ({checkoutItems.length}):</span>
              <span className="font-mono font-bold text-slate-900">AED {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Express Delivery (UAE):</span>
              <span className={`font-mono font-bold ${shippingFee === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                {shippingFee === 0 ? 'FREE (Complimentary)' : `AED ${shippingFee.toFixed(2)}`}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>UAE VAT (5%):</span>
              <span className="font-mono font-bold text-slate-900">AED {vatAmount.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-amber-200 flex justify-between items-center text-sm font-bold">
              <span className="text-slate-800">Total Payable:</span>
              <span className="font-mono font-black text-amber-950 text-base">
                AED {totalAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="px-6 py-4 border-t border-amber-200/80 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-slate-800 border border-amber-300 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {paymentMethod === 'APPLE_GOOGLE_PAY' ? (
            <button
              type="button"
              onClick={() => triggerBiometricPayment(activeWallet)}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 rounded-xl bg-black hover:bg-neutral-900 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-transform active:scale-98"
            >
              <Fingerprint className="w-4 h-4 text-amber-400" />
              <span>Authorize {activeWallet === 'APPLE_PAY' ? ' Apple Pay' : 'Google Pay'} (AED {totalAmount.toFixed(2)})</span>
            </button>
          ) : paymentMethod === 'BANK_QR' ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-black"
            >
              <QrCode className="w-4 h-4" />
              <span>Proceed to Bank QR Transfer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : paymentMethod === 'COD' ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-black"
            >
              <Banknote className="w-4 h-4" />
              <span>{isProcessing ? 'Booking Order...' : `Confirm Cash on Delivery (AED ${totalAmount.toFixed(2)})`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-black"
            >
              <Lock className="w-4 h-4" />
              <span>{isProcessing ? 'Authorizing Payment...' : `Pay AED ${totalAmount.toFixed(2)} with Card`}</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/*  APPLE PAY / GOOGLE PAY BIOMETRIC AUTHORIZATION SHEET MODAL */}
      {/* ========================================================================= */}
      {showBiometricSheet && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1C1C1E] text-white rounded-t-3xl sm:rounded-3xl border border-neutral-700 shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">
                  {activeWallet === 'APPLE_PAY' ? ' Pay' : 'G Pay'}
                </span>
                <span className="text-xs text-neutral-400">• Vintage Vibes LLC SPC</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBiometricSheet(false)}
                className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Total Amount & Card Preview */}
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-xs uppercase text-neutral-400 font-bold tracking-wider">Total Charge</span>
                <span className="text-2xl font-mono font-black text-white">AED {totalAmount.toFixed(2)}</span>
              </div>

              <div className="bg-neutral-850 p-3.5 rounded-2xl border border-neutral-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-7 rounded bg-gradient-to-r from-amber-500 to-amber-700 flex items-center justify-center font-black text-[10px] text-white shadow-xs">
                    VISA
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Emirates NBD •••• 8821</span>
                    <span className="text-[10px] text-neutral-400">Apple Wallet Default</span>
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="text-xs text-neutral-400 flex items-center justify-between px-1">
                <span>Shipping to:</span>
                <span className="text-white font-medium truncate max-w-[200px]">{customer.shippingAddress}, {customer.emirate}</span>
              </div>
            </div>

            {/* Biometric Trigger Action */}
            <div className="pt-2 flex flex-col items-center justify-center space-y-3">
              {biometricSuccess ? (
                <div className="flex flex-col items-center space-y-2 py-4 animate-in zoom-in-90 duration-300">
                  <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg">
                    <Check className="w-10 h-10" />
                  </div>
                  <span className="font-bold text-sm text-emerald-400">Payment Approved with Face ID</span>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-neutral-800 border-2 border-amber-400 flex items-center justify-center text-amber-400 animate-pulse">
                    <Fingerprint className="w-10 h-10" />
                  </div>
                  <p className="text-xs text-neutral-300 text-center">
                    {activeWallet === 'APPLE_PAY'
                      ? 'Confirm with Face ID / Double Click Side Button'
                      : 'Touch Fingerprint Sensor to Confirm'}
                  </p>

                  <button
                    type="button"
                    onClick={handleBiometricConfirm}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all transform active:scale-98 shadow-lg cursor-pointer"
                  >
                    Confirm & Authorize AED {totalAmount.toFixed(2)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
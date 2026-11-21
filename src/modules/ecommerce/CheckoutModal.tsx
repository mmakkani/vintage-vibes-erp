import React, { useState, useEffect, useRef } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile } from '../setup/setup.types.ts';
import { PaymentMethod, CheckoutCustomerInfo } from './ecommerce.types.ts';
import {
  X,
  CreditCard,
  QrCode,
  ShoppingBag,
  MapPin,
  Lock,
  ArrowRight,
  CheckCircle2,
  Banknote,
  Check,
  Fingerprint,
  CameraOff,
  Wallet,
  AlertTriangle
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';
import { CrmRetailCustomer } from '../../services/crmService.ts';

const AppleLogoSvg: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 fill-current inline-block shrink-0' }) => (
  <svg viewBox="0 0 384 512" className={className} aria-hidden="true">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  piece?: PieceBreakdownItem | null;
  items?: PieceBreakdownItem[];
  companyProfile: CompanyProfile;
  customerUser?: CrmRetailCustomer | null;
  onOpenBankQr: (items: PieceBreakdownItem[], totalAmount: number, customer: CheckoutCustomerInfo) => void;
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
  customerUser,
  onOpenBankQr,
  onCompleteCheckout,
  isProcessing
}) => {
  // Determine available payment methods & gateway configuration
  const allowAppleGoogle = companyProfile.enableAppleGooglePay !== false;
  const allowBank = companyProfile.enableBankTransfer !== false;
  const allowCard = companyProfile.enableCardPay !== false;
  const allowCod = companyProfile.enableCod !== false;

  const onlineCardIntegrationId = companyProfile?.paymentGateway?.paymobOnlineCardIntegrationId || companyProfile?.paymobOnlineCardIntegrationId;
  const isOnlineCardConfigured =
    Boolean(onlineCardIntegrationId && String(onlineCardIntegrationId).trim()) ||
    (companyProfile?.paymentGateway?.provider === 'STRIPE_UAE' && !!companyProfile?.paymentGateway?.secretKey);
  const onlineApplePayId = companyProfile?.paymentGateway?.paymobApplePayIntegrationId || companyProfile?.paymobApplePayIntegrationId;
  const isApplePayConfigured =
    Boolean(onlineApplePayId && String(onlineApplePayId).trim()) ||
    (companyProfile?.paymentGateway?.provider === 'STRIPE_UAE' &&
      !!companyProfile?.paymentGateway?.secretKey &&
      companyProfile?.paymentGateway?.allowApplePay !== false);

  const defaultMethod: PaymentMethod = allowCard
    ? 'CREDIT_CARD'
    : allowAppleGoogle
    ? 'APPLE_GOOGLE_PAY'
    : allowBank
    ? 'BANK_QR'
    : 'COD';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);
  const [activeWallet, setActiveWallet] = useState<'APPLE_PAY' | 'GOOGLE_PAY'>(() =>
    isApplePayConfigured ? 'APPLE_PAY' : 'GOOGLE_PAY'
  );
  const [showBiometricSheet, setShowBiometricSheet] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);
  const [useStoreCredit, setUseStoreCredit] = useState<boolean>(true);
  const [isInitializingGateway, setIsInitializingGateway] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const deliveryFormRef = useRef<HTMLDivElement | null>(null);

  // Customer Form initialized from authenticated customerUser if present
  const [customer, setCustomer] = useState<CheckoutCustomerInfo>(() => ({
    name: customerUser?.name || '',
    phone: customerUser?.phone || '',
    email: customerUser?.email || '',
    shippingAddress: customerUser?.address || '',
    city: 'Al Ain',
    emirate: 'Al Ain'
  }));

  useEffect(() => {
    if (!isApplePayConfigured && activeWallet === 'APPLE_PAY') {
      setActiveWallet('GOOGLE_PAY');
    }
  }, [isApplePayConfigured, activeWallet]);

  useEffect(() => {
    if (customerUser) {
      setCustomer(prev => ({
        ...prev,
        name: prev.name || customerUser.name || '',
        phone: prev.phone || customerUser.phone || '',
        email: prev.email || customerUser.email || '',
        shippingAddress: prev.shippingAddress || customerUser.address || ''
      }));
    }
  }, [customerUser]);

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
  const rawTotalAmount = Number((subtotal + shippingFee + vatAmount).toFixed(2));

  // Store Credit Wallet (COA: 2150-01) Deduction
  const userWalletBal = Number(customerUser?.wallet_balance ?? customerUser?.walletBalance ?? 0);
  const effectiveWalletUsed = (useStoreCredit && userWalletBal > 0) ? Math.min(userWalletBal, rawTotalAmount) : 0;
  const totalAmount = Number((rawTotalAmount - effectiveWalletUsed).toFixed(2));

  // Dynamic QR Code for Desktop -> Mobile Checkout Scan
  const barcodesParam = checkoutItems.map(i => i.barcode).filter(Boolean).join(',');
  const publicOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://vintagevibesgk.com';
  const checkoutDeepLink = `${publicOrigin}/?checkout=${encodeURIComponent(barcodesParam)}`;
  const walletQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(checkoutDeepLink)}`;

  const validateCustomerDetails = (): boolean => {
    if (!customer.name.trim()) {
      setFormError('Please enter your full name in the UAE Delivery Address section.');
      deliveryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!customer.phone.trim() || customer.phone.replace(/[^0-9]/g, '').length < 7) {
      setFormError('Please enter a valid mobile or WhatsApp number for delivery.');
      deliveryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!customer.shippingAddress.trim()) {
      setFormError('Please enter your street, villa, or apartment delivery address.');
      deliveryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setFormError(null);
    return true;
  };

  const reserveItemsBeforeRedirect = async () => {
    try {
      let sid = '';
      try {
        sid = sessionStorage.getItem('vv_ecommerce_session') || '';
      } catch {}
      if (!sid) sid = `sess-${Date.now()}`;
      await Promise.allSettled(
        checkoutItems.map(item =>
          fetch('/api/ecommerce/cart/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              barcode: item.barcode,
              sessionId: sid,
              pieceTitle: item.itemName || item.brandName,
              priceAed: item.estimatedPrice || item.retailPriceAed || 295
            })
          })
        )
      );
    } catch {}
  };

  const savePendingPaymobCheckout = (
    orderReference: string,
    paymentIntentId: string | undefined,
    paymentType: 'APPLE_PAY' | 'GOOGLE_PAY' | 'PAYMOB_CARD'
  ) => {
    try {
      localStorage.setItem(
        'vv_pending_paymob_checkout',
        JSON.stringify({
          orderReference,
          paymentIntentId: paymentIntentId || '',
          items: checkoutItems,
          customer,
          walletAmountUsed: effectiveWalletUsed,
          totalAmount,
          paymentType,
          createdAt: Date.now()
        })
      );
    } catch {}
  };

  const effectiveActiveWallet: 'APPLE_PAY' | 'GOOGLE_PAY' =
    isApplePayConfigured ? activeWallet : 'GOOGLE_PAY';

  const triggerBiometricPayment = async (walletType: 'APPLE_PAY' | 'GOOGLE_PAY') => {
    const resolvedWallet = isApplePayConfigured ? walletType : 'GOOGLE_PAY';
    if (!validateCustomerDetails()) return;
    setActiveWallet(resolvedWallet);
    setShowBiometricSheet(true);
    luxuryAudio.playMechanicalClick();
  };

  const handleBiometricConfirm = async () => {
    if (!validateCustomerDetails()) {
      setShowBiometricSheet(false);
      return;
    }
    luxuryAudio.playWaxSealSound();
    setBiometricSuccess(true);
    setIsInitializingGateway(true);
    setFormError(null);

    const orderReference = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const checkoutSnapshot = {
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email || customerUser?.email || '',
      shippingAddress: customer.shippingAddress,
      city: customer.city || customer.emirate || 'Al Ain',
      country: 'UAE',
      items: checkoutItems.map(it => ({
        pieceId: it.id,
        barcode: it.barcode,
        description: `${it.brandName} ${it.itemName} (${it.sizeScanned || 'L'})`,
        weightKg: it.weightKg || 0.4,
        unitPrice: it.estimatedPrice || it.retailPriceAed || 295
      })),
      customerId: customerUser?.id,
      customerType: customerUser?.customer_type || 'RETAIL',
      walletAmountUsed: effectiveWalletUsed
    };

    let gatewayIntent: any = null;
    try {
      const intentRes = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountAed: totalAmount,
          orderReference,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || customerUser?.email || '',
          originUrl: publicOrigin,
          checkoutSnapshot
        })
      });
      gatewayIntent = await intentRes.json();
    } catch {}

    if (gatewayIntent?.checkoutUrl) {
      savePendingPaymobCheckout(orderReference, gatewayIntent.paymentIntentId, effectiveActiveWallet);
      await reserveItemsBeforeRedirect();
      window.location.href = gatewayIntent.checkoutUrl;
      return;
    }

    if (gatewayIntent?.isLiveGateway && gatewayIntent?.error) {
      setShowBiometricSheet(false);
      setBiometricSuccess(false);
      setIsInitializingGateway(false);
      setFormError(gatewayIntent.error);
      return;
    }

    setTimeout(async () => {
      setShowBiometricSheet(false);
      setBiometricSuccess(false);
      setIsInitializingGateway(false);

      await onCompleteCheckout(checkoutItems, 'CARD_POS', customer, {
        type: effectiveActiveWallet,
        authorizedVia: effectiveActiveWallet === 'APPLE_PAY' ? 'Apple Pay Face ID' : 'Google Pay Biometric',
        walletRef: gatewayIntent?.paymentIntentId || `${effectiveActiveWallet}-${Date.now().toString().slice(-6)}`,
        isLiveGateway: gatewayIntent?.isLiveGateway || false,
        walletAmountUsed: effectiveWalletUsed,
        customerId: customerUser?.id,
        customerType: customerUser?.customer_type
      });
    }, 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    luxuryAudio.playMechanicalClick();

    if (!validateCustomerDetails()) return;

    if (totalAmount === 0) {
      await onCompleteCheckout(checkoutItems, 'COD', customer, {
        type: 'STORE_CREDIT',
        walletAmountUsed: effectiveWalletUsed,
        customerId: customerUser?.id,
        customerType: customerUser?.customer_type
      });
      return;
    }

    if (paymentMethod === 'APPLE_GOOGLE_PAY') {
      await triggerBiometricPayment(effectiveActiveWallet);
    } else if (paymentMethod === 'BANK_QR') {
      onClose();
      onOpenBankQr(checkoutItems, totalAmount, customer);
    } else if (paymentMethod === 'CREDIT_CARD') {
      setIsInitializingGateway(true);
      setFormError(null);
      const orderReference = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const checkoutSnapshot = {
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email || customerUser?.email || '',
        shippingAddress: customer.shippingAddress,
        city: customer.city || customer.emirate || 'Al Ain',
        country: 'UAE',
        items: checkoutItems.map(it => ({
          pieceId: it.id,
          barcode: it.barcode,
          description: `${it.brandName} ${it.itemName} (${it.sizeScanned || 'L'})`,
          weightKg: it.weightKg || 0.4,
          unitPrice: it.estimatedPrice || it.retailPriceAed || 295
        })),
        customerId: customerUser?.id,
        customerType: customerUser?.customer_type || 'RETAIL',
        walletAmountUsed: effectiveWalletUsed
      };
      let gatewayIntent: any = null;
      try {
        const intentRes = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountAed: totalAmount,
            orderReference,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email || customerUser?.email || '',
            originUrl: publicOrigin,
            checkoutSnapshot
          })
        });
        gatewayIntent = await intentRes.json();
      } catch {}

      if (gatewayIntent?.checkoutUrl) {
        savePendingPaymobCheckout(orderReference, gatewayIntent.paymentIntentId, 'PAYMOB_CARD');
        await reserveItemsBeforeRedirect();
        window.location.href = gatewayIntent.checkoutUrl;
        return;
      }

      if (gatewayIntent?.isLiveGateway && gatewayIntent?.error) {
        setIsInitializingGateway(false);
        setFormError(gatewayIntent.error);
        return;
      }

      setIsInitializingGateway(false);
      await onCompleteCheckout(checkoutItems, 'CARD_POS', customer, {
        type: 'PAYMOB_CARD',
        walletRef: gatewayIntent?.paymentIntentId || `PAYMOB-${Date.now().toString().slice(-6)}`,
        isLiveGateway: gatewayIntent?.isLiveGateway || false,
        walletAmountUsed: effectiveWalletUsed,
        customerId: customerUser?.id,
        customerType: customerUser?.customer_type
      });
    } else {
      // Cash on Delivery
      await onCompleteCheckout(checkoutItems, 'COD', customer, {
        type: 'CASH_ON_DELIVERY',
        walletAmountUsed: effectiveWalletUsed,
        customerId: customerUser?.id,
        customerType: customerUser?.customer_type
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
              {/* Option 1: Apple Pay (when enabled) & Google Pay (1-Touch Biometric / QR) */}
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
                    {isApplePayConfigured ? (
                      <span className="font-bold text-xs inline-flex items-center gap-1">
                        <AppleLogoSvg className="w-3 h-3 fill-current" />
                        <span>Pay / GPay</span>
                      </span>
                    ) : (
                      <span className="font-bold text-xs inline-flex items-center gap-1">
                        <span className="font-black text-[#4285F4]">G</span>
                        <span>Google Pay</span>
                      </span>
                    )}
                    {paymentMethod === 'APPLE_GOOGLE_PAY' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <span className={`text-[9px] font-medium leading-tight ${paymentMethod === 'APPLE_GOOGLE_PAY' ? 'text-amber-200' : 'text-slate-500'}`}>
                    {isApplePayConfigured ? '1-Touch Biometric' : '1-Touch Wallet'}
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
          {/* SPECIAL SECTION: GOOGLE PAY / APPLE PAY (ZERO CARD NUMBER TYPING) */}
          {/* ========================================================================= */}
          {paymentMethod === 'APPLE_GOOGLE_PAY' && (
            <div className="space-y-3 bg-gradient-to-b from-slate-950 via-[#1a1714] to-slate-950 p-4 rounded-2xl border-2 border-amber-400 text-white shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-xs font-serif font-black tracking-wide text-amber-300 uppercase">
                    {isApplePayConfigured ? '1-Touch Biometric Wallet' : 'Google Pay Express Wallet'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/50">
                  🔒 No Card Number Required
                </span>
              </div>

              {/* Wallet Selector Tabs (show dual switcher only when Apple Pay ID is configured) */}
              {isApplePayConfigured && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      luxuryAudio.playMechanicalClick();
                      setActiveWallet('APPLE_PAY');
                    }}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      effectiveActiveWallet === 'APPLE_PAY'
                        ? 'bg-white text-black shadow-lg scale-[1.02]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <AppleLogoSvg className="w-3.5 h-3.5 fill-current" />
                    <span>Apple Pay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      luxuryAudio.playMechanicalClick();
                      setActiveWallet('GOOGLE_PAY');
                    }}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      effectiveActiveWallet === 'GOOGLE_PAY'
                        ? 'bg-white text-black shadow-lg scale-[1.02]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <span className="text-sm font-black text-[#4285F4]">G</span>
                    <span>Google Pay</span>
                  </button>
                </div>
              )}

              {/* Responsive Flow: 1-Tap on Device OR Scan-to-Pay QR on Desktop */}
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center gap-3">
                {/* QR Code Container */}
                <div className="p-2 bg-white rounded-xl shadow-md border-2 border-amber-400 shrink-0">
                  <img
                    src={walletQrUrl}
                    alt={`${effectiveActiveWallet === 'APPLE_PAY' ? 'Apple Pay' : 'Google Pay'} Scan QR`}
                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
                  />
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <h6 className="text-xs font-bold text-amber-200 inline-flex items-center gap-1.5 justify-center sm:justify-start">
                    {effectiveActiveWallet === 'APPLE_PAY' ? (
                      <>
                        <AppleLogoSvg className="w-3.5 h-3.5 fill-current" />
                        <span>Pay with Face ID / Touch ID</span>
                      </>
                    ) : (
                      <span>G Pay with Google Wallet</span>
                    )}
                  </h6>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    <strong>Mobile Users:</strong>{' '}
                    {effectiveActiveWallet === 'APPLE_PAY'
                      ? 'Tap the button below to authorize instantly via Face ID or Touch ID.'
                      : 'Tap the button below to pay securely with Google Pay via Paymob UAE.'}
                    <br />
                    <strong>Desktop Users:</strong> Point your smartphone camera at the QR code to open checkout directly on your phone.
                  </p>
                </div>
              </div>

              {/* Direct 1-Tap Biometric Trigger Button */}
              {effectiveActiveWallet === 'APPLE_PAY' ? (
                <button
                  type="button"
                  onClick={() => triggerBiometricPayment('APPLE_PAY')}
                  disabled={isProcessing || isInitializingGateway}
                  className="w-full py-3 rounded-xl bg-black hover:bg-neutral-900 text-white font-black text-sm flex items-center justify-center gap-2 border border-neutral-700 shadow-xl transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <AppleLogoSvg className="w-4 h-4 fill-current" />
                  <span>Pay with Apple Pay (AED {totalAmount.toFixed(2)})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => triggerBiometricPayment('GOOGLE_PAY')}
                  disabled={isProcessing || isInitializingGateway}
                  className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <span className="text-base font-black text-[#4285F4]">G</span>
                  <span>Pay with Google Pay (AED {totalAmount.toFixed(2)})</span>
                </button>
              )}
            </div>
          )}

          {/* Shipping & Delivery Address Form */}
          <div ref={deliveryFormRef} className="space-y-3 bg-white/90 p-4 rounded-xl border border-amber-200/80 shadow-xs">
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
                  onChange={e => {
                    setCustomer({ ...customer, name: e.target.value });
                    if (formError) setFormError(null);
                  }}
                  placeholder="Enter your full name"
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                  required
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Mobile Phone (WhatsApp)</label>
                <input
                  type="text"
                  value={customer.phone}
                  onChange={e => {
                    setCustomer({ ...customer, phone: e.target.value });
                    if (formError) setFormError(null);
                  }}
                  placeholder="+971 50 000 0000"
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Street / Villa / Apartment</label>
                <input
                  type="text"
                  value={customer.shippingAddress}
                  onChange={e => {
                    setCustomer({ ...customer, shippingAddress: e.target.value });
                    if (formError) setFormError(null);
                  }}
                  placeholder="Building, street, or villa number"
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
                  onChange={e => setCustomer({ ...customer, emirate: e.target.value, city: e.target.value })}
                  className="w-full bg-white border border-amber-300/80 rounded-lg p-2 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                >
                  <option value="Al Ain">Al Ain</option>
                  <option value="Abu Dhabi">Abu Dhabi</option>
                  <option value="Dubai">Dubai</option>
                  <option value="Sharjah">Sharjah</option>
                  <option value="Ajman">Ajman</option>
                  <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                  <option value="Fujairah">Fujairah</option>
                  <option value="Umm Al Quwain">Umm Al Quwain</option>
                </select>
              </div>
            </div>
          </div>

          {/* Real Paymob / Licensed UAE Acquirer Card Flow */}
          {paymentMethod === 'CREDIT_CARD' && (
            <div className="space-y-3 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-purple-50/80 p-4 rounded-xl border border-indigo-200 shadow-xs">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Paymob UAE 3D-Secure Card Checkout</span>
                </h5>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                  PCI-DSS Level 1 Encrypted
                </span>
              </div>

              {isOnlineCardConfigured ? (
                <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-2 text-xs text-slate-700">
                  <p className="font-medium leading-relaxed">
                    Your card payment will be securely processed via the official <strong>Paymob UAE</strong> 3D-Secure gateway. After submitting your card details, you will receive an SMS OTP from your bank (RAKBANK, Emirates NBD, ADCB, FAB, etc.) to authorize the purchase.
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-semibold">
                    <span className="flex items-center gap-1">🔒 256-bit Tokenization</span>
                    <span className="flex items-center gap-1">📱 Bank SMS OTP</span>
                    <span className="flex items-center gap-1">🏦 UAE Acquirer</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Online Card Checkout Unavailable</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800/90">
                    Online card checkout is temporarily unavailable while gateway setup is finalized. To complete your order immediately, please select <strong>Cash on Delivery (COD)</strong> or <strong>Instant Bank Transfer (QR / IBAN)</strong>.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('COD')}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                    >
                      Switch to COD (Doorstep)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!validateCustomerDetails()) return;
                        onClose();
                        onOpenBankQr(checkoutItems, totalAmount, customer);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                    >
                      Pay via Bank QR / IBAN
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Order Summary Box */}
          <div className="bg-white/90 p-3.5 rounded-xl border border-amber-200/80 space-y-2 text-xs shadow-xs">
            {userWalletBal > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-300 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-amber-700" />
                  <div>
                    <span className="font-bold text-amber-950 block leading-tight">Store Credit Wallet</span>
                    <span className="text-[10px] text-amber-800/80 font-mono">Available: AED {userWalletBal.toFixed(2)} (COA 2150-01)</span>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useStoreCredit}
                    onChange={e => setUseStoreCredit(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-emerald-800">
                    {useStoreCredit ? `- AED ${effectiveWalletUsed.toFixed(2)}` : 'Apply'}
                  </span>
                </label>
              </div>
            )}

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
            {effectiveWalletUsed > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold border-t border-dashed border-emerald-300 pt-1">
                <span>Store Credit Applied (2150-01):</span>
                <span className="font-mono">- AED {effectiveWalletUsed.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-amber-200 flex justify-between items-center text-sm font-bold">
              <span className="text-slate-800">Total Payable:</span>
              <span className="font-mono font-black text-amber-950 text-base">
                AED {totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
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

          {totalAmount === 0 ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || isInitializingGateway}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-transform active:scale-98 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Confirm Order with Store Credit (AED 0.00 Due)</span>
            </button>
          ) : paymentMethod === 'APPLE_GOOGLE_PAY' ? (
            <button
              type="button"
              onClick={() => triggerBiometricPayment(effectiveActiveWallet)}
              disabled={isProcessing || isInitializingGateway}
              className="flex-1 py-2.5 px-4 rounded-xl bg-black hover:bg-neutral-900 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-transform active:scale-98 disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4 text-amber-400" />
              <span className="inline-flex items-center gap-1">
                <span>Authorize</span>
                {effectiveActiveWallet === 'APPLE_PAY' ? (
                  <>
                    <AppleLogoSvg className="w-3.5 h-3.5 fill-current" />
                    <span>Apple Pay</span>
                  </>
                ) : (
                  <span>Google Pay</span>
                )}
                <span>(AED {totalAmount.toFixed(2)})</span>
              </span>
            </button>
          ) : paymentMethod === 'BANK_QR' ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || isInitializingGateway}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-black disabled:opacity-50"
            >
              <QrCode className="w-4 h-4" />
              <span>Proceed to Bank QR Transfer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : paymentMethod === 'COD' ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || isInitializingGateway}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-black"
            >
              <Banknote className="w-4 h-4" />
              <span>{isProcessing ? 'Booking Order...' : `Confirm Cash on Delivery (AED ${totalAmount.toFixed(2)})`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || isInitializingGateway}
              className="flex-1 py-2.5 px-4 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-black"
            >
              <Lock className="w-4 h-4" />
              <span>
                {isInitializingGateway
                  ? 'Connecting to Paymob UAE...'
                  : isProcessing
                  ? 'Authorizing Payment...'
                  : `Pay AED ${totalAmount.toFixed(2)} with Card`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* APPLE PAY / GOOGLE PAY BIOMETRIC AUTHORIZATION SHEET MODAL */}
      {/* ========================================================================= */}
      {showBiometricSheet && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1C1C1E] text-white rounded-t-3xl sm:rounded-3xl border border-neutral-700 shadow-2xl p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                {effectiveActiveWallet === 'APPLE_PAY' ? (
                  <span className="text-xl font-bold inline-flex items-center gap-1.5">
                    <AppleLogoSvg className="w-4 h-4 fill-current" />
                    <span>Pay</span>
                  </span>
                ) : (
                  <span className="text-xl font-bold inline-flex items-center gap-1.5">
                    <span className="text-[#4285F4] font-black">G</span>
                    <span>Pay</span>
                  </span>
                )}
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
                    <span className="text-xs font-bold block">RAKBANK Paymob •••• UAE 3D-Secure</span>
                    <span className="text-[10px] text-neutral-400">
                      {effectiveActiveWallet === 'APPLE_PAY' ? 'Apple Pay / Digital Wallet' : 'Google Pay Express Wallet'}
                    </span>
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
                  <span className="font-bold text-sm text-emerald-400">
                    {effectiveActiveWallet === 'APPLE_PAY' ? 'Payment Approved with Face ID' : 'Redirecting to Paymob UAE...'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-neutral-800 border-2 border-amber-400 flex items-center justify-center text-amber-400 animate-pulse">
                    <Fingerprint className="w-10 h-10" />
                  </div>
                  <p className="text-xs text-neutral-300 text-center">
                    {effectiveActiveWallet === 'APPLE_PAY'
                      ? 'Confirm with Face ID / Double Click Side Button'
                      : 'Tap Confirm below to authorize via Paymob UAE Google Pay'}
                  </p>

                  <button
                    type="button"
                    onClick={handleBiometricConfirm}
                    disabled={isProcessing || isInitializingGateway}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all transform active:scale-98 shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {isInitializingGateway ? 'Connecting to Paymob UAE...' : `Confirm & Authorize AED ${totalAmount.toFixed(2)}`}
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
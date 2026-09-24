import React, { useState, useEffect } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile } from '../setup/setup.types.ts';
import {
  X,
  Trash2,
  ShoppingBag,
  Clock,
  Truck,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CameraOff
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: PieceBreakdownItem[];
  onRemoveItem: (barcode: string) => void;
  onCheckout: () => void;
  companyProfile: CompanyProfile;
  onTimerExpire?: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onRemoveItem,
  onCheckout,
  companyProfile,
  onTimerExpire
}) => {
  // 10-minute (600 seconds) Vault Reserve Timer
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(600);

  useEffect(() => {
    if (!isOpen || cartItems.length === 0) {
      setTimeLeftSeconds(600);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeftSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimerExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, cartItems.length, onTimerExpire]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Calculate pricing
  const subtotal = cartItems.reduce(
    (acc, item) => acc + (item.estimatedPrice || item.retailPriceAed || 295),
    0
  );

  const freeThreshold = companyProfile.freeShippingThresholdAed ?? 350;
  const standardShipping = companyProfile.standardShippingFeeAed ?? 25;
  const isFreeShipping = subtotal >= freeThreshold;
  const shippingFee = cartItems.length === 0 ? 0 : isFreeShipping ? 0 : standardShipping;
  const amountNeededForFreeShipping = Math.max(0, freeThreshold - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / freeThreshold) * 100));

  const vatAmount = Number((subtotal * 0.05).toFixed(2));
  const grandTotal = Number((subtotal + shippingFee + vatAmount).toFixed(2));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={() => {
          luxuryAudio.playMechanicalClick();
          onClose();
        }}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity cursor-pointer"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-gradient-to-b from-[#FFFDF8] via-[#FAF3E0] to-[#F5EADB] border-l-2 border-amber-400 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-amber-200/90 bg-gradient-to-r from-[#FAF3E0] via-[#FDF9EE] to-[#FAF3E0] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-800">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900 font-serif flex items-center gap-2">
                  <span>Vault Cart</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-mono font-black border border-amber-300">
                    {cartItems.length} {cartItems.length === 1 ? 'Piece' : 'Pieces'}
                  </span>
                </h3>
                <p className="text-[10px] text-amber-900/70 font-medium">1-of-1 Verified Vintage Archive Pieces</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                onClose();
              }}
              className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg bg-amber-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-amber-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Close Cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 10-Minute Vault Hold Timer Alert */}
          {cartItems.length > 0 && (
            <div className="px-4 py-2 bg-gradient-to-r from-amber-500/15 via-amber-400/20 to-amber-500/15 border-b border-amber-300/70 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-amber-950 font-bold">
                <Clock className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                <span className="text-[11px]">1-of-1 Vault Hold Reserved:</span>
              </div>
              <span className="font-mono font-black text-amber-900 bg-white/80 px-2 py-0.5 rounded border border-amber-300 text-xs">
                ⏱️ {formattedTime}
              </span>
            </div>
          )}

          {/* Free Shipping Progress Meter */}
          {cartItems.length > 0 && (
            <div className="px-4 py-2.5 bg-white/70 border-b border-amber-200 text-xs">
              <div className="flex items-center justify-between text-[11px] mb-1 font-semibold text-slate-800">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-amber-700" />
                  {isFreeShipping ? (
                    <span className="text-emerald-700 font-bold">🎉 FREE UAE Express Shipping Unlocked!</span>
                  ) : (
                    <span>Add <strong>AED {amountNeededForFreeShipping.toFixed(0)}</strong> more for FREE Shipping</span>
                  )}
                </span>
                <span className="font-mono font-black text-amber-900">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Scrollable Items Section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-amber-100 border-2 border-dashed border-amber-300 flex items-center justify-center text-amber-600">
                  <ShoppingBag className="w-8 h-8 opacity-60" />
                </div>
                <div>
                  <h4 className="font-serif font-black text-base text-slate-900">Your Vault Cart is Empty</h4>
                  <p className="text-xs text-slate-600 max-w-xs mt-1">
                    Authentic 1-of-1 pieces move fast. Browse the vintage catalogue and claim your grails before someone else does.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    onClose();
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md cursor-pointer transition-transform active:scale-95"
                >
                  Explore Vintage Drops
                </button>
              </div>
            ) : (
              cartItems.map(item => {
                const itemPrice = item.estimatedPrice || item.retailPriceAed || 295;
                return (
                  <div
                    key={item.barcode || item.id}
                    className="p-3 bg-white/95 rounded-xl border border-amber-200 shadow-xs flex items-center gap-3 transition-all hover:border-amber-400"
                  >
                    {item.frontImageUrl ? (
                      <img
                        src={item.frontImageUrl}
                        alt={item.brandName}
                        className="w-16 h-20 object-cover rounded-lg border border-amber-200 shrink-0 bg-slate-100"
                      />
                    ) : (
                      <div className="w-16 h-20 rounded-lg border border-amber-200 shrink-0 bg-amber-50 flex flex-col items-center justify-center text-amber-700/60 p-1 text-center">
                        <CameraOff className="w-5 h-5 mb-1" />
                        <span className="text-[8px] font-bold">No Photo</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-mono font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {item.barcode}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            luxuryAudio.playMechanicalClick();
                            onRemoveItem(item.barcode);
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                          title="Remove piece"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h5 className="text-xs font-bold text-slate-900 truncate mt-1">
                        {item.brandName} • {item.style || 'Authentic Vintage'}
                      </h5>

                      <p className="text-[11px] text-slate-600 truncate">
                        Size: <strong className="text-slate-900">{item.sizeScanned || 'L'}</strong> • {item.countryOfOrigin || 'Made in USA'}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {item.labelGrade || 'Grade A+'}
                        </span>
                        <span className="text-xs font-mono font-black text-amber-950">
                          AED {Number(itemPrice).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Order Summary & Checkout Action */}
          {cartItems.length > 0 && (
            <div className="p-4 sm:p-5 border-t border-amber-200/90 bg-gradient-to-b from-white/80 to-[#FAF3E0] space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Vault Pieces ({cartItems.length}):</span>
                  <span className="font-mono font-bold text-slate-900">AED {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>UAE Express Shipping:</span>
                  <span className={`font-mono font-bold ${shippingFee === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {shippingFee === 0 ? 'FREE' : `AED ${shippingFee.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>UAE VAT (5%):</span>
                  <span className="font-mono font-bold text-slate-900">AED {vatAmount.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-amber-200 flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-900">Total Payable:</span>
                  <span className="font-mono font-black text-amber-950 text-base">
                    AED {grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Checkout Trigger with Escape Hatch */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    onClose();
                  }}
                  className="px-3.5 py-3 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  title="Close Cart and Continue Shopping"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    onCheckout();
                  }}
                  className="flex-1 py-3 btn-3d btn-3d-amber text-xs uppercase tracking-wider rounded-xl font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-98"
                >
                  <span>Proceed to Vault Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 text-[10px] text-slate-600 font-medium pt-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> 100% Authentic
                </span>
                <span>•</span>
                <span>Fast UAE Dispatch</span>
                <span>•</span>
                <span>Anti-Ghost Reserve</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

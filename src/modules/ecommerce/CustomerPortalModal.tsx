import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Wallet,
  Package,
  Truck,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Crown,
  LogOut,
  Loader2,
  Receipt,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { supabase } from '../../supabaseClient.ts';
import { CrmRetailCustomer, CrmService } from '../../services/crmService.ts';
import { EcommerceService, CustomerOrderSummary } from '../../services/ecommerceService.ts';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CrmRetailCustomer | null;
  onLogout: () => void;
  onNavigateToWholesale?: () => void;
}

export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  isOpen,
  onClose,
  customer,
  onLogout,
  onNavigateToWholesale
}) => {
  if (!isOpen || !customer) return null;

  const [activeTab, setActiveTab] = useState<'orders' | 'wallet' | 'profile'>('orders');
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(true);
  const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(false);

  const isB2B = customer.customer_type === 'B2B_RESELLER';
  const walletBal = Number(customer.wallet_balance ?? customer.walletBalance ?? 0);

  useEffect(() => {
    if (!customer) return;

    // Load customer order history
    setIsLoadingOrders(true);
    EcommerceService.getCustomerOrders({
      customerId: customer.id,
      phone: customer.phone,
      email: customer.email
    })
      .then(res => setOrders(res || []))
      .catch(() => setOrders([]))
      .finally(() => setIsLoadingOrders(false));

    // Load wallet transactions
    setIsLoadingWallet(true);
    CrmService.getWalletTransactions(customer.id)
      .then(res => setWalletTx(res || []))
      .catch(() => setWalletTx([]))
      .finally(() => setIsLoadingWallet(false));
  }, [customer]);

  const handleSignOut = async () => {
    luxuryAudio.playMechanicalClick();
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    onLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] text-slate-900 rounded-3xl border-2 border-amber-300 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with VIP Banner */}
        <div className="p-6 bg-gradient-to-r from-[#1C160C] via-[#2B2113] to-[#1C160C] text-white flex items-start justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-base shadow-md border-2 border-amber-200">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black font-serif text-white">{customer.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 flex items-center gap-1 shadow-xs">
                  <Crown className="w-3 h-3" />
                  <span>{customer.vip_tier || 'BRONZE'} VIP</span>
                </span>
                {isB2B ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500 text-white flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>B2B Reseller Partner</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-amber-200">
                    Retail Collector
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                {customer.email || customer.phone || customer.code}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-xl text-white/70 hover:text-rose-400 hover:bg-white/10 transition cursor-pointer flex items-center gap-1 text-xs font-bold"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Store Credit Wallet Mini-Bar */}
        <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500 text-white shadow-xs">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider block leading-none">
                Store Credit Wallet
              </span>
              <span className="text-[10px] text-amber-800/80 font-mono">COA: 2150-01 Liability</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-black text-amber-950">
              AED {walletBal.toFixed(2)}
            </span>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
              Auto-Applies at Checkout
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 flex items-center gap-2 cursor-pointer transition ${
              activeTab === 'orders'
                ? 'border-amber-600 text-amber-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Orders & Live Tracking ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallet')}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 flex items-center gap-2 cursor-pointer transition ${
              activeTab === 'wallet'
                ? 'border-amber-600 text-amber-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Wallet Activity</span>
          </button>

          {isB2B && onNavigateToWholesale && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToWholesale();
              }}
              className="ml-auto my-auto py-1 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Open Wholesale Bales</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {activeTab === 'orders' && (
            <div>
              {isLoadingOrders ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Retrieving past orders & courier status...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-6">
                  <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Past Orders Found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    You have not placed any vintage drops orders with this contact information yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map(ord => (
                    <div
                      key={ord.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-slate-900">
                              #{ord.orderNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {ord.orderStatus || 'CONFIRMED'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{new Date(ord.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-black text-emerald-700 block">
                            AED {Number(ord.totalAmount).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {ord.paymentMethod}
                          </span>
                        </div>
                      </div>

                      {/* Items Summary */}
                      <div className="py-2 text-xs text-slate-600 space-y-1">
                        {Array.isArray(ord.items) && ord.items.map((it: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="line-clamp-1">
                              • {it.description || it.itemName || it.name || it.barcode}
                            </span>
                            <span className="font-mono text-slate-500 shrink-0 ml-2">
                              AED {Number(it.unitPrice || it.price || 0).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Live Courier Tracking */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                          <Truck className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="font-bold text-[11px]">{ord.courierName || 'Aramex UAE Express'}</span>
                          <span className="font-mono text-[10px] text-indigo-700">({ord.trackingNumber})</span>
                        </div>

                        {ord.trackingUrl && (
                          <a
                            href={ord.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline"
                          >
                            <span>Live Courier Track</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div>
              {isLoadingWallet ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading wallet ledger...</p>
                </div>
              ) : walletTx.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-6">
                  <Wallet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Wallet Transactions</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Store credit balance adjustments and order redemptions will appear here with full audit history.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {walletTx.map((tx: any) => {
                    const isCredit = tx.transaction_type === 'CREDIT';
                    return (
                      <div
                        key={tx.id}
                        className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${isCredit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {isCredit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block leading-tight">
                              {tx.description || (isCredit ? 'Credit Deposit' : 'Credit Applied')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(tx.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <span className={`font-mono font-bold text-sm ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isCredit ? '+' : '-'}AED {Number(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

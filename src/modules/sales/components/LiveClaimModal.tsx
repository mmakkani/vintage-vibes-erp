import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  Barcode,
  Truck,
  DollarSign,
  CreditCard,
  X,
  Sparkles,
  Layers,
  AlertCircle
} from 'lucide-react';
import { Party } from '../../parties/parties.types.ts';

interface LiveClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableStock?: Array<{ id: string; barcode: string; retailPriceAed?: number; title?: string }>;
  onDraftCreated: (createdInvoice: any) => void;
}

interface CourierOption {
  partyId?: number;
  id: string;
  name: string;
  accountCode: string;
}

const DEFAULT_COURIERS: CourierOption[] = [
  { partyId: 23, id: '813f3f28-d541-4e4d-ad3e-ca6ca2824b21', name: 'DHL Express UAE', accountCode: '2120-01' },
  { partyId: 24, id: '9b1e1713-39d2-4309-8488-81203f5ad602', name: 'Aramex Logistics UAE', accountCode: '2120-02' },
  { partyId: 25, id: 'a8291f04-89f1-46bb-ba22-81203f5ad603', name: 'SMSA Express GCC', accountCode: '2120-03' },
  { partyId: 26, id: 'c5713e89-11ba-47ee-99aa-81203f5ad604', name: 'Emirates Post Premium', accountCode: '2120-04' }
];

export const LiveClaimModal: React.FC<LiveClaimModalProps> = ({
  isOpen,
  onClose,
  availableStock = [],
  onDraftCreated
}) => {
  // Form state
  const [newBarcode, setNewBarcode] = useState('');
  const [newBuyerHandle, setNewBuyerHandle] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newShippingAddress, setNewShippingAddress] = useState('');
  const [newBoothId, setNewBoothId] = useState('booth-01');
  const [newChannel, setNewChannel] = useState<'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE'>('TIKTOK');
  const [newPriceOverride, setNewPriceOverride] = useState<string>('');
  const [claimHoldHours, setClaimHoldHours] = useState<number>(2);

  // Dynamic Courier Registry State
  const [couriers, setCouriers] = useState<CourierOption[]>(DEFAULT_COURIERS);
  const [selectedCourierKey, setSelectedCourierKey] = useState<string>('DHL Express UAE');
  const [newTrackingNumber, setNewTrackingNumber] = useState<string>(
    `DHL-${Math.floor(100000000 + Math.random() * 900000000)}`
  );
  const [newShippingFee, setNewShippingFee] = useState<number>(25);
  const [newShippingBearer, setNewShippingBearer] = useState<'CUSTOMER' | 'COMPANY'>('CUSTOMER');
  const [newPaymentMode, setNewPaymentMode] = useState<'COD' | 'BANK_TRANSFER' | 'CARD_POS' | 'CASH'>('COD');
  const [newPaymentStatus, setNewPaymentStatus] = useState<'UNPAID_PENDING_COD' | 'PREPAID_VERIFIED'>('UNPAID_PENDING_COD');

  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch active couriers dynamically from Registry
  useEffect(() => {
    let isMounted = true;
    async function fetchCouriers() {
      try {
        const res = await fetch('/api/parties');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const filtered = data
            .filter((p: any) => {
              const type = (p.type || p.party_type || '').toUpperCase();
              const name = (p.name || p.company_name || '').toUpperCase();
              return (
                p.is_active !== false &&
                (type === 'COURIER' ||
                  type === 'LOGISTICS_AGENT' ||
                  type === 'AGENT' ||
                  name.includes('DHL') ||
                  name.includes('ARAMEX') ||
                  name.includes('SMSA') ||
                  name.includes('POST') ||
                  name.includes('COURIER') ||
                  name.includes('EXPRESS'))
              );
            })
            .map((p: any): CourierOption => {
              const accountCode =
                p.account_map?.payableAccountId ||
                p.account_map?.payable_account_id ||
                p.coa_account_id ||
                '2120-00';
              return {
                partyId: p.party_id,
                id: p.id,
                name: p.name || p.company_name,
                accountCode
              };
            });

          if (isMounted && filtered.length > 0) {
            setCouriers(filtered);
            if (!filtered.some(c => c.name === selectedCourierKey)) {
              setSelectedCourierKey(filtered[0].name);
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch couriers from /api/parties, using defaults:', err);
      }
    }

    if (isOpen) {
      fetchCouriers();
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Selected courier object
  const activeCourier = useMemo(() => {
    return couriers.find(c => c.name === selectedCourierKey) || couriers[0] || DEFAULT_COURIERS[0];
  }, [couriers, selectedCourierKey]);

  // Helper to generate tracking prefix
  const autoGenTracking = (courierName: string) => {
    let prefix = 'TRK';
    if (/DHL/i.test(courierName)) prefix = 'DHL';
    else if (/ARAMEX/i.test(courierName)) prefix = 'ARX';
    else if (/SMSA/i.test(courierName)) prefix = 'SMSA';
    else if (/POST/i.test(courierName)) prefix = 'EMP';
    setNewTrackingNumber(`${prefix}-${Math.floor(100000000 + Math.random() * 900000000)}`);
  };

  const handleCourierChange = (courierName: string) => {
    setSelectedCourierKey(courierName);
    autoGenTracking(courierName);
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarcode.trim() || !newBuyerHandle.trim()) {
      setFeedback({ text: 'Piece Barcode and Buyer Handle are mandatory.', type: 'error' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/sales/live-draft-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceBarcode: newBarcode.trim(),
          barcode: newBarcode.trim(),
          buyerHandle: newBuyerHandle.trim(),
          customerPhone: newCustomerPhone.trim(),
          shippingAddress: newShippingAddress.trim(),
          boothId: newBoothId,
          channel: newChannel,
          offeredPrice: newPriceOverride ? Number(newPriceOverride) : undefined,
          courierPartner: activeCourier.name,
          courierPartnerId: activeCourier.partyId,
          courierPartyId: activeCourier.id,
          trackingNumber: newTrackingNumber.trim(),
          shippingFeeAed: Number(newShippingFee) || 0,
          shippingCharge: Number(newShippingFee) || 0,
          shippingBearer: newShippingBearer,
          paymentMethod: newPaymentMode,
          paymentStatus: newPaymentStatus,
          expiresAt: claimHoldHours > 0 ? new Date(Date.now() + claimHoldHours * 3600000).toISOString() : undefined,
          autoPost: false
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ text: data.error || 'Failed to generate draft invoice', type: 'error' });
      } else {
        const createdInv = data.invoice || data.draftInvoice;
        setFeedback({
          text: `⚡ Draft Invoice ${createdInv?.invoiceNo || ''} created for ${newBuyerHandle}! SKU assigned to ${activeCourier.name} (${activeCourier.accountCode}).`,
          type: 'success'
        });
        // Reset form
        setNewBarcode('');
        setNewBuyerHandle('');
        setNewCustomerPhone('');
        setNewShippingAddress('');
        setNewPriceOverride('');
        autoGenTracking(activeCourier.name);

        onDraftCreated(createdInv);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch {
      setFeedback({ text: 'Network error generating draft invoice', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-indigo-600" />
              Instant Live Claim & Draft Generation
            </h3>
            <p className="text-xs text-slate-500">
              Lock a vintage SKU to an active viewer during stream broadcast with dedicated courier ledger routing
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        <form onSubmit={handleCreateDraft} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Piece Barcode / SKU *
            </label>
            <div className="relative">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                placeholder="Scan or enter barcode (e.g., VV-B01-0001)..."
                value={newBarcode}
                onChange={e => setNewBarcode(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            {/* Stock suggestions */}
            {availableStock.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="text-[10px] text-slate-400">Available:</span>
                {availableStock.slice(0, 4).map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setNewBarcode(p.barcode)}
                    className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded cursor-pointer"
                  >
                    {p.barcode}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Buyer Handle *
              </label>
              <input
                type="text"
                required
                placeholder="@buyer_dxb"
                value={newBuyerHandle}
                onChange={e => setNewBuyerHandle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Phone
              </label>
              <input
                type="text"
                placeholder="+971 50 ..."
                value={newCustomerPhone}
                onChange={e => setNewCustomerPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Live Booth
              </label>
              <select
                value={newBoothId}
                onChange={e => setNewBoothId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <option key={i} value={`booth-${String(i + 1).padStart(2, '0')}`}>
                    Booth {String(i + 1).padStart(2, '0')} (Host {i + 1})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Social Channel
              </label>
              <select
                value={newChannel}
                onChange={e => setNewChannel(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
              >
                <option value="TIKTOK">TikTok Live</option>
                <option value="INSTAGRAM">Instagram Live</option>
                <option value="FACEBOOK">Facebook Live</option>
                <option value="YOUTUBE">YouTube Live</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Agreed Stream Price (AED)
            </label>
            <input
              type="number"
              placeholder="Leave empty to use piece retail price"
              value={newPriceOverride}
              onChange={e => setNewPriceOverride(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
          </div>

          {/* Courier & Shipping Logistics Section */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-600" />
                Courier & Dispatch Logistics
              </span>
              <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <span>Account:</span>
                <span className="font-mono text-indigo-800 underline">{activeCourier.accountCode}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Courier Partner (Registry)
                </label>
                <select
                  value={selectedCourierKey}
                  onChange={e => handleCourierChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-slate-800 focus:outline-none"
                >
                  {couriers.map(c => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name} ({c.accountCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Tracking / Waybill #
                  </label>
                  <button
                    type="button"
                    onClick={() => autoGenTracking(activeCourier.name)}
                    className="text-[10px] text-amber-700 hover:text-amber-900 underline font-semibold cursor-pointer"
                  >
                    Auto-Gen
                  </button>
                </div>
                <input
                  type="text"
                  value={newTrackingNumber}
                  onChange={e => setNewTrackingNumber(e.target.value)}
                  placeholder="e.g. DHL-982184910"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-indigo-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Shipping Fee (AED)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newShippingFee}
                  onChange={e => setNewShippingFee(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Pay By / Shipping Charge Bearer
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setNewShippingBearer('CUSTOMER')}
                    className={`py-1 rounded text-center transition-colors cursor-pointer ${
                      newShippingBearer === 'CUSTOMER'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Customer Bears
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewShippingBearer('COMPANY')}
                    className={`py-1 rounded text-center transition-colors cursor-pointer ${
                      newShippingBearer === 'COMPANY'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Company Free
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Delivery Address / Emirate
              </label>
              <input
                type="text"
                value={newShippingAddress}
                onChange={e => setNewShippingAddress(e.target.value)}
                placeholder="e.g. Al Barsha 2, Villa 14, Dubai"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Payment Mode & Status Section */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
              Payment Mode & Verification
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={newPaymentMode}
                  onChange={e => setNewPaymentMode(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="COD">Cash On Delivery (COD)</option>
                  <option value="BANK_TRANSFER">Bank Wire / Transfer</option>
                  <option value="CARD_POS">Card Payment Link / POS</option>
                  <option value="CASH">Cash in Hand</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Status
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setNewPaymentStatus('UNPAID_PENDING_COD')}
                    className={`py-1 rounded text-center transition-colors cursor-pointer ${
                      newPaymentStatus === 'UNPAID_PENDING_COD'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unpaid / COD
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPaymentStatus('PREPAID_VERIFIED')}
                    className={`py-1 rounded text-center transition-colors cursor-pointer ${
                      newPaymentStatus === 'PREPAID_VERIFIED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Paid & Verified
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Claim Hold Duration (Cart Auto-Expiry)</span>
                <span className="text-[10px] text-indigo-600 font-semibold">Automatic inventory unlock</span>
              </label>
              <select
                value={claimHoldHours}
                onChange={e => setClaimHoldHours(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800 focus:outline-none"
              >
                <option value={1}>1 Hour (Flash Live Stream Sale)</option>
                <option value={2}>2 Hours (Standard Live Stream Hold)</option>
                <option value={6}>6 Hours (Same-Day Stream Clearance)</option>
                <option value={12}>12 Hours (Overnight Grace Period)</option>
                <option value={24}>24 Hours (Next Day Verification)</option>
                <option value={0}>No Expiry (Manual Release Only)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isProcessing ? 'Generating Claim...' : '⚡ Generate Claim Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

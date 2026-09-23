import React, { useState, useMemo } from 'react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { SalesInvoice } from '../sales.types.ts';
import { useSync } from '../../../context/SyncContext.tsx';
import { useFormAutoSave } from '../../../hooks/useFormAutoSave.ts';
import { AutoSaveDraftBanner, AutoSaveIndicator } from '../../../components/AutoSaveNotice.tsx';
import {
  Radio,
  Scan,
  ShoppingCart,
  Zap,
  Tag,
  Search,
  CheckCircle2,
  Trash2,
  Share2,
  Printer,
  Sparkles,
  User,
  Phone,
  Layers,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Plus
} from 'lucide-react';

interface LiveSellingTerminalProps {
  stockPieces: PieceBreakdownItem[];
  clients: Party[];
  onRefreshAll: () => void;
  onInvoiceCreated: (inv: SalesInvoice) => void;
}

interface LiveBasketItem {
  pieceId: string;
  barcode: string;
  itemName: string;
  brandName: string;
  size: string;
  weightKg: number;
  unitPrice: number;
  discount: number;
  finalAmount: number;
}

export const LiveSellingTerminal: React.FC<LiveSellingTerminalProps> = ({
  stockPieces,
  clients,
  onRefreshAll,
  onInvoiceCreated
}) => {
  const { notifyMutation } = useSync();

  // Channel & Session State
  const [streamChannel, setStreamChannel] = useState<string>('TikTok Live @vintage_dubai');
  const [buyerType, setBuyerType] = useState<'registered' | 'live_handle'>('live_handle');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [liveBuyerHandle, setLiveBuyerHandle] = useState<string>('@dxb_vintage_vault');
  const [liveBuyerPhone, setLiveBuyerPhone] = useState<string>('+971 50 892 4110');

  // Search & Barcode scanning
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [brandFilter, setBrandFilter] = useState('ALL');

  // Live Basket
  const [basket, setBasket] = useState<LiveBasketItem[]>([]);
  const [globalDiscountPct, setGlobalDiscountPct] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT'>('CASH');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-save form payload for live selling session
  const liveSessionDraft = {
    streamChannel,
    buyerType,
    selectedClientId,
    liveBuyerHandle,
    liveBuyerPhone,
    basket,
    globalDiscountPct,
    paymentMethod
  };

  const {
    hasSavedDraft,
    lastSavedTime,
    isAutoSaved,
    restoreDraft,
    discardDraft,
    clearDraft
  } = useFormAutoSave({
    key: 'vibe_autosave_live_selling',
    formData: liveSessionDraft,
    onRestore: (saved: any) => {
      if (saved.streamChannel) setStreamChannel(saved.streamChannel);
      if (saved.buyerType) setBuyerType(saved.buyerType);
      if (saved.selectedClientId) setSelectedClientId(saved.selectedClientId);
      if (saved.liveBuyerHandle) setLiveBuyerHandle(saved.liveBuyerHandle);
      if (saved.liveBuyerPhone) setLiveBuyerPhone(saved.liveBuyerPhone);
      if (saved.basket && Array.isArray(saved.basket)) setBasket(saved.basket);
      if (saved.globalDiscountPct !== undefined) setGlobalDiscountPct(saved.globalDiscountPct);
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
    }
  });

  // Session stats
  const [sessionCompletedCount, setSessionCompletedCount] = useState(3);
  const [sessionRevenueAed, setSessionRevenueAed] = useState(1450);

  // Available pieces in stock (strictly IN_STOCK, unsold)
  const availablePieces = useMemo(() => {
    return stockPieces.filter(p => !p.isSold && p.status === 'IN_STOCK');
  }, [stockPieces]);

  // Filtered available stock
  const filteredStock = useMemo(() => {
    return availablePieces.filter(p => {
      const matchesSearch =
        searchQuery === '' ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.style && p.style.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesBrand = brandFilter === 'ALL' || p.brandName.toLowerCase() === brandFilter.toLowerCase();
      return matchesSearch && matchesBrand;
    });
  }, [availablePieces, searchQuery, brandFilter]);

  const uniqueBrands = useMemo(() => {
    const brands = new Set(availablePieces.map(p => p.brandName).filter(Boolean));
    return Array.from(brands);
  }, [availablePieces]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Add piece to live basket
  const addToBasket = (piece: PieceBreakdownItem) => {
    if (basket.some(b => b.barcode.toLowerCase() === piece.barcode.toLowerCase())) {
      showMsg(`Item ${piece.barcode} is already in the live basket!`, 'error');
      return;
    }

    const price = piece.estimatedPrice || piece.retailPriceAed || 120;
    const discount = (price * globalDiscountPct) / 100;
    const finalAmount = Math.max(0, price - discount);

    const newItem: LiveBasketItem = {
      pieceId: piece.id,
      barcode: piece.barcode,
      itemName: piece.itemName,
      brandName: piece.brandName,
      size: piece.sizeScanned || 'M',
      weightKg: piece.weightKg || 0.45,
      unitPrice: price,
      discount,
      finalAmount
    };

    setBasket(prev => [newItem, ...prev]);
    showMsg(`Claimed ${piece.itemName} (${piece.barcode}) into live basket!`);
  };

  // Handle direct barcode submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const matchedPiece = availablePieces.find(
      p => p.barcode.toLowerCase() === barcodeInput.trim().toLowerCase()
    );

    if (!matchedPiece) {
      showMsg(`Barcode "${barcodeInput}" not found in available warehouse stock or already sold.`, 'error');
      return;
    }

    addToBasket(matchedPiece);
    setBarcodeInput('');
  };

  const removeFromBasket = (barcode: string) => {
    setBasket(prev => prev.filter(b => b.barcode !== barcode));
  };

  const updateItemDiscount = (barcode: string, discountAmount: number) => {
    setBasket(prev =>
      prev.map(item => {
        if (item.barcode === barcode) {
          const discount = Math.min(item.unitPrice, Math.max(0, discountAmount));
          return {
            ...item,
            discount,
            finalAmount: item.unitPrice - discount
          };
        }
        return item;
      })
    );
  };

  // Financial calculations
  const subTotal = useMemo(() => basket.reduce((sum, i) => sum + i.unitPrice, 0), [basket]);
  const totalDiscounts = useMemo(() => basket.reduce((sum, i) => sum + i.discount, 0), [basket]);
  const taxableAmount = Math.max(0, subTotal - totalDiscounts);
  const vatAmount = Number(((taxableAmount * 5) / 100).toFixed(2));
  const grandTotal = Number((taxableAmount + vatAmount).toFixed(2));

  // Instant Checkout & Invoice Generation
  const handleInstantLiveCheckout = async () => {
    if (basket.length === 0) {
      showMsg('Live basket is empty. Scan or select pieces first!', 'error');
      return;
    }

    let customerName = liveBuyerHandle;
    let customerPhone = liveBuyerPhone;
    let customerId = `cust-live-${Date.now()}`;

    if (buyerType === 'registered') {
      const client = clients.find(c => c.id === selectedClientId);
      if (!client) {
        showMsg('Please select a registered client or switch to Live Handle mode', 'error');
        return;
      }
      customerName = client.name;
      customerPhone = client.phone || '';
      customerId = client.id;
    } else {
      if (!liveBuyerHandle.trim()) {
        showMsg('Please provide the Live Buyer Handle (e.g. @dxb_vintage)', 'error');
        return;
      }
    }

    setIsProcessing(true);
    try {
      const payload = {
        customerId,
        customerName,
        customerPhone,
        channel: streamChannel,
        paymentMethod,
        discountAmount: totalDiscounts,
        items: basket.map(b => ({
          pieceId: b.pieceId,
          barcode: b.barcode,
          description: `${b.brandName} ${b.itemName} (Size: ${b.size})`,
          weightKg: b.weightKg,
          unitPrice: b.unitPrice,
          discount: b.discount,
          finalAmount: b.finalAmount
        }))
      };

      const res = await fetch('/api/sales/live-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Live checkout failed', 'error');
      } else {
        showMsg(`🎉 Live Order checked out successfully! Invoice: ${data.invoice.invoiceNo} (AED ${data.invoice.totalAmount})`);
        setSessionCompletedCount(prev => prev + 1);
        setSessionRevenueAed(prev => prev + grandTotal);
        setBasket([]);
        clearDraft();
        notifyMutation('SALES', 'INVOICE', 'CREATE', data.invoice.invoiceNo);
        onInvoiceCreated(data.invoice);
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to process live checkout', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Stream Ticker & Control Bar */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 border border-stone-800 rounded-xl p-4 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-red-600 text-white shadow-xs">
                  LIVE DROP ACTIVE
                </span>
                <span className="text-xs text-stone-400">Vintage Vibes Warehouse Floor • Al Quoz</span>
              </div>
              <h2 className="text-sm font-extrabold text-amber-300 mt-0.5 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-red-400 animate-pulse" />
                Live Selling POS & Rapid Basket Checkout Terminal
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-stone-800/90 border border-stone-700">
              <div className="text-[10px] text-stone-400 uppercase font-semibold">Live Channel</div>
              <select
                value={streamChannel}
                onChange={e => setStreamChannel(e.target.value)}
                className="bg-transparent font-bold text-amber-400 focus:outline-none cursor-pointer text-xs mt-0.5"
              >
                <option value="TikTok Live @vintage_dubai" className="bg-stone-900 text-white">TikTok Live (@vintage_dubai)</option>
                <option value="Instagram Live B2B Drop" className="bg-stone-900 text-white">Instagram Live (B2B Drop)</option>
                <option value="Whatnot Vintage Grails" className="bg-stone-900 text-white">Whatnot (Vintage Grails)</option>
                <option value="Showroom Walk-in Live Bins" className="bg-stone-900 text-white">Showroom Walk-in Bins</option>
              </select>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-stone-800/90 border border-stone-700">
              <div className="text-[10px] text-stone-400 uppercase font-semibold">Session Orders</div>
              <div className="font-extrabold text-white text-sm">{sessionCompletedCount} Invoices</div>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/40">
              <div className="text-[10px] text-amber-300/80 uppercase font-semibold">Drop Revenue</div>
              <div className="font-black text-amber-400 text-sm">AED {sessionRevenueAed.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* AUTO-SAVE RESTORATION BANNER */}
      {hasSavedDraft && (
        <AutoSaveDraftBanner
          lastSavedTime={lastSavedTime}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
          title="Unsaved Live Selling Session Recovered"
          description="We recovered your active live drop cart, buyer handle, and stream channel settings from local storage."
        />
      )}

      {/* Notification banner */}
      {message && (
        <div
          className={`p-3 rounded-lg text-xs font-bold border flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-stone-400 hover:text-stone-600">✕</button>
        </div>
      )}

      {/* Dual Column Layout: Left = Available Live Inventory, Right = Active Live Basket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Live Warehouse Stock Scanner & Picker (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Rapid Barcode Laser Input */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Scan className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Scan or type vintage piece barcode (e.g. VV-BAL-001-0001)..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-amber-50/50 border-2 border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 text-stone-900"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-amber-400 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Claim</span>
              </button>
            </form>

            <div className="mt-3 flex items-center justify-between text-[11px] text-stone-500">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Laser Scanner Hardware Gun active & listening
              </span>
              <span>Available pieces in showroom: <strong className="text-stone-800">{availablePieces.length}</strong></span>
            </div>
          </div>

          {/* Quick Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter vintage pieces by name, style, era..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:border-amber-500 text-stone-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-stone-500">Brand:</span>
              <select
                value={brandFilter}
                onChange={e => setBrandFilter(e.target.value)}
                className="text-xs bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 font-semibold text-stone-700 focus:outline-none"
              >
                <option value="ALL">All Brands ({availablePieces.length})</option>
                {uniqueBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Available Piece Cards Grid */}
          <div className="bg-stone-50/70 p-3 rounded-xl border border-stone-200 max-h-[580px] overflow-y-auto space-y-2.5">
            {filteredStock.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-xs">
                No matching vintage pieces available in stock.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredStock.map(piece => {
                  const inBasket = basket.some(b => b.barcode.toLowerCase() === piece.barcode.toLowerCase());
                  const price = piece.estimatedPrice || piece.retailPriceAed || 120;

                  return (
                    <div
                      key={piece.id}
                      className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                        inBasket
                          ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-300'
                          : 'bg-white hover:bg-amber-50/50 border-stone-200 hover:border-amber-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-mono text-[10px] font-extrabold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                            {piece.barcode}
                          </span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-stone-100 text-stone-800">
                            Size: {piece.sizeScanned || 'M'}
                          </span>
                        </div>

                        <div className="mt-1.5 font-bold text-stone-900 line-clamp-1">
                          {piece.brandName} • {piece.itemName}
                        </div>

                        {piece.style && (
                          <div className="text-[11px] text-stone-500 truncate mt-0.5">
                            {piece.style}
                          </div>
                        )}

                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-600">
                          <span className="px-1.5 py-0.5 rounded bg-stone-200/80 font-medium text-stone-700">
                            {piece.labelGrade || 'Grade A'}
                          </span>
                          <span>•</span>
                          <span>{piece.weightKg} KG</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                        <div>
                          <div className="text-[9px] uppercase text-stone-400 font-semibold">Drop Price</div>
                          <div className="text-xs font-black text-amber-900">AED {price.toFixed(2)}</div>
                        </div>

                        {inBasket ? (
                          <button
                            type="button"
                            onClick={() => removeFromBasket(piece.barcode)}
                            className="px-2.5 py-1 rounded-lg bg-amber-200 text-amber-950 font-bold text-[11px] hover:bg-red-100 hover:text-red-700 transition-colors cursor-pointer"
                          >
                            In Basket ✓
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToBasket(piece)}
                            className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3 text-amber-400" />
                            <span>Claim</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Basket & Instant Checkout (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-3.5">
            {/* Basket Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-900">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-tight">Active Live Basket</h3>
                  <div className="text-[10px] text-stone-500">{basket.length} items claimed in current drop</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AutoSaveIndicator isAutoSaved={isAutoSaved} lastSavedTime={lastSavedTime} />
                {basket.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBasket([])}
                    className="text-[11px] text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Buyer Assignment Mode */}
            <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-stone-700">Buyer Identification:</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="buyerType"
                      checked={buyerType === 'live_handle'}
                      onChange={() => setBuyerType('live_handle')}
                    />
                    <span>Live Handle</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="buyerType"
                      checked={buyerType === 'registered'}
                      onChange={() => setBuyerType('registered')}
                    />
                    <span>Wholesale Client</span>
                  </label>
                </div>
              </div>

              {buyerType === 'live_handle' ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-stone-500">Live Handle / Viewer ID</label>
                    <input
                      type="text"
                      value={liveBuyerHandle}
                      onChange={e => setLiveBuyerHandle(e.target.value)}
                      placeholder="@dubai_vintage_vault"
                      className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-stone-300 rounded font-semibold text-stone-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-stone-500">WhatsApp Phone (for Advice)</label>
                    <input
                      type="text"
                      value={liveBuyerPhone}
                      onChange={e => setLiveBuyerPhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-stone-300 rounded font-semibold text-stone-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-semibold text-stone-500">Select Wholesale Customer from Khata</label>
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs font-semibold text-stone-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Registered Customer --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) - Balance: AED {c.currentBalance}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Basket Items List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {basket.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs">
                  Basket is empty. Scan pieces with the barcode gun or click Claim on the left rack!
                </div>
              ) : (
                basket.map((item, idx) => (
                  <div
                    key={item.barcode}
                    className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] font-bold text-amber-900 bg-amber-100 px-1 rounded">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-stone-900 truncate">
                          {item.brandName} • {item.itemName}
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        Barcode: {item.barcode} • Size: {item.size}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-black text-stone-900">AED {item.finalAmount.toFixed(2)}</div>
                        {item.discount > 0 && (
                          <div className="text-[9px] text-emerald-600 line-through">AED {item.unitPrice.toFixed(2)}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromBasket(item.barcode)}
                        className="p-1 rounded text-stone-400 hover:text-red-600 cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick Live Discount Buttons */}
            {basket.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-amber-950 text-[11px] flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-800" />
                  Live Deal:
                </span>
                <div className="flex items-center gap-1">
                  {[0, 5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setGlobalDiscountPct(pct);
                        setBasket(prev =>
                          prev.map(i => {
                            const disc = (i.unitPrice * pct) / 100;
                            return {
                              ...i,
                              discount: disc,
                              finalAmount: i.unitPrice - disc
                            };
                          })
                        );
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer transition-colors ${
                        globalDiscountPct === pct
                          ? 'bg-amber-900 text-amber-200'
                          : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {pct === 0 ? 'Regular' : `-${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Totals */}
            <div className="pt-2 border-t border-stone-200 space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Subtotal ({basket.length} items):</span>
                <span className="font-semibold text-stone-900">AED {subTotal.toFixed(2)}</span>
              </div>
              {totalDiscounts > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Live Drop Discount:</span>
                  <span className="font-bold">- AED {totalDiscounts.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>UAE VAT (5.0% Standard):</span>
                <span className="font-semibold text-stone-900">AED {vatAmount.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-stone-300 flex justify-between items-baseline">
                <span className="font-extrabold text-stone-950 text-sm">Grand Total (AED):</span>
                <span className="text-base font-black text-amber-950">AED {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment method selector */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-stone-600">Payment:</span>
              <div className="flex-1 grid grid-cols-3 gap-1.5 text-[10px] font-bold text-center">
                {(['CASH', 'BANK_TRANSFER', 'CREDIT_ACCOUNT'] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-1 rounded border cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-stone-900 text-amber-400 border-stone-900'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {method === 'CASH' ? 'Cash' : method === 'BANK_TRANSFER' ? 'Transfer' : 'Khata'}
                  </button>
                ))}
              </div>
            </div>

            {/* Instant Checkout Action Button */}
            <button
              type="button"
              disabled={basket.length === 0 || isProcessing}
              onClick={handleInstantLiveCheckout}
              className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                basket.length === 0 || isProcessing
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-stone-950 active:scale-[0.99]'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Live Checkout & Deducting Stock...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>1-Click Instant Live Checkout • AED {grandTotal.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

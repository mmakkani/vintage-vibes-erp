import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Barcode,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Camera,
  Smartphone,
  CreditCard,
  QrCode,
  Banknote,
  DollarSign,
  Printer,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Search,
  Plus,
  ArrowRight,
  X,
  RotateCcw,
  Clock,
  Send,
  Wifi,
  Radio,
  Check,
  Percent,
  Layers,
  Scale,
  Sun,
  Moon,
  Gift
} from 'lucide-react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { CompanyProfile } from '../../setup/setup.types.ts';
import { POSTerminalConfig } from '../../setup/hardware.types.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { SalesService } from '../../../services/salesService.ts';
import { openThermalLabelPrintWindow, openGiftReceiptPrintWindow } from '../../../utils/thermalPrinter.ts';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import { offlineQueue } from '../../../services/offlineQueueService.ts';

interface CounterCartItem {
  piece: PieceBreakdownItem;
  sellingPrice: number;
  cogsCost: number;
  discount: number;
  isGift?: boolean;
  originalPrice?: number;
}

interface ParkedSale {
  id: string;
  timestamp: string;
  items: CounterCartItem[];
  customerName?: string;
  note?: string;
}

interface CounterSalePOSTerminalProps {
  companyProfile?: CompanyProfile | null;
  operatorName?: string;
  onRefreshAll?: () => void;
  onNavigateTab?: (tab: string) => void;
  stockPieces?: PieceBreakdownItem[];
  clients?: Party[];
  onSaleCompleted?: () => void;
}

export const CounterSalePOSTerminal: React.FC<CounterSalePOSTerminalProps> = ({
  companyProfile: propCompanyProfile,
  operatorName = 'Cashier Lead',
  onRefreshAll,
  onNavigateTab,
  stockPieces,
  clients,
  onSaleCompleted
}) => {
  const [internalProfile, setInternalProfile] = useState<CompanyProfile | null>(propCompanyProfile || null);

  useEffect(() => {
    if (propCompanyProfile) {
      setInternalProfile(propCompanyProfile);
    } else {
      fetch('/api/setup/company-profile')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setInternalProfile(data);
        })
        .catch(() => {});
    }
  }, [propCompanyProfile]);

  const activeProfile = propCompanyProfile || internalProfile;

  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => offlineQueue.getPendingCount());

  useEffect(() => {
    return offlineQueue.subscribe(() => {
      setPendingOfflineCount(offlineQueue.getPendingCount());
    });
  }, []);

  // Theme Mode: 'light' (Vintage Boutique Web Cream) vs 'dark' (Midnight Vault)
  const [posTheme, setPosTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('vintage_pos_theme') as any) || 'light';
    } catch {
      return 'light';
    }
  });

  const togglePosTheme = () => {
    setPosTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('vintage_pos_theme', next);
      } catch {}
      return next;
    });
  };

  // Scanned pieces in current active sale
  const [cart, setCart] = useState<CounterCartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Available pieces for manual search dropdown
  const [allPieces, setAllPieces] = useState<PieceBreakdownItem[]>((stockPieces || []).filter(p => !p.isSold && p.status === 'IN_STOCK'));
  const [parties, setParties] = useState<Party[]>(clients || []);
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);

  // Manager & Privacy Settings
  const [showManagerProfit, setShowManagerProfit] = useState(false);
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [tempDiscountVal, setTempDiscountVal] = useState<string>('0');

  // Gift Order & Packaging Options
  const [isGiftOrder, setIsGiftOrder] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [includeGiftBox, setIncludeGiftBox] = useState(false);

  // Parked / Held Carts
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>(() => {
    try {
      const saved = localStorage.getItem('vintage_pos_parked_sales');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showParkedModal, setShowParkedModal] = useState(false);

  // Payment Selection Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD_POS' | 'BANK_QR' | 'SPLIT' | 'CREDIT_ACCOUNT'>('CASH');

  // Cash payment state
  const [cashTendered, setCashTendered] = useState<string>('');

  // POS Card Machine State
  const posConfig: POSTerminalConfig = useMemo(() => {
    return activeProfile?.posTerminalConfig || {
      id: 'pos-default-01',
      terminalName: 'Counter 1 - Sunmi Smart PED',
      model: 'SUNMI_P2',
      connectionType: 'LAN_ETHERNET',
      ipAddress: '192.168.1.150',
      port: 8080,
      terminalId: 'TID-DXB-9921',
      merchantId: 'MID-VV-DUBAI-88',
      status: 'ONLINE',
      clearingAccountId: 'acc-1125',
      autoPrintCustomerReceipt: true,
      autoPrintMerchantSlip: false,
      allowApplePayNfc: true,
      allowGooglePayNfc: true,
      allowContactlessChip: true,
      currency: 'AED'
    };
  }, [activeProfile?.posTerminalConfig]);

  const [posMachineStage, setPosMachineStage] = useState<'IDLE' | 'AWAITING_TAP' | 'APPROVED' | 'FAILED'>('IDLE');
  const [posAuthCode, setPosAuthCode] = useState<string>('');
  const [posCardBrand, setPosCardBrand] = useState<string>('VISA');

  // Split payment state
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitCard, setSplitCard] = useState<string>('');
  const [splitQr, setSplitQr] = useState<string>('');

  // Post Checkout Success Modal
  const [checkoutSuccessData, setCheckoutSuccessData] = useState<{
    invoice: any;
    voucher: any;
    cogsSummary: any;
    pieces: PieceBreakdownItem[];
  } | null>(null);

  // Lightbox preview for garment front photos
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Barcode input ref for instant auto-focus
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    barcodeInputRef.current?.focus();
    loadInventoryAndParties();
  }, []);

  const loadInventoryAndParties = async () => {
    if (stockPieces && stockPieces.length > 0) {
      setAllPieces(stockPieces.filter(p => !p.isSold && p.status === 'IN_STOCK'));
    }
    if (clients && clients.length > 0) {
      setParties(clients.filter(p => p.type === 'CLIENT'));
    }
    try {
      const [piecesRes, partiesRes] = await Promise.all([
        fetch('/api/sales/stock-pieces').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/parties').then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      if (Array.isArray(piecesRes) && piecesRes.length > 0) {
        setAllPieces(piecesRes.filter((p: any) => !p.isSold && p.status === 'IN_STOCK'));
      }
      if (Array.isArray(partiesRes) && partiesRes.length > 0) {
        setParties(partiesRes.filter(p => p.type === 'CLIENT'));
      }
    } catch (err) {
      console.warn('POS Data Load Error:', err);
    }
  };

  // 1. Universal Laser Barcode Gun Listener
  useBarcodeScanner({
    onScan: (code) => {
      handleScanPiece(code);
    }
  });

  // Calculate totals
  const subTotal = useMemo(() => {
    const safeCart = Array.isArray(cart) ? cart : [];
    return Number(safeCart.reduce((sum, item) => sum + (Number(item?.sellingPrice) || 0), 0).toFixed(2));
  }, [cart]);

  const discountedSubtotal = useMemo(() => {
    return Math.max(0, Number((subTotal - discountTotal).toFixed(2)));
  }, [subTotal, discountTotal]);

  const vatAmount = useMemo(() => {
    const rate = Number(activeProfile?.vatRatePercent ?? 5.0) / 100;
    return Number((discountedSubtotal * rate).toFixed(2));
  }, [discountedSubtotal, activeProfile?.vatRatePercent]);

  const giftBoxFee = useMemo(() => {
    return (isGiftOrder && includeGiftBox) ? 15 : 0;
  }, [isGiftOrder, includeGiftBox]);

  const grandTotal = useMemo(() => {
    return Number((discountedSubtotal + vatAmount + giftBoxFee).toFixed(2));
  }, [discountedSubtotal, vatAmount, giftBoxFee]);

  const handleToggleGiftItem = (index: number) => {
    luxuryAudio.playMechanicalClick();
    setCart(prev => (Array.isArray(prev) ? prev : []).map((item, idx) => {
      if (idx !== index) return item;
      const isCurrentlyGift = !!item.isGift;
      if (isCurrentlyGift) {
        return {
          ...item,
          isGift: false,
          sellingPrice: item.originalPrice ?? item.sellingPrice
        };
      } else {
        return {
          ...item,
          isGift: true,
          originalPrice: item.sellingPrice,
          sellingPrice: 0
        };
      }
    }));
  };

  const totalCogs = useMemo(() => {
    const safeCart = Array.isArray(cart) ? cart : [];
    return Number(safeCart.reduce((sum, item) => sum + (Number(item?.cogsCost) || 0), 0).toFixed(2));
  }, [cart]);

  const grossProfit = useMemo(() => {
    return Number((discountedSubtotal - totalCogs).toFixed(2));
  }, [discountedSubtotal, totalCogs]);

  const grossMarginPercent = useMemo(() => {
    if (discountedSubtotal <= 0) return 0;
    return Number(((grossProfit / discountedSubtotal) * 100).toFixed(1));
  }, [grossProfit, discountedSubtotal]);

  const totalWeightGrams = useMemo(() => {
    const safeCart = Array.isArray(cart) ? cart : [];
    return safeCart.reduce((sum, item) => {
      const g = item?.piece?.weightGrams || Math.round((Number(item?.piece?.weightKg) || 0.45) * 1000);
      return sum + g;
    }, 0);
  }, [cart]);

  // Cash change due calculation
  const changeDue = useMemo(() => {
    const tendered = Number(cashTendered) || 0;
    if (tendered < grandTotal) return 0;
    return Number((tendered - grandTotal).toFixed(2));
  }, [cashTendered, grandTotal]);

  // Add piece to cart handler
  const handleScanPiece = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    // Check if already in cart
    const inCartIdx = cart.findIndex(c => c.piece.barcode.toLowerCase() === code.toLowerCase());
    if (inCartIdx !== -1) {
      luxuryAudio.playMechanicalClick();
      setScanFeedback({
        text: `⚠️ SKU ${code} is already in the active counter basket.`,
        type: 'info'
      });
      setBarcodeInput('');
      return;
    }

    // Lookup piece in stock
    const piece = allPieces.find(p => p.barcode.toLowerCase() === code.toLowerCase());
    if (!piece) {
      setScanFeedback({
        text: `❌ Barcode "${code}" not found in inventory. Check tag or inward bale.`,
        type: 'error'
      });
      setBarcodeInput('');
      return;
    }

    if (piece.isSold || piece.status === 'SOLD') {
      setScanFeedback({
        text: `🚫 SKU "${code}" (${piece.brandName} ${piece.itemName}) has already been SOLD.`,
        type: 'error'
      });
      setBarcodeInput('');
      return;
    }

    if (piece.status === 'RESERVED') {
      setScanFeedback({
        text: `⚠️ SKU "${code}" (${piece.brandName} ${piece.itemName}) is currently RESERVED in an active draft or cart.`,
        type: 'error'
      });
      setBarcodeInput('');
      return;
    }

    if (piece.status !== 'IN_STOCK') {
      setScanFeedback({
        text: `⚠️ SKU "${code}" (${piece.brandName} ${piece.itemName}) is not available for sale (status: ${piece.status}).`,
        type: 'error'
      });
      setBarcodeInput('');
      return;
    }

    // Piece Cost & Price Calculation
    const grams = piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000);
    const cogsCost = piece.calculatedCostPrice ||
      piece.costPrice ||
      (piece.costPerGram && grams ? Number((grams * piece.costPerGram).toFixed(2)) : (piece.weightKg ? Number((piece.weightKg * 20).toFixed(2)) : 18.50));

    const sellingPrice = piece.retailPriceAed || piece.estimatedPrice || 120;

    const newItem: CounterCartItem = {
      piece,
      sellingPrice,
      cogsCost,
      discount: 0
    };

    setCart(prev => [newItem, ...prev]);
    luxuryAudio.playCashChime();
    setScanFeedback({
      text: `✓ Added ${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'M'}) • AED ${sellingPrice}`,
      type: 'success'
    });

    setBarcodeInput('');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const handleRemoveItem = (index: number) => {
    luxuryAudio.playMechanicalClick();
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Hold / Park active cart
  const handleParkActiveCart = () => {
    if (cart.length === 0) return;
    luxuryAudio.playMechanicalClick();
    const newPark: ParkedSale = {
      id: `park-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      customerName: selectedCustomer?.name || 'Walk-In Customer'
    };
    const updated = [newPark, ...parkedSales];
    setParkedSales(updated);
    try {
      localStorage.setItem('vintage_pos_parked_sales', JSON.stringify(updated));
    } catch {}

    setCart([]);
    setSelectedCustomer(null);
    setDiscountTotal(0);
    setScanFeedback({
      text: `⏸️ Cart parked successfully (${newPark.items.length} garments saved). Ready for next customer.`,
      type: 'info'
    });
  };

  // Resume parked cart
  const handleResumeParkedSale = (park: ParkedSale) => {
    luxuryAudio.playCashChime();
    setCart(park.items);
    const updated = parkedSales.filter(p => p.id !== park.id);
    setParkedSales(updated);
    try {
      localStorage.setItem('vintage_pos_parked_sales', JSON.stringify(updated));
    } catch {}
    setShowParkedModal(false);
    setScanFeedback({
      text: `✓ Resumed parked cart from ${park.timestamp} (${park.items.length} items).`,
      type: 'success'
    });
  };

  // Clear current basket
  const handleClearBasket = () => {
    if (cart.length === 0) return;
    if (!confirm('Clear all scanned garments from counter basket?')) return;
    luxuryAudio.playMechanicalClick();
    setCart([]);
    setSelectedCustomer(null);
    setDiscountTotal(0);
  };

  // Trigger NFC / Smart POS Machine Simulation or API call
  const handleInitiatePosMachineTap = () => {
    setPosMachineStage('AWAITING_TAP');
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(40);
      }
    } catch {}

    // Simulated terminal approval or actual network bridge
    setTimeout(() => {
      const generatedAuth = 'AUTH-' + Math.floor(100000 + Math.random() * 900000);
      setPosAuthCode(generatedAuth);
      setPosCardBrand(['VISA CONTACTLESS', 'MASTERCARD PAYPASS', 'APPLE PAY', 'GOOGLE PAY'][Math.floor(Math.random() * 4)]);
      setPosMachineStage('APPROVED');
      luxuryAudio.playCashChime();
    }, 1800);
  };

  // Open Checkout Modal
  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    luxuryAudio.playMechanicalClick();
    setCashTendered(String(grandTotal));
    setSplitCash(String((grandTotal / 2).toFixed(2)));
    setSplitCard(String((grandTotal / 2).toFixed(2)));
    setSplitQr('0');
    setPosMachineStage('IDLE');
    setPosAuthCode('');
    setShowPaymentModal(true);
  };

  // Finalize Counter Sale & Post COA
  const handleConfirmFinalCheckout = async () => {
    setIsScanning(true);
    try {
      const invoiceNum = `POS-${Date.now().toString().slice(-6)}`;
      const safeCart = Array.isArray(cart) ? cart : [];
      const subtotalAmt = safeCart.reduce((sum, c) => sum + ((Number(c?.sellingPrice) || 0) - (Number(c?.discount) || 0)), 0);
      const vatAmt = Number((subtotalAmt * 0.05).toFixed(2));
      const totalAmt = Number((subtotalAmt + vatAmt + giftBoxFee).toFixed(2));

      // Offline resilience: buffer locally if network is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineQueue.enqueueSale({
          invoiceNo: invoiceNum,
          clientId: selectedCustomer?.id,
          customerName: selectedCustomer?.name || 'Walk-In Customer',
          customerPhone: selectedCustomer?.phone || '',
          subtotal: subtotalAmt,
          discountAmount: discountTotal,
          taxAmount: vatAmt,
          totalAmount: totalAmt,
          paymentMethod: paymentMode,
          items: cart.map(c => ({
            barcode: c.piece.barcode,
            pieceId: c.piece.id,
            description: `${c.piece.brandName} ${c.piece.itemName}`,
            unitPrice: c.sellingPrice,
            discount: c.discount,
            finalAmount: c.sellingPrice - c.discount,
            weightKg: c.piece.weightKg || 0.45
          }))
        });

        luxuryAudio.playCashChime();
        setShowPaymentModal(false);
        setCheckoutSuccessData({
          invoice: {
            id: invoiceNum,
            invoiceNo: invoiceNum,
            date: new Date().toISOString(),
            customerName: selectedCustomer?.name || 'Walk-In Customer',
            customerPhone: selectedCustomer?.phone || '',
            subTotal: subtotalAmt,
            discountAmount: discountTotal,
            vatAmount: vatAmt,
            totalAmount: totalAmt,
            paymentMethod: paymentMode,
            items: cart.map(c => ({
              barcode: c.piece.barcode,
              description: `${c.piece.brandName} ${c.piece.itemName}`,
              unitPrice: c.sellingPrice,
              discount: c.discount,
              finalAmount: c.sellingPrice - c.discount,
              weightKg: c.piece.weightKg || 0.45
            }))
          },
          voucher: { voucherNo: `OFFLINE-${Date.now().toString().slice(-6)}` },
          cogsSummary: { totalCogs: safeCart.reduce((sum, c) => sum + (Number(c?.cogsCost) || 0), 0) },
          pieces: safeCart.map(c => c.piece)
        });

        setCart([]);
        setSelectedCustomer(null);
        setDiscountTotal(0);
        setIsGiftOrder(false);
        setGiftMessage('');
        setIncludeGiftBox(false);
        return;
      }

      // 1. Direct insert to public.pos_sales and auto stock decrement
      const posRecord = await SalesService.createPosSale({
        invoice_number: invoiceNum,
        customer_name: selectedCustomer?.name || 'Walk-In Customer',
        customer_phone: selectedCustomer?.phone || '',
        items: cart.map(c => ({
          barcode: c.piece.barcode,
          pieceId: c.piece.id,
          itemName: c.piece.itemName,
          brandName: c.piece.brandName,
          unitPrice: c.sellingPrice,
          discount: c.discount,
          finalAmount: c.sellingPrice - c.discount
        })),
        subtotal: subtotalAmt,
        tax_amount: vatAmt,
        discount_amount: discountTotal,
        grand_total: totalAmt,
        payment_type: paymentMode,
        payment_status: 'PAID'
      });

      // 2. Also record in sales_invoices for general sales ledger
      await SalesService.createSalesInvoice({
        invoiceNo: invoiceNum,
        clientId: selectedCustomer?.id,
        customerName: selectedCustomer?.name || 'Walk-In Customer',
        customerPhone: selectedCustomer?.phone || '',
        channel: 'POS_COUNTER',
        paymentMethod: paymentMode as any,
        subtotal: subtotalAmt,
        discountAmount: discountTotal,
        taxAmount: vatAmt,
        totalAmount: totalAmt,
        status: 'PAID',
        items: cart.map(c => ({
          barcode: c.piece.barcode,
          pieceId: c.piece.id,
          description: `${c.piece.brandName} ${c.piece.itemName}`,
          unitPrice: c.sellingPrice,
          discount: c.discount,
          finalAmount: c.sellingPrice - c.discount,
          weightKg: c.piece.weightKg || 0.45
        }))
      }).catch(e => console.warn('sales_invoices sync note:', e));

      luxuryAudio.playCashChime();
      setShowPaymentModal(false);
      setCheckoutSuccessData({
        invoice: {
          id: posRecord.id || invoiceNum,
          invoiceNo: invoiceNum,
          date: new Date().toISOString(),
          customerName: selectedCustomer?.name || 'Walk-In Customer',
          customerPhone: selectedCustomer?.phone || '',
          subTotal: subtotalAmt,
          discountAmount: discountTotal,
          vatAmount: vatAmt,
          totalAmount: totalAmt,
          paymentMethod: paymentMode,
          items: cart.map(c => ({
            barcode: c.piece.barcode,
            description: `${c.piece.brandName} ${c.piece.itemName}`,
            unitPrice: c.sellingPrice,
            discount: c.discount,
            finalAmount: c.sellingPrice - c.discount,
            weightKg: c.piece.weightKg || 0.45
          }))
        },
        voucher: { voucherNo: `VCH-${Date.now().toString().slice(-6)}` },
        cogsSummary: { totalCogs: safeCart.reduce((sum, c) => sum + (Number(c?.cogsCost) || 0), 0) },
        pieces: safeCart.map(c => c.piece)
      });

      // Clear basket for next transaction
      setCart([]);
      setSelectedCustomer(null);
      setDiscountTotal(0);
      setIsGiftOrder(false);
      setGiftMessage('');
      setIncludeGiftBox(false);
      onRefreshAll?.();
      onSaleCompleted?.();
      loadInventoryAndParties();
    } catch (err: any) {
      alert(err.message || 'Network error executing POS checkout.');
    } finally {
      setIsScanning(false);
    }
  };

  // Thermal 80mm POS Receipt Print
  const handlePrintThermalReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    try {
      openThermalLabelPrintWindow({
        itemCode: inv.invoiceNo,
        description: `RETAIL POS: ${inv.items.length} garments (${inv.paymentMethod})`,
        brand: activeProfile?.companyName || 'VINTAGE VIBES',
        grade: `UAE VAT 5%: AED ${inv.vatAmount}`,
        retailPriceAed: inv.totalAmount,
        weightKg: Number((totalWeightGrams / 1000).toFixed(2)),
        batchNo: `AUTH: ${inv.paymentMethod}`,
        date: inv.date
      });
    } catch {}
  };

  // WhatsApp E-Receipt
  const handleSendWhatsAppReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    const phone = (selectedCustomer?.phone || prompt('Enter Customer WhatsApp Number (+971...)', '+971') || '').replace(/[^0-9]/g, '');
    if (!phone) return;

    const itemsSummary = (Array.isArray(inv?.items) ? inv.items : []).map((it: any) => `• ${it.description} — AED ${it.finalAmount}`).join('\n');
    const msg = encodeURIComponent(
      `🛍️ *${activeProfile?.companyName || 'VINTAGE VIBES DUBAI'} - E-RECEIPT*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *Tax Invoice:* ${inv.invoiceNo}\n` +
      `📅 *Date:* ${inv.date}\n` +
      `💳 *Payment:* ${inv.paymentMethod}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${itemsSummary}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Subtotal: AED ${inv.subTotal}\n` +
      `UAE VAT 5%: AED ${inv.vatAmount}\n` +
      `*TOTAL PAID: AED ${inv.totalAmount}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `TRN: ${activeProfile?.trn_number || activeProfile?.trnTaxNo || '100482910300003'}\n` +
      `Store: ${activeProfile?.address_line_1 || activeProfile?.addressLine1 || 'House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, UAE'}\n` +
      `Thank you for shopping vintage authenticated grails!`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  // Gift Receipt Print (Prices Hidden)
  const handlePrintGiftReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    openGiftReceiptPrintWindow({
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      companyName: activeProfile?.companyName || 'VINTAGE VIBES DUBAI',
      trn: activeProfile?.trnTaxNo || '100482910300003',
      customerName: selectedCustomer?.name || 'Retail Client',
      giftMessage: giftMessage.trim() || undefined,
      items: (Array.isArray(checkoutSuccessData?.pieces) ? checkoutSuccessData.pieces : []).map((p: any) => ({
        description: `${p.brandName} ${p.itemName}`,
        barcode: p.barcode,
        size: p.sizeScanned || 'M',
        brand: p.brandName
      }))
    });
  };

  // WhatsApp Gift Slip (No Prices)
  const handleSendWhatsAppGiftReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    const phone = (selectedCustomer?.phone || prompt('Enter WhatsApp Number for Gift Slip (+971...)', '+971') || '').replace(/[^0-9]/g, '');
    if (!phone) return;

    const itemsSummary = (Array.isArray(checkoutSuccessData?.pieces) ? checkoutSuccessData.pieces : []).map((p: any) => `• ${p.brandName} ${p.itemName} (${p.sizeScanned || 'M'}) [SKU: ${p.barcode}]`).join('\n');
    const msg = encodeURIComponent(
      `🎁 *${activeProfile?.companyName || 'VINTAGE VIBES DUBAI'} - GIFT SLIP*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *Gift Ref:* ${inv.invoiceNo}\n` +
      `📅 *Date:* ${inv.date}\n` +
      (giftMessage ? `💌 *Gift Note:* "${giftMessage}"\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎁 *GIFT ITEMS (PRICES HIDDEN):*\n${itemsSummary}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `★ *14-DAY EXCHANGE POLICY* ★\n` +
      `• Exchange permitted within 14 days with tags attached.\n` +
      `• No cash refund. Prices hidden for recipient.\n` +
      `Store: ${activeProfile?.address_line_1 || activeProfile?.addressLine1 || 'House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, UAE'}\n` +
      `Enjoy your vintage grail!`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  return (
    <div className={`flex flex-col h-full space-y-3 animate-in fade-in duration-200 ${
      posTheme === 'light' ? 'text-slate-800' : 'text-white'
    }`}>
      {/* 1. TOP STATUS & CONTROLS HUD */}
      <div className={`border rounded-2xl p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 transition-colors ${
        posTheme === 'light'
          ? 'bg-white/95 border-amber-300/80 text-slate-800 shadow-sm'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 text-amber-500 rounded-xl border border-amber-500/40">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                posTheme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>
                Walk-In Counter Sale (POS)
              </h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-600 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1 font-bold">
                <Wifi className="w-3 h-3 animate-pulse" />
                {posConfig.terminalName} • ONLINE
              </span>
              {pendingOfflineCount > 0 && (
                <button
                  type="button"
                  onClick={() => offlineQueue.syncPendingSales()}
                  className="text-[10px] bg-amber-500/25 text-amber-800 dark:text-amber-300 font-mono px-2.5 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1 font-bold animate-pulse hover:bg-amber-500/40 cursor-pointer"
                  title="Click to sync offline buffered sales to PostgreSQL"
                >
                  <span>● {pendingOfflineCount} Offline Sales Buffered (Sync)</span>
                </button>
              )}
            </div>
            <p className={`text-[11px] ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              Continuous Barcode Gun Scanner • Multi-Piece Basket • Instant COA & COGS Accounting
            </p>
          </div>
        </div>

        {/* Right Tools HUD */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Theme Switcher Toggle */}
          <button
            type="button"
            onClick={togglePosTheme}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
              posTheme === 'light'
                ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle Boutique Luxury Web Light / Dark Vault Mode"
          >
            {posTheme === 'light' ? <Moon className="w-3.5 h-3.5 text-amber-700" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            <span>{posTheme === 'light' ? '🌙 Dark Vault' : '☀️ Web Cream'}</span>
          </button>

          {/* Parked Carts Button */}
          <button
            type="button"
            onClick={() => setShowParkedModal(true)}
            className={`relative px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
              posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Parked Carts</span>
            {parkedSales.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-mono font-black">
                {parkedSales.length}
              </span>
            )}
          </button>

          {/* Manager Eye Profit HUD Toggle */}
          <button
            type="button"
            onClick={() => setShowManagerProfit(p => !p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
              showManagerProfit
                ? 'bg-amber-600/20 text-amber-700 border-amber-400'
                : posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
            }`}
            title="Toggle Live Gross Margin / Profit HUD (Manager Only)"
          >
            {showManagerProfit ? <Eye className="w-3.5 h-3.5 text-amber-500" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Manager Margin</span>
          </button>

          {/* Hold / Park Current Cart */}
          <button
            type="button"
            onClick={handleParkActiveCart}
            disabled={cart.length === 0}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-40 ${
              posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <span>⏸️ Hold Cart</span>
          </button>

          {/* Clear Basket */}
          <button
            type="button"
            onClick={handleClearBasket}
            disabled={cart.length === 0}
            className={`p-2 rounded-xl border transition cursor-pointer disabled:opacity-40 ${
              posTheme === 'light'
                ? 'bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 border-slate-300'
                : 'bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border-slate-700'
            }`}
            title="Clear Basket"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT LAYOUT: LEFT BASKET vs RIGHT FINANCIAL CHECKOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
        {/* LEFT COLUMN: SCANNER INPUT & SCANNED GARMENTS STREAM (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-3">
          {/* BARCODE GUN INPUT BAR */}
          <div className={`border-2 rounded-2xl p-3 shadow-lg flex items-center gap-3 transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-amber-400/90 shadow-amber-500/10'
              : 'bg-slate-900 border-indigo-500/50 shadow-lg'
          }`}>
            <div className={`p-2.5 rounded-xl shadow-md ${
              posTheme === 'light'
                ? 'bg-amber-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}>
              <Barcode className="w-6 h-6" />
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleScanPiece(barcodeInput);
              }}
              className="flex-1 flex items-center gap-2"
            >
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Scan Barcode Gun (Laser Auto-Beep) or Enter SKU..."
                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm sm:text-base font-mono uppercase focus:outline-hidden transition-all ${
                  posTheme === 'light'
                    ? 'bg-slate-50 border-amber-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:bg-white'
                    : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-400'
                }`}
              />

              <button
                type="submit"
                disabled={!barcodeInput.trim()}
                className={`text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-amber-600 hover:bg-amber-500 disabled:opacity-40 shadow-sm'
                    : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40'
                }`}
              >
                <span>Add (↵)</span>
              </button>
            </form>
          </div>

          {/* SCAN FEEDBACK ALERT BANNER */}
          {scanFeedback && (
            <div
              className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
                scanFeedback.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                  : scanFeedback.type === 'error'
                  ? 'bg-rose-950/80 border border-rose-500/50 text-rose-300'
                  : 'bg-indigo-950/80 border border-indigo-500/50 text-indigo-300'
              }`}
            >
              <span>{scanFeedback.text}</span>
              <button
                type="button"
                onClick={() => setScanFeedback(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* SCANNED ITEMS BASKET TABLE / LIST */}
          <div className={`border rounded-2xl flex-1 p-3 overflow-hidden flex flex-col transition-colors ${
            posTheme === 'light'
              ? 'bg-white/95 border-amber-300/80 shadow-md shadow-amber-500/5'
              : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b text-xs font-bold uppercase tracking-wider ${
              posTheme === 'light' ? 'border-amber-200/80 text-stone-500' : 'border-slate-800 text-slate-400'
            }`}>
              <span>Scanned Basket ({cart.length} Pieces)</span>
              <span className={`font-mono ${posTheme === 'light' ? 'text-amber-700 font-bold' : 'text-indigo-400'}`}>{totalWeightGrams}g Total Net Weight</span>
            </div>

            <div className={`flex-1 overflow-y-auto mt-2 space-y-1 pr-1 max-h-[520px] ${
              posTheme === 'light' ? 'divide-y divide-amber-100' : 'divide-y divide-slate-800/60'
            }`}>
              {cart.length === 0 ? (
                <div className={`h-64 flex flex-col items-center justify-center space-y-2 select-none ${
                  posTheme === 'light' ? 'text-stone-400' : 'text-slate-500'
                }`}>
                  <div className={`w-16 h-16 rounded-full border flex items-center justify-center ${
                    posTheme === 'light'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-600'
                      : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}>
                    <Barcode className="w-8 h-8" />
                  </div>
                  <p className={`text-sm font-bold ${posTheme === 'light' ? 'text-stone-700' : 'text-slate-400'}`}>Basket is Empty</p>
                  <p className={`text-xs max-w-xs text-center ${posTheme === 'light' ? 'text-stone-500' : 'text-slate-600'}`}>
                    Point your USB or Bluetooth barcode gun at any garment tag to instantly add it to this counter checkout.
                  </p>
                </div>
              ) : (
                (cart || []).map((item, idx) => (
                  <div
                    key={`${item.piece.barcode}-${idx}`}
                    className={`py-2.5 px-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                      posTheme === 'light'
                        ? 'bg-stone-50/90 hover:bg-amber-50/50 border-stone-200 hover:border-amber-300 shadow-xs'
                        : 'bg-slate-950/60 hover:bg-slate-950 border-transparent hover:border-slate-800'
                    }`}
                  >
                    {/* Item Front Photo + Details */}
                    <div className="flex items-center gap-3">
                      {/* Photo Thumbnail */}
                      <div
                        onClick={() => item.piece.frontImageUrl && setPreviewPhoto(item.piece.frontImageUrl)}
                        className={`w-12 h-12 rounded-lg border overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition ${
                          posTheme === 'light' ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        {item.piece.frontImageUrl ? (
                          <img src={item.piece.frontImageUrl} alt="Front" className="w-full h-full object-cover" />
                        ) : (
                          <span className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-stone-400' : 'text-slate-600'}`}>No Pic</span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-xs sm:text-sm ${
                            posTheme === 'light' ? 'text-stone-900' : 'text-white'
                          }`}>
                            {item.piece.brandName} {item.piece.itemName}
                          </span>
                          <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold border border-amber-300/40">
                            {item.piece.sizeScanned || 'M'}
                          </span>
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-300/40">
                            {item.piece.labelGrade || 'Grade A'}
                          </span>
                        </div>
                        <div className={`flex items-center gap-2 text-[10px] font-mono ${
                          posTheme === 'light' ? 'text-stone-500' : 'text-slate-400'
                        }`}>
                          <span>SKU: {item.piece.barcode}</span>
                          <span>•</span>
                          <span>{item.piece.weightGrams || Math.round((item.piece.weightKg || 0.45) * 1000)}g</span>
                          {showManagerProfit && (
                            <>
                              <span>•</span>
                              <span className="text-rose-600 dark:text-rose-400">COGS: AED {item.cogsCost}</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Margin: +AED {(item.sellingPrice - item.cogsCost).toFixed(2)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price, Complimentary Gift Toggle & Delete Action */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      {/* Complimentary Gift Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleGiftItem(idx)}
                        title={item.isGift ? "Undo Complimentary Gift (Restore Price)" : "Mark as Complimentary Free Gift (AED 0)"}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border cursor-pointer ${
                          item.isGift
                            ? 'bg-amber-500 text-stone-900 border-amber-400 shadow-sm shadow-amber-500/30 font-black'
                            : posTheme === 'light'
                              ? 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-amber-950/40 hover:text-amber-300 hover:border-amber-800/40'
                        }`}
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider">{item.isGift ? 'Gift' : 'Gift?'}</span>
                      </button>

                      <div className="text-right min-w-[70px]">
                        {item.isGift ? (
                          <>
                            <div className="text-sm sm:text-base font-black font-mono text-amber-500 flex items-center justify-end gap-1">
                              <span>FREE</span>
                              <span className="text-[10px]">🎁</span>
                            </div>
                            <div className={`text-[9px] line-through font-mono ${posTheme === 'light' ? 'text-stone-400' : 'text-slate-500'}`}>
                              AED {(item.originalPrice ?? 0).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm sm:text-base font-black font-mono ${
                              posTheme === 'light' ? 'text-emerald-700' : 'text-emerald-400'
                            }`}>
                              AED {item.sellingPrice.toFixed(2)}
                            </div>
                            <div className={`text-[9px] ${posTheme === 'light' ? 'text-stone-400' : 'text-slate-500'}`}>VAT Incl.</div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className={`p-1.5 rounded-lg transition ${
                          posTheme === 'light'
                            ? 'text-stone-400 hover:text-rose-600 hover:bg-rose-50'
                            : 'text-slate-500 hover:text-rose-400 hover:bg-rose-950/40'
                        }`}
                        title="Remove piece"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: FINANCIAL SUMMARY & CHECKOUT ACTIONS (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-3">
          {/* CUSTOMER SELECTION BAR */}
          <div className={`border rounded-2xl p-3 space-y-2 transition-colors ${
            posTheme === 'light'
              ? 'bg-white/95 border-amber-300/80 text-stone-900 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between text-xs font-bold ${
              posTheme === 'light' ? 'text-stone-700' : 'text-slate-300'
            }`}>
              <span>Customer / VIP Account:</span>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                >
                  Clear (Walk-In)
                </button>
              )}
            </div>

            <select
              value={selectedCustomer?.id || ''}
              onChange={e => {
                const found = parties.find(p => p.id === e.target.value);
                setSelectedCustomer(found || null);
              }}
              className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden transition ${
                posTheme === 'light'
                  ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-amber-500 focus:bg-white'
                  : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
              }`}
            >
              <option value="">👤 Standard Walk-In Retail Customer</option>
              {(parties || []).map(p => (
                <option key={p.id} value={p.id}>
                  ⭐ {p.name} ({p.code}) • {p.phone || 'VIP Client'}
                </option>
              ))}
            </select>
          </div>

          {/* GIFT ORDER & LUXURY PACKAGING CARD */}
          <div className={`border rounded-2xl p-3.5 space-y-2.5 transition-colors ${
            posTheme === 'light'
              ? 'bg-amber-50/50 border-amber-300/80 text-stone-900 shadow-sm'
              : 'bg-slate-900 border-amber-500/30 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isGiftOrder}
                  onChange={(e) => setIsGiftOrder(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                />
                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <Gift className="w-4 h-4 text-amber-500" />
                  <span>Mark as Gift Order</span>
                </span>
              </label>

              {isGiftOrder && (
                <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold border border-amber-400/40">
                  Gift Slip Ready
                </span>
              )}
            </div>

            {isGiftOrder && (
              <div className="space-y-2.5 pt-2 border-t border-amber-200/70 dark:border-amber-500/20 animate-in fade-in">
                <div>
                  <label className={`text-[10px] font-bold block mb-1 ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                    Recipient Dedication / Gift Note (Printed on Gift Slip):
                  </label>
                  <input
                    type="text"
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    placeholder="e.g. For Sarah - Happy Birthday! From Alex"
                    className={`w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none font-medium ${
                      posTheme === 'light'
                        ? 'bg-white border-amber-300 text-stone-900 focus:border-amber-500'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                    }`}
                  />
                </div>

                <label className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer select-none transition ${
                  includeGiftBox
                    ? 'border-amber-400 bg-amber-100/60 dark:bg-amber-950/40'
                    : 'border-amber-200/60 bg-white/70 dark:bg-slate-950/60'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeGiftBox}
                      onChange={(e) => setIncludeGiftBox(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold">Luxury Boutique Gift Box & Ribbon</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">+AED 15.00</span>
                </label>
              </div>
            )}
          </div>

          {/* FINANCIAL SUMMARY TOTALS CARD */}
          <div className={`border rounded-2xl p-4 shadow-xl space-y-3 transition-colors ${
            posTheme === 'light'
              ? 'bg-white/95 border-amber-300/80 text-stone-900 shadow-amber-500/5'
              : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider pb-2 border-b ${
              posTheme === 'light' ? 'text-stone-500 border-stone-200' : 'text-slate-400 border-slate-800'
            }`}>
              Basket Summary & Taxes
            </h3>

            <div className="space-y-2 text-xs">
              <div className={`flex justify-between ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-300'}`}>
                <span>Total Items</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-stone-900' : 'text-white'}`}>{cart.length} Pieces</span>
              </div>

              <div className={`flex justify-between ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-300'}`}>
                <span>Subtotal (Net)</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-stone-900' : 'text-white'}`}>AED {subTotal.toFixed(2)}</span>
              </div>

              {discountTotal > 0 && (
                <div className="flex justify-between text-rose-500 font-semibold">
                  <span>Discount Applied</span>
                  <span className="font-mono font-bold">-AED {discountTotal.toFixed(2)}</span>
                </div>
              )}

              <div className={`flex justify-between ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-300'}`}>
                <span>UAE VAT (5.0%)</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-amber-700' : 'text-indigo-300'}`}>AED {vatAmount.toFixed(2)}</span>
              </div>

              {giftBoxFee > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-semibold">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" />
                    <span>Luxury Gift Box</span>
                  </span>
                  <span className="font-mono font-bold">+AED {giftBoxFee.toFixed(2)}</span>
                </div>
              )}

              <div className={`pt-2 border-t flex justify-between items-baseline ${
                posTheme === 'light'
                  ? 'border-amber-200 bg-amber-50/70 p-2.5 rounded-xl border'
                  : 'border-slate-800'
              }`}>
                <span className={`text-sm font-black uppercase ${
                  posTheme === 'light' ? 'text-amber-900' : 'text-amber-300'
                }`}>Grand Total:</span>
                <span className={`text-2xl font-black font-mono ${
                  posTheme === 'light' ? 'text-emerald-700' : 'text-emerald-400'
                }`}>
                  AED {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* LIVE MANAGER PROFIT & COGS HUD */}
            {showManagerProfit && (
              <div className={`p-2.5 rounded-xl text-[11px] space-y-1 animate-in fade-in border ${
                posTheme === 'light'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              }`}>
                <div className="flex justify-between font-semibold">
                  <span>Cumulative COGS Cost:</span>
                  <span className="font-mono font-bold">AED {totalCogs.toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold text-xs pt-1 border-t ${
                  posTheme === 'light' ? 'border-amber-200 text-emerald-800' : 'border-amber-500/20 text-emerald-300'
                }`}>
                  <span>Live Gross Margin:</span>
                  <span className="font-mono">+AED {grossProfit.toFixed(2)} ({grossMarginPercent}%)</span>
                </div>
              </div>
            )}

            {/* QUICK DISCOUNT TRIGGER */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setTempDiscountVal(String(discountTotal));
                  setShowDiscountModal(true);
                }}
                className={`w-full py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <Percent className="w-3.5 h-3.5 text-amber-500" />
                <span>{discountTotal > 0 ? `Discount: AED ${discountTotal}` : 'Apply Promo / Discount'}</span>
              </button>
            </div>

            {/* MAIN CHECKOUT TRIGGER BUTTON */}
            <button
              type="button"
              onClick={handleOpenCheckout}
              disabled={cart.length === 0}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <span>Collect Payment (AED {grandTotal.toFixed(2)})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* HARDWARE STATUS POD */}
          <div className={`border rounded-2xl p-3 space-y-2 transition-colors ${
            posTheme === 'light'
              ? 'bg-white/95 border-amber-300/80 text-stone-900 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between text-[11px] ${
              posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'
            }`}>
              <span className="flex items-center gap-1.5 font-bold">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>Connected Payment Machine:</span>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">PAX / Sunmi P2</span>
            </div>
            <p className={`text-[10px] ${posTheme === 'light' ? 'text-stone-500' : 'text-slate-500'}`}>
              Terminal: {posConfig.terminalId} • Ready to receive NFC Apple Pay & Contactless Card taps.
            </p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-MODE PAYMENT POPUP MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 animate-in fade-in duration-200">
          <div className={`border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-amber-300 text-stone-900'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            {/* MODAL HEADER */}
            <div className={`p-4 border-b flex items-center justify-between ${
              posTheme === 'light'
                ? 'bg-amber-50/60 border-stone-200'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <div>
                <h3 className={`text-base font-black uppercase tracking-wider ${
                  posTheme === 'light' ? 'text-stone-900' : 'text-white'
                }`}>
                  Select Payment Method
                </h3>
                <p className={`text-xs ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  Total Due: <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm">AED {grandTotal.toFixed(2)}</span> (VAT Included)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className={`p-1.5 rounded-lg ${
                  posTheme === 'light'
                    ? 'text-stone-400 hover:text-stone-900 hover:bg-stone-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PAYMENT TABS: CASH vs CARD vs BANK QR vs SPLIT */}
            <div className={`grid grid-cols-4 p-2 gap-1.5 border-b ${
              posTheme === 'light'
                ? 'bg-stone-100/70 border-stone-200'
                : 'bg-slate-900/70 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setPaymentMode('CASH')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMode === 'CASH'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : posTheme === 'light'
                    ? 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>💵 Cash</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMode('CARD_POS');
                  handleInitiatePosMachineTap();
                }}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMode === 'CARD_POS'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : posTheme === 'light'
                    ? 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>💳 Card / NFC</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('BANK_QR')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMode === 'BANK_QR'
                    ? 'bg-purple-600 text-white shadow-md'
                    : posTheme === 'light'
                    ? 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>📱 Bank QR</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('SPLIT')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMode === 'SPLIT'
                    ? 'bg-amber-600 text-white shadow-md'
                    : posTheme === 'light'
                    ? 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Percent className="w-4 h-4" />
                <span>✂️ Split Pay</span>
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="p-4 space-y-4">
              {grandTotal === 0 && (
                <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
                  posTheme === 'light'
                    ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}>
                  <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>🎁 <strong>100% Free Complimentary Giveaway:</strong> Customer payment is AED 0.00. Clicking &apos;Confirm Complimentary Giveaway&apos; below will mark the barcode as sold/gifted and relieve inventory stock.</span>
                </div>
              )}

              {/* OPTION 1: CASH PAYMENT */}
              {paymentMode === 'CASH' && (
                <div className="space-y-3">
                  <div className={`flex items-center justify-between text-xs ${
                    posTheme === 'light' ? 'text-stone-600' : 'text-slate-300'
                  }`}>
                    <span>Quick Currency Note Buttons:</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-300">Grand Total: AED {grandTotal.toFixed(2)}</span>
                  </div>

                  {/* Fast Note AED Buttons */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Exact', val: grandTotal },
                      { label: 'AED 100', val: 100 },
                      { label: 'AED 200', val: 200 },
                      { label: 'AED 500', val: 500 },
                      { label: 'AED 1000', val: 1000 }
                    ].map(n => (
                      <button
                        key={n.label}
                        type="button"
                        onClick={() => setCashTendered(String(n.val))}
                        className={`py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer border ${
                          posTheme === 'light'
                            ? 'bg-stone-50 hover:bg-stone-100 border-stone-200 hover:border-emerald-500 text-stone-800 shadow-xs'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-emerald-500 text-white'
                        }`}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>

                  {/* Tendered Input & Change Box */}
                  <div className="space-y-1">
                    <label className={`text-xs font-semibold ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                      Cash Tendered by Customer (AED):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={cashTendered}
                      onChange={e => setCashTendered(e.target.value)}
                      className={`w-full border-2 rounded-xl p-3 text-xl font-mono font-bold focus:outline-hidden transition ${
                        posTheme === 'light'
                          ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                          : 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-white'
                      }`}
                    />
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    posTheme === 'light'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-emerald-950/40 border-emerald-500/40'
                  }`}>
                    <div>
                      <span className={`text-xs font-semibold ${posTheme === 'light' ? 'text-emerald-800' : 'text-slate-400'}`}>
                        Change to Return Customer:
                      </span>
                      <div className={`text-xl font-black font-mono ${
                        posTheme === 'light' ? 'text-emerald-700' : 'text-emerald-400'
                      }`}>
                        AED {changeDue.toFixed(2)}
                      </div>
                    </div>
                    <div className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-emerald-700' : 'text-emerald-300/80'}`}>
                      Cash Drawer Signal: Auto-Kick
                    </div>
                  </div>
                </div>
              )}

              {/* OPTION 2: SMART POS CARD MACHINE (NFC / APPLE PAY / CHIP) */}
              {paymentMode === 'CARD_POS' && (
                <div className="space-y-3 text-center py-2">
                  <div className="w-16 h-16 rounded-full bg-indigo-950 border-2 border-indigo-500/60 flex items-center justify-center mx-auto text-indigo-400">
                    <CreditCard className="w-8 h-8 animate-pulse" />
                  </div>

                  <div>
                    <h4 className={`text-sm font-bold ${posTheme === 'light' ? 'text-stone-900' : 'text-white'}`}>
                      Linked Terminal: {posConfig.terminalName}
                    </h4>
                    <p className={`text-xs ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                      Terminal ID: <span className="font-mono text-indigo-600 dark:text-indigo-300 font-bold">{posConfig.terminalId}</span> • IP: <span className="font-mono">{posConfig.ipAddress}</span>
                    </p>
                  </div>

                  {posMachineStage === 'AWAITING_TAP' && (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2">
                      <Radio className="w-4 h-4 animate-ping" />
                      <span>Transmitting AED {grandTotal.toFixed(2)} to POS Machine... Customer Tap Card / Apple Pay now.</span>
                    </div>
                  )}

                  {posMachineStage === 'APPROVED' && (
                    <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/60 text-emerald-300 text-xs font-semibold space-y-1 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-1.5 font-black text-sm text-emerald-400">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span>PAYMENT APPROVED ON MACHINE!</span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-300">
                        Card: {posCardBrand} • Auth: {posAuthCode} • Account: {posConfig.clearingAccountId}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleInitiatePosMachineTap}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <span>🔄 Re-Send Amount to Machine</span>
                    </button>
                  </div>
                </div>
              )}

              {/* OPTION 3: BANK QR / INSTANT WALLET */}
              {paymentMode === 'BANK_QR' && (
                <div className="space-y-3 text-center py-2">
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-amber-400 inline-block">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=iban%3A${activeProfile?.bankIban || 'AE240331234567890123456'}%26amount%3D${grandTotal}%26title%3DVINTAGE%20VIBES`}
                        alt="Bank QR Code"
                        className="w-40 h-40 object-contain"
                      />
                    </div>
                  </div>

                  <div>
                    <div className={`text-sm font-bold ${posTheme === 'light' ? 'text-stone-900' : 'text-white'}`}>{activeProfile?.bankName || 'Emirates NBD Bank'}</div>
                    <div className="text-xs text-amber-600 dark:text-amber-300 font-mono font-bold">{activeProfile?.bankIban || 'AE24 0331 2345 6789 0123 456'}</div>
                    <div className={`text-[11px] mt-0.5 ${posTheme === 'light' ? 'text-stone-500' : 'text-slate-400'}`}>Customer scans with any UAE mobile banking app for instant deposit</div>
                  </div>
                </div>
              )}

              {/* OPTION 4: SPLIT PAYMENT (CASH + CARD + QR) */}
              {paymentMode === 'SPLIT' && (
                <div className="space-y-3">
                  <div className={`flex items-center justify-between text-xs pb-2 border-b ${
                    posTheme === 'light' ? 'text-stone-600 border-stone-200' : 'text-slate-300 border-slate-800'
                  }`}>
                    <span>Split Payment Breakdown:</span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-300">Total Due: AED {grandTotal.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>💵 Cash Part (AED):</label>
                      <input
                        type="number"
                        value={splitCash}
                        onChange={e => setSplitCash(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-stone-50 border-stone-300 text-stone-900 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>💳 Card/POS Part (AED):</label>
                      <input
                        type="number"
                        value={splitCard}
                        onChange={e => setSplitCard(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-stone-50 border-stone-300 text-stone-900 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>📱 QR Part (AED):</label>
                      <input
                        type="number"
                        value={splitQr}
                        onChange={e => setSplitQr(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-stone-50 border-stone-300 text-stone-900 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className={`p-3.5 border-t flex items-center justify-between ${
              posTheme === 'light'
                ? 'bg-amber-50/40 border-stone-200'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Back to Basket
              </button>

              <button
                type="button"
                onClick={handleConfirmFinalCheckout}
                disabled={isScanning || (grandTotal > 0 && paymentMode === 'CASH' && Number(cashTendered) < grandTotal)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition active:scale-95 cursor-pointer"
              >
                {isScanning ? (
                  <span>Posting COGS & Inventory Relief...</span>
                ) : grandTotal === 0 ? (
                  <>
                    <Gift className="w-4 h-4 text-amber-300" />
                    <span>Confirm Complimentary Giveaway (AED 0.00)</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm Sale & Print Bill (↵)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. POST-CHECKOUT SUCCESS MODAL */}
      {checkoutSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 animate-in zoom-in-95 duration-200">
          <div className="bg-slate-950 border border-emerald-500/50 w-full max-w-md rounded-2xl shadow-2xl p-6 text-white text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border-2 border-emerald-400 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black uppercase tracking-wider text-white">
                Transaction Successful!
              </h3>
              <p className="text-xs text-slate-400">
                Invoice No: <span className="font-mono font-bold text-amber-300">{checkoutSuccessData.invoice.invoiceNo}</span>
              </p>
            </div>

            {/* Summary Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Items Sold:</span>
                <span className="text-white font-bold">{checkoutSuccessData.pieces.length} Garments</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Collected:</span>
                <span className="text-emerald-400 font-bold">AED {checkoutSuccessData.invoice.totalAmount}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total COGS Deducted:</span>
                <span className="text-rose-400 font-bold">AED {checkoutSuccessData.cogsSummary.totalCogsAed}</span>
              </div>
              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                <span>Net Gross Margin:</span>
                <span className="text-amber-300 font-bold">
                  +AED {checkoutSuccessData.cogsSummary.grossProfitAed} ({checkoutSuccessData.cogsSummary.grossMarginPercent}%)
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePrintThermalReceipt}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Thermal Bill (80mm)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppReceipt}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>WhatsApp Bill</span>
                </button>
              </div>

              {/* Gift Receipt Options (No Prices on Bill) */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handlePrintGiftReceipt}
                  className="py-2.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                  title="Print Thermal 80mm Gift Receipt (Prices Hidden with Exchange Policy)"
                >
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span>Gift Slip (No Price)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppGiftReceipt}
                  className="py-2.5 px-3 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                  title="Send WhatsApp Gift Slip with 14-day exchange notice"
                >
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span>WhatsApp Gift Slip</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCheckoutSuccessData(null);
                  setTimeout(() => barcodeInputRef.current?.focus(), 50);
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer mt-1"
              >
                [ Start Next Sale (↵) ]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PARKED CARTS MODAL */}
      {showParkedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 animate-in fade-in">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl p-4 text-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>Parked / Held Customer Carts</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowParkedModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {parkedSales.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No parked carts right now. Use "Hold Cart" when a customer steps away.
                </div>
              ) : (
                (parkedSales || []).map(park => (
                  <div
                    key={park.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">
                        {park.customerName || 'Walk-In Customer'} ({(park?.items || []).length} garments)
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">Held at {park.timestamp}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResumeParkedSale(park)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition"
                    >
                      Resume Cart (↵)
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. PHOTO LIGHTBOX MODAL */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 cursor-pointer"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-md max-h-[85vh] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-2">
            <img src={previewPhoto} alt="Garment Studio Front" className="w-full h-full object-contain rounded-xl" />
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 bg-black/70 hover:bg-rose-600 text-white p-1 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 7. DISCOUNT OVERRIDE MODAL */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 animate-in fade-in">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-sm rounded-2xl p-4 text-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Apply Promo / Manager Discount
              </h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Discount Amount (AED):</label>
              <input
                type="number"
                step="1"
                value={tempDiscountVal}
                onChange={e => setTempDiscountVal(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm font-mono text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDiscountTotal(0);
                  setShowDiscountModal(false);
                }}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
              >
                Clear Discount
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscountTotal(Number(tempDiscountVal) || 0);
                  setShowDiscountModal(false);
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs"
              >
                Apply (AED {tempDiscountVal})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

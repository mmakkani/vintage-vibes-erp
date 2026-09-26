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
  Gift,
  ChevronDown,
  UserPlus,
  Loader2
} from 'lucide-react';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { CompanyProfile } from '../../setup/setup.types.ts';
import { POSTerminalConfig } from '../../setup/hardware.types.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { SalesService } from '../../../services/salesService.ts';
import { SequenceService } from '../../../services/sequenceService.ts';
import { PartiesService } from '../../../services/partiesService.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { CrmService, CrmRetailCustomer } from '../../../services/crmService.ts';
import { WhatsAppService } from '../../../services/whatsappService.ts';
import { openThermalLabelPrintWindow, openGiftReceiptPrintWindow, openPosThermalReceiptPrintWindow } from '../../../utils/thermalPrinter.ts';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import { offlineQueue } from '../../../services/offlineQueueService.ts';

/**
 * Builds a professionally formatted WhatsApp receipt link with items, VAT, and store details.
 */
export function buildWhatsAppReceiptUrl({
  phone,
  invoiceNo,
  date,
  customerName,
  paymentMethod,
  items,
  subTotal,
  discountAmount,
  vatAmount,
  totalAmount,
  companyName,
  trn,
  address
}: {
  phone: string;
  invoiceNo: string;
  date: string;
  customerName?: string;
  paymentMethod?: string;
  items: Array<{ description: string; unitPrice?: number; discount?: number; finalAmount: number }>;
  subTotal: number;
  discountAmount?: number;
  vatAmount: number;
  totalAmount: number;
  companyName?: string;
  trn?: string;
  address?: string;
}): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const itemsText = (Array.isArray(items) ? items : []).map(it => `• ${it.description} — AED ${Number(it.finalAmount).toFixed(2)}`).join('\n');
  const discountLine = discountAmount && discountAmount > 0 ? `Discount: -AED ${Number(discountAmount).toFixed(2)}\n` : '';

  const text =
`🛍️ *${(companyName || 'VINTAGE VIBES DUBAI').toUpperCase()} - OFFICIAL RECEIPT*
━━━━━━━━━━━━━━━━━━━━
📄 *Tax Invoice:* ${invoiceNo}
📅 *Date:* ${date}
👤 *Customer:* ${customerName || 'Walk-In Valued Guest'}
💳 *Payment:* ${paymentMethod || 'CASH'}
━━━━━━━━━━━━━━━━━━━━
*ITEMS PURCHASED:*
${itemsText}
━━━━━━━━━━━━━━━━━━━━
Subtotal: AED ${Number(subTotal).toFixed(2)}
${discountLine}UAE VAT (5%): AED ${Number(vatAmount).toFixed(2)}
*TOTAL PAID: AED ${Number(totalAmount).toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━
🏢 *${companyName || 'Vintage Vibes Luxury Boutiques'}*
📍 ${address || 'House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, UAE'}
TRN: ${trn || '100482910300003'}

Thank you for shopping authentic vintage grails! ✨`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

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
  cashierId?: string;
  currentUser?: any;
  onRefreshAll?: () => void;
  onNavigateTab?: (tab: string) => void;
  stockPieces?: PieceBreakdownItem[];
  clients?: Party[];
  onSaleCompleted?: () => void;
}

export const CounterSalePOSTerminal: React.FC<CounterSalePOSTerminalProps> = ({
  companyProfile: propCompanyProfile,
  operatorName = 'Cashier Lead',
  cashierId,
  currentUser,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [channelSettings, setChannelSettings] = useState<Record<string, string>>({});

  // Available pieces for manual search dropdown
  const [allPieces, setAllPieces] = useState<PieceBreakdownItem[]>((stockPieces || []).filter(p => !p.isSold && p.status === 'IN_STOCK'));
  const [parties, setParties] = useState<Party[]>(clients || []);
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);

  // Customer Search & Quick CRM Insights State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerInsights, setCustomerInsights] = useState<{ totalSpent: number; totalInvoices: number } | null>(null);
  const [loadingCustomerInsights, setLoadingCustomerInsights] = useState(false);

  // AI Visiting Card Scanner Modal State
  const [showAiCardModal, setShowAiCardModal] = useState(false);
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [isAnalyzingCard, setIsAnalyzingCard] = useState(false);
  const [cardScannerError, setCardScannerError] = useState<string | null>(null);
  const [cardFormData, setCardFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    address: ''
  });
  const [isSavingCardCustomer, setIsSavingCardCustomer] = useState(false);
  const cardFileInputRef = useRef<HTMLInputElement | null>(null);
  const customerDropdownRef = useRef<HTMLDivElement | null>(null);

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
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD_POS' | 'CARD_MANUAL' | 'BANK_QR' | 'SPLIT' | 'CREDIT_ACCOUNT'>('CASH');

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
  const [posErrorMessage, setPosErrorMessage] = useState<string | null>(null);

  // Split payment state
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitCard, setSplitCard] = useState<string>('');
  const [splitQr, setSplitQr] = useState<string>('');

  // Auto-Print Thermal Receipt Option (Toggleable on checkout)
  const [autoPrintThermal, setAutoPrintThermal] = useState<boolean>(true);

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

    const handleRealtime = (e: any) => {
      if (e.detail?.table === 'inventory_pieces') {
        const record = e.detail?.new;
        if (record) {
          const barcode = String(record.barcode || '').toLowerCase();
          const id = String(record.id || '').toLowerCase();
          const status = record.status;
          const isSold = Boolean(record.is_sold);

          if (status !== 'IN_STOCK' || isSold) {
            setAllPieces(prev => prev.filter(p =>
              p.barcode.toLowerCase() !== barcode &&
              String(p.id).toLowerCase() !== id
            ));
          } else if (status === 'IN_STOCK' && !isSold) {
            loadInventoryAndParties();
          }
        }
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtime);
    return () => window.removeEventListener('vv:realtime-record', handleRealtime);
  }, []);

  const DEFAULT_WALK_IN_CUSTOMER: any = useMemo(() => ({
    id: CrmService.CONTROL_WALK_IN_PARTY_ID,
    code: 'CLI-0010',
    name: 'Walk In Customer',
    company: 'Counter Sale',
    company_name: 'Counter Sale',
    phone: '',
    email: '',
    address: '',
    coa_account_id: CrmService.CONTROL_WALK_IN_ACCOUNT_CODE,
    account_map: { receivableAccountId: CrmService.CONTROL_WALK_IN_ACCOUNT_CODE, isControlKhataOnly: true },
    total_spent: 0,
    total_orders: 0
  }), []);

  const loadInventoryAndParties = async () => {
    if (stockPieces && stockPieces.length > 0) {
      setAllPieces(stockPieces.filter(p => !p.isSold && p.status === 'IN_STOCK'));
    }
    try {
      const [piecesRes, crmCustomersRes, channelSettingsRes] = await Promise.all([
        fetch('/api/sales/stock-pieces').then(r => r.ok ? r.json() : []).catch(() => []),
        CrmService.getCrmCustomers().catch(() => []),
        SalesService.getSalesChannelSettings().catch(() => [])
      ]);
      if (Array.isArray(piecesRes) && piecesRes.length > 0) {
        setAllPieces(piecesRes.filter((p: any) => !p.isSold && p.status === 'IN_STOCK'));
      }
      const list = Array.isArray(crmCustomersRes) ? crmCustomersRes : [];
      setParties([DEFAULT_WALK_IN_CUSTOMER, ...list.filter(c => c.id !== CrmService.CONTROL_WALK_IN_PARTY_ID)]);

      if (Array.isArray(channelSettingsRes)) {
        const map: Record<string, string> = {};
        channelSettingsRes.forEach((s: any) => {
          const k = s.setting_key || s.settingKey;
          const v = s.account_code || s.accountCode;
          if (k && v) map[k] = v;
        });
        setChannelSettings(map);
      }
    } catch (err) {
      console.warn('POS Data Load Error:', err);
      setParties([DEFAULT_WALK_IN_CUSTOMER]);
    }
  };

  // Fetch Customer Insights (CRM history) whenever selected customer changes
  useEffect(() => {
    let isMounted = true;
    if (selectedCustomer?.id) {
      setLoadingCustomerInsights(true);
      SalesService.getCustomerInsights(selectedCustomer.id)
        .then(data => {
          if (isMounted) setCustomerInsights(data);
        })
        .catch(() => {
          if (isMounted) setCustomerInsights(null);
        })
        .finally(() => {
          if (isMounted) setLoadingCustomerInsights(false);
        });
    } else {
      setCustomerInsights(null);
      setLoadingCustomerInsights(false);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedCustomer?.id]);

  // Click-outside listener to close the Customer Dropdown popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered customer parties list for search combobox: strictly isolated Retail CRM customers
  const filteredParties = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    const retailOnly = (parties || []).filter(p => {
      if (!p) return false;
      const name = String(p.name || '').toUpperCase();
      if (name.includes('E-COOMERCE') || name.includes('ECOMMERCE') || name.includes('LIVE SALE') || name.includes('ACCOUNTS RECEIVABLE')) return false;
      if (p.type === 'SUPPLIER' || (p as any).party_type === 'SUPPLIER') return false;
      return true;
    });
    if (!q) return retailOnly.slice(0, 40);
    return retailOnly.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      (p as any).company_name?.toLowerCase().includes(q) ||
      (p as any).company?.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [parties, customerSearchQuery]);

  // Handle AI Visiting Card file upload
  const handleCardFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target?.result as string;
      setCardImagePreview(b64);
      setIsAnalyzingCard(true);
      setCardScannerError(null);
      try {
        const parsed = await SalesService.parseVisitingCardWithGemini(b64);
        setCardFormData({
          name: parsed.name || '',
          phone: parsed.phone || '',
          email: parsed.email || '',
          company: parsed.company || '',
          address: ''
        });
      } catch (err: any) {
        setCardScannerError(err?.message || 'Could not parse card automatically. Please fill details manually.');
      } finally {
        setIsAnalyzingCard(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle saving customer created via AI Visiting Card Scanner
  const handleSaveCardCustomer = async () => {
    if (!cardFormData.name.trim()) {
      setCardScannerError('Customer Name is required.');
      return;
    }
    setIsSavingCardCustomer(true);
    setCardScannerError(null);
    try {
      const savedParty = await CrmService.saveCrmCustomer({
        name: cardFormData.name.trim(),
        phone: cardFormData.phone.trim(),
        email: cardFormData.email.trim(),
        company: cardFormData.company.trim(),
        address: cardFormData.address.trim()
      });

      setParties(prev => [savedParty as any, ...prev.filter(p => p.id !== savedParty.id)]);
      setSelectedCustomer(savedParty as any);
      setCustomerSearchQuery('');
      setShowAiCardModal(false);
      setCardImagePreview(null);
      setCardFormData({ name: '', phone: '', email: '', company: '', address: '' });
      luxuryAudio.playCashChime();
      setScanFeedback({
        text: `✨ CRM Contact "${savedParty.name}" linked to POS!`,
        type: 'success'
      });
    } catch (err: any) {
      setCardScannerError(err?.message || 'Failed to save customer');
    } finally {
      setIsSavingCardCustomer(false);
    }
  };

  // 1. Universal Laser Barcode Gun Listener
  useBarcodeScanner({
    onScan: (code) => {
      if (code && code.length > 0) {
        handleScanPiece(code);
      }
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

  // Add piece to cart handler with pessimistic reservation
  const handleScanPiece = async (rawCode?: string) => {
    const barcode = rawCode || '';
    if (!barcode || barcode.length === 0) return;
    const code = barcode.trim();
    if (!code || code.length === 0) return;

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
        text: `❌ Barcode "${code}" not found in available stock. Check tag or inward bale.`,
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

    if (piece.status !== 'IN_STOCK') {
      setScanFeedback({
        text: `⚠️ Item already reserved by another user.`,
        type: 'error'
      });
      setBarcodeInput('');
      return;
    }

    // CRITICAL DB UPDATE: The moment an item is added to a cart/draft, execute Supabase update:
    // UPDATE inventory_pieces SET status = 'RESERVED' WHERE id = [piece_id] AND status = 'IN_STOCK'
    try {
      await SalesService.reservePiece({ id: piece.id, barcode: piece.barcode });
    } catch (err: any) {
      luxuryAudio.playMechanicalClick();
      setScanFeedback({
        text: `⚠️ Item already reserved by another user.`,
        type: 'error'
      });
      setBarcodeInput('');
      setAllPieces(prev => prev.filter(p => p.barcode !== piece.barcode && p.id !== piece.id));
      return;
    }

    // Instantly remove from available stock grid
    setAllPieces(prev => prev.filter(p => p.barcode !== piece.barcode && p.id !== piece.id));

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

  const handleRemoveItem = async (index: number) => {
    luxuryAudio.playMechanicalClick();
    const itemToRemove = cart[index];
    setCart(prev => prev.filter((_, i) => i !== index));

    if (itemToRemove?.piece) {
      try {
        await SalesService.releasePiece({ id: itemToRemove.piece.id, barcode: itemToRemove.piece.barcode });
      } catch (e) {
        console.warn('Failed to release POS reservation:', e);
      }
      loadInventoryAndParties();
    }
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
  const handleClearBasket = async () => {
    if (cart.length === 0) return;
    if (!confirm('Clear all scanned garments from counter basket?')) return;
    luxuryAudio.playMechanicalClick();
    const itemsToRelease = [...cart];
    setCart([]);
    setSelectedCustomer(null);
    setDiscountTotal(0);

    for (const it of itemsToRelease) {
      if (it?.piece) {
        await SalesService.releasePiece({ id: it.piece.id, barcode: it.piece.barcode }).catch(() => {});
      }
    }
    loadInventoryAndParties();
  };

  // Trigger NFC / Smart POS Machine Real TCP/IP Hardware Bridge Request
  const handleInitiatePosMachineTap = async () => {
    setPosMachineStage('AWAITING_TAP');
    setPosErrorMessage(null);
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(40);
      }
    } catch {}

    const terminalIp = posConfig.ipAddress || posConfig.terminalIp || '192.168.1.150';
    const terminalPort = posConfig.port || 8080;
    const totalDue = grandTotal;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // Real TCP/IP hardware bridge request to the configured Smart POS terminal
      const response = await fetch(`http://${terminalIp}:${terminalPort}/v1/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalDue,
          currency: posConfig.currency || 'AED',
          terminalId: posConfig.terminalId,
          merchantId: posConfig.merchantId
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Terminal rejected payment');
      }

      const data = await response.json().catch(() => ({}));
      const generatedAuth = data?.authCode || data?.approvalCode || ('AUTH-' + Math.floor(100000 + Math.random() * 900000));
      const cardBrand = data?.cardBrand || data?.brand || 'VISA CONTACTLESS';
      setPosAuthCode(generatedAuth);
      setPosCardBrand(cardBrand);
      setPosMachineStage('APPROVED');
      setPosErrorMessage(null);
      luxuryAudio.playCashChime();
    } catch (error: any) {
      clearTimeout(timeoutId);
      const displayMsg = `Connection Failed: POS Machine not found at IP ${terminalIp}. Please check network or use Manual Entry.`;
      console.warn(`[POS Hardware Bridge] ${displayMsg}`, error);
      setPosMachineStage('FAILED');
      setPosErrorMessage(displayMsg);
      // STRICT AUDIT MANDATE: Do NOT proceed to checkout on failed connection.
    }
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
    setPosErrorMessage(null);
    setShowPaymentModal(true);
  };

  // Finalize Counter Sale & Post COA
  const handleConfirmFinalCheckout = async (overridePaymentMode?: typeof paymentMode) => {
    const effectivePaymentMode = overridePaymentMode || paymentMode;
    if (effectivePaymentMode !== paymentMode) {
      setPaymentMode(effectivePaymentMode);
    }
    setIsScanning(true);
    setIsSubmitting(true);
    try {
      let invoiceNum = `POS-${Date.now().toString().slice(-6)}`;
      try {
        invoiceNum = await SequenceService.getNextNumber('POS');
      } catch (seqErr) {
        console.warn('[POS Terminal] Sequence generation fallback:', seqErr);
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        invoiceNum = `POS-${mm}-${yyyy}-${Date.now().toString().slice(-4)}`;
      }
      const safeCart = Array.isArray(cart) ? cart : [];
      const subtotalAmt = safeCart.reduce((sum, c) => sum + ((Number(c?.sellingPrice) || 0) - (Number(c?.discount) || 0)), 0);
      const vatAmt = Number((subtotalAmt * 0.05).toFixed(2));
      const totalAmt = Number((subtotalAmt + vatAmt + giftBoxFee).toFixed(2));

      // Extract dynamic accounts from sales_channel_settings state
      let activeSettings = channelSettings;
      if (!activeSettings || Object.keys(activeSettings).length === 0) {
        try {
          const raw = await SalesService.getSalesChannelSettings();
          if (Array.isArray(raw)) {
            const map: Record<string, string> = {};
            raw.forEach((s: any) => {
              const k = s.setting_key || s.settingKey;
              const v = s.account_code || s.accountCode;
              if (k && v) map[k] = v;
            });
            activeSettings = map;
            setChannelSettings(map);
          }
        } catch (_) {}
      }

      const cogsAcc = activeSettings['cogs_account'] || '5100-02';
      const fgAcc = activeSettings['finished_goods_inventory'] || '1160-01';
      const revenueAcc = activeSettings['omnichannel_retail_revenue'] || '4110-01';
      const walkInAcc = activeSettings['pos_sales_clearing'] || '1130-05';
      const vatAcc = activeSettings['vat_output_account'] || '2140-01';
      const isCash = String(effectivePaymentMode).toLowerCase() === 'cash';
      const paymentAccCode = isCash
        ? (activeSettings['pos_cash_drawer'] || '1110-01')
        : (activeSettings['pos_terminal_clearing'] || '1125-01');

      // Validation: Halt checkout if incomplete
      if (!cogsAcc || !fgAcc || !revenueAcc || !walkInAcc) {
        alert("Audit Error: Dynamic COA mapping incomplete. Check Sales/COA settings.");
        setIsSubmitting(false);
        setIsScanning(false);
        return;
      }

      // Calculate total COGS safely:
      const totalCogs = Number(
        safeCart.reduce((sum: number, item: any) => {
          const rawCost = item?.cost_price ?? item?.cogsCost ?? item?.piece?.cogsCost ?? item?.piece?.costPrice ?? item?.piece?.calculatedCostPrice ?? 0;
          const num = Number(rawCost);
          return sum + (isNaN(num) ? 0 : num);
        }, 0).toFixed(2)
      );

      // Strict Cost Check: Extract the landed cost price for each item. If totalCogs <= 0, HALT checkout:
      if (totalCogs <= 0) {
        alert("Cost of Goods Sold (COGS) is zero or unassigned. POS checkout cannot proceed without landed cost.");
        setIsSubmitting(false);
        setIsScanning(false);
        return;
      }

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
          paymentMethod: effectivePaymentMode,
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
            paymentMethod: effectivePaymentMode,
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

      // 1. Dual-Entry Financial Voucher: CRITICAL AUDIT MANDATE (3-Part POS Voucher)
      // Posts FIRST. If this fails, no sale is committed and inventory pieces are never marked sold!
      const CONTROL_PARTY_ID = CrmService.CONTROL_WALK_IN_PARTY_ID; // 5eb820da-3bb1-4e54-8fd8-59b3db72aebf (CLI-0010)
      const CONTROL_ACC_NAME = CrmService.CONTROL_WALK_IN_ACCOUNT_NAME; // Walk In Customer (Customer)

      let createdVoucherNo = `VCH-${Date.now().toString().slice(-6)}`;
      const paymentAccName = isCash ? 'Cash in Hand (Counter)' : 'Bank / Card Clearing';
      const voucherLines = [
        // Part 1: Inventory Depletion & COGS
        {
          accountId: cogsAcc,
          accountCode: cogsAcc,
          accountName: 'Cost of Goods Sold - Finished Goods',
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: totalCogs,
          credit: 0,
          memo: `COGS for POS Sale ${invoiceNum}`
        },
        {
          accountId: fgAcc,
          accountCode: fgAcc,
          accountName: 'Finished Goods',
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: 0,
          credit: totalCogs,
          memo: `Inventory deduction ${invoiceNum}`
        },
        // Part 2: Revenue Recognition & Receivable
        {
          accountId: walkInAcc,
          accountCode: walkInAcc,
          accountName: CONTROL_ACC_NAME,
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: totalAmt,
          credit: 0,
          memo: `Receivable for POS Sale ${invoiceNum}`
        },
        {
          accountId: revenueAcc,
          accountCode: revenueAcc,
          accountName: 'POS / Counter Retail Sales',
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: 0,
          credit: subtotalAmt,
          memo: `Sales Revenue ${invoiceNum}`
        },
        ...(vatAmt > 0 ? [{
          accountId: vatAcc,
          accountCode: vatAcc,
          accountName: 'VAT Output 5%',
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: 0,
          credit: vatAmt,
          memo: `5% UAE VAT ${invoiceNum}`
        }] : []),
        // Part 3: Payment Settlement
        {
          accountId: paymentAccCode,
          accountCode: paymentAccCode,
          accountName: paymentAccName,
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: totalAmt,
          credit: 0,
          memo: `Payment Received ${invoiceNum} (${effectivePaymentMode})`
        },
        {
          accountId: walkInAcc,
          accountCode: walkInAcc,
          accountName: CONTROL_ACC_NAME,
          partyId: CONTROL_PARTY_ID,
          partyName: 'Walk In Customer',
          debit: 0,
          credit: totalAmt,
          memo: `Payment Cleared ${invoiceNum}`
        }
      ];

      const vDebitSum = Number(voucherLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0).toFixed(2));
      const vCreditSum = Number(voucherLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0).toFixed(2));

      const vRes = await FinanceService.addVoucher({
        date: new Date().toISOString().slice(0, 10),
        type: 'CRV',
        reference: invoiceNum,
        narration: `POS Counter Sale ${invoiceNum} - ${selectedCustomer?.name || 'Walk-In Customer'}`,
        createdBy: operatorName || 'Cashier Lead',
        isAuto: true,
        is_auto: true,
        totalDebit: vDebitSum,
        totalCredit: vCreditSum,
        lines: voucherLines
      });
      if (vRes?.voucherNo) {
        createdVoucherNo = vRes.voucherNo;
      }

      // 2. Record in sales_invoices:
      // Financial clientId is hardcoded to CONTROL_PARTY_ID
      // CRM customer details are stored for receipt/printing/WhatsApp
      await SalesService.createSalesInvoice({
        invoiceNo: invoiceNum,
        clientId: CONTROL_PARTY_ID,
        customerName: selectedCustomer?.name || 'Walk-In Customer',
        customerPhone: selectedCustomer?.phone || '',
        channel: 'POS',
        paymentMethod: effectivePaymentMode as any,
        subtotal: subtotalAmt,
        discountAmount: discountTotal,
        taxAmount: vatAmt,
        totalAmount: totalAmt,
        grossProfitAed: Number((subtotalAmt - totalCogs).toFixed(2)),
        status: 'PAID',
        items: cart.map(c => {
          const itemCost = Number(c?.cogsCost ?? (c?.piece as any)?.cost_price ?? (c?.piece as any)?.calculatedCostPrice ?? (c?.piece as any)?.cogsCost ?? 0);
          return {
            barcode: c.piece.barcode,
            pieceId: c.piece.id,
            description: `${c.piece.brandName} ${c.piece.itemName}`,
            unitPrice: c.sellingPrice,
            discount: c.discount,
            finalAmount: c.sellingPrice - c.discount,
            weightKg: c.piece.weightKg || 0.45,
            calculatedCostPrice: itemCost,
            cost_price: itemCost,
            cogsCost: itemCost
          };
        })
      });

      // 3. Direct insert to public.pos_sales and auto stock decrement with cashier audit tagging
      const effectiveCashierId = cashierId || currentUser?.id || currentUser?.operator_id || undefined;
      const posRecord = await SalesService.createPosSale({
        invoice_number: invoiceNum,
        cashier_id: effectiveCashierId,
        customer_name: selectedCustomer?.name || 'Walk-In Customer',
        customer_phone: selectedCustomer?.phone || '',
        items: cart.map(c => {
          const itemCost = Number(c?.cogsCost ?? (c?.piece as any)?.cost_price ?? (c?.piece as any)?.calculatedCostPrice ?? (c?.piece as any)?.cogsCost ?? 0);
          return {
            barcode: c.piece.barcode,
            pieceId: c.piece.id,
            itemName: c.piece.itemName,
            brandName: c.piece.brandName,
            unitPrice: c.sellingPrice,
            discount: c.discount,
            finalAmount: c.sellingPrice - c.discount,
            calculatedCostPrice: itemCost,
            cost_price: itemCost,
            cogsCost: itemCost
          };
        }),
        subtotal: subtotalAmt,
        tax_amount: vatAmt,
        discount_amount: discountTotal,
        grand_total: totalAmt,
        payment_type: effectivePaymentMode,
        payment_status: 'PAID'
      });

      // 4. Update isolated CRM retail customer purchase metrics
      if (selectedCustomer?.id && selectedCustomer.id !== CONTROL_PARTY_ID) {
        CrmService.incrementCustomerSales(selectedCustomer.id, totalAmt).catch(err => {
          console.warn('[POS Terminal] Non-blocking CRM metric update notice:', err);
        });
      }

      luxuryAudio.playCashChime();
      setShowPaymentModal(false);

      const customerPhoneForSlip = (selectedCustomer?.phone || '').trim();
      const customerNameForSlip = selectedCustomer?.name || 'Walk-In Customer';

      // 4. Automated Marketing WhatsApp Invoice Slip
      if (customerPhoneForSlip) {
        WhatsAppService.sendInvoiceNotification({
          invoiceNo: invoiceNum,
          type: 'SALES',
          customerName: customerNameForSlip,
          customerPhone: customerPhoneForSlip,
          totalAmount: totalAmt,
          subtotal: subtotalAmt,
          taxAmount: vatAmt,
          currency: 'AED',
          invoiceDate: new Date().toISOString(),
          items: cart.map(c => ({
            name: `${c.piece.brandName} ${c.piece.itemName}`,
            quantity: 1,
            price: c.sellingPrice - c.discount
          }))
        }).catch(err => console.warn('[POS Checkout] Auto-WhatsApp dispatch note:', err));
      }

      // 5. Automatic 80mm Thermal Receipt Print (if toggle enabled)
      if (autoPrintThermal) {
        try {
          openPosThermalReceiptPrintWindow({
            invoiceNo: invoiceNum,
            date: new Date().toISOString(),
            customerName: customerNameForSlip,
            customerPhone: customerPhoneForSlip,
            cashierName: operatorName || currentUser?.name || currentUser?.username || 'Cashier 01',
            paymentMethod: effectivePaymentMode,
            items: cart.map(c => ({
              description: `${c.piece.brandName} ${c.piece.itemName}`,
              barcode: c.piece.barcode,
              unitPrice: c.sellingPrice,
              discount: c.discount,
              finalAmount: c.sellingPrice - c.discount,
              quantity: 1
            })),
            subTotal: subtotalAmt,
            discountAmount: discountTotal,
            vatAmount: vatAmt,
            totalAmount: totalAmt,
            tenderedAmount: Number(cashTendered) || totalAmt,
            changeDue: changeDue,
            companyName: activeProfile?.companyName,
            trn: activeProfile?.trn_number || activeProfile?.trnTaxNo,
            address: activeProfile?.address_line_1 || activeProfile?.addressLine1
          });
        } catch (e) {
          console.warn('[POS Checkout] Auto print thermal receipt note:', e);
        }
      }

      setCheckoutSuccessData({
        invoice: {
          id: posRecord?.id || invoiceNum,
          invoiceNo: invoiceNum,
          date: new Date().toISOString(),
          customerName: customerNameForSlip,
          customerPhone: customerPhoneForSlip,
          subTotal: subtotalAmt,
          discountAmount: discountTotal,
          vatAmount: vatAmt,
          totalAmount: totalAmt,
          paymentMethod: effectivePaymentMode,
          items: cart.map(c => ({
            barcode: c.piece.barcode,
            description: `${c.piece.brandName} ${c.piece.itemName}`,
            unitPrice: c.sellingPrice,
            discount: c.discount,
            finalAmount: c.sellingPrice - c.discount,
            weightKg: c.piece.weightKg || 0.45
          }))
        },
        voucher: { voucherNo: createdVoucherNo },
        cogsSummary: { totalCogs },
        pieces: safeCart.map(c => c.piece)
      });

      // Clear basket for next transaction
      setCart([]);
      setSelectedCustomer(null);
      setCustomerSearchQuery('');
      setCustomerInsights(null);
      setDiscountTotal(0);
      setIsGiftOrder(false);
      setGiftMessage('');
      setIncludeGiftBox(false);
      onRefreshAll?.();
      onSaleCompleted?.();
      loadInventoryAndParties();
    } catch (err: any) {
      console.error('[POS Terminal] Checkout failed, executing inventory rollback guard:', err);
      // Automatic Rollback Guard: ensure any piece in active basket is guaranteed IN_STOCK and NOT sold
      try {
        const safeCart = Array.isArray(cart) ? cart : [];
        const pieceItems = safeCart.map(c => ({ id: c?.piece?.id, barcode: c?.piece?.barcode }));
        await SalesService.revertSoldPieces(pieceItems);
      } catch (rollbackErr) {
        console.error('[POS Terminal] Rollback error:', rollbackErr);
      }
      alert(err.message || 'Network error executing POS checkout.');
    } finally {
      setIsScanning(false);
      setIsSubmitting(false);
    }
  };

  // Thermal 80mm POS Receipt Print
  const handlePrintThermalReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    try {
      openPosThermalReceiptPrintWindow({
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        customerName: inv.customerName || selectedCustomer?.name || 'Walk-In Customer',
        customerPhone: inv.customerPhone || selectedCustomer?.phone || '',
        cashierName: operatorName || currentUser?.name || currentUser?.username || 'Cashier 01',
        paymentMethod: inv.paymentMethod,
        items: (inv.items || []).map((it: any) => ({
          description: it.description,
          barcode: it.barcode,
          unitPrice: it.unitPrice,
          discount: it.discount,
          finalAmount: it.finalAmount,
          quantity: 1
        })),
        subTotal: inv.subTotal,
        discountAmount: inv.discountAmount,
        vatAmount: inv.vatAmount,
        totalAmount: inv.totalAmount,
        tenderedAmount: Number(cashTendered) || inv.totalAmount,
        changeDue: changeDue,
        companyName: activeProfile?.companyName,
        trn: activeProfile?.trn_number || activeProfile?.trnTaxNo,
        address: activeProfile?.address_line_1 || activeProfile?.addressLine1
      });
    } catch (e) {
      console.warn('[POS Checkout] Print thermal receipt error:', e);
    }
  };

  // WhatsApp Digital E-Receipt
  const handleSendWhatsAppReceipt = () => {
    if (!checkoutSuccessData) return;
    const inv = checkoutSuccessData.invoice;
    let phone = (inv.customerPhone || selectedCustomer?.phone || '').trim();
    if (!phone) {
      const input = prompt('Enter Customer WhatsApp Number (+971...)', '+971');
      if (!input) return;
      phone = input;
    }

    const url = buildWhatsAppReceiptUrl({
      phone,
      invoiceNo: inv.invoiceNo,
      date: new Date(inv.date).toLocaleString(),
      customerName: inv.customerName,
      paymentMethod: inv.paymentMethod,
      items: inv.items || [],
      subTotal: inv.subTotal,
      discountAmount: inv.discountAmount,
      vatAmount: inv.vatAmount,
      totalAmount: inv.totalAmount,
      companyName: activeProfile?.companyName,
      trn: activeProfile?.trn_number || activeProfile?.trnTaxNo,
      address: activeProfile?.address_line_1 || activeProfile?.addressLine1
    });

    window.open(url, '_blank');
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
    <div className={`flex flex-col min-h-screen space-y-3 p-2 sm:p-3 animate-in fade-in duration-200 ${
      posTheme === 'light' ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-white'
    }`}>
      {/* 1. TOP STATUS & CONTROLS HUD */}
      <div className={`border rounded-xl p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-colors ${
        posTheme === 'light'
          ? 'bg-white border-slate-200 text-slate-800 shadow-sm'
          : 'bg-slate-900 border-slate-800 text-white shadow-xl'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            posTheme === 'light'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-amber-500/20 text-amber-500 border-amber-500/40'
          }`}>
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                posTheme === 'light' ? 'text-slate-800' : 'text-white'
              }`}>
                Walk-In Counter Sale (POS)
              </h2>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-mono px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 font-bold">
                <Wifi className="w-3 h-3 animate-pulse" />
                {posConfig.terminalName} • ONLINE
              </span>
              {pendingOfflineCount > 0 && (
                <button
                  type="button"
                  onClick={() => offlineQueue.syncPendingSales()}
                  className="text-[10px] bg-amber-100 text-amber-900 font-mono px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1 font-bold animate-pulse hover:bg-amber-200 cursor-pointer"
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
                ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle Boutique Luxury Web Light / Dark Vault Mode"
          >
            {posTheme === 'light' ? <Moon className="w-3.5 h-3.5 text-slate-600" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            <span>{posTheme === 'light' ? '🌙 Dark Vault' : '☀️ Web Light'}</span>
          </button>

          {/* Parked Carts Button */}
          <button
            type="button"
            onClick={() => setShowParkedModal(true)}
            className={`relative px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
              posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
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
                ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                : posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Toggle Live Gross Margin / Profit HUD (Manager Only)"
          >
            {showManagerProfit ? <Eye className="w-3.5 h-3.5 text-amber-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span className="hidden sm:inline">Manager Margin</span>
          </button>

          {/* Hold / Park Current Cart */}
          <button
            type="button"
            onClick={handleParkActiveCart}
            disabled={cart.length === 0}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-40 ${
              posTheme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
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
                ? 'bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 border-slate-200'
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
          <div className={`border rounded-xl p-3 shadow-lg flex items-center gap-3 transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 shadow-slate-200/50'
              : 'bg-slate-900 border-indigo-500/50 shadow-lg'
          }`}>
            <div className={`p-2.5 rounded-xl shadow-sm ${
              posTheme === 'light'
                ? 'bg-slate-900 text-white'
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
                    ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-amber-600 focus:bg-white'
                    : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-400'
                }`}
              />

              <button
                type="submit"
                disabled={!barcodeInput.trim()}
                className={`text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 cursor-pointer shadow-sm ${
                  posTheme === 'light'
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40'
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
          <div className={`border rounded-xl flex-1 p-3.5 overflow-hidden flex flex-col transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 shadow-lg'
              : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b text-xs font-bold uppercase tracking-wider ${
              posTheme === 'light' ? 'border-slate-100 text-slate-500' : 'border-slate-800 text-slate-400'
            }`}>
              <span>Scanned Basket ({cart.length} Pieces)</span>
              <span className={`font-mono ${posTheme === 'light' ? 'text-slate-800 font-bold' : 'text-indigo-400'}`}>{totalWeightGrams}g Total Net Weight</span>
            </div>

            <div className={`flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 max-h-[520px] ${
              posTheme === 'light' ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800/60'
            }`}>
              {cart.length === 0 ? (
                <div className={`h-64 flex flex-col items-center justify-center space-y-2 select-none ${
                  posTheme === 'light' ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <div className={`w-16 h-16 rounded-full border flex items-center justify-center ${
                    posTheme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-400'
                      : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}>
                    <Barcode className="w-8 h-8" />
                  </div>
                  <p className={`text-sm font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-slate-400'}`}>Basket is Empty</p>
                  <p className={`text-xs max-w-xs text-center ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-600'}`}>
                    Point your USB or Bluetooth barcode gun at any garment tag to instantly add it to this counter checkout.
                  </p>
                </div>
              ) : (
                (cart || []).map((item, idx) => (
                  <div
                    key={`${item.piece.barcode}-${idx}`}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50/80 hover:bg-slate-100/90 border-slate-200 shadow-xs'
                        : 'bg-slate-950/60 hover:bg-slate-950 border-transparent hover:border-slate-800'
                    }`}
                  >
                    {/* Item Front Photo + Details */}
                    <div className="flex items-center gap-3">
                      {/* Photo Thumbnail */}
                      <div
                        onClick={() => item.piece.frontImageUrl && setPreviewPhoto(item.piece.frontImageUrl)}
                        className={`w-12 h-12 rounded-lg border overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition ${
                          posTheme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        {item.piece.frontImageUrl ? (
                          <img src={item.piece.frontImageUrl} alt="Front" className="w-full h-full object-cover" />
                        ) : (
                          <span className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>No Pic</span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-xs sm:text-sm ${
                            posTheme === 'light' ? 'text-slate-900' : 'text-white'
                          }`}>
                            {item.piece.brandName} {item.piece.itemName}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-200">
                            {item.piece.sizeScanned || 'M'}
                          </span>
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                            {item.piece.labelGrade || 'Grade A'}
                          </span>
                        </div>
                        <div className={`flex items-center gap-2 text-[10px] font-mono ${
                          posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'
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
                            ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-sm font-black'
                            : posTheme === 'light'
                              ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:text-slate-800'
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
                            <div className={`text-[9px] line-through font-mono ${posTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                              AED {(item.originalPrice ?? 0).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm sm:text-base font-black font-mono ${
                              posTheme === 'light' ? 'text-slate-900' : 'text-emerald-400'
                            }`}>
                              AED {item.sellingPrice.toFixed(2)}
                            </div>
                            <div className={`text-[9px] ${posTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>VAT Incl.</div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          posTheme === 'light'
                            ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
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
          {/* CUSTOMER / VIP KHATA SELECTOR WITH AI SCANNER & QUICK INSIGHTS */}
          <div
            ref={customerDropdownRef}
            className={`border rounded-xl p-3.5 space-y-2.5 transition-colors relative ${
              posTheme === 'light'
                ? 'bg-white border-slate-200 text-slate-800 shadow-lg'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold ${
              posTheme === 'light' ? 'text-slate-800' : 'text-slate-300'
            }`}>
              <span className="flex items-center gap-1.5">
                <span>Customer / CRM Khata:</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAiCardModal(true);
                    setCardImagePreview(null);
                    setCardScannerError(null);
                    setCardFormData({ name: '', phone: '', email: '', company: '', address: '' });
                  }}
                  className={`px-2.5 py-1 border rounded-lg text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer ${
                    posTheme === 'light'
                      ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
                  }`}
                  title="Scan Business / Visiting Card with Gemini AI Vision"
                >
                  <Camera className={`w-3.5 h-3.5 ${posTheme === 'light' ? 'text-indigo-600' : 'text-amber-400'}`} />
                  <Sparkles className={`w-3 h-3 ${posTheme === 'light' ? 'text-indigo-500' : 'text-amber-500'}`} />
                  <span>Scan Card (AI)</span>
                </button>

                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearchQuery('');
                      setCustomerInsights(null);
                    }}
                    className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                  >
                    Clear (Walk-In)
                  </button>
                )}
              </div>
            </div>

            {selectedCustomer ? (
              /* SELECTED CUSTOMER CARD & QUICK INSIGHTS */
              <div className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                posTheme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-slate-800/80 border-amber-500/30 text-white'
              }`}>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black truncate">
                      ⭐ {selectedCustomer.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold border ${
                      posTheme === 'light'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {(selectedCustomer as any).party_type === 'RETAIL_CUSTOMER' ? 'RETAIL' : 'VIP CLIENT'}
                    </span>
                    {selectedCustomer.code && (
                      <span className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-slate-400' : 'text-stone-400'}`}>({selectedCustomer.code})</span>
                    )}
                  </div>

                  <div className={`text-[11px] flex items-center gap-3 flex-wrap ${
                    posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {selectedCustomer.phone && (
                      <span className="font-mono">📞 {selectedCustomer.phone}</span>
                    )}
                    {((selectedCustomer as any).company_name || (selectedCustomer as any).company) && (
                      <span className="truncate">🏢 {(selectedCustomer as any).company_name || (selectedCustomer as any).company}</span>
                    )}
                  </div>

                  {/* QUICK INSIGHTS BADGE */}
                  <div className="pt-0.5">
                    {loadingCustomerInsights ? (
                      <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                        <span>Fetching CRM purchase history...</span>
                      </div>
                    ) : customerInsights ? (
                      <div className={`inline-flex items-center gap-2 text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono ${
                        posTheme === 'light'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}>
                        <span>💎 Total Spent: AED {customerInsights.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span>•</span>
                        <span>{customerInsights.totalInvoices} Orders</span>
                      </div>
                    ) : (
                      <div className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-slate-400' : 'text-stone-500'}`}>Control Khata: 1130-05 (Walk In Customer)</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearchQuery('');
                    setCustomerInsights(null);
                    setIsCustomerDropdownOpen(true);
                  }}
                  className={`p-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                    posTheme === 'light'
                      ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                  title="Change Customer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* SMART SEARCHABLE CUSTOMER COMBOBOX */
              <div className="relative">
                <div className="relative flex items-center">
                  <Search className={`w-3.5 h-3.5 absolute left-3 pointer-events-none ${
                    posTheme === 'light' ? 'text-slate-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={e => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="Search customer (Name, Phone +971, Company)..."
                    className={`w-full border rounded-xl pl-9 pr-8 py-2 text-xs font-medium focus:outline-hidden transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-400'
                    }`}
                  />
                  <ChevronDown
                    onClick={() => setIsCustomerDropdownOpen(prev => !prev)}
                    className={`w-4 h-4 absolute right-2.5 cursor-pointer ${
                      posTheme === 'light' ? 'text-slate-400' : 'text-stone-400'
                    }`}
                  />
                </div>

                {/* Dropdown Menu Popover */}
                {isCustomerDropdownOpen && (
                  <div className={`absolute top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl border shadow-xl z-30 space-y-0.5 p-1 ${
                    posTheme === 'light'
                      ? 'bg-white border-slate-200 text-slate-800 divide-y divide-slate-100'
                      : 'bg-slate-950 border-slate-700 text-white divide-y divide-slate-800'
                  }`}>
                    {/* Default Option: Standard Walk-In */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearchQuery('');
                        setCustomerInsights(null);
                        setIsCustomerDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                        !selectedCustomer
                          ? posTheme === 'light'
                            ? 'bg-slate-100 text-slate-900 border-l-4 border-l-emerald-600'
                            : 'bg-slate-800 text-white border-l-4 border-l-amber-400'
                          : posTheme === 'light'
                          ? 'hover:bg-slate-50 text-slate-800'
                          : 'hover:bg-slate-900 text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm">👤</span>
                        <span className={posTheme === 'light' ? 'text-slate-900 font-bold' : 'text-white font-bold'}>
                          Standard Walk-In Retail Customer
                        </span>
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        posTheme === 'light' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                      }`}>
                        1130-05
                      </span>
                    </button>

                    {filteredParties.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400 space-y-1">
                        <div>No customers match "{customerSearchQuery}"</div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAiCardModal(true);
                            setCardImagePreview(null);
                            setCardScannerError(null);
                            setCardFormData({
                              name: customerSearchQuery,
                              phone: '',
                              email: '',
                              company: '',
                              address: ''
                            });
                            setIsCustomerDropdownOpen(false);
                          }}
                          className={`text-xs font-bold hover:underline cursor-pointer ${
                            posTheme === 'light' ? 'text-indigo-600 font-bold' : 'text-amber-400 font-bold'
                          }`}
                        >
                          + Quick Add or Scan Visiting Card
                        </button>
                      </div>
                    ) : (
                      filteredParties.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(p);
                            setCustomerSearchQuery('');
                            setIsCustomerDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                            posTheme === 'light'
                              ? 'hover:bg-slate-50 text-slate-800 border-b border-slate-100 last:border-b-0'
                              : 'hover:bg-slate-900 text-white border-b border-slate-900 last:border-b-0'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className={`font-bold text-xs truncate ${
                              posTheme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}>
                              ⭐ {p.name} {((p as any).company_name && (p as any).company_name !== p.name) ? `(${(p as any).company_name})` : ''}
                            </div>
                            <div className={`text-[11px] font-mono mt-0.5 flex items-center gap-2 ${
                              posTheme === 'light' ? 'text-slate-500' : 'text-slate-300'
                            }`}>
                              {p.phone ? <span>📞 {p.phone}</span> : <span className="opacity-60">No phone</span>}
                              {p.code ? <span>• {p.code}</span> : null}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold shrink-0 border ${
                            posTheme === 'light'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                          }`}>
                            {(p as any).party_type === 'RETAIL_CUSTOMER' ? 'RETAIL' : 'VIP'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* GIFT ORDER & LUXURY PACKAGING CARD */}
          <div className={`border rounded-xl p-3.5 space-y-2.5 transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800 shadow-lg'
              : 'bg-slate-900 border-amber-500/30 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isGiftOrder}
                  onChange={(e) => setIsGiftOrder(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span className={`flex items-center gap-1.5 ${posTheme === 'light' ? 'text-slate-800' : 'text-amber-300'}`}>
                  <Gift className={`w-4 h-4 ${posTheme === 'light' ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span>Mark as Gift Order</span>
                </span>
              </label>

              {isGiftOrder && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  posTheme === 'light'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                }`}>
                  Gift Slip Ready
                </span>
              )}
            </div>

            {isGiftOrder && (
              <div className={`space-y-2.5 pt-2 border-t animate-in fade-in ${
                posTheme === 'light' ? 'border-slate-100' : 'border-slate-800'
              }`}>
                <div>
                  <label className={`text-[10px] font-bold block mb-1 ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                    Recipient Dedication / Gift Note (Printed on Gift Slip):
                  </label>
                  <input
                    type="text"
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    placeholder="e.g. For Sarah - Happy Birthday! From Alex"
                    className={`w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none font-medium ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-emerald-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                    }`}
                  />
                </div>

                <label className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer select-none transition ${
                  includeGiftBox
                    ? posTheme === 'light'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-amber-400 bg-amber-100/60 dark:bg-amber-950/40'
                    : posTheme === 'light'
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-slate-950/60'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeGiftBox}
                      onChange={(e) => setIncludeGiftBox(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-xs font-semibold">Luxury Boutique Gift Box & Ribbon</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${
                    posTheme === 'light' ? 'text-emerald-700' : 'text-amber-300'
                  }`}>+AED 15.00</span>
                </label>
              </div>
            )}
          </div>

          {/* FINANCIAL SUMMARY TOTALS CARD */}
          <div className={`border rounded-xl p-4 shadow-lg space-y-3 transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider pb-2 border-b ${
              posTheme === 'light' ? 'text-slate-500 border-slate-100' : 'text-slate-400 border-slate-800'
            }`}>
              Basket Summary & Taxes
            </h3>

            <div className="space-y-2 text-xs">
              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-300'}`}>
                <span>Total Items</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>{cart.length} Pieces</span>
              </div>

              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-300'}`}>
                <span>Subtotal (Net)</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>AED {subTotal.toFixed(2)}</span>
              </div>

              {discountTotal > 0 && (
                <div className="flex justify-between text-rose-500 font-semibold">
                  <span>Discount Applied</span>
                  <span className="font-mono font-bold">-AED {discountTotal.toFixed(2)}</span>
                </div>
              )}

              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-300'}`}>
                <span>UAE VAT (5.0%)</span>
                <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-indigo-300'}`}>AED {vatAmount.toFixed(2)}</span>
              </div>

              {giftBoxFee > 0 && (
                <div className={`flex justify-between font-semibold ${posTheme === 'light' ? 'text-emerald-700' : 'text-amber-400'}`}>
                  <span className="flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" />
                    <span>Luxury Gift Box</span>
                  </span>
                  <span className="font-mono font-bold">+AED {giftBoxFee.toFixed(2)}</span>
                </div>
              )}

              <div className={`pt-2 border-t flex justify-between items-baseline ${
                posTheme === 'light'
                  ? 'border-emerald-200 bg-emerald-50/80 p-3 rounded-xl border'
                  : 'border-slate-800'
              }`}>
                <span className={`text-sm font-black uppercase ${
                  posTheme === 'light' ? 'text-emerald-950' : 'text-amber-300'
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
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              }`}>
                <div className="flex justify-between font-semibold">
                  <span>Cumulative COGS Cost:</span>
                  <span className="font-mono font-bold">AED {totalCogs.toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold text-xs pt-1 border-t ${
                  posTheme === 'light' ? 'border-slate-200 text-emerald-700' : 'border-amber-500/20 text-emerald-300'
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
                className={`w-full py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
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
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold text-lg uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <span>Collect Payment (AED {grandTotal.toFixed(2)})</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* HARDWARE STATUS POD */}
          <div className={`border rounded-xl p-3.5 space-y-2 transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800 shadow-lg'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between text-[11px] ${
              posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              <span className="flex items-center gap-1.5 font-bold">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>Connected Payment Machine:</span>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">PAX / Sunmi P2</span>
            </div>
            <p className={`text-[10px] ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-500'}`}>
              Terminal: {posConfig.terminalId} • Ready to receive NFC Apple Pay & Contactless Card taps.
            </p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-MODE PAYMENT POPUP MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 animate-in fade-in duration-200">
          <div className={`border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            {/* MODAL HEADER */}
            <div className={`p-4 border-b flex items-center justify-between ${
              posTheme === 'light'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <div>
                <h3 className={`text-base font-black uppercase tracking-wider ${
                  posTheme === 'light' ? 'text-slate-800' : 'text-white'
                }`}>
                  Select Payment Method
                </h3>
                <p className={`text-xs ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Total Due: <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm">AED {grandTotal.toFixed(2)}</span> (VAT Included)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className={`p-1.5 rounded-lg cursor-pointer transition ${
                  posTheme === 'light'
                    ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PAYMENT TABS: CASH vs CARD vs BANK QR vs SPLIT */}
            <div className={`grid grid-cols-4 p-2 gap-1.5 border-b ${
              posTheme === 'light'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900/70 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setPaymentMode('CASH')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMode === 'CASH'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : posTheme === 'light'
                    ? 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
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
                    ? 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
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
                    ? 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
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
                    ? 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
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
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}>
                  <Gift className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>🎁 <strong>100% Free Complimentary Giveaway:</strong> Customer payment is AED 0.00. Clicking &apos;Confirm Complimentary Giveaway&apos; below will mark the barcode as sold/gifted and relieve inventory stock.</span>
                </div>
              )}

              {/* OPTION 1: CASH PAYMENT */}
              {paymentMode === 'CASH' && (
                <div className="space-y-3">
                  <div className={`flex items-center justify-between text-xs ${
                    posTheme === 'light' ? 'text-slate-600' : 'text-slate-300'
                  }`}>
                    <span>Quick Currency Note Buttons:</span>
                    <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-amber-300'}`}>Grand Total: AED {grandTotal.toFixed(2)}</span>
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
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-emerald-500 text-slate-800 shadow-xs'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-emerald-500 text-white'
                        }`}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>

                  {/* Tendered Input & Change Box */}
                  <div className="space-y-1">
                    <label className={`text-xs font-semibold ${posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                      Cash Tendered by Customer (AED):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={cashTendered}
                      onChange={e => setCashTendered(e.target.value)}
                      className={`w-full border-2 rounded-xl p-3 text-xl font-mono font-bold focus:outline-hidden transition ${
                        posTheme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600 focus:bg-white'
                          : 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-white'
                      }`}
                    />
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    posTheme === 'light'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
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
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto ${
                    posTheme === 'light'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                      : 'bg-indigo-950 border-indigo-500/60 text-indigo-400'
                  }`}>
                    <CreditCard className="w-8 h-8 animate-pulse" />
                  </div>

                  <div>
                    <h4 className={`text-sm font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                      Linked Terminal: {posConfig.terminalName}
                    </h4>
                    <p className={`text-xs ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                      Terminal ID: <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-indigo-600' : 'text-indigo-300'}`}>{posConfig.terminalId}</span> • IP: <span className="font-mono">{posConfig.ipAddress || '192.168.1.150'}</span>
                    </p>
                  </div>

                  {posMachineStage === 'AWAITING_TAP' && (
                    <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                      posTheme === 'light'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                    }`}>
                      <Radio className="w-4 h-4 animate-ping text-indigo-500" />
                      <span>Transmitting AED {grandTotal.toFixed(2)} to POS Machine ({posConfig.ipAddress || '192.168.1.150'})... Customer Tap Card / Apple Pay now.</span>
                    </div>
                  )}

                  {posMachineStage === 'APPROVED' && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold space-y-1 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-1.5 font-black text-sm text-emerald-700">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>PAYMENT APPROVED ON MACHINE!</span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-600">
                        Card: {posCardBrand} • Auth: {posAuthCode} • Account: {posConfig.clearingAccountId}
                      </p>
                    </div>
                  )}

                  {posMachineStage === 'FAILED' && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold space-y-1.5 animate-in zoom-in-95 text-left">
                      <div className="flex items-center gap-1.5 font-black text-sm text-rose-700">
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>HARDWARE CONNECTION ERROR</span>
                      </div>
                      <p className="text-[12px] font-mono text-rose-700">
                        {posErrorMessage || `Connection Failed: POS Machine not found at IP ${posConfig.ipAddress || '192.168.1.150'}. Please check network or use Manual Entry.`}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleInitiatePosMachineTap}
                      disabled={posMachineStage === 'AWAITING_TAP'}
                      className="w-full max-w-sm px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      {posMachineStage === 'AWAITING_TAP' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Connecting to Terminal ({posConfig.ipAddress || '192.168.1.150'})...</span>
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4" />
                          <span>Send to Machine</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleConfirmFinalCheckout('CARD_MANUAL')}
                      disabled={isScanning}
                      className="w-full max-w-sm px-4 py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                    >
                      <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Manual Card Entry (External Terminal)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* OPTION 3: BANK QR / INSTANT WALLET */}
              {paymentMode === 'BANK_QR' && (
                <div className="space-y-3 text-center py-2">
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-emerald-500 inline-block">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=iban%3A${activeProfile?.bankIban || 'AE240331234567890123456'}%26amount%3D${grandTotal}%26title%3DVINTAGE%20VIBES`}
                        alt="Bank QR Code"
                        className="w-40 h-40 object-contain"
                      />
                    </div>
                  </div>

                  <div>
                    <div className={`text-sm font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>{activeProfile?.bankName || 'Emirates NBD Bank'}</div>
                    <div className={`text-xs font-mono font-bold ${posTheme === 'light' ? 'text-emerald-700' : 'text-amber-300'}`}>{activeProfile?.bankIban || 'AE24 0331 2345 6789 0123 456'}</div>
                    <div className={`text-[11px] mt-0.5 ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Customer scans with any UAE mobile banking app for instant deposit</div>
                  </div>
                </div>
              )}

              {/* OPTION 4: SPLIT PAYMENT (CASH + CARD + QR) */}
              {paymentMode === 'SPLIT' && (
                <div className="space-y-3">
                  <div className={`flex items-center justify-between text-xs pb-2 border-b ${
                    posTheme === 'light' ? 'text-slate-600 border-slate-100' : 'text-slate-300 border-slate-800'
                  }`}>
                    <span>Split Payment Breakdown:</span>
                    <span className={`font-mono font-black ${posTheme === 'light' ? 'text-slate-800' : 'text-amber-300'}`}>Total Due: AED {grandTotal.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>💵 Cash Part (AED):</label>
                      <input
                        type="number"
                        value={splitCash}
                        onChange={e => setSplitCash(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>💳 Card/POS Part (AED):</label>
                      <input
                        type="number"
                        value={splitCard}
                        onChange={e => setSplitCard(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>📱 QR Part (AED):</label>
                      <input
                        type="number"
                        value={splitQr}
                        onChange={e => setSplitQr(e.target.value)}
                        className={`w-full border rounded-lg p-2 text-xs font-mono transition ${
                          posTheme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* POS OUTPUT CONTROLS: THERMAL PRINT TOGGLE & AUTO-WHATSAPP NOTICE */}
              <div className={`p-3 rounded-xl border space-y-2 mt-3 ${
                posTheme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoPrintThermal}
                      onChange={e => setAutoPrintThermal(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <span className={posTheme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-200 font-bold'}>
                      🖨️ Auto-Print 80mm Thermal Receipt (Slip)
                    </span>
                  </label>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                    autoPrintThermal
                      ? (posTheme === 'light' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800')
                      : (posTheme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400')
                  }`}>
                    {autoPrintThermal ? 'Print Enabled' : 'Paperless Mode'}
                  </span>
                </div>

                <div className={`text-[11px] flex items-center justify-between pt-1 border-t ${
                  posTheme === 'light' ? 'border-slate-200/80 text-slate-500' : 'border-slate-800 text-slate-400'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${selectedCustomer?.phone ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                    <span>📱 Marketing WhatsApp Slip:</span>
                  </span>
                  <span className={`font-mono font-bold ${selectedCustomer?.phone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {selectedCustomer?.phone ? `Auto-Send to ${selectedCustomer.phone}` : 'No phone linked (Slip skipped)'}
                  </span>
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className={`p-3.5 border-t flex items-center justify-between ${
              posTheme === 'light'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Back to Basket
              </button>

              <button
                type="button"
                onClick={() => handleConfirmFinalCheckout()}
                disabled={
                  isScanning ||
                  isSubmitting ||
                  (grandTotal > 0 && paymentMode === 'CASH' && Number(cashTendered) < grandTotal) ||
                  (paymentMode === 'CARD_POS' && posMachineStage !== 'APPROVED')
                }
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition active:scale-95 cursor-pointer"
              >
                {isScanning || isSubmitting ? (
                  <span>Posting COGS & Inventory Relief...</span>
                ) : grandTotal === 0 ? (
                  <>
                    <Gift className="w-4 h-4 text-amber-300" />
                    <span>Confirm Complimentary Giveaway (AED 0.00)</span>
                  </>
                ) : paymentMode === 'CARD_POS' && posMachineStage !== 'APPROVED' ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-300" />
                    <span>{posMachineStage === 'FAILED' ? 'Hardware Offline (Use Manual Entry)' : 'Waiting for Machine Approval...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{autoPrintThermal ? 'Confirm Sale & Print Slip (↵)' : 'Confirm Sale (Paperless) (↵)'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. POST-CHECKOUT SUCCESS MODAL */}
      {checkoutSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 animate-in zoom-in-95 duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 text-center space-y-4 border ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-950 border-emerald-500/50 text-white'
          }`}>
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto shadow-xl ${
              posTheme === 'light'
                ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-emerald-500/10'
                : 'bg-emerald-950/80 border-emerald-400 text-emerald-400 shadow-emerald-500/20'
            }`}>
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className={`text-lg font-black uppercase tracking-wider ${
                posTheme === 'light' ? 'text-slate-800' : 'text-white'
              }`}>
                Transaction Successful!
              </h3>
              <p className={`text-xs ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Invoice No: <span className={`font-mono font-bold ${posTheme === 'light' ? 'text-indigo-600' : 'text-amber-300'}`}>{checkoutSuccessData.invoice.invoiceNo}</span>
              </p>
            </div>

            {/* Summary Box */}
            <div className={`rounded-xl p-3 text-left text-xs space-y-1.5 font-mono border ${
              posTheme === 'light'
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}>
              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>Items Sold:</span>
                <span className={`font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>{checkoutSuccessData.pieces.length} Garments</span>
              </div>
              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>Total Collected:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">AED {checkoutSuccessData.invoice.totalAmount}</span>
              </div>
              <div className={`flex justify-between ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>Total COGS Deducted:</span>
                <span className="text-rose-500 dark:text-rose-400 font-bold">AED {checkoutSuccessData.cogsSummary.totalCogsAed}</span>
              </div>
              <div className={`flex justify-between pt-1 border-t ${
                posTheme === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
              }`}>
                <span>Net Gross Margin:</span>
                <span className="text-emerald-700 dark:text-amber-300 font-bold">
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
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>Thermal Bill (80mm)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppReceipt}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                  title="Send digital receipt via WhatsApp"
                >
                  <Send className="w-4 h-4" />
                  <span className="truncate">
                    {checkoutSuccessData.invoice.customerPhone
                      ? `WhatsApp (${checkoutSuccessData.invoice.customerPhone})`
                      : '📱 Send WhatsApp Receipt'}
                  </span>
                </button>
              </div>

              {/* Gift Receipt Options (No Prices on Bill) */}
              <div className={`grid grid-cols-2 gap-2 pt-1 border-t ${
                posTheme === 'light' ? 'border-slate-100' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={handlePrintGiftReceipt}
                  className={`py-2.5 px-3 border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                    posTheme === 'light'
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                  }`}
                  title="Print Thermal 80mm Gift Receipt (Prices Hidden with Exchange Policy)"
                >
                  <Gift className="w-4 h-4 text-amber-600" />
                  <span>Gift Slip (No Price)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppGiftReceipt}
                  className={`py-2.5 px-3 border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                    posTheme === 'light'
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/30'
                  }`}
                  title="Send WhatsApp Gift Slip with 14-day exchange notice"
                >
                  <Gift className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Gift Slip</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCheckoutSuccessData(null);
                  setTimeout(() => barcodeInputRef.current?.focus(), 50);
                }}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition cursor-pointer mt-1 ${
                  posTheme === 'light'
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                [ Start Next Sale (↵) ]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PARKED CARTS MODAL */}
      {showParkedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 animate-in fade-in">
          <div className={`border w-full max-w-lg rounded-2xl p-4 space-y-3 shadow-2xl ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b ${
              posTheme === 'light' ? 'border-slate-100' : 'border-slate-800'
            }`}>
              <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                posTheme === 'light' ? 'text-slate-800' : 'text-amber-300'
              }`}>
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Parked / Held Customer Carts</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowParkedModal(false)}
                className={`cursor-pointer transition ${
                  posTheme === 'light' ? 'text-slate-400 hover:text-slate-800' : 'text-slate-400 hover:text-white'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {parkedSales.length === 0 ? (
                <div className={`p-6 text-center text-xs ${posTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                  No parked carts right now. Use "Hold Cart" when a customer steps away.
                </div>
              ) : (
                (parkedSales || []).map(park => (
                  <div
                    key={park.id}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-bold ${posTheme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                        {park.customerName || 'Walk-In Customer'} ({(park?.items || []).length} garments)
                      </div>
                      <div className={`text-[10px] font-mono ${posTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Held at {park.timestamp}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResumeParkedSale(park)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 animate-in fade-in">
          <div className={`border w-full max-w-sm rounded-2xl p-4 space-y-3 shadow-2xl ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b ${
              posTheme === 'light' ? 'border-slate-100' : 'border-slate-800'
            }`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${
                posTheme === 'light' ? 'text-slate-800' : 'text-amber-300'
              }`}>
                Apply Promo / Manager Discount
              </h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className={`cursor-pointer transition ${
                  posTheme === 'light' ? 'text-slate-400 hover:text-slate-800' : 'text-slate-400 hover:text-white'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className={`text-xs ${posTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>Discount Amount (AED):</label>
              <input
                type="number"
                step="1"
                value={tempDiscountVal}
                onChange={e => setTempDiscountVal(e.target.value)}
                className={`w-full border rounded-xl p-2.5 text-sm font-mono transition ${
                  posTheme === 'light'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white'
                    : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDiscountTotal(0);
                  setShowDiscountModal(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Clear Discount
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscountTotal(Number(tempDiscountVal) || 0);
                  setShowDiscountModal(false);
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Apply (AED {tempDiscountVal})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. AI VISITING CARD SCANNER MODAL (GEMINI VISION) */}
      {showAiCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 animate-in fade-in">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto ${
            posTheme === 'light'
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-indigo-900 dark:text-indigo-300">
                    <span>AI Visiting Card Scanner</span>
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Instant OCR & CRM Contact Auto-Extraction powered by Gemini AI
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAiCardModal(false);
                  setCardImagePreview(null);
                  setCardScannerError(null);
                }}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {cardScannerError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cardScannerError}</span>
              </div>
            )}

            {/* Upload Zone */}
            <input
              type="file"
              ref={cardFileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleCardFileSelected}
              className="hidden"
            />

            {!cardImagePreview ? (
              <div
                onClick={() => cardFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                  posTheme === 'light'
                    ? 'border-indigo-300 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50'
                    : 'border-slate-700 bg-slate-900/60 hover:bg-slate-900 text-slate-200'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-2">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  📸 Click to Capture or Upload Visiting Card Photo
                </div>
                <div className="text-[11px] text-indigo-600/70 dark:text-slate-400 mt-1">
                  Supports JPG, PNG, WEBP (Camera capture enabled)
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden border border-amber-300/60 max-h-48 bg-black/40 flex items-center justify-center">
                  <img src={cardImagePreview} alt="Visiting Card" className="max-h-48 w-auto object-contain" />
                  <button
                    type="button"
                    onClick={() => cardFileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/80 hover:bg-black text-white text-[11px] font-bold rounded-lg shadow-md flex items-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Retake / Change</span>
                  </button>
                </div>

                {isAnalyzingCard && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300 font-mono animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Gemini AI is parsing business card details...</span>
                  </div>
                )}
              </div>
            )}

            {/* Quick Auto-filled Form Fields */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider block mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={cardFormData.name}
                    onChange={e => setCardFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. John Doe"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider block mb-1">
                    Mobile / WhatsApp (+971...)
                  </label>
                  <input
                    type="text"
                    value={cardFormData.phone}
                    onChange={e => setCardFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. +971 50 123 4567"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-mono font-semibold focus:outline-hidden transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={cardFormData.email}
                    onChange={e => setCardFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="e.g. client@company.com"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider block mb-1">
                    Company / Organization
                  </label>
                  <input
                    type="text"
                    value={cardFormData.company}
                    onChange={e => setCardFormData(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="e.g. Vintage Vault LLC"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden transition ${
                      posTheme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider block mb-1">
                  Address / City (Optional)
                </label>
                <input
                  type="text"
                  value={cardFormData.address}
                  onChange={e => setCardFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="e.g. Downtown Dubai / Al Ain"
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden transition ${
                    posTheme === 'light'
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-400'
                  }`}
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                <div className="font-bold flex items-center gap-1">
                  <span>🛡️ CRM Isolation Active</span>
                </div>
                <div className="text-[10px] opacity-90">
                  Customer will be saved as <code className="font-mono font-bold">RETAIL_CUSTOMER</code> linked strictly to Control Khata <code className="font-mono font-bold">1130-05</code>. Zero Chart of Accounts bloat!
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAiCardModal(false);
                  setCardImagePreview(null);
                  setCardScannerError(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  posTheme === 'light'
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveCardCustomer}
                disabled={isSavingCardCustomer || !cardFormData.name.trim()}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-amber-600/20"
              >
                {isSavingCardCustomer ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to CRM...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Save Customer & Select for Sale</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

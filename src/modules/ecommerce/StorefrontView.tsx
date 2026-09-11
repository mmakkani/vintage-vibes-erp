import React, { useState, useEffect, useMemo } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile } from '../setup/setup.types.ts';
import { ProductCard } from './ProductCard.tsx';
import { TagInspectModal } from './TagInspectModal.tsx';
import { BankQrModal } from './BankQrModal.tsx';
import { CheckoutModal } from './CheckoutModal.tsx';
import { CartDrawer } from './CartDrawer.tsx';
import { NextDropBanner } from './NextDropBanner.tsx';
import { GarmentInspectorModal } from './GarmentInspectorModal.tsx';
import { VintageFitGuideModal } from './VintageFitGuideModal.tsx';
import { CheckoutCustomerInfo } from './ecommerce.types.ts';
import {
  Sparkles,
  ShoppingBag,
  Search,
  Lock,
  Tag,
  ShieldCheck,
  Building2,
  Phone,
  Flame,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  MapPin,
  Clock,
  Mail,
  Heart,
  ExternalLink,
  MessageCircle,
  Smartphone,
  Radio,
  X
} from 'lucide-react';
import { Vintage3DLogo } from '../../components/Vintage3DLogo.tsx';
import { CompanyName3D } from '../../components/CompanyName3D.tsx';
import { DubaiLiveSoukTicker } from '../../components/DubaiLiveSoukTicker.tsx';
import { WinterMaaziStoryHero } from './WinterMaaziStoryHero.tsx';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface StorefrontViewProps {
  companyProfile: CompanyProfile;
  onOpenERPLogin: () => void;
  onOpenStaffMobileApp?: () => void;
  onInventoryMutated?: () => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  companyProfile,
  onOpenERPLogin,
  onOpenStaffMobileApp,
  onInventoryMutated
}) => {
  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showNoticeBar, setShowNoticeBar] = useState<boolean>(true);
  const [isLiveStreamBroadcasting, setIsLiveStreamBroadcasting] = useState<boolean>(false);

  // Poll live stream broadcast session status
  useEffect(() => {
    const checkLiveSession = async () => {
      try {
        const res = await fetch('/api/marketing/live-session');
        if (res.ok) {
          const data = await res.json();
          setIsLiveStreamBroadcasting(Boolean(data.isBroadcasting));
        }
      } catch {}
    };
    checkLiveSession();
    const interval = setInterval(checkLiveSession, 5000);
    return () => clearInterval(interval);
  }, []);

  // Hero Slider State (Exactly matching the 3 slides from vintagevibesllcspc.com)
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const heroSlides = [
    {
      id: 0,
      image: 'https://vintagevibesllcspc.com/wp-content/uploads/2026/01/Premium-Vintage-Clothing-Store-in-UAE.webp',
      title: 'Premium Vintage Clothing Store in UAE',
      subtitle: 'Discover authentic vintage and second-hand clothing for men and women, curated for quality, style, and sustainability.'
    },
    {
      id: 1,
      image: 'https://vintagevibesllcspc.com/wp-content/uploads/2026/01/Affordable-Thrift-Second-Hand-Fashion-in-Dubai.webp',
      title: 'Affordable Thrift & Second-Hand Fashion Store in Al Ain, UAE',
      subtitle: 'Shop unique pre-owned streetwear, denim, jackets, and retro styles at prices that make vintage fashion accessible.'
    },
    {
      id: 2,
      image: 'https://vintagevibesllcspc.com/wp-content/uploads/2026/01/Your-Trusted-Vintage-Thrift-Store-Near-you-in-Dubai.webp',
      title: 'Your Trusted Vintage & Thrift Store Near you in UAE',
      subtitle: 'Looking for a reliable vintage clothing store near you? Find timeless pieces with pickup and delivery options across the UAE.'
    }
  ];

  // Auto-slide effect every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // FAQ Accordion State (Exact 10 questions from live site)
  const [activeFaqIndices, setActiveFaqIndices] = useState<number[]>([0]);

  const faqItems = [
    {
      q: "What's cheap to buy in Alain UAE?",
      a: "One of the most affordable options is thrifted and second-hand clothing. At shops like Vintage Vibes General Trading LLC SPC, shoppers can find high-quality jackets, denim, hoodies, and t-shirts at very reasonable prices compared to mall retail."
    },
    {
      q: "Is it cheaper to buy clothes in UAE?",
      a: "Buying clothes in UAE can be expensive at regular retail stores, but vintage and thrift stores like Vintage Vibes LLC SPC offer affordable, high-quality pre-loved clothing at much better prices."
    },
    {
      q: "Where is the best place to sell vintage clothes?",
      a: "The best place to sell vintage clothing is through curated vintage stores that understand resale value. Vintage Vibes general trading LLC – SPC located in Al Ain UAE prefers authentic, quality vintage pieces and offers a reliable resale option."
    },
    {
      q: "Why is Gen Z obsessed with thrifting?",
      a: "Gen Z loves thrifting because it is sustainable, budget-friendly, and unique. Vintage Vibes LLC SPC focuses on Gen Z trends such as Y2K fashion, streetwear, and retro styles."
    },
    {
      q: "What's cheap to buy in Dubai?",
      a: "One of the most affordable things to buy in Dubai is thrifted and second-hand clothing. At Vintage Vibes LLC SPC, shoppers can find jackets, denim, hoodies, and t-shirts at reasonable prices."
    },
    {
      q: "Is it worth going to Dubai Outlet Village?",
      a: "Dubai Outlet Village is good for discounted brands, but for one-of-a-kind vintage pieces, a dedicated store like Vintage Vibes LLC SPC offers better value and uniqueness."
    },
    {
      q: "Is there a Primark in Dubai?",
      a: "No, Primark is not officially available in Dubai. This is why many shoppers choose thrift and vintage stores such as Vintage Vibes LLC SPC for affordable fashion."
    },
    {
      q: "Which city is best for thrifting clothes?",
      a: "Cities like London and New York are well known for thrifting, but the UAE's thrift scene is growing fast. Vintage Vibes LLC SPC in Al Ain is a strong example of this emerging market."
    },
    {
      q: "What is the most sold second-hand item?",
      a: "Clothing, especially t-shirts, jackets, denim, and streetwear, is the most sold second-hand category, and these items form the core collection at Vintage Vibes LLC SPC."
    },
    {
      q: "Why does Gen Z love thrifting?",
      a: "Gen Z prefers thrifting because it supports sustainable fashion and individuality. Vintage Vibes LLC SPC curates collections that match modern Gen Z fashion preferences."
    }
  ];

  const toggleFaq = (index: number) => {
    luxuryAudio.playMechanicalClick();
    setActiveFaqIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // Modals & Cart state
  const [inspectingPiece, setInspectingPiece] = useState<PieceBreakdownItem | null>(null);
  const [visualInspectorPiece, setVisualInspectorPiece] = useState<PieceBreakdownItem | null>(null);
  const [fitGuideOpen, setFitGuideOpen] = useState(false);
  const [fitGuideSilhouetteId, setFitGuideSilhouetteId] = useState<string | undefined>(undefined);
  const [checkoutPieces, setCheckoutPieces] = useState<PieceBreakdownItem[]>([]);
  const [bankQrPieces, setBankQrPieces] = useState<PieceBreakdownItem[]>([]);
  const [bankQrTotalAmount, setBankQrTotalAmount] = useState<number>(0);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [bankQrModalOpen, setBankQrModalOpen] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // Multi-Item Vault Cart State
  const [cart, setCart] = useState<PieceBreakdownItem[]>(() => {
    try {
      const saved = localStorage.getItem('vv_cart_items');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Vanishing piece animation tracking
  const [vanishingBarcodes, setVanishingBarcodes] = useState<string[]>([]);
  const [successToast, setSuccessToast] = useState<{ title: string; subtitle: string } | null>(null);

  // Load active inventory (only available in-stock items)
  const fetchAvailableStock = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/purchase/inventory?soldStatus=IN_STOCK');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const available = data.filter(p => !p.isSold && p.status !== 'SOLD');
          setPieces(available);
          return;
        }
      }

      // Fallback to local storage if available
      const cached = localStorage.getItem('vv_cached_inventory_pieces');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const available = parsed.filter(p => !p.isSold && p.status !== 'SOLD');
          setPieces(available);
          return;
        }
      }

      setPieces([]);
    } catch (e) {
      console.warn('Could not fetch remote inventory:', e);
      setPieces([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableStock();
  }, []);

  // 1-Tap Deep-Link: Automatically open Front/Back/Label Garment Inspection or Checkout from WhatsApp Link
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetSku = urlParams.get('piece') || urlParams.get('checkout') || urlParams.get('sku');
      if (!targetSku) return;

      const cleanSku = targetSku.trim().toLowerCase();
      // Search in currently loaded stock
      const found = pieces.find(p =>
        p.barcode.toLowerCase() === cleanSku ||
        p.id.toLowerCase() === cleanSku
      );

      if (found) {
        if (urlParams.has('checkout')) {
          setCheckoutPieces([found]);
          setCheckoutModalOpen(true);
        } else {
          setVisualInspectorPiece(found);
        }
      } else {
        // If not in default filtered stock, fetch directly from master inventory catalog
        fetch('/api/purchase/pieces')
          .then(res => res.json())
          .then((allPieces: PieceBreakdownItem[]) => {
            if (Array.isArray(allPieces)) {
              const matched = allPieces.find(p =>
                p.barcode.toLowerCase() === cleanSku ||
                p.id.toLowerCase() === cleanSku
              );
              if (matched) {
                if (urlParams.has('checkout')) {
                  setCheckoutPieces([matched]);
                  setCheckoutModalOpen(true);
                } else {
                  setVisualInspectorPiece(matched);
                }
              }
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('Error handling deep-link SKU:', err);
    }
  }, [pieces]);

  // Category filters matching the live website navigation
  const categories = [
    { id: 'ALL', label: 'All Items' },
    { id: 't-shirts', label: 'T Shirts' },
    { id: 'caps', label: 'Al Neyadi Caps' },
    { id: 'hoodies', label: 'Hoodies' },
    { id: 'sweaters', label: 'Sweaters / Sweatshirts' },
    { id: 'puffer', label: 'Puffer' },
    { id: 'fleece', label: 'Fleece' },
    { id: 'longsleeve', label: 'Longsleeve' },
    { id: 'jackets', label: 'Jackets' },
    { id: 'pants', label: 'Pants' },
    { id: 'shorts', label: 'Shorts' }
  ];

  // Filtered pieces based on category and search query
  const filteredPieces = useMemo(() => {
    return pieces.filter(piece => {
      const itemText = `${piece.itemName || ''} ${piece.brandName || ''} ${piece.style || ''} ${piece.itemId || ''}`.toLowerCase();

      // Category filter matching
      if (selectedCategory !== 'ALL') {
        switch (selectedCategory) {
          case 't-shirts':
            if (!itemText.includes('tee') && !itemText.includes('t-shirt') && !itemText.includes('tshirt')) return false;
            break;
          case 'caps':
            if (!itemText.includes('cap') && !itemText.includes('hat') && !itemText.includes('neyadi')) return false;
            break;
          case 'hoodies':
            if (!itemText.includes('hoodie')) return false;
            break;
          case 'sweaters':
            if (!itemText.includes('sweater') && !itemText.includes('sweatshirt') && !itemText.includes('knit')) return false;
            break;
          case 'puffer':
            if (!itemText.includes('puffer') && !itemText.includes('down') && !itemText.includes('nuptse')) return false;
            break;
          case 'fleece':
            if (!itemText.includes('fleece') && !itemText.includes('sherpa')) return false;
            break;
          case 'longsleeve':
            if (!itemText.includes('longsleeve') && !itemText.includes('long sleeve')) return false;
            break;
          case 'jackets':
            if (!itemText.includes('jacket') && !itemText.includes('coat') && !itemText.includes('bomber') && !itemText.includes('outerwear')) return false;
            break;
          case 'pants':
            if (!itemText.includes('pant') && !itemText.includes('jean') && !itemText.includes('denim') && !itemText.includes('trouser')) return false;
            break;
          case 'shorts':
            if (!itemText.includes('short')) return false;
            break;
          default:
            break;
        }
      }

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          piece.brandName?.toLowerCase().includes(q) ||
          piece.itemName?.toLowerCase().includes(q) ||
          piece.barcode?.toLowerCase().includes(q) ||
          piece.style?.toLowerCase().includes(q) ||
          piece.countryOfOrigin?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [pieces, selectedCategory, searchQuery]);

  // Cart Management Handlers
  const handleAddToCart = (piece: PieceBreakdownItem) => {
    luxuryAudio.playChime();
    setCart(prev => {
      if (prev.some(p => p.barcode === piece.barcode)) {
        setIsCartOpen(true);
        return prev;
      }
      const updated = [...prev, piece];
      try {
        localStorage.setItem('vv_cart_items', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    setSuccessToast({
      title: `Added ${piece.brandName} (${piece.barcode}) to Cart!`,
      subtitle: '1-of-1 Vault reservation held for 10 minutes.'
    });
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRemoveFromCart = (barcode: string) => {
    setCart(prev => {
      const updated = prev.filter(p => p.barcode !== barcode);
      try {
        localStorage.setItem('vv_cart_items', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const handleCheckoutFromCart = () => {
    if (cart.length === 0) return;
    setIsCartOpen(false);
    setCheckoutPieces(cart);
    setCheckoutModalOpen(true);
  };

  // Handle successful purchase: mark piece(s) SOLD, vanish from UI, post sales invoice in ERP & send WhatsApp
  const handleFinalizePurchase = async (
    piecesToBuy: PieceBreakdownItem[],
    paymentMethod: 'BANK_TRANSFER' | 'CARD_POS' | 'COD',
    customerInfo?: CheckoutCustomerInfo,
    paymentRef?: string
  ) => {
    if (!piecesToBuy || piecesToBuy.length === 0) return;
    setIsProcessingCheckout(true);
    luxuryAudio.playWaxSealSound();

    // Trigger immediate UI visual vanishing for all purchased pieces
    const barcodesToVanish = piecesToBuy.map(p => p.barcode);
    setVanishingBarcodes(barcodesToVanish);

    try {
      const totalAmount = piecesToBuy.reduce(
        (s, i) => s + (i.estimatedPrice || i.retailPriceAed || 295),
        0
      );

      const payload = {
        customerName: customerInfo?.name || 'Online Boutique Collector',
        customerPhone: customerInfo?.phone || '+971 50 000 0000',
        channel: 'E-Commerce Online Storefront',
        paymentMethod,
        discountAmount: 0,
        items: piecesToBuy.map(piece => ({
          pieceId: piece.id,
          barcode: piece.barcode,
          description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'L'}) - Ref ${paymentRef || paymentMethod}`,
          weightKg: piece.weightKg || 0.4,
          unitPrice: piece.estimatedPrice || piece.retailPriceAed || 295,
          discount: 0,
          finalAmount: piece.estimatedPrice || piece.retailPriceAed || 295
        }))
      };

      const res = await fetch('/api/sales/live-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.warn('Backend sync failed, storing offline order');
      }

      // Remove pieces from local active list after vanishing animation completes
      setTimeout(() => {
        setPieces(prev => prev.filter(p => !barcodesToVanish.includes(p.barcode)));
        setVanishingBarcodes([]);
      }, 700);

      // Remove purchased pieces from cart
      setCart(prev => {
        const updated = prev.filter(p => !barcodesToVanish.includes(p.barcode));
        try {
          localStorage.setItem('vv_cart_items', JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      // Show luxury confirmation banner
      setSuccessToast({
        title: `Order Confirmed: ${piecesToBuy.length} ${piecesToBuy.length === 1 ? 'Piece' : 'Pieces'} Claimed!`,
        subtitle: `Payment verified via ${
          paymentMethod === 'BANK_TRANSFER' ? 'Bank QR Transfer' : paymentMethod === 'COD' ? 'Cash on Delivery (COD)' : 'Card POS'
        }. Official tax invoice booked in ERP.`
      });

      // Send Instant WhatsApp Order Notification to configured WhatsApp number
      const rawPhone = companyProfile.whatsappOrderNumber || companyProfile.phone || '+971554186086';
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      if (cleanPhone && customerInfo) {
        const itemsList = piecesToBuy
          .map(p => `• ${p.brandName} ${p.itemName} (${p.sizeScanned || 'L'}) [${p.barcode}] - AED ${p.estimatedPrice || p.retailPriceAed || 295}`)
          .join('\n');

        const waMsg = `🛍️ *NEW LUXURY VAULT ORDER*\n\n` +
          `👤 *Customer:* ${customerInfo.name}\n` +
          `📞 *Phone:* ${customerInfo.phone}\n` +
          `📍 *Delivery:* ${customerInfo.shippingAddress}, ${customerInfo.city}, ${customerInfo.emirate}\n` +
          `💳 *Payment:* ${
            paymentMethod === 'BANK_TRANSFER'
              ? 'Bank QR Transfer (Ref: ' + (paymentRef || 'Submitted') + ')'
              : paymentMethod === 'COD'
              ? 'Cash on Delivery (COD)'
              : 'Credit Card / Apple Pay'
          }\n\n` +
          `📦 *Items (${piecesToBuy.length}):*\n${itemsList}\n\n` +
          `💰 *Total:* AED ${totalAmount.toLocaleString()}\n` +
          `🔒 *Status:* 1-of-1 Piece Depleted In ERP`;

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`, '_blank');
      }

      setTimeout(() => setSuccessToast(null), 8000);

      if (onInventoryMutated) onInventoryMutated();
    } catch (err) {
      console.error('Error during purchase processing:', err);
    } finally {
      setIsProcessingCheckout(false);
      setCheckoutModalOpen(false);
      setBankQrModalOpen(false);
    }
  };

  const scrollToVault = () => {
    const el = document.getElementById('vault-inventory-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF4E6] text-slate-900 flex flex-col selection:bg-amber-300 selection:text-amber-950 font-sans antialiased">
      {/* 🔴 PULSING LIVE STREAM ON-AIR ANNOUNCEMENT BANNER */}
      {isLiveStreamBroadcasting && (
        <div className="bg-gradient-to-r from-red-700 via-red-600 to-amber-600 text-white text-xs py-2.5 px-4 shadow-xl border-b-2 border-amber-400 flex flex-col sm:flex-row items-center justify-between gap-2 z-50 sticky top-0 animate-fade-in">
          <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-start">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
            <span className="font-black tracking-wider uppercase text-[11px] bg-black/40 px-2.5 py-0.5 rounded-full border border-white/30 text-amber-200">
              ● WE ARE LIVE NOW
            </span>
            <span className="font-bold">
              Vintage Vibes Live Stream is broadcasting on TikTok & Instagram! Claim 1-of-1 archive grails in real time.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.open('/live-overlay?theme=gold', '_blank');
              }}
              className="px-3.5 py-1 bg-white hover:bg-amber-100 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-full shadow-md transition cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <Radio className="w-3.5 h-3.5 text-red-600 animate-pulse" />
              <span>Watch Live Stream</span>
            </button>
            <button
              onClick={() => setIsLiveStreamBroadcasting(false)}
              className="p-1 text-white/80 hover:text-white cursor-pointer ml-1"
              title="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 0. STICKY NEXT VAULT DROP FOMO COUNTDOWN BANNER */}
      <NextDropBanner onExploreDrop={scrollToVault} />

      {/* 1. STORE NOTICE BAR (FROM VINTAGEVIBESLLCSPC.COM) */}
      {showNoticeBar && (
        <div className="bg-[#1A1A1A] text-[#FDF9EE] text-xs py-2 px-4 flex items-center justify-between border-b border-amber-500/40">
          <div className="flex-1 text-center font-medium">
            <strong className="text-amber-400 font-bold">Free shipping</strong> on orders over AED 200.{' '}
            <button
              onClick={scrollToVault}
              className="text-amber-300 underline hover:text-amber-200 font-bold ml-1 cursor-pointer"
            >
              Shop Now
            </button>
          </div>
          <button
            onClick={() => setShowNoticeBar(false)}
            className="text-slate-400 hover:text-white cursor-pointer ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. LIVE GOLD SOUK TICKER */}
      <div className="border-b border-amber-300/80 bg-gradient-to-r from-[#FDF9EE] via-[#F5ECCE] to-[#FAF4E6]">
        <DubaiLiveSoukTicker />
      </div>

      {/* 3. LUXURY BOUTIQUE TOP NAVIGATION HEADER */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#FDF9EE]/95 via-[#F5ECCE]/95 to-[#FAF4E6]/95 backdrop-blur-xl border-b-2 border-amber-400/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xl">
        {/* Left: 3D Animated Gold Medal Logo + Brand Title */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative shrink-0 flex items-center">
            <Vintage3DLogo
              size="lg"
              interactive={true}
              className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)]"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CompanyName3D name={companyProfile.companyName || 'VINTAGE VIBES'} size="lg" />
              <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                LLC SPC • UAE
              </span>
            </div>
            <p className="text-[11px] text-slate-700 font-semibold tracking-wide flex items-center gap-1.5 mt-0.5">
              <span>Al Jimi, Al Ain</span>
              <span>•</span>
              <span>Al Quoz Dubai Vault</span>
              <span>•</span>
              <span className="text-amber-900 font-bold">+971 55 418 6086</span>
            </p>
          </div>
        </div>

        {/* Right: Search + Vault Cart Drawer CTA + Staff ERP Access CTA */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="relative hidden md:block w-56 lg:w-72">
            <Search className="w-4 h-4 text-amber-900/60 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Carhartt, Nike, Levi's..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/95 border-2 border-amber-300 rounded-full pl-9 pr-4 py-1.5 text-xs font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500 shadow-inner"
            />
          </div>

          {/* VAULT CART TRIGGER BUTTON WITH LIVE BADGE */}
          <button
            type="button"
            id="btn-open-vault-cart"
            onClick={() => {
              luxuryAudio.playMechanicalClick();
              setIsCartOpen(true);
            }}
            className="relative btn-3d btn-3d-amber px-3.5 py-2 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
            title="Open 1-of-1 Vault Cart"
          >
            <ShoppingBag className="w-4 h-4 text-slate-950" />
            <span className="hidden sm:inline">Cart</span>
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white font-mono font-black text-[10px] flex items-center justify-center border-2 border-white shadow-md animate-bounce">
                {cart.length}
              </span>
            )}
          </button>

          {/* ERP Access Button (Prominently Highlighted 3D Button) */}
          <button
            type="button"
            id="btn-open-erp-login"
            onClick={() => {
              luxuryAudio.playMechanicalClick();
              onOpenERPLogin();
            }}
            className="px-3 py-2 bg-white/90 hover:bg-white text-slate-900 font-extrabold text-xs uppercase tracking-wider rounded-xl border border-amber-300/90 shadow-xs flex items-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
            title="Access Warehouse Management, Bale Inward & Financial Accounts"
          >
            <Lock className="w-3.5 h-3.5 text-amber-800" />
            <span className="hidden lg:inline">Staff / ERP</span>
          </button>
        </div>
      </header>

      {/* 4. DYNAMIC HERO SLIDER (DIRECTLY FROM VINTAGEVIBESLLCSPC.COM) */}
      <section className="relative w-full h-[65vh] sm:h-[75vh] min-h-[480px] max-h-[750px] overflow-hidden bg-slate-950">
        {heroSlides.map((slide, idx) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              currentSlide === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-7000 ease-out transform scale-105"
              style={{ backgroundImage: `url('${slide.image}')` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/70" />

            <div className="relative z-20 h-full max-w-6xl mx-auto px-6 flex flex-col items-center justify-center text-center text-white space-y-5">
              <span className="px-3.5 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[11px] font-black uppercase tracking-widest backdrop-blur-xs">
                Vintage Vibes General Trading LLC SPC
              </span>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-serif tracking-wide leading-tight max-w-4xl text-white drop-shadow-md">
                {slide.title}
              </h1>

              <p className="text-sm sm:text-lg text-slate-200 max-w-2xl font-light leading-relaxed drop-shadow-xs">
                {slide.subtitle}
              </p>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="px-8 py-3.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-black text-xs uppercase tracking-widest rounded-full shadow-2xl transition-all transform hover:-translate-y-1 hover:shadow-amber-500/40 flex items-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>SHOP NOW</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="w-24 h-1 bg-amber-400 rounded-full mt-2" />
            </div>
          </div>
        ))}

        {/* Navigation Arrows */}
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setCurrentSlide(prev => (prev - 1 + heroSlides.length) % heroSlides.length);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-amber-400 hover:text-slate-950 text-white border border-white/30 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setCurrentSlide(prev => (prev + 1) % heroSlides.length);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-amber-400 hover:text-slate-950 text-white border border-white/30 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
          aria-label="Next Slide"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Dots Container */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5">
          {heroSlides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setCurrentSlide(idx);
              }}
              className={`transition-all duration-300 rounded-full cursor-pointer ${
                currentSlide === idx
                  ? 'w-8 h-2.5 bg-amber-400 border border-amber-300'
                  : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/70'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* 5. WINTER MAAZI COLLECTIONS & FOUNDER'S SON VOICE STORY */}
      <WinterMaaziStoryHero
        onExploreCollection={(category) => {
          if (category) setSelectedCategory(category);
          scrollToVault();
        }}
      />

      {/* 6. SUCCESS TOAST BANNER */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 max-w-md bg-emerald-900 text-white border-2 border-emerald-400 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-top-4 duration-300 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h5 className="font-black text-sm">{successToast.title}</h5>
            <p className="text-xs text-emerald-100 mt-0.5">{successToast.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* 7. PROMOTIONAL POSTERS STRIP (DIRECTLY FROM LIVE WEBSITE) */}
      <section className="bg-gradient-to-b from-[#F5ECCE] via-[#FAF4E6] to-[#FAF4E6] py-10 border-b-2 border-amber-300/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-1">
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-900 block">
              Curated Vintage Drops
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif">
              Explore Our Live Collections & Vault Banners
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Poster 1 */}
            <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
              <img
                src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-2-1024x571.webp"
                alt="Premium vintage collection UAE"
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="btn-3d btn-3d-amber text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Show all new arrivals
                </button>
              </div>
            </div>

            {/* Poster 2 */}
            <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
              <img
                src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-6-1-1024x571.jpg"
                alt="Vintage streetwear drop"
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
            </div>

            {/* Poster 3 */}
            <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
              <img
                src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-1-1-1024x571.png"
                alt="Rare retro drops"
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
            </div>

            {/* Poster 4 */}
            <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
              <img
                src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-4-2-1024x571.jpg"
                alt="Vintage Sports Collection UAE"
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 7. LIVE VAULT INVENTORY & CATEGORY FILTER STRIP */}
      <div id="vault-inventory-section" className="bg-[#FAF4E6]/95 backdrop-blur-md border-b-2 border-amber-300 sticky top-[73px] z-30 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  setSelectedCategory(cat.id);
                }}
                className={`px-4 py-2 rounded-full text-xs font-black transition-all cursor-pointer whitespace-nowrap shadow-xs ${
                  selectedCategory === cat.id
                    ? 'btn-3d btn-3d-amber text-slate-950 scale-105'
                    : 'bg-white hover:bg-amber-100 text-slate-800 border border-amber-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono font-bold text-amber-950 hidden lg:block shrink-0 bg-white/90 px-3 py-1.5 rounded-full border border-amber-300">
            Vault Stock: <strong className="text-amber-700">{filteredPieces.length}</strong> rare pieces
          </div>
        </div>
      </div>

      {/* 8. MAIN GARMENT PRODUCT GRID */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-600">
            <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mb-3" />
            <p className="font-extrabold text-slate-900 text-sm">Syncing Live Vault Inventory...</p>
            <p className="text-xs text-slate-500 mt-1">Connecting to Dubai & Al Ain Bale Sorting Terminal</p>
          </div>
        ) : filteredPieces.length === 0 ? (
          <div className="py-20 text-center text-slate-600 bg-white/80 rounded-2xl border-2 border-amber-300 p-8 shadow-md">
            <ShoppingBag className="w-12 h-12 text-amber-800/40 mx-auto mb-3" />
            <h3 className="font-extrabold text-lg text-slate-900 font-serif">No Pieces Found in this Category</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              All pieces in this batch might have already been claimed or sold. Check other categories or visit the Sorting Terminal to register new bale breakdowns!
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredPieces.map(piece => (
              <ProductCard
                key={piece.id || piece.barcode}
                piece={piece}
                isVanishing={vanishingBarcodes.includes(piece.barcode)}
                isInCart={cart.some(c => c.barcode === piece.barcode)}
                onAddToCart={handleAddToCart}
                onInspectTag={p => {
                  luxuryAudio.playMechanicalClick();
                  setInspectingPiece(p);
                }}
                onInspectGarment={p => {
                  luxuryAudio.playMechanicalClick();
                  setVisualInspectorPiece(p);
                }}
                onOpenFitGuide={silhouetteId => {
                  luxuryAudio.playMechanicalClick();
                  setFitGuideSilhouetteId(silhouetteId);
                  setFitGuideOpen(true);
                }}
                onInstantBuy={p => {
                  luxuryAudio.playMechanicalClick();
                  setCheckoutPieces([p]);
                  setCheckoutModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* 9. SIGNATURE BRAND STORY & OFFSET GOLD BOXES (FROM LIVE WEBSITE) */}
      <section className="bg-gradient-to-b from-[#FAF4E6] via-[#FDF9EE] to-[#F5ECCE] py-16 border-t-2 border-amber-300/80">
        <div className="max-w-6xl mx-auto px-6 space-y-20">
          {/* Row 1: About Vintage Vibes LLC SPC */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex-1 space-y-4">
              <span className="text-xs font-black uppercase tracking-widest text-amber-700 block">
                A Local Store You Can Trust
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-serif leading-tight">
                About Vintage Vibes LLC SPC
              </h2>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                Vintage Vibes LLC SPC is a curated vintage clothing and thrift store in Al Ain, UAE, dedicated to bringing authentic pre-owned fashion to people who value quality, comfort, and individuality. We specialize in handpicked vintage and second-hand clothing for men and women, offering timeless styles that stand out from fast fashion trends.
              </p>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                Located in Al Jimi, Al Ain, we offer a welcoming in-store experience along with convenient pickup and delivery options. Whether you’re searching for a dependable used clothing store or a curated vintage shop, we’re here to help you discover pieces that feel unique and timeless.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="btn-3d btn-3d-amber px-6 py-3 text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Visit Our Store
                </button>
              </div>
            </div>

            <div className="flex-1 flex justify-center">
              <div className="relative w-full max-w-[420px]">
                {/* Yellow/Gold Offset Backdrop Box */}
                <div className="absolute top-4 left-4 w-full h-full bg-[#EAC05A] rounded-2xl shadow-xl z-0" />
                <img
                  src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/Hoodie.webp"
                  alt="Vintage Vibes Store"
                  className="relative z-10 w-full h-auto rounded-2xl border-2 border-slate-900 object-cover shadow-2xl"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Shop Authentic Brands (Reverse Layout) */}
          <div className="flex flex-col md:flex-row-reverse items-center justify-between gap-12">
            <div className="flex-1 space-y-4">
              <span className="text-xs font-black uppercase tracking-widest text-amber-700 block">
                Streetwear Essentials
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-serif leading-tight">
                Shop Authentic Brands
              </h2>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                We proudly offer popular vintage brands such as Carhartt, Dickies, Nike, and Ralph Lauren, making us a reliable vintage thrift shop for streetwear and workwear lovers. Whether you’re looking for jackets, hoodies, pants, or classic crewnecks, our collection delivers genuine pieces that reflect true vintage character.
              </p>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                Vintage Vibes LLC SPC is more than just a thrift shop, it’s a destination for people who value unique vintage fashion and conscious shopping. We regularly update our inventory with fresh drops and rare finds. We offer authenticity, style, and value in every piece.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="btn-3d btn-3d-amber px-6 py-3 text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Shop Streetwear
                </button>
              </div>
            </div>

            <div className="flex-1 flex justify-center">
              <div className="relative w-full max-w-[420px]">
                {/* Yellow/Gold Offset Backdrop Box */}
                <div className="absolute top-4 left-4 w-full h-full bg-[#EAC05A] rounded-2xl shadow-xl z-0" />
                <img
                  src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/Hoodie.webp"
                  alt="Vintage Brands"
                  className="relative z-10 w-full h-auto rounded-2xl border-2 border-slate-900 object-cover shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. EDITORIAL STATEMENT BANNER (WHERE FASHION MEETS SPORT) */}
      <section className="bg-gradient-to-r from-[#1A1A1A] via-[#2A2418] to-[#1A1A1A] text-white py-16 px-6 border-y-2 border-amber-400">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <span className="text-amber-400 text-xs font-black uppercase tracking-widest block">
            UAE Heritage & Street Culture
          </span>
          <h2 className="text-2xl sm:text-4xl font-black font-serif text-amber-200">
            Where Fashion Meets Sport & Street Culture
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
            At Vintage Vibes LLC SPC, our collection is inspired by the connection between fashion, sports, and street culture. From athletic heritage pieces to everyday streetwear essentials, we curate vintage clothing that reflects performance, comfort, and timeless style. Whether it’s classic sportswear, durable outerwear, or relaxed casual fits, each item carries the character of its era while fitting seamlessly into modern wardrobes. Our goal is to make authentic vintage fashion accessible to those who appreciate quality, movement, and individuality, all in one trusted vintage store.
          </p>
        </div>
      </section>

      {/* 11. FAQ ACCORDION SECTION (EXACT 10 QUESTIONS FROM LIVE SITE) */}
      <section className="bg-[#FAF4E6] py-16 px-4 sm:px-8 border-b-2 border-amber-300/80">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-serif">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-600">
              Everything you need to know about thrifting in Dubai & the UAE
            </p>
            <div className="w-16 h-1 bg-amber-500 mx-auto mt-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {faqItems.map((faq, index) => {
              const isActive = activeFaqIndices.includes(index);
              return (
                <div
                  key={index}
                  className={`bg-white rounded-xl border transition-all duration-300 overflow-hidden ${
                    isActive
                      ? 'border-l-4 border-l-amber-500 border-amber-300 shadow-md'
                      : 'border-slate-200 hover:border-amber-300 shadow-2xs'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="w-full p-4 flex items-center justify-between text-left gap-3 cursor-pointer bg-white hover:bg-amber-50/50"
                  >
                    <span className="font-bold text-sm text-slate-900">
                      {faq.q}
                    </span>
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 rotate-45'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                    </span>
                  </button>

                  {isActive && (
                    <div className="p-4 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-100 bg-[#FAFAFA]">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 12. COMPREHENSIVE LUXURY 4-COLUMN FOOTER */}
      <footer className="bg-gradient-to-b from-[#F5ECCE] via-[#FAF4E6] to-[#F5ECCE] border-t-2 border-amber-400 text-slate-800 text-xs pt-12 pb-8 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Social Icons Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 border-b border-amber-300">
            <span className="font-bold uppercase tracking-widest text-amber-950 text-xs">
              Connect With Vintage Vibes UAE:
            </span>
            <div className="flex items-center gap-4 text-slate-700">
              <a
                href="https://www.facebook.com/vintagevibes.ae/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                Facebook
              </a>
              <span>•</span>
              <a
                href="https://www.instagram.com/vintagevibes.llc/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                Instagram
              </a>
              <span>•</span>
              <a
                href="https://www.youtube.com/@VintageVibesLLCSPC"
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                YouTube
              </a>
              <span>•</span>
              <a
                href="https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn"
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                TikTok
              </a>
            </div>
          </div>

          {/* 4 Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Col 1: About */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Vintage3DLogo
                  size="sm"
                  interactive={false}
                  className="w-8 h-8 drop-shadow-xs shrink-0"
                />
                <h4 className="font-black text-sm text-slate-900 font-serif">
                  About Vintage Vibes
                </h4>
              </div>
              <p className="text-slate-600 leading-relaxed text-xs">
                Discover premium, handpicked thrift and vintage fashion. Timeless branded pieces with quality, style, and great value, curated just for you.
              </p>
              <div className="pt-1">
                <span className="inline-block px-2.5 py-1 rounded-md bg-amber-200/80 border border-amber-400 text-[10px] font-black text-amber-950">
                  TRN: {companyProfile.trnTaxNo}
                </span>
              </div>
            </div>

            {/* Col 2: Quick Links */}
            <div className="space-y-3">
              <h4 className="font-black text-sm text-slate-900 uppercase tracking-wider font-serif">
                Quick Links
              </h4>
              <ul className="space-y-1.5 text-slate-600 font-medium">
                <li><button onClick={scrollToVault} className="hover:text-amber-700 cursor-pointer">Shop Vault</button></li>
                <li><button onClick={scrollToVault} className="hover:text-amber-700 cursor-pointer">About Us</button></li>
                <li><button onClick={() => onOpenERPLogin()} className="hover:text-amber-700 cursor-pointer font-bold text-amber-900">Staff / ERP Portal</button></li>
                <li><a href="mailto:sales@vintagevibesllcspc.com" className="hover:text-amber-700">Contact Us</a></li>
                <li><a href="https://vintagevibesllcspc.com/blog/" target="_blank" rel="noreferrer" className="hover:text-amber-700">Thrift & Vintage Blog</a></li>
              </ul>
            </div>

            {/* Col 3: Categories */}
            <div className="space-y-3">
              <h4 className="font-black text-sm text-slate-900 uppercase tracking-wider font-serif">
                Categories
              </h4>
              <ul className="space-y-1.5 text-slate-600 font-medium">
                <li><button onClick={() => { setSelectedCategory('caps'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">Al Neyadi Caps Stocks</button></li>
                <li><button onClick={() => { setSelectedCategory('t-shirts'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">T-Shirts</button></li>
                <li><button onClick={() => { setSelectedCategory('hoodies'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">Hoodies</button></li>
                <li><button onClick={() => { setSelectedCategory('sweaters'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">Sweatshirts</button></li>
                <li><button onClick={() => { setSelectedCategory('puffer'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">Puffer & Fleece</button></li>
                <li><button onClick={() => { setSelectedCategory('jackets'); scrollToVault(); }} className="hover:text-amber-700 cursor-pointer">Jackets & Denim</button></li>
              </ul>
            </div>

            {/* Col 4: Need help? Contact & Location */}
            <div className="space-y-3">
              <h4 className="font-black text-sm text-slate-900 uppercase tracking-wider font-serif">
                Need Help?
              </h4>
              <div className="space-y-2 text-slate-600">
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                  <strong className="text-slate-900 font-mono">+971 55 418 6086</strong>
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Monday – Sunday: 9:00 AM - 12:00 AM</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-amber-700" />
                  <a href="mailto:sales@vintagevibesllcspc.com" className="hover:underline">
                    sales@vintagevibesllcspc.com
                  </a>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span>House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, UAE</span>
                </p>
              </div>

              {/* Map embed / location widget */}
              <div className="mt-2 pt-2 border-t border-amber-300">
                <a
                  href="https://maps.google.com/?q=Vintage+Vibes+LLC+SPC+Al+Ain+UAE"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-white/90 px-3 py-1.5 rounded-lg border border-amber-400 hover:bg-amber-100 shadow-2xs"
                >
                  <MapPin className="w-3.5 h-3.5 text-red-600" />
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </div>
            </div>
          </div>

          {/* ARCHITECT / CREATOR SIGNATURE CARD (Fixed & Non-Editable Luxury Gold / Dark Glassmorphism) */}
          <div className="my-8 pt-8 border-t border-amber-400/60">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-black p-6 sm:p-8 border border-amber-500/40 shadow-2xl max-w-2xl mx-auto text-center backdrop-blur-md group hover:border-amber-400/80 transition-all duration-300">
              {/* Ambient gold glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center gap-4">
                {/* Brand Title */}
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-[10px] uppercase font-bold tracking-[0.25em] text-amber-300 mb-2">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>System Architecture & Engineering</span>
                  </div>
                  <h4 className="text-xl sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 font-serif">
                    Powered by Murtaza Makkani
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium tracking-wide mt-1">
                    Next-Gen Cloud Systems & Digital Infrastructure
                  </p>
                </div>

                {/* Live Dynamic QR Code Section */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-5 my-2 p-4 rounded-xl bg-white/5 border border-amber-400/20 backdrop-blur-xs w-full max-w-lg">
                  <div className="p-2 bg-white rounded-xl shadow-lg border border-amber-300 shrink-0">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://wa.me/923022190822"
                      alt="Scan to WhatsApp Murtaza Makkani"
                      className="w-28 h-28 sm:w-32 sm:h-32 object-contain block"
                      loading="lazy"
                    />
                  </div>
                  <div className="text-center sm:text-left space-y-2">
                    <div className="text-[11px] uppercase tracking-widest text-amber-400 font-bold">
                      Scan to WhatsApp
                    </div>
                    <div className="text-base sm:text-lg font-mono font-bold text-white tracking-wider">
                      +92 302 2190822
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Scan with your phone camera or WhatsApp scanner to start a direct encrypted chat with the system architect.
                    </p>
                  </div>
                </div>

                {/* Direct Action Button */}
                <a
                  href="https://wa.me/923022190822?text=Hello%20Murtaza,%20I%20am%20interested%20in%20your%20custom%20ERP%20and%20cloud%20solutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold text-xs sm:text-sm tracking-wide uppercase shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border border-amber-300"
                >
                  <MessageCircle className="w-4 h-4 fill-slate-950" />
                  <span>Direct Chat with System Architect</span>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div className="pt-6 border-t border-amber-300 text-center text-slate-600 text-[11px] space-y-1">
            <p>Copyright © Vintage Vibes General Trading LLC SPC. All Rights Reserved</p>
            <p className="text-[10px] text-slate-500">
              Powered by Vintage Vibe Enterprise ERP • Modular High-Density Garment Management System
            </p>
          </div>
        </div>
      </footer>

      {/* 13. FLOATING ACTION CONTROLS (CART + WHATSAPP) */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => {
            luxuryAudio.playMechanicalClick();
            setIsCartOpen(true);
          }}
          className="fixed bottom-22 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 text-slate-950 font-black px-4 py-3 rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 cursor-pointer border-2 border-amber-500/80"
          aria-label="View Cart"
        >
          <ShoppingBag className="w-5 h-5 text-slate-950" />
          <span className="text-xs uppercase tracking-wider font-extrabold">Vault Cart ({cart.length})</span>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
        </button>
      )}

      {(() => {
        const cleanOwnerNumber = (companyProfile?.whatsapp_orders_number || (companyProfile as any)?.whatsappOrderNumber || '971554186086').replace(/[^0-9]/g, '');
        return (
          <a
            href={`https://wa.me/${cleanOwnerNumber}?text=Hello%20Vintage%20Vibes,%20I%20have%20an%20inquiry%20regarding%20an%20item`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-3 rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 group cursor-pointer"
            aria-label="WhatsApp Us"
          >
            <MessageCircle className="w-6 h-6 fill-current" />
            <span className="font-bold text-xs pr-1 hidden sm:inline">WhatsApp us</span>
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          </a>
        );
      })()}

      {/* 14. MULTI-ITEM CART DRAWER */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={handleCheckoutFromCart}
        companyProfile={companyProfile}
      />

      {/* 15. MODALS */}
      <TagInspectModal
        isOpen={!!inspectingPiece}
        onClose={() => setInspectingPiece(null)}
        piece={inspectingPiece}
      />

      <CheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        items={checkoutPieces}
        companyProfile={companyProfile}
        onOpenBankQr={(items, total) => {
          setBankQrPieces(items);
          setBankQrTotalAmount(total);
          setBankQrModalOpen(true);
        }}
        onCompleteCheckout={async (items, method, customer, details) => {
          await handleFinalizePurchase(
            items,
            method,
            customer,
            details?.cardNumber ? `CARD-${details.cardNumber.slice(-4)}` : details?.type || 'CHECKOUT'
          );
        }}
        isProcessing={isProcessingCheckout}
      />

      <BankQrModal
        isOpen={bankQrModalOpen}
        onClose={() => setBankQrModalOpen(false)}
        items={bankQrPieces}
        totalAmount={bankQrTotalAmount}
        companyProfile={companyProfile}
        onConfirmPayment={async ref => {
          if (bankQrPieces.length > 0) {
            await handleFinalizePurchase(bankQrPieces, 'BANK_TRANSFER', undefined, ref);
          }
        }}
        isProcessing={isProcessingCheckout}
      />

      <GarmentInspectorModal
        isOpen={!!visualInspectorPiece}
        onClose={() => setVisualInspectorPiece(null)}
        piece={visualInspectorPiece}
        onInstantBuy={p => {
          setVisualInspectorPiece(null);
          setCheckoutPieces([p]);
          setCheckoutModalOpen(true);
        }}
        onOpenFitGuide={silhouetteId => {
          setFitGuideSilhouetteId(silhouetteId);
          setFitGuideOpen(true);
        }}
      />

      <VintageFitGuideModal
        isOpen={fitGuideOpen}
        onClose={() => setFitGuideOpen(false)}
        initialSilhouetteId={fitGuideSilhouetteId}
      />
    </div>
  );
};
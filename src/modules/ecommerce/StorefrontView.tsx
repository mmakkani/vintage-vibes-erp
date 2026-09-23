import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile } from '../setup/setup.types.ts';
import { ProductCard } from './ProductCard.tsx';
import { ShopCatalogView, DynamicCategory } from './ShopCatalogView.tsx';
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
import { SalesService } from '../../services/salesService.ts';
import { supabase } from '../../supabaseClient.ts';
import { pixelTracking } from '../../utils/pixelTracking.ts';

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
  const [selectedSegment, setSelectedSegment] = useState<string>('ALL');
  const [showNoticeBar, setShowNoticeBar] = useState<boolean>(true);
  const [isLiveStreamBroadcasting, setIsLiveStreamBroadcasting] = useState<boolean>(false);

  // E-Commerce Storefront Mode: 'home' (the trailer with carousels) vs 'shop' (the dedicated catalog with sidebar filters)
  const [storeMode, setStoreMode] = useState<'home' | 'shop'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'shop' || params.get('tab') === 'shop' || params.get('page') === 'shop') {
        return 'shop';
      }
    } catch {}
    return 'home';
  });

  // Dynamic Product Categories from public.product_categories (Global Setup)
  const [dynamicCategories, setDynamicCategories] = useState<DynamicCategory[]>([]);

  const fetchDynamicCategories = async () => {
    try {
      const res = await fetch('/api/setup/product-categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setDynamicCategories(data.filter((c: any) => c.is_active !== false));
          return;
        }
      }
    } catch (err) {
      console.warn('Could not load dynamic categories:', err);
    }
    // Fallback categories if network offline or table empty
    setDynamicCategories([
      { id: '1', name: 'T Shirts', slug: 't-shirts', is_active: true },
      { id: '2', name: 'Al Neyadi Caps', slug: 'caps', is_active: true },
      { id: '3', name: 'Hoodies', slug: 'hoodies', is_active: true },
      { id: '4', name: 'Sweaters / Sweatshirts', slug: 'sweaters', is_active: true },
      { id: '5', name: 'Puffer', slug: 'puffer', is_active: true },
      { id: '6', name: 'Fleece', slug: 'fleece', is_active: true },
      { id: '7', name: 'Longsleeve', slug: 'longsleeve', is_active: true },
      { id: '8', name: 'Jackets', slug: 'jackets', is_active: true },
      { id: '9', name: 'Pants', slug: 'pants', is_active: true },
      { id: '10', name: 'Shorts', slug: 'shorts', is_active: true }
    ]);
  };

  useEffect(() => {
    fetchDynamicCategories();
    // CDC Realtime listener for dynamic category changes in Global Setup
    const handleRealtime = (e: any) => {
      if (e.detail?.table === 'product_categories') {
        fetchDynamicCategories();
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtime);
    return () => window.removeEventListener('vv:realtime-record', handleRealtime);
  }, []);

  // Navigation handlers
  const navigateToShop = (category?: string, segment?: string, search?: string) => {
    luxuryAudio.playMechanicalClick();
    if (category) setSelectedCategory(category);
    if (segment) setSelectedSegment(segment);
    if (search !== undefined) setSearchQuery(search);
    setStoreMode('shop');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'shop');
      if (category && category !== 'ALL') {
        url.searchParams.set('category', category);
      } else {
        url.searchParams.delete('category');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {}
  };

  const navigateToHome = () => {
    luxuryAudio.playMechanicalClick();
    setStoreMode('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('category');
      window.history.replaceState(null, '', url.toString());
    } catch {}
  };

  const scrollToVault = () => {
    navigateToShop();
  };

  // Carousel refs & smooth scrolling helper
  const newArrivalsScrollRef = useRef<HTMLDivElement>(null);
  const grailsScrollRef = useRef<HTMLDivElement>(null);
  const categoriesScrollRef = useRef<HTMLDivElement>(null);

  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    luxuryAudio.playMechanicalClick();
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -380 : 380;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const getCategoryIcon = (categoryName: string) => {
    const lower = (categoryName || '').toLowerCase();
    if (lower.includes('tee') || lower.includes('t-shirt') || lower.includes('tshirt')) return '👕';
    if (lower.includes('cap') || lower.includes('hat') || lower.includes('neyadi')) return '🧢';
    if (lower.includes('hoodie')) return '🧥';
    if (lower.includes('sweater') || lower.includes('sweatshirt') || lower.includes('knit')) return '🧶';
    if (lower.includes('puffer') || lower.includes('down')) return '❄️';
    if (lower.includes('fleece') || lower.includes('sherpa')) return '🐑';
    if (lower.includes('longsleeve') || lower.includes('long sleeve')) return '👔';
    if (lower.includes('jacket') || lower.includes('coat') || lower.includes('outerwear') || lower.includes('bomber')) return '🧥';
    if (lower.includes('pant') || lower.includes('jean') || lower.includes('denim') || lower.includes('trouser')) return '👖';
    if (lower.includes('short')) return '🩳';
    return '🏷️';
  };

  // Curated piece lists for Homepage Carousels
  const newArrivals = useMemo(() => pieces.slice(0, 12), [pieces]);
  const vintageGrails = useMemo(() => {
    const grails = pieces.filter(
      p => p.isGrail ||
           p.brandTier === 'Grail' ||
           (p.marketSegment || '').toLowerCase().includes('grail') ||
           (p.marketSegment || '').toLowerCase().includes('boutique') ||
           (p.style || '').toLowerCase().includes('antique')
    );
    return grails.length >= 4 ? grails.slice(0, 12) : pieces.slice(0, 12);
  }, [pieces]);

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

  // Initialize Meta & TikTok Pixels on Storefront entry and track PageView
  useEffect(() => {
    const config = companyProfile?.pixelTracking || {
      metaPixelId: companyProfile?.metaPixelId,
      tiktokPixelId: companyProfile?.tiktokPixelId,
      enableMetaPixel: true,
      enableTiktokPixel: true
    };
    pixelTracking.initPixels(config);
    pixelTracking.trackPageView();
  }, [companyProfile]);

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

  // Multi-Item Vault Cart State & 10-Minute Lock Session
  const [sessionId] = useState<string>(() => {
    try {
      let id = sessionStorage.getItem('vv_ecommerce_session');
      if (!id) {
        id = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        sessionStorage.setItem('vv_ecommerce_session', id);
      }
      return id;
    } catch {
      return 'sess-' + Date.now();
    }
  });

  const [cart, setCart] = useState<PieceBreakdownItem[]>(() => {
    try {
      const saved = localStorage.getItem('vv_cart_items');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Grail Bounty Hunter Wishlist Modal State
  const [bountyModalOpen, setBountyModalOpen] = useState(false);
  const [bountyForm, setBountyForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    desiredBrand: '',
    desiredCategory: 'T-Shirts',
    desiredSize: 'L (Boxy)',
    maxBudgetAed: '',
    notes: ''
  });
  const [bountySubmitting, setBountySubmitting] = useState(false);

  // Vanishing piece animation tracking
  const [vanishingBarcodes, setVanishingBarcodes] = useState<string[]>([]);
  const [successToast, setSuccessToast] = useState<{ title: string; subtitle: string } | null>(null);

  // Load active inventory directly from SQL /api/ecommerce/products or Supabase (only available in-stock items)
  const fetchAvailableStock = async () => {
    setIsLoading(true);
    try {
      localStorage.removeItem('vv_cached_inventory_pieces');
    } catch (_) {}

    try {
      // 1. Primary: Dedicated E-Commerce SQL Products Endpoint
      const res = await fetch('/api/ecommerce/products');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const available = data.filter(p => !p.isSold && p.status !== 'SOLD');
          setPieces(available);
          return;
        }
      }

      // 2. Secondary: Supabase client
      const { data: supaData } = await supabase
        .from('inventory_pieces')
        .select('*')
        .eq('is_sold', false)
        .neq('status', 'SOLD')
        .order('created_at', { ascending: false })
        .limit(100);

      if (Array.isArray(supaData)) {
        const available = supaData.map((r: any) => ({
          id: r.id || r.barcode,
          barcode: r.barcode,
          itemId: r.item_id || 'ITM-01',
          itemName: r.item_name || 'Vintage Garment',
          brandId: r.brand_id,
          brandName: r.brand_name || 'Vintage Archive',
          sizeScanned: r.size_scanned || 'L',
          countryOfOrigin: r.country_of_origin || 'USA',
          style: r.style || 'Single-Stitch Vintage',
          frontImageUrl: r.front_image_url || r.tag_image_url || '/studio_left_rack.png',
          backImageUrl: r.back_image_url || r.front_image_url || '/studio_backdrop_noboy.png',
          tagImageUrl: r.tag_image_url || '/studio_left_rack.png',
          labelGrade: r.label_grade || 'Grade A+ (Pristine)',
          brandTier: r.brand_tier || 'Grail',
          shopLocation: r.shop_name || r.shop_location || 'Al Ain Vintage Hub',
          pitToPitInches: r.pit_to_pit_inches ? Number(r.pit_to_pit_inches) : 22,
          lengthInches: r.length_inches ? Number(r.length_inches) : 29,
          weightKg: Number(r.weight_kg || 0.4),
          estimatedPrice: Number(r.estimated_price || r.retail_price_aed || 295),
          retailPriceAed: Number(r.retail_price_aed || r.estimated_price || 295),
          isSold: Boolean(r.is_sold),
          status: r.status || 'IN_STOCK',
          marketSegment: r.market_segment || 'Regular Thrift',
          isGrail: Boolean(r.is_grail),
          globalInsights: r.global_insights || null,
          aiSuggestedPrice: r.ai_suggested_price !== undefined && r.ai_suggested_price !== null ? Number(r.ai_suggested_price) : null,
          isPriceOverridden: Boolean(r.is_price_overridden),
          isCartLocked: false,
          createdAt: r.created_at
        })).filter((p: any) => !p.isSold && p.status !== 'SOLD');
        setPieces(available as PieceBreakdownItem[]);
        return;
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
          pixelTracking.trackInitiateCheckout([found], found.retailPriceAed || found.estimatedPrice || 295);
        } else {
          setVisualInspectorPiece(found);
          pixelTracking.trackViewContent(found);
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
                  pixelTracking.trackInitiateCheckout([matched], matched.retailPriceAed || matched.estimatedPrice || 295);
                } else {
                  setVisualInspectorPiece(matched);
                  pixelTracking.trackViewContent(matched);
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



  // Cart Management Handlers with 10-Minute Lock Reservation in SQL Database
  const handleAddToCart = async (piece: PieceBreakdownItem) => {
    luxuryAudio.playChime();

    // 1. Check & reserve 1-of-1 piece in SQL database cart_reservations
    try {
      const res = await fetch('/api/ecommerce/cart/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: piece.barcode,
          sessionId,
          pieceTitle: piece.itemName || piece.brandName,
          priceAed: piece.estimatedPrice || piece.retailPriceAed || 295
        })
      });

      if (res.status === 423) {
        const errData = await res.json();
        setSuccessToast({
          title: '⚠️ Piece Currently Held!',
          subtitle: errData.error || 'This 1-of-1 piece is currently held in another cart.'
        });
        setTimeout(() => setSuccessToast(null), 5000);
        return;
      }
    } catch (_) {}

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

    // Track AddToCart conversion event on Meta and TikTok Pixels
    pixelTracking.trackAddToCart(piece);

    setSuccessToast({
      title: `Added ${piece.brandName} (${piece.barcode}) to Cart!`,
      subtitle: '1-of-1 Vault reservation locked in SQL database for 10 minutes.'
    });
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRemoveFromCart = (barcode: string) => {
    // Release SQL reservation
    fetch('/api/ecommerce/cart/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, sessionId })
    }).catch(() => {});

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

    const totalAed = cart.reduce(
      (acc, it) => acc + (it.retailPriceAed || it.estimatedPrice || 295),
      0
    );
    pixelTracking.trackInitiateCheckout(cart, totalAed);
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

    const totalAmount = piecesToBuy.reduce(
      (s, i) => s + (i.estimatedPrice || i.retailPriceAed || 295),
      0
    );

    try {
      // 1. Execute Atomic E-Commerce SQL Checkout via Backend API
      const checkoutRes = await fetch('/api/ecommerce/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerInfo?.name || 'Online Boutique Collector',
          customerPhone: customerInfo?.phone || '+971 50 000 0000',
          customerEmail: customerInfo?.email || '',
          shippingAddress: customerInfo?.shippingAddress || '',
          city: customerInfo?.city || customerInfo?.emirate || 'Dubai',
          country: 'UAE',
          items: piecesToBuy.map(piece => ({
            pieceId: piece.id,
            barcode: piece.barcode,
            description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'L'}) - Ref ${paymentRef || paymentMethod}`,
            weightKg: piece.weightKg || 0.4,
            unitPrice: piece.estimatedPrice || piece.retailPriceAed || 295
          })),
          paymentMethod,
          paymentRef,
          sessionId
        })
      });

      let openedWa = false;
      let confirmedOrderNo = `ORD-${Date.now().toString().slice(-6)}`;
      if (checkoutRes.ok) {
        const checkoutData = await checkoutRes.json();
        if (checkoutData.orderNumber) confirmedOrderNo = checkoutData.orderNumber;
        if (checkoutData.whatsappUrl) {
          // Open pre-filled WhatsApp confirmation in new tab
          window.open(checkoutData.whatsappUrl, '_blank');
          openedWa = true;
        }
      } else {
        // Fallback to legacy SalesService if needed
        const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
        confirmedOrderNo = orderNumber;
        const deliveryFee = totalAmount >= (companyProfile.freeShippingThresholdAed ?? 350) ? 0 : (companyProfile.standardShippingFeeAed ?? 25);

        await SalesService.createOnlineOrder({
          order_number: orderNumber,
          customer_name: customerInfo?.name || 'Online Boutique Collector',
          customer_phone: customerInfo?.phone || '+971 50 000 0000',
          customer_address: customerInfo?.shippingAddress || '',
          city: customerInfo?.city || 'Dubai',
          items: piecesToBuy.map(piece => ({
            pieceId: piece.id,
            barcode: piece.barcode,
            description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'L'}) - Ref ${paymentRef || paymentMethod}`,
            weightKg: piece.weightKg || 0.4,
            unitPrice: piece.estimatedPrice || piece.retailPriceAed || 295
          })),
          total_amount: totalAmount,
          delivery_fee: deliveryFee,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'COD' ? 'PENDING' : 'PAID',
          order_status: 'CONFIRMED',
          source: 'STOREFRONT'
        });
      }

      // Track official Purchase conversion event on Meta and TikTok Pixels
      pixelTracking.trackPurchase(confirmedOrderNo, piecesToBuy, totalAmount);

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
      if (cleanPhone && customerInfo && !openedWa) {
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
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#FDF9EE]/95 via-[#F5ECCE]/95 to-[#FAF4E6]/95 backdrop-blur-xl border-b-2 border-amber-400/80 px-4 sm:px-8 py-3 flex items-center justify-between shadow-xl">
        {/* Left: 3D Animated Gold Medal Logo + Brand Title (Clickable Home Link) */}
        <div
          onClick={navigateToHome}
          className="flex items-center gap-3 sm:gap-4 cursor-pointer group"
          title="Return to Vintage Vibes Storefront Homepage"
        >
          <div className="relative shrink-0 flex items-center group-hover:scale-105 transition-transform">
            <Vintage3DLogo
              size="lg"
              interactive={true}
              className="w-13 h-13 sm:w-15 sm:h-15 drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)]"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CompanyName3D name={companyProfile.company_display_name || companyProfile.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'} size="lg" />
              <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                {(companyProfile.city || 'AL AIN, ABU DHABI').toUpperCase()} • {(companyProfile.country || 'UNITED ARAB EMIRATES').toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-700 font-semibold tracking-wide flex items-center gap-1.5 mt-0.5">
              <span>{companyProfile.address_line_1 || companyProfile.addressLine1 || 'Al Jimi, Al Ain'}</span>
              <span>•</span>
              <span className="text-amber-900 font-bold">{companyProfile.corporate_phone || companyProfile.phone || '+971 55 418 6086'}</span>
            </p>
          </div>
        </div>

        {/* Center: Home & Shop All Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-amber-200/50 p-1 rounded-2xl border border-amber-300/80 shadow-2xs">
          <button
            type="button"
            onClick={navigateToHome}
            className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              storeMode === 'home'
                ? 'bg-amber-400 text-slate-950 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
            }`}
          >
            🏠 Home
          </button>
          <button
            type="button"
            onClick={() => navigateToShop('ALL')}
            className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              storeMode === 'shop'
                ? 'bg-amber-400 text-slate-950 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>🛍️ Shop Catalog</span>
          </button>
        </nav>

        {/* Right: Search + Vault Cart Drawer CTA + Staff ERP Access CTA */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block w-48 xl:w-64">
            <Search className="w-4 h-4 text-amber-900/60 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Carhartt, Nike..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  navigateToShop('ALL', 'ALL', searchQuery);
                }
              }}
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

          {/* GRAIL BOUNTY WISHLIST BUTTON */}
          <button
            type="button"
            onClick={() => {
              luxuryAudio.playMechanicalClick();
              setBountyModalOpen(true);
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-950 font-bold text-xs uppercase tracking-wider rounded-xl border border-amber-400 shadow-xs transition-all active:scale-95 cursor-pointer"
            title="Request a vintage piece not found in store"
          >
            <span>🎯</span>
            <span className="hidden md:inline">Request Grail</span>
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

      {storeMode === 'shop' ? (
        <ShopCatalogView
          categories={dynamicCategories}
          initialCategory={selectedCategory}
          initialSearch={searchQuery}
          initialSegment={selectedSegment}
          cart={cart}
          vanishingBarcodes={vanishingBarcodes}
          onAddToCart={handleAddToCart}
          onInstantBuy={p => {
            luxuryAudio.playMechanicalClick();
            setCheckoutPieces([p]);
            setCheckoutModalOpen(true);
            pixelTracking.trackInitiateCheckout([p], p.retailPriceAed || p.estimatedPrice || 295);
          }}
          onInspectTag={p => {
            luxuryAudio.playMechanicalClick();
            setInspectingPiece(p);
            pixelTracking.trackViewContent(p);
          }}
          onInspectGarment={p => {
            luxuryAudio.playMechanicalClick();
            setVisualInspectorPiece(p);
            pixelTracking.trackViewContent(p);
          }}
          onOpenFitGuide={silhouetteId => {
            luxuryAudio.playMechanicalClick();
            setFitGuideSilhouetteId(silhouetteId);
            setFitGuideOpen(true);
          }}
          onBackToHome={navigateToHome}
        />
      ) : (
        <>
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
                      onClick={() => navigateToShop('ALL')}
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
              navigateToShop(category || 'ALL');
            }}
            videoUrl={companyProfile.virtual_host_video_url || companyProfile.virtualHostVideoUrl || '/mazi_video.mp4'}
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

          {/* 7. PROMOTIONAL POSTERS STRIP */}
          <section className="bg-gradient-to-b from-[#F5ECCE] via-[#FAF4E6] to-[#FAF4E6] py-10 border-b-2 border-amber-300/80">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
              <div className="text-center max-w-2xl mx-auto space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-900 block">
                  Curated Vintage Drops
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif">
                  Explore Our Live Collections &amp; Vault Banners
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
                  <img
                    src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-2-1024x571.webp"
                    alt="Premium vintage collection UAE"
                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6">
                    <button
                      type="button"
                      onClick={() => navigateToShop('ALL')}
                      className="btn-3d btn-3d-amber text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer"
                    >
                      Show all new arrivals
                    </button>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
                  <img
                    src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-6-1-1024x571.jpg"
                    alt="Vintage streetwear drop"
                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
                  />
                </div>

                <div className="relative rounded-2xl overflow-hidden shadow-xl border-2 border-amber-300 group">
                  <img
                    src="https://vintagevibesllcspc.com/wp-content/uploads/2026/01/poster-1-1-1024x571.png"
                    alt="Rare retro drops"
                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
                  />
                </div>

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

          {/* 8. HORIZONTAL CAROUSEL 1: NEW ARRIVALS */}
          <section className="py-12 px-4 sm:px-8 max-w-7xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 border-b-2 border-amber-300/80 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                    ⚡ FRESH OFF THE RACK &bull; LIVE VAULT DROPS
                  </span>
                </div>
                <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950 tracking-wide">
                  New Arrivals &amp; Fresh Unpackings
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                  Hand-sorted daily from Al Ain &amp; Dubai warehouse bales. Every piece is an authenticated 1-of-1 original.
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => scrollContainer(newArrivalsScrollRef, 'left')}
                  className="w-10 h-10 rounded-full bg-white hover:bg-amber-100 border border-amber-300 shadow-xs flex items-center justify-center text-slate-800 hover:text-slate-950 transition-all cursor-pointer"
                  aria-label="Previous New Arrivals"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollContainer(newArrivalsScrollRef, 'right')}
                  className="w-10 h-10 rounded-full bg-white hover:bg-amber-100 border border-amber-300 shadow-xs flex items-center justify-center text-slate-800 hover:text-slate-950 transition-all cursor-pointer"
                  aria-label="Next New Arrivals"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateToShop('ALL')}
                  className="ml-2 text-xs font-black uppercase tracking-wider text-amber-900 hover:text-amber-700 underline flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-500">
                <RefreshCw className="w-7 h-7 text-amber-600 animate-spin mb-2" />
                <p className="text-xs font-bold">Loading New Arrivals...</p>
              </div>
            ) : newArrivals.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">No items currently available.</div>
            ) : (
              <div
                ref={newArrivalsScrollRef}
                className="flex items-stretch gap-6 overflow-x-auto no-scrollbar scroll-smooth pb-4 pt-2 px-1 snap-x snap-mandatory"
              >
                {newArrivals.map(piece => (
                  <div
                    key={piece.id || piece.barcode}
                    className="shrink-0 w-[280px] sm:w-[320px] snap-start"
                  >
                    <ProductCard
                      piece={piece}
                      isVanishing={vanishingBarcodes.includes(piece.barcode)}
                      isInCart={cart.some(c => c.barcode === piece.barcode)}
                      onAddToCart={handleAddToCart}
                      onInspectTag={p => {
                        luxuryAudio.playMechanicalClick();
                        setInspectingPiece(p);
                        pixelTracking.trackViewContent(p);
                      }}
                      onInspectGarment={p => {
                        luxuryAudio.playMechanicalClick();
                        setVisualInspectorPiece(p);
                        pixelTracking.trackViewContent(p);
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
                        pixelTracking.trackInitiateCheckout([p], p.retailPriceAed || p.estimatedPrice || 295);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 9. HORIZONTAL CAROUSEL 2: VINTAGE GRAILS & RARE ARCHIVES */}
          <section className="bg-slate-950 text-white py-14 px-4 sm:px-8 border-y-2 border-amber-500/60 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="max-w-7xl mx-auto w-full relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 border-b border-amber-500/30 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-300 bg-amber-950/80 border border-amber-400/40 px-2 py-0.5 rounded-full">
                      👑 COLLECTOR VAULT &bull; MUSEUM GRADE ARCHIVES
                    </span>
                  </div>
                  <h2 className="font-serif font-black text-2xl sm:text-3xl text-white tracking-wide flex items-center gap-2">
                    <span>Vintage Grails &amp; Rare Archives</span>
                    <span className="text-amber-400 text-lg">✨</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1">
                    Rare single-stitch 80s/90s icons, authenticated Carhartt workwear, and museum-grade collector grails.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => scrollContainer(grailsScrollRef, 'left')}
                    className="w-10 h-10 rounded-full bg-slate-900 hover:bg-amber-400 hover:text-slate-950 border border-amber-500/40 text-white shadow-md flex items-center justify-center transition-all cursor-pointer"
                    aria-label="Previous Vintage Grails"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollContainer(grailsScrollRef, 'right')}
                    className="w-10 h-10 rounded-full bg-slate-900 hover:bg-amber-400 hover:text-slate-950 border border-amber-500/40 text-white shadow-md flex items-center justify-center transition-all cursor-pointer"
                    aria-label="Next Vintage Grails"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToShop('ALL', 'Grails')}
                    className="ml-2 text-xs font-black uppercase tracking-wider text-amber-400 hover:text-amber-300 underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Explore Grails</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Horizontal Slider Track */}
              <div
                ref={grailsScrollRef}
                className="flex items-stretch gap-6 overflow-x-auto no-scrollbar scroll-smooth pb-4 pt-2 px-1 snap-x snap-mandatory"
              >
                {vintageGrails.map(piece => (
                  <div
                    key={piece.id || piece.barcode}
                    className="shrink-0 w-[280px] sm:w-[320px] snap-start"
                  >
                    <ProductCard
                      piece={piece}
                      isVanishing={vanishingBarcodes.includes(piece.barcode)}
                      isInCart={cart.some(c => c.barcode === piece.barcode)}
                      onAddToCart={handleAddToCart}
                      onInspectTag={p => {
                        luxuryAudio.playMechanicalClick();
                        setInspectingPiece(p);
                        pixelTracking.trackViewContent(p);
                      }}
                      onInspectGarment={p => {
                        luxuryAudio.playMechanicalClick();
                        setVisualInspectorPiece(p);
                        pixelTracking.trackViewContent(p);
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
                        pixelTracking.trackInitiateCheckout([p], p.retailPriceAed || p.estimatedPrice || 295);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 10. HORIZONTAL CAROUSEL 3: SHOP BY CATEGORY */}
          <section className="py-12 px-4 sm:px-8 max-w-7xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 border-b-2 border-amber-300/80 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-700" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-900 bg-amber-200/80 border border-amber-400 px-2 py-0.5 rounded-full">
                    🏷️ DYNAMIC GLOBAL SETUP TAXONOMY
                  </span>
                </div>
                <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950 tracking-wide">
                  Shop by Category
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                  Browse precision categories dynamically configured in ERP Global Setup. Click any card to enter the full shop.
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => scrollContainer(categoriesScrollRef, 'left')}
                  className="w-10 h-10 rounded-full bg-white hover:bg-amber-100 border border-amber-300 shadow-xs flex items-center justify-center text-slate-800 hover:text-slate-950 transition-all cursor-pointer"
                  aria-label="Previous Categories"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollContainer(categoriesScrollRef, 'right')}
                  className="w-10 h-10 rounded-full bg-white hover:bg-amber-100 border border-amber-300 shadow-xs flex items-center justify-center text-slate-800 hover:text-slate-950 transition-all cursor-pointer"
                  aria-label="Next Categories"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateToShop('ALL')}
                  className="ml-2 text-xs font-black uppercase tracking-wider text-amber-900 hover:text-amber-700 underline flex items-center gap-1 cursor-pointer"
                >
                  <span>All Categories</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Horizontal Categories Cards Track */}
            <div
              ref={categoriesScrollRef}
              className="flex items-stretch gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-4 pt-2 px-1 snap-x snap-mandatory"
            >
              {dynamicCategories.map(cat => (
                <button
                  key={cat.id || cat.slug}
                  type="button"
                  onClick={() => navigateToShop(cat.slug || cat.name)}
                  className="shrink-0 w-52 sm:w-60 snap-start p-5 rounded-2xl bg-gradient-to-br from-white via-[#FDF9EE] to-[#F5ECCE] border-2 border-amber-300 hover:border-amber-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-400 border border-amber-400/80 flex items-center justify-center text-2xl shadow-xs group-hover:scale-110 transition-transform">
                      {getCategoryIcon(cat.name || cat.slug)}
                    </div>
                    <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 group-hover:bg-amber-400 group-hover:text-slate-950 transition-colors">
                      1-of-1 Vault
                    </span>
                  </div>
                  <div>
                    <h4 className="font-serif font-black text-slate-950 text-base group-hover:text-amber-800 transition-colors">
                      {cat.name}
                    </h4>
                    <p className="text-[11px] text-slate-600 font-medium mt-1 flex items-center gap-1 group-hover:text-slate-900">
                      <span>Explore Collection</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* 11. COMPLETE 1-OF-1 VAULT ARCHIVE CTA BANNER */}
          <section className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-950 text-white py-14 px-6 shadow-2xl relative overflow-hidden border-y-2 border-amber-400">
            <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="max-w-4xl mx-auto text-center relative z-10 space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 border border-white/40 text-amber-200 text-[11px] font-black uppercase tracking-widest backdrop-blur-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Complete 1-of-1 Vault Catalog
              </span>
              <h3 className="text-2xl sm:text-4xl font-black font-serif text-white leading-tight">
                Looking for Something Specific? Explore Our Full Shop Catalog
              </h3>
              <p className="text-xs sm:text-sm text-amber-100 max-w-2xl mx-auto leading-relaxed">
                Filter by garment size (XS to XXL), price bracket, archive segment, and brand with clean server-side pagination.
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => navigateToShop('ALL')}
                  className="px-8 py-4 bg-white hover:bg-amber-100 text-slate-950 font-black text-xs uppercase tracking-widest rounded-full shadow-2xl transition-all transform hover:-translate-y-1 flex items-center gap-2.5 mx-auto cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-900" />
                  <span>Open Dedicated Shop Page ({pieces.length} Pieces)</span>
                  <ArrowRight className="w-4 h-4 text-amber-900" />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

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
                href={companyProfile.social_links?.facebook || companyProfile.socialLinks?.facebook || 'https://www.facebook.com/vintagevibes.ae/'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                Facebook
              </a>
              <span>•</span>
              <a
                href={companyProfile.social_links?.instagram || companyProfile.socialLinks?.instagram || 'https://www.instagram.com/vintagevibes.llc/'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                Instagram
              </a>
              <span>•</span>
              <a
                href={companyProfile.social_links?.youtube || companyProfile.socialLinks?.youtube || 'https://www.youtube.com/@VintageVibesLLCSPC'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-700 font-bold hover:underline"
              >
                YouTube
              </a>
              <span>•</span>
              <a
                href={companyProfile.social_links?.tiktok || companyProfile.socialLinks?.tiktok || 'https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn'}
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
                  About {companyProfile.company_display_name || companyProfile.companyName || 'Vintage Vibes'}
                </h4>
              </div>
              <p className="text-slate-600 leading-relaxed text-xs">
                Discover premium, handpicked thrift and vintage fashion. Timeless branded pieces with quality, style, and great value, curated just for you.
              </p>
              <div className="pt-1">
                <span className="inline-block px-2.5 py-1 rounded-md bg-amber-200/80 border border-amber-400 text-[10px] font-black text-amber-950">
                  TRN: {companyProfile.trn_number || companyProfile.trnTaxNo}
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
                <li><a href={`mailto:${companyProfile.corporate_email || companyProfile.corporateEmail || companyProfile.email || 'sales@vintagevibesllcspc.com'}`} className="hover:text-amber-700">Contact Us</a></li>
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
                  <strong className="text-slate-900 font-mono">
                    {companyProfile.corporate_phone || companyProfile.corporatePhone || companyProfile.phone || '+971 55 418 6086'}
                  </strong>
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Monday – Sunday: 9:00 AM - 12:00 AM</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-amber-700" />
                  <a href={`mailto:${companyProfile.corporate_email || companyProfile.corporateEmail || companyProfile.email || 'sales@vintagevibesllcspc.com'}`} className="hover:underline">
                    {companyProfile.corporate_email || companyProfile.corporateEmail || companyProfile.email || 'sales@vintagevibesllcspc.com'}
                  </a>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {(companyProfile.address_line_1 || companyProfile.addressLine1 || 'House 14 Street 4 - Al Jimi - Al Nudood') +
                      (companyProfile.address_line_2 || companyProfile.addressLine2
                        ? ', ' + (companyProfile.address_line_2 || companyProfile.addressLine2)
                        : ', Abu Dhabi, UAE')}
                  </span>
                </p>
              </div>

              {/* Map embed / location widget */}
              <div className="mt-2 pt-2 border-t border-amber-300">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(
                    (companyProfile.company_display_name || companyProfile.companyName || 'Vintage Vibes') +
                    ' ' +
                    (companyProfile.address_line_1 || companyProfile.addressLine1 || 'House 14 Street 4 - Al Jimi - Al Nudood') +
                    ' ' +
                    (companyProfile.address_line_2 || companyProfile.addressLine2 || 'Al Ain UAE')
                  )}`}
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
          pixelTracking.trackInitiateCheckout([p], p.retailPriceAed || p.estimatedPrice || 295);
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

      {/* 16. GRAIL BOUNTY WISHLIST MODAL (SQL BACKED) */}
      {bountyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-gradient-to-b from-[#FFFFFF] to-[#FAF5EA] border-2 border-amber-400 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-slate-900 font-sans">
            <button
              onClick={() => setBountyModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-amber-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-amber-800 font-mono text-xs font-black uppercase tracking-wider mb-1">
                <span>🎯</span>
                <span>PRIVATE ARCHIVE SOURCING</span>
              </div>
              <h3 className="font-cinzel text-xl sm:text-2xl font-black text-amber-950">
                Request a Vintage Grail (Custom Sourcing)
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Can't find your coveted 90s band tee or archival Carhartt jacket? Post a bounty with our sourcing team. As soon as your grail is graded and scanned from incoming American bales, we will alert you on WhatsApp with first-look priority.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBountySubmitting(true);
                try {
                  const res = await fetch('/api/ecommerce/bounty', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bountyForm)
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    luxuryAudio.playWaxSealSound();
                    setSuccessToast({
                      title: '🎯 Grail Bounty Registered in SQL Database!',
                      subtitle: `We will alert ${bountyForm.customerPhone} on WhatsApp when your ${bountyForm.desiredBrand} arrives!`
                    });
                    setBountyModalOpen(false);
                    setBountyForm({
                      customerName: '',
                      customerPhone: '',
                      customerEmail: '',
                      desiredBrand: '',
                      desiredCategory: 'T-Shirts',
                      desiredSize: 'L (Boxy)',
                      maxBudgetAed: '',
                      notes: ''
                    });
                    setTimeout(() => setSuccessToast(null), 7000);
                  } else {
                    alert(data.error || 'Failed to submit bounty.');
                  }
                } catch (err: any) {
                  alert(err?.message || 'Error submitting bounty');
                } finally {
                  setBountySubmitting(false);
                }
              }}
              className="space-y-3.5 font-mono text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tariq Al Qasimi"
                    value={bountyForm.customerName}
                    onChange={e => setBountyForm({ ...bountyForm, customerName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">WhatsApp Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+971 50 000 0000"
                    value={bountyForm.customerPhone}
                    onChange={e => setBountyForm({ ...bountyForm, customerPhone: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Desired Brand / Band *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Carhartt Detroit, Nirvana, Harley"
                    value={bountyForm.desiredBrand}
                    onChange={e => setBountyForm({ ...bountyForm, desiredBrand: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Preferred Size</label>
                  <select
                    value={bountyForm.desiredSize}
                    onChange={e => setBountyForm({ ...bountyForm, desiredSize: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                  >
                    <option value="S">Small (S)</option>
                    <option value="M">Medium (M)</option>
                    <option value="L (Boxy)">Large (Boxy Vintage Fit)</option>
                    <option value="XL (Oversized)">XL (Oversized 90s Drape)</option>
                    <option value="XXL">XXL Big & Heavy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Max Budget (AED)</label>
                <input
                  type="number"
                  placeholder="e.g. 1500"
                  value={bountyForm.maxBudgetAed}
                  onChange={e => setBountyForm({ ...bountyForm, maxBudgetAed: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Special Details / Year / Era</label>
                <input
                  type="text"
                  placeholder="e.g. Must be 1994 In Utero with Single Stitch"
                  value={bountyForm.notes}
                  onChange={e => setBountyForm({ ...bountyForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={bountySubmitting}
                  className="w-full btn-3d btn-3d-amber py-3 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  <span>{bountySubmitting ? 'Recording in Database...' : '🎯 Submit Grail Bounty Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
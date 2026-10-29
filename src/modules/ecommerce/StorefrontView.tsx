import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PieceBreakdownItem } from '../purchase/purchase.types.ts';
import { CompanyProfile, StorefrontMarketingSlot } from '../setup/setup.types.ts';
import { DEFAULT_STOREFRONT_MARKETING_SLOTS } from '../../services/companyProfileService.ts';
import { ShopCatalogView, DynamicCategory } from './ShopCatalogView.tsx';
import { TagInspectModal } from './TagInspectModal.tsx';
import { BankQrModal } from './BankQrModal.tsx';
import { CheckoutModal } from './CheckoutModal.tsx';
import { CartDrawer } from './CartDrawer.tsx';
import { NextDropBanner } from './NextDropBanner.tsx';
import { GarmentInspectorModal } from './GarmentInspectorModal.tsx';
import { VintageFitGuideModal } from './VintageFitGuideModal.tsx';
import { CheckoutCustomerInfo } from './ecommerce.types.ts';
import { CustomerAuthModal } from './CustomerAuthModal.tsx';
import { CustomerPortalModal } from './CustomerPortalModal.tsx';
import { CrmRetailCustomer, CrmService } from '../../services/crmService.ts';
import {
  Sparkles,
  ShoppingBag,
  Search,
  Lock,
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
  X,
  User,
  Wallet,
  Crown,
  Cpu,
  Send,
  Volume2,
  VolumeX,
  Play,
  Pause
} from 'lucide-react';
import { Vintage3DLogo } from '../../components/Vintage3DLogo.tsx';
import { CompanyName3D } from '../../components/CompanyName3D.tsx';
import { DubaiLiveSoukTicker } from '../../components/DubaiLiveSoukTicker.tsx';
import { WinterMaaziStoryHero } from './WinterMaaziStoryHero.tsx';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';
import { SalesService } from '../../services/salesService.ts';
import { WhatsAppService } from '../../services/whatsappService.ts';
import { supabase } from '../../supabaseClient.ts';
import { pixelTracking } from '../../utils/pixelTracking.ts';
import { isPieceEvicted } from '../../services/queryClient.ts';
import { useStorefrontAnalytics } from '../../hooks/useStorefrontAnalytics.ts';

interface StorefrontMarketingCardProps {
  slot: StorefrontMarketingSlot;
  onNavigate: (category: string) => void;
}

const StorefrontMarketingCard: React.FC<StorefrontMarketingCardProps> = ({ slot, onNavigate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const rawUrl = (slot.videoUrl || '').trim();
  const resolvedVideoUrl = rawUrl.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//i, '/uploads/');
  const resolvedPosterUrl = (slot.posterUrl && !slot.posterUrl.includes('vintagevibesllcspc.com'))
    ? slot.posterUrl.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//i, '/uploads/')
    : '/gemini_video_poster_cce3aee5.jpg';
  const hasVideo = Boolean(resolvedVideoUrl);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !resolvedVideoUrl) return;
    vid.muted = true;
    setIsMuted(true);
    vid.load();
    const p = vid.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [resolvedVideoUrl]);

  const togglePlay = () => {
    if (!videoRef.current || !hasVideo) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  return (
    <div
      className="relative rounded-xl sm:rounded-2xl overflow-hidden shadow-xl border sm:border-2 border-amber-300 group bg-stone-950 aspect-[16/10] sm:aspect-[16/9] flex items-center justify-center cursor-pointer"
      onClick={hasVideo ? togglePlay : () => onNavigate(slot.categoryFilter || 'ALL')}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          src={resolvedVideoUrl}
          poster={resolvedPosterUrl}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          preload="metadata"
          onCanPlay={(e) => {
            const v = e.currentTarget;
            if (isPlaying && v.paused) {
              v.play().catch(() => {});
            }
          }}
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
        />
      ) : (
        <img
          src={resolvedPosterUrl}
          alt={slot.title || 'Vintage collection'}
          loading="lazy"
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
        />
      )}

      {/* Top Live Badge & Audio Toggle */}
      <div className="absolute top-1.5 left-1.5 right-1.5 sm:top-3 sm:left-3 sm:right-3 flex items-center justify-between pointer-events-none z-10">
        <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/70 text-amber-300 text-[8px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest shadow-xl truncate max-w-[75%]">
          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${hasVideo ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
          <span className="truncate">{slot.badge || 'Curated Drop'}</span>
        </span>
        {hasVideo && (
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 sm:p-2 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/60 text-amber-300 hover:text-white hover:bg-black/90 transition shadow-lg cursor-pointer pointer-events-auto shrink-0"
            title={isMuted ? "Tap to listen with sound" : "Mute audio"}
          >
            {isMuted ? <VolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />}
          </button>
        )}
      </div>

      {/* Play/Pause Overlay indicator when paused */}
      {hasVideo && !isPlaying && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-full bg-amber-500/90 text-stone-950 flex items-center justify-center shadow-2xl transform scale-110 transition">
            <Play className="w-4 h-4 sm:w-6 sm:h-6 fill-stone-950 ml-0.5 sm:ml-1" />
          </div>
        </div>
      )}

      {/* Bottom Luxury Marketing Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent flex items-end p-2 sm:p-5 z-10 pointer-events-none">
        <div className="w-full flex flex-col sm:flex-row sm:items-end justify-between gap-1 sm:gap-3">
          <div className="min-w-0">
            {slot.subtitle && (
              <span className="text-[7px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-amber-400 block mb-0.5 truncate">
                {slot.subtitle}
              </span>
            )}
            <h3 className="text-white font-serif font-black text-[11px] sm:text-lg leading-tight drop-shadow-md truncate">
              {slot.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(slot.categoryFilter || 'ALL');
            }}
            className="btn-3d btn-3d-amber text-[8px] sm:text-[11px] uppercase tracking-wider px-2 py-1 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl cursor-pointer pointer-events-auto shrink-0 self-start sm:self-auto flex items-center gap-1 sm:gap-1.5"
          >
            <span>{slot.buttonText || 'Shop Drop'}</span>
            <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

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
  // Silent Storefront Session Analytics & Traffic Engine
  useStorefrontAnalytics();

  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSegment, setSelectedSegment] = useState<string>('ALL');
  const [showNoticeBar, setShowNoticeBar] = useState<boolean>(true);
  const [isLiveStreamBroadcasting, setIsLiveStreamBroadcasting] = useState<boolean>(false);

  // Omnichannel Customer User Session (Supabase Auth + CRM Sync)
  const [customerUser, setCustomerUser] = useState<CrmRetailCustomer | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [portalModalOpen, setPortalModalOpen] = useState<boolean>(false);

  // Computed B2B status
  const isB2B = customerUser?.customer_type === 'B2B_RESELLER';

  // Initialize and listen for Supabase Customer Auth
  useEffect(() => {
    try {
      const cached = localStorage.getItem('vv_customer_session');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id) {
          setCustomerUser(parsed);
          if (parsed.auth_id) {
            CrmService.getCustomerByAuthId(parsed.auth_id).then(fresh => {
              if (fresh) {
                setCustomerUser(fresh);
                try {
                  localStorage.setItem('vv_customer_session', JSON.stringify(fresh));
                } catch (_) {}
              }
            });
          }
        }
      }
    } catch (_) {}

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        CrmService.getCustomerByAuthId(session.user.id).then(cust => {
          if (cust) {
            setCustomerUser(cust);
            try {
              localStorage.setItem('vv_customer_session', JSON.stringify(cust));
            } catch (_) {}
          } else {
            const userEmail = (session.user.email || '').toLowerCase();
            supabase
              .from('crm_retail_customers')
              .select('*')
              .eq('email', userEmail)
              .maybeSingle()
              .then(({ data }) => {
                if (data) {
                  const mapped: CrmRetailCustomer = {
                    id: String(data.id),
                    code: `CRM-${String(data.id).slice(0, 6).toUpperCase()}`,
                    name: data.name || userEmail.split('@')[0] || 'Collector',
                    email: data.email || userEmail,
                    phone: data.phone || '',
                    address: data.address || '',
                    auth_id: session.user.id,
                    customer_type: data.customer_type || 'RETAIL',
                    vip_tier: data.vip_tier || 'BRONZE',
                    wallet_balance: Number(data.wallet_balance || 0)
                  };
                  setCustomerUser(mapped);
                  try {
                    localStorage.setItem('vv_customer_session', JSON.stringify(mapped));
                  } catch (_) {}
                }
              });
          }
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const cust = await CrmService.getCustomerByAuthId(session.user.id);
        if (cust) {
          setCustomerUser(cust);
          try {
            localStorage.setItem('vv_customer_session', JSON.stringify(cust));
          } catch (_) {}
        }
      } else if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem('vv_customer_session');
        } catch (_) {}
        setCustomerUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

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
    // CDC Realtime listener for dynamic category changes & global inventory reservations
    const handleRealtime = (e: any) => {
      if (e.detail?.table === 'product_categories') {
        fetchDynamicCategories();
      }
      if (e.detail?.table === 'inventory_pieces') {
        const record = e.detail?.new || e.detail?.record;
        if (record) {
          const barcode = String(record.barcode || '').toLowerCase();
          const id = String(record.id || '').toLowerCase();
          const status = record.status;
          const isSold = Boolean(record.is_sold);

          if (status !== 'IN_STOCK' || isSold) {
            // Instantly vanish from public shop grid
            setPieces(prev => prev.filter(p =>
              p.barcode.toLowerCase() !== barcode &&
              String(p.id).toLowerCase() !== id
            ));
          } else if (status === 'IN_STOCK' && !isSold) {
            fetchAvailableStock();
          }
        }
      }
    };

    let lastHidden = Date.now();
    let wakeTimer: NodeJS.Timeout | null = null;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastHidden;
        if (elapsed < 30000) return; // Ignore brief switching under 30s
        if (wakeTimer) clearTimeout(wakeTimer);
        // Randomized jitter 0-2000ms to prevent Supabase thundering herd
        wakeTimer = setTimeout(() => {
          fetchAvailableStock();
          fetchDynamicCategories();
        }, Math.floor(Math.random() * 2000));
      }
    };

    window.addEventListener('vv:realtime-record', handleRealtime);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      if (wakeTimer) clearTimeout(wakeTimer);
      window.removeEventListener('vv:realtime-record', handleRealtime);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
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

  // Hero Slider State (Using fast local hosted assets on vintagevibesgk.com)
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const heroSlides = [
    {
      id: 0,
      image: '/gallery_flagship_boutique.jpg',
      label: 'Flagship Showroom',
      category: 'ALL',
      title: 'Premium Vintage Clothing Store in UAE',
      subtitle: 'Discover authentic vintage and second-hand clothing for men and women, curated for quality, style, and sustainability.'
    },
    {
      id: 1,
      image: '/vv_item_puffer_jackets.jpg',
      label: 'Jackets & Puffers',
      category: 'JACKETS',
      title: '90s Puffer, Leather Bomber & Carhartt Work Jackets',
      subtitle: 'Authentic The North Face puffers, distressed leather flight jackets, and shearling-collar Carhartt workwear in Al Ain & Dubai.'
    },
    {
      id: 2,
      image: '/vv_item_graphic_tees.jpg',
      label: '90s Graphic Tees',
      category: 'T-SHIRTS',
      title: 'Single-Stitch 90s Graphic & Carhartt Pocket Tees',
      subtitle: 'Hand-picked heavyweight vintage tees with authentic fade, original neck tags, and 1-of-1 Vintage Vibes grading.'
    },
    {
      id: 3,
      image: '/vv_item_hoodies_sweaters.jpg',
      label: 'Hoodies & Sweaters',
      category: 'HOODIES',
      title: 'Champion Reverse Weave, Nike Swoosh & Polo Knits',
      subtitle: 'Heavyweight vintage fleece hoodies, embroidered crewnecks, and timeless heritage knitwear curated for UAE winters.'
    },
    {
      id: 4,
      image: '/vv_item_caps_vault.jpg',
      label: 'Al Neyadi Caps',
      category: 'CAPS',
      title: 'Al Neyadi Vintage Caps & Retro Snapback Archive',
      subtitle: 'Explore the UAE’s largest curated wall of vintage corduroy snapbacks, 2-tone baseball caps, and rare trucker hats.'
    },
    {
      id: 5,
      image: '/vv_item_cargos_denim.jpg',
      label: 'Denim & Cargos',
      category: 'PANTS',
      title: 'Carhartt Double-Knee Work Pants & Levi’s 501 Denim',
      subtitle: 'Rugged vintage carpenter trousers, military cargo pants, and authentic faded USA selvedge denim.'
    }
  ];

  // Auto-slide effect every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Top Modeling & Picture-3 Studio Showcase + Full-Width Banner Slider State
  const topShowcaseItems = [
    {
      img: '/vv_studio_womens_vintage_dress.jpg',
      tag: 'Studio Editorial • 90s Women’s Archive',
      title: '90s Velvet & Lace Midi + Cropped Denim',
      subtitle: 'Sunlit Dubai studio lookbook featuring 1-of-1 90s romantic vintage dress layered with distressed Levi’s trucker denim.',
      priceBadge: 'From AED 95',
      category: 'ALL'
    },
    {
      img: '/vv_model_graphic_tees.jpg',
      tag: 'Editorial Fit • Single-Stitch',
      title: '90s Graphic & Carhartt Tees',
      subtitle: 'Harley-Davidson, 90s Band/Sport Tees & Heavyweight Carhartt Pocket Tees styled in our Al Ain & Dubai boutique.',
      priceBadge: 'From AED 45',
      category: 'T-SHIRTS'
    },
    {
      img: '/vv_studio_chair_jacket.jpg',
      tag: 'Studio Chair Showcase • 1-of-1 Grail',
      title: '1990s Varsity Leather & Wool Bomber',
      subtitle: 'Authentic chenille-patch varsity bomber jacket draped on our white studio chair with original Vintage Vibes gold tag.',
      priceBadge: 'From AED 140',
      category: 'JACKETS'
    },
    {
      img: '/vv_model_hoodies_sweaters.jpg',
      tag: 'Editorial Fit • Heavyweight Fleece',
      title: 'Champion, Nike & Polo Hoodies',
      subtitle: 'Reverse Weave Hoodies, Center-Swoosh Crewnecks & Cable-Knit Sweaters modeled in Downtown Dubai.',
      priceBadge: 'From AED 75',
      category: 'HOODIES'
    },
    {
      img: '/vv_studio_summer_retro_shirts.jpg',
      tag: 'Sunlit Studio Flat-Lay • 90s Silk & Rayon',
      title: '90s Cuban-Collar & Abstract Resort Shirts',
      subtitle: 'Vibrant 1990s colorblock, hibiscus & geometric retro button-downs curated for UAE sunshine.',
      priceBadge: 'From AED 55',
      category: 'T-SHIRTS'
    },
    {
      img: '/vv_model_puffer_jackets.jpg',
      tag: 'Editorial Fit • Winter Grail',
      title: 'Puffer, Leather & Carhartt Jackets',
      subtitle: 'The North Face 700 Puffers, Distressed Leather Bombers & Shearling Carhartt Detroit Work Jackets.',
      priceBadge: 'From AED 120',
      category: 'JACKETS'
    },
    {
      img: '/vv_studio_hands_dispatch.jpg',
      tag: 'Fresh Bale Drop • Ready For Dispatch',
      title: 'Hand-Graded 90s Eagle Single-Stitch Tee',
      subtitle: 'Every garment is steamed, measured pit-to-pit, authenticated, and tagged by our UAE curators before dispatch.',
      priceBadge: 'From AED 45',
      category: 'T-SHIRTS'
    },
    {
      img: '/vv_model_90s_tracksuits.jpg',
      tag: 'Editorial Fit • 90s Sportswear',
      title: '90s Colorblock Tracksuits',
      subtitle: 'Authentic Vintage Nylon Windbreakers, Retro Track Jackets & Matching Tear-Away Pants.',
      priceBadge: 'From AED 85',
      category: 'TRACKSUITS'
    },
    {
      img: '/vv_studio_hoodie_spotlight.jpg',
      tag: 'Unique 1-of-1 Highlight • Heavyweight',
      title: 'Distressed Charcoal 90s Boxy Hoodie',
      subtitle: 'Ultra-heavyweight 1990s vintage fleece with natural sun-fade, metallic aglets, and Vintage Vibes gold seal.',
      priceBadge: 'From AED 85',
      category: 'HOODIES'
    },
    {
      img: '/vv_model_caps_vault.jpg',
      tag: 'Editorial Fit • Al Neyadi Archive',
      title: 'Al Neyadi Vintage Caps Stock',
      subtitle: 'Rare Corduroy Snapbacks, 2-Tone Vintage Baseball Caps & Embroidered Trucker Hats.',
      priceBadge: 'From AED 35',
      category: 'CAPS'
    },
    {
      img: '/vv_studio_streetwear_duo.jpg',
      tag: 'Al Ain & Dubai Lookbook • Streetwear Duo',
      title: '90s Track Jacket, Graphic Tee & 501 Fit',
      subtitle: 'Full head-to-toe 1990s vintage streetwear fits modeled outside our Vintage Vibes UAE flagship.',
      priceBadge: 'From AED 80',
      category: 'ALL'
    },
    {
      img: '/vv_model_cargos_denim.jpg',
      tag: 'Editorial Fit • Selvedge & Workwear',
      title: 'Carhartt Double-Knee & Levi’s 501',
      subtitle: 'Authentic Faded Levi’s USA Denim, Dickies 874 & Vintage Olive Military Cargo Pants.',
      priceBadge: 'From AED 80',
      category: 'PANTS'
    }
  ];

  const [activeTopFeaturedIdx, setActiveTopFeaturedIdx] = useState<number>(0);
  const [topGridPage, setTopGridPage] = useState<number>(0); // 0 -> items 0..8, 1 -> items 3..11
  const [topSliderIndex, setTopSliderIndex] = useState<number>(0);
  const [isTopPaused, setIsTopPaused] = useState<boolean>(false);

  const stepTopFeatured = (dir: 'left' | 'right') => {
    setActiveTopFeaturedIdx(prev =>
      dir === 'right'
        ? (prev + 1) % topShowcaseItems.length
        : (prev - 1 + topShowcaseItems.length) % topShowcaseItems.length
    );
  };

  const stepTopBannerSlider = (dir: 'left' | 'right') => {
    setTopSliderIndex(prev =>
      dir === 'right'
        ? (prev + 1) % topShowcaseItems.length
        : (prev - 1 + topShowcaseItems.length) % topShowcaseItems.length
    );
  };

  useEffect(() => {
    if (isTopPaused) return;
    const timer = setInterval(() => {
      setActiveTopFeaturedIdx(prev => (prev + 1) % topShowcaseItems.length);
      setTopSliderIndex(prev => (prev + 1) % topShowcaseItems.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [isTopPaused, topShowcaseItems.length]);

  // Bottom Full-Width Luxury Archive Banner Slider State (Zero Scrollbar)
  const bottomArchiveItems = [
    {
      img: '/gallery_flagship_boutique.jpg',
      badge: 'Flagship Showroom',
      title: 'Al Ain & Dubai Boutique',
      desc: 'Walk-in luxury vintage experience with daily fresh bale drops.',
      cat: 'ALL'
    },
    {
      img: '/vv_studio_chair_jacket.jpg',
      badge: 'Studio Chair Grail',
      title: '90s Varsity & Leather Bomber',
      desc: 'Hand-selected 1990s varsity jackets with authentic chenille patches.',
      cat: 'JACKETS'
    },
    {
      img: '/vv_item_graphic_tees.jpg',
      badge: 'Vintage Vibes Tagged',
      title: '1990s Single-Stitch Tees Rack',
      desc: 'Authentic 90s graphic tees & Carhartt pocket tees with Vintage Vibes tags.',
      cat: 'T-SHIRTS'
    },
    {
      img: '/vv_studio_womens_vintage_dress.jpg',
      badge: 'Studio Modeling Lookbook',
      title: '90s Velvet Dress & Denim Fit',
      desc: 'Curated women’s 90s vintage dresses & cropped Levi’s denim jackets.',
      cat: 'ALL'
    },
    {
      img: '/vv_item_puffer_jackets.jpg',
      badge: 'Winter Grail Rack',
      title: 'Puffer, Leather & Carhartt Rack',
      desc: 'The North Face puffers, leather flight bombers & shearling work jackets.',
      cat: 'JACKETS'
    },
    {
      img: '/vv_studio_hands_dispatch.jpg',
      badge: 'Fresh Bale Dispatch',
      title: 'Authenticated & Ready To Ship',
      desc: 'Steamed, measured & inspected 1-of-1 vintage pieces ready for UAE delivery.',
      cat: 'T-SHIRTS'
    },
    {
      img: '/vv_item_hoodies_sweaters.jpg',
      badge: 'Authentic Archive Table',
      title: 'Champion, Nike & Polo Knit',
      desc: 'Heavyweight Reverse Weave hoodies, Swoosh crewnecks & cable-knits.',
      cat: 'HOODIES'
    },
    {
      img: '/vv_studio_summer_retro_shirts.jpg',
      badge: '90s Resort Archive',
      title: 'Cuban-Collar & Silk Retro Shirts',
      desc: 'Sunlit 1990s patterned rayon & silk button-downs with gold archive seal.',
      cat: 'T-SHIRTS'
    },
    {
      img: '/vv_item_90s_tracksuits.jpg',
      badge: '90s Sportswear Rack',
      title: 'Colorblock Nylon Tracksuits',
      desc: 'Vibrant 90s retro windbreaker jackets & matching tear-away track pants.',
      cat: 'TRACKSUITS'
    },
    {
      img: '/vv_studio_hoodie_spotlight.jpg',
      badge: '1-of-1 Store Highlight',
      title: 'Heavyweight Acid-Wash Hoodie',
      desc: 'Boxy 1990s vintage fleece spotlighted in our Dubai studio vault.',
      cat: 'HOODIES'
    },
    {
      img: '/vv_item_caps_vault.jpg',
      badge: 'Al Neyadi Archive',
      title: '49-Cube Vintage Caps Wall',
      desc: 'Corduroy snapbacks, 2-tone baseball caps & vintage embroidered hats.',
      cat: 'CAPS'
    },
    {
      img: '/vv_studio_streetwear_duo.jpg',
      badge: 'UAE Streetwear Duo',
      title: 'Al Ain & Dubai Modeling Fit',
      desc: '90s colorblock track jacket, single-stitch tee & baggy Levi’s 501 denim.',
      cat: 'ALL'
    },
    {
      img: '/vv_item_cargos_denim.jpg',
      badge: 'Grade A+ Bottoms Table',
      title: 'Carhartt Double-Knee & 501',
      desc: 'Rugged carpenter work pants, olive military cargos & USA Levi’s denim.',
      cat: 'PANTS'
    },
    {
      img: '/gallery_streetwear_grail_rack.jpg',
      badge: 'Gold Boutique Rail',
      title: 'Carhartt Detroit & 90s Tees',
      desc: 'Hand-graded faded olive canvas workwear & vintage graphic tees.',
      cat: 'JACKETS'
    },
    {
      img: '/gallery_curated_denim_vault.jpg',
      badge: '100% Authentic Brass Seal',
      title: 'Selvedge Denim & Caps Counter',
      desc: 'Stacked vintage Levi’s 501 denim, folded crewnecks & retro caps.',
      cat: 'PANTS'
    },
    {
      img: '/gallery_dubai_editorial_lookbook.jpg',
      badge: 'UAE Street Lookbook',
      title: 'Golden-Hour UAE Campaign',
      desc: 'Oversized 90s varsity & workwear styled across the Emirates.',
      cat: 'ALL'
    }
  ];

  const [bottomSliderIndex, setBottomSliderIndex] = useState<number>(0);
  const [isArchivePaused, setIsArchivePaused] = useState(false);

  const scrollArchiveSlider = (dir: 'left' | 'right') => {
    setBottomSliderIndex(prev =>
      dir === 'right'
        ? (prev + 1) % bottomArchiveItems.length
        : (prev - 1 + bottomArchiveItems.length) % bottomArchiveItems.length
    );
  };

  useEffect(() => {
    if (isArchivePaused) return;
    const timer = setInterval(() => {
      setBottomSliderIndex(prev => (prev + 1) % bottomArchiveItems.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [isArchivePaused, bottomArchiveItems.length]);

  // Active Storefront Marketing Drops Slots (4 Dynamic Slots from DB)
  const activeMarketingSlots = useMemo<StorefrontMarketingSlot[]>(() => {
    const raw = (
      companyProfile?.storefrontMarketingSlots?.length ? companyProfile.storefrontMarketingSlots :
      companyProfile?.storefront_marketing_slots?.length ? companyProfile.storefront_marketing_slots :
      DEFAULT_STOREFRONT_MARKETING_SLOTS
    );
    return raw.filter(s => s.isEnabled !== false);
  }, [companyProfile?.storefrontMarketingSlots, companyProfile?.storefront_marketing_slots]);

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

  // Instant WhatsApp Concierge Modal State (No Web Login Needed)
  const [isConciergeModalOpen, setIsConciergeModalOpen] = useState(false);
  const [conciergeForm, setConciergeForm] = useState({
    name: '',
    phone: '',
    message: ''
  });
  const [isSubmittingConcierge, setIsSubmittingConcierge] = useState(false);
  const [conciergeSuccess, setConciergeSuccess] = useState(false);

  const handleConciergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conciergeForm.phone.trim()) return;
    setIsSubmittingConcierge(true);
    try {
      const res = await WhatsAppService.sendStorefrontInquiry({
        customerName: conciergeForm.name.trim() || 'Store Visitor',
        customerPhone: conciergeForm.phone.trim(),
        message: conciergeForm.message.trim() || 'Inquiring about store catalog and vintage pieces.'
      });
      if (res.success) {
        setConciergeSuccess(true);
      } else {
        const cleanNumber = (companyProfile?.whatsapp_orders_number || '971554186086').replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent('Hello Vintage Vibes, I am ' + conciergeForm.name + ': ' + conciergeForm.message)}`, '_blank');
        setIsConciergeModalOpen(false);
      }
    } catch (_) {
      const cleanNumber = (companyProfile?.whatsapp_orders_number || '971554186086').replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent('Hello Vintage Vibes, I am ' + conciergeForm.name + ': ' + conciergeForm.message)}`, '_blank');
      setIsConciergeModalOpen(false);
    } finally {
      setIsSubmittingConcierge(false);
    }
  };

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
          const available = data.filter(p => !p.isSold && p.status === 'IN_STOCK' && !isPieceEvicted(p.barcode) && !isPieceEvicted(p.id) && (p.readyForEcommerce === undefined || p.readyForEcommerce === null || p.readyForEcommerce === true));
          setPieces(available);
          return;
        }
      }

      // 2. Secondary: Supabase client
      const { data: supaData } = await supabase
        .from('inventory_pieces')
        .select('*')
        .eq('is_sold', false)
        .eq('status', 'IN_STOCK')
        .or('ready_for_ecommerce.is.null,ready_for_ecommerce.eq.true')
        .order('created_at', { ascending: false })
        .limit(100);

      if (Array.isArray(supaData)) {
        const available = supaData.map((r: any) => ({
          id: r.id || r.barcode,
          barcode: r.barcode,
          sku: r.sku || r.barcode,
          itemId: r.item_id || 'ITM-01',
          itemName: r.item_name || 'Vintage Garment',
          parentCategoryName: r.parent_category_name || null,
          brandId: r.brand_id,
          brandName: r.brand_name || 'Vintage Archive',
          sizeScanned: r.size_scanned || 'L',
          countryOfOrigin: r.country_of_origin || r.global_insights?.country_of_origin || 'USA',
          style: r.style || 'Single-Stitch Vintage',
          ecommerceDescription: r.ecommerce_description || r.style || '',
          seoTags: Array.isArray(r.seo_tags) ? r.seo_tags : [],
          readyForEcommerce: r.ready_for_ecommerce !== false,
          frontImageUrl: r.front_image_url || r.tag_image_url || '/gallery_streetwear_grail_rack.jpg',
          backImageUrl: r.back_image_url || r.front_image_url || '/gallery_flagship_boutique.jpg',
          tagImageUrl: r.tag_image_url || '/gallery_curated_denim_vault.jpg',
          washTagImageUrl: r.global_insights?.wash_tag_image_url || r.global_insights?.washTagImageUrl || '',
          labelGrade: r.label_grade || 'Grade A+ (Pristine)',
          brandTier: r.brand_tier || 'Grail',
          shopLocation: r.shop_name || r.shop_location || 'Al Ain Vintage Hub',
          pitToPitInches: r.pit_to_pit_inches ? Number(r.pit_to_pit_inches) : (r.global_insights?.measurements?.pitToPit ? Number(r.global_insights.measurements.pitToPit) : undefined),
          lengthInches: r.length_inches ? Number(r.length_inches) : (r.global_insights?.measurements?.length ? Number(r.global_insights.measurements.length) : undefined),
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
        })).filter((p: any) => !p.isSold && p.status === 'IN_STOCK' && !isPieceEvicted(p.barcode) && !isPieceEvicted(p.id) && (p.readyForEcommerce === undefined || p.readyForEcommerce === null || p.readyForEcommerce === true));
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

    // 1. Critical Global Pessimistic Reservation in Supabase:
    // UPDATE inventory_pieces SET status = 'RESERVED' WHERE id = [piece_id] AND status = 'IN_STOCK'
    try {
      await SalesService.reservePiece({ id: piece.id, barcode: piece.barcode });
    } catch (reserveErr: any) {
      luxuryAudio.playMechanicalClick();
      setSuccessToast({
        title: '⚠️ Piece Unavailable',
        subtitle: reserveErr?.message || 'Item already reserved by another user.'
      });
      setTimeout(() => setSuccessToast(null), 5000);
      // Immediately vanish from public pieces grid since it is unavailable
      setPieces(prev => prev.filter(p => p.barcode !== piece.barcode && p.id !== piece.id));
      return;
    }

    // 2. Also register 10-minute cart reservation in SQL backend for session tracking
    fetch('/api/ecommerce/cart/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barcode: piece.barcode,
        sessionId,
        pieceTitle: piece.itemName || piece.brandName,
        priceAed: piece.estimatedPrice || piece.retailPriceAed || 295
      })
    }).catch(() => {});

    // Instantly remove piece from local available stock grid
    setPieces(prev => prev.filter(p => p.barcode !== piece.barcode && p.id !== piece.id));

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
      subtitle: '1-of-1 Vault reservation locked for 10 minutes.'
    });
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRemoveFromCart = async (barcode: string) => {
    // 1. Revert reservation in Supabase: UPDATE inventory_pieces SET status = 'IN_STOCK' WHERE id = [piece_id]
    try {
      await SalesService.releasePiece(barcode);
    } catch (err) {
      console.warn('Error releasing reservation:', err);
    }

    // 2. Release SQL reservation endpoint
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

    // Refresh stock so released piece returns to view
    fetchAvailableStock();
  };

  const handleCartTimerExpired = async () => {
    if (cart.length === 0) return;
    const piecesToRelease = [...cart];
    setCart([]);
    try {
      localStorage.removeItem('vv_cart_items');
    } catch (_) {}
    setIsCartOpen(false);

    for (const item of piecesToRelease) {
      await SalesService.releasePiece({ id: item.id, barcode: item.barcode }).catch(() => {});
      fetch('/api/ecommerce/cart/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: item.barcode, sessionId })
      }).catch(() => {});
    }

    setSuccessToast({
      title: '⏳ Vault Reservation Expired',
      subtitle: 'Your 10-minute hold has expired. Items have been released back to stock.'
    });
    setTimeout(() => setSuccessToast(null), 5000);
    fetchAvailableStock();
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
      const walletAmountUsed = (customerInfo as any)?.walletAmountUsed || 0;
      const checkoutRes = await fetch('/api/ecommerce/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerInfo?.name || customerUser?.name || 'Online Boutique Collector',
          customerPhone: customerInfo?.phone || customerUser?.phone || '+971 50 000 0000',
          customerEmail: customerInfo?.email || customerUser?.email || '',
          shippingAddress: customerInfo?.shippingAddress || customerUser?.address || '',
          city: customerInfo?.city || customerInfo?.emirate || 'Dubai',
          country: 'UAE',
          items: piecesToBuy.map(piece => ({
            pieceId: piece.id,
            barcode: piece.barcode,
            description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'L'}) - Ref ${paymentRef || paymentMethod}`,
            weightKg: piece.weightKg || 0.4,
            unitPrice: isB2B
              ? Math.round((piece.estimatedPrice || piece.retailPriceAed || 295) * 0.8)
              : (piece.estimatedPrice || piece.retailPriceAed || 295)
          })),
          paymentMethod,
          paymentRef,
          sessionId,
          customerId: customerUser?.id,
          customerType: customerUser?.customer_type || 'RETAIL',
          walletAmountUsed
        })
      });

      if (customerUser && walletAmountUsed > 0) {
        setCustomerUser(prev => prev ? {
          ...prev,
          wallet_balance: Math.max(0, Number(prev.wallet_balance || 0) - walletAmountUsed)
        } : null);
      }

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
        let errMessage = 'Checkout could not be processed. Please try again.';
        try {
          const errData = await checkoutRes.json();
          if (errData?.error) errMessage = errData.error;
        } catch (_) {}

        if (checkoutRes.status === 409) {
          alert(`⚠️ Piece Unavailable: ${errMessage}`);
          loadStorefrontPieces();
          return;
        }

        if (checkoutRes.status >= 400 && checkoutRes.status < 500) {
          alert(`⚠️ Checkout Error: ${errMessage}`);
          return;
        }

        // Only on upstream network/server failure (502/503), queue offline fallback order
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
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#FDF9EE]/95 via-[#F5ECCE]/95 to-[#FAF4E6]/95 backdrop-blur-xl border-b-2 border-amber-400/80 px-3 sm:px-8 py-2 sm:py-3 flex items-center justify-between shadow-xl">
        {/* Left: 3D Animated Gold Medal Logo + Brand Title (Clickable Home Link) */}
        <div
          onClick={navigateToHome}
          className="flex items-center gap-2 sm:gap-4 cursor-pointer group min-w-0"
          title="Return to Vintage Vibes Storefront Homepage"
        >
          <div className="relative shrink-0 flex items-center group-hover:scale-105 transition-transform">
            <Vintage3DLogo
              size="lg"
              interactive={true}
              className="w-10 h-10 sm:w-14 sm:h-14 drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)]"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <CompanyName3D name={companyProfile.company_display_name || companyProfile.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'} size="lg" />
              <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 rounded-md text-amber-950 shadow-2xs">
                {(companyProfile.city || 'AL AIN, ABU DHABI').toUpperCase()} • {(companyProfile.country || 'UNITED ARAB EMIRATES').toUpperCase()}
              </span>
            </div>
            <p className="hidden md:flex text-[11px] text-slate-700 font-semibold tracking-wide items-center gap-1.5 mt-0.5">
              <span>{companyProfile.address_line_1 || companyProfile.addressLine1 || 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE'}</span>
              <span>•</span>
              <span className="text-amber-900 font-bold">{companyProfile.corporate_phone || companyProfile.phone || '+971554186086'}</span>
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

          {/* CUSTOMER PORTAL / SIGN IN BUTTON */}
          {customerUser ? (
            <button
              type="button"
              id="btn-customer-account"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setPortalModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              title="Open My Customer Account & Order History"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline truncate max-w-[110px]">
                {customerUser.name.split(' ')[0]}
              </span>
              {isB2B && (
                <span className="hidden md:inline px-1.5 py-0.5 rounded text-[9px] bg-slate-950 text-amber-300 font-mono">
                  B2B
                </span>
              )}
              {Number(customerUser.wallet_balance || 0) > 0 && (
                <span className="hidden lg:inline px-1.5 py-0.5 rounded bg-white text-slate-950 font-mono text-[10px]">
                  🪙 {Number(customerUser.wallet_balance).toFixed(0)}
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              id="btn-customer-signin"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setAuthModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs uppercase tracking-wider rounded-xl border border-amber-400 shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Sign in or Register for Store Credit & B2B Wholesale"
            >
              <User className="w-3.5 h-3.5 text-amber-900" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}

          {/* ADD TO HOME SCREEN / INSTALL APP BUTTON (IPHONE, IPAD, ANDROID, DESKTOP) */}
          <button
            type="button"
            id="btn-install-pwa-app"
            onClick={() => {
              luxuryAudio.playMechanicalClick();
              try {
                localStorage.removeItem('vintage_pwa_prompt_dismissed_until');
              } catch (_) {}
              window.dispatchEvent(new Event('open_ios_install_guide'));
            }}
            className="px-2.5 sm:px-3 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl border border-amber-500 shadow-sm flex items-center gap-1 transition-all transform active:scale-95 cursor-pointer"
            title="Install Vintage Vibes App to iPhone, iPad or Android Home Screen"
          >
            <span>📲</span>
            <span className="hidden md:inline">Install App</span>
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
          isB2B={isB2B}
          customerUser={customerUser}
        />
      ) : (
        <>
          {/* 4. DYNAMIC HERO SLIDER (DIRECTLY FROM VINTAGEVIBESLLCSPC.COM) */}
          <section className="relative w-full h-[38vh] min-h-[260px] max-h-[340px] sm:h-[75vh] sm:min-h-[480px] sm:max-h-[750px] overflow-hidden bg-slate-950">
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

                <div className="relative z-20 h-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 sm:pb-0 flex flex-col items-center justify-center text-center text-white space-y-2 sm:space-y-5">
                  <span className="px-2.5 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[9px] sm:text-[11px] font-black uppercase tracking-widest backdrop-blur-xs">
                    Vintage Vibes General Trading LLC SPC
                  </span>

                  <h1 className="text-lg sm:text-4xl md:text-5xl lg:text-6xl font-black font-serif tracking-wide leading-tight max-w-4xl text-white drop-shadow-md">
                    {slide.title}
                  </h1>

                  <p className="text-xs sm:text-lg text-slate-200 max-w-2xl font-light leading-snug sm:leading-relaxed drop-shadow-xs line-clamp-2 sm:line-clamp-none">
                    {slide.subtitle}
                  </p>

                  <div className="pt-1 sm:pt-2 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigateToShop((slide as any).category || 'ALL')}
                      className="px-4 py-2 sm:px-8 sm:py-3.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-full shadow-2xl transition-all transform hover:-translate-y-1 hover:shadow-amber-500/40 flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>SHOP {(slide as any).label ? (slide as any).label.toUpperCase() : 'NOW'}</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
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
              className="absolute left-1.5 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-400 hover:text-slate-950 text-white border border-amber-400/50 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-xl"
              aria-label="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                setCurrentSlide(prev => (prev + 1) % heroSlides.length);
              }}
              className="absolute right-1.5 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-400 hover:text-slate-950 text-white border border-amber-400/50 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-xl"
              aria-label="Next Slide"
            >
              <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6" />
            </button>

            {/* Bottom Interactive Item Thumbnail Strip inside Hero */}
            <div className="absolute bottom-1.5 sm:bottom-5 inset-x-2 sm:inset-x-8 z-30 flex items-center justify-start sm:justify-center gap-1.5 sm:gap-3 overflow-x-auto pb-0.5 sm:pb-1">
              {heroSlides.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    luxuryAudio.playMechanicalClick();
                    setCurrentSlide(idx);
                  }}
                  className={`group flex items-center gap-1.5 sm:gap-2 p-0.5 sm:p-1 pr-2 sm:pr-3 rounded-lg sm:rounded-xl border backdrop-blur-md transition-all cursor-pointer shrink-0 ${
                    currentSlide === idx
                      ? 'bg-amber-400 text-slate-950 border-white shadow-[0_0_20px_rgba(245,158,11,0.6)] scale-105'
                      : 'bg-black/65 hover:bg-black/85 text-white border-amber-400/40 opacity-85 hover:opacity-100'
                  }`}
                >
                  <img
                    src={s.image}
                    alt={(s as any).label || s.title}
                    className="w-6 h-6 sm:w-10 sm:h-10 rounded-md sm:rounded-lg object-cover border border-black/20 shrink-0"
                  />
                  <span className="text-[8px] sm:text-[11px] font-black uppercase tracking-wider whitespace-nowrap">
                    {(s as any).label || `Slide ${idx + 1}`}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 4.5 FULL-WIDTH PICTURE-3 INTERACTIVE MODELING STUDIO SHOWCASE + FULL-WIDTH SLIDING BANNER (ZERO SCROLLBAR) */}
          <section
            className="relative w-full bg-gradient-to-b from-[#14110D] via-[#1C1711] to-[#221B13] pt-5 pb-6 sm:pt-10 sm:pb-14 px-2.5 sm:px-6 lg:px-10 border-b-2 border-amber-400 overflow-hidden"
            onMouseEnter={() => setIsTopPaused(true)}
            onMouseLeave={() => setIsTopPaused(false)}
          >
            <div className="w-full space-y-4 sm:space-y-9">
              {/* Top Section Header Bar */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-2.5 sm:gap-4 border-b border-amber-400/30 pb-3 sm:pb-5">
                <div className="space-y-1 sm:space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[9px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">100% Authentic Vintage Vibes UAE Modeling &amp; Studio Lookbook • 1-of-1 Vault</span>
                  </div>
                  <h2 className="text-lg sm:text-3xl md:text-4xl font-black font-serif text-white tracking-wide leading-snug">
                    Explore Vintage Vibes Signature Items &amp; Studio Modeling
                  </h2>
                  <p className="text-[11px] sm:text-sm text-amber-100/80 max-w-3xl leading-snug sm:leading-normal">
                    Click any photo in the 3&times;3 studio grid or use the Left/Right arrows to slide through our live UAE modeling lookbook &amp; hand-graded 1-of-1 items.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3">
                  {/* Main Arrow Controls for Top Section */}
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-black/60 border border-amber-400/50 rounded-full px-2 py-1 sm:px-2.5 sm:py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        luxuryAudio.playMechanicalClick();
                        stepTopFeatured('left');
                        stepTopBannerSlider('left');
                      }}
                      className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center font-black shadow-md transition-all cursor-pointer active:scale-95"
                      aria-label="Previous Modeling Slide"
                    >
                      <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <span className="text-[10px] sm:text-[11px] font-mono font-black text-amber-300 px-1.5 sm:px-2">
                      {activeTopFeaturedIdx + 1} / {topShowcaseItems.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        luxuryAudio.playMechanicalClick();
                        stepTopFeatured('right');
                        stepTopBannerSlider('right');
                      }}
                      className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center font-black shadow-md transition-all cursor-pointer active:scale-95"
                      aria-label="Next Modeling Slide"
                    >
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigateToShop('ALL')}
                    className="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider shadow-xl flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-transform active:scale-95"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Open Full Live Catalog ({pieces.length || '1-of-1'} Pieces)</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* PART A: PICTURE-3 STYLE FULL-WIDTH INTERACTIVE MODELING & STUDIO SHOWCASE (3x3 LEFT GRID + BIG CENTER ACTIVE SLIDE + 2 RIGHT STACKED PREVIEWS) */}
              {(() => {
                const activeItem = topShowcaseItems[activeTopFeaturedIdx] || topShowcaseItems[0];
                const nextItem1 = topShowcaseItems[(activeTopFeaturedIdx + 1) % topShowcaseItems.length];
                const nextItem2 = topShowcaseItems[(activeTopFeaturedIdx + 2) % topShowcaseItems.length];
                const gridStart = topGridPage === 0 ? 0 : 3;
                const gridItems = topShowcaseItems.slice(gridStart, gridStart + 9);

                return (
                  <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-stretch bg-[#181410] p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-amber-400/70 shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
                    {/* LEFT COLUMN: 3x3 Interactive Studio & Modeling Photo Grid (Like Picture 3) */}
                    <div className="order-2 lg:order-1 lg:col-span-4 flex flex-col justify-between bg-[#120F0C] rounded-xl sm:rounded-2xl p-2 sm:p-4 border border-amber-400/30">
                      <div className="flex items-center justify-between pb-2 sm:pb-3 mb-1.5 sm:mb-2 border-b border-white/10">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="text-sm sm:text-lg font-black text-white tracking-wide">
                            Photos
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-[9px] sm:text-[10px] font-black uppercase">
                            {topShowcaseItems.length} Studio Fits
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            luxuryAudio.playMechanicalClick();
                            setTopGridPage(prev => (prev === 0 ? 1 : 0));
                          }}
                          className="text-[11px] sm:text-xs font-bold text-sky-400 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>{topGridPage === 0 ? 'See more photos' : 'Back to first 9'}</span>
                          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 flex-1">
                        {gridItems.map((gItem, idx) => {
                          const realIdx = gridStart + idx;
                          const isSelected = realIdx === activeTopFeaturedIdx;
                          return (
                            <button
                              key={realIdx}
                              type="button"
                              onClick={() => {
                                luxuryAudio.playMechanicalClick();
                                setActiveTopFeaturedIdx(realIdx);
                              }}
                              className={`group relative aspect-square rounded-lg sm:rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${
                                isSelected
                                  ? 'ring-2 sm:ring-3 ring-amber-400 scale-[1.02] shadow-[0_0_20px_rgba(245,158,11,0.6)] z-10'
                                  : 'border border-white/15 opacity-85 hover:opacity-100 hover:border-amber-400/70'
                              }`}
                            >
                              <img
                                src={gItem.img}
                                alt={gItem.title}
                                loading="eager"
                                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                              <span className="absolute bottom-1 left-1 right-1 sm:left-1.5 sm:right-1.5 text-[8px] sm:text-[9px] font-black text-amber-200 truncate text-left drop-shadow-xs">
                                {gItem.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Mini Bottom Controls Under 3x3 Grid */}
                      <div className="pt-2 sm:pt-3 mt-1.5 sm:mt-2 border-t border-white/10 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300">
                        <span>Tap any tile to inspect fit</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTopGridPage(0)}
                            className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black cursor-pointer ${
                              topGridPage === 0 ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-white'
                            }`}
                          >
                            1–9
                          </button>
                          <button
                            type="button"
                            onClick={() => setTopGridPage(1)}
                            className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black cursor-pointer ${
                              topGridPage === 1 ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-white'
                            }`}
                          >
                            4–12
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* CENTER COLUMN: Large Featured Active Studio/Modeling Photo with Left/Right Arrows, Round Gold Seal & Cream Bottom Bar (Like Picture 3) */}
                    <div className="order-1 lg:order-2 lg:col-span-5 relative rounded-xl sm:rounded-2xl overflow-hidden border-2 border-amber-400 bg-slate-950 flex flex-col justify-between h-[235px] sm:h-auto sm:min-h-[520px] shadow-2xl group">
                      <div
                        onClick={() => navigateToShop(activeItem.category)}
                        className="relative flex-1 w-full h-full overflow-hidden cursor-pointer"
                      >
                        <img
                          key={activeItem.img}
                          src={activeItem.img}
                          alt={activeItem.title}
                          className="w-full h-full object-cover transition-all duration-700 transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

                        {/* Top Category & Price Badges */}
                        <div className="absolute top-2 left-2 right-2 sm:top-3.5 sm:left-3.5 sm:right-3.5 flex items-center justify-between gap-2 z-20">
                          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/80 text-amber-300 text-[8px] sm:text-xs font-black uppercase tracking-wider truncate max-w-[65%]">
                            {activeItem.tag}
                          </span>
                          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-amber-400 text-slate-950 text-[8px] sm:text-xs font-black uppercase tracking-wider shadow-lg shrink-0">
                            {activeItem.priceBadge}
                          </span>
                        </div>

                        {/* Round Vintage Vibes Gold Seal in Bottom-Left + Overlay Title */}
                        <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 flex items-end justify-between gap-2 sm:gap-3 z-20">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-slate-950 via-[#1E1912] to-slate-900 border-2 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.5)] flex flex-col items-center justify-center text-center p-0.5 sm:p-1 shrink-0">
                              <span className="text-[5px] sm:text-[7px] font-black uppercase tracking-widest text-amber-300 leading-none">
                                VINTAGE
                              </span>
                              <span className="text-[8px] sm:text-[11px] font-black font-serif text-amber-400 tracking-wider leading-tight">
                                VIBES
                              </span>
                              <span className="text-[5px] sm:text-[6px] font-bold uppercase tracking-widest text-amber-200/90 leading-none">
                                UAE • 1-OF-1
                              </span>
                            </div>
                            <div className="space-y-0.5 min-w-0">
                              <h3 className="text-sm sm:text-2xl font-black font-serif text-white drop-shadow-md leading-tight truncate sm:whitespace-normal">
                                {activeItem.title}
                              </h3>
                              <p className="text-[10px] sm:text-xs text-slate-200 line-clamp-1 sm:line-clamp-2 max-w-md">
                                {activeItem.subtitle}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Prominent Left & Right Sliding Arrows on Center Showcase */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          luxuryAudio.playMechanicalClick();
                          stepTopFeatured('left');
                        }}
                        className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-black/75 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border sm:border-2 border-amber-400 flex items-center justify-center shadow-2xl transition-all cursor-pointer active:scale-90"
                        aria-label="Previous Featured Photo"
                      >
                        <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          luxuryAudio.playMechanicalClick();
                          stepTopFeatured('right');
                        }}
                        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-black/75 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border sm:border-2 border-amber-400 flex items-center justify-center shadow-2xl transition-all cursor-pointer active:scale-90"
                        aria-label="Next Featured Photo"
                      >
                        <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6" />
                      </button>

                      {/* Picture-3 Style Cream Bottom Brand Strip */}
                      <div
                        onClick={() => navigateToShop(activeItem.category)}
                        className="bg-[#FAF4E6] text-slate-950 px-2.5 py-1.5 sm:px-4 sm:py-2.5 border-t sm:border-t-2 border-amber-400 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-100 transition-colors"
                      >
                        <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-900">
                          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-600 animate-pulse" />
                          <span>Shop This Look ({activeItem.category})</span>
                          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </span>
                        <span className="text-[10px] sm:text-sm font-mono font-bold tracking-wider sm:tracking-widest text-slate-800">
                          vintagevibesgk.com
                        </span>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: 2 Next-Up Preview Cards with Cream Bottom Bars (Side-by-side 2 cols on mobile, stacked on desktop lg) */}
                    <div className="order-3 lg:col-span-3 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 gap-2 sm:gap-4">
                      {[nextItem1, nextItem2].map((previewItem, pIdx) => {
                        const targetIdx = (activeTopFeaturedIdx + pIdx + 1) % topShowcaseItems.length;
                        return (
                          <div
                            key={pIdx}
                            onClick={() => {
                              luxuryAudio.playMechanicalClick();
                              setActiveTopFeaturedIdx(targetIdx);
                            }}
                            className="group relative rounded-xl sm:rounded-2xl overflow-hidden border sm:border-2 border-amber-400/70 hover:border-amber-400 bg-slate-950 flex flex-col justify-between cursor-pointer shadow-xl transition-all duration-300 hover:-translate-y-1"
                          >
                            <div className="relative h-[105px] sm:h-auto sm:aspect-[4/3] lg:aspect-auto lg:flex-1 overflow-hidden bg-slate-900 sm:min-h-[190px]">
                              <img
                                src={previewItem.img}
                                alt={previewItem.title}
                                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                              <span className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full bg-amber-400 text-slate-950 text-[8px] sm:text-[10px] font-black uppercase shadow">
                                {previewItem.priceBadge}
                              </span>

                              {/* Mini Round Gold Seal Badge in Bottom-Left */}
                              <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-2.5 sm:left-2.5 sm:right-2.5 flex items-center gap-1.5 sm:gap-2">
                                <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-slate-950 border border-amber-400 flex flex-col items-center justify-center text-center shrink-0 shadow-md">
                                  <span className="text-[5px] sm:text-[6px] font-black text-amber-300 leading-none">VV</span>
                                  <span className="text-[5px] sm:text-[7px] font-black text-amber-400 leading-none">UAE</span>
                                </div>
                                <span className="text-[10px] sm:text-xs font-black font-serif text-white drop-shadow truncate">
                                  {previewItem.title}
                                </span>
                              </div>
                            </div>

                            <div className="bg-[#FAF4E6] text-slate-950 px-2 py-1 sm:px-3 sm:py-1.5 border-t border-amber-400 flex items-center justify-between text-[9px] sm:text-[11px] font-bold">
                              <span className="text-amber-900 uppercase font-black text-[8px] sm:text-[10px]">
                                Next Fit #{pIdx + 1}
                              </span>
                              <span className="font-mono text-slate-700 tracking-tight sm:tracking-wider truncate">
                                vintagevibesgk.com
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>

          {/* 5. WINTER MAAZI COLLECTIONS & FOUNDER'S SON VOICE STORY */}
          {(companyProfile.virtual_host_enabled !== false && companyProfile.virtualHostEnabled !== false) && (
            <WinterMaaziStoryHero
              onExploreCollection={(category) => {
                navigateToShop(category || 'ALL');
              }}
              videoUrl={companyProfile.virtual_host_video_url !== undefined
                ? companyProfile.virtual_host_video_url
                : (companyProfile.virtualHostVideoUrl !== undefined
                  ? companyProfile.virtualHostVideoUrl
                  : '/mazi_video.mp4')}
              posterUrl={companyProfile.virtual_host_poster_url || companyProfile.virtualHostPosterUrl || '/winter_maazi_story.png'}
              badgeText={companyProfile.virtual_host_badge || companyProfile.virtualHostBadge}
              titleText={companyProfile.virtual_host_title || companyProfile.virtualHostTitle}
              subtitleText={companyProfile.virtual_host_subtitle || companyProfile.virtualHostSubtitle}
              ctaText={companyProfile.virtual_host_cta_text || companyProfile.virtualHostCtaText}
            />
          )}

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
          <section className="bg-gradient-to-b from-[#F5ECCE] via-[#FAF4E6] to-[#FAF4E6] py-5 sm:py-10 border-b-2 border-amber-300/80">
            <div className="max-w-7xl mx-auto px-2.5 sm:px-8 space-y-3.5 sm:space-y-6">
              <div className="text-center max-w-2xl mx-auto space-y-0.5 sm:space-y-1">
                <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest text-amber-900 block">
                  Curated Vintage Drops
                </span>
                <h2 className="text-lg sm:text-3xl font-black text-slate-900 font-serif">
                  Explore Our Live Collections &amp; Vault Banners
                </h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 gap-2.5 sm:gap-6">
                {activeMarketingSlots.map((slot, idx) => (
                  <StorefrontMarketingCard
                    key={slot.id || `slot_${idx + 1}`}
                    slot={slot}
                    onNavigate={navigateToShop}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* 9. SIGNATURE BRAND STORY & OFFSET GOLD BOXES (FROM LIVE WEBSITE) */}
      <section className="bg-gradient-to-b from-[#FAF4E6] via-[#FDF9EE] to-[#F5ECCE] py-8 sm:py-16 border-t-2 border-amber-300/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10 sm:space-y-20">
          {/* Row 1: About Vintage Vibes LLC SPC */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-12">
            <div className="flex-1 space-y-2.5 sm:space-y-4">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-700 block">
                A Local Store You Can Trust
              </span>
              <h2 className="text-lg sm:text-3xl md:text-4xl font-black text-slate-950 font-serif leading-tight">
                About Vintage Vibes LLC SPC
              </h2>
              <p className="text-xs sm:text-base text-slate-700 leading-relaxed">
                Vintage Vibes LLC SPC is a curated vintage clothing and thrift store in Al Ain, UAE, dedicated to bringing authentic pre-owned fashion to people who value quality, comfort, and individuality. We specialize in handpicked vintage and second-hand clothing for men and women, offering timeless styles that stand out from fast fashion trends.
              </p>
              <p className="text-xs sm:text-base text-slate-700 leading-relaxed">
                Located in Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE, we offer a welcoming in-store experience along with convenient pickup and delivery options. Whether you’re searching for a dependable used clothing store or a curated vintage shop, we’re here to help you discover pieces that feel unique and timeless.
              </p>
              <div className="pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="btn-3d btn-3d-amber px-4 py-2 sm:px-6 sm:py-3 text-[11px] sm:text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Visit Our Store
                </button>
              </div>
            </div>

            <div className="flex-1 flex justify-center w-full">
              <div className="relative w-full max-w-[480px] group">
                {/* Yellow/Gold Offset Backdrop Box */}
                <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 w-full h-full bg-gradient-to-br from-[#EAC05A] to-amber-500 rounded-2xl shadow-xl z-0 transition-transform duration-500 group-hover:translate-x-1 group-hover:translate-y-1" />
                <img
                  src="/gallery_flagship_boutique.jpg"
                  alt="Vintage Vibes Flagship Showroom Al Ain & Dubai UAE"
                  loading="lazy"
                  className="relative z-10 w-full h-[185px] sm:h-auto rounded-2xl border-2 border-slate-900 object-cover shadow-2xl"
                />
                <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 z-20 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-black/80 backdrop-blur-md border border-amber-400/50 flex items-center justify-between text-white">
                  <div>
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-amber-400 block">Al Ain &amp; Dubai Flagship</span>
                    <span className="text-[11px] sm:text-xs font-bold font-serif">Curated Vintage Showroom &amp; Archive</span>
                  </div>
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] sm:text-[10px] uppercase">1-of-1 Vault</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Shop Authentic Brands (Reverse Layout) */}
          <div className="flex flex-col md:flex-row-reverse items-center justify-between gap-6 sm:gap-12">
            <div className="flex-1 space-y-2.5 sm:space-y-4">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-700 block">
                Streetwear Essentials
              </span>
              <h2 className="text-lg sm:text-3xl md:text-4xl font-black text-slate-950 font-serif leading-tight">
                Shop Authentic Brands
              </h2>
              <p className="text-xs sm:text-base text-slate-700 leading-relaxed">
                We proudly offer popular vintage brands such as Carhartt, Dickies, Nike, and Ralph Lauren, making us a reliable vintage thrift shop for streetwear and workwear lovers. Whether you’re looking for jackets, hoodies, pants, or classic crewnecks, our collection delivers genuine pieces that reflect true vintage character.
              </p>
              <p className="text-xs sm:text-base text-slate-700 leading-relaxed">
                Vintage Vibes LLC SPC is more than just a thrift shop, it’s a destination for people who value unique vintage fashion and conscious shopping. We regularly update our inventory with fresh drops and rare finds. We offer authenticity, style, and value in every piece.
              </p>
              <div className="pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={scrollToVault}
                  className="btn-3d btn-3d-amber px-4 py-2 sm:px-6 sm:py-3 text-[11px] sm:text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Shop Streetwear
                </button>
              </div>
            </div>

            <div className="flex-1 flex justify-center w-full">
              <div className="relative w-full max-w-[480px] group">
                {/* Yellow/Gold Offset Backdrop Box */}
                <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 w-full h-full bg-gradient-to-br from-[#EAC05A] to-amber-500 rounded-2xl shadow-xl z-0 transition-transform duration-500 group-hover:translate-x-1 group-hover:translate-y-1" />
                <img
                  src="/gallery_streetwear_grail_rack.jpg"
                  alt="Authentic Carhartt, Nike & 90s Vintage Grail Rack"
                  loading="lazy"
                  className="relative z-10 w-full h-[185px] sm:h-auto rounded-2xl border-2 border-slate-900 object-cover shadow-2xl"
                />
                <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 z-20 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-black/80 backdrop-blur-md border border-amber-400/50 flex items-center justify-between text-white">
                  <div>
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-amber-400 block">Grail Workwear &amp; 90s Streetwear</span>
                    <span className="text-[11px] sm:text-xs font-bold font-serif">Carhartt • Nike • Dickies • Single-Stitch</span>
                  </div>
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] sm:text-[10px] uppercase">Grade A+</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: 100% FULL-WIDTH NON-SCROLLBAR LUXURY ARCHIVE & RACK BANNER SLIDER */}
        <div
          className="w-full px-2.5 sm:px-6 lg:px-10 pt-8 sm:pt-14 mt-8 sm:mt-14 border-t-2 border-amber-300/80 space-y-4 sm:space-y-6 overflow-hidden"
          onMouseEnter={() => setIsArchivePaused(true)}
          onMouseLeave={() => setIsArchivePaused(false)}
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
            <div className="space-y-1 sm:space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-amber-400/25 border border-amber-500/60 text-amber-950 text-[9px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest">
                ✨ Full-Width Auto-Sliding Store, Studio &amp; Rack Archive Gallery
              </span>
              <h2 className="text-lg sm:text-4xl font-black text-slate-950 font-serif">
                Inside the Vintage Vibes Luxury Archive
              </h2>
              <p className="text-[11px] sm:text-sm text-slate-600 max-w-2xl">
                Use the Left/Right arrows to slide across our Al Ain &amp; Dubai showroom racks, studio chair grails, graded denim tables, and 49-cube cap archive.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  scrollArchiveSlider('left');
                }}
                className="w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-slate-950 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border-2 border-amber-400 flex items-center justify-center shadow-xl transition-all cursor-pointer active:scale-95"
                aria-label="Slide Left"
              >
                <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6" />
              </button>
              <span className="text-[10px] sm:text-xs font-mono font-black text-slate-900 bg-amber-300/60 border border-amber-400 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full">
                {bottomSliderIndex + 1} / {bottomArchiveItems.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  scrollArchiveSlider('right');
                }}
                className="w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-slate-950 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border-2 border-amber-400 flex items-center justify-center shadow-xl transition-all cursor-pointer active:scale-95"
                aria-label="Slide Right"
              >
                <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* 100% Full-Width Non-Scrollbar Sliding Window with Side Floating Arrows */}
          <div className="relative w-full overflow-hidden">
            <button
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                scrollArchiveSlider('left');
              }}
              className="flex absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-950/90 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border sm:border-2 border-amber-400 items-center justify-center shadow-2xl transition-all cursor-pointer active:scale-90"
              aria-label="Previous Archive Slide"
            >
              <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                scrollArchiveSlider('right');
              }}
              className="flex absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-950/90 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border sm:border-2 border-amber-400 items-center justify-center shadow-2xl transition-all cursor-pointer active:scale-90"
              aria-label="Next Archive Slide"
            >
              <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6" />
            </button>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-5 w-full">
              {[0, 1, 2, 3, 4].map((offset) => {
                const cIdx = (bottomSliderIndex + offset) % bottomArchiveItems.length;
                const card = bottomArchiveItems[cIdx];
                const visibilityClass =
                  offset <= 1
                    ? 'flex'
                    : offset === 2
                    ? 'hidden md:flex'
                    : offset === 3
                    ? 'hidden lg:flex'
                    : 'hidden xl:flex';
                return (
                  <div
                    key={`${cIdx}-${offset}`}
                    onClick={() => navigateToShop(card.cat)}
                    className={`${visibilityClass} group relative rounded-xl sm:rounded-2xl overflow-hidden border sm:border-2 border-amber-400/90 bg-slate-950 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer flex-col transform hover:-translate-y-1`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                      <img
                        src={card.img}
                        alt={card.title}
                        loading="lazy"
                        className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                      <span className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/70 text-amber-300 text-[8px] sm:text-[10px] font-black uppercase tracking-wider truncate max-w-[90%]">
                        {card.badge}
                      </span>
                    </div>
                    <div className="p-2.5 sm:p-4 bg-gradient-to-b from-slate-950 to-[#1A1610] text-white flex-1 flex flex-col justify-between space-y-1.5 sm:space-y-3">
                      <div>
                        <h3 className="text-xs sm:text-base font-black font-serif text-amber-300 group-hover:text-amber-200 transition-colors leading-tight">
                          {card.title}
                        </h3>
                        <p className="text-[10px] sm:text-xs text-slate-300 mt-0.5 sm:mt-1 leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                          {card.desc}
                        </p>
                      </div>
                      <div className="pt-1.5 sm:pt-2 border-t border-white/10 flex items-center justify-between text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-amber-400 group-hover:text-white transition-colors">
                        <span>Explore Collection</span>
                        <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Slide Indicator Dots for Bottom Full-Width Archive Slider */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {bottomArchiveItems.map((_, aIdx) => (
              <button
                key={aIdx}
                type="button"
                onClick={() => {
                  luxuryAudio.playMechanicalClick();
                  setBottomSliderIndex(aIdx);
                }}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  bottomSliderIndex === aIdx
                    ? 'w-7 bg-slate-950 shadow-sm'
                    : 'w-2 bg-amber-900/30 hover:bg-amber-900/60'
                }`}
                aria-label={`Go to archive slide ${aIdx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 10. EDITORIAL STATEMENT BANNER (WHERE FASHION MEETS SPORT) */}
      <section className="bg-gradient-to-r from-[#1A1A1A] via-[#2A2418] to-[#1A1A1A] text-white py-16 px-6 border-y-2 border-amber-400">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <span className="text-amber-400 text-xs font-black uppercase tracking-widest block">
            UAE Heritage & Street Culture
          </span>
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black font-serif text-amber-200">
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
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-950 font-serif">
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
                    {(companyProfile.address_line_1 || companyProfile.addressLine1 || 'Downtown, Al Qaseedah District') +
                      (companyProfile.address_line_2 || companyProfile.addressLine2
                        ? ', ' + (companyProfile.address_line_2 || companyProfile.addressLine2)
                        : ', 135 Khalifa Bin Zayed Street, Alain UAE')}
                  </span>
                </p>
              </div>

              {/* Map embed / location widget */}
              <div className="mt-2 pt-2 border-t border-amber-300">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(
                    (companyProfile.company_display_name || companyProfile.companyName || 'Vintage Vibes') +
                    ' ' +
                    (companyProfile.address_line_1 || companyProfile.addressLine1 || 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street') +
                    ' ' +
                    (companyProfile.address_line_2 || companyProfile.addressLine2 || 'Alain UAE')
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

          {/* ARCHITECT / CREATOR SIGNATURE CARD (Full-Column Cinematic Luxury Gold / Dark Glassmorphism) */}
          <div className="my-10 pt-10 border-t border-amber-400/40">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-[#0a0f1d] to-[#04060a] p-6 sm:p-10 border border-amber-500/50 shadow-[0_0_60px_rgba(245,158,11,0.15)] w-full max-w-5xl mx-auto text-center backdrop-blur-xl group hover:border-amber-400/80 transition-all duration-500">
              {/* Multi-layered ambient luxury gold lighting effects */}
              <div className="absolute -top-32 -left-32 w-72 h-72 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-32 -right-32 w-72 h-72 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center gap-6">
                {/* Header Title & Badges */}
                <div className="space-y-2.5">
                  <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/40 text-[11px] sm:text-xs uppercase font-extrabold tracking-[0.25em] text-amber-300 shadow-inner">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>System Architecture & Engineering Showcase</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 font-serif">
                    Enterprise Cloud & Technical Infrastructure
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium tracking-wide max-w-2xl mx-auto">
                    Next-Gen Garment Operating System • Real-Time Omnichannel Architecture • High-Density Inventory Matrix
                  </p>
                </div>

                {/* Full-Column Wide Cinematic Video Player */}
                <div className="relative w-full rounded-2xl overflow-hidden border-2 border-amber-400/60 shadow-[0_0_50px_rgba(245,158,11,0.25)] bg-black group/video transition-all duration-300 hover:border-amber-400">
                  {/* Floating Video Overlay Badges */}
                  <div className="absolute top-3 sm:top-4 left-3 sm:left-4 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/85 border border-amber-400/50 backdrop-blur-md text-[10px] sm:text-[11px] uppercase font-bold tracking-widest text-amber-300 shadow-lg pointer-events-none">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>LIVE SYSTEM DEMO</span>
                  </div>

                  <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/85 border border-amber-400/50 backdrop-blur-md text-[10px] font-mono font-bold text-amber-200 pointer-events-none">
                    <span>1080P HD • 60 FPS</span>
                  </div>

                  <video
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="w-full h-auto aspect-video object-cover rounded-2xl block shadow-inner bg-black"
                  >
                    <source src="/gemini_generated_video_cce3aee5.mp4" type="video/mp4" />
                    Your browser does not support HTML5 video playback.
                  </video>
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-400/30 pointer-events-none" />
                </div>

                {/* Architecture Highlights Pill Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl pt-1">
                  <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-amber-400/20 text-slate-300 text-xs font-semibold backdrop-blur-xs">
                    <span className="text-amber-400 font-bold">⚡</span>
                    <span>Real-Time Omnichannel Sync</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-amber-400/20 text-slate-300 text-xs font-semibold backdrop-blur-xs">
                    <span className="text-amber-400 font-bold">🧠</span>
                    <span>Multimodal AI Vision Studio</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-amber-400/20 text-slate-300 text-xs font-semibold backdrop-blur-xs">
                    <span className="text-amber-400 font-bold">🏛️</span>
                    <span>IFRS Double-Entry Ledger</span>
                  </div>
                </div>

                {/* Action Buttons (Full-Width Responsive Link Hub) */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2 w-full">
                  <a
                    href="https://wa.me/923022190822?text=Hello%20Murtaza,%20I%20am%20interested%20in%20your%20custom%20ERP%20and%20cloud%20solutions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black text-xs sm:text-sm tracking-wider uppercase shadow-xl shadow-amber-500/25 hover:shadow-amber-500/50 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer border border-amber-200"
                  >
                    <MessageCircle className="w-4 h-4 fill-slate-950 shrink-0" />
                    <span>Direct Chat with System Architect (+92 302 2190822)</span>
                  </a>

                  <a
                    href="/technology.html"
                    className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-slate-900/90 text-amber-400 font-bold text-xs sm:text-sm tracking-wider uppercase hover:bg-slate-800 hover:text-amber-300 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer border border-amber-400/60 shadow-lg shadow-black/40 backdrop-blur-md"
                  >
                    <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>System Architecture & Technology</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div className="pt-6 border-t border-amber-300 text-center text-slate-600 text-[11px] space-y-1">
            <p>Copyright © Vintage Vibes General Trading LLC SPC. All Rights Reserved</p>
            <p className="text-[10px] text-slate-500">
              Powered by Vintage Vibe Enterprise ERP • Modular High-Density Garment Management System • <a href="/technology.html" className="text-amber-600 hover:text-amber-700 underline font-semibold">Architecture & Tech Specs</a>
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

      {/* FLOATING WHATSAPP VIP CONCIERGE BUTTON */}
      <button
        onClick={() => setIsConciergeModalOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-3 rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 group cursor-pointer border border-emerald-400/40"
        aria-label="WhatsApp VIP Concierge"
      >
        <MessageCircle className="w-6 h-6 fill-current" />
        <span className="font-bold text-xs pr-1 hidden sm:inline">WhatsApp us</span>
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
      </button>

      {/* 15. INSTANT WHATSAPP CONCIERGE MODAL (WITHOUT WEB LOGIN) */}
      {isConciergeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF4E6] border border-amber-300/80 rounded-2xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 text-slate-900">
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-full bg-[#25D366] text-white shadow-xs">
                  <MessageCircle className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-sm tracking-wide text-slate-950 uppercase">Vintage Vibes Concierge</h3>
                  <p className="text-[11px] text-slate-600">Instant VIP inquiry • No WhatsApp Web login needed</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsConciergeModalOpen(false);
                  setConciergeSuccess(false);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {conciergeSuccess ? (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 text-center space-y-2.5">
                <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm text-emerald-950">Inquiry Dispatched to Showroom!</p>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Our concierge team has received your request and will message your WhatsApp directly with piece details and photos.
                </p>
                <button
                  onClick={() => {
                    setConciergeSuccess(false);
                    setIsConciergeModalOpen(false);
                  }}
                  className="mt-3 px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl uppercase tracking-wider cursor-pointer hover:bg-emerald-500 shadow-md transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleConciergeSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Collector / Buyer Name"
                    value={conciergeForm.name}
                    onChange={e => setConciergeForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">WhatsApp Number (+971... / +92...)</label>
                  <input
                    type="tel"
                    required
                    placeholder="+971 50 123 4567"
                    value={conciergeForm.phone}
                    onChange={e => setConciergeForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Inquiry / Vintage Garment Request</label>
                  <textarea
                    rows={3}
                    placeholder="E.g., Inquiring about sizing on rare 90s Carhartt jacket or sizing guidance..."
                    value={conciergeForm.message}
                    onChange={e => setConciergeForm(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingConcierge}
                  className="w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmittingConcierge ? 'Dispatching to Concierge...' : 'Send Instant WhatsApp Inquiry'}</span>
                </button>
                <div className="pt-2 border-t border-amber-200/60 text-center">
                  <a
                    href={`https://wa.me/${(companyProfile?.whatsapp_orders_number || (companyProfile as any)?.whatsappOrderNumber || '971554186086').replace(/[^0-9]/g, '')}?text=Hello%20Vintage%20Vibes,%20I%20have%20an%20inquiry`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-800 hover:text-emerald-950 font-semibold underline"
                  >
                    Or open directly in WhatsApp Web / App →
                  </a>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 14. MULTI-ITEM CART DRAWER */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={handleCheckoutFromCart}
        companyProfile={companyProfile}
        onTimerExpire={handleCartTimerExpired}
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
        customerUser={customerUser}
        onOpenBankQr={(items, total) => {
          setBankQrPieces(items);
          setBankQrTotalAmount(total);
          setBankQrModalOpen(true);
        }}
        onCompleteCheckout={async (items, method, customer, details) => {
          await handleFinalizePurchase(
            items,
            method,
            { ...customer, walletAmountUsed: details?.walletAmountUsed || 0 },
            details?.cardNumber ? `CARD-${details.cardNumber.slice(-4)}` : details?.walletRef || details?.type || 'CHECKOUT'
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

      {/* 16. CUSTOMER AUTH MODAL (SUPABASE EMAIL/PASSWORD + GOOGLE OAUTH) */}
      {authModalOpen && (
        <CustomerAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onAuthSuccess={customer => {
            setCustomerUser(customer);
            setAuthModalOpen(false);
            setSuccessToast({
              title: `Welcome, ${customer.name}!`,
              subtitle: customer.customer_type === 'B2B_RESELLER'
                ? '💼 B2B Reseller portal unlocked! 20% wholesale pricing active.'
                : 'Logged into your Vintage Vibe account.'
            });
            setTimeout(() => setSuccessToast(null), 5000);
          }}
        />
      )}

      {/* 17. CUSTOMER PORTAL / MY ACCOUNT MODAL */}
      {portalModalOpen && customerUser && (
        <CustomerPortalModal
          isOpen={portalModalOpen}
          onClose={() => setPortalModalOpen(false)}
          customer={customerUser}
          onLogout={async () => {
            try {
              localStorage.removeItem('vv_customer_session');
              localStorage.removeItem('sb-local-auth-token');
            } catch (_) {}
            await supabase.auth.signOut();
            setCustomerUser(null);
            setPortalModalOpen(false);
            setSuccessToast({
              title: 'Logged Out',
              subtitle: 'You have been signed out of your account.'
            });
            setTimeout(() => setSuccessToast(null), 4000);
          }}
          onNavigateToWholesale={() => {
            setPortalModalOpen(false);
            navigateToShop('WHOLESALE_BALES');
          }}
        />
      )}

      {/* 16. GRAIL BOUNTY WISHLIST MODAL (SQL BACKED) */}
      {bountyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-gradient-to-b from-[#FFFFFF] to-[#FAF5EA] border-2 border-amber-400 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-slate-900 font-sans">
            <button
              type="button"
              onClick={() => setBountyModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-amber-100 min-w-[36px] min-h-[36px] flex items-center justify-center transition cursor-pointer"
              title="Close"
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

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBountyModalOpen(false)}
                  className="py-3 px-4 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bountySubmitting}
                  className="flex-1 btn-3d btn-3d-amber py-3 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
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
import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Radio,
  Tag,
  Check,
  Volume2,
  VolumeX
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface WinterMaaziStoryHeroProps {
  onExploreCollection: (category?: string) => void;
  videoUrl?: string;
}

interface TourProduct {
  id: string;
  pillLabel: string;
  tag: string;
  name: string;
  brand: string;
  priceAed: number;
  category: string;
  x: number; // percentage from left on rack
  y: number; // percentage from top on rack
  speech: string;
  audioSrc: string;
  description: string;
  highlights: string[];
  color: string;
}

const TOUR_PRODUCTS: TourProduct[] = [
  {
    id: 'welcome-tour',
    pillLabel: 'Welcome Tour',
    tag: 'Welcome Tour',
    name: 'Winter Maazi Vault Selection',
    brand: 'Curated by Vintage Vibes UAE',
    priceAed: 450,
    category: 'ALL',
    x: 48,
    y: 18,
    speech: "Hello and welcome to Vintage Vibes UAE! It is the dream of my father to bring you the finest authentic vintage fashion from around the world. Let me show you our new Winter Maazi Collection right here!",
    audioSrc: '/audio/tour/step_0_welcome.mp3',
    description: "Handpicked vintage grails from Japan, USA, and Europe, archived exclusively for the winter season in UAE.",
    highlights: ['Handpicked 1-of-1 Pieces', 'Al Ain & Dubai Vaults', 'Authenticity Guaranteed'],
    color: '#EAB308'
  },
  {
    id: 'pure-wool',
    pillLabel: 'Pure Wool',
    tag: 'Pure Wool',
    name: 'Vintage Cable Knit Wool Fisherman Sweater',
    brand: 'Pure Woolmark Heritage',
    priceAed: 390,
    category: 'sweaters',
    x: 18,
    y: 14,
    speech: "Look at this rare cream cable-knit fisherman sweater! Crafted from heavyweight pure wool for ultimate warmth during chilly winter evenings.",
    audioSrc: '/audio/tour/step_1_pure_wool.mp3',
    description: "Traditional chunky cable-knit pattern spun from 100% natural virgin wool with thermal heat retention.",
    highlights: ['100% Virgin Pure Wool', 'Chunky Cable Stitch', 'Natural Cream Ivory'],
    color: '#F59E0B'
  },
  {
    id: 'grail-outerwear',
    pillLabel: 'Grail Outerwear',
    tag: 'Grail Outerwear',
    name: 'Tommy Hilfiger 90s Sailing Windbreaker',
    brand: 'Tommy Hilfiger Vintage Archive',
    priceAed: 520,
    category: 'jackets',
    x: 18,
    y: 31,
    speech: "Check out this grail! An original 1990s Tommy Hilfiger color-block sailing jacket with windproof zip and retro nautical stripes.",
    audioSrc: '/audio/tour/step_2_grail_outerwear.mp3',
    description: "Archival sailing series in iconic navy, white, and yellow colorway with stowable hood and brass pulls.",
    highlights: ['Iconic 90s Colorblock', 'Windproof Heavy Nylon', 'Stowaway Storm Hood'],
    color: '#3B82F6'
  },
  {
    id: 'ultra-warm',
    pillLabel: 'Ultra Warm',
    tag: 'Ultra Warm',
    name: 'Vintage Sherpa Alpine Winter Fleece',
    brand: 'Retro Alpine Outdoor Collection',
    priceAed: 380,
    category: 'fleece',
    x: 18,
    y: 49,
    speech: "Feel how soft and warm this vintage winter sherpa fleece is! With brass snap buttons, it is perfect for desert camping in Al Ain and Dubai.",
    audioSrc: '/audio/tour/step_3_ultra_warm.mp3',
    description: "Ultra-soft high-loft deep-pile fleece designed for sub-zero mountain weather, fitted with snap buttons.",
    highlights: ['High-Loft Deep Pile', 'Brass Snap Placket', 'Desert Camp Essential'],
    color: '#10B981'
  },
  {
    id: '1-of-1-grail',
    pillLabel: '1-of-1 Grail',
    tag: '1-of-1 Grail',
    name: 'Nike 1996 Center-Swoosh Heavyweight Hoodie',
    brand: 'Nike USA Vintage Archive',
    priceAed: 460,
    category: 'hoodies',
    x: 18,
    y: 67,
    speech: "One of our most requested collector pieces: the authentic 1996 Nike center-swoosh hoodie! Heavyweight USA fleece cut.",
    audioSrc: '/audio/tour/step_4_nike_hoodie.mp3',
    description: "Rare embroidered mini-swoosh centered on the chest, heavyweight heather grey weave from late 90s USA production.",
    highlights: ['Center Swoosh Embroidery', 'Heavyweight 450GSM', 'Single-Stitch Era'],
    color: '#F97316'
  },
  {
    id: 'everyday-fit',
    pillLabel: 'Everyday Fit',
    tag: 'Everyday Fit',
    name: 'Nike Retro Athletic Basketball Crewneck',
    brand: 'Nike Retro Sports',
    priceAed: 340,
    category: 'sweaters',
    x: 18,
    y: 86,
    speech: "And here is our everyday staple: the vintage Nike athletic basketball crewneck with ribbed cuffs and heritage embroidery.",
    audioSrc: '/audio/tour/step_5_nike_crewneck.mp3',
    description: "Boxy relaxed cut with oversized chest ball graphic, double-needle stitched ribbed hem and cuffs.",
    highlights: ['Boxy Athletic Fit', 'Heritage Basketball Print', 'Midnight Black Fleece'],
    color: '#8B5CF6'
  },
  {
    id: 'hosts-outfit',
    pillLabel: "Host's Outfit",
    tag: "Host's Outfit",
    name: 'Puma Heritage Retro Tracksuit Set',
    brand: 'Puma Sportstyle Vintage',
    priceAed: 350,
    category: 'pants',
    x: 77,
    y: 54,
    speech: "I am wearing our Puma retro tracksuit! We have a complete drop of vintage track jackets and matching pants in store right now.",
    audioSrc: '/audio/tour/step_6_puma_tracksuit.mp3',
    description: "Full two-piece tracksuit featuring white piping, contrast chest stripes, and signature Puma cat logo.",
    highlights: ['Two-Piece Tracksuit Set', 'Contrast Racing Stripes', 'Retro Stand Collar'],
    color: '#EC4899'
  },
  {
    id: 'shop-now',
    pillLabel: 'Shop Now',
    tag: 'Shop Now',
    name: 'Complete Winter Maazi Live Drop',
    brand: 'Vintage Vibes LLC SPC',
    priceAed: 0,
    category: 'ALL',
    x: 48,
    y: 80,
    speech: "Every single piece is authentic and one of a kind. Click Explore Collection to shop the full drop, and thank you for supporting my dad's dream! Enjoy your shopping!",
    audioSrc: '/audio/tour/step_7_shop_now.mp3',
    description: "Instant UAE courier dispatch with cash on delivery, credit card, and Apple Pay options available.",
    highlights: ['Free Delivery in UAE', 'Cash on Delivery / Card', '100% Authentic Guaranteed'],
    color: '#EAB308'
  }
];

export const WinterMaaziStoryHero: React.FC<WinterMaaziStoryHeroProps> = ({
  onExploreCollection,
  videoUrl
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isHostVideoMuted, setIsHostVideoMuted] = useState<boolean>(true);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const archedVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeProduct = TOUR_PRODUCTS[activeStepIndex] || TOUR_PRODUCTS[0];
  const activeVideoUrl = videoUrl || '/mazi_video.mp4';

  // Harmonic Bell Chime via Web Audio API
  const playIntroChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  // Fallback Web Speech Synthesis if audio file fails
  const fallbackTTS = (stepIndex: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const targetStep = TOUR_PRODUCTS[stepIndex];
    if (!targetStep) return;

    const utterance = new SpeechSynthesisUtterance(targetStep.speech);
    utterance.pitch = 1.42;
    utterance.rate = 0.96;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        v =>
          v.lang.startsWith('en') &&
          (v.name.includes('Child') ||
            v.name.includes('Kid') ||
            v.name.includes('Natural') ||
            v.name.includes('Samantha') ||
            v.name.includes('Google US English') ||
            v.name.includes('Oliver') ||
            v.name.includes('George'))
      ) ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0];

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      setIsPlaying(true);
      setActiveStepIndex(stepIndex);
    };

    utterance.onend = () => {
      if (stepIndex < TOUR_PRODUCTS.length - 1) {
        setTimeout(() => {
          playStepAudio(stepIndex + 1);
        }, 850);
      } else {
        setIsPlaying(false);
      }
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Play Real Human Boy Audio File (Neural Human Voice)
  const playStepAudio = (stepIndex: number) => {
    // Stop any ongoing audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const targetStep = TOUR_PRODUCTS[stepIndex];
    if (!targetStep) return;

    setActiveStepIndex(stepIndex);
    setIsPlaying(true);
    playIntroChime();

    if (targetStep.audioSrc) {
      const audio = new Audio(targetStep.audioSrc);
      audioPlayerRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
      };

      audio.onended = () => {
        if (stepIndex < TOUR_PRODUCTS.length - 1) {
          setTimeout(() => {
            playStepAudio(stepIndex + 1);
          }, 850);
        } else {
          setIsPlaying(false);
        }
      };

      audio.onerror = () => {
        fallbackTTS(stepIndex);
      };

      audio.play().catch(() => {
        fallbackTTS(stepIndex);
      });
    } else {
      fallbackTTS(stepIndex);
    }
  };

  const startTour = () => {
    luxuryAudio.playMechanicalClick();
    if (videoMode === 'REAL_VIDEO' && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
    playStepAudio(0);
  };

  const stopTour = () => {
    luxuryAudio.playMechanicalClick();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (videoMode === 'REAL_VIDEO' && videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  };

  const handleSelectProduct = (index: number) => {
    luxuryAudio.playMechanicalClick();
    playStepAudio(index);
  };

  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#120F0C] via-[#1A1610] to-[#120F0C] border-y-4 border-amber-400 py-10 px-3 sm:px-6 lg:px-8 text-white shadow-2xl">
      {/* 60FPS CSS KEYFRAMES FOR IMMEDIATE ANIMATIONS */}
      <style>{`
        /* 1. Background slow-panning & parallax zoom (3D Studio Look) */
        @keyframes studioDepthPan {
          0% {
            transform: scale(1.04) translate(0%, 0%);
          }
          33% {
            transform: scale(1.08) translate(-1.2%, -0.8%);
          }
          66% {
            transform: scale(1.06) translate(0.8%, -0.4%);
          }
          100% {
            transform: scale(1.04) translate(0%, 0%);
          }
        }

        /* 2. Host continuous breathing/floating animation (Immediate on load) */
        @keyframes hostBreathingFloat {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-9px) scale(1.015);
          }
        }

        /* 3. Host speaking sway & talking gesture animation */
        @keyframes hostTalkingGestures {
          0% {
            transform: translateY(0px) rotate(0deg) scale(1);
          }
          20% {
            transform: translateY(-8px) rotate(-0.9deg) scale(1.015);
          }
          40% {
            transform: translateY(-4px) rotate(0.8deg) scale(1.02);
          }
          60% {
            transform: translateY(-10px) rotate(-0.5deg) scale(1.015);
          }
          80% {
            transform: translateY(-3px) rotate(0.6deg) scale(1.008);
          }
          100% {
            transform: translateY(0px) rotate(0deg) scale(1);
          }
        }

        /* 4. Active pulsing red dot for HOST PRESENTING LIVE */
        @keyframes liveDotPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.9), 0 0 14px #ef4444;
          }
          50% {
            transform: scale(1.35);
            box-shadow: 0 0 0 9px rgba(239, 68, 68, 0), 0 0 25px #ef4444;
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.9), 0 0 14px #ef4444;
          }
        }

        /* 5. Continuous ripple animations for garment hotspots */
        @keyframes hotspotRippleWave {
          0% {
            transform: scale(0.85);
            opacity: 0.95;
          }
          50% {
            transform: scale(1.75);
            opacity: 0.45;
          }
          100% {
            transform: scale(2.45);
            opacity: 0;
          }
        }

        /* 6. Dynamic translucent garment card pick-up animation */
        @keyframes garmentPickUp {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(-0.5deg);
          }
        }

        /* 7. Sound equalizer bar wave animation */
        @keyframes equalizerWave {
          0%, 100% {
            height: 4px;
          }
          50% {
            height: 14px;
          }
        }

        .animate-studio-pan {
          animation: studioDepthPan 22s ease-in-out infinite alternate;
        }
        .animate-host-breathe {
          animation: hostBreathingFloat 4s ease-in-out infinite;
        }
        .animate-host-talk {
          animation: hostTalkingGestures 2.8s ease-in-out infinite;
        }
        .animate-live-dot-pulse {
          animation: liveDotPulse 1.8s infinite;
        }
        .animate-hotspot-ripple-1 {
          animation: hotspotRippleWave 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite;
        }
        .animate-hotspot-ripple-2 {
          animation: hotspotRippleWave 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite 1.2s;
        }
        .animate-garment-pickup {
          animation: garmentPickUp 4s ease-in-out infinite;
        }
        .animate-eq-1 {
          animation: equalizerWave 0.8s ease-in-out infinite;
        }
        .animate-eq-2 {
          animation: equalizerWave 0.8s ease-in-out infinite 0.25s;
        }
        .animate-eq-3 {
          animation: equalizerWave 0.8s ease-in-out infinite 0.5s;
        }
      `}</style>

      {/* Ambient background glows */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[450px] h-[450px] bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* TOP BAR: BRANDING, LIVE STATUS & TOUR CONTROLS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-3 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 flex items-center justify-center text-slate-950 font-black shadow-lg">
              <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '9s' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-400">
                  Virtual Host Stage
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[10px] text-slate-400 font-mono">Winter Maazi Drop</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-serif text-white tracking-wide">
                Interactive Young Host Video Showcase
              </h2>
            </div>
          </div>

          {/* Controls: Tour Voice Controls (Play, Pause, Replay) */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={isPlaying ? stopTour : startTour}
                className={`px-5 py-2 rounded-full font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl transition-all transform active:scale-95 cursor-pointer ${
                  isPlaying
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/40 ring-2 ring-rose-400'
                    : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 shadow-amber-500/40 ring-2 ring-amber-300/80 animate-pulse'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause Tour</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Voice Tour</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => playStepAudio(activeStepIndex)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-amber-300 hover:text-white transition-colors cursor-pointer border border-white/10 shadow-md"
                title="Replay Narration"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 1. VISUAL STAGE LAYOUT: GOLD BORDERED CINEMA CARD */}
        <div className="relative w-full rounded-3xl overflow-hidden border-4 border-amber-400 shadow-[0_25px_80px_rgba(0,0,0,0.95)] bg-slate-950">
          {/* INTERACTIVE VIRTUAL HOST STAGE WITH LIVE HOST VIDEO & 3D PARALLAX */}
          <div className="relative w-full aspect-[16/9] min-h-[460px] max-h-[640px] select-none overflow-hidden">
              {/* 3. BACKGROUND DYNAMIC DEPTH: Subtle slow-panning & parallax zoom */}
              <div className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] animate-studio-pan pointer-events-none">
                <img
                  src="/winter_maazi_story.png"
                  alt="Winter Maazi Collections Studio Backdrop"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Cinematic Vignette Gradients for High Readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-black/30 pointer-events-none" />

              {/* 3D EMBOSSED GOLD TITLE AT TOP-LEFT (Matching Reference Image) */}
              <div className="absolute top-4 sm:top-6 left-6 sm:left-12 z-20 pointer-events-none">
                <h1 className="text-xl sm:text-3xl lg:text-4xl font-black font-serif tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 drop-shadow-[0_4px_14px_rgba(245,158,11,0.7)]">
                  WINTER MAAZI COLLECTIONS
                </h1>
              </div>

              {/* LEFT SIDE: ITEM SHOWCASE CAROUSEL & DYNAMIC TRANSLUCENT CARD */}
              <div className="absolute left-4 sm:left-8 top-16 sm:top-20 bottom-14 z-30 flex flex-col justify-between max-w-[280px] sm:max-w-[340px] pointer-events-none">
                {/* Active Dynamic Translucent Garment Card (With Floating Pick-Up Animation) */}
                <div className="pointer-events-auto bg-black/85 backdrop-blur-md p-4 sm:p-5 rounded-2xl border-2 border-amber-400/90 shadow-[0_15px_45px_rgba(0,0,0,0.85)] space-y-2.5 animate-garment-pickup transition-all">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full text-slate-950 shadow-sm"
                      style={{ backgroundColor: activeProduct.color }}
                    >
                      {activeProduct.tag}
                    </span>
                    {activeProduct.priceAed > 0 ? (
                      <span className="text-xs sm:text-sm font-mono font-black text-amber-300">
                        AED {activeProduct.priceAed}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold text-emerald-400">
                        VAULT ACCESS
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="font-black text-sm sm:text-base text-white font-serif leading-snug">
                      {activeProduct.name}
                    </h3>
                    <p className="text-[11px] text-amber-200/90 font-medium">
                      {activeProduct.brand}
                    </p>
                  </div>

                  <p className="text-[10px] sm:text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {activeProduct.description}
                  </p>

                  {/* Garment Highlights */}
                  <div className="space-y-1 pt-1 border-t border-white/10">
                    {activeProduct.highlights.map((highlight, hIdx) => (
                      <div key={hIdx} className="flex items-center gap-1.5 text-[10px] text-slate-200">
                        <Check className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{highlight}</span>
                      </div>
                    ))}
                  </div>

                  {/* Immediate Action Button */}
                  <button
                    type="button"
                    onClick={() => onExploreCollection(activeProduct.category)}
                    className="w-full mt-2 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black uppercase rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer transform active:scale-95"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Shop This Piece</span>
                  </button>
                </div>

                {/* Bottom Left Reference Tagline */}
                <div className="pointer-events-auto bg-black/70 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-amber-400/40 text-[11px] sm:text-xs font-medium text-amber-200/90 flex items-center justify-between shadow-md">
                  <span>Puffer Jackets | Fleece | Hoodies | Shop Now</span>
                </div>
              </div>

              {/* 2. ANIMATED HOTSPOTS: Continuous Pulsing Ripple Animations on Garment Targets */}
              {TOUR_PRODUCTS.filter(p => p.id !== 'welcome-tour' && p.id !== 'shop-now' && p.id !== 'hosts-outfit').map((product, pIdx) => {
                const isActive = activeProduct.id === product.id;

                return (
                  <div
                    key={product.id}
                    style={{ left: `${product.x}%`, top: `${product.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto"
                  >
                    {/* Continuous Ripple Wave 1 (Constantly Active) */}
                    <span
                      className="absolute inset-0 rounded-full pointer-events-none animate-hotspot-ripple-1"
                      style={{
                        backgroundColor: product.color,
                        width: '32px',
                        height: '32px',
                        margin: '-4px'
                      }}
                    />
                    {/* Continuous Ripple Wave 2 (Staggered Delay) */}
                    <span
                      className="absolute inset-0 rounded-full pointer-events-none animate-hotspot-ripple-2"
                      style={{
                        backgroundColor: product.color,
                        width: '32px',
                        height: '32px',
                        margin: '-4px'
                      }}
                    />

                    {/* Active Radar Beacon */}
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-full animate-ping opacity-90 pointer-events-none"
                        style={{
                          backgroundColor: '#F59E0B',
                          width: '42px',
                          height: '42px',
                          margin: '-9px'
                        }}
                      />
                    )}

                    {/* Hotspot Pin Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectProduct(pIdx + 1)}
                      className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all transform cursor-pointer shadow-2xl ${
                        isActive
                          ? 'scale-125 ring-4 ring-white bg-amber-400 text-slate-950 border-white shadow-[0_0_20px_rgba(245,158,11,0.9)]'
                          : 'bg-black/85 hover:bg-amber-400 hover:text-slate-950 text-white border-amber-400 hover:scale-110 shadow-lg'
                      }`}
                      title={`Tap to hear host present: ${product.name}`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* 1. RIGHT SIDE: VIRTUAL YOUNG HOST (Arched Cinema Pod with Immediate Floating & Talking) */}
              <div className="absolute right-[4%] sm:right-[8%] bottom-2 sm:bottom-4 w-[34%] sm:w-[28%] max-w-[280px] h-[86%] sm:h-[88%] z-20 pointer-events-none flex flex-col items-center justify-end">
                {/* 2. DYNAMIC LIVE STATUS BADGE: Active Pulsing Red Beacon */}
                <div className="absolute -top-7 sm:-top-8 z-30 pointer-events-auto bg-black/92 backdrop-blur-md px-3.5 py-1.5 rounded-full border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.55)] flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-live-dot-pulse absolute inline-flex h-full w-full rounded-full bg-rose-500" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border-2 border-white" />
                  </span>
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-300 whitespace-nowrap">
                    HOST PRESENTING LIVE
                  </span>
                  {/* Equalizer frequency bars */}
                  <div className="flex items-end gap-0.5 h-3">
                    <span
                      className={`w-0.5 bg-amber-400 rounded-full transition-all ${
                        isPlaying ? 'animate-eq-1' : 'h-1.5'
                      }`}
                    />
                    <span
                      className={`w-0.5 bg-amber-400 rounded-full transition-all ${
                        isPlaying ? 'animate-eq-2' : 'h-2.5'
                      }`}
                    />
                    <span
                      className={`w-0.5 bg-amber-400 rounded-full transition-all ${
                        isPlaying ? 'animate-eq-3' : 'h-1'
                      }`}
                    />
                  </div>
                </div>

                {/* Floating/Breathing & Talking Animated Container (Immediate 60fps Animation) */}
                <div
                  className={`relative w-full h-full flex flex-col items-center justify-end origin-bottom ${
                    isPlaying ? 'animate-host-talk' : 'animate-host-breathe'
                  }`}
                >
                  {/* Arched Host Cinema Pod Frame - Real Video Host */}
                  <div className="relative w-full h-full rounded-t-full rounded-b-2xl overflow-hidden border-2 border-amber-400/90 shadow-[0_0_35px_rgba(245,158,11,0.45)] bg-slate-900/90 backdrop-blur-sm pointer-events-auto group">
                    <video
                      ref={archedVideoRef}
                      src={activeVideoUrl}
                      autoPlay
                      muted={isHostVideoMuted}
                      loop
                      playsInline
                      className="w-full h-full object-cover object-top"
                    />

                    {/* Quick Sound Mute / Unmute Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsHostVideoMuted(prev => {
                          const next = !prev;
                          if (archedVideoRef.current) {
                            archedVideoRef.current.muted = next;
                            if (!next) {
                              archedVideoRef.current.play().catch(() => {});
                            }
                          }
                          return next;
                        });
                      }}
                      className="absolute top-2.5 right-2.5 z-30 p-2 rounded-full bg-black/85 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-400/70 shadow-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                      title={isHostVideoMuted ? "Tap to Unmute Video Voice" : "Tap to Mute"}
                    >
                      {isHostVideoMuted ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[9px] font-mono font-black tracking-wider pr-0.5">UNMUTE</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          <span className="text-[9px] font-mono font-black tracking-wider pr-0.5 text-emerald-400">SOUND ON</span>
                        </>
                      )}
                    </button>

                    {/* Subtle bottom vignette */}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
                  </div>

                  {/* Host Outfit Tag Badge at Base */}
                  <button
                    type="button"
                    onClick={() => handleSelectProduct(6)}
                    className="absolute -bottom-2 pointer-events-auto bg-black/90 backdrop-blur-md px-3 py-1 rounded-full border border-amber-400 text-[10px] font-bold text-amber-200 hover:text-slate-950 hover:bg-amber-400 transition-all cursor-pointer shadow-lg flex items-center gap-1.5 z-30"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Host Outfit • Puma AED 350</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Laser Spotlight Beam From Boy to Active Garment */}
              {isPlaying && activeProduct && activeProduct.id !== 'welcome-tour' && activeProduct.id !== 'shop-now' && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                  <defs>
                    <linearGradient id="laserBeam" x1="77%" y1="36%" x2={`${activeProduct.x}%`} y2={`${activeProduct.y}%`}>
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#FBBF24" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="77%"
                    y1="36%"
                    x2={`${activeProduct.x}%`}
                    y2={`${activeProduct.y}%`}
                    stroke="url(#laserBeam)"
                    strokeWidth="3"
                    strokeDasharray="6 3"
                    className="animate-pulse"
                  />
                  <circle
                    cx={`${activeProduct.x}%`}
                    cy={`${activeProduct.y}%`}
                    r="28"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    className="animate-spin"
                    style={{ transformOrigin: `${activeProduct.x}% ${activeProduct.y}%`, animationDuration: '6s' }}
                  />
                </svg>
              )}
            </div>

          {/* 2. SYNCHRONIZED VOICE TOUR SUBTITLE BAR & PORTFOLIO CTA */}
          <div className="bg-gradient-to-r from-black via-[#18140E] to-black p-4 sm:p-5 border-t-4 border-amber-400 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 max-w-4xl">
              <div className="w-10 h-10 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 shadow-md">
                <Radio className={`w-5 h-5 ${isPlaying ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-[11px] uppercase font-black text-amber-400 tracking-widest block">
                    YOUNG HOST VOICE TRANSCRIPT
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    • Now Showing: {activeProduct.name}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-100 italic leading-relaxed mt-0.5">
                  "{activeProduct.speech}"
                </p>
              </div>
            </div>

            {/* COMPANY PORTFOLIO HIGH-VISIBILITY CTA */}
            <button
              type="button"
              onClick={() => onExploreCollection(activeProduct.category)}
              className="w-full md:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shrink-0 flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(245,158,11,0.5)] cursor-pointer transform active:scale-95 transition-all hover:scale-105"
            >
              <span>EXPLORE COLLECTION</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 3. INTERACTIVE TOUR NAVIGATION PILLS */}
        <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap pt-2">
          {TOUR_PRODUCTS.map((product, idx) => {
            const isActive = activeStepIndex === idx;

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelectProduct(idx)}
                className={`px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 font-black scale-105 ring-2 ring-white shadow-amber-400/40'
                    : 'bg-black/60 hover:bg-white/20 text-slate-200 border border-amber-400/30 hover:border-amber-400'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: product.color }}
                />
                <span>{product.pillLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

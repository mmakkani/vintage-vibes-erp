import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Radio,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface WinterMaaziStoryHeroProps {
  onExploreCollection: (category?: string) => void;
  videoUrl?: string;
}

const COLLECTION_CATEGORIES = [
  { id: 'all', label: 'All Vault Grails', category: undefined, color: '#EAB308' },
  { id: 'pure-wool', label: 'Pure Wool', category: 'sweaters', color: '#F59E0B' },
  { id: 'grail-outerwear', label: 'Grail Outerwear', category: 'jackets', color: '#3B82F6' },
  { id: 'ultra-warm', label: 'Ultra Warm Fleece', category: 'fleece', color: '#10B981' },
  { id: 'streetwear', label: 'Vintage Streetwear', category: 'tshirts', color: '#8B5CF6' },
  { id: 'tracksuits', label: 'Retro Tracksuits', category: 'pants', color: '#EC4899' }
];

export const WinterMaaziStoryHero: React.FC<WinterMaaziStoryHeroProps> = ({
  onExploreCollection,
  videoUrl
}) => {
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimer = useRef<any>(null);

  const activeVideoUrl = videoUrl || '/mazi_video.mp4';

  const togglePlay = () => {
    luxuryAudio.playMechanicalClick();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsVideoPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    luxuryAudio.playMechanicalClick();
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
    if (!next && videoRef.current.paused) {
      videoRef.current.play().then(() => setIsVideoPlaying(true)).catch(() => {});
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    luxuryAudio.playMechanicalClick();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const replayVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    luxuryAudio.playMechanicalClick();
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().then(() => setIsVideoPlaying(true)).catch(() => {});
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (!videoRef.current.paused && !isVideoPlaying) {
        setIsVideoPlaying(true);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleUserActivity = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isVideoPlaying) setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [isVideoPlaying]);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#120F0C] via-[#1A1610] to-[#120F0C] border-y-4 border-amber-400 py-10 px-3 sm:px-6 lg:px-8 text-white shadow-2xl">
      <style>{`
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
        .animate-live-dot-pulse {
          animation: liveDotPulse 1.8s infinite;
        }
      `}</style>

      {/* Ambient background glows */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[450px] h-[450px] bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* TOP BAR: BRANDING & VIDEO QUICK CONTROLS */}
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
              <h2 className="text-base sm:text-xl md:text-2xl font-black font-serif text-white tracking-wide">
                Interactive Young Host Video Showcase
              </h2>
            </div>
          </div>

          {/* Top Quick Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
            <button
              type="button"
              onClick={togglePlay}
              className={`px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-full font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 shadow-xl transition-all transform active:scale-95 cursor-pointer ${
                isVideoPlaying
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/30 font-black'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-emerald-500/40 animate-pulse'
              }`}
            >
              {isVideoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                  <span>Pause Video</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                  <span>Play Video</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 shadow-xl transition-all cursor-pointer transform active:scale-95 ${
                isMuted
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/40 animate-pulse ring-2 ring-rose-400'
                  : 'bg-black/80 hover:bg-black text-emerald-400 border border-emerald-400/60 shadow-md'
              }`}
              title={isMuted ? "Tap to Unmute Video Voice" : "Tap to Mute"}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Unmute Voice</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
                  <span>Sound On</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={replayVideo}
              className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 text-amber-300 hover:text-white transition-colors cursor-pointer border border-white/10 shadow-md"
              title="Replay Video From Start"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 text-amber-300 hover:text-white transition-colors cursor-pointer border border-white/10 shadow-md"
              title={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
        </div>

        {/* 1. VISUAL STAGE LAYOUT: FULL-WIDTH LUXURY CINEMA CARD */}
        <div
          ref={containerRef}
          className="relative w-full rounded-3xl overflow-hidden border-4 border-amber-400 shadow-[0_25px_80px_rgba(0,0,0,0.95)] bg-black group select-none"
          onMouseMove={handleUserActivity}
          onMouseEnter={handleUserActivity}
        >
          <div className="relative w-full aspect-[16/9] min-h-[220px] sm:min-h-[460px] md:min-h-[580px] lg:min-h-[740px] bg-black flex items-center justify-center overflow-hidden">
            {/* The Main Host Video Element - Full Width, 100% Uncropped with object-contain */}
            <video
              ref={videoRef}
              src={activeVideoUrl}
              autoPlay
              muted={isMuted}
              loop
              playsInline
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain bg-black cursor-pointer"
            />

            {/* Center Big Play Button (When Paused) */}
            {!isVideoPlaying && (
              <div
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px] cursor-pointer transition-all z-20"
              >
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 text-slate-950 flex items-center justify-center shadow-[0_0_50px_rgba(245,158,11,0.85)] transform hover:scale-110 active:scale-95 transition-all">
                  <Play className="w-8 h-8 sm:w-12 sm:h-12 fill-current ml-1" />
                </div>
              </div>
            )}

            {/* Top Overlay Badge Bar */}
            <div className="absolute top-2.5 sm:top-4 inset-x-2.5 sm:inset-x-6 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pointer-events-none">
              {/* Live Host Presenting Beacon */}
              <div className="bg-black/90 backdrop-blur-md px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full border border-amber-400/80 shadow-2xl flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
                <span className="relative flex h-2 sm:h-2.5 w-2 sm:w-2.5">
                  <span className="animate-live-dot-pulse absolute inline-flex h-full w-full rounded-full bg-rose-500" />
                  <span className="relative inline-flex rounded-full h-2 sm:h-2.5 w-2 sm:w-2.5 bg-rose-500" />
                </span>
                <span className="text-[9px] sm:text-xs font-black uppercase tracking-wider text-amber-300">
                  HOST PRESENTING LIVE
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-400 font-mono">
                  • Winter Maazi Drop
                </span>
              </div>

              {/* Top Right Quick Floating Audio & Fullscreen Buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto self-end sm:self-auto">
                {/* Unmute Floating Banner */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`px-2.5 py-1 sm:px-4 sm:py-2 rounded-full font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 shadow-2xl transition-all cursor-pointer transform active:scale-95 ${
                    isMuted
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 animate-pulse shadow-amber-400/60 ring-2 ring-amber-300'
                      : 'bg-black/85 hover:bg-black text-emerald-400 border border-emerald-400/80'
                  }`}
                  title={isMuted ? "Tap to Unmute Video Voice" : "Tap to Mute"}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950" />
                      <span>Tap To Unmute Voice</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 animate-pulse" />
                      <span>Sound On</span>
                    </>
                  )}
                </button>

                {/* Fullscreen Icon Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 sm:p-2.5 rounded-full bg-black/85 hover:bg-amber-400 hover:text-slate-950 text-white border border-amber-400/70 shadow-2xl transition-all cursor-pointer"
                  title={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>

            {/* Bottom Floating Scrubber & Controls Bar */}
            <div className={`absolute bottom-0 inset-x-0 z-20 p-4 sm:p-5 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-300 ${
              showControls || !isVideoPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 hover:opacity-100 pointer-events-auto'
            }`}>
              {/* Progress Scrubber */}
              <div className="w-full flex items-center gap-3 mb-2">
                <span className="text-[11px] font-mono text-amber-300 min-w-[36px]">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-400 hover:accent-amber-300"
                />
                <span className="text-[11px] font-mono text-slate-400 min-w-[36px]">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2 rounded-full bg-white/10 hover:bg-amber-400 hover:text-slate-950 text-white transition-all cursor-pointer"
                    title={isVideoPlaying ? "Pause" : "Play"}
                  >
                    {isVideoPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all cursor-pointer"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                  <span className="text-xs font-bold text-amber-200/90 hidden sm:inline font-mono">
                    Vintage Vibes UAE • Winter Maazi
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onExploreCollection()}
                    className="px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs uppercase flex items-center gap-1.5 shadow-lg transition-all cursor-pointer transform active:scale-95"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Shop This Drop</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. SYNCHRONIZED SUBTITLE BAR & PORTFOLIO CTA */}
          <div className="bg-gradient-to-r from-black via-[#18140E] to-black p-3.5 sm:p-5 border-t-4 border-amber-400 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2.5 sm:gap-3.5 max-w-4xl">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 shadow-md">
                <Radio className={`w-4 h-4 sm:w-5 sm:h-5 ${isVideoPlaying ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] sm:text-[11px] uppercase font-black text-amber-400 tracking-widest block">
                    YOUNG HOST VIDEO SHOWCASE
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                    • Handpicked 1-of-1 Vault Pieces
                  </span>
                </div>
                <p className="text-[11px] sm:text-sm text-slate-100 italic leading-relaxed mt-0.5">
                  "Hello and welcome to Vintage Vibes UAE! It is the dream of my father to bring you the finest authentic vintage fashion from around the world. Every single piece is authentic and 1-of-1!"
                </p>
              </div>
            </div>

            {/* COMPANY PORTFOLIO HIGH-VISIBILITY CTA */}
            <button
              type="button"
              onClick={() => onExploreCollection()}
              className="w-full md:w-auto px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shrink-0 flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(245,158,11,0.5)] cursor-pointer transform active:scale-95 transition-all hover:scale-105"
            >
              <span>EXPLORE COLLECTION</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 3. COLLECTION DROP QUICK-SELECT PILLS */}
        <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap pt-2">
          {COLLECTION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                luxuryAudio.playMechanicalClick();
                onExploreCollection(cat.category);
              }}
              className="px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm bg-black/70 hover:bg-amber-400 hover:text-slate-950 text-slate-200 border border-amber-400/30 hover:border-amber-400 active:scale-95"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

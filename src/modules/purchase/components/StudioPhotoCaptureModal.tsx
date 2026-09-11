import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  CheckCircle2,
  RotateCw,
  UploadCloud,
  FlipHorizontal,
  Check,
  Sparkles,
  Smartphone
} from 'lucide-react';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';

export type PhotoSlot = 'front' | 'back' | 'tag';

interface StudioPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSlot?: PhotoSlot;
  frontImageUrl?: string;
  backImageUrl?: string;
  tagImageUrl?: string;
  onSavePhotos: (photos: { front?: string; back?: string; tag?: string }) => void;
}

export const StudioPhotoCaptureModal: React.FC<StudioPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  activeSlot = 'front',
  frontImageUrl: initialFront,
  backImageUrl: initialBack,
  tagImageUrl: initialTag,
  onSavePhotos
}) => {
  const [currentSlot, setCurrentSlot] = useState<PhotoSlot>(activeSlot);
  const [frontImg, setFrontImg] = useState<string | undefined>(initialFront);
  const [backImg, setBackImg] = useState<string | undefined>(initialBack);
  const [tagImg, setTagImg] = useState<string | undefined>(initialTag);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [showSilhouette, setShowSilhouette] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial images when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentSlot(activeSlot);
      setFrontImg(initialFront);
      setBackImg(initialBack);
      setTagImg(initialTag);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeSlot, initialFront, initialBack, initialTag]);

  // Restart camera if facingMode changes
  useEffect(() => {
    if (isOpen && cameraActive) {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Direct webcam/camera stream is not supported in this browser environment. Use the Phone Camera button below.');
      }

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn('Video play error:', e));
        };
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Unable to access video stream:', err);
      setCameraError(err.message || 'Camera permission denied or camera device in use.');
      setCameraActive(false);
    }
  };

  // Flip rear / front camera
  const toggleFacingMode = () => {
    luxuryAudio.playMechanicalClick();
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Capture frame from video element
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Trigger flash animation & shutter sound
    setIsFlashActive(true);
    setTimeout(() => setIsFlashActive(false), 200);

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(60);
      }
      luxuryAudio.playMechanicalClick();
    } catch {}

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, flip horizontally for mirror preview match
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    applyPhotoToCurrentSlot(dataUrl);
  };

  // Apply photo to slot and auto-advance
  const applyPhotoToCurrentSlot = (dataUrl: string) => {
    if (currentSlot === 'front') {
      setFrontImg(dataUrl);
      // Auto-advance to back look if not yet taken
      if (!backImg) {
        setTimeout(() => setCurrentSlot('back'), 300);
      }
    } else if (currentSlot === 'back') {
      setBackImg(dataUrl);
      // Auto-advance to tag if not yet taken
      if (!tagImg) {
        setTimeout(() => setCurrentSlot('tag'), 300);
      }
    } else {
      setTagImg(dataUrl);
    }
  };

  // Native phone camera input handler (triggered by <input capture="environment" />)
  const handleNativeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          applyPhotoToCurrentSlot(reader.result);
          try {
            luxuryAudio.playMechanicalClick();
          } catch {}
        }
      };
      reader.readAsDataURL(file);
    }
    // reset input value so user can re-snap the same picture if needed
    e.target.value = '';
  };

  const handleSaveAndClose = () => {
    luxuryAudio.playCashChime();
    onSavePhotos({
      front: frontImg,
      back: backImg,
      tag: tagImg
    });
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* TOP HEADER */}
        <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Camera className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Garment 3-Angle Studio Camera
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Live Viewfinder
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Aim phone camera at garment to snap Front, Back & Tag photos
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SLOT TABS SELECTOR */}
        <div className="grid grid-cols-3 bg-slate-900/60 p-2 gap-2 border-b border-slate-800">
          {/* Front Tab */}
          <button
            type="button"
            onClick={() => setCurrentSlot('front')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              currentSlot === 'front'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">📸</span>
            <span>1. Front Look</span>
            {frontImg && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </button>

          {/* Back Tab */}
          <button
            type="button"
            onClick={() => setCurrentSlot('back')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              currentSlot === 'back'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">📸</span>
            <span>2. Back Look</span>
            {backImg && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </button>

          {/* Tag Tab */}
          <button
            type="button"
            onClick={() => setCurrentSlot('tag')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              currentSlot === 'tag'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 ring-1 ring-amber-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">🏷️</span>
            <span>3. Tag / Label</span>
            {tagImg && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </button>
        </div>

        {/* CAMERA VIEWFINDER VIEWPORT */}
        <div className="relative bg-black flex-1 min-h-[280px] max-h-[460px] overflow-hidden flex items-center justify-center select-none">
          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Flash Effect on capture */}
          {isFlashActive && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-150" />
          )}

          {/* Video Stream Element */}
          {cameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Camera className="w-8 h-8" />
              </div>
              <p className="text-xs max-w-sm mx-auto text-slate-300">
                {cameraError || 'Live camera stream inactive. You can snap directly with your phone camera app using the button below.'}
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Live Camera</span>
                </button>
              </div>
            </div>
          )}

          {/* Garment Silhouette / Guide Outline Overlay */}
          {cameraActive && showSilhouette && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-48 h-64 sm:w-56 sm:h-72 border-2 border-dashed border-white/35 rounded-3xl relative flex items-center justify-center">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/70 tracking-wider uppercase bg-black/60 px-2 py-0.5 rounded-full border border-white/20 backdrop-blur-sm">
                  {currentSlot === 'front' ? '👔 FRONT CHEST' : currentSlot === 'back' ? '🧥 BACK VIEW' : '🏷️ TAG / COLLAR'}
                </div>
                {/* Center crosshair */}
                <div className="w-6 h-[1px] bg-white/40 absolute" />
                <div className="h-6 w-[1px] bg-white/40 absolute" />
              </div>
            </div>
          )}

          {/* Viewfinder HUD Overlays */}
          {cameraActive && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full border border-white/20 backdrop-blur-md text-xs font-medium flex items-center gap-1 transition shadow"
                title="Switch Camera (Front / Back)"
              >
                <FlipHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline text-[10px]">Flip</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSilhouette(p => !p)}
                className={`p-2 rounded-full border backdrop-blur-md text-xs transition shadow ${
                  showSilhouette
                    ? 'bg-indigo-600/80 text-white border-indigo-400'
                    : 'bg-slate-950/70 text-slate-300 border-white/20'
                }`}
                title="Toggle Garment Guide Grid"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Slot Indicator Badge */}
          <div className="absolute bottom-2 left-2 z-20 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/20 text-white text-[11px] font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold">Capturing:</span>
            <span className="text-amber-300 uppercase">
              {currentSlot === 'front' ? 'Front Look' : currentSlot === 'back' ? 'Back Look' : 'Garment Tag'}
            </span>
          </div>
        </div>

        {/* SHUTTER & PHOTO ACTION CONTROLS */}
        <div className="bg-slate-900 p-3.5 border-t border-slate-800 space-y-3">
          {/* Main Shutter Row */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Direct Native Phone Camera Trigger (Invokes phone camera app) */}
            <div>
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleNativeFile}
              />
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
                title="Opens the native camera app on your phone"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Native</span> Phone Camera
              </button>
            </div>

            {/* Central Big Shutter Button for Live Stream */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cameraActive ? capturePhoto : () => nativeCameraInputRef.current?.click()}
                className="group relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-rose-500 via-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all duration-150 ring-4 ring-white/20"
              >
                <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full border-2 border-white/80 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                </div>
              </button>
            </div>

            {/* Gallery Upload Fallback */}
            <div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleNativeFile}
              />
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
              >
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                <span>Gallery</span>
              </button>
            </div>
          </div>

          {/* Bottom Thumbnails Review Bar */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-x-auto py-0.5">
              {/* Slot 1: Front Thumbnail */}
              <div
                onClick={() => setCurrentSlot('front')}
                className={`relative w-12 h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
                  currentSlot === 'front'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/50'
                    : frontImg
                    ? 'border-emerald-500'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                {frontImg ? (
                  <>
                    <img src={frontImg} alt="Front" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFrontImg(undefined);
                      }}
                      className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[8px] text-center font-bold font-mono">
                      FRONT
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-bold">Front</span>
                )}
              </div>

              {/* Slot 2: Back Thumbnail */}
              <div
                onClick={() => setCurrentSlot('back')}
                className={`relative w-12 h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
                  currentSlot === 'back'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/50'
                    : backImg
                    ? 'border-emerald-500'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                {backImg ? (
                  <>
                    <img src={backImg} alt="Back" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBackImg(undefined);
                      }}
                      className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[8px] text-center font-bold font-mono">
                      BACK
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-bold">Back</span>
                )}
              </div>

              {/* Slot 3: Tag Thumbnail */}
              <div
                onClick={() => setCurrentSlot('tag')}
                className={`relative w-12 h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
                  currentSlot === 'tag'
                    ? 'border-amber-400 ring-2 ring-amber-500/50'
                    : tagImg
                    ? 'border-emerald-500'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                {tagImg ? (
                  <>
                    <img src={tagImg} alt="Tag" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTagImg(undefined);
                      }}
                      className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-amber-600/90 text-white text-[8px] text-center font-bold font-mono">
                      TAG
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-bold">Tag</span>
                )}
              </div>
            </div>

            {/* Confirm & Save Button */}
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition shrink-0 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Attach to Piece</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

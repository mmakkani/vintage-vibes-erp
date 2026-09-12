import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  CheckCircle2,
  RotateCw,
  UploadCloud,
  FlipHorizontal,
  Check,
  Sparkles,
  Smartphone,
  ShieldAlert,
  HelpCircle,
  Video,
  Eye,
  RefreshCw
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

/**
 * High-performance client-side image compression:
 * Scales down large mobile phone camera photos (15MB+) to crisp ~1280px studio JPEGs (~150KB-250KB)
 * Prevents memory exhaustion, payload errors, and lag.
 */
const compressImage = (fileOrDataUrl: File | string, maxDimension = 1280, quality = 0.85): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => reject(e);

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};

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
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [showSilhouette, setShowSilhouette] = useState(true);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Multi-tier camera initialization with resilience against strict constraints
  const startCamera = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    setIsPermissionDenied(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Webcam / live camera streaming is not supported by your browser environment. Please use the Native Phone Camera button below.');
      return;
    }

    // Stop existing stream if any
    stopCamera();

    const deviceToUse = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;

    let stream: MediaStream | null = null;
    let lastErr: any = null;

    // Strategy 1: Specific Device ID if user selected a camera
    if (deviceToUse) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceToUse } },
          audio: false
        });
      } catch (err: any) {
        lastErr = err;
        console.warn('Direct deviceId access failed, trying facingMode:', err);
      }
    }

    // Strategy 2: Ideal facingMode and standard 1280x720 studio resolution
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (err: any) {
        lastErr = err;
        console.warn('High-res facingMode stream failed, falling back to basic facingMode:', err);
      }
    }

    // Strategy 3: Basic facingMode
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false
        });
      } catch (err: any) {
        lastErr = err;
        console.warn('Basic facingMode failed, falling back to generic video stream:', err);
      }
    }

    // Strategy 4: Universal fallback - any available video input (laptop webcams, USB cameras)
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      } catch (err: any) {
        lastErr = err;
        console.error('All camera initialization strategies failed:', err);
      }
    }

    // Evaluate failure
    if (!stream) {
      const errName = lastErr?.name || '';
      const errMsg = (lastErr?.message || '').toLowerCase();
      const isDenied =
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.includes('denied') ||
        errMsg.includes('permission');

      setIsPermissionDenied(isDenied);
      setCameraError(
        isDenied
          ? 'Browser Camera Access Blocked (Permission Denied)'
          : lastErr?.message || 'Unable to start camera. Please verify device connection.'
      );
      setCameraActive(false);
      return;
    }

    // Success: Store stream and connect to video element
    streamRef.current = stream;
    setCameraActive(true);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => {
        console.warn('Autoplay error, falling back to muted play:', e);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(err => console.error('Final play error:', err));
        }
      });
    }

    // Query connected camera devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter(d => d.kind === 'videoinput');
      setAvailableDevices(videoDevs);
      const activeTrack = stream.getVideoTracks()[0];
      const activeSettings = activeTrack?.getSettings?.();
      if (activeSettings?.deviceId) {
        setSelectedDeviceId(activeSettings.deviceId);
      }
    } catch (e) {
      console.warn('Device enumeration error:', e);
    }
  }, [facingMode, selectedDeviceId, stopCamera]);

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
  }, [isOpen, activeSlot, initialFront, initialBack, initialTag, startCamera, stopCamera]);

  // Re-attach video stream if cameraActive changes or element mounts
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => {
        console.warn('Video play re-attachment failed, retrying muted:', e);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [cameraActive]);

  // Flip rear / front camera
  const toggleFacingMode = () => {
    luxuryAudio.playMechanicalClick();
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setSelectedDeviceId(''); // clear exact device id to allow facing mode selection
    startCamera();
  };

  // Switch to specific camera device (if multiple cameras exist)
  const handleDeviceChange = (devId: string) => {
    luxuryAudio.playMechanicalClick();
    setSelectedDeviceId(devId);
    startCamera(devId);
  };

  // Capture frame from live video element
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Trigger flash animation & mechanical shutter sound
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

    // If front camera, flip horizontally for natural mirror look
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);

    setIsProcessing(true);
    try {
      const compressed = await compressImage(rawDataUrl, 1280, 0.85);
      applyPhotoToCurrentSlot(compressed);
    } catch (e) {
      applyPhotoToCurrentSlot(rawDataUrl);
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply photo to active slot and auto-advance to the next unfilled slot
  const applyPhotoToCurrentSlot = (dataUrl: string) => {
    if (currentSlot === 'front') {
      setFrontImg(dataUrl);
      if (!backImg) {
        setTimeout(() => setCurrentSlot('back'), 300);
      } else if (!tagImg) {
        setTimeout(() => setCurrentSlot('tag'), 300);
      }
    } else if (currentSlot === 'back') {
      setBackImg(dataUrl);
      if (!tagImg) {
        setTimeout(() => setCurrentSlot('tag'), 300);
      }
    } else {
      setTagImg(dataUrl);
    }
  };

  // Native phone camera & gallery input handler with automatic studio compression
  const handleNativeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const compressed = await compressImage(file, 1280, 0.85);
        applyPhotoToCurrentSlot(compressed);
        try {
          luxuryAudio.playMechanicalClick();
        } catch {}
      } catch (err) {
        console.error('Image compression error:', err);
      } finally {
        setIsProcessing(false);
      }
    }
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

  const capturedCount = [frontImg, backImg, tagImg].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* TOP HEADER */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Camera className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Garment 3-Angle Studio Camera
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {cameraActive ? 'Live Viewfinder' : 'Ready'}
                </span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {capturedCount}/3 Photos
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Capture high-definition Front, Back & Tag photos for this piece
              </p>
            </div>
          </div>

          <button
            type="button"
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
            <span className="text-sm">👔</span>
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
            <span className="text-sm">🧥</span>
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
        <div className="relative bg-black flex-1 min-h-[300px] max-h-[460px] overflow-hidden flex items-center justify-center select-none">
          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Flash Effect on capture */}
          {isFlashActive && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-150" />
          )}

          {/* Persistent Video Stream Element (Always in DOM to guarantee ref binding) */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              cameraActive ? 'opacity-100' : 'hidden opacity-0'
            }`}
          />

          {/* STANDBY & PERMISSION DENIED TROUBLESHOOTING SCREEN */}
          {!cameraActive && (
            <div className="p-4 sm:p-6 text-center text-slate-300 w-full max-w-lg mx-auto space-y-4">
              {isPermissionDenied ? (
                <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-4 sm:p-5 text-left space-y-3 backdrop-blur-sm shadow-xl">
                  <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>Camera Permission Blocked in Browser</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Your browser has restricted live camera access for this website. To enable live viewfinder:
                  </p>

                  <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 space-y-2 text-[11px] text-slate-300">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-indigo-400 shrink-0">💻 Desktop (Chrome/Edge):</span>
                      <span>Click the <strong>🔒 lock</strong> or <strong>🎛️ site settings</strong> icon next to the URL at the very top, switch <strong>Camera</strong> to <strong>Allow</strong>, then retry.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-amber-400 shrink-0">📱 iPhone / Safari:</span>
                      <span>Tap the <strong>aA</strong> icon in the address bar → <strong>Website Settings</strong> → set <strong>Camera</strong> to <strong>Allow</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-emerald-400 shrink-0">🤖 Android (Chrome):</span>
                      <span>Tap the <strong>🔒 lock</strong> icon → <strong>Permissions</strong> → <strong>Camera</strong> → <strong>Allow</strong>.</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry Live Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Snap with Phone Camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Live Camera Standby</h4>
                    <p className="text-xs max-w-sm mx-auto text-slate-400 mt-1">
                      {cameraError || 'Click below to activate live viewfinder, or snap directly with your phone camera.'}
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition active:scale-95"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Launch Live Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Use Phone Camera</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Garment Silhouette / Guide Outline Overlay */}
          {cameraActive && showSilhouette && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-52 h-68 sm:w-60 sm:h-76 border-2 border-dashed border-white/40 rounded-3xl relative flex items-center justify-center">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/90 tracking-wider uppercase bg-black/70 px-3 py-0.5 rounded-full border border-white/20 backdrop-blur-sm">
                  {currentSlot === 'front' ? '👔 FRONT CHEST' : currentSlot === 'back' ? '🧥 BACK VIEW' : '🏷️ TAG / COLLAR'}
                </div>
                {/* Center crosshair */}
                <div className="w-6 h-[1px] bg-white/50 absolute" />
                <div className="h-6 w-[1px] bg-white/50 absolute" />
              </div>
            </div>
          )}

          {/* Viewfinder HUD Overlays */}
          {cameraActive && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
              {/* Multi-device camera switch selector */}
              {availableDevices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="bg-slate-950/80 text-white text-[10px] px-2 py-1.5 rounded-full border border-white/20 backdrop-blur-md outline-none cursor-pointer"
                >
                  {availableDevices.map((dev, idx) => (
                    <option key={dev.deviceId} value={dev.deviceId} className="bg-slate-900 text-white">
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}

              {/* Flip camera button */}
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full border border-white/20 backdrop-blur-md text-xs font-medium flex items-center gap-1 transition shadow active:scale-95"
                title="Switch Camera (Front / Back)"
              >
                <FlipHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline text-[10px]">
                  {facingMode === 'environment' ? 'Rear' : 'Front'}
                </span>
              </button>

              {/* Silhouette toggle button */}
              <button
                type="button"
                onClick={() => setShowSilhouette(p => !p)}
                className={`p-2 rounded-full border backdrop-blur-md text-xs transition shadow active:scale-95 ${
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
            <span className="text-amber-300 uppercase font-semibold">
              {currentSlot === 'front' ? 'Front Look' : currentSlot === 'back' ? 'Back Look' : 'Garment Tag'}
            </span>
          </div>

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
              <div className="bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-xl text-white text-xs flex items-center gap-2 shadow-2xl">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span>Optimizing High-Res Studio Photo...</span>
              </div>
            </div>
          )}
        </div>

        {/* SHUTTER & PHOTO ACTION CONTROLS */}
        <div className="bg-slate-900 p-3.5 border-t border-slate-800 space-y-3">
          {/* Main Shutter Row */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Direct Native Phone Camera Trigger */}
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

            {/* Central Big Shutter Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cameraActive ? capturePhoto : () => nativeCameraInputRef.current?.click()}
                className="group relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-rose-500 via-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all duration-150 ring-4 ring-white/20 cursor-pointer"
                title={cameraActive ? "Snap photo from live camera" : "Open phone camera"}
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
                title="Choose photo from device gallery or files"
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
                      title="Clear Front Photo"
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
                      title="Clear Back Photo"
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
                      title="Clear Tag Photo"
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

      {/* LIGHTBOX PREVIEW */}
      {previewLightbox && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
          onClick={() => setPreviewLightbox(null)}
        >
          <div className="relative max-w-lg max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl p-2">
            <img src={previewLightbox} alt="Preview" className="w-full h-full object-contain rounded-xl" />
            <button
              type="button"
              onClick={() => setPreviewLightbox(null)}
              className="absolute top-3 right-3 bg-black/70 hover:bg-rose-600 text-white rounded-full p-1.5 transition shadow"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

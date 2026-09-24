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
  Monitor,
  FolderOpen,
  Eye,
  RefreshCw,
  Crown,
  Flame,
  AlertCircle,
  ShieldCheck,
  DollarSign,
  Tag,
  Loader2
} from 'lucide-react';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { compressImage } from '../../../utils/imageCompressor.ts';
import { autoCropGarment, cleanGarmentBackground } from '../../../utils/garmentCropper.ts';
import { analyzeVintageGarment, getDefaultSellingPrice } from '../../../utils/geminiVintageValuation.ts';
import { ExtractedTagData } from './CameraTagScannerModal.tsx';

export type PhotoSlot = 'front' | 'back' | 'tag';

interface StudioPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSlot?: PhotoSlot;
  frontImageUrl?: string;
  backImageUrl?: string;
  tagImageUrl?: string;
  onSavePhotos: (photos: { front?: string; back?: string; tag?: string }, appraisal?: ExtractedTagData) => void;
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
  const isMobile = typeof navigator !== 'undefined' && /mobi|android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

  const [currentSlot, setCurrentSlot] = useState<PhotoSlot>(activeSlot);
  const [frontImg, setFrontImg] = useState<string | undefined>(initialFront);
  const [backImg, setBackImg] = useState<string | undefined>(initialBack);
  const [tagImg, setTagImg] = useState<string | undefined>(initialTag);

  const [cameraActive, setCameraActive] = useState(false);
  // Default to 'user' on desktop PC to avoid OverconstrainedError, 'environment' on phones
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(isMobile ? 'environment' : 'user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [showSilhouette, setShowSilhouette] = useState(true);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);

  // AI Appraisal State (Antique Heritage, Vintage Grails, Y2K, and Non-Brand Pricing Engine)
  const [appraisal, setAppraisal] = useState<ExtractedTagData | null>(null);
  const [isAppraising, setIsAppraising] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);
  const [appraisalStep, setAppraisalStep] = useState<string>('');

  const handleRunAppraisal = async (overrideImg?: string) => {
    const targetImage = overrideImg || tagImg || frontImg || backImg;
    if (!targetImage) {
      setAppraisalError('Please capture or upload at least one photo (tag or front look) to run AI appraisal.');
      return;
    }
    setIsAppraising(true);
    setAppraisalError(null);
    setAppraisalStep('🔍 Inspecting tag typography, stitch & garment era...');

    try {
      setTimeout(() => setAppraisalStep('🤖 Gemini Flash AI verifying era (Antique / Vintage / Y2K / Non-Brand)...'), 400);
      setTimeout(() => setAppraisalStep('💰 Evaluating Dubai market retail price & turnover speed...'), 900);

      const res = await analyzeVintageGarment({ imageBase64: targetImage });
      const extracted: ExtractedTagData = {
        brand: res.brand,
        size: res.size,
        countryOfOrigin: res.countryOfOrigin,
        style: res.stitchType,
        confidence: res.confidence,
        notes: res.grailNotes,
        tagImageUrl: targetImage,
        garmentTitle: res.garmentTitle,
        category: res.category,
        era: res.era,
        stitchType: res.stitchType,
        tagType: res.tagType,
        rarityTier: res.rarityTier,
        isGrail: res.isGrail,
        estimatedMarketValueAed: res.estimatedMarketValueAed,
        estimatedMarketValueUsd: res.estimatedMarketValueUsd,
        recommendedRetailPriceAed: res.recommendedRetailPriceAed,
        suggestedQualityGrade: res.suggestedQualityGrade,
        grailNotes: res.grailNotes,
        collectorTipsUrdu: res.collectorTipsUrdu,
        source: res.source,
        ecommerce_description: res.ecommerce_description,
        seo_tags: res.seo_tags,
        marketSegment: res.marketSegment,
        global_insights: res.global_insights
      };
      setAppraisal(extracted);
      if (res.isGrail || res.rarityTier === 'ANTIQUE') {
        luxuryAudio.playCashRegisterSound();
      } else {
        luxuryAudio.playMechanicalClick();
      }
    } catch (err: any) {
      setAppraisalError(err?.message || 'Appraisal failed. Please try again with a clearer photo.');
    } finally {
      setIsAppraising(false);
      setAppraisalStep('');
    }
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const silhouetteGuideRef = useRef<HTMLDivElement | null>(null);
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

  // Universal camera initialization optimized for Computer, Android, and iPhone
  const startCamera = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    setIsPermissionDenied(false);
    setIsNotFound(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Webcam / live camera streaming is not supported by this browser. Use file upload or native device camera below.');
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
      }
    }

    // Strategy 2: Desktop PC vs Mobile strategy
    if (!stream) {
      if (!isMobile) {
        // Desktop PC: Try generic video: true FIRST so it never fails on non-existent 'environment' cameras
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } catch (err: any) {
          lastErr = err;
        }
      } else {
        // Mobile (iPhone / Android): Try rear camera first
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
          // Fallback to basic facingMode without resolution constraints (for older iPhones)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: facingMode } },
              audio: false
            });
          } catch (err2: any) {
            lastErr = err2;
          }
        }
      }
    }

    // Strategy 3: Universal fallback - generic video: true for any platform
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      } catch (err: any) {
        lastErr = err;
      }
    }

    // Evaluate failure
    if (!stream) {
      const errName = lastErr?.name || '';
      const errMsg = (lastErr?.message || '').toLowerCase();
      const notFound =
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.includes('not found') ||
        errMsg.includes('device not found');

      const isDenied =
        (errName === 'NotAllowedError' ||
         errName === 'PermissionDeniedError' ||
         errMsg.includes('denied') ||
         errMsg.includes('permission')) &&
        !notFound;

      setIsNotFound(notFound);
      setIsPermissionDenied(isDenied);

      if (notFound) {
        setCameraError('No webcam hardware detected on this computer. Please attach a USB camera or upload photos from files.');
      } else if (isDenied) {
        setCameraError('Camera access is currently blocked by your browser.');
      } else {
        setCameraError(lastErr?.message || 'Unable to open camera stream.');
      }
      setCameraActive(false);
      return;
    }

    // Success: Store stream and connect to video element
    streamRef.current = stream;
    setCameraActive(true);

    if (videoRef.current) {
      // iPhone / Safari WebKit strict compliance
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      videoRef.current.muted = true;
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (playErr) {
        console.warn('Initial play error, retrying muted:', playErr);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      }
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
  }, [facingMode, isMobile, selectedDeviceId, stopCamera]);

  // Sync initial images when modal opens and start camera
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

  // Re-attach video stream whenever cameraActive becomes true
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      videoRef.current.muted = true;
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [cameraActive]);

  // Live browser permission listener: auto-resumes camera when user allows it in the URL bar
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any })
        .then(permStatus => {
          if (permStatus.state === 'granted' && !cameraActive && isOpen) {
            startCamera();
          }
          permStatus.onchange = () => {
            if (permStatus.state === 'granted') {
              setIsPermissionDenied(false);
              setCameraError(null);
              startCamera();
            } else if (permStatus.state === 'denied') {
              setIsPermissionDenied(true);
            }
          };
        })
        .catch(() => {});
    }
  }, [isOpen, cameraActive, startCamera]);

  // Flip rear / front camera
  const toggleFacingMode = () => {
    luxuryAudio.playMechanicalClick();
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setSelectedDeviceId('');
    startCamera();
  };

  // Switch to specific camera device (if multiple cameras exist)
  const handleDeviceChange = (devId: string) => {
    luxuryAudio.playMechanicalClick();
    setSelectedDeviceId(devId);
    startCamera(devId);
  };

  // Capture frame from live video element with silhouette framing & garment isolation
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
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    let cropX = 0;
    let cropY = 0;
    let cropW = vw;
    let cropH = vh;

    // If silhouette guide is visible, map its bounding box to the video feed
    if (silhouetteGuideRef.current && showSilhouette) {
      const guideRect = silhouetteGuideRef.current.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();

      const videoAspect = vw / vh;
      const containerAspect = videoRect.width / videoRect.height;

      let renderedW = videoRect.width;
      let renderedH = videoRect.height;
      let clipX = 0;
      let clipY = 0;

      if (containerAspect > videoAspect) {
        renderedH = videoRect.width / videoAspect;
        clipY = (renderedH - videoRect.height) / 2;
      } else {
        renderedW = videoRect.height * videoAspect;
        clipX = (renderedW - videoRect.width) / 2;
      }

      const scaleToNatural = vw / renderedW;
      const guideBoxX = (guideRect.left - videoRect.left) + clipX;
      const guideBoxY = (guideRect.top - videoRect.top) + clipY;

      // Add a slight 5% comfort padding around the silhouette box
      const padW = guideRect.width * 0.05;
      const padH = guideRect.height * 0.05;

      cropX = Math.max(0, Math.min(vw - 50, Math.round((guideBoxX - padW) * scaleToNatural)));
      cropY = Math.max(0, Math.min(vh - 50, Math.round((guideBoxY - padH) * scaleToNatural)));
      cropW = Math.max(50, Math.min(vw - cropX, Math.round((guideRect.width + padW * 2) * scaleToNatural)));
      cropH = Math.max(50, Math.min(vh - cropY, Math.round((guideRect.height + padH * 2) * scaleToNatural)));
    }

    canvas.width = cropW;
    canvas.height = cropH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, flip horizontally for natural mirror look
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);

    setIsProcessing(true);
    try {
      // 1. Isolate the garment / t-shirt from holding hands and background
      let processedUrl = rawDataUrl;
      try {
        const isolated = await autoCropGarment(rawDataUrl, { cleanBackground: true, cleanTolerance: 30 });
        if (isolated && isolated.didCrop) {
          processedUrl = isolated.croppedImageUrl;
        }
      } catch (e) {
        console.warn('Garment auto-crop skipped:', e);
      }

      // 2. True Background Removal: flood-fill & isolate external backgrounds to studio white (#FFFFFF)
      if (currentSlot !== 'tag') {
        try {
          const cleaned = await cleanGarmentBackground(processedUrl, 30);
          if (cleaned) {
            processedUrl = cleaned;
          }
        } catch (bgErr) {
          console.warn('Background cleaning notice:', bgErr);
        }
      }

      // 3. Compress and save
      const compressed = await compressImage(processedUrl, 1280, 0.85);
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
      // Auto-trigger appraisal when garment tag is captured
      handleRunAppraisal(dataUrl);
    }
  };

  // File input handler with automatic studio compression, garment isolation, and background removal
  const handleNativeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const compressed = await compressImage(file, 1280, 0.85);
        // Smart garment isolation on uploaded photos
        let finalPhoto = compressed;
        try {
          const isolated = await autoCropGarment(compressed, { cleanBackground: true, cleanTolerance: 30 });
          if (isolated && isolated.didCrop) {
            finalPhoto = isolated.croppedImageUrl;
          }
        } catch (_) {}

        // True background removal for garment front & back photos
        if (currentSlot !== 'tag') {
          try {
            const cleaned = await cleanGarmentBackground(finalPhoto, 30);
            if (cleaned) finalPhoto = cleaned;
          } catch (_) {}
        }

        applyPhotoToCurrentSlot(finalPhoto);
        try {
          luxuryAudio.playMechanicalClick();
        } catch {}
      } catch (err) {
        console.error('Image compression error:', err);
      } finally {
        setIsProcessing(false);
      }
      if (e.target) e.target.value = '';
    }
  };

  // Drag and drop handler for desktop users with background removal
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setIsProcessing(true);
      try {
        const compressed = await compressImage(file, 1280, 0.85);
        let finalPhoto = compressed;
        try {
          const isolated = await autoCropGarment(compressed, { cleanBackground: true, cleanTolerance: 30 });
          if (isolated && isolated.didCrop) {
            finalPhoto = isolated.croppedImageUrl;
          }
        } catch (_) {}

        if (currentSlot !== 'tag') {
          try {
            const cleaned = await cleanGarmentBackground(finalPhoto, 30);
            if (cleaned) finalPhoto = cleaned;
          } catch (_) {}
        }

        applyPhotoToCurrentSlot(finalPhoto);
        try {
          luxuryAudio.playMechanicalClick();
        } catch {}
      } catch (err) {
        console.error('Drag drop error:', err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSaveAndClose = () => {
    luxuryAudio.playCashChime();
    onSavePhotos({
      front: frontImg,
      back: backImg,
      tag: tagImg
    }, appraisal || undefined);
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const capturedCount = [frontImg, backImg, tagImg].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* TOP HEADER */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Camera className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Garment 3-Angle Studio Camera
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  cameraActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SLOT TABS SELECTOR */}
        <div className="grid grid-cols-3 bg-slate-900/60 p-2 gap-2 border-b border-slate-800 shrink-0">
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

        {/* SCROLLABLE INNER BODY FOR MOBILE/DESKTOP RESPONSIVENESS */}
        <div className="overflow-y-auto flex-1 flex flex-col min-h-0 divide-y divide-slate-800/60 no-scrollbar">
          {/* CAMERA VIEWFINDER & STUDIO VIEWPORT */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`relative bg-black shrink-0 min-h-[220px] sm:min-h-[280px] max-h-[340px] sm:max-h-[420px] overflow-hidden flex items-center justify-center select-none ${
              isDragOver ? 'ring-4 ring-indigo-500 bg-indigo-950/40' : ''
            }`}
          >
          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Flash Effect on capture */}
          {isFlashActive && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-150" />
          )}

          {/* Persistent Video Stream Element (Never display:none so Safari WebKit doesn't abort playback) */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
              cameraActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none -z-10'
            }`}
          />

          {/* STANDBY / NON-BLOCKING ASSISTANT SCREEN (Displayed when live stream is inactive) */}
          {!cameraActive && (
            <div className="relative z-20 p-4 sm:p-6 text-center text-slate-300 w-full max-w-lg mx-auto space-y-4">
              {/* Central Capture Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-3.5">
                <div className="flex items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                    <Camera className="w-7 h-7" />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                    <span>Ready to Capture:</span>
                    <span className="text-amber-300 uppercase tracking-wide">
                      {currentSlot === 'front' ? '1. Front Look' : currentSlot === 'back' ? '2. Back Look' : '3. Garment Tag'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {isMobile
                      ? 'Tap below to open your camera or choose a photo from your gallery.'
                      : 'Take a photo with your webcam, or select / drop garment pictures from your computer.'}
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {/* On Mobile: Direct Phone Camera trigger */}
                  {isMobile ? (
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      <span>Snap with Phone Camera</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-400" />
                      <span>Select Photo from PC</span>
                    </button>
                  )}

                  {/* Launch Live Webcam / Stream button */}
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{cameraError ? 'Retry Live Camera' : 'Turn On Live Camera'}</span>
                  </button>
                </div>

                {/* Helpful Permission Guidance (Subtle & Non-blocking) */}
                {isPermissionDenied && (
                  <div className="bg-slate-950/80 rounded-xl p-3 border border-amber-500/30 text-left space-y-1.5 text-[11px] text-slate-300 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Camera is blocked in browser settings</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      To use the live webcam feed: Click the <strong>🔒 lock icon</strong> next to the web address at the top of your screen, set <strong>Camera</strong> to <strong>Allow</strong>, and it will turn on automatically!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Garment Silhouette / Guide Outline Overlay (Active when camera is live) */}
          {cameraActive && showSilhouette && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-20">
              <div ref={silhouetteGuideRef} className="w-52 h-68 sm:w-60 sm:h-76 border-2 border-dashed border-white/40 rounded-3xl relative flex items-center justify-center">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/90 tracking-wider uppercase bg-black/70 px-3 py-0.5 rounded-full border border-white/20 backdrop-blur-sm whitespace-nowrap">
                  {currentSlot === 'front' ? '👔 FRONT CHEST' : currentSlot === 'back' ? '🧥 BACK VIEW' : '🏷️ TAG / COLLAR'}
                </div>
                {/* Center crosshair */}
                <div className="w-6 h-[1px] bg-white/50 absolute" />
                <div className="h-6 w-[1px] bg-white/50 absolute" />
              </div>
            </div>
          )}

          {/* Viewfinder HUD Overlays (Top Right) */}
          {cameraActive && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30">
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold backdrop-blur-md">
                <Sparkles className="w-3 h-3 text-emerald-300" />
                <span>Studio BG Clean</span>
              </div>
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

          {/* Live Slot Indicator Badge (Bottom Left) */}
          <div className="absolute bottom-2 left-2 z-30 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/20 text-white text-[11px] font-mono flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span className="font-bold">Slot:</span>
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
            {/* Direct Native Phone Camera Trigger (Invokes phone camera app on mobile) */}
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
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer"
                title="Opens the camera app on your phone"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Native</span> Camera
              </button>
            </div>

            {/* Central Big Shutter Button: Snaps live frame if camera is on, or triggers camera/picker if standby */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (cameraActive) {
                    capturePhoto();
                  } else if (isMobile) {
                    nativeCameraInputRef.current?.click();
                  } else {
                    galleryInputRef.current?.click();
                  }
                }}
                className="group relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-rose-500 via-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all duration-150 ring-4 ring-white/20 cursor-pointer"
                title={cameraActive ? "Snap photo from live camera" : "Choose / snap photo for this slot"}
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
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer"
                title="Choose photo from computer files or gallery"
              >
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                <span>{isMobile ? 'Gallery' : 'Browse PC'}</span>
              </button>
            </div>
          </div>

          {/* AI Vintage & Era Appraisal Bar */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>AI Appraisal & Market Price:</span>
              </span>
              {isAppraising ? (
                <span className="text-[11px] text-amber-200 flex items-center gap-1 font-mono animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  <span>{appraisalStep || 'AI Analyzing...'}</span>
                </span>
              ) : appraisal ? (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Era: {appraisal.era} • AED {appraisal.recommendedRetailPriceAed}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Auto-evaluates Antique, 90s Grail, Y2K & Non-Brand market resale values
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={isAppraising || (!frontImg && !backImg && !tagImg)}
              onClick={() => handleRunAppraisal()}
              className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-[11px] px-3 py-1 rounded-lg flex items-center gap-1.5 shadow shadow-amber-500/20 active:scale-95 transition disabled:opacity-40 cursor-pointer"
              title="Run AI appraisal now on captured photos"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              <span>{isAppraising ? 'Appraising...' : '🤖 Run AI Appraisal'}</span>
            </button>
          </div>

          {appraisalError && (
            <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-[11px] text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{appraisalError}</span>
            </div>
          )}

          {/* APPRAISAL RESULT CARD */}
          {appraisal && (
            <div className={`p-3 rounded-xl border space-y-2 animate-in fade-in duration-200 ${
              appraisal.rarityTier === 'ANTIQUE'
                ? 'bg-purple-950/80 border-purple-500/60'
                : appraisal.isGrail
                ? 'bg-amber-950/80 border-amber-500/60'
                : appraisal.rarityTier === 'RARE_COLLECTIBLE'
                ? 'bg-cyan-950/80 border-cyan-500/60'
                : 'bg-slate-950 border-slate-700'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    appraisal.rarityTier === 'ANTIQUE'
                      ? 'bg-purple-500/30 text-purple-200 border-purple-400'
                      : appraisal.isGrail
                      ? 'bg-amber-500/30 text-amber-200 border-amber-400'
                      : appraisal.rarityTier === 'RARE_COLLECTIBLE'
                      ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400'
                      : 'bg-slate-800 text-slate-300 border-slate-600'
                  }`}>
                    {appraisal.rarityTier === 'ANTIQUE' ? '🏛️ Antique Heritage' : appraisal.isGrail ? '🔥 Vintage Grail' : appraisal.rarityTier === 'RARE_COLLECTIBLE' ? '✨ Y2K Archive' : '📦 Everyday Thrift Basic'}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {appraisal.garmentTitle || appraisal.brand}
                  </span>
                  <span className="text-[10px] font-mono text-amber-300 bg-black/40 px-1.5 py-0.5 rounded">
                    {appraisal.era}
                  </span>
                  {appraisal.stitchType && (
                    <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/30">
                      {appraisal.stitchType}
                    </span>
                  )}
                </div>

                {/* Selling Price Adjustment */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-300 font-medium">Selling Price:</span>
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5">
                    <span className="text-[10px] font-bold text-emerald-400 mr-1">AED</span>
                    <input
                      type="number"
                      value={appraisal.recommendedRetailPriceAed || 0}
                      onChange={e => {
                        const val = Number(e.target.value) || 0;
                        setAppraisal(prev => prev ? { ...prev, recommendedRetailPriceAed: val } : null);
                      }}
                      className="w-16 bg-transparent text-xs font-mono font-black text-emerald-300 text-right focus:outline-hidden"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">(Market: AED {appraisal.estimatedMarketValueAed || 0})</span>
                </div>
              </div>

              {/* Brand & Size Extracted Badges & Inputs */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Brand:</span>
                  <input
                    type="text"
                    value={appraisal.brand || ''}
                    placeholder="Brand name"
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? { ...prev, brand: val, garmentTitle: val ? `${val} ${prev.category || 'Apparel'}` : prev.garmentTitle } : null);
                    }}
                    className="w-full bg-transparent text-xs font-bold text-amber-200 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Size:</span>
                  <input
                    type="text"
                    value={appraisal.size || ''}
                    placeholder="e.g. L, XL, 32x32"
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? { ...prev, size: val } : null);
                    }}
                    className="w-full bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-hidden"
                  />
                </div>
              </div>

              {appraisal.collectorTipsUrdu && (
                <p className="text-[11px] text-amber-200/90 font-sans italic bg-black/40 p-1.5 rounded border border-amber-500/20">
                  {appraisal.collectorTipsUrdu}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR (Thumbnails Review & Attach to Piece) */}
      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur-md p-2.5 sm:p-3 border-t border-slate-800 z-10 flex items-center justify-between gap-3 shadow-2xl shrink-0">
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto py-0.5 no-scrollbar">
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

        {/* Confirm & Save Button with High-Contrast Touch Target */}
        <button
          type="button"
          onClick={handleSaveAndClose}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm min-h-[44px] min-w-[130px] flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition shrink-0 active:scale-95 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Attach to Piece</span>
        </button>
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

import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  RefreshCw,
  Tag,
  ArrowRight,
  Smartphone,
  ShieldAlert,
  Crown,
  DollarSign,
  Flame,
  ShieldCheck,
  HelpCircle,
  Key,
  Award
} from 'lucide-react';
import { compressImage } from '../../../utils/imageCompressor.ts';
import { analyzeVintageGarment, VintageValuationResult } from '../../../utils/geminiVintageValuation.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { autoCropGarment } from '../../../utils/garmentCropper.ts';
import { VintageGrailCertificateModal, GrailCertificateData } from '../../../components/VintageGrailCertificateModal.tsx';

export interface ExtractedTagData {
  brand: string;
  size: string;
  countryOfOrigin: string;
  style: string;
  confidence: number;
  notes?: string;
  tagImageUrl?: string;
  // AI Grail & Vintage Value Hunter Fields
  garmentTitle?: string;
  category?: string;
  era?: string;
  stitchType?: string;
  tagType?: string;
  rarityTier?: 'GRAIL' | 'HIGH_VALUE' | 'RARE_COLLECTIBLE' | 'CREAM' | 'GRADE_A' | 'STANDARD';
  isGrail?: boolean;
  estimatedMarketValueAed?: number;
  estimatedMarketValueUsd?: number;
  recommendedRetailPriceAed?: number;
  suggestedQualityGrade?: string;
  grailNotes?: string;
  collectorTipsUrdu?: string;
  source?: 'GEMINI_AI_VISION' | 'HEURISTIC_VINTAGE_ENGINE';
  ecommerce_description?: string;
  seo_tags?: string[];
  marketSegment?: string;
  global_insights?: any;
  pitToPitInches?: number | string;
  lengthInches?: number | string;
  measurements?: {
    pitToPit?: number | string;
    length?: number | string;
  };
}

interface CameraTagScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyExtractedTag: (data: ExtractedTagData) => void;
}

export const CameraTagScannerModal: React.FC<CameraTagScannerModalProps> = ({
  isOpen,
  onClose,
  onApplyExtractedTag
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ExtractedTagData | null>(null);
  const [tagOcrError, setTagOcrError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [showGrailCertModal, setShowGrailCertModal] = useState(false);

  // Quick API Key Config
  const [showApiKeyDrawer, setShowApiKeyDrawer] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>(() => {
    return (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '') : '');
  });
  const [keySavedToast, setKeySavedToast] = useState(false);

  useEffect(() => {
    fetch('/api/setup/gemini-key')
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (res && res.success && res.apiKey) {
          setGeminiApiKeyInput(res.apiKey);
          try {
            localStorage.setItem('vintage_gemini_api_key', res.apiKey);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    setTagOcrError(null);
    setCapturedImage(null);
    setExtractedData(null);
    setIsPermissionDenied(false);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Direct camera API not available on this browser or device. Please upload a tag photo instead.');
      }

      // Stop previous tracks if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch {}
        });
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;
      let lastErr: any = null;

      // Tier 1: facingMode environment with 1280x720
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (e) {
        lastErr = e;
      }

      // Tier 2: generic video stream (works with desktop webcams and USB cameras)
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e) {
          lastErr = e;
        }
      }

      if (!stream) {
        throw lastErr || new Error('Unable to connect to camera.');
      }

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        (err?.message || '').toLowerCase().includes('denied') ||
        (err?.message || '').toLowerCase().includes('permission');

      setIsPermissionDenied(isDenied);
      setCameraError(
        isDenied
          ? 'Browser Camera Access Blocked (Permission Denied)'
          : err.message || 'Camera unavailable. Please upload a tag photo.'
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Wire stream to video whenever cameraActive becomes true
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [cameraActive]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setExtractedData(null);
      setTagOcrError(null);
      setShowApiKeyDrawer(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera stream is initializing. Please wait a moment and tap Capture Photo again.');
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    let cropX = 0;
    let cropY = 0;
    let cropW = vw;
    let cropH = vh;

    // Tightly crop to the visible viewfinder frame, stripping the surrounding floor & table
    if (viewfinderRef.current) {
      const guideRect = viewfinderRef.current.getBoundingClientRect();
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

      cropX = Math.max(0, Math.min(vw - 50, Math.round(guideBoxX * scaleToNatural)));
      cropY = Math.max(0, Math.min(vh - 50, Math.round(guideBoxY * scaleToNatural)));
      cropW = Math.max(50, Math.min(vw - cropX, Math.round(guideRect.width * scaleToNatural)));
      cropH = Math.max(50, Math.min(vh - cropY, Math.round(guideRect.height * scaleToNatural)));
    }

    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Check luminance to ensure not completely black/blank frame
      try {
        const frameSample = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
        let totalBrightness = 0;
        const totalPixels = frameSample.data.length / 4;
        for (let i = 0; i < frameSample.data.length; i += 4) {
          totalBrightness += (frameSample.data[i] * 0.299 + frameSample.data[i + 1] * 0.587 + frameSample.data[i + 2] * 0.114);
        }
        const avgBrightness = totalBrightness / totalPixels;
        if (avgBrightness < 12) {
          setTagOcrError('Camera feed appears too dark or lens is covered. Please position clothing tag under good lighting and snap again.');
          return;
        }
      } catch (err) {
        console.warn('Could not inspect frame brightness:', err);
      }

      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);
      stopCamera();

      // Smart apparel isolation: filters out holding hands/fingers and background sorting clutter
      let isolatedImageUrl = rawDataUrl;
      try {
        const cropRes = await autoCropGarment(rawDataUrl);
        if (cropRes && cropRes.didCrop) {
          isolatedImageUrl = cropRes.croppedImageUrl;
        }
      } catch (e) {
        console.warn('Garment auto-crop skipped:', e);
      }

      setCapturedImage(isolatedImageUrl);
      processTagOcr(isolatedImageUrl);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setTagOcrError('File exceeds 15MB limit. Please upload a compressed photo or take a direct picture.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      stopCamera();

      // Smart garment isolation on uploaded image
      let isolatedImageUrl = dataUrl;
      try {
        const cropRes = await autoCropGarment(dataUrl);
        if (cropRes && cropRes.didCrop) {
          isolatedImageUrl = cropRes.croppedImageUrl;
        }
      } catch (e) {
        console.warn('Garment auto-crop skipped on upload:', e);
      }

      setCapturedImage(isolatedImageUrl);
      processTagOcr(isolatedImageUrl);
    };
    reader.readAsDataURL(file);
  };

  const processTagOcr = async (imageBase64?: string) => {
    setIsScanning(true);
    setTagOcrError(null);
    setScanStep('🔍 Aligning garment tag & care label typography...');

    try {
      setTimeout(() => setScanStep('🧵 Inspecting hems: Single-Stitch (Vintage) vs Double-Stitch...'), 500);
      setTimeout(() => setScanStep('🤖 Gemini Flash Vision verifying brand lineage & tag era...'), 1000);
      setTimeout(() => setScanStep('💎 Cross-referencing global resale market values (Grailed / eBay)...'), 1500);
      setTimeout(() => setScanStep('🎯 Calculating protected Dubai boutique retail price tag...'), 2000);

      const targetImage = imageBase64 || capturedImage || '';
      if (!targetImage) {
        throw new Error('No tag image captured or uploaded.');
      }

      const valuation: VintageValuationResult = await analyzeVintageGarment({
        imageBase64: targetImage,
        apiKey: geminiApiKeyInput.trim()
      });

      if (valuation.success) {
        if (valuation.isGrail) {
          luxuryAudio.playCashRegisterSound();
        } else {
          luxuryAudio.playSuccessChime();
        }

        setExtractedData({
          brand: valuation.brand || '',
          size: valuation.size || '',
          countryOfOrigin: valuation.countryOfOrigin || '',
          style: valuation.style || valuation.garmentTitle || '',
          confidence: valuation.confidence || 0.95,
          notes: valuation.grailNotes || 'Appraised via Gemini Vision',
          tagImageUrl: targetImage,
          garmentTitle: valuation.garmentTitle,
          category: valuation.category,
          era: valuation.era,
          stitchType: valuation.stitchType,
          tagType: valuation.tagType,
          rarityTier: valuation.rarityTier,
          isGrail: valuation.isGrail,
          estimatedMarketValueAed: valuation.estimatedMarketValueAed,
          estimatedMarketValueUsd: valuation.estimatedMarketValueUsd,
          recommendedRetailPriceAed: valuation.recommendedRetailPriceAed,
          suggestedQualityGrade: valuation.suggestedQualityGrade,
          grailNotes: valuation.grailNotes,
          collectorTipsUrdu: valuation.collectorTipsUrdu,
          source: valuation.source,
          ecommerce_description: valuation.ecommerce_description,
          seo_tags: valuation.seo_tags,
          marketSegment: valuation.marketSegment,
          global_insights: valuation.global_insights,
          pitToPitInches: valuation.pitToPitInches,
          lengthInches: valuation.lengthInches,
          measurements: valuation.global_insights?.measurements || (valuation.pitToPitInches || valuation.lengthInches ? { pitToPit: valuation.pitToPitInches, length: valuation.lengthInches } : undefined)
        });
      } else {
        throw new Error(valuation.error || 'Could not identify vintage apparel details.');
      }
    } catch (err: any) {
      console.warn('Tag appraisal failed:', err);
      setExtractedData(null);
      setTagOcrError(err?.message || 'Garment appraisal failed. Please ensure the tag or graphic is well-lit and clearly centered.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyToastMessage, setKeyToastMessage] = useState('');

  const handleSaveApiKey = async () => {
    const trimmed = geminiApiKeyInput.trim();
    if (!trimmed || trimmed.length < 8) {
      setKeyToastMessage('Please enter a valid Gemini API key (at least 8 characters).');
      setKeySavedToast(true);
      setTimeout(() => setKeySavedToast(false), 3000);
      return;
    }

    setIsSavingKey(true);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vintage_gemini_api_key', trimmed);
      }

      const res = await fetch('/api/setup/gemini-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed, model: 'gemini-2.5-flash' })
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setKeyToastMessage('✓ Gemini API Key successfully saved and persisted in PostgreSQL database (gemini_api_config)!');
      } else {
        setKeyToastMessage(data?.error || 'Failed to persist API key to PostgreSQL database.');
      }
    } catch (err: any) {
      setKeyToastMessage(err?.message || 'Network error saving API key to database.');
    } finally {
      setIsSavingKey(false);
      setKeySavedToast(true);
      setTimeout(() => setKeySavedToast(false), 3500);
    }
  };

  const handleApply = () => {
    if (extractedData) {
      onApplyExtractedTag(extractedData);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-amber-500/80 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - High-end Vintage Grail Theme */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-amber-950 p-4 text-white flex items-center justify-between border-b border-amber-500/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shadow-inner">
              <Crown className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
                <span>AI Grail & Vintage Value Hunter</span>
                <span className="bg-amber-400/30 text-amber-200 border border-amber-400/40 text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider font-bold">
                  Gemini Vision 2.0
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/80">
                Detects Single-Stitch, Era & True Market Value (AED) to prevent AED 50 underpricing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowApiKeyDrawer(!showApiKeyDrawer)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-mono flex items-center gap-1 cursor-pointer transition-colors"
              title="Configure Google Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API Key</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* API KEY DRAWER (OPTIONAL) */}
        {showApiKeyDrawer && (
          <div className="bg-slate-900 border-b border-amber-500/30 p-3 text-white text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> Google Gemini API Key:
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-indigo-400 hover:underline"
              >
                Get Free Key from AI Studio ↗
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiApiKeyInput}
                onChange={e => setGeminiApiKeyInput(e.target.value)}
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
              />
              <button
                type="button"
                disabled={isSavingKey}
                onClick={handleSaveApiKey}
                className="btn-3d btn-3d-amber text-xs py-1 px-3 disabled:opacity-50"
              >
                {isSavingKey ? 'Saving to SQL...' : 'Save to SQL'}
              </button>
            </div>
            {keySavedToast && (
              <p className={`text-[11px] font-semibold ${keyToastMessage.includes('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {keyToastMessage}
              </p>
            )}
          </div>
        )}

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* MODE SELECTOR & CONTROLS */}
          <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Scanner Input:</span>
              <button
                type="button"
                onClick={startCamera}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  cameraActive && !capturedImage
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Live Camera</span>
              </button>

              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Snap (Phone)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                <span>Upload Photo</span>
              </button>
            </div>

            {capturedImage && (
              <button
                type="button"
                onClick={() => {
                  setCapturedImage(null);
                  setExtractedData(null);
                  setTagOcrError(null);
                  startCamera();
                }}
                className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer flex items-center gap-1"
              >
                <RotateCw className="w-3 h-3" />
                <span>Clear / Retake</span>
              </button>
            )}
          </div>

          {/* OCR ERROR NOTICE */}
          {tagOcrError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <div className="flex-1">
                <strong>Appraisal Notice:</strong> {tagOcrError}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-3d btn-3d-indigo text-[10px] py-1 px-2.5 shrink-0"
              >
                Upload File Instead
              </button>
            </div>
          )}

          {/* CAMERA VIEWFINDER OR PREVIEW */}
          {!extractedData && (
            <div className="space-y-4">
              <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video max-h-[380px] flex items-center justify-center border-2 border-slate-800 shadow-2xl">
                {/* Persistent Video Element */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraActive && !capturedImage ? 'block' : 'hidden'}`}
                />

                {cameraActive && !capturedImage && (
                  <>
                    {/* Viewfinder Frame Guide Specialized for Vintage Tags & Single Stitch */}
                    <div ref={viewfinderRef} className="absolute inset-8 border-2 border-dashed border-amber-400/80 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                      <div className="flex justify-between text-amber-300 font-mono text-[10px] font-bold">
                        <span>[ BRAND & TAG ERA ]</span>
                        <span>[ SINGLE-STITCH HEM ]</span>
                      </div>
                      <div className="text-center text-amber-200 text-xs bg-slate-950/80 py-1.5 px-4 rounded-full mx-auto backdrop-blur-sm border border-amber-400/40 font-semibold shadow-lg">
                        🎯 Point camera at neck tag, wash label, or sleeve hem
                      </div>
                      <div className="flex justify-between text-amber-300 font-mono text-[10px] font-bold">
                        <span>[ FABRIC DISTRESSING ]</span>
                        <span>[ GRAPHIC COPYRIGHT YEAR ]</span>
                      </div>
                    </div>

                    {/* Capture button */}
                    <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="btn-3d btn-3d-amber flex items-center gap-2 text-xs py-2.5 px-7 rounded-full cursor-pointer shadow-2xl font-extrabold text-slate-950"
                      >
                        <Sparkles className="w-4 h-4 text-slate-950 animate-spin" />
                        <span>Appraise Garment with Gemini</span>
                      </button>
                    </div>
                  </>
                )}

                {capturedImage && (
                  <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                    <img
                      src={capturedImage}
                      alt="Captured clothing tag"
                      className="max-h-[340px] w-auto object-contain"
                    />
                    {isScanning && (
                      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin shadow-lg shadow-amber-500/50" />
                        <div className="text-base font-extrabold text-white flex items-center gap-2">
                          <Crown className="w-5 h-5 text-amber-400 animate-bounce" />
                          <span>Gemini Vision Scanning Vintage Grail...</span>
                        </div>
                        <p className="text-xs text-amber-300 font-mono bg-slate-900/80 px-4 py-1.5 rounded-full border border-amber-500/30">
                          {scanStep}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!cameraActive && !capturedImage && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 text-center text-slate-300 space-y-3 w-full max-w-lg cursor-pointer hover:bg-slate-900/40 transition rounded-xl"
                  >
                    {isPermissionDenied ? (
                      <div className="bg-slate-900/90 border-2 border-amber-500/40 rounded-2xl p-5 text-center space-y-3 shadow-2xl">
                        <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto text-amber-300 shadow-inner">
                          <UploadCloud className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-white">
                            Webcam Restricted — Use Upload or Phone Snap
                          </h4>
                          <p className="text-xs text-amber-200/80 max-w-sm mx-auto mt-1">
                            Direct webcam is blocked in browser permissions. You can snap with your phone camera or upload any tag photo below.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-3d btn-3d-amber text-xs py-2 px-4 cursor-pointer font-black text-slate-950 flex items-center gap-1.5 shadow-lg"
                          >
                            <UploadCloud className="w-4 h-4 text-slate-950" />
                            <span>📁 Upload Tag Photo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => nativeCameraInputRef.current?.click()}
                            className="btn-3d btn-3d-emerald text-xs py-2 px-3.5 cursor-pointer font-bold flex items-center gap-1.5"
                          >
                            <Smartphone className="w-4 h-4 text-emerald-300" />
                            <span>📱 Phone Camera</span>
                          </button>

                          <button
                            type="button"
                            onClick={startCamera}
                            className="btn-3d btn-3d-slate text-xs py-2 px-3 flex items-center gap-1.5 text-slate-300 hover:text-white"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Retry Webcam</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 pt-1">
                          💡 Or tap anywhere in this box to select a photo from your computer/gallery
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto text-amber-300 shadow-inner">
                          <Tag className="w-7 h-7 opacity-90" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-white">AI Vintage Tag Scanner Ready</h4>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                            Tap to upload a photo of the garment neck tag, or turn on the live camera.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-3d btn-3d-amber text-xs py-2 px-4.5 cursor-pointer inline-flex items-center gap-1.5 text-slate-950 font-black shadow-lg"
                          >
                            <UploadCloud className="w-4 h-4 text-slate-950" />
                            <span>📁 Upload Tag Photo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => nativeCameraInputRef.current?.click()}
                            className="btn-3d btn-3d-emerald text-xs py-2 px-3.5 cursor-pointer inline-flex items-center gap-1.5 font-bold"
                          >
                            <Smartphone className="w-4 h-4 text-emerald-300" />
                            <span>📱 Phone Camera</span>
                          </button>

                          <button
                            type="button"
                            onClick={startCamera}
                            className="btn-3d btn-3d-slate text-xs py-2 px-3.5 cursor-pointer inline-flex items-center gap-1.5 text-slate-300 hover:text-white"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Turn On Webcam</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-1 font-mono">
                          Supports JPG, PNG, WEBP (Auto-compressed)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EXTRACTED RESULTS REVIEW & EDIT (HIGH-VALUE VINTAGE APPRAISAL CARD) */}
          {extractedData && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* VINTAGE GRAIL HERO BANNER */}
              <div className={`p-4 rounded-2xl border-2 shadow-xl ${
                extractedData.isGrail
                  ? 'bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-600/15 border-amber-500 ring-2 ring-amber-500/20'
                  : 'bg-emerald-50 border-emerald-300'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    {extractedData.isGrail ? (
                      <span className="px-2.5 py-1 bg-amber-500 text-slate-950 font-extrabold text-xs rounded-full flex items-center gap-1 shadow-md">
                        <Crown className="w-3.5 h-3.5" />
                        <span>👑 VINTAGE GRAIL PIECE</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-full flex items-center gap-1 shadow-md">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>AUTHENTIC VINTAGE</span>
                      </span>
                    )}

                    <span className="text-[11px] font-mono text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-slate-300">
                      {extractedData.stitchType || 'Single Stitch'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-slate-300">
                      {extractedData.era || '1990s'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGrailCertModal(true)}
                      className="btn-3d btn-3d-amber text-[11px] py-1 px-2.5 cursor-pointer inline-flex items-center gap-1 font-bold text-amber-950"
                      title="View AI Digital Certificate of Authenticity with 3D Wax Seal"
                    >
                      <Award className="w-3.5 h-3.5 text-amber-900" />
                      <span>📜 Grail Certificate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExtractedData(null);
                        setCapturedImage(null);
                        startCamera();
                      }}
                      className="btn-3d btn-3d-slate text-[11px] py-1 px-2.5 cursor-pointer inline-flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Scan Next Piece</span>
                    </button>
                  </div>
                </div>

                {/* Garment Title & High-Speed Market Valuation HUD */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-7 space-y-1">
                    <h4 className="text-base font-extrabold text-slate-950 tracking-tight">
                      {extractedData.garmentTitle || extractedData.brand}
                    </h4>
                    <p className="text-xs text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-600" />
                      <span>Tag: <strong>{extractedData.tagType || extractedData.brand}</strong> ({extractedData.countryOfOrigin})</span>
                    </p>
                  </div>

                  {/* Dual Market Value Badge */}
                  <div className="sm:col-span-5 bg-white/90 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-500">
                        Global Resale Market
                      </span>
                      <span className="text-sm font-black text-slate-800">
                        AED {extractedData.estimatedMarketValueAed || 850}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono">
                        (~${extractedData.estimatedMarketValueUsd || 230} USD)
                      </span>
                    </div>

                    <div className="text-right border-l pl-3 border-slate-200">
                      <span className="block text-[9px] uppercase tracking-wider font-extrabold text-emerald-700">
                        Recommended Tag
                      </span>
                      <span className="text-base font-black text-emerald-600">
                        AED {extractedData.recommendedRetailPriceAed || 750}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded inline-block">
                        PROFIT LOCKED
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warehouse Sorting Guidance Box (Roman Urdu & English to prevent underpricing loss) */}
                {extractedData.collectorTipsUrdu && (
                  <div className="mt-3 bg-amber-500/15 border border-amber-500/40 rounded-xl p-2.5 flex items-start gap-2">
                    <Flame className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-950 leading-relaxed">
                      <strong>⚠️ Sorting Staff Guidance (Khatarnaak Nuqsaan Se Bachaao):</strong>{' '}
                      {extractedData.collectorTipsUrdu}
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Fields (Pre-Filled by AI) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Garment Title & Edition</label>
                  <input
                    type="text"
                    value={extractedData.garmentTitle || extractedData.brand}
                    onChange={e => setExtractedData({ ...extractedData, garmentTitle: e.target.value, brand: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Recommended Selling Price (AED)</label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-xs font-bold text-slate-400">AED</span>
                    <input
                      type="number"
                      value={extractedData.recommendedRetailPriceAed || 750}
                      onChange={e => setExtractedData({ ...extractedData, recommendedRetailPriceAed: Number(e.target.value) })}
                      className="w-full pl-10 bg-white border-2 border-emerald-400 rounded p-1.5 text-xs font-extrabold text-emerald-700 font-mono shadow-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Category</label>
                  <input
                    type="text"
                    value={extractedData.category || 'Graphic T-Shirts & Band Tees'}
                    onChange={e => setExtractedData({ ...extractedData, category: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Size</label>
                  <input
                    type="text"
                    value={extractedData.size}
                    onChange={e => setExtractedData({ ...extractedData, size: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Boutique Quality Grade</label>
                  <input
                    type="text"
                    value={extractedData.suggestedQualityGrade || 'Super Cream (Mint / Luxury Vintage)'}
                    onChange={e => setExtractedData({ ...extractedData, suggestedQualityGrade: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-amber-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Stitch Construction</label>
                  <input
                    type="text"
                    value={extractedData.stitchType || 'Single Stitch'}
                    onChange={e => setExtractedData({ ...extractedData, stitchType: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Country of Origin</label>
                  <input
                    type="text"
                    value={extractedData.countryOfOrigin}
                    onChange={e => setExtractedData({ ...extractedData, countryOfOrigin: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="btn-3d btn-3d-slate text-xs py-2 px-4 cursor-pointer"
          >
            Cancel
          </button>

          {extractedData && (
            <button
              type="button"
              onClick={handleApply}
              className="btn-3d btn-3d-amber text-xs py-2.5 px-6 cursor-pointer font-extrabold flex items-center gap-2 text-slate-950 shadow-xl"
            >
              <Crown className="w-4 h-4 text-slate-950" />
              <span>Apply Grail Appraisal to Piece (AED {extractedData.recommendedRetailPriceAed || 750})</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>
          )}
        </div>

        {/* Hidden inputs for gallery and native phone camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />
        {/* Museum-Grade Vintage Grail Certificate Modal */}
        {extractedData && (
          <VintageGrailCertificateModal
            isOpen={showGrailCertModal}
            onClose={() => setShowGrailCertModal(false)}
            data={{
              certId: `VV-GRAIL-${Math.floor(10000 + Math.random() * 90000)}-DXB`,
              itemTitle: extractedData.garmentTitle || extractedData.brand || 'Vintage Holy Grail',
              brand: extractedData.brand || 'Vintage Archive',
              era: extractedData.era || '1990s',
              provenance: `${extractedData.stitchType || 'Single Stitch'}, Tag: ${extractedData.tagType || extractedData.brand}, Origin: ${extractedData.countryOfOrigin || 'USA'}`,
              category: extractedData.category || 'Vintage Collectible',
              grade: extractedData.suggestedQualityGrade || (extractedData.isGrail ? 'Holy Grail (Museum Grade 9.8)' : 'Grade A Cream'),
              estimatedValueAed: extractedData.recommendedRetailPriceAed || extractedData.estimatedMarketValueAed || 450,
              tagImageUrl: extractedData.tagImageUrl || capturedImage || undefined,
              aiConfidenceScore: extractedData.confidence || 99.4
            }}
          />
        )}
      </div>
    </div>
  );
};

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
import { compressImage, rotateImageDataUrl, autoCropAndOrientGarment } from '../../../utils/imageCompressor.ts';
import { removeGarmentBackground } from '../../../utils/aiBackgroundRemoval.ts';
import { classifyGarmentPhotosWithGemini } from '../../../utils/geminiBulkClassifier.ts';
import { analyzeVintageGarment, getDefaultSellingPrice, resolveStandardGarmentMeasurements } from '../../../utils/geminiVintageValuation.ts';
import { ExtractedTagData } from './CameraTagScannerModal.tsx';

export type PhotoSlot = 'front' | 'back' | 'tag' | 'washTag' | 'lengthTape' | 'widthTape';

export interface SlottedPhotos {
  front?: string;
  back?: string;
  tag?: string;
  washTag?: string;
  lengthTape?: string;
  widthTape?: string;
  measurement?: string; // backward compat alias for lengthTape
}

interface StudioPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSlot?: PhotoSlot | 'measurement';
  frontImageUrl?: string;
  backImageUrl?: string;
  tagImageUrl?: string;
  washTagImageUrl?: string;
  lengthTapeImageUrl?: string;
  widthTapeImageUrl?: string;
  measurementImageUrl?: string;
  onSavePhotos: (photos: {
    front?: string;
    back?: string;
    tag?: string;
    washTag?: string;
    lengthTape?: string;
    widthTape?: string;
    measurement?: string;
  }, appraisal?: ExtractedTagData) => void;
}

export const StudioPhotoCaptureModal: React.FC<StudioPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  activeSlot = 'front',
  frontImageUrl: initialFront,
  backImageUrl: initialBack,
  tagImageUrl: initialTag,
  washTagImageUrl: initialWashTag,
  lengthTapeImageUrl: initialLengthTape,
  widthTapeImageUrl: initialWidthTape,
  measurementImageUrl: initialMeasurement,
  onSavePhotos
}) => {
  const isMobile = typeof navigator !== 'undefined' && /mobi|android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

  const normalizedInitialSlot: PhotoSlot = (activeSlot as string) === 'measurement' ? 'lengthTape' : ((activeSlot as PhotoSlot) || 'front');
  const [currentSlot, setCurrentSlot] = useState<PhotoSlot>(normalizedInitialSlot);

  const initialLength = initialLengthTape || initialMeasurement;
  const initialWidth = initialWidthTape;

  const [photos, setPhotos] = useState<SlottedPhotos>({
    front: initialFront,
    back: initialBack,
    tag: initialTag,
    washTag: initialWashTag,
    lengthTape: initialLength,
    widthTape: initialWidth,
    measurement: initialLength
  });
  const photosRef = useRef<SlottedPhotos>({
    front: initialFront,
    back: initialBack,
    tag: initialTag,
    washTag: initialWashTag,
    lengthTape: initialLength,
    widthTape: initialWidth,
    measurement: initialLength
  });

  const frontImg = photos.front;
  const backImg = photos.back;
  const tagImg = photos.tag;
  const washTagImg = photos.washTag;
  const lengthTapeImg = photos.lengthTape || photos.measurement;
  const widthTapeImg = photos.widthTape;
  const measurementImg = lengthTapeImg; // backward compat

  const updatePhotos = useCallback((newPhotos: Partial<SlottedPhotos> | ((prev: SlottedPhotos) => SlottedPhotos)) => {
    setPhotos(prev => {
      const next = typeof newPhotos === 'function' ? newPhotos(prev) : { ...prev, ...newPhotos };
      if (next.lengthTape && !next.measurement) next.measurement = next.lengthTape;
      photosRef.current = next;
      return next;
    });
  }, []);

  const setFrontImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, front: val })), [updatePhotos]);
  const setBackImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, back: val })), [updatePhotos]);
  const setTagImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, tag: val })), [updatePhotos]);
  const setWashTagImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, washTag: val })), [updatePhotos]);
  const setLengthTapeImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, lengthTape: val, measurement: val })), [updatePhotos]);
  const setWidthTapeImg = useCallback((val?: string) => updatePhotos(p => ({ ...p, widthTape: val })), [updatePhotos]);
  const setMeasurementImg = setLengthTapeImg;

  const swapPhotoSlots = useCallback((slotA: PhotoSlot, slotB: PhotoSlot) => {
    if (slotA === slotB) return;
    updatePhotos(prev => {
      const imgA = prev[slotA];
      const imgB = prev[slotB];
      return {
        ...prev,
        [slotA]: imgB,
        [slotB]: imgA,
        ...(slotA === 'lengthTape' || slotB === 'lengthTape' ? { measurement: slotA === 'lengthTape' ? imgB : imgA } : {})
      };
    });
    setCurrentSlot(slotB);
  }, [updatePhotos]);

  const [cameraActive, setCameraActive] = useState(false);
  // Default to 'user' on desktop PC to avoid OverconstrainedError, 'environment' on phones
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(isMobile ? 'environment' : 'user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [showSilhouette, setShowSilhouette] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);
  const [rawUploadBatch, setRawUploadBatch] = useState<string[]>([]);
  const [classificationNotice, setClassificationNotice] = useState<string | null>(null);

  const applyStandardSequence = (batch: string[]) => {
    if (!batch || batch.length === 0) return;
    const newPhotos: SlottedPhotos = {
      front: batch[0],
      back: batch[1],
      tag: batch[2],
      washTag: batch.length >= 6 ? batch[3] : undefined,
      lengthTape: batch.length >= 6 ? batch[4] : batch[3],
      widthTape: batch.length >= 6 ? batch[5] : batch[4],
      measurement: batch.length >= 6 ? batch[4] : batch[3]
    };
    photosRef.current = newPhotos;
    setPhotos(newPhotos);
    setCurrentSlot('front');
    try { luxuryAudio.playMechanicalClick(); } catch {}
  };

  const applyStudioTapeFirstSequence = (batch: string[]) => {
    if (!batch || batch.length === 0) return;
    // Tape First: Photo 0=LengthTape, Photo 1=WidthTape, Photo 2=Tag, Photo 3=Front, Photo 4=Back, Photo 5=WashTag
    const newPhotos: SlottedPhotos = {
      front: batch[3] || batch[0],
      back: batch[4] || batch[1],
      tag: batch[2],
      washTag: batch[5],
      lengthTape: batch[0],
      widthTape: batch[1],
      measurement: batch[0]
    };
    photosRef.current = newPhotos;
    setPhotos(newPhotos);
    setCurrentSlot('front');
    try { luxuryAudio.playMechanicalClick(); } catch {}
  };

  // Studio Background Mode: 'natural' (Smart Rectangular Crop - 0% edge cutting) vs 'white' (AI White Studio Background)
  const [studioBgMode, setStudioBgMode] = useState<'natural' | 'white'>(() => {
    try {
      const saved = localStorage.getItem('vintage_studio_bg_mode');
      if (saved === 'white' || saved === 'natural') return saved;
    } catch {}
    return 'white';
  });
  const toggleStudioBgMode = async (mode: 'natural' | 'white') => {
    setStudioBgMode(mode);
    try {
      localStorage.setItem('vintage_studio_bg_mode', mode);
      luxuryAudio.playMechanicalClick();
    } catch {}

    // Immediately convert currently loaded Front & Back photos when toggling Studio Background Mode!
    const currFront = photosRef.current.front;
    const currBack = photosRef.current.back;
    if (mode === 'white' && (currFront || currBack)) {
      setIsProcessing(true);
      try {
        const nextFront = currFront
          ? await autoCropAndOrientGarment(currFront, { autoUpright: false, autoCrop: true, forceTighten: true, whiteBackground: true })
          : undefined;
        const nextBack = currBack
          ? await autoCropAndOrientGarment(currBack, { autoUpright: false, autoCrop: true, forceTighten: true, whiteBackground: true })
          : undefined;
        updatePhotos(prev => ({
          ...prev,
          ...(nextFront ? { front: nextFront } : {}),
          ...(nextBack ? { back: nextBack } : {})
        }));
      } catch {} finally {
        setIsProcessing(false);
      }
    }
  };

  // AI Bulk 6-Photo Auto-Classification State
  const [isBulkClassifying, setIsBulkClassifying] = useState(false);
  const [bulkClassificationStep, setBulkClassificationStep] = useState<string>('');

  // AI Appraisal State (Antique Heritage, Vintage Grails, Y2K, and Non-Brand Pricing Engine)
  const [appraisal, setAppraisal] = useState<ExtractedTagData | null>(null);
  const latestAppraisalRef = useRef<ExtractedTagData | null>(null);
  const appraisalPromiseRef = useRef<Promise<ExtractedTagData | null> | null>(null);
  const appraisalReqSeqRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);
  const [isAppraising, setIsAppraising] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);
  const [appraisalStep, setAppraisalStep] = useState<string>('');

  const handleRunAppraisal = async (overrideImg?: string, currentPhotos?: SlottedPhotos): Promise<ExtractedTagData | null> => {
    const activePhotos = currentPhotos || photosRef.current;
    const hasLengthTape = Boolean(activePhotos.lengthTape || activePhotos.measurement);
    const hasWidthTape = Boolean(activePhotos.widthTape);
    // Include ALL uploaded photos (Tag, Wash Label, Front, Back, Length Tape, Width Tape) so AI reads tags, Made In, graphics, AND measuring tapes in ANY photo!
    const orderedForAi = [
      activePhotos.tag,
      activePhotos.washTag,
      activePhotos.front,
      activePhotos.back,
      activePhotos.lengthTape || activePhotos.measurement,
      activePhotos.widthTape
    ].filter(Boolean) as string[];
    const allImages = orderedForAi.length > 0 ? orderedForAi : [overrideImg].filter(Boolean) as string[];
    const targetImage = activePhotos.tag || activePhotos.washTag || activePhotos.front || overrideImg || activePhotos.back || activePhotos.lengthTape || activePhotos.widthTape;
    if (!targetImage && allImages.length === 0) {
      setAppraisalError('Please capture or upload at least one photo (tag or front look) to run AI appraisal.');
      return null;
    }

    const reqId = ++appraisalReqSeqRef.current;
    setIsAppraising(true);
    setAppraisalError(null);
    setAppraisalStep('🔍 Inspecting Main Tag, Wash Label, Made In, Era & Measurements...');

    const runPromise = (async (): Promise<ExtractedTagData | null> => {
      try {
        setTimeout(() => {
          if (reqId === appraisalReqSeqRef.current && !isCancelledRef.current) {
            setAppraisalStep('🤖 Vision AI reading Brand, Graphic Subcategory, Era & Measuring Tape...');
          }
        }, 400);
        setTimeout(() => {
          if (reqId === appraisalReqSeqRef.current && !isCancelledRef.current) {
            setAppraisalStep('💰 Evaluating Dubai market retail price & turnover speed...');
          }
        }, 900);

        const res = await analyzeVintageGarment({
          imageBase64: targetImage || allImages[0],
          imagesBase64: allImages,
          frontImageBase64: activePhotos.front,
          backImageBase64: activePhotos.back,
          lengthTapeImageBase64: activePhotos.lengthTape || activePhotos.measurement,
          widthTapeImageBase64: activePhotos.widthTape,
          washTagImageBase64: activePhotos.washTag,
          hasLengthTape,
          hasWidthTape,
          hasWashTag: Boolean(activePhotos.washTag)
        });

        // Ignore stale or cancelled requests so they never overwrite newer photos or leak after Cancel
        if (isCancelledRef.current || reqId !== appraisalReqSeqRef.current) {
          return latestAppraisalRef.current;
        }

        const latestPhotos = photosRef.current;
        // Preserve measurements detected in ANY photo (and resolve standard size measurements if tape digits were blurry)
        const stdMeas = resolveStandardGarmentMeasurements(res.size, res.category, res.pitToPitInches, res.lengthInches);
        const validPitToPit = String(res.pitToPitInches || stdMeas.pitToPitInches || '');
        const validLength = String(res.lengthInches || stdMeas.lengthInches || '');
        const extracted: ExtractedTagData = {
          brand: res.brand,
          gender: res.gender || "Men's",
          size: res.size,
          countryOfOrigin: res.countryOfOrigin,
          style: res.stitchType,
          confidence: res.confidence,
          notes: res.grailNotes,
          frontImageUrl: latestPhotos.front,
          backImageUrl: latestPhotos.back,
          tagImageUrl: latestPhotos.tag || targetImage || allImages[0],
          washTagImageUrl: latestPhotos.washTag,
          lengthTapeImageUrl: latestPhotos.lengthTape || latestPhotos.measurement,
          widthTapeImageUrl: latestPhotos.widthTape,
          garmentTitle: res.garmentTitle,
          category: res.category,
          subCategory: res.subCategory,
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
          global_insights: res.global_insights,
          pitToPitInches: validPitToPit,
          lengthInches: validLength,
          measurements: (validPitToPit || validLength) ? { pitToPit: validPitToPit, length: validLength } : undefined
        };
        latestAppraisalRef.current = extracted;
        setAppraisal(extracted);
        // NOTE: Do NOT call onSavePhotos here! Photos & appraisal are ONLY attached when user clicks "Attach to Piece"
        if (res.isGrail || res.rarityTier === 'ANTIQUE') {
          luxuryAudio.playCashRegisterSound();
        } else {
          luxuryAudio.playMechanicalClick();
        }
        return extracted;
      } catch (err: any) {
        if (!isCancelledRef.current && reqId === appraisalReqSeqRef.current) {
          setAppraisalError(err?.message || 'Appraisal failed. Please try again with a clearer photo.');
        }
        return latestAppraisalRef.current;
      } finally {
        if (reqId === appraisalReqSeqRef.current) {
          setIsAppraising(false);
          setAppraisalStep('');
          appraisalPromiseRef.current = null;
        }
      }
    })();

    appraisalPromiseRef.current = runPromise;
    return runPromise;
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const silhouetteGuideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const bulkUploadInputRef = useRef<HTMLInputElement | null>(null);

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

    // Query connected camera devices and ensure 1x natural wide zoom (never zoomed in)
    try {
      const activeTrack = stream.getVideoTracks()[0];
      try {
        const caps: any = activeTrack?.getCapabilities?.();
        if (caps && caps.zoom && typeof caps.zoom.min === 'number') {
          const targetZoom = caps.zoom.min <= 1 && caps.zoom.max >= 1 ? 1 : caps.zoom.min;
          await activeTrack.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
        }
      } catch (_) {}

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter(d => d.kind === 'videoinput');
      setAvailableDevices(videoDevs);
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
      isCancelledRef.current = false;
      const normalizedSlot: PhotoSlot = (activeSlot as string) === 'measurement' ? 'lengthTape' : ((activeSlot as PhotoSlot) || 'front');
      setCurrentSlot(normalizedSlot);
      const initialLen = initialLengthTape || initialMeasurement;
      const initialMap = {
        front: initialFront,
        back: initialBack,
        tag: initialTag,
        washTag: initialWashTag,
        lengthTape: initialLen,
        widthTape: initialWidthTape,
        measurement: initialLen
      };
      photosRef.current = initialMap;
      setPhotos(initialMap);
      if (!initialFront && !initialTag && !initialWashTag) {
        setAppraisal(null);
        latestAppraisalRef.current = null;
        appraisalPromiseRef.current = null;
      }
      const hasAnyAttached = Boolean(
        initialFront || initialBack || initialTag || initialWashTag || initialLen || initialWidthTape
      );
      if (hasAnyAttached) {
        stopCamera();
      } else {
        startCamera();
      }
    } else {
      isCancelledRef.current = true;
      appraisalReqSeqRef.current++;
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeSlot, initialFront, initialBack, initialTag, initialWashTag, initialLengthTape, initialWidthTape, initialMeasurement, startCamera, stopCamera]);

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

  // Live browser permission listener: clears permission error if user grants camera access in URL bar
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any })
        .then(permStatus => {
          permStatus.onchange = () => {
            if (permStatus.state === 'granted') {
              setIsPermissionDenied(false);
              setCameraError(null);
            } else if (permStatus.state === 'denied') {
              setIsPermissionDenied(true);
            }
          };
        })
        .catch(() => {});
    }
  }, [isOpen]);

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

  // Capture full uncropped frame from live video element so the entire garment fits naturally
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

    // Always capture 100% full camera sensor frame (no center cropping or forced zoom)
    canvas.width = vw;
    canvas.height = vh;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, flip horizontally for natural mirror look
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, vw, vh);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);

    setIsProcessing(true);
    try {
      const processed = await processPhotoForSlot(rawDataUrl, currentSlot);
      applyPhotoToCurrentSlot(processed);
    } catch (e) {
      applyPhotoToCurrentSlot(rawDataUrl);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to process photo for a slot: RTX 3070 Ti GPU Pure White Studio (#FFFFFF) on Front & Back
  const processPhotoForSlot = async (
    rawSource: string | File | Blob,
    slot?: PhotoSlot
  ): Promise<string> => {
    const isFullGarmentSlot = !slot || slot === 'front' || slot === 'back' || slot === 'lengthTape' || slot === 'widthTape';
    const isCleanLookSlot = !slot || slot === 'front' || slot === 'back';
    const useWhiteBg = isCleanLookSlot && studioBgMode === 'white';
    return await compressImage(rawSource as any, 1280, 0.90, {
      autoUpright: false,
      autoCrop: isFullGarmentSlot,
      forceTighten: isCleanLookSlot,
      whiteBackground: useWhiteBg
    });
  };

  // Rotate active slot photo 90° clockwise with 1 click
  const handleRotateActiveSlot = async () => {
    const activeImg = photosRef.current[currentSlot];
    if (!activeImg) return;
    try {
      luxuryAudio.playMechanicalClick();
      const rotated = await rotateImageDataUrl(activeImg, 90);
      updatePhotos(prev => ({
        ...prev,
        [currentSlot]: rotated,
        ...(currentSlot === 'lengthTape' ? { measurement: rotated } : {})
      }));
    } catch (_) {}
  };

  // Auto-crop active slot photo with 1 click (Natural Crop without eating edges)
  const handleAutoCropActiveSlot = async () => {
    const activeImg = photosRef.current[currentSlot];
    if (!activeImg) return;
    try {
      luxuryAudio.playMechanicalClick();
      const cropped = await autoCropAndOrientGarment(activeImg, {
        autoUpright: false,
        autoCrop: true,
        forceTighten: true,
        whiteBackground: false
      });
      updatePhotos(prev => ({
        ...prev,
        [currentSlot]: cropped,
        ...(currentSlot === 'lengthTape' ? { measurement: cropped } : {})
      }));
    } catch (_) {}
  };

  // Apply AI White Studio Background on active slot with 1 click
  const handleApplyAiWhiteStudioSlot = async () => {
    const activeImg = photosRef.current[currentSlot];
    if (!activeImg) return;
    setIsProcessing(true);
    try {
      luxuryAudio.playMechanicalClick();
      const whiteCutout = await autoCropAndOrientGarment(activeImg, {
        autoUpright: false,
        autoCrop: true,
        forceTighten: true,
        whiteBackground: true
      });
      updatePhotos(prev => ({
        ...prev,
        [currentSlot]: whiteCutout,
        ...(currentSlot === 'lengthTape' ? { measurement: whiteCutout } : {})
      }));
    } catch (_) {
      try {
        const fallbackWhite = await removeGarmentBackground(activeImg, {
          whiteStudioCanvas: true
        });
        updatePhotos(prev => ({
          ...prev,
          [currentSlot]: fallbackWhite
        }));
      } catch {}
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply photo to active slot, close live camera, and show attached Preview immediately
  const applyPhotoToCurrentSlot = (dataUrl: string) => {
    stopCamera();
    updatePhotos(prev => {
      const next = { ...prev, [currentSlot]: dataUrl };
      return next;
    });

    const activePhotos = { ...photosRef.current, [currentSlot]: dataUrl };
    photosRef.current = activePhotos;

    if (currentSlot === 'front') {
      handleRunAppraisal(activePhotos.tag || activePhotos.washTag || dataUrl, activePhotos);
    } else if (currentSlot === 'back') {
      handleRunAppraisal(activePhotos.tag || dataUrl, activePhotos);
    } else {
      handleRunAppraisal(dataUrl, activePhotos);
    }
  };

  // File input handler with direct non-destructive studio compression & optional AI cutout
  const handleNativeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      setIsProcessing(true);
      try {
        const processed = await processPhotoForSlot(file, currentSlot);
        applyPhotoToCurrentSlot(processed);
        try {
          luxuryAudio.playMechanicalClick();
        } catch {}
      } catch (err) {
        console.error('Image processing error:', err);
      } finally {
        setIsProcessing(false);
      }
      if (e.target) e.target.value = '';
    }
  };

  // Drag and drop handler with AI cutout & studio compression
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      stopCamera();
      setIsProcessing(true);
      try {
        const processed = await processPhotoForSlot(file, currentSlot);
        applyPhotoToCurrentSlot(processed);
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

  // AI Bulk 6-Photo Upload & Exact Slot Assignment
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    stopCamera();
    const files = Array.from(fileList).slice(0, 6);
    setIsBulkClassifying(true);
    setBulkClassificationStep('📁 Reading 6 garment photos (preserving raw orientation for tape & tag detection)...');

    try {
      const base64Images: string[] = [];
      for (const file of files) {
        const b64 = await compressImage(file, 1440, 0.92, {
          autoUpright: false,
          autoCrop: false
        });
        base64Images.push(b64);
      }
      setRawUploadBatch(base64Images);

      if (base64Images.length === 1) {
        applyPhotoToCurrentSlot(base64Images[0]);
        return;
      }

      setBulkClassificationStep('⚡ Vision AI slotting 1.Front, 2.Back, 3.Main Tag, 4.Wash Label, 5.Length, 6.Width...');
      const classification = await classifyGarmentPhotosWithGemini(base64Images);

      // Deduplicate slot indices so every uploaded photo goes to its own unique slot
      const count = base64Images.length;
      const usedIdx = new Set<number>();
      const claimIdx = (candidate?: number): number | undefined => {
        if (typeof candidate === 'number' && candidate >= 0 && candidate < count && !usedIdx.has(candidate)) {
          usedIdx.add(candidate);
          return candidate;
        }
        return undefined;
      };
      const nextRemainingIdx = (): number | undefined => {
        for (let i = 0; i < count; i++) {
          if (!usedIdx.has(i)) {
            usedIdx.add(i);
            return i;
          }
        }
        return undefined;
      };

      const lIdx = claimIdx(classification.length_tape_index);
      const wIdx = claimIdx(classification.width_tape_index);
      const tIdx = claimIdx(classification.tag_index);
      const washIdx = claimIdx(classification.wash_tag_index);
      const fIdx = claimIdx(classification.front_index);
      const bIdx = claimIdx(classification.back_index);

      const finalFIdx = fIdx ?? nextRemainingIdx();
      const finalBIdx = bIdx ?? nextRemainingIdx();
      const finalTIdx = tIdx ?? nextRemainingIdx();
      const finalWashIdx = washIdx ?? nextRemainingIdx();
      const finalLIdx = lIdx ?? nextRemainingIdx();
      const finalWIdx = wIdx ?? nextRemainingIdx();

      const rawFront = finalFIdx !== undefined ? base64Images[finalFIdx] : undefined;
      const rawBack = finalBIdx !== undefined ? base64Images[finalBIdx] : undefined;
      const tag = finalTIdx !== undefined ? base64Images[finalTIdx] : undefined;
      const washTag = finalWashIdx !== undefined ? base64Images[finalWashIdx] : undefined;
      const lengthTape = finalLIdx !== undefined ? base64Images[finalLIdx] : undefined;
      const widthTape = finalWIdx !== undefined ? base64Images[finalWIdx] : undefined;

      setBulkClassificationStep('✨ RTX 3070 Ti GPU applying Pure White Studio Background (#FFFFFF) to Front & Back...');
      const useWhiteForBulk = studioBgMode === 'white';
      const [front, back] = await Promise.all([
        rawFront
          ? autoCropAndOrientGarment(rawFront, { autoUpright: false, autoCrop: true, forceTighten: true, whiteBackground: useWhiteForBulk })
          : Promise.resolve(undefined),
        rawBack
          ? autoCropAndOrientGarment(rawBack, { autoUpright: false, autoCrop: true, forceTighten: true, whiteBackground: useWhiteForBulk })
          : Promise.resolve(undefined)
      ]);

      const newPhotos: SlottedPhotos = {
        front,
        back,
        tag,
        washTag,
        lengthTape,
        widthTape,
        measurement: lengthTape
      };
      photosRef.current = newPhotos;
      setPhotos(newPhotos);
      setCurrentSlot('front');
      stopCamera();

      setClassificationNotice(
        classification.ustadVerified
          ? `🟢 USTAD ACTIVE (${classification.ustadModel || 'Gemini 3.8 Flash'}): 6 Photos slotted + RTX 3070 Ti GPU Pure White Studio Background applied!`
          : '✨ 6 Photos slotted + RTX 3070 Ti GPU Pure White Studio Background applied!'
      );
      setTimeout(() => setClassificationNotice(null), 10000);

      try {
        luxuryAudio.playCashRegisterSound();
      } catch {}

      // Automatically trigger AI appraisal using all slotted photos
      handleRunAppraisal(tag || washTag || front, newPhotos);
    } catch (err: any) {
      console.error('[BulkUpload] Auto-classification notice:', err);
    } finally {
      setIsBulkClassifying(false);
      setBulkClassificationStep('');
      if (e.target) e.target.value = '';
    }
  };

  const handleCancelAndClose = () => {
    isCancelledRef.current = true;
    appraisalReqSeqRef.current++;
    appraisalPromiseRef.current = null;
    setIsAppraising(false);
    setAppraisalStep('');
    stopCamera();
    onClose();
  };

  const handleSaveAndClose = async () => {
    luxuryAudio.playCashChime();
    setIsProcessing(true);
    let finalAppraisal = latestAppraisalRef.current || appraisal;

    try {
      // Run GPU Studio Cutout + Final Compression on 1. Front and 2. Back right when attaching to the piece!
      const useWhite = studioBgMode === 'white';
      let finalFront = photosRef.current.front;
      let finalBack = photosRef.current.back;

      if (finalFront && !finalFront.startsWith('data:image/png')) {
        try {
          finalFront = await autoCropAndOrientGarment(finalFront, {
            autoUpright: false,
            autoCrop: true,
            forceTighten: true,
            whiteBackground: useWhite
          });
        } catch {}
      }
      if (finalBack && !finalBack.startsWith('data:image/png')) {
        try {
          finalBack = await autoCropAndOrientGarment(finalBack, {
            autoUpright: false,
            autoCrop: true,
            forceTighten: true,
            whiteBackground: useWhite
          });
        } catch {}
      }

      photosRef.current = {
        ...photosRef.current,
        front: finalFront,
        back: finalBack
      };

      if (appraisalPromiseRef.current) {
        try {
          finalAppraisal = await appraisalPromiseRef.current;
        } catch {}
      } else if (!finalAppraisal && (photosRef.current.tag || photosRef.current.washTag || photosRef.current.front)) {
        try {
          finalAppraisal = await handleRunAppraisal(photosRef.current.tag || photosRef.current.washTag || photosRef.current.front, photosRef.current);
        } catch {}
      }

      if (finalAppraisal) {
        finalAppraisal = {
          ...finalAppraisal,
          frontImageUrl: finalFront,
          backImageUrl: finalBack
        };
      }

      onSavePhotos({
        front: finalFront,
        back: finalBack,
        tag: photosRef.current.tag,
        washTag: photosRef.current.washTag,
        lengthTape: photosRef.current.lengthTape || photosRef.current.measurement,
        widthTape: photosRef.current.widthTape,
        measurement: photosRef.current.lengthTape || photosRef.current.measurement
      }, finalAppraisal || undefined);
    } finally {
      setIsProcessing(false);
    }
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const capturedCount = [frontImg, backImg, tagImg, washTagImg, lengthTapeImg, widthTapeImg].filter(Boolean).length;
  const currentSlotImage = currentSlot === 'front'
    ? frontImg
    : currentSlot === 'back'
    ? backImg
    : currentSlot === 'tag'
    ? tagImg
    : currentSlot === 'washTag'
    ? washTagImg
    : currentSlot === 'lengthTape'
    ? lengthTapeImg
    : widthTapeImg;

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
                Garment 6-Angle Studio & Measurement Camera
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  cameraActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {cameraActive ? 'Live Viewfinder' : 'Preview Ready'}
                </span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {capturedCount}/6 Photos
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                4 Storefront Photos (Front, Back, Main Tag, Wash Label) + 2 AI Measurement Tape Photos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Explicit Preview vs Live Camera Toggle (Works identically on Mobile, Tablet & PC) */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => stopCamera()}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  !cameraActive
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Show Attached Photo Preview (Turns off live camera)"
              >
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => startCamera()}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  cameraActive
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Open Live Camera Scanner"
              >
                <Camera className="w-3 h-3" />
                <span>Camera</span>
              </button>
            </div>

            {/* Studio Background Mode Toggle: Natural Crop vs AI White Studio */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => toggleStudioBgMode('natural')}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  studioBgMode === 'natural'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Natural Studio Auto-Crop (Does not cut garment edges or shoulders)"
              >
                <span>🌿 Natural Crop</span>
              </button>
              <button
                type="button"
                onClick={() => toggleStudioBgMode('white')}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  studioBgMode === 'white'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="AI White Studio Background (#FFFFFF) for Front & Back photos"
              >
                <span>✨ White Studio</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCancelAndClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              title="Cancel & Close without attaching"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 6-SLOT TABS SELECTOR */}
        <div className="grid grid-cols-3 sm:grid-cols-6 bg-slate-900/60 p-2 gap-1.5 border-b border-slate-800 shrink-0">
          {/* Front Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('front');
              if (frontImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'front'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">👔</span>
            <span className="truncate">1. Front</span>
            {frontImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>

          {/* Back Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('back');
              if (backImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'back'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">🧥</span>
            <span className="truncate">2. Back</span>
            {backImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>

          {/* Main Tag Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('tag');
              if (tagImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'tag'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 ring-1 ring-amber-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">🏷️</span>
            <span className="truncate">3. Main Tag</span>
            {tagImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>

          {/* Wash Label Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('washTag');
              if (washTagImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'washTag'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 ring-1 ring-rose-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
            title="Wash Care Label (Shown on E-Commerce & read for Made In / Era)"
          >
            <span className="text-sm">🧼</span>
            <span className="truncate">4. Wash Tag</span>
            {washTagImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>

          {/* Length Tape Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('lengthTape');
              if (lengthTapeImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'lengthTape'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30 ring-1 ring-cyan-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">📏</span>
            <span className="truncate">5. Length</span>
            {lengthTapeImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>

          {/* Width Tape Tab */}
          <button
            type="button"
            onClick={() => {
              setCurrentSlot('widthTape');
              if (widthTapeImg) stopCamera();
            }}
            className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
              currentSlot === 'widthTape'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 ring-1 ring-purple-400'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="text-sm">📐</span>
            <span className="truncate">6. Width</span>
            {widthTapeImg && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          </button>
        </div>

        {/* CLASSIFICATION NOTICE BANNER */}
        {classificationNotice && (
          <div className="bg-indigo-950/90 border-b border-indigo-500/40 px-3 py-1.5 flex items-center justify-between text-xs text-indigo-200 animate-in fade-in shrink-0">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{classificationNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setClassificationNotice(null)}
              className="text-indigo-400 hover:text-white text-xs px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

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
            className={`relative bg-black shrink-0 min-h-[290px] sm:min-h-[380px] max-h-[450px] sm:max-h-[520px] overflow-hidden flex items-center justify-center select-none ${
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
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${
              cameraActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none -z-10'
            }`}
          />

          {/* STANDBY SCREEN / SLOTTED PHOTO PREVIEW (Full-Frame Prominent Garment View + Dedicated Control Bar Below) */}
          {!cameraActive && currentSlotImage ? (
            <div className="relative z-20 w-full h-full flex flex-col items-center justify-center px-2.5 py-2 gap-2 animate-in fade-in duration-150">
              <div className={`relative w-full max-w-xl h-[270px] sm:h-[350px] rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl flex items-center justify-center p-1 ${
                (currentSlot === 'front' || currentSlot === 'back') && studioBgMode === 'white'
                  ? 'bg-white'
                  : 'bg-slate-950/95'
              }`}>
                <img
                  src={currentSlotImage}
                  alt={currentSlot}
                  className="w-full h-full object-contain cursor-pointer select-none"
                  onClick={() => setPreviewLightbox(currentSlotImage)}
                />
                <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1.5 border border-white/20 pointer-events-none">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="uppercase tracking-wide font-mono">
                    {currentSlot === 'front' ? '1. Front Look Attached' : currentSlot === 'back' ? '2. Back Look Attached' : currentSlot === 'tag' ? '3. Main Tag Attached' : currentSlot === 'washTag' ? '4. Wash Label Attached' : currentSlot === 'lengthTape' ? '5. Length Tape Attached' : '6. Width Tape Attached'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 bg-slate-950/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/70 shadow-lg max-w-md w-full">
                <button
                  type="button"
                  onClick={() => setPreviewLightbox(currentSlotImage)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Eye className="w-3 h-3 text-indigo-400" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={handleRotateActiveSlot}
                  className="px-2 py-1 bg-amber-600/90 hover:bg-amber-500 text-white rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-bold shadow"
                  title="Rotate this photo 90° Clockwise"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Rotate 90°</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoCropActiveSlot}
                  className="px-2 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-bold shadow"
                  title="Natural Rectangular Auto-Crop (Safe for all garments)"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Crop</span>
                </button>
                {(currentSlot === 'front' || currentSlot === 'back') && (
                  <>
                    <button
                      type="button"
                      onClick={() => swapPhotoSlots('front', 'back')}
                      className="px-2 py-1 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-bold shadow"
                      title="Swap 1. Front & 2. Back in 1 click"
                    >
                      <span>⇄ Swap Front/Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyAiWhiteStudioSlot}
                      className="px-2 py-1 bg-white/95 hover:bg-white text-slate-950 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-extrabold shadow"
                      title="Apply AI Transparent / White Studio Cutout to this photo"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>✨ White BG</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] flex items-center gap-1 cursor-pointer font-bold shadow"
                >
                  <Camera className="w-3 h-3" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentSlot === 'front') setFrontImg(undefined);
                    else if (currentSlot === 'back') setBackImg(undefined);
                    else if (currentSlot === 'tag') setTagImg(undefined);
                    else if (currentSlot === 'washTag') setWashTagImg(undefined);
                    else if (currentSlot === 'lengthTape') setLengthTapeImg(undefined);
                    else setWidthTapeImg(undefined);
                  }}
                  className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/40 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <span>Clear</span>
                </button>
                <select
                  aria-label="Move photo to slot"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      swapPhotoSlots(currentSlot, e.target.value as PhotoSlot);
                      e.target.value = '';
                    }
                  }}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer max-w-[115px]"
                  title="Swap or Move this photo to another slot"
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">⇄ Move Slot...</option>
                  {currentSlot !== 'front' && <option value="front" className="bg-slate-900 text-white">1. Front</option>}
                  {currentSlot !== 'back' && <option value="back" className="bg-slate-900 text-white">2. Back</option>}
                  {currentSlot !== 'tag' && <option value="tag" className="bg-slate-900 text-white">3. Main Tag</option>}
                  {currentSlot !== 'washTag' && <option value="washTag" className="bg-slate-900 text-white">4. Wash Label</option>}
                  {currentSlot !== 'lengthTape' && <option value="lengthTape" className="bg-slate-900 text-white">5. Length</option>}
                  {currentSlot !== 'widthTape' && <option value="widthTape" className="bg-slate-900 text-white">6. Width</option>}
                </select>
              </div>
            </div>
          ) : !cameraActive ? (
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
                      {currentSlot === 'front' ? '1. Front Look' : currentSlot === 'back' ? '2. Back Look' : currentSlot === 'tag' ? '3. Main Neck Tag' : currentSlot === 'washTag' ? '4. Wash / Care Label (Made In)' : currentSlot === 'lengthTape' ? '5. Length Tape (Vertical)' : '6. Width Tape (Pit-to-Pit)'}
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
                  {/* AI Bulk 6-Photo Upload Button */}
                  <button
                    type="button"
                    disabled={isBulkClassifying}
                    onClick={() => bulkUploadInputRef.current?.click()}
                    className="px-4 py-2.5 bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-600/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Upload up to 6 photos together: AI will slot Front, Back, Main Tag, Wash Label, Length Tape, and Width Tape!"
                  >
                    {isBulkClassifying ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-amber-200" />
                    )}
                    <span>{isBulkClassifying ? 'AI Classifying...' : '📁 Bulk Upload (Select up to 6 Photos)'}</span>
                  </button>

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
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-indigo-400" />
                      <span>Single Photo from PC</span>
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
          ) : null}

          {/* Garment Silhouette / Guide Outline Overlay (Active when camera is live) */}
          {cameraActive && showSilhouette && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-20">
              <div ref={silhouetteGuideRef} className="w-52 h-68 sm:w-60 sm:h-76 border-2 border-dashed border-white/40 rounded-3xl relative flex items-center justify-center">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/90 tracking-wider uppercase bg-black/70 px-3 py-0.5 rounded-full border border-white/20 backdrop-blur-sm whitespace-nowrap">
                  {currentSlot === 'front' ? '👔 FRONT CHEST' : currentSlot === 'back' ? '🧥 BACK VIEW' : currentSlot === 'tag' ? '🏷️ MAIN NECK TAG' : currentSlot === 'washTag' ? '🧼 WASH CARE LABEL' : currentSlot === 'lengthTape' ? '📏 LENGTH TAPE (VERTICAL)' : '📐 WIDTH TAPE (PIT-TO-PIT)'}
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
                <span>Full-Frame 1x Wide</span>
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
              {currentSlot === 'front' ? 'Front Look' : currentSlot === 'back' ? 'Back Look' : currentSlot === 'tag' ? 'Main Tag' : currentSlot === 'washTag' ? 'Wash Label' : 'Measurement Tape'}
            </span>
          </div>

          {/* Processing Indicator */}
          {(isProcessing || isBulkClassifying) && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50">
              <div className="bg-slate-900 border border-slate-700 px-5 py-3 rounded-xl text-white text-xs flex items-center gap-3 shadow-2xl">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                <div className="text-left">
                  <div className="font-bold text-white">
                    {isBulkClassifying ? 'AI 6-Photo Studio Slotting' : 'Optimizing High-Res Studio Photo...'}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {bulkClassificationStep || 'Preserving raw high-definition garment quality (max 1080px)...'}
                  </div>
                </div>
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

            {/* AI Bulk Upload Button */}
            <div>
              <input
                ref={bulkUploadInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleBulkUpload}
              />
              <button
                type="button"
                disabled={isBulkClassifying}
                onClick={() => bulkUploadInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-md shadow-amber-600/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Select up to 6 garment photos together: automatically slots 1.Front, 2.Back, 3.Main Tag, 4.Wash Label, 5.Length Tape, 6.Width Tape!"
              >
                {isBulkClassifying ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-200" />
                )}
                <span className="hidden sm:inline">📁 Bulk Upload (Up to 6 Photos)</span>
                <span className="sm:hidden">Bulk (6)</span>
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
                  <Check className="w-2.5 h-2.5" /> Era: {appraisal.era} • {appraisal.countryOfOrigin || 'Origin'} • AED {appraisal.recommendedRetailPriceAed}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Auto-evaluates Brand, Graphic Subcategory, Era, Made In & Measurements
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={isAppraising || (!frontImg && !backImg && !tagImg && !washTagImg)}
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
                  {appraisal.subCategory && (
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      {appraisal.subCategory}
                    </span>
                  )}
                  {appraisal.stitchType && (
                    <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/30">
                      {appraisal.stitchType}
                    </span>
                  )}
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                    String(appraisal.collectorTipsUrdu || '').includes('USTAD')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                  }`}>
                    <Sparkles className="w-2.5 h-2.5" />
                    {String(appraisal.collectorTipsUrdu || '').includes('USTAD')
                      ? '🟢 USTAD: Gemini 3.8 Flash + Shagird Observer'
                      : '🟡 SHAGIRD: Local RTX 3070 Ti + Ustad Memory'}
                  </span>
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

              {/* Brand, Dept, Size, Made In & Tape Measurements Badges & Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10">
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
                    className="w-full min-w-0 bg-transparent text-xs font-bold text-amber-200 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1.5 rounded-lg border border-purple-800/60">
                  <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider shrink-0">Dept:</span>
                  <select
                    value={appraisal.gender || "Men's"}
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? { ...prev, gender: val } : null);
                    }}
                    className="w-full min-w-0 bg-slate-900 text-xs font-bold text-purple-200 focus:outline-hidden rounded cursor-pointer"
                  >
                    <option value="Men's">👔 Men's</option>
                    <option value="Ladies">👗 Ladies</option>
                    <option value="Unisex">⚧️ Unisex</option>
                    <option value="Kids">🧸 Kids</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1.5 rounded-lg border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Size:</span>
                  <input
                    type="text"
                    value={appraisal.size || ''}
                    placeholder="e.g. L, XL"
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => {
                        if (!prev) return null;
                        const std = resolveStandardGarmentMeasurements(val, prev.category);
                        return {
                          ...prev,
                          size: val,
                          pitToPitInches: prev.pitToPitInches || std.pitToPitInches,
                          lengthInches: prev.lengthInches || std.lengthInches
                        };
                      });
                    }}
                    className="w-full min-w-0 bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1.5 rounded-lg border border-rose-800/60">
                  <span className="text-[10px] text-rose-300 font-semibold uppercase tracking-wider shrink-0">Origin:</span>
                  <input
                    type="text"
                    value={(appraisal.countryOfOrigin || '').replace(/^Made\s+in\s+/i, '')}
                    placeholder="Country"
                    title={appraisal.countryOfOrigin || 'Made in...'}
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? { ...prev, countryOfOrigin: val ? (val.toLowerCase().startsWith('made in') ? val : `Made in ${val}`) : '' } : null);
                    }}
                    className="w-full min-w-0 bg-transparent text-xs font-bold text-rose-200 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1.5 rounded-lg border border-cyan-800/60">
                  <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider shrink-0">Width:</span>
                  <input
                    type="text"
                    value={appraisal.pitToPitInches || ''}
                    placeholder='e.g. 22"'
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? {
                        ...prev,
                        pitToPitInches: val,
                        measurements: { ...(prev.measurements || {}), pitToPit: val }
                      } : null);
                    }}
                    className="w-full min-w-0 bg-transparent text-xs font-mono font-bold text-cyan-200 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1.5 rounded-lg border border-cyan-800/60">
                  <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider shrink-0">Length:</span>
                  <input
                    type="text"
                    value={appraisal.lengthInches || ''}
                    placeholder='e.g. 29"'
                    onChange={e => {
                      const val = e.target.value;
                      setAppraisal(prev => prev ? {
                        ...prev,
                        lengthInches: val,
                        measurements: { ...(prev.measurements || {}), length: val }
                      } : null);
                    }}
                    className="w-full min-w-0 bg-transparent text-xs font-mono font-bold text-cyan-200 focus:outline-hidden"
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

      {/* STICKY BOTTOM ACTION BAR (Thumbnails Review, Cancel & Attach to Piece) */}
      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur-md p-2.5 sm:p-3 border-t border-slate-800 z-10 flex items-center justify-between gap-2 sm:gap-3 shadow-2xl shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-0.5 no-scrollbar">
          {/* Slot 1: Front Thumbnail */}
          <div
            onClick={() => {
              setCurrentSlot('front');
              if (frontImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
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
            onClick={() => {
              setCurrentSlot('back');
              if (backImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
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

          {/* Slot 3: Main Tag Thumbnail */}
          <div
            onClick={() => {
              setCurrentSlot('tag');
              if (tagImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
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
                  title="Clear Main Tag Photo"
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

          {/* Slot 4: Wash Label Thumbnail (E-Commerce 4th Photo) */}
          <div
            onClick={() => {
              setCurrentSlot('washTag');
              if (washTagImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
              currentSlot === 'washTag'
                ? 'border-rose-400 ring-2 ring-rose-500/50'
                : washTagImg
                ? 'border-emerald-500'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
            title="Wash / Care Label Photo (Shown on E-Commerce)"
          >
            {washTagImg ? (
              <>
                <img src={washTagImg} alt="Wash Tag" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWashTagImg(undefined);
                  }}
                  className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                  title="Clear Wash Label Photo"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 inset-x-0 bg-rose-600/90 text-white text-[8px] text-center font-bold font-mono">
                  WASH
                </span>
              </>
            ) : (
              <span className="text-[9px] font-bold text-center leading-tight">Wash</span>
            )}
          </div>

          {/* Slot 5: Length Tape Thumbnail */}
          <div
            onClick={() => {
              setCurrentSlot('lengthTape');
              if (lengthTapeImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
              currentSlot === 'lengthTape'
                ? 'border-cyan-400 ring-2 ring-cyan-500/50'
                : lengthTapeImg
                ? 'border-emerald-500'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
          >
            {lengthTapeImg ? (
              <>
                <img src={lengthTapeImg} alt="Length Tape" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLengthTapeImg(undefined);
                  }}
                  className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                  title="Clear Length Tape Photo"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 inset-x-0 bg-cyan-600/90 text-white text-[8px] text-center font-bold font-mono">
                  LEN TAPE
                </span>
              </>
            ) : (
              <span className="text-[9px] font-bold text-center leading-tight">Len Tape</span>
            )}
          </div>

          {/* Slot 6: Width Tape Thumbnail */}
          <div
            onClick={() => {
              setCurrentSlot('widthTape');
              if (widthTapeImg) stopCamera();
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border-2 overflow-hidden cursor-pointer flex items-center justify-center shrink-0 transition ${
              currentSlot === 'widthTape'
                ? 'border-teal-400 ring-2 ring-teal-500/50'
                : widthTapeImg
                ? 'border-emerald-500'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
          >
            {widthTapeImg ? (
              <>
                <img src={widthTapeImg} alt="Width Tape" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWidthTapeImg(undefined);
                  }}
                  className="absolute top-0 right-0 bg-black/80 hover:bg-rose-600 text-white w-4 h-4 rounded-bl flex items-center justify-center text-[9px]"
                  title="Clear Width Tape Photo"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 inset-x-0 bg-teal-600/90 text-white text-[8px] text-center font-bold font-mono">
                  WID TAPE
                </span>
              </>
            ) : (
              <span className="text-[9px] font-bold text-center leading-tight">Wid Tape</span>
            )}
          </div>
        </div>

        {/* Cancel & Attach Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCancelAndClose}
            className="bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 font-bold px-3 py-2.5 rounded-xl text-xs min-h-[44px] flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
            title="Discard unattached changes and close modal"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAndClose}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm min-h-[44px] min-w-[125px] flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition shrink-0 active:scale-95 cursor-pointer"
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
          <div className="relative max-w-2xl w-full max-h-[88vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl p-2 flex items-center justify-center">
            <img src={previewLightbox} alt="Preview" className="w-full max-h-[82vh] object-contain rounded-xl" />
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

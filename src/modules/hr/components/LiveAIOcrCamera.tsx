import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, X, RefreshCw, Sparkles, Check, AlertCircle, 
  FlipHorizontal, Zap, ShieldCheck, FileText, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { executeDocumentOcr, AIOCRScanResult } from '../../../utils/geminiOcrService.ts';
import { autoCropAndResizeDocument } from '../../../utils/documentCropper.ts';

interface LiveAIOcrCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (result: AIOCRScanResult, capturedImage: string) => void;
  defaultDocType?: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA';
  apiKey?: string;
}

export const LiveAIOcrCamera: React.FC<LiveAIOcrCameraProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  defaultDocType = 'EMIRATES_ID',
  apiKey
}) => {
  const [docType, setDocType] = useState<'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA'>(defaultDocType);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [flashActive, setFlashActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetGuideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Aspect ratio standards
  // Emirates ID: 85.6mm x 53.98mm = 1.586
  // Passport: 125mm x 88mm = 1.42
  // Residency Visa: 1.414
  const aspectClass = docType === 'EMIRATES_ID' 
    ? 'aspect-[85.6/53.98]' 
    : docType === 'PASSPORT' 
    ? 'aspect-[125/88]' 
    : 'aspect-[1.414]';

  const docTitles = {
    EMIRATES_ID: 'UAE Emirates ID Card',
    PASSPORT: 'International Passport Bio Page',
    RESIDENCY_VISA: 'UAE Residency Visa / Card'
  };

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsProcessing(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported in this browser. Please use the Upload File tab.');
      return;
    }

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback to basic video constraint
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Live Camera Access Error:', err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        (err?.message || '').toLowerCase().includes('denied') ||
        (err?.message || '').toLowerCase().includes('permission');

      setCameraError(
        isDenied
          ? 'Camera permission denied. Please click the lock or camera icon in your browser address bar to allow camera access.'
          : err?.message || 'Could not start live camera. Please check camera connection.'
      );
      setIsCameraActive(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const toggleCameraFacing = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  /**
   * Captures the exact card bounding box from the live video feed,
   * performs perspective contrast normalization, and triggers AI OCR scan.
   */
  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    const video = videoRef.current;

    if (video.readyState < 2 || !video.videoWidth) {
      setCameraError('Camera stream is still initializing. Please hold for a second.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Freezing frame & cropping card boundaries...');

    try {
      // Audio or haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetRatio = docType === 'EMIRATES_ID' ? (85.6 / 53.98) : docType === 'PASSPORT' ? 1.42 : 1.414;

      let cropX = 0;
      let cropY = 0;
      let cropW = vw;
      let cropH = vh;

      // Accurately map the onscreen guide overlay to the underlying video stream pixels
      if (targetGuideRef.current) {
        const guideRect = targetGuideRef.current.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        const videoAspect = vw / vh;
        const containerAspect = videoRect.width / videoRect.height;

        let renderedW = videoRect.width;
        let renderedH = videoRect.height;
        let clipX = 0;
        let clipY = 0;

        if (containerAspect > videoAspect) {
          // Container is wider than video: video scaled by width, clipped top/bottom
          renderedH = videoRect.width / videoAspect;
          clipY = (renderedH - videoRect.height) / 2;
        } else {
          // Container is taller than video: video scaled by height, clipped left/right
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
      } else {
        // Centered fallback calculation
        cropW = Math.round(vw * 0.82);
        cropH = Math.round(cropW / targetRatio);
        if (cropH > vh * 0.82) {
          cropH = Math.round(vh * 0.82);
          cropW = Math.round(cropH * targetRatio);
        }
        cropX = Math.round((vw - cropW) / 2);
        cropY = Math.round((vh - cropH) / 2);
      }

      // Render to canvas at standard high-resolution
      const outW = 1200;
      const outH = Math.round(outW / targetRatio);

      const canvas = canvasRef.current;
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw ONLY the exact card region seen inside the target viewfinder
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      const initialRawCapture = canvas.toDataURL('image/jpeg', 0.94);

      // Fine-tune with intelligent card edge isolation (removes holding fingers & table edges)
      setProcessingStatus('Refining card borders and removing finger noise...');
      let finalCardImage = initialRawCapture;
      try {
        const cropRes = await autoCropAndResizeDocument(initialRawCapture, {
          docType,
          targetWidth: outW,
          targetHeight: outH,
          enhanceContrast: true
        });
        if (cropRes && cropRes.didCrop) {
          finalCardImage = cropRes.croppedImageUrl;
        }
      } catch (cropErr) {
        console.warn('Micro edge refinement skipped, using frame capture:', cropErr);
      }

      setProcessingStatus('Extracting legal zones with Gemini AI Vision...');

      // Execute AI OCR Scan
      const activeKey = apiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('vintage_gemini_api_key') || undefined : undefined);
      
      const scanResult = await executeDocumentOcr({
        documentType: docType,
        imageBase64: finalCardImage,
        apiKey: activeKey
      });

      stopCamera();
      onScanComplete(scanResult, finalCardImage);
    } catch (err: any) {
      console.error('Capture & Scan Error:', err);
      setCameraError(err?.message || 'Failed to scan document frame. Please try again.');
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="bg-slate-900 text-white rounded-2xl max-w-2xl w-full border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] relative">
        
        {/* Header */}
        <div className="p-3 sm:p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Camera className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Live AI OCR Camera Scanner</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono">
                  LIVE VISION
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Position UAE document within the target alignment frame</p>
            </div>
          </div>

          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all font-bold"
          >
            ✕
          </button>
        </div>

        {/* Document Type Selector Tabs */}
        <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-center gap-2 overflow-x-auto z-20">
          <button
            type="button"
            onClick={() => setDocType('EMIRATES_ID')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              docType === 'EMIRATES_ID'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>1. Emirates ID</span>
          </button>

          <button
            type="button"
            onClick={() => setDocType('PASSPORT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              docType === 'PASSPORT'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>2. Passport</span>
          </button>

          <button
            type="button"
            onClick={() => setDocType('RESIDENCY_VISA')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              docType === 'RESIDENCY_VISA'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>3. Residency Visa</span>
          </button>
        </div>

        {/* Camera Viewport Area */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[360px] sm:min-h-[440px]">
          
          {/* Video Stream */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />

          {/* Hidden Canvas for High-Resolution Snapshot Extraction */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera Error Message */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-30 space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Camera Access Notice</h4>
              <p className="text-xs text-slate-300 max-w-md leading-relaxed">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Camera Permission</span>
              </button>
            </div>
          )}

          {/* Center Card Alignment Target Box with Animated Laser Scanner */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4 z-10">
              <div 
                ref={targetGuideRef}
                className={`w-[88%] sm:w-[82%] max-w-lg ${aspectClass} relative rounded-2xl border-2 border-blue-400/90 shadow-[0_0_0_9999px_rgba(5,10,20,0.75)] transition-all duration-300 flex flex-col justify-between p-3.5 bg-blue-950/10 backdrop-blur-[1px]`}
              >
                
                {/* 4 Corner Reticles (Golden High-Visibility) */}
                <div className="absolute -top-1.5 -left-1.5 w-7 h-7 border-t-4 border-l-4 border-amber-400 rounded-tl-xl shadow-[0_0_8px_#f59e0b]"></div>
                <div className="absolute -top-1.5 -right-1.5 w-7 h-7 border-t-4 border-r-4 border-amber-400 rounded-tr-xl shadow-[0_0_8px_#f59e0b]"></div>
                <div className="absolute -bottom-1.5 -left-1.5 w-7 h-7 border-b-4 border-l-4 border-amber-400 rounded-bl-xl shadow-[0_0_8px_#f59e0b]"></div>
                <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 border-b-4 border-r-4 border-amber-400 rounded-br-xl shadow-[0_0_8px_#f59e0b]"></div>

                {/* Subtle Card Silhouette Outline */}
                <div className="absolute inset-4 rounded-xl border border-white/15 pointer-events-none flex items-center justify-between p-4 opacity-40">
                  <div className="w-16 h-20 rounded-lg border border-dashed border-white/40 flex items-center justify-center text-[9px] text-white/60 font-mono">
                    PHOTO
                  </div>
                  <div className="flex-1 px-4 space-y-2">
                    <div className="h-2 w-3/4 bg-white/20 rounded"></div>
                    <div className="h-2 w-1/2 bg-white/20 rounded"></div>
                    <div className="h-2 w-2/3 bg-white/20 rounded"></div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-dashed border-amber-400/50 flex items-center justify-center text-[8px] text-amber-300/60 font-mono">
                    EMBLEM
                  </div>
                </div>

                {/* Laser Scanning Bar Animation */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] animate-bounce top-1/2 -translate-y-1/2 pointer-events-none"></div>

                {/* Target Header Guide */}
                <div className="text-center z-10">
                  <span className="bg-slate-900/90 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1 rounded-full border border-blue-500/50 shadow-lg inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Align {docTitles[docType]} Card Inside Reticles</span>
                  </span>
                </div>

                {/* Target Footer Guide */}
                <div className="text-center z-10">
                  <span className="bg-slate-900/85 backdrop-blur-sm text-slate-300 text-[9px] font-medium px-2.5 py-0.5 rounded-full border border-slate-700 shadow-sm">
                    Surrounding table, hands & clothes outside this frame are removed
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Processing Overlay State */}
          {isProcessing && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-40 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
              </div>
              <h4 className="text-sm font-bold text-white">Gemini AI Neural Vision Processing</h4>
              <p className="text-xs text-blue-300 font-mono animate-pulse">{processingStatus}</p>
            </div>
          )}
        </div>

        {/* Bottom Shutter & Controls Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between z-20">
          
          {/* Flip Camera Button */}
          <button
            type="button"
            onClick={toggleCameraFacing}
            title="Flip Front / Rear Camera"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <FlipHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Flip Cam</span>
          </button>

          {/* Shutter Capture Button */}
          <button
            type="button"
            disabled={!isCameraActive || isProcessing}
            onClick={captureAndScan}
            className="group relative flex items-center justify-center p-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:opacity-50 transition-all"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white flex flex-col items-center justify-center bg-blue-600 group-hover:bg-blue-500 transition-all">
              <Camera className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              <span className="text-[9px] font-black uppercase tracking-wider text-white mt-0.5">Scan</span>
            </div>
          </button>

          {/* Close or Cancel Button */}
          <button
            type="button"
            onClick={() => { stopCamera(); onClose(); }}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

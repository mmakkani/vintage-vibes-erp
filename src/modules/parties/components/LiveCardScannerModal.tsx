import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw, Sparkles, AlertCircle, CheckCircle2, Upload, Loader2 } from 'lucide-react';
import { extractVisitingCardDetails, VisitingCardOcrResult } from '../services/visitingCardOcrService.ts';

interface LiveCardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCardExtracted: (result: VisitingCardOcrResult) => void;
}

export const LiveCardScannerModal: React.FC<LiveCardScannerModalProps> = ({
  isOpen,
  onClose,
  onCardExtracted
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or connection (requires HTTPS or localhost).');
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
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      setCameraError(err.message || 'Unable to access camera. Please allow camera permissions or upload an image instead.');
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setIsProcessing(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();

    await processImageOcr(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCapturedImage(dataUrl);
        stopCamera();
        await processImageOcr(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const processImageOcr = async (b64: string) => {
    setIsProcessing(true);
    setExtractionStatus('Analyzing visiting card with Gemini Vision AI...');

    try {
      const result = await extractVisitingCardDetails(b64);
      setExtractionStatus('Success! Contact & company details extracted.');
      setTimeout(() => {
        onCardExtracted(result);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('OCR processing error:', err);
      setExtractionStatus('Failed to read details. You can apply the image directly.');
      setTimeout(() => {
        onCardExtracted({
          success: false,
          companyName: '',
          contactPerson: '',
          designation: '',
          phone: '',
          email: '',
          address: '',
          trn_tax_no: '',
          website: '',
          cardImageUrl: b64,
          confidence: 0,
          source: 'FALLBACK_PARSER',
          error: err.message
        });
        onClose();
      }, 1000);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>Live Visiting Card Scanner</span>
                <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-400/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Gemini Vision AI
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Position the business card within the guide frame</p>
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

        {/* Viewfinder / Video Canvas Area */}
        <div className="relative flex-1 bg-black min-h-[340px] max-h-[460px] flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={capturedImage}
                alt="Captured Visiting Card"
                className="max-h-[380px] w-auto rounded-lg shadow-xl object-contain border border-slate-700"
              />
              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-3" />
                  <p className="text-sm font-bold text-white mb-1">{extractionStatus}</p>
                  <p className="text-xs text-slate-400">Extracting legal name, TRN, contact, designation & phone...</p>
                </div>
              )}
            </div>
          ) : cameraError ? (
            <div className="p-6 text-center max-w-sm">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Camera Not Available</h4>
              <p className="text-xs text-slate-400 mb-4">{cameraError}</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Camera
                </button>
                <label className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Card Photo Instead
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* Business Card Framing Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="relative w-full max-w-[420px] aspect-[1.75/1] rounded-xl border-2 border-dashed border-blue-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                  {/* Card Corner Accents */}
                  <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl-sm" />
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr-sm" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl-sm" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br-sm" />

                  {/* Laser Scanning Animation Line */}
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse top-1/2 -translate-y-1/2 opacity-70" />

                  <div className="absolute bottom-2 inset-x-0 text-center">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-900/80 text-blue-300 backdrop-blur-xs border border-blue-400/30">
                      Standard Visiting Card Frame (3.5 × 2 in)
                    </span>
                  </div>
                </div>
              </div>

              {/* Camera Switch Control */}
              <button
                type="button"
                onClick={toggleCameraFacing}
                title="Switch Camera"
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white backdrop-blur-xs border border-slate-700 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          <label className="text-xs font-semibold text-slate-300 hover:text-white cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition">
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>Upload Photo</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>

          <div className="flex items-center gap-2">
            {capturedImage ? (
              <button
                type="button"
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Retake
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCapture}
                disabled={!cameraActive || isProcessing}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Business Card</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

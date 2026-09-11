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
  ArrowRight
} from 'lucide-react';

export interface ExtractedTagData {
  brand: string;
  size: string;
  countryOfOrigin: string;
  style: string;
  confidence: number;
  notes?: string;
  tagImageUrl?: string;
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    setTagOcrError(null);
    setCapturedImage(null);
    setExtractedData(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available on this browser or device. Please upload a tag photo instead.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraError(err.message || 'Camera permission denied or unavailable. Please use the Upload Tag Photo option.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setExtractedData(null);
      setTagOcrError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera stream is initializing. Please wait a moment and tap Capture Photo again.');
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      stopCamera();
      processTagOcr(dataUrl);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setTagOcrError('File exceeds 15MB limit. Please upload a compressed photo or take a direct picture.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
      stopCamera();
      processTagOcr(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processTagOcr = async (imageBase64?: string) => {
    setIsScanning(true);
    setTagOcrError(null);
    setScanStep('Aligning garment tag view & enhancing contrast...');

    try {
      setTimeout(() => setScanStep('Gemini Flash Vision analyzing brand typography & care label...'), 600);
      setTimeout(() => setScanStep('Extracting Brand, Size, Country of Origin & Vintage Style...'), 1200);

      const targetImage = imageBase64 || capturedImage || '';
      if (!targetImage) {
        throw new Error('No tag image captured or uploaded.');
      }

      const res = await fetch('/api/purchase/ai-ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: targetImage
        })
      });

      const data = await res.json();
      if (res.ok && data && (data.brand || data.size || data.countryOfOrigin || data.style)) {
        setExtractedData({
          brand: data.brand || '',
          size: data.size || '',
          countryOfOrigin: data.countryOfOrigin || '',
          style: data.style || '',
          confidence: data.confidence || 0.94,
          notes: data.notes || 'Extracted via Multimodal Tag OCR',
          tagImageUrl: targetImage
        });
      } else {
        throw new Error(data?.error || 'No readable apparel tag text detected.');
      }
    } catch (err: any) {
      console.warn('Tag OCR failed:', err);
      setExtractedData(null);
      setTagOcrError(err?.message || 'Garment tag OCR failed. Please ensure adequate lighting or upload a clearer photo.');
    } finally {
      setIsScanning(false);
      setScanStep('');
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-indigo-400 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-2">
                <span>AI Garment Tag & Care Label Scanner</span>
                <span className="bg-indigo-400/50 text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold">
                  OCR Engine
                </span>
              </h3>
              <p className="text-xs text-indigo-100">
                Point camera at garment neck tag or care label to auto-fill Brand, Size & Origin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* MODE SELECTOR & CONTROLS */}
          <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Tag Scan Mode:</span>
              <button
                type="button"
                onClick={startCamera}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  cameraActive && !capturedImage
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Live Camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                <span>Upload Tag Photo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
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
                <strong>Tag Scan Error:</strong> {tagOcrError}
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
              <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video max-h-[380px] flex items-center justify-center border-2 border-slate-700 shadow-inner">
                {cameraActive && !capturedImage && (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder Frame Guide */}
                    <div className="absolute inset-10 border-2 border-indigo-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-3">
                      <div className="flex justify-between text-indigo-300 font-mono text-[10px] font-bold">
                        <span>[ BRAND LABEL ]</span>
                        <span>[ SIZE TAG ]</span>
                      </div>
                      <div className="text-center text-indigo-200 text-xs bg-slate-900/60 py-1 px-3 rounded-full mx-auto backdrop-blur-xs font-semibold">
                        Align apparel tag or wash label within box
                      </div>
                      <div className="flex justify-between text-indigo-300 font-mono text-[10px] font-bold">
                        <span>[ FABRIC CARE ]</span>
                        <span>[ MADE IN ]</span>
                      </div>
                    </div>

                    {/* Capture button */}
                    <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="btn-3d btn-3d-indigo flex items-center gap-2 text-xs py-2 px-6 rounded-full cursor-pointer shadow-xl font-bold"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Snap Tag Photo</span>
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
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="w-10 h-10 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
                        <div className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                          <span>AI Multimodal Reading Tag...</span>
                        </div>
                        <p className="text-xs text-indigo-200 font-mono">{scanStep}</p>
                      </div>
                    )}
                  </div>
                )}

                {!cameraActive && !capturedImage && (
                  <div className="p-8 text-center text-slate-300 space-y-3">
                    <Tag className="w-12 h-12 mx-auto text-indigo-400 opacity-60" />
                    <div>
                      <h4 className="text-sm font-bold text-white">Camera Feed Standby</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                        {cameraError || 'Use your device camera or upload a clear photo of the clothing tag.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="btn-3d btn-3d-indigo text-xs py-1.5 px-4 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Turn On Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-3d btn-3d-slate text-xs py-1.5 px-4 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Upload Tag Photo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EXTRACTED RESULTS REVIEW & EDIT */}
          {extractedData && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      Tag Decoded Successfully ({Math.round(extractedData.confidence * 100)}% Confidence)
                    </h4>
                    <p className="text-[11px] text-emerald-700">{extractedData.notes}</p>
                  </div>
                </div>

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
                  <span>Rescan</span>
                </button>
              </div>

              {/* Extracted Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Extracted Brand</label>
                  <input
                    type="text"
                    value={extractedData.brand}
                    onChange={e => setExtractedData({ ...extractedData, brand: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Extracted Size</label>
                  <input
                    type="text"
                    value={extractedData.size}
                    onChange={e => setExtractedData({ ...extractedData, size: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900"
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

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Garment Style / Tag Detail</label>
                  <input
                    type="text"
                    value={extractedData.style}
                    onChange={e => setExtractedData({ ...extractedData, style: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-medium text-slate-900"
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
              className="btn-3d btn-3d-indigo text-xs py-2 px-6 cursor-pointer font-bold flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply to Garment Piece</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

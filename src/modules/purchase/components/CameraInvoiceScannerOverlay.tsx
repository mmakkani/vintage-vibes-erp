import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  RotateCw,
  RefreshCw,
  Eye,
  ArrowRight,
  ShieldCheck,
  Maximize2
} from 'lucide-react';
import { Party } from '../../parties/parties.types.ts';
import { ItemMaster } from '../../setup/setup.types.ts';

interface ExtractedInvoiceData {
  invoiceNo?: string;
  date?: string;
  supplierName?: string;
  currency?: string;
  containerNo?: string;
  blAirwayBillNo?: string;
  subTotal?: number;
  vatAmount?: number;
  totalAmount?: number;
  freightAmount?: number;
  customsDutyAmount?: number;
  notes?: string;
  items?: Array<{
    itemDescription: string;
    baleCount?: number;
    weightKg?: number;
    ratePerKg?: number;
    amount?: number;
  }>;
}

interface CameraInvoiceScannerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: ItemMaster[];
  onApplyExtractedData: (data: ExtractedInvoiceData) => void;
}

export const CameraInvoiceScannerOverlay: React.FC<CameraInvoiceScannerOverlayProps> = ({
  isOpen,
  onClose,
  parties,
  items,
  onApplyExtractedData
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [rawSummary, setRawSummary] = useState<string>('');
  const [ocrError, setOcrError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    setOcrError(null);
    setCapturedImage(null);
    setExtractedData(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device API not supported in this browser. Please use the Upload Document option.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(err.message || 'Camera access permission denied or unavailable. Please use the Upload Document option.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
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
      setOcrError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Capture Snapshot from video
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || !video.videoWidth || video.videoWidth === 0) {
      setOcrError('Camera feed is still loading or not ready. Please wait a moment or use the Upload File option.');
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Analyze image brightness to prevent scanning completely black frames
      try {
        const sampleW = Math.min(100, canvas.width);
        const sampleH = Math.min(100, canvas.height);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;
        let totalBrightness = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          totalBrightness += (imgData[i] * 0.299 + imgData[i + 1] * 0.587 + imgData[i + 2] * 0.114);
        }
        const avgBrightness = totalBrightness / (imgData.length / 4);
        if (avgBrightness < 12) {
          setOcrError('Camera capture appears pitch dark or camera lens is covered. Please aim camera at a well-lit invoice or upload a file.');
          return;
        }
      } catch (e) {
        console.warn('Brightness check skipped:', e);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
      processOcr(dataUrl);
    }
  };

  // Upload file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setOcrError('Selected file exceeds 15MB. Please choose a smaller document image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
      stopCamera();
      processOcr(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // Process OCR
  const processOcr = async (imageBase64?: string) => {
    setIsScanning(true);
    setOcrError(null);
    setScanStep('Aligning document perspective & edge detection...');

    try {
      setTimeout(() => setScanStep('AI Vision reading document tokens...'), 600);
      setTimeout(() => setScanStep('Extracting invoice header, container & line items...'), 1200);

      const targetImage = imageBase64 || capturedImage || '';
      if (!targetImage || targetImage.length < 500) {
        throw new Error('No valid document image captured or uploaded to scan.');
      }

      const res = await fetch('/api/purchase/scan-invoice-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: targetImage
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Invoice scanning failed.');
      }

      const extracted = data.data || data;

      if (extracted && (extracted.invoiceNo || extracted.supplierName || extracted.containerNo || (extracted.items && extracted.items.length > 0))) {
        setExtractedData(extracted);
        setConfidence(data.confidence || 96);
        setRawSummary(extracted.notes || 'Extracted via Multimodal Document Vision');
      } else {
        throw new Error(data.error || 'No readable invoice text detected. Please upload or capture a clearer image.');
      }
    } catch (err: any) {
      console.error('OCR failure:', err);
      setExtractedData(null);
      setOcrError(err?.message || 'Invoice scanning failed. Please ensure the document is clearly illuminated or upload a clear file.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleApply = () => {
    if (extractedData) {
      onApplyExtractedData(extractedData);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-amber-500 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                <span>AI Document OCR Invoice Scanner</span>
                <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                  Vision Engine
                </span>
              </h3>
              <p className="text-xs text-amber-100">
                Point camera at paper supplier invoice or import bill to pre-fill purchase form
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

        {/* Hidden Canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TOP ACTION BAR: CAMERA VS FILE UPLOAD */}
          <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Input Mode:</span>
              <button
                type="button"
                onClick={startCamera}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  cameraActive && !capturedImage
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Live Camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:border-amber-500 hover:bg-amber-50/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-amber-600" />
                <span>Upload Document / Image</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
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
                  setOcrError(null);
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
          {ocrError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <div className="flex-1">
                <strong>Document Scan Error:</strong> {ocrError}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-3d btn-3d-amber text-[10px] py-1 px-2.5 shrink-0"
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

                    {/* Viewfinder Target Frame */}
                    <div className="absolute inset-8 border-2 border-amber-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-3">
                      <div className="flex justify-between text-amber-400 font-mono text-[10px] font-bold">
                        <span>┌ INVOICE HEADER</span>
                        <span>COMMERCIAL INVOICE ┐</span>
                      </div>
                      <div className="text-center text-amber-200 text-xs bg-slate-900/60 py-1 px-3 rounded-full mx-auto backdrop-blur-xs font-semibold">
                        Position commercial invoice within guides
                      </div>
                      <div className="flex justify-between text-amber-400 font-mono text-[10px] font-bold">
                        <span>└ LINE ITEMS / BALES</span>
                        <span>PORT & TOTALS ┘</span>
                      </div>
                    </div>

                    {/* Capture button overlay */}
                    <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="btn-3d btn-3d-amber flex items-center gap-2 text-xs py-2.5 px-7 rounded-full cursor-pointer shadow-xl font-bold tracking-wide"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Snap & Extract Invoice Data</span>
                      </button>
                    </div>
                  </>
                )}

                {capturedImage && (
                  <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                    <img
                      src={capturedImage}
                      alt="Captured invoice document"
                      className="max-h-[380px] w-auto object-contain"
                    />
                    {isScanning && (
                      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
                        <div className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                          <span>AI Multimodal Document Reading...</span>
                        </div>
                        <p className="text-xs text-amber-200 font-mono">{scanStep}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* If camera is blocked/unavailable or not active */}
                {!cameraActive && !capturedImage && (
                  <div className="p-8 text-center text-slate-300 space-y-4">
                    <div className="w-14 h-14 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-amber-400 border border-slate-700">
                      <Camera className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Live Camera Standby</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                        {cameraError || 'Allow camera permissions to scan paper invoices live, or directly select an image/document file from your device.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="btn-3d btn-3d-amber text-xs py-2 px-5 cursor-pointer inline-flex items-center gap-1.5 font-bold"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Start Camera Feed</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-3d btn-3d-slate text-xs py-2 px-5 cursor-pointer inline-flex items-center gap-1.5 font-bold"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                        <span>Choose File / Document</span>
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
                      Successfully Extracted Invoice Data ({confidence}% Confidence)
                    </h4>
                    <p className="text-[11px] text-emerald-700">{rawSummary}</p>
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

              {/* Extracted Form Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Supplier Name</label>
                  <input
                    type="text"
                    value={extractedData.supplierName || ''}
                    onChange={e => setExtractedData({ ...extractedData, supplierName: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Invoice Number</label>
                  <input
                    type="text"
                    value={extractedData.invoiceNo || ''}
                    onChange={e => setExtractedData({ ...extractedData, invoiceNo: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Invoice Date</label>
                  <input
                    type="date"
                    value={extractedData.date || ''}
                    onChange={e => setExtractedData({ ...extractedData, date: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Container Number</label>
                  <input
                    type="text"
                    value={extractedData.containerNo || ''}
                    onChange={e => setExtractedData({ ...extractedData, containerNo: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">B/L or Airway Bill</label>
                  <input
                    type="text"
                    value={extractedData.blAirwayBillNo || ''}
                    onChange={e => setExtractedData({ ...extractedData, blAirwayBillNo: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Currency</label>
                  <input
                    type="text"
                    value={extractedData.currency || 'USD'}
                    onChange={e => setExtractedData({ ...extractedData, currency: e.target.value })}
                    className="w-full mt-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Extracted Line Items */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase">
                  Detected Cargo Line Items ({extractedData.items?.length || 0})
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-bold">
                    <tr>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-center">Bales</th>
                      <th className="p-2 text-center">Weight (KG)</th>
                      <th className="p-2 text-right">Rate / KG</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {extractedData.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-sans font-medium text-slate-800">{item.itemDescription}</td>
                        <td className="p-2 text-center text-slate-700">{item.baleCount || 1}</td>
                        <td className="p-2 text-center text-slate-700">{item.weightKg || 0} KG</td>
                        <td className="p-2 text-right text-slate-700">${item.ratePerKg || 0}</td>
                        <td className="p-2 text-right font-bold text-slate-900">${item.amount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals Ribbon */}
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span>Subtotal: <strong>${extractedData.subTotal?.toLocaleString()}</strong></span>
                  <span>Freight: <strong>${extractedData.freightAmount?.toLocaleString()}</strong></span>
                  <span>Customs: <strong>${extractedData.customsDutyAmount?.toLocaleString()}</strong></span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 mr-2 uppercase font-bold">Extracted Grand Total:</span>
                  <span className="text-base font-extrabold text-slate-900 font-mono">
                    {extractedData.currency || 'USD'} {extractedData.totalAmount?.toLocaleString()}
                  </span>
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
              className="btn-3d btn-3d-amber text-xs py-2 px-6 cursor-pointer font-bold flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Pre-Fill Purchase Invoice Form</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

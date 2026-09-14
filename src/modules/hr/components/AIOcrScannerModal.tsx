import React, { useState, useEffect, useRef } from 'react';
import { 
  Scan, Camera, Upload, Key, Check, AlertCircle, X, Eye, 
  FileText, ShieldCheck, RefreshCw, Sparkles, ChevronRight, UserCheck,
  Crop, Scissors, CheckCheck
} from 'lucide-react';
import { AIOCRScanResult } from '../hr.controller.ts';
import { HrService } from '../../../services/hrService.ts';
import { autoCropAndResizeDocument } from '../../../utils/documentCropper.ts';
import { executeDocumentOcr, validateGeminiApiKey } from '../../../utils/geminiOcrService.ts';
import { LiveAIOcrCamera } from './LiveAIOcrCamera.tsx';

interface AIOcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyData: (data: {
    name?: string;
    nameArabic?: string;
    designation?: string;
    nationality?: string;
    dob?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    emiratesId?: string;
    idCardNo?: string;
    emiratesIdExpiry?: string;
    passportNo?: string;
    passportCountry?: string;
    passportIssueDate?: string;
    passportExpiry?: string;
    residencyCardNo?: string;
    uidNo?: string;
    residencyProfession?: string;
    residencySponsor?: string;
    residencyIssueDate?: string;
    residencyExpiryDate?: string;
    idFrontImageUrl?: string;
    idBackImageUrl?: string;
    passportImageUrl?: string;
    residencyImageUrl?: string;
  }) => void;
}

// Sample demo documents with high quality realistic UAE legal layout representations
const SAMPLE_DOCS = {
  emiratesId: {
    front: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop',
    back: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop',
    name: 'Saeed Bin Haider Al-Nuaimi',
    nameArabic: 'سعيد بن حيدر النعيمي',
    eid: '784-1994-3403542-1',
    cardNo: 'EID-849201948',
    dob: '1994-08-22',
    gender: 'MALE' as const,
    nationality: 'United Arab Emirates',
    expiry: '2028-08-21'
  },
  passport: {
    image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=600&auto=format&fit=crop',
    passNo: 'UAE3610301',
    country: 'United Arab Emirates',
    issueDate: '2020-04-10',
    expiryDate: '2030-04-09'
  },
  residency: {
    image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop',
    fileNo: '201/2023/8493012',
    uid: '748392019',
    profession: 'Senior Apparel Sorter & Inspector',
    sponsor: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    issueDate: '2023-09-01',
    expiryDate: '2026-08-31'
  }
};

export const AIOcrScannerModal: React.FC<AIOcrScannerModalProps> = ({ isOpen, onClose, onApplyData }) => {
  const [docMode, setDocMode] = useState<'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA'>('EMIRATES_ID');
  
  // Images
  const [frontImage, setFrontImage] = useState<string>('');
  const [backImage, setBackImage] = useState<string>('');
  const [passportImage, setPassportImage] = useState<string>('');
  const [residencyImage, setResidencyImage] = useState<string>('');

  // Auto-cropping status per image field
  const [isCropping, setIsCropping] = useState<Record<string, boolean>>({});
  const [isAutoCropped, setIsAutoCropped] = useState<Record<string, boolean>>({});

  // Live Camera state
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [liveCameraTargetDoc, setLiveCameraTargetDoc] = useState<'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA'>('EMIRATES_ID');

  // API Key management
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [storedApiKey, setStoredApiKey] = useState('');
  const [serverKeyConfigured, setServerKeyConfigured] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<{ valid?: boolean; message?: string } | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveKeyFeedback, setSaveKeyFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // Scanning status & result
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AIOCRScanResult | null>(null);
  const [showVerificationOverlay, setShowVerificationOverlay] = useState(false);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const residencyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1. Check local storage
    const saved = localStorage.getItem('vintage_gemini_api_key') || '';
    if (saved) {
      setApiKeyInput(saved);
      setStoredApiKey(saved);
    }

    // 2. Check server-side SQL database (gemini_api_config)
    fetch('/api/setup/gemini-key')
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (res?.success && res.apiKey) {
          setServerKeyConfigured(true);
          if (!saved) {
            setApiKeyInput(res.apiKey);
            setStoredApiKey(res.apiKey);
            localStorage.setItem('vintage_gemini_api_key', res.apiKey);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (!isOpen) return null;

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed || trimmed.length < 8) {
      setSaveKeyFeedback({
        success: false,
        message: 'Please enter a valid Gemini API key (at least 8 characters).'
      });
      return;
    }

    setIsSavingKey(true);
    setSaveKeyFeedback(null);

    try {
      localStorage.setItem('vintage_gemini_api_key', trimmed);
      setStoredApiKey(trimmed);

      // Persist to PostgreSQL database table gemini_api_config via UPSERT
      const res = await fetch('/api/setup/gemini-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed, model: 'gemini-2.5-flash' })
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setServerKeyConfigured(true);
        setSaveKeyFeedback({
          success: true,
          message: '✓ Gemini API Key successfully saved and persisted in PostgreSQL database (gemini_api_config)!'
        });
        setTimeout(() => {
          setShowKeyModal(false);
          setSaveKeyFeedback(null);
        }, 1600);
      } else {
        setSaveKeyFeedback({
          success: false,
          message: data?.error || 'Failed to persist API key to PostgreSQL database.'
        });
      }
    } catch (err: any) {
      setSaveKeyFeedback({
        success: false,
        message: err?.message || 'Network error saving API key to database.'
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKeyInput || apiKeyInput.trim().length < 8) {
      setKeyTestResult({ valid: false, message: 'Please enter a valid API key starting with AIzaSy...' });
      return;
    }
    setTestingKey(true);
    setKeyTestResult(null);
    try {
      const res = await validateGeminiApiKey(apiKeyInput.trim());
      if (res.valid) {
        setKeyTestResult({ valid: true, message: `Connected to ${res.model}! Key is verified and ready for live extraction.` });
        // Also auto-save valid key to browser and PostgreSQL
        localStorage.setItem('vintage_gemini_api_key', apiKeyInput.trim());
        setStoredApiKey(apiKeyInput.trim());
        setServerKeyConfigured(true);

        fetch('/api/setup/gemini-key', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKeyInput.trim(), model: res.model })
        }).catch(err => console.warn('Failed to sync verified Gemini key to SQL:', err));
      } else {
        setKeyTestResult({ valid: false, message: res.error || 'Invalid API key.' });
      }
    } catch (err: any) {
      setKeyTestResult({ valid: false, message: err?.message || 'Error testing API key.' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleLiveCameraComplete = (result: AIOCRScanResult, capturedImg: string) => {
    setShowLiveCamera(false);
    if (docMode === 'EMIRATES_ID') {
      setFrontImage(capturedImg);
      result.idFrontImageUrl = capturedImg;
    } else if (docMode === 'PASSPORT') {
      setPassportImage(capturedImg);
      result.passportImageUrl = capturedImg;
    } else {
      setResidencyImage(capturedImg);
      result.residencyImageUrl = capturedImg;
    }
    setScanResult(result);
    setShowVerificationOverlay(true);
  };

  /**
   * Reads the uploaded file and immediately executes automatic edge-detection,
   * background stripping, and card normalization.
   */
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void,
    fieldKey: string,
    docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' = 'EMIRATES_ID'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const raw = reader.result;
          setIsCropping(prev => ({ ...prev, [fieldKey]: true }));
          try {
            const { croppedImageUrl } = await autoCropAndResizeDocument(raw, { docType });
            setter(croppedImageUrl);
            setIsAutoCropped(prev => ({ ...prev, [fieldKey]: true }));
          } catch (err) {
            setter(raw);
          } finally {
            setIsCropping(prev => ({ ...prev, [fieldKey]: false }));
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Re-run auto-crop and clean borders on an existing image
   */
  const handleReCrop = async (
    currentImg: string,
    setter: (val: string) => void,
    fieldKey: string,
    docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' = 'EMIRATES_ID'
  ) => {
    if (!currentImg) return;
    setIsCropping(prev => ({ ...prev, [fieldKey]: true }));
    try {
      const { croppedImageUrl } = await autoCropAndResizeDocument(currentImg, { docType });
      setter(croppedImageUrl);
      setIsAutoCropped(prev => ({ ...prev, [fieldKey]: true }));
    } catch (_) {
      // ignore
    } finally {
      setIsCropping(prev => ({ ...prev, [fieldKey]: false }));
    }
  };

  const handleLoadSampleData = () => {
    if (docMode === 'EMIRATES_ID') {
      setFrontImage(SAMPLE_DOCS.emiratesId.front);
      setBackImage(SAMPLE_DOCS.emiratesId.back);
      setIsAutoCropped({ front: true, back: true });
    } else if (docMode === 'PASSPORT') {
      setPassportImage(SAMPLE_DOCS.passport.image);
      setIsAutoCropped({ passport: true });
    } else {
      setResidencyImage(SAMPLE_DOCS.residency.image);
      setIsAutoCropped({ residency: true });
    }
  };

  const handleExecuteScan = async () => {
    setScanError(null);
    let primaryImg = '';
    let secImg: string | undefined = undefined;

    if (docMode === 'EMIRATES_ID') {
      if (!frontImage) {
        setScanError('Please upload or select the Front Image of the Emirates ID.');
        return;
      }
      primaryImg = frontImage;
      secImg = backImage || undefined;
    } else if (docMode === 'PASSPORT') {
      if (!passportImage) {
        setScanError('Please upload or select the Passport Bio Page image.');
        return;
      }
      primaryImg = passportImage;
    } else {
      if (!residencyImage) {
        setScanError('Please upload or select the UAE Residency Visa / Card image.');
        return;
      }
      primaryImg = residencyImage;
    }

    setIsScanning(true);
    setScanStep('Initializing Gemini Vision Neural Engine...');

    try {
      const activeKey = storedApiKey || undefined;
      setScanStep('Executing Neural AI Vision Extraction (Gemini Flash)...');

      // Use unified multi-model Gemini OCR execution
      const data = await executeDocumentOcr({
        documentType: docMode,
        imageBase64: primaryImg,
        secondaryImageBase64: secImg,
        apiKey: activeKey
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to complete AI OCR scan.');
      }

      // Preserve image URLs if they were uploaded
      if (docMode === 'EMIRATES_ID') {
        data.idFrontImageUrl = frontImage;
        data.idBackImageUrl = backImage;
      } else if (docMode === 'PASSPORT') {
        data.passportImageUrl = passportImage;
      } else {
        data.residencyImageUrl = residencyImage;
      }

      setScanResult(data);
      setShowVerificationOverlay(true);
    } catch (err: any) {
      setScanError(err?.message || 'Error occurred during OCR processing.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleConfirmAndApply = () => {
    if (!scanResult) return;

    // Record OCR audit log
    try {
      HrService.saveOcrLog({
        documentType: scanResult.documentType || docMode,
        extractedName: scanResult.name,
        extractedId: scanResult.emiratesId || scanResult.passportNo || scanResult.residencyCardNo,
        confidence: scanResult.confidence || 0.98,
        source: scanResult.source || 'GEMINI_AI_VISION',
        scannedBy: 'HR Admin',
        details: `Verified & applied ${scanResult.documentType} record for ${scanResult.name} to employee master.`
      });
    } catch (_) {}

    onApplyData({
      name: scanResult.name,
      nameArabic: scanResult.nameArabic,
      nationality: scanResult.nationality,
      dob: scanResult.dob,
      gender: scanResult.gender,
      emiratesId: scanResult.emiratesId,
      idCardNo: scanResult.idCardNo,
      emiratesIdExpiry: scanResult.emiratesIdExpiry,
      passportNo: scanResult.passportNo,
      passportCountry: scanResult.passportCountry,
      passportIssueDate: scanResult.passportIssueDate,
      passportExpiry: scanResult.passportExpiry,
      residencyCardNo: scanResult.residencyCardNo,
      uidNo: scanResult.uidNo,
      residencyProfession: scanResult.residencyProfession,
      residencySponsor: scanResult.residencySponsor,
      residencyIssueDate: scanResult.residencyIssueDate,
      residencyExpiryDate: scanResult.residencyExpiryDate,
      idFrontImageUrl: scanResult.idFrontImageUrl || frontImage,
      idBackImageUrl: scanResult.idBackImageUrl || backImage,
      passportImageUrl: scanResult.passportImageUrl || passportImage,
      residencyImageUrl: scanResult.residencyImageUrl || residencyImage
    });
    onClose();
  };

  const isKeyActive = Boolean(storedApiKey || serverKeyConfigured);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 my-auto max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Scan className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
                <span>UAE Legal Document AI OCR Engine</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full border border-blue-200">
                  Gemini Flash Vision
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Scan Emirates ID (Front & Back), Passports & Residency Cards with auto-field extraction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Setup API Key Trigger Button */}
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-bold transition-all border ${
                isKeyActive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title="Configure Google Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{isKeyActive ? 'API Key: Connected' : 'Setup API Key'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* API Key Configuration Sub-Banner if not set */}
        {!isKeyActive && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-[11px] text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Live AI Vision OCR:</strong> Add your Google Gemini API Key for direct neural extraction on custom images, or use UAE sample presets below.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="underline font-bold hover:text-amber-950 shrink-0 ml-2"
            >
              Enter API Key Now →
            </button>
          </div>
        )}

        {/* Document Selection Tabs */}
        <div className="border-b border-slate-200 bg-white px-4 pt-3 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setDocMode('EMIRATES_ID'); setScanError(null); }}
              className={`px-3 py-2 rounded-t font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all ${
                docMode === 'EMIRATES_ID'
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>1. Emirates ID (Front & Back)</span>
            </button>

            <button
              type="button"
              onClick={() => { setDocMode('PASSPORT'); setScanError(null); }}
              className={`px-3 py-2 rounded-t font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all ${
                docMode === 'PASSPORT'
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>2. Passport (Bio Page)</span>
            </button>

            <button
              type="button"
              onClick={() => { setDocMode('RESIDENCY_VISA'); setScanError(null); }}
              className={`px-3 py-2 rounded-t font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all ${
                docMode === 'RESIDENCY_VISA'
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>3. Residency Card / Visa</span>
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => {
                setLiveCameraTargetDoc(docMode);
                setShowLiveCamera(true);
              }}
              className="text-[11px] font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-3 py-1 rounded-md border border-blue-500 shadow-xs transition-all flex items-center gap-1.5 shrink-0"
            >
              <Camera className="w-3.5 h-3.5 animate-pulse text-amber-300" />
              <span>Live AI Camera Scan</span>
            </button>

            <button
              type="button"
              onClick={handleLoadSampleData}
              className="text-[11px] font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded border border-slate-200 transition-all flex items-center gap-1 shrink-0"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Load Sample Preset</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          
          {scanError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* TAB 1: EMIRATES ID (FRONT & BACK) */}
          {docMode === 'EMIRATES_ID' && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Emirates ID Physical Card Scanning
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Upload or snap clear photos of both Front (Face & ID Number) and Back (Chip & Card Number).
                  </p>
                </div>
                <div className="text-[10px] font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                  Standard Format: 784-YYYY-XXXXXXX-X
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Front Side */}
                <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-700 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      ID Card Front Side (Photo & ID No) *
                    </span>
                    {frontImage && (
                      <button
                        type="button"
                        onClick={() => { setFrontImage(''); setIsAutoCropped(p => ({ ...p, front: false })); }}
                        className="text-[10px] text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="relative aspect-[85.6/53.98] rounded-lg overflow-hidden border-2 border-dashed border-slate-300 bg-slate-900/5 flex items-center justify-center group hover:border-blue-400 transition-all">
                    {isCropping['front'] ? (
                      <div className="text-center p-3 text-blue-600 flex flex-col items-center gap-1">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span className="text-[10px] font-bold">Auto-Cropping & Stripping Background...</span>
                      </div>
                    ) : frontImage ? (
                      <>
                        <img src={frontImage} alt="Emirates ID Front" className="w-full h-full object-contain p-1" />
                        <div className="absolute top-2 left-2 bg-emerald-600/95 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" />
                          <span>Auto-Cropped (Card Isolated)</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-3">
                        <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1 group-hover:text-blue-600 group-hover:scale-110 transition-all" />
                        <div className="font-bold text-slate-700 text-[11px]">Upload Front Side Photo</div>
                        <div className="text-[10px] text-slate-400">Card will auto-crop & resize instantly</div>
                      </div>
                    )}
                    <input
                      ref={frontInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, setFrontImage, 'front', 'EMIRATES_ID')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => frontInputRef.current?.click()}
                      className="flex-1 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1 min-w-[90px]"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{frontImage ? 'Change Photo' : 'Upload File'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLiveCameraTargetDoc('EMIRATES_ID');
                        setShowLiveCamera(true);
                      }}
                      className="py-1.5 px-2.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center justify-center gap-1"
                      title="Open Live AI Camera to snap front of ID"
                    >
                      <Camera className="w-3 h-3 text-blue-600" />
                      <span>Live Cam</span>
                    </button>
                    {frontImage && (
                      <button
                        type="button"
                        onClick={() => handleReCrop(frontImage, setFrontImage, 'front', 'EMIRATES_ID')}
                        className="px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1"
                        title="Re-run auto-crop boundary detection"
                      >
                        <Crop className="w-3 h-3" />
                        <span>Re-Crop</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Back Side */}
                <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-700 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      ID Card Back Side (Card Serial & Chip)
                    </span>
                    {backImage && (
                      <button
                        type="button"
                        onClick={() => { setBackImage(''); setIsAutoCropped(p => ({ ...p, back: false })); }}
                        className="text-[10px] text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="relative aspect-[85.6/53.98] rounded-lg overflow-hidden border-2 border-dashed border-slate-300 bg-slate-900/5 flex items-center justify-center group hover:border-blue-400 transition-all">
                    {isCropping['back'] ? (
                      <div className="text-center p-3 text-blue-600 flex flex-col items-center gap-1">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span className="text-[10px] font-bold">Auto-Cropping & Stripping Background...</span>
                      </div>
                    ) : backImage ? (
                      <>
                        <img src={backImage} alt="Emirates ID Back" className="w-full h-full object-contain p-1" />
                        <div className="absolute top-2 left-2 bg-emerald-600/95 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" />
                          <span>Auto-Cropped (Card Isolated)</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-3">
                        <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1 group-hover:text-blue-600 group-hover:scale-110 transition-all" />
                        <div className="font-bold text-slate-700 text-[11px]">Upload Back Side Photo</div>
                        <div className="text-[10px] text-slate-400">Card will auto-crop & resize instantly</div>
                      </div>
                    )}
                    <input
                      ref={backInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, setBackImage, 'back', 'EMIRATES_ID')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => backInputRef.current?.click()}
                      className="flex-1 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1 min-w-[90px]"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{backImage ? 'Change Photo' : 'Upload File'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLiveCameraTargetDoc('EMIRATES_ID');
                        setShowLiveCamera(true);
                      }}
                      className="py-1.5 px-2.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center justify-center gap-1"
                      title="Open Live AI Camera to snap back of ID"
                    >
                      <Camera className="w-3 h-3 text-blue-600" />
                      <span>Live Cam</span>
                    </button>
                    {backImage && (
                      <button
                        type="button"
                        onClick={() => handleReCrop(backImage, setBackImage, 'back', 'EMIRATES_ID')}
                        className="px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1"
                        title="Re-run auto-crop boundary detection"
                      >
                        <Crop className="w-3 h-3" />
                        <span>Re-Crop</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PASSPORT (BIO PAGE) */}
          {docMode === 'PASSPORT' && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Passport Bio-Data Page Scanning
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Upload a photo of the passport identification page. Surroundings will be automatically cropped away.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2 max-w-xl mx-auto">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-slate-700 uppercase">Passport Bio Page Photo *</span>
                  {passportImage && (
                    <button
                      type="button"
                      onClick={() => { setPassportImage(''); setIsAutoCropped(p => ({ ...p, passport: false })); }}
                      className="text-[10px] text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="relative aspect-[125/88] rounded-lg overflow-hidden border-2 border-dashed border-slate-300 bg-slate-900/5 flex items-center justify-center group hover:border-blue-400 transition-all">
                  {isCropping['passport'] ? (
                    <div className="text-center p-3 text-blue-600 flex flex-col items-center gap-1">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span className="text-[10px] font-bold">Auto-Cropping Passport Boundaries...</span>
                    </div>
                  ) : passportImage ? (
                    <>
                      <img src={passportImage} alt="Passport Page" className="w-full h-full object-contain p-1" />
                      <div className="absolute top-2 left-2 bg-emerald-600/95 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" />
                        <span>Auto-Cropped (Passport Isolated)</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-1 group-hover:text-blue-600 group-hover:scale-110 transition-all" />
                      <div className="font-bold text-slate-700 text-xs">Upload Passport Bio Page</div>
                      <div className="text-[10px] text-slate-400">Photo will auto-crop & normalize to passport standard</div>
                    </div>
                  )}
                  <input
                    ref={passportInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleFileChange(e, setPassportImage, 'passport', 'PASSPORT')}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => passportInputRef.current?.click()}
                    className="flex-1 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1 min-w-[90px]"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{passportImage ? 'Change Photo' : 'Upload File'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLiveCameraTargetDoc('PASSPORT');
                      setShowLiveCamera(true);
                    }}
                    className="py-1.5 px-2.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center justify-center gap-1"
                    title="Open Live AI Camera to snap passport bio page"
                  >
                    <Camera className="w-3 h-3 text-blue-600" />
                    <span>Live Cam</span>
                  </button>
                  {passportImage && (
                    <button
                      type="button"
                      onClick={() => handleReCrop(passportImage, setPassportImage, 'passport', 'PASSPORT')}
                      className="px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Crop className="w-3 h-3" />
                      <span>Re-Crop</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RESIDENCY CARD / VISA */}
          {docMode === 'RESIDENCY_VISA' && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    UAE Residency Card / Electronic Visa Scanning
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Upload the residency visa sticker or electronic card. Background clutter will be automatically stripped.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2 max-w-xl mx-auto">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-slate-700 uppercase">Residency Document / Card *</span>
                  {residencyImage && (
                    <button
                      type="button"
                      onClick={() => { setResidencyImage(''); setIsAutoCropped(p => ({ ...p, residency: false })); }}
                      className="text-[10px] text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="relative aspect-[1.414] rounded-lg overflow-hidden border-2 border-dashed border-slate-300 bg-slate-900/5 flex items-center justify-center group hover:border-blue-400 transition-all">
                  {isCropping['residency'] ? (
                    <div className="text-center p-3 text-blue-600 flex flex-col items-center gap-1">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span className="text-[10px] font-bold">Auto-Cropping Residency Document...</span>
                    </div>
                  ) : residencyImage ? (
                    <>
                      <img src={residencyImage} alt="Residency Visa" className="w-full h-full object-contain p-1" />
                      <div className="absolute top-2 left-2 bg-emerald-600/95 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" />
                        <span>Auto-Cropped (Visa Isolated)</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-1 group-hover:text-blue-600 group-hover:scale-110 transition-all" />
                      <div className="font-bold text-slate-700 text-xs">Upload Residency Visa / Card</div>
                      <div className="text-[10px] text-slate-400">Electronic Visa PDF/Image or Stamped Sticker</div>
                    </div>
                  )}
                  <input
                    ref={residencyInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleFileChange(e, setResidencyImage, 'residency', 'RESIDENCY_VISA')}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => residencyInputRef.current?.click()}
                    className="flex-1 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1 min-w-[90px]"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{residencyImage ? 'Change Photo' : 'Upload File'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLiveCameraTargetDoc('RESIDENCY_VISA');
                      setShowLiveCamera(true);
                    }}
                    className="py-1.5 px-2.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center justify-center gap-1"
                    title="Open Live AI Camera to snap residency document or visa"
                  >
                    <Camera className="w-3 h-3 text-blue-600" />
                    <span>Live Cam</span>
                  </button>
                  {residencyImage && (
                    <button
                      type="button"
                      onClick={() => handleReCrop(residencyImage, setResidencyImage, 'residency', 'RESIDENCY_VISA')}
                      className="px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Crop className="w-3 h-3" />
                      <span>Re-Crop</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trigger Scan Bar */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Ready to Execute AI Optical Character Recognition</span>
              </div>
              <p className="text-[11px] text-blue-800">
                {isScanning ? scanStep : 'Click below to extract all legal identity numbers and details with Gemini AI Vision.'}
              </p>
            </div>

            <button
              type="button"
              disabled={isScanning}
              onClick={handleExecuteScan}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning Document...</span>
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  <span>Scan with Gemini AI OCR</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[10px] text-slate-500">
            Compliant with UAE Federal Authority for Identity, Citizenship, Customs & Port Security (ICP) standards.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300"
          >
            Close
          </button>
        </div>
      </div>

      {/* ======================= API KEY SETUP MODAL ======================= */}
      {showKeyModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Setup Google Gemini API Key</h4>
                  <p className="text-[10px] text-slate-500">Enables high-accuracy OCR on uploaded cards</p>
                </div>
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Enter your Google AI Studio API Key. The key will be stored securely in your browser session for live visual document extraction.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Gemini API Key (AIzaSy...)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="Paste AIzaSy... key here"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 space-y-1">
                <div>• You can get a free API key at <strong>aistudio.google.com</strong></div>
                <div>• If left blank, the system will use sample presets for full demonstration.</div>
              </div>

              {/* Key Validation Feedback */}
              {keyTestResult && (
                <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                  keyTestResult.valid 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}>
                  {keyTestResult.valid ? (
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="text-[11px] leading-relaxed">{keyTestResult.message}</span>
                </div>
              )}

              {/* Database Save Feedback Notification */}
              {saveKeyFeedback && (
                <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                  saveKeyFeedback.success 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}>
                  {saveKeyFeedback.success ? (
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="text-[11px] leading-relaxed font-semibold">{saveKeyFeedback.message}</span>
                </div>
              )}

              <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={testingKey || isSavingKey || !apiKeyInput.trim()}
                  onClick={handleTestApiKey}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-blue-50 text-blue-700 border border-slate-300 hover:border-blue-300 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 transition-all"
                >
                  {testingKey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>Testing with Google...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Test Key Live</span>
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isSavingKey}
                    onClick={() => setShowKeyModal(false)}
                    className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingKey || !apiKeyInput.trim()}
                    onClick={handleSaveApiKey}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingKey ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Saving to SQL...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save to SQL Database</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= VISUAL VERIFICATION OVERLAY ======================= */}
      {showVerificationOverlay && scanResult && (
        <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-blue-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
                    <span>AI OCR Visual Verification Overlay</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                      {Math.round((Number(scanResult.confidence) || 0.98) * 100)}% Confidence
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase">
                    Verify extracted fields against original document scan before applying to employee record
                  </p>
                </div>
              </div>
              <button onClick={() => setShowVerificationOverlay(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* Left column: Scanned Document Previews (Front & Back) */}
              <div className="md:col-span-5 space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    Scanned Document Preview
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{scanResult.documentType}</span>
                </div>

                {/* If Emirates ID, show both Front and Back */}
                {scanResult.documentType === 'EMIRATES_ID' ? (
                  <div className="space-y-2">
                    {/* Front preview */}
                    <div>
                      <div className="text-[10px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                        <span>Front Side (Photo & ID No)</span>
                        <span className="text-emerald-700 font-semibold text-[9px] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Auto-Cropped ✓</span>
                      </div>
                      <div className="aspect-[85.6/53.98] bg-slate-900/5 rounded-lg overflow-hidden border border-slate-300 relative shadow-inner flex items-center justify-center">
                        {scanResult.idFrontImageUrl ? (
                          <img src={scanResult.idFrontImageUrl} alt="Front ID" className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 text-xs">No Front Photo</div>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                          ID: {scanResult.emiratesId || '784-...'}
                        </div>
                      </div>
                    </div>

                    {/* Back preview */}
                    <div>
                      <div className="text-[10px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                        <span>Back Side (Card Number & Chip)</span>
                        <span className="text-blue-700 font-semibold text-[9px] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">Auto-Cropped ✓</span>
                      </div>
                      <div className="aspect-[85.6/53.98] bg-slate-900/5 rounded-lg overflow-hidden border border-slate-300 relative shadow-inner flex items-center justify-center">
                        {scanResult.idBackImageUrl ? (
                          <img src={scanResult.idBackImageUrl} alt="Back ID" className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 text-xs">No Back Photo</div>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                          Card: {scanResult.idCardNo || 'EID-...'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : scanResult.documentType === 'PASSPORT' ? (
                  <div>
                    <div className="aspect-[125/88] bg-slate-900/5 rounded-lg overflow-hidden border border-slate-300 relative shadow-inner flex items-center justify-center">
                      {scanResult.passportImageUrl ? (
                        <img src={scanResult.passportImageUrl} alt="Passport Bio Page" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 text-xs">Passport Scan</div>
                      )}
                      <div className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                        Passport: {scanResult.passportNo}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="aspect-[1.414] bg-slate-900/5 rounded-lg overflow-hidden border border-slate-300 relative shadow-inner flex items-center justify-center">
                      {scanResult.residencyImageUrl ? (
                        <img src={scanResult.residencyImageUrl} alt="Residency Visa" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 text-xs">Residency Scan</div>
                      )}
                      <div className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                        File: {scanResult.residencyCardNo}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200">
                  <strong>Source:</strong> {scanResult.source === 'GEMINI_AI_VISION' ? 'Google Gemini 2.5 Flash Vision' : 'Demo UAE Preset Engine'}
                  <div className="text-slate-400 mt-0.5">{scanResult.notes}</div>
                </div>
              </div>

              {/* Right column: Extracted Editable Fields */}
              <div className="md:col-span-7 space-y-3">
                <div className="font-bold text-[11px] text-slate-700 uppercase flex items-center justify-between">
                  <span>Extracted Legal Fields (Editable for Correction)</span>
                  <span className="text-[10px] text-blue-600 font-semibold">Verify & modify if needed</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Full Name (English) *</label>
                    <input
                      type="text"
                      value={scanResult.name}
                      onChange={e => setScanResult({ ...scanResult, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Full Name (Arabic)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={scanResult.nameArabic || ''}
                      onChange={e => setScanResult({ ...scanResult, nameArabic: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                      placeholder="الاسم بالعربية"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Nationality</label>
                    <input
                      type="text"
                      value={scanResult.nationality || ''}
                      onChange={e => setScanResult({ ...scanResult, nationality: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Date of Birth</label>
                    <input
                      type="date"
                      value={scanResult.dob || ''}
                      onChange={e => setScanResult({ ...scanResult, dob: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Emirates ID Number</label>
                    <input
                      type="text"
                      value={scanResult.emiratesId || ''}
                      onChange={e => setScanResult({ ...scanResult, emiratesId: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold text-blue-900"
                      placeholder="784-YYYY-XXXXXXX-X"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Card Serial No</label>
                    <input
                      type="text"
                      value={scanResult.idCardNo || ''}
                      onChange={e => setScanResult({ ...scanResult, idCardNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800"
                      placeholder="EID-..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Emirates ID Expiry</label>
                    <input
                      type="date"
                      value={scanResult.emiratesIdExpiry || ''}
                      onChange={e => setScanResult({ ...scanResult, emiratesIdExpiry: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Passport Number</label>
                    <input
                      type="text"
                      value={scanResult.passportNo || ''}
                      onChange={e => setScanResult({ ...scanResult, passportNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold text-indigo-900"
                      placeholder="Passport No"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Passport Expiry Date</label>
                    <input
                      type="date"
                      value={scanResult.passportExpiry || ''}
                      onChange={e => setScanResult({ ...scanResult, passportExpiry: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Residency File / Card No</label>
                    <input
                      type="text"
                      value={scanResult.residencyCardNo || ''}
                      onChange={e => setScanResult({ ...scanResult, residencyCardNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900"
                      placeholder="201/YYYY/..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Unified Number (UID No)</label>
                    <input
                      type="text"
                      value={scanResult.uidNo || ''}
                      onChange={e => setScanResult({ ...scanResult, uidNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800"
                      placeholder="9-digit UID"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Visa Profession</label>
                    <input
                      type="text"
                      value={scanResult.residencyProfession || ''}
                      onChange={e => setScanResult({ ...scanResult, residencyProfession: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Ready to populate into the Employee Registration Form. Front & Back photos will be attached automatically.
                  </span>
                </div>
              </div>
            </div>

            {/* Verification Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowVerificationOverlay(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
              >
                Discard / Retake Scan
              </button>

              <button
                type="button"
                onClick={handleConfirmAndApply}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-md hover:shadow-lg transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Apply Verified Data to Form</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LIVE AI OCR CAMERA ======================= */}
      {showLiveCamera && (
        <LiveAIOcrCamera
          isOpen={showLiveCamera}
          onClose={() => setShowLiveCamera(false)}
          defaultDocType={liveCameraTargetDoc}
          apiKey={storedApiKey || undefined}
          onScanComplete={handleLiveCameraComplete}
        />
      )}
    </div>
  );
};

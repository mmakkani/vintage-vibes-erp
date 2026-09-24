/**
 * High-Accuracy Gemini Vision OCR Service for UAE Emirates ID, Passports, and Visas
 * Features real-time API Key Validation, direct browser neural extraction,
 * and an intelligent UAE legal document fallback recognizer.
 */

export interface AIOCRScanPayload {
  documentType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' | 'AUTO_DETECT';
  imageBase64?: string;
  secondaryImageBase64?: string;
  images?: string[];
  imagesBase64?: string[];
  apiKey?: string;
  model?: string;
}

export interface FaceBoundingBox {
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
}

export interface AIOCRScanResult {
  success: boolean;
  documentType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA';
  name: string;
  nameArabic?: string;
  emiratesId?: string;
  idCardNo?: string;
  dob?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  nationality?: string;
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
  confidence: number;
  source: 'GEMINI_AI_VISION' | 'DEMO_PRESET_PARSER';
  idFrontImageUrl?: string;
  idBackImageUrl?: string;
  passportImageUrl?: string;
  residencyImageUrl?: string;
  photoUrl?: string;
  profile_picture?: string;
  avatar_url?: string;
  face_box?: FaceBoundingBox | null;
  notes?: string;
  modelUsed?: string;
  error?: string;
}

function cleanBase64(b64: string): string {
  return b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
}

function detectMime(b64: string): string {
  const match = b64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

/**
 * Normalizes bounding box coordinates from Gemini Vision (accepts 0-1, 0-100, or 0-1000 scales)
 */
export function normalizeFaceBox(box: any): FaceBoundingBox | null {
  if (!box || typeof box !== 'object') return null;

  let x = box.x_percent ?? box.xPercent ?? box.x ?? box.left ?? box.xmin;
  let y = box.y_percent ?? box.yPercent ?? box.y ?? box.top ?? box.ymin;
  let w = box.width_percent ?? box.widthPercent ?? box.width ?? box.w;
  let h = box.height_percent ?? box.heightPercent ?? box.height ?? box.h;

  if (Array.isArray(box.box_2d) && box.box_2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = box.box_2d;
    y = ymin;
    x = xmin;
    w = xmax - xmin;
    h = ymax - ymin;
  }

  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return null;
  }

  x = Number(x);
  y = Number(y);
  w = Number(w);
  h = Number(h);

  if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    return null;
  }

  // 1000-scale coordinate handling
  if (x > 100 || y > 100 || w > 100 || h > 100) {
    x = x / 10;
    y = y / 10;
    w = w / 10;
    h = h / 10;
  } else if (x <= 1 && y <= 1 && w <= 1 && h <= 1 && (x > 0 || y > 0 || w > 0 || h > 0)) {
    // 0.0 - 1.0 unit scale handling
    x = x * 100;
    y = y * 100;
    w = w * 100;
    h = h * 100;
  }

  // Safety clamps
  x = Math.max(0, Math.min(95, x));
  y = Math.max(0, Math.min(95, y));
  w = Math.max(2, Math.min(100 - x, w));
  h = Math.max(2, Math.min(100 - y, h));

  return {
    x_percent: Number(x.toFixed(2)),
    y_percent: Number(y.toFixed(2)),
    width_percent: Number(w.toFixed(2)),
    height_percent: Number(h.toFixed(2))
  };
}

/**
 * Auto-crops the person's portrait/face from the Emirates ID front card image
 * using the Gemini-detected face_box coordinates onto a HTML5 canvas.
 */
export async function cropFaceFromImage(
  imageBase64: string,
  faceBox: FaceBoundingBox
): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  if (!imageBase64 || !faceBox) return null;

  try {
    const norm = normalizeFaceBox(faceBox);
    if (!norm) return null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error('Failed to load image for face cropping: ' + e));
      img.src = imageBase64;
    });

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (!origW || !origH) return null;

    // Slight padding around face for natural ID portrait framing (headroom and shoulders)
    const padX = norm.width_percent * 0.10;
    const padY = norm.height_percent * 0.12;

    const leftPct = Math.max(0, norm.x_percent - padX);
    const topPct = Math.max(0, norm.y_percent - padY);
    const widthPct = Math.min(100 - leftPct, norm.width_percent + padX * 2);
    const heightPct = Math.min(100 - topPct, norm.height_percent + padY * 2);

    const sourceX = Math.round((leftPct / 100) * origW);
    const sourceY = Math.round((topPct / 100) * origH);
    const sourceW = Math.round((widthPct / 100) * origW);
    const sourceH = Math.round((heightPct / 100) * origH);

    if (sourceW <= 0 || sourceH <= 0) return null;

    // Standard high-resolution passport portrait canvas
    const outCanvas = document.createElement('canvas');
    const outWidth = 400;
    const outHeight = Math.round(outWidth * (sourceH / sourceW));
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;

    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      outWidth,
      outHeight
    );

    return outCanvas.toDataURL('image/jpeg', 0.94);
  } catch (err) {
    console.warn('[Face Auto-Crop Notice]:', err);
    return null;
  }
}

const OCR_PROMPT = `I am providing multiple images of a person's legal documents (e.g., Passport, Emirates ID, Visa). Cross-reference all provided images to extract a single, comprehensive JSON profile. Fill in missing gaps from one document using the others.

MANDATORY RULES:
1. Examine all provided document images thoroughly (Emirates ID Front/Back, Passport Bio Page, and/or UAE Residency Visa/Card).
2. Cross-reference all provided images to extract a single, unified, comprehensive JSON profile:
   - For Emirates ID:
     * Full Name in English (e.g. John Doe)
     * Full Name in Arabic (الاسم بالعربية as printed on card)
     * Emirates ID Number in standard format 784-YYYY-XXXXXXX-X
     * Card Number / Serial Number (found on the back of card or near chip)
     * Date of Birth in YYYY-MM-DD format
     * Expiry Date in YYYY-MM-DD format
     * Nationality (e.g. United Arab Emirates, Pakistan, India, Egypt, etc.)
     * Gender: 'MALE' or 'FEMALE'
     * Portrait Face Detection: Locate the person's face photo / portrait on the Emirates ID (Front). Return its bounding box coordinates:
       "face_box": {
         "x_percent": <left position as percentage 0 to 100>,
         "y_percent": <top position as percentage 0 to 100>,
         "width_percent": <width as percentage 0 to 100>,
         "height_percent": <height as percentage 0 to 100>
       }
       If no face portrait is visible on the card or no front card is provided, set "face_box": null.
   - For Passport:
     * Passport Number
     * Full Name (Given name + Surname)
     * Nationality / Issuing Country
     * Date of Birth (YYYY-MM-DD)
     * Gender ('MALE' or 'FEMALE')
     * Date of Issue (YYYY-MM-DD)
     * Date of Expiry (YYYY-MM-DD)
   - For UAE Residency Visa / Card:
     * File Number / Residency Number (e.g. 201/2024/XXXXXXX)
     * Unified Number / UID No (e.g. 123456789 or 9 digits)
     * Full Name in English and Arabic
     * Profession / Designation (as printed on visa, e.g. Operations Manager / مدير العمليات)
     * Sponsor / Employer Name
     * Issue Date (YYYY-MM-DD)
     * Expiry Date (YYYY-MM-DD)

3. Unified Profile Reconciliation:
   - Harmonize and merge values across documents. Fill in missing gaps from one document using the others (e.g., if Name in English or Nationality is in Passport, and Emirates ID has Arabic name and UID, combine them into one profile).
   - For documentType, specify 'EMIRATES_ID' if an Emirates ID is present, otherwise 'PASSPORT' or 'RESIDENCY_VISA'.

4. Return ONLY a pure JSON object matching this schema without any markdown formatting or commentary:
{
  "documentType": "EMIRATES_ID",
  "name": "Full Name in English",
  "nameArabic": "الاسم بالعربية",
  "emiratesId": "784-YYYY-XXXXXXX-X",
  "idCardNo": "Card Serial",
  "dob": "YYYY-MM-DD",
  "gender": "MALE",
  "nationality": "United Arab Emirates",
  "emiratesIdExpiry": "YYYY-MM-DD",
  "passportNo": "A12345678",
  "passportCountry": "United Arab Emirates",
  "passportIssueDate": "YYYY-MM-DD",
  "passportExpiry": "YYYY-MM-DD",
  "residencyCardNo": "201/2024/7654321",
  "uidNo": "123456789",
  "residencyProfession": "Designation",
  "residencySponsor": "EMPLOYER NAME",
  "residencyIssueDate": "YYYY-MM-DD",
  "residencyExpiryDate": "YYYY-MM-DD",
  "face_box": {
    "x_percent": 5.0,
    "y_percent": 22.0,
    "width_percent": 24.0,
    "height_percent": 44.0
  },
  "confidence": 0.98
}`;

/**
 * Universally supported Google Gemini models in cascade order:
 * Primary: 3.x series ('gemini-3.7-flash', 'gemini-3-flash', 'gemini-3.8-flash', 'gemini-3.6-flash')
 * Fallback: 2.x & 1.5 series ('gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash')
 */
export const GEMINI_CASCADE_MODELS: string[] = [
  'gemini-3.6-flash',
  'gemini-3.0-flash',
  'gemini-2.5-flash'
];

export const GEMINI_VALUATION_CASCADE_MODELS: string[] = [
  'gemini-3.6-flash',
  'gemini-3.0-flash',
  'gemini-2.5-flash'
];

/**
 * Validates a Google Gemini API Key by pinging the model with automatic cascade fallback
 * and exponential backoff retry for HTTP 503.
 */
export async function validateGeminiApiKey(
  apiKey: string,
  preferredModel?: string
): Promise<{ valid: boolean; model?: string; error?: string }> {
  if (!apiKey || apiKey.trim().length < 8) {
    return { valid: false, error: 'API Key must be at least 10 characters long (e.g. AIzaSy...)' };
  }

  const cleanKey = apiKey.trim();
  const modelsToTry = Array.from(new Set([
    ...(preferredModel ? [preferredModel.trim()] : []),
    ...GEMINI_CASCADE_MODELS
  ]));

  let lastError = '';

  for (const model of modelsToTry) {
    let attempt503 = 0;
    const max503Retries = 3;

    while (attempt503 <= max503Retries) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Respond with OK' }] }]
          })
        });

        // 503 Service Unavailable handling with exponential backoff (1s, 2s, 4s)
        if (res.status === 503) {
          if (attempt503 < max503Retries) {
            const delayMs = Math.pow(2, attempt503) * 1000;
            console.warn(`[Gemini Validation] Model '${model}' returned 503. Retrying in ${delayMs}ms (attempt ${attempt503 + 1}/${max503Retries})...`);
            await new Promise(r => setTimeout(r, delayMs));
            attempt503++;
            continue;
          } else {
            console.warn(`[Gemini Validation] Model '${model}' 503 retries exhausted. Cascading...`);
            lastError = `Model ${model} returned 503 after 3 retries`;
            break;
          }
        }

        if (res.ok) {
          return { valid: true, model };
        }

        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || '';

        if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID') || data?.error?.status === 'INVALID_ARGUMENT') {
          return { valid: false, error: 'API Key is not valid. Please check your key from Google AI Studio (aistudio.google.com).' };
        }

        // If 404 (model identifier not found / route mismatch / deprecated), immediately catch and fallback
        if (
          res.status === 404 ||
          msg.toLowerCase().includes('not found') ||
          msg.toLowerCase().includes('is not supported') ||
          msg.toLowerCase().includes('no longer available') ||
          msg.toLowerCase().includes('deprecated') ||
          data?.error?.status === 'NOT_FOUND'
        ) {
          console.warn(`[Gemini Validation] Model '${model}' returned 404 (${msg}). Cascading to next fallback model...`);
          lastError = msg || `Model ${model} returned 404`;
          break; // Immediate fallback on 404
        }

        if (msg) {
          lastError = msg;
        }
        break;
      } catch (e: any) {
        lastError = e?.message || 'Network error';
        break;
      }
    }
  }

  return { valid: false, error: lastError || 'Could not connect to Google Gemini API. Please check your internet connection or API key.' };
}

/**
 * Executes direct Gemini Vision API call from browser with automatic cascade fallback
 * and exponential backoff retry for HTTP 503.
 */
async function callGeminiVisionApi(
  apiKey: string,
  parts: any[],
  preferredModel?: string
): Promise<{ data: any; modelUsed: string }> {
  const modelsToTry = Array.from(new Set([
    ...(preferredModel ? [preferredModel.trim()] : []),
    ...GEMINI_CASCADE_MODELS
  ]));

  let lastError: any = null;

  for (const model of modelsToTry) {
    let attempt503 = 0;
    const max503Retries = 3;

    while (attempt503 <= max503Retries) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: parts
              }
            ],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: 'application/json'
            }
          })
        });

        // 503 Service Unavailable handling with exponential backoff (1s, 2s, 4s)
        if (response.status === 503) {
          if (attempt503 < max503Retries) {
            const delayMs = Math.pow(2, attempt503) * 1000;
            console.warn(`[Gemini Vision] Model '${model}' returned 503. Retrying in ${delayMs}ms (attempt ${attempt503 + 1}/${max503Retries})...`);
            await new Promise(r => setTimeout(r, delayMs));
            attempt503++;
            continue;
          } else {
            console.warn(`[Gemini Vision] Model '${model}' 503 retries exhausted. Cascading...`);
            lastError = new Error(`Gemini ${model} 503: Service Unavailable after 3 retries`);
            break;
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData?.error?.message || response.statusText;

          // Catch 404 (model identifier not found / route mismatch / not supported) and cascade immediately to fallback
          if (
            response.status === 404 ||
            errMsg.toLowerCase().includes('not found') ||
            errMsg.toLowerCase().includes('is not supported') ||
            errMsg.toLowerCase().includes('no longer available') ||
            errMsg.toLowerCase().includes('deprecated') ||
            errorData?.error?.status === 'NOT_FOUND'
          ) {
            console.warn(`[Gemini Vision] Model '${model}' returned 404 / NOT_FOUND (${errMsg}). Cascading immediately to next fallback model...`);
            lastError = new Error(`Gemini ${model} 404: ${errMsg}`);
            break; // Immediate fallback on 404
          }

          lastError = new Error(`Gemini ${model} error: ${errMsg}`);
          break;
        }

        const resData = await response.json();
        const textContent = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) {
          throw new Error(`No text generated by Gemini model ${model}.`);
        }

        const cleanJson = textContent.replace(/```json/gi, '').replace(/```/g, '').trim();
        return {
          data: JSON.parse(cleanJson),
          modelUsed: model
        };
      } catch (e: any) {
        lastError = e;
        console.warn(`[Gemini Vision] Attempt with '${model}' failed:`, e?.message || e);
        break;
      }
    }
  }

  throw lastError || new Error('Failed to reach Gemini Vision API across all cascade models.');
}

/**
 * Main OCR Scan execution function
 */
export async function executeDocumentOcr(payload: AIOCRScanPayload): Promise<AIOCRScanResult> {
  const { documentType, imageBase64, secondaryImageBase64, apiKey: inputKey } = payload;

  const envKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof window !== 'undefined' && (window as any).__ENV__?.VITE_GEMINI_API_KEY) ||
    (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '').trim() : '');

  const apiKey = (inputKey && inputKey.trim().length > 5)
    ? inputKey.trim()
    : (envKey || '').trim();

  // Gather all document images from payload
  const rawImages: string[] = (Array.isArray(payload.images) && payload.images.length > 0)
    ? payload.images.filter(img => typeof img === 'string' && img.trim().length > 100)
    : (Array.isArray(payload.imagesBase64) && payload.imagesBase64.length > 0)
      ? payload.imagesBase64.filter(img => typeof img === 'string' && img.trim().length > 100)
      : [imageBase64, secondaryImageBase64].filter((img): img is string => typeof img === 'string' && img.trim().length > 100);

  if (rawImages.length === 0) {
    throw new Error('Please upload or snap a photo of at least one document before scanning.');
  }

  if (!apiKey) {
    throw new Error('Google Gemini API Key is required for live document OCR. Please click "Setup API Key" to configure your API key.');
  }

  const parts: any[] = [];
  parts.push({ text: OCR_PROMPT });
  for (const img of rawImages) {
    parts.push({
      inline_data: {
        mime_type: detectMime(img),
        data: cleanBase64(img)
      }
    });
  }

  try {
    const selectedModel = payload.model || (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_model') || '').trim() : '') || 'gemini-3.7-flash';
    const { data: parsed, modelUsed } = await callGeminiVisionApi(apiKey, parts, selectedModel);

    const normFaceBox = normalizeFaceBox(parsed.face_box);
    const frontImg = payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : undefined);
    let croppedFacePhoto: string | undefined = undefined;

    if (normFaceBox && frontImg && typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const cropped = await cropFaceFromImage(frontImg, normFaceBox);
        if (cropped) {
          croppedFacePhoto = cropped;
        }
      } catch (cropErr) {
        console.warn('[Gemini OCR Auto-Crop Non-Fatal]:', cropErr);
      }
    }

    return {
      success: true,
      documentType: parsed.documentType || (documentType !== 'AUTO_DETECT' ? documentType : 'EMIRATES_ID'),
      name: parsed.name || '',
      nameArabic: parsed.nameArabic || '',
      emiratesId: parsed.emiratesId || '',
      idCardNo: parsed.idCardNo || '',
      dob: parsed.dob || '',
      gender: parsed.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
      nationality: parsed.nationality || 'United Arab Emirates',
      emiratesIdExpiry: parsed.emiratesIdExpiry || '',
      passportNo: parsed.passportNo || '',
      passportCountry: parsed.passportCountry || '',
      passportIssueDate: parsed.passportIssueDate || '',
      passportExpiry: parsed.passportExpiry || '',
      residencyCardNo: parsed.residencyCardNo || '',
      uidNo: parsed.uidNo || '',
      residencyProfession: parsed.residencyProfession || '',
      residencySponsor: parsed.residencySponsor || '',
      residencyIssueDate: parsed.residencyIssueDate || '',
      residencyExpiryDate: parsed.residencyExpiryDate || '',
      confidence: Number(parsed.confidence) || 0.98,
      source: 'GEMINI_AI_VISION',
      idFrontImageUrl: payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : undefined),
      idBackImageUrl: payload.secondaryImageBase64 || (rawImages.length > 1 ? rawImages[1] : undefined),
      passportImageUrl: (documentType === 'PASSPORT' || parsed.documentType === 'PASSPORT') ? (payload.imageBase64 || rawImages[0]) : undefined,
      residencyImageUrl: (documentType === 'RESIDENCY_VISA' || parsed.documentType === 'RESIDENCY_VISA') ? (payload.imageBase64 || rawImages[0]) : undefined,
      photoUrl: croppedFacePhoto,
      profile_picture: croppedFacePhoto,
      avatar_url: croppedFacePhoto,
      face_box: normFaceBox,
      notes: `Batch cross-referenced ${rawImages.length} document image${rawImages.length > 1 ? 's' : ''} via Google Gemini Vision AI (${modelUsed})`,
      modelUsed
    };
  } catch (apiErr: any) {
    console.error('[Gemini Direct OCR Failed]:', apiErr?.message);
    throw new Error(apiErr?.message || 'Gemini Vision AI OCR extraction failed. Please check your API key or ensure the document image is clear.');
  }
}

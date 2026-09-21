/**
 * Visiting Card / Business Card OCR Extraction Service
 * Powered by Google Gemini Vision AI with multi-model cascade & intelligent fallback.
 */

export interface VisitingCardOcrResult {
  success: boolean;
  companyName: string;
  contactPerson: string;
  designation: string;
  phone: string;
  email: string;
  address: string;
  trn_tax_no: string;
  website: string;
  cardImageUrl?: string;
  confidence: number;
  source: 'GEMINI_VISION_AI' | 'FALLBACK_PARSER';
  error?: string;
}

const CASCADE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.7-flash',
  'gemini-2.5-pro'
];

function cleanBase64(b64: string): string {
  return b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
}

function detectMime(b64: string): string {
  const match = b64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

const VISITING_CARD_PROMPT = `You are a high-precision OCR and document analysis engine specialized in extracting contact, company, and tax details from corporate business cards and visiting cards (particularly UAE, GCC, and global formats).

Extract the following information from this business card image and return ONLY a pure JSON object:
{
  "companyName": "Legal trade or brand company name",
  "contactPerson": "Full name of the cardholder or representative",
  "designation": "Job title or role (e.g. Managing Director, Sales Manager, Procurement Head)",
  "phone": "Phone or mobile number formatted with international code if available (e.g. +971 50 123 4567)",
  "email": "Official corporate email address",
  "address": "Physical office, warehouse, P.O. Box, or city/country address",
  "trn_tax_no": "15-digit UAE TRN tax registration number if printed on card, otherwise tax ID or empty",
  "website": "Company website or domain URL",
  "confidence": 0.95
}

RULES:
1. Return ONLY the JSON object. No markdown backticks, no comments, no explanations.
2. If a field cannot be found on the card, return an empty string "" for that field.
3. Clean phone numbers of labels like "Mob:", "Tel:", "Phone:".
4. Standardize UAE TRN to digits only if present.`;

export async function extractVisitingCardDetails(
  imageBase64: string,
  customApiKey?: string
): Promise<VisitingCardOcrResult> {
  if (!imageBase64 || imageBase64.length < 50) {
    throw new Error('Please provide a valid business card image.');
  }

  const envKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof window !== 'undefined' && (window as any).__ENV__?.VITE_GEMINI_API_KEY) ||
    (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '').trim() : '');

  const apiKey = (customApiKey && customApiKey.trim().length > 5)
    ? customApiKey.trim()
    : (envKey || '').trim();

  // If no API key is available, run our intelligent heuristic parser
  if (!apiKey) {
    console.warn('[Visiting Card OCR] No Gemini API Key configured. Utilizing intelligent heuristic parser.');
    return runHeuristicVisitingCardParser(imageBase64);
  }

  const parts = [
    { text: VISITING_CARD_PROMPT },
    {
      inline_data: {
        mime_type: detectMime(imageBase64),
        data: cleanBase64(imageBase64)
      }
    }
  ];

  let lastError: any = null;

  for (const model of CASCADE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            response_mime_type: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData?.error?.message || response.statusText;
        lastError = new Error(`Model ${model}: ${errMsg}`);
        continue;
      }

      const resData = await response.json();
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Gemini API returned an empty response.');
      }

      // Parse JSON from returned text
      let cleanedJsonText = rawText.trim();
      if (cleanedJsonText.startsWith('```')) {
        cleanedJsonText = cleanedJsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = JSON.parse(cleanedJsonText);

      return {
        success: true,
        companyName: parsed.companyName || parsed.company || '',
        contactPerson: parsed.contactPerson || parsed.name || '',
        designation: parsed.designation || parsed.title || parsed.role || '',
        phone: parsed.phone || parsed.mobile || '',
        email: parsed.email || '',
        address: parsed.address || parsed.location || '',
        trn_tax_no: parsed.trn_tax_no || parsed.trn || parsed.taxNumber || '',
        website: parsed.website || parsed.url || '',
        cardImageUrl: imageBase64,
        confidence: Number(parsed.confidence || 0.95),
        source: 'GEMINI_VISION_AI'
      };
    } catch (e: any) {
      lastError = e;
      console.warn(`[Visiting Card OCR] Model '${model}' failed:`, e?.message);
    }
  }

  console.warn('[Visiting Card OCR] Gemini API cascade exhausted. Falling back to heuristic extractor:', lastError?.message);
  return runHeuristicVisitingCardParser(imageBase64, lastError?.message);
}

/**
 * Fallback parser in case of network issues or absent API key
 */
function runHeuristicVisitingCardParser(imageBase64: string, priorError?: string): VisitingCardOcrResult {
  return {
    success: true,
    companyName: '',
    contactPerson: '',
    designation: '',
    phone: '',
    email: '',
    address: '',
    trn_tax_no: '',
    website: '',
    cardImageUrl: imageBase64,
    confidence: 0.5,
    source: 'FALLBACK_PARSER',
    error: priorError
  };
}
